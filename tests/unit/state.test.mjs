// 單元測試：房間狀態的純函式（座位順序、上線狀態、房主接手、代碼格式、暱稱）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCode, nameOf, isOnline, uniqueName, seatingOrder, shouldClaimHost } from '../../js/state.js';

test('房間代碼只保留英文字母、轉大寫、最多 4 碼', () => {
  assert.equal(normalizeCode('ab-1cD e'), 'ABCD');
  assert.equal(normalizeCode(' xyzwq '), 'XYZW');
  assert.equal(normalizeCode(null), '');
});

test('貼上整個邀請連結時會取出房間代碼', () => {
  assert.equal(normalizeCode('https://sid-en.github.io/Avalon/#WXYZ'), 'WXYZ');
  assert.equal(normalizeCode('https://sid-en.github.io/Avalon/?emu=1#abcd'), 'ABCD');
  assert.equal(normalizeCode('#QRST'), 'QRST');
});

test('找不到玩家名稱時顯示「已離開」', () => {
  assert.equal(nameOf({ players: { a: { name: '亞瑟' } } }, 'a'), '亞瑟');
  assert.equal(nameOf({ players: {} }, 'x'), '（已離開）');
});

test('上線狀態：至少有一個分頁連線才算在線', () => {
  const s = { presence: { a: { at: 1, conns: { c1: true } }, b: { at: 1 }, c: { at: 1, conns: {} } } };
  assert.equal(isOnline(s, 'a'), true);
  assert.equal(isOnline(s, 'b'), false);
  assert.equal(isOnline(s, 'c'), false);
  assert.equal(isOnline(s, 'nobody'), false);
});

test('暱稱重複時自動加上數字，且不超過 12 字', () => {
  const players = { a: { name: '亞瑟' }, b: { name: '亞瑟2' }, c: { name: '一二三四五六七八九十一二' } };
  assert.equal(uniqueName(players, 'me', '梅林'), '梅林');
  assert.equal(uniqueName(players, 'me', '亞瑟'), '亞瑟3');
  assert.equal(uniqueName(players, 'a', '亞瑟'), '亞瑟', '自己的舊名字不算重複');
  const long = uniqueName(players, 'me', '一二三四五六七八九十一二');
  assert.equal(long, '一二三四五六七八九十一2');
  assert.ok(long.length <= 12);
});

test('大廳座位：保留房主排好的順序，新玩家依加入時間排在後面', () => {
  const s = {
    meta: { status: 'lobby' },
    settings: { order: ['c', 'gone', 'a'] },
    players: { a: { joinedAt: 1 }, b: { joinedAt: 3 }, c: { joinedAt: 5 }, d: { joinedAt: 2 } },
  };
  assert.deepEqual(seatingOrder(s), ['c', 'a', 'd', 'b']);
});

test('遊戲中座位以開局時的順序為準', () => {
  const s = { meta: { status: 'playing' }, pub: { order: ['x', 'y'] }, players: { y: {}, x: {}, z: {} }, settings: { order: ['z'] } };
  assert.deepEqual(seatingOrder(s), ['x', 'y']);
});

test('房主所有分頁都離線超過 35 秒，由順位最前面的在線玩家接手', () => {
  const now = 1_000_000;
  const on = { at: now, conns: { c: true } };
  const base = (hostPresence) => ({
    loaded: { presence: true },
    meta: { hostUid: 'h', status: 'lobby', createdAt: now - 120_000 },
    settings: { order: ['h', 'a', 'b'] },
    players: { h: { joinedAt: 1 }, a: { joinedAt: 2 }, b: { joinedAt: 3 } },
    presence: { h: hostPresence, a: on, b: on },
  });
  assert.equal(shouldClaimHost(base(on), 'a', now), false, '房主在線');
  assert.equal(shouldClaimHost(base({ at: now - 60_000, conns: { other: true } }), 'a', now), false, '房主另一個分頁還開著');
  assert.equal(shouldClaimHost(base({ at: now - 10_000 }), 'a', now), false, '剛離線');
  assert.equal(shouldClaimHost(base({ at: now - 40_000 }), 'a', now), true, '離線夠久');
  assert.equal(shouldClaimHost(base({ at: now - 40_000 }), 'b', now), false, '不是第一順位');
  assert.equal(shouldClaimHost(base({ at: now - 40_000 }), 'h', now), false, '房主自己');
  assert.equal(shouldClaimHost(base(undefined), 'a', now), true, '房主沒有上線紀錄');

  const young = base({ at: now - 40_000 });
  young.meta.createdAt = now - 10_000;
  assert.equal(shouldClaimHost(young, 'a', now), false, '房間剛建立');

  const firstOffline = base({ at: now - 40_000 });
  firstOffline.presence.a = { at: now };
  assert.equal(shouldClaimHost(firstOffline, 'b', now), true, '第一順位也離線時換下一位');

  assert.equal(shouldClaimHost(base({ at: now - 40_000 }), 'stranger', now), false, '不是房內玩家');
  const notLoaded = base({ at: now - 40_000 });
  notLoaded.loaded.presence = false;
  assert.equal(shouldClaimHost(notLoaded, 'a', now), false, '上線資料還沒載入');
});
