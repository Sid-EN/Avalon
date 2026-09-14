// 產生 Firebase 安全規則：node tools/build-rules.mjs
// 規則寫在這裡比直接改 JSON 好讀；產生的 database.rules.json 要貼到 Firebase 主控台。
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const R = (p) => `root.child('rooms/'+$code+'/${p}')`;
const AUTH = 'auth != null';
const SELF = 'auth != null && auth.uid === $uid';
const HOST = `(auth != null && ${R('meta/hostUid')}.val() === auth.uid)`;
// 只有房內玩家可以讀房間資料（被移出或離開後就讀不到）
const MEMBER = `(auth != null && ${R("players/'+auth.uid+'")}.exists())`;
const PHASE = (p) => `${R('pub/phase')}.val() === '${p}'`;
const STATUS = (s) => `${R('meta/status')}.val() === '${s}'`;
const DAY_AGO = 'now - 86400000';
// 房間最後活動時間（舊資料沒有 lastActive 時用建立時間）
const lastActive = (room) => `(${room}.child('meta/lastActive').exists() ? ${room}.child('meta/lastActive').val() : ${room}.child('meta/createdAt').val())`;

// 房主所有分頁都離線超過 30 秒，房內玩家才可以接手房主
const hostPresence = (sub) => R(`presence/'+data.val()+'${sub}`);
const HOST_AWAY = `(!${hostPresence('/conns')}.exists() && (!${hostPresence('/at')}.exists() || ${hostPresence('/at')}.val() < now - 30000))`;
const HOST_UID_WRITE = `${AUTH} && data.exists() && ${R("players/'+newData.val()+'")}.exists() && (data.val() === auth.uid || (newData.val() === auth.uid && ${HOST_AWAY}))`;

// 投票與出牌：兩個節點必須在同一次寫入中一起出現
const roomNew = (p) => `newData.parent().parent().parent().child(${p}).exists()`;
const VOTE_WRITE = `${SELF} && !data.exists() && ${PHASE('vote')} && ${R('pub/voteId')}.val() === $vid && ${R("pub/seat/'+$uid+'")}.exists()`;
const CARD_WRITE = `${SELF} && !data.exists() && ${PHASE('quest')} && ${R('pub/runId')}.val() === $rid && ${R("pub/team/'+$uid+'")}.exists()`;

const memberReadHostWrite = { '.read': MEMBER, '.write': HOST };

export function buildRules() {
  return {
    rules: {
      roomIndex: {
        '.read': AUTH,
        '.indexOn': ['.value'],
        $code: {
          '.write': `${AUTH} && (newData.exists()
            ? (newData.isNumber() && newData.val() <= now && (${R('meta/hostUid')}.val() === auth.uid || ${R("players/'+auth.uid+'")}.exists()))
            : (data.exists() && data.val() < ${DAY_AGO} && (!${R('meta')}.exists() || ${lastActive("root.child('rooms/'+$code)")} < ${DAY_AGO})))`.replace(/\s*\n\s*/g, ' '),
        },
      },
      rooms: {
        $code: {
          // 超過一天沒有活動的房間，任何人都可以清掉
          '.write': `${AUTH} && data.exists() && !newData.exists() && ${lastActive('data')} < ${DAY_AGO}`,
          meta: {
            '.read': AUTH,
            '.write': `${AUTH} && !data.exists() && newData.child('hostUid').val() === auth.uid && $code.matches(/^[A-Z]{4}$/)`,
            hostUid: { '.write': HOST_UID_WRITE, '.validate': 'newData.isString()' },
            status: {
              '.write': HOST,
              '.validate': "newData.val() === 'lobby' || newData.val() === 'playing' || newData.val() === 'ended'",
            },
            createdAt: { '.validate': 'newData.isNumber()' },
            lastActive: { '.write': `${HOST} || ${MEMBER}`, '.validate': 'newData.isNumber() && newData.val() <= now' },
            $other: { '.validate': false },
          },
          players: {
            ...memberReadHostWrite,
            $uid: {
              '.read': SELF,
              '.write': `${SELF} && (newData.exists() ? (data.exists() || (${STATUS('lobby')} && !${R("kicked/'+$uid+'")}.exists())) : (${STATUS('lobby')} || ${STATUS('ended')}))`,
              '.validate': "newData.hasChildren(['name', 'joinedAt'])",
              name: { '.validate': 'newData.isString() && newData.val().length >= 1 && newData.val().length <= 12' },
              joinedAt: { '.validate': 'newData.isNumber()' },
              $other: { '.validate': false },
            },
          },
          kicked: { ...memberReadHostWrite, $uid: { '.read': SELF } },
          presence: {
            '.read': MEMBER,
            $uid: {
              '.write': `${AUTH} && ((auth.uid === $uid && (${MEMBER} || !newData.exists())) || ${HOST})`,
              at: { '.validate': 'newData.isNumber() && newData.val() <= now' },
              conns: { $conn: { '.validate': 'newData.val() === true' } },
              $other: { '.validate': false },
            },
          },
          settings: memberReadHostWrite,
          pub: memberReadHostWrite,
          log: memberReadHostWrite,
          hist: memberReadHostWrite,
          // 全部身分：只有房主讀得到
          hostSecret: { '.read': HOST, '.write': HOST },
          // 個人身分：只有本人（和房主）讀得到
          secret: {
            '.write': HOST,
            $uid: { '.read': `${AUTH} && (auth.uid === $uid || ${HOST})` },
          },
          ready: {
            ...memberReadHostWrite,
            $uid: { '.write': `${SELF} && ${PHASE('night')}`, '.validate': 'newData.isBoolean()' },
          },
          draft: {
            '.read': MEMBER,
            '.write': `${AUTH} && (${HOST} || (${R('pub/leader')}.val() === auth.uid && ${PHASE('team')}))`,
          },
          // 投票：投完才公開；每人只能投一次
          votes: {
            '.read': HOST,
            '.write': HOST,
            $vid: {
              $uid: {
                '.read': SELF,
                '.write': `${VOTE_WRITE} && ${roomNew("'voted/'+$vid+'/'+$uid")}`,
                '.validate': 'newData.isBoolean()',
              },
            },
          },
          voted: {
            ...memberReadHostWrite,
            $vid: {
              $uid: {
                '.write': `${VOTE_WRITE} && ${roomNew("'votes/'+$vid+'/'+$uid")}`,
                '.validate': 'newData.val() === true',
              },
            },
          },
          // 任務牌：只有房主讀得到；好人只能出成功
          cards: {
            '.read': HOST,
            '.write': HOST,
            $rid: {
              $uid: {
                '.read': SELF,
                '.write': `${CARD_WRITE} && ${roomNew("'played/'+$rid+'/'+$uid")}`,
                '.validate': `newData.val() === 'S' || (newData.val() === 'F' && ${R("secret/'+$uid+'/team")}.val() === 'evil')`,
              },
            },
          },
          played: {
            ...memberReadHostWrite,
            $rid: {
              $uid: {
                '.write': `${CARD_WRITE} && ${roomNew("'cards/'+$rid+'/'+$uid")}`,
                '.validate': 'newData.val() === true',
              },
            },
          },
          ladyPick: {
            '.read': MEMBER,
            '.write': `${AUTH} && (${HOST} || (${R('pub/lady/holder')}.val() === auth.uid && ${PHASE('lady')} && !data.exists()))`,
          },
          assassinPick: {
            '.read': MEMBER,
            '.write': `${AUTH} && (${HOST} || (${R("secret/'+auth.uid+'/role")}.val() === 'assassin' && ${PHASE('assassin')} && !data.exists()))`,
          },
          $other: { '.validate': false },
        },
      },
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = new URL('../database.rules.json', import.meta.url);
  writeFileSync(out, `${JSON.stringify(buildRules(), null, 2)}\n`);
  console.log('已產生', fileURLToPath(out));
}
