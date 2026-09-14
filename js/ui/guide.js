// 新手教學：角落的書本按鈕，隨時查看「現在該做什麼」、新手教學、角色介紹與完整規則
import { html, useState, useEffect } from '../vendor/preact-htm.js';
import { ROLES, QUEST_SIZES } from '../rules.js';
import { toArray, availableQuests } from '../game.js';
import { nameOf } from '../room.js';
import { roleSvg, cardBackSvg, TOKENS } from '../art.js';
import { Art, Modal, store, ROLE_DESC } from './common.js';
import { RulesView } from './panels.js';

const SEEN_KEY = 'avalon.guideSeen';

// 從任何畫面打開說明書：openGuide('now' | 'tutorial' | 'roles' | 'rules')
export function openGuide(tab) {
  dispatchEvent(new CustomEvent('avalon:guide', { detail: { tab } }));
}

export const ROLE_TIPS = {
  merlin: '你知道誰是壞人，但刺客一直在找你。不要每次都精準反對壞人的隊伍，用暗示引導大家，偶爾也要讓步。',
  percival: '你看到的人之中可能混著莫甘娜，觀察兩人的發言來分辨。必要時可以假裝自己是梅林，替梅林擋刀。',
  servant: '多看投票紀錄：誰贊成了後來失敗的隊伍？誰的說法前後矛盾？勇敢說出你的推理。',
  assassin: '整局都要觀察誰像梅林：誰總是知道哪支隊伍有問題？任務時你也可以出失敗牌。',
  morgana: '假裝自己是梅林，讓派西維爾搞混。偶爾給出「看起來很準」的建議來取得信任。',
  mordred: '梅林看不到你，你可以大膽表現得像好人，爭取加入隊伍。',
  oberon: '你是壞人但不認識同伴。出失敗牌要小心，可能和其他壞人同時出而暴露。',
  minion: '和同伴配合混進隊伍，在關鍵時刻出失敗牌，並把懷疑引到好人身上。',
};

export function GuideButton({ s = null, uid = null }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(null);
  const [seen, setSeen] = useState(() => !!store.get(SEEN_KEY, false));
  // 新手提示只在首頁與大廳出現，15 秒後自動收起，避免遊戲中擋住按鈕（書本按鈕仍會閃爍提醒）
  const [hintOn, setHintOn] = useState(true);
  const hintAllowed = !s || s.meta?.status === 'lobby';
  useEffect(() => {
    const t = setTimeout(() => setHintOn(false), 15000);
    return () => clearTimeout(t);
  }, []);

  const show = (wanted) => {
    setTab(wanted || (!seen || !s ? 'tutorial' : 'now'));
    setOpen(true);
    if (!seen) {
      setSeen(true);
      store.set(SEEN_KEY, true);
    }
  };
  useEffect(() => {
    const onOpen = (e) => show(e.detail?.tab);
    addEventListener('avalon:guide', onOpen);
    return () => removeEventListener('avalon:guide', onOpen);
  });

  return html`
    <button type="button" class=${`guide-fab${seen ? '' : ' pulse'}`} onClick=${() => show()}
      aria-label="教學與說明" title="教學與說明" data-testid="guide-button">
      <${Art} svg=${TOKENS.book} />
    </button>
    ${!seen && !open && hintOn && hintAllowed && html`<button type="button" class="guide-hint" onClick=${() => show('tutorial')}>第一次玩？點這本書看教學</button>`}
    ${open && html`<${GuideModal} s=${s} uid=${uid} initialTab=${tab} onClose=${() => setOpen(false)} />`}`;
}

const TABS = [['now', '現在該做什麼'], ['tutorial', '新手教學'], ['roles', '角色介紹'], ['rules', '完整規則']];

function GuideModal({ s, uid, initialTab, onClose }) {
  const tabs = s ? TABS : TABS.filter(([k]) => k !== 'now');
  const [tab, setTab] = useState(tabs.some(([k]) => k === initialTab) ? initialTab : 'tutorial');
  const n = toArray(s?.pub?.order).length || Object.keys(s?.players || {}).length;
  return html`<${Modal} title="📖 冒險者手冊" wide onClose=${onClose}>
    <div class="guide-tabs" role="tablist">
      ${tabs.map(([k, label]) => html`<button type="button" role="tab" key=${k} aria-selected=${tab === k}
        class=${`guide-tab${tab === k ? ' on' : ''}`} onClick=${() => setTab(k)}>${label}</button>`)}
    </div>
    ${tab === 'now' && html`<${NowHelp} s=${s} uid=${uid} goTutorial=${() => setTab('tutorial')} />`}
    ${tab === 'tutorial' && html`<${Tutorial} onDone=${onClose} />`}
    ${tab === 'roles' && html`<${RolesGuide} s=${s} />`}
    ${tab === 'rules' && html`<${RulesView} n=${n} />`}
  <//>`;
}

const STEPS = [
  {
    title: '遊戲目標',
    art: html`<div class="guide-art"><${Art} svg=${roleSvg('servant')} /><${Art} svg=${roleSvg('minion')} /></div>`,
    body: html`
      <p>每個人會秘密拿到一張身分牌，分成<b class="good">正義方</b>和<b class="evil">邪惡方</b>。</p>
      <ul>
        <li><b class="good">正義方</b>：完成 <b>3 個任務</b>就獲勝。</li>
        <li><b class="evil">邪惡方</b>：讓 <b>3 個任務失敗</b>就獲勝。</li>
      </ul>
      <p>邪惡方人數比較少，但他們<b>互相認識</b>。正義方不知道誰是壞人，要靠觀察投票和語音討論把他們找出來。</p>`,
  },
  {
    title: '第一步：查看身分',
    art: html`<div class="guide-art"><${Art} svg=${cardBackSvg()} /></div>`,
    body: html`
      <p>遊戲開始時，<b>點擊身分牌翻開</b>。記得別讓旁邊的人看到你的螢幕！</p>
      <p>有些角色會看到額外情報，例如<b>梅林</b>會看到大部分的壞人、<b>邪惡方</b>會看到彼此。這些人在圓桌上會有紅色或紫色的小標籤，只有你看得到。</p>
      <p>看完按<b>「我已確認身分」</b>。之後隨時可以點上方<b>「我的身分」</b>再看一次。</p>`,
  },
  {
    title: '第二步：隊長組隊',
    art: html`<div class="guide-art tokens"><${Art} svg=${TOKENS.crown} /><${Art} svg=${TOKENS.shield} /></div>`,
    body: html`
      <p>頭上有<b>👑 皇冠</b>的是隊長，每次提案後會<b>順時針</b>換下一位。</p>
      <p>隊長要選出指定人數的隊員，人數就寫在上方的<b>任務圓圈</b>裡（隊長可以選自己）。在圓桌上點玩家，選好後按<b>「提出隊伍」</b>。</p>
      <p>不是隊長的人：在語音裡告訴隊長你信任誰、懷疑誰。</p>`,
  },
  {
    title: '第三步：全員投票',
    art: html`<div class="guide-art tokens"><${Art} svg=${TOKENS.approve} /><${Art} svg=${TOKENS.reject} /></div>`,
    body: html`
      <p>所有人對隊長提出的隊伍投<b>贊成</b>或<b>反對</b>，<b>超過一半贊成</b>才通過（平手算否決）。</p>
      <p>全員投完後才會<b>同時公開每個人的票</b>，大家都看得到誰投了什麼，這是找出壞人的重要線索。</p>
      <p>被否決就換下一位隊長重新組隊。<b>同一輪連續 5 次否決，邪惡方直接獲勝</b>（看任務圓圈下方的否決計數）。</p>`,
  },
  {
    title: '第四步：執行任務',
    art: html`<div class="guide-art"><${Art} svg=${TOKENS.successCard} /><${Art} svg=${TOKENS.failCard} /></div>`,
    body: html`
      <p>隊伍通過後，<b>只有隊員</b>要秘密出一張任務牌：</p>
      <ul>
        <li><b class="good">正義方只能出「成功」</b>（系統會鎖住失敗牌）。</li>
        <li><b class="evil">邪惡方</b>可以選「成功」或「失敗」。</li>
      </ul>
      <p>只要有 <b>1 張失敗牌</b>任務就失敗。7 人以上的第 4 個任務需要 <b>2 張</b>，任務圓圈上會標示「需2敗」。</p>
      <p>結果只公開失敗牌的<b>張數</b>，不會知道是誰出的。</p>`,
  },
  {
    title: '擴充規則：湖中女神',
    art: html`<div class="guide-art tokens"><${Art} svg=${TOKENS.lady} /></div>`,
    body: html`
      <p>如果房主開啟了湖中女神：第 2、3、4 個任務結束後，持有者可以<b>秘密查看一位玩家是正義還是邪惡</b>。</p>
      <p>結果只有持有者看得到，他可以向大家公布，<b>也可以說謊</b>。查驗後湖中女神會交給被查驗的人；曾經拿過的人不能再被查驗。</p>`,
  },
  {
    title: '最後的機會：刺殺梅林',
    art: html`<div class="guide-art"><${Art} svg=${roleSvg('assassin')} /><${Art} svg=${roleSvg('merlin')} /></div>`,
    body: html`
      <p>就算正義方完成了 3 個任務，遊戲還沒結束！邪惡方會公開陣營，由<b>刺客指認誰是梅林</b>。</p>
      <p>猜中的話<b class="evil">邪惡方逆轉獲勝</b>。所以梅林要偷偷引導好人，但不能表現得太明顯。</p>`,
  },
  {
    title: '操作小提示',
    art: html`<div class="guide-art"><${Art} svg=${roleSvg('percival')} /></div>`,
    body: html`
      <ul>
        <li>輪到你行動時，右側（手機在下方）的<b>行動面板會發光</b>，並跳出「輪到你了！」。</li>
        <li>所有重要選擇都會<b>再確認一次</b>，投票和出牌送出後不能更改。</li>
        <li>倒數時間到<b>只會提醒</b>，不會替你自動做決定。</li>
        <li><b>「紀錄」</b>可以回顧每次提案的隊長、隊員和每個人的票。</li>
        <li>不小心關掉網頁？用同一台裝置重新打開，會<b>自動回到座位</b>。</li>
        <li>卡住了隨時點右下角的<b>📖 書本</b>，看「現在該做什麼」。</li>
      </ul>`,
  },
];

function Tutorial({ onDone }) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') setI((x) => Math.min(STEPS.length - 1, x + 1));
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1));
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
  return html`<div class="tutorial">
    <div class="tutorial-step" key=${i}>
      ${step.art}
      <div>
        <div class="step-count">第 ${i + 1}／${STEPS.length} 步</div>
        <h3 class="now-title">${step.title}</h3>
        ${step.body}
      </div>
    </div>
    <div class="tutorial-nav">
      <button type="button" class="btn btn-ghost" disabled=${i === 0} onClick=${() => setI(i - 1)}>‹ 上一步</button>
      <div class="dots">${STEPS.map((_, k) => html`<button type="button" key=${k} class=${`dot-btn${k === i ? ' on' : ''}`}
        aria-label=${`第 ${k + 1} 步`} onClick=${() => setI(k)}></button>`)}</div>
      ${last
        ? html`<button type="button" class="btn btn-gold" onClick=${onDone}>開始冒險！</button>`
        : html`<button type="button" class="btn btn-gold" onClick=${() => setI(i + 1)} data-testid="tutorial-next">下一步 ›</button>`}
    </div>
  </div>`;
}

function nowContent(s, uid) {
  const status = s.meta?.status;
  const p = s.pub;
  const my = s.secret || {};
  const isHost = s.meta?.hostUid === uid;
  const name = (u) => nameOf(s, u);

  if (status === 'lobby') {
    return isHost
      ? {
        title: '你是房主：準備開局',
        steps: [
          '按上方「複製邀請連結」，貼到 Discord／LINE 給朋友。',
          '等 5～10 人到齊，用 ▲▼ 依照語音頻道的順序排座位（順時針）。',
          '勾選要使用的角色。第一次玩建議只勾「梅林＋刺客」，熟悉後再加入派西維爾和莫甘娜。',
          '按最下方的「開始遊戲」。',
        ],
        tip: '大家都是新手的話，先一起看「新手教學」分頁，3 分鐘就能上手。',
      }
      : {
        title: '在大廳等待開局',
        steps: [
          '確認自己的暱稱正確（名字旁的 ✎ 可以改名）。',
          '右邊可以看到房主設定的角色和規則。',
          '等房主按「開始遊戲」。',
        ],
        tip: '第一次玩？趁等待時先看「新手教學」分頁。',
      };
  }
  if (!p) return { title: '載入中…', steps: [] };

  const team = Object.keys(p.team || {});
  switch (p.phase) {
    case 'night':
      return {
        title: '確認你的身分',
        steps: ['點擊身分牌翻開（別讓旁人看到螢幕）。', '閱讀角色說明，以及「你看到的玩家」。', '按「我已確認身分」，等所有人確認完。'],
        tip: '圓桌上只有你看得到的紅色「邪惡」或紫色「梅林」標籤，是你角色得到的情報。',
      };
    case 'team': {
      if (p.leader === uid) {
        const targeting = !!p.settings?.targeting;
        const q = targeting ? s.draft?.quest : availableQuests(p.quests, false)[0];
        const need = q != null ? QUEST_SIZES[toArray(p.order).length][q] : '指定';
        return {
          title: '👑 你是隊長！',
          steps: [
            targeting && '先在面板上選擇要挑戰哪一個任務。',
            `在圓桌或名字清單點選 ${need} 位隊員（可以選自己）。`,
            '在語音中說明你為什麼這樣選。',
            '按「提出隊伍」並確認，接著大家會投票。',
          ].filter(Boolean),
          tip: my.team === 'evil' ? '邪惡方隊長：放一個同伴進隊伍，但別讓隊伍看起來太可疑。' : '正義方隊長：選你最信任的人，第 1 個任務資訊少，選誰都很正常。',
        };
      }
      return {
        title: `等待隊長 ${name(p.leader)} 組隊`,
        steps: ['在語音裡建議隊長該選誰、不該選誰。', '面板上可以即時看到隊長目前選了誰。', '留意隊長選人的理由，這是找出壞人的線索。'],
      };
    }
    case 'vote':
      return {
        title: s.voted?.[uid] ? '你已投票，等待其他人' : '投票：贊成或反對這支隊伍',
        steps: ['想想隊伍裡有沒有你懷疑的人。', '點「贊成」或「反對」，再按下方確認（送出後不能改）。', '全員投完會公開每個人的票，記下誰投了什麼。'],
        tip: my.team === 'evil' ? '邪惡方：隊伍裡有同伴可以投贊成，但每次都這樣會被發現。' : '正義方：只要覺得有一個人可疑，就可以投反對。第 5 次提案時要小心，否決就輸了！',
      };
    case 'quest':
      if (team.includes(uid)) {
        return {
          title: '你在隊伍中：出任務牌',
          steps: my.team === 'good'
            ? ['正義方只能出「成功」。', '點「成功」，再按確認。']
            : ['邪惡方可以出「成功」或「失敗」。', '出失敗能讓任務失敗，但隊員都會被懷疑，想清楚時機。', '選好後按確認。'],
        };
      }
      return { title: '等待隊員出牌', steps: ['結果只會公開失敗牌的張數。', '如果任務失敗，想想隊伍裡誰最可疑？投贊成的人又是誰？'] };
    case 'lady':
      return p.lady?.holder === uid
        ? { title: '你持有湖中女神', steps: ['選一位玩家查驗陣營（曾持有過的人不能選）。', '結果只有你看得到。', '你可以在語音中公布結果，也可以說謊。'] }
        : { title: `${name(p.lady?.holder)} 正在使用湖中女神`, steps: ['等持有者公布結果，但他有可能說謊。', '被查驗的人接著會拿到湖中女神。'] };
    case 'assassin':
      if (my.role === 'assassin') {
        return { title: '🗡️ 你是刺客：找出梅林', steps: ['和邪惡同伴在語音中討論誰最像梅林。', '回想：誰總是精準反對有壞人的隊伍？', '點選目標並確認，只有一次機會！'] };
      }
      return my.team === 'evil'
        ? { title: '協助刺客找出梅林', steps: ['在語音中分享你覺得誰像梅林。', '最後由刺客決定。'] }
        : { title: '刺客正在找梅林', steps: ['邪惡方已公開陣營，現在由刺客指認。', '梅林：保持冷靜，別露出破綻！'] };
    case 'end':
      return {
        title: '遊戲結束',
        steps: ['圓桌和面板會公開所有人的真實身分。', '點「查看完整紀錄」回顧每次投票，找出關鍵時刻。', isHost ? '按「再來一局」讓大家回到大廳。' : '等房主開始下一局。'],
      };
    default:
      return { title: '', steps: [] };
  }
}

function NowHelp({ s, uid, goTutorial }) {
  const { title, steps, tip } = nowContent(s, uid);
  const role = s.meta?.status !== 'lobby' ? s.secret?.role : null;
  return html`<div class="now-help">
    <h3 class="now-title">${title}</h3>
    <ol class="now-steps">${steps.map((t, i) => html`<li key=${i}>${t}</li>`)}</ol>
    ${tip && html`<div class="notice tip">💡 ${tip}</div>`}
    ${role && html`<details class="now-role">
      <summary>我的角色小技巧（點開前注意別讓人看到螢幕）</summary>
      <div class="now-role-body">
        <${Art} svg=${roleSvg(role)} class="now-role-card" />
        <div><b class=${ROLES[role].team}>${ROLES[role].name}</b><p class="small">${ROLE_TIPS[role]}</p></div>
      </div>
    </details>`}
    <button type="button" class="link-btn" onClick=${goTutorial}>看完整新手教學 ›</button>
  </div>`;
}

function RolesGuide({ s }) {
  const counts = s?.pub?.roleCounts;
  return html`<div class="roles-guide">
    ${Object.keys(ROLES).map((r) => html`<div class=${`rg-item ${ROLES[r].team}`} key=${r}>
      <${Art} svg=${roleSvg(r)} class="rg-card" />
      <div>
        <b class=${ROLES[r].team}>${ROLES[r].name}</b>
        ${counts?.[r] ? html` <span class="tag gold">本局 ×${counts[r]}</span>` : ''}
        <p class="small">${ROLE_DESC[r]}</p>
        <p class="small muted">💡 ${ROLE_TIPS[r]}</p>
      </div>
    </div>`)}
  </div>`;
}
