'use strict';

/** 主题合成路由（DESIGN §6 POST /synthesize） */

const express = require('express');
const { synthesize } = require('../services/synthesize');

module.exports = function synthesizeRoutes(ctx) {
  const router = express.Router();

  router.post('/synthesize', async (req, res, next) => {
    try {
      const { noteIds, theme } = req.body || {};
      if (!Array.isArray(noteIds) || noteIds.length < 2) {
        throw { status: 400, code: 'NEED_MORE', message: '至少选择 2 篇笔记进行合成' };
      }
      const r = await synthesize(ctx, { noteIds, theme: String(theme || '').trim() });
      res.status(201).json(r);
    } catch (e) { next(e); }
  });

  return router;
};
