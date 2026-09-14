// 遊戲畫面：圓桌、任務軌、行動面板、結果視窗
import { html, useState, useEffect } from '../vendor/preact-htm.js';
import * as Room from '../room.js';
import { skipNight, backToLobby, END_REASONS } from '../host.js';
import * as G from '../game.js';
import { ROLES, QUEST_SIZES, failsRequired, MAX_REJECTIONS } from '../rules.js';
import { roleSvg, roleBadgeSvg, cardBackSvg, TOKENS } from '../art.js';
import { Art, Avatar, Modal, ConfirmModal, toast, useNow, fmtTime, errMsg, store } from './common.js';
import { RoleView, RoleKnowledge, HistoryTable, LogList, VoteResult, QuestResult, LadyResult } from './panels.js';
import { openGuide } from './guide.js';

const PHASE_TITLE = {
  night: '確認身分', team: '隊長組隊', vote: '全員投票', quest: '執行任務',
  lady: '湖中女神', assassin: '刺殺梅林', end: '遊戲結束',
};
const TIMER_KEY = { team: 'team', vote: 'vote', quest: 'quest', lady: 'lady', assassin: 'assassin' };

export function Board(props) {
  if (!props.s.pub) return html`<div class="center-msg">載入遊戲中…</div>`;
  return html`<${BoardInner} ...${props} />`;
}

function BoardInner({ s, code, uid, onLeave }) {
  const p = s.pub;
  const order = G.toArray(p.order);
  const n = order.length;
  const phase = p.phase;
  const isHost = s.meta?.hostUid === uid;
  const my = s.secret || {};
  const now = useNow(s.serverOffset || 0);
  const [panel, setPanel] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [seen, setSeen] = useState(() => new Set(store.get(`avalon.seen.${code}`, [])));

  const name = (u) => Room.nameOf(s, u);
  const bySeat = (uids) => [...uids].sort((a, b) => p.seat[a] - p.seat[b]);
  const run = async (fn) => {
    try { await fn(); } catch (e) { toast(errMsg(e), 'error'); }
  };
  const markSeen = (id) => {
    const next = new Set(seen);
    next.add(id);
    setSeen(next);
    store.set(`avalon.seen.${code}`, [...next].slice(-80));
  };

  const team = Object.keys(p.team || {});
  const draft = s.draft && s.draft.round === p.round && s.draft.attempt === p.attempt ? s.draft : null;
  const draftTeam = Object.keys(draft?.team || {}).filter((u) => draft.team[u]);
  const targeting = !!p.settings?.targeting;
  const avail = G.availableQuests(p.quests, targeting);
  const draftQuest = targeting ? (draft?.quest ?? null) : (avail[0] ?? null);
  const need = draftQuest != null ? QUEST_SIZES[n][draftQuest] : null;
  const evilList = G.toArray(p.evil);
  const ladyOptions = phase === 'lady' ? G.ladyTargets(order, p.lady?.holder, p.lady?.used) : [];
  const assassinTurn = phase === 'assassin' && my.role === 'assassin';
  const assassinOptions = assassinTurn ? order.filter((u) => !evilList.includes(u)) : [];

  let pending = [];
  if (phase === 'night') pending = order.filter((u) => !s.ready?.[u]);
  else if (phase === 'team') pending = [p.leader];
  else if (phase === 'vote') pending = order.filter((u) => !s.voted?.[u]);
  else if (phase === 'quest') pending = team.filter((u) => !s.played?.[u]);
  else if (phase === 'lady') pending = [p.lady?.holder];
  const myTurn = phase === 'assassin' ? assassinTurn && !s.assassinPick : pending.includes(uid);

  const limit = TIMER_KEY[phase] ? (p.settings?.timers?.[TIMER_KEY[phase]] || 0) : 0;
  const remaining = limit && p.phaseAt ? p.phaseAt + limit * 1000 - now : null;
  const timeUp = remaining !== null && remaining <= 0;

  // 輪到自己時提醒
  const turnKey = myTurn && phase !== 'night' ? `${phase}:${p.round}:${p.attempt}` : null;
  useEffect(() => {
    if (!turnKey) return;
    toast('輪到你了！', 'turn');
    try { navigator.vibrate?.(120); } catch { /* 不支援震動 */ }
  }, [turnKey]);
  const timeUpKey = timeUp && myTurn ? `${phase}:${p.phaseAt}` : null;
  useEffect(() => {
    if (!timeUpKey) return;
    toast('⏰ 時間到了，請盡快行動！', 'warn');
    try { navigator.vibrate?.([120, 80, 120]); } catch { /* 不支援震動 */ }
  }, [timeUpKey]);
  useEffect(() => {
    document.title = myTurn && phase !== 'end' ? '【輪到你】阿瓦隆' : '阿瓦隆・線上桌遊';
    return () => { document.title = '阿瓦隆・線上桌遊'; };
  }, [myTurn, phase]);

  // ── 隊長操作 ──
  const writeDraft = (patch) => run(() => Room.saveDraft(code, {
    round: p.round,
    attempt: p.attempt,
    quest: draftQuest,
    team: Object.fromEntries(draftTeam.map((u) => [u, true])),
    submitted: false,
    ...patch,
  }));
  const toggleTeam = (u) => {
    if (draft?.submitted) return;
    if (need == null) { toast('請先選擇要挑戰的任務', 'warn'); return; }
    const cur = new Set(draftTeam);
    if (cur.has(u)) cur.delete(u);
    else if (cur.size >= need) { toast(`這個任務只需要 ${need} 人，請先取消其他人`, 'warn'); return; }
    else cur.add(u);
    writeDraft({ team: Object.fromEntries([...cur].map((x) => [x, true])) });
  };
  const chooseQuest = (q) => {
    if (draft?.submitted) return;
    const size = QUEST_SIZES[n][q];
    writeDraft({ quest: q, team: Object.fromEntries(draftTeam.slice(0, size).map((x) => [x, true])) });
  };

  const clickSeat = (u) => {
    if (phase === 'team' && p.leader === uid) toggleTeam(u);
    else if (phase === 'lady' && p.lady?.holder === uid && !s.ladyPick && ladyOptions.includes(u)) setConfirm({ kind: 'lady', target: u });
    else if (assassinTurn && !s.assassinPick && assassinOptions.includes(u)) setConfirm({ kind: 'assassin', target: u });
  };
  const seatSelectable = (u) => (phase === 'team' && p.leader === uid && !draft?.submitted)
    || (phase === 'lady' && p.lady?.holder === uid && !s.ladyPick && ladyOptions.includes(u))
    || (assassinTurn && !s.assassinPick && assassinOptions.includes(u));

  const ctx = {
    s, p, code, uid, order, n, name, bySeat, run, setConfirm, isHost, my, team, draft, draftTeam,
    draftQuest, need, avail, targeting, toggleTeam, chooseQuest, writeDraft, ladyOptions, assassinOptions,
    evilList, pending, timeUp, setPanel, onLeave,
  };

  // 結果視窗（一次顯示一個）
  const ladyNew = Object.entries(my.lady || {}).find(([r]) => !seen.has(`lady:${p.gid}:${r}`));
  let resultModal = null;
  if (p.lastVote && !seen.has(p.lastVote.id)) {
    resultModal = html`<${Modal} title="投票結果" onClose=${() => markSeen(p.lastVote.id)}>
      <${VoteResult} s=${s} v=${p.lastVote} />
      <button type="button" class="btn btn-gold btn-block" onClick=${() => markSeen(p.lastVote.id)}>知道了</button>
    <//>`;
  } else if (p.lastQuest && !seen.has(p.lastQuest.id)) {
    resultModal = html`<${Modal} title="任務結果" onClose=${() => markSeen(p.lastQuest.id)}>
      <${QuestResult} q=${p.lastQuest} />
      <button type="button" class="btn btn-gold btn-block" onClick=${() => markSeen(p.lastQuest.id)}>知道了</button>
    <//>`;
  } else if (ladyNew) {
    const id = `lady:${p.gid}:${ladyNew[0]}`;
    resultModal = html`<${Modal} title="湖中女神的啟示" onClose=${() => markSeen(id)}>
      <${LadyResult} s=${s} entry=${ladyNew[1]} />
      <button type="button" class="btn btn-gold btn-block" onClick=${() => markSeen(id)}>知道了</button>
    <//>`;
  }

  const currentQuest = phase === 'vote' || phase === 'quest' ? p.currentQuest : phase === 'team' ? draftQuest : null;

  return html`<div class="page board">
    <header class="topbar">
      <div class="brand"><span class="brand-mark">⚜</span> 阿瓦隆 <span class="room-tag">#${code}</span></div>
      <div class="top-actions">
        <button type="button" class="btn btn-ghost btn-small" onClick=${() => setPanel('role')}>我的身分</button>
        <button type="button" class="btn btn-ghost btn-small" onClick=${() => setPanel('history')}>紀錄</button>
        <button type="button" class="btn btn-ghost btn-small" onClick=${() => openGuide('now')}>📖 說明</button>
        ${isHost && html`<button type="button" class="btn btn-ghost btn-small" onClick=${() => setPanel('host')}>房主</button>`}
      </div>
    </header>
    ${!s.connected && html`<div class="conn-banner">連線中斷，正在重新連線…</div>`}

    <div class="board-main">
      <section class="board-left">
        <div class="statusbar">
          <span class="phase-name">${PHASE_TITLE[phase]}</span>
          ${phase !== 'night' && phase !== 'end' && html`<span class="muted">第 ${p.round} 輪・提案 ${p.attempt}／${MAX_REJECTIONS}</span>`}
          ${remaining !== null && html`<span class=${`timer${timeUp ? ' up' : remaining < 10000 ? ' soon' : ''}`}>${timeUp ? '⏰ 時間到' : `⏳ ${fmtTime(remaining)}`}</span>`}
        </div>
        <${QuestTrack} p=${p} n=${n} current=${currentQuest}
          selectable=${phase === 'team' && p.leader === uid && targeting && !draft?.submitted ? avail : null}
          onSelect=${chooseQuest} />
        <${RejectTrack} attempt=${phase === 'end' ? 0 : p.attempt} />
        <${RoundTable} ctx=${ctx} clickSeat=${clickSeat} seatSelectable=${seatSelectable} selectedTarget=${confirm?.target} />
      </section>

      <section class="board-right">
        <div class=${`action-panel${myTurn ? ' my-turn' : ''}`} data-testid="action-panel">
          ${timeUp && phase !== 'end' && html`<div class="timeup">⏰ 時間到了！${phase === 'assassin' ? '請刺客盡快做出決定' : `請 ${pending.map(name).join('、')} 盡快行動`}</div>`}
          ${phase === 'night' && html`<${NightPanel} ctx=${ctx} key=${`night-${p.gid}`} />`}
          ${phase === 'team' && html`<${TeamPanel} ctx=${ctx} key=${`team-${p.round}-${p.attempt}`} />`}
          ${phase === 'vote' && html`<${VotePanel} ctx=${ctx} key=${p.voteId} />`}
          ${phase === 'quest' && html`<${QuestPanel} ctx=${ctx} key=${p.runId} />`}
          ${phase === 'lady' && html`<${LadyPanel} ctx=${ctx} key=${`lady-${p.round}`} />`}
          ${phase === 'assassin' && html`<${AssassinPanel} ctx=${ctx} />`}
          ${phase === 'end' && html`<${EndPanel} ctx=${ctx} />`}
        </div>
        <div class="card log-card">
          <div class="log-head"><h3>遊戲日誌</h3><button type="button" class="link-btn" onClick=${() => setPanel('history')}>完整紀錄 ›</button></div>
          <${LogList} s=${s} limit=${40} />
        </div>
      </section>
    </div>

    ${panel === 'role' && html`<${Modal} title="我的身分" onClose=${() => setPanel(null)}><${RoleView} s=${s} /><//>`}
    ${panel === 'history' && html`<${Modal} title="遊戲紀錄" wide onClose=${() => setPanel(null)}>
      <h4>投票與任務紀錄</h4><${HistoryTable} s=${s} />
      <h4>遊戲日誌</h4><${LogList} s=${s} />
    <//>`}
    ${panel === 'host' && html`<${HostMenu} ctx=${ctx} onClose=${() => setPanel(null)} />`}

    ${!panel && !confirm && resultModal}
    ${confirm && html`<${ConfirmDialog} ctx=${ctx} confirm=${confirm} close=${() => setConfirm(null)} />`}
  </div>`;
}

function QuestTrack({ p, n, current, selectable, onSelect }) {
  return html`<div class="quests" role="list" aria-label="任務進度">
    ${[0, 1, 2, 3, 4].map((i) => {
      const q = p.quests?.[i];
      const open = selectable?.includes(i);
      const cls = ['quest', q?.result, i === current && 'current', open && 'open'].filter(Boolean).join(' ');
      return html`<button type="button" role="listitem" class=${cls} key=${i} disabled=${!open}
        onClick=${() => open && onSelect(i)} aria-label=${`任務 ${i + 1}`} data-testid=${`quest-${i}`}>
        <span class="quest-no">任務${i + 1}</span>
        ${q
          ? html`<${Art} svg=${q.result === 'success' ? TOKENS.success : TOKENS.fail} class="quest-art" />`
          : html`<span class="quest-size">${QUEST_SIZES[n][i]}<small>人</small></span>`}
        ${q ? html`<span class="quest-sub">${q.fails} 失敗</span>` : failsRequired(n, i) === 2 && html`<span class="quest-sub warn">需2敗</span>`}
      </button>`;
    })}
  </div>`;
}

function RejectTrack({ attempt }) {
  return html`<div class="rejects" aria-label="否決次數">
    <span class="muted small">否決</span>
    ${[1, 2, 3, 4, 5].map((i) => html`<span key=${i} class=${`rej${i < attempt ? ' on' : ''}${i === 5 ? ' last' : ''}`}>${i}</span>`)}
    <span class="muted small">5 次否決＝邪惡勝</span>
  </div>`;
}

function RoundTable({ ctx, clickSeat, seatSelectable, selectedTarget }) {
  const { s, p, order, n, uid, name, draftTeam, pending, timeUp, evilList, my } = ctx;
  const phase = p.phase;
  const base = Math.max(0, order.indexOf(uid));
  return html`<div class="table" data-testid="round-table">
    <div class="table-center">
      <div>
        <div class="tc-phase">${PHASE_TITLE[phase]}</div>
        <div class="tc-sub">${centerText(ctx)}</div>
      </div>
    </div>
    ${order.map((u, i) => {
      const k = (i - base + n) % n;
      const angle = ((90 + (k * 360) / n) * Math.PI) / 180; // 自己在正下方，順時針排列
      const x = 50 + 41 * Math.cos(angle);
      const y = 50 + 41 * Math.sin(angle);
      const onTeam = phase === 'team' ? draftTeam.includes(u) : (phase === 'vote' || phase === 'quest') && !!p.team?.[u];
      const done = phase === 'night' ? !!s.ready?.[u] : phase === 'vote' ? !!s.voted?.[u] : phase === 'quest' ? !!s.played?.[u] : false;
      const reveal = p.reveal?.[u];
      const sees = my.sees?.[u];
      const offline = s.loaded?.presence && !s.presence?.[u]?.online;
      const selectable = seatSelectable(u);
      const cls = ['seat',
        u === uid && 'me', onTeam && 'on-team', done && 'done', pending.includes(u) && 'pending',
        pending.includes(u) && timeUp && 'late', offline && 'offline', selectable && 'selectable',
        selectedTarget === u && 'targeted', p.assassinTarget === u && 'assassinated',
        reveal && ROLES[reveal]?.team, evilList.includes(u) && 'evil-public',
      ].filter(Boolean).join(' ');
      let chip = null;
      if (reveal) chip = html`<span class=${`chip tiny ${ROLES[reveal].team}`}>${ROLES[reveal].name}</span>`;
      else if (evilList.includes(u)) chip = html`<span class="chip tiny evil">邪惡</span>`;
      else if (sees === 'evil') chip = html`<span class="chip tiny evil">邪惡</span>`;
      else if (sees === 'merlin') chip = html`<span class="chip tiny merlin">梅林</span>`;
      else if (sees === 'merlinOrMorgana') chip = html`<span class="chip tiny merlin">梅林？</span>`;
      else if (offline) chip = html`<span class="chip tiny">離線</span>`;
      return html`<button type="button" class=${cls} key=${u} style=${`left:${x}%;top:${y}%`}
        onClick=${() => selectable && clickSeat(u)} aria-disabled=${!selectable} data-testid=${`seat-${name(u)}`}>
        <span class="seat-avatar">
          ${reveal ? html`<${Art} svg=${roleBadgeSvg(reveal)} class="seat-role" />` : html`<${Avatar} uid=${u} name=${name(u)} />`}
          ${p.leader === u && phase !== 'end' && html`<${Art} svg=${TOKENS.crown} class="tok tok-leader" />`}
          ${p.lady?.holder === u && html`<${Art} svg=${TOKENS.lady} class="tok tok-lady" />`}
          ${onTeam && html`<${Art} svg=${TOKENS.shield} class="tok tok-team" />`}
          ${done && html`<span class="tok tok-done">✓</span>`}
        </span>
        <span class="seat-name">${name(u)}${u === uid ? '（你）' : ''}</span>
        ${chip}
      </button>`;
    })}
  </div>`;
}

function centerText({ s, p, order, team, name }) {
  switch (p.phase) {
    case 'night': return `已確認 ${order.filter((u) => s.ready?.[u]).length}／${order.length}`;
    case 'team': return `隊長：${name(p.leader)}`;
    case 'vote': return `已投票 ${order.filter((u) => s.voted?.[u]).length}／${order.length}`;
    case 'quest': return `已出牌 ${team.filter((u) => s.played?.[u]).length}／${team.length}`;
    case 'lady': return `${name(p.lady?.holder)} 查驗中`;
    case 'assassin': return '刺客正在指認梅林';
    case 'end': return p.winner === 'good' ? '正義方獲勝' : '邪惡方獲勝';
    default: return '';
  }
}

function Waiting({ ctx, uids, label }) {
  if (!uids.length) return null;
  return html`<div class="waiting-list">
    <span class="muted small">${label}：</span>
    ${uids.map((u) => html`<span class=${`chip${ctx.timeUp ? ' late' : ''}`} key=${u}>${ctx.name(u)}</span>`)}
  </div>`;
}

function NightPanel({ ctx }) {
  const { s, uid, order, code, run, isHost, setConfirm } = ctx;
  const [shown, setShown] = useState(false);
  const role = s.secret?.role;
  const ready = !!s.ready?.[uid];
  const waiting = order.filter((u) => !s.ready?.[u]);
  return html`<div class="panel-body">
    <h3 class="panel-title">查看你的身分</h3>
    <p class="muted small">請確認旁邊沒有人在看你的螢幕，再翻開身分牌。之後可以隨時點上方「我的身分」再看一次。</p>
    <button type="button" class=${`flip-card${shown ? ' shown' : ''}`} onClick=${() => role && setShown(!shown)} aria-label="翻開身分牌" data-testid="flip-card">
      <span class="flip-inner">
        <span class="flip-front"><${Art} svg=${cardBackSvg()} /><span class="flip-hint">點擊翻開</span></span>
        <span class="flip-back">${role && html`<${Art} svg=${roleSvg(role)} />`}</span>
      </span>
    </button>
    ${shown && role && html`<${RoleKnowledge} s=${s} />`}
    ${ready
      ? html`<div class="done-note">✓ 你已確認身分</div>`
      : html`<button type="button" class="btn btn-gold btn-block" data-testid="ready" disabled=${!shown}
          onClick=${() => run(() => Room.setReady(code, uid))}>${shown ? '我已確認身分' : '請先翻開身分牌'}</button>`}
    <${Waiting} ctx=${ctx} uids=${waiting} label="等待確認" />
    ${isHost && waiting.length > 0 && html`<button type="button" class="btn btn-ghost btn-small" onClick=${() => setConfirm({ kind: 'skipNight' })}>房主：不等了，直接開始</button>`}
  </div>`;
}

function TeamPanel({ ctx }) {
  const { p, uid, n, order, name, bySeat, draft, draftTeam, draftQuest, need, avail, targeting, toggleTeam, chooseQuest, setConfirm } = ctx;
  if (p.leader !== uid) {
    return html`<div class="panel-body">
      <h3 class="panel-title">等待隊長 ${name(p.leader)} 組隊</h3>
      <p class="muted">${draftQuest != null ? `第 ${draftQuest + 1} 個任務，需要 ${need} 人` : '隊長正在選擇要挑戰的任務'}</p>
      <div class="know-title">隊長目前的選擇</div>
      <div class="chips">${draftTeam.length
        ? bySeat(draftTeam).map((u) => html`<span class="chip team" key=${u}>${name(u)}</span>`)
        : html`<span class="muted">尚未選擇</span>`}</div>
      <p class="muted small">趁現在在語音裡討論，建議隊長該選誰。</p>
    </div>`;
  }
  const submitted = !!draft?.submitted;
  return html`<div class="panel-body">
    <h3 class="panel-title">👑 你是隊長！</h3>
    ${targeting && html`
      <div class="know-title">① 選擇要挑戰的任務</div>
      <div class="quest-pick">${[0, 1, 2, 3, 4].map((i) => html`<button type="button" key=${i}
        class=${`btn btn-small ${draftQuest === i ? 'btn-gold' : 'btn-ghost'}`}
        disabled=${!avail.includes(i) || submitted} onClick=${() => chooseQuest(i)}>任務${i + 1}（${QUEST_SIZES[n][i]}人）</button>`)}</div>
      ${!avail.includes(4) && !p.quests?.[4] && html`<p class="muted small">第 5 個任務要先成功 2 個任務才能挑戰</p>`}`}
    <div class="know-title">${targeting ? '② ' : ''}選出 ${need ?? '?'} 位隊員（可以選自己）</div>
    <p class="muted small">點圓桌上的玩家，或點下面的名字</p>
    <div class="chips">${order.map((u) => html`<button type="button" key=${u} disabled=${submitted}
      class=${`chip pickable${draftTeam.includes(u) ? ' on' : ''}`} onClick=${() => toggleTeam(u)} data-testid=${`pick-${name(u)}`}>${name(u)}</button>`)}</div>
    <button type="button" class="btn btn-gold btn-block" data-testid="propose"
      disabled=${need == null || draftTeam.length !== need || submitted}
      onClick=${() => setConfirm({ kind: 'team' })}>
      ${submitted ? '已送出，準備投票…' : `提出隊伍（${draftTeam.length}／${need ?? '?'}）`}
    </button>
  </div>`;
}

function VotePanel({ ctx }) {
  const { s, p, uid, order, name, bySeat, code, run, team } = ctx;
  const [choice, setChoice] = useState(null);
  const [sending, setSending] = useState(false);
  const hasVoted = !!s.voted?.[uid];
  const submit = async () => {
    setSending(true);
    await run(() => Room.castVote(code, p.voteId, uid, choice));
    setSending(false);
  };
  return html`<div class="panel-body">
    <h3 class="panel-title">第 ${p.currentQuest + 1} 個任務・第 ${p.attempt} 次提案</h3>
    <p>隊長 <b>${name(p.leader)}</b> 提名：</p>
    <div class="chips">${bySeat(team).map((u) => html`<span class="chip team" key=${u}>${name(u)}</span>`)}</div>
    ${p.attempt === MAX_REJECTIONS && html`<div class="notice warn">⚠️ 這是本輪第 5 次提案，再被否決邪惡方就直接獲勝！</div>`}
    ${hasVoted
      ? html`<div class="done-note">✓ 你投了「${s.myVote === true ? '贊成' : s.myVote === false ? '反對' : '…'}」</div>`
      : html`
        <div class="choice-row">
          <button type="button" class=${`choice approve${choice === true ? ' on' : ''}`} onClick=${() => setChoice(true)} data-testid="vote-approve">
            <${Art} svg=${TOKENS.approve} /><span>贊成</span></button>
          <button type="button" class=${`choice reject${choice === false ? ' on' : ''}`} onClick=${() => setChoice(false)} data-testid="vote-reject">
            <${Art} svg=${TOKENS.reject} /><span>反對</span></button>
        </div>
        <button type="button" class="btn btn-gold btn-block" data-testid="vote-submit" disabled=${choice === null || sending} onClick=${submit}>
          ${choice === null ? '請選擇贊成或反對' : `確認投下「${choice ? '贊成' : '反對'}」`}</button>
        <p class="muted small">投出後無法更改；全員投完才會公開每個人的票。</p>`}
    <p class="muted">已投票 ${order.filter((u) => s.voted?.[u]).length}／${order.length}</p>
    <${Waiting} ctx=${ctx} uids=${order.filter((u) => !s.voted?.[u])} label="尚未投票" />
  </div>`;
}

function QuestPanel({ ctx }) {
  const { s, p, uid, name, bySeat, code, run, team, my } = ctx;
  const [choice, setChoice] = useState(null);
  const [sending, setSending] = useState(false);
  const onTeam = team.includes(uid);
  const played = !!s.played?.[uid];
  const isGood = my.team === 'good';
  const submit = async () => {
    setSending(true);
    await run(() => Room.playCard(code, p.runId, uid, choice));
    setSending(false);
  };
  return html`<div class="panel-body">
    <h3 class="panel-title">第 ${p.currentQuest + 1} 個任務進行中</h3>
    <div class="chips">${bySeat(team).map((u) => html`<span class=${`chip team${s.played?.[u] ? ' done' : ''}`} key=${u}>${name(u)}${s.played?.[u] ? ' ✓' : ''}</span>`)}</div>
    ${failsRequired(ctx.n, p.currentQuest) === 2 && html`<p class="muted small">這個任務需要 2 張失敗牌才會失敗。</p>`}
    ${!onTeam && html`<p class="muted">你不在這次的隊伍中，等待隊員出牌…</p>`}
    ${onTeam && played && html`<div class="done-note">✓ 你出了「${s.myCard === 'F' ? '失敗' : s.myCard === 'S' ? '成功' : '…'}」</div>`}
    ${onTeam && !played && html`
      <div class="choice-row">
        <button type="button" class=${`choice card-choice${choice === 'S' ? ' on' : ''}`} onClick=${() => setChoice('S')} data-testid="card-success">
          <${Art} svg=${TOKENS.successCard} /><span>成功</span></button>
        <button type="button" class=${`choice card-choice${choice === 'F' ? ' on' : ''}`} disabled=${isGood}
          onClick=${() => !isGood && setChoice('F')} data-testid="card-fail" title=${isGood ? '正義方只能出成功牌' : ''}>
          <${Art} svg=${TOKENS.failCard} /><span>失敗</span></button>
      </div>
      ${isGood && html`<p class="muted small center">正義方只能出「成功」。</p>`}
      <button type="button" class="btn btn-gold btn-block" data-testid="card-submit" disabled=${!choice || sending} onClick=${submit}>
        ${!choice ? '請選擇任務牌' : `確認打出「${choice === 'S' ? '成功' : '失敗'}」`}</button>
      <p class="muted small">出牌後無法更改；結果只會公開失敗牌的張數。</p>`}
    <${Waiting} ctx=${ctx} uids=${team.filter((u) => !s.played?.[u])} label="尚未出牌" />
  </div>`;
}

function LadyPanel({ ctx }) {
  const { s, p, uid, name, bySeat, ladyOptions, setConfirm } = ctx;
  const holder = p.lady?.holder;
  const used = bySeat(Object.keys(p.lady?.used || {}));
  return html`<div class="panel-body">
    <div class="lady-head"><${Art} svg=${TOKENS.lady} class="lady-icon" /><h3 class="panel-title">湖中女神</h3></div>
    ${holder === uid
      ? html`
        <p>選擇一位玩家，秘密查看他的陣營。查驗後湖中女神會交給對方。</p>
        ${s.ladyPick
          ? html`<div class="done-note">已選擇 ${name(s.ladyPick.target)}，等待結果…</div>`
          : html`<div class="chips">${ladyOptions.map((u) => html`<button type="button" key=${u} class="chip pickable"
              onClick=${() => setConfirm({ kind: 'lady', target: u })} data-testid=${`lady-${name(u)}`}>${name(u)}</button>`)}</div>`}`
      : html`<p><b>${name(holder)}</b> 正在選擇要查驗的玩家。</p>
        <p class="muted small">查驗結果只有湖中女神看得到，持有者可以自由宣稱結果（也可以說謊）。</p>`}
    <p class="muted small">曾持有湖中女神（不能被查驗）：${used.map(name).join('、')}</p>
  </div>`;
}

function AssassinPanel({ ctx }) {
  const { s, p, name, bySeat, my, evilList, assassinOptions, setConfirm } = ctx;
  const isAssassin = my.role === 'assassin';
  return html`<div class="panel-body">
    <h3 class="panel-title">🗡️ 刺殺梅林</h3>
    <p>正義方完成了三個任務！邪惡方公開陣營，這是最後的機會。</p>
    <div class="know-title">邪惡方</div>
    <div class="chips">${bySeat(evilList).map((u) => html`<span class="chip evil" key=${u}>${name(u)}</span>`)}</div>
    ${isAssassin && !s.assassinPick && html`
      <p><b>你是刺客。</b>和邪惡同伴討論後，指認你認為是梅林的玩家：</p>
      <div class="chips">${assassinOptions.map((u) => html`<button type="button" key=${u} class="chip pickable"
        onClick=${() => setConfirm({ kind: 'assassin', target: u })} data-testid=${`assassin-${name(u)}`}>${name(u)}</button>`)}</div>`}
    ${isAssassin && s.assassinPick && html`<div class="done-note">已指認 ${name(s.assassinPick.target)}，揭曉中…</div>`}
    ${!isAssassin && my.team === 'evil' && html`<p class="muted">在語音中和刺客討論誰是梅林，由刺客做最後決定。</p>`}
    ${my.team === 'good' && html`<p class="muted">刺客正在指認梅林……梅林，別露出破綻！</p>`}
  </div>`;
}

function EndPanel({ ctx }) {
  const { s, p, order, name, isHost, setConfirm, setPanel } = ctx;
  const good = p.winner === 'good';
  const groups = ['good', 'evil'].map((t) => order.filter((u) => ROLES[p.reveal?.[u]]?.team === t));
  return html`<div class="panel-body">
    <div class=${`winner-banner ${p.winner}`}>
      <${Art} svg=${good ? TOKENS.success : TOKENS.fail} class="winner-art" />
      <div><div class="winner-title">${good ? '正義方獲勝' : '邪惡方獲勝'}</div>
      <div class="winner-reason">${END_REASONS[p.reason] || ''}</div></div>
    </div>
    ${p.assassinTarget && html`<p class="center">刺客指認了 <b>${name(p.assassinTarget)}</b>（${ROLES[p.reveal?.[p.assassinTarget]]?.name}）</p>`}
    ${groups.map((uids, i) => html`<div key=${i}>
      <div class="know-title">${i === 0 ? '正義方' : '邪惡方'}</div>
      <div class="reveal-list">${uids.map((u) => html`<div class=${`reveal-item ${i === 0 ? 'good' : 'evil'}`} key=${u}>
        <${Art} svg=${roleSvg(p.reveal[u])} class="reveal-card" />
        <span><b>${name(u)}</b><br /><span class="small">${ROLES[p.reveal[u]].name}</span></span>
      </div>`)}</div>
    </div>`)}
    <div class="btn-col">
      <button type="button" class="btn btn-ghost btn-block" onClick=${() => setPanel('history')}>查看完整紀錄</button>
      ${isHost
        ? html`<button type="button" class="btn btn-gold btn-block" data-testid="play-again" onClick=${() => setConfirm({ kind: 'lobby' })}>再來一局（回到大廳）</button>`
        : html`<p class="muted center">等待房主開始下一局…</p>`}
      <button type="button" class="btn btn-ghost btn-block" onClick=${() => setConfirm({ kind: 'leave' })}>離開房間</button>
    </div>
  </div>`;
}

function HostMenu({ ctx, onClose }) {
  const { s, p, order, uid, name, code, run, setConfirm } = ctx;
  const [target, setTarget] = useState('');
  const others = order.filter((u) => u !== uid);
  return html`<${Modal} title="房主選單" onClose=${onClose}>
    <p class="muted small">房主的瀏覽器負責推進遊戲流程。如果你要離開，請先把房主交給其他人；房主斷線超過 30 秒時，系統也會自動交給下一位在線玩家。</p>
    <div class="know-title">轉移房主</div>
    <div class="btn-row">
      <select class="input" value=${target} onChange=${(e) => setTarget(e.currentTarget.value)}>
        <option value="">選擇玩家…</option>
        ${others.map((u) => html`<option value=${u} key=${u}>${name(u)}${s.presence?.[u]?.online ? '' : '（離線）'}</option>`)}
      </select>
      <button type="button" class="btn btn-gold" disabled=${!target}
        onClick=${() => run(async () => { await Room.transferHost(code, target); toast('已轉移房主', 'ok'); onClose(); })}>轉移</button>
    </div>
    ${p.phase === 'night' && html`<div class="know-title">確認身分</div>
      <button type="button" class="btn btn-ghost btn-block" onClick=${() => { onClose(); setConfirm({ kind: 'skipNight' }); }}>不等待，直接開始第一輪</button>`}
    <div class="know-title">結束本局</div>
    <button type="button" class="btn btn-danger btn-block" onClick=${() => { onClose(); setConfirm({ kind: 'lobby' }); }}>
      ${p.phase === 'end' ? '回到大廳' : '中止遊戲並回到大廳'}</button>
  <//>`;
}

function ConfirmDialog({ ctx, confirm, close }) {
  const { s, p, code, uid, name, bySeat, draftTeam, draftQuest, writeDraft, onLeave } = ctx;
  const t = confirm.target;
  const base = { onCancel: close };
  switch (confirm.kind) {
    case 'team':
      return html`<${ConfirmModal} ...${base} title="提出隊伍" confirmText="確定提名"
        message=${`第 ${draftQuest + 1} 個任務，提名：${bySeat(draftTeam).map(name).join('、')}`}
        onConfirm=${async () => { await writeDraft({ submitted: true }); close(); }} />`;
    case 'lady':
      return html`<${ConfirmModal} ...${base} title="湖中女神" confirmText="查驗"
        message=${`確定要查驗 ${name(t)} 的陣營嗎？查驗後湖中女神會交給 ${name(t)}。`}
        onConfirm=${async () => { await ctx.run(() => Room.pickLady(code, t, p.round)); close(); }} />`;
    case 'assassin':
      return html`<${ConfirmModal} ...${base} title="刺殺梅林" danger confirmText="就是他！"
        message=${`確定指認 ${name(t)} 是梅林嗎？這個決定無法反悔。`}
        onConfirm=${async () => { await ctx.run(() => Room.pickAssassin(code, t)); close(); }} />`;
    case 'skipNight':
      return html`<${ConfirmModal} ...${base} title="直接開始"
        message="還有玩家沒有確認身分。確定不等待，直接進入第一輪嗎？（他們之後仍可查看身分）"
        onConfirm=${async () => { await ctx.run(() => skipNight(code, s)); close(); }} />`;
    case 'lobby':
      return html`<${ConfirmModal} ...${base} title=${p.phase === 'end' ? '再來一局' : '中止遊戲'} danger=${p.phase !== 'end'}
        confirmText=${p.phase === 'end' ? '回到大廳' : '中止遊戲'}
        message=${p.phase === 'end' ? '所有人會回到大廳，可以調整設定後開始新的一局。' : '遊戲還沒結束！確定要中止並讓所有人回到大廳嗎？'}
        onConfirm=${async () => { await ctx.run(() => backToLobby(code)); close(); }} />`;
    case 'leave':
      return html`<${ConfirmModal} ...${base} title="離開房間" danger confirmText="離開"
        message=${p.phase === 'end' ? '確定要離開房間嗎？' : '遊戲進行中！離開後其他人可能會卡住。你可以用同一台裝置輸入房間代碼回來。'}
        onConfirm=${async () => { close(); await onLeave(); }} />`;
    default:
      return null;
  }
}
