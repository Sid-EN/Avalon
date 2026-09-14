// 房主的瀏覽器擔任裁判：依照 Firebase 上的狀態推進遊戲流程
// 所有判斷都從資料重新計算，所以房主換人或重新整理後可以無縫接手。
import { get, set, update, push, serverTimestamp } from './firebase.js';
import { rref, seatingOrder, nameOf } from './room.js';
import * as G from './game.js';
import { ROLES, MAX_REJECTIONS } from './rules.js';

const ROLE_ORDER = ['merlin', 'percival', 'servant', 'assassin', 'morgana', 'mordred', 'oberon', 'minion'];

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

function logEntry(code, text) {
  const key = push(rref(code, 'log')).key;
  return { [`log/${key}`]: { t: serverTimestamp(), text } };
}

const namesInSeat = (s, p, uids) => [...uids].sort((a, b) => p.seat[a] - p.seat[b]).map((u) => nameOf(s, u)).join('、');

const CLEAR_GAME = {
  hostSecret: null, secret: null, ready: null, draft: null, votes: null, voted: null,
  cards: null, played: null, ladyPick: null, assassinPick: null, hist: null,
};

function teamPhase(p, { nextLeader = false, nextRound = false } = {}) {
  const order = G.toArray(p.order);
  const u = { 'pub/phase': 'team', 'pub/phaseAt': serverTimestamp(), 'pub/team': null, 'pub/currentQuest': null, draft: null };
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

export async function startGame(code, s) {
  const order = seatingOrder(s).filter((u) => s.players?.[u]);
  const settings = {
    ...G.DEFAULT_SETTINGS, ...(s.settings || {}),
    roles: { ...G.DEFAULT_SETTINGS.roles, ...(s.settings?.roles || {}) },
    timers: { ...G.DEFAULT_SETTINGS.timers, ...(s.settings?.timers || {}) },
  };
  const { errors } = G.validateSetup(order.length, settings);
  if (errors.length) throw new Error(errors[0]);

  const n = order.length;
  const { roles, secrets, leaderIdx, ladyHolder } = G.setupGame(order, settings);
  const seat = Object.fromEntries(order.map((u, i) => [u, i]));
  const roleCounts = {};
  Object.values(roles).forEach((r) => { roleCounts[r] = (roleCounts[r] || 0) + 1; });

  const pub = {
    gid: Date.now().toString(36),
    phase: 'night', order, seat, n, roleCounts,
    settings: { lady: !!settings.lady, targeting: !!settings.targeting, timers: settings.timers },
    round: 1, attempt: 1, leaderIdx, leader: order[leaderIdx],
    hasAssassin: !!roleCounts.assassin,
    phaseAt: serverTimestamp(),
  };
  if (ladyHolder) pub.lady = { holder: ladyHolder, used: { [ladyHolder]: true } };

  const logKey = push(rref(code, 'log')).key;
  const intro = `遊戲開始！共 ${n} 人，本局角色：${roleSummary(roleCounts)}`
    + (settings.lady ? '。使用湖中女神' : '') + (settings.targeting ? '。使用指定任務規則' : '');
  await update(rref(code), {
    ...CLEAR_GAME,
    'meta/status': 'playing',
    pub,
    hostSecret: { roles },
    secret: secrets,
    log: { [logKey]: { t: serverTimestamp(), text: intro } },
  });
}

export async function backToLobby(code) {
  await update(rref(code), { ...CLEAR_GAME, 'meta/status': 'lobby', pub: null, log: null });
}

export async function skipNight(code, s) {
  if (s.pub?.phase !== 'night') return;
  await update(rref(code), {
    ...teamPhase(s.pub),
    ...logEntry(code, `房主略過等待，遊戲開始。首位隊長：${nameOf(s, s.pub.leader)}`),
  });
}

export class HostEngine {
  constructor(code, uid) {
    this.code = code;
    this.uid = uid;
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
      await set(rref(this.code, 'settings/order'), next);
    }
  }

  async checkNight(s, p) {
    if (!s.loaded.ready) return;
    const order = G.toArray(p.order);
    if (!order.every((u) => s.ready?.[u])) return;
    await this.guarded(`night:${p.gid}`, () => update(rref(this.code), {
      ...teamPhase(p),
      ...logEntry(this.code, `所有人都已確認身分。首位隊長：${nameOf(s, p.leader)}`),
    }));
  }

  async checkTeam(s, p) {
    const d = s.draft;
    if (!d?.submitted || d.round !== p.round || d.attempt !== p.attempt) return;
    const order = G.toArray(p.order);
    const n = order.length;
    const avail = G.availableQuests(p.quests, p.settings?.targeting);
    const q = p.settings?.targeting ? d.quest : avail[0];
    const team = Object.keys(d.team || {}).filter((u) => d.team[u]);
    const valid = avail.includes(q) && team.length === G.questSize(n, q) && team.every((u) => p.seat?.[u] !== undefined);
    if (!valid) {
      await update(rref(this.code, 'draft'), { submitted: false });
      return;
    }
    await this.guarded(`team:${p.gid}:${p.round}:${p.attempt}`, () => update(rref(this.code), {
      'pub/phase': 'vote',
      'pub/phaseAt': serverTimestamp(),
      'pub/team': Object.fromEntries(team.map((u) => [u, true])),
      'pub/currentQuest': q,
      'pub/voteId': `v${p.gid}_${p.round}_${p.attempt}`,
      draft: null,
      ...logEntry(this.code, `第 ${q + 1} 個任務・隊長 ${nameOf(s, p.leader)} 第 ${p.attempt} 次提案：${namesInSeat(s, p, team)}`),
    }));
  }

  async checkVote(s, p) {
    const order = G.toArray(p.order);
    const n = order.length;
    const vid = p.voteId;
    if (!s.loaded.voted || !order.every((u) => s.voted?.[u])) return;
    await this.guarded(`vote:${vid}`, async () => {
      const votes = (await get(rref(this.code, `votes/${vid}`))).val() || {};
      const missing = order.filter((u) => typeof votes[u] !== 'boolean');
      if (missing.length) {
        await update(rref(this.code), Object.fromEntries(missing.map((u) => [`voted/${vid}/${u}`, null])));
        return false;
      }
      const { approve, reject, approved } = G.tallyVotes(order, votes);
      const team = Object.keys(p.team || {});
      const histKey = push(rref(this.code, 'hist')).key;
      const u = {
        [`hist/${histKey}`]: { round: p.round, attempt: p.attempt, quest: p.currentQuest, leader: p.leader, team, votes, approved },
        'pub/lastVote': { id: vid, votes, approved, approve, reject, team, leader: p.leader, quest: p.currentQuest, attempt: p.attempt },
      };
      if (approved) {
        Object.assign(u, {
          'pub/phase': 'quest',
          'pub/phaseAt': serverTimestamp(),
          'pub/runId': `q${p.gid}_${p.round}`,
          'pub/histKey': histKey,
        }, logEntry(this.code, `投票通過（${approve} 贊成／${reject} 反對），隊伍出發執行任務`));
      } else if (p.attempt >= MAX_REJECTIONS) {
        Object.assign(u, logEntry(this.code, `投票否決（${approve} 贊成／${reject} 反對），本輪已連續 5 次否決`));
        Object.assign(u, await this.endUpdate(s, 'evil', 'rejections'));
      } else {
        const nextLeader = order[(p.leaderIdx + 1) % n];
        Object.assign(u, teamPhase(p, { nextLeader: true }), { 'pub/attempt': p.attempt + 1 },
          logEntry(this.code, `投票否決（${approve} 贊成／${reject} 反對），隊長交給 ${nameOf(s, nextLeader)}`));
      }
      await update(rref(this.code), u);
      return true;
    });
  }

  async checkQuest(s, p) {
    const order = G.toArray(p.order);
    const n = order.length;
    const rid = p.runId;
    const team = Object.keys(p.team || {});
    if (!s.loaded.played || !team.length || !team.every((u) => s.played?.[u])) return;
    await this.guarded(`quest:${rid}`, async () => {
      const cards = (await get(rref(this.code, `cards/${rid}`))).val() || {};
      const missing = team.filter((u) => cards[u] !== 'S' && cards[u] !== 'F');
      if (missing.length) {
        await update(rref(this.code), Object.fromEntries(missing.map((u) => [`played/${rid}/${u}`, null])));
        return false;
      }
      const q = p.currentQuest;
      const { fails, result } = G.questOutcome(n, q, Object.fromEntries(team.map((u) => [u, cards[u]])));
      const quests = {};
      Object.entries(p.quests || {}).forEach(([k, v]) => { if (v) quests[k] = v; });
      quests[q] = { result, fails };
      const { success, fail } = G.countResults(quests);
      const next = G.nextStepAfterQuest(quests, { lady: !!p.lady, hasAssassin: !!p.hasAssassin });

      const u = {
        [`pub/quests/${q}`]: { result, fails, round: p.round, team },
        'pub/lastQuest': { id: rid, quest: q, fails, size: team.length, result },
        ...logEntry(this.code, `第 ${q + 1} 個任務${result === 'success' ? '成功' : '失敗'}（${fails} 張失敗牌）・目前 ${success} 成功／${fail} 失敗`),
      };
      if (p.histKey) {
        u[`hist/${p.histKey}/result`] = result;
        u[`hist/${p.histKey}/fails`] = fails;
      }
      if (next === 'evil') Object.assign(u, await this.endUpdate(s, 'evil', 'questsEvil'));
      else if (next === 'good') Object.assign(u, await this.endUpdate(s, 'good', 'questsGood'));
      else if (next === 'assassin') {
        const roles = (await get(rref(this.code, 'hostSecret/roles'))).val() || {};
        Object.assign(u, {
          'pub/phase': 'assassin',
          'pub/phaseAt': serverTimestamp(),
          'pub/evil': order.filter((x) => G.teamOf(roles[x]) === 'evil'),
          assassinPick: null,
        }, logEntry(this.code, '好人完成了三個任務！邪惡方公開身分，由刺客指認梅林'));
      } else if (next === 'lady') {
        Object.assign(u, { 'pub/phase': 'lady', 'pub/phaseAt': serverTimestamp(), ladyPick: null },
          logEntry(this.code, `湖中女神：由 ${nameOf(s, p.lady.holder)} 選擇一位玩家查驗陣營`));
      } else {
        Object.assign(u, teamPhase(p, { nextLeader: true, nextRound: true }));
      }
      await update(rref(this.code), u);
      return true;
    });
  }

  async checkLady(s, p) {
    const pick = s.ladyPick;
    if (!pick || pick.round !== p.round) return;
    const order = G.toArray(p.order);
    const holder = p.lady?.holder;
    if (!G.ladyTargets(order, holder, p.lady?.used).includes(pick.target)) {
      await set(rref(this.code, 'ladyPick'), null);
      return;
    }
    await this.guarded(`lady:${p.gid}:${p.round}`, async () => {
      const role = (await get(rref(this.code, `hostSecret/roles/${pick.target}`))).val();
      await update(rref(this.code), {
        [`secret/${holder}/lady/${p.round}`]: { target: pick.target, team: G.teamOf(role) },
        'pub/lady/holder': pick.target,
        [`pub/lady/used/${pick.target}`]: true,
        [`pub/lady/history/${p.round}`]: { holder, target: pick.target },
        ladyPick: null,
        ...logEntry(this.code, `${nameOf(s, holder)} 用湖中女神查驗了 ${nameOf(s, pick.target)}，湖中女神交給 ${nameOf(s, pick.target)}`),
        ...teamPhase(p, { nextLeader: true, nextRound: true }),
      });
    });
  }

  async checkAssassin(s, p) {
    const pick = s.assassinPick;
    if (!pick?.target) return;
    const order = G.toArray(p.order);
    const evil = G.toArray(p.evil);
    if (!order.includes(pick.target) || evil.includes(pick.target)) {
      await set(rref(this.code, 'assassinPick'), null);
      return;
    }
    await this.guarded(`assassin:${p.gid}`, async () => {
      const roles = (await get(rref(this.code, 'hostSecret/roles'))).val() || {};
      const hit = roles[pick.target] === 'merlin';
      await update(rref(this.code), {
        'pub/assassinTarget': pick.target,
        ...logEntry(this.code, `刺客指認 ${nameOf(s, pick.target)} 是梅林……${hit ? '正中目標！' : '指認錯誤！'}`),
        ...(await this.endUpdate(s, hit ? 'evil' : 'good', hit ? 'assassinHit' : 'assassinMiss')),
      });
    });
  }

  async endUpdate(s, winner, reason) {
    const roles = (await get(rref(this.code, 'hostSecret/roles'))).val() || {};
    return {
      'pub/phase': 'end',
      'pub/phaseAt': serverTimestamp(),
      'pub/winner': winner,
      'pub/reason': reason,
      'pub/reveal': roles,
      'meta/status': 'ended',
      ...logEntry(this.code, `遊戲結束：${winner === 'good' ? '正義方' : '邪惡方'}獲勝（${END_REASONS[reason]}）`),
    };
  }
}
