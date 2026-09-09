'use strict';

/** M7 读缓存单测（store.js）：mtime 感知缓存的命中、写后立即可见、外部改动失效、损坏回退 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStore } = require('../server/services/store');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rv-cache-'));

test('缓存命中：两次 readIndex 返回同一引用（不再重复解析 JSON）', () => {
  const dir = tmp();
  const store = createStore(dir);
  store.saveIndex({ notes: [{ note_id: 'n1', file: 'a.md' }] });
  const a = store.readIndex();
  const b = store.readIndex();
  assert.strictEqual(a, b);
  assert.strictEqual(a.notes.length, 1);
});

test('写后立即可见：saveIndex / saveInbox / saveConfig 均同步更新缓存', () => {
  const dir = tmp();
  const store = createStore(dir);

  const idx = { notes: [{ note_id: 'n1', file: 'a.md' }] };
  store.saveIndex(idx);
  assert.strictEqual(store.readIndex(), idx, 'saveIndex 后应直接命中刚写入的对象');

  const inbox = [{ note_id: 'p1', status: 'pending', raw: {} }];
  store.saveInbox(inbox);
  assert.strictEqual(store.readInbox(), inbox);
  assert.strictEqual(store.isDuplicate('p1'), true, '写后判重必须立刻可见');

  const cfg = store.readConfig();
  cfg.ocr.enabled = true;
  store.saveConfig(cfg);
  assert.strictEqual(store.readConfig().ocr.enabled, true);
});

test('外部改动文件（mtime 变化）→ 缓存自动失效', () => {
  const dir = tmp();
  const store = createStore(dir);
  store.saveIndex({ notes: [{ note_id: 'n1', file: 'a.md' }] });
  assert.strictEqual(store.readIndex().notes.length, 1);

  fs.writeFileSync(store.paths.index, JSON.stringify({ notes: [{ note_id: 'n1', file: 'a.md' }, { note_id: 'n2', file: 'b.md' }] }));
  fs.utimesSync(store.paths.index, new Date(Date.now() + 2000), new Date(Date.now() + 2000));

  assert.strictEqual(store.readIndex().notes.length, 2, 'mtime 变化后应重新读取');
});

test('文件损坏 → 备份后回退默认结构，不抛错', () => {
  const dir = tmp();
  const store = createStore(dir);
  store.saveIndex({ notes: [{ note_id: 'n1', file: 'a.md' }] });
  fs.writeFileSync(store.paths.index, '{ 这不是合法 JSON');
  fs.utimesSync(store.paths.index, new Date(Date.now() + 2000), new Date(Date.now() + 2000));

  assert.deepStrictEqual(store.readIndex(), { notes: [] });
  const backup = fs.readdirSync(dir).find((f) => f.startsWith('notes_index.json.corrupt-'));
  assert.ok(backup, '损坏文件应被备份');
});

test('配置结构演进：旧配置缺 rag/review 段也能补齐默认值', () => {
  const dir = tmp();
  const store = createStore(dir);
  const cfg = store.readConfig();
  assert.strictEqual(cfg.rag.provider, 'auto');
  assert.strictEqual(cfg.rag.allowRemoteEmbed, true);
  assert.ok(cfg.review.recentDays > 0);
});
