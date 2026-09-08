'use strict';

/** 溯源链接共享工具（capture 的 stale 判定/链接刷新 与 notes 的 link-status 探测共用） */

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
    const { fm } = ctx.vault.readNoteFile(meta.file);
    const m = /[?&]xsec_token=([^&\s]+)/.exec(String(fm.url || ''));
    if (m) { try { token = decodeURIComponent(m[1]); } catch { token = m[1]; } }
  } catch { /* 文件损坏/缺失 → 视为可刷新 */ }
  return { file: meta.file, token };
}

module.exports = { vaultTokenOf };
