'use strict';

/** 三项缺陷修复回归：
 *  ① path.resolve 盘符路径 —— vault 保存 F:\Work 后重启不再拼出非法路径
 *  ② migrateVault —— fs 错误分类为 400 可读提示；PUT /settings 迁移失败不连坐 AI 配置
 *  ③ AI —— vision 未配时图文笔记回退 text 槽位；POST /notes/:id/reprocess 重打标更新区块与 frontmatter
 *  全程临时目录 + 随机端口，不触碰真实 data/ 与 vault/ */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { createVault, migrateVault, renderNoteMd, readSection } = require('../server/services/vault');
const { createStore } = require('../server/services/store');
const { runAi, CATEGORIES } = require('../server/services/pipeline');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rv-fix-'));

/* 与 server/index.js 一致的错误通道：非 5xx 透传业务错误信息 */
const errHandler = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || 500;
  res.status(status).json({ code: err.code || 'INTERNAL', message: status >= 500 ? '服务器内部错误' : err.message });
};

/* ───────────────────────── ① 路径解析 ───────────────────────── */

test('path.resolve 盘符绝对路径不拼接 ROOT（保存 F:\\Work 后重启不崩）', () => {
  assert.strictEqual(path.win32.resolve('C:\\proj', 'F:\\Work'), 'F:\\Work');
  assert.notStrictEqual(path.win32.join('C:\\proj', 'F:\\Work'), 'F:\\Work');   // 旧 bug：拼出 C:\proj\F:\Work
  // 相对路径行为保持不变（默认 vault 目录场景）
  assert.strictEqual(path.win32.resolve('C:\\proj', 'vault'), path.win32.join('C:\\proj', 'vault'));
});

/* ───────────────────────── ② vault 迁移 ───────────────────────── */

test('migrateVault：正常迁移拷贝 .md 与 attachments；非法目标分类为 400 可读错误', () => {
  const src = tmp();
  const dst = tmp();
  fs.writeFileSync(path.join(src, 'a.md'), 'hello');
  fs.mkdirSync(path.join(src, 'attachments'), { recursive: true });
  fs.writeFileSync(path.join(src, 'attachments', 'x.jpg'), 'img');

  const r = migrateVault(src, dst);                       // 目标已存在 → 覆盖同名
  assert.strictEqual(r.migrated, 2);
  assert.ok(fs.existsSync(path.join(dst, 'a.md')));
  assert.ok(fs.existsSync(path.join(dst, 'attachments', 'x.jpg')));

  assert.deepStrictEqual(migrateVault(src, src), { migrated: 0 });   // 同路径短路不迁移
});

test('migrateVault 非法目标：抛 {status:400, code:MIGRATE_FAILED} 且 message 可读', () => {
  const src = tmp();
  fs.writeFileSync(path.join(src, 'a.md'), 'x');
  try {
    migrateVault(src, path.join(src, 'a<b'));             // Windows 保留字符 → EINVAL/ENOENT
    assert.fail('应抛迁移错误');
  } catch (e) {
    assert.strictEqual(e.status, 400);
    assert.strictEqual(e.code, 'MIGRATE_FAILED');
    assert.ok(/目标路径不可用|无写入权限|文件系统错误/.test(e.message), 'message 应为分类后的可读提示：' + e.message);
  }
});

test('PUT /settings 迁移失败：返回 400 可读错误，AI 配置仍独立保存不连坐', async (t) => {
  const dir = tmp();
  const store = createStore(dir);
  const vault = createVault(path.join(dir, 'vault'));
  const settingsRoutes = require('../server/routes/settings');
  const app = express().use(express.json())
    .use('/api', settingsRoutes({ store, vault, ROOT: dir }))
    .use(errHandler);
  const server = app.listen(0);
  t.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}/api`;

  const r = await fetch(base + '/settings', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      vaultPath: path.join(dir, 'inv<alid'),              // 非法目标 → 迁移失败
      ai: { text: { apiKey: 'sk-test-1234567890' } }
    })
  });
  assert.strictEqual(r.status, 400);                       // 不再是 500「服务器内部错误」
  const body = await r.json();
  assert.ok(body.message && body.message.length > 8, '应返回可读原因');

  const cfg = store.readConfig();
  assert.strictEqual(cfg.vaultPath, 'vault');              // 路径未变
  assert.strictEqual(cfg.ai.text.apiKey, 'sk-test-1234567890');   // AI 配置已落盘（不连坐）
});

/* ───────────────────────── ③ AI 回退与重打标 ───────────────────────── */

test('runAi：vision 未配置时图文笔记回退 text 槽位（不抛 NO_AI_CONFIG）', async () => {
  const dir = tmp();
  const store = createStore(dir);                          // 默认 text/vision 均未配 key
  const cfg = store.readConfig();
  cfg.ai.text.apiKey = 'sk-x';
  store.saveConfig(cfg);
  fs.writeFileSync(path.join(dir, 'pic.webp'), 'x');       // 有本地图（vision 路径素材）

  const calls = [];
  const ctx = {
    store,
    ai: { chatJson: async (slot) => { calls.push(slot); return { category: '其他', summary: 's', key_points: [], ocr: [], comment_insights: [] }; } }
  };
  const ai = await runAi(ctx, { title: 't', desc: 'd', type: 'normal', comments: [] },
    { local: [{ file: 'pic.webp', abs: path.join(dir, 'pic.webp') }], remote: [], thumb: '' });
  assert.deepStrictEqual(calls, ['text']);                 // 回退到 text，而非抛 vision 未配置
  assert.strictEqual(ai.summary, 's');
});

test('POST /notes/:id/reprocess：重跑 AI 更新区块/frontmatter/index，评论精选与手写内容保留', async (t) => {
  const dir = tmp();
  const store = createStore(dir);
  const cfg = store.readConfig();
  cfg.ai.text.apiKey = 'sk-x';                             // 仅 text（vision 空）→ 走回退路径
  store.saveConfig(cfg);
  const vault = createVault(path.join(dir, 'vault'));

  let md = renderNoteMd({
    fm: { title: '图文笔记', note_id: 'n1', type: 'normal', category: '未整理', tags: [], images: ['attachments/n1-1.webp'] },
    summary: '（待 AI 整理）', points: ['（待 AI 整理）'],
    body: '正文内容', comments: '- 「写得好」—— 赞 3 @老王', remark: ''
  });
  md = md.replace('## ✏️ 我的备注', '# 用户手写标题\n\n手写内容不许丢\n\n## ✏️ 我的备注');
  const file = vault.writeNoteFile('图文笔记', md);
  fs.writeFileSync(path.join(vault.attachDir, 'n1-1.webp'), 'x');   // 本地图片存在 → 命中"有图+vision 未配"回退分支
  store.saveIndex({ notes: vault.rebuildIndexMeta() });

  const notesRoutes = require('../server/routes/notes');
  const app = express().use(express.json())
    .use('/api', notesRoutes({
      store, vault,
      ai: { chatJson: async (slot) => {
        assert.strictEqual(slot, 'text');                  // vision 未配 → text 槽位
        return { category: CATEGORIES[7], subcategory: '效率', tags: ['AI', '工作流'],
          summary: '新摘要', key_points: ['要点一', '要点二'], ocr: ['图1文字'], comment_insights: ['大家觉得实用'] };
      } }
    }))
    .use(errHandler);
  const server = app.listen(0);
  t.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}/api`;

  const r = await fetch(base + '/notes/n1/reprocess', { method: 'POST' });
  assert.strictEqual(r.status, 200);
  const { note } = await r.json();
  assert.strictEqual(note.category, CATEGORIES[7]);
  assert.deepStrictEqual(note.tags, ['AI', '工作流']);

  const after = vault.readNoteFile(file);
  assert.strictEqual(after.fm.category, CATEGORIES[7]);    // frontmatter 已打标
  assert.strictEqual(readSection(after.raw, 'summary'), '新摘要');
  assert.ok(readSection(after.raw, 'points').includes('- 要点一'));
  assert.ok(readSection(after.raw, 'ocr').includes('图1文字'));
  const c = readSection(after.raw, 'comments');
  assert.ok(c.includes('「写得好」') && c.includes('**AI 洞察**') && c.includes('大家觉得实用'));
  assert.ok(after.raw.includes('手写内容不许丢'));          // 区块外手写内容原样保留
});

test('POST /notes/:id/reprocess：未配置任何 AI → 400 NO_AI_CONFIG', async (t) => {
  const dir = tmp();
  const store = createStore(dir);                          // text/vision 均空
  const vault = createVault(path.join(dir, 'vault'));
  const file = vault.writeNoteFile('纯文本', renderNoteMd({ fm: { title: '纯文本', note_id: 'n2', type: 'normal' }, body: 'b' }));
  store.saveIndex({ notes: vault.rebuildIndexMeta() });
  const notesRoutes = require('../server/routes/notes');
  const app = express().use(express.json())
    .use('/api', notesRoutes({ store, vault, ai: { chatJson: async () => { throw new Error('不应调用'); } } }))
    .use(errHandler);
  const server = app.listen(0);
  t.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}/api`;

  const r = await fetch(base + '/notes/n2/reprocess', { method: 'POST' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual((await r.json()).code, 'NO_AI_CONFIG');
});
