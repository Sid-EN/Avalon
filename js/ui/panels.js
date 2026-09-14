// 各種資訊面板：身分、投票結果、任務結果、遊戲紀錄、規則
import { html, useMemo, useEffect, useRef } from '../vendor/preact-htm.js';
import { ROLES, QUEST_SIZES, TEAM_COUNTS, failsRequired } from '../rules.js';
import { toArray, shuffle } from '../game.js';
import { nameOf } from '../room.js';
import { roleSvg, cardBackSvg, TOKENS } from '../art.js';
import { Art, ROLE_DESC } from './common.js';

const teamName = (t) => (t === 'good' ? '正義方' : '邪惡方');

export function RoleKnowledge({ s }) {
  const my = s.secret || {};
  const role = my.role;
  if (!role) return html`<p class="muted">身分資料載入中…</p>`;
  const counts = s.pub?.roleCounts || {};
  const seen = Object.keys(my.sees || {}).sort((a, b) => (s.pub?.seat?.[a] ?? 0) - (s.pub?.seat?.[b] ?? 0));
  const info = ROLES[role];
  let title = null;
  let note = null;
  if (role === 'merlin') {
    title = '你看到的邪惡玩家';
    if (counts.mordred) note = '莫德雷德也是邪惡方，但你看不到他。';
  } else if (role === 'percival') {
    title = counts.morgana ? '梅林與莫甘娜（分不出誰是誰）' : '梅林';
  } else if (info.team === 'evil' && role !== 'oberon') {
    title = '你的邪惡同伴';
    if (counts.oberon) note = '奧伯倫也是邪惡方，但你們互相看不到。';
  }
  const lady = Object.entries(my.lady || {});
  return html`<div class="knowledge">
    <div class=${`team-banner ${info.team}`}>${info.name}・${teamName(info.team)}</div>
    <p>${ROLE_DESC[role]}</p>
    ${title
      ? html`<div class="know-title">${title}</div>
        <div class="chips">${seen.length
          ? seen.map((u) => html`<span class=${`chip ${my.sees[u] === 'evil' ? 'evil' : 'merlin'}`} key=${u}>${nameOf(s, u)}</span>`)
          : html`<span class="muted">（沒有）</span>`}</div>`
      : html`<p class="muted">你沒有額外的情報。</p>`}
    ${note && html`<p class="muted small">${note}</p>`}
    ${lady.length > 0 && html`<div class="know-title">湖中女神查驗結果（只有你看得到）</div>
      <ul class="lady-results">${lady.map(([r, x]) => html`<li key=${r}>
        第 ${r} 輪：<b>${nameOf(s, x.target)}</b> 是 <b class=${x.team}>${teamName(x.team)}</b>
      </li>`)}</ul>`}
  </div>`;
}

export function RoleView({ s }) {
  const role = s.secret?.role;
  return html`<div class="role-view">
    <div class="role-card-large">${role ? html`<${Art} svg=${roleSvg(role)} />` : html`<${Art} svg=${cardBackSvg()} />`}</div>
    <${RoleKnowledge} s=${s} />
  </div>`;
}

export function VoteResult({ s, v }) {
  const order = toArray(s.pub?.order);
  const votes = v.votes || {};
  return html`<div class="vote-result">
    <div class=${`result-banner ${v.approved ? 'good' : 'evil'}`}>
      ${v.approved ? '隊伍通過' : '隊伍被否決'}・${v.approve} 贊成／${v.reject} 反對
    </div>
    <p class="muted center">第 ${v.quest + 1} 個任務・第 ${v.attempt} 次提案・隊長 ${nameOf(s, v.leader)}</p>
    <p class="center">隊員：${toArray(v.team).sort((a, b) => (s.pub?.seat?.[a] ?? 0) - (s.pub?.seat?.[b] ?? 0)).map((u) => nameOf(s, u)).join('、')}</p>
    <div class="vote-grid">${order.map((u) => html`<div class=${`vote-cell ${votes[u] ? 'yes' : 'no'}`} key=${u}>
      <${Art} svg=${votes[u] ? TOKENS.approve : TOKENS.reject} class="vote-token" />
      <span>${nameOf(s, u)}</span>
    </div>`)}</div>
  </div>`;
}

export function QuestResult({ q }) {
  // 任務牌打亂後依序翻開（只顯示張數，不會透露誰出了什麼）
  const cards = useMemo(() => shuffle([...Array(q.fails).fill('F'), ...Array(q.size - q.fails).fill('S')]), [q.id]);
  const step = 0.5;
  return html`<div class="quest-result">
    <div class="quest-cards">${cards.map((c, i) => html`<div class="qcard" key=${i}>
      <div class="qcard-inner" style=${`animation-delay:${0.3 + i * step}s`}>
        <div class="qcard-back"><${Art} svg=${cardBackSvg()} /></div>
        <div class="qcard-face"><${Art} svg=${c === 'F' ? TOKENS.failCard : TOKENS.successCard} /></div>
      </div>
    </div>`)}</div>
    <div class=${`result-banner delayed ${q.result === 'success' ? 'good' : 'evil'}`} style=${`animation-delay:${0.9 + cards.length * step}s`}>
      第 ${q.quest + 1} 個任務${q.result === 'success' ? '成功' : '失敗'}！（${q.fails} 張失敗牌）
    </div>
  </div>`;
}

export function LadyResult({ s, entry }) {
  return html`<div class="lady-result">
    <${Art} svg=${TOKENS.lady} class="lady-big" />
    <p class="center">湖中女神揭示了 <b>${nameOf(s, entry.target)}</b> 的陣營：</p>
    <div class=${`result-banner ${entry.team}`}>${teamName(entry.team)}</div>
    <p class="muted small center">只有你看得到這個結果。你可以向大家宣稱任何結果（包括說謊）。</p>
  </div>`;
}

export function HistoryTable({ s }) {
  const order = toArray(s.pub?.order);
  const entries = Object.entries(s.hist || {}).sort(([a], [b]) => (a < b ? -1 : 1)).map(([, e]) => e);
  if (!entries.length) return html`<p class="muted">還沒有任何提案紀錄。</p>`;
  return html`<div class="hist-wrap"><table class="hist">
    <thead><tr>
      <th class="sticky">玩家</th>
      ${entries.map((e, i) => html`<th key=${i}><div>任務${e.quest + 1}</div><div class="muted small">提案${e.attempt}</div></th>`)}
    </tr></thead>
    <tbody>${order.map((u) => html`<tr key=${u}>
      <th class="sticky">${nameOf(s, u)}</th>
      ${entries.map((e, i) => {
        const inTeam = toArray(e.team).includes(u);
        const v = e.votes?.[u];
        return html`<td key=${i} class=${`${inTeam ? 'in-team ' : ''}${v ? 'yes' : 'no'}`}>
          ${e.leader === u && html`<span class="h-lead" title="隊長">♛</span>`}
          ${inTeam && html`<span class="h-team" title="隊員">◆</span>`}
          <span class="h-vote">${v ? '✓' : '✗'}</span>
        </td>`;
      })}
    </tr>`)}</tbody>
    <tfoot><tr>
      <th class="sticky">結果</th>
      ${entries.map((e, i) => html`<td key=${i} class="h-res">
        ${e.approved ? html`<span class="good">通過</span>` : html`<span class="evil">否決</span>`}
        ${e.result && html`<div class=${e.result === 'success' ? 'good' : 'evil'}>${e.result === 'success' ? '成功' : '失敗'}${e.fails ? `(${e.fails})` : ''}</div>`}
      </td>`)}
    </tr></tfoot>
  </table></div>
  <p class="muted small">♛ 隊長　◆ 隊員　✓ 贊成　✗ 反對　（失敗牌張數）</p>`;
}

export function LogList({ s, limit = 0 }) {
  const box = useRef(null);
  let entries = Object.entries(s.log || {}).sort(([a], [b]) => (a < b ? -1 : 1)).map(([, e]) => e);
  if (limit) entries = entries.slice(-limit);
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [entries.length]);
  const fmt = (t) => {
    if (!t) return '';
    const d = new Date(t);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  return html`<ol class="log" ref=${box}>
    ${entries.map((e, i) => html`<li key=${i}><time>${fmt(e.t)}</time><span>${e.text}</span></li>`)}
  </ol>`;
}

export function QuestTable({ n }) {
  return html`<div class="hist-wrap"><table class="rules-table">
    <thead><tr><th>人數</th>${[5, 6, 7, 8, 9, 10].map((c) => html`<th class=${c === n ? 'hl' : ''} key=${c}>${c}</th>`)}</tr></thead>
    <tbody>
      <tr><th>正義／邪惡</th>${[5, 6, 7, 8, 9, 10].map((c) => html`<td class=${c === n ? 'hl' : ''} key=${c}>${TEAM_COUNTS[c].good}／${TEAM_COUNTS[c].evil}</td>`)}</tr>
      ${[0, 1, 2, 3, 4].map((q) => html`<tr key=${q}><th>任務 ${q + 1}</th>${[5, 6, 7, 8, 9, 10].map((c) => html`<td class=${c === n ? 'hl' : ''} key=${c}>
        ${QUEST_SIZES[c][q]}${failsRequired(c, q) === 2 ? '*' : ''}</td>`)}</tr>`)}
    </tbody>
  </table></div>
  <p class="muted small">* 需要 2 張失敗牌，任務才會失敗</p>`;
}

export function RulesView({ n }) {
  return html`<div class="rules">
    <h4>遊戲目標</h4>
    <p>玩家分成<b class="good">正義方（亞瑟的忠臣）</b>和<b class="evil">邪惡方（莫德雷德的爪牙）</b>。正義方要完成 3 個任務；邪惡方要讓 3 個任務失敗，或在最後刺殺梅林。</p>
    <h4>每一輪的流程</h4>
    <ol>
      <li><b>組隊：</b>隊長挑選指定人數的隊員（隊長可以選自己）。</li>
      <li><b>投票：</b>所有人同時投贊成或反對。<b>過半數贊成</b>才通過，平手算否決。否決時隊長交給下一位（順時針）。</li>
      <li><b>任務：</b>隊員秘密出牌。<b>正義方只能出「成功」</b>，邪惡方可以選擇成功或失敗。只要有 1 張失敗牌，任務就失敗（7 人以上的第 4 個任務需要 2 張）。</li>
    </ol>
    <p>同一輪<b>連續 5 次</b>隊伍被否決，邪惡方直接獲勝。</p>
    <h4>刺殺梅林</h4>
    <p>正義方完成 3 個任務後，邪惡方公開身分並討論，由刺客指認一位玩家。如果指認的是梅林，邪惡方逆轉獲勝。</p>
    <h4>角色</h4>
    <ul class="role-list">
      ${Object.entries(ROLES).map(([key, r]) => html`<li key=${key}><b class=${r.team}>${r.name}</b>：${ROLE_DESC[key]}</li>`)}
    </ul>
    <h4>擴充規則</h4>
    <p><b>湖中女神：</b>一開始交給首位隊長右手邊（座位順序的上一位）的玩家。第 2、3、4 個任務結束後，持有者查驗一位玩家的陣營（只有自己知道結果），然後把湖中女神交給被查驗的人。曾經持有過湖中女神的人不能被查驗。官方建議 7 人以上使用。</p>
    <p><b>指定任務：</b>隊長組隊時可以選擇要挑戰哪一個任務（出隊人數依該任務而定）。第 5 個任務必須先成功 2 個任務才能挑戰。</p>
    <h4>出任務人數</h4>
    <${QuestTable} n=${n} />
  </div>`;
}
