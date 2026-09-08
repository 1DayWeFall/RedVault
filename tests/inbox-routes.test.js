'use strict';

/** 收件箱批量删除测试（DESIGN §6 DELETE /inbox 三种语义）
 *  - 无参 → 清空 pending（旧语义兼容）
 *  - ?scope=failed → 一键清空失败条目
 *  - ?ids=a,b,c → 删除指定条目，不存在的 id 静默忽略
 *  全程临时目录 + 随机端口，不触碰真实 data/ */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const inboxRoutes = require('../server/routes/inbox');
const { createStore } = require('../server/services/store');

const mk = (id, status) => ({
  note_id: id, captured_at: '2026-09-08T10:00:00.000Z', status,
  raw: { title: 't-' + id, desc: 'desc', author: 'a', liked_count: 1, comments: [] }
});

function setup(entries) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-inbox-'));
  const store = createStore(dir);
  entries.forEach((e) => store.addInboxEntry(e));
  const app = express().use(express.json()).use('/api', inboxRoutes({ store, pipeline: { confirm() {} } }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  return { store, server, base, dir };
}

const cleanup = (ctx) => () => {
  ctx.server.close();
  fs.rmSync(ctx.dir, { recursive: true, force: true });
};

test('DELETE /inbox 无参：仅清空 pending（旧语义兼容）', async (t) => {
  const ctx = setup([mk('p1', 'pending'), mk('p2', 'pending'), mk('f1', 'failed'), mk('d1', 'done')]);
  t.after(cleanup(ctx));
  const r = await fetch(ctx.base + '/inbox', { method: 'DELETE' });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(await r.json(), { removed: 2 });
  assert.deepStrictEqual(ctx.store.readInbox().map((x) => x.note_id).sort(), ['d1', 'f1']);
});

test('DELETE /inbox?scope=failed：一键清空失败条目', async (t) => {
  const ctx = setup([mk('p1', 'pending'), mk('f1', 'failed'), mk('f2', 'failed'), mk('d1', 'done')]);
  t.after(cleanup(ctx));
  const r = await fetch(ctx.base + '/inbox?scope=failed', { method: 'DELETE' });
  assert.deepStrictEqual(await r.json(), { removed: 2 });
  assert.deepStrictEqual(ctx.store.readInbox().map((x) => x.note_id).sort(), ['d1', 'p1']);
});

test('DELETE /inbox?ids=：删除指定条目，不存在 id 静默忽略', async (t) => {
  const ctx = setup([mk('p1', 'pending'), mk('f1', 'failed'), mk('d1', 'done')]);
  t.after(cleanup(ctx));
  const r = await fetch(ctx.base + '/inbox?ids=f1,d1,ghost', { method: 'DELETE' });
  assert.deepStrictEqual(await r.json(), { removed: 2 });
  assert.deepStrictEqual(ctx.store.readInbox().map((x) => x.note_id), ['p1']);
});

test('store.removeInboxEntries：空命中返回 0 且不写盘', async (t) => {
  const ctx = setup([mk('p1', 'pending')]);
  t.after(cleanup(ctx));
  assert.strictEqual(ctx.store.removeInboxEntries([]), 0);
  assert.strictEqual(ctx.store.removeInboxEntries(['ghost']), 0);
  assert.strictEqual(ctx.store.readInbox().length, 1);
});
