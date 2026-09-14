// 自製 SVG 插圖：中世紀亞瑟王風格的角色卡與標記（不使用官方卡圖）
import { ROLES } from './rules.js';

const INK = '#2b1d08';
const GOLD_STOPS = '<stop offset="0" stop-color="#f8e7ad"/><stop offset=".5" stop-color="#d6a84c"/><stop offset="1" stop-color="#8d6521"/>';
const cache = {};

// 角色徽記（畫在中心 100,118 的圓形徽章裡）；GOLD 會替換成金色漸層
const EMBLEMS = {
  merlin: `
    <path d="M60 152 Q86 138 98 70 Q103 58 118 60 Q107 72 111 92 Q121 128 142 152 Q100 166 60 152Z" fill="GOLD"/>
    <ellipse cx="100" cy="153" rx="48" ry="9" fill="GOLD"/>
    <g stroke="none" fill="#fff4cf">
      <path d="M89 112l3.2 6.6 7.2 1-5.2 5 1.2 7.2-6.4-3.4-6.4 3.4 1.2-7.2-5.2-5 7.2-1z"/>
      <path d="M114 96a9 9 0 1 0 7 13a7 7 0 1 1-7-13z"/>
      <path d="M58 86l2 5 5 2-5 2-2 5-2-5-5-2 5-2z M146 76l1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6z M150 124l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z"/>
    </g>`,
  percival: `
    <path d="M100 78 Q92 50 112 40 Q132 32 148 46 Q130 44 122 54 Q142 52 150 66 Q130 62 116 72 Q108 78 100 78Z" fill="#f1ead6"/>
    <path d="M68 162 V120 Q68 80 100 76 Q132 80 132 120 V162 Q100 172 68 162Z" fill="GOLD"/>
    <path d="M100 78 V166" fill="none" stroke-width="2"/>
    <rect x="75" y="112" width="50" height="7" rx="2" fill="#140d04"/>
    <rect x="75" y="125" width="50" height="5" rx="2" fill="#140d04"/>
    <g fill="#140d04" stroke="none"><circle cx="84" cy="146" r="2"/><circle cx="92" cy="150" r="2"/><circle cx="108" cy="150" r="2"/><circle cx="116" cy="146" r="2"/></g>`,
  servant: `
    <path d="M76 84 L80 60 L90 72 L100 54 L110 72 L120 60 L124 84Z" fill="GOLD"/>
    <path d="M64 88 H136 V124 Q136 158 100 176 Q64 158 64 124Z" fill="GOLD"/>
    <path d="M94 96 H106 V118 H126 V130 H106 V164 H94 V130 H74 V118 H94Z" fill="#23488c"/>`,
  assassin: `
    <g transform="rotate(-32 100 118)">
      <path d="M100 48 L109 68 V134 H91 V68Z" fill="#e9edf2"/>
      <path d="M100 58 V130" fill="none" stroke="#8d97a3" stroke-width="2"/>
      <rect x="72" y="134" width="56" height="10" rx="5" fill="GOLD"/>
      <rect x="94" y="144" width="12" height="26" rx="3" fill="#4a2e10"/>
      <circle cx="100" cy="176" r="8" fill="GOLD"/>
    </g>
    <path d="M136 132 Q146 148 146 155 a10 10 0 0 1-20 0 Q126 148 136 132Z" fill="#b3141c" stroke="#3a0508"/>`,
  morgana: `
    <path d="M122 60 A60 60 0 1 0 156 152 A49 49 0 1 1 122 60Z" fill="GOLD"/>
    <g stroke="none" fill="#f3d0ff">
      <path d="M128 100l3 6.5 7 1-5 5 1.2 7-6.2-3.3-6.2 3.3 1.2-7-5-5 7-1z"/>
      <path d="M144 80l1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6z"/>
      <path d="M150 140l1.4 3.4 3.4 1.4-3.4 1.4-1.4 3.4-1.4-3.4-3.4-1.4 3.4-1.4z"/>
    </g>
    <path d="M78 104 Q90 96 102 104 Q90 112 78 104Z" fill="#1a0610"/>
    <circle cx="90" cy="104" r="3" fill="#d58cff" stroke="none"/>`,
  mordred: `
    <path d="M60 116 L66 74 L84 96 L100 62 L116 96 L134 74 L140 116Z" fill="#26262c" stroke="GOLD" stroke-width="3"/>
    <rect x="58" y="114" width="84" height="16" rx="3" fill="GOLD"/>
    <g stroke="none" fill="#b3141c"><circle cx="78" cy="122" r="4"/><circle cx="100" cy="122" r="5"/><circle cx="122" cy="122" r="4"/></g>
    <path d="M95 134 H105 V152 L101 148 L97 156 L95 152Z" fill="#cfd5dc"/>
    <path d="M95 162 L99 158 L105 164 V170 L100 180 L95 170Z" fill="#cfd5dc"/>`,
  oberon: `
    <path d="M100 56 Q142 60 146 118 Q150 150 160 174 H40 Q50 150 54 118 Q58 60 100 56Z" fill="#3b3346" stroke="GOLD" stroke-width="2.5"/>
    <path d="M100 80 Q126 84 128 122 Q126 150 100 156 Q74 150 72 122 Q74 84 100 80Z" fill="#07050a"/>
    <g stroke="none">
      <ellipse cx="88" cy="118" rx="9" ry="6" fill="#9dff8a" opacity=".25"/><ellipse cx="112" cy="118" rx="9" ry="6" fill="#9dff8a" opacity=".25"/>
      <ellipse cx="88" cy="118" rx="5" ry="2.6" fill="#c9ffb8"/><ellipse cx="112" cy="118" rx="5" ry="2.6" fill="#c9ffb8"/>
    </g>`,
  minion: `
    <path d="M70 104 Q44 96 38 64 Q56 80 76 90Z" fill="#e9dfc6"/>
    <path d="M130 104 Q156 96 162 64 Q144 80 124 90Z" fill="#e9dfc6"/>
    <path d="M64 152 V116 Q64 82 100 80 Q136 82 136 116 V152 Q122 146 114 158 H86 Q78 146 64 152Z" fill="GOLD"/>
    <path d="M76 116 L96 123 V131 L76 126Z M124 116 L104 123 V131 L124 126Z" fill="#1a0404"/>
    <rect x="96.5" y="108" width="7" height="40" rx="2" fill="GOLD"/>`,
};

function corners(fill) {
  return [[11, 11], [189, 11], [11, 269], [189, 269]]
    .map(([x, y]) => `<path d="M0-7L7 0 0 7-7 0z" transform="translate(${x} ${y})" fill="${fill}" stroke="#5a3a0c"/>`)
    .join('');
}

function rays(color) {
  let out = '';
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8;
    const c = Math.cos(a);
    const s = Math.sin(a);
    out += `<line x1="${(100 + 70 * c).toFixed(1)}" y1="${(118 + 70 * s).toFixed(1)}" x2="${(100 + 94 * c).toFixed(1)}" y2="${(118 + 94 * s).toFixed(1)}"/>`;
  }
  return `<g opacity=".22" stroke="${color}" stroke-width="1.2">${out}</g>`;
}

export function roleSvg(role) {
  const info = ROLES[role];
  if (!info) return cardBackSvg();
  if (cache[role]) return cache[role];
  const good = info.team === 'good';
  const id = `c-${role}`;
  const [c1, c2] = good ? ['#2f579f', '#0a1531'] : ['#7f2222', '#1b0505'];
  const glow = good ? '#9cc3ff' : '#ff9a7a';
  const gold = `url(#${id}-gold)`;
  const nameSize = info.name.length > 5 ? 15 : 19;
  cache[role] = `<svg viewBox="0 0 200 280" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${info.name}">
<defs>
<radialGradient id="${id}-bg" cx="50%" cy="38%" r="80%"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient>
<radialGradient id="${id}-glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${glow}" stop-opacity=".5"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient>
<linearGradient id="${id}-gold" x1="0" y1="0" x2="0" y2="1">${GOLD_STOPS}</linearGradient>
</defs>
<rect x="2" y="2" width="196" height="276" rx="14" fill="url(#${id}-bg)" stroke="#8d6521" stroke-width="3"/>
<g fill="none" stroke="${gold}"><rect x="11" y="11" width="178" height="258" rx="9" stroke-width="2"/><rect x="17" y="17" width="166" height="246" rx="6" stroke-width="1" stroke-dasharray="2 5" opacity=".6"/></g>
${corners(gold)}
${rays(glow)}
<circle cx="100" cy="118" r="86" fill="url(#${id}-glow)"/>
<circle cx="100" cy="118" r="64" fill="rgba(0,0,0,.28)" stroke="${gold}" stroke-width="3"/>
<circle cx="100" cy="118" r="57" fill="none" stroke="${gold}" stroke-width="1" opacity=".5"/>
<g stroke="${INK}" stroke-width="1.4" stroke-linejoin="round">${EMBLEMS[role].replaceAll('GOLD', gold)}</g>
<path d="M24 214 L12 222 L18 248Z M176 214 L188 222 L182 248Z" fill="#cdb98a" stroke="#8d6521" stroke-width="1.5"/>
<path d="M24 214 Q100 200 176 214 L182 248 Q100 234 18 248Z" fill="#efe1bb" stroke="#8d6521" stroke-width="2"/>
<text x="100" y="${226 + nameSize / 2}" text-anchor="middle" font-size="${nameSize}" font-weight="700" fill="${INK}" font-family="'Noto Serif TC','Songti TC',serif">${info.name}</text>
<text x="100" y="262" text-anchor="middle" font-size="9.5" letter-spacing="2" fill="${good ? '#bcd3ff' : '#ffb8a8'}" font-family="'Noto Serif TC',serif">${good ? '正義・亞瑟的騎士' : '邪惡・莫德雷德的爪牙'}</text>
</svg>`;
  return cache[role];
}

// 只取卡片中間的圓形徽章（用在圓桌座位上）
export function roleBadgeSvg(role) {
  return roleSvg(role).replace('viewBox="0 0 200 280"', 'viewBox="34 52 132 132"');
}

export function cardBackSvg() {
  cache.back ||= `<svg viewBox="0 0 200 280" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="身分牌背面">
<defs>
<linearGradient id="bk-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c2748"/><stop offset=".7" stop-color="#0b1022"/><stop offset="1" stop-color="#05070e"/></linearGradient>
<linearGradient id="bk-gold" x1="0" y1="0" x2="0" y2="1">${GOLD_STOPS}</linearGradient>
<linearGradient id="bk-lake" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d3c63"/><stop offset="1" stop-color="#081322"/></linearGradient>
</defs>
<rect x="2" y="2" width="196" height="276" rx="14" fill="url(#bk-bg)" stroke="#8d6521" stroke-width="3"/>
<rect x="11" y="11" width="178" height="258" rx="9" fill="none" stroke="url(#bk-gold)" stroke-width="2"/>
${corners('url(#bk-gold)')}
<g fill="#f3e6c4"><circle cx="40" cy="44" r="1.3"/><circle cx="70" cy="30" r="1"/><circle cx="96" cy="52" r="1.4"/><circle cx="165" cy="100" r="1"/><circle cx="30" cy="96" r="1.1"/><circle cx="58" cy="70" r=".9"/><circle cx="170" cy="34" r="1.2"/><circle cx="110" cy="28" r=".9"/></g>
<circle cx="140" cy="62" r="17" fill="#f3e6c4"/><circle cx="133" cy="57" r="15" fill="#18223f"/>
<path d="M36 196 V150 H46 V140 H52 V146 H58 V140 H64 V150 H70 V116 H66 V104 H72 V110 H78 V104 H84 V110 H90 V104 H94 V116 H90 V150 H94 V122 L100 88 L106 122 V150 H110 V116 H106 V104 H112 V110 H118 V104 H124 V110 H130 V104 H134 V116 H130 V150 H136 V140 H142 V146 H148 V140 H154 V150 H164 V196Z" fill="#070a14" stroke="url(#bk-gold)" stroke-width="1.2" stroke-opacity=".75"/>
<g fill="#f3c969"><rect x="78" y="124" width="4" height="8" rx="2"/><rect x="118" y="124" width="4" height="8" rx="2"/><rect x="98" y="128" width="4" height="10" rx="2"/><rect x="48" y="160" width="4" height="6" rx="2"/><rect x="148" y="160" width="4" height="6" rx="2"/></g>
<path d="M92 196 V184 Q100 174 108 184 V196Z" fill="#f3c969" opacity=".55"/>
<rect x="13" y="196" width="174" height="50" fill="url(#bk-lake)"/>
<g stroke="url(#bk-gold)" stroke-opacity=".35" fill="none"><path d="M24 206 q10 -4 20 0 t20 0"/><path d="M110 214 q10 -4 20 0 t20 0 t20 0"/><path d="M40 226 q10 -4 20 0 t20 0 t20 0"/></g>
<text x="100" y="262" text-anchor="middle" font-family="Cinzel,'Noto Serif TC',serif" font-size="20" letter-spacing="5" fill="url(#bk-gold)" font-weight="800">AVALON</text>
</svg>`;
  return cache.back;
}

const CHALICE = 'M18 14 H46 Q46 34 34 38 V48 H42 V54 H22 V48 H30 V38 Q18 34 18 14Z';
const DAGGER = '<path d="M32 6 L37 16 V38 H27 V16Z" fill="#e9edf2" stroke="#3a3f48" stroke-width="1.5"/><rect x="19" y="38" width="26" height="5" rx="2.5" fill="#d6a84c" stroke="#5a3a0c"/><rect x="29" y="43" width="6" height="10" rx="1.5" fill="#4a2e10"/><circle cx="32" cy="56" r="3.5" fill="#d6a84c" stroke="#5a3a0c"/>';

function questCard(success) {
  const [a, b] = success ? ['#2f579f', '#0a1531'] : ['#8a2222', '#1b0505'];
  const id = success ? 'qc-s' : 'qc-f';
  const emblem = success
    ? `<path d="${CHALICE}" transform="translate(18 30) scale(1)" fill="url(#${id}-g)" stroke="#3a2708" stroke-width="1.5"/>`
    : `<g transform="translate(18 26)">${DAGGER}</g>`;
  return `<svg viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${success ? '成功' : '失敗'}">
<defs><linearGradient id="${id}-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient><linearGradient id="${id}-g" x1="0" y1="0" x2="0" y2="1">${GOLD_STOPS}</linearGradient></defs>
<rect x="2" y="2" width="96" height="136" rx="10" fill="url(#${id}-bg)" stroke="#8d6521" stroke-width="3"/>
<rect x="8" y="8" width="84" height="124" rx="6" fill="none" stroke="url(#${id}-g)" stroke-width="1.5"/>
<circle cx="50" cy="62" r="34" fill="rgba(0,0,0,.25)" stroke="url(#${id}-g)" stroke-width="2"/>
${emblem}
<text x="50" y="120" text-anchor="middle" font-size="17" font-weight="900" fill="${success ? '#dfeaff' : '#ffd6cc'}" font-family="'Noto Serif TC',serif">${success ? '成功' : '失敗'}</text>
</svg>`;
}

export const TOKENS = {
  crown: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="tk-crown" x1="0" y1="0" x2="0" y2="1">${GOLD_STOPS}</linearGradient></defs><path d="M8 44 L11 18 L23 32 L32 12 L41 32 L53 18 L56 44Z" fill="url(#tk-crown)" stroke="#5a3a0c" stroke-width="3" stroke-linejoin="round"/><rect x="8" y="44" width="48" height="9" rx="2" fill="url(#tk-crown)" stroke="#5a3a0c" stroke-width="3"/><circle cx="32" cy="48.5" r="3" fill="#c0262d"/></svg>`,
  lady: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="32" r="29" fill="#0f2b4a" stroke="#d6a84c" stroke-width="3"/><path d="M30 6 H34 V36 H30Z" fill="#e8edf3" stroke="#5b6570"/><rect x="22" y="34" width="20" height="4" rx="2" fill="#d6a84c"/><path d="M26 38 H38 V46 Q38 52 32 54 Q26 52 26 46Z" fill="#efdcc0" stroke="#7a5a3a"/><path d="M5 48 Q11 43 18 48 T32 48 T46 48 T59 48 V52 Q32 66 5 52Z" fill="#3a7cc4"/></svg>`,
  shield: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path d="M10 8 H54 V30 Q54 50 32 60 Q10 50 10 30Z" fill="#d6a84c" stroke="#5a3a0c" stroke-width="3"/><path d="M28 14 H36 V28 H48 V36 H36 V52 H28 V36 H16 V28 H28Z" fill="#23488c"/></svg>`,
  approve: '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="32" r="29" fill="#d9b35a" stroke="#6b4a12" stroke-width="3"/><circle cx="32" cy="32" r="22" fill="none" stroke="#6b4a12" stroke-width="1.5" stroke-dasharray="3 3"/><path d="M19 33 L28 42 L46 22" fill="none" stroke="#3a2708" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  reject: '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="32" r="29" fill="#3a3f4a" stroke="#141820" stroke-width="3"/><circle cx="32" cy="32" r="22" fill="none" stroke="#9aa3b2" stroke-width="1.5" stroke-dasharray="3 3"/><path d="M22 22 L42 42 M42 22 L22 42" stroke="#e7ebf2" stroke-width="6" stroke-linecap="round"/></svg>',
  success: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="32" r="30" fill="#2a5298" stroke="#d6a84c" stroke-width="3"/><path d="${CHALICE}" fill="#f1d58a" stroke="#3a2708" stroke-width="1.5"/></svg>`,
  fail: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="32" r="30" fill="#8c1d1d" stroke="#d6a84c" stroke-width="3"/>${DAGGER}</svg>`,
  book: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="tk-book" x1="0" y1="0" x2="0" y2="1">${GOLD_STOPS}</linearGradient></defs><path d="M6 16 Q19 9 32 16 V56 Q19 49 6 55Z" fill="#f3e6c4" stroke="#5a3a0c" stroke-width="2.5" stroke-linejoin="round"/><path d="M58 16 Q45 9 32 16 V56 Q45 49 58 55Z" fill="#e6d3a2" stroke="#5a3a0c" stroke-width="2.5" stroke-linejoin="round"/><g fill="none" stroke="#8d6521" stroke-width="1.8" stroke-linecap="round" opacity=".8"><path d="M11 25 Q19 21 27 25 M11 32 Q19 28 27 32 M11 39 Q19 35 27 39 M37 25 Q45 21 53 25 M37 32 Q45 28 53 32 M37 39 Q45 35 53 39"/></g><path d="M40 4 H48 V22 L44 18 L40 22Z" fill="#b3141c" stroke="#5a0a0a" stroke-width="1.2"/><circle cx="32" cy="16" r="3" fill="url(#tk-book)" stroke="#5a3a0c"/></svg>`,
  successCard: questCard(true),
  failCard: questCard(false),
};
