'use strict';

/**
 * AI 服务（DESIGN §5.4）
 * - 双槽位（text/vision）OpenAI 兼容 chat：POST {baseUrl}/chat/completions
 * - 视觉消息 image_url 用 base64 data URL
 * - 重试：429/5xx/网络错误 指数退避（2s/4s/8s）共 3 次；配置缺失/4xx 非限流不重试
 * - JSON 输出：response_format 声明 + 平衡括号兜底解析，解析失败计一次重试
 * - 成本估算：chars/1.6 估 token，priceIn/Out 按每百万 token 计（OpenAI 惯例），累计入内存
 */

const { httpError } = require('../lib/http-error');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 估 token：按 1.6 字符/中文 token 的粗略折算 */
function estimateTokens(str) {
  return Math.ceil(String(str || '').length / 1.6);
}

/** JSON 解析兜底：直接 → 去围栏 → 提取首个平衡 {...} 块 */
function parseJson(text) {
  if (typeof text !== 'string') return null;
  const s = text.trim();
  try { return JSON.parse(s); } catch (_) {}
  const fenced = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(fenced); } catch (_) {}
  const i = s.indexOf('{');
  if (i < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') inStr = !inStr;
    else if (!inStr && c === '{') depth++;
    else if (!inStr && c === '}') {
      depth--;
      if (depth === 0) { try { return JSON.parse(s.slice(i, j + 1)); } catch (_) { return null; } }
    }
  }
  return null;
}

function createAi(ctx) {
  let totalIn = 0, totalOut = 0, cost = 0;

  function slotCfg(slot) {
    const cfg = ctx.store.readConfig().ai?.[slot];
    if (!cfg || !cfg.apiKey || !cfg.baseUrl || !cfg.model) {
      throw httpError(400, 'NO_AI_CONFIG', `${slot} 槽位未配置（设置页填写 baseUrl / apiKey / model）`);
    }
    return cfg;
  }

  function countCost(slot, inputText, outputText) {
    const cfg = ctx.store.readConfig().ai?.[slot];
    if (!cfg) return;
    const ti = estimateTokens(inputText), to = estimateTokens(outputText);
    totalIn += ti; totalOut += to;
    if (cfg.priceIn || cfg.priceOut) {
      cost += (ti * (cfg.priceIn || 0) + to * (cfg.priceOut || 0)) / 1e6; // 每百万 token
    }
  }

  async function request(slot, messages, { maxTokens = 2048, temperature = 0.3, json = false } = {}) {
    const cfg = slotCfg(slot);
    const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions';
    const body = { model: cfg.model, messages, temperature, max_tokens: maxTokens };
    if (json) body.response_format = { type: 'json_object' };
    let r;
    try {
      r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify(body)
      });
    } catch (e) {
      countCost(slot, JSON.stringify(messages), ''); // 失败也计入输入开销（M7：重试成本不再隐形）
      throw httpError(502, 'AI_NETWORK', 'AI 请求网络错误: ' + (e.cause?.code || e.message), { cause: e });
    }
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      countCost(slot, JSON.stringify(messages), '');
      throw httpError(r.status, 'AI_HTTP_' + r.status, `AI 请求失败 ${r.status}: ${detail.slice(0, 200)}`);
    }
    const j = await r.json();
    const content = j.choices?.[0]?.message?.content;
    if (content == null || content === '') {
      countCost(slot, JSON.stringify(messages), '');
      throw httpError(502, 'AI_EMPTY', 'AI 返回内容为空');
    }
    countCost(slot, JSON.stringify(messages), String(content));
    return String(content);
  }

  async function withRetry(fn) {
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return await fn(); } catch (e) {
        lastErr = e;
        if (e.code === 'NO_AI_CONFIG') throw e;                       // 配置缺失不重试
        if (e.status && e.status !== 429 && e.status < 500) throw e;  // 4xx 非限流不重试
        if (attempt < 2) await sleep(2000 * Math.pow(2, attempt));    // 2s/4s
      }
    }
    throw lastErr;
  }

  /** 纯文本返回（带网络重试） */
  async function chat(slot, messages, opts) {
    return withRetry(() => request(slot, messages, opts));
  }

  /** JSON 返回（网络重试 + 解析兜底，解析失败计一次重试） */
  async function chatJson(slot, messages, opts) {
    return withRetry(async () => {
      const content = await request(slot, messages, { ...opts, json: true });
      const parsed = parseJson(content);
      if (!parsed) throw httpError(502, 'AI_JSON_PARSE', 'AI 返回无法解析为 JSON');
      return parsed;
    });
  }

  /** 连通性测试（§6 POST /settings/test） */
  async function test(slot) {
    const t0 = Date.now();
    const content = await chat(slot, [{ role: 'user', content: '只回复两个字：正常' }], { maxTokens: 16, temperature: 0 });
    return { ok: true, latencyMs: Date.now() - t0, model: slotCfg(slot).model, reply: content.slice(0, 60) };
  }

  function usage() {
    return { totalIn, totalOut, cost: Math.round(cost * 10000) / 10000 };
  }

  return { chat, chatJson, test, usage, parseJson };
}

module.exports = { createAi, parseJson, estimateTokens };
