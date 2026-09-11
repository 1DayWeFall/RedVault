'use strict';

/** M8 向量存储单测（services/vector.js）
 * seam：createVectorStore(ctx, embedder) → { buildIndex, search, removeNote, clear, status, pending }
 * 分块规则（M8 决策②）：标题+标签+分类拼入块首；summary/points/body(+subtitle)/ocr 入索引；
 *   评论不进；synthesis 排除；无有效文本 → skippedNoText 诚实计数 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createStore } = require('../server/services/store');
const { createVault, renderNoteMd, renderSynthMd, safeTitle } = require('../server/services/vault');

/* TODO(M8-vector): services/vector.js 尚未实现——本文件为 TDD 先行用例，按 ADR-003「停工红绿规则」挂起。
 * M8 开工第一件事：实现 server/services/vector.js 后删除下方 guard（恢复真实断言）。 */
let createVectorStore = null;
try {
  ({ createVectorStore } = require('../server/services/vector'));
} catch (_) { /* 未实现：整文件挂起，见 docs/ADR.md ADR-003 */ }
if (!createVectorStore) {
  test('vector store [parked: red baseline]', { skip: 'vector.js 未实现；M8 开工首件事实现后移除此挂起（docs/ADR.md ADR-003）' }, () => {});
  return;
}

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rv-vector-'));

/* 假 embedder：文本 → 4 维可复现向量（首字符哈希选主轴），探测/计费语义不涉及 */
function fakeEmbedder(dimOf = new Map()) {
  let calls = 0;
  return {
    provider: 'fake', dims: 4, available: true, remoteWarn: false,
    embed: async (texts) => {
      calls += texts.length;
      return {
        ok: true, provider: 'fake', dims: 4,
        vectors: texts.map((t) => {
          const key = [...dimOf.keys()].find((k) => t.includes(k));
          return Float32Array.from(key ? dimOf.get(key) : [0.01, 0.01, 0.01, 0.01]);
        })
      };
    },
    get calls() { return calls; }
  };
}

function makeCtx(dir, notes = []) {
  const store = createStore(path.join(dir, 'data'));
  const vault = createVault(path.join(dir, 'vault'));
  store.saveIndex({ notes });
  return { ctx: { store, vault }, store, vault };
}

function seedNote(vault, { id, title, summary = '', points = [], body = '', ocr = [], comments = '', subtitle = '', tags = [], category = '美食' }) {
  const md = renderNoteMd({
    fm: { title, note_id: id, type: 'normal', category, tags },
    summary, points, body, ocr, comments, subtitle
  });
  return vault.writeNoteFile(safeTitle(title), md);
}

test('分块规则：标题头拼入块首；评论不进；synthesis 排除并计数', async () => {
  const dir = tmp();
  const { ctx, store, vault } = makeCtx(dir, [
    { note_id: 'n1', file: '', title: '番茄牛腩', category: '美食', tags: ['炖菜'], type: 'normal' },
    { note_id: 's1', file: '', title: '合成主题', category: '', tags: [], type: 'synthesis' }
  ]);
  seedNote(vault, {
    id: 'n1', title: '番茄牛腩', summary: '番茄与牛腩的炖煮做法', points: ['牛腩焯水', '番茄炒沙'],
    body: '正文：冷水下锅焯牛腩，番茄去皮炒出沙。', comments: '「评论噪声不应入索引」',
    ocr: ['图字：小火慢炖四十分钟'], tags: ['炖菜']
  });
  const f1 = vault.writeNoteFile(safeTitle('合成主题'), renderSynthMd({ fm: { title: '合成主题', note_id: 's1', type: 'synthesis', category: '其他' }, overview: 'AI 二次内容' }));
  store.saveIndex({ notes: [
    { note_id: 'n1', file: ctx.vault.dir && fs.readdirSync(vault.dir).find((f) => f.includes('番茄牛腩')), title: '番茄牛腩', category: '美食', tags: ['炖菜'], type: 'normal' },
    { note_id: 's1', file: f1, title: '合成主题', category: '', tags: [], type: 'synthesis' }
  ]});

  const emb = fakeEmbedder();
  const vs = createVectorStore(ctx, emb);
  const r = await vs.buildIndex();
  assert.strictEqual(r.skipped, 1);            // synthesis 排除
  assert.strictEqual(r.indexed, 1);
  const all = vs.chunksOf('n1');
  assert.ok(all.length >= 2);
  assert.ok(all[0].text.includes('番茄牛腩'), '标题应拼入块首');
  assert.ok(all[0].text.includes('炖菜'), '标签应拼入块首');
  assert.ok(all.some((c) => c.text.includes('小火慢炖')), 'ocr 应入索引');
  assert.ok(!all.some((c) => c.text.includes('评论噪声')), '评论不应入索引');
});

test('无有效文本 → skippedNoText 诚实计数（图片帖盲区可见）', async () => {
  const dir = tmp();
  const { ctx, store, vault } = makeCtx(dir);
  seedNote(vault, { id: 'n1', title: '只有图', summary: '', points: [], body: '' });
  store.saveIndex({ notes: [{ note_id: 'n1', file: fs.readdirSync(vault.dir)[0], title: '只有图', category: '其他', tags: [], type: 'normal' }] });

  const vs = createVectorStore(ctx, fakeEmbedder());
  const r = await vs.buildIndex();
  assert.strictEqual(r.indexed, 0);
  assert.strictEqual(r.skippedNoText, 1);
});

test('md5 增量：仅正文变更的笔记重嵌入，未变的不再消耗 embed', async () => {
  const dir = tmp();
  const { ctx, store, vault } = makeCtx(dir);
  seedNote(vault, { id: 'n1', title: '笔记一', summary: '甲摘要', body: '甲正文内容' });
  seedNote(vault, { id: 'n2', title: '笔记二', summary: '乙摘要', body: '乙正文内容' });
  const files = fs.readdirSync(vault.dir);
  store.saveIndex({ notes: [
    { note_id: 'n1', file: files[0], title: '笔记一', category: '其他', tags: [], type: 'normal' },
    { note_id: 'n2', file: files[1], title: '笔记二', category: '其他', tags: [], type: 'normal' }
  ]});

  const emb = fakeEmbedder();
  const vs = createVectorStore(ctx, emb);
  const r1 = await vs.buildIndex();
  const callsAfterFirst = emb.calls;
  assert.ok(callsAfterFirst > 0);
  assert.strictEqual(r1.indexed, 2);

  // 幂等：无变更重跑 → 零 embed
  await vs.buildIndex();
  assert.strictEqual(emb.calls, callsAfterFirst);

  // n2 正文变更 → 只重嵌 n2 的块
  const md = fs.readFileSync(path.join(vault.dir, files[1]), 'utf-8');
  fs.writeFileSync(path.join(vault.dir, files[1]), md.replace('乙正文内容', '乙正文被用户改写了，内容大变'), 'utf-8');
  const r2 = await vs.buildIndex();
  assert.strictEqual(r2.indexed, 1);
  assert.ok(emb.calls > callsAfterFirst);
});

test('余弦 Top-K 排序 + 返回匹配块文本', async () => {
  const dir = tmp();
  const { ctx, store, vault } = makeCtx(dir);
  seedNote(vault, { id: 'n1', title: '减脂餐', summary: '鸡胸肉搭配西兰花的低脂做法', body: '鸡胸肉煎制' });
  seedNote(vault, { id: 'n2', title: '旅行清单', summary: '冰岛极光行程规划', body: '雷克雅未克' });
  const files = fs.readdirSync(vault.dir);
  store.saveIndex({ notes: [
    { note_id: 'n1', file: files[0], title: '减脂餐', category: '美食', tags: [], type: 'normal' },
    { note_id: 'n2', file: files[1], title: '旅行清单', category: '旅行', tags: [], type: 'normal' }
  ]});

  const emb = fakeEmbedder(new Map([
    ['鸡胸肉', [1, 0, 0, 0]],
    ['极光', [0, 1, 0, 0]]
  ]));
  const vs = createVectorStore(ctx, emb);
  await vs.buildIndex();

  const hits = vs.search({ vec: Float32Array.from([1, 0, 0, 0]) }, { topK: 1 });
  assert.strictEqual(hits.length, 1);
  assert.strictEqual(hits[0].note_id, 'n1');
  assert.ok(hits[0].score > 0.9);
  assert.ok(hits[0].text.includes('鸡胸肉'));
  assert.ok(hits[0].title === '减脂餐');
});

test('removeNote：向量条目同步清理，检索不再返回', async () => {
  const dir = tmp();
  const { ctx, store, vault } = makeCtx(dir);
  seedNote(vault, { id: 'n1', title: '甲笔记', summary: '甲内容' });
  seedNote(vault, { id: 'n2', title: '乙笔记', summary: '乙内容' });
  const files = fs.readdirSync(vault.dir);
  store.saveIndex({ notes: [
    { note_id: 'n1', file: files[0], title: '甲笔记', category: '其他', tags: [], type: 'normal' },
    { note_id: 'n2', file: files[1], title: '乙笔记', category: '其他', tags: [], type: 'normal' }
  ]});

  const vs = createVectorStore(ctx, fakeEmbedder());
  await vs.buildIndex();
  const before = vs.status().chunks;
  assert.ok(before >= 2);

  vs.removeNote('n1');
  const st = vs.status();
  assert.ok(st.chunks < before, '删除后块数应减少');
  assert.strictEqual(Object.keys(st.notes).includes('n1'), false);
  const hits = vs.search({ vec: Float32Array.from([1, 0, 0, 0]) }, { topK: 10 });
  assert.ok(hits.every((h) => h.note_id !== 'n1'));
});

test('bin+meta round-trip：进程重启后索引仍可检索（不重嵌）', async () => {
  const dir = tmp();
  const { ctx, store, vault } = makeCtx(dir);
  seedNote(vault, { id: 'n1', title: '持久化', summary: '重启后仍可检索' });
  store.saveIndex({ notes: [{ note_id: 'n1', file: fs.readdirSync(vault.dir)[0], title: '持久化', category: '其他', tags: [], type: 'normal' }] });

  const emb = fakeEmbedder(new Map([['重启后仍可检索', [0, 1, 0, 0]]]));
  const vs1 = createVectorStore(ctx, emb);
  await vs1.buildIndex();

  // 新实例 = 模拟重启（重新从 bin+meta 加载）
  const emb2 = fakeEmbedder(new Map([['重启后仍可检索', [0, 1, 0, 0]]]));
  const vs2 = createVectorStore(ctx, emb2);
  const r = await vs2.buildIndex();
  assert.strictEqual(r.indexed, 0);            // 已有索引，无需重嵌
  assert.strictEqual(emb2.calls, 0);
  const hits = vs2.search({ vec: Float32Array.from([0, 1, 0, 0]) }, { topK: 1 });
  assert.strictEqual(hits[0].note_id, 'n1');
});

test('keyword 降级：无向量仍建块索引，bigram 检索可用', async () => {
  const dir = tmp();
  const { ctx, store, vault } = makeCtx(dir);
  seedNote(vault, { id: 'n1', title: '手冲咖啡', summary: '手冲咖啡的水温与研磨度' });
  seedNote(vault, { id: 'n2', title: '跑步计划', summary: '每周三次间歇跑' });
  const files = fs.readdirSync(vault.dir);
  store.saveIndex({ notes: [
    { note_id: 'n1', file: files[0], title: '手冲咖啡', category: '美食', tags: [], type: 'normal' },
    { note_id: 'n2', file: files[1], title: '跑步计划', category: '运动', tags: [], type: 'normal' }
  ]});

  const kw = { provider: 'keyword', dims: 0, available: false, remoteWarn: false,
    embed: async (texts) => ({ ok: true, provider: 'keyword', dims: 0, vectors: null }) };
  const vs = createVectorStore(ctx, kw);
  const r = await vs.buildIndex();
  assert.strictEqual(r.provider, 'keyword');
  assert.ok(r.chunks > 0);

  const hits = vs.search({ text: '咖啡水温' }, { topK: 2 });
  assert.ok(hits.length >= 1);
  assert.strictEqual(hits[0].note_id, 'n1');
});
