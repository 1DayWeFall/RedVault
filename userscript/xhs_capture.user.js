// ==UserScript==
// @name         薯藏 RedVault · 小红书采集
// @namespace    redvault
// @version      0.2.0
// @description  浏览小红书时自动捕获笔记内容与评论 → 上报本地 RedVault 收件箱（自用存档，零额外请求读页面数据）
// @author       1DayWeFall
// @match        https://www.xiaohongshu.com/explore*
// @match        https://www.xiaohongshu.com/discovery/item/*
// @match        https://www.xiaohongshu.com/user/profile/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      127.0.0.1
// @connect      localhost
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
    const candidates = [
      st.noteData?.noteDetailMap?.[id]?.note,
      st.note?.noteDetailMap?.[id]?.note,
      st.noteDetailMap?.[id]?.note,
      st.note?.noteData?.noteDetailMap?.[id]?.note
    ].filter(Boolean);
    if (!candidates.length) return null;
    // 合并多版本结构：取字段最全的
    const note = {};
    for (const c of candidates) Object.assign(note, c);
    note.__firstComments = candidates.reduce((acc, c) => acc.concat(c.comments || c.firstComments || []), []);
    return note;
  }

  async function handleNote(id) {
    $retry.style.display = '';
    if (seenIds.has(id) && !GM_getValue('rv_force_' + id, false)) {
      // 本会话/历史已上报过：仍然问服务端（可能被删除过），但不再抓评论
    }
    setStatus('已进入详情页，提取页面数据…');
    await sleep(600); // 等待 Vue 渲染填充 __INITIAL_STATE__

    const note = extractNote(id);
    if (!note || (!note.title && !note.desc)) {
      setStatus('<span class="rv-err">未找到页面数据</span>（页面版本差异或未完全加载，可点重新抓取）');
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

    report(id, note, comments, truncated);
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
  function report(id, note, comments, truncated) {
    setStatus(`上报中…（${comments.length} 条评论${truncated ? ' · 未抓满' : ''}）`);
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
