'use strict';

/**
 * 处理管线（DESIGN §5.5）
 * 逐条串行（并发 1），每条状态机：
 *   downloading_images → ai_processing → relating → writing
 * - 无 AI 配置时降级直落盘（摘要空/分类「未整理」），失败保留断点可续跑
 * - 图片下载带 Referer；sharp 可用则压缩 + 生成 300px 缩略图，缺失则原图直用
 * - 视觉模型一次合并调用（>6 张分批，后续批仅补 OCR）；纯文本/视频走文本槽位；
 *   vision 未配置时：ocr.enabled 且 tesseract.js 可用 → 本地 OCR 提取图中文字后
 *   走 text 槽整理（P1L，免 vision 费用）；否则回退 text（无 OCR），不再静默降级
 */

const fs = require('fs');
const path = require('path');
const { renderNoteMd, safeTitle } = require('./vault');
const { relatedNotes } = require('./relate');

const CATEGORIES = ['美食', '健康', '穿搭', '美妆', '家居', '旅行', '学习', '职场', '育儿', '科技', '理财', '运动', '其他'];

/* ── Prompt（DESIGN §9 P1/P2） ── */
const P1 = (title, desc, commentsTxt, subtitleTxt) => {
  const subBlock = subtitleTxt ? `\n视频字幕：\n${subtitleTxt}\n` : '';
  return `你是小红书内容整理助手。这是同一篇帖子的若干张图片与文本信息，请一次性完成整理：
1) ocr：逐图提取图中所有可见文字（无字则空字符串，按图顺序）
2) summary：≤200 字摘要
3) key_points：3–6 条可执行要点
4) category：一级分类（严格从这些中选：${CATEGORIES.join('/')}）
5) subcategory：细分场景（自由短语 ≤6 字）
6) tags：3–5 个短标签
7) comment_insights：高赞评论中的高价值补充（≤3 条，无则空数组）

标题：${title}
正文：${desc}${subBlock}
评论：${commentsTxt}

严格输出 JSON：{"ocr":[],"summary":"","key_points":[],"category":"","subcategory":"","tags":[],"comment_insights":[]}`;
};

const P2 = (title, desc, commentsTxt, subtitleTxt, kindOverride = '') => {
  // kindOverride：vision 未配置时图文笔记回退 text 整理的措辞（避免误称"视频笔记"）
  const kind = kindOverride || (subtitleTxt ? '视频笔记（含平台字幕，可基于字幕整理）' : '视频笔记（无字幕，视频未转写，内容基于简介与评论）');
  const note = !kindOverride && !subtitleTxt ? '（末尾注明「视频未转写，内容基于简介与评论」）' : '';
  const subBlock = subtitleTxt ? `\n视频字幕：\n${subtitleTxt}\n` : '';
  return `你是小红书内容整理助手。请对这篇帖子（${kind}）完成整理：
1) summary：≤200 字摘要${note}
2) key_points：3–6 条可执行要点
3) category：一级分类（严格从这些中选：${CATEGORIES.join('/')}）
4) subcategory：细分场景（自由短语 ≤6 字）
5) tags：3–5 个短标签
6) comment_insights：高赞评论中的高价值补充（≤3 条，无则空数组）

标题：${title}
正文：${desc}${subBlock}
评论：${commentsTxt}

严格输出 JSON：{"summary":"","key_points":[],"category":"","subcategory":"","tags":[],"comment_insights":[]}`;
};

/* sharp 可选加载（§12 缺失降级原图） */
let sharp = null;
try { sharp = require('sharp'); } catch (_) {}

/* tesseract.js 可选加载（本地 OCR）：缺失仅禁用本地 OCR 分支，不影响主流程 */
let tesseract = null;
try { tesseract = require('tesseract.js'); } catch (_) {}
let ocrWorker = null; // 模块级 worker 复用（创建成本高，语言数据缓存 data/ocr-cache）

/* P1L：本地 OCR + text 槽（免 vision 费用）。图中文字已由 Tesseract 提取，
   AI 只做摘要/要点/分类/标签（ocr 字段直接采用本地结果，AI 不再产出） */
const P1L = (title, desc, commentsTxt, subtitleTxt, ocrText) => {
  const subBlock = subtitleTxt ? `\n视频字幕：\n${subtitleTxt}\n` : '';
  return `你是小红书内容整理助手。这是同一篇帖子的文本信息与本地 OCR 提取的图中文字，请完成整理：
1) summary：≤200 字摘要（结合正文与图中文字）
2) key_points：3–6 条可执行要点
3) category：一级分类（严格从这些中选：${CATEGORIES.join('/')}）
4) subcategory：细分场景（自由短语 ≤6 字）
5) tags：3–5 个短标签
6) comment_insights：高赞评论中的高价值补充（≤3 条，无则空数组）

标题：${title}
正文：${desc}${subBlock}
图中文字（本地 OCR，可能存在识别误差）：
${ocrText}
评论：${commentsTxt}

严格输出 JSON：{"summary":"","key_points":[],"category":"","subcategory":"","tags":[],"comment_insights":[]}`;
};

/** 本地 OCR 结果 → prompt 文本：逐图编号，空图标注（无文字），超长截断 */
function buildOcrText(ocrArr) {
  return (ocrArr || []).map((t, i) => `【图${i + 1}】${String(t || '').trim() || '（无文字）'}`).join('\n').slice(0, 6000);
}

/** 本地 OCR（Tesseract）：逐图串行识别，复用模块级 worker。
 *  单图失败给空串不阻塞；worker 级失败抛错由调用方降级。 */
async function ocrImages(ctx, list, lang) {
  if (!tesseract) throw new Error('tesseract.js 未安装');
  if (!ocrWorker) {
    const cachePath = path.join(ctx.ROOT || process.cwd(), 'data', 'ocr-cache');
    fs.mkdirSync(cachePath, { recursive: true });
    ocrWorker = await tesseract.createWorker(lang || 'chi_sim+eng', 1, { cachePath, logger: () => {} });
  }
  const out = [];
  for (const l of list) {
    try {
      const { data } = await ocrWorker.recognize(l.abs);
      out.push(String(data?.text || '').replace(/\s+/g, ' ').trim());
    } catch (e) {
      console.warn(`[pipeline] OCR 单图失败，按无文字处理: ${e.message}`);
      out.push('');
    }
  }
  return out;
}

/** raw.comments → 评论精选 markdown（含楼中楼缩进） */
function renderCommentsMd(comments) {
  const line = (c, indent) => {
    const head = `${indent}- 「${c.content}」—— 赞 ${c.likes} @${c.author || '匿名'}`;
    const subs = (c.replies || []).map((r) => line(r, indent + '  ')).join('\n');
    return subs ? head + '\n' + subs : head;
  };
  return (comments || []).map((c) => line(c, '')).join('\n');
}

/** 正文区块：视频笔记无字幕且正文为空/纯话题标签时，追加降级说明（DESIGN §5.5 P2） */
function buildBody(raw) {
  let body = String(raw.desc || '');
  const hasSubtitle = String(raw.subtitle_text || '').trim().length > 0;
  if (raw.type === 'video' && !hasSubtitle) {
    const textOnly = body.replace(/#[^\s#]+#/g, '').replace(/\s+/g, '').trim();
    if (!textOnly) body = (body ? body + '\n\n' : '') + '> 视频未转写，正文以简介与图片为准';
  }
  return body || '（正文缺失）';
}

/** 下载图片存 attachments/{note_id}-{seq}.jpg；sharp 生成 thumb.webp（300px） */
async function downloadImages(raw, noteId, attachDir) {
  const urls = raw.image_urls || [];
  const local = [];
  const remote = [];
  let thumb = '';
  for (let i = 0; i < urls.length; i++) {
    try {
      const r = await fetch(urls[i], {
        headers: { Referer: 'https://www.xiaohongshu.com', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      const name = `${noteId}-${i + 1}.jpg`;
      fs.writeFileSync(path.join(attachDir, name), buf);
      local.push({ file: `attachments/${name}`, seq: i + 1, abs: path.join(attachDir, name) });
      if (!thumb && sharp) {
        try {
          await sharp(buf).rotate().resize({ width: 300, withoutEnlargement: true })
            .webp({ quality: 75 }).toFile(path.join(attachDir, `${noteId}-thumb.webp`));
          thumb = `attachments/${noteId}-thumb.webp`;
        } catch (e) {
          console.warn(`[pipeline] ${noteId} 缩略图生成失败（不影响入库）: ${e.message}`);
        }
      }
    } catch (e) {
      remote.push(urls[i]);
      console.warn(`[pipeline] 图片 ${i + 1} 下载失败: ${e.message}`);
    }
  }
  return { local, remote, thumb };
}

/** 图片 → 压缩后 base64 data URL（vision 用，sharp 缺失则原图） */
async function imageToBase64(abs) {
  let buf = fs.readFileSync(abs);
  let mime = 'image/jpeg';
  if (sharp) {
    try {
      buf = await sharp(buf).rotate().resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 }).toBuffer();
    } catch (e) {
      console.warn(`[pipeline] 图片压缩失败，改用原图: ${e.message}`);
    }
  }
  return `data:${mime};base64,` + buf.toString('base64');
}

/** AI 结果归一化（容错：字段缺失/越界给默认值）。hasSubtitle 为真时不再标注「未转写」 */
function normalizeAi(r, isVideo = false, hasSubtitle = false) {
  const out = {
    ocr: Array.isArray(r.ocr) ? r.ocr.map(String).filter(Boolean) : [],
    summary: String(r.summary || '').slice(0, 400),
    key_points: Array.isArray(r.key_points) ? r.key_points.map(String).filter(Boolean).slice(0, 8) : [],
    category: CATEGORIES.includes(r.category) ? r.category : '其他',
    subcategory: String(r.subcategory || '').slice(0, 12),
    tags: Array.isArray(r.tags) ? r.tags.map(String).filter(Boolean).slice(0, 6) : [],
    comment_insights: Array.isArray(r.comment_insights) ? r.comment_insights.map(String).filter(Boolean).slice(0, 3) : []
  };
  if (isVideo && !hasSubtitle && out.summary && !out.summary.includes('视频未转写')) {
    out.summary += '（视频未转写，内容基于简介与评论）';
  }
  return out;
}

/** AI 整理：有图且 vision 已配走 vision；vision 未配且本地 OCR 开启时
 *  本地提取图中文字后走 text 槽（P1L）；否则回退 text（无 OCR P2）；
 *  无图走 text。raw.commentsText 可直传已渲染评论文本（reprocess 用），优先于 raw.comments。
 *  deps.ocrFn 可注入 OCR 实现（测试用），默认 ocrImages。返回 null 表示未配置或失败，由调用方降级。 */
async function runAi(ctx, raw, imgs, deps = {}) {
  const commentsTxt = (raw.commentsText !== undefined
    ? String(raw.commentsText)
    : renderCommentsMd(raw.comments)
  ).slice(0, 3000);
  const isVideo = raw.type === 'video';
  const subtitleTxt = String(raw.subtitle_text || '').slice(0, 4000);
  const cfg = ctx.store.readConfig();
  const visionReady = !!cfg.ai?.vision?.apiKey;

  if (imgs.local.length && visionReady) {
    const first = imgs.local.slice(0, 6);
    const images = await Promise.all(first.map((l) => imageToBase64(l.abs)));
    const content = [
      { type: 'text', text: P1(raw.title, raw.desc, commentsTxt, subtitleTxt) },
      ...images.map((url) => ({ type: 'image_url', image_url: { url } }))
    ];
    let result = normalizeAi(await ctx.ai.chatJson('vision', [{ role: 'user', content }], { maxTokens: 3000 }), isVideo, !!subtitleTxt);
    // 剩余批次仅补 OCR（每批 6 张）
    for (let i = 6; i < imgs.local.length; i += 6) {
      const batch = imgs.local.slice(i, i + 6);
      const bImgs = await Promise.all(batch.map((l) => imageToBase64(l.abs)));
      const bContent = [
        { type: 'text', text: '这是同一篇帖子的后续图片，仅提取图中所有可见文字（无字返回空数组）。严格输出 JSON：{"ocr":[]}' },
        ...bImgs.map((url) => ({ type: 'image_url', image_url: { url } }))
      ];
      try {
        const r = await ctx.ai.chatJson('vision', [{ role: 'user', content: bContent }], { maxTokens: 2000 });
        if (Array.isArray(r.ocr)) result.ocr = result.ocr.concat(r.ocr.map(String));
      } catch (e) {
        console.warn(`[pipeline] 第 ${Math.floor(i / 6) + 1} 批图片 OCR 失败，不影响主结果: ${e.message}`);
      }
    }
    return result;
  }
  /* 本地 OCR 分支：有图、vision 未配、ocr.enabled → Tesseract 提取 + text 槽整理（P1L） */
  if (imgs.local.length && !visionReady && cfg.ocr?.enabled) {
    try {
      const ocrFn = deps.ocrFn || ocrImages;
      const ocr = await ocrFn(ctx, imgs.local, cfg.ocr.lang);
      const prompt = P1L(raw.title, raw.desc, commentsTxt, subtitleTxt, buildOcrText(ocr));
      const r = await ctx.ai.chatJson('text', [{ role: 'user', content: prompt }], { maxTokens: 2000 });
      console.log(`[pipeline] 《${raw.title}》本地 OCR 完成（${ocr.filter(Boolean).length}/${imgs.local.length} 图有文字），text 槽整理`);
      return { ...normalizeAi(r, isVideo, !!subtitleTxt), ocr: ocr.map(String).filter(Boolean) };
    } catch (e) {
      console.warn(`[pipeline] 本地 OCR 失败，回退 text 整理（无 OCR）: ${e.message}`);
    }
  }
  if (imgs.local.length) {
    console.warn('[pipeline] vision 槽位未配置，图文笔记回退 text 整理（无 OCR）');
  }
  const p2 = P2(raw.title, raw.desc, commentsTxt, subtitleTxt,
    imgs.local.length ? (isVideo ? '视频笔记（图片未识别，内容基于字幕/简介与评论）' : '图文笔记（图片未识别 OCR，内容基于正文与评论）') : '');
  const result = await ctx.ai.chatJson('text', [{ role: 'user', content: p2 }], { maxTokens: 2000 });
  return normalizeAi(result, isVideo, !!subtitleTxt);
}

function createPipeline(ctx) {
  const queue = [];
  /* 最近失败条目（M7）：失败项此前被 shift 出队列后前端进度条就看不到它了 */
  const failures = [];
  const FAILED_KEEP = 50;
  let running = false;

  async function confirm(ids) {
    const inbox = ctx.store.readInbox();
    for (const id of ids) {
      const entry = inbox.find((x) => x.note_id === id && x.status === 'pending');
      if (!entry) continue;
      ctx.store.updateInboxEntry(id, { status: 'processing', process: { stage: 'downloading_images', started_at: new Date().toISOString() } });
      queue.push({ note_id: id, stage: 'downloading_images', status: 'queued', error: null });
    }
    runNext();
  }

  async function runNext() {
    if (running) return;
    const item = queue.shift();
    if (!item) return;
    running = true;
    try {
      await processOne(item);
    } catch (err) {
      item.status = 'failed';
      item.error = err.message || String(err);
      ctx.store.updateInboxEntry(item.note_id, {
        status: 'failed',
        process: { stage: item.stage, error: item.error, finished_at: new Date().toISOString() }
      });
      console.error(`[pipeline] ${item.note_id} 失败于 ${item.stage}: ${item.error}`);
      failures.push({ note_id: item.note_id, stage: item.stage, error: item.error, at: new Date().toISOString() });
      if (failures.length > FAILED_KEEP) failures.shift();
    }
    running = false;
    if (queue.length) runNext();
  }

  async function processOne(item) {
    const entry = ctx.store.readInbox().find((x) => x.note_id === item.note_id);
    if (!entry) { item.status = 'skipped'; return; }
    const raw = entry.raw;
    item.status = 'processing';

    const cfg = ctx.store.readConfig();
    const aiReady = !!(cfg.ai?.text?.apiKey || cfg.ai?.vision?.apiKey);

    /* 1. downloading_images */
    item.stage = 'downloading_images';
    const imgs = raw.image_urls?.length
      ? await downloadImages(raw, entry.note_id, ctx.vault.attachDir)
      : { local: [], remote: [], thumb: '' };

    /* 2. ai_processing（失败降级直落盘，不阻塞） */
    let ai = null;
    if (aiReady && ctx.ai) {
      item.stage = 'ai_processing';
      try {
        ai = await runAi(ctx, raw, imgs);
      } catch (e) {
        console.warn(`[pipeline] ${item.note_id} AI 处理失败，降级直落盘: ${e.message}`);
        ai = null;
      }
    }

    /* 3. relating */
    item.stage = 'relating';
    const target = {
      note_id: entry.note_id, title: raw.title,
      category: ai?.category || '', subcategory: ai?.subcategory || '',
      tags: ai?.tags?.length ? ai.tags : raw.tags || []
    };
    const index = ctx.store.readIndex().notes;
    const related = relatedNotes(target, index);
    /* 正文双链按文件名（Obsidian 解析 [[文件名]]，note_id 仅存 frontmatter 供系统追踪） */
    const fileOf = new Map(index.map((n) => [n.note_id, n.file]));
    const relatedLinks = related.map((id) => fileOf.get(id)).filter(Boolean).map((f) => f.replace(/\.md$/, ''));

    /* 4. writing */
    item.stage = 'writing';
    const now = new Date().toISOString();
    const commentsBlock = [renderCommentsMd(raw.comments) || '（无）'];
    if (ai?.comment_insights?.length) {
      commentsBlock.push('\n**AI 洞察**\n' + ai.comment_insights.map((c) => `- ${c}`).join('\n'));
    }
    const subtitleText = String(raw.subtitle_text || '').trim();
    const hasSubtitle = subtitleText.length > 0;
    const fm = {
      title: raw.title, url: raw.source_url, note_id: entry.note_id,
      author: raw.author, author_id: raw.author_id || '', type: raw.type,
      category: ai?.category || '未整理', subcategory: ai?.subcategory || '',
      tags: ai?.tags?.length ? ai.tags : raw.tags || [],
      liked_count: raw.liked_count || 0,
      published_at: raw.published_at || '', collected_at: entry.captured_at,
      created_at: now,
      cover: imgs.thumb || raw.cover_url || '',
      images: imgs.local.map((l) => l.file),
      ...(imgs.remote.length ? { images_remote: imgs.remote } : {}),
      has_subtitle: hasSubtitle,
      ...(hasSubtitle ? { subtitle_lang: raw.subtitle_lang || '' } : {}),
      related, sources: [], attachments: []
    };
    const md = renderNoteMd({
      fm,
      summary: ai?.summary || '',
      points: ai?.key_points || [],
      body: buildBody(raw),
      ocr: ai?.ocr || [],
      subtitle: hasSubtitle ? subtitleText : '',
      comments: commentsBlock.join('\n'),
      related: relatedLinks, attachments: '', remark: ''
    });
    const file = ctx.vault.writeNoteFile(safeTitle(raw.title), md);
    ctx.store.upsertIndexNote({
      note_id: entry.note_id, file, title: raw.title,
      category: fm.category, subcategory: fm.subcategory, tags: fm.tags, type: raw.type,
      published_at: raw.published_at || '', collected_at: entry.captured_at,
      created_at: now, modified_at: now,
      cover: fm.cover, liked_count: raw.liked_count || 0,
      has_attachment: false, related, sources: []
    });
    ctx.store.removeInboxEntry(entry.note_id);
    item.status = 'done';
    console.log(`[pipeline] done: ${entry.note_id} 《${raw.title}》 → ${file} (AI:${ai ? 'yes' : 'no'})`);
  }

  function status() {
    const usage = ctx.ai?.usage() || {};
    return {
      queue: queue.map((q) => ({ ...q })),
      failed: failures.slice(-10),
      failedTotal: failures.length,
      sessionCost: Math.round(usage.cost * 10000) / 10000,
      tokens: { in: usage.totalIn || 0, out: usage.totalOut || 0 }
    };
  }

  return { confirm, status };
}

module.exports = {
  createPipeline, runAi, ocrImages, buildOcrText, P1L,
  renderCommentsMd, CATEGORIES
};
