# 測試與 CI/CD 說明

每次 push 到 GitHub，GitHub Actions 會自動跑完所有測試；**全部通過才會部署**到 GitHub Pages。
測試失敗時網站不會更新，朋友們玩的永遠是測試通過的版本。

---

## 一、測試種類

| 種類 | 位置 | 測什麼 | 需要 |
|---|---|---|---|
| **語法檢查** | `tools/check-syntax.mjs` | 所有 JavaScript 檔案都能正確解析 | Node.js |
| **單元測試** | `tests/unit/` | 官方規則表（人數、出隊人數、雙失敗規則）、身分分配與夜晚情報、計票、任務判定、湖中女神與指定任務規則、房間代碼與暱稱、房主接手條件、插圖格式、安全規則檔是否最新 | Node.js |
| **功能測試** | `tests/functional/` | 房主裁判的完整流程：開局、夜晚、組隊驗證、投票與否決、任務、5 次否決、刺殺梅林、湖中女神、指定任務、卡關處理、房主交接不重複推進、再來一局 | Node.js（用記憶體資料庫模擬 Firebase） |
| **安全規則測試** | `tests/rules/` | 45 條讀寫權限：看不到別人的身分／選票／任務牌、好人不能出失敗牌、不能替別人投票、只能投一次、房外的人讀不到房間、被移出不能再加入、房主接手條件、遊戲中不能改名、鎖定房間、舊房間清理 | Firebase 模擬器（需要 Java） |
| **系統測試（E2E）** | `tests/e2e/` | 用多個獨立瀏覽器（手機＋電腦尺寸）真的點網頁玩：首頁、大廳所有按鈕、7 人與 5 人完整對局、指定任務、重新整理與回首頁再回來、房主轉移與自動接手、離線卡關處理、說明書 | Firebase 模擬器＋Playwright 瀏覽器 |

---

## 二、在自己的電腦執行

第一次先安裝（需要 Node.js 22 以上、Java 21 以上）：

```bash
cd /home/eng/Sid/Avalon
npm install
npx playwright install chromium
```

| 指令 | 內容 | 時間 |
|---|---|---|
| `npm test` | 語法檢查＋單元測試＋功能測試 | 約 10 秒 |
| `npm run test:emulator` | 自動啟動 Firebase 模擬器，跑安全規則測試＋系統測試 | 約 5～8 分鐘 |
| `npm run test:all` | 以上全部 | 約 5～8 分鐘 |

只跑其中一個系統測試檔：

```bash
npx firebase emulators:exec --only auth,database --project demo-avalon "npx playwright test tests/e2e/lobby.spec.mjs"
```

### 自己動手用模擬器玩（不會動到正式的 Firebase）

```bash
# 視窗 1：啟動 Firebase 模擬器
npx firebase emulators:start --only auth,database --project demo-avalon
# 視窗 2：啟動網站
npm run serve
```

用瀏覽器打開 <http://127.0.0.1:8080/?emu=1>。多開幾個**無痕視窗**（或不同瀏覽器）就能模擬多位玩家。

---

## 三、CI/CD 流程（`.github/workflows/ci.yml`）

```
push 到 main／開 Pull Request
        │
        ▼
① 語法檢查・單元測試・功能測試（約 1 分鐘）
        │ 通過
        ▼
② 安全規則測試・系統測試（Firebase 模擬器＋瀏覽器，約 8～12 分鐘）
        │ 通過，而且是 push 到 main
        ▼
③ 部署到 GitHub Pages
```

- Pull Request 只會跑 ① ②，不會部署。
- 系統測試失敗時，到 GitHub 的 **Actions** 頁面點進那次執行，下載 **playwright-report**，解壓縮後執行 `npx playwright show-report playwright-report` 就能看到每一步的截圖與錄影。
- 也可以在 Actions 頁面按「Run workflow」手動重跑。

### 第一次使用 CI/CD 要做的設定

1. GitHub 儲存庫 → **Settings** → **Pages** → Source 選「**GitHub Actions**」。
2. push 到 main 後，到 **Actions** 分頁確認三個步驟都打勾，網站就會更新。

---

## 四、修改安全規則的流程

1. 修改 `tools/build-rules.mjs`（規則寫在這裡比較好讀）。
2. 執行 `npm run build:rules` 產生新的 `database.rules.json`。
3. 執行 `npm run test:emulator` 確認安全規則測試通過。
4. 把 `database.rules.json` 全部內容貼到 Firebase 主控台 → Realtime Database → 規則 → 發布。

> 單元測試會檢查 `database.rules.json` 是否和產生器一致，忘記執行第 2 步時 CI 會失敗提醒你。
> GitHub Actions 不會自動更新 Firebase 上的規則，第 4 步一定要手動做。
