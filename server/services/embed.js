'use strict';

/**
 * 可插拔嵌入层（M8，DESIGN §5.8）
 * 探测顺序：ollama（本地） → api（text 槽位 /embeddings，受 rag.allowRemoteEmbed 开关，
 * 默认 false —— M8 决策①安全优先：本地不可用直接降级关键词，不静默外发） → keyword（无向量）
 * - embed(texts) 返回统一结构，keyword 降级 vectors=null，功能不中断
 * - usage() 统计请求/字符数，供 ask 成本的 embedding 段
 * - dims 变化由 vector 层感知并触发全量重建（需用户确认）
 */

const { httpError } = require('../lib/http-error');

const PROBE_TIMEOUT = 8000;   // 探测超时：本机 Ollama 应秒回
const RUN_TIMEOUT = 60000;    // 批量嵌入上限（重建全库时单批）

function createEmbedder(ctx) {
  const self = {
    provider: null,
    dims: 0,
    get available() { return self.provider === 'ollama' || self.provider === 'api'; },
    get remoteWarn() { return self.provider === 'api'; } // 正文外发警示（状态栏琥珀）
  };

  let usageAcc = { requests: 0, chars: 0 };

  function ragCfg() {
    return ctx.store.readConfig().rag || {};
  }

  /* ── provider 各自的批量实现 ── */

  async function embedOllama(texts, { probe = false } = {}) {
    const cfg = ragCfg();
    const base = String(cfg.ollamaUrl || 'http://127.0.0.1:11434').replace(/\/+$/, '');
    const model = cfg.ollamaModel || 'nomic-embed-text';
    const out = [];
    let dims = 0;
    for (const t of texts) {
      const r = await fetch(base + '/api/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: t }),
        signal: AbortSignal.timeout(RUN_TIMEOUT)
      });
      if (!r.ok) throw httpError(502, 'EMBED_OLLAMA', `Ollama 嵌入失败 ${r.status}: ${(await r.text().catch(() => '')).slice(0, 120)}`);
      const j = await r.json();
      const v = j.embedding;
      if (!Array.isArray(v) || !v.length) throw httpError(502, 'EMBED_OLLAMA', 'Ollama 嵌入返回空向量（模型未拉取？）');
      if (!dims) dims = v.length;
      else if (v.length !== dims) throw httpError(502, 'EMBED_OLLAMA', `Ollama 嵌入维度不一致（${dims} vs ${v.length}）`);
      out.push(Float32Array.from(v));
      if (!probe) { usageAcc.requests++; usageAcc.chars += t.length; }
    }
    return { dims, vectors: out };
  }

  async function embedApi(texts, { probe = false } = {}) {
    const slot = ctx.store.readConfig().ai?.text;
    if (!slot?.apiKey || !slot?.baseUrl) {
      throw httpError(400, 'NO_EMBED_CONFIG', '远端嵌入需要 text 槽位已配置（baseUrl / apiKey）');
    }
    const cfg = ragCfg();
    const url = slot.baseUrl.replace(/\/+$/, '') + '/embeddings';
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${slot.apiKey}` },
      body: JSON.stringify({ model: cfg.embedModel || 'text-embedding-3-small', input: texts }),
      signal: AbortSignal.timeout(RUN_TIMEOUT)
    });
    if (!r.ok) throw httpError(502, 'EMBED_API', `远端嵌入失败 ${r.status}: ${(await r.text().catch(() => '')).slice(0, 120)}`);
    const j = await r.json();
    if (!Array.isArray(j.data) || j.data.length !== texts.length) {
      throw httpError(502, 'EMBED_API', '远端嵌入返回数量与输入不符');
    }
    const out = new Array(texts.length);
    let dims = 0;
    for (const d of j.data) {
      const v = d.embedding;
      if (!Array.isArray(v) || !v.length) throw httpError(502, 'EMBED_API', '远端嵌入返回空向量');
      if (!dims) dims = v.length;
      else if (v.length !== dims) throw httpError(502, 'EMBED_API', `远端嵌入维度不一致（${dims} vs ${v.length}）`);
      out[d.index ?? 0] = Float32Array.from(v);
    }
    usageAcc.requests++; usageAcc.chars += probe ? 0 : texts.reduce((s, t) => s + t.length, 0);
    return { dims, vectors: out };
  }

  /* ── 探测：真实嵌入一条 "ping"（比 GET /api/tags 更能确认模型可用） ── */
  async function tryProvider(name) {
    try {
      const r = name === 'ollama' ? await embedOllama(['ping'], { probe: true }) : await embedApi(['ping'], { probe: true });
      return r;
    } catch (e) {
      if (e.code === 'NO_EMBED_CONFIG') return null;
      console.warn(`[embed] ${name} 探测失败: ${e.message}`);
      return null;
    }
  }

  async function ensure() {
    if (self.provider) return self;
    const cfg = ragCfg();
    const want = cfg.provider || 'auto';
    const apiAllowed = !!cfg.allowRemoteEmbed
      && !!(ctx.store.readConfig().ai?.text?.apiKey && ctx.store.readConfig().ai?.text?.baseUrl);

    const order = want === 'auto' ? ['ollama', ...(apiAllowed ? ['api'] : [])]
      : want === 'keyword' ? []
      : want === 'api' ? (apiAllowed ? ['api'] : [])
      : ['ollama'];

    for (const name of order) {
      const r = await tryProvider(name);
      if (r) {
        self.provider = name;
        self.dims = r.dims;
        console.log(`[embed] provider = ${name}（dims=${r.dims}${name === 'api' ? '，远端嵌入：正文+提问将外发' : ''}）`);
        return self;
      }
    }
    self.provider = 'keyword';
    console.log('[embed] provider = keyword（降级：关键词检索，无向量语义）');
    return self;
  }

  /** 统一嵌入入口（探测语义与运行语义分离：运行期失败抛错，由调用方决定是否降级） */
  async function embed(texts) {
    const arr = (texts || []).map(String);
    if (!arr.length) return { ok: true, provider: 'keyword', dims: 0, vectors: null };
    await ensure();
    if (self.provider === 'keyword') return { ok: true, provider: 'keyword', dims: 0, vectors: null };
    const fn = self.provider === 'ollama' ? embedOllama : embedApi;
    try {
      const r = await fn(arr);
      self.dims = r.dims; // 探测后模型变更 → 运行期刷新
      return { ok: true, provider: self.provider, dims: r.dims, vectors: r.vectors };
    } catch (e) {
      // 运行期掉线：降级 keyword，不让提问中断（下次 ensure 不重复探测，状态保持 keyword）
      console.warn(`[embed] ${self.provider} 运行期失败，本次降级 keyword: ${e.message}`);
      return { ok: false, provider: 'keyword', dims: 0, vectors: null, error: e.message };
    }
  }

  function usage() { return { ...usageAcc }; }

  return { ensure, embed, usage, get provider() { return self.provider; }, get dims() { return self.dims; },
    get available() { return self.available; }, get remoteWarn() { return self.remoteWarn; } };
}

module.exports = { createEmbedder };
