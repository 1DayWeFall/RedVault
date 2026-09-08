'use strict';

/** 本地 OCR（Tesseract）分支单测 —— 不依赖真 tesseract 运行（注入 fake ocrFn）
 *  - buildOcrText：逐图编号、空图占位、截断
 *  - P1L：声明本地 OCR 来源、含全部分类、严格 JSON
 *  - runAi 分支选择：vision 未配 + ocr.enabled + 有图 → text 槽收到含图中文字的 prompt，
 *    ocr 字段采用本地结果；ocrFn 失败 → 降级 P2（无 OCR）；ocr 关闭 → P2 */

const test = require('node:test');
const assert = require('node:assert');
const { runAi, buildOcrText, P1L, CATEGORIES } = require('../server/services/pipeline');

const mkCtx = ({ visionKey = '', ocr = { enabled: true, lang: 'chi_sim+eng' } } = {}) => ({
  ROOT: process.cwd(),
  store: { readConfig: () => ({ ai: { text: { apiKey: 'k' }, vision: { apiKey: visionKey } }, ocr }) },
  ai: null
});
const mkAi = () => {
  const calls = [];
  return {
    calls,
    ai: { chatJson: async (slot, messages) => { calls.push({ slot, prompt: messages[0].content }); return { summary: 's', key_points: ['a'], category: '美食', tags: ['t'] }; } }
  };
};
const raw = { title: 'T', desc: 'D', comments: [], type: 'normal' };
const imgs = { local: [{ abs: '/x/1.jpg' }, { abs: '/x/2.jpg' }], remote: [], thumb: '' };

test('buildOcrText：逐图编号、空图占位（无文字）、超长截断', () => {
  assert.strictEqual(buildOcrText(['零糖 零卡', '']), '【图1】零糖 零卡\n【图2】（无文字）');
  assert.strictEqual(buildOcrText(null), '');
  assert.ok(buildOcrText(Array(500).fill('很长'.repeat(50))).length <= 6000);
});

test('P1L：声明本地 OCR 来源、含全部分类与严格 JSON 输出约定', () => {
  const p = P1L('T', 'D', 'C', '', '【图1】要点');
  assert.ok(p.includes('本地 OCR'));
  assert.ok(p.includes('【图1】要点'));
  for (const c of CATEGORIES) assert.ok(p.includes(c));
  assert.ok(p.includes('严格输出 JSON'));
  assert.ok(!p.includes('"ocr"')); // AI 不再产出 ocr 字段（由本地结果直供）
});

test('runAi：vision 未配 + ocr.enabled + 有图 → text 槽收到图中文字，ocr 用本地结果', async () => {
  const { ai, calls } = mkAi();
  const ocrCalls = [];
  const out = await runAi({ ...mkCtx(), ai }, raw, imgs, {
    ocrFn: async (_ctx, list, lang) => { ocrCalls.push({ list, lang }); return ['图一文字', '']; }
  });
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].slot, 'text');           // 不走 vision 槽 → 无 vision 费用
  assert.ok(calls[0].prompt.includes('【图1】图一文字'));
  assert.ok(calls[0].prompt.includes('【图2】（无文字）'));
  assert.deepStrictEqual(out.ocr, ['图一文字']);         // 本地结果直供，空串过滤同 vision 路径
  assert.strictEqual(ocrCalls[0].list.length, 2);
  assert.strictEqual(ocrCalls[0].lang, 'chi_sim+eng');
});

test('runAi：ocrFn 抛错 → 降级 P2 text 整理（无 OCR），不中断', async () => {
  const { ai, calls } = mkAi();
  const out = await runAi({ ...mkCtx(), ai }, raw, imgs, {
    ocrFn: async () => { throw new Error('tesseract.js 未安装'); }
  });
  assert.strictEqual(calls.length, 1);
  assert.ok(calls[0].prompt.includes('图文笔记') && calls[0].prompt.includes('图片未识别'));
  assert.deepStrictEqual(out.ocr, []);
});

test('runAi：ocr.enabled=false → 不调 OCR，直接 P2 回退', async () => {
  const { ai, calls } = mkAi();
  let ocrCalled = false;
  const out = await runAi({ ...mkCtx({ ocr: { enabled: false, lang: 'chi_sim+eng' } }), ai }, raw, imgs, {
    ocrFn: async () => { ocrCalled = true; return ['x']; }
  });
  assert.strictEqual(ocrCalled, false);
  assert.ok(calls[0].prompt.includes('图片未识别'));
  assert.deepStrictEqual(out.ocr, []);
});
