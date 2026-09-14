// 測試用的記憶體版 Firebase Realtime Database
// 模擬 SDK 行為：多路徑更新（路徑不能重疊）、null 代表刪除、空物件自動消失、
// 不接受 undefined、數字鍵物件讀回時可能變成陣列、serverTimestamp。
export const TIMESTAMP = Object.freeze({ '.sv': 'timestamp' });

const split = (path) => String(path).split('/').filter(Boolean);

function normalize(value, path) {
  if (value === undefined) throw new Error(`Firebase 不接受 undefined（${path}）`);
  if (value === null || typeof value !== 'object') return value;
  if (value['.sv'] === 'timestamp') return Date.now();
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (/[.#$[\]/]/.test(key)) throw new Error(`不合法的鍵 "${key}"（${path}）`);
    const n = normalize(child, `${path}/${key}`);
    if (n !== null) out[key] = n;
  }
  return Object.keys(out).length ? out : null;
}

// Firebase 讀取時：鍵全是整數且超過一半的位置有值 → 轉成陣列
function toFirebaseValue(node) {
  if (node === undefined) return null;
  if (node === null || typeof node !== 'object') return node;
  const keys = Object.keys(node);
  const out = {};
  for (const key of keys) out[key] = toFirebaseValue(node[key]);
  if (keys.length && keys.every((k) => /^(0|[1-9]\d*)$/.test(k))) {
    const max = Math.max(...keys.map(Number));
    if (keys.length * 2 > max + 1) {
      const arr = new Array(max + 1);
      for (const key of keys) arr[Number(key)] = out[key];
      return arr;
    }
  }
  return out;
}

export function createMemoryDb() {
  let root = {};
  let seq = 0;

  const getNode = (parts) => {
    let node = root;
    for (const key of parts) {
      if (node === null || typeof node !== 'object' || !(key in node)) return null;
      node = node[key];
    }
    return node;
  };

  const write = (parts, value) => {
    if (!parts.length) { root = value ?? {}; return; }
    const chain = [root];
    let node = root;
    for (const key of parts.slice(0, -1)) {
      if (node[key] === null || typeof node[key] !== 'object') {
        if (value === null) return;
        node[key] = {};
      }
      node = node[key];
      chain.push(node);
    }
    const last = parts[parts.length - 1];
    if (value === null) delete node[last];
    else node[last] = value;
    for (let i = chain.length - 1; i > 0; i--) {
      if (Object.keys(chain[i]).length) break;
      delete chain[i - 1][parts[i - 1]];
    }
  };

  return {
    async get(path) {
      return toFirebaseValue(structuredClone(getNode(split(path))));
    },
    async set(path, value) {
      write(split(path), normalize(value, path));
    },
    async update(path, patch) {
      const keys = Object.keys(patch).map((k) => split(k).join('/'));
      for (const a of keys) {
        for (const b of keys) {
          if (a !== b && b.startsWith(`${a}/`)) throw new Error(`多路徑更新的路徑重疊：${a} 與 ${b}`);
        }
      }
      const base = split(path);
      const resolved = Object.entries(patch).map(([k, v]) => [split(k), normalize(v, `${path}/${k}`)]);
      for (const [parts, value] of resolved) write([...base, ...parts], value);
    },
    pushKey() {
      seq += 1;
      return `-k${String(Date.now()).padStart(14, '0')}${String(seq).padStart(6, '0')}`;
    },
    serverTimestamp() {
      return TIMESTAMP;
    },
    dump() {
      return structuredClone(root);
    },
  };
}

// 產生和瀏覽器 watchRoom() 相同形狀的房間狀態
export async function snapshot(db, code, uid) {
  const read = (p) => db.get(`rooms/${code}/${p}`);
  const s = { code, uid, loaded: {}, serverOffset: 0, connected: true };
  for (const key of ['meta', 'players', 'presence', 'settings', 'pub', 'hist', 'draft', 'ready', 'ladyPick', 'assassinPick', 'kicked', 'log']) {
    s[key] = await read(key);
    s.loaded[key] = true;
  }
  s.secret = await read(`secret/${uid}`);
  const vid = s.pub?.voteId;
  const rid = s.pub?.runId;
  s.voted = vid ? await read(`voted/${vid}`) : null;
  s.myVote = vid ? await read(`votes/${vid}/${uid}`) : null;
  s.played = rid ? await read(`played/${rid}`) : null;
  s.myCard = rid ? await read(`cards/${rid}/${uid}`) : null;
  Object.assign(s.loaded, { secret: true, voted: true, myVote: true, played: true, myCard: true });
  return s;
}
