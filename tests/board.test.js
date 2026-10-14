'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createBoard } = require('../server/services/board');

test('board builds a stable category tree and preserves note metadata', () => {
  const board = createBoard({
    index: { notes: [
      { note_id: 'n1', title: '早餐', category: '健康', subcategory: '饮食', tags: ['低脂'], type: 'normal', file: '早餐.md' },
      { note_id: 'n2', title: '拉伸', category: '健康', subcategory: '运动', tags: [], type: 'normal', file: '拉伸.md' },
      { note_id: 's1', title: '健康主题', category: '健康', subcategory: '', tags: [], type: 'synthesis', file: '健康主题.md' }
    ] },
    inbox: [{ status: 'pending' }, { status: 'processing' }, { status: 'failed' }, { status: 'done' }]
  });

  assert.equal(board.stats.notes, 3);
  assert.equal(board.stats.domains, 1);
  assert.equal(board.stats.categories, 2);
  assert.deepEqual(board.stats, { notes: 3, domains: 1, categories: 2, pending: 1, processing: 1, failed: 1, totalInbox: 4 });
  assert.ok(board.nodes.some((n) => n.id === 'domain:%E5%81%A5%E5%BA%B7' && n.count === 3));
  assert.ok(board.nodes.some((n) => n.type === 'note' && n.note_id === 's1' && n.note_type === 'synthesis'));
  assert.ok(board.edges.some((e) => e.from === 'subcategory:%E5%81%A5%E5%BA%B7%2F%E9%A5%AE%E9%A3%9F' && e.to === 'note:n1'));
});

test('board tolerates missing categories and malformed tags without writing data', () => {
  const board = createBoard({ index: { notes: [{ note_id: 'n1', title: '', tags: 'bad' }] }, inbox: [] });
  const note = board.nodes.find((n) => n.type === 'note');
  assert.equal(note.label, '未命名');
  assert.deepEqual(note.tags, []);
  assert.equal(note.category, '未分类');
  assert.equal(board.stats.pending, 0);
});
