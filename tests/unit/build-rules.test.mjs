// 單元測試：database.rules.json 必須與產生器一致，且沒有全面開放的規則
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildRules } from '../../tools/build-rules.mjs';

const committed = JSON.parse(readFileSync(new URL('../../database.rules.json', import.meta.url), 'utf8'));

test('database.rules.json 是最新的（改了 tools/build-rules.mjs 要重新產生）', () => {
  assert.deepEqual(committed, buildRules(), '請執行 npm run build:rules');
});

test('沒有任何 .read/.write 直接設為 true', () => {
  const walk = (node, path) => {
    for (const [key, value] of Object.entries(node)) {
      if ((key === '.read' || key === '.write') && (value === true || value === 'true')) assert.fail(`${path}/${key} 全面開放`);
      if (value && typeof value === 'object' && !Array.isArray(value)) walk(value, `${path}/${key}`);
    }
  };
  walk(committed.rules, '');
  assert.equal(committed.rules['.read'], undefined);
  assert.equal(committed.rules['.write'], undefined);
});

test('關鍵防作弊規則存在', () => {
  const room = committed.rules.rooms.$code;
  assert.match(room.secret.$uid['.read'], /auth\.uid === \$uid/, '只能讀自己的身分');
  assert.equal(room.secret['.read'], undefined, '不能一次讀全部身分');
  assert.match(room.cards.$rid.$uid['.validate'], /'evil'/, '好人不能出失敗牌');
  assert.match(room.votes.$vid.$uid['.write'], /!data\.exists\(\)/, '每人只能投一次');
  assert.match(room.hostSecret['.read'], /hostUid/, '只有房主能讀全部身分');
});
