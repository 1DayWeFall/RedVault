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
let BOARD = null;

async function api(path, opts = {}) {
  const init = { headers: {} };
  if (opts.method) init.method = opts.method;
  if (opts.body !== undefined) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(opts.body); }
  let r;
  try { r = await fetch("/api" + path, init); }
  catch { throw new Error("无法连接本地服务，请双击桌面 RedVault 图标启动后刷新重试"); }
  if (r.status === 204) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && j.error.message) || ("请求失败 " + r.status));
  return j;
}

/* file:// 误开防呆：直接双击 html 文件时 /api 请求必然失败，给出明确指引并终止脚本 */
if (location.protocol === "file:") {
  document.addEventListener("DOMContentLoaded", () => {
    document.body.insertAdjacentHTML("afterbegin",
      '<div style="position:sticky;top:0;z-index:9999;background:#fff3cd;color:#856404;border-bottom:1px solid #ffeeba;padding:10px 16px;font-size:14px;">' +
      '当前是直接打开本地文件，页面无法加载数据。请双击桌面 <b>RedVault</b> 图标，或访问 ' +
      '<a href="http://127.0.0.1:3789">http://127.0.0.1:3789</a></div>');
  });
  throw new Error("file:// protocol is not supported; open http://127.0.0.1:3789 instead");
}

/* 瀑布流高度：按 note_id 稳定伪随机，刷新不跳动 */
const hOf = (id) => 0.95 + (String(id).split("").reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) % 997, 7) % 56) / 100;

/* 封面 URL：本地 vault 附件走 /vault-files 静态路由；远程 URL（图片下载失败时的 cover_url）直用 */
function coverUrl(cover) {
  if (!cover) return "";
  const s = String(cover);
  return /^https?:\/\//.test(s) ? s : "/vault-files/" + encodeURIComponent(s.split("/").pop());
}

/* 服务端 index 元数据 → 视图模型（详情字段由 openDetail 按需填充） */
function mapNote(n) {
  return {
    id: n.note_id, type: n.type || "normal", title: n.title || "未命名", author: n.author || "",
    url: n.url || ("https://www.xiaohongshu.com/explore/" + n.note_id),
    published_at: (n.published_at || "").slice(0, 10), collected_at: (n.collected_at || "").slice(0, 10),
    liked: n.liked_count || 0, category: n.category || "", subcategory: n.subcategory || "",
    tags: n.tags || [], h: hOf(n.note_id), sources: n.sources || [],
    quality_status: n.quality_status || (n.category === "未整理" ? "fallback_unprocessed" : "ai_processed"),
    thumb: coverUrl(n.cover),
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
/* 封面图 <img>：加载成功盖住色块与 emoji；onerror 自动移除，露出底色回退（不裂版） */
const coverImg = (src) => (src ? `<img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : "");
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
      ${badge}<span class="cover-emoji">${isSyn ? "◆" : emojiOf(n)}</span>${coverImg(n.thumb)}
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
  const failN = INBOX.filter((x) => x.status === "failed").length;
  const cost = (pend.length * COST).toFixed(2);
  $("#content").innerHTML = INBOX.length ? `
    <div class="view-head">
      <div><div class="view-title">收件箱</div></div>
      <span class="view-sub">油猴脚本捕获的原始内容，确认后才消耗 AI 额度</span>
      <div class="view-head-actions">
        <button class="btn ${App.selectMode ? "btn-red" : "btn-ghost"}" id="btnSelectMode">${App.selectMode ? "退出多选" : "多选"}</button>
      </div>
    </div>
    <div class="inbox-stats">
      <div class="inbox-stats-item"><b>${pend.length}</b><span>待处理</span></div>
      <div class="inbox-stats-sep"></div>
      <div class="inbox-stats-item"><b>${failN}</b><span>失败</span></div>
      <span class="inbox-stats-cost">◆ 预估 AI 成本 ¥${cost}</span>
      <div style="display:flex;gap:8px;margin-left:10px">
        <button class="btn btn-ai" id="btnConfirmAll" ${pend.length ? "" : "disabled"}>确认处理 ${pend.length} 条</button>
        <button class="btn btn-ghost" id="btnClearInbox" ${pend.length ? "" : "disabled"}>清空待处理</button>
        <button class="btn btn-ghost" id="btnClearFailed" ${failN ? "" : "disabled"}>清空失败${failN ? ` ${failN} 条` : ""}</button>
      </div>
    </div>
    <div class="inbox-list">${INBOX.map((it, i) => inboxCard(it, i)).join("")}</div>
  ` : emptyInbox();

  $("#content").classList.toggle("selecting", App.selectMode);
  const btnSel = $("#btnSelectMode");
  if (btnSel) btnSel.onclick = () => {
    App.selectMode = !App.selectMode;
    if (!App.selectMode) App.selected.clear();
    renderInbox(); updateSelectBar();
  };
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
  if (failN) {
    $("#btnClearFailed").onclick = async () => {
      try {
        const r = await api("/inbox?scope=failed", { method: "DELETE" });
        await loadAll(); renderInbox(); renderSidebar();
        toast(`已清空 ${r.removed} 条失败条目`, "info");
      } catch (e) { toast(e.message || "清空失败", "err"); }
    };
  }
  $$(".inbox-card").forEach((el) => {
    el.onclick = (e) => {
      if (e.target.closest(".mini-btn")) return;
      if (App.selectMode) {
        /* 局部更新选中态，避免整列表重绘抖动（同笔记库） */
        const id = el.dataset.id;
        if (App.selected.has(id)) { App.selected.delete(id); el.classList.remove("selected"); }
        else { App.selected.add(id); el.classList.add("selected"); }
        updateSelectBar();
      } else openPreview(el.dataset.id);
    };
    el.onkeydown = (e) => { if (e.key === "Enter") el.click(); };
  });
  $$(".mini-btn[data-act]").forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const id = b.closest(".inbox-card").dataset.id;
    if (b.dataset.act === "confirm") confirmItems([id]);
    if (b.dataset.act === "retry") retryItems([id]);
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
  return `<div class="inbox-card${App.selected.has(it.id) ? " selected" : ""}" data-id="${it.id}" style="animation-delay:${i * 60}ms" tabindex="0" role="button">
    <span class="cover-check" aria-hidden="true">✓</span>
    <div class="inbox-card-top">
      <div class="cover inbox-thumb" style="--cov:${cov[0]}"><span class="cover-emoji" style="font-size:24px">${cov[1]}</span>${coverImg((r.image_urls || [])[0])}</div>
      <div style="min-width:0;flex:1">
        <h4>${r.type === "video" ? `<span class="cover-badge video" style="position:static;margin-right:6px">视频</span>` : ""}${esc(r.title)}</h4>
        <div class="inbox-card-meta">@${esc(r.author)}<span class="dot"></span>♥ ${fmtK(r.liked_count)}<span class="dot"></span>${it.captured_at} 捕获</div>
      </div>
    </div>
    <div class="inbox-card-desc">${esc(r.desc.slice(0, 90))}${r.desc.length > 90 ? "…" : ""}</div>
    ${it.status === "failed" && it.process?.error ? `<div class="inbox-card-err">${esc(it.process.error)}</div>` : ""}
    <div class="inbox-card-foot">
      <span class="inbox-state ${stCls}"><span class="st-dot"></span>${stTxt}</span>
      <span style="color:var(--ink3);font-size:11px">${(r.comments || []).length} 条评论</span>
      <div class="mini-actions">
        ${it.status === "pending" ? `<button class="mini-btn ai" data-act="confirm">确认</button>` : ""}
        ${it.status === "failed" ? `<button class="mini-btn ai" data-act="retry">重试</button>` : ""}
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
/* ── 看板/交互画布（只读）：数据来自 index，不读取或写入 Vault ── */
function readBoardViewport() {
  try {
    const saved = JSON.parse(localStorage.getItem("redvault.board.viewport") || "{}");
    return {
      zoom: Number.isFinite(Number(saved.zoom)) ? Number(saved.zoom) : 1,
      panX: Number.isFinite(Number(saved.panX)) ? Number(saved.panX) : 0,
      panY: Number.isFinite(Number(saved.panY)) ? Number(saved.panY) : 0,
    };
  } catch (_) {
    return { zoom: 1, panX: 0, panY: 0 };
  }
}
function saveBoardViewport() {
  try {
    localStorage.setItem("redvault.board.viewport", JSON.stringify({ zoom: BOARD_VIEW.zoom, panX: BOARD_VIEW.panX, panY: BOARD_VIEW.panY }));
  } catch (_) { /* private browsing or storage quota: viewport remains session-local */ }
}
const BOARD_VIEW = { q: "", category: "", ...readBoardViewport(), positions: new Map(), drag: null };

async function renderBoard() {
  let data;
  try { data = await api("/board"); BOARD = data; }
  catch (e) {
    $("#content").innerHTML = `<div class="empty"><div class="empty-art">🗺</div><h3>看板暂时不可用</h3><p>${esc(e.message || "无法加载看板数据")}</p></div>`;
    return;
  }
  const stats = data.stats || {}, all = data.nodes || [];
  const categories = [...new Set(all.filter((n) => n.type === "domain").map((n) => n.label))].sort();
  const q = BOARD_VIEW.q.trim().toLowerCase();
  const visible = all.filter((n) => {
    if (BOARD_VIEW.category && n.category !== BOARD_VIEW.category && n.label !== BOARD_VIEW.category) return false;
    if (!q) return true;
    return [n.label, n.category, n.subcategory, ...(n.tags || [])].join(" ").toLowerCase().includes(q);
  });
  const ids = new Set(visible.map((n) => n.id));
  const edges = (data.edges || []).filter((e) => ids.has(e.from) && ids.has(e.to));
  const levels = { domain: 0, subcategory: 1, note: 2 }, byLevel = [[], [], []];
  visible.forEach((n) => byLevel[levels[n.type] ?? 2].push(n));
  const pos = new Map();
  byLevel.forEach((items, level) => items.forEach((n, i) => {
    const old = BOARD_VIEW.positions.get(n.id);
    pos.set(n.id, old || { x: 150 + level * 285, y: 90 + i * 82 });
  }));
  BOARD_VIEW.positions = pos;
  const width = 1000, height = Math.max(460, 150 + Math.max(...byLevel.map((x) => x.length), 1) * 82);
  const point = (id) => pos.get(id) || { x: 0, y: 0 };
  const edgeHtml = edges.map((e) => { const a = point(e.from), b = point(e.to); return `<line class="board-edge" data-from="${esc(e.from)}" data-to="${esc(e.to)}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" />`; }).join("");
  const nodeHtml = visible.map((n) => {
    const p = point(n.id), note = n.type === "note";
    const label = n.label.length > (note ? 18 : 12) ? n.label.slice(0, note ? 18 : 12) + "…" : n.label;
    return `<g class="board-node board-node--${esc(n.type)}${n.quality === "unprocessed" ? " board-node--unprocessed" : ""}" data-node-id="${esc(n.id)}" data-note-id="${note ? esc(n.note_id) : ""}" transform="translate(${p.x},${p.y})" tabindex="0" role="button" aria-label="${esc(n.label)}"><rect x="-104" y="-24" width="208" height="48" rx="12"></rect><text class="board-node-label" text-anchor="middle" y="5">${esc(label)}</text>${note && n.tags?.length ? `<text class="board-node-meta" text-anchor="middle" y="19">${esc(n.tags.slice(0, 2).join(" · "))}</text>` : ""}</g>`;
  }).join("");
  $("#content").innerHTML = `<div class="view-head board-head"><div><div class="view-title">知识看板</div><div class="view-sub">用画布理解你的收藏如何组织成知识结构</div></div><div class="board-stats"><span><b>${stats.notes || 0}</b> 篇笔记</span><span><b>${stats.domains || 0}</b> 个领域</span><span class="board-warn"><b>${(stats.pending || 0) + (stats.failed || 0)}</b> 条待处理</span></div></div><div class="board-toolbar"><input id="boardQuery" value="${esc(BOARD_VIEW.q)}" placeholder="筛选标题、分类或标签…"><div class="board-filters"><button class="board-filter${!BOARD_VIEW.category ? " active" : ""}" data-board-cat="">全部</button>${categories.map((c) => `<button class="board-filter${BOARD_VIEW.category === c ? " active" : ""}" data-board-cat="${esc(c)}">${esc(c)}</button>`).join("")}</div><button class="btn btn-ghost" id="boardReset">重置视图</button></div><div class="board-canvas" id="boardCanvas"><div class="board-empty" ${visible.length ? "hidden" : ""}>没有匹配的笔记</div><svg id="boardSvg" viewBox="0 0 ${width} ${height}" aria-label="知识结构画布"><g id="boardWorld" transform="translate(${BOARD_VIEW.panX},${BOARD_VIEW.panY}) scale(${BOARD_VIEW.zoom})">${edgeHtml}${nodeHtml}</g></svg><div class="board-legend"><span><i class="legend-dot domain"></i>领域</span><span><i class="legend-dot subcategory"></i>子分类</span><span><i class="legend-dot note"></i>笔记</span></div></div>`;
  bindBoardEvents();
}

function bindBoardEvents() {
  const canvas = $("#boardCanvas"), world = $("#boardWorld");
  if (!canvas || !world) return;
  const redrawWorld = () => world.setAttribute("transform", `translate(${BOARD_VIEW.panX},${BOARD_VIEW.panY}) scale(${BOARD_VIEW.zoom})`);
  $("#boardQuery").oninput = (e) => { BOARD_VIEW.q = e.target.value; renderBoard(); };
  $$("[data-board-cat]").forEach((b) => b.onclick = () => { BOARD_VIEW.category = b.dataset.boardCat; renderBoard(); });
  $("#boardReset").onclick = () => { BOARD_VIEW.zoom = 1; BOARD_VIEW.panX = 0; BOARD_VIEW.panY = 0; BOARD_VIEW.positions.clear(); saveBoardViewport(); renderBoard(); };
  $$(".board-node[data-note-id]").forEach((node) => {
    node.onpointerdown = (e) => { e.stopPropagation(); node.setPointerCapture(e.pointerId); const id = node.dataset.nodeId, p = BOARD_VIEW.positions.get(id); BOARD_VIEW.drag = { id, startX: e.clientX, startY: e.clientY, x: p.x, y: p.y, moved: false }; };
    node.onpointermove = (e) => { const d = BOARD_VIEW.drag; if (!d || d.id !== node.dataset.nodeId) return; const dx = (e.clientX - d.startX) / BOARD_VIEW.zoom, dy = (e.clientY - d.startY) / BOARD_VIEW.zoom; if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true; const p = BOARD_VIEW.positions.get(d.id); p.x = d.x + dx; p.y = d.y + dy; node.setAttribute("transform", `translate(${p.x},${p.y})`); $$(".board-edge").forEach((line) => { const a = BOARD_VIEW.positions.get(line.dataset.from), b = BOARD_VIEW.positions.get(line.dataset.to); if (a && b) { line.setAttribute("x1", a.x); line.setAttribute("y1", a.y); line.setAttribute("x2", b.x); line.setAttribute("y2", b.y); } }); };
    node.onpointerup = (e) => { const d = BOARD_VIEW.drag; BOARD_VIEW.drag = null; if (!d?.moved) openDetail(node.dataset.noteId); node.releasePointerCapture?.(e.pointerId); };
    node.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") openDetail(node.dataset.noteId); };
  });
  let pan = null;
  canvas.onpointerdown = (e) => { if (e.target.closest(".board-node")) return; pan = { x: e.clientX, y: e.clientY, px: BOARD_VIEW.panX, py: BOARD_VIEW.panY }; canvas.setPointerCapture(e.pointerId); };
  canvas.onpointermove = (e) => { if (!pan) return; BOARD_VIEW.panX = pan.px + e.clientX - pan.x; BOARD_VIEW.panY = pan.py + e.clientY - pan.y; redrawWorld(); };
  canvas.onpointerup = () => { if (pan) saveBoardViewport(); pan = null; };
  canvas.onpointercancel = () => { if (pan) saveBoardViewport(); pan = null; };
  canvas.onwheel = (e) => { e.preventDefault(); BOARD_VIEW.zoom = Math.max(.55, Math.min(2.2, BOARD_VIEW.zoom * (e.deltaY > 0 ? .92 : 1.08))); saveBoardViewport(); redrawWorld(); };
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
        n.url = d.fm.url || n.url;   /* 带 xsec_token 的完整溯源链接优先（列表兜底是裸地址，会被小红书 300031 拒绝） */
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
  const qualityLabel = n.quality_status === "fallback_unprocessed" ? "原文已保存 · 尚未 AI 整理" : n.quality_status === "partial" ? "AI 整理 · 部分来源不完整" : "AI 整理";
  const qualityClass = n.quality_status === "fallback_unprocessed" ? "quality-badge quality-badge--warn" : "quality-badge";
  const rel = isSyn ? [] : relateOf(n);
  const srcs = isSyn ? (n.sources || []).map((sid) => NOTES.find((x) => x.id === sid)).filter(Boolean) : [];

  $("#drawerDetail").innerHTML = `
    <div class="drawer-topbar">
      <span class="crumb">${isSyn ? "AI 合成笔记" : esc(n.category) + " / " + esc(n.subcategory)}</span><span class="${qualityClass}">${qualityLabel}</span>
      <span class="spacer"></span>
      <button class="mini-btn" id="btnReprocess" title="重跑 AI 打标与排版">↺ 重新打标</button>
      <button class="mini-btn danger" id="btnDelNote">删除</button>
      <button class="close-x" data-close title="关闭 (Esc)">×</button>
    </div>
    <div class="drawer-scroll">
      <div class="detail-hero cover" style="--cov:${isSyn ? "#17171B" : covOf(n)}">
        <span class="cover-emoji"${isSyn ? ' style="color:#fff"' : ""}>${isSyn ? "◆" : emojiOf(n)}</span>${coverImg(n.thumb)}
        ${isSyn ? `<span class="cover-badge syn">◆ AI 合成</span>` : n.type === "video" ? `<span class="cover-badge video">视频笔记</span>` : ""}
      </div>
      <div class="detail-head">
        <h2>${esc(n.title)}</h2>
        <div class="detail-meta">
          ${isSyn ? `<span>AI 生成于 ${esc(n.collected_at)}</span>` : `
            <span>@${esc(n.author)}</span><span class="dot"></span>
            <span>发布 ${esc(n.published_at)}</span><span class="dot"></span>
            <span>♥ ${fmtK(n.liked)}</span>
            <a class="src-btn" href="${esc(n.url)}" target="_blank" rel="noopener" title="链接由小红书授权，约数天有效；若打开显示扫码/登录页：在小红书重扫一次收藏夹即可刷新全部链接">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              溯源原帖</a>
              <span class="link-badge" id="linkBadge" data-note="${esc(id)}" title="实时探测小红书原帖链接死活">检测中…</span>`}
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
  $("#btnReprocess").onclick = async () => {
    const btn = $("#btnReprocess");
    btn.disabled = true; btn.textContent = "重跑中…";
    try {
      const r = await api("/notes/" + encodeURIComponent(id) + "/reprocess", { method: "POST", body: {} });
      Object.assign(n, mapNote(r.note), { __loaded: false });   // 重置详情缓存，openDetail 重新拉取
      renderSidebar();
      if (App.view === "library") renderLibrary();
      await openDetail(id);
      toast("AI 重新打标完成", "ok");
    } catch (e) {
      toast(e.message || "重新打标失败", "err");
    } finally {
      const b = $("#btnReprocess");
      if (b) { b.disabled = false; b.textContent = "↺ 重新打标"; }
    }
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

  /* 溯源链接：惰性检测徽标 + 过期点击拦截（合成笔记无溯源） */
  if (!isSyn) {
    const drawer = $("#drawerDetail");
    const badge = $("#linkBadge");
    const srcBtn = drawer && drawer.querySelector(".src-btn");
    if (badge) {
      probeLinkBadge(id, n);
      badge.onclick = () => badge.dataset.status === "error" && probeLinkBadge(id, n, true);
    }
    if (srcBtn) srcBtn.onclick = (ev) => {
      if (badge && badge.dataset.status === "expired") { ev.preventDefault(); showLinkGuide(n); }
    };
  }
}

/* ── 溯源链接状态检测（单篇惰性，结果服务端缓存） ─────────────────── */
const LINK_BADGE = {
  checking: { cls: "",      text: "检测中…" },
  alive:    { cls: "ok",    text: "链接有效" },
  expired:  { cls: "dead",  text: "链接已过期" },
  login_wall: { cls: "none", text: "服务端不可测 · 浏览器可开" },
  deleted:  { cls: "dead",  text: "原帖可能已删除" },
  error:    { cls: "err",   text: "检测失败 · 点击重试" },
  no_token: { cls: "none",  text: "未带令牌" }
};

async function probeLinkBadge(id, n, refresh = false) {
  const badge = $("#linkBadge");
  if (!badge || badge.dataset.note !== id) return;
  try {
    const j = await api(`/notes/${encodeURIComponent(id)}/link-status${refresh ? "?refresh=1" : ""}`);
    if (!badge.isConnected || badge.dataset.note !== id) return;   /* 抽屉已关/切到别的笔记 */
    const b = LINK_BADGE[j.status] || LINK_BADGE.error;
    badge.dataset.status = j.status;
    badge.className = "link-badge " + b.cls;
    badge.textContent = b.text;
    badge.title = j.message || b.text;
  } catch (e) {
    if (!badge.isConnected || badge.dataset.note !== id) return;
    badge.dataset.status = "error";
    badge.className = "link-badge err";
    badge.textContent = "检测失败 · 点击重试";
    badge.title = e.message || "探测请求失败";
  }
}

/* 过期引导条：三步重扫续期 + 「仍要打开」逃生口（提示而非阻断） */
function showLinkGuide(n) {
  const drawer = $("#drawerDetail");
  if (!drawer || $("#linkGuide")) return;
  const chips = drawer.querySelector(".detail-chips");
  const div = document.createElement("div");
  div.id = "linkGuide";
  div.className = "link-guide";
  div.innerHTML = `
    <b>溯源链接已过期</b>——小红书访问令牌约数天失效，属正常现象；正文与图片已本地化，不受影响。重扫一次收藏夹即可批量刷新全部链接：
    <span class="lg-steps">① 在 Tampermonkey 中覆盖安装 RedVault 目录下 <code>userscript/xhs_capture.user.js</code>（v0.4.2+）</span>
    <span class="lg-steps">② 打开小红书网页版「我的收藏」</span>
    <span class="lg-steps">③ 在 RedVault 面板点「开始批量抓取」，出现「链接刷新 N」即完成</span>
    <a href="#" class="lg-open">仍要打开原帖 ↗</a>`;
  div.querySelector(".lg-open").onclick = (ev) => { ev.preventDefault(); window.open(n.url, "_blank", "noopener"); };
  chips ? chips.before(div) : drawer.querySelector(".detail-head").append(div);
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
    <div class="cover" style="--cov:${covOf(n)}"><span class="cover-emoji">${n.type === "synthesis" ? "◆" : emojiOf(n)}</span>${coverImg(n.thumb)}</div>
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
        <div class="cover" style="--cov:${cov[0]};width:96px;height:96px;border-radius:12px;flex-shrink:0"><span class="cover-emoji" style="font-size:34px">${cov[1]}</span>${coverImg((r.image_urls || [])[0])}</div>
        <div><h4 style="font-size:15px;font-weight:600;line-height:1.45">${r.type === "video" ? `<span class="cover-badge video" style="position:static;margin-right:6px">视频</span>` : ""}${esc(r.title)}</h4>
        <div class="inbox-card-meta" style="margin-top:6px">@${esc(r.author)}<span class="dot"></span>♥ ${fmtK(r.liked_count)}<span class="dot"></span>${(r.tags || []).map((t) => "#" + esc(t)).join(" ")}</div></div>
      </div>
      <div class="sec sec--gray" style="margin-bottom:12px"><div class="sec-head"><h4>正文全文</h4></div><p style="white-space:pre-line">${esc(r.desc)}</p>
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

async function retryItems(ids) {
  const failed = INBOX.filter((x) => ids.includes(x.id) && x.status === "failed");
  if (!failed.length) return;
  try {
    await api("/inbox/retry", { method: "POST", body: { ids: failed.map((x) => x.id) } });
    failed.forEach((x) => { x.status = "pending"; x.process = null; });
    renderInbox();
    toast(`已将 ${failed.length} 条失败项放回待处理`, "info");
  } catch (e) { toast(e.message || "重试失败", "err"); }
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
    PIPE.failed = st.failed || [];       // M7：失败项此前出队即消失，前端完全看不到
    if (!q.length && !PIPE.expected) return;
    if (!q.length) {
      clearInterval(PIPE.timer); PIPE.timer = null; PIPE.expected = 0;
      const failedCount = PIPE.failed.length;
      $("#pipelineLabel").textContent = "处理完成";
      $("#pipelineCount").textContent = failedCount ? `${failedCount} 条失败` : "";
      setTimeout(async () => {
        await loadAll();
        if (App.view === "library") renderLibrary();
        if (App.view === "inbox") renderInbox();
        renderSidebar();
        hidePipeline();
        toast(failedCount ? `处理完成，${failedCount} 条失败（收件箱保留断点，可展开查看原因后重试）` : "管线处理完成，笔记库已刷新",
          failedCount ? "err" : "ok");
        PIPE.failed = [];
      }, 800);
      return;
    }
    renderPipeline(q, PIPE.failed);
  }, 1200);
}

/* 服务端 stage → 4 点进度映射（writing 为 M3 主阶段，M4 细化） */
function renderPipeline(q, failed = []) {
  const bar = $("#pipelineBar");
  bar.hidden = false;
  const total = q.length + failed.length;
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
  }).join("") + (failed || []).map((f) => {
    const title = (INBOX.find((i) => i.id === f.note_id) || {}).title;
    return `<div class="pl-item" title="${esc(f.error || "")}">
      <span class="pl-title">${esc(title || f.note_id)}</span>
      <span class="pl-stage"></span>
      <span style="font-size:11px;color:var(--red);min-width:52px;text-align:right">失败 ↺</span>
    </div>`;
  }).join("");
}
function hidePipeline() { $("#pipelineBar").hidden = true; $("#pipelineBar").classList.remove("open"); $("#pipelinePanel").hidden = true; }

/* ── 多选浮栏 & 合成 ── */
/** 当前视图可参与多选的 id（与渲染口径一致：笔记库=筛选+搜索+排序结果，收件箱=全部条目） */
function visibleSelectIds() {
  return App.view === "library" ? filteredNotes().map((n) => n.id) : INBOX.map((x) => x.id);
}

/** 一键全选/全不选：作用于当前可见列表，已全选中则清空 */
function toggleSelectAll() {
  const ids = visibleSelectIds();
  if (!ids.length) return;
  if (ids.every((id) => App.selected.has(id))) App.selected.clear();
  else ids.forEach((id) => App.selected.add(id));
  if (App.view === "library") renderLibrary(); else renderInbox();
  updateSelectBar();
}

function updateSelectBar() {
  const bar = $("#selectBar");
  bar.hidden = !App.selectMode; // 进入多选即显示（未选中时也可一键全选）
  $("#selectCount").textContent = App.selected.size;
  const lib = App.view === "library";
  const has = App.selected.size > 0;
  $("#btnOpenSynthesize").hidden = !lib || !has;
  $("#btnBatchConfirm").hidden = lib || !has;
  $("#btnBatchDelete").hidden = lib || !has;
  const ids = visibleSelectIds();
  const btnAll = $("#btnToggleAll");
  btnAll.hidden = !ids.length;
  btnAll.textContent = ids.length && ids.every((id) => App.selected.has(id)) ? "全不选" : "全选";
  if (lib) {
    $("#selectCost").textContent = `≈ ¥${(App.selected.size * 0.015 + 0.02).toFixed(2)}`;
  } else {
    const pend = INBOX.filter((x) => App.selected.has(x.id) && x.status === "pending").length;
    $("#batchCost").textContent = `≈ ¥${(pend * COST).toFixed(2)}`;
    $("#btnBatchConfirm").disabled = !pend;
  }
}

/* ── 收件箱批量操作（多选浮栏按钮） ── */
function batchConfirmSelected() {
  const ids = [...App.selected];
  const pend = INBOX.filter((x) => ids.includes(x.id) && x.status === "pending");
  if (!pend.length) { toast("选中项中没有待处理条目", "err"); return; }
  const skipped = ids.length - pend.length;
  App.selected.clear(); updateSelectBar();
  confirmItems(pend.map((x) => x.id));
  if (skipped > 0) toast(`已跳过 ${skipped} 条非待处理条目`, "info");
}

async function batchDeleteSelected() {
  const sel = [...App.selected];
  const items = sel.map((id) => INBOX.find((x) => x.id === id)).filter(Boolean);
  const del = items.filter((x) => x.status !== "processing");
  const proc = items.length - del.length;
  if (!del.length) { toast("选中条目均在处理中，暂不能删除", "err"); return; }
  if (!confirm(`删除选中的 ${del.length} 条收件箱条目？`)) return;
  try {
    const r = await api("/inbox?ids=" + encodeURIComponent(del.map((x) => x.id).join(",")), { method: "DELETE" });
    await loadAll();
    App.selected.clear(); updateSelectBar();
    renderInbox(); renderSidebar();
    toast(`已删除 ${r.removed} 条${proc ? `，跳过 ${proc} 条处理中` : ""}`);
  } catch (e) { toast(e.message || "批量删除失败", "err"); }
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
  else if (App.view === "inbox") renderInbox();
}

/* ── 设置（接真实 /api/settings） ── */
async function openSettings() {
  let cfg = null;
  try { cfg = await api("/settings"); } catch (e) { toast(e.message || "读取设置失败", "err"); }
  const t = cfg?.ai?.text || {}, v = cfg?.ai?.vision || {};
  const ocrSel = (n) => (n === (cfg?.ocr?.enabled ? "1" : "0") ? ' class="on"' : '');

  $("#modalBox").innerHTML = `
    <div class="modal-head"><h3>设置</h3><button class="close-x" data-close>×</button></div>
    <div class="modal-body">
      <div class="slot-card"><div class="slot-head"><span class="tag">文本模型</span><span class="tag ok-tag" data-ok="text" hidden>连通 0ms</span>
        <button class="test-btn" data-test="text">测试连接</button></div>
        <div class="slot-grid">
          <div class="field w2"><label>Base URL</label><input type="text" data-slot="text-base" value="${esc(t.baseUrl)}" placeholder="https://api.example.com/v1"></div>
          <div class="field"><label>API Key</label><input type="text" data-slot="text-key" value="" placeholder="留空不修改，重新输入以更换"></div>
          <div class="field"><label>模型</label><input type="text" data-slot="text-model" value="${esc(t.model)}" placeholder="gpt-4o-mini"></div>
        </div></div>
      <div class="slot-card"><div class="slot-head"><span class="tag">视觉模型（兼任 OCR）</span><span class="tag ok-tag" data-ok="vision" hidden>连通 0ms</span>
        <button class="test-btn" data-test="vision">测试连接</button></div>
        <div class="slot-grid">
          <div class="field w2"><label>Base URL</label><input type="text" data-slot="vision-base" value="${esc(v.baseUrl)}" placeholder="https://open.bigmodel.cn/api/paas/v4"></div>
          <div class="field"><label>API Key</label><input type="text" data-slot="vision-key" value="" placeholder="留空不修改，重新输入以更换"></div>
          <div class="field"><label>模型</label><input type="text" data-slot="vision-model" value="${esc(v.model)}" placeholder="glm-4v-plus"></div>
        </div></div>
      <div class="kv-row" title="开启后：图片文字由本地 Tesseract 识别（免费离线，首次联网下载语言数据约几十 MB），摘要/分类仍走便宜的文本模型，视觉模型可留空。对艺术字/手写体的识别弱于视觉大模型"><span class="k">本地 OCR（免费 · 免视觉 API）</span><span class="v"><span class="seg" id="segOcr"><button data-v="1"${ocrSel("1")}>开启</button><button data-v="0"${ocrSel("0")}>关闭</button></span></span></div>
      <div class="kv-row" title="token 默认只显示掩码；点「显示」才向服务端取明文（M7：GET /settings 不再明文返回）"><span class="k">上报令牌</span><span class="v"><code id="tokenCode">${esc(cfg?.capture?.tokenMasked || "")}</code><button class="link-btn" id="btnRevealToken">显示</button><button class="link-btn" id="btnCopyToken">复制</button><button class="link-btn" id="btnToken">重置</button></span></div>
      <div class="kv-row"><span class="k">vault 路径</span><span class="v"><input type="text" id="vaultPathInput" value="${esc(cfg?.vaultPath || "vault")}" style="width:100%;box-sizing:border-box" placeholder="vault"></span></div>
      <div class="kv-row"><span class="k">脚本安装</span><span class="v"><button class="link-btn" id="btnGuide">查看油猴脚本安装指引 →</button></span></div>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" data-close>取消</button><button class="btn btn-red" id="btnSaveSettings">保存设置</button></div>`;
  $("#overlayModal").hidden = false;

  $$("#segOcr button").forEach((b) => b.onclick = () => { $$("#segOcr button").forEach((x) => x.classList.remove("on")); b.classList.add("on"); });

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

  let revealedToken = "";
  $("#btnRevealToken").onclick = async () => {
    try {
      const r = await api("/settings/token/reveal", { method: "POST" });
      revealedToken = r.token || "";
      $("#tokenCode").textContent = revealedToken;
      toast("已显示 token，请复制后填入油猴脚本 CONFIG.TOKEN", "ok");
    } catch (e) { toast(e.message || "读取 token 失败", "err"); }
  };
  $("#btnCopyToken").onclick = async () => {
    if (!revealedToken) {
      try {
        const r = await api("/settings/token/reveal", { method: "POST" });
        revealedToken = r.token || "";
      } catch (e) { toast(e.message || "读取 token 失败", "err"); return; }
    }
    const token = revealedToken;
    if (!token) { toast("无 token 可复制", "err"); return; }
    try {
      await navigator.clipboard.writeText(token);
      toast("token 已复制，粘贴到油猴脚本 CONFIG.TOKEN", "ok");
    } catch (_) {
      const range = document.createRange();
      range.selectNode($("#tokenCode"));
      const sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(range);
      try { document.execCommand("copy"); toast("token 已复制（请粘贴到脚本 CONFIG.TOKEN）", "ok"); }
      catch (_2) { toast("复制失败，请手动选中复制", "err"); }
    }
  };
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
    const vaultNew = ($("#vaultPathInput")?.value ?? "").trim();
    const vaultOld = cfg?.vaultPath || "vault";
    if (vaultNew && vaultNew !== vaultOld
      && !confirm(`将把全部笔记与附件复制到新 vault 路径：\n  ${vaultOld}  →  ${vaultNew}\n\n新目录中已有同名文件会被覆盖（源目录保留不动）。\n确定切换？`)) return;
    const btn = $("#btnSaveSettings");
    btn.disabled = true;
    const body = {
      ai: {
        text: { baseUrl: val("[data-slot=text-base]"), apiKey: val("[data-slot=text-key]"), model: val("[data-slot=text-model]") },
        vision: { baseUrl: val("[data-slot=vision-base]"), apiKey: val("[data-slot=vision-key]"), model: val("[data-slot=vision-model]") }
      },
      ocr: { enabled: $$("#segOcr button.on")[0]?.dataset.v === "1" },
      vaultPath: ($("#vaultPathInput")?.value ?? "").trim()
    };
    try {
      const r = await api("/settings", { method: "PUT", body });
      closeModal();
      toast(r.vaultChanged ? "vault 路径已切换并迁移，笔记库已更新" : "设置已保存到 data/config.json", "ok");
      if (r.vaultChanged) { await loadAll(); renderSidebar(); if (App.view === "library") renderLibrary(); }
    } catch (e) {
      toast(e.message || "保存失败", "err");
    } finally {
      btn.disabled = false;
    }
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
  App.view = path === "inbox" ? "inbox" : path === "board" ? "board" : "library";
  /* 切视图清空多选状态，避免两个视图选择集互相污染 */
  if (App.selectMode) { App.selectMode = false; App.selected.clear(); updateSelectBar(); }
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
  } else if (App.view === "board") renderBoard();
  else renderInbox();
  renderSidebar();
}

async function boot() {
  window.addEventListener("hashchange", route);

  $("#btnSettings").onclick = openSettings;
  $("#btnExport").onclick = () => {
    const a = document.createElement("a");
    a.href = "/api/export";
    a.download = "redvault-" + new Date().toISOString().slice(0, 10) + ".zip";
    document.body.appendChild(a); a.click(); a.remove();
    toast("已开始导出 vault（.md + attachments），含全部笔记");
  };
  $("#btnCancelSelect").onclick = exitSelectMode;
  $("#btnToggleAll").onclick = toggleSelectAll;
  $("#btnOpenSynthesize").onclick = openSynthesize;
  $("#btnBatchConfirm").onclick = batchConfirmSelected;
  $("#btnBatchDelete").onclick = batchDeleteSelected;
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

