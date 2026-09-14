// 系統測試：斷線重連、回首頁再回來、房主交接、離線卡關處理
import { test, expect } from '@playwright/test';
import {
  BASE, assertEmulator, newPlayers, closePlayers, createRoom, joinRoom, setupRoom, startAndReveal, playGame, expectNoPageErrors,
} from './helpers.mjs';

test.beforeAll(assertEmulator);

// 找到隊長並提出隊伍
async function proposeAnyTeam(players) {
  for (let t = 0; t < 60; t++) {
    for (const p of players) {
      const propose = p.page.getByTestId('propose');
      if (await propose.isVisible().catch(() => false)) {
        const chips = p.page.locator('[data-testid^="pick-"]');
        for (let i = 0; !(await propose.isEnabled()); i++) {
          await chips.nth(i).click();
          await p.page.waitForTimeout(150);
        }
        await propose.click();
        await p.page.getByRole('button', { name: '確定提名' }).click();
        return p;
      }
    }
    await players[0].page.waitForTimeout(250);
  }
  throw new Error('找不到隊長');
}

test('遊戲中重新整理：回到同一個座位、身分不變，可以繼續完成遊戲', async ({ browser }) => {
  test.setTimeout(240_000);
  const players = await newPlayers(browser, 5);
  try {
    await setupRoom(players);
    const roles = await startAndReveal(players);
    const leader = await proposeAnyTeam(players);
    const target = players.find((p) => p !== leader && p !== players[0]);

    await target.page.reload();
    await expect(target.page.getByTestId('vote-approve')).toBeVisible();
    await target.page.getByRole('button', { name: '我的身分' }).click();
    await expect(target.page.locator('.modal .team-banner')).toContainText(roles[target.name].role);
    await target.page.keyboard.press('Escape');

    const result = await playGame(players, roles);
    expect(result.winner).toMatch(/獲勝/);
    expectNoPageErrors(players);
  } finally {
    await closePlayers(players);
  }
});

test('遊戲中回首頁：座位保留，用房間代碼可以回到遊戲', async ({ browser }) => {
  test.setTimeout(240_000);
  const players = await newPlayers(browser, 5);
  try {
    const code = await setupRoom(players);
    const roles = await startAndReveal(players);
    const p = players[3];
    await p.page.getByTestId('leave-game').click();
    await p.page.locator('.modal').getByRole('button', { name: '回首頁', exact: true }).click();
    await expect(p.page.getByTestId('name-input')).toBeVisible();
    await expect(p.page.locator('.toast', { hasText: '座位還在' })).toBeVisible();

    await p.page.getByTestId('code-input').fill(code);
    await p.page.getByTestId('join-room').click();
    await expect(p.page.locator('.room-tag')).toHaveText(`#${code}`);

    const result = await playGame(players, roles);
    expect(result.winner).toMatch(/獲勝/);
  } finally {
    await closePlayers(players);
  }
});

test('房主在遊戲中轉移房主，新房主的瀏覽器接手推進遊戲', async ({ browser }) => {
  test.setTimeout(240_000);
  const players = await newPlayers(browser, 5);
  try {
    await setupRoom(players);
    const roles = await startAndReveal(players);
    const [host, next] = players;
    await host.page.getByTestId('host-menu').click();
    await host.page.locator('#host-transfer').selectOption({ label: next.name });
    await host.page.getByRole('button', { name: '轉移', exact: true }).click();
    await expect(next.page.getByTestId('host-menu')).toBeVisible();
    await expect(host.page.getByTestId('host-menu')).toHaveCount(0);

    const result = await playGame(players, roles);
    expect(result.winner).toMatch(/獲勝/);
    await expect(next.page.locator('.log')).toContainText(`房主交給 ${next.name}`);
    expectNoPageErrors(players);
  } finally {
    await closePlayers(players);
  }
});

test('等待中的玩家離線時，房主可以代為處理（票計為反對，並寫入日誌）', async ({ browser }) => {
  test.setTimeout(180_000);
  const players = await newPlayers(browser, 5);
  try {
    await setupRoom(players);
    await startAndReveal(players);
    await proposeAnyTeam(players);
    const quitter = players[4];
    for (const p of players.slice(0, 4)) {
      await p.page.getByTestId('vote-approve').click();
      await p.page.getByTestId('vote-submit').click();
      await expect(p.page.locator('.done-note')).toBeVisible();
    }
    await quitter.context.close();

    const host = players[0].page;
    await expect(host.locator('.notice.stuck')).toBeVisible({ timeout: 60_000 });
    await host.getByTestId('host-menu').click();
    await host.getByTestId('resolve-stuck').click();
    await host.getByRole('button', { name: '確定處理' }).click();
    await expect(host.locator('.vote-cell.no', { hasText: quitter.name })).toBeVisible();
    await host.getByRole('button', { name: '知道了' }).click();
    await expect(host.locator('.log')).toContainText('計為反對');
  } finally {
    await closePlayers(players);
  }
});

test('房主關閉網頁後，其他玩家會自動接手房主', async ({ browser }) => {
  test.slow();
  test.setTimeout(240_000);
  const players = await newPlayers(browser, 3);
  try {
    const code = await createRoom(players[0]);
    for (const p of players.slice(1)) await joinRoom(p, code);
    await players[0].context.close();
    await expect(players[1].page.getByTestId('start-game')).toBeVisible({ timeout: 150_000 });
    await expect(players[2].page.locator('.player-row', { hasText: 'P1' }).locator('.tag.gold')).toBeVisible();
  } finally {
    await closePlayers(players);
  }
});

test('貼上整個邀請連結到代碼欄也能加入', async ({ browser }) => {
  const players = await newPlayers(browser, 2);
  try {
    const code = await createRoom(players[0]);
    const guest = players[1];
    await guest.page.goto(BASE);
    await guest.page.getByTestId('name-input').fill(guest.name);
    await guest.page.getByTestId('code-input').fill(`https://sid-en.github.io/Avalon/#${code}`);
    await expect(guest.page.getByTestId('code-input')).toHaveValue(code);
    await guest.page.getByTestId('join-room').click();
    await expect(guest.page.getByTestId('room-code')).toHaveText(code);
  } finally {
    await closePlayers(players);
  }
});
