'use strict';

/** 主题合成路由（DESIGN §6 POST /synthesize） */

const express = require('express');
const { synthesize } = require('../services/synthesize');
const { httpError, toHttpError } = require('../lib/http-error');

module.exports = function synthesizeRoutes(ctx) {
  const router = express.Router();

  router.post('/synthesize', async (req, res, next) => {
    try {
      const { noteIds, theme } = req.body || {};
      if (!Array.isArray(noteIds) || noteIds.length < 2) {
        throw httpError(400, 'NEED_MORE', '至少选择 2 篇笔记进行合成');
      }
      const r = await synthesize(ctx, { noteIds, theme: String(theme || '').trim() });
      res.status(201).json(r);
    } catch (e) { next(toHttpError(e)); }
  });

  return router;
};
