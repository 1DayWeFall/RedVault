'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  createVault, renderNoteMd, replaceSection, readSection, safeTitle, uniqueFileName
} = require('../server/services/vault');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rv-test-'));

test('文件名清洗与去重', () => {
  assert.equal(safeTitle('减脂期:一周<晚餐>备餐/食谱?'), '减脂期 一周 晚餐 备餐 食谱');
  assert.equal(safeTitle('  a\nb\tc  '), 'a b c');
  assert.equal(safeTitle('x'.repeat(80)).length, 50);
  assert.equal(safeTitle(''), '未命名');
});

test('同标题去重：title.md → title-2.md', () => {
  const dir = tmp();
  assert.equal(uniqueFileName(dir, '同名笔记'), '同名笔记.md');
  fs.writeFileSync(path.join(dir, '同名笔记.md'), 'x');
  assert.equal(uniqueFileName(dir, '同名笔记'), '同名笔记-2.md');
});

test('渲染模板：锚点区块齐全 + frontmatter 可被 gray-matter 解析', () => {
  const md = renderNoteMd({
    fm: { title: '测试: 标题', note_id: 'n1', type: 'normal', tags: ['a', 'b'], url: 'https://x' },
    summary: '一句话摘要', points: ['p1', 'p2'], body: '正文内容',
    ocr: ['图1文字'], comments: '- 「好」—— 赞 1',
    related: ['另一篇'], remark: ''
  });
  const matter = require('gray-matter');
  const parsed = matter(md);
  assert.equal(parsed.data.title, '测试: 标题');   // 冒号安全存活（js-yaml dump 转义）
  assert.deepEqual(parsed.data.tags, ['a', 'b']);
  for (const key of ['summary', 'points', 'body', 'ocr', 'comments', 'related', 'attachments', 'remark']) {
    assert.ok(md.includes(`<!-- sec:${key} -->`), `缺锚点 sec:${key}`);
  }
  assert.equal(readSection(md, 'summary'), '一句话摘要');
});

test('区块替换：只动目标区块，用户手写内容不丢', () => {
  let md = renderNoteMd({ fm: { title: 't', note_id: 'n1' }, body: '原帖正文', remark: '旧备注' });
  // 模拟用户在文件任意位置手写内容（区块外）
  md = md.replace('## ✏️ 我的备注', '# 用户自己加的一级标题\n\n手写内容不许丢\n\n## ✏️ 我的备注');
  const next = replaceSection(md, 'remark', '新备注');
  assert.notEqual(next, null);
  assert.ok(next.includes('手写内容不许丢'));           // 区块外内容原样
  assert.ok(next.includes('用户自己加的一级标题'));
  assert.equal(readSection(next, 'remark'), '新备注');   // 目标区块已换
  assert.equal(readSection(next, 'body'), '原帖正文');   // 其他区块未动
  assert.equal(replaceSection(md, 'nope', 'x'), null);   // 不存在的锚点
});

test('createVault：写入/更新/重建 index/删除', () => {
  const dir = tmp();
  const v = createVault(dir);

  const md1 = renderNoteMd({ fm: { title: '笔记甲', note_id: 'a1', type: 'normal', category: '健康', tags: ['减脂'] }, body: '内容甲' });
  const f1 = v.writeNoteFile('笔记甲', md1);
  assert.equal(f1, '笔记甲.md');

  const md2 = renderNoteMd({ fm: { title: '笔记甲', note_id: 'a2', type: 'normal' }, body: '内容乙' });
  assert.equal(v.writeNoteFile('笔记甲', md2), '笔记甲-2.md');   // 重名追加

  // 区块编辑：改备注 + frontmatter 打补丁
  v.updateNoteFile(f1, { tags: ['减脂', '食谱'] }, { remark: '第一次备注' });
  const after = v.readNoteFile(f1);
  assert.deepEqual(after.fm.tags, ['减脂', '食谱']);
  assert.ok(after.fm.modified_at);
  assert.ok(after.raw.includes('第一次备注'));

  // 重建 index：以 vault 扫描为准
  const idx = v.rebuildIndexMeta();
  assert.equal(idx.length, 2);
  assert.ok(idx.find((n) => n.note_id === 'a1' && n.file === '笔记甲.md'));

  // 附件清理：写入 a1-1.jpg / a2-1.jpg，删 a1 只清 a1 的
  fs.writeFileSync(path.join(v.attachDir, 'a1-1.jpg'), 'x');
  fs.writeFileSync(path.join(v.attachDir, 'a2-1.jpg'), 'y');
  const cleaned = v.deleteNoteFile(f1, 'a1');
  assert.equal(cleaned, 1);
  assert.ok(fs.existsSync(path.join(v.attachDir, 'a2-1.jpg')));
  assert.ok(!fs.existsSync(path.join(v.attachDir, 'a1-1.jpg')));
});
