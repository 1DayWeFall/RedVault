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

/** 单行 HTML 剥离：删标签 + 空白压平（title / 评论等单行场景，保持原语义） */
const stripHtmlInline = (s) => String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
/* 兼容旧名引用 */
const stripHtml = stripHtmlInline;

/** 常见 HTML 实体解码（正文场景够用，不引入完整实体表） */
const decodeEntities = (s) => String(s || '')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#0?39;/g, "'");

/**
 * 正文 HTML/文本清洗：保留段落换行（SSR desc 原生 \n；<br>、块级闭合标签 → \n）。
 * 行内空白（含 \t）压缩为单空格；连续空行压为一个空行。
 */
const BLOCK_CLOSE_RE = /<\/(?:p|div|section|article|li|ul|ol|h[1-6]|blockquote|pre)>\s*/gi;
const cleanDesc = (s) => decodeEntities(
  String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(BLOCK_CLOSE_RE, '\n')
    .replace(/<[^>]*>/g, '')
)
  .split('\n')
  .map((line) => line.replace(/\s+/g, ' ').trim())
  .join('\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

/** 从正文提取 #话题 标签（tagList 缺失时的兜底）；去 [话题] 脏后缀 */
const extractHashTags = (desc) => {
  const out = [];
  const re = /#([^\s#]+)/g;
  let m;
  while ((m = re.exec(String(desc || ''))) !== null) {
    const t = m[1].trim().replace(/\[话题\]$/, '').trim();
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

  const desc = cleanDesc(firstString(note.desc, note.content, note.description));
  /* title 兜底：取正文首个非空行前 50 字，超长以 … 结尾 */
  const firstLine = desc.split('\n').find((l) => l.trim()) || '';
  const fallbackTitle = firstLine.length > 50 ? firstLine.slice(0, 50) + '…' : firstLine;
  const title = stripHtmlInline(firstString(note.title, note.displayTitle)) || fallbackTitle;
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
    ? {
        /* 实测挂载：video.media.video.duration / video.capa.duration（字符串数字），mediaV2 内亦有 */
        duration: toInt(
          note.video?.media?.video?.duration
          ?? note.video?.capa?.duration
          ?? note.video?.media?.duration
          ?? note.video?.duration
        ),
        cover: imageUrls[0] || ''
      }
    : { duration: 0, cover: '' };

  const commentsRaw = Array.isArray(payload.comments) ? payload.comments
    : Array.isArray(note.comments) ? note.comments : [];
  const comments = commentsRaw.map(normalizeComment).filter(Boolean);

  /* 视频字幕（§5.5 借鉴 xhs-vault）：payload.subtitle 为 { text, lang }，容错缺失/畸形 */
  const sub = payload.subtitle || payload.subtitles || null;
  const subtitleText = sub && typeof sub === 'object'
    ? String(sub.text ?? sub.content ?? sub.srt ?? '').trim()
    : (typeof sub === 'string' ? sub.trim() : '');
  const subtitleLang = sub && typeof sub === 'object'
    ? String(sub.lang ?? sub.language ?? '').trim()
    : '';

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
    subtitle_text: subtitleText,
    subtitle_lang: subtitleLang,
    tags,
    comments,
    comments_truncated: payload.comments_truncated === true,
    source_url: firstString(payload.source_url, note.sourceUrl) ||
      `https://www.xiaohongshu.com/explore/${noteId}`,
    /* xsec_token 溯源：批量清单/详情抓取失败重试时需要（§5.1） */
    xsec_token: firstString(payload.xsec_token, note.xsecToken, note.xsec_token)
  };
  return { note_id: String(noteId), raw };
}

module.exports = { normalizeCapture, toInt, toIso, stripHtml, stripHtmlInline, cleanDesc, extractHashTags };
