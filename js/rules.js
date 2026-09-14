// 阿瓦隆官方規則資料（The Resistance: Avalon 基本版）

// 各人數的正邪人數
export const TEAM_COUNTS = {
  5: { good: 3, evil: 2 },
  6: { good: 4, evil: 2 },
  7: { good: 4, evil: 3 },
  8: { good: 5, evil: 3 },
  9: { good: 6, evil: 3 },
  10: { good: 6, evil: 4 },
};

// 各人數每輪任務的出隊人數
export const QUEST_SIZES = {
  5: [2, 3, 2, 3, 3],
  6: [2, 3, 4, 3, 4],
  7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5],
  9: [3, 4, 4, 5, 5],
  10: [3, 4, 4, 5, 5],
};

// 每輪任務需要幾張失敗牌才算失敗（7 人以上第 4 輪需 2 張）
export function failsRequired(playerCount, questIndex) {
  return playerCount >= 7 && questIndex === 3 ? 2 : 1;
}

export const MAX_REJECTIONS = 5; // 同一輪連續 5 次否決，邪惡方獲勝
export const WINS_NEEDED = 3;
export const LADY_AFTER_QUESTS = [2, 3, 4]; // 第 2、3、4 次任務結束後使用湖中女神

export const ROLES = {
  merlin:   { name: '梅林',       team: 'good', special: true },
  percival: { name: '派西維爾',   team: 'good', special: true },
  servant:  { name: '亞瑟的忠臣', team: 'good', special: false },
  assassin: { name: '刺客',       team: 'evil', special: true },
  morgana:  { name: '莫甘娜',     team: 'evil', special: true },
  mordred:  { name: '莫德雷德',   team: 'evil', special: true },
  oberon:   { name: '奧伯倫',     team: 'evil', special: true },
  minion:   { name: '莫德雷德的爪牙', team: 'evil', special: false },
};
