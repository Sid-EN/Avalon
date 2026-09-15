// 產生 README 用的圖片：角色卡、標記、橫幅、實際遊戲截圖（7 人完整對局）
// 執行：npm run readme:assets（會自動啟動 Firebase 模擬器，不會動到正式資料）
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { roleSvg, cardBackSvg, TOKENS } from '../js/art.js';
import { ROLES } from '../js/rules.js';

const OUT = fileURLToPath(new URL('../docs/images/', import.meta.url));
const BASE = 'http://127.0.0.1:8080/?emu=1';
const NAMES = ['亞瑟', '桂妮薇兒', '高文', '蘭斯洛特', '崔斯坦', '加拉哈德', '貝德維爾'];
const DESKTOP = { viewport: { width: 1280, height: 800 } };
const MOBILE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const visible = (loc) => loc.first().isVisible().catch(() => false);
const log = (...a) => console.log('•', ...a);

// ── 1. SVG 角色卡與標記 ──
mkdirSync(`${OUT}roles`, { recursive: true });
mkdirSync(`${OUT}tokens`, { recursive: true });
for (const role of Object.keys(ROLES)) writeFileSync(`${OUT}roles/${role}.svg`, roleSvg(role));
writeFileSync(`${OUT}roles/back.svg`, cardBackSvg());
for (const name of ['crown', 'lady', 'shield', 'approve', 'reject', 'successCard', 'failCard', 'book']) {
  writeFileSync(`${OUT}tokens/${name}.svg`, TOKENS[name]);
}
log('已輸出角色卡與標記 SVG');

// ── 2. 啟動本機網站 ──
const server = spawn(process.execPath, [fileURLToPath(new URL('./serve.mjs', import.meta.url))], { stdio: 'ignore' });
process.on('exit', () => server.kill());
for (let i = 0; i < 50; i++) {
  try { await fetch('http://127.0.0.1:8080/index.html'); break; } catch { await sleep(200); }
}

const browser = await chromium.launch();
const shot = async (page, name) => {
  // 等「輪到你了」之類的提示消失，避免擋住畫面
  await page.locator('.toast').first().waitFor({ state: 'hidden', timeout: 6000 }).catch(() => {});
  await page.screenshot({ path: `${OUT}${name}` });
  log('截圖', name);
};
const dismissAll = async (page) => {
  for (let i = 0; i < 6; i++) {
    const ack = page.getByRole('button', { name: '知道了' });
    if (!(await visible(ack))) return;
    await ack.first().click();
    await sleep(300);
  }
};

// ── 3. 橫幅 ──
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 420 } });
  const cards = ['percival', 'merlin', 'back', 'assassin', 'morgana'].map((r) => (r === 'back' ? cardBackSvg() : roleSvg(r)));
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=Noto+Serif+TC:wght@600;900&display=swap" rel="stylesheet">
<style>
body{margin:0;background:#070a14}
.b{position:relative;width:1280px;height:420px;overflow:hidden;font-family:'Noto Serif TC',serif;color:#efe6d2;
  background:radial-gradient(ellipse 60% 90% at 78% 45%,rgba(214,168,76,.30),transparent 60%),
  radial-gradient(ellipse 55% 70% at 8% 0%,rgba(80,120,220,.28),transparent 60%),linear-gradient(180deg,#172140,#070a14)}
.stars{position:absolute;inset:0;opacity:.75;background-image:
  radial-gradient(1.6px 1.6px at 12% 18%,#f3e6c4,transparent),radial-gradient(1.2px 1.2px at 28% 72%,#f3e6c4,transparent),
  radial-gradient(1.4px 1.4px at 46% 12%,#f3e6c4,transparent),radial-gradient(1px 1px at 58% 88%,#f3e6c4,transparent),
  radial-gradient(1.5px 1.5px at 6% 84%,#f3e6c4,transparent),radial-gradient(1px 1px at 38% 42%,#f3e6c4,transparent),
  radial-gradient(1.3px 1.3px at 52% 58%,#f3e6c4,transparent),radial-gradient(1px 1px at 20% 48%,#f3e6c4,transparent)}
.text{position:absolute;left:78px;top:64px}
.en{font-family:Cinzel,serif;letter-spacing:.42em;color:#d6a84c;font-size:22px;font-weight:700}
h1{margin:4px 0 0;font-size:116px;font-weight:900;letter-spacing:.18em;line-height:1.15;
  background:linear-gradient(180deg,#fff3cf,#e2b75c 55%,#9a7128);-webkit-background-clip:text;background-clip:text;color:transparent}
.sub{font-size:27px;font-weight:600;margin-top:8px;color:#e8dcc0;letter-spacing:.06em}
.chips{margin-top:24px;display:flex;gap:12px}
.chip{border:1px solid rgba(214,168,76,.65);border-radius:999px;padding:6px 18px;font-size:19px;background:rgba(0,0,0,.32);color:#f1d58a}
.fan{position:absolute;right:70px;top:30px;width:540px;height:380px}
.card{position:absolute;width:168px;bottom:10px;left:50%;transform-origin:50% 130%;filter:drop-shadow(0 14px 22px rgba(0,0,0,.65))}
.card svg{display:block;width:100%;height:auto}
</style></head><body><div class="b"><div class="stars"></div>
<div class="text"><div class="en">THE RESISTANCE · AVALON</div><h1>阿瓦隆</h1>
<div class="sub">正義與邪惡的暗中較量・線上桌遊</div>
<div class="chips"><span class="chip">5～10 人</span><span class="chip">手機・電腦</span><span class="chip">搭配語音推理</span><span class="chip">免安裝</span></div></div>
<div class="fan">${cards.map((svg, i) => `<div class="card" style="transform:translateX(-50%) rotate(${(i - 2) * 14}deg) translateY(${Math.abs(i - 2) * 8}px)">${svg}</div>`).join('')}</div>
</div></body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await sleep(600);
  await page.locator('.b').screenshot({ path: `${OUT}banner.png` });
  log('截圖 banner.png');
  await page.close();
}

// ── 4. 首頁（第一次開啟，有新手提示） ──
{
  const context = await browser.newContext(DESKTOP);
  const page = await context.newPage();
  await page.goto(BASE);
  await page.getByTestId('name-input').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await sleep(1200);
  await shot(page, 'home.png');
  await context.close();
}

// ── 5. 7 人完整對局 ──
const players = [];
for (let i = 0; i < NAMES.length; i++) {
  const mobile = i === 1;
  const context = await browser.newContext(mobile ? MOBILE : DESKTOP);
  await context.addInitScript(() => { try { localStorage.setItem('avalon.guideSeen', 'true'); } catch { /* ignore */ } });
  players.push({ name: NAMES[i], mobile, context, page: await context.newPage() });
}
const [host, phone, watcher] = players;

await host.page.goto(BASE);
await host.page.getByTestId('name-input').fill(host.name);
await host.page.getByTestId('create-room').click();
await host.page.getByTestId('room-code').waitFor();
const code = (await host.page.getByTestId('room-code').textContent()).trim();
for (const p of players.slice(1)) {
  await p.page.goto(BASE);
  await p.page.getByTestId('name-input').fill(p.name);
  await p.page.getByTestId('code-input').fill(code);
  await p.page.getByTestId('join-room').click();
  await p.page.getByTestId('room-code').waitFor();
}
await host.page.getByText(`${NAMES.length}／10`).waitFor();
await host.page.locator('label.role-opt').filter({ has: host.page.locator('b', { hasText: '湖中女神' }) }).click();
await sleep(1200);
await shot(host.page, 'lobby.png');

await host.page.getByTestId('start-game').click();
const offlineConfirm = host.page.getByRole('button', { name: '確定', exact: true });
if (await visible(offlineConfirm)) await offlineConfirm.click();

const roles = {};
for (const p of players) {
  await p.page.getByTestId('flip-card').click();
  const banner = p.page.locator('.knowledge .team-banner');
  await banner.waitFor();
  const [role, team] = (await banner.textContent()).trim().split('・');
  roles[p.name] = { role, team: team.includes('邪惡') ? 'evil' : 'good' };
  if (p.mobile) {
    // 捲到行動面板頂端（留出固定在上方的標題列高度）
    await p.page.locator('[data-testid="action-panel"]').evaluate((el) => {
      const bar = document.querySelector('.topbar')?.getBoundingClientRect().height || 0;
      window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - bar - 12);
    });
    await sleep(1200);
    await shot(p.page, 'night-mobile.png');
  }
  await p.page.getByTestId('ready').click();
}

const evil = NAMES.filter((n) => roles[n].team === 'evil');
const good = NAMES.filter((n) => roles[n].team === 'good');
const merlin = NAMES.find((n) => roles[n].role === '梅林');
const taken = new Set();
let ended = false;

// 策略：第 1 個任務放一個邪惡玩家（任務失敗），之後都派好人 → 3 成功後刺客猜錯 → 正義方獲勝
for (let iter = 0; iter < 2500 && !ended; iter++) {
  let acted = false;
  for (const p of players) {
    const pg = p.page;
    try {
      const ack = pg.getByRole('button', { name: '知道了' });
      if (await visible(ack)) {
        const title = ((await pg.locator('.modal-head h3').first().textContent().catch(() => '')) || '').trim();
        if (title === '投票結果' && p.mobile && !taken.has('vote')) { taken.add('vote'); await sleep(700); await shot(pg, 'vote-mobile.png'); }
        if (title === '任務結果' && p === watcher && !taken.has('quest')) { taken.add('quest'); await sleep(4200); await shot(pg, 'quest.png'); }
        await ack.first().click({ timeout: 3000 });
        acted = true;
        continue;
      }
      if (await visible(pg.locator('.winner-title'))) {
        if (p === host) ended = true;
        continue;
      }
      const status = (await pg.locator('.statusbar').textContent({ timeout: 1000 }).catch(() => '')) || '';
      const round = Number(status.match(/第 (\d+) 輪/)?.[1] || 0);
      if (p === watcher && round === 3 && status.includes('隊長組隊') && !taken.has('board') && !(await visible(pg.locator('.modal')))) {
        taken.add('board');
        await sleep(900);
        await shot(pg, 'board.png');
      }

      const propose = pg.getByTestId('propose');
      if (await visible(propose) && !(await propose.textContent()).includes('已送出')) {
        const need = Number((await propose.textContent()).match(/／(\d+)/)?.[1]);
        const team = (round === 1 ? [evil[0], ...good] : good).slice(0, need);
        for (const n of team) {
          const chip = pg.getByTestId(`pick-${n}`);
          if (!(await chip.getAttribute('class')).includes(' on')) { await chip.click(); await sleep(300); }
        }
        if (!(await propose.isEnabled())) continue;
        if (!taken.has('team') && !p.mobile) { taken.add('team'); await sleep(700); await shot(pg, 'team.png'); }
        await propose.click();
        await pg.getByRole('button', { name: '確定提名' }).click();
        acted = true;
        continue;
      }
      if (await visible(pg.getByTestId('vote-approve'))) {
        await pg.getByTestId('vote-approve').click();
        await pg.getByTestId('vote-submit').click();
        acted = true;
        continue;
      }
      if (await visible(pg.getByTestId('card-success'))) {
        const fail = roles[p.name].team === 'evil' && round === 1;
        await pg.getByTestId(fail ? 'card-fail' : 'card-success').click();
        await pg.getByTestId('card-submit').click();
        acted = true;
        continue;
      }
      const lady = pg.locator('[data-testid^="lady-"]');
      if (await visible(lady)) {
        if (!taken.has('lady') && !p.mobile) { taken.add('lady'); await sleep(700); await shot(pg, 'lady.png'); }
        await lady.first().click();
        await pg.getByRole('button', { name: '查驗', exact: true }).click();
        acted = true;
        continue;
      }
      const assassin = pg.locator('[data-testid^="assassin-"]');
      if (await visible(assassin)) {
        const options = (await assassin.allTextContents()).map((t) => t.trim());
        await pg.getByTestId(`assassin-${options.find((n) => n !== merlin)}`).click();
        await pg.getByRole('button', { name: '就是他！' }).click();
        acted = true;
        continue;
      }
    } catch (e) {
      if (!/intercepts pointer events|Timeout|detached|not attached|not stable|not visible/i.test(String(e.message))) throw e;
    }
  }
  if (!acted) await sleep(200);
}
if (!ended) throw new Error('遊戲沒有在預期時間內結束');

await dismissAll(host.page);
await sleep(2000);
await host.page.evaluate(() => window.scrollTo(0, 0));
await shot(host.page, 'end.png');
await host.page.getByRole('button', { name: '查看完整紀錄' }).click();
await sleep(900);
await shot(host.page, 'history.png');
await host.page.keyboard.press('Escape');

await dismissAll(phone.page);
await phone.page.evaluate(() => window.scrollTo(0, 0));
await phone.page.getByTestId('guide-button').click();
await phone.page.getByRole('tab', { name: '新手教學' }).click();
await phone.page.getByTestId('tutorial-next').click();
await phone.page.getByTestId('tutorial-next').click();
await sleep(800);
await shot(phone.page, 'guide-mobile.png');

await browser.close();
server.kill();
log('完成，圖片在 docs/images/');
process.exit(0);
