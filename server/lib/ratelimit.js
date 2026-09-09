'use strict';

/**
 * 内存滑动窗口限流（M7 安全打磨）
 * 防误触放大：/capture/list 会放大对小红书的请求（风控风险）与 AI 费用，
 * rag/ask、reprocess、settings/test 同理由此收敛。
 */

const { httpError } = require('./http-error');

function createRateLimit({ limit = 30, windowMs = 60e3, name = 'api', methods = null } = {}) {
  const hits = new Map(); // key → number[]（窗口内的请求时间戳）

  return function rateLimit(req, res, next) {
    if (methods && !methods.includes(req.method)) return next();

    const key = `${req.ip || 'local'}|${req.baseUrl || ''}${req.path || ''}|${req.method}`;
    const now = Date.now();
    let arr = (hits.get(key) || []).filter((t) => now - t < windowMs);

    if (arr.length >= limit) {
      const retryAfter = Math.max(1, Math.ceil((windowMs - (now - arr[0])) / 1000));
      res.set('Retry-After', String(retryAfter));
      return next(httpError(429, 'RATE_LIMITED',
        `请求过于频繁（${name} 限 ${limit} 次/${Math.round(windowMs / 1000)} 秒），请 ${retryAfter} 秒后重试`));
    }

    arr.push(now);
    hits.set(key, arr);

    /* 惰性清理：条目过多时剔除已过期窗口，防长会话内存膨胀 */
    if (hits.size > 500) {
      for (const [k, v] of hits) {
        if (v.every((t) => now - t >= windowMs)) hits.delete(k);
      }
    }
    return next();
  };
}

/** 各端点预设（次/分钟） */
const RATE_PRESETS = {
  'rag/ask':       { limit: 10, windowMs: 60e3, methods: ['POST'], name: '问答' },
  'capture/list':  { limit: 20, windowMs: 60e3, methods: ['POST'], name: '批量上报' },
  'settings/test': { limit: 10, windowMs: 60e3, methods: ['POST'], name: '连接测试' },
  'reprocess':     { limit: 5,  windowMs: 60e3, methods: ['POST'], name: '重新打标' },
  'link-status':   { limit: 60, windowMs: 60e3, methods: ['GET'],  name: '链接探测' }
};

module.exports = { createRateLimit, RATE_PRESETS };
