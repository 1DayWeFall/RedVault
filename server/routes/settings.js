'use strict';

/**
 * 设置路由（DESIGN §6）：读写配置（apiKey 脱敏）+ 测试连接
 * GET  /settings            → 配置（apiKey 掩码 sk-***abc；capture token 掩码，永不回明文）
 * PUT  /settings            → 写配置（掩码值回传时保留原 key）
 * POST /settings/test       → {slot} 发最小消息测连通
 * POST /settings/token/reveal → 显式揭示 capture token（M7：GET 不再明文返回）
 * POST /settings/token/rotate → 轮换 capture token
 */

const fs = require('fs');
const path = require('path');
const express = require('express');
const crypto = require('crypto');
const { migrateVault } = require('../services/vault');
const { httpError, toHttpError } = require('../lib/http-error');

const SLOTS = ['text', 'vision'];

function maskKey(k) {
  if (!k) return '';
  if (k.length <= 8) return '****';
  return k.slice(0, 3) + '***' + k.slice(-4);
}

module.exports = function settingsRoutes(ctx) {
  const router = express.Router();

  /* 油猴脚本全文（设置页「脚本安装指引」复制/下载用） */
  router.get('/userscript', (req, res, next) => {
    try {
      const file = path.join(__dirname, '..', '..', 'userscript', 'xhs_capture.user.js');
      const content = fs.readFileSync(file, 'utf-8');
      res.json({ name: 'xhs_capture.user.js', content });
    } catch (e) {
      if (e.code === 'ENOENT') throw httpError(404, 'NOT_FOUND', '脚本文件不存在');
      next(toHttpError(e));
    }
  });

  router.get('/settings', (req, res) => {
    const cfg = ctx.store.readConfig();
    res.json({
      ai: {
        // apiKey 返回空：避免前端回填脱敏值造成「误存掩码」，语义统一为「空 = 不修改」
        text: { ...cfg.ai.text, apiKey: '' },
        vision: { ...cfg.ai.vision, apiKey: '' }
      },
      ocr: cfg.ocr,
      rag: cfg.rag,
      review: cfg.review,
      // M7：token 只回掩码（此前明文返回，任何能访问本机的网页脚本都可读）；
      // 需要复制时点「显示」→ POST /settings/token/reveal
      capture: { tokenMasked: maskKey(cfg.capture.token) },
      vaultPath: cfg.vaultPath
    });
  });

  /* 揭示 capture token：显式动作才返回明文 */
  router.post('/settings/token/reveal', (req, res, next) => {
    try {
      res.json({ token: ctx.store.readConfig().capture.token });
    } catch (e) { next(toHttpError(e)); }
  });

  /* 轮换 capture token：旧脚本需重新填写 */
  router.post('/settings/token/rotate', (req, res, next) => {
    try {
      const cfg = ctx.store.readConfig();
      cfg.capture.token = 'rv_' + crypto.randomBytes(12).toString('hex');
      ctx.store.saveConfig(cfg);
      res.json({ token: cfg.capture.token });
    } catch (e) { next(toHttpError(e)); }
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
      if (body.rag) {
        if (body.rag.provider !== undefined) cfg.rag.provider = String(body.rag.provider).trim() || 'auto';
        if (body.rag.allowRemoteEmbed !== undefined) cfg.rag.allowRemoteEmbed = !!body.rag.allowRemoteEmbed;
        if (body.rag.topK !== undefined) cfg.rag.topK = Math.max(1, Math.min(20, Number(body.rag.topK) || 6));
        if (body.rag.rerank !== undefined) cfg.rag.rerank = !!body.rag.rerank;
      }
      if (body.review) {
        if (body.review.recentDays !== undefined) cfg.review.recentDays = Math.max(1, Math.min(90, Number(body.review.recentDays) || 14));
        if (body.review.randomSize !== undefined) cfg.review.randomSize = Math.max(1, Math.min(12, Number(body.review.randomSize) || 3));
      }
      if (body.ocr) {
        if (body.ocr.enabled !== undefined) cfg.ocr.enabled = !!body.ocr.enabled;
        if (body.ocr.lang !== undefined) cfg.ocr.lang = String(body.ocr.lang).trim() || 'chi_sim+eng';
      }
      if (body.capture?.resetToken === true) {
        cfg.capture.token = 'rv_' + crypto.randomBytes(12).toString('hex');
      }

      /* vault 路径变更：校验 → 迁移 → 热切换 → 重建 index（改路径即时生效）。
       * 迁移失败不连坐：AI/capture 修改先独立落盘，再把迁移错误以 400 可读信息返回（fs 错误已在 vault.js 分类） */
      let vaultChanged = false;
      let vaultError = null;
      if (body.vaultPath !== undefined && body.vaultPath !== null) {
        const newPath = String(body.vaultPath).trim();
        if (newPath && newPath !== cfg.vaultPath) {
          // 路径合法性：拒绝包含 .. 穿越（防路径注入）
          if (newPath.includes('..')) {
            vaultError = { status: 400, code: 'BAD_VAULT_PATH', message: 'vault 路径不能包含 .. 穿越' };
          } else {
            // path.resolve：支持盘符绝对路径（如 F:\Work），path.join 会拼出非法路径
            const oldAbs = path.resolve(ctx.ROOT, cfg.vaultPath || 'vault');
            const newAbs = path.resolve(ctx.ROOT, newPath);
            try {
              migrateVault(oldAbs, newAbs);        // 迁移旧内容（fs 错误已分类为 400 可读）
              ctx.vault.setDir(newAbs);             // 热切换
              cfg.vaultPath = newPath;
              vaultChanged = true;
            } catch (e) {
              vaultError = toHttpError(e, { status: 400, code: 'MIGRATE_FAILED' });
            }
          }
        } else if (newPath) {
          cfg.vaultPath = newPath;
        }
      }

      /* AI/capture 先独立落盘（迁移失败时保留原 vaultPath，不连坐其他配置） */
      ctx.store.saveConfig(cfg);
      if (vaultChanged) {
        // 迁移/切换后按新 vault 扫描重建 index，保证前端列表一致
        ctx.store.saveIndex({ notes: ctx.vault.rebuildIndexMeta() });
      }
      if (vaultError) return next(toHttpError(vaultError));
      res.json({ ok: true, vaultChanged });
    } catch (e) { next(toHttpError(e)); }
  });

  router.post('/settings/test', async (req, res, next) => {
    try {
      const slot = req.body?.slot;
      if (!SLOTS.includes(slot)) throw httpError(400, 'BAD_SLOT', 'slot 须为 text 或 vision');
      const r = await ctx.ai.test(slot);
      res.json(r);
    } catch (e) { next(toHttpError(e)); }
  });

  return router;
};
