'use strict';

/**
 * 采集上报路由（DESIGN §5.1 / §6）
 * - POST /api/capture       单条上报（旧入口，保留兼容）
 * - POST /api/capture/check 增量查询：油猴脚本上报前先问哪些 note_id 需要上报
 *                           （新增 + 收件箱 failed 重采候选），已入库/已入箱的跳过；
 *                           新格式 {items:[{note_id,xsec_token}]} 额外返回 stale：
 *                           已入库但清单 token 较新（溯源链接过期）需重报刷新
 * - POST /api/capture/list  收藏夹清单批量上报：油猴脚本只发清单（note_id + xsec_token），
 *                           服务端逐条用 xsec_token 抓详情页（限速 1.5~3s 随机抖动），
 *                           解析 __INITIAL_STATE__ 取正文/字幕/图片后判重入箱。
 *                           收件箱 failed 条目豁免判重：重扫带新 token 自动重采覆盖；
 *                           瞬时类失败（网络/风控/HTTP）自动补抓一次。
 * 鉴权 X-Capture-Token。
 */

const express = require('express');
const { normalizeCapture, toInt } = require('../lib/capture-normalize');
const { fetchNoteDetail, exploreUrl, sleep } = require('../services/fetch-note');
const { vaultTokenOf } = require('../lib/source-link');
const { httpError, toHttpError } = require('../lib/http-error');

module.exports = function captureRoutes(ctx) {
  const router = express.Router();

  router.post('/capture', (req, res, next) => {
    try {
      const token = req.get('X-Capture-Token');
      const cfg = ctx.store.readConfig();
      if (!cfg.capture?.token || token !== cfg.capture.token) {
        throw httpError(401, 'BAD_TOKEN', 'X-Capture-Token 缺失或不正确');
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
      next(toHttpError(err));
    }
  });

  /* ── 增量查询：油猴脚本上报前先问服务端，只上报新增与 failed 重采候选（判重口径同 /capture/list） ── */
  router.post('/capture/check', (req, res, next) => {
    try {
      const token = req.get('X-Capture-Token');
      const cfg = ctx.store.readConfig();
      if (!cfg.capture?.token || token !== cfg.capture.token) {
        throw httpError(401, 'BAD_TOKEN', 'X-Capture-Token 缺失或不正确');
      }

      /* 兼容两种格式：旧 {note_ids:[id]}（只算 fresh）；新 {items:[{note_id,xsec_token}]}
         （额外识别 stale：已入库但清单 token 较新 → 重报以刷新溯源链接）。两者均须非空 */
      const body = req.body || {};
      const legacy = Array.isArray(body.note_ids) && body.note_ids.length > 0
        ? body.note_ids.map((id) => ({ note_id: id })) : null;
      const items = (Array.isArray(body.items) && body.items.length > 0) ? body.items : legacy;
      if (!items) {
        throw httpError(400, 'BAD_PAYLOAD', 'note_ids/items 须为非空数组');
      }
      if (items.length > 1000) {
        throw httpError(413, 'TOO_MANY', '单次最多查询 1000 个 note_id');
      }

      const fresh = [];
      const stale = [];
      const seen = new Set();
      for (const it of items) {
        const id = String((it && it.note_id) || '').trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        if (classifyNote(ctx, id) !== 'known') { fresh.push(id); continue; }
        const incoming = String((it && it.xsec_token) || '').trim();
        const stored = vaultTokenOf(ctx, id);
        if (incoming && stored && stored.token !== incoming) stale.push(id);
      }
      res.json({ fresh, stale, total: seen.size, skipped: seen.size - fresh.length - stale.length });
    } catch (err) {
      next(toHttpError(err));
    }
  });

  /* ── 收藏夹清单批量上报：服务端负责详情抓取 ── */
  router.post('/capture/list', async (req, res, next) => {
    try {
      const token = req.get('X-Capture-Token');
      const cfg = ctx.store.readConfig();
      if (!cfg.capture?.token || token !== cfg.capture.token) {
        throw httpError(401, 'BAD_TOKEN', 'X-Capture-Token 缺失或不正确');
      }

      const notes = req.body && req.body.notes;
      if (!Array.isArray(notes) || notes.length === 0) {
        throw httpError(400, 'BAD_PAYLOAD', 'notes 须为非空数组');
      }
      if (notes.length > 20) {
        throw httpError(413, 'TOO_MANY', '单批最多 20 条，请分批上报');
      }

      const results = [];
      for (const item of notes) {
        const noteId = String((item && item.note_id) || '').trim();
        const xsec = String((item && item.xsec_token) || '').trim();
        if (!noteId || !xsec) {
          results.push({ note_id: noteId || '(缺失)', status: 'invalid', error: '缺少 note_id / xsec_token' });
          continue;
        }

        /* 判重口径见 classifyNote：known → 链接续期（token 变了只刷 frontmatter url 一行，
           不重抓详情/不动正文备注）；refeed → 豁免重采（新 token 重抓覆盖，重扫即愈） */
        const state = classifyNote(ctx, noteId);
        const refeed = state === 'refeed';
        if (state === 'known') {
          const stored = vaultTokenOf(ctx, noteId);
          if (stored && stored.token !== xsec) {
            try {
              ctx.vault.updateNoteFile(stored.file, { url: exploreUrl(noteId, xsec) });
              console.log(`[capture/list] 溯源链接已刷新: ${noteId}`);
              results.push({ note_id: noteId, status: 'refreshed' });
            } catch (e) {
              results.push({ note_id: noteId, status: 'duplicate', error: '链接刷新失败: ' + (e.message || e) });
            }
          } else {
            results.push({ note_id: noteId, status: 'duplicate' });
          }
          continue;
        }

        /* 限速：串行 + 随机抖动，规避风控（§5.1） */
        await sleep(1500 + Math.random() * 1500);

        let detail;
        try {
          detail = await fetchNoteDetail(noteId, xsec);
        } catch (e) {
          detail = { ok: false, reason: 'network', message: '抓取异常: ' + (e.message || e) };
        }
        /* 瞬时类失败自动补抓一次；token_expired 重试必败（旧 token），跳过 */
        if (!detail.ok && (detail.reason === 'network' || detail.reason === 'risk' || detail.reason.startsWith('http_'))) {
          await sleep(3000 + Math.random() * 2000);
          try {
            detail = await fetchNoteDetail(noteId, xsec);
          } catch (e) {
            detail = { ok: false, reason: 'network', message: '抓取异常: ' + (e.message || e) };
          }
        }

        /* 详情抓取失败：清单信息仍入箱、标记 failed（含分类原因），不阻塞其余条目；
           refeed 时覆盖旧 failed 条目（刷新原因与捕获时间） */
        if (!detail.ok) {
          ctx.store.upsertInboxEntry({
            note_id: noteId,
            captured_at: new Date().toISOString(),
            status: 'failed',
            raw: fallbackRaw(item),
            process: { stage: 'fetch_detail', error: detail.message, reason: detail.reason }
          });
          console.log(`[capture/list] 详情抓取失败${refeed ? '（重采）' : ''}: ${noteId} [${detail.reason}] 《${(item && item.title) || ''}》`);
          results.push({ note_id: noteId, status: 'failed', reason: detail.reason, error: detail.message });
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
          /* 新条目追加；refeed 重采成功 → 覆盖旧 failed 条目，转回待处理 */
          ctx.store.upsertInboxEntry({
            note_id: noteId,
            captured_at: new Date().toISOString(),
            status: 'pending',
            raw,
            process: null
          });
          console.log(`[capture/list] 入收件箱${refeed ? '（failed 重采修复）' : ''}: ${noteId} 《${raw.title}》`);
          results.push({ note_id: noteId, status: 'inbox', refeed: refeed || undefined });
        } catch (e) {
          results.push({ note_id: noteId, status: 'failed', error: e.message || 'normalize failed' });
        }
      }

      res.status(201).json({ results });
    } catch (err) {
      next(toHttpError(err));
    }
  });

  return router;
};

/** 判重公共口径（/capture/list 与 /capture/check 共用，单一事实源）：
 *  - 索引已有 → 'known'（已入库）
 *  - 收件箱已有非 failed 条目 → 'known'（已入箱）
 *  - 收件箱 failed → 'refeed'（豁免判重：上报后用新 xsec_token 重采覆盖）
 *  - 否则 → 'new' */
function classifyNote(ctx, noteId) {
  if (ctx.store.readIndex().notes.some((n) => n.note_id === noteId)) return 'known';
  const existing = ctx.store.readInbox().find((x) => x.note_id === noteId);
  if (!existing) return 'new';
  return existing.status === 'failed' ? 'refeed' : 'known';
}

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
