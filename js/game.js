// 遊戲規則邏輯（純函式，不碰 Firebase，方便測試）
import {
  TEAM_COUNTS, QUEST_SIZES, failsRequired, ROLES, LADY_AFTER_QUESTS, WINS_NEEDED,
} from './rules.js';

export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 10;

export const DEFAULT_SETTINGS = {
  roles: { merlinAssassin: true, percival: true, morgana: true, mordred: false, oberon: false },
  lady: false,
  targeting: false,
  timers: { team: 180, vote: 60, quest: 60, lady: 120, assassin: 180 },
};

export const teamOf = (role) => ROLES[role]?.team;

// 補齊房間設定的預設值（舊房間或部分欄位缺少時）
export function mergeSettings(raw) {
  return {
    ...DEFAULT_SETTINGS, ...(raw || {}),
    roles: { ...DEFAULT_SETTINGS.roles, ...(raw?.roles || {}) },
    timers: { ...DEFAULT_SETTINGS.timers, ...(raw?.timers || {}) },
  };
}

// 用 crypto 產生公平的亂數（避免 Math.random 可被預測）
export function randomInt(n) {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / n) * n;
  let x;
  do { crypto.getRandomValues(buf); x = buf[0]; } while (x >= limit);
  return x % n;
}

export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function selectedSpecials(roles = {}) {
  const good = [];
  const evil = [];
  if (roles.merlinAssassin) { good.push('merlin'); evil.push('assassin'); }
  if (roles.percival) good.push('percival');
  for (const r of ['morgana', 'mordred', 'oberon']) if (roles[r]) evil.push(r);
  return { good, evil };
}

export function validateSetup(n, settings) {
  const errors = [];
  const warnings = [];
  const roles = settings.roles || {};
  const { good, evil } = selectedSpecials(roles);
  if (n < MIN_PLAYERS) errors.push(`至少需要 ${MIN_PLAYERS} 人才能開始（目前 ${n} 人）`);
  else if (n > MAX_PLAYERS) errors.push(`最多 ${MAX_PLAYERS} 人（目前 ${n} 人），請房主移除玩家`);
  else {
    const c = TEAM_COUNTS[n];
    if (good.length > c.good) errors.push(`正義方特殊角色太多：${n} 人局正義方只有 ${c.good} 人`);
    if (evil.length > c.evil) errors.push(`邪惡方特殊角色太多：${n} 人局邪惡方只有 ${c.evil} 人`);
  }
  if (roles.percival && !roles.merlinAssassin) errors.push('派西維爾需要梅林在場');
  if (roles.morgana && !roles.percival) warnings.push('莫甘娜的能力只有在派西維爾在場時才有作用');
  if (n === 5 && roles.percival && !roles.morgana && !roles.mordred) {
    warnings.push('官方建議：5 人局使用派西維爾時，要加入莫德雷德或莫甘娜');
  }
  if (!roles.merlinAssassin) warnings.push('沒有梅林與刺客：好人完成 3 個任務就直接獲勝');
  if (settings.lady && n < 7) warnings.push('官方建議：湖中女神最適合 7 人以上的遊戲');
  return { errors, warnings };
}

export function buildRoleList(n, settings) {
  const { good, evil } = selectedSpecials(settings.roles);
  const c = TEAM_COUNTS[n];
  if (!c || good.length > c.good || evil.length > c.evil) throw new Error('角色設定與人數不符');
  return [
    ...good, ...Array(c.good - good.length).fill('servant'),
    ...evil, ...Array(c.evil - evil.length).fill('minion'),
  ];
}

// 夜晚階段：每位玩家「看得到」誰
export function knowledgeFor(uid, roles) {
  const role = roles[uid];
  const sees = {};
  const others = Object.keys(roles).filter((u) => u !== uid);
  const inGame = new Set(Object.values(roles));
  if (teamOf(role) === 'evil' && role !== 'oberon') {
    for (const u of others) if (teamOf(roles[u]) === 'evil' && roles[u] !== 'oberon') sees[u] = 'evil';
  }
  if (role === 'merlin') {
    for (const u of others) if (teamOf(roles[u]) === 'evil' && roles[u] !== 'mordred') sees[u] = 'evil';
  }
  if (role === 'percival') {
    const label = inGame.has('morgana') ? 'merlinOrMorgana' : 'merlin';
    for (const u of others) if (roles[u] === 'merlin' || roles[u] === 'morgana') sees[u] = label;
  }
  return sees;
}

export function setupGame(order, settings) {
  const n = order.length;
  const deck = shuffle(buildRoleList(n, settings));
  const roles = {};
  order.forEach((uid, i) => { roles[uid] = deck[i]; });
  const leaderIdx = randomInt(n);
  // 湖中女神交給首位隊長的右手邊（座位順時針排列，所以是上一位）
  const ladyHolder = settings.lady ? order[(leaderIdx - 1 + n) % n] : null;
  const secrets = {};
  for (const uid of order) {
    secrets[uid] = { role: roles[uid], team: teamOf(roles[uid]), sees: knowledgeFor(uid, roles) };
  }
  return { roles, secrets, leaderIdx, ladyHolder };
}

export const questSize = (n, q) => QUEST_SIZES[n][q];
export { failsRequired };

export function countResults(quests) {
  let success = 0;
  let fail = 0;
  for (const q of Object.values(quests || {})) {
    if (q?.result === 'success') success++;
    else if (q?.result === 'fail') fail++;
  }
  return { success, fail };
}

// 目前可以挑戰的任務（指定任務規則：第 5 個任務需先成功 2 個任務）
export function availableQuests(quests, targeting) {
  const done = new Set(Object.entries(quests || {}).filter(([, q]) => q?.result).map(([k]) => Number(k)));
  const open = [0, 1, 2, 3, 4].filter((i) => !done.has(i));
  if (!targeting) return open.slice(0, 1);
  const { success } = countResults(quests);
  return open.filter((i) => i !== 4 || success >= 2);
}

export function tallyVotes(order, votes) {
  const approve = order.filter((u) => votes?.[u] === true).length;
  return { approve, reject: order.length - approve, approved: approve * 2 > order.length };
}

export function questOutcome(n, questIdx, cards) {
  const values = Object.values(cards || {});
  const fails = values.filter((c) => c === 'F').length;
  return { fails, successes: values.length - fails, result: fails >= failsRequired(n, questIdx) ? 'fail' : 'success' };
}

// 任務結束後的下一步：'evil' | 'good' | 'assassin' | 'lady' | 'team'
export function nextStepAfterQuest(quests, { lady, hasAssassin }) {
  const { success, fail } = countResults(quests);
  if (fail >= WINS_NEEDED) return 'evil';
  if (success >= WINS_NEEDED) return hasAssassin ? 'assassin' : 'good';
  if (lady && LADY_AFTER_QUESTS.includes(success + fail)) return 'lady';
  return 'team';
}

export function ladyTargets(order, holder, used) {
  return order.filter((u) => u !== holder && !used?.[u]);
}

export function toArray(v) {
  if (!v) return [];
  return Array.isArray(v) ? v.filter((x) => x != null) : Object.values(v);
}
