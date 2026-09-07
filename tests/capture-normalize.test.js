'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { normalizeCapture, toInt, toIso, cleanDesc } = require('../server/lib/capture-normalize');

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

test('批量清单：xsec_token 溯源字段（capture/list 链路）', () => {
  const { raw } = normalizeCapture({
    note_id: 'n9',
    xsec_token: 'ABcd1234',
    note: { title: '清单条目', desc: 'x', user: { nickName: '作者' }, interactInfo: { likedCount: '3' } }
  });
  assert.equal(raw.xsec_token, 'ABcd1234');
  // 未传时为空串，不影响旧 /api/capture 单条链路
  const { raw: raw2 } = normalizeCapture({ note_id: 'n10', note: { title: 't', desc: 'x' } });
  assert.equal(raw2.xsec_token, '');
});

test('toInt / toIso 边界', () => {
  assert.equal(toInt('8563'), 8563);
  assert.equal(toInt('2.3万'), 23000);
  assert.equal(toInt(undefined, -1), -1);
  assert.equal(toIso(0), '');
  assert.equal(toIso('2026-09-07 10:00:00'), '2026-09-07 10:00:00');
});

test('正文换行保留：SSR 原生 \\n / <br> / 块级标签 → 分段；行内空白压缩；空行压一', () => {
  // SSR desc 原生换行 + \t 空行（实测样本形态）
  assert.equal(
    cleanDesc('📍背景\n我是算法工程师。\n\t\n本周疏于更新。'),
    '📍背景\n我是算法工程师。\n\n本周疏于更新。'
  );
  // <br> 与块级闭合标签 → 换行
  assert.equal(cleanDesc('第一段<br>第二段</p><p>第三段'), '第一段\n第二段\n第三段');
  // 行内空白压单空格，行首尾 trim
  assert.equal(cleanDesc('  多  个   空格 \n \t 制表符行 '), '多 个 空格\n制表符行');
  // 连续空行压缩为一个；实体解码
  assert.equal(cleanDesc('a\n\n\n\nb&nbsp;&amp;&nbsp;c'), 'a\n\nb & c');
  // 纯标签文本不残留
  assert.equal(cleanDesc('<em>重点</em>内容'), '重点内容');
});

test('normalizeCapture：desc 保留换行、tags 去 [话题] 后缀去重、title 兜底省略号', () => {
  const { raw } = normalizeCapture({
    note_id: 'n11',
    note: {
      title: '',
      desc: '第一行\n第二行 #AI工具[话题]# #效率#\n第三行',
      tagList: [{ name: 'AI工具' }]
    }
  });
  assert.equal(raw.desc, '第一行\n第二行 #AI工具[话题]# #效率#\n第三行');   // 正文换行保留（含标签行原文）
  assert.deepEqual(raw.tags, ['AI工具', '效率']);                            // tagList 与正文提取合并去重、无 [话题] 后缀
  // title 兜底取首个非空行，超 50 字加省略号
  const long = 'x'.repeat(60);
  const { raw: r2 } = normalizeCapture({ note_id: 'n12', note: { title: '', desc: long } });
  assert.equal(r2.title, 'x'.repeat(50) + '…');
});

test('视频时长：media.video.duration / capa.duration 多路径容错（实测挂载）', () => {
  // 实测：video.media.video.duration = "418"（字符串）
  const { raw } = normalizeCapture({
    note_id: 'n13',
    note: { noteType: 'video', title: 't', desc: 'x', video: { media: { video: { duration: '418' } }, capa: { duration: 417 } } }
  });
  assert.equal(raw.video.duration, 418);
  // 旧结构兜底：media.duration（原路径保留）
  const { raw: r2 } = normalizeCapture({
    note_id: 'n14',
    note: { noteType: 'video', title: 't', desc: 'x', video: { media: { duration: 620 } } }
  });
  assert.equal(r2.video.duration, 620);
});
