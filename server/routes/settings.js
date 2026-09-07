'use strict';

/**
 * 设置路由（DESIGN §6）：读写配置（apiKey 脱敏）+ 测试连接
 * GET  /settings       → 配置（apiKey 掩码 sk-***abc，永不回明文）
 * PUT  /settings       → 写配置（掩码值回传时保留原 key）
 * POST /settings/test  → {slot} 发最小消息测连通
 */

const fs = require('fs');
const path = require('path');
const express = require('express');
const crypto = require('crypto');
const { migrateVault } = require('../services/vault');

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
      if (e.code === 'ENOENT') throw { status: 404, code: 'NOT_FOUND', message: '脚本文件不存在' };
      next(e);
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
      // capture.token 返回明文：本地服务仅绑 127.0.0.1，供用户复制进油猴脚本
      capture: { commentCount: cfg.capture.commentCount, token: cfg.capture.token },
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

      /* vault 路径变更：校验 → 迁移 → 热切换 → 重建 index（改路径即时生效） */
      let vaultChanged = false;
      if (body.vaultPath !== undefined && body.vaultPath !== null) {
        const newPath = String(body.vaultPath).trim();
        if (newPath && newPath !== cfg.vaultPath) {
          // 路径合法性：拒绝包含 .. 穿越（防路径注入）
          if (newPath.includes('..')) {
            throw { status: 400, code: 'BAD_VAULT_PATH', message: 'vault 路径不能包含 .. 穿越' };
          }
          const oldAbs = path.join(ctx.ROOT, cfg.vaultPath || 'vault');
          const newAbs = path.resolve(ctx.ROOT, newPath);
          migrateVault(oldAbs, newAbs);          // 迁移旧内容（失败抛错，不保存 config）
          ctx.vault.setDir(newAbs);               // 热切换
          cfg.vaultPath = newPath;
          vaultChanged = true;
        } else if (newPath) {
          cfg.vaultPath = newPath;
        }
      }

      ctx.store.saveConfig(cfg);
      if (vaultChanged) {
        // 迁移/切换后按新 vault 扫描重建 index，保证前端列表一致
        const meta = ctx.vault.rebuildIndexMeta();
        ctx.store.saveIndex({ notes: meta });
      }
      res.json({ ok: true, vaultChanged });
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
