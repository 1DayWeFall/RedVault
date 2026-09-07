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
  try {
    const m = html.match(/window\.__INITIAL_STATE__\s*=\s*([\s\S]*?)<\/script>/);
    if (!m) return null;
    // 页面内联对象含裸 undefined（非法 JSON），统一替换为 null
    const text = m[1].trim().replace(/;$/, '').replace(/\bundefined\b/g, 'null');
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

/**
 * 字幕选择：subtitles 挂在 video.media.video.subtitles（dict 按语言分组），
 * 多路径容错；优先级 source > zh-CN > zh > en-US > en > 任意。
 * @returns {{url, lang} | null}
 */
function pickSubtitleUrl(video) {
  const deep = [];
  const walk = (v) => {
    if (!v || typeof v !== 'object') return;
    if (v.media) deep.push(v.media);
    if (v.video) deep.push(v.video);
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
