// 房主的瀏覽器擔任裁判：依照資料庫上的狀態推進遊戲流程
// 所有判斷都從資料重新計算，所以房主換人或重新整理後可以無縫接手。
// 這個檔案不直接引用 Firebase，資料存取透過 api（瀏覽器由 room.js 提供，測試用記憶體資料庫）：
//   api = { get(path), set(path, value), update(path, patch), pushKey(path), serverTimestamp() }
import { seatingOrder, nameOf, isOnline } from './state.js';
import * as G from './game.js';
import { ROLES, MAX_REJECTIONS } from './rules.js';

let defaultApi = null;
export function setHostApi(api) { defaultApi = api; }
function useApi(api) {
  const a = api || defaultApi;
  if (!a) throw new Error('尚未設定資料存取介面（setHostApi）');
  return a;
}

const ROLE_ORDER = ['merlin', 'percival', 'servant', 'assassin', 'morgana', 'mordred', 'oberon', 'minion'];
const roomPath = (code) => `rooms/${code}`;

export const END_REASONS = {
  questsGood: '正義方完成了三個任務',
  questsEvil: '三個任務失敗',
  rejections: '同一輪連續五次否決隊伍',
  assassinHit: '刺客成功刺殺了梅林',
  assassinMiss: '刺客沒有找出梅林',
};

export function roleSummary(counts) {
  return ROLE_ORDER.filter((r) => counts?.[r])
    .map((r) => (counts[r] > 1 ? `${ROLES[r].name}×${counts[r]}` : ROLES[r].name))
    .join('、');
}

// 每次寫入日誌時順便更新房間的最後活動時間（避免進行中的房間被清理）
function logEntry(api, code, text) {
  const key = api.pushKey(`${roomPath(code)}/log`);
  return { [`log/${key}`]: { t: api.serverTimestamp(), text }, 'meta/lastActive': api.serverTimestamp() };
}

const touchIndex = (api, code) => Promise.resolve(api.set(`roomIndex/${code}`, api.serverTimestamp())).catch(() => {});
const namesInSeat = (s, p, uids) => [...uids].sort((a, b) => p.seat[a] - p.seat[b]).map((u) => nameOf(s, u)).join('、');

const CLEAR_ACTIONS = { ready: null, draft: null, votes: null, voted: null, cards: null, played: null, ladyPick: null, assassinPick: null };
const CLEAR_SECRETS = { hostSecret: null, secret: null };

function teamPhase(api, p, { nextLeader = false, nextRound = false } = {}) {
  const order = G.toArray(p.order);
  const u = { 'pub/phase': 'team', 'pub/phaseAt': api.serverTimestamp(), 'pub/team': null, 'pub/currentQuest': null, draft: null };
  if (nextLeader) {
    const li = (p.leaderIdx + 1) % order.length;
    u['pub/leaderIdx'] = li;
    u['pub/leader'] = order[li];
  }
  if (nextRound) {
    u['pub/round'] = p.round + 1;
    u['pub/attempt'] = 1;
  }
  return u;
}

export async function startGame(code, s, api) {
  api = useApi(api);
  // 重新讀取玩家名單，避免有人剛好在按下開始時離開或加入
  const players = (await api.get(`${roomPath(code)}/players`)) || {};
  const order = seatingOrder({ ...s, players }).filter((u) => players[u]);
  const settings = G.mergeSettings(s.settings);
  const { errors } = G.validateSetup(order.length, settings);
  if (errors.length) throw new Error(errors[0]);

  const n = order.length;
  const { roles, secrets, leaderIdx, ladyHolder } = G.setupGame(order, settings);
  const roleCounts = {};
  Object.values(roles).forEach((r) => { roleCounts[r] = (roleCounts[r] || 0) + 1; });

  const pub = {
    gid: Date.now().toString(36),
    phase: 'night',
    order,
    seat: Object.fromEntries(order.map((u, i) => [u, i])),
    n,
    roleCounts,
    settings: { lady: !!settings.lady, targeting: !!settings.targeting, timers: settings.timers },
    round: 1,
    attempt: 1,
    leaderIdx,
    leader: order[leaderIdx],
    hasAssassin: !!roleCounts.assassin,
    phaseAt: api.serverTimestamp(),
  };
  if (ladyHolder) pub.lady = { holder: ladyHolder, used: { [ladyHolder]: true } };

  const logKey = api.pushKey(`${roomPath(code)}/log`);
  const intro = `遊戲開始！共 ${n} 人，本局角色：${roleSummary(roleCounts)}`
    + (settings.lady ? '。使用湖中女神' : '') + (settings.targeting ? '。使用指定任務規則' : '');
  await api.update(roomPath(code), {
    ...CLEAR_ACTIONS,
    'meta/status': 'playing',
    'meta/lastActive': api.serverTimestamp(),
    pub,
    hostSecret: { roles },
    secret: secrets,
    hist: null,
    log: { [logKey]: { t: api.serverTimestamp(), text: intro } },
  });
  await touchIndex(api, code);
}

// 回到大廳：清除身分與操作資料，但保留上一局的公開紀錄讓大家回顧（下一局開始時才清掉）
export async function backToLobby(code, api) {
  api = useApi(api);
  await api.update(roomPath(code), {
    ...CLEAR_ACTIONS,
    ...CLEAR_SECRETS,
    'meta/status': 'lobby',
    ...logEntry(api, code, '房主結束本局，所有人回到大廳'),
  });
  await touchIndex(api, code);
}

export async function skipNight(code, s, api) {
  api = useApi(api);
  if (s.pub?.phase !== 'night') return;
  await api.update(roomPath(code), {
    ...teamPhase(api, s.pub),
    ...logEntry(api, code, `房主略過等待，遊戲開始。首位隊長：${nameOf(s, s.pub.leader)}`),
  });
}

// ── 卡關處理：等待中的玩家離線時，房主可以手動代為處理（不會自動發生） ──
export function stuckInfo(s) {
  const p = s.pub;
  if (!p || s.meta?.status !== 'playing') return null;
  const order = G.toArray(p.order);
  const offline = (u) => !!u && !isOnline(s, u);
  switch (p.phase) {
    case 'night': {
      const who = order.filter((u) => !s.ready?.[u]);
      return who.length ? { kind: 'night', who } : null;
    }
    case 'team':
      return offline(p.leader) ? { kind: 'team', who: [p.leader] } : null;
    case 'vote': {
      const who = order.filter((u) => !s.voted?.[u] && offline(u));
      return who.length ? { kind: 'vote', who } : null;
    }
    case 'quest': {
      const who = Object.keys(p.team || {}).filter((u) => !s.played?.[u] && offline(u));
      return who.length ? { kind: 'quest', who } : null;
    }
    case 'lady':
      return offline(p.lady?.holder) && !s.ladyPick ? { kind: 'lady', who: [p.lady.holder] } : null;
    case 'assassin':
      return s.assassinPick ? null : { kind: 'assassin', who: [] };
    default:
      return null;
  }
}

export async function findAssassin(code, api) {
  api = useApi(api);
  const roles = (await api.get(`${roomPath(code)}/hostSecret/roles`)) || {};
  return Object.keys(roles).find((u) => roles[u] === 'assassin') || null;
}

export async function resolveStuck(code, s, api, { target } = {}) {
  api = useApi(api);
  const p = s.pub;
  const info = stuckInfo(s);
  const room = roomPath(code);
  const names = (uids) => uids.map((u) => nameOf(s, u)).join('、');
  if (!info) throw new Error('目前沒有需要處理的離線玩家');

  if (info.kind === 'night') return skipNight(code, s, api);
  if (info.kind === 'vote') {
    const u = {};
    for (const x of info.who) {
      u[`votes/${p.voteId}/${x}`] = false;
      u[`voted/${p.voteId}/${x}`] = true;
    }
    return api.update(room, { ...u, ...logEntry(api, code, `房主將離線玩家 ${names(info.who)} 的票計為反對`) });
  }
  if (info.kind === 'quest') {
    const u = {};
    for (const x of info.who) {
      u[`cards/${p.runId}/${x}`] = 'S';
      u[`played/${p.runId}/${x}`] = true;
    }
    return api.update(room, { ...u, ...logEntry(api, code, `房主讓離線隊員 ${names(info.who)} 出成功牌`) });
  }
  if (info.kind === 'team') {
    const order = G.toArray(p.order);
    const li = (p.leaderIdx + 1) % order.length;
    return api.update(room, {
      'pub/leaderIdx': li,
      'pub/leader': order[li],
      'pub/phaseAt': api.serverTimestamp(),
      draft: null,
      ...logEntry(api, code, `隊長 ${nameOf(s, p.leader)} 離線，改由 ${nameOf(s, order[li])} 擔任隊長（不計入否決）`),
    });
  }
  if (info.kind === 'lady') {
    return api.update(room, {
      ...teamPhase(api, p, { nextLeader: true, nextRound: true }),
      ladyPick: null,
      ...logEntry(api, code, `湖中女神持有者 ${nameOf(s, p.lady.holder)} 離線，跳過這次查驗`),
    });
  }
  // 刺客離線：依邪惡方在語音中的討論，由房主代為指認
  const assassin = await findAssassin(code, api);
  if (assassin && isOnline(s, assassin)) throw new Error('刺客在線上，請等待刺客決定');
  const order = G.toArray(p.order);
  if (!target || !order.includes(target) || G.toArray(p.evil).includes(target)) throw new Error('請選擇一位非邪惡方的玩家');
  return api.update(room, {
    assassinPick: { target },
    ...logEntry(api, code, '刺客離線，房主依邪惡方的討論代為指認'),
  });
}

export class HostEngine {
  constructor(code, uid, api) {
    this.code = code;
    this.uid = uid;
    this.api = useApi(api);
    this.room = roomPath(code);
    this.pending = null;
    this.running = false;
    this.done = new Set(); // 已處理過的狀態轉換，避免重複執行
  }

  onState(s) {
    this.pending = s;
    if (!this.running) this.run();
  }

  async run() {
    this.running = true;
    while (this.pending) {
      const s = this.pending;
      this.pending = null;
      try { await this.step(s); } catch (e) { console.error('[host]', e); }
    }
    this.running = false;
  }

  async guarded(key, fn) {
    if (this.done.has(key)) return;
    this.done.add(key);
    try {
      if ((await fn()) === false) this.done.delete(key);
    } catch (e) {
      this.done.delete(key);
      throw e;
    }
  }

  log(text) { return logEntry(this.api, this.code, text); }

  async step(s) {
    if (s.meta?.hostUid !== this.uid) return;
    const status = s.meta?.status;
    if (status === 'lobby') return this.syncOrder(s);
    const p = s.pub;
    if (status !== 'playing' || !p) return;
    switch (p.phase) {
      case 'night': return this.checkNight(s, p);
      case 'team': return this.checkTeam(s, p);
      case 'vote': return this.checkVote(s, p);
      case 'quest': return this.checkQuest(s, p);
      case 'lady': return this.checkLady(s, p);
      case 'assassin': return this.checkAssassin(s, p);
      default: return undefined;
    }
  }

  async syncOrder(s) {
    if (!s.loaded.players || !s.loaded.settings) return;
    const next = seatingOrder(s);
    if (JSON.stringify(G.toArray(s.settings?.order)) !== JSON.stringify(next)) {
      await this.api.set(`${this.room}/settings/order`, next);
    }
  }

  async checkNight(s, p) {
    if (!s.loaded.ready) return;
    const order = G.toArray(p.order);
    if (!order.every((u) => s.ready?.[u])) return;
    await this.guarded(`night:${p.gid}`, () => this.api.update(this.room, {
      ...teamPhase(this.api, p),
      ...this.log(`所有人都已確認身分。首位隊長：${nameOf(s, p.leader)}`),
    }));
  }

  async checkTeam(s, p) {
    const d = s.draft;
    if (!d?.submitted || d.round !== p.round || d.attempt !== p.attempt) return;
    const order = G.toArray(p.order);
    const avail = G.availableQuests(p.quests, p.settings?.targeting);
    const q = p.settings?.targeting ? d.quest : avail[0];
    const team = Object.keys(d.team || {}).filter((u) => d.team[u]);
    const valid = avail.includes(q) && team.length === G.questSize(order.length, q) && team.every((u) => p.seat?.[u] !== undefined);
    if (!valid) {
      await this.api.update(`${this.room}/draft`, { submitted: false });
      return;
    }
    await this.guarded(`team:${p.gid}:${p.round}:${p.attempt}`, () => this.api.update(this.room, {
      'pub/phase': 'vote',
      'pub/phaseAt': this.api.serverTimestamp(),
      'pub/team': Object.fromEntries(team.map((u) => [u, true])),
      'pub/currentQuest': q,
      'pub/voteId': `v${p.gid}_${p.round}_${p.attempt}`,
      draft: null,
      ...this.log(`第 ${q + 1} 個任務・隊長 ${nameOf(s, p.leader)} 第 ${p.attempt} 次提案：${namesInSeat(s, p, team)}`),
    }));
  }

  async checkVote(s, p) {
    const order = G.toArray(p.order);
    const vid = p.voteId;
    if (!s.loaded.voted || !order.every((u) => s.voted?.[u])) return;
    await this.guarded(`vote:${vid}`, async () => {
      const votes = (await this.api.get(`${this.room}/votes/${vid}`)) || {};
      const missing = order.filter((u) => typeof votes[u] !== 'boolean');
      if (missing.length) {
        // 資料不完整時清掉那一票的兩個節點，讓玩家可以重新投票
        await this.api.update(this.room, Object.fromEntries(missing.flatMap((u) => [[`voted/${vid}/${u}`, null], [`votes/${vid}/${u}`, null]])));
        return false;
      }
      const { approve, reject, approved } = G.tallyVotes(order, votes);
      const team = Object.keys(p.team || {});
      const histKey = this.api.pushKey(`${this.room}/hist`);
      const u = {
        [`hist/${histKey}`]: { round: p.round, attempt: p.attempt, quest: p.currentQuest, leader: p.leader, team, votes, approved },
        'pub/lastVote': { id: vid, votes, approved, approve, reject, team, leader: p.leader, quest: p.currentQuest, attempt: p.attempt },
      };
      if (approved) {
        Object.assign(u, {
          'pub/phase': 'quest',
          'pub/phaseAt': this.api.serverTimestamp(),
          'pub/runId': `q${p.gid}_${p.round}`,
          'pub/histKey': histKey,
        }, this.log(`投票通過（${approve} 贊成／${reject} 反對），隊伍出發執行任務`));
      } else if (p.attempt >= MAX_REJECTIONS) {
        Object.assign(u, this.log(`投票否決（${approve} 贊成／${reject} 反對），本輪已連續 5 次否決`));
        Object.assign(u, await this.endUpdate(s, 'evil', 'rejections'));
      } else {
        const nextLeader = order[(p.leaderIdx + 1) % order.length];
        Object.assign(u, teamPhase(this.api, p, { nextLeader: true }), { 'pub/attempt': p.attempt + 1 },
          this.log(`投票否決（${approve} 贊成／${reject} 反對），隊長交給 ${nameOf(s, nextLeader)}`));
      }
      await this.api.update(this.room, u);
      return true;
    });
  }

  async checkQuest(s, p) {
    const order = G.toArray(p.order);
    const rid = p.runId;
    const team = Object.keys(p.team || {});
    if (!s.loaded.played || !team.length || !team.every((u) => s.played?.[u])) return;
    await this.guarded(`quest:${rid}`, async () => {
      const cards = (await this.api.get(`${this.room}/cards/${rid}`)) || {};
      const missing = team.filter((u) => cards[u] !== 'S' && cards[u] !== 'F');
      if (missing.length) {
        await this.api.update(this.room, Object.fromEntries(missing.flatMap((u) => [[`played/${rid}/${u}`, null], [`cards/${rid}/${u}`, null]])));
        return false;
      }
      const q = p.currentQuest;
      const { fails, result } = G.questOutcome(order.length, q, Object.fromEntries(team.map((u) => [u, cards[u]])));
      const quests = {};
      Object.entries(p.quests || {}).forEach(([k, v]) => { if (v) quests[k] = v; });
      quests[q] = { result, fails };
      const { success, fail } = G.countResults(quests);
      const next = G.nextStepAfterQuest(quests, { lady: !!p.lady, hasAssassin: !!p.hasAssassin });

      const u = {
        [`pub/quests/${q}`]: { result, fails, round: p.round, team },
        'pub/lastQuest': { id: rid, quest: q, fails, size: team.length, result },
        ...this.log(`第 ${q + 1} 個任務${result === 'success' ? '成功' : '失敗'}（${fails} 張失敗牌）・目前 ${success} 成功／${fail} 失敗`),
      };
      if (p.histKey) {
        u[`hist/${p.histKey}/result`] = result;
        u[`hist/${p.histKey}/fails`] = fails;
      }
      if (next === 'evil') Object.assign(u, await this.endUpdate(s, 'evil', 'questsEvil'));
      else if (next === 'good') Object.assign(u, await this.endUpdate(s, 'good', 'questsGood'));
      else if (next === 'assassin') {
        const roles = (await this.api.get(`${this.room}/hostSecret/roles`)) || {};
        Object.assign(u, {
          'pub/phase': 'assassin',
          'pub/phaseAt': this.api.serverTimestamp(),
          'pub/evil': order.filter((x) => G.teamOf(roles[x]) === 'evil'),
          assassinPick: null,
        }, this.log('好人完成了三個任務！邪惡方公開身分，由刺客指認梅林'));
      } else if (next === 'lady') {
        Object.assign(u, { 'pub/phase': 'lady', 'pub/phaseAt': this.api.serverTimestamp(), ladyPick: null },
          this.log(`湖中女神：由 ${nameOf(s, p.lady.holder)} 選擇一位玩家查驗陣營`));
      } else {
        Object.assign(u, teamPhase(this.api, p, { nextLeader: true, nextRound: true }));
      }
      await this.api.update(this.room, u);
      return true;
    });
  }

  async checkLady(s, p) {
    const pick = s.ladyPick;
    if (!pick) return;
    const order = G.toArray(p.order);
    const holder = p.lady?.holder;
    if (pick.round !== p.round || !G.ladyTargets(order, holder, p.lady?.used).includes(pick.target)) {
      await this.api.set(`${this.room}/ladyPick`, null); // 不合法就清掉，讓持有者重新選
      return;
    }
    await this.guarded(`lady:${p.gid}:${p.round}`, async () => {
      const role = await this.api.get(`${this.room}/hostSecret/roles/${pick.target}`);
      await this.api.update(this.room, {
        [`secret/${holder}/lady/${p.round}`]: { target: pick.target, team: G.teamOf(role) },
        'pub/lady/holder': pick.target,
        [`pub/lady/used/${pick.target}`]: true,
        [`pub/lady/history/${p.round}`]: { holder, target: pick.target },
        ladyPick: null,
        ...this.log(`${nameOf(s, holder)} 用湖中女神查驗了 ${nameOf(s, pick.target)}，湖中女神交給 ${nameOf(s, pick.target)}`),
        ...teamPhase(this.api, p, { nextLeader: true, nextRound: true }),
      });
    });
  }

  async checkAssassin(s, p) {
    const pick = s.assassinPick;
    if (!pick?.target) return;
    const order = G.toArray(p.order);
    const evil = G.toArray(p.evil);
    if (!order.includes(pick.target) || evil.includes(pick.target)) {
      await this.api.set(`${this.room}/assassinPick`, null);
      return;
    }
    await this.guarded(`assassin:${p.gid}`, async () => {
      const roles = (await this.api.get(`${this.room}/hostSecret/roles`)) || {};
      const hit = roles[pick.target] === 'merlin';
      await this.api.update(this.room, {
        'pub/assassinTarget': pick.target,
        ...this.log(`刺客指認 ${nameOf(s, pick.target)} 是梅林……${hit ? '正中目標！' : '指認錯誤！'}`),
        ...(await this.endUpdate(s, hit ? 'evil' : 'good', hit ? 'assassinHit' : 'assassinMiss')),
      });
    });
  }

  async endUpdate(s, winner, reason) {
    const roles = (await this.api.get(`${this.room}/hostSecret/roles`)) || {};
    return {
      'pub/phase': 'end',
      'pub/phaseAt': this.api.serverTimestamp(),
      'pub/winner': winner,
      'pub/reason': reason,
      'pub/reveal': roles,
      'meta/status': 'ended',
      ...this.log(`遊戲結束：${winner === 'good' ? '正義方' : '邪惡方'}獲勝（${END_REASONS[reason]}）`),
    };
  }
}
