'use strict';

/** 溯源链接共享工具（capture 的 stale 判定/链接刷新 与 notes 的 link-status 探测共用） */

const fs = require('fs');
const path = require('path');

/* md 读取缓存（M7）：capture/check 循环里每条笔记都要读一次 md 抽 token，N 条 = N 次全量读盘。
 * 以 mtimeMs + size 为键，上限 500 条 FIFO 淘汰；ctx.vault 无 dir（测试 mock）时自动不缓存。 */
const tokenCache = new Map(); // abs → { mtimeMs, size, token }
const TOKEN_CACHE_MAX = 500;

function extractToken(fm) {
  const m = /[?&]xsec_token=([^&\s]+)/.exec(String((fm && fm.url) || ''));
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

function tokenOfFile(ctx, abs, file) {
  if (!ctx.vault.dir) return extractToken(ctx.vault.readNoteFile(file).fm); // mock/无目录：不缓存
  const st = fs.statSync(abs);
  const hit = tokenCache.get(abs);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.token;

  const token = extractToken(ctx.vault.readNoteFile(file).fm);
  if (tokenCache.size >= TOKEN_CACHE_MAX) tokenCache.delete(tokenCache.keys().next().value);
  tokenCache.set(abs, { mtimeMs: st.mtimeMs, size: st.size, token });
  return token;
}

/** 已入库笔记的库内溯源 token：
 *  返回 { file, token }——token 从 frontmatter url 的 xsec_token 参数解码比对；
 *  url 无 token 或文件读取失败 → token 为 null（视为可刷新）；未入库 → null。
 *  ctx.vault 缺失（旧测试 mock）→ null，防御兼容 */
function vaultTokenOf(ctx, noteId) {
  if (!ctx.vault) return null;
  const meta = ctx.store.readIndex().notes.find((n) => n.note_id === noteId);
  if (!meta) return null;
  let token = null;
  try {
    token = ctx.vault.dir
      ? tokenOfFile(ctx, path.join(ctx.vault.dir, meta.file), meta.file)
      : extractToken(ctx.vault.readNoteFile(meta.file).fm); // 无目录（测试 mock）：不缓存
  } catch { /* 文件损坏/缺失 → 视为可刷新 */ }
  return { file: meta.file, token };
}

module.exports = { vaultTokenOf, extractToken };
