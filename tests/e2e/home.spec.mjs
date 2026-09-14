// 功能測試：首頁（建立房間、加入房間、輸入檢查、邀請連結）
import { test, expect } from '@playwright/test';
import { BASE, assertEmulator, newPlayers, closePlayers, createRoom, expectNoPageErrors } from './helpers.mjs';

test.beforeAll(assertEmulator);

test.describe('首頁', () => {
  let players;
  test.afterEach(async () => { await closePlayers(players); });

  test('沒有輸入暱稱時，建立與加入都會提示', async ({ browser }) => {
    players = await newPlayers(browser, 1);
    const { page } = players[0];
    await page.goto(BASE);
    await page.getByTestId('create-room').click();
    await expect(page.locator('.toast', { hasText: '請先輸入你的暱稱' })).toBeVisible();
    await page.getByTestId('code-input').fill('ABCD');
    await page.getByTestId('join-room').click();
    await expect(page.locator('.toast', { hasText: '請先輸入你的暱稱' })).toBeVisible();
  });

  test('房間代碼只接受英文字母並自動轉大寫；少於 4 碼會提示', async ({ browser }) => {
    players = await newPlayers(browser, 1);
    const { page } = players[0];
    await page.goto(BASE);
    await page.getByTestId('name-input').fill('測試');
    await page.getByTestId('code-input').fill('ab1c!');
    await expect(page.getByTestId('code-input')).toHaveValue('ABC');
    await page.getByTestId('join-room').click();
    await expect(page.locator('.toast', { hasText: '4 個英文字母' })).toBeVisible();
  });

  test('加入不存在的房間會顯示錯誤', async ({ browser }) => {
    players = await newPlayers(browser, 1);
    const { page } = players[0];
    await page.goto(BASE);
    await page.getByTestId('name-input').fill('測試');
    await page.getByTestId('code-input').fill('ZZZQ');
    await page.getByTestId('join-room').click();
    await expect(page.locator('.toast', { hasText: '找不到這個房間' })).toBeVisible();
    await expect(page.getByTestId('name-input')).toBeVisible();
  });

  test('建立房間後重新整理仍在同一個房間，暱稱會被記住', async ({ browser }) => {
    players = await newPlayers(browser, 1);
    const p = players[0];
    const code = await createRoom(p);
    await expect(p.page).toHaveURL(new RegExp(`#${code}$`));
    await p.page.reload();
    await expect(p.page.getByTestId('room-code')).toHaveText(code);
    await p.page.getByRole('button', { name: '離開房間' }).click();
    await p.page.getByRole('button', { name: '離開', exact: true }).click();
    await expect(p.page.getByTestId('name-input')).toHaveValue(p.name);
    expectNoPageErrors(players);
  });

  test('打開邀請連結會自動填入房間代碼', async ({ browser }) => {
    players = await newPlayers(browser, 2);
    const code = await createRoom(players[0]);
    await players[1].page.goto(`${BASE}#${code}`);
    await expect(players[1].page.getByTestId('code-input')).toHaveValue(code);
  });
});
