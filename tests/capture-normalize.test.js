'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { normalizeCapture, toInt, toIso } = require('../server/lib/capture-normalize');

test('完整 payload：标准字段全部映射', () => {
  const { note_id, raw } = normalizeCapture({
    note_id: '65f2a1',
    note: {
      noteType: 'normal', title: '减脂备餐', desc: '一周晚餐#减脂#食谱',
      user: { nickName: '阿花', userId: 'u1' },
      interactInfo: { likedCount: '1.2万' },
      time: 1725000000000,
      tagList: [{ name: '减脂' }],
      imageList: [{ urlDefault: 'https://img/1.jpg', width: 1080, height: 1440 }, { url: 'https://img/2.jpg' }],
    },
    comments: [{ content: '照着吃瘦了', like_count: 532, user_info: { nickname: '小白' }, sub_comments: [{ text: '真的吗', likeCount: 3 }] }],
    source_url: 'https://www.xiaohongshu.com/explore/65f2a1'
  });
  assert.equal(note_id, '65f2a1');
  assert.equal(raw.type, 'normal');
  assert.equal(raw.liked_count, 12000);            // "1.2万" → 12000
  assert.equal(raw.author, '阿花');
  assert.ok(raw.published_at.startsWith('2024'));  // ms 时间戳 → ISO
  assert.deepEqual(raw.image_urls, ['https://img/1.jpg', 'https://img/2.jpg']);
  assert.deepEqual(raw.tags, ['减脂', '食谱']);     // tagList + 正文 # 提取去重
  assert.equal(raw.comments[0].likes, 532);
  assert.equal(raw.comments[0].replies[0].author, '匿名');
});

test('容错：字段缺失/结构差异', () => {
  // noteId 驼峰、无 tagList、无 user、desc 带 HTML、likedCount 数字
  const { raw } = normalizeCapture({
    data: { noteId: 'n2', desc: '<em>带标签正文</em>#收藏 #效率' }
  });
  assert.equal(raw.title, '带标签正文#收藏 #效率'.slice(0, 50)); // title 缺失回退 desc
  assert.equal(raw.desc.includes('<em>'), false);                  // HTML 已剥离
  assert.equal(raw.author, '匿名');
  assert.deepEqual(raw.tags, ['收藏', '效率']);
  assert.equal(raw.type, 'normal');
  assert.equal(raw.liked_count, 0);
});

test('视频笔记：type 与 video 字段', () => {
  const { raw } = normalizeCapture({
    note_id: 'n3',
    note: { noteType: 'video', title: '训练跟练', desc: 'x', video: { media: { duration: 620 } }, imageList: [{ urlDefault: 'https://c.jpg' }] }
  });
  assert.equal(raw.type, 'video');
  assert.equal(raw.video.duration, 620);
  assert.equal(raw.video.cover, 'https://c.jpg');
});

test('视频字幕：payload.subtitle {text,lang} → raw.subtitle_text/subtitle_lang', () => {
  const { raw } = normalizeCapture({
    note_id: 'n5',
    note: { noteType: 'video', title: '跟练', desc: 'x' },
    subtitle: { text: '今天讲减脂餐\n第一点控制碳水', lang: 'zh-CN' }
  });
  assert.equal(raw.subtitle_text, '今天讲减脂餐\n第一点控制碳水');
  assert.equal(raw.subtitle_lang, 'zh-CN');
});

test('视频字幕容错：缺失/字符串/畸形均不抛错', () => {
  // 无 subtitle 字段
  let { raw } = normalizeCapture({ note_id: 'n6', note: { noteType: 'video', title: 't', desc: 'x' } });
  assert.equal(raw.subtitle_text, '');
  assert.equal(raw.subtitle_lang, '');
  // subtitle 为纯字符串（兜底）
  ({ raw } = normalizeCapture({ note_id: 'n7', note: { title: 't', desc: 'x' }, subtitle: '纯文本字幕' }));
  assert.equal(raw.subtitle_text, '纯文本字幕');
  // subtitle 为畸形对象（无 text）
  ({ raw } = normalizeCapture({ note_id: 'n8', note: { title: 't', desc: 'x' }, subtitle: { foo: 1 } }));
  assert.equal(raw.subtitle_text, '');
});

test('校验失败：缺 note_id / 空内容', () => {
  assert.throws(() => normalizeCapture({ note: { title: 'x' } }), (e) => e.code === 'MISSING_NOTE_ID');
  assert.throws(() => normalizeCapture({ note_id: 'n4', note: {} }), (e) => e.code === 'EMPTY_CONTENT');
});

test('toInt / toIso 边界', () => {
  assert.equal(toInt('8563'), 8563);
  assert.equal(toInt('2.3万'), 23000);
  assert.equal(toInt(undefined, -1), -1);
  assert.equal(toIso(0), '');
  assert.equal(toIso('2026-09-07 10:00:00'), '2026-09-07 10:00:00');
});
