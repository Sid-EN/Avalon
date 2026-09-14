# 阿瓦隆線上版：架設教學

整個架設只要做一次，全程免費，不需要信用卡。大約 15 分鐘。

- **Firebase**（Google 的免費即時資料庫）：負責同步每個人的投票、任務和遊戲進度。
- **GitHub Pages**：負責放網頁。只有程式改版時才需要 push，**平常開房、玩遊戲都不用碰 GitHub**。

---

## 一、建立 Firebase 專案

### 1. 建立專案
1. 打開 <https://console.firebase.google.com/>，用 Google 帳號登入。
2. 點「**建立專案**」，專案名稱輸入例如 `avalon`。
3. 詢問是否啟用 Google Analytics 時，可以**關閉**（用不到）。
4. 等待建立完成，點「繼續」。

### 2. 開啟匿名登入（玩家不用註冊帳號）
1. 左側選單「**建構（Build）**」→「**Authentication**」→「**開始使用**」。
2. 在「**登入方式（Sign-in method）**」分頁，點「**匿名（Anonymous）**」。
3. 打開「啟用」開關 →「**儲存**」。

### 3. 建立即時資料庫
1. 左側選單「**建構**」→「**Realtime Database**」→「**建立資料庫**」。
   - ⚠️ 是 **Realtime Database**，不是 Firestore。
2. 位置選「**新加坡（asia-southeast1）**」，離台灣最近、速度最快。
3. 安全性規則選「**以鎖定模式啟動**」→「**啟用**」。

### 4. 貼上安全規則（防作弊的關鍵）
1. 在 Realtime Database 頁面點上方的「**規則（Rules）**」分頁。
2. 把編輯框裡原本的內容**全部刪掉**。
3. 打開專案裡的 `database.rules.json`，**全部複製**貼進去。
4. 點「**發布（Publish）**」。

> 這份規則讓每個人只能看到自己的身分、不能偷看別人的票和任務牌、好人無法出失敗牌。
> 以後如果程式更新有改到 `database.rules.json`，要再貼一次。

### 5. 取得網頁設定碼
1. 點左上角「專案總覽」旁邊的 **⚙️ 齒輪** →「**專案設定**」。
2. 往下捲到「**你的應用程式**」，點網頁圖示 **`</>`**。
3. 應用程式暱稱輸入 `avalon-web`，**不要**勾選 Firebase Hosting →「**註冊應用程式**」。
4. 畫面會出現一段 `const firebaseConfig = { ... }`，把裡面的值複製到專案的 `js/firebase-config.js`：

```js
export const firebaseConfig = {
  apiKey: 'AIza……',
  authDomain: 'avalon-xxxxx.firebaseapp.com',
  databaseURL: 'https://avalon-xxxxx-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'avalon-xxxxx',
  appId: '1:1234……',
};
```

> 如果設定碼裡**沒有 `databaseURL`**，到 Realtime Database 頁面，資料區最上方那串 `https://……firebasedatabase.app` 網址就是。
>
> 這些值本來就會公開在網頁上，**不是密碼**，放到 GitHub 上沒有關係。安全性是由第 4 步的規則保護。

---

## 二、放上 GitHub Pages

### 1. 建立 GitHub 儲存庫
1. 到 <https://github.com/new>。
2. Repository name 輸入 `avalon`，選 **Public**（免費帳號的 Pages 需要公開）。
3. **不要**勾選 README 等選項，直接「Create repository」。

### 2. 上傳程式（只有第一次和改版時要做）

> 這台電腦是共用的（全域 SSH 與 gh 登入屬於其他帳號），所以這個儲存庫另外設定了**只屬於它自己**的身分和金鑰（見下方「附錄」），commit 一律顯示為 `Sid-EN`。

**第一次：把部署金鑰（Deploy key）加到 GitHub**
1. 在終端機執行 `cat ~/.ssh/id_ed25519_avalon_sid.pub`，複製印出來的整行（`ssh-ed25519 AAAA… Sid-EN Avalon deploy key`）。
2. 打開儲存庫 **Settings → Deploy keys → Add deploy key**。
3. Title 填 `avalon-sid`，Key 貼上剛剛複製的內容，**勾選「Allow write access」** →「Add key」。
   - 這把金鑰**只能**推送這一個儲存庫，碰不到其他儲存庫或帳號。

**上傳：**

```bash
cd /home/eng/Sid/Avalon
git add .
git commit -m "阿瓦隆線上版"
git push -u origin main
```

**附錄：這個儲存庫的 Git 設定（已設定好，僅供參考）**

| 設定 | 值 | 用途 |
|---|---|---|
| `user.name` / `user.email` | `Sid-EN` / `steven093212@gmail.com` | commit 作者 |
| `remote origin` | `git@github.com:Sid-EN/Avalon.git` | 用 SSH 推送 |
| `core.sshCommand` | 只使用 `~/.ssh/id_ed25519_avalon_sid`，忽略全域 SSH 設定 | 不會用到別人的金鑰 |
| `credential.https://github.com.helper` | 空白 | 不會用到 gh 登入的帳號 |
| `.git/hooks/commit-msg` | 作者不是 Sid-EN、或含 `Co-authored-by` 時拒絕 commit | 保證紀錄裡只有你 |

用 `git config --local --list` 可以查看；hook 不會被 push 到 GitHub，只在這台電腦生效。

### 3. 開啟 Pages（由 GitHub Actions 自動測試後部署）
1. 在 GitHub 儲存庫頁面點「**Settings**」→ 左側「**Pages**」。
2. Source 選「**GitHub Actions**」。
3. push 到 main 之後，到「**Actions**」分頁可以看到自動測試的進度（約 10 分鐘）。**全部測試通過才會部署**。
4. 部署完成後，網址會是：`https://sid-en.github.io/Avalon/`

> 測試與 CI/CD 的詳細說明見 [TESTING.md](TESTING.md)。

### 4. 把網址加入 Firebase 授權網域
1. 回到 Firebase →「**Authentication**」→「**設定（Settings）**」分頁 →「**授權網域（Authorized domains）**」。
2. 點「**新增網域**」，輸入 `你的帳號.github.io`（不用加 `https://` 和 `/avalon`）。

完成！把網址傳給朋友就能開始玩。

---

## 三、免費額度夠不夠用？

Firebase 免費方案（Spark）的限制，對朋友局來說非常充裕：

| 項目 | 免費額度 | 阿瓦隆的用量 |
|---|---|---|
| 同時連線 | 100 個 | 一局 10 人＝10 個連線，可以同時開約 10 桌 |
| 資料儲存 | 1 GB | 一個房間約 10～30 KB，舊房間超過一天會自動清除 |
| 每月下載流量 | 10 GB | 一局約 1～3 MB，每月可玩數千局 |
| 匿名登入 | 每月 5 萬位使用者 | 綽綽有餘 |

- 本遊戲**只使用免費功能**（匿名登入、Realtime Database、安全規則），不需要付費方案，也不需要綁信用卡。
- 就算超過額度，免費方案也**不會收費**，只會暫時無法連線，隔天或下個月就恢復。
- GitHub Pages 免費，每月流量上限 100 GB，完全夠用。

---

## 四、常見問題

**Q：有人重新整理網頁或斷線怎麼辦？**
用同一台裝置、同一個瀏覽器重新打開網址，會自動回到原本的房間和座位。
（如果換了裝置或清除瀏覽器資料，就會被當成新玩家。）

**Q：房主斷線了，遊戲會卡住嗎？**
房主的瀏覽器負責推進遊戲。房主離線超過 30 秒，系統會自動把房主交給下一位在線的玩家，遊戲可以繼續。

**Q：有玩家中途離開，遊戲卡住了怎麼辦？**
倒數時間到只會提醒，不會自動替玩家做決定。如果等待中的玩家**離線**了，房主可以打開「房主」選單的「卡關處理」代為處理（例如把離線玩家的票算反對、換下一位隊長），每次處理都會記錄在遊戲日誌裡。

**Q：遊戲中想暫時離開？**
按上方「回首頁」，座位會保留。之後在首頁輸入同一個房間代碼就能回到遊戲。

**Q：真的沒辦法作弊嗎？**
一般玩家就算打開瀏覽器的開發者工具，也看不到別人的身分、選票和任務牌，好人也無法出失敗牌。
唯一的例外是**房主**：因為沒有付費伺服器，身分由房主的瀏覽器分配，懂技術的房主理論上看得到全部身分。朋友局可以輪流當房主，或由大家信任的人開房。

**Q：打開網頁出現「尚未設定 Firebase」？**
代表 `js/firebase-config.js` 還是範本內容，請完成第一部分第 5 步，並重新 push。

**Q：出現「無法連線到伺服器」？**
請確認第一部分第 2 步（匿名登入）有啟用，以及第二部分第 4 步（授權網域）有加上。

---

## 五、本機測試（維護程式時使用）

見 [TESTING.md](TESTING.md)：單元測試、功能測試、安全規則測試、系統測試，以及用模擬器在自己電腦上試玩的方法。
