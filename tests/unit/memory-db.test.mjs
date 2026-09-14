// 單元測試：測試用記憶體資料庫本身的行為要和 Firebase 一致
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryDb, TIMESTAMP } from '../helpers/memory-db.mjs';

test('null 代表刪除，空的上層節點會自動消失', async () => {
  const db = createMemoryDb();
  await db.set('a/b/c', 1);
  await db.set('a/b/c', null);
  assert.equal(await db.get('a'), null);
});

test('多路徑更新：路徑重疊會丟出錯誤（和 Firebase 相同）', async () => {
  const db = createMemoryDb();
  await assert.rejects(db.update('r', { pub: { x: 1 }, 'pub/y': 2 }), /重疊/);
  await db.update('r', { 'pub/x': 1, 'pub/y': 2, draft: null });
  assert.deepEqual(await db.get('r/pub'), { x: 1, y: 2 });
});

test('undefined 會被拒絕，serverTimestamp 會變成數字', async () => {
  const db = createMemoryDb();
  await assert.rejects(db.set('x', { a: undefined }), /undefined/);
  await db.set('t', TIMESTAMP);
  assert.equal(typeof (await db.get('t')), 'number');
});

test('數字鍵物件讀回時會變成陣列（和 Firebase 相同）', async () => {
  const db = createMemoryDb();
  await db.set('arr', ['a', 'b', 'c']);
  assert.deepEqual(await db.get('arr'), ['a', 'b', 'c']);
  await db.set('sparse', { 3: 'x' });
  assert.deepEqual(await db.get('sparse'), { 3: 'x' });
  await db.set('mostly', { 0: 'a', 2: 'c' });
  const v = await db.get('mostly');
  assert.ok(Array.isArray(v));
  assert.equal(v[1], undefined);
});

test('pushKey 依時間排序', () => {
  const db = createMemoryDb();
  const keys = [db.pushKey(), db.pushKey(), db.pushKey()];
  assert.deepEqual([...keys].sort(), keys);
});
