/* ═══ 薯藏 RedVault · Demo（Mock 数据 + 交互） ═══ */
"use strict";

const COV = {
  "美食": ["linear-gradient(135deg,#FFE7CE,#FBCFAB)", "🍝"],
  "健康": ["linear-gradient(135deg,#DDF2E4,#B9E4CE)", "🥗"],
  "穿搭": ["linear-gradient(135deg,#F3E4F7,#DDC2F0)", "🧥"],
  "美妆": ["linear-gradient(135deg,#FDE2E8,#F7C3D2)", "💧"],
  "家居": ["linear-gradient(135deg,#E4ECF7,#C3D4EE)", "🛋"],
  "旅行": ["linear-gradient(135deg,#DFF1F5,#BFE3EC)", "🧭"],
  "学习": ["linear-gradient(135deg,#E6E5FA,#C8C5F2)", "📖"],
  "职场": ["linear-gradient(135deg,#E9E8EF,#CFCCDD)", "💼"],
  "科技": ["linear-gradient(135deg,#E3E9F2,#C4CFDF)", "💾"],
  "理财": ["linear-gradient(135deg,#EAF2E3,#CFE2BA)", "💰"],
  "运动": ["linear-gradient(135deg,#E3F0F9,#C0DCF0)", "🏃"],
};

/* ═══ 数据层：API 封装（demo 假数据已移除，NOTES/INBOX 由服务端加载） ═══ */
let NOTES = [];   // mapNote(服务端 index) 视图模型缓存
let INBOX = [];   // mapInbox(服务端 inbox)

async function api(path, opts = {}) {
  const init = { headers: {} };
  if (opts.method) init.method = opts.method;
  if (opts.body !== undefined) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(opts.body); }
  const r = await fetch("/api" + path, init);
  if (r.status === 204) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && j.error.message) || ("请求失败 " + r.status));
  return j;
}

/* 瀑布流高度：按 note_id 稳定伪随机，刷新不跳动 */
const hOf = (id) => 0.95 + (String(id).split("").reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) % 997, 7) % 56) / 100;

/* 服务端 index 元数据 → 视图模型（详情字段由 openDetail 按需填充） */
function mapNote(n) {
  return {
    id: n.note_id, type: n.type || "normal", title: n.title || "未命名", author: n.author || "",
    url: n.url || ("https://www.xiaohongshu.com/explore/" + n.note_id),
    published_at: (n.published_at || "").slice(0, 10), collected_at: (n.collected_at || "").slice(0, 10),
    liked: n.liked_count || 0, category: n.category || "", subcategory: n.subcategory || "",
    tags: n.tags || [], h: hOf(n.note_id), sources: n.sources || [],
    summary: "", key_points: [], ocr: [], comments: [], remark: "", attachments: [],
  };
}
const mapCm = (c) => ({ text: c.content, likes: c.likes || 0, author: c.author || "", op: false, replies: (c.replies || []).map(mapCm) });
function mapInbox(it) {
  return {
    id: it.note_id, captured_at: (it.captured_at || "").replace("T", " ").slice(5, 16), status: it.status,
    raw: { ...it.raw, comments: (it.raw.comments || []).map(mapCm) },
  };
}

async function loadAll() {
  const [notes, inbox] = await Promise.all([api("/notes"), api("/inbox")]);
  NOTES.length = 0; NOTES.push(...notes.map(mapNote));
  INBOX.length = 0; INBOX.push(...inbox.map(mapInbox));
}

/* 收件箱封面：按标签/标题关键词猜主题配色 */
function covGuess(r) {
  const hay = ((r.tags || []).join(" ") + " " + (r.title || "") + " " + (r.desc || ""));
  const k = Object.keys(COV).find((c) => hay.includes(c));
  return COV[k] || COV["学习"];
}

/* 评论 markdown（vault 区块）→ 结构化（服务端 renderCommentsMd 的逆） */
function parseCommentsMd(md) {
  if (!md || md === "（无）" || md === "（待 AI 整理）") return [];
  const out = [];
  for (const line of md.split("\n")) {
    const m = line.match(/^(\s*)-\s「(.*)」—— 赞 (\d+) @(.*)$/);
    if (!m) continue;
    const c = { text: m[2], likes: +m[3], author: m[4], op: false, replies: [] };
    if (m[1]) { const p = out[out.length - 1]; if (p) p.replies.push(c); }
    else out.push(c);
  }
  return out;
}

/* ── 工具 ── */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtK = (n) => n >= 10000 ? (n / 10000).toFixed(1) + "w" : n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);
const covOf = (n) => (COV[n.category] || [,])[0] || "linear-gradient(135deg,#E8E8EE,#D5D5E2)";
const emojiOf = (n) => n.emoji || (COV[n.category] || [,])[1] || "📝";
/* 楼中楼：高赞回复随父评论一并展示，op = 笔记作者回复 */
const replyHtml = (c) => (c.replies || []).length ? `<div class="c-replies">${c.replies.map((r) => `
          <div class="c-reply"><span class="c-text">${esc(r.text)}</span><span class="c-meta">${r.op ? '<i class="op-tag">作者</i>' : ""}<span class="likes">♥ ${fmtK(r.likes)}</span><span>@${esc(r.author || "匿名")}</span></span></div>`).join("")}</div>` : "";
const STAGES = ["下载图片", "AI 整理", "关联评分", "写入 vault"];
const COST = 0.03;
let SEQ = 100;
const uid = (p) => p + (++SEQ).toString(36) + Date.now().toString(36).slice(-4);
/* ── 全局状态 ── */
const App = {
  view: "library",
  filter: { category: "", subcategory: "", tag: "", q: "", type: "", sort: "collected" },
  selectMode: false,
  selected: new Set(),
  queue: [], // 管线队列 {id,title,stage(0-3),done,failed}
  sessionCost: 0,
};

/* relate 评分（§5.7）：标签 3 分 + 子类 2 + 大类 1 */
function relateOf(note) {
  const others = NOTES.filter((n) => n.id !== note.id && n.type !== undefined);
  const scored = others.map((n) => {
    let s = 0;
    if (note.tags && n.tags) s += 3 * note.tags.filter((t) => n.tags.includes(t)).length;
    if (note.subcategory && n.subcategory === note.subcategory) s += 2;
    if (note.category && n.category === n.category) s += 1;
    return { n, s };
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 4);
  return scored;
}

/* ── Toast ── */
function toast(msg, kind = "ok") {
  const el = document.createElement("div");
  el.className = "toast " + kind;
  const ico = kind === "ok" ? "✓" : kind === "err" ? "!" : "◆";
  el.innerHTML = `<span class="t-ico">${ico}</span><span>${esc(msg)}</span>`;
  $("#toastRegion").appendChild(el);
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 260); }, 2600);
}

/* ── 侧栏 ── */
function renderSidebar() {
  const tree = {};
  NOTES.forEach((n) => {
    if (n.type === "synthesis") return;
    (tree[n.category] = tree[n.category] || {})[n.subcategory] = (tree[n.category][n.subcategory] || 0) + 1;
  });
  const f = App.filter;
  $("#catTree").innerHTML = Object.keys(tree).sort().map((cat) => {
    const subs = Object.entries(tree[cat]).map(([sub, c]) =>
      `<li><button data-cat="${esc(cat)}" data-sub="${esc(sub)}" class="${f.category === cat && f.subcategory === sub ? "active" : ""}">${esc(sub)}<span class="cat-count">${c}</span></button></li>`
    ).join("");
    const total = Object.values(tree[cat]).reduce((a, b) => a + b, 0);
    const open = f.category === cat ? " open" : "";
    const active = f.category === cat && !f.subcategory ? " active" : "";
    return `<li class="cat-item${open}">
      <button class="cat-link${active}" data-cat="${esc(cat)}" data-sub="">
        <svg class="cat-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>
        ${esc(cat)}<span class="cat-count">${total}</span>
      </button>
      <ul class="cat-sub">${subs}</ul>
    </li>`;
  }).join("");

  const tagCount = {};
  NOTES.forEach((n) => (n.tags || []).forEach((t) => (tagCount[t] = (tagCount[t] || 0) + 1)));
  $("#tagCloud").innerHTML = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 14)
    .map(([t, c]) => `<button class="tag-pill${f.tag === t ? " active" : ""}" data-tag="${esc(t)}">${esc(t)} ${c}</button>`).join("");

  $("#synCount").textContent = NOTES.filter((n) => n.type === "synthesis").length;
  $("#statInbox").textContent = INBOX.filter((x) => x.status === "pending").length;
  $("#statNotes").textContent = NOTES.length;
  const badge = $("#inboxBadge");
  badge.hidden = !INBOX.length;
  badge.textContent = INBOX.length;
}

/* ── 卡片 ── */
function noteCard(n, i) {
  const isSyn = n.type === "synthesis";
  const badge = isSyn ? `<span class="cover-badge syn">◆ 合成</span>`
    : n.type === "video" ? `<span class="cover-badge video">视频</span>` : "";
  const h = Math.round(150 * (n.h || 1.2));
  return `<article class="card${isSyn ? " card--syn" : ""}${App.selected.has(n.id) ? " selected" : ""}" data-id="${n.id}" style="animation-delay:${Math.min(i * 40, 360)}ms" tabindex="0" role="button" aria-label="${esc(n.title)}">
    <div class="cover" style="--cov:${covOf(n)};height:${h}px">
      ${badge}<span class="cover-emoji">${isSyn ? "◆" : emojiOf(n)}</span>
      ${n.liked ? `<span class="cover-likes">${fmtK(n.liked)}</span>` : ""}
      <span class="cover-check" aria-hidden="true">✓</span>
    </div>
    <div class="card-body">
      <div class="card-title">${esc(n.title)}</div>
      <div class="card-meta">${esc(isSyn ? "AI 合成" : n.author)}<span class="dot"></span>${esc((n.published_at || n.collected_at || "").slice(5))}</div>
      <div class="card-tags">${(n.tags || []).slice(0, 3).map((t) => `<span>${esc(t)}</span>`).join("")}</div>
    </div>
  </article>`;
}

function filteredNotes() {
  const f = App.filter;
  let list = NOTES.slice();
  if (f.category) list = list.filter((n) => n.category === f.category || (n.type === "synthesis" && false));
  if (f.category && f.subcategory) list = list.filter((n) => n.subcategory === f.subcategory);
  if (f.tag) list = list.filter((n) => (n.tags || []).includes(f.tag));
  if (f.type) list = list.filter((n) => n.type === f.type);
  if (f.q) {
    const q = f.q.toLowerCase();
    list = list.filter((n) => (n.title + (n.summary || "") + (n.tags || []).join() + (n.author || "")).toLowerCase().includes(q));
  }
  const sorters = {
    collected: (a, b) => (b.collected_at || "").localeCompare(a.collected_at || ""),
    published: (a, b) => (b.published_at || "").localeCompare(a.published_at || ""),
    liked: (a, b) => (b.liked || 0) - (a.liked || 0),
  };
  return list.sort(sorters[f.sort] || sorters.collected);
}

function filterChips() {
  const f = App.filter;
  const chips = [];
  const add = (label, key) => chips.push(`<button class="filter-chip" data-clear="${key}"><b>${esc(label)}</b><span class="x">×</span></button>`);
  if (f.category) add(f.subcategory ? `${f.category} / ${f.subcategory}` : f.category, "cat");
  if (f.tag) add(`# ${f.tag}`, "tag");
  if (f.q) add(`搜索「${f.q}」`, "q");
  if (f.type === "synthesis") add("仅合成笔记", "type");
  return chips.length ? `<div class="filter-row">${chips.join("")}</div>` : "";
}

/* ── 笔记库视图 ── */
function renderLibrary() {
  const list = filteredNotes();
  const sel = App.selectMode && App.selected.size;
  $("#content").innerHTML = `
    <div class="view-head">
      <div><div class="view-title">笔记库</div></div>
      <span class="view-sub">${list.length} 篇 · 全部本地存储</span>
      <div class="view-head-actions">
        <button class="btn ${App.selectMode ? "btn-red" : "btn-ghost"}" id="btnSelectMode">${App.selectMode ? "退出多选" : "多选"}</button>
        <select class="sort-select" id="sortSel" aria-label="排序">
          <option value="collected"${App.filter.sort === "collected" ? " selected" : ""}>按收藏时间</option>
          <option value="published"${App.filter.sort === "published" ? " selected" : ""}>按发帖时间</option>
          <option value="liked"${App.filter.sort === "liked" ? " selected" : ""}>按点赞</option>
        </select>
      </div>
    </div>
    ${filterChips()}
    ${list.length ? `<div class="masonry">${list.map((n, i) => noteCard(n, i)).join("")}</div>`
      : `<div class="empty"><div class="empty-art">🗂</div><h3>没有匹配的笔记</h3><p>换个关键词，或清除左侧筛选条件再试。</p></div>`}
  `;
  $("#sortSel").onchange = (e) => { App.filter.sort = e.target.value; renderLibrary(); };
  $("#content").classList.toggle("selecting", App.selectMode);
  $("#btnSelectMode").onclick = () => {
    App.selectMode = !App.selectMode;
    if (!App.selectMode) App.selected.clear();
    renderLibrary(); updateSelectBar();
  };
  $$(".card", $("#content")).forEach((el) => {
    el.onclick = () => {
      const id = el.dataset.id;
      if (App.selectMode) {
        /* 局部更新，避免整列表重绘导致的抖动 */
        if (App.selected.has(id)) { App.selected.delete(id); el.classList.remove("selected"); }
        else { App.selected.add(id); el.classList.add("selected"); }
        updateSelectBar();
      } else openDetail(id);
    };
    el.onkeydown = (e) => { if (e.key === "Enter") el.click(); };
  });
  $$("[data-clear]").forEach((b) => b.onclick = () => {
    const k = b.dataset.clear;
    if (k === "cat") { App.filter.category = ""; App.filter.subcategory = ""; }
    if (k === "tag") App.filter.tag = "";
    if (k === "q") { App.filter.q = ""; $("#searchInput").value = ""; }
    if (k === "type") App.filter.type = "";
    renderSidebar(); renderLibrary();
  });
}

/* ── 收件箱视图 ── */
function renderInbox() {
  const pend = INBOX.filter((x) => x.status === "pending");
  const cost = (pend.length * COST).toFixed(2);
  $("#content").innerHTML = INBOX.length ? `
    <div class="view-head">
      <div><div class="view-title">收件箱</div></div>
      <span class="view-sub">油猴脚本捕获的原始内容，确认后才消耗 AI 额度</span>
    </div>
    <div class="inbox-stats">
      <div class="inbox-stats-item"><b>${pend.length}</b><span>待处理</span></div>
      <div class="inbox-stats-sep"></div>
      <div class="inbox-stats-item"><b>${INBOX.filter((x) => x.status === "failed").length}</b><span>失败</span></div>
      <span class="inbox-stats-cost">◆ 预估 AI 成本 ¥${cost}</span>
      <div style="display:flex;gap:8px;margin-left:10px">
        <button class="btn btn-ai" id="btnConfirmAll" ${pend.length ? "" : "disabled"}>确认处理 ${pend.length} 条</button>
        <button class="btn btn-ghost" id="btnClearInbox" ${pend.length ? "" : "disabled"}>清空待处理</button>
      </div>
    </div>
    <div class="inbox-list">${INBOX.map((it, i) => inboxCard(it, i)).join("")}</div>
  ` : emptyInbox();

  if (pend.length) {
    $("#btnConfirmAll").onclick = () => confirmItems(INBOX.filter((x) => x.status === "pending").map((x) => x.id));
    $("#btnClearInbox").onclick = async () => {
      try {
        await api("/inbox", { method: "DELETE" });
        await loadAll(); renderInbox(); renderSidebar();
        toast("已清空待处理条目", "info");
      } catch (e) { toast(e.message || "清空失败", "err"); }
    };
  }
  $$(".inbox-card").forEach((el) => {
    el.onclick = (e) => { if (e.target.closest(".mini-btn")) return; openPreview(el.dataset.id); };
    el.onkeydown = (e) => { if (e.key === "Enter") openPreview(el.dataset.id); };
  });
  $$(".mini-btn[data-act]").forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const id = b.closest(".inbox-card").dataset.id;
    if (b.dataset.act === "confirm") confirmItems([id]);
    if (b.dataset.act === "del") {
      api("/inbox/" + id, { method: "DELETE" }).then(() => {
        const idx = INBOX.findIndex((x) => x.id === id);
        if (idx >= 0) INBOX.splice(idx, 1);
        renderInbox(); renderSidebar();
        toast("已从收件箱删除");
      }).catch((e) => toast(e.message || "删除失败", "err"));
    }
  });
}

function inboxCard(it, i) {
  const r = it.raw;
  const stMap = { pending: ["待处理", ""], processing: ["处理中", "proc"], done: ["已入库", "ok"], failed: ["失败", "fail"] };
  const [stTxt, stCls] = stMap[it.status] || stMap.pending;
  const cov = covGuess(r);
  return `<div class="inbox-card" data-id="${it.id}" style="animation-delay:${i * 60}ms" tabindex="0" role="button">
    <div class="inbox-card-top">
      <div class="cover inbox-thumb" style="--cov:${cov[0]}"><span class="cover-emoji" style="font-size:24px">${cov[1]}</span></div>
      <div style="min-width:0;flex:1">
        <h4>${r.type === "video" ? `<span class="cover-badge video" style="position:static;margin-right:6px">视频</span>` : ""}${esc(r.title)}</h4>
        <div class="inbox-card-meta">@${esc(r.author)}<span class="dot"></span>♥ ${fmtK(r.liked_count)}<span class="dot"></span>${it.captured_at} 捕获</div>
      </div>
    </div>
    <div class="inbox-card-desc">${esc(r.desc.slice(0, 90))}${r.desc.length > 90 ? "…" : ""}</div>
    <div class="inbox-card-foot">
      <span class="inbox-state ${stCls}"><span class="st-dot"></span>${stTxt}</span>
      <span style="color:var(--ink3);font-size:11px">${(r.comments || []).length} 条评论</span>
      <div class="mini-actions">
        ${it.status === "pending" ? `<button class="mini-btn ai" data-act="confirm">确认</button>` : ""}
        <button class="mini-btn danger" data-act="del">删除</button>
      </div>
    </div>
  </div>`;
}

function emptyInbox() {
  return `<div class="view-head"><div><div class="view-title">收件箱</div></div><span class="view-sub">待处理内容会出现在这里</span></div>
  <div class="empty">
    <div class="empty-art">📥</div>
    <h3>收件箱是空的</h3>
    <p>在小红书浏览时，油猴脚本会自动捕获帖子到收件箱——你确认后才会调用 AI 整理，不浪费一分钱额度。</p>
    <div class="empty-steps">
      <div class="empty-step"><span class="n">1</span><h5>安装 Tampermonkey</h5><p>浏览器扩展商店搜索安装，Edge 与 Chrome 均可。</p></div>
      <div class="empty-step"><span class="n">2</span><h5>安装薯藏捕获脚本</h5><p>设置页「脚本安装指引」里复制，新建用户脚本粘贴。</p></div>
      <div class="empty-step"><span class="n">3</span><h5>正常刷小红书</h5><p>右下角面板显示捕获进度，服务地址 <code>127.0.0.1:3789</code>。</p></div>
    </div>
  </div>`;
}
/* ── 详情抽屉（按需拉取 vault 全文，合并进视图模型） ── */
async function openDetail(id) {
  const n = NOTES.find((x) => x.id === id);
  if (!n) return;
  if (!n.__loaded) {
    try {
      const d = await api("/notes/" + encodeURIComponent(id));
      const s = d.sections || {};
      n.summary = s.summary || n.summary;
      n.key_points = s.points && s.points.length ? s.points : n.key_points;
      n.bodyText = s.body || "";
      n.ocr = s.ocr || [];
      n.subtitle = s.subtitle || "";
      n.comments = parseCommentsMd(s.commentsMd || "");
      n.remark = s.remark && s.remark !== "（空）" ? s.remark : "";
      if (d.fm) {
        n.category = d.fm.category || n.category;
        n.subcategory = d.fm.subcategory || n.subcategory;
        n.overview = s.overview || n.overview;
        n.common = s.common || n.common;
        n.diff = s.diff || n.diff;
        n.todo = s.todo || n.todo;
        n.remark = s.remark && s.remark !== "（空）" ? s.remark : (n.remark || "");
        n.attachments = Array.isArray(d.fm.attachments) ? d.fm.attachments : [];
      }
      n.__loaded = true;
    } catch (e) { toast(e.message || "详情加载失败", "err"); }
  }
  const isSyn = n.type === "synthesis";
  const rel = isSyn ? [] : relateOf(n);
  const srcs = isSyn ? (n.sources || []).map((sid) => NOTES.find((x) => x.id === sid)).filter(Boolean) : [];

  $("#drawerDetail").innerHTML = `
    <div class="drawer-topbar">
      <span class="crumb">${isSyn ? "AI 合成笔记" : esc(n.category) + " / " + esc(n.subcategory)}</span>
      <span class="spacer"></span>
      <button class="mini-btn" id="btnReprocess" title="重跑 AI 打标与排版">↺ 重新打标</button>
      <button class="mini-btn danger" id="btnDelNote">删除</button>
      <button class="close-x" data-close title="关闭 (Esc)">×</button>
    </div>
    <div class="drawer-scroll">
      <div class="detail-hero cover" style="--cov:${isSyn ? "#17171B" : covOf(n)}">
        <span class="cover-emoji"${isSyn ? ' style="color:#fff"' : ""}>${isSyn ? "◆" : emojiOf(n)}</span>
        ${isSyn ? `<span class="cover-badge syn">◆ AI 合成</span>` : n.type === "video" ? `<span class="cover-badge video">视频笔记</span>` : ""}
      </div>
      <div class="detail-head">
        <h2>${esc(n.title)}</h2>
        <div class="detail-meta">
          ${isSyn ? `<span>AI 生成于 ${esc(n.collected_at)}</span>` : `
            <span>@${esc(n.author)}</span><span class="dot"></span>
            <span>发布 ${esc(n.published_at)}</span><span class="dot"></span>
            <span>♥ ${fmtK(n.liked)}</span>
            <a class="src-btn" href="${esc(n.url)}" target="_blank" rel="noopener">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              溯源原帖</a>`}
        </div>
        <div class="detail-chips">
          ${isSyn ? `<span class="chip-cat cat">◆ AI 合成</span>` : `
            <span class="chip-cat cat editable" title="点击修改分类">${esc(n.category)} / ${esc(n.subcategory)}</span>
            ${(n.tags || []).map((t) => `<span class="chip-cat editable" title="点击修改标签">${esc(t)}</span>`).join("")}`}
        </div>
      </div>
      <div class="detail-body">
        ${isSyn ? synSections(n, srcs) : normalSections(n)}
        ${rel.length ? `<div class="sec"><div class="sec-head"><h4>🔗 相关笔记</h4><span style="font-size:11px;color:var(--ink3)">relate 评分 Top ${rel.length}</span></div>
          <div class="rel-row">${rel.map((r) => relCard(r.n)).join("")}</div></div>` : ""}
        ${!isSyn ? attachSection(n) : ""}
        <div class="sec sec--note"><div class="sec-head"><h4>✏️ 我的备注</h4><span style="font-size:11px;color:var(--ink3)">仅写入本地 vault · 自动保存</span></div>
          <textarea id="remarkArea" placeholder="写点想法…（保存进 Markdown 的「我的备注」区块）">${esc(n.remark || "")}</textarea>
        </div>
      </div>
    </div>`;

  const ov = $("#overlayDetail");
  ov.hidden = false;
  document.body.style.overflow = "hidden";

  let t;
  $("#remarkArea").oninput = (e) => {
    n.remark = e.target.value;
    clearTimeout(t);
    t = setTimeout(() => {
      api("/notes/" + encodeURIComponent(id) + "/section", { method: "PATCH", body: { key: "remark", content: n.remark } })
        .then(() => toast("备注已保存到 vault"))
        .catch((e2) => toast(e2.message || "保存失败", "err"));
    }, 700);
  };
  $("#btnReprocess").onclick = () => {
    toast("重新打标将在接入 AI 管线后开放（M4）", "info");
  };
  $("#btnDelNote").onclick = () => {
    if (!confirm(`删除《${n.title}》？\n将同时清理其附件，操作不可恢复。`)) return;
    api("/notes/" + encodeURIComponent(id), { method: "DELETE" }).then(() => {
      const i = NOTES.findIndex((x) => x.id === id);
      if (i >= 0) NOTES.splice(i, 1);
      closeDetail(); renderSidebar();
      App.view === "library" && renderLibrary();
      toast("笔记已删除，附件已清理");
    }).catch((e) => toast(e.message || "删除失败", "err"));
  };
  $$(".rel-card", $("#drawerDetail")).forEach((c) => c.onclick = () => openDetail(c.dataset.id));
  $$(".src-item", $("#drawerDetail")).forEach((c) => c.onclick = () => { closeDetail(); setTimeout(() => openDetail(c.dataset.id), 120); });
  $$("[data-merge]", $("#drawerDetail")).forEach((b) => b.onclick = () => {
    const a = n.attachments.find((x) => x.id === b.dataset.merge);
    if (!a) return;
    api(`/notes/${encodeURIComponent(id)}/attachments/${a.id}/merge`, { method: "POST" })
      .then(() => { toast("附件要点已合并进「补充材料」区块", "ok"); openDetail(id); })
      .catch((e) => toast(e.message || "合并失败（需配置文本/视觉模型）", "err"));
  });
  $$("[data-rmatt]", $("#drawerDetail")).forEach((b) => b.onclick = () => {
    const a = n.attachments.find((x) => x.id === b.dataset.rmatt);
    if (!a) return;
    api(`/notes/${encodeURIComponent(id)}/attachments/${a.id}`, { method: "DELETE" })
      .then(() => { toast("附件已移除", "info"); openDetail(id); })
      .catch((e) => toast(e.message || "移除失败", "err"));
  });
  $$(".chip-cat.editable", $("#drawerDetail")).forEach((c) => c.onclick = () => toast("行内编辑（演示）：保存后仅替换该区块", "info"));
  $("#attDrop") && ($("#attDrop").onclick = () => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".md,.txt,.jpg,.jpeg,.png,.webp,.pdf";
    inp.onchange = async () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      const fd = new FormData();
      fd.append("file", f);
      try {
        const res = await fetch(`/api/notes/${encodeURIComponent(id)}/attachments`, { method: "POST", body: fd });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          toast((j.error && j.error.message) || "上传失败", "err");
          return;
        }
        toast("附件已上传", "ok");
        openDetail(id);
      } catch (e) { toast(e.message || "上传失败", "err"); }
    };
    inp.click();
  });
}

function li(items) { return items.map((x) => `<li>${esc(x)}</li>`).join(""); }

function normalSections(n) {
  return `
    <div class="sec sec--ai"><div class="sec-head"><h4>🧠 AI 摘要</h4></div>
      <p class="sec-quote">${esc(n.summary)}</p></div>
    <div class="sec sec--ai"><div class="sec-head"><h4>🔑 关键要点</h4></div><ul>${li(n.key_points)}</ul></div>
    <div class="sec sec--gray"><div class="sec-head"><h4>📄 原帖正文</h4><span style="font-size:11px;color:var(--ink3)">原文保留 · 不改写</span></div>
      <p>${esc(n.bodyText || n.summary.slice(0, 60) + "……")}</p>
      <p style="margin-top:8px;color:var(--ink3);font-size:12px">完整正文与 ${Math.max(2, (n.ocr || []).length + 2)} 张图片已存入 attachments/，图片位置以 ![图N]() 内联于 Markdown 原文。</p></div>
    ${(n.ocr || []).length ? `<div class="sec"><div class="sec-head"><h4>🖼 图片文字识别</h4><span style="font-size:11px;color:var(--ink3)">视觉模型 OCR</span></div>
      <ul>${li(n.ocr)}</ul></div>` : ""}
    ${n.subtitle ? `<div class="sec"><div class="sec-head"><h4>🎬 视频字幕</h4><span style="font-size:11px;color:var(--ink3)">平台自带字幕</span></div>
      <p class="subtitle-text">${esc(n.subtitle)}</p></div>` : ""}
    ${(n.comments || []).length ? `<div class="sec"><div class="sec-head"><h4>💬 评论精选</h4></div>
      <div style="display:flex;flex-direction:column;gap:8px">${n.comments.map((c) => `
        <div class="comment-item"><span class="c-text">「${esc(c.text)}」</span>
        <span class="c-meta"><span class="likes">♥ ${fmtK(c.likes)}</span><span>@${esc(c.author || "匿名")}</span></span>${replyHtml(c)}</div>`).join("")}</div></div>` : ""}`;
}

function synSections(n, srcs) {
  return `
    <div class="sec sec--ai"><div class="sec-head"><h4>🧭 主题概述</h4></div><p class="sec-quote">${esc(n.overview)}</p></div>
    <div class="sec sec--ai"><div class="sec-head"><h4>🟢 共同要点</h4></div><ul>${li(n.common)}</ul></div>
    <div class="sec"><div class="sec-head"><h4>🟡 分歧与互补观点</h4></div><ul>${li(n.diff)}</ul></div>
    <div class="sec"><div class="sec-head"><h4>✅ 可执行清单</h4></div><ul>${li(n.todo)}</ul></div>
    <div class="sec"><div class="sec-head"><h4>📚 来源</h4><span style="font-size:11px;color:var(--ink3)">点击跳转原笔记</span></div>
      <div class="src-list">${srcs.map((s, i) => `
        <div class="src-item" data-id="${s.id}" role="button" tabindex="0"><span class="n">${i + 1}</span>
          <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.title)}</span>
          <span class="s-arrow">→</span></div>`).join("")}</div></div>`;
}

function relCard(n) {
  return `<div class="rel-card" data-id="${n.id}" role="button" tabindex="0">
    <div class="cover" style="--cov:${covOf(n)}"><span class="cover-emoji">${n.type === "synthesis" ? "◆" : emojiOf(n)}</span></div>
    <div class="rc-title">${esc(n.title)}</div></div>`;
}

function attachSection(n) {
  const atts = n.attachments || [];
  return `<div class="sec"><div class="sec-head"><h4>📎 补充材料</h4><span style="font-size:11px;color:var(--ink3)">PDF / 图片 / 文本 → AI 合并要点</span></div>
    <div class="att-drop" id="attDrop" role="button" tabindex="0">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      拖拽文件到此处，或点击上传（md / pdf / jpg ≤ 20MB）
    </div>
    ${atts.length ? `<div class="att-list">${atts.map((a) => `
      <div class="att-item"><span class="att-ico">${a.ext === ".pdf" ? "📕" : (a.ext || "").match(/jpg|jpeg|png|webp/) ? "🖼" : "📄"}</span>
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.name)}</span>
        <span class="att-meta">${Math.max(1, Math.round((a.size || 0) / 1024))}KB</span>
        ${a.merged ? `<span style="font-size:10.5px;color:var(--ok)">已合并</span>` : `<button class="mini-btn ai" data-merge="${a.id}">◆ AI 合并</button>`}
        <div class="mini-actions"><button class="mini-btn danger" data-rmatt="${a.id}">移除</button></div>
      </div>`).join("")}</div>` : ""}</div>`;
}

function closeDetail() {
  $("#overlayDetail").hidden = true;
  document.body.style.overflow = "";
}

/* ── 收件箱预览 ── */
function openPreview(id) {
  const it = INBOX.find((x) => x.id === id);
  const r = it.raw;
  const cov = covGuess(r);
  $("#modalBox").innerHTML = `
    <div class="modal-head"><h3>捕获预览</h3><span style="font-size:11px;color:var(--ink3)">POST /api/capture · ${it.captured_at}</span><button class="close-x" data-close>×</button></div>
    <div class="modal-body">
      <div style="display:flex;gap:14px;margin-bottom:14px">
        <div class="cover" style="--cov:${cov[0]};width:96px;height:96px;border-radius:12px;flex-shrink:0"><span class="cover-emoji" style="font-size:34px">${cov[1]}</span></div>
        <div><h4 style="font-size:15px;font-weight:600;line-height:1.45">${r.type === "video" ? `<span class="cover-badge video" style="position:static;margin-right:6px">视频</span>` : ""}${esc(r.title)}</h4>
        <div class="inbox-card-meta" style="margin-top:6px">@${esc(r.author)}<span class="dot"></span>♥ ${fmtK(r.liked_count)}<span class="dot"></span>${(r.tags || []).map((t) => "#" + esc(t)).join(" ")}</div></div>
      </div>
      <div class="sec sec--gray" style="margin-bottom:12px"><div class="sec-head"><h4>正文全文</h4></div><p>${esc(r.desc)}</p>
        <p style="margin-top:8px;font-size:12px;color:var(--ink3)">${(r.image_urls || []).length} 张图片将随处理下载并压缩至 attachments/。</p></div>
      <div class="sec"><div class="sec-head"><h4>评论 ${(r.comments || []).length} 条</h4></div>
        <div style="display:flex;flex-direction:column;gap:8px">${(r.comments || []).map((c) => `
          <div class="comment-item"><span class="c-text">「${esc(c.text)}」</span><span class="c-meta"><span class="likes">♥ ${fmtK(c.likes)}</span></span>${replyHtml(c)}</div>`).join("") || "<p>未抓取到评论</p></div></div>"}
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" id="pvDel">删除</button>
      <button class="btn btn-ai" id="pvConfirm">◆ 确认并 AI 整理 · ≈¥${COST.toFixed(2)}</button>
    </div>`;
  $("#overlayModal").hidden = false;
  $("#pvConfirm").onclick = () => { closeModal(); confirmItems([id]); };
  $("#pvDel").onclick = () => {
    api("/inbox/" + id, { method: "DELETE" }).then(() => {
      const idx = INBOX.findIndex((x) => x.id === id);
      if (idx >= 0) INBOX.splice(idx, 1);
      closeModal(); renderInbox(); renderSidebar(); toast("已删除");
    }).catch((e) => toast(e.message || "删除失败", "err"));
  };
}
function closeModal() { $("#overlayModal").hidden = true; $("#modalBox").innerHTML = ""; }
/* ── AI 处理管线（§5.5 状态机 · 轮询服务端 /pipeline/status） ── */
async function confirmItems(ids) {
  const pend = INBOX.filter((x) => ids.includes(x.id) && x.status === "pending");
  if (!pend.length) return;
  try {
    await api("/inbox/confirm", { method: "POST", body: { ids: pend.map((x) => x.id) } });
    PIPE.expected = pend.length;
    pend.forEach((x) => { const i = INBOX.indexOf(x); if (i >= 0) INBOX.splice(i, 1); });
    toast(`已提交 ${pend.length} 条进入处理管线`, "info");
    if (App.view === "inbox") renderInbox();
    renderSidebar();
    pollPipeline();
  } catch (e) {
    toast(e.message || "提交失败", "err");
  }
}

const PIPE = { timer: null, expected: 0 };

/* 轮询管线状态：条目从服务端 queue 消失即已完成（成功后移出收件箱，失败保留断点） */
function pollPipeline() {
  if (PIPE.timer) return;
  $("#pipelineBar").hidden = false;
  PIPE.timer = setInterval(async () => {
    let st;
    try { st = await api("/pipeline/status"); } catch (e) { return; }
    App.sessionCost = st.sessionCost || App.sessionCost;
    const q = st.queue || [];
    if (!q.length && !PIPE.expected) return;
    if (!q.length) {
      clearInterval(PIPE.timer); PIPE.timer = null; PIPE.expected = 0;
      $("#pipelineLabel").textContent = "处理完成";
      $("#pipelineCount").textContent = "";
      setTimeout(async () => {
        await loadAll();
        if (App.view === "library") renderLibrary();
        if (App.view === "inbox") renderInbox();
        renderSidebar();
        hidePipeline();
        toast("管线处理完成，笔记库已刷新", "ok");
      }, 800);
      return;
    }
    renderPipeline(q);
  }, 1200);
}

/* 服务端 stage → 4 点进度映射（writing 为 M3 主阶段，M4 细化） */
function renderPipeline(q) {
  const bar = $("#pipelineBar");
  bar.hidden = false;
  const total = q.length;
  const done = q.filter((x) => x.status === "done" || x.status === "skipped").length;
  $("#pipelineLabel").textContent = done >= total ? "处理完成" : "AI 处理中";
  $("#pipelineCount").textContent = `${done}/${total}`;
  $("#pipelinePanel").innerHTML = q.map((x) => {
    const stageIdx = x.status === "done" || x.status === "skipped" ? STAGES.length : (x.status === "processing" ? 3 : 2);
    const title = (INBOX.find((i) => i.id === x.note_id) || {}).title;
    return `<div class="pl-item">
      <span class="pl-title">${esc(title || x.note_id)}</span>
      <span class="pl-stage">${STAGES.map((s, i) => `<i class="${i < stageIdx ? (stageIdx >= STAGES.length ? "ok" : "on") : ""}" title="${s}"></i>`).join("")}</span>
      <span style="font-size:11px;color:${stageIdx >= STAGES.length ? "var(--ok)" : x.status === "failed" ? "var(--red)" : "var(--ink2)"};min-width:52px;text-align:right">${x.status === "failed" ? "失败 ↺" : stageIdx >= STAGES.length ? "完成 ✓" : STAGES[stageIdx]}</span>
    </div>`;
  }).join("");
}
function hidePipeline() { $("#pipelineBar").hidden = true; $("#pipelineBar").classList.remove("open"); $("#pipelinePanel").hidden = true; }

/* ── 多选浮栏 & 合成 ── */
function updateSelectBar() {
  const bar = $("#selectBar");
  bar.hidden = !(App.selectMode && App.selected.size > 0);
  $("#selectCount").textContent = App.selected.size;
  $("#selectCost").textContent = `≈ ¥${(App.selected.size * 0.015 + 0.02).toFixed(2)}`;
}

function openSynthesize() {
  const sel = [...App.selected].map((id) => NOTES.find((n) => n.id === id)).filter(Boolean);
  if (sel.length < 2) { toast("请至少选择 2 篇笔记", "err"); return; }
  $("#modalBox").innerHTML = `
    <div class="modal-head"><h3><span class="ai-grad-text">◆ AI 主题合成</span></h3><button class="close-x" data-close>×</button></div>
    <div class="modal-body">
      <div class="field" style="font-size:12px;color:var(--ink2)">从 ${sel.length} 篇笔记提炼共同要点、分歧观点与可执行清单，生成一篇可继续编辑的合成笔记。</div>
      <div class="syn-list">${sel.map((n, i) => `
        <div class="syn-item" data-id="${n.id}"><span class="n" style="width:18px;height:18px;border-radius:4px;background:var(--ink-strong);color:#fff;display:grid;place-items:center;font-size:10.5px;font-weight:700;flex-shrink:0">${i + 1}</span>
          <span class="t">${esc(n.title)}</span><span class="cat">${esc(n.category || "AI 合成")}</span>
          <button class="mini-btn danger" data-rm="${n.id}">×</button></div>`).join("")}</div>
      <div class="field"><label>主题（可选，留空由 AI 提炼）</label>
        <input type="text" id="synTheme" placeholder="例如：减脂期的一周安排"></div>
      <div class="cost-line"><span>◆</span>上下文约 ${(sel.length * 1.2).toFixed(1)}k 字 · 预估成本 <b>¥${(sel.length * 0.015 + 0.02).toFixed(2)}</b> · 本会话累计 ¥${App.sessionCost.toFixed(2)}</div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" data-close>取消</button>
      <button class="btn btn-ai" id="synGo">◆ 开始生成</button>
    </div>`;
  $("#overlayModal").hidden = false;

  $$("[data-rm]").forEach((b) => b.onclick = () => {
    App.selected.delete(b.dataset.rm);
    closeModal(); updateSelectBar();
    if (App.selected.size >= 2) openSynthesize();
    else toast("至少保留 2 篇", "err");
  });
  $("#synGo").onclick = () => runSynthesize(sel);
}

async function runSynthesize(sel) {
  const theme = ($("#synTheme").value || "").trim();
  const steps = ["组装上下文（frontmatter + 摘要 + 要点）", "AI 生成合成正文（P4）", "写入 vault 并更新互链"];
  $("#modalBox").querySelector(".modal-body").innerHTML = `
    <div class="gen-progress">
      <div style="font-size:13px;font-weight:600;margin-bottom:2px">${esc(theme || "AI 正在合成主题笔记…")}</div>
      <div style="font-size:11.5px;color:var(--ink3);margin-bottom:12px">${sel.length} 篇来源 · ${esc(sel.map((s) => (s.category || "合成")).join(" / "))}</div>
      <div class="gen-bar"><i id="genBar"></i></div>
      <div class="gen-steps" style="margin-top:14px">${steps.map((s, i) => `
        <div class="gen-step" data-step="${i}"><span class="g-dot">✓</span>${esc(s)}</div>`).join("")}</div>
    </div>`;
  $("#modalBox").querySelector(".modal-foot").innerHTML = `<button class="btn btn-ghost" disabled>生成中…</button>`;
  const stepEls = $$("[data-step]");
  let si = 0;
  const anim = setInterval(() => {
    if (si > 0) { stepEls[si - 1]?.classList.remove("doing"); stepEls[si - 1]?.classList.add("done"); }
    if (si < steps.length) { stepEls[si]?.classList.add("doing"); $("#genBar").style.width = ((si + 1) / steps.length * 100) + "%"; si++; }
  }, 900);
  try {
    const r = await api("/synthesize", { method: "POST", body: { noteIds: sel.map((s) => s.id), theme } });
    clearInterval(anim);
    await loadAll();
    closeModal();
    exitSelectMode();
    renderSidebar();
    if (App.view === "library") renderLibrary();
    toast("合成笔记已生成并入库", "ok");
    setTimeout(() => openDetail(r.note_id), 250);
  } catch (e) {
    clearInterval(anim);
    toast(e.message || "合成失败（请先在设置页配置文本模型）", "err");
    closeModal();
  }
}

function exitSelectMode() {
  App.selectMode = false;
  App.selected.clear();
  updateSelectBar();
  if (App.view === "library") renderLibrary();
}

/* ── 设置（接真实 /api/settings） ── */
async function openSettings() {
  let cfg = null;
  try { cfg = await api("/settings"); } catch (e) { toast(e.message || "读取设置失败", "err"); }
  const t = cfg?.ai?.text || {}, v = cfg?.ai?.vision || {};
  const commentCount = cfg?.capture?.commentCount || 20;
  const ccOn = (n) => (n === commentCount ? ' class="on"' : '');

  $("#modalBox").innerHTML = `
    <div class="modal-head"><h3>设置</h3><button class="close-x" data-close>×</button></div>
    <div class="modal-body">
      <div class="slot-card"><div class="slot-head"><span class="tag">文本模型</span><span class="tag ok-tag" data-ok="text" hidden>连通 0ms</span>
        <button class="test-btn" data-test="text">测试连接</button></div>
        <div class="slot-grid">
          <div class="field w2"><label>Base URL</label><input type="text" data-slot="text-base" value="${esc(t.baseUrl)}" placeholder="https://api.example.com/v1"></div>
          <div class="field"><label>API Key</label><input type="text" data-slot="text-key" value="${esc(t.apiKey)}" placeholder="sk-..."></div>
          <div class="field"><label>模型</label><input type="text" data-slot="text-model" value="${esc(t.model)}" placeholder="gpt-4o-mini"></div>
        </div></div>
      <div class="slot-card"><div class="slot-head"><span class="tag">视觉模型（兼任 OCR）</span><span class="tag ok-tag" data-ok="vision" hidden>连通 0ms</span>
        <button class="test-btn" data-test="vision">测试连接</button></div>
        <div class="slot-grid">
          <div class="field w2"><label>Base URL</label><input type="text" data-slot="vision-base" value="${esc(v.baseUrl)}" placeholder="https://open.bigmodel.cn/api/paas/v4"></div>
          <div class="field"><label>API Key</label><input type="text" data-slot="vision-key" value="${esc(v.apiKey)}" placeholder="sk-..."></div>
          <div class="field"><label>模型</label><input type="text" data-slot="vision-model" value="${esc(v.model)}" placeholder="glm-4v-plus"></div>
        </div></div>
      <div class="kv-row"><span class="k">评论抓取条数</span><span class="v"><span class="seg" id="segComment"><button data-v="10"${ccOn(10)}>10</button><button data-v="20"${ccOn(20)}>20</button><button data-v="50"${ccOn(50)}>50</button></span></span></div>
      <div class="kv-row"><span class="k">上报令牌</span><span class="v"><code>X-Capture-Token: ${esc(cfg?.capture?.token || "")}</code><button class="link-btn" id="btnToken">重置</button></span></div>
      <div class="kv-row"><span class="k">vault 路径</span><span class="v"><input type="text" id="vaultPathInput" value="${esc(cfg?.vaultPath || "vault")}" style="width:100%;box-sizing:border-box" placeholder="vault"></span></div>
      <div class="kv-row"><span class="k">脚本安装</span><span class="v"><button class="link-btn" id="btnGuide">查看油猴脚本安装指引 →</button></span></div>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" data-close>取消</button><button class="btn btn-red" id="btnSaveSettings">保存设置</button></div>`;
  $("#overlayModal").hidden = false;

  $$("#segComment button").forEach((b) => b.onclick = () => { $$("#segComment button").forEach((x) => x.classList.remove("on")); b.classList.add("on"); });

  $$("[data-test]").forEach((b) => b.onclick = async () => {
    b.disabled = true; b.textContent = "测试中…";
    try {
      const r = await api("/settings/test", { method: "POST", body: { slot: b.dataset.test } });
      const ok = $(`[data-ok="${b.dataset.test}"]`);
      ok.hidden = false; ok.textContent = `连通 ${r.latencyMs}ms`;
      toast(`${b.dataset.test === "text" ? "文本" : "视觉"}模型连通 · ${r.model}`, "ok");
    } catch (e) {
      toast(e.message || "连接失败", "err");
    } finally {
      b.disabled = false; b.textContent = "测试连接";
    }
  });

  $("#btnToken").onclick = async () => {
    try {
      await api("/settings", { method: "PUT", body: { capture: { resetToken: true } } });
      toast("令牌已重置，请更新油猴脚本里的 token", "info");
      openSettings();
    } catch (e) { toast(e.message || "重置失败", "err"); }
  };
  $("#btnGuide").onclick = () => openUserscript();
  $("#btnSaveSettings").onclick = async () => {
    const val = (sel) => ($(sel)?.value ?? "").trim();
    const body = {
      ai: {
        text: { baseUrl: val("[data-slot=text-base]"), apiKey: val("[data-slot=text-key]"), model: val("[data-slot=text-model]") },
        vision: { baseUrl: val("[data-slot=vision-base]"), apiKey: val("[data-slot=vision-key]"), model: val("[data-slot=vision-model]") }
      },
      capture: { commentCount: Number($$("#segComment button.on")?.dataset.v || 20) },
      vaultPath: ($("#vaultPathInput")?.value ?? "").trim()
    };
    try {
      const r = await api("/settings", { method: "PUT", body });
      closeModal();
      toast(r.vaultChanged ? "vault 路径已切换并迁移，笔记库已更新" : "设置已保存到 data/config.json", "ok");
      if (r.vaultChanged) { await loadAll(); renderSidebar(); if (App.view === "library") renderLibrary(); }
    } catch (e) { toast(e.message || "保存失败", "err"); }
  };
}

/* ── 油猴脚本安装指引：弹窗展示全文 + 一键复制 + 下载 .user.js ── */
async function openUserscript() {
  $("#modalBox").innerHTML = `
    <div class="modal-head"><h3>油猴脚本安装</h3><button class="close-x" data-close>×</button></div>
    <div class="modal-body">
      <div style="font-size:12px;color:var(--ink2);margin-bottom:10px">1. Chrome/Edge 装 Tampermonkey → 2. 新建用户脚本 → 3. 粘贴全文保存（或直接下载脚本拖入 Tampermonkey）。</div>
      <div id="userscriptBox" style="font-size:12px;color:var(--ink3);text-align:center;padding:24px">加载脚本内容…</div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" data-close>取消</button>
      <button class="btn btn-ghost" id="btnDownloadScript" disabled>下载脚本文件</button>
      <button class="btn btn-red" id="btnCopyScript" disabled>复制脚本全文</button>
    </div>`;
  $("#overlayModal").hidden = false;

  let script = null;
  try {
    const r = await api("/userscript");
    script = r.content;
    $("#userscriptBox").innerHTML = `<textarea readonly style="width:100%;height:320px;box-sizing:border-box;font:11px/1.5 'Consolas','Menlo',monospace;border:1px solid var(--line);border-radius:8px;padding:10px;resize:vertical">${esc(script)}</textarea>`;
    $("#btnDownloadScript").disabled = false;
    $("#btnCopyScript").disabled = false;
  } catch (e) {
    $("#userscriptBox").innerHTML = `<p style="color:var(--red)">脚本加载失败：${esc(e.message || "未知错误")}</p>`;
  }

  $("#btnCopyScript").onclick = async () => {
    if (!script) return;
    try {
      await navigator.clipboard.writeText(script);
      toast("脚本全文已复制到剪贴板", "ok");
    } catch (_) {
      // 剪贴板 API 受限（非 https/localhost）时降级 execCommand
      const ta = $("#userscriptBox textarea");
      ta.focus(); ta.select();
      try { document.execCommand("copy"); toast("脚本全文已复制", "ok"); }
      catch (_2) { toast("复制失败，请手动全选复制", "err"); }
    }
  };

  $("#btnDownloadScript").onclick = () => {
    if (!script) return;
    const blob = new Blob([script], { type: "text/javascript;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "xhs_capture.user.js";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast("已下载 xhs_capture.user.js", "ok");
  };
}

/* ── 路由 & 事件 ── */
function route() {
  const h = location.hash || "#/library";
  const [path, qs] = h.slice(2).split("?");
  App.view = path === "inbox" ? "inbox" : "library";
  $$("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === App.view));
  if (App.view === "library") {
    if (qs) {
      const p = new URLSearchParams(qs);
      App.filter.category = p.get("category") || "";
      App.filter.subcategory = p.get("subcategory") || "";
      App.filter.tag = p.get("tag") || "";
      App.filter.type = p.get("type") || "";
    }
    renderLibrary();
  } else renderInbox();
  renderSidebar();
}

async function boot() {
  window.addEventListener("hashchange", route);

  $("#btnSettings").onclick = openSettings;
  /* ── 导出：当前库全部笔记 → 单文件 Markdown 合集（真实下载，每篇独立区块，互不覆盖） ── */
  const mdComment = (c) => "- 「" + c.text + "」—— 赞 " + c.likes + " @" + (c.author || "匿名") +
    (c.replies || []).map((r) => "\n  - ↳ " + (r.op ? "**[作者]** " : "") + r.text + " —— 赞 " + r.likes + " @" + (r.author || "匿名")).join("");
  const noteToMd = (n) => n.type === "synthesis"
    ? `---\ntitle: ${n.title}\nnote_id: ${n.id}\ntype: synthesis\ntags: [${(n.tags || []).join(", ")}]\nsources: [${(n.sources || []).join(", ")}]\ncollected_at: ${n.collected_at || ""}\n---\n\n## 🧭 主题概述\n${n.overview || ""}\n\n## 🟢 共同要点\n${(n.common || []).map((k) => "- " + k).join("\n")}\n\n## 🟡 分歧与互补\n${(n.diff || []).map((k) => "- " + k).join("\n")}\n\n## ✅ 可执行清单\n${(n.todo || []).map((k) => "- " + k).join("\n")}\n`
    : `---\ntitle: ${n.title}\nurl: ${n.url || ""}\nnote_id: ${n.id}\nauthor: ${n.author || ""}\ntype: ${n.type}\ncategory: ${n.category || ""}\nsubcategory: ${n.subcategory || ""}\ntags: [${(n.tags || []).join(", ")}]\nliked_count: ${n.liked || 0}\npublished_at: ${n.published_at || ""}\ncollected_at: ${n.collected_at || ""}\n---\n\n## 🧠 AI 摘要\n${n.summary || ""}\n\n## 🔑 关键要点\n${(n.key_points || []).map((k) => "- " + k).join("\n")}\n\n## 📄 原帖正文\n${n.bodyText || "（正文全文以原帖为准；vault 版本中图片以 ![图N](attachments/…) 内联）"}\n\n## 🖼 图片文字识别\n${(n.ocr || []).map((o) => "- " + o).join("\n") || "（无）"}\n\n## 💬 评论精选\n${(n.comments || []).map(mdComment).join("\n") || "（无）"}\n\n## ✏️ 我的备注\n${(n.remark || "").trim() || "（空）"}\n`;
  /* ── Obsidian 库导出：逐篇 .md 打包 zip（STORE 不压缩，纯手写无依赖） ──
     同名笔记重复导出 → 文件名相同 → 解压覆盖该篇 = 只更新这一篇；其余文件一律不动。 */
  const CRC_TABLE = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })();
  const crc32 = (s) => { const u = new TextEncoder().encode(s); let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC_TABLE[(c ^ u[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const safeName = (t) => t.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  const vaultName = (n) => (n.collected_at ? n.collected_at + " " : "") + safeName(n.title) + ".md";
  const dosTime = () => { const d = new Date(); return { t: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), d: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() }; };
  const buildZip = (entries) => {
    const enc = new TextEncoder(); const parts = []; const central = []; let offset = 0; const { t: dt, d: dd } = dosTime();
    for (const e of entries) {
      const nameB = enc.encode(e.name); const dataB = enc.encode(e.text); const crc = crc32(e.text);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, 0, true); lh.setUint16(10, dt, true); lh.setUint16(12, dd, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, dataB.length, true); lh.setUint32(22, dataB.length, true);
      lh.setUint16(26, nameB.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), nameB, dataB);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true); ch.setUint16(12, dt, true); ch.setUint16(14, dd, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, dataB.length, true); ch.setUint32(24, dataB.length, true);
      ch.setUint16(28, nameB.length, true); ch.setUint32(38, 0, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), nameB);
      offset += 30 + nameB.length + dataB.length;
    }
    const cdSize = central.reduce((s, p) => s + p.length, 0);
    const eo = new DataView(new ArrayBuffer(22));
    eo.setUint32(0, 0x06054b50, true); eo.setUint16(8, entries.length, true); eo.setUint16(10, entries.length, true);
    eo.setUint32(12, cdSize, true); eo.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(eo.buffer)], { type: "application/zip" });
  };
  const buildIndexMd = () => {
    const rows = NOTES.map((n) => {
      const link = vaultName(n).replace(/\.md$/, "");
      const tags = (n.tags || []).map((t) => "#" + safeName(t).replace(/\s/g, "")).join(" ");
      return `- [[${link}|${n.title}]]${tags ? " · " + tags : ""}`;
    }).join("\n");
    return `# 薯藏 RedVault · 库目录\n\n> 共 ${NOTES.length} 篇 · 导出于 ${new Date().toLocaleDateString("zh-CN")}\n> 用法：把 redvault 文件夹放入 Obsidian 库（或把 Obsidian 库直接指向它）。重复导出解压时选"覆盖"，只会更新同名笔记，其余文件不动。\n\n## 全部笔记\n${rows}\n`;
  };
  $("#btnExport").onclick = () => {
    const a = document.createElement("a");
    a.href = "/api/export";
    a.download = "redvault-" + new Date().toISOString().slice(0, 10) + ".zip";
    document.body.appendChild(a); a.click(); a.remove();
    toast("已开始导出 vault（.md + attachments），含全部笔记");
  };
  $("#btnCancelSelect").onclick = exitSelectMode;
  $("#btnOpenSynthesize").onclick = openSynthesize;
  $("#sideSynthesis").onclick = () => {
    App.filter = { ...App.filter, type: "synthesis" };
    location.hash = "#/library";
    route();
  };

  const si = $("#searchInput");
  si.oninput = () => {
    App.filter.q = si.value.trim();
    if (App.view !== "library") location.hash = "#/library";
    else renderLibrary();
  };
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== si) { e.preventDefault(); si.focus(); }
    if (e.key === "Escape") { if (!$("#overlayModal").hidden) closeModal(); else if (!$("#overlayDetail").hidden) closeDetail(); }
  });

  $$("[data-close]").forEach((el) => el.onclick = () => {
    if ($("#overlayModal").contains(el)) closeModal();
    else closeDetail();
  });

  /* 弹窗内容动态注入，改用事件委托关闭 */
  $("#overlayModal").addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeModal(); });
  $("#overlayDetail").addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeDetail(); });

  $("#pipelineHead").onclick = () => {
    const p = $("#pipelinePanel");
    p.hidden = !p.hidden;
    $("#pipelineBar").classList.toggle("open", !p.hidden);
  };

  document.addEventListener("click", (e) => {
    const cat = e.target.closest("[data-cat]");
    if (cat) {
      App.filter.category = cat.dataset.cat;
      App.filter.subcategory = cat.dataset.sub || "";
      App.filter.type = "";
      if (cat.dataset.sub === "" && cat.closest(".cat-link")) {
        const item = cat.closest(".cat-item");
        const isOpen = item.classList.contains("open");
        $$(".cat-item").forEach((x) => x.classList.remove("open"));
        if (!isOpen) item.classList.add("open");
        if (isOpen) { App.filter.category = cat.dataset.cat; }
      }
      location.hash = "#/library";
      route();
      return;
    }
    const tag = e.target.closest("[data-tag]");
    if (tag) {
      App.filter.tag = App.filter.tag === tag.dataset.tag ? "" : tag.dataset.tag;
      renderSidebar(); renderLibrary();
    }
  });

  /* 首屏：先加载服务端数据再渲染路由 */
  try {
    await loadAll();
  } catch (e) {
    toast("服务未启动或不可达：请先运行 npm start（127.0.0.1:3789）", "err");
  }
  route();
}
document.addEventListener("DOMContentLoaded", boot);

