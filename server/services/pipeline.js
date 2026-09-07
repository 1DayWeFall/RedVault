'use strict';

/**
 * 处理管线（DESIGN §5.5）
 * M3 最小版：无 AI 配置时 raw 直接落盘（摘要空/分类「未整理」），验证数据流；
 * M4 在 ai_processing 阶段接入双槽位模型（本文件预留 stage 常量与断点结构）。
 * 逐条串行（并发 1），失败保留断点可续跑。
 */

const { renderNoteMd, safeTitle } = require('./vault');

const STAGES = ['downloading_images', 'ai_processing', 'relating', 'writing'];

/** raw.comments → 评论精选 markdown（含楼中楼缩进） */
function renderCommentsMd(comments) {
  const line = (c, indent) => {
    const head = `${indent}- 「${c.content}」—— 赞 ${c.likes} @${c.author || '匿名'}`;
    const subs = (c.replies || []).map((r) => line(r, indent + '  ')).join('\n');
    return subs ? head + '\n' + subs : head;
  };
  return (comments || []).map((c) => line(c, '')).join('\n');
}

function createPipeline(ctx) {
  const queue = [];        // { note_id, stage, status, error }
  let running = false;
  let sessionCost = 0;     // AI token 成本累计（M4 起计数）

  async function confirm(ids) {
    const inbox = ctx.store.readInbox();
    for (const id of ids) {
      const entry = inbox.find((x) => x.note_id === id && x.status === 'pending');
      if (!entry) continue;
      ctx.store.updateInboxEntry(id, { status: 'processing', process: { stage: 'writing', started_at: new Date().toISOString() } });
      queue.push({ note_id: id, stage: 'writing', status: 'queued', error: null });
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
    }
    running = false;
    if (queue.length) runNext();
  }

  /** 单条处理：M3 = writing 直落盘；M4 在此插入图片下载/AI/relate */
  async function processOne(item) {
    const entry = ctx.store.readInbox().find((x) => x.note_id === item.note_id);
    if (!entry) { item.status = 'skipped'; return; }
    const raw = entry.raw;
    item.status = 'processing';

    /* ── writing ── */
    item.stage = 'writing';
    const now = new Date().toISOString();
    const fm = {
      title: raw.title,
      url: raw.source_url,
      note_id: entry.note_id,
      author: raw.author,
      author_id: raw.author_id || '',
      type: raw.type,
      category: '未整理',
      subcategory: '',
      tags: raw.tags || [],
      liked_count: raw.liked_count || 0,
      published_at: raw.published_at || '',
      collected_at: entry.captured_at,
      created_at: now,
      cover: raw.cover_url || '',           // M4 起指向本地缩略图
      images: [],
      ...(raw.image_urls?.length ? { images_remote: raw.image_urls } : {}),
      related: [],
      sources: [],
      attachments: []
    };
    const md = renderNoteMd({
      fm,
      summary: '',                                        // M4 AI 填充
      points: [],
      body: raw.desc || '（正文缺失）',
      ocr: [],
      comments: renderCommentsMd(raw.comments) || '（无）',
      related: [],
      attachments: '',
      remark: ''
    });
    const file = ctx.vault.writeNoteFile(safeTitle(raw.title), md);
    ctx.store.upsertIndexNote({
      note_id: entry.note_id, file, title: raw.title,
      category: '未整理', subcategory: '', tags: raw.tags || [], type: raw.type,
      published_at: raw.published_at || '', collected_at: entry.captured_at,
      created_at: now, modified_at: now,
      cover: raw.cover_url || '', liked_count: raw.liked_count || 0,
      has_attachment: false, related: [], sources: []
    });
    ctx.store.removeInboxEntry(entry.note_id);
    item.status = 'done';
    console.log(`[pipeline] done: ${entry.note_id} 《${raw.title}》 → ${file}`);
  }

  function status() {
    return {
      queue: queue.map((q) => ({ ...q })),
      sessionCost: Math.round(sessionCost * 1000) / 1000
    };
  }

  return { confirm, status, addCost: (c) => { sessionCost += c; } };
}

module.exports = { createPipeline, STAGES, renderCommentsMd };
