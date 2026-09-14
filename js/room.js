// 房間：建立／加入、上線狀態、訂閱資料、玩家操作
import {
  db, ref, get, set, update, remove, onValue, onDisconnect, serverTimestamp,
  query, orderByValue, endAt, limitToFirst, limitToLast,
} from './firebase.js';
import { DEFAULT_SETTINGS, MAX_PLAYERS, randomInt, toArray } from './game.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // 不含容易看錯的 I、O
const DAY = 86400000;

export const rref = (code, path) => ref(db, `rooms/${code}${path ? `/${path}` : ''}`);
export const normalizeCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
export const nameOf = (s, u) => s.players?.[u]?.name || '（已離開）';

function randomCode() {
  let code = '';
  for (let i = 0; i < 4; i++) code += CODE_CHARS[randomInt(CODE_CHARS.length)];
  return code;
}

// 清掉超過一天的舊房間，讓免費額度的儲存空間保持乾淨
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
      await set(rref(code, 'meta'), { hostUid: uid, createdAt: serverTimestamp(), status: 'lobby' });
    } catch {
      continue;
    }
    await Promise.all([
      set(rref(code, 'settings'), { ...DEFAULT_SETTINGS, order: [uid] }),
      set(ref(db, `roomIndex/${code}`), serverTimestamp()),
    ]);
    await set(rref(code, `players/${uid}`), { name, joinedAt: serverTimestamp() });
    return code;
  }
  throw new Error('建立房間失敗，請檢查網路後再試一次');
}

export async function joinRoom(code, uid, name) {
  const metaSnap = await get(rref(code, 'meta'));
  if (!metaSnap.exists()) throw new Error('找不到這個房間，請確認房間代碼');
  const meSnap = await get(rref(code, `players/${uid}`));
  if (meSnap.exists()) {
    if (name && meSnap.val().name !== name && metaSnap.val().status === 'lobby') await renamePlayer(code, uid, name);
    return;
  }
  if (metaSnap.val().status !== 'lobby') throw new Error('這個房間的遊戲已經開始，無法加入');
  if ((await get(rref(code, `kicked/${uid}`))).exists()) throw new Error('你已被房主移出這個房間');
  const players = await get(rref(code, 'players'));
  if (players.size >= MAX_PLAYERS) throw new Error(`房間已滿（最多 ${MAX_PLAYERS} 人）`);
  await set(rref(code, `players/${uid}`), { name, joinedAt: serverTimestamp() });
}

export const renamePlayer = (code, uid, name) => update(rref(code, `players/${uid}`), { name });

// 上線狀態：斷線時 Firebase 伺服器會自動標記為離線
export function startPresence(code, uid) {
  const pRef = rref(code, `presence/${uid}`);
  const unsub = onValue(ref(db, '.info/connected'), async (snap) => {
    if (snap.val() !== true) return;
    try {
      await onDisconnect(pRef).set({ online: false, at: serverTimestamp() });
      await set(pRef, { online: true, at: serverTimestamp() });
    } catch (e) { console.warn('presence', e); }
  });
  return async () => {
    unsub();
    try {
      await onDisconnect(pRef).cancel();
      await set(pRef, { online: false, at: serverTimestamp() });
    } catch { /* 已離開房間 */ }
  };
}

// 訂閱房間所有公開資料＋自己的秘密資料
export function watchRoom(code, uid, onChange) {
  const state = { code, uid, loaded: {}, serverOffset: 0, connected: true };
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
    onValue(ref(db, '.info/connected'), (snap) => { state.connected = snap.val() === true; emit(); }),
    ...['meta', 'players', 'presence', 'settings', 'pub', 'hist', 'draft', 'ready', 'ladyPick', 'assassinPick', 'kicked']
      .map((k) => watch(k, k)),
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

// 座位順序（順時針）
export function seatingOrder(s) {
  if (s.meta?.status !== 'lobby' && s.pub?.order) return toArray(s.pub.order);
  const players = s.players || {};
  const saved = toArray(s.settings?.order).filter((u) => players[u]);
  const rest = Object.keys(players)
    .filter((u) => !saved.includes(u))
    .sort((a, b) => (players[a].joinedAt || 0) - (players[b].joinedAt || 0));
  return [...saved, ...rest];
}

// 房主離線超過 30 秒時，由順位最前面、仍在線上的玩家接手房主
export function shouldClaimHost(s, uid, now) {
  const host = s.meta?.hostUid;
  if (!host || host === uid || !s.players?.[uid] || !s.loaded?.presence) return false;
  if (now - (s.meta.createdAt || now) < 60000) return false;
  const p = s.presence?.[host];
  const away = !p || (p.online === false && now - p.at > 35000);
  if (!away) return false;
  return seatingOrder(s).find((u) => u !== host && s.presence?.[u]?.online) === uid;
}

export async function leaveRoom(code, uid, s, stopPresence) {
  if (s.meta?.hostUid === uid) {
    const others = seatingOrder(s).filter((u) => u !== uid);
    const next = others.find((u) => s.presence?.[u]?.online) || others[0];
    if (next) await transferHost(code, next);
  }
  await stopPresence?.();
  await update(rref(code), { [`players/${uid}`]: null, [`presence/${uid}`]: null });
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
export const transferHost = (code, uid) => set(rref(code, 'meta/hostUid'), uid);
export const kickPlayer = (code, uid) =>
  update(rref(code), { [`players/${uid}`]: null, [`presence/${uid}`]: null, [`kicked/${uid}`]: true });
