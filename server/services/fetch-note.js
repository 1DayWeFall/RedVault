'use strict';

/**
 * 详情抓取服务（借鉴 xhs-vault 两段式架构，DESIGN §5.1）
 * 用 note_id + xsec_token 请求 explore 详情页，解析 window.__INITIAL_STATE__
 * 提取正文 desc / 视频字幕 / 图片列表。纯读模块、无本地状态。
 *
 * 带 xsec_token 的 explore 链接未登录也返回完整 __INITIAL_STATE__；
 * token 过期时 302 到登录页 → HTML 无 __INITIAL_STATE__ → 返回 null。
 */

const DETAIL_BASE = 'https://www.xiaohongshu.com/explore/';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Referer': 'https://www.xiaohongshu.com/'
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 详情页 URL（xsec_source=pc_user，与站内收藏列表跳转一致） */
function exploreUrl(noteId, xsecToken) {
  return `${DETAIL_BASE}${noteId}?xsec_token=${encodeURIComponent(xsecToken)}&xsec_source=pc_user`;
}

/** HTML → window.__INITIAL_STATE__ 对象；不存在（302 登录页等）返回 null */
function extractInitialState(html) {
  const m = html.match(/window\.__INITIAL_STATE__\s*=\s*([\s\S]*?)<\/script>/);
  if (!m) return null;
  const sanitize = (t) => t.trim().replace(/;$/, '').replace(/\bundefined\b/g, 'null');
  // 页面内联对象含裸 undefined（非法 JSON），统一替换为 null
  try {
    return JSON.parse(sanitize(m[1]));
  } catch (_) {
    /* 防御：正文含 "</script>" 字符串时非贪婪正则提前截断 → 从首个 { 起括号配平重试 */
    const start = html.indexOf('{', m.index);
    if (start < 0) return null;
    let depth = 0, quote = null, esc = false;
    for (let i = start; i < html.length; i++) {
      const ch = html[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (quote) { if (ch === quote) quote = null; continue; }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(sanitize(html.slice(start, i + 1))); } catch (_) { return null; }
        }
      }
    }
    return null;
  }
}

/**
 * 字幕选择（2026-09 实测挂载）：subtitles 位于 video.mediaV2（JSON 字符串）内，
 * 形如 {"video":{...},"subtitles":{"en-US":[{url}]}}；旧结构 media.video.subtitles 保留容错。
 * 多路径容错；优先级 source > zh-CN > zh > en-US > en > 任意。
 * @returns {{url, lang} | null}
 */
function pickSubtitleUrl(video) {
  const deep = [];
  const pushHolder = (v) => {
    if (!v || typeof v !== 'object') return;
    deep.push(v);
    if (v.video) deep.push(v.video);
  };
  const walk = (v) => {
    if (!v || typeof v !== 'object') return;
    if (v.media) pushHolder(v.media);
    if (v.mediaV2) {
      // 实测主路径：mediaV2 为 JSON 字符串，subtitles 与 video 平级挂在根上
      try {
        const mv = typeof v.mediaV2 === 'string' ? JSON.parse(v.mediaV2) : v.mediaV2;
        pushHolder(mv);
      } catch (_) { /* mediaV2 非法则跳过 */ }
    }
    if (v.stream) {
      try {
        const s = typeof v.stream === 'string' ? JSON.parse(v.stream) : v.stream;
        if (s && s.media) deep.push(s.media);
        if (s && s.video) deep.push(s.video);
      } catch (_) { /* stream 非法则跳过 */ }
    }
  };
  walk(video);
  for (const m of deep) {
    for (const holder of [m.video, m]) {
      if (!holder || typeof holder !== 'object') continue;
      const subs = holder.subtitles || holder.subtitle;
      if (!subs) continue;
      const by = {};
      if (!Array.isArray(subs)) {
        for (const [lang, arr] of Object.entries(subs)) {
          const list = Array.isArray(arr) ? arr : [arr];
          const u = (list[0] && (list[0].url || list[0].subtitleUrl)) || '';
          if (u) by[lang] = u;
        }
      } else {
        for (const s of subs) if (s && s.url) by[s.language || s.lang || '?'] = s.url;
      }
      for (const want of ['source', 'zh-CN', 'zh', 'en-US', 'en']) {
        if (by[want]) return { url: by[want], lang: want };
      }
      const k = Object.keys(by)[0];
      if (k) return { url: by[k], lang: k };
    }
  }
  return null;
}

/** SRT → 纯文本（去序号/时间戳/HTML 标签，相邻行合并） */
function parseSrt(srt) {
  const lines = String(srt || '').replace(/\r/g, '').split('\n');
  const out = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (/^\d+$/.test(t)) continue;
    if (/^\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.]\d{3}/.test(t)) continue;
    const clean = t.replace(/<[^>]*>/g, '').replace(/\{[^}]*\}/g, '').trim();
    if (clean) out.push(clean);
  }
  return out.join('\n').replace(/\n+/g, '\n').trim();
}

/** 带 UA/超时的文本抓取；失败返回 null（不抛错） */
async function fetchText(url, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { headers: HEADERS, signal: ctrl.signal, redirect: 'follow' });
    if (!resp.ok) return null;
    return await resp.text();
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 抓取单条笔记详情。
 * @param {string} noteId
 * @param {string} xsecToken
 * @returns {Promise<null | {note: object, subtitle: {text, lang} | null}>}
 *   note 为 __INITIAL_STATE__ 原始 note（title/desc/user/interactInfo/imageList/
 *   video/tagList/time），可直接喂 normalizeCapture；
 *   失败（网络 / 风控 / xsec_token 过期 302 登录页）返回 null。
 */
async function fetchNoteDetail(noteId, xsecToken) {
  if (!noteId || !xsecToken) return null;

  const html = await fetchText(exploreUrl(noteId, xsecToken), 15000);
  if (!html) return null;

  const state = extractInitialState(html);
  if (!state) return null;

  const map = (state.note && state.note.noteDetailMap) || {};
  const note = (map[noteId] && map[noteId].note)
    || Object.values(map).map((v) => v && v.note).find(Boolean)
    || null;
  if (!note || (!note.title && !note.desc)) return null;

  /* 字幕 URL 带签名会过期，此刻立即下载；失败静默降级（正文照常） */
  let subtitle = null;
  const picked = pickSubtitleUrl(note.video);
  if (picked) {
    const srt = await fetchText(picked.url.replace(/^http:\/\//, 'https://'), 12000);
    const text = srt ? parseSrt(srt) : '';
    if (text) subtitle = { text, lang: picked.lang };
  }

  return { note, subtitle };
}

module.exports = { fetchNoteDetail, exploreUrl, extractInitialState, pickSubtitleUrl, parseSrt, sleep };
