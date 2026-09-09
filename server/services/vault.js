'use strict';

/**
 * vault 引擎（DESIGN §5.6 / §7 / §8）
 * - 唯一真实源：所有笔记为 vault/ 下 .md 文件
 * - 锚点区块：配对 HTML 注释包裹，编辑只替换目标区块，其余内容永不动
 * - frontmatter 生成用 js-yaml（值安全转义），解析用 gray-matter
 * - index 与 vault 不一致时以 vault 扫描重建（§5.3）
 */

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const yaml = require('js-yaml');
const { httpError } = require('../lib/http-error');

/* ── 区块定义（顺序固定，§8 模板） ── */
const SECTIONS = {
  summary:    '## 🧠 AI 摘要',
  points:     '## 🔑 关键要点',
  body:       '## 📄 原帖正文',
  ocr:        '## 🖼 图片文字识别',
  subtitle:   '## 🎬 视频字幕',
  comments:   '## 💬 评论精选',
  related:    '## 🔗 相关笔记',
  attachments:'## 📎 补充材料',
  remark:     '## ✏️ 我的备注'
};
const SYNTH_SECTIONS = {
  overview: '## 🧭 主题概述',
  common:   '## 🟢 共同要点',
  diff:     '## 🟡 分歧与互补观点',
  todo:     '## ✅ 可执行清单',
  sources:  '## 📚 来源'
};

const wrap = (key, content) => `<!-- sec:${key} -->\n${String(content ?? '').trim()}\n<!-- /sec:${key} -->`;
const section = (key, content) => `${SECTIONS[key]}\n\n${wrap(key, content)}\n\n`;

/** 文件名清洗：非法字符 → 空格，压缩空白，截断 50（§5.6） */
function safeTitle(title) {
  return String(title || '未命名')
    .replace(/[\\/:*?"<>|#^[\]\n\r\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50) || '未命名';
}

/** 重名去重：title.md → title-2.md → title-3.md … */
function uniqueFileName(vaultDir, base, ext = '.md') {
  let name = base + ext;
  let i = 2;
  while (fs.existsSync(path.join(vaultDir, name))) {
    name = `${base}-${i}${ext}`;
    i++;
  }
  return name;
}

/* ── frontmatter ── */
function buildFrontmatter(fm) {
  return '---\n' + yaml.dump(fm, { lineWidth: -1, noRefs: true, sortKeys: false }).trim() + '\n---';
}

/** frontmatter 值中出现换行/特殊字符时的 yaml 安全性由 js-dump 保证；标题额外做文件名清洗 */

/* ── 普通笔记渲染（§8） ── */
function renderNoteMd({ fm, summary, points, body, ocr, subtitle, comments, related, attachments, remark }) {
  let md = buildFrontmatter(fm) + '\n\n';
  md += section('summary', summary || '（待 AI 整理）');
  md += section('points', (points || []).map((k) => `- ${k}`).join('\n') || '（待 AI 整理）');
  md += section('body', body || '（原帖正文缺失）');
  md += section('ocr', (ocr || []).map((o) => `- ${o}`).join('\n') || '（无）');
  if (subtitle) md += section('subtitle', subtitle);
  md += section('comments', comments || '（无）');
  md += section('related', (related || []).map((r) => `- [[${r}]]`).join('\n') || '（暂无）');
  md += section('attachments', attachments || '（空）');
  md += section('remark', remark || '（空）');
  return md.trimEnd() + '\n';
}

/* ── 合成笔记渲染（§8） ── */
function renderSynthMd({ fm, overview, common, diff, todo, sources }) {
  const w = (k, c) => `${SYNTH_SECTIONS[k]}\n\n${wrap(k, c)}\n\n`;
  let md = buildFrontmatter(fm) + '\n\n';
  md += w('overview', overview || '');
  md += w('common', (common || []).map((k) => `- ${k}`).join('\n'));
  md += w('diff', (diff || []).map((k) => `- ${k}`).join('\n'));
  md += w('todo', (todo || []).map((k) => `- ${k}`).join('\n'));
  md += w('sources', (sources || []).join('\n'));
  return md.trimEnd() + '\n';
}

/* ── 锚点区块定位替换（§5.6 核心） ── */
/**
 * 只替换 `<!-- sec:key -->` 与 `<!-- /sec:key -->` 之间的内容；
 * 其余任何内容（包括用户手写）原样保留。未找到锚点返回 null。
 */
function replaceSection(md, key, newContent) {
  const open = `<!-- sec:${key} -->`;
  const close = `<!-- /sec:${key} -->`;
  const i = md.indexOf(open);
  if (i < 0) return null;
  const j = md.indexOf(close, i);
  if (j < 0) return null;
  return md.slice(0, i) + wrap(key, newContent) + md.slice(j + close.length);
}

function readSection(md, key) {
  const open = `<!-- sec:${key} -->`;
  const close = `<!-- /sec:${key} -->`;
  const i = md.indexOf(open);
  if (i < 0) return null;
  const j = md.indexOf(close, i);
  if (j < 0) return null;
  return md.slice(i + open.length, j).trim();
}

/* ── vault 服务（路径注入 + 运行时热切换） ── */
function createVault(vaultDir) {
  let dir = path.resolve(vaultDir);
  let attachDir = path.join(dir, 'attachments');
  fs.mkdirSync(attachDir, { recursive: true });

  const api = {
    /** 运行时切换 vault 目录（设置页改路径用）：mkdirSync 新目录后切换闭包引用 */
    setDir(newDir) {
      const d = path.resolve(newDir);
      const a = path.join(d, 'attachments');
      fs.mkdirSync(a, { recursive: true });
      dir = d;
      attachDir = a;
      return dir;
    },

    get dir() { return dir; },
    get attachDir() { return attachDir; },

    /** 写入新笔记：返回实际文件名（已去重） */
    writeNoteFile(baseName, mdText) {
      const file = uniqueFileName(dir, baseName);
      fs.writeFileSync(path.join(dir, file), mdText, 'utf-8');
      return file;
    },

    readNoteFile(file) {
      const full = path.join(dir, file);
      const raw = fs.readFileSync(full, 'utf-8');
      const parsed = matter(raw);
      return { fm: parsed.data, content: parsed.content, raw };
    },

    /** 编辑区块：只动目标锚点，modified_at 同步更新（§5.6） */
    updateNoteFile(file, fmPatch, sectionPatch) {
      const full = path.join(dir, file);
      let md = fs.readFileSync(full, 'utf-8');
      const parsed = matter(md);

      const fm = { ...parsed.data, ...fmPatch, modified_at: new Date().toISOString() };
      let body = parsed.content;

      for (const [key, val] of Object.entries(sectionPatch || {})) {
        const next = replaceSection(body, key, val);
        if (next === null) throw httpError(422, 'SECTION_NOT_FOUND', `笔记 ${file} 缺少区块 sec:${key}`);
        body = next;
      }
      const out = buildFrontmatter(fm) + '\n' + body.replace(/^\n+/, '\n');
      fs.writeFileSync(full, out, 'utf-8');
      return out;
    },

    /** 以 vault 扫描重建 index（frontmatter 为准，§5.3） */
    rebuildIndexMeta() {
      const notes = [];
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.md')) continue;
        try {
          const { fm } = this.readNoteFile(f);
          if (!fm.note_id) continue;
          notes.push({
            note_id: String(fm.note_id), file: f,
            title: fm.title || f.replace(/\.md$/, ''),
            category: fm.category || '', subcategory: fm.subcategory || '',
            tags: Array.isArray(fm.tags) ? fm.tags : [],
            type: fm.type || 'normal',
            published_at: fm.published_at || '', collected_at: fm.collected_at || '',
            created_at: fm.created_at || '', modified_at: fm.modified_at || '',
            cover: fm.cover || '', liked_count: fm.liked_count || 0,
            has_attachment: Array.isArray(fm.attachments) && fm.attachments.length > 0,
            related: Array.isArray(fm.related) ? fm.related : [],
            sources: Array.isArray(fm.sources) ? fm.sources : []
          });
        } catch (err) {
          console.warn(`[vault] 重建 index 跳过损坏文件: ${f} (${err.message})`);
        }
      }
      return notes;
    },

    /** 删除笔记 + 按 note_id 前缀清理其附件（命名规则 §5.5 保证归属） */
    deleteNoteFile(file, noteId) {
      fs.unlinkSync(path.join(dir, file));
      let cleaned = 0;
      for (const f of fs.readdirSync(attachDir)) {
        if (f.startsWith(noteId + '-')) {
          try {
            fs.unlinkSync(path.join(attachDir, f));
            cleaned++;
          } catch (e) {
            console.warn(`[vault] 附件清理失败（${f}）: ${e.message}`);
          }
        }
      }
      return cleaned;
    }
  };
  return api;
}

/** 迁移 vault：把旧目录下所有 .md 与 attachments/ 递归拷贝到新目录（已存在则覆盖同名）。
 *  fs 错误按 code 分类转 400 可读提示（设置页透传给用户，不再被 500 吞掉）。 */
function migrateVault(oldDir, newDir) {
  const src = path.resolve(oldDir);
  const dst = path.resolve(newDir);
  if (src === dst) return { migrated: 0 };
  const explain = (e) => {
    const where = `${src} → ${dst}`;
    if (e.code === 'ENOENT' || e.code === 'ENOTDIR' || e.code === 'EINVAL') {
      return `目标路径不可用（${e.code}），请检查磁盘与路径是否正确：${where}`;
    }
    if (e.code === 'EACCES' || e.code === 'EPERM') {
      return `无写入权限（${e.code}），请检查目标目录权限，或以管理员身份运行：${where}`;
    }
    if (e.code === 'EBUSY') {
      return `文件被占用（EBUSY），请关闭 Obsidian 等正在使用该目录的程序后重试：${where}`;
    }
    return `文件系统错误（${e.code || e.message || e}）：${where}`;
  };
  try {
    fs.mkdirSync(dst, { recursive: true });
    let migrated = 0;
    if (fs.existsSync(src)) {
      fs.cpSync(src, dst, { recursive: true, force: true });
      migrated = fs.readdirSync(src).length;
    }
    return { migrated };
  } catch (e) {
    throw httpError(400, 'MIGRATE_FAILED', 'vault 迁移失败：' + explain(e), { cause: e });
  }
}

/**
 * 启动自检：index ↔ vault 一致性（DESIGN §5.3「index 与 vault 不一致时以 vault 扫描重建」）
 * - 快路径：vault 下 .md 文件名集合与 index 完全一致 → 不重建，避免每次启动全量读盘
 * - 不一致（vault 新增/删除了文件、index 指向已不存在的文件、index 为空而 vault 非空）→ 以 vault 为准重建
 * 返回 { rebuilt, files, indexed, added, removed, notes }
 */
function reconcileIndex({ store, vault, force = false, log = true }) {
  const files = fs.readdirSync(vault.dir).filter((f) => f.endsWith('.md'));
  const indexed = (store.readIndex().notes || []).map((n) => n.file).filter(Boolean);
  const fileSet = new Set(files);
  const indexSet = new Set(indexed);
  const added = files.filter((f) => !indexSet.has(f));
  const removed = indexed.filter((f) => !fileSet.has(f));

  const summary = { rebuilt: false, files: files.length, indexed: indexed.length, added: added.length, removed: removed.length, notes: indexed.length };

  if (!force && added.length === 0 && removed.length === 0) {
    if (log) console.log(`[RedVault] index 自检一致：${files.length} 篇笔记`);
    return summary;
  }

  const notes = vault.rebuildIndexMeta();
  store.saveIndex({ notes });
  summary.rebuilt = true;
  summary.notes = notes.length;
  if (log) {
    console.warn(`[RedVault] index 与 vault 不一致，已按 vault 重建：vault ${files.length} 篇 / index ${indexed.length} 条`
      + `（新增 ${added.length}、缺失 ${removed.length}）→ 重建后 ${notes.length} 条`);
  }
  return summary;
}

module.exports = {
  SECTIONS, SYNTH_SECTIONS, createVault, migrateVault, reconcileIndex,
  safeTitle, uniqueFileName, buildFrontmatter,
  renderNoteMd, renderSynthMd, replaceSection, readSection, wrap, section
};
