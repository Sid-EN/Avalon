// 安全規則測試：在 Firebase 模擬器上逐條驗證「誰能讀、誰能寫」
// 執行：npm run test:emulator（會自動啟動模擬器）
import { test, before, after, beforeEach, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';

const C = 'ABCD';
const TS = { '.sv': 'timestamp' };
const DAY = 86_400_000;
let env;

const dbAs = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).database();
const at = (uid, path) => dbAs(uid).ref(`rooms/${C}/${path}`);
const multi = (uid, patch) => dbAs(uid).ref(`rooms/${C}`).update(patch);

// 5 人房間：host(忠臣) merlin assassin percival minion
function baseRoom() {
  const t = Date.now();
  const uids = ['host', 'merlin', 'assassin', 'percival', 'minion'];
  return {
    meta: { hostUid: 'host', createdAt: t, lastActive: t, status: 'playing' },
    players: Object.fromEntries(uids.map((u, i) => [u, { name: u, joinedAt: i + 1 }])),
    presence: Object.fromEntries(uids.map((u) => [u, { at: t, conns: { c1: true } }])),
    settings: { lady: true },
    pub: {
      phase: 'vote', voteId: 'v1', runId: 'q1', round: 1, attempt: 1, leader: 'merlin',
      seat: Object.fromEntries(uids.map((u, i) => [u, i])),
      team: { merlin: true, assassin: true },
      lady: { holder: 'percival', used: { percival: true } },
    },
    log: { l1: { t, text: '遊戲開始' } },
    secret: {
      host: { role: 'servant', team: 'good' },
      merlin: { role: 'merlin', team: 'good', sees: { assassin: 'evil', minion: 'evil' } },
      assassin: { role: 'assassin', team: 'evil', sees: { minion: 'evil' } },
      percival: { role: 'percival', team: 'good', sees: { merlin: 'merlin' } },
      minion: { role: 'minion', team: 'evil', sees: { assassin: 'evil' } },
    },
    hostSecret: { roles: { host: 'servant', merlin: 'merlin', assassin: 'assassin', percival: 'percival', minion: 'minion' } },
    votes: { v1: { host: true } },
    voted: { v1: { host: true } },
    cards: { q1: { merlin: 'S' } },
    played: { q1: { merlin: true } },
  };
}

async function seed(patch = {}, { indexValue } = {}) {
  const room = baseRoom();
  for (const [path, value] of Object.entries(patch)) {
    const parts = path.split('/');
    let node = room;
    for (const key of parts.slice(0, -1)) node = node[key] ??= {};
    if (value === undefined) delete node[parts.at(-1)];
    else node[parts.at(-1)] = value;
  }
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.database().ref(`rooms/${C}`).set(room);
    await ctx.database().ref(`roomIndex/${C}`).set(indexValue ?? room.meta.createdAt);
  });
}

before(async () => {
  const [host, port] = (process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-avalon-rules',
    database: { host, port: Number(port), rules: readFileSync(new URL('../../database.rules.json', import.meta.url), 'utf8') },
  });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearDatabase(); });

describe('讀取權限：看不到不該看的資訊', () => {
  test('沒有登入的人什麼都讀不到', async () => {
    await seed();
    await assertFails(at(null, 'meta').get());
    await assertFails(at(null, 'pub').get());
  });
  test('玩家可以讀公開資料與自己的身分', async () => {
    await seed();
    await assertSucceeds(at('merlin', 'pub').get());
    await assertSucceeds(at('merlin', 'players').get());
    await assertSucceeds(at('merlin', 'log').get());
    await assertSucceeds(at('merlin', 'presence').get());
    await assertSucceeds(at('merlin', 'secret/merlin').get());
  });
  test('玩家讀不到別人的身分、全部身分、房主的身分表', async () => {
    await seed();
    await assertFails(at('merlin', 'secret/assassin').get());
    await assertFails(at('assassin', 'secret/merlin').get());
    await assertFails(at('merlin', 'secret').get());
    await assertFails(at('merlin', 'hostSecret').get());
    await assertFails(dbAs('merlin').ref(`rooms/${C}`).get());
  });
  test('玩家讀不到其他人的選票與任務牌', async () => {
    await seed();
    await assertFails(at('merlin', 'votes/v1').get());
    await assertFails(at('merlin', 'votes/v1/host').get());
    await assertSucceeds(at('host', 'votes/v1/host').get());
    await assertFails(at('assassin', 'cards/q1').get());
    await assertFails(at('assassin', 'cards/q1/merlin').get());
    await assertSucceeds(at('merlin', 'voted/v1').get());
  });
  test('房主可以讀全部（已知限制）', async () => {
    await seed();
    await assertSucceeds(at('host', 'hostSecret').get());
    await assertSucceeds(at('host', 'secret/merlin').get());
    await assertSucceeds(at('host', 'votes/v1').get());
    await assertSucceeds(at('host', 'cards/q1').get());
  });
});

describe('房間外的人：只能看到房間是否存在', () => {
  test('不在房內的人讀不到玩家、公開狀態、日誌、上線狀態', async () => {
    await seed();
    await assertSucceeds(at('stranger', 'meta').get());
    for (const path of ['players', 'pub', 'log', 'hist', 'presence', 'settings', 'voted/v1', 'draft', 'ladyPick']) {
      await assertFails(at('stranger', path).get());
    }
  });
  test('加入前可以讀自己的玩家資料與是否被移出（用來判斷能不能加入）', async () => {
    await seed({ 'kicked/bad': true });
    await assertSucceeds(at('stranger', 'players/stranger').get());
    await assertSucceeds(at('bad', 'kicked/bad').get());
    await assertFails(at('bad', 'kicked/other').get());
  });
  test('被移出後就讀不到房間內容', async () => {
    await seed({ 'players/minion': undefined, 'kicked/minion': true });
    await assertFails(at('minion', 'pub').get());
    await assertSucceeds(at('minion', 'kicked/minion').get());
  });
});

describe('寫入權限：只有房主能推進遊戲', () => {
  test('一般玩家不能改公開狀態、紀錄、設定、身分', async () => {
    await seed();
    await assertFails(at('merlin', 'pub/phase').set('end'));
    await assertFails(at('merlin', 'pub/winner').set('good'));
    await assertFails(at('merlin', 'log/x').set({ text: 'hack' }));
    await assertFails(at('merlin', 'hist/x').set({ approved: true }));
    await assertFails(at('merlin', 'settings/lady').set(false));
    await assertFails(at('merlin', 'secret/merlin/role').set('assassin'));
    await assertFails(at('assassin', 'hostSecret/roles/merlin').set('servant'));
    await assertFails(at('merlin', 'meta/status').set('lobby'));
  });
  test('房主可以推進遊戲', async () => {
    await seed();
    await assertSucceeds(at('host', 'pub/phase').set('quest'));
    await assertSucceeds(at('host', 'meta/status').set('ended'));
  });
  test('遊戲狀態只能是 lobby／playing／ended', async () => {
    await seed();
    await assertFails(at('host', 'meta/status').set('hacked'));
  });
  test('房內玩家可以更新最後活動時間，房外的人不行，也不能寫未來時間', async () => {
    await seed();
    await assertSucceeds(at('merlin', 'meta/lastActive').set(TS));
    await assertFails(at('stranger', 'meta/lastActive').set(TS));
    await assertFails(at('merlin', 'meta/lastActive').set(Date.now() + DAY));
  });
});

describe('投票', () => {
  test('玩家可以在投票階段投自己的一票（同時寫入選票與已投票標記）', async () => {
    await seed();
    await assertSucceeds(multi('merlin', { 'votes/v1/merlin': false, 'voted/v1/merlin': true }));
  });
  test('每人只能投一次，投完不能改', async () => {
    await seed();
    await assertSucceeds(multi('merlin', { 'votes/v1/merlin': false, 'voted/v1/merlin': true }));
    await assertFails(multi('merlin', { 'votes/v1/merlin': true, 'voted/v1/merlin': true }));
  });
  test('選票與已投票標記必須一起寫入（避免卡住）', async () => {
    await seed();
    await assertFails(at('merlin', 'voted/v1/merlin').set(true));
    await assertFails(at('merlin', 'votes/v1/merlin').set(true));
  });
  test('不能替別人投票', async () => {
    await seed();
    await assertFails(multi('merlin', { 'votes/v1/assassin': true, 'voted/v1/assassin': true }));
  });
  test('投票編號、階段、座位不符都不能投', async () => {
    await seed();
    await assertFails(multi('merlin', { 'votes/v0/merlin': true, 'voted/v0/merlin': true }));
    await assertFails(multi('stranger', { 'votes/v1/stranger': true, 'voted/v1/stranger': true }));
    await seed({ 'pub/phase': 'team' });
    await assertFails(multi('merlin', { 'votes/v1/merlin': true, 'voted/v1/merlin': true }));
  });
  test('選票只能是贊成或反對', async () => {
    await seed();
    await assertFails(multi('merlin', { 'votes/v1/merlin': 'yes', 'voted/v1/merlin': true }));
  });
});

describe('任務牌', () => {
  const quest = { 'pub/phase': 'quest', 'pub/team': { merlin: true, assassin: true, percival: true }, cards: undefined, played: undefined };
  test('好人只能出成功牌（開發者工具也改不了）', async () => {
    await seed(quest);
    await assertFails(multi('merlin', { 'cards/q1/merlin': 'F', 'played/q1/merlin': true }));
    await assertSucceeds(multi('merlin', { 'cards/q1/merlin': 'S', 'played/q1/merlin': true }));
  });
  test('邪惡方可以出失敗牌', async () => {
    await seed(quest);
    await assertSucceeds(multi('assassin', { 'cards/q1/assassin': 'F', 'played/q1/assassin': true }));
  });
  test('不在隊伍中的人不能出牌', async () => {
    await seed(quest);
    await assertFails(multi('minion', { 'cards/q1/minion': 'F', 'played/q1/minion': true }));
  });
  test('只能出一次、不能替別人出、牌與已出牌標記必須一起寫入', async () => {
    await seed(quest);
    await assertSucceeds(multi('assassin', { 'cards/q1/assassin': 'S', 'played/q1/assassin': true }));
    await assertFails(multi('assassin', { 'cards/q1/assassin': 'F', 'played/q1/assassin': true }));
    await assertFails(multi('assassin', { 'cards/q1/percival': 'S', 'played/q1/percival': true }));
    await assertFails(at('percival', 'played/q1/percival').set(true));
    await assertFails(at('percival', 'cards/q1/percival').set('S'));
  });
  test('牌面與任務編號、階段都必須正確', async () => {
    await seed(quest);
    await assertFails(multi('assassin', { 'cards/q1/assassin': 'X', 'played/q1/assassin': true }));
    await assertFails(multi('assassin', { 'cards/q0/assassin': 'F', 'played/q0/assassin': true }));
    await seed({ ...quest, 'pub/phase': 'vote' });
    await assertFails(multi('assassin', { 'cards/q1/assassin': 'F', 'played/q1/assassin': true }));
  });
});

describe('其他玩家操作', () => {
  test('只有隊長能在組隊階段編輯隊伍', async () => {
    await seed({ 'pub/phase': 'team' });
    await assertSucceeds(at('merlin', 'draft').set({ round: 1, attempt: 1, team: { merlin: true }, submitted: false }));
    await assertFails(at('percival', 'draft').set({ round: 1, attempt: 1, team: { percival: true }, submitted: true }));
    await seed({ 'pub/phase': 'vote' });
    await assertFails(at('merlin', 'draft').set({ round: 1, attempt: 1, submitted: true }));
  });
  test('只能在夜晚確認自己的身分', async () => {
    await seed({ 'pub/phase': 'night' });
    await assertSucceeds(at('merlin', 'ready/merlin').set(true));
    await assertFails(at('merlin', 'ready/assassin').set(true));
    await seed({ 'pub/phase': 'team' });
    await assertFails(at('merlin', 'ready/merlin').set(true));
  });
  test('只有湖中女神持有者能在湖中女神階段選人，且只能選一次', async () => {
    await seed({ 'pub/phase': 'lady' });
    await assertFails(at('merlin', 'ladyPick').set({ target: 'assassin', round: 1 }));
    await assertSucceeds(at('percival', 'ladyPick').set({ target: 'assassin', round: 1 }));
    await assertFails(at('percival', 'ladyPick').set({ target: 'minion', round: 1 }));
    await seed({ 'pub/phase': 'team' });
    await assertFails(at('percival', 'ladyPick').set({ target: 'assassin', round: 1 }));
  });
  test('只有刺客能在刺殺階段指認梅林', async () => {
    await seed({ 'pub/phase': 'assassin' });
    await assertFails(at('minion', 'assassinPick').set({ target: 'merlin' }));
    await assertFails(at('merlin', 'assassinPick').set({ target: 'percival' }));
    await assertSucceeds(at('assassin', 'assassinPick').set({ target: 'merlin' }));
    await seed({ 'pub/phase': 'quest' });
    await assertFails(at('assassin', 'assassinPick').set({ target: 'merlin' }));
  });
  test('上線狀態：只能改自己的，每個分頁一個連線', async () => {
    await seed();
    await assertSucceeds(at('merlin', 'presence/merlin/conns/c2').set(true));
    await assertSucceeds(at('merlin', 'presence/merlin/conns/c2').remove());
    await assertSucceeds(at('merlin', 'presence/merlin/at').set(TS));
    await assertFails(at('merlin', 'presence/host/conns').remove());
    await assertFails(at('merlin', 'presence/merlin/online').set(true));
    await assertFails(at('merlin', 'presence/merlin/conns/c3').set('yes'));
  });
});

describe('建立與加入房間', () => {
  test('可以建立新房間，代碼必須是 4 個大寫英文字母', async () => {
    await assertSucceeds(dbAs('alice').ref('rooms/WXYZ/meta').set({ hostUid: 'alice', createdAt: TS, lastActive: TS, status: 'lobby' }));
    await assertFails(dbAs('alice').ref('rooms/ab12/meta').set({ hostUid: 'alice', createdAt: TS, status: 'lobby' }));
    await assertFails(dbAs('alice').ref('rooms/QWER/meta').set({ hostUid: 'bob', createdAt: TS, status: 'lobby' }));
  });
  test('不能覆寫已經存在的房間', async () => {
    await seed();
    await assertFails(at('alice', 'meta').set({ hostUid: 'alice', createdAt: TS, status: 'lobby' }));
  });
  test('大廳可以加入；遊戲中、被移出後都不能加入', async () => {
    await seed({ 'meta/status': 'lobby' });
    await assertSucceeds(at('newbie', 'players/newbie').set({ name: '新人', joinedAt: TS }));
    await seed({ 'meta/status': 'lobby', 'kicked/bad': true });
    await assertFails(at('bad', 'players/bad').set({ name: '壞人', joinedAt: TS }));
    await seed();
    await assertFails(at('late', 'players/late').set({ name: '遲到', joinedAt: TS }));
  });
  test('不能改別人的資料；暱稱長度 1～12 字、不能加多餘欄位', async () => {
    await seed({ 'meta/status': 'lobby' });
    await assertFails(at('merlin', 'players/assassin/name').set('改名'));
    await assertSucceeds(at('merlin', 'players/merlin/name').set('大法師'));
    await assertFails(at('newbie', 'players/newbie').set({ name: '', joinedAt: TS }));
    await assertFails(at('newbie', 'players/newbie').set({ name: '一二三四五六七八九十一二三', joinedAt: TS }));
    await assertFails(at('newbie', 'players/newbie').set({ name: '新人', joinedAt: TS, role: 'merlin' }));
  });
  test('遊戲中不能自己離開座位；大廳與遊戲結束後可以', async () => {
    await seed();
    await assertFails(at('merlin', 'players/merlin').remove());
    await seed({ 'meta/status': 'ended' });
    await assertSucceeds(multi('merlin', { 'players/merlin': null, 'presence/merlin': null }));
    await seed({ 'meta/status': 'lobby' });
    await assertSucceeds(at('merlin', 'players/merlin').remove());
  });
  test('房主可以移出玩家，其他人不行', async () => {
    await seed({ 'meta/status': 'lobby' });
    await assertFails(multi('merlin', { 'players/minion': null, 'kicked/minion': true }));
    await assertSucceeds(multi('host', { 'players/minion': null, 'presence/minion': null, 'kicked/minion': true }));
  });
});

describe('房主接手', () => {
  test('房主在線時不能搶房主', async () => {
    await seed();
    await assertFails(at('merlin', 'meta/hostUid').set('merlin'));
  });
  test('房主還有其他分頁在線時不能搶', async () => {
    await seed({ 'presence/host': { at: Date.now() - 60_000, conns: { other: true } } });
    await assertFails(at('merlin', 'meta/hostUid').set('merlin'));
  });
  test('房主剛離線（30 秒內）還不能接手', async () => {
    await seed({ 'presence/host': { at: Date.now() - 5_000 } });
    await assertFails(at('merlin', 'meta/hostUid').set('merlin'));
  });
  test('房主離線超過 30 秒，房內玩家可以接手自己當房主', async () => {
    await seed({ 'presence/host': { at: Date.now() - 60_000 } });
    await assertFails(at('merlin', 'meta/hostUid').set('assassin'));
    await assertFails(at('stranger', 'meta/hostUid').set('stranger'));
    await assertSucceeds(at('merlin', 'meta/hostUid').set('merlin'));
  });
  test('房主可以把房主交給房內玩家，但不能交給房外的人', async () => {
    await seed();
    await assertFails(at('host', 'meta/hostUid').set('stranger'));
    await assertSucceeds(at('host', 'meta/hostUid').set('percival'));
  });
});

describe('房間索引與舊房間清理', () => {
  test('只有房主或房內玩家能寫入房間索引，不能搶佔別人的代碼', async () => {
    await assertFails(dbAs('squatter').ref('roomIndex/QQQQ').set(0));
    await seed();
    await assertSucceeds(dbAs('host').ref(`roomIndex/${C}`).set(TS));
    await assertSucceeds(dbAs('merlin').ref(`roomIndex/${C}`).set(TS));
    await assertFails(dbAs('stranger').ref(`roomIndex/${C}`).set(TS));
    await assertFails(dbAs('host').ref(`roomIndex/${C}`).set(Date.now() + DAY));
  });
  test('超過一天沒有活動的房間任何人都能清掉', async () => {
    const old = Date.now() - 2 * DAY;
    await seed({ 'meta/createdAt': old, 'meta/lastActive': old }, { indexValue: old });
    await assertSucceeds(dbAs('cleaner').ref(`rooms/${C}`).remove());
    await assertSucceeds(dbAs('cleaner').ref(`roomIndex/${C}`).remove());
  });
  test('建立很久但最近還在玩的房間不能被清掉', async () => {
    const old = Date.now() - 2 * DAY;
    await seed({ 'meta/createdAt': old }, { indexValue: old });
    await assertFails(dbAs('cleaner').ref(`rooms/${C}`).remove());
    await assertFails(dbAs('cleaner').ref(`roomIndex/${C}`).remove());
  });
  test('新房間不能被清掉；清理權限不能拿來修改舊房間的內容', async () => {
    await seed();
    await assertFails(dbAs('cleaner').ref(`rooms/${C}`).remove());
    const old = Date.now() - 2 * DAY;
    await seed({ 'meta/createdAt': old, 'meta/lastActive': old }, { indexValue: old });
    await assertFails(dbAs('cleaner').ref(`rooms/${C}/pub/phase`).set('end'));
  });
});
