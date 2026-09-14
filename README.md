# 阿瓦隆・線上桌遊

《The Resistance: Avalon（阿瓦隆）》的網頁版。5～10 位玩家各自用手機或電腦連線，搭配 Discord／LINE 語音一起玩。

👉 **第一次架設請看 [docs/SETUP.md](docs/SETUP.md)**

## 功能

- **完整官方規則（原版）**：5～10 人、正確的出隊人數、7 人以上第 4 個任務需 2 張失敗牌、連續 5 次否決邪惡勝、刺殺梅林
- **所有原版角色**：梅林、派西維爾、亞瑟的忠臣、刺客、莫甘娜、莫德雷德、奧伯倫、莫德雷德的爪牙（房主自由勾選，依人數自動檢查）
- **原版擴充規則**：湖中女神、指定任務
- **房間代碼加入**：不需要註冊帳號
- **防偷看**：身分、選票、任務牌都由 Firebase 安全規則保護；好人無法出失敗牌
- **斷線重連**：重新整理後自動回到座位；房主離線 30 秒自動交接
- **倒數提醒**：各階段可設定時間，時間到只提醒、不自動代替玩家決定
- **遊戲紀錄**：每次提案的隊長、隊員、每個人的投票與任務結果
- 繁體中文、手機與電腦皆適用、自製中世紀風格插圖

## 專案結構

```
index.html              網頁入口
css/style.css           樣式
js/app.js               首頁與房間畫面切換
js/ui/lobby.js          大廳（玩家、座位、角色設定）
js/ui/board.js          遊戲畫面（圓桌、任務、投票、出牌…）
js/ui/panels.js         身分、結果、紀錄、規則等面板
js/ui/common.js         共用元件
js/rules.js             官方規則資料（人數、出隊人數、角色）
js/game.js              規則邏輯（分配身分、計票、判定勝負）
js/host.js              房主瀏覽器擔任裁判，推進遊戲流程
js/room.js              建立／加入房間、上線狀態、玩家操作
js/art.js               自製 SVG 插圖
js/firebase.js          Firebase 連線
js/firebase-config.js   ⚠️ 填入你的 Firebase 設定
database.rules.json     Firebase 安全規則（由 tools/build-rules.mjs 產生）
tests/                  單元測試
```
