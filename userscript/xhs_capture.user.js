// ==UserScript==
// @name         薯藏 RedVault · 小红书采集
// @namespace    redvault
// @version      0.3.0
// @description  浏览小红书时自动捕获笔记内容、视频字幕与评论 → 上报本地 RedVault 收件箱（自用存档，零额外请求读页面数据）
// @author       1DayWeFall
// @match        https://www.xiaohongshu.com/explore*
// @match        https://www.xiaohongshu.com/discovery/item/*
// @match        https://www.xiaohongshu.com/user/profile/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @connect      127.0.0.1
// @connect      localhost
// @connect      *.xhscdn.com
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  /* ══════════════ 配置（TOKEN 必填：复制自 RedVault 服务启动日志） ══════════════ */
  const CONFIG = {
    SERVER: 'http://127.0.0.1:3789',
    TOKEN: '',                    // ← 填你的 token，形如 rv_xxxxxxxxxxxx
    COMMENT_TARGET_DEFAULT: 20,   // 评论目标条数，面板可切换 10/20/50
    COMMENT_PAGE_GAP: () => 3000 + Math.random() * 2000, // 3–5s 随机抖动（§5.1）
    RETRY_DELAY: 20000,           // 服务未启动时重试间隔（60s 内 3 次）
    MAX_RETRY: 3
  };

  /* ══════════════ 会话状态 ══════════════ */
  let currentNoteId = null;       // 当前详情页笔记
  let lastHandled = null;         // 已处理过的 noteId（会话去重）
  const seenIds = new Set(loadSeen());
  let commentTarget = GM_getValue('rv_commentTarget', CONFIG.COMMENT_TARGET_DEFAULT);
  let panelPos = GM_getValue('rv_panelPos', null);

  function loadSeen() {
    try { return JSON.parse(GM_getValue('rv_seenIds', '[]')); } catch (_) { return []; }
  }
  function persistSeen() {
    const arr = [...seenIds].slice(-500);
    GM_setValue('rv_seenIds', JSON.stringify(arr));
  }

  /* ══════════════ 面板 UI（右下角悬浮 · 小红书红描边 · 可拖动折叠） ══════════════ */
  GM_addStyle(`
    #rv-panel { position: fixed; z-index: 99999; right: 20px; bottom: 20px; min-width: 220px;
      background: #fff; border: 1.5px solid #FF2442; border-radius: 12px; padding: 10px 12px;
      font: 12px/1.6 Inter, "PingFang SC", "Microsoft YaHei", sans-serif; color: #18191C;
      box-shadow: 0 8px 24px rgba(0,0,0,.14); user-select: none; }
    #rv-panel .rv-head { display: flex; align-items: center; gap: 6px; cursor: move; font-weight: 600; }
    #rv-panel .rv-logo { width: 8px; height: 8px; border-radius: 50%; background: #FF2442; }
    #rv-panel .rv-fold { margin-left: auto; cursor: pointer; color: #999; padding: 0 4px; }
    #rv-panel .rv-status { margin-top: 6px; color: #555; white-space: pre-line; }
    #rv-panel .rv-title { margin-top: 4px; color: #18191C; font-weight: 600;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 240px; }
    #rv-panel .rv-btns { margin-top: 8px; display: flex; gap: 6px; }
    #rv-panel button { font: inherit; border: 1px solid #ddd; background: #f7f7f8; border-radius: 8px;
      padding: 3px 10px; cursor: pointer; color: #333; }
    #rv-panel button:hover { border-color: #FF2442; color: #FF2442; }
    #rv-panel .rv-ok { color: #10B981; font-weight: 600; }
    #rv-panel .rv-warn { color: #F59E0B; }
    #rv-panel .rv-err { color: #EF4444; }
  `);

  let folded = GM_getValue('rv_folded', false);
  const panel = document.createElement('div');
  panel.id = 'rv-panel';
  if (panelPos) { panel.style.left = panelPos.left; panel.style.top = panelPos.top; panel.style.right = 'auto'; panel.style.bottom = 'auto'; }
  panel.innerHTML = `
    <div class="rv-head"><span class="rv-logo"></span>薯藏 RedVault<span class="rv-fold">${folded ? '▾' : '▸'}</span></div>
    <div class="rv-body" style="${folded ? 'display:none' : ''}">
      <div class="rv-title"></div>
      <div class="rv-status">待检测…</div>
      <div class="rv-btns">
        <button id="rv-retry" style="display:none">重新抓取</button>
        <button id="rv-cnt">评论 ${commentTarget} 条</button>
      </div>
    </div>`;
  document.body.appendChild(panel);

  const $status = panel.querySelector('.rv-status');
  const $title = panel.querySelector('.rv-title');
  const $retry = panel.querySelector('#rv-retry');
  const $fold = panel.querySelector('.rv-fold');

  function setStatus(html) { $status.innerHTML = html; }
  function setTitle(t) { $title.textContent = t || ''; }

  $fold.onclick = () => {
    folded = !folded;
    GM_setValue('rv_folded', folded);
    panel.querySelector('.rv-body').style.display = folded ? 'none' : '';
    $fold.textContent = folded ? '▾' : '▸';
  };
  panel.querySelector('#rv-cnt').onclick = (e) => {
    commentTarget = commentTarget === 10 ? 20 : commentTarget === 20 ? 50 : 10;
    GM_setValue('rv_commentTarget', commentTarget);
    e.target.textContent = `评论 ${commentTarget} 条`;
  };
  $retry.onclick = () => { lastHandled = null; routeCheck(); };

  /* 拖动 + 位置记忆 */
  (function makeDraggable() {
    const head = panel.querySelector('.rv-head');
    let sx, sy, ox, oy, dragging = false;
    head.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('rv-fold')) return;
      dragging = true; sx = e.clientX; sy = e.clientY;
      const r = panel.getBoundingClientRect(); ox = r.left; oy = r.top;
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      panel.style.left = Math.max(0, Math.min(window.innerWidth - 100, ox + e.clientX - sx)) + 'px';
      panel.style.top = Math.max(0, Math.min(window.innerHeight - 40, oy + e.clientY - sy)) + 'px';
      panel.style.right = 'auto'; panel.style.bottom = 'auto';
    });
    window.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      GM_setValue('rv_panelPos', { left: panel.style.left, top: panel.style.top });
    });
  })();

  /* ══════════════ 路由监听：pushState hook + popstate + 1s 轮询 双保险（§5.1） ══════════════ */
  const origPush = history.pushState;
  history.pushState = function (...args) { origPush.apply(this, args); setTimeout(routeCheck, 300); };
  window.addEventListener('popstate', () => setTimeout(routeCheck, 300));
  setInterval(routeCheck, 1000);

  function noteIdFromUrl() {
    const m = location.pathname.match(/\/(?:explore|discovery\/item)\/([0-9a-f]{16,32})/);
    return m ? m[1] : null;
  }

  function routeCheck() {
    const id = noteIdFromUrl();
    currentNoteId = id;
    if (!id) {
      if (lastHandled !== null) { lastHandled = null; setTitle(''); setStatus('待检测…（进入笔记详情页自动捕获）'); $retry.style.display = 'none'; }
      return;
    }
    if (id === lastHandled) return;
    lastHandled = id;
    handleNote(id);
  }

  /* ══════════════ 数据提取（零额外请求，读 __INITIAL_STATE__，多路径容错） ══════════════ */
  function extractNote(id) {
    const st = window.__INITIAL_STATE__;
    if (!st) return null;

    /* 候选路径：优先按 id 精确取，兼容 noteData/note 两套历史结构 */
    const getMap = () => {
      const ndm = (st.note && st.note.noteDetailMap) || (st.noteData && st.noteData.noteDetailMap) || st.noteDetailMap;
      return ndm;
    };
    const ndm = getMap();
    let note = null;
    if (ndm && ndm[id] && ndm[id].note) note = ndm[id].note;

    /* 兜底（xhs-vault 经验）：noteDetailMap 的 key 偶尔不等于 note_id，遍历找第一个含 title/desc 的 note */
    if (!note && ndm) {
      for (const k in ndm) {
        const v = ndm[k] && ndm[k].note;
        if (v && (v.title || v.desc)) { note = v; break; }
      }
    }
    if (!note) return null;

    /* 首屏评论：note.comments 或 note.firstComments（供 collectFirstComments 用） */
    note.__firstComments = note.comments || note.firstComments || [];
    return note;
  }

  async function handleNote(id) {
    $retry.style.display = '';
    if (seenIds.has(id) && !GM_getValue('rv_force_' + id, false)) {
      // 本会话/历史已上报过：仍然问服务端（可能被删除过），但不再抓评论
    }
    setStatus('已进入详情页，提取页面数据…');

    /* 轮询等待 __INITIAL_STATE__ 填充（分享链接 ?xsec_token 需异步请求，最多等 10s） */
    let note = null;
    for (let i = 0; i < 20; i++) {
      await sleep(500);
      note = extractNote(id);
      if (note && (note.title || note.desc)) break;
    }
    if (!note || (!note.title && !note.desc)) {
      setStatus('<span class="rv-err">未找到页面数据</span>（页面未加载或已改版，可点重新抓取）');
      return;
    }
    setTitle(note.title || (note.desc || '').slice(0, 30));
    setStatus('已提取主数据 ✓');

    /* 评论：先取首屏自带，再翻页补齐（可放弃，§5.1） */
    let comments = collectFirstComments(note);
    let truncated = false;
    try {
      comments = await fetchComments(id, comments);
    } catch (e) {
      truncated = true;
    }
    if (comments.length < commentTarget) truncated = true;

    /* 视频字幕：优先取平台自带 SRT（借鉴 xhs-vault）。URL 带签名会过期，必须此刻下载；失败静默降级 */
    let subtitle = null;
    try { subtitle = await grabSubtitle(note); } catch (_) { /* 无字幕/下载失败 → 主数据照常 */ }

    report(id, note, comments, truncated, subtitle);
  }

  /* ── 视频字幕：subtitles 挂在 media.video.subtitles（dict，按语言分组） ──
     取值优先级 source > zh-CN > zh > en-US > en > 任意；下载 SRT 并解析为纯文本 */
  function pickSubtitleUrl(video) {
    const deep = [];
    const walk = (v) => {
      if (!v || typeof v !== 'object') return;
      if (v.media) deep.push(v.media);
      if (v.video) deep.push(v.video);
      if (v.stream) { try { const s = typeof v.stream === 'string' ? JSON.parse(v.stream) : v.stream; if (s?.media) deep.push(s.media); if (s?.video) deep.push(s.video); } catch (_) {} }
    };
    walk(video);
    for (const m of deep) {
      for (const holder of [m?.video, m]) {
        if (!holder || typeof holder !== 'object') continue;
        const subs = holder.subtitles || holder.subtitle;
        if (!subs) continue;
        const by = {};
        if (subs && !Array.isArray(subs)) {
          for (const [lang, arr] of Object.entries(subs)) {
            const list = Array.isArray(arr) ? arr : [arr];
            const u = list[0]?.url || list[0]?.subtitleUrl;
            if (u) by[lang] = u;
          }
        } else if (Array.isArray(subs)) {
          for (const s of subs) if (s?.url) by[s.language || s.lang || '?'] = s.url;
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

  function parseSrt(srt) {
    const lines = String(srt || '').replace(/\r/g, '').split('\n');
    const out = [];
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;                                              // 空行
      if (/^\d+$/.test(t)) continue;                                 // 序号
      if (/^\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.]\d{3}/.test(t)) continue; // 时间戳
      const clean = t.replace(/<[^>]*>/g, '').replace(/\{[^}]*\}/g, '').trim(); // 去 HTML 标签 / 样式花括号
      if (clean) out.push(clean);
    }
    // 相邻行合并（同一句被拆行）
    return out.join('\n').replace(/\n+/g, '\n').trim();
  }

  async function grabSubtitle(note) {
    const video = note.video;
    if (!video) return null;
    const picked = pickSubtitleUrl(video);
    if (!picked) return null;
    const srt = await new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: picked.url.replace(/^http:\/\//, 'https://'),
        timeout: 12000,
        onload: (r) => (r.status >= 200 && r.status < 300) ? resolve(r.responseText) : reject(new Error('HTTP ' + r.status)),
        onerror: () => reject(new Error('网络错误')),
        ontimeout: () => reject(new Error('超时'))
      });
    });
    const text = parseSrt(srt);
    if (!text) return null;
    setStatus(`已提取视频字幕 ✓（${text.length} 字）`);
    return { text, lang: picked.lang };
  }

  function collectFirstComments(note) {
    const list = [];
    for (const c of note.__firstComments || []) {
      list.push({
        content: c.content || '',
        like_count: c.like_count ?? c.likeCount ?? 0,
        user_info: { nickname: c.user_info?.nickname || c.userInfo?.nickname || '' },
        show_time: c.show_time || c.time || '',
        sub_comments: c.sub_comments || c.subComments || []
      });
      for (const s of c.sub_comments || c.subComments || []) {
        list.push({
          content: s.content || '', like_count: s.like_count ?? 0,
          user_info: { nickname: s.user_info?.nickname || '' }, show_time: s.show_time || ''
        });
      }
    }
    return list;
  }

  /* 评论翻页：同源 fetch，限速抖动；单页失败重试 1 次；连续失败 → 放弃（主数据照常） */
  async function fetchComments(noteId, base) {
    const out = [...base];
    const seen = new Set(out.map((c) => c.content));
    let cursor = '';
    let fail = 0;
    for (let page = 0; page < 5 && out.length < commentTarget; page++) {
      await sleep(CONFIG.COMMENT_PAGE_GAP());
      setStatus(`评论抓取中 ${out.length}/${commentTarget}…`);
      let data = null;
      for (let attempt = 0; attempt < 2 && !data; attempt++) {
        try {
          const url = `https://edith.xiaohongshu.com/api/sns/web/v2/comment/page?note_id=${noteId}&cursor=${encodeURIComponent(cursor)}&top_comment_id=&image_formats=jpg,webp,avif`;
          const resp = await fetch(url, { credentials: 'include' });
          const json = await resp.json();
          if (json?.data?.comments) data = json.data; else fail++;
        } catch (_) { fail++; }
        if (!data) await sleep(1500);
      }
      if (!data) break;                       // 风控/签名失败 → 放弃评论
      for (const c of data.comments || []) {
        if (!seen.has(c.content)) { seen.add(c.content); out.push(c); }
        for (const s of c.sub_comments || []) {
          if (!seen.has(s.content)) { seen.add(s.content); out.push({ ...s, _sub: true }); }
        }
      }
      if (!data.has_more || !data.cursor) break;
      cursor = data.cursor;
    }
    out.sort((a, b) => (b.like_count || 0) - (a.like_count || 0));
    return out.slice(0, commentTarget);
  }

  /* ══════════════ 上报（GM_xmlhttpRequest 绕跨域；断线 60s 内重试 3 次） ══════════════ */
  function report(id, note, comments, truncated, subtitle) {
    setStatus(`上报中…（${comments.length} 条评论${truncated ? ' · 未抓满' : ''}${subtitle ? ' · 含字幕' : ''}）`);
    const payload = {
      note_id: id,
      source_url: location.origin + '/explore/' + id,
      note: {
        noteType: note.noteType || note.type || 'normal',
        title: note.title || '',
        desc: note.desc || '',
        tagList: note.tagList || [],
        user: note.user || {},
        interactInfo: note.interactInfo || {},
        time: note.time || note.timestamp || 0,
        imageList: note.imageList || [],
        video: note.video || null
      },
      subtitle: subtitle || null,
      comments,
      comments_truncated: truncated
    };
    let attempts = 0;
    const send = () => {
      attempts++;
      GM_xmlhttpRequest({
        method: 'POST',
        url: CONFIG.SERVER + '/api/capture',
        headers: { 'Content-Type': 'application/json', 'X-Capture-Token': CONFIG.TOKEN },
        data: JSON.stringify(payload),
        timeout: 8000,
        onload: (r) => {
          if (r.status === 201) {
            seenIds.add(id); persistSeen();
            setStatus(`<span class="rv-ok">已上报 ✓</span> 收件箱待确认（${comments.length} 条评论）`);
            $retry.style.display = 'none';
          } else if (r.status === 409) {
            seenIds.add(id); persistSeen();
            setStatus('<span class="rv-warn">重复跳过</span> 已在收件箱/已入库');
            $retry.style.display = 'none';
          } else if (r.status === 401) {
            setStatus('<span class="rv-err">Token 不正确</span> 请检查脚本内 CONFIG.TOKEN');
          } else {
            setStatus(`<span class="rv-err">上报失败 ${r.status}</span> ${truncate(r.responseText, 80)}`);
          }
        },
        onerror: () => retryOrGiveUp(),
        ontimeout: () => retryOrGiveUp()
      });
    };
    const retryOrGiveUp = () => {
      if (attempts < CONFIG.MAX_RETRY) {
        setStatus(`<span class="rv-warn">服务未启动？</span> ${CONFIG.RETRY_DELAY / 1000}s 后重试 (${attempts}/${CONFIG.MAX_RETRY})`);
        setTimeout(send, CONFIG.RETRY_DELAY);
      } else {
        setStatus('<span class="rv-err">服务未启动，已保留数据</span> 启动后点「重新抓取」');
      }
    };
    send();
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const truncate = (s, n) => (s || '').slice(0, n);

  /* token 未配置提醒 */
  if (!CONFIG.TOKEN) {
    setStatus('<span class="rv-err">未配置 TOKEN</span> 编辑脚本填入 CONFIG.TOKEN（见服务启动日志）');
  }

  routeCheck();
})();
