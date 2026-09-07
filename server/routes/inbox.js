'use strict';

/** 收件箱路由（DESIGN §6）：列表裁剪 / 预览 / 删除 / 清空 / 确认处理 / 管线进度 */

const express = require('express');

module.exports = function inboxRoutes(ctx) {
  const router = express.Router();

  /* 列表（desc 裁剪至 200 字，不发全文） */
  router.get('/inbox', (req, res) => {
    const items = ctx.store.readInbox().map((x) => ({
      note_id: x.note_id, captured_at: x.captured_at, status: x.status, process: x.process,
      raw: { ...x.raw, desc: String(x.raw.desc || '').slice(0, 200) }
    }));
    res.json(items);
  });

  router.get('/inbox/:id', (req, res, next) => {
    try {
      const entry = ctx.store.readInbox().find((x) => x.note_id === req.params.id);
      if (!entry) throw { status: 404, code: 'NOT_FOUND', message: '收件箱无此条目' };
      res.json(entry);
    } catch (e) { next(e); }
  });

  router.delete('/inbox/:id', (req, res, next) => {
    try {
      if (!ctx.store.removeInboxEntry(req.params.id)) {
        throw { status: 404, code: 'NOT_FOUND', message: '收件箱无此条目' };
      }
      res.status(204).end();
    } catch (e) { next(e); }
  });

  /* 一键清空 pending */
  router.delete('/inbox', (req, res) => {
    ctx.store.saveInbox(ctx.store.readInbox().filter((x) => x.status !== 'pending'));
    res.status(204).end();
  });

  /* 确认处理 → 202 后台管线（§5.5） */
  router.post('/inbox/confirm', (req, res, next) => {
    try {
      const ids = req.body?.ids;
      if (!Array.isArray(ids) || ids.length === 0 || ids.some((i) => typeof i !== 'string')) {
        throw { status: 400, code: 'BAD_IDS', message: 'ids 须为非空字符串数组' };
      }
      ctx.pipeline.confirm(ids);
      res.status(202).json({ accepted: ids.length });
    } catch (e) { next(e); }
  });

  router.get('/pipeline/status', (req, res) => {
    res.json(ctx.pipeline.status());
  });

  return router;
};
