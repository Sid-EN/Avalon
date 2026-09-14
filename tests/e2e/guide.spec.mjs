// 功能測試：右下角書本說明書（新手提示、教學步驟、依階段顯示的說明）
import { test, expect } from '@playwright/test';
import { BASE, assertEmulator, newPlayers, closePlayers, setupRoom, startAndReveal } from './helpers.mjs';

test.beforeAll(assertEmulator);

const STEPS = ['遊戲目標', '第一步：查看身分', '第二步：隊長組隊', '第三步：全員投票', '第四步：執行任務', '擴充規則：湖中女神', '最後的機會：刺殺梅林', '操作小提示'];

test('第一次開啟：書本閃爍並提示，教學共 8 步，看完後不再提示', async ({ browser }) => {
  const players = await newPlayers(browser, 1, { skipGuide: false });
  const { page } = players[0];
  try {
    await page.goto(BASE);
    await expect(page.locator('.guide-hint')).toBeVisible();
    await expect(page.locator('.guide-fab')).toHaveClass(/pulse/);
    await page.getByTestId('guide-button').click();
    for (let i = 0; i < STEPS.length; i++) {
      await expect(page.locator('.tutorial-step h3')).toHaveText(STEPS[i]);
      await expect(page.locator('.step-count')).toHaveText(`第 ${i + 1}／${STEPS.length} 步`);
      if (i < STEPS.length - 1) await page.getByTestId('tutorial-next').click();
    }
    await page.getByRole('button', { name: '‹ 上一步' }).click();
    await expect(page.locator('.tutorial-step h3')).toHaveText(STEPS[6]);
    await page.getByTestId('tutorial-next').click();
    await page.getByRole('button', { name: '開始冒險！' }).click();
    await expect(page.locator('.modal')).toHaveCount(0);
    await expect(page.locator('.guide-hint')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('guide-button')).toBeVisible();
    await expect(page.locator('.guide-fab')).not.toHaveClass(/pulse/);
    await expect(page.locator('.guide-hint')).toHaveCount(0);
  } finally {
    await closePlayers(players);
  }
});

test('首頁連結直接開啟新手教學；按 Esc 可以立即關閉', async ({ browser }) => {
  const players = await newPlayers(browser, 1);
  const { page } = players[0];
  try {
    await page.goto(BASE);
    await page.getByRole('button', { name: '第一次玩？看新手教學 📖' }).click();
    await expect(page.locator('.guide-tab.on')).toHaveText('新手教學');
    await page.keyboard.press('Escape');
    await expect(page.locator('.modal')).toHaveCount(0);
  } finally {
    await closePlayers(players);
  }
});

test('遊戲中：「現在該做什麼」依身分與階段顯示，角色介紹標出本局角色', async ({ browser }) => {
  test.setTimeout(180_000);
  const players = await newPlayers(browser, 5);
  try {
    await setupRoom(players);
    await startAndReveal(players);
    let leader = null;
    await expect.poll(async () => {
      for (const p of players) if (await p.page.getByTestId('propose').isVisible()) leader = p;
      return !!leader;
    }).toBe(true);
    const other = players.find((p) => p !== leader);

    await leader.page.getByRole('button', { name: '📖 說明' }).click();
    await expect(leader.page.locator('.now-title')).toHaveText('👑 你是隊長！');
    await leader.page.keyboard.press('Escape');

    await other.page.getByRole('button', { name: '📖 說明' }).click();
    await expect(other.page.locator('.now-title')).toContainText(`等待隊長 ${leader.name}`);
    await other.page.getByRole('tab', { name: '角色介紹' }).click();
    await expect(other.page.locator('.rg-item')).toHaveCount(8);
    await expect(other.page.locator('.rg-item .tag')).toHaveCount(5);
  } finally {
    await closePlayers(players);
  }
});
