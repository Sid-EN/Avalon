// 功能測試：房主裁判（HostEngine）的完整遊戲流程
// 用記憶體版資料庫取代 Firebase，模擬玩家的操作，驗證每一條規則的判定與狀態轉換。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HostEngine, startGame, backToLobby, skipNight, stuckInfo, resolveStuck, findAssassin } from '../../js/host.js';
import { DEFAULT_SETTINGS, teamOf, questSize, toArray, availableQuests, ladyTargets } from '../../js/game.js';
import { createMemoryDb, snapshot, TIMESTAMP } from '../helpers/memory-db.mjs';

const CODE = 'TEST';

class Game {
  constructor(db, uids) {
    this.db = db;
    this.uids = uids;
    this.engine = new HostEngine(CODE, 'u0', db);
  }
  get(path) { return this.db.get(`rooms/${CODE}/${path}`); }
  write(path, value) { return this.db.set(`rooms/${CODE}/${path}`, value); }
  multi(patch) { return this.db.update(`rooms/${CODE}`, patch); }
  state(uid = 'u0') { return snapshot(this.db, CODE, uid); }
  pub() { return this.get('pub'); }
  async settle(engine = this.engine) {
    for (let i = 0; i < 4; i++) await engine.step(await this.state(engine.uid));
  }
  async start() {
    await startGame(CODE, await this.state(), this.db);
    this.roles = await this.get('hostSecret/roles');
    return this;
  }
  get evil() { return this.uids.filter((u) => teamOf(this.roles[u]) === 'evil'); }
  get good() { return this.uids.filter((u) => teamOf(this.roles[u]) === 'good'); }
  who(role) { return this.uids.find((u) => this.roles[u] === role); }

  async readyAll() {
    for (const u of this.uids) await this.write(`ready/${u}`, true);
    await this.settle();
  }
  async propose(team, quest = null) {
    const p = await this.pub();
    await this.write('draft', {
      round: p.round, attempt: p.attempt, quest,
      team: Object.fromEntries(team.map((u) => [u, true])), submitted: true,
    });
    await this.settle();
  }
  async voteAll(choice = true) {
    const p = await this.pub();
    for (const u of this.uids) {
      const v = typeof choice === 'function' ? choice(u) : choice;
      await this.multi({ [`votes/${p.voteId}/${u}`]: v, [`voted/${p.voteId}/${u}`]: true });
    }
    await this.settle();
  }
  async playCards(card) {
    const p = await this.pub();
    for (const u of Object.keys(p.team)) await this.multi({ [`cards/${p.runId}/${u}`]: card(u), [`played/${p.runId}/${u}`]: true });
    await this.settle();
  }
  // 提名→全員贊成→出牌；fail=true 時隊伍放一個邪惡玩家並出失敗牌
  async runQuest({ fail = false, quest = null } = {}) {
    const p = await this.pub();
    const q = quest ?? availableQuests(p.quests, false)[0];
    const size = questSize(this.uids.length, q);
    const team = fail ? [this.evil[0], ...this.good].slice(0, size) : this.good.slice(0, size);
    await this.propose(team, quest);
    await this.voteAll(true);
    await this.playCards((u) => (fail && u === this.evil[0] ? 'F' : 'S'));
  }
}

async function newGame(n, settings = {}, { start = true } = {}) {
  const db = createMemoryDb();
  const uids = Array.from({ length: n }, (_, i) => `u${i}`);
  await db.set(`rooms/${CODE}`, {
    meta: { hostUid: 'u0', createdAt: TIMESTAMP, status: 'lobby' },
    settings: {
      ...DEFAULT_SETTINGS, ...settings,
      roles: { ...DEFAULT_SETTINGS.roles, ...(settings.roles || {}) },
      order: uids,
    },
    players: Object.fromEntries(uids.map((u, i) => [u, { name: `玩家${i}`, joinedAt: i + 1 }])),
  });
  const game = new Game(db, uids);
  return start ? game.start() : game;
}

test('開局：公開資料不含任何人的身分，每人的秘密資料正確', async () => {
  const g = await newGame(7, { lady: true });
  const p = await g.pub();
  assert.equal(p.phase, 'night');
  assert.equal(await g.get('meta/status'), 'playing');
  assert.deepEqual(toArray(p.order), g.uids);
  assert.equal(p.leader, g.uids[p.leaderIdx]);
  assert.equal(p.lady.holder, g.uids[(p.leaderIdx + 6) % 7], '湖中女神在首位隊長右手邊');
  const pubJson = JSON.stringify(p);
  for (const u of g.uids) assert.ok(!pubJson.includes(`"${u}":"${g.roles[u]}"`), '公開資料洩漏身分');
  assert.equal(p.reveal, undefined);
  const secrets = await g.get('secret');
  for (const u of g.uids) {
    assert.equal(secrets[u].role, g.roles[u]);
    assert.equal(secrets[u].team, teamOf(g.roles[u]));
  }
  assert.equal(Object.values(p.roleCounts).reduce((a, b) => a + b, 0), 7);
  assert.equal(g.evil.length, 3);
});

test('夜晚：全員確認身分後才進入組隊；房主可以略過等待', async () => {
  const g = await newGame(5);
  for (const u of g.uids.slice(0, 4)) await g.write(`ready/${u}`, true);
  await g.settle();
  assert.equal((await g.pub()).phase, 'night');
  await g.write('ready/u4', true);
  await g.settle();
  assert.equal((await g.pub()).phase, 'team');

  const g2 = await newGame(5);
  await skipNight(CODE, await g2.state(), g2.db);
  assert.equal((await g2.pub()).phase, 'team');
});

test('不合法的隊伍會被退回，合法的隊伍進入投票', async () => {
  const g = await newGame(5);
  await g.readyAll();
  await g.propose(['u0', 'u1', 'u2']);
  assert.equal((await g.get('draft/submitted')), false, '人數錯誤要退回');
  assert.equal((await g.pub()).phase, 'team');
  await g.propose(['u0', 'ghost']);
  assert.equal((await g.get('draft/submitted')), false, '不存在的玩家要退回');
  await g.propose(['u0', 'u1']);
  const p = await g.pub();
  assert.equal(p.phase, 'vote');
  assert.deepEqual(Object.keys(p.team).sort(), ['u0', 'u1']);
  assert.ok(p.voteId);
});

test('投票：平手算否決，隊長順時針輪替，提案次數加一', async () => {
  const g = await newGame(6);
  await g.readyAll();
  const before = await g.pub();
  await g.propose(g.good.slice(0, 2));
  await g.voteAll((u) => ['u0', 'u1', 'u2'].includes(u));
  const p = await g.pub();
  assert.equal(p.phase, 'team');
  assert.equal(p.attempt, 2);
  assert.equal(p.leaderIdx, (before.leaderIdx + 1) % 6);
  assert.equal(p.lastVote.approved, false);
  assert.equal(p.lastVote.approve, 3);
  const hist = Object.values(await g.get('hist'));
  assert.equal(hist.length, 1);
  assert.equal(hist[0].approved, false);
  assert.equal(hist[0].votes.u0, true);
});

test('同一輪連續 5 次否決，邪惡方獲勝並公開所有身分', async () => {
  const g = await newGame(5);
  await g.readyAll();
  for (let i = 1; i <= 5; i++) {
    assert.equal((await g.pub()).attempt, i);
    await g.propose(g.good.slice(0, 2));
    await g.voteAll(false);
  }
  const p = await g.pub();
  assert.equal(p.phase, 'end');
  assert.equal(p.winner, 'evil');
  assert.equal(p.reason, 'rejections');
  assert.deepEqual(p.reveal, g.roles);
  assert.equal(await g.get('meta/status'), 'ended');
});

test('少了某人的選票時不結算，並清除他的「已投票」標記', async () => {
  const g = await newGame(5);
  await g.readyAll();
  await g.propose(g.good.slice(0, 2));
  const p = await g.pub();
  for (const u of g.uids) await g.write(`voted/${p.voteId}/${u}`, true);
  for (const u of g.uids.slice(0, 4)) await g.write(`votes/${p.voteId}/${u}`, true);
  await g.settle();
  assert.equal((await g.pub()).phase, 'vote');
  assert.equal(await g.get(`voted/${p.voteId}/u4`), null);
  await g.multi({ [`votes/${p.voteId}/u4`]: true, [`voted/${p.voteId}/u4`]: true });
  await g.settle();
  assert.equal((await g.pub()).phase, 'quest');
});

test('任務判定：1 張失敗牌就失敗；7 人以上第 4 個任務需要 2 張', async () => {
  const g = await newGame(7);
  await g.readyAll();
  await g.runQuest({ fail: true });
  await g.runQuest();
  await g.runQuest({ fail: true });
  let p = await g.pub();
  assert.equal(p.quests[0].result, 'fail');
  assert.equal(p.quests[1].result, 'success');
  assert.equal(p.quests[2].fails, 1);

  await g.runQuest({ fail: true }); // 第 4 個任務只有 1 張失敗牌
  p = await g.pub();
  assert.equal(p.quests[3].fails, 1);
  assert.equal(p.quests[3].result, 'success');
  assert.equal(p.lastQuest.result, 'success');
});

test('隊長在每次投票否決與每個任務結束後都會輪替', async () => {
  const g = await newGame(5);
  await g.readyAll();
  const first = (await g.pub()).leaderIdx;
  await g.propose(g.good.slice(0, 2));
  await g.voteAll(true);
  assert.equal((await g.pub()).leaderIdx, first, '通過投票時隊長不變，要等任務結束');
  await g.playCards(() => 'S');
  const p = await g.pub();
  assert.equal(p.leaderIdx, (first + 1) % 5);
  assert.equal(p.round, 2);
  assert.equal(p.attempt, 1);
});

test('三個任務失敗，邪惡方立即獲勝', async () => {
  const g = await newGame(5);
  await g.readyAll();
  for (let i = 0; i < 3; i++) await g.runQuest({ fail: true });
  const p = await g.pub();
  assert.equal(p.phase, 'end');
  assert.equal(p.winner, 'evil');
  assert.equal(p.reason, 'questsEvil');
});

for (const hit of [true, false]) {
  test(`刺殺梅林：${hit ? '猜中，邪惡方逆轉獲勝' : '猜錯，正義方獲勝'}；不能指認邪惡方`, async () => {
    const g = await newGame(5);
    await g.readyAll();
    for (let i = 0; i < 3; i++) await g.runQuest();
    let p = await g.pub();
    assert.equal(p.phase, 'assassin');
    assert.deepEqual([...toArray(p.evil)].sort(), [...g.evil].sort(), '刺殺階段公開邪惡方');

    await g.write('assassinPick', { target: g.evil[1] });
    await g.settle();
    assert.equal(await g.get('assassinPick'), null, '指認邪惡方要被退回');
    assert.equal((await g.pub()).phase, 'assassin');

    const target = hit ? g.who('merlin') : g.good.find((u) => g.roles[u] !== 'merlin');
    await g.write('assassinPick', { target });
    await g.settle();
    p = await g.pub();
    assert.equal(p.phase, 'end');
    assert.equal(p.winner, hit ? 'evil' : 'good');
    assert.equal(p.reason, hit ? 'assassinHit' : 'assassinMiss');
    assert.equal(p.assassinTarget, target);
  });
}

test('沒有梅林與刺客時，完成三個任務正義方直接獲勝', async () => {
  const g = await newGame(5, { roles: { merlinAssassin: false, percival: false, morgana: false } });
  await g.readyAll();
  for (let i = 0; i < 3; i++) await g.runQuest();
  const p = await g.pub();
  assert.equal(p.phase, 'end');
  assert.equal(p.winner, 'good');
  assert.equal(p.reason, 'questsGood');
});

test('湖中女神：第 2、3、4 個任務後使用，結果只給持有者，令牌轉交，奧伯倫顯示為邪惡', async () => {
  const g = await newGame(7, { lady: true, roles: { oberon: true } });
  await g.readyAll();
  const lady = async (pickTarget) => {
    const p = await g.pub();
    assert.equal(p.phase, 'lady');
    const holder = p.lady.holder;
    await g.write('ladyPick', { target: holder, round: p.round });
    await g.settle();
    assert.equal(await g.get('ladyPick'), null, '不能查驗自己');
    const options = ladyTargets(toArray(p.order), holder, p.lady.used);
    const target = pickTarget(options, holder);
    await g.write('ladyPick', { target, round: p.round });
    await g.settle();
    const result = await g.get(`secret/${holder}/lady/${p.round}`);
    assert.deepEqual(result, { target, team: teamOf(g.roles[target]) });
    const after = await g.pub();
    assert.equal(after.lady.holder, target);
    assert.equal(after.lady.used[target], true);
    assert.equal(after.phase, 'team');
    assert.equal(after.round, p.round + 1);
    assert.equal(after.leaderIdx, (p.leaderIdx + 1) % 7);
    return holder;
  };

  await g.runQuest({ fail: true });
  assert.equal((await g.pub()).phase, 'team', '第 1 個任務後不使用');
  await g.runQuest();
  const oberon = g.who('oberon');
  const firstHolder = await lady((opts) => (opts.includes(oberon) ? oberon : opts[0]));
  if (g.roles[firstHolder] !== 'oberon' && (await g.get(`secret/${firstHolder}/lady/2`)).target === oberon) {
    assert.equal((await g.get(`secret/${firstHolder}/lady/2`)).team, 'evil');
  }

  await g.runQuest({ fail: true });
  const p3 = await g.pub();
  await g.write('ladyPick', { target: firstHolder, round: p3.round });
  await g.settle();
  assert.equal(await g.get('ladyPick'), null, '曾經持有過的人不能被查驗');
  await lady((opts) => opts[0]);

  await g.runQuest();
  await lady((opts) => opts[0]);
  await g.runQuest();
  assert.equal((await g.pub()).phase, 'assassin', '第 5 個任務後不使用湖中女神');
});

test('指定任務：可以跳著挑戰，第 5 個任務要先成功 2 個任務', async () => {
  const g = await newGame(5, { targeting: true });
  await g.readyAll();
  await g.propose(g.good.slice(0, questSize(5, 4)), 4);
  assert.equal(await g.get('draft/submitted'), false, '第 5 個任務還不能挑戰');
  await g.runQuest({ quest: 2 });
  await g.runQuest({ quest: 0 });
  await g.runQuest({ quest: 4 });
  const p = await g.pub();
  assert.equal(p.quests[2].result, 'success');
  assert.equal(p.quests[0].result, 'success');
  assert.equal(p.quests[4].result, 'success');
  assert.equal(p.phase, 'assassin');
});

test('冪等：重複處理或換新房主，都不會重複推進遊戲', async () => {
  const g = await newGame(5);
  await g.readyAll();
  await g.propose(g.good.slice(0, 2));
  await g.voteAll(true);
  const before = await g.pub();
  await g.settle();
  await g.settle(new HostEngine(CODE, 'u0', g.db));
  assert.deepEqual(await g.pub(), before);

  await g.write('meta/hostUid', 'u1');
  for (const u of Object.keys(before.team)) await g.multi({ [`cards/${before.runId}/${u}`]: 'S', [`played/${before.runId}/${u}`]: true });
  await g.engine.step(await g.state('u0'));
  assert.equal((await g.pub()).phase, 'quest', '舊房主不能再推進');
  await g.settle(new HostEngine(CODE, 'u1', g.db));
  const p = await g.pub();
  assert.equal(p.phase, 'team');
  assert.equal(p.round, 2);
  assert.equal(Object.keys(p.quests).filter((k) => p.quests[k]).length, 1, '任務只結算一次');
});

test('遊戲紀錄：每次提案都記錄隊長、隊員、每個人的票與任務結果', async () => {
  const g = await newGame(5);
  await g.readyAll();
  await g.propose(g.good.slice(0, 2));
  await g.voteAll(false);
  await g.runQuest();
  const hist = Object.entries(await g.get('hist')).sort(([a], [b]) => (a < b ? -1 : 1)).map(([, e]) => e);
  assert.equal(hist.length, 2);
  assert.equal(hist[0].approved, false);
  assert.equal(hist[1].approved, true);
  assert.equal(hist[1].result, 'success');
  assert.equal(hist[1].fails, 0);
  assert.equal(Object.keys(hist[1].votes).length, 5);
  const log = Object.values(await g.get('log'));
  assert.ok(log.length >= 4);
});

test('再來一局：清除身分與操作資料，保留玩家、設定與上一局的公開紀錄', async () => {
  const g = await newGame(5);
  await g.readyAll();
  await g.runQuest();
  await backToLobby(CODE, g.db);
  assert.equal(await g.get('meta/status'), 'lobby');
  for (const key of ['secret', 'hostSecret', 'votes', 'voted', 'cards', 'played', 'draft', 'ready', 'ladyPick', 'assassinPick']) {
    assert.equal(await g.get(key), null, `${key} 應該被清除`);
  }
  assert.ok(await g.get('hist'), '保留上一局紀錄');
  assert.ok(await g.get('log'), '保留上一局日誌');
  assert.equal(Object.keys(await g.get('players')).length, 5);
  assert.ok(await g.get('settings'));

  // 下一局開始時才清掉舊紀錄
  await startGame(CODE, await g.state(), g.db);
  assert.equal(await g.get('hist'), null);
  assert.equal(Object.values(await g.get('log')).length, 1);
  assert.equal((await g.pub()).phase, 'night');
});

test('開局時重新讀取玩家名單（有人在按下開始的瞬間離開）', async () => {
  const g = await newGame(6, {}, { start: false });
  const stale = await g.state();
  await g.write('players/u5', null);
  await startGame(CODE, stale, g.db);
  assert.deepEqual(toArray((await g.pub()).order), ['u0', 'u1', 'u2', 'u3', 'u4']);
});

test('湖中女神：回合編號不符的選擇會被清除，持有者可以重新選', async () => {
  const g = await newGame(7, { lady: true });
  await g.readyAll();
  await g.runQuest();
  await g.runQuest();
  const p = await g.pub();
  assert.equal(p.phase, 'lady');
  const target = ladyTargets(toArray(p.order), p.lady.holder, p.lady.used)[0];
  await g.write('ladyPick', { target, round: p.round - 1 });
  await g.settle();
  assert.equal(await g.get('ladyPick'), null);
  assert.equal((await g.pub()).phase, 'lady');
});

const online = async (g, uids) => { for (const u of uids) await g.write(`presence/${u}/conns/c1`, true); };
const offline = (g, u) => g.write(`presence/${u}/conns`, null);

test('卡關處理：在線玩家還沒行動不算卡關；沒有人卡住時不能代為處理', async () => {
  const g = await newGame(5);
  await g.readyAll();
  await online(g, g.uids);
  await g.propose(g.good.slice(0, 2));
  assert.equal(stuckInfo(await g.state()), null);
  await assert.rejects(resolveStuck(CODE, await g.state(), g.db), /沒有需要處理/);
});

test('卡關處理：離線玩家的票計為反對、離線隊員視為出成功牌，並寫入日誌', async () => {
  const g = await newGame(5);
  await g.readyAll();
  await online(g, g.uids);
  await g.propose(g.good.slice(0, 2));
  let p = await g.pub();
  for (const u of g.uids.slice(0, 4)) await g.multi({ [`votes/${p.voteId}/${u}`]: true, [`voted/${p.voteId}/${u}`]: true });
  await offline(g, 'u4');
  assert.deepEqual(stuckInfo(await g.state()), { kind: 'vote', who: ['u4'] });
  await resolveStuck(CODE, await g.state(), g.db);
  await g.settle();
  p = await g.pub();
  assert.equal(p.lastVote.votes.u4, false, '離線玩家的票是反對');
  assert.equal(p.phase, 'quest', '4 贊成 1 反對，隊伍通過');

  const [first, second] = Object.keys(p.team);
  await g.multi({ [`cards/${p.runId}/${first}`]: 'S', [`played/${p.runId}/${first}`]: true });
  await offline(g, second);
  assert.deepEqual(stuckInfo(await g.state()), { kind: 'quest', who: [second] });
  await resolveStuck(CODE, await g.state(), g.db);
  await g.settle();
  assert.equal((await g.pub()).quests[0].result, 'success');

  const log = Object.values(await g.get('log')).map((e) => e.text).join('\n');
  assert.match(log, /計為反對/);
  assert.match(log, /出成功牌/);
});

test('卡關處理：隊長離線時換下一位（不計否決）；湖中女神持有者離線時跳過查驗', async () => {
  const g = await newGame(7, { lady: true });
  await g.readyAll();
  let p = await g.pub();
  await online(g, g.uids.filter((u) => u !== p.leader));
  assert.equal(stuckInfo(await g.state()).kind, 'team');
  await resolveStuck(CODE, await g.state(), g.db);
  const after = await g.pub();
  assert.equal(after.phase, 'team');
  assert.equal(after.leaderIdx, (p.leaderIdx + 1) % 7);
  assert.equal(after.attempt, 1, '換隊長不算否決');

  await online(g, g.uids);
  await g.runQuest();
  await g.runQuest();
  p = await g.pub();
  assert.equal(p.phase, 'lady');
  await offline(g, p.lady.holder);
  assert.equal(stuckInfo(await g.state()).kind, 'lady');
  await resolveStuck(CODE, await g.state(), g.db);
  const next = await g.pub();
  assert.equal(next.phase, 'team');
  assert.equal(next.round, p.round + 1);
  assert.equal(next.lady.holder, p.lady.holder, '跳過時令牌不轉交');
});

test('卡關處理：刺客離線時房主可代為指認；刺客在線或指認邪惡方時不行', async () => {
  const g = await newGame(5);
  await g.readyAll();
  await online(g, g.uids);
  for (let i = 0; i < 3; i++) await g.runQuest();
  assert.equal((await g.pub()).phase, 'assassin');
  assert.equal(await findAssassin(CODE, g.db), g.who('assassin'));
  const merlin = g.who('merlin');
  await assert.rejects(resolveStuck(CODE, await g.state(), g.db, { target: merlin }), /刺客在線上/);
  await offline(g, g.who('assassin'));
  await assert.rejects(resolveStuck(CODE, await g.state(), g.db, { target: g.evil[0] }), /非邪惡方/);
  await resolveStuck(CODE, await g.state(), g.db, { target: merlin });
  await g.settle();
  const p = await g.pub();
  assert.equal(p.winner, 'evil');
  assert.equal(p.reason, 'assassinHit');
});

test('人數或角色設定不合法時無法開始', async () => {
  const small = await newGame(4, {}, { start: false });
  await assert.rejects(startGame(CODE, await small.state(), small.db), /至少需要 5 人/);
  const tooEvil = await newGame(5, { roles: { mordred: true, oberon: true } }, { start: false });
  await assert.rejects(startGame(CODE, await tooEvil.state(), tooEvil.db), /邪惡方特殊角色太多/);
});

test('不是房主的瀏覽器不會推進遊戲', async () => {
  const g = await newGame(5);
  for (const u of g.uids) await g.write(`ready/${u}`, true);
  await g.settle(new HostEngine(CODE, 'u3', g.db));
  assert.equal((await g.pub()).phase, 'night');
});
