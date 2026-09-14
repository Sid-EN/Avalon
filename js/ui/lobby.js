// 大廳：玩家列表、座位順序、角色與規則設定
import { html, useState } from '../vendor/preact-htm.js';
import * as Room from '../room.js';
import { startGame } from '../host.js';
import * as G from '../game.js';
import { TEAM_COUNTS, QUEST_SIZES, failsRequired } from '../rules.js';
import { roleSvg } from '../art.js';
import { Art, Avatar, ConfirmModal, Modal, toast, errMsg, copyText } from './common.js';
import { openGuide } from './guide.js';

const ROLE_OPTIONS = [
  { key: 'merlinAssassin', roles: ['merlin', 'assassin'], team: 'mixed', label: '梅林 ＋ 刺客', desc: '梅林知道邪惡玩家；好人完成三個任務後，刺客可以刺殺梅林翻盤。（官方標準配置）' },
  { key: 'percival', roles: ['percival'], team: 'good', label: '派西維爾（正義）', desc: '知道誰是梅林。' },
  { key: 'morgana', roles: ['morgana'], team: 'evil', label: '莫甘娜（邪惡）', desc: '在派西維爾眼中偽裝成梅林。' },
  { key: 'mordred', roles: ['mordred'], team: 'evil', label: '莫德雷德（邪惡）', desc: '梅林看不到他。' },
  { key: 'oberon', roles: ['oberon'], team: 'evil', label: '奧伯倫（邪惡）', desc: '不認識邪惡同伴，同伴也不認識他；梅林看得到他。' },
];

const TIMER_OPTIONS = [0, 30, 60, 90, 120, 180, 240, 300, 600];
const TIMER_FIELDS = [
  ['team', '隊長組隊'], ['vote', '投票'], ['quest', '出任務牌'], ['lady', '湖中女神'], ['assassin', '刺殺梅林'],
];
const fmtSec = (s) => (s === 0 ? '不限時' : s < 60 ? `${s} 秒` : s % 60 ? `${Math.floor(s / 60)} 分 ${s % 60} 秒` : `${s / 60} 分鐘`);

export function mergedSettings(raw) {
  return {
    ...G.DEFAULT_SETTINGS, ...(raw || {}),
    roles: { ...G.DEFAULT_SETTINGS.roles, ...(raw?.roles || {}) },
    timers: { ...G.DEFAULT_SETTINGS.timers, ...(raw?.timers || {}) },
  };
}

export function Lobby({ s, code, uid, onLeave }) {
  const isHost = s.meta?.hostUid === uid;
  const order = Room.seatingOrder(s);
  const n = order.length;
  const settings = mergedSettings(s.settings);
  const { errors, warnings } = G.validateSetup(n, settings);
  const counts = TEAM_COUNTS[n];
  const { good, evil } = G.selectedSpecials(settings.roles);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const name = (u) => Room.nameOf(s, u);
  const online = (u) => !!s.presence?.[u]?.online;

  const act = (p) => p.catch((e) => toast(errMsg(e), 'error'));
  const setSetting = (path, value) => { if (isHost) act(Room.updateSettings(code, { [path]: value })); };
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= n) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    act(Room.setOrder(code, next));
  };
  const start = async () => {
    setBusy(true);
    try { await startGame(code, s); } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  const tryStart = () => {
    const off = order.filter((u) => !online(u));
    if (off.length) setConfirm({ kind: 'start', off });
    else start();
  };
  const link = `${location.origin}${location.pathname}${location.search}#${code}`;

  return html`<div class="page lobby">
    <header class="topbar">
      <div class="brand"><span class="brand-mark">⚜</span> 阿瓦隆</div>
      <div class="top-actions">
        <button type="button" class="btn btn-ghost btn-small" onClick=${() => openGuide('rules')}>📖 規則</button>
        <button type="button" class="btn btn-ghost btn-small" onClick=${() => setConfirm({ kind: 'leave' })}>離開房間</button>
      </div>
    </header>

    <div class="lobby-grid">
      <section class="card room-card">
        <div class="room-code-big">
          <span class="label">房間代碼</span>
          <span class="code" data-testid="room-code">${code}</span>
        </div>
        <div class="btn-row">
          <button type="button" class="btn btn-ghost btn-small" onClick=${() => copyText(code)}>複製代碼</button>
          <button type="button" class="btn btn-ghost btn-small" onClick=${() => copyText(link)}>複製邀請連結</button>
        </div>
        <p class="muted small">把代碼或連結貼到 Discord／LINE，朋友開啟網頁輸入代碼就能加入。</p>
      </section>

      <section class="card">
        <h2>玩家 <span class="muted">${n}／10</span></h2>
        <p class="muted small">座位順序＝順時針順序（隊長依此輪替）。${isHost ? '請依照語音頻道的發言順序用箭頭調整。' : ''}</p>
        <ol class="player-list">
          ${order.map((u, i) => html`<li class=${`player-row${online(u) ? '' : ' offline'}`} key=${u}>
            <span class="seat-no">${i + 1}</span>
            <${Avatar} uid=${u} name=${name(u)} />
            <span class="pname">
              <span class=${`dot ${online(u) ? 'on' : 'off'}`} title=${online(u) ? '在線' : '離線'}></span>
              ${name(u)}${u === uid ? '（你）' : ''}
              ${s.meta?.hostUid === u && html`<span class="tag gold">房主</span>`}
            </span>
            <span class="row-actions">
              ${u === uid && html`<button type="button" class="icon-btn" title="改名" aria-label="改名" onClick=${() => setRenaming(name(u))}>✎</button>`}
              ${isHost && html`
                <button type="button" class="icon-btn" aria-label="往上移" disabled=${i === 0} onClick=${() => move(i, -1)}>▲</button>
                <button type="button" class="icon-btn" aria-label="往下移" disabled=${i === n - 1} onClick=${() => move(i, 1)}>▼</button>
                ${u !== uid && html`
                  <button type="button" class="icon-btn" title="設為房主" aria-label="設為房主" onClick=${() => setConfirm({ kind: 'host', target: u })}>♔</button>
                  <button type="button" class="icon-btn danger" title="移出房間" aria-label="移出房間" onClick=${() => setConfirm({ kind: 'kick', target: u })}>✕</button>`}`}
            </span>
          </li>`)}
        </ol>
        ${isHost && n > 2 && html`<button type="button" class="btn btn-ghost btn-small" onClick=${() => act(Room.setOrder(code, G.shuffle(order)))}>隨機排座位</button>`}
      </section>

      <section class="card settings">
        <h2>角色設定 ${!isHost && html`<span class="muted small">（由房主設定）</span>`}</h2>
        ${counts
          ? html`<div class="team-split"><span class="good">正義方 ${counts.good} 人</span><span class="evil">邪惡方 ${counts.evil} 人</span></div>`
          : html`<p class="muted">需要 5～10 人才能開始</p>`}
        <div class="role-options">
          ${ROLE_OPTIONS.map((opt) => html`<label class=${`role-opt ${opt.team}${settings.roles[opt.key] ? ' on' : ''}${isHost ? '' : ' readonly'}`} key=${opt.key}>
            <input type="checkbox" checked=${!!settings.roles[opt.key]} disabled=${!isHost}
              onChange=${(e) => setSetting(`roles/${opt.key}`, e.currentTarget.checked)} />
            <span class="role-thumbs">${opt.roles.map((r) => html`<${Art} svg=${roleSvg(r)} class="thumb" key=${r} />`)}</span>
            <span class="role-text"><b>${opt.label}</b><span class="small muted">${opt.desc}</span></span>
          </label>`)}
        </div>
        ${counts && html`<p class="small muted">其餘：亞瑟的忠臣 ×${Math.max(0, counts.good - good.length)}、莫德雷德的爪牙 ×${Math.max(0, counts.evil - evil.length)}</p>`}

        <h3>擴充規則</h3>
        <div class="role-options">
          <label class=${`role-opt${settings.lady ? ' on' : ''}${isHost ? '' : ' readonly'}`}>
            <input type="checkbox" checked=${!!settings.lady} disabled=${!isHost} onChange=${(e) => setSetting('lady', e.currentTarget.checked)} />
            <span class="role-text"><b>湖中女神</b><span class="small muted">第 2、3、4 個任務後，持有者可以秘密查驗一位玩家的陣營。官方建議 7 人以上。</span></span>
          </label>
          <label class=${`role-opt${settings.targeting ? ' on' : ''}${isHost ? '' : ' readonly'}`}>
            <input type="checkbox" checked=${!!settings.targeting} disabled=${!isHost} onChange=${(e) => setSetting('targeting', e.currentTarget.checked)} />
            <span class="role-text"><b>指定任務</b><span class="small muted">隊長可以選擇挑戰哪一個任務；第 5 個任務要先成功 2 個任務。</span></span>
          </label>
        </div>

        <h3>倒數提醒</h3>
        <p class="muted small">時間到只會提醒，不會自動替玩家做決定。</p>
        <div class="timer-grid">
          ${TIMER_FIELDS.map(([key, label]) => html`<label class="timer-field" key=${key}>
            <span>${label}</span>
            <select disabled=${!isHost} value=${String(settings.timers[key])} onChange=${(e) => setSetting(`timers/${key}`, Number(e.currentTarget.value))}>
              ${TIMER_OPTIONS.map((t) => html`<option value=${String(t)} key=${t}>${fmtSec(t)}</option>`)}
            </select>
          </label>`)}
        </div>

        ${counts && html`<h3>本局出任務人數</h3>
          <div class="quest-preview">${QUEST_SIZES[n].map((size, q) => html`<div class="qp" key=${q}>
            <span class="muted small">任務${q + 1}</span><b>${size}</b>${failsRequired(n, q) === 2 && html`<span class="small warn">需2敗</span>`}
          </div>`)}</div>`}
      </section>
    </div>

    <footer class="lobby-footer">
      ${errors.map((e) => html`<div class="notice error" key=${e}>⛔ ${e}</div>`)}
      ${warnings.map((w) => html`<div class="notice warn" key=${w}>⚠️ ${w}</div>`)}
      ${isHost
        ? html`<button type="button" class="btn btn-gold btn-large" data-testid="start-game" disabled=${errors.length > 0 || busy} onClick=${tryStart}>
            ${busy ? '分配身分中…' : '開始遊戲'}</button>`
        : html`<p class="waiting">等待房主 ${name(s.meta?.hostUid)} 開始遊戲…</p>`}
    </footer>

    ${renaming !== null && html`<${RenameModal} initial=${renaming} onCancel=${() => setRenaming(null)}
      onSave=${async (v) => { await act(Room.renamePlayer(code, uid, v)); setRenaming(null); }} />`}
    ${confirm?.kind === 'kick' && html`<${ConfirmModal} title="移出玩家" danger confirmText="移出"
      message=${`確定要把 ${name(confirm.target)} 移出房間嗎？對方將無法再加入這個房間。`}
      onCancel=${() => setConfirm(null)} onConfirm=${async () => { await act(Room.kickPlayer(code, confirm.target)); setConfirm(null); }} />`}
    ${confirm?.kind === 'host' && html`<${ConfirmModal} title="轉移房主"
      message=${`確定要把房主交給 ${name(confirm.target)} 嗎？`}
      onCancel=${() => setConfirm(null)} onConfirm=${async () => { await act(Room.transferHost(code, confirm.target)); setConfirm(null); }} />`}
    ${confirm?.kind === 'start' && html`<${ConfirmModal} title="有玩家離線"
      message=${`${confirm.off.map(name).join('、')} 目前離線。遊戲開始後需要每個人操作，確定要開始嗎？`}
      onCancel=${() => setConfirm(null)} onConfirm=${async () => { setConfirm(null); await start(); }} />`}
    ${confirm?.kind === 'leave' && html`<${ConfirmModal} title="離開房間" danger confirmText="離開"
      message=${isHost && n > 1 ? '你是房主，離開後房主會交給下一位玩家。確定離開嗎？' : '確定要離開房間嗎？'}
      onCancel=${() => setConfirm(null)} onConfirm=${async () => { setConfirm(null); await onLeave(); }} />`}
  </div>`;
}

function RenameModal({ initial, onSave, onCancel }) {
  const [value, setValue] = useState(initial);
  const clean = value.trim();
  return html`<${Modal} title="修改暱稱" onClose=${onCancel}>
    <form onSubmit=${(e) => { e.preventDefault(); if (clean) onSave(clean); }}>
      <input class="input" maxlength="12" value=${value} onInput=${(e) => setValue(e.currentTarget.value)} autofocus />
      <div class="btn-row">
        <button type="button" class="btn btn-ghost" onClick=${onCancel}>取消</button>
        <button type="submit" class="btn btn-gold" disabled=${!clean}>儲存</button>
      </div>
    </form>
  <//>`;
}
