// 房間：建立／加入、上線狀態、訂閱資料、玩家操作（瀏覽器端 Firebase）
import {
  db, ref, get, set, update, remove, push, onValue, onDisconnect, serverTimestamp,
  query, orderByValue, endAt, limitToFirst, limitToLast,
} from './firebase.js';
import { DEFAULT_SETTINGS, MAX_PLAYERS, randomInt } from './game.js';
import { seatingOrder, uniqueName, isOnline } from './state.js';

export { normalizeCode, nameOf, isOnline, seatingOrder, shouldClaimHost, uniqueName } from './state.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // 不含容易看錯的 I、O
const DAY = 86400000;

export const rref = (code, path) => ref(db, `rooms/${code}${path ? `/${path}` : ''}`);

// 給房主裁判（host.js）使用的資料存取介面
export const hostApi = {
  get: async (path) => (await get(ref(db, path))).val(),
  set: (path, value) => set(ref(db, path), value),
  update: (path, patch) => update(ref(db, path), patch),
  pushKey: (path) => push(ref(db, path)).key,
  serverTimestamp,
};

function randomCode() {
  let code = '';
  for (let i = 0; i < 4; i++) code += CODE_CHARS[randomInt(CODE_CHARS.length)];
  return code;
}

// 清掉超過一天沒有活動的舊房間，讓免費額度的儲存空間保持乾淨
async function cleanupOldRooms() {
  try {
    const snap = await get(query(ref(db, 'roomIndex'), orderByValue(), endAt(Date.now() - DAY - 60000), limitToFirst(10)));
    const codes = [];
    snap.forEach((c) => { codes.push(c.key); });
    await Promise.all(codes.map(async (c) => {
      await remove(ref(db, `rooms/${c}`)).catch(() => {});
      await remove(ref(db, `roomIndex/${c}`)).catch(() => {});
    }));
  } catch { /* 清理失敗不影響遊戲 */ }
}

export async function createRoom(uid, name) {
  cleanupOldRooms();
  for (let i = 0; i < 8; i++) {
    const code = randomCode();
    try {
      // 規則只允許寫入不存在的房間，所以代碼重複時會失敗並換一個
      await set(rref(code, 'meta'), { hostUid: uid, createdAt: serverTimestamp(), lastActive: serverTimestamp(), status: 'lobby' });
    } catch {
      continue;
    }
    await set(rref(code, 'settings'), { ...DEFAULT_SETTINGS, order: [uid] });
    await set(ref(db, `roomIndex/${code}`), serverTimestamp()).catch(() => {});
    await set(rref(code, `players/${uid}`), { name, joinedAt: serverTimestamp() });
    return code;
  }
  throw new Error('建立房間失敗，請檢查網路後再試一次');
}

// 加入房間，回傳最後使用的暱稱（重複時會自動加上數字）
export async function joinRoom(code, uid, name) {
  const metaSnap = await get(rref(code, 'meta'));
  if (!metaSnap.exists()) throw new Error('找不到這個房間，請確認房間代碼');
  const meta = metaSnap.val();
  const meSnap = await get(rref(code, `players/${uid}`));
  if (meSnap.exists()) {
    if (meta.status === 'lobby' && name && meSnap.val().name !== name) return renameSelf(code, uid, name);
    return meSnap.val().name;
  }
  if (meta.status !== 'lobby') throw new Error('這個房間的遊戲已經開始，無法加入');
  if ((await get(rref(code, `kicked/${uid}`))).exists()) throw new Error('你已被房主移出這個房間');

  await set(rref(code, `players/${uid}`), { name, joinedAt: serverTimestamp() });
  const players = (await get(rref(code, 'players'))).val() || {};
  const firstTen = Object.keys(players).sort((a, b) => (players[a].joinedAt || 0) - (players[b].joinedAt || 0)).slice(0, MAX_PLAYERS);
  if (!firstTen.includes(uid)) {
    await remove(rref(code, `players/${uid}`));
    throw new Error(`房間已滿（最多 ${MAX_PLAYERS} 人）`);
  }
  const finalName = uniqueName(players, uid, name);
  if (finalName !== name) await update(rref(code, `players/${uid}`), { name: finalName });
  set(ref(db, `roomIndex/${code}`), serverTimestamp()).catch(() => {});
  return finalName;
}

export async function renameSelf(code, uid, name) {
  const players = (await get(rref(code, 'players'))).val() || {};
  const finalName = uniqueName(players, uid, name);
  await update(rref(code, `players/${uid}`), { name: finalName });
  return finalName;
}

// 上線狀態：每個分頁是一個連線，斷線時 Firebase 伺服器會自動移除
export function startPresence(code, uid) {
  const connRef = push(rref(code, `presence/${uid}/conns`));
  const atRef = rref(code, `presence/${uid}/at`);
  let stopped = false;
  const unsub = onValue(ref(db, '.info/connected'), async (snap) => {
    if (snap.val() !== true || stopped) return;
    try {
      await onDisconnect(connRef).remove();
      await onDisconnect(atRef).set(serverTimestamp());
      await set(connRef, true);
      await set(atRef, serverTimestamp());
    } catch (e) { console.warn('presence', e); }
  });
  return async () => {
    if (stopped) return;
    stopped = true;
    unsub();
    try {
      await onDisconnect(connRef).cancel();
      await onDisconnect(atRef).cancel();
      await remove(connRef);
      await set(atRef, serverTimestamp());
    } catch { /* 已離開房間 */ }
  };
}

// 訂閱房間所有公開資料＋自己的秘密資料
export function watchRoom(code, uid, onChange) {
  const state = { code, uid, loaded: {}, serverOffset: 0, connected: false, everConnected: false };
  let scheduled = false;
  const emit = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; onChange({ ...state, loaded: { ...state.loaded } }); });
  };
  const watch = (key, target) => onValue(
    typeof target === 'string' ? rref(code, target) : target,
    (snap) => {
      state[key] = snap.val();
      state.loaded[key] = true;
      if (key === 'pub') syncDynamic();
      emit();
    },
    (err) => {
      console.warn('watch', key, err.message);
      state[key] = null;
      state.loaded[key] = true;
      emit();
    },
  );

  // 投票與任務的資料路徑會隨回合改變
  const dyn = { voteId: undefined, runId: undefined, voteUn: [], runUn: [] };
  function syncDynamic() {
    const vid = state.pub?.voteId || null;
    const rid = state.pub?.runId || null;
    if (vid !== dyn.voteId) {
      dyn.voteUn.forEach((f) => f());
      dyn.voteId = vid;
      state.voted = null;
      state.myVote = null;
      dyn.voteUn = vid ? [watch('voted', `voted/${vid}`), watch('myVote', `votes/${vid}/${uid}`)] : [];
    }
    if (rid !== dyn.runId) {
      dyn.runUn.forEach((f) => f());
      dyn.runId = rid;
      state.played = null;
      state.myCard = null;
      dyn.runUn = rid ? [watch('played', `played/${rid}`), watch('myCard', `cards/${rid}/${uid}`)] : [];
    }
  }

  const unsubs = [
    onValue(ref(db, '.info/serverTimeOffset'), (snap) => { state.serverOffset = snap.val() || 0; emit(); }),
    onValue(ref(db, '.info/connected'), (snap) => {
      state.connected = snap.val() === true;
      if (state.connected) state.everConnected = true;
      emit();
    }),
    ...['meta', 'players', 'presence', 'settings', 'pub', 'hist', 'draft', 'ready', 'ladyPick', 'assassinPick']
      .map((k) => watch(k, k)),
    watch('kickedMe', `kicked/${uid}`),
    watch('log', query(rref(code, 'log'), limitToLast(300))),
    watch('secret', `secret/${uid}`),
  ];
  syncDynamic();

  return () => {
    unsubs.forEach((f) => f());
    dyn.voteUn.forEach((f) => f());
    dyn.runUn.forEach((f) => f());
  };
}

export async function leaveRoom(code, uid, s, stopPresence) {
  if (s?.meta?.hostUid === uid) {
    const others = seatingOrder(s).filter((u) => u !== uid);
    const next = others.find((u) => isOnline(s, u)) || others[0];
    if (next) await transferHost(code, next);
  }
  await stopPresence?.();
  await update(rref(code), { [`presence/${uid}`]: null, [`players/${uid}`]: null });
}

// ── 玩家操作 ──
export const setReady = (code, uid) => set(rref(code, `ready/${uid}`), true);
export const saveDraft = (code, draft) => set(rref(code, 'draft'), draft);
export const castVote = (code, vid, uid, approve) =>
  update(rref(code), { [`votes/${vid}/${uid}`]: approve, [`voted/${vid}/${uid}`]: true });
export const playCard = (code, rid, uid, card) =>
  update(rref(code), { [`cards/${rid}/${uid}`]: card, [`played/${rid}/${uid}`]: true });
export const pickLady = (code, target, round) => set(rref(code, 'ladyPick'), { target, round });
export const pickAssassin = (code, target) => set(rref(code, 'assassinPick'), { target });

// ── 房主操作 ──
export const updateSettings = (code, patch) => update(rref(code, 'settings'), patch);
export const setOrder = (code, order) => set(rref(code, 'settings/order'), order);
// 轉移房主；有日誌文字時在同一次寫入記錄（寫入後自己就不是房主，不能再寫日誌）
export const transferHost = (code, uid, logText) => update(rref(code), {
  'meta/hostUid': uid,
  ...(logText ? { [`log/${push(rref(code, 'log')).key}`]: { t: serverTimestamp(), text: logText }, 'meta/lastActive': serverTimestamp() } : {}),
});
export const isKicked = async (code, uid) => (await get(rref(code, `kicked/${uid}`))).exists();
export const kickPlayer = (code, uid) =>
  update(rref(code), { [`players/${uid}`]: null, [`presence/${uid}`]: null, [`kicked/${uid}`]: true });
export const addLog = (code, text) =>
  update(rref(code), { [`log/${push(rref(code, 'log')).key}`]: { t: serverTimestamp(), text }, 'meta/lastActive': serverTimestamp() });
