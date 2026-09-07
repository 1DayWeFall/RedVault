'use strict';

/**
 * POST /api/capture —— 油猴脚本上报入口（DESIGN §5.1 / §6）
 * 鉴权 X-Capture-Token；409 判重（inbox + index 双查）；201 入收件箱。
 */

const express = require('express');
const { normalizeCapture } = require('../lib/capture-normalize');

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

  return router;
};
