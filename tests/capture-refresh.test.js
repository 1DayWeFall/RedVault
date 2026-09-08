'use strict';

/** 溯源链接 token 续期单测（xsec_token 过期 → 重扫刷新）
 *  - /capture/check items 格式：known 且清单 token ≠ 库内 → stale；
 *    同 token / 已入箱未入库 / 旧 note_ids 格式 → 无 stale 副作用
 *  - /capture/list：known + 新 token → refreshed，仅 frontmatter url 换新，
 *    正文锚点区块与「我的备注」逐字保留；同 token → duplicate 且文件一字节不动；
 *    url 无 token 的老笔记 → 刷新升级为带 token 链接
 *  全程临时目录，不触碰真实 data/ 与 vault/。 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const captureRoutes = require('../server/routes/capture');
const { createStore } = require('../server/services/store');
const { createVault, renderNoteMd } = require('../server/services/vault');

function setup({ inbox = [], indexNotes = [] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-refresh-'));
  const store = createStore(dir);
  const cfg = store.readConfig();
  cfg.capture = { token: 'tk' };
  store.saveConfig(cfg);
  inbox.forEach((e) => store.addInboxEntry(e));
  if (indexNotes.length) store.saveIndex({ notes: indexNotes });
  const vault = createVault(path.join(dir, 'vault'));
  const app = express().use(express.json()).use('/api', captureRoutes({ store, vault }))
    .use((err, _req, res, _next) => {
      res.status(err.status || 500).json({
        error: { code: err.code || 'INTERNAL', message: err.message || '服务器内部错误' }
      });
    });
  const server = app.listen(0);
  return { store, vault, server, base: `http://127.0.0.1:${server.address().port}/api`, dir };
}
const cleanup = (ctx) => () => {
  ctx.server.close();
  fs.rmSync(ctx.dir, { recursive: true, force: true });
};
const post = (base, p, body) => fetch(base + p, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Capture-Token': 'tk' },
  body: JSON.stringify(body)
});

const entry = (id, status) => ({
  note_id: id, captured_at: '2026-09-08T10:00:00.000Z', status,
  raw: { title: 't-' + id, desc: '', comments: [] }, process: null
});

/** 造一篇已入库笔记：frontmatter url 携 token，备注区块写死待验证句子 */
function seedNote(ctx, { noteId = 'note1', token = 'tokenA', remark = '用户手写备注 ⭐ 必须逐字保留' } = {}) {
  const url = token
    ? `https://www.xiaohongshu.com/explore/${noteId}?xsec_token=${encodeURIComponent(token)}&xsec_source=pc_user`
    : `https://www.xiaohongshu.com/explore/${noteId}`;
  const fm = {
    title: '已入库笔记', url, note_id: noteId, author: '作者', author_id: 'u1', type: 'normal',
    category: '测试', subcategory: '', tags: ['t'], liked_count: 1,
    published_at: '2026-09-01', collected_at: '2026-09-07T00:00:00.000Z',
    created_at: '2026-09-07T00:00:00.000Z', cover: '', images: [],
    related: [], sources: [], attachments: []
  };
  const md = renderNoteMd({
    fm, summary: '摘要内容', points: ['要点一'], body: '正文原文，不可被刷新破坏',
    ocr: [], subtitle: '', comments: '（无）', related: [], attachments: '', remark
  });
  const file = ctx.vault.writeNoteFile('seed-note', md);
  ctx.store.saveIndex({ notes: [{ note_id: noteId, file, title: fm.title }] });
  return { file, md, remark };
}

test('check items 格式：known+新 token → stale；同 token/已入箱未入库 → 不 stale；new → fresh', async (t) => {
  const ctx = setup({ inbox: [entry('p1', 'pending')] });
  t.after(cleanup(ctx));
  seedNote(ctx, { noteId: 'note1', token: 'tokenA' });

  const j = await (await post(ctx.base, '/capture/check', {
    items: [
      { note_id: 'note1', xsec_token: 'tokenB' },   // 已入库 + 新 token → stale
      { note_id: 'p1', xsec_token: 'tokenB' },      // 已入箱未入库（无 md）→ 跳过
      { note_id: 'new1', xsec_token: 'tokenX' },    // 新增 → fresh
      { note_id: 'new1', xsec_token: 'tokenX' }     // 重复 → 去重
    ]
  })).json();
  assert.deepStrictEqual(j.fresh, ['new1']);
  assert.deepStrictEqual(j.stale, ['note1']);
  assert.strictEqual(j.total, 3);
  assert.strictEqual(j.skipped, 1); // 仅 p1
});

test('check items 格式：token 与库内一致 → 不产生 stale（幂等重扫零上报）', async (t) => {
  const ctx = setup({});
  t.after(cleanup(ctx));
  seedNote(ctx, { noteId: 'note1', token: 'tokenA' });

  const j = await (await post(ctx.base, '/capture/check', {
    items: [{ note_id: 'note1', xsec_token: 'tokenA' }]
  })).json();
  assert.deepStrictEqual(j.fresh, []);
  assert.deepStrictEqual(j.stale, []);
  assert.strictEqual(j.skipped, 1);
});

test('check 旧 note_ids 格式回归：仍只返回 fresh，无 stale 副作用', async (t) => {
  const ctx = setup({});
  t.after(cleanup(ctx));
  seedNote(ctx, { noteId: 'note1', token: 'tokenA' });

  const j = await (await post(ctx.base, '/capture/check', { note_ids: ['note1', 'n2'] })).json();
  assert.deepStrictEqual(j.fresh, ['n2']);
  assert.deepStrictEqual(j.stale, []); // 旧格式不带 token → 不触发续期判定
  assert.strictEqual(j.skipped, 1);
});

test('list：known+新 token → refreshed，仅换 frontmatter url，正文与备注逐字保留', async (t) => {
  const ctx = setup({});
  t.after(cleanup(ctx));
  const seed = seedNote(ctx, { noteId: 'note1', token: 'tokenA' });

  const r = await post(ctx.base, '/capture/list', {
    notes: [{ note_id: 'note1', xsec_token: 'tokenB', title: '清单标题' }]
  });
  assert.strictEqual(r.status, 201);
  assert.strictEqual((await r.json()).results[0].status, 'refreshed');

  const { fm, content, raw } = ctx.vault.readNoteFile(seed.file);
  assert.ok(fm.url.includes(encodeURIComponent('tokenB')), 'url 应携带新 token（encoded）');
  assert.ok(!fm.url.includes('tokenA'), '旧 token 应被替换');
  assert.strictEqual(fm.note_id, 'note1');
  /* 正文区块原样（锚点间内容与用户备注逐字保留）——content 与种子 md 的 body 部分完全一致 */
  const seedBody = seed.md.split('---').slice(2).join('---').trim();
  assert.strictEqual(content.trim(), seedBody);
  assert.ok(raw.includes(seed.remark), '我的备注区块必须保留');
  assert.ok(raw.includes('正文原文，不可被刷新破坏'));
  assert.ok(fm.modified_at > fm.created_at, 'modified_at 自动更新');
});

test('list：known+同 token → duplicate，文件一字节不动', async (t) => {
  const ctx = setup({});
  t.after(cleanup(ctx));
  const seed = seedNote(ctx, { noteId: 'note1', token: 'tokenA' });
  const before = fs.readFileSync(path.join(ctx.vault.dir, seed.file), 'utf-8');

  const r = await post(ctx.base, '/capture/list', {
    notes: [{ note_id: 'note1', xsec_token: 'tokenA' }]
  });
  assert.strictEqual(r.status, 201);
  assert.strictEqual((await r.json()).results[0].status, 'duplicate');

  const after = fs.readFileSync(path.join(ctx.vault.dir, seed.file), 'utf-8');
  assert.strictEqual(after, before);
});

test('list：url 无 token 的老笔记 → 刷新升级为带 token 链接', async (t) => {
  const ctx = setup({});
  t.after(cleanup(ctx));
  seedNote(ctx, { noteId: 'old1', token: null });

  const r = await post(ctx.base, '/capture/list', {
    notes: [{ note_id: 'old1', xsec_token: 'tokenNEW' }]
  });
  assert.strictEqual((await r.json()).results[0].status, 'refreshed');
  const { fm } = ctx.vault.readNoteFile(ctx.store.readIndex().notes[0].file);
  assert.ok(fm.url.includes(encodeURIComponent('tokenNEW')));
});

test('list：known 条目刷新失败（文件损坏）→ 降级 duplicate 不阻塞整批', async (t) => {
  const ctx = setup({});
  t.after(cleanup(ctx));
  const seed = seedNote(ctx, { noteId: 'note1', token: 'tokenA' });
  fs.rmSync(path.join(ctx.vault.dir, seed.file)); // 模拟 md 丢失

  const r = await post(ctx.base, '/capture/list', {
    notes: [{ note_id: 'note1', xsec_token: 'tokenB' }]
  });
  assert.strictEqual(r.status, 201);
  const j = await r.json();
  assert.strictEqual(j.results[0].status, 'duplicate');
  assert.ok(j.results[0].error.includes('链接刷新失败'));
});
