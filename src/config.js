// 全站設定。調整技能、配分權重、等級或預設值時只需修改此檔。

export const SKILLS = {
  vocab: "詞彙",
  gram: "文法",
  read: "閱讀理解",
  disc: "篇章連貫",
};

// 各技能在會考題目中的概略占比,用於決定練習優先順序。總和應為 1。
export const WEIGHTS = { vocab: 0.2, gram: 0.2, read: 0.4, disc: 0.2 };

// 會考等級,由低到高。索引值即為內部等級分數。
export const LEVELS = ["C", "B", "B+", "B++", "A", "A+", "A++"];

export const EXAM_LABEL = "會考";
export const PLACEMENT_LENGTH = 6;
export const DAILY_MINUTES = 30;
export const DEFAULT_TARGET = 5; // A+
export const MIN_TARGET = 2; // B+
export const DEFAULT_EXAM_DATE = "2027-05-15"; // 暫定,請以官方公告為準
export const ITEMS_URL = "data/items.json";
