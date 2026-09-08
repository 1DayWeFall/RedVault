'use strict';

/** 失败条目治理测试（方案 1+2+3）
 *  - fetchNoteDetail 失败分类：token_expired / risk / network / incomplete（mock 全局 fetch）
 *  - store.upsertInboxEntry：同 id 覆盖、新 id 追加
 *  - POST /api/capture/list：failed 豁免判重重采修复（refeed）、pending 仍判重、
 *    仍失败时覆盖刷新原因。全程临时目录，不触碰真实 data/。
 *  注：集成用例走真实限速 sleep（1.5~3s/条），token_expired 不触发重试补抓。 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const captureRoutes = require('../server/routes/capture');
const { createStore } = require('../server/services/store');
const { fetchNoteDetail } = require('../server/services/fetch-note');

/* ── fetch mock 工具 ── */
const resp = (body, { ok = true, status = 200, url = 'https://www.xiaohongshu.com/explore/x' } = {}) => ({
  ok, status, url, text: async () => body
});
const okPage = (noteId, note) => resp(
  `<script>window.__INITIAL_STATE__ = ${JSON.stringify({ note: { noteDetailMap: { [noteId]: { note } } } })}</script>`
);
const NOTE = {
  title: '重采成功', desc: '正文内容', type: 'normal',
  user: { userId: 'u1', nickname: '作者' },
  interactInfo: { liked: '12' }, imageList: [], tagList: [], time: 1700000000000
};

async function withFetch(mock, fn) {
  const orig = global.fetch;
  /* 只拦截外网（xiaohongshu.com）请求；发往本地测试服务器的请求走真实 fetch */
  global.fetch = (url, opts) => (String(url).includes('xiaohongshu.com') ? mock(url, opts) : orig(url, opts));
  try { return await fn(); } finally { global.fetch = orig; }
}

/* ── fetchNoteDetail 分类 ── */

test('fetchNoteDetail：302 登录页 → token_expired', async () => {
  const r = await withFetch(
    () => resp('<html>login</html>', { url: 'https://www.xiaohongshu.com/login?source=explore' }),
    () => fetchNoteDetail('n1', 'X')
  );
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'token_expired');
  assert.ok(r.message.includes('重扫'));
});

test('fetchNoteDetail：HTTP 403 → risk', async () => {
  const r = await withFetch(() => resp('', { ok: false, status: 403 }), () => fetchNoteDetail('n1', 'X'));
  assert.strictEqual(r.reason, 'risk');
});

test('fetchNoteDetail：网络异常 → network', async () => {
  const r = await withFetch(() => { throw new Error('boom'); }, () => fetchNoteDetail('n1', 'X'));
  assert.strictEqual(r.reason, 'network');
});

test('fetchNoteDetail：无 __INITIAL_STATE__ → risk', async () => {
  const r = await withFetch(() => resp('<html>验证页</html>'), () => fetchNoteDetail('n1', 'X'));
  assert.strictEqual(r.reason, 'risk');
});

test('fetchNoteDetail：内容缺失 → incomplete', async () => {
  const r = await withFetch(
    () => okPage('n1', { title: '', desc: '' }),
    () => fetchNoteDetail('n1', 'X')
  );
  assert.strictEqual(r.reason, 'incomplete');
});

test('fetchNoteDetail：正常详情 → ok:true', async () => {
  const r = await withFetch(() => okPage('n1', NOTE), () => fetchNoteDetail('n1', 'X'));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.note.title, '重采成功');
});

/* ── store.upsertInboxEntry ── */

test('upsertInboxEntry：同 id 覆盖整体替换，新 id 追加', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-upsert-'));
  try {
    const store = createStore(dir);
    store.addInboxEntry({ note_id: 'a', status: 'failed', raw: { title: 'old' }, process: { error: 'x' } });
    store.upsertInboxEntry({ note_id: 'a', status: 'pending', raw: { title: 'new' }, process: null });
    store.upsertInboxEntry({ note_id: 'b', status: 'pending', raw: { title: 'bb' }, process: null });
    const items = store.readInbox();
    assert.strictEqual(items.length, 2);
    const a = items.find((x) => x.note_id === 'a');
    assert.strictEqual(a.status, 'pending');
    assert.strictEqual(a.raw.title, 'new');
    assert.strictEqual(a.process, null); // 整体替换，旧 error 不残留
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

/* ── POST /api/capture/list 集成 ── */

function setup(entries) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-refeed-'));
  const store = createStore(dir);
  const cfg = store.readConfig();
  cfg.capture = { token: 'tk' };
  store.saveConfig(cfg);
  entries.forEach((e) => store.addInboxEntry(e));
  const app = express().use(express.json()).use('/api', captureRoutes({ store }));
  const server = app.listen(0);
  return { store, server, base: `http://127.0.0.1:${server.address().port}/api`, dir };
}
const cleanup = (ctx) => () => {
  ctx.server.close();
  fs.rmSync(ctx.dir, { recursive: true, force: true });
};
const failedEntry = (id) => ({
  note_id: id, captured_at: '2026-09-08T10:00:00.000Z', status: 'failed',
  raw: { title: '清单标题-' + id, desc: '', author: '', liked_count: 0, comments: [] },
  process: { stage: 'fetch_detail', error: '旧原因' }
});
const post = (base, notes) => fetch(base + '/capture/list', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Capture-Token': 'tk' },
  body: JSON.stringify({ notes })
});

test('capture/list：failed 条目豁免判重，重采成功转回 pending', async (t) => {
  const ctx = setup([failedEntry('n1')]);
  t.after(cleanup(ctx));
  const j = await withFetch(() => okPage('n1', NOTE), async () => {
    const r = await post(ctx.base, [{ note_id: 'n1', xsec_token: 'X', title: '清单标题-n1' }]);
    return r.json();
  });
  assert.strictEqual(j.results[0].status, 'inbox');
  assert.strictEqual(j.results[0].refeed, true);
  const e = ctx.store.readInbox().find((x) => x.note_id === 'n1');
  assert.strictEqual(e.status, 'pending');
  assert.strictEqual(e.raw.title, '重采成功'); // 详情页标题，非清单兜底
  assert.strictEqual(ctx.store.readInbox().length, 1); // 覆盖而非追加
});

test('capture/list：重采仍失败（token 过期）覆盖刷新原因，不重试不新增', async (t) => {
  const ctx = setup([failedEntry('n1')]);
  t.after(cleanup(ctx));
  const j = await withFetch(
    () => resp('<html>login</html>', { url: 'https://www.xiaohongshu.com/login' }),
    async () => (await post(ctx.base, [{ note_id: 'n1', xsec_token: 'X' }])).json()
  );
  assert.strictEqual(j.results[0].status, 'failed');
  assert.strictEqual(j.results[0].reason, 'token_expired');
  const items = ctx.store.readInbox();
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].status, 'failed');
  assert.strictEqual(items[0].process.reason, 'token_expired');
  assert.ok(items[0].process.error.includes('xsec_token 已过期'));
});

test('capture/list：pending 条目再上报仍判重（防重复处理回归）', async (t) => {
  const ctx = setup([{ note_id: 'p1', captured_at: '', status: 'pending', raw: { title: 't', desc: '', comments: [] }, process: null }]);
  t.after(cleanup(ctx));
  let fetched = 0;
  const j = await withFetch(async () => { fetched++; return okPage('p1', NOTE); },
    async () => (await post(ctx.base, [{ note_id: 'p1', xsec_token: 'X' }])).json()
  );
  assert.strictEqual(j.results[0].status, 'duplicate');
  assert.strictEqual(fetched, 0); // 判重在限速与抓取之前
});
