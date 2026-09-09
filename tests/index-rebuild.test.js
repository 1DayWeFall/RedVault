'use strict';

/** M7 启动自检单测（vault.reconcileIndex）：index ↔ vault 一致性
 *  - 一致 → 不重建（避免每次启动全量读盘）
 *  - vault 新增 / 删除文件 → 以 vault 为准重建
 *  - 重复执行幂等；force 可强制重建 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStore } = require('../server/services/store');
const { createVault, reconcileIndex, renderNoteMd } = require('../server/services/vault');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rv-rebuild-'));

function seed(vault, noteId, title) {
  const md = renderNoteMd({ fm: { title, note_id: noteId, type: 'normal', category: '其他' }, body: '正文' });
  return vault.writeNoteFile(title, md);
}

/* reconcileIndex 启动自检会 console.log，测试期间静音保持输出整洁 */
function quiet(fn) {
  const log = console.log, warn = console.warn;
  console.log = () => {}; console.warn = () => {};
  try { return fn(); } finally { console.log = log; console.warn = warn; }
}

test('一致时不重建：文件集合相同 → rebuilt=false 且 index 不动', () => {
  const dir = tmp();
  const store = createStore(dir);
  const vault = createVault(path.join(dir, 'vault'));
  seed(vault, 'n1', '笔记甲');
  seed(vault, 'n2', '笔记乙');
  store.saveIndex({ notes: vault.rebuildIndexMeta() });

  const r = quiet(() => reconcileIndex({ store, vault, log: false }));
  assert.strictEqual(r.rebuilt, false);
  assert.strictEqual(r.files, 2);
  assert.strictEqual(store.readIndex().notes.length, 2);
});

test('vault 新增文件（index 未收录）→ 以 vault 为准重建', () => {
  const dir = tmp();
  const store = createStore(dir);
  const vault = createVault(path.join(dir, 'vault'));
  seed(vault, 'n1', '笔记甲');
  store.saveIndex({ notes: vault.rebuildIndexMeta() });
  seed(vault, 'n2', '外部新增');   /* 模拟 Obsidian 里新建/手工复制进来的笔记 */

  const r = quiet(() => reconcileIndex({ store, vault, log: false }));
  assert.strictEqual(r.rebuilt, true);
  assert.strictEqual(r.added, 1);
  assert.strictEqual(store.readIndex().notes.length, 2);
  assert.ok(store.readIndex().notes.some((n) => n.note_id === 'n2'));
});

test('index 指向已删除的文件 → 重建后不再残留', () => {
  const dir = tmp();
  const store = createStore(dir);
  const vault = createVault(path.join(dir, 'vault'));
  const f1 = seed(vault, 'n1', '笔记甲');
  const f2 = seed(vault, 'n2', '笔记乙');
  store.saveIndex({ notes: vault.rebuildIndexMeta() });
  fs.unlinkSync(path.join(vault.dir, f2));

  const r = quiet(() => reconcileIndex({ store, vault, log: false }));
  assert.strictEqual(r.rebuilt, true);
  assert.strictEqual(r.removed, 1);
  assert.strictEqual(store.readIndex().notes.length, 1);
  assert.strictEqual(store.readIndex().notes[0].note_id, 'n1');
  assert.ok(f1 && f2);
});

test('幂等：连续两次自检，第二次不再重建', () => {
  const dir = tmp();
  const store = createStore(dir);
  const vault = createVault(path.join(dir, 'vault'));
  seed(vault, 'n1', '笔记甲');
  store.saveIndex({ notes: [] });           /* index 空、vault 非空 → 首次必重建 */

  const r1 = quiet(() => reconcileIndex({ store, vault, log: false }));
  const r2 = quiet(() => reconcileIndex({ store, vault, log: false }));
  assert.strictEqual(r1.rebuilt, true);
  assert.strictEqual(r2.rebuilt, false);
});

test('force=true 可强制重建（运维/排障入口）', () => {
  const dir = tmp();
  const store = createStore(dir);
  const vault = createVault(path.join(dir, 'vault'));
  seed(vault, 'n1', '笔记甲');
  store.saveIndex({ notes: vault.rebuildIndexMeta() });

  const r = quiet(() => reconcileIndex({ store, vault, force: true, log: false }));
  assert.strictEqual(r.rebuilt, true);
  assert.strictEqual(store.readIndex().notes.length, 1);
});
