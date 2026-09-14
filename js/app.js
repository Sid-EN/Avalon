// 程式進入點：首頁、房間畫面切換
import { html, render, useState, useEffect, useRef } from './vendor/preact-htm.js';
import { isConfigured, signIn } from './firebase.js';
import * as Room from './room.js';
import { HostEngine, setHostApi } from './host.js';
import { toArray } from './game.js';
import { cardBackSvg } from './art.js';
import { Art, Toasts, toast, errMsg, store } from './ui/common.js';
import { Lobby } from './ui/lobby.js';
import { Board } from './ui/board.js';
import { GuideButton, openGuide } from './ui/guide.js';

setHostApi(Room.hostApi);

const hashCode = () => Room.normalizeCode(decodeURIComponent(location.hash));
const setHash = (code) => history.replaceState(null, '', `${location.pathname}${location.search}${code ? `#${code}` : ''}`);

function App() {
  const [uid, setUid] = useState(null);
  const [error, setError] = useState(null);
  const [code, setCode] = useState(() => {
    const saved = store.get('avalon.room');
    const h = hashCode();
    return h && h !== saved ? null : saved; // 開啟別的房間連結時，先回首頁輸入暱稱
  });

  useEffect(() => {
    if (!isConfigured) return;
    signIn().then(setUid).catch((e) => setError(e));
  }, []);

  const enter = (c) => {
    store.set('avalon.room', c);
    setHash(c);
    setCode(c);
  };
  const exit = (msg, keepCode = false) => {
    const old = code;
    store.del('avalon.room');
    setHash(keepCode ? old : null);
    setCode(null);
    if (msg) toast(msg, 'warn');
  };

  let content;
  if (!isConfigured) content = html`<${NotConfigured} />`;
  else if (error) content = html`<div class="center-msg">無法連線到伺服器：${errMsg(error)}<br /><button type="button" class="btn btn-gold" onClick=${() => location.reload()}>重新整理</button></div>`;
  else if (!uid) content = html`<div class="center-msg">連線中…</div>`;
  else if (!code) content = html`<${Home} uid=${uid} onEnter=${enter} />`;
  else content = html`<${RoomScreen} key=${code} code=${code} uid=${uid} onExit=${exit} />`;

  return html`${content}<${Toasts} />`;
}

function Home({ uid, onEnter }) {
  const [name, setName] = useState(() => store.get('avalon.name', ''));
  const [code, setCode] = useState(hashCode);
  const [busy, setBusy] = useState(null);
  const clean = name.trim();

  const guard = async (kind, fn) => {
    if (!clean) { toast('請先輸入你的暱稱', 'warn'); return; }
    store.set('avalon.name', clean);
    setBusy(kind);
    try { await fn(); } catch (e) { toast(errMsg(e), 'error'); setBusy(null); }
  };
  const create = () => guard('create', async () => onEnter(await Room.createRoom(uid, clean)));
  const join = (e) => {
    e?.preventDefault();
    if (code.length !== 4) { toast('房間代碼是 4 個英文字母', 'warn'); return; }
    guard('join', async () => {
      const finalName = await Room.joinRoom(code, uid, clean);
      if (finalName !== clean) toast(`暱稱「${clean}」已有人使用，你的暱稱是「${finalName}」`, 'warn');
      onEnter(code);
    });
  };

  return html`<div class="page home">
    <div class="hero">
      <${Art} svg=${cardBackSvg()} class="hero-card" />
      <h1 class="title">阿瓦隆</h1>
      <p class="subtitle">The Resistance: Avalon・線上版</p>
      <p class="tagline">正義與邪惡的暗中較量。找出莫德雷德的爪牙，守護梅林的秘密。</p>
    </div>
    <div class="card home-card">
      <label class="field">
        <span>你的暱稱</span>
        <input class="input" maxlength="12" placeholder="例如：蘭斯洛特" value=${name}
          onInput=${(e) => setName(e.currentTarget.value)} data-testid="name-input" />
      </label>
      <button type="button" class="btn btn-gold btn-block btn-large" disabled=${!!busy} onClick=${create} data-testid="create-room">
        ${busy === 'create' ? '建立中…' : '建立新房間'}</button>
      <div class="divider"><span>或加入朋友的房間</span></div>
      <form class="join-row" onSubmit=${join}>
        <input class="input code-input" placeholder="房間代碼" value=${code} autocapitalize="characters" aria-label="房間代碼（也可以貼上邀請連結）"
          onInput=${(e) => { const v = Room.normalizeCode(e.currentTarget.value); e.currentTarget.value = v; setCode(v); }} data-testid="code-input" />
        <button type="submit" class="btn btn-ghost" disabled=${!!busy} data-testid="join-room">${busy === 'join' ? '加入中…' : '加入'}</button>
      </form>
      <button type="button" class="link-btn center-block" onClick=${() => openGuide('tutorial')}>第一次玩？看新手教學 📖</button>
    </div>
    <p class="footnote">支援 5～10 人・建議搭配 Discord 或 LINE 語音一起玩</p>
    <${GuideButton} />
  </div>`;
}

function RoomScreen({ code, uid, onExit }) {
  const [s, setS] = useState(null);
  // 同一個瀏覽器開多個分頁時，只讓一個分頁擔任房主裁判
  const [engineLock, setEngineLock] = useState(() => !navigator.locks);
  const latest = useRef(null);
  const stopPresence = useRef(null);
  const engine = useRef(null);
  const exiting = useRef(false);

  useEffect(() => {
    stopPresence.current = Room.startPresence(code, uid);
    const unwatch = Room.watchRoom(code, uid, setS);
    return () => { unwatch(); stopPresence.current?.(); };
  }, [code, uid]);

  useEffect(() => {
    if (!navigator.locks) return undefined;
    let release = null;
    let alive = true;
    navigator.locks.request(`avalon-host-${code}`, () => new Promise((resolve) => {
      release = resolve;
      if (alive) setEngineLock(true);
      else resolve();
    })).catch(() => {});
    return () => { alive = false; release?.(); };
  }, [code]);

  useEffect(() => {
    latest.current = s;
    if (!s || !s.loaded.meta) return;
    if (!s.meta) { onExit('找不到這個房間（可能已經過期被清除）'); return; }
    if (s.kickedMe) { onExit('你已被房主移出房間'); return; }
    if (s.loaded.players && !s.players?.[uid]) {
      // 被移出時「讀取權限被收回」可能比「被移出標記」先到，所以再確認一次
      if (exiting.current) return;
      exiting.current = true;
      (async () => {
        // 快取可能還是舊資料，給伺服器一點時間把「被移出」送過來
        for (let i = 0; i < 6; i++) {
          if (latest.current?.kickedMe || await Room.isKicked(code, uid).catch(() => false)) {
            onExit('你已被房主移出房間');
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        if (s.meta.status === 'lobby') onExit('請輸入暱稱加入房間', true);
        else onExit('這個房間的遊戲已經開始，你不在這場遊戲中');
      })();
      return;
    }
    if (s.meta.hostUid === uid && engineLock) {
      engine.current ||= new HostEngine(code, uid);
      engine.current.onState(s);
    }
  }, [s, engineLock]);

  // 房主離線太久時自動接手
  useEffect(() => {
    const timer = setInterval(async () => {
      const cur = latest.current;
      if (!cur || !Room.shouldClaimHost(cur, uid, Date.now() + (cur.serverOffset || 0))) return;
      try {
        const oldHost = Room.nameOf(cur, cur.meta.hostUid);
        await Room.transferHost(code, uid);
        toast('原房主已離線，由你接手成為房主', 'ok');
        if (cur.meta.status !== 'lobby') await Room.addLog(code, `原房主 ${oldHost} 離線，由 ${Room.nameOf(cur, uid)} 接手房主`);
      } catch { /* 其他人已經接手 */ }
    }, 5000);
    return () => clearInterval(timer);
  }, [code, uid]);

  const leave = async () => {
    const cur = latest.current;
    if (cur?.meta?.status === 'playing') {
      onExit('已回到首頁。你的座位還在，輸入房間代碼就能回到遊戲');
      return;
    }
    exiting.current = true;
    try { await Room.leaveRoom(code, uid, cur, stopPresence.current); } catch (e) { console.warn(e); }
    onExit();
  };

  const banner = s?.everConnected && !s.connected && html`<div class="conn-banner" role="alert">連線中斷，正在重新連線…</div>`;
  if (!s || !s.loaded.meta || !s.loaded.players || !s.loaded.pub || !s.meta || !s.players?.[uid]) {
    return html`${banner}<div class="center-msg">進入房間中…</div>`;
  }

  let screen;
  if (s.meta.status === 'lobby') screen = html`<${Lobby} s=${s} code=${code} uid=${uid} onLeave=${leave} />`;
  else if (s.pub && !toArray(s.pub.order).includes(uid)) screen = html`<${Spectator} code=${code} onHome=${() => onExit()} />`;
  else screen = html`<${Board} s=${s} code=${code} uid=${uid} onLeave=${leave} />`;
  return html`${banner}${screen}<${GuideButton} s=${s} uid=${uid} />`;
}

// 遊戲開始時還沒入座的玩家（例如剛好在按下開始的瞬間加入）
function Spectator({ code, onHome }) {
  return html`<div class="page home">
    <div class="card home-card center">
      <h2>這局遊戲已經開始</h2>
      <p>你加入房間 <b>${code}</b> 時，這局已經分配好身分，所以你不在座位上。</p>
      <p class="muted">請留在這個頁面，房主回到大廳開新局時，你會自動加入下一局。</p>
      <button type="button" class="btn btn-ghost btn-block" onClick=${onHome}>回到首頁</button>
    </div>
  </div>`;
}

function NotConfigured() {
  return html`<div class="page home">
    <div class="card home-card">
      <h2>尚未設定 Firebase</h2>
      <p>請依照 <code>docs/SETUP.md</code> 的步驟建立免費的 Firebase 專案，並把設定貼到 <code>js/firebase-config.js</code>。</p>
    </div>
  </div>`;
}

render(html`<${App} />`, document.getElementById('app'));
