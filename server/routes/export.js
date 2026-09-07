'use strict';

/**
 * 导出路由（DESIGN §5.10 / §6 GET /export）
 * archiver 流式打包 vault 全部内容（.md + attachments/），不整库载入内存。
 */

const express = require('express');
const archiver = require('archiver');

module.exports = function exportRoutes(ctx) {
  const router = express.Router();

  router.get('/export', (req, res, next) => {
    try {
      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.on('error', (e) => next(e));
      archive.on('warning', (w) => { if (w.code !== 'ENOENT') console.warn('[export]', w.message); });

      const date = new Date().toISOString().slice(0, 10);
      res.attachment(`redvault-${date}.zip`);
      archive.pipe(res);

      /* 内存生成 INDEX（wikilink 目录，不写入 vault） */
      const notes = ctx.store.readIndex().notes;
      const rows = notes.map((n) => `- [[${n.file.replace(/\.md$/, '')}|${n.title}]]`).join('\n');
      archive.append(`# 薯藏 RedVault · 库目录\n\n> 共 ${notes.length} 篇 · 导出于 ${new Date().toLocaleDateString('zh-CN')}\n\n${rows}\n`, { name: 'INDEX.md' });

      archive.directory(ctx.vault.dir, false); // vault 根内容（含 attachments/）原样打包
      archive.finalize();
    } catch (e) { next(e); }
  });

  return router;
};
