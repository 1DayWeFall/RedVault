'use strict';

/**
 * 详情页结构诊断脚本（一次性/按需使用）
 * 用 data/inbox.json 现成条目的 note_id + xsec_token 抓取 explore 详情页，
 * dump __INITIAL_STATE__.note.noteDetailMap[id].note 的关键结构：
 *   - desc 原文（验证换行/HTML 格式假设）
 *   - video 子树 keys、subtitles / duration 挂载位置
 * 用法：node scripts/inspect-note.js [note_id]   （默认取 inbox 第一条视频条目）
 */

const fs = require('fs');
const path = require('path');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Referer': 'https://www.xiaohongshu.com/'
};

const inbox = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'inbox.json'), 'utf8'));
const argId = process.argv[2];
const entry = (argId && inbox.find((x) => x.note_id === argId))
  || inbox.find((x) => x.raw && x.raw.type === 'video')
  || inbox[0];

if (!entry) { console.error('inbox 为空'); process.exit(1); }
const { note_id, raw } = entry;
const url = `https://www.xiaohongshu.com/explore/${note_id}?xsec_token=${encodeURIComponent(raw.xsec_token)}&xsec_source=pc_user`;
console.log(`采样: ${note_id} 《${raw.title}》 type=${raw.type}`);
console.log(`URL: ${url}\n`);

(async () => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  let html;
  try {
    const resp = await fetch(url, { headers: HEADERS, signal: ctrl.signal, redirect: 'follow' });
    console.log(`HTTP ${resp.status}, final URL: ${resp.url.slice(0, 80)}…`);
    if (!resp.ok) { console.error('请求失败'); process.exit(1); }
    html = await resp.text();
  } finally { clearTimeout(timer); }

  const m = html.match(/window\.__INITIAL_STATE__\s*=\s*([\s\S]*?)<\/script>/);
  if (!m) {
    console.error('未找到 __INITIAL_STATE__（可能 302 到登录页 / xsec_token 过期 / 风控页）');
    console.error('页面 title:', (html.match(/<title>([^<]*)<\/title>/) || [])[1]);
    process.exit(1);
  }
  let state;
  try {
    state = JSON.parse(m[1].trim().replace(/;$/, '').replace(/\bundefined\b/g, 'null'));
  } catch (e) {
    console.error('JSON.parse 失败:', e.message);
    console.error('截取前 300 字符:', m[1].slice(0, 300));
    process.exit(1);
  }

  const map = (state.note && state.note.noteDetailMap) || {};
  const note = (map[note_id] && map[note_id].note) || Object.values(map).map((v) => v && v.note).find(Boolean);
  if (!note) { console.error('noteDetailMap 中无 note。keys:', Object.keys(map)); process.exit(1); }

  console.log('== note 顶层 keys ==\n', Object.keys(note).join(', '));

  console.log('\n== desc 原文（前 800 字符，验证 <br>/换行）==');
  console.log(JSON.stringify(String(note.desc || '').slice(0, 800)));

  console.log('\n== title ==\n', JSON.stringify(note.title || ''));

  if (note.video) {
    console.log('\n== note.video keys ==\n', Object.keys(note.video).join(', '));
    const dump = (label, obj, depth = 0) => {
      if (!obj || typeof obj !== 'object' || depth > 3) return;
      for (const [k, v] of Object.entries(obj)) {
        if (v === null || typeof v !== 'object') {
          console.log(`${label}.${k} = ${JSON.stringify(String(v).slice(0, 60))}`);
        } else if (Array.isArray(v)) {
          console.log(`${label}.${k} = Array(${v.length})` + (v.length && typeof v[0] === 'object' ? ` keys[0]: ${Object.keys(v[0] || {}).join(',')}` : ''));
        } else {
          console.log(`${label}.${k} = {${Object.keys(v).slice(0, 12).join(',')}}`);
          dump(`${label}.${k}`, v, depth + 1);
        }
      }
    };
    dump('video', note.video);

    const srt = JSON.stringify(note.video);
    for (const kw of ['subtitle', 'duration', 'capa', 'media', 'stream']) {
      const i = srt.indexOf(kw);
      console.log(`\n-- video 串内 "${kw}" 上下文 --\n` + (i >= 0 ? srt.slice(Math.max(0, i - 60), i + 160) : '(无)'));
    }
  } else {
    console.log('\n(note.video 不存在)');
  }
})();
