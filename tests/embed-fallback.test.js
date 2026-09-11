'use strict';

/** M8 嵌入层单测（services/embed.js）：provider 探测顺序 / 隐私开关 / 降级 / 批量
 * 全局 fetch 打桩，不触网。
 * seam：createEmbedder(ctx) → { ensure(), embed(texts), provider, dims, available, usage() }
 *   embed(texts) => { ok, provider, dims, vectors: Float32Array[] | null } */

const test = require('node:test');
const assert = require('node:assert');
const { createEmbedder } = require('../server/services/embed');

function fakeCtx(rag = {}, aiText = null) {
  return {
    store: {
      readConfig: () => ({
        rag: {
          provider: 'auto', allowRemoteEmbed: false,
          ollamaUrl: 'http://127.0.0.1:11434', ollamaModel: 'mok',
          embedModel: 'emb-1', ...rag
        },
        ai: { text: aiText || { baseUrl: '', apiKey: '', model: '' } }
      })
    }
  };
}

function stubFetch(handler) {
  const orig = global.fetch;
  const calls = [];
  global.fetch = async (url, opts) => {
    calls.push({ url: String(url), opts });
    return handler(String(url), opts);
  };
  return { calls, restore: () => { global.fetch = orig; } };
}

const okJson = (j) => ({ ok: true, json: async () => j });
const netFail = async () => { throw new Error('ECONNREFUSED'); };
const textSlot = { baseUrl: 'https://api.example.com/v1', apiKey: 'sk-x', model: 'gpt-x' };

test('auto：Ollama 可用 → provider=ollama，embed 返回向量', async () => {
  const f = stubFetch(() => okJson({ embedding: [0.1, 0.2, 0.3] }));
  try {
    const e = createEmbedder(fakeCtx());
    await e.ensure();
    assert.strictEqual(e.provider, 'ollama');
    assert.strictEqual(e.available, true);
    assert.strictEqual(e.dims, 3);
    const r = await e.embed(['你好', '世界']);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.provider, 'ollama');
    assert.strictEqual(r.vectors.length, 2);
    assert.ok(r.vectors[0] instanceof Float32Array);
  } finally { f.restore(); }
});

test('隐私默认：Ollama 不可用 + text 已配 + allowRemoteEmbed=false → 直接降级 keyword，不发远端请求', async () => {
  const f = stubFetch(netFail);
  try {
    const e = createEmbedder(fakeCtx({}, textSlot)); // allowRemoteEmbed 默认 false（M8 决策①）
    await e.ensure();
    assert.strictEqual(e.provider, 'keyword');
    assert.strictEqual(e.available, false);
    const r = await e.embed(['问题']);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.provider, 'keyword');
    assert.strictEqual(r.vectors, null);
    // api 档被隐私开关挡住：所有请求都只指向 ollama 端口
    assert.ok(f.calls.every((c) => c.url.includes('11434')), '不应有远端 /embeddings 请求');
  } finally { f.restore(); }
});

test('allowRemoteEmbed=true：Ollama 不可用 → 回落 text 槽位 /embeddings（批量 input）', async () => {
  const f = stubFetch((url, opts) => {
    if (url.includes('11434')) return netFail();
    if (url.endsWith('/embeddings')) {
      const input = JSON.parse(opts.body).input;
      const data = input.length === 2
        ? [{ index: 1, embedding: [0, 1] }, { index: 0, embedding: [1, 0] }]  // 故意乱序：验证按 index 归位
        : [{ index: 0, embedding: [0.5, 0.5] }];                              // 探测 ping
      return okJson({ data });
    }
    return netFail();
  });
  try {
    const e = createEmbedder(fakeCtx({ allowRemoteEmbed: true }, textSlot));
    await e.ensure();
    assert.strictEqual(e.provider, 'api');
    assert.strictEqual(e.remoteWarn, true); // 状态栏琥珀警示依据
    const r = await e.embed(['甲', '乙']);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.dims, 2);
    // OpenAI 兼容响应按 index 归位
    assert.deepStrictEqual(Array.from(r.vectors[0]), [1, 0]);
    assert.deepStrictEqual(Array.from(r.vectors[1]), [0, 1]);
  } finally { f.restore(); }
});

test('全不可用（远端开关关）→ keyword 降级，功能不中断', async () => {
  const f = stubFetch(netFail);
  try {
    const e = createEmbedder(fakeCtx({}, textSlot));
    await e.ensure();
    const r = await e.embed(['任意']);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.provider, 'keyword');
    assert.strictEqual(r.vectors, null);
  } finally { f.restore(); }
});

test('provider=keyword 显式配置 → 不做任何网络探测', async () => {
  const f = stubFetch(() => { throw new Error('不应触网'); });
  try {
    const e = createEmbedder(fakeCtx({ provider: 'keyword' }));
    await e.ensure();
    assert.strictEqual(e.provider, 'keyword');
    assert.strictEqual(f.calls.length, 0);
  } finally { f.restore(); }
});

test('usage：embed 统计请求次数与字符数（ask 成本 embedding 段依据）', async () => {
  const f = stubFetch(() => okJson({ embedding: [0.5, 0.5] }));
  try {
    const e = createEmbedder(fakeCtx());
    await e.embed(['四五六七']);
    const u = e.usage();
    assert.strictEqual(u.requests, 1);
    assert.strictEqual(u.chars, 4);
  } finally { f.restore(); }
});
