// 系統測試：多位玩家用各自的瀏覽器完整玩一局
import { test, expect } from '@playwright/test';
import {
  assertEmulator, newPlayers, closePlayers, setupRoom, startAndReveal, playGame, probeSecurity, expectNoPageErrors,
} from './helpers.mjs';

test.beforeAll(assertEmulator);

const split = (players, roles) => {
  const names = players.map((p) => p.name);
  const find = (role) => names.find((n) => roles[n].role === role);
  return {
    names,
    evil: names.filter((n) => roles[n].team === 'evil'),
    good: names.filter((n) => roles[n].team === 'good'),
    merlin: find('梅林'),
    percival: find('派西維爾'),
    morgana: find('莫甘娜'),
  };
};

test('7 人局：夜晚情報、防作弊、否決、湖中女神、雙失敗規則、刺殺失敗 → 正義方獲勝', async ({ browser }) => {
  test.setTimeout(360_000);
  const players = await newPlayers(browser, 7);
  try {
    const code = await setupRoom(players, { lady: true });
    const roles = await startAndReveal(players);
    const { evil, good, merlin, percival, morgana } = split(players, roles);

    expect(evil).toHaveLength(3);
    expect([...roles[merlin].sees].sort()).toEqual([...evil].sort());
    expect([...roles[percival].sees].sort()).toEqual([merlin, morgana].sort());
    for (const e of evil) expect([...roles[e].sees].sort()).toEqual(evil.filter((x) => x !== e).sort());

    // 一般玩家用開發者工具偷看或竄改，全部都會被拒絕
    expect(await probeSecurity(players[1].page, code)).toEqual({
      ownSecret: 'READ_OK', otherSecret: 'DENIED', allSecrets: 'DENIED', hostSecret: 'DENIED',
      allVotes: 'DENIED', allCards: 'DENIED', writePub: 'DENIED', writeOtherSecret: 'DENIED',
    });

    const result = await playGame(players, roles, {
      vote: ({ round, attempt }) => !(round === 1 && attempt === 1),
      team: ({ round, need }) => (round === 1 || round === 3 ? [evil[0], ...good] : good).slice(0, need),
      fail: ({ round }) => round === 1 || round === 3,
      assassin: (options) => options.find((n) => n !== merlin),
    });
    expect(result.winner).toBe('正義方獲勝');
    expect(result.reason).toBe('刺客沒有找出梅林');
    expect(result.ladyUses).toBe(3);

    const host = players[0].page;
    await expect(host.locator('.quest.fail')).toHaveCount(2);
    await expect(host.locator('.quest.success')).toHaveCount(3);
    await expect(host.locator('.reveal-item')).toHaveCount(7);
    await host.getByRole('button', { name: '查看完整紀錄' }).click();
    await expect(host.locator('.hist thead th')).toHaveCount(7); // 玩家欄＋6 次提案
    await host.keyboard.press('Escape');

    await host.getByTestId('play-again').click();
    await host.getByRole('button', { name: '回到大廳', exact: true }).click();
    for (const p of players) await expect(p.page.getByTestId('room-code')).toHaveText(code);
    await players[3].page.getByTestId('last-game').click();
    await expect(players[3].page.locator('.hist thead th')).toHaveCount(7);
    expectNoPageErrors(players);
  } finally {
    await closePlayers(players);
  }
});

test('5 人局：三個任務失敗 → 邪惡方立即獲勝', async ({ browser }) => {
  test.setTimeout(240_000);
  const players = await newPlayers(browser, 5);
  try {
    await setupRoom(players);
    const roles = await startAndReveal(players);
    const { evil, good } = split(players, roles);
    const result = await playGame(players, roles, {
      team: ({ need }) => [evil[0], ...good].slice(0, need),
      fail: () => true,
    });
    expect(result.winner).toBe('邪惡方獲勝');
    expect(result.reason).toBe('三個任務失敗');
    expect(result.assassinated).toBeNull();
    await expect(players[0].page.locator('.quest.fail')).toHaveCount(3);
    expectNoPageErrors(players);
  } finally {
    await closePlayers(players);
  }
});

test('5 人局：同一輪連續 5 次否決 → 邪惡方獲勝', async ({ browser }) => {
  test.setTimeout(240_000);
  const players = await newPlayers(browser, 5);
  try {
    await setupRoom(players);
    const roles = await startAndReveal(players);
    const result = await playGame(players, roles, { vote: () => false });
    expect(result.winner).toBe('邪惡方獲勝');
    expect(result.reason).toBe('同一輪連續五次否決隊伍');
    expect(result.proposals).toBe(5);
    expectNoPageErrors(players);
  } finally {
    await closePlayers(players);
  }
});

test('5 人局指定任務：第 5 個任務要先成功兩個，刺客刺中梅林 → 邪惡方逆轉', async ({ browser }) => {
  test.setTimeout(240_000);
  const players = await newPlayers(browser, 5);
  try {
    await setupRoom(players, { targeting: true });
    const roles = await startAndReveal(players);
    const { good, merlin } = split(players, roles);
    const result = await playGame(players, roles, {
      team: ({ need }) => good.slice(0, need),
      quest: (labels) => labels.length - 1,
      assassin: (options) => options.find((n) => n === merlin),
    });
    expect(result.questChoices[0].some((l) => l.startsWith('任務5'))).toBe(false);
    expect(result.questChoices.some((labels) => labels.some((l) => l.startsWith('任務5')))).toBe(true);
    expect(result.winner).toBe('邪惡方獲勝');
    expect(result.reason).toBe('刺客成功刺殺了梅林');
    expectNoPageErrors(players);
  } finally {
    await closePlayers(players);
  }
});
