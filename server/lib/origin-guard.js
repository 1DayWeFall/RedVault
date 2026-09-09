'use strict';

/**
 * 回环同源校验（M7 安全打磨）
 *
 * 背景：服务只绑 127.0.0.1，但除 capture 的 X-Capture-Token 外，其余 /api/* 无任何鉴权；
 * express.urlencoded 曾开启，恶意网页可用跨站表单直接调「删除笔记 / 改配置 / 导出全库」。
 *
 * 规则：
 * - 无 Origin（同源导航、脚本 XHR、curl、油猴脚本）→ 放行，行为不变
 * - Origin 主机为回环地址（127.x / localhost / ::1）→ 放行
 * - 其余 Origin → 403（挡住跨站写请求；这是纵深防御，不替代 capture token）
 * - `except` 前缀豁免：/api/capture 自带 X-Capture-Token 鉴权，且油猴脚本经
 *   GM_xmlhttpRequest 发出时来源不可控（可能带扩展/页面 Origin），误拦会导致采集静默失败
 */

const { httpError } = require('./http-error');

function isLoopbackHost(host) {
  const h = String(host || '').toLowerCase();
  if (h === 'localhost' || h === '::1' || h === '[::1]') return true;
  return /^127(?:\.\d{1,3}){3}$/.test(h);
}

function createOriginGuard({ port = 0, except = [] } = {}) {
  return function originGuard(req, res, next) {
    const url = String(req.originalUrl || req.url || '');
    if (except.some((prefix) => url.startsWith(prefix))) return next();

    const origin = req.get('origin');
    if (!origin) return next();

    let u;
    try {
      u = new URL(origin);
    } catch (_) {
      return next(httpError(403, 'BAD_ORIGIN', '请求头 Origin 非法'));
    }
    if (!isLoopbackHost(u.hostname)) {
      return next(httpError(403, 'FORBIDDEN_ORIGIN', '已拒绝跨站请求：RedVault 仅允许本机（127.0.0.1 / localhost）访问'));
    }
    if (port && u.port && Number(u.port) !== Number(port)) {
      return next(httpError(403, 'FORBIDDEN_ORIGIN', `已拒绝跨站请求：Origin 端口 ${u.port} 与服务端端口 ${port} 不一致`));
    }
    return next();
  };
}

module.exports = { createOriginGuard, isLoopbackHost };
