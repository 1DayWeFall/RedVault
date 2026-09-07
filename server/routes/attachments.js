'use strict';

/**
 * 附件路由（DESIGN §5.9 / §6）
 * 上传（multer 内存 + 白名单 + 20MB）→ 解析（md/txt/pdf/图片视觉）→ AI 合并（P3）→ 移除
 */

const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { readSection } = require('../services/vault');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const ALLOWED_EXT = new Set(['.md', '.txt', '.jpg', '.jpeg', '.png', '.webp', '.pdf']);
const IMG_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const safePart = (s) => String(s || '').replace(/[\\/:*?"<>|#^[\]\r\n\t]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80);

let sharp = null; try { sharp = require('sharp'); } catch (_) {}

async function imageToBase64(abs) {
  let buf = fs.readFileSync(abs);
  if (sharp) {
    try { buf = await sharp(buf).rotate().resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer(); } catch (_) {}
  }
  return 'data:image/jpeg;base64,' + buf.toString('base64');
}

/** 附件 → 文本（供 AI 合并用） */
async function extractText(ctx, abs, ext) {
  if (ext === '.md' || ext === '.txt') {
    const buf = fs.readFileSync(abs);
    let txt = buf.toString('utf8');
    if (txt.includes('\ufffd')) { try { txt = buf.toString('gbk'); } catch (_) {} }
    return txt.slice(0, 8000);
  }
  if (ext === '.pdf') {
    const pdf = require('pdf-parse');
    const data = await pdf(fs.readFileSync(abs));
    return String(data.text || '').slice(0, 8000);
  }
  if (IMG_EXT.has(ext)) {
    const b64 = await imageToBase64(abs);
    const r = await ctx.ai.chatJson('vision', [{ role: 'user', content: [
      { type: 'text', text: '提取这张图片中的关键信息要点，输出 JSON：{"text":"..."}' },
      { type: 'image_url', image_url: { url: b64 } }
    ] }], { maxTokens: 1000 });
    return String(r.text || '').slice(0, 4000);
  }
  return '';
}

const P3 = (summary, points, attText, attName) => `你是小红书知识库整理助手。下面是原帖已整理的「AI 摘要 + 关键要点」与一份用户上传的补充材料，请完成：
1) summary：结合附件信息，微调原摘要（≤220 字）
2) block：生成该材料的补充区块 markdown，含三小节：「要点」「关联」（与原帖的关系）「补充/矛盾」（新增或冲突信息）

原摘要：${summary}
原要点：${points}
附件《${attName}》文本：
${attText}

严格输出 JSON：{"summary":"","block":"### 📎 补充材料：${attName}\\n..."}`;

module.exports = function attachmentsRoutes(ctx) {
  const router = express.Router();

  /* 上传 */
  router.post('/notes/:id/attachments', upload.single('file'), (req, res, next) => {
    try {
      const meta = ctx.store.readIndex().notes.find((n) => n.note_id === req.params.id);
      if (!meta) throw { status: 404, code: 'NOT_FOUND', message: '笔记不存在' };
      const file = req.file;
      if (!file) throw { status: 400, code: 'NO_FILE', message: '缺少文件' };
      const ext = path.extname(file.originalname).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) throw { status: 400, code: 'BAD_TYPE', message: '仅支持 md/txt/jpg/png/webp/pdf' };

      const fid = 'att' + Date.now();
      const name = `${meta.note_id}-${fid}-${safePart(file.originalname)}`;
      fs.writeFileSync(path.join(ctx.vault.attachDir, name), file.buffer);

      const { fm } = ctx.vault.readNoteFile(meta.file);
      const atts = Array.isArray(fm.attachments) ? fm.attachments : [];
      const att = { id: fid, name: file.originalname, ext, size: file.size, file: name, merged: false };
      atts.push(att);
      ctx.vault.updateNoteFile(meta.file, { attachments: atts }, {});
      ctx.store.upsertIndexNote({ note_id: meta.note_id, has_attachment: true });
      res.status(201).json({ attachment: att });
    } catch (e) { next(e); }
  });

  /* 列表 */
  router.get('/notes/:id/attachments', (req, res, next) => {
    try {
      const meta = ctx.store.readIndex().notes.find((n) => n.note_id === req.params.id);
      if (!meta) throw { status: 404, code: 'NOT_FOUND', message: '笔记不存在' };
      const { fm } = ctx.vault.readNoteFile(meta.file);
      res.json(Array.isArray(fm.attachments) ? fm.attachments : []);
    } catch (e) { next(e); }
  });

  /* AI 合并 */
  router.post('/notes/:id/attachments/:fid/merge', async (req, res, next) => {
    try {
      const meta = ctx.store.readIndex().notes.find((n) => n.note_id === req.params.id);
      if (!meta) throw { status: 404, code: 'NOT_FOUND', message: '笔记不存在' };
      const { fm, content } = ctx.vault.readNoteFile(meta.file);
      const atts = Array.isArray(fm.attachments) ? fm.attachments : [];
      const att = atts.find((a) => a.id === req.params.fid);
      if (!att) throw { status: 404, code: 'ATT_NOT_FOUND', message: '附件不存在' };

      const abs = path.join(ctx.vault.attachDir, att.file);
      const attText = await extractText(ctx, abs, att.ext);
      const summary = readSection(content, 'summary') || '';
      const points = readSection(content, 'points') || '';

      const r = await ctx.ai.chatJson('text', [{ role: 'user', content: P3(summary, points, attText, att.name) }], { maxTokens: 2500 });

      const oldAtt = readSection(content, 'attachments') || '';
      const oldAttMd = (!oldAtt || oldAtt === '（空）') ? '' : oldAtt + '\n\n';
      const newAtt = oldAttMd + String(r.block || '');
      ctx.vault.updateNoteFile(meta.file, {}, {
        summary: String(r.summary || summary).slice(0, 500),
        attachments: newAtt
      });
      const nextAtts = atts.map((a) => (a.id === att.id ? { ...a, merged: true } : a));
      ctx.vault.updateNoteFile(meta.file, { attachments: nextAtts }, {});
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  /* 移除 */
  router.delete('/notes/:id/attachments/:fid', (req, res, next) => {
    try {
      const meta = ctx.store.readIndex().notes.find((n) => n.note_id === req.params.id);
      if (!meta) throw { status: 404, code: 'NOT_FOUND', message: '笔记不存在' };
      const { fm } = ctx.vault.readNoteFile(meta.file);
      const atts = Array.isArray(fm.attachments) ? fm.attachments : [];
      const att = atts.find((a) => a.id === req.params.fid);
      if (!att) throw { status: 404, code: 'ATT_NOT_FOUND', message: '附件不存在' };
      try { fs.unlinkSync(path.join(ctx.vault.attachDir, att.file)); } catch (_) {}
      const nextAtts = atts.filter((a) => a.id !== att.id);
      ctx.vault.updateNoteFile(meta.file, { attachments: nextAtts }, {});
      ctx.store.upsertIndexNote({ note_id: meta.note_id, has_attachment: nextAtts.length > 0 });
      res.status(204).end();
    } catch (e) { next(e); }
  });

  return router;
};
