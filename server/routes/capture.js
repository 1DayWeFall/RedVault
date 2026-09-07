'use strict';

/**
 * 采集上报路由（DESIGN §5.1 / §6）
 * - POST /api/capture       单条上报（旧入口，保留兼容）
 * - POST /api/capture/list  收藏夹清单批量上报：油猴脚本只发清单（note_id + xsec_token），
 *                           服务端逐条用 xsec_token 抓详情页（限速 1.5~3s 随机抖动），
 *                           解析 __INITIAL_STATE__ 取正文/字幕/图片后判重入箱。
 * 鉴权 X-Capture-Token。
 */

const express = require('express');
const { normalizeCapture, toInt } = require('../lib/capture-normalize');
const { fetchNoteDetail, exploreUrl, sleep } = require('../services/fetch-note');

module.exports = function captureRoutes(ctx) {
  const router = express.Router();

  router.post('/capture', (req, res, next) => {
    try {
      const token = req.get('X-Capture-Token');
      const cfg = ctx.store.readConfig();
      if (!cfg.capture?.token || token !== cfg.capture.token) {
        throw { status: 401, code: 'BAD_TOKEN', message: 'X-Capture-Token 缺失或不正确' };
      }

      const { note_id, raw } = normalizeCapture(req.body);

      if (ctx.store.isDuplicate(note_id)) {
        return res.status(409).json({ error: { code: 'DUPLICATE', message: '该笔记已在收件箱或已入库' } });
      }

      ctx.store.addInboxEntry({
        note_id,
        captured_at: new Date().toISOString(),
        status: 'pending',
        raw,
        process: null
      });
      console.log(`[capture] 入收件箱: ${note_id} 《${raw.title}》(评论 ${raw.comments.length} 条)`);
      res.status(201).json({ note_id });
    } catch (err) {
      next(err);
    }
  });

  /* ── 收藏夹清单批量上报：服务端负责详情抓取 ── */
  router.post('/capture/list', async (req, res, next) => {
    try {
      const token = req.get('X-Capture-Token');
      const cfg = ctx.store.readConfig();
      if (!cfg.capture?.token || token !== cfg.capture.token) {
        throw { status: 401, code: 'BAD_TOKEN', message: 'X-Capture-Token 缺失或不正确' };
      }

      const notes = req.body && req.body.notes;
      if (!Array.isArray(notes) || notes.length === 0) {
        throw { status: 400, code: 'BAD_PAYLOAD', message: 'notes 须为非空数组' };
      }
      if (notes.length > 20) {
        throw { status: 413, code: 'TOO_MANY', message: '单批最多 20 条，请分批上报' };
      }

      const results = [];
      for (const item of notes) {
        const noteId = String((item && item.note_id) || '').trim();
        const xsec = String((item && item.xsec_token) || '').trim();
        if (!noteId || !xsec) {
          results.push({ note_id: noteId || '(缺失)', status: 'invalid', error: '缺少 note_id / xsec_token' });
          continue;
        }

        if (ctx.store.isDuplicate(noteId)) {
          results.push({ note_id: noteId, status: 'duplicate' });
          continue;
        }

        /* 限速：串行 + 随机抖动，规避风控（§5.1） */
        await sleep(1500 + Math.random() * 1500);

        let detail = null;
        try {
          detail = await fetchNoteDetail(noteId, xsec);
        } catch (_) {
          detail = null;
        }

        /* 详情抓取失败（xsec_token 过期 302 登录页 / 风控）：
           清单信息仍入箱、标记 failed，不阻塞其余条目 */
        if (!detail) {
          ctx.store.addInboxEntry({
            note_id: noteId,
            captured_at: new Date().toISOString(),
            status: 'failed',
            raw: fallbackRaw(item),
            process: { stage: 'fetch_detail', error: '详情抓取失败（xsec_token 过期或风控）' }
          });
          console.log(`[capture/list] 详情抓取失败: ${noteId} 《${(item && item.title) || ''}》`);
          results.push({ note_id: noteId, status: 'failed', error: 'fetch_detail failed' });
          continue;
        }

        try {
          const { raw } = normalizeCapture({
            note_id: noteId,
            source_url: exploreUrl(noteId, xsec),
            xsec_token: xsec,
            note: detail.note,
            subtitle: detail.subtitle,
            comments: []
          });
          ctx.store.addInboxEntry({
            note_id: noteId,
            captured_at: new Date().toISOString(),
            status: 'pending',
            raw,
            process: null
          });
          console.log(`[capture/list] 入收件箱: ${noteId} 《${raw.title}》`);
          results.push({ note_id: noteId, status: 'inbox' });
        } catch (e) {
          results.push({ note_id: noteId, status: 'failed', error: e.message || 'normalize failed' });
        }
      }

      res.status(201).json({ results });
    } catch (err) {
      next(err);
    }
  });

  return router;
};

/** 详情抓取失败时的兜底 raw：保留清单信息 + xsec_token 溯源，供收件箱查看/删除/重采 */
function fallbackRaw(item) {
  const noteId = String(item.note_id || '');
  const xsec = String(item.xsec_token || '');
  const cover = String(item.cover || '');
  return {
    type: item.type === 'video' ? 'video' : 'normal',
    title: String(item.title || '').slice(0, 200) || '(正文抓取失败，待重试)',
    desc: '',
    author: String(item.author || '') || '匿名',
    liked_count: toInt(item.liked),
    cover_url: cover,
    image_urls: cover ? [cover] : [],
    video: { duration: 0, cover },
    subtitle_text: '',
    subtitle_lang: '',
    tags: [],
    comments: [],
    comments_truncated: false,
    source_url: exploreUrl(noteId, xsec),
    xsec_token: xsec
  };
}
