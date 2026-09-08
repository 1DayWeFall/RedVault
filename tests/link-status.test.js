'use strict';

/** GET /api/notes/:id/link-status 单测
 *  - no_token（库内 url 无 xsec_token）零网络直达
 *  - 302 登录页 → expired；有效 __INITIAL_STATE__ → alive；461 风控码 → error
 *  - 缓存：同键二次请求不再触网（cached:true）；?refresh=1 绕过缓存重探
 *  - token 变化（模拟重扫刷新 frontmatter url）→ 缓存键失效自动重探
 *  - 404 未知笔记
 *  fetch 桩按 URL 分发：xiaohongshu.com（probeSource 发出）→ 桩响应；
 *  127.0.0.1（测试自身请求本地路由）→ 透传原生 fetch。全程不触真实网络。 */

const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const notesRoutes = require('../server/routes/notes');

/* ── 可变库内状态（fm.url 模拟 frontmatter 溯源链接） ── */
const files = {
  'n1.md': 'https://www.xiaohongshu.com/explore/n1?xsec_token=OLD&xsec_source=pc_user',
  'n9.md': 'https://www.xiaohongshu.com/explore/n9'            /* 无 token */
};
const vault = { readNoteFile: (f) => ({ fm: { url: files[f] } }) };
const store = {
  readIndex: () => ({ notes: [
    { note_id: 'n1', file: 'n1.md', title: 't1' },
    { note_id: 'n9', file: 'n9.md', title: 't9' }
  ] })
};

const app = express().use('/api', notesRoutes({ store, vault }))
  .use((err, _req, res, _next) => res.status(err.status || 500)
    .json({ error: { code: err.code || 'INTERNAL', message: err.message || '服务器内部错误' } }));
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api`;

/* ── fetch 桩：URL 分发 ── */
const origFetch = global.fetch;
let xhsCalls = 0;
let xhsRespond = () => ({ ok: true, status: 200, url: 'https://www.xiaohongshu.com/explore/x', text: async () => '' });
global.fetch = (url, opts) => String(url).includes('xiaohongshu.com')
  ? (xhsCalls++, Promise.resolve(xhsRespond(String(url))))
  : origFetch(url, opts);

const hit = (id, q = '') => fetch(`${base}/notes/${id}/link-status${q}`);
const aliveState = (id) => `<script>window.__INITIAL_STATE__ = ${JSON.stringify({
  note: { noteDetailMap: { [id]: { note: { title: 'T', desc: 'D' } } } }
})}</script>`;

test.after(() => { global.fetch = origFetch; server.close(); });

test('no_token：库内 url 无 xsec_token → 直达、零网络', async () => {
  const before = xhsCalls;
  const r = await hit('n9');
  assert.strictEqual(r.status, 200);
  const j = await r.json();
  assert.strictEqual(j.status, 'no_token');
  assert.strictEqual(xhsCalls, before);
});

test('404：未知笔记', async () => {
  assert.strictEqual((await hit('ghost')).status, 404);
});

test('expired：302 登录页；同键缓存命中不再触网', async () => {
  xhsRespond = () => ({ ok: true, status: 200, url: 'https://www.xiaohongshu.com/login', text: async () => '' });
  const r1 = await hit('n1');
  const j1 = await r1.json();
  assert.strictEqual(j1.status, 'expired');
  assert.match(j1.message, /过期/);

  const before = xhsCalls;
  const j2 = await (await hit('n1')).json();
  assert.strictEqual(j2.status, 'expired');
  assert.strictEqual(j2.cached, true);
  assert.strictEqual(xhsCalls, before);        /* 缓存命中：未再触网 */
});

test('alive：有效 __INITIAL_STATE__ → 链接有效', async () => {
  xhsRespond = (url) => ({ ok: true, status: 200, url, text: async () => aliveState('n2') });
  files['n1.md'] = 'https://www.xiaohongshu.com/explore/n1?xsec_token=GOOD&xsec_source=pc_user'; /* 换 token → 新缓存键 */
  const j = await (await hit('n1')).json();
  assert.strictEqual(j.status, 'alive');
});

test('token 变化（重扫刷新 url）→ 缓存键失效自动重探', async () => {
  let seen = '';
  xhsRespond = (url) => { seen = url; return { ok: true, status: 200, url, text: async () => aliveState('n1') }; };
  files['n1.md'] = 'https://www.xiaohongshu.com/explore/n1?xsec_token=NEWER&xsec_source=pc_user';
  const j = await (await hit('n1')).json();
  assert.strictEqual(j.status, 'alive');
  assert.match(seen, /xsec_token=NEWER/);      /* 用新 token 探测（编码后 %3D 等场景由 encodeURIComponent 保证） */
});

test('error→refresh 重试：461 风控码入缓存，?refresh=1 绕过缓存恢复 alive', async () => {
  files['n1.md'] = 'https://www.xiaohongshu.com/explore/n1?xsec_token=FLAKY&xsec_source=pc_user';
  xhsRespond = () => ({ ok: false, status: 461 });
  const j1 = await (await hit('n1')).json();
  assert.strictEqual(j1.status, 'error');

  xhsRespond = (url) => ({ ok: true, status: 200, url, text: async () => aliveState('n1') });
  const j2 = await (await hit('n1', '?refresh=1')).json();   /* error TTL 30s 内须显式绕过 */
  assert.strictEqual(j2.status, 'alive');
  assert.notStrictEqual(j2.cached, true);
});
