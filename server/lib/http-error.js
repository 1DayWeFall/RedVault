'use strict';

/**
 * 统一 HTTP 错误（M7 地基）
 * - 用真正的 Error 实例替代此前的 `{ status, code, message }` 字面量抛错：保留 stack、可 instanceof
 * - status / code / message 语义不变，路由与前端错误 Toast 完全兼容
 * - toHttpError 在边界把任意抛错规整为 HttpError：文件系统错误不再被一律吞成 500
 */

/** 文件系统错误 → 400 可读文案（此前 notes/attachments 把 ENOENT/EACCES 一律回成 500） */
const FS_MESSAGES = {
  ENOENT: '文件或目录不存在',
  EACCES: '无访问权限',
  EPERM: '操作不被允许（权限不足）',
  EISDIR: '目标是目录而非文件',
  ENOTDIR: '路径中的某一级不是目录',
  EBUSY: '文件被占用（请关闭正在使用该文件的程序后重试）',
  EINVAL: '路径或参数无效',
  ENOSPC: '磁盘空间不足',
  EMFILE: '打开的文件过多'
};

function httpError(status, code, message, extra) {
  const err = new Error(message || code || '请求失败');
  err.status = Number(status) || 500;
  err.code = code || 'INTERNAL';
  err.expose = true;
  if (extra) Object.assign(err, extra);
  return err;
}

/** 具备 status + code 即视为「已分类的 HTTP 错误」（兼容历史字面量） */
function isHttpError(e) {
  return !!e && typeof e === 'object' && typeof e.code === 'string' && typeof e.status === 'number';
}

/**
 * 规整任意抛错为 HttpError：
 * - 已分类（含历史字面量）→ 转 Error 实例并保持 status/code/message
 * - 文件系统错误 → 400 + FS_* 可读文案
 * - 其余 → 兜底状态（默认 500）
 */
function toHttpError(e, { status = 500, code = 'INTERNAL' } = {}) {
  if (isHttpError(e)) {
    return e instanceof Error ? e : httpError(e.status, e.code, e.message, { cause: e });
  }
  const fsCode = e && typeof e === 'object' ? e.code : null;
  if (fsCode && FS_MESSAGES[fsCode]) {
    const msg = `${FS_MESSAGES[fsCode]}（${fsCode}）${e.message ? '：' + e.message : ''}`;
    return httpError(400, 'FS_' + fsCode, msg, { cause: e });
  }
  return httpError(status, code, (e && e.message) || '服务器内部错误', { cause: e });
}

module.exports = { httpError, isHttpError, toHttpError, FS_MESSAGES };
