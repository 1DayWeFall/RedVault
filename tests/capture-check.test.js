'use strict';

/** POST /api/capture/check 增量查询单测
 *  - 判重口径与 /capture/list 一致：索引已有/收件箱非 failed → 已知跳过；
 *    新条目 + 收件箱 failed（重采候选）→ fresh
 *  - 去重与空白 id 清洗、鉴权、payload 校验、超限
 *  - 一致性集成：check 判为 fresh 的 failed 条目经 list 上报后被重采修复
 *  全程临时目录，不触碰真实 data/。 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const captureRoutes = require('../server/routes/capture');
const { createStore } = require('../server/services/store');

function setup({ inbox = [], indexNotes = [] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-check-'));
  const store = createStore(dir);
  const cfg = store.readConfig();
  cfg.capture = { token: 'tk' };
  store.saveConfig(cfg);
  inbox.forEach((e) => store.addInboxEntry(e));
  if (indexNotes.length) store.saveIndex({ notes: indexNotes });
  const app = express().use(express.json()).use('/api', captureRoutes({ store }))
    /* 复刻 index.js 统一错误处理（路由 throw {status,code,message} → JSON） */
    .use((err, _req, res, _next) => {
      res.status(err.status || 500).json({
        error: { code: err.code || 'INTERNAL', message: err.message || '服务器内部错误' }
      });
    });
  const server = app.listen(0);
  return { store, server, base: `http://127.0.0.1:${server.address().port}/api`, dir };
}
const cleanup = (ctx) => () => {
  ctx.server.close();
  fs.rmSync(ctx.dir, { recursive: true, force: true });
};
const check = (base, note_ids, token = 'tk') => fetch(base + '/capture/check', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Capture-Token': token },
  body: JSON.stringify({ note_ids })
});

const entry = (id, status) => ({
  note_id: id, captured_at: '2026-09-08T10:00:00.000Z', status,
  raw: { title: 't-' + id, desc: '', comments: [] }, process: null
});

test('check：fresh 只含新增与 failed 重采候选（索引/收件箱非 failed 判重）', async (t) => {
  const ctx = setup({
    inbox: [entry('p1', 'pending'), entry('f1', 'failed')],
    indexNotes: [{ note_id: 'idx1', title: 'x' }]
  });
  t.after(cleanup(ctx));
  const r = await check(ctx.base, ['n1', 'p1', 'idx1', 'f1']);
  assert.strictEqual(r.status, 200);
  const j = await r.json();
  assert.deepStrictEqual(j.fresh, ['n1', 'f1']);
  assert.strictEqual(j.total, 4);
  assert.strictEqual(j.skipped, 2);
});

test('check：同批重复 id 去重、空白/缺失 id 清洗', async (t) => {
  const ctx = setup({});
  t.after(cleanup(ctx));
  const j = await (await check(ctx.base, ['n1', 'n1', '  ', '', null, 'n2'])).json();
  assert.deepStrictEqual(j.fresh, ['n1', 'n2']);
  assert.strictEqual(j.total, 2);
});

test('check：全部已入库 → fresh 为空', async (t) => {
  const ctx = setup({ indexNotes: [{ note_id: 'a' }, { note_id: 'b' }] });
  t.after(cleanup(ctx));
  const j = await (await check(ctx.base, ['a', 'b'])).json();
  assert.deepStrictEqual(j.fresh, []);
  assert.strictEqual(j.skipped, 2);
});

test('check：错 token → 401 BAD_TOKEN', async (t) => {
  const ctx = setup({});
  t.after(cleanup(ctx));
  const r = await check(ctx.base, ['n1'], 'wrong');
  assert.strictEqual(r.status, 401);
  assert.strictEqual((await r.json()).error.code, 'BAD_TOKEN');
});

test('check：note_ids 缺失/空数组 → 400 BAD_PAYLOAD', async (t) => {
  const ctx = setup({});
  t.after(cleanup(ctx));
  assert.strictEqual((await check(ctx.base, undefined)).status, 400);
  assert.strictEqual((await check(ctx.base, [])).status, 400);
});

test('check：超过 1000 个 → 413 TOO_MANY', async (t) => {
  const ctx = setup({});
  t.after(cleanup(ctx));
  const ids = Array.from({ length: 1001 }, (_, i) => 'id' + i);
  const r = await check(ctx.base, ids);
  assert.strictEqual(r.status, 413);
});

test('check→list 一致性：check 判 fresh 的 failed 条目上报后被重采修复', async (t) => {
  const ctx = setup({ inbox: [{ ...entry('f1', 'failed'), process: { stage: 'fetch_detail', error: '旧原因' } }] });
  t.after(cleanup(ctx));

  const cj = await (await check(ctx.base, ['f1'])).json();
  assert.deepStrictEqual(cj.fresh, ['f1']); // failed 是重采候选，不算已入库

  const orig = global.fetch;
  global.fetch = (url, opts) => String(url).includes('xiaohongshu.com')
    ? Promise.resolve({
        ok: true, status: 200, url: 'https://www.xiaohongshu.com/explore/x',
        text: async () => `<script>window.__INITIAL_STATE__ = ${JSON.stringify({ note: { noteDetailMap: { f1: { note: {
          title: '重采成功', desc: '正文', type: 'normal',
          user: { userId: 'u1', nickname: '作者' },
          interactInfo: { liked: '12' }, imageList: [], tagList: [], time: 1700000000000
        } } } } })}</script>`
      }) : orig(url, opts);
  try {
    const r = await fetch(ctx.base + '/capture/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Capture-Token': 'tk' },
      body: JSON.stringify({ notes: [{ note_id: 'f1', xsec_token: 'X' }] })
    });
    const j = await r.json();
    assert.strictEqual(j.results[0].status, 'inbox');
    assert.strictEqual(j.results[0].refeed, true);
    assert.strictEqual(ctx.store.readInbox()[0].status, 'pending');
  } finally { global.fetch = orig; }
});
