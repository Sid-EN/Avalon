// 共用小元件與工具
import { html, useState, useEffect, useLayoutEffect, useRef } from '../vendor/preact-htm.js';

export const store = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 無痕模式 */ } },
  del(key) { try { localStorage.removeItem(key); } catch { /* 無痕模式 */ } },
};

export const ROLE_DESC = {
  merlin: '你知道所有邪惡玩家（莫德雷德除外）。暗中引導好人，但千萬別讓刺客發現你是梅林。',
  percival: '你知道誰是梅林；若莫甘娜在場，你會看到兩個人但分不出誰是誰。保護梅林！',
  servant: '你沒有特殊能力。仔細觀察投票與任務結果，找出邪惡玩家，完成三個任務。',
  assassin: '邪惡方。若好人完成三個任務，你有最後一次機會指認梅林，猜中邪惡方就翻盤獲勝。',
  morgana: '邪惡方。你在派西維爾眼中看起來和梅林一模一樣，好好混淆他。',
  mordred: '邪惡方首領。梅林看不到你的身分。',
  oberon: '邪惡方，但你不認識其他邪惡同伴，他們也不認識你（梅林看得到你）。',
  minion: '邪惡方。你和其他邪惡同伴（奧伯倫除外）互相認識。想辦法讓任務失敗！',
};

export function Art({ svg, class: cls = '' }) {
  return html`<span class=${`art ${cls}`} dangerouslySetInnerHTML=${{ __html: svg }}></span>`;
}

let toastListeners = new Set();
export function toast(msg, kind = 'info') {
  const t = { id: Math.random().toString(36).slice(2), msg, kind };
  toastListeners.forEach((l) => l(t));
}

export function Toasts() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const listener = (t) => {
      // 同樣的訊息已經在畫面上就不重複顯示
      setItems((x) => [...x.filter((i) => i.msg !== t.msg).slice(-2), t]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== t.id)), 3800);
    };
    toastListeners.add(listener);
    return () => toastListeners.delete(listener);
  }, []);
  return html`<div class="toasts" role="status" aria-live="polite">
    ${items.map((t) => html`<div class=${`toast ${t.kind}`} key=${t.id}>${t.msg}</div>`)}
  </div>`;
}

export function Modal({ title, onClose, children, wide = false, closable = true }) {
  const box = useRef(null);
  // 用 layout effect 立即掛上 Esc 監聽，避免視窗剛打開時按 Esc 沒反應
  useLayoutEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && closable) onClose?.(); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose, closable]);
  // 打開時把焦點移進視窗（鍵盤與螢幕報讀器使用者），關閉時還原
  useLayoutEffect(() => {
    const previous = document.activeElement;
    box.current?.focus({ preventScroll: true });
    return () => { if (previous?.focus && document.contains(previous)) previous.focus({ preventScroll: true }); };
  }, []);
  return html`<div class="modal-backdrop" onClick=${(e) => { if (e.target === e.currentTarget && closable) onClose?.(); }}>
    <div class=${`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label=${title} tabindex="-1" ref=${box}>
      ${title && html`<div class="modal-head">
        <h3>${title}</h3>
        ${closable && html`<button type="button" class="icon-btn" onClick=${onClose} aria-label="關閉">✕</button>`}
      </div>`}
      <div class="modal-body">${children}</div>
    </div>
  </div>`;
}

export function ConfirmModal({ title, message, confirmText = '確定', danger = false, onConfirm, onCancel }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); }
  };
  return html`<${Modal} title=${title} onClose=${onCancel}>
    <div class="confirm-msg">${message}</div>
    <div class="btn-row">
      <button type="button" class="btn btn-ghost" onClick=${onCancel} disabled=${busy}>取消</button>
      <button type="button" class=${`btn ${danger ? 'btn-danger' : 'btn-gold'}`} onClick=${go} disabled=${busy}>${busy ? '處理中…' : confirmText}</button>
    </div>
  <//>`;
}

export function Avatar({ uid, name }) {
  let h = 0;
  for (const ch of String(uid)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return html`<span class="avatar" style=${`--hue:${h}`}>${Array.from(name || '?')[0]}</span>`;
}

export function useNow(offset = 0, interval = 500) {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    setNow(Date.now() + offset);
    const t = setInterval(() => setNow(Date.now() + offset), interval);
    return () => clearInterval(t);
  }, [offset, interval]);
  return now;
}

export function fmtTime(ms) {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export function errMsg(e) {
  const m = String(e?.message || e || '');
  if (/permission/i.test(m)) return '操作被拒絕（遊戲狀態可能已改變，請稍後再試）';
  if (/network|offline|disconnect/i.test(m)) return '網路連線有問題，請檢查網路';
  return m || '發生錯誤，請再試一次';
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('已複製', 'ok');
  } catch {
    window.prompt('請手動複製：', text);
  }
}
