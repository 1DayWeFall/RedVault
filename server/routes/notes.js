'use strict';

/** 笔记路由（DESIGN §6）：列表只回 index 元数据（不发正文），详情读 vault 全文并解析锚点区块 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { readSection } = require('../services/vault');
const { runAi } = require('../services/pipeline');
const { probeSource } = require('../services/fetch-note');
const { vaultTokenOf } = require('../lib/source-link');

/** 溯源链接探测缓存（模块级单例）：键 = noteId:token——重扫换 token 即换键自动重探；
 *  TTL 按状态分级：alive 10min / expired·deleted 1h（不自愈）/ error 30s（允许重试）；
 *  in-flight Map 去重并发；上限 500 条 FIFO 淘汰（防长会话膨胀） */
const LINK_TTL = { alive: 10 * 60e3, expired: 60 * 60e3, deleted: 60 * 60e3, error: 30e3 };
const linkCache = new Map();     // key → {status, message, at}
const linkInflight = new Map();  // key → Promise<entry>

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

  /* 溯源链接活性探测（详情抽屉惰性单篇触发；列表页禁用，防批量探测触发风控）：
   *  库内无 token → no_token 零网络；有 token → probeSource 同款判定（302 登录页→
   *  expired / 内容缺失→deleted / 风控网络→error / 其余→alive），结果只进内存缓存 */
  router.get('/notes/:id/link-status', async (req, res, next) => {
    try {
      const meta = ctx.store.readIndex().notes.find((n) => n.note_id === req.params.id);
      if (!meta) throw { status: 404, code: 'NOT_FOUND', message: '笔记不存在' };
      const noteId = req.params.id;

      const stored = vaultTokenOf(ctx, noteId);
      if (!stored || !stored.token) {
        return res.json({
          note_id: noteId, status: 'no_token',
          message: '库内链接未带 xsec_token，重扫收藏夹可补全', checked_at: new Date().toISOString()
        });
      }

      const key = `${noteId}:${stored.token}`;
      const hit = req.query.refresh === '1' ? null : linkCache.get(key);
      if (hit && Date.now() - hit.at < (LINK_TTL[hit.status] || 60e3)) {
        return res.json({ note_id: noteId, ...hit, cached: true });
      }

      let p = linkInflight.get(key);
      if (!p) {
        p = (async () => {
          const r = await probeSource(noteId, stored.token);
          const status = r.ok ? 'alive'
            : r.reason === 'token_expired' ? 'expired'
            : r.reason === 'incomplete' ? 'deleted'
            : 'error';
          const entry = { status, message: r.ok ? '链接有效，可直接打开' : r.message, at: Date.now() };
          if (linkCache.size >= 500) linkCache.delete(linkCache.keys().next().value); /* FIFO 淘汰最老 */
          linkCache.set(key, entry);
          return entry;
        })().finally(() => linkInflight.delete(key));
        linkInflight.set(key, p);
      }
      const entry = await p;
      res.json({ note_id: noteId, ...entry });
    } catch (e) { next(e.code ? e : { status: 500, message: e.message }); }
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

  /* 重新打标：读 vault 原文 → 复用管线 runAi（含 vision→text 回退）重跑 →
   * 锚点更新 AI 区块与分类标签（用户手写区块与评论精选不动，仅刷新 AI 洞察段） */
  router.post('/notes/:id/reprocess', async (req, res, next) => {
    try {
      const meta = ctx.store.readIndex().notes.find((n) => n.note_id === req.params.id);
      if (!meta) throw { status: 404, code: 'NOT_FOUND', message: '笔记不存在' };
      const cfg = ctx.store.readConfig();
      if (!cfg.ai?.text?.apiKey && !cfg.ai?.vision?.apiKey) {
        throw { status: 400, code: 'NO_AI_CONFIG', message: '尚未配置 AI，请先在设置页填写 text 或 vision 槽位' };
      }

      const { fm, content } = ctx.vault.readNoteFile(meta.file);
      const body = readSection(content, 'body') || '';
      const commentsMd = readSection(content, 'comments') || '';
      const subtitle = readSection(content, 'subtitle') || '';

      /* 本地图片按 frontmatter 记录重组（丢失的跳过，防读文件抛错） */
      const attachDir = ctx.vault.attachDir;
      const local = (Array.isArray(fm.images) ? fm.images : [])
        .map((f) => ({ file: String(f), abs: path.join(attachDir, path.basename(String(f))) }))
        .filter((l) => fs.existsSync(l.abs));

      const raw = {
        title: fm.title || meta.title,
        desc: body === '（正文缺失）' ? '' : body,
        type: fm.type || 'normal',
        subtitle_text: subtitle,
        commentsText: commentsMd,   // 已渲染评论（含旧 AI 洞察）直接作为上下文
        comments: [], image_urls: []
      };

      let ai;
      try {
        ai = await runAi(ctx, raw, { local, remote: [], thumb: fm.cover || '' });
      } catch (e) {
        throw e.code ? e : { status: 502, code: 'AI_REPROCESS_FAILED', message: 'AI 处理失败：' + (e.message || e) };
      }

      /* 区块更新：summary/points 覆盖；ocr 有内容才写；comments 保留评论精选、仅刷新 AI 洞察段 */
      const sections = {
        summary: ai.summary || '（待 AI 整理）',
        points: ai.key_points.map((k) => `- ${k}`).join('\n') || '（待 AI 整理）'
      };
      if (ai.ocr.length) sections.ocr = ai.ocr.map((o) => `- ${o}`).join('\n');
      if (ai.comment_insights.length) {
        const [commentMain] = String(commentsMd).split('\n**AI 洞察**');
        sections.comments = (commentMain || '（无）').trimEnd()
          + '\n\n**AI 洞察**\n' + ai.comment_insights.map((c) => `- ${c}`).join('\n');
      }
      ctx.vault.updateNoteFile(meta.file,
        { category: ai.category, subcategory: ai.subcategory, tags: ai.tags },
        sections);
      ctx.store.upsertIndexNote({
        note_id: meta.note_id,
        category: ai.category, subcategory: ai.subcategory, tags: ai.tags,
        modified_at: new Date().toISOString()
      });
      console.log(`[notes] reprocess ${meta.note_id} 《${meta.title}》 → ${ai.category}/${ai.subcategory || '-'} tags=[${ai.tags.join(',')}]`);
      res.json({ ok: true, note: ctx.store.readIndex().notes.find((n) => n.note_id === meta.note_id) });
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
