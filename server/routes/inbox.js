'use strict';

/** 收件箱路由（DESIGN §6）：列表裁剪 / 预览 / 删除 / 清空 / 确认处理 / 管线进度 */

const express = require('express');
const { httpError, toHttpError } = require('../lib/http-error');

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
      if (!entry) throw httpError(404, 'NOT_FOUND', '收件箱无此条目');
      res.json(entry);
    } catch (e) { next(toHttpError(e)); }
  });

  router.delete('/inbox/:id', (req, res, next) => {
    try {
      if (!ctx.store.removeInboxEntry(req.params.id)) {
        throw httpError(404, 'NOT_FOUND', '收件箱无此条目');
      }
      res.status(204).end();
    } catch (e) { next(toHttpError(e)); }
  });

  /* 批量清空/删除：
     - 无参 → 清空全部 pending（旧语义，兼容）
     - ?scope=failed → 清空全部失败条目（详情抓取失败；重扫收藏夹可自动重采修复）
     - ?ids=a,b,c → 删除指定条目，不存在的 id 静默忽略 */
  router.delete('/inbox', (req, res) => {
    const { scope, ids } = req.query;
    let target;
    if (ids !== undefined) {
      target = String(ids).split(',').filter(Boolean);
    } else {
      const status = scope === 'failed' ? 'failed' : 'pending';
      target = ctx.store.readInbox().filter((x) => x.status === status).map((x) => x.note_id);
    }
    const removed = ctx.store.removeInboxEntries(target);
    res.json({ removed });
  });

  /* 确认处理 → 202 后台管线（§5.5） */
  router.post('/inbox/confirm', (req, res, next) => {
    try {
      const ids = req.body?.ids;
      if (!Array.isArray(ids) || ids.length === 0 || ids.some((i) => typeof i !== 'string')) {
        throw httpError(400, 'BAD_IDS', 'ids 须为非空字符串数组');
      }
      ctx.pipeline.confirm(ids);
      res.status(202).json({ accepted: ids.length });
    } catch (e) { next(toHttpError(e)); }
  });

  router.get('/pipeline/status', (req, res) => {
    res.json(ctx.pipeline.status());
  });

  return router;
};
