'use strict';

/**
 * 侧车状态存储（DESIGN §5.3）
 * 三个 JSON：inbox / config / notes_index
 * - 原子写：tmp → rename
 * - 读时容错：损坏则备份 .corrupt-{ts} 后返回默认结构
 * - 路径全部由构造时注入（测试可用临时目录）
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function atomicWriteJson(file, obj) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf-8');
  fs.renameSync(tmp, file);
}

function readJsonSafe(file, fallbackFactory) {
  try {
    const txt = fs.readFileSync(file, 'utf-8');
    return JSON.parse(txt);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      // 损坏：备份后重建（§5.3 读时容错）
      try {
        fs.renameSync(file, `${file}.corrupt-${Date.now()}`);
        console.warn(`[store] ${path.basename(file)} 损坏已备份，重建默认结构`);
      } catch (_) { /* 备份失败不阻塞 */ }
    }
    return fallbackFactory();
  }
}

/**
 * 读缓存（M7）：以 mtimeMs + size 为键，避免每个请求都全量 readFileSync + JSON.parse
 * （/notes、/stats、isDuplicate、capture/check 循环等曾为 O(N) 全量解析）
 * 约定：所有写路径写盘后立即 prime（写后立即可见），外部改动靠 mtime/size 变化自动失效
 */
function createReadCache() {
  const cache = new Map(); // file → { mtimeMs, size, value }
  return {
    read(file, fallbackFactory) {
      let st;
      try {
        st = fs.statSync(file);
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
        cache.delete(file);
        return fallbackFactory();
      }
      const hit = cache.get(file);
      if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.value;
      const value = readJsonSafe(file, fallbackFactory);
      cache.set(file, { mtimeMs: st.mtimeMs, size: st.size, value });
      return value;
    },
    prime(file, value) {
      try {
        const st = fs.statSync(file);
        cache.set(file, { mtimeMs: st.mtimeMs, size: st.size, value });
      } catch (_) {
        cache.delete(file);
      }
    },
    invalidate(file) { cache.delete(file); },
    clear() { cache.clear(); },
    get size() { return cache.size; }
  };
}

function defaultConfig() {
  return {
    ai: {
      text:   { baseUrl: '', apiKey: '', model: '', priceIn: 0, priceOut: 0 },
      vision: { baseUrl: '', apiKey: '', model: '', priceIn: 0, priceOut: 0 }
    },
    ocr: { enabled: false, lang: 'chi_sim+eng' },  // 本地 OCR（Tesseract）：免 API 费，vision 未配时接管图片文字提取
    // 无 commentCount：评论抓取随脚本 v0.4 下线，该设置项后端无人消费（M7 清理）
    capture: { token: 'rv_' + crypto.randomBytes(12).toString('hex') },
    // 二期预留：rag（M8）/ review（M9），缺字段按此补齐，旧配置不受影响
    rag: {
      provider: 'auto',          // auto → 本地优先，不可用回落远端嵌入，再降级关键词
      allowRemoteEmbed: true,    // 关掉则禁止任何正文外发（含远端 /embeddings）
      topK: 6, chunkSize: 700, chunkOverlap: 80, rerank: true
    },
    review: { recentDays: 14, randomSize: 3 },
    vaultPath: 'vault'
  };
}

const defaultInbox = () => [];
const defaultIndex = () => ({ notes: [] });

function createStore(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const paths = {
    inbox: path.join(dataDir, 'inbox.json'),
    config: path.join(dataDir, 'config.json'),
    index: path.join(dataDir, 'notes_index.json')
  };
  const cache = createReadCache();

  /* 写穿：落盘失败必须让缓存失效，否则缓存里会留下未落盘的数据（判重等读路径出现假阳性） */
  const writeThrough = (file, value) => {
    try {
      atomicWriteJson(file, value);
      cache.prime(file, value);
    } catch (e) {
      cache.invalidate(file);
      throw e;
    }
  };

  /* 首次运行写入默认 config（保证 capture token 稳定存在） */
  if (!fs.existsSync(paths.config)) atomicWriteJson(paths.config, defaultConfig());

  return {
    paths,
    /* 测试与运维用：缓存条目数 / 手动失效 */
    cacheSize: () => cache.size,
    invalidateCache: () => cache.clear(),

    /* ── inbox ── */
    readInbox: () => cache.read(paths.inbox, defaultInbox),
    saveInbox: (items) => writeThrough(paths.inbox, items),

    /* ── config ── */
    readConfig: () => {
      const cfg = cache.read(paths.config, defaultConfig);
      // 结构演进兜底：缺字段补默认
      const dft = defaultConfig();
      cfg.ai = cfg.ai || dft.ai;
      cfg.ai.text = { ...dft.ai.text, ...cfg.ai.text };
      cfg.ai.vision = { ...dft.ai.vision, ...cfg.ai.vision };
      cfg.ocr = { ...dft.ocr, ...cfg.ocr };
      cfg.capture = { ...dft.capture, ...cfg.capture };
      cfg.rag = { ...dft.rag, ...cfg.rag };
      cfg.review = { ...dft.review, ...cfg.review };
      if (!cfg.capture.token) cfg.capture.token = dft.capture.token;
      if (!cfg.vaultPath) cfg.vaultPath = dft.vaultPath;
      return cfg;
    },
    saveConfig: (cfg) => writeThrough(paths.config, cfg),

    /* ── notes index ── */
    readIndex: () => cache.read(paths.index, defaultIndex),
    saveIndex: (idx) => writeThrough(paths.index, idx),

    /* 收件箱 + 索引双重判重（§5.1 去重） */
    isDuplicate(noteId) {
      const inInbox = this.readInbox().some((x) => x.note_id === noteId);
      if (inInbox) return true;
      return this.readIndex().notes.some((n) => n.note_id === noteId);
    },

    /** 收件箱条目追加（不覆盖已有） */
    addInboxEntry(entry) {
      const items = this.readInbox();
      items.push(entry);
      this.saveInbox(items);
    },

    /** 覆盖式写入：同 note_id 存在则整体替换，否则追加（单次写盘）。用于 failed 条目重采覆盖 */
    upsertInboxEntry(entry) {
      const items = this.readInbox().filter((x) => x.note_id !== entry.note_id);
      items.push(entry);
      this.saveInbox(items);
    },

    updateInboxEntry(noteId, patch) {
      const items = this.readInbox();
      const i = items.findIndex((x) => x.note_id === noteId);
      if (i < 0) return null;
      items[i] = { ...items[i], ...patch };
      this.saveInbox(items);
      return items[i];
    },

    removeInboxEntry(noteId) {
      const items = this.readInbox();
      const next = items.filter((x) => x.note_id !== noteId);
      if (next.length === items.length) return false;
      this.saveInbox(next);
      return true;
    },

    /** 批量删除收件箱条目（单次写盘，避免 N 条 = N 次全量写），返回实际删除数；不存在的 id 静默忽略 */
    removeInboxEntries(ids) {
      const set = new Set(ids);
      const items = this.readInbox();
      const next = items.filter((x) => !set.has(x.note_id));
      const removed = items.length - next.length;
      if (removed > 0) this.saveInbox(next);
      return removed;
    },

    upsertIndexNote(note) {
      const idx = this.readIndex();
      const i = idx.notes.findIndex((n) => n.note_id === note.note_id);
      if (i >= 0) idx.notes[i] = { ...idx.notes[i], ...note };
      else idx.notes.push(note);
      this.saveIndex(idx);
    },

    removeIndexNote(noteId) {
      const idx = this.readIndex();
      const next = idx.notes.filter((n) => n.note_id !== noteId);
      const changed = next.length !== idx.notes.length;
      if (changed) this.saveIndex({ notes: next });
      return changed;
    }
  };
}

module.exports = { createStore, atomicWriteJson, defaultConfig };
