'use strict';

/** 笔记路由（DESIGN §6）：列表只回 index 元数据（不发正文），详情读 vault 全文并解析锚点区块 */

const express = require('express');
const { readSection } = require('../services/vault');

/** 允许前端编辑的区块白名单（不含 frontmatter 关联区块） */
const EDITABLE_SECTIONS = new Set(['summary', 'points', 'body', 'ocr', 'comments', 'related', 'attachments', 'remark']);

const listFromMd = (s) => (s ? s.split('\n').map((l) => l.replace(/^-\s*/, '').trim()).filter(Boolean) : []);

/** vault 正文 → 前端视图模型区块 */
function parseSections(content) {
  const rel = listFromMd(readSection(content, 'related')).map((s) => s.replace(/^\[\[/, '').replace(/\]\]$/, ''));
  return {
    summary: readSection(content, 'summary') || '',
    points: listFromMd(readSection(content, 'points')),
    body: readSection(content, 'body') || '',
    ocr: listFromMd(readSection(content, 'ocr')),
    subtitle: readSection(content, 'subtitle') || '',
    commentsMd: readSection(content, 'comments') || '',
    relatedIds: rel,
    attachmentsMd: readSection(content, 'attachments') || '',
    remark: readSection(content, 'remark') || '',
    /* 合成笔记区块 */
    overview: readSection(content, 'overview') || '',
    common: listFromMd(readSection(content, 'common')),
    diff: listFromMd(readSection(content, 'diff')),
    todo: listFromMd(readSection(content, 'todo')),
    sourceIds: listFromMd(readSection(content, 'sources'))
  };
}

module.exports = function notesRoutes(ctx) {
  const router = express.Router();

  /* 列表：全部 index 元数据（卡片字段，无正文；前端内存过滤/分页，数千条毫秒级 §13） */
  router.get('/notes', (req, res) => {
    res.json(ctx.store.readIndex().notes);
  });

  /* 统计（侧栏：分类树/标签云/计数） */
  router.get('/stats', (req, res) => {
    const notes = ctx.store.readIndex().notes;
    const catTree = {};
    const tagMap = {};
    for (const n of notes) {
      if (n.category) {
        catTree[n.category] = catTree[n.category] || {};
        if (n.subcategory) catTree[n.category][n.subcategory] = (catTree[n.category][n.subcategory] || 0) + 1;
      }
      for (const t of n.tags || []) tagMap[t] = (tagMap[t] || 0) + 1;
    }
    res.json({
      inboxCount: ctx.store.readInbox().filter((x) => x.status !== 'done').length,
      noteCount: notes.length,
      categoryTree: catTree,
      tagCloud: Object.entries(tagMap).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count)
    });
  });

  /* 详情：frontmatter + 全文 + 解析好的区块（前端零解析直接渲染） */
  router.get('/notes/:id', (req, res, next) => {
    try {
      const meta = ctx.store.readIndex().notes.find((n) => n.note_id === req.params.id);
      if (!meta) throw { status: 404, code: 'NOT_FOUND', message: '笔记不存在' };
      const { fm, content } = ctx.vault.readNoteFile(meta.file);
      res.json({ note: meta, fm, content, sections: parseSections(content) });
    } catch (e) {
      next(e.code ? e : { status: 500, message: e.message });
    }
  });

  /* 区块编辑（锚点替换，只动目标区块 §5.6） */
  router.patch('/notes/:id/section', (req, res, next) => {
    try {
      const { key, content } = req.body || {};
      if (!EDITABLE_SECTIONS.has(key)) {
        throw { status: 400, code: 'BAD_SECTION', message: `不可编辑的区块: ${key}` };
      }
      const meta = ctx.store.readIndex().notes.find((n) => n.note_id === req.params.id);
      if (!meta) throw { status: 404, code: 'NOT_FOUND', message: '笔记不存在' };
      ctx.vault.updateNoteFile(meta.file, {}, { [key]: String(content ?? '') });
      ctx.store.upsertIndexNote({ note_id: meta.note_id, modified_at: new Date().toISOString() });
      res.json({ ok: true });
    } catch (e) { next(e.code ? e : { status: 500, message: e.message }); }
  });

  /* 删除：vault 文件 + 附件前缀清理 + index 移除 */
  router.delete('/notes/:id', (req, res, next) => {
    try {
      const meta = ctx.store.readIndex().notes.find((n) => n.note_id === req.params.id);
      if (!meta) throw { status: 404, code: 'NOT_FOUND', message: '笔记不存在' };
      const cleaned = ctx.vault.deleteNoteFile(meta.file, meta.note_id);
      ctx.store.removeIndexNote(meta.note_id);
      console.log(`[notes] 删除 ${meta.note_id} 《${meta.title}》（附件清理 ${cleaned} 个）`);
      res.status(204).end();
    } catch (e) { next(e.code ? e : { status: 500, message: e.message }); }
  });

  return router;
};
