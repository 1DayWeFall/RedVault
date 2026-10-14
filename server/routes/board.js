'use strict';

const express = require('express');
const { readBoard } = require('../services/board');

module.exports = function boardRoutes(ctx) {
  const router = express.Router();
  router.get('/board', (req, res) => res.json(readBoard(ctx)));
  return router;
};
