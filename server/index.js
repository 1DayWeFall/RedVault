'use strict';

/**
 * RedVault 服务入口
 * - 仅绑定回环地址（127.0.0.1），设计 §11 本地优先
 * - 静态托管 public/（前端）
 * - /api/* 统一 JSON 错误结构 { error: { code, message } }，设计 §5.2
 */

const path = require('path');
const fs = require('fs');
const express = require('express');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const PORT = Number(process.env.PORT || 3789);

/* ── 启动自检：目录创建（设计 §5.2） ── */
fs.mkdirSync(DATA_DIR, { recursive: true });

/* sharp 可用性检测（可选依赖，缺失降级，设计 §12） */
let sharpAvailable = false;
try {
  require.resolve('sharp');
  sharpAvailable = true;
} catch (_) { /* 未安装，走降级路径 */ }
if (!sharpAvailable) {
  console.warn('[RedVault] sharp 未安装：图片压缩/缩略图将降级（原图直发、无缩略图）');
}

/* ── 组装上下文（store / vault 注入路由，路径可配置） ── */
const { createStore } = require('./services/store');
const { createVault } = require('./services/vault');
const { createPipeline } = require('./services/pipeline');
const { createAi } = require('./services/ai');
const store = createStore(DATA_DIR);
const vault = createVault(path.join(ROOT, store.readConfig().vaultPath || 'vault'));
const ctx = { store, vault, sharpAvailable };
ctx.ai = createAi(ctx);
ctx.pipeline = createPipeline(ctx);

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false }));

/* ── API 路由 ── */
app.get('/api/health', (req, res) => {
  res.json({ ok: true, name: 'RedVault', version: '0.3.0', sharp: sharpAvailable });
});
app.use('/api', require('./routes/capture')(ctx));
app.use('/api', require('./routes/inbox')(ctx));
app.use('/api', require('./routes/notes')(ctx));
app.use('/api', require('./routes/settings')(ctx));
app.use('/api', require('./routes/synthesize')(ctx));
app.use('/api', require('./routes/attachments')(ctx));
app.use('/api', require('./routes/export')(ctx));

/* 未命中的 /api/* 统一 404 JSON（放在静态托管前） */
app.use('/api', (req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `接口不存在: ${req.method} ${req.originalUrl}` } });
});

/* ── 静态托管前端 ── */
app.use(express.static(path.join(ROOT, 'public')));

/* ── 统一错误处理（最后一个中间件） ── */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', req.method, req.originalUrl, '→', err.message || err);
  if (res.headersSent) return next(err);
  let status = err.status || 500;
  if (err.name === 'MulterError') status = 400; // 文件过大/类型错误等
  res.status(status).json({
    error: { code: err.code || 'INTERNAL', message: status >= 500 ? '服务器内部错误' : (err.message || '请求失败') }
  });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[RedVault] 服务已启动 → http://127.0.0.1:${PORT}`);
  console.log(`[RedVault] vault: ${vault.dir}`);
  console.log(`[RedVault] 油猴脚本上报 token: ${store.readConfig().capture.token}`);
});
