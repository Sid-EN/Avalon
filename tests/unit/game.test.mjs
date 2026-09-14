// 規則邏輯單元測試：node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../../js/game.js';
import { TEAM_COUNTS, QUEST_SIZES } from '../../js/rules.js';

const uids = (n) => Array.from({ length: n }, (_, i) => `u${i}`);
const all = { merlinAssassin: true, percival: true, morgana: true, mordred: true, oberon: true };

test('每種人數的角色牌數量正確', () => {
  for (let n = 5; n <= 10; n++) {
    const list = G.buildRoleList(n, { roles: { merlinAssassin: true } });
    assert.equal(list.length, n);
    assert.equal(list.filter((r) => G.teamOf(r) === 'good').length, TEAM_COUNTS[n].good);
    assert.equal(list.filter((r) => G.teamOf(r) === 'evil').length, TEAM_COUNTS[n].evil);
  }
});

test('夜晚情報：梅林看不到莫德雷德、看得到奧伯倫；邪惡方互看但不含奧伯倫', () => {
  const roles = { a: 'merlin', b: 'percival', c: 'servant', d: 'servant', e: 'assassin', f: 'morgana', g: 'mordred', h: 'oberon', i: 'servant', j: 'servant' };
  assert.deepEqual(G.knowledgeFor('a', roles), { e: 'evil', f: 'evil', h: 'evil' });
  assert.deepEqual(G.knowledgeFor('b', roles), { a: 'merlinOrMorgana', f: 'merlinOrMorgana' });
  assert.deepEqual(G.knowledgeFor('e', roles), { f: 'evil', g: 'evil' });
  assert.deepEqual(G.knowledgeFor('g', roles), { e: 'evil', f: 'evil' });
  assert.deepEqual(G.knowledgeFor('h', roles), {});
  assert.deepEqual(G.knowledgeFor('c', roles), {});
});

test('派西維爾在沒有莫甘娜時只看到梅林', () => {
  const roles = { a: 'merlin', b: 'percival', c: 'assassin', d: 'servant', e: 'minion' };
  assert.deepEqual(G.knowledgeFor('b', roles), { a: 'merlin' });
});

test('setupGame：身分全部分配，湖中女神在首位隊長的右手邊', () => {
  for (let i = 0; i < 50; i++) {
    const order = uids(8);
    // 8 人局邪惡方只有 3 人，所以不放奧伯倫
    const { roles, secrets, leaderIdx, ladyHolder } = G.setupGame(order, { roles: { ...all, oberon: false }, lady: true });
    assert.equal(Object.keys(roles).length, 8);
    assert.equal(ladyHolder, order[(leaderIdx + 7) % 8]);
    for (const u of order) assert.equal(secrets[u].team, G.teamOf(roles[u]));
    const values = Object.values(roles);
    for (const r of ['merlin', 'percival', 'assassin', 'morgana', 'mordred']) assert.equal(values.filter((x) => x === r).length, 1);
  }
});

test('亂數洗牌分布大致平均', () => {
  const counts = [0, 0, 0, 0, 0];
  for (let i = 0; i < 5000; i++) counts[G.shuffle([0, 1, 2, 3, 4]).indexOf(0)]++;
  for (const c of counts) assert.ok(c > 850 && c < 1150, `分布異常：${counts}`);
});

test('投票：過半數才通過，平手算否決', () => {
  const order = uids(6);
  assert.equal(G.tallyVotes(order, { u0: true, u1: true, u2: true }).approved, false);
  assert.equal(G.tallyVotes(order, { u0: true, u1: true, u2: true, u3: true }).approved, true);
  assert.equal(G.tallyVotes(uids(5), { u0: true, u1: true, u2: true }).approved, true);
});

test('任務：7 人以上第 4 個任務需要 2 張失敗牌', () => {
  assert.equal(G.questOutcome(7, 3, { a: 'F', b: 'S', c: 'S', d: 'S' }).result, 'success');
  assert.equal(G.questOutcome(7, 3, { a: 'F', b: 'F', c: 'S', d: 'S' }).result, 'fail');
  assert.equal(G.questOutcome(6, 3, { a: 'F', b: 'S', c: 'S' }).result, 'fail');
  assert.equal(G.questOutcome(10, 2, { a: 'F', b: 'S', c: 'S', d: 'S' }).result, 'fail');
  assert.deepEqual(QUEST_SIZES[7], [2, 3, 3, 4, 4]);
});

test('任務後的下一步', () => {
  const r = (arr) => Object.fromEntries(arr.map((x, i) => [i, { result: x }]));
  assert.equal(G.nextStepAfterQuest(r(['fail', 'fail', 'fail']), { lady: true, hasAssassin: true }), 'evil');
  assert.equal(G.nextStepAfterQuest(r(['success', 'success', 'success']), { lady: true, hasAssassin: true }), 'assassin');
  assert.equal(G.nextStepAfterQuest(r(['success', 'success', 'success']), { lady: false, hasAssassin: false }), 'good');
  assert.equal(G.nextStepAfterQuest(r(['success']), { lady: true, hasAssassin: true }), 'team');
  assert.equal(G.nextStepAfterQuest(r(['success', 'fail']), { lady: true, hasAssassin: true }), 'lady');
  assert.equal(G.nextStepAfterQuest(r(['success', 'fail']), { lady: false, hasAssassin: true }), 'team');
  assert.equal(G.nextStepAfterQuest(r(['success', 'fail', 'success', 'fail']), { lady: true, hasAssassin: true }), 'lady');
});

test('指定任務：第 5 個任務要先成功 2 個', () => {
  assert.deepEqual(G.availableQuests({}, false), [0]);
  assert.deepEqual(G.availableQuests({ 0: { result: 'fail' } }, false), [1]);
  assert.deepEqual(G.availableQuests({}, true), [0, 1, 2, 3]);
  assert.deepEqual(G.availableQuests({ 2: { result: 'success' }, 0: { result: 'success' } }, true), [1, 3, 4]);
  // Firebase 可能把數字鍵物件轉成含 null 的陣列
  assert.deepEqual(G.availableQuests([null, { result: 'success' }], true), [0, 2, 3]);
});

test('湖中女神不能查驗自己或曾經持有過的人', () => {
  assert.deepEqual(G.ladyTargets(['a', 'b', 'c', 'd'], 'b', { a: true, b: true }), ['c', 'd']);
});

test('設定檢查', () => {
  assert.equal(G.validateSetup(4, G.DEFAULT_SETTINGS).errors.length, 1);
  assert.equal(G.validateSetup(5, G.DEFAULT_SETTINGS).errors.length, 0);
  assert.ok(G.validateSetup(5, { roles: all }).errors.some((e) => e.includes('邪惡方')));
  assert.ok(G.validateSetup(10, { roles: { percival: true } }).errors.some((e) => e.includes('梅林')));
  assert.ok(G.validateSetup(6, { roles: { merlinAssassin: true }, lady: true }).warnings.some((w) => w.includes('湖中女神')));
});
