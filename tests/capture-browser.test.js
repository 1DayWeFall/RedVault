'use strict';

/** 三段式采集（ADR-006）服务端接收测试：
 *  - 条目带 note（油猴 0.5.0+ 在浏览器登录态内抓的 __INITIAL_STATE__.note）→ 直接入箱
 *    pending，subtitle 的 SRT 原文由服务端 parseSrt 清洗；全程零外网请求（不再限速等待）
 *  - 条目带 fetch_error（浏览器内抓取失败）→ failed(reason browser_fetch)，
 *    服务端不代抓（登录墙后服务端路必败，避免无谓风控暴露）
 *  - note 畸形（无标题无正文）→ failed(reason invalid)
 *  - 老脚本条目（无 note 无 fetch_error）仍走服务端抓取路径，由 capture-refeed.test.js 覆盖 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const captureRoutes = require('../server/routes/capture');
const { createStore } = require('../server/services/store');

const NOTE = {
  title: '浏览器内抓的标题', desc: '正文内容', type: 'normal',
  user: { userId: 'u1', nickname: '作者甲' },
  interactInfo: { liked: '88' }, imageList: [], tagList: [], time: 1700000000000
};
const SRT = ['1', '00:00:01,000 --> 00:00:02,000', '第一句', '', '2', '00:00:02,500 --> 00:00:03,000', '第二句'].join('\n');

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-browser-'));
  const store = createStore(dir);
  const cfg = store.readConfig();
  cfg.capture = { token: 'tk' };
  store.saveConfig(cfg);
  const app = express().use(express.json()).use('/api', captureRoutes({ store }));
  const server = app.listen(0);
  return { store, server, base: `http://127.0.0.1:${server.address().port}/api`, dir };
}
const cleanup = (ctx) => () => {
  ctx.server.close();
  fs.rmSync(ctx.dir, { recursive: true, force: true });
};
const post = (base, notes) => fetch(base + '/capture/list', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Capture-Token': 'tk' },
  body: JSON.stringify({ notes })
});

/** 拦截外网并计数；本地测试服务器走真实 fetch */
async function countOutbound(fn) {
  const orig = global.fetch;
  let outbound = 0;
  global.fetch = (url, opts) => {
    if (String(url).includes('xiaohongshu.com')) {
      outbound++;
      return Promise.resolve({ ok: false, status: 403, url: String(url), text: async () => '' });
    }
    return orig(url, opts);
  };
  let result;
  try { result = await fn(); } finally { global.fetch = orig; }
  return { result, outbound };
}

test('带 note：直接入箱 pending，SRT 服务端清洗，零外网请求零限速等待', async (t) => {
  const ctx = setup();
  t.after(cleanup(ctx));
  const t0 = Date.now();
  const { result: r, outbound } = await countOutbound(() =>
    post(ctx.base, [{ note_id: 'n1', xsec_token: 'X', title: '清单标题', note: NOTE, subtitle: { srt: SRT, lang: 'zh-CN' } }])
  );
  const j = await r.json();
  assert.strictEqual(j.results[0].status, 'inbox');
  assert.strictEqual(outbound, 0);            // 服务端不代抓
  assert.ok(Date.now() - t0 < 1000);          // 不再走 1.5~3s 限速
  const e = ctx.store.readInbox().find((x) => x.note_id === 'n1');
  assert.strictEqual(e.status, 'pending');
  assert.strictEqual(e.raw.title, '浏览器内抓的标题');
  assert.strictEqual(e.raw.subtitle_text, '第一句\n第二句'); // SRT 序号/时间戳已清洗
  assert.strictEqual(e.raw.subtitle_lang, 'zh-CN');
  assert.strictEqual(e.raw.author, '作者甲');
});

test('带 fetch_error：failed(browser_fetch) 入箱保留清单，零外网请求', async (t) => {
  const ctx = setup();
  t.after(cleanup(ctx));
  const { result: r, outbound } = await countOutbound(() =>
    post(ctx.base, [{ note_id: 'n2', xsec_token: 'X', title: '清单标题n2', fetch_error: '登录态失效' }])
  );
  const j = await r.json();
  assert.strictEqual(j.results[0].status, 'failed');
  assert.strictEqual(j.results[0].reason, 'browser_fetch');
  assert.strictEqual(outbound, 0);            // 不代抓不重试
  const e = ctx.store.readInbox().find((x) => x.note_id === 'n2');
  assert.strictEqual(e.status, 'failed');
  assert.strictEqual(e.process.reason, 'browser_fetch');
  assert.ok(e.process.error.includes('登录态失效'));
  assert.strictEqual(e.raw.title, '清单标题n2'); // fallback 清单信息保留
});

test('note 畸形（无标题无正文）→ failed(invalid)', async (t) => {
  const ctx = setup();
  t.after(cleanup(ctx));
  const { result: r, outbound } = await countOutbound(() =>
    post(ctx.base, [{ note_id: 'n3', xsec_token: 'X', title: '清单标题n3', note: {} }])
  );
  const j = await r.json();
  assert.strictEqual(j.results[0].status, 'failed');
  assert.strictEqual(j.results[0].reason, 'invalid');
  assert.strictEqual(outbound, 0);
  const e = ctx.store.readInbox().find((x) => x.note_id === 'n3');
  assert.strictEqual(e.process.reason, 'invalid');
});
