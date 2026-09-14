// Firebase 初始化：匿名登入 + Realtime Database
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getAuth, signInAnonymously, onAuthStateChanged, connectAuthEmulator,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  getDatabase, ref, get, set, update, remove, push, onValue,
  onDisconnect, serverTimestamp, query, orderByValue, endAt, limitToFirst, limitToLast,
  connectDatabaseEmulator,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js';
import { firebaseConfig } from './firebase-config.js';

// 本機測試時網址加上 ?emu=1 會連到 Firebase 模擬器
const useEmulator = new URLSearchParams(location.search).has('emu');

const config = useEmulator
  ? { apiKey: 'demo', authDomain: 'demo-avalon.firebaseapp.com', projectId: 'demo-avalon',
      databaseURL: 'http://127.0.0.1:9000/?ns=demo-avalon-default-rtdb' }
  : firebaseConfig;

export const isConfigured = useEmulator || !String(firebaseConfig.apiKey).includes('REPLACE_ME');

let app, auth, db;
if (isConfigured) {
  app = initializeApp(config);
  auth = getAuth(app);
  db = getDatabase(app);
  if (useEmulator) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectDatabaseEmulator(db, '127.0.0.1', 9000);
  }
}

// 登入並回傳 uid；同一個瀏覽器會保持同一個 uid，用來斷線重連
export function signIn() {
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) { unsub(); resolve(user.uid); }
    });
    signInAnonymously(auth).catch((e) => { unsub(); reject(e); });
  });
}

export {
  db, ref, get, set, update, remove, push, onValue,
  onDisconnect, serverTimestamp, query, orderByValue, endAt, limitToFirst, limitToLast,
};
