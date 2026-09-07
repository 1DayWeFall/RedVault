'use strict';

/**
 * 油猴上报 payload → 标准收件箱 raw 结构（DESIGN §5.1 → §5.3）
 * 纯函数无 IO；对小红书页面版本差异做多路径字段容错。
 * 校验失败抛 { status, code, message }（Express 错误中间件可直接消费）。
 */

const toInt = (v, dft = 0) => {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.trunc(v));
  if (typeof v === 'string') {
    const s = v.trim();
    const wan = s.match(/^([\d.]+)\s*万$/);
    if (wan) return Math.round(parseFloat(wan[1]) * 10000);
    const digits = s.replace(/[^\d]/g, '');
    if (digits) return parseInt(digits, 10);
  }
  return dft;
};

/** 时间戳(ms/s)或日期串 → ISO 字符串；无法识别返回 '' */
const toIso = (v) => {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
    if (v > 1e12) return new Date(v).toISOString();   // ms
    if (v > 1e9) return new Date(v * 1000).toISOString(); // s
  }
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v; // 已是日期串
    const n = Number(v);
    if (Number.isFinite(n) && n > 1e12) return new Date(n).toISOString();
  }
  return '';
};

const firstString = (...vals) => vals.find((v) => typeof v === 'string' && v.trim() !== '') || '';
const stripHtml = (s) => String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

/** 从正文提取 #话题 标签（tagList 缺失时的兜底） */
const extractHashTags = (desc) => {
  const out = [];
  const re = /#([^\s#]+)/g;
  let m;
  while ((m = re.exec(String(desc || ''))) !== null) {
    const t = m[1].trim();
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= 10) break;
  }
  return out;
};

const normalizeComment = (c) => {
  if (!c || typeof c !== 'object') return null;
  const content = firstString(c.content, c.text);
  if (!content) return null;
  return {
    content: stripHtml(content),
    likes: toInt(c.likes ?? c.like_count ?? c.likeCount),
    author: firstString(c.author, c.user_info?.nickname, c.userInfo?.nickname) || '匿名',
    time: toIso(c.time ?? c.create_time ?? c.createTime),
    replies: Array.isArray(c.replies ?? c.sub_comments ?? c.subComments)
      ? (c.replies ?? c.sub_comments ?? c.subComments).map(normalizeComment).filter(Boolean)
      : []
  };
};

/**
 * @param {object} payload 油猴脚本上报体（note 数据或包了一层的结构）
 * @returns {{ note_id: string, raw: object }}
 */
function normalizeCapture(payload) {
  if (!payload || typeof payload !== 'object') {
    throw { status: 400, code: 'BAD_PAYLOAD', message: '上报体必须是 JSON 对象' };
  }
  // 多路径容错：脚本可能直接发 note，或包在 payload.note / payload.data 里
  const note = payload.note || payload.data || payload;
  const noteId = firstString(payload.note_id, note.noteId, note.note_id, note.id);
  if (!noteId) throw { status: 400, code: 'MISSING_NOTE_ID', message: '缺少 note_id' };

  const desc = stripHtml(firstString(note.desc, note.content, note.description));
  const title = stripHtml(firstString(note.title, note.displayTitle)) || desc.slice(0, 50);
  if (!title) throw { status: 422, code: 'EMPTY_CONTENT', message: '标题与正文均为空，无法入库' };

  const tagList = Array.isArray(note.tagList)
    ? note.tagList.map((t) => (typeof t === 'string' ? t : t?.name)).filter(Boolean)
    : [];
  const tags = [...new Set([...tagList, ...extractHashTags(desc)])];

  const imageList = Array.isArray(note.imageList) ? note.imageList : [];
  const imageUrls = imageList
    .map((img) => firstString(img?.urlDefault, img?.url, img?.original, img?.infoList?.[0]?.url))
    .filter(Boolean);

  const user = note.user || {};
  const interact = note.interactInfo || {};
  const isVideo = note.noteType === 'video' || note.type === 'video';

  const video = isVideo
    ? { duration: toInt(note.video?.media?.duration ?? note.video?.duration), cover: imageUrls[0] || '' }
    : { duration: 0, cover: '' };

  const commentsRaw = Array.isArray(payload.comments) ? payload.comments
    : Array.isArray(note.comments) ? note.comments : [];
  const comments = commentsRaw.map(normalizeComment).filter(Boolean);

  const raw = {
    type: isVideo ? 'video' : 'normal',
    title,
    desc,
    author: firstString(user.nickName, user.nickname, payload.author) || '匿名',
    author_id: firstString(user.userId, user.user_id),
    published_at: toIso(note.time ?? note.publishTime ?? note.create_time),
    liked_count: toInt(interact.likedCount ?? note.likedCount ?? payload.liked_count),
    cover_url: imageUrls[0] || firstString(note.cover, payload.cover_url),
    image_urls: imageUrls,
    video,
    tags,
    comments,
    comments_truncated: payload.comments_truncated === true,
    source_url: firstString(payload.source_url, note.sourceUrl) ||
      `https://www.xiaohongshu.com/explore/${noteId}`
  };
  return { note_id: String(noteId), raw };
}

module.exports = { normalizeCapture, toInt, toIso, stripHtml, extractHashTags };
