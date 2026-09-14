# 阿瓦隆・線上桌遊

《The Resistance: Avalon（阿瓦隆）》的網頁版。5～10 位玩家各自用手機或電腦連線，搭配 Discord／LINE 語音一起玩。

👉 **第一次架設請看 [docs/SETUP.md](docs/SETUP.md)**　｜　🧪 **測試與 CI/CD 請看 [docs/TESTING.md](docs/TESTING.md)**

## 功能

- **完整官方規則（原版）**：5～10 人、正確的出隊人數、7 人以上第 4 個任務需 2 張失敗牌、連續 5 次否決邪惡勝、刺殺梅林
- **所有原版角色**：梅林、派西維爾、亞瑟的忠臣、刺客、莫甘娜、莫德雷德、奧伯倫、莫德雷德的爪牙（房主自由勾選，依人數自動檢查）
- **原版擴充規則**：湖中女神、指定任務
- **房間代碼加入**：不需要註冊帳號，也可以直接貼上邀請連結；暱稱重複會自動加數字
- **防偷看**：身分、選票、任務牌都由 Firebase 安全規則保護；好人無法出失敗牌；房外的人看不到房間內容
- **斷線重連**：重新整理後自動回到座位；遊戲中可以「回首頁」再用代碼回來；房主離線 30 秒自動交接
- **卡關處理**：等待中的玩家離線時，房主可以手動代為處理（倒數時間到只提醒，不會自動處理）
- **倒數提醒**、**遊戲紀錄**（每次提案的隊長、隊員、每個人的票與任務結果，回到大廳也能看上一局）
- **新手說明書**：右下角書本，隨時查看「現在該做什麼」、新手教學、角色介紹與完整規則
- 繁體中文、手機與電腦皆適用、自製中世紀風格插圖

## 專案結構

```
index.html              網頁入口
css/style.css           樣式
js/app.js               首頁與房間畫面切換
js/ui/lobby.js          大廳（玩家、座位、角色設定）
js/ui/board.js          遊戲畫面（圓桌、任務、投票、出牌、房主選單…）
js/ui/panels.js         身分、結果、紀錄、規則等面板
js/ui/guide.js          右下角書本說明書
js/ui/common.js         共用元件
js/rules.js             官方規則資料（人數、出隊人數、角色）
js/game.js              規則邏輯（分配身分、計票、判定勝負）
js/state.js             房間狀態的純函式（座位、上線狀態、房主接手、暱稱）
js/host.js              房主瀏覽器擔任裁判，推進遊戲流程與卡關處理
js/room.js              建立／加入房間、上線狀態、玩家操作（Firebase）
js/art.js               自製 SVG 插圖
js/firebase.js          Firebase 連線
js/firebase-config.js   Firebase 專案設定
database.rules.json     Firebase 安全規則（由 tools/build-rules.mjs 產生）
tools/                  安全規則產生器、本機伺服器、語法檢查、網站輸出
tests/unit/             單元測試
tests/functional/       功能測試（房主裁判完整流程）
tests/rules/            安全規則測試（Firebase 模擬器）
tests/e2e/              系統測試（多個瀏覽器真的點網頁玩）
.github/workflows/      CI/CD：測試通過後自動部署到 GitHub Pages
```

## 常用指令

```bash
npm install                 # 第一次安裝測試工具
npm test                    # 語法檢查＋單元測試＋功能測試（約 10 秒）
npm run test:emulator       # 安全規則測試＋系統測試（需要 Java，約 5～8 分鐘）
npm run build:rules         # 修改安全規則後重新產生 database.rules.json
```
