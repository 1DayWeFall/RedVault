'use strict';

/** M7 安全地基单测：回环同源校验（origin-guard）+ 按端点限流（ratelimit）
 *  不触网：express + listen(0) + 本机 fetch，请求全部打到随机端口的临时服务。 */

const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { createOriginGuard } = require('../server/lib/origin-guard');
const { createRateLimit } = require('../server/lib/ratelimit');

function buildApp({ guard = null, limiter = null } = {}) {
  const app = express();
  if (guard) app.use(guard);
  if (limiter) app.use('/api/ping', limiter);
  app.all('/api/ping', (req, res) => res.json({ ok: true }));
  app.post('/api/capture/check', (req, res) => res.json({ captured: true }));
  app.use((err, _req, res, _next) => res.status(err.status || 500)
    .json({ error: { code: err.code || 'INTERNAL', message: err.message } }));
  return app;
}

async function withServer(app, fn) {
  const s = app.listen(0);
  try {
    await fn(`http://127.0.0.1:${s.address().port}`);
  } finally {
    s.close();
  }
}

const get = (url, origin) => fetch(url + '/api/ping', origin ? { headers: { Origin: origin } } : {});

test('同源校验：无 Origin（脚本 XHR / curl）放行', async () => {
  await withServer(buildApp({ guard: createOriginGuard({ port: 3789 }) }), async (base) => {
    const r = await get(base);
    assert.strictEqual(r.status, 200);
  });
});

test('同源校验：回环 Origin（127.0.0.1 / localhost）放行', async () => {
  await withServer(buildApp({ guard: createOriginGuard({ port: 3789 }) }), async (base) => {
    assert.strictEqual((await get(base, 'http://127.0.0.1:3789')).status, 200);
    assert.strictEqual((await get(base, 'http://localhost:3789')).status, 200);
  });
});

test('同源校验：跨站 Origin → 403 FORBIDDEN_ORIGIN', async () => {
  await withServer(buildApp({ guard: createOriginGuard({ port: 3789 }) }), async (base) => {
    const r = await get(base, 'http://evil.example.com');
    assert.strictEqual(r.status, 403);
    assert.strictEqual((await r.json()).error.code, 'FORBIDDEN_ORIGIN');
  });
});

test('同源校验：回环但端口不符 → 403（防同机其它服务冒用）', async () => {
  await withServer(buildApp({ guard: createOriginGuard({ port: 3789 }) }), async (base) => {
    const r = await get(base, 'http://127.0.0.1:8923');
    assert.strictEqual(r.status, 403);
  });
});

test('同源校验：except 前缀豁免（/api/capture 自带 token 鉴权，脚本 Origin 不可控）', async () => {
  await withServer(buildApp({ guard: createOriginGuard({ port: 3789, except: ['/api/capture'] }) }), async (base) => {
    const r = await fetch(base + '/api/capture/check', {
      method: 'POST',
      headers: { Origin: 'http://evil.example.com', 'Content-Type': 'application/json' },
      body: '{}'
    });
    assert.strictEqual(r.status, 200, 'capture 不应被同源校验拦成 403（否则油猴上报会静默失败）');
  });
});

test('限流：窗口内超限 → 429 RATE_LIMITED，窗口过后恢复', async () => {
  const limiter = createRateLimit({ limit: 2, windowMs: 250, name: '单测' });
  await withServer(buildApp({ limiter }), async (base) => {
    assert.strictEqual((await get(base)).status, 200);
    assert.strictEqual((await get(base)).status, 200);

    const blocked = await get(base);
    assert.strictEqual(blocked.status, 429);
    const j = await blocked.json();
    assert.strictEqual(j.error.code, 'RATE_LIMITED');
    assert.ok(blocked.headers.get('retry-after'), '应带 Retry-After 头');

    await new Promise((r) => setTimeout(r, 300));   /* 窗口滑出后应恢复 */
    assert.strictEqual((await get(base)).status, 200);
  });
});

test('限流：可按 method 过滤（只拦 POST）', async () => {
  const limiter = createRateLimit({ limit: 1, windowMs: 60e3, methods: ['POST'] });
  await withServer(buildApp({ limiter }), async (base) => {
    assert.strictEqual((await get(base)).status, 200);
    assert.strictEqual((await get(base)).status, 200); // GET 不受限
    const r = await fetch(base + '/api/ping', { method: 'POST' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual((await fetch(base + '/api/ping', { method: 'POST' })).status, 429);
  });
});
