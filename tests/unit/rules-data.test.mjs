// 單元測試：官方規則表（原版規則書）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEAM_COUNTS, QUEST_SIZES, failsRequired, ROLES, MAX_REJECTIONS, WINS_NEEDED, LADY_AFTER_QUESTS } from '../../js/rules.js';

test('各人數的正邪人數與官方規則書一致', () => {
  assert.deepEqual(TEAM_COUNTS, {
    5: { good: 3, evil: 2 }, 6: { good: 4, evil: 2 }, 7: { good: 4, evil: 3 },
    8: { good: 5, evil: 3 }, 9: { good: 6, evil: 3 }, 10: { good: 6, evil: 4 },
  });
});

test('各人數每個任務的出隊人數與官方規則書一致', () => {
  assert.deepEqual(QUEST_SIZES, {
    5: [2, 3, 2, 3, 3], 6: [2, 3, 4, 3, 4], 7: [2, 3, 3, 4, 4],
    8: [3, 4, 4, 5, 5], 9: [3, 4, 4, 5, 5], 10: [3, 4, 4, 5, 5],
  });
});

test('只有 7 人以上的第 4 個任務需要 2 張失敗牌', () => {
  for (let n = 5; n <= 10; n++) {
    for (let q = 0; q < 5; q++) assert.equal(failsRequired(n, q), n >= 7 && q === 3 ? 2 : 1, `${n} 人任務 ${q + 1}`);
  }
});

test('勝利條件與擴充規則常數', () => {
  assert.equal(MAX_REJECTIONS, 5);
  assert.equal(WINS_NEEDED, 3);
  assert.deepEqual(LADY_AFTER_QUESTS, [2, 3, 4]);
});

test('角色陣營', () => {
  const good = Object.keys(ROLES).filter((r) => ROLES[r].team === 'good').sort();
  const evil = Object.keys(ROLES).filter((r) => ROLES[r].team === 'evil').sort();
  assert.deepEqual(good, ['merlin', 'percival', 'servant']);
  assert.deepEqual(evil, ['assassin', 'minion', 'mordred', 'morgana', 'oberon']);
});
