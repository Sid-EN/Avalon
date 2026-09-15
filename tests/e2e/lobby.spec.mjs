// 功能測試：大廳（設定同步、驗證、改名、座位、移出、轉移房主、離開）
import { test, expect } from '@playwright/test';
import { BASE, assertEmulator, newPlayers, closePlayers, createRoom, joinRoom, setOption, expectNoPageErrors } from './helpers.mjs';

test.beforeAll(assertEmulator);

const rowNames = async (page) => (await page.locator('.player-row .pname').allTextContents())
  .map((t) => t.replace(/（你）|房主/g, '').trim());

test.describe('大廳', () => {
  let players;
  test.afterEach(async () => { await closePlayers(players); });

  async function room(browser, n) {
    players = await newPlayers(browser, n);
    const code = await createRoom(players[0]);
    for (const p of players.slice(1)) await joinRoom(p, code);
    await expect(players[0].page.getByText(`${n}／10`)).toBeVisible();
    return code;
  }

  test('人數不足時無法開始並顯示原因；只有房主有開始按鈕', async ({ browser }) => {
    await room(browser, 3);
    const [host, guest] = players;
    await expect(host.page.getByTestId('start-game')).toBeDisabled();
    await expect(host.page.locator('.notice.error')).toContainText('至少需要 5 人');
    await expect(guest.page.getByTestId('start-game')).toHaveCount(0);
    await expect(guest.page.locator('.waiting')).toContainText('等待房主 P0');
  });

  test('房主的設定會即時同步，其他人不能修改', async ({ browser }) => {
    await room(browser, 2);
    const [host, guest] = players;
    await expect(guest.page.locator('label.role-opt', { hasText: '湖中女神' }).locator('input')).toBeDisabled();
    await setOption(host, [guest], '湖中女神');
    await setOption(host, [guest], '指定任務');
    await host.page.locator('.timer-field', { hasText: '投票' }).locator('select').selectOption('30');
    await expect(guest.page.locator('.timer-field', { hasText: '投票' }).locator('select')).toHaveValue('30');
    await setOption(host, [guest], '湖中女神', false);
    expectNoPageErrors(players);
  });

  test('邪惡方特殊角色超過人數時顯示錯誤並無法開始', async ({ browser }) => {
    await room(browser, 5);
    const [host, guest] = players;
    await expect(host.page.getByTestId('start-game')).toBeEnabled();
    await setOption(host, [guest], '莫德雷德');
    await expect(host.page.locator('.notice.error')).toContainText('邪惡方特殊角色太多');
    await expect(host.page.getByTestId('start-game')).toBeDisabled();
    await setOption(host, [guest], '莫德雷德', false);
    await expect(host.page.getByTestId('start-game')).toBeEnabled();
  });

  test('暱稱重複時自動加數字；改名會同步給所有人', async ({ browser }) => {
    const code = await room(browser, 2);
    const [host, a] = players;
    const [b] = await newPlayers(browser, 1, { prefix: 'X' });
    players.push(b);
    await b.page.goto(BASE);
    await b.page.getByTestId('name-input').fill('P1');
    await b.page.getByTestId('code-input').fill(code);
    await b.page.getByTestId('join-room').click();
    await expect(b.page.locator('.toast', { hasText: '你的暱稱是「P12」' })).toBeVisible();
    await expect(host.page.locator('.player-row', { hasText: 'P12' })).toBeVisible();

    await a.page.getByRole('button', { name: '改名' }).click();
    await a.page.locator('.modal input').fill('蘭斯洛特');
    await a.page.getByRole('button', { name: '儲存' }).click();
    await expect(host.page.locator('.player-row', { hasText: '蘭斯洛特' })).toBeVisible();
  });

  test('房主調整座位順序會同步給所有人', async ({ browser }) => {
    await room(browser, 3);
    const [host, , third] = players;
    await host.page.locator('.player-row', { hasText: 'P1' }).getByRole('button', { name: '往下移' }).click();
    await expect.poll(() => rowNames(third.page)).toEqual(['P0', 'P2', 'P1']);
  });

  test('移出玩家：被移出的人回到首頁，而且不能再加入', async ({ browser }) => {
    const code = await room(browser, 2);
    const [host, guest] = players;
    await host.page.locator('.player-row', { hasText: 'P1' }).getByRole('button', { name: '移出房間' }).click();
    await host.page.getByRole('button', { name: '移出', exact: true }).click();
    await expect(guest.page.getByTestId('name-input')).toBeVisible();
    await expect(guest.page.locator('.toast', { hasText: '你已被房主移出房間' })).toBeVisible();
    await expect(host.page.getByText('1／10')).toBeVisible();

    await guest.page.getByTestId('code-input').fill(code);
    await guest.page.getByTestId('join-room').click();
    await expect(guest.page.locator('.toast', { hasText: '你已被房主移出這個房間' })).toBeVisible();
  });

  test('房主鎖定房間後新玩家無法加入，解鎖後可以加入', async ({ browser }) => {
    const code = await room(browser, 2);
    const [host, guest] = players;
    await host.page.getByTestId('lock-room').check();
    await expect(guest.page.getByText('房主已鎖定房間')).toBeVisible();

    const [late] = await newPlayers(browser, 1, { prefix: 'L' });
    players.push(late);
    await late.page.goto(BASE);
    await late.page.getByTestId('name-input').fill(late.name);
    await late.page.getByTestId('code-input').fill(code);
    await late.page.getByTestId('join-room').click();
    await expect(late.page.locator('.toast', { hasText: '房主已鎖定房間' })).toBeVisible();

    await host.page.getByTestId('lock-room').uncheck();
    await expect(guest.page.getByText('房主已鎖定房間')).toHaveCount(0);
    await late.page.getByTestId('join-room').click();
    await expect(late.page.getByTestId('room-code')).toHaveText(code);
  });

  test('轉移房主後，原房主離開房間', async ({ browser }) => {
    await room(browser, 3);
    const [host, next, third] = players;
    await host.page.locator('.player-row', { hasText: 'P1' }).getByRole('button', { name: '設為房主' }).click();
    await host.page.getByRole('button', { name: '確定', exact: true }).click();
    await expect(next.page.getByTestId('start-game')).toBeVisible();
    await expect(host.page.locator('.waiting')).toContainText('等待房主 P1');

    await host.page.getByRole('button', { name: '離開房間' }).click();
    await host.page.getByRole('button', { name: '離開', exact: true }).click();
    await expect(host.page.getByTestId('name-input')).toBeVisible();
    await expect(third.page.getByText('2／10')).toBeVisible();
    expectNoPageErrors(players);
  });
});
