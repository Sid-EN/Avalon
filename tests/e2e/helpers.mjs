// 系統測試共用工具：開多個獨立瀏覽器模擬多位玩家
import { expect } from '@playwright/test';

export const BASE = 'http://127.0.0.1:8080/?emu=1';
export const MOBILE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
export const DESKTOP = { viewport: { width: 1280, height: 900 } };

export async function assertEmulator() {
  try {
    await fetch('http://127.0.0.1:9000/.json?ns=demo-avalon-default-rtdb');
    await fetch('http://127.0.0.1:9099/');
  } catch {
    throw new Error('Firebase 模擬器沒有啟動，請改用 npm run test:emulator 執行系統測試');
  }
}

// 每位玩家一個獨立的瀏覽器環境（等於不同裝置、不同帳號）
export async function newPlayers(browser, n, { mobileEvery = 2, skipGuide = true, prefix = 'P' } = {}) {
  const players = [];
  for (let i = 0; i < n; i++) {
    const mobile = mobileEvery > 0 && i % mobileEvery === 1;
    const context = await browser.newContext(mobile ? MOBILE : DESKTOP);
    if (skipGuide) {
      await context.addInitScript(() => { try { localStorage.setItem('avalon.guideSeen', 'true'); } catch { /* ignore */ } });
    }
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    players.push({ i, name: `${prefix}${i}`, context, page, mobile, errors });
  }
  return players;
}

export async function closePlayers(players) {
  await Promise.all(players.map((p) => p.context.close().catch(() => {})));
}

export function expectNoPageErrors(players) {
  for (const p of players) expect(p.errors, `${p.name} 的網頁錯誤`).toEqual([]);
}

export async function createRoom(p) {
  await p.page.goto(BASE);
  await p.page.getByTestId('name-input').fill(p.name);
  await p.page.getByTestId('create-room').click();
  const code = p.page.getByTestId('room-code');
  await expect(code).toHaveText(/^[A-Z]{4}$/);
  return (await code.textContent()).trim();
}

export async function joinRoom(p, code) {
  await p.page.goto(BASE);
  await p.page.getByTestId('name-input').fill(p.name);
  await p.page.getByTestId('code-input').fill(code);
  await p.page.getByTestId('join-room').click();
  await expect(p.page.getByTestId('room-code')).toHaveText(code);
}

// 用選項的標題找設定（角色卡插圖裡也有文字，不能直接比對整個選項）
const optionByTitle = (page, label) => page.locator('label.role-opt').filter({ has: page.locator('b', { hasText: label }) });

export async function setOption(host, others, label, on = true) {
  const opt = optionByTitle(host.page, label);
  if ((await opt.getAttribute('class')).includes(' on') !== on) await opt.click();
  for (const p of others) await expect(optionByTitle(p.page, label)).toHaveClass(on ? /\bon\b/ : /^(?!.*\bon\b)/);
}

export async function setupRoom(players, { lady = false, targeting = false, roles = {} } = {}) {
  const [host, ...rest] = players;
  const code = await createRoom(host);
  for (const p of rest) await joinRoom(p, code);
  await expect(host.page.getByText(`${players.length}／10`)).toBeVisible();
  if (lady) await setOption(host, rest.slice(0, 1), '湖中女神');
  if (targeting) await setOption(host, rest.slice(0, 1), '指定任務');
  for (const [label, on] of Object.entries(roles)) await setOption(host, rest.slice(0, 1), label, on);
  return code;
}

// 開始遊戲並讓每個人翻牌確認；回傳 { 名字: { role, team, sees } }
export async function startAndReveal(players) {
  const host = players[0];
  await host.page.getByTestId('start-game').click();
  const offlineConfirm = host.page.getByRole('button', { name: '確定', exact: true });
  if (await offlineConfirm.isVisible().catch(() => false)) await offlineConfirm.click();
  const roles = {};
  for (const p of players) {
    await p.page.getByTestId('flip-card').click();
    const banner = p.page.locator('.knowledge .team-banner');
    await expect(banner).toBeVisible();
    const [role, team] = (await banner.textContent()).trim().split('・');
    roles[p.name] = {
      role,
      team: team.includes('邪惡') ? 'evil' : 'good',
      sees: (await p.page.locator('.knowledge .chips .chip').allTextContents()).map((t) => t.trim()),
    };
    await p.page.getByTestId('ready').click();
  }
  return roles;
}

const RETRYABLE = /intercepts pointer events|Timeout|Timed out|not attached|detached|Target closed|element is not visible|not stable/i;

// 依照策略讓所有玩家操作，直到遊戲結束
export async function playGame(players, roles, strategy = {}) {
  const names = players.map((p) => p.name);
  const evilNames = names.filter((n) => roles[n].team === 'evil');
  const goodNames = names.filter((n) => roles[n].team === 'good');
  const s = {
    vote: () => true,
    fail: () => false,
    team: ({ need, leaderIndex }) => [...names.slice(leaderIndex), ...names.slice(0, leaderIndex)].slice(0, need),
    quest: (labels) => labels.length - 1,
    lady: (options) => options[0],
    assassin: (options) => options[0],
    ...strategy,
  };
  const stats = { proposals: 0, ladyUses: 0, questChoices: [], assassinated: null };

  for (let iter = 0; iter < 2000; iter++) {
    let acted = false;
    for (const p of players) {
      const pg = p.page;
      try {
        const ack = pg.getByRole('button', { name: '知道了' });
        if (await ack.isVisible()) { await ack.click({ timeout: 3000 }); acted = true; continue; }
        if (await pg.locator('.winner-title').isVisible()) {
          return {
            ...stats,
            winner: (await pg.locator('.winner-title').textContent()).trim(),
            reason: (await pg.locator('.winner-reason').textContent()).trim(),
          };
        }
        const status = (await pg.locator('.statusbar').textContent({ timeout: 1000 }).catch(() => '')) || '';
        const round = Number(status.match(/第 (\d+) 輪/)?.[1] || 0);
        const attempt = Number(status.match(/提案 (\d+)/)?.[1] || 0);

        const propose = pg.getByTestId('propose');
        if (await propose.isVisible() && !(await propose.textContent()).includes('已送出')) {
          const questButtons = pg.locator('.quest-pick button:not([disabled])');
          if ((await propose.textContent()).includes('?') && await questButtons.count()) {
            const labels = (await questButtons.allTextContents()).map((t) => t.trim());
            stats.questChoices.push(labels);
            await questButtons.nth(s.quest(labels, { round })).click();
            await expect(propose).not.toContainText('?', { timeout: 5000 });
          }
          const need = Number((await propose.textContent()).match(/／(\d+)/)?.[1]);
          const wanted = s.team({ round, attempt, need, leader: p.name, leaderIndex: p.i, names, evilNames, goodNames }).slice(0, need);
          for (const name of wanted) {
            const chip = pg.getByTestId(`pick-${name}`);
            if (!(await chip.getAttribute('class')).includes(' on')) {
              await chip.click();
              await expect(chip).toHaveClass(/ on/, { timeout: 5000 });
            }
          }
          await expect(propose).toBeEnabled({ timeout: 5000 });
          await propose.click();
          await pg.getByRole('button', { name: '確定提名' }).click();
          stats.proposals++;
          acted = true;
          continue;
        }

        if (await pg.getByTestId('vote-approve').isVisible()) {
          const yes = s.vote({ round, attempt, name: p.name, roles });
          await pg.getByTestId(yes ? 'vote-approve' : 'vote-reject').click();
          await pg.getByTestId('vote-submit').click();
          await expect(pg.locator('.done-note')).toBeVisible({ timeout: 5000 });
          acted = true;
          continue;
        }

        if (await pg.getByTestId('card-success').isVisible()) {
          const fail = roles[p.name].team === 'evil' && s.fail({ round, name: p.name, roles });
          await pg.getByTestId(fail ? 'card-fail' : 'card-success').click();
          await pg.getByTestId('card-submit').click();
          await expect(pg.locator('.done-note')).toBeVisible({ timeout: 5000 });
          acted = true;
          continue;
        }

        const lady = pg.locator('[data-testid^="lady-"]');
        if (await lady.first().isVisible()) {
          const options = (await lady.allTextContents()).map((t) => t.trim());
          await pg.getByTestId(`lady-${s.lady(options, { name: p.name, roles })}`).click();
          await pg.getByRole('button', { name: '查驗', exact: true }).click();
          stats.ladyUses++;
          acted = true;
          continue;
        }

        const assassin = pg.locator('[data-testid^="assassin-"]');
        if (await assassin.first().isVisible()) {
          const options = (await assassin.allTextContents()).map((t) => t.trim());
          const target = s.assassin(options, { roles });
          await pg.getByTestId(`assassin-${target}`).click();
          await pg.getByRole('button', { name: '就是他！' }).click();
          stats.assassinated = target;
          acted = true;
          continue;
        }
      } catch (e) {
        if (!RETRYABLE.test(String(e.message))) throw e;
      }
    }
    if (!acted) await players[0].page.waitForTimeout(200);
  }
  throw new Error('遊戲沒有在預期時間內結束');
}

// 在玩家的瀏覽器裡直接呼叫 Firebase，模擬用開發者工具作弊
export async function probeSecurity(page, code) {
  return page.evaluate(async (roomCode) => {
    const f = await import('/js/firebase.js');
    const { getAuth } = await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js');
    const me = getAuth().currentUser.uid;
    const room = `rooms/${roomCode}`;
    const tryGet = async (path) => { try { await f.get(f.ref(f.db, path)); return 'READ_OK'; } catch { return 'DENIED'; } };
    const trySet = async (path, v) => { try { await f.set(f.ref(f.db, path), v); return 'WRITE_OK'; } catch { return 'DENIED'; } };
    const order = (await f.get(f.ref(f.db, `${room}/pub/order`))).val();
    const other = order.find((u) => u !== me);
    return {
      ownSecret: await tryGet(`${room}/secret/${me}`),
      otherSecret: await tryGet(`${room}/secret/${other}`),
      allSecrets: await tryGet(`${room}/secret`),
      hostSecret: await tryGet(`${room}/hostSecret`),
      allVotes: await tryGet(`${room}/votes`),
      allCards: await tryGet(`${room}/cards`),
      writePub: await trySet(`${room}/pub/winner`, 'good'),
      writeOtherSecret: await trySet(`${room}/secret/${other}/role`, 'merlin'),
    };
  }, code);
}
