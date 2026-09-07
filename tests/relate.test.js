'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { relatedNotes, score, bigrams } = require('../server/services/relate');

const mk = (id, o = {}) => ({ note_id: id, title: o.title || id, type: 'normal', category: '', subcategory: '', tags: [], ...o });

test('评分公式各因子', () => {
  const a = mk('a', { tags: ['减脂', '食谱'], category: '健康', subcategory: '减脂饮食', title: '减脂期一周晚餐备餐' });
  // 标签重合 1 → 3
  assert.equal(score(a, mk('b', { tags: ['减脂'] })), 3);
  // 子类相同 +2 → 5
  assert.equal(score(a, mk('c', { tags: ['减脂'], subcategory: '减脂饮食' })), 5);
  // 大类相同 +1 → 6
  assert.equal(score(a, mk('d', { tags: ['减脂'], subcategory: '减脂饮食', category: '健康' })), 6);
  // 标题 bigram 封顶 +2
  assert.equal(score(a, mk('e', { tags: ['减脂'], subcategory: '减脂饮食', category: '健康', title: '减脂期一周晚餐备餐完全版' })), 8);
  // 无任何交集 → 0
  assert.equal(score(a, mk('f', { tags: ['旅行'], category: '旅行', title: '川西环线自驾' })), 0);
});

test('Top 截断与排除自身/合成笔记', () => {
  const target = mk('t', { tags: ['x'], category: 'C', subcategory: 'S', title: '目标笔记标题' });
  const pool = [
    target,
    mk('syn1', { type: 'synthesis', tags: ['x'], category: 'C', subcategory: 'S' }), // 合成笔记不参与
    ...[1, 2, 3, 4, 5, 6].map((i) => mk(`n${i}`, { tags: ['x'], category: 'C', subcategory: 'S', title: `目标笔记标题${i}` }))
  ];
  const rel = relatedNotes(target, pool);
  assert.equal(rel.length, 5);               // Top 5
  assert.ok(!rel.includes('t'));             // 不含自身
  assert.ok(!rel.includes('syn1'));          // 不含合成
  // score>0 过滤
  assert.deepEqual(relatedNotes(target, [mk('zz', { title: '毫无关系' })]), []);
});

test('bigram 中文滑窗', () => {
  assert.deepEqual([...bigrams('减脂')], ['减脂']);
  assert.equal(bigrams('减脂备餐').size, 3);
  assert.equal(bigrams('').size, 0);
});
