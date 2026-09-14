// 產生 Firebase 安全規則：node tools/build-rules.mjs
// 規則寫在這裡比直接改 JSON 好讀；產生的 database.rules.json 要貼到 Firebase 主控台。
import { writeFileSync } from 'node:fs';

const R = (p) => `root.child('rooms/'+$code+'/${p}')`;
const AUTH = 'auth != null';
const SELF = 'auth != null && auth.uid === $uid';
const HOST = `(auth != null && ${R('meta/hostUid')}.val() === auth.uid)`;
const PHASE = (p) => `${R('pub/phase')}.val() === '${p}'`;
const STATUS = (s) => `${R('meta/status')}.val() === '${s}'`;
const DAY = 'now - 86400000';

// 房主離線超過 30 秒，任何在房內的玩家都可以接手房主
const hostPresence = (sub) => R(`presence/'+data.val()+'${sub}`);
const HOST_UID_WRITE = `${AUTH} && data.exists() && ${R("players/'+newData.val()+'")}.exists() && (data.val() === auth.uid || (newData.val() === auth.uid && (!${hostPresence('')}.exists() || (${hostPresence('/online')}.val() === false && ${hostPresence('/at')}.val() < now - 30000))))`;

const VOTE_WRITE = `${SELF} && !data.exists() && ${PHASE('vote')} && ${R('pub/voteId')}.val() === $vid && ${R("pub/seat/'+$uid+'")}.exists()`;
const CARD_WRITE = `${SELF} && !data.exists() && ${PHASE('quest')} && ${R('pub/runId')}.val() === $rid && ${R("pub/team/'+$uid+'")}.exists()`;
const roomNew = (p) => `newData.parent().parent().parent().child(${p}).exists()`;

const rules = {
  rules: {
    roomIndex: {
      '.read': AUTH,
      '.indexOn': ['.value'],
      $code: {
        '.write': `${AUTH} && ((!data.exists() && newData.isNumber() && newData.val() <= now) || (data.exists() && !newData.exists() && data.val() < ${DAY}))`,
      },
    },
    rooms: {
      $code: {
        // 超過一天的舊房間，任何人都可以清掉
        '.write': `${AUTH} && data.exists() && !newData.exists() && data.child('meta/createdAt').val() < ${DAY}`,
        meta: {
          '.read': AUTH,
          '.write': `${AUTH} && !data.exists() && newData.child('hostUid').val() === auth.uid && $code.matches(/^[A-Z]{4}$/)`,
          hostUid: { '.write': HOST_UID_WRITE, '.validate': 'newData.isString()' },
          status: {
            '.write': HOST,
            '.validate': "newData.val() === 'lobby' || newData.val() === 'playing' || newData.val() === 'ended'",
          },
          createdAt: { '.validate': 'newData.isNumber()' },
          $other: { '.validate': false },
        },
        players: {
          '.read': AUTH,
          '.write': HOST,
          $uid: {
            '.write': `${SELF} && (newData.exists() ? (data.exists() || (${STATUS('lobby')} && !${R("kicked/'+$uid+'")}.exists())) : (${STATUS('lobby')} || ${STATUS('ended')}))`,
            '.validate': "newData.hasChildren(['name', 'joinedAt'])",
            name: { '.validate': 'newData.isString() && newData.val().length >= 1 && newData.val().length <= 12' },
            joinedAt: { '.validate': 'newData.isNumber()' },
            $other: { '.validate': false },
          },
        },
        kicked: { '.read': AUTH, '.write': HOST },
        presence: {
          '.read': AUTH,
          $uid: {
            '.write': `${AUTH} && (auth.uid === $uid || ${HOST})`,
            '.validate': "newData.hasChildren(['online', 'at']) && newData.child('online').isBoolean() && newData.child('at').isNumber()",
          },
        },
        settings: { '.read': AUTH, '.write': HOST },
        pub: { '.read': AUTH, '.write': HOST },
        log: { '.read': AUTH, '.write': HOST },
        hist: { '.read': AUTH, '.write': HOST },
        // 全部身分：只有房主讀得到
        hostSecret: { '.read': HOST, '.write': HOST },
        // 個人身分：只有本人（和房主）讀得到
        secret: {
          '.write': HOST,
          $uid: { '.read': `${AUTH} && (auth.uid === $uid || ${HOST})` },
        },
        ready: {
          '.read': AUTH,
          '.write': HOST,
          $uid: { '.write': `${SELF} && ${PHASE('night')}`, '.validate': 'newData.isBoolean()' },
        },
        draft: {
          '.read': AUTH,
          '.write': `${AUTH} && (${HOST} || (${R('pub/leader')}.val() === auth.uid && ${PHASE('team')}))`,
        },
        // 投票：投完才公開；每人只能投一次
        votes: {
          '.read': HOST,
          '.write': HOST,
          $vid: {
            $uid: {
              '.read': SELF,
              '.write': VOTE_WRITE,
              '.validate': 'newData.isBoolean()',
            },
          },
        },
        voted: {
          '.read': AUTH,
          '.write': HOST,
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
              '.write': CARD_WRITE,
              '.validate': `newData.val() === 'S' || (newData.val() === 'F' && ${R("secret/'+$uid+'/team")}.val() === 'evil')`,
            },
          },
        },
        played: {
          '.read': AUTH,
          '.write': HOST,
          $rid: {
            $uid: {
              '.write': `${CARD_WRITE} && ${roomNew("'cards/'+$rid+'/'+$uid")}`,
              '.validate': 'newData.val() === true',
            },
          },
        },
        ladyPick: {
          '.read': AUTH,
          '.write': `${AUTH} && (${HOST} || (${R('pub/lady/holder')}.val() === auth.uid && ${PHASE('lady')} && !data.exists()))`,
        },
        assassinPick: {
          '.read': AUTH,
          '.write': `${AUTH} && (${HOST} || (${R("secret/'+auth.uid+'/role")}.val() === 'assassin' && ${PHASE('assassin')} && !data.exists()))`,
        },
        $other: { '.validate': false },
      },
    },
  },
};

const out = new URL('../database.rules.json', import.meta.url);
writeFileSync(out, JSON.stringify(rules, null, 2) + '\n');
console.log('已產生', out.pathname);
