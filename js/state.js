// 房間狀態的純函式（不碰 Firebase，瀏覽器與測試共用）
import { toArray } from './game.js';

// 房間代碼：只留英文字母、轉大寫、4 碼；貼上整個邀請連結（…#ABCD）也可以
export function normalizeCode(input) {
  const text = String(input || '');
  const fromLink = text.match(/#([A-Za-z]{4})(?![A-Za-z])/);
  return (fromLink ? fromLink[1] : text).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
}

export const nameOf = (s, u) => s?.players?.[u]?.name || '（已離開）';

// 上線狀態以「連線」為單位：同一人開多個分頁，全部關掉才算離線
export function isOnline(s, u) {
  const conns = s?.presence?.[u]?.conns;
  return !!conns && Object.keys(conns).length > 0;
}

// 暱稱重複時自動加上數字（最多 12 字）
export function uniqueName(players, uid, name) {
  const taken = new Set(Object.entries(players || {}).filter(([u]) => u !== uid).map(([, p]) => p?.name));
  if (!taken.has(name)) return name;
  for (let i = 2; ; i++) {
    const suffix = String(i);
    const candidate = `${name.slice(0, 12 - suffix.length)}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
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

// 房主離線超過 35 秒時，由座位順序最前面、仍在線上的玩家接手房主
export function shouldClaimHost(s, uid, now) {
  const host = s.meta?.hostUid;
  if (!host || host === uid || !s.players?.[uid] || !s.loaded?.presence) return false;
  if (now - (s.meta.createdAt || now) < 60000) return false;
  const lastSeen = s.presence?.[host]?.at;
  const away = !isOnline(s, host) && (!lastSeen || now - lastSeen > 35000);
  if (!away) return false;
  return seatingOrder(s).find((u) => u !== host && isOnline(s, u)) === uid;
}
