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
const VERSION = require('../package.json').version;

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
const { createVault, reconcileIndex } = require('./services/vault');
const { createPipeline } = require('./services/pipeline');
const { createAi } = require('./services/ai');
const { createOriginGuard } = require('./lib/origin-guard');
const { toHttpError } = require('./lib/http-error');
const { createRateLimit, RATE_PRESETS } = require('./lib/ratelimit');
const store = createStore(DATA_DIR);
// path.resolve：vaultPath 支持盘符绝对路径（如 F:\Work），path.join 会拼出非法路径导致启动崩溃
const vault = createVault(path.resolve(ROOT, store.readConfig().vaultPath || 'vault'));
const ctx = { store, vault, sharpAvailable, ROOT };
ctx.ai = createAi(ctx);
ctx.pipeline = createPipeline(ctx);

/* ── 启动自检：index ↔ vault 一致性（DESIGN §5.3 欠账，此前只在改路径时重建） ── */
try {
  reconcileIndex({ store, vault });
} catch (e) {
  console.warn('[RedVault] index 自检跳过（不影响启动）:', e.message);
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '5mb' }));

/* 安全中间件（M7）：回环同源校验 —— 挡住恶意网页对 /api/* 的跨站写请求。
   /api/capture 豁免：它已有 X-Capture-Token 鉴权，且油猴脚本的 Origin 不可控。
   移除 express.urlencoded：前端从不使用表单编码，它是跨站表单的唯一入口 */
app.use(createOriginGuard({ port: PORT, except: ['/api/capture'] }));

/* 按端点限流（M7）：防误触放大对小红书的请求与 AI 费用 */
app.use('/api/capture/list', createRateLimit(RATE_PRESETS['capture/list']));
app.use('/api/settings/test', createRateLimit(RATE_PRESETS['settings/test']));
app.use('/api/notes/:id/reprocess', createRateLimit(RATE_PRESETS.reprocess));
app.use('/api/notes/:id/link-status', createRateLimit(RATE_PRESETS['link-status']));

/* ── API 路由 ── */
app.get('/api/health', (req, res) => {
  res.json({ ok: true, name: 'RedVault', version: VERSION, sharp: sharpAvailable });
});
app.use('/api', require('./routes/capture')(ctx));
app.use('/api', require('./routes/inbox')(ctx));
app.use('/api', require('./routes/notes')(ctx));
app.use('/api', require('./routes/board')(ctx));
app.use('/api', require('./routes/settings')(ctx));
app.use('/api', require('./routes/synthesize')(ctx));
app.use('/api', require('./routes/attachments')(ctx));
app.use('/api', require('./routes/export')(ctx));

/* 未命中的 /api/* 统一 404 JSON（放在静态托管前） */
app.use('/api', (req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `接口不存在: ${req.method} ${req.originalUrl}` } });
});

/* ── vault 附件动态托管（卡片缩略图/图片用）：目录变更时才重建中间件（此前每次请求都新建） ── */
let attachStatic = express.static(ctx.vault.attachDir);
let attachStaticDir = ctx.vault.attachDir;
app.use('/vault-files', (req, res, next) => {
  if (ctx.vault.attachDir !== attachStaticDir) {
    attachStaticDir = ctx.vault.attachDir;
    attachStatic = express.static(attachStaticDir);
  }
  attachStatic(req, res, next);
});

/* ── 静态托管前端 ── */
app.use(express.static(path.join(ROOT, 'public')));

/* ── 统一错误处理（最后一个中间件） ── */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  /* 兜底分类：文件系统错误 → 400 可读码，未分类异常 → 500 INTERNAL；Multer 错误固定 400 */
  const isMulter = err.name === 'MulterError';
  const e = isMulter ? err : toHttpError(err);
  const status = isMulter ? 400 : e.status;
  console.error('[error]', req.method, req.originalUrl, '→', e.message || err);
  if (res.headersSent) return next(err);
  res.status(status).json({
    error: { code: e.code || 'INTERNAL', message: e.message || (status >= 500 ? '服务器内部错误' : '请求失败') }
  });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[RedVault] v${VERSION} 服务已启动 → http://127.0.0.1:${PORT}`);
  console.log(`[RedVault] vault: ${vault.dir}`);
  // M7：token 不再打印到控制台/日志，需复制时到设置页点「显示」
  console.log('[RedVault] 油猴脚本上报 token：设置页 → 采集 token → 显示');
});
