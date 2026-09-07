// ==UserScript==
// @name         薯藏 RedVault · 小红书收藏夹批量采集
// @namespace    redvault
// @version      0.4.0
// @description  在收藏夹页 hook 列表接口自动吸收清单（note_id + xsec_token），滚动翻页抓全量后批量上报 RedVault；正文/字幕/图片由本地服务端抓详情页获得，零 DOM 提取
// @author       1DayWeFall
// @match        https://www.xiaohongshu.com/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @connect      127.0.0.1
// @connect      localhost
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  /* ══════════════ 配置（TOKEN 必填：复制自 RedVault 服务启动日志） ══════════════ */
  const CONFIG = {
    SERVER: 'http://127.0.0.1:3789',
    TOKEN: '',                                    // ← 填你的 token，形如 rv_xxxxxxxxxxxx
    SCROLL_GAP: () => 1600 + Math.random() * 900, // 每轮滚动间隔 1.6~2.5s（限速抖动）
    STAGNANT_LIMIT: 4,                            // 连续 N 轮无新增 → 判定翻到底
    REPORT_BATCH: 10,                             // 每批上报条数（服务端逐条抓详情）
    REPORT_TIMEOUT: 300000                        // 单批超时 5min（10 条 × ~3s + 余量）
  };

  /* ══════════════ 清单吸收器：只读 hook 列表接口响应 ══════════════ */
  const LIST_API_RE = /\/api\/sns\/web\/[^"']*(?:collect|board|fav)/i;
  const entries = new Map();   // note_id → { note_id, xsec_token, title, type, author, cover, liked }
  let listHasMore = true;      // 最近一次列表响应的 has_more（判停信号）

  function absorbNoteCard(c) {
    if (!c || typeof c !== 'object') return null;
    const noteId = c.note_id || c.noteId || c.id || '';
    const xsec = c.xsec_token || c.xsecToken || '';
    if (!noteId || !xsec) return null;
    const interact = c.interact_info || c.interactInfo || {};
    return {
      note_id: String(noteId),
      xsec_token: String(xsec),
      title: String(c.display_title || c.displayTitle || c.title || ''),
      type: c.type === 'video' ? 'video' : 'normal',
      author: String((c.user && (c.user.nickname || c.user.nick_name || c.user.nickName)) || ''),
      cover: String((c.cover && (c.cover.url_default || c.cover.urlDefault || c.cover.url)) || ''),
      liked: String(interact.liked_count ?? interact.likedCount ?? '')
    };
  }

  function absorbResponse(json) {
    const data = json && json.data;
    if (!data) return 0;
    const list = data.notes || data.items || (Array.isArray(data) ? data : []);
    let added = 0;
    for (const n of list) {
      const card = n && n.note_card ? n.note_card : n; // collect/page 直出；board 页可能套 note_card
      const e = absorbNoteCard(card);
      if (e && !entries.has(e.note_id)) { entries.set(e.note_id, e); added++; }
    }
    if (typeof data.has_more === 'boolean') listHasMore = data.has_more;
    if (added && panel) setStatus(`已吸收 <b>${entries.size}</b> 条清单（本页新增 ${added}）`);
    return added;
  }

  /* ── hook 必须抢在页面脚本前：unsafeWindow（沙箱 window 劫持不影响页面） ──
     只「读」响应、不「改」响应，页面正常请求不受影响 */
  const pageWin = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  hookFetch(pageWin);
  hookXhr(pageWin);

  function hookFetch(w) {
    const orig = w.fetch;
    if (typeof orig !== 'function') return;
    w.fetch = function (...args) {
      const p = orig.apply(this, args);
      try {
        const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
        if (LIST_API_RE.test(url)) {
          p.then((resp) => resp.clone().json()).then(absorbResponse).catch(() => {});
        }
      } catch (_) {}
      return p;
    };
  }

  function hookXhr(w) {
    const proto = w.XMLHttpRequest && w.XMLHttpRequest.prototype;
    if (!proto) return;
    const origOpen = proto.open;
    proto.open = function (method, url, ...rest) {
      this.__rvUrl = String(url || '');
      return origOpen.call(this, method, url, ...rest);
    };
    const origSend = proto.send;
    proto.send = function (...args) {
      if (LIST_API_RE.test(this.__rvUrl || '')) {
        this.addEventListener('load', () => {
          try { absorbResponse(JSON.parse(this.responseText)); } catch (_) {}
        });
      }
      return origSend.apply(this, args);
    };
  }

  /* ══════════════ 面板 UI（右下角悬浮 · 可拖动折叠） ══════════════ */
  let panel = null, $status, $btnMain, $btnReport;
  let phase = 'idle';          // idle | scrolling | reporting
  let stopFlag = false;
  let panelPos = GM_getValue('rv_panelPos', null);

  function buildPanel() {
    GM_addStyle(`
      #rv-panel { position: fixed; z-index: 99999; right: 20px; bottom: 20px; min-width: 230px;
        background: #fff; border: 1.5px solid #FF2442; border-radius: 12px; padding: 10px 12px;
        font: 12px/1.6 Inter, "PingFang SC", "Microsoft YaHei", sans-serif; color: #18191C;
        box-shadow: 0 8px 24px rgba(0,0,0,.14); user-select: none; }
      #rv-panel .rv-head { display: flex; align-items: center; gap: 6px; cursor: move; font-weight: 600; }
      #rv-panel .rv-logo { width: 8px; height: 8px; border-radius: 50%; background: #FF2442; }
      #rv-panel .rv-fold { margin-left: auto; cursor: pointer; color: #999; padding: 0 4px; }
      #rv-panel .rv-status { margin-top: 6px; color: #555; white-space: pre-line; }
      #rv-panel .rv-count { margin-top: 4px; color: #18191C; font-weight: 600; }
      #rv-panel .rv-btns { margin-top: 8px; display: flex; gap: 6px; }
      #rv-panel button { font: inherit; border: 1px solid #ddd; background: #f7f7f8; border-radius: 8px;
        padding: 3px 10px; cursor: pointer; color: #333; }
      #rv-panel button:hover { border-color: #FF2442; color: #FF2442; }
      #rv-panel button:disabled { opacity: .5; cursor: not-allowed; }
      #rv-panel .rv-ok { color: #10B981; font-weight: 600; }
      #rv-panel .rv-warn { color: #F59E0B; }
      #rv-panel .rv-err { color: #EF4444; }
    `);

    const folded = GM_getValue('rv_folded', false);
    panel = document.createElement('div');
    panel.id = 'rv-panel';
    if (panelPos) { panel.style.left = panelPos.left; panel.style.top = panelPos.top; panel.style.right = 'auto'; panel.style.bottom = 'auto'; }
    panel.innerHTML = `
      <div class="rv-head"><span class="rv-logo"></span>薯藏 RedVault<span class="rv-fold">${folded ? '▾' : '▸'}</span></div>
      <div class="rv-body" style="${folded ? 'display:none' : ''}">
        <div class="rv-count">清单 0 条</div>
        <div class="rv-status">先在小红书打开「我的收藏」，再点开始</div>
        <div class="rv-btns">
          <button id="rv-main">开始批量抓取</button>
          <button id="rv-report" style="display:none">上报</button>
        </div>
      </div>`;
    document.body.appendChild(panel);

    $status = panel.querySelector('.rv-status');
    $btnMain = panel.querySelector('#rv-main');
    $btnReport = panel.querySelector('#rv-report');

    const $fold = panel.querySelector('.rv-fold');
    $fold.onclick = () => {
      const f = !GM_getValue('rv_folded', false);
      GM_setValue('rv_folded', f);
      panel.querySelector('.rv-body').style.display = f ? 'none' : '';
      $fold.textContent = f ? '▾' : '▸';
    };
    $btnMain.onclick = () => (phase === 'scrolling' ? stopScroll() : autoScroll());
    $btnReport.onclick = () => reportAll();
    makeDraggable();

    refreshCount();
    if (!CONFIG.TOKEN) setStatus('<span class="rv-err">未配置 TOKEN</span> 编辑脚本填入 CONFIG.TOKEN（见服务启动日志）');
  }

  function setStatus(html) { if ($status) $status.innerHTML = html; }
  function refreshCount() {
    if (panel) panel.querySelector('.rv-count').textContent = `清单 ${entries.size} 条`;
    if ($btnReport) {
      $btnReport.style.display = (phase === 'idle' && entries.size) ? '' : 'none';
      $btnReport.textContent = `上报 ${entries.size} 条`;
    }
  }

  /* 拖动 + 位置记忆 */
  function makeDraggable() {
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
      panelPos = { left: panel.style.left, top: panel.style.top };
      GM_setValue('rv_panelPos', panelPos);
    });
  }

  /* ══════════════ 自动滚动翻页 ══════════════ */
  function doScroll() {
    window.scrollTo(0, document.documentElement.scrollHeight);
    /* 兜底：SPA 内层滚动容器 */
    let best = null;
    document.querySelectorAll('div,section,main').forEach((el) => {
      if (el.scrollHeight - el.clientHeight > 200 && el.clientHeight > 300) {
        if (!best || el.scrollHeight > best.scrollHeight) best = el;
      }
    });
    if (best) best.scrollTop = best.scrollHeight;
  }

  function stopScroll() { stopFlag = true; }

  async function autoScroll() {
    phase = 'scrolling'; stopFlag = false; $btnMain.textContent = '停止';
    $btnReport.style.display = 'none';
    let stagnant = 0, lastSize = entries.size;
    setStatus('自动滚动中，等待列表翻页…');
    while (!stopFlag) {
      doScroll();
      await sleep(CONFIG.SCROLL_GAP());
      refreshCount();
      if (entries.size === lastSize) stagnant++; else stagnant = 0;
      lastSize = entries.size;
      if (!listHasMore) { setStatus('接口返回 has_more=false，已到最后一页'); break; }
      if (stagnant >= CONFIG.STAGNANT_LIMIT) { setStatus('连续多轮无新增，判定翻到底'); break; }
    }
    phase = 'idle'; $btnMain.textContent = '开始批量抓取';
    refreshCount();
    if (!entries.size) {
      setStatus('<span class="rv-warn">未捕获到收藏列表数据</span> 请确认已打开「我的收藏」页并重新开始');
      return;
    }
    await reportAll();
  }

  /* ══════════════ 批量上报（GM_xmlhttpRequest 绕跨域） ══════════════ */
  function postBatch(batch) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: CONFIG.SERVER + '/api/capture/list',
        headers: { 'Content-Type': 'application/json', 'X-Capture-Token': CONFIG.TOKEN },
        data: JSON.stringify({ notes: batch }),
        timeout: CONFIG.REPORT_TIMEOUT,
        onload: (r) => {
          if (r.status >= 200 && r.status < 300) {
            try { resolve(JSON.parse(r.responseText)); } catch (_) { resolve({ results: [] }); }
          } else if (r.status === 401) {
            reject({ code: 401, message: 'Token 不正确' });
          } else {
            reject({ code: r.status, message: `HTTP ${r.status} ${String(r.responseText || '').slice(0, 80)}` });
          }
        },
        onerror: () => reject({ message: '网络错误（服务未启动？）' }),
        ontimeout: () => reject({ message: '上报超时' })
      });
    });
  }

  async function reportAll() {
    const items = [...entries.values()];
    if (!items.length) return;
    phase = 'reporting'; $btnMain.disabled = true; $btnReport.style.display = 'none';
    let inbox = 0, dup = 0, failed = 0;
    for (let i = 0; i < items.length; i += CONFIG.REPORT_BATCH) {
      const batch = items.slice(i, i + CONFIG.REPORT_BATCH);
      setStatus(`上报 ${Math.min(i + batch.length, items.length)}/${items.length} 批次中…<br>服务端逐条抓正文，每条约 2~3s，请勿关闭页面`);
      try {
        const resp = await postBatch(batch);
        for (const r of resp.results || []) {
          if (r.status === 'inbox') inbox++;
          else if (r.status === 'duplicate') dup++;
          else failed++;
        }
      } catch (e) {
        phase = 'idle'; $btnMain.disabled = false; refreshCount();
        if (e && e.code === 401) setStatus('<span class="rv-err">Token 不正确</span> 请检查脚本内 CONFIG.TOKEN');
        else setStatus(`<span class="rv-err">上报失败</span> ${e.message || e}<br>清单已保留，可点「上报」重试`);
        return;
      }
    }
    phase = 'idle'; $btnMain.disabled = false; refreshCount();
    setStatus(`<span class="rv-ok">完成 ✓</span> 入箱 ${inbox} · 重复 ${dup} · 失败 ${failed}<br>到 RedVault 收件箱确认处理`);
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* document-start 时 body 未就绪，等 DOM 完成再建面板（hook 已先行安装） */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildPanel);
  } else {
    buildPanel();
  }
})();
