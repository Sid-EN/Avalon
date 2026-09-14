// 單元測試：自製 SVG 插圖格式正確
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roleSvg, roleBadgeSvg, cardBackSvg, TOKENS } from '../../js/art.js';
import { ROLES } from '../../js/rules.js';

const count = (s, re) => (s.match(re) || []).length;
function assertBalanced(svg, label) {
  assert.ok(svg.trim().startsWith('<svg'), `${label} 要以 <svg 開頭`);
  assert.ok(svg.trim().endsWith('</svg>'), `${label} 要以 </svg> 結尾`);
  assert.equal(count(svg, /<svg[\s>]/g), count(svg, /<\/svg>/g), `${label} svg 標籤數量`);
  assert.equal(count(svg, /<g[\s>]/g), count(svg, /<\/g>/g), `${label} g 標籤數量`);
  assert.equal(count(svg, /<defs>/g), count(svg, /<\/defs>/g), `${label} defs 標籤數量`);
  assert.ok(!svg.includes('undefined') && !svg.includes('NaN'), `${label} 含有 undefined/NaN`);
}

test('每個角色都有完整的卡面插圖，並顯示角色名稱', () => {
  for (const [role, info] of Object.entries(ROLES)) {
    const svg = roleSvg(role);
    assertBalanced(svg, role);
    assert.ok(svg.includes(info.name), `${role} 卡面要有名稱`);
    assert.ok(!svg.includes('GOLD'), `${role} 還有沒替換的顏色佔位字`);
    const ids = [...svg.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(ids.every((id) => id.startsWith(`c-${role}`)), `${role} 的漸層 id 要用角色名稱開頭，避免互相衝突`);
  }
});

test('座位徽章只改變可視範圍，並且會快取', () => {
  assert.ok(roleBadgeSvg('merlin').includes('viewBox="34 52 132 132"'));
  assert.equal(roleSvg('merlin'), roleSvg('merlin'));
  assertBalanced(roleSvg('unknown-role'), 'unknown');
});

test('卡背與所有標記都是合法的 SVG', () => {
  assertBalanced(cardBackSvg(), 'cardBack');
  for (const [name, svg] of Object.entries(TOKENS)) assertBalanced(svg, name);
  for (const name of ['crown', 'lady', 'shield', 'approve', 'reject', 'success', 'fail', 'successCard', 'failCard', 'book']) {
    assert.ok(TOKENS[name], `缺少標記：${name}`);
  }
});
