'use strict';

/**
 * 设置路由（DESIGN §6）：读写配置（apiKey 脱敏）+ 测试连接
 * GET  /settings       → 配置（apiKey 掩码 sk-***abc，永不回明文）
 * PUT  /settings       → 写配置（掩码值回传时保留原 key）
 * POST /settings/test  → {slot} 发最小消息测连通
 */

const express = require('express');
const crypto = require('crypto');

const SLOTS = ['text', 'vision'];

function maskKey(k) {
  if (!k) return '';
  if (k.length <= 8) return '****';
  return k.slice(0, 3) + '***' + k.slice(-4);
}

module.exports = function settingsRoutes(ctx) {
  const router = express.Router();

  router.get('/settings', (req, res) => {
    const cfg = ctx.store.readConfig();
    res.json({
      ai: {
        text: { ...cfg.ai.text, apiKey: maskKey(cfg.ai.text.apiKey) },
        vision: { ...cfg.ai.vision, apiKey: maskKey(cfg.ai.vision.apiKey) }
      },
      capture: { commentCount: cfg.capture.commentCount, token: maskKey(cfg.capture.token) },
      vaultPath: cfg.vaultPath
    });
  });

  router.put('/settings', (req, res, next) => {
    try {
      const body = req.body || {};
      const cfg = ctx.store.readConfig();
      if (body.ai) {
        for (const slot of SLOTS) {
          const s = body.ai[slot];
          if (!s) continue;
          // apiKey 为空或含掩码（***）视为未修改，保留原值
          if (s.apiKey !== undefined && s.apiKey !== '' && !s.apiKey.includes('***')) {
            cfg.ai[slot].apiKey = String(s.apiKey).trim();
          }
          if (s.baseUrl !== undefined) cfg.ai[slot].baseUrl = String(s.baseUrl).trim();
          if (s.model !== undefined) cfg.ai[slot].model = String(s.model).trim();
          if (s.priceIn !== undefined) cfg.ai[slot].priceIn = Number(s.priceIn) || 0;
          if (s.priceOut !== undefined) cfg.ai[slot].priceOut = Number(s.priceOut) || 0;
        }
      }
      if (body.capture?.commentCount !== undefined) {
        cfg.capture.commentCount = Math.max(1, Math.min(100, Number(body.capture.commentCount) || 20));
      }
      if (body.capture?.resetToken === true) {
        cfg.capture.token = 'rv_' + crypto.randomBytes(12).toString('hex');
      }
      if (body.vaultPath) cfg.vaultPath = String(body.vaultPath).trim();
      ctx.store.saveConfig(cfg);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  router.post('/settings/test', async (req, res, next) => {
    try {
      const slot = req.body?.slot;
      if (!SLOTS.includes(slot)) throw { status: 400, code: 'BAD_SLOT', message: 'slot 须为 text 或 vision' };
      const r = await ctx.ai.test(slot);
      res.json(r);
    } catch (e) { next(e); }
  });

  return router;
};
