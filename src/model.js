// 學習者模型:純函式,不操作 DOM,方便單獨測試或替換演算法。
import { LEVELS, WEIGHTS, SKILLS } from "./config.js";

export const sigmoid = (x) => 1 / (1 + Math.exp(-x));

/** 答對機率(Rasch / 1PL IRT)。 */
export const pCorrect = (theta, difficulty) => sigmoid(theta - difficulty);

/**
 * Elo 式能力值更新。
 * 檢測階段步長較大且隨題數遞減,練習階段步長固定較小。
 */
export function updateTheta(theta, difficulty, correct, { phase, n }) {
  const k = phase === "placement" ? 1.1 / (1 + 0.25 * n) : 0.35;
  return theta + k * ((correct ? 1 : 0) - pCorrect(theta, difficulty));
}

/** 技能掌握度更新,題目越難或越易,答題結果的影響越大。 */
export function updateMastery(m, difficulty, correct, seenBefore) {
  const rate = seenBefore ? 0.28 : 0.4;
  const next = m + rate * ((correct ? 1 : 0) - m) * (1 + 0.3 * Math.abs(difficulty));
  return Math.min(0.97, Math.max(0.05, next));
}

/** 能力值換算為等級索引(0 至 LEVELS.length - 1)。 */
export function thetaToLevel(theta) {
  return Math.max(0, Math.min(LEVELS.length - 1, Math.round(3 + theta * 1.6)));
}

/** 依「(1 - 掌握度) × 配分權重」排序技能,第一個為最優先補強。 */
export function rankSkills(mastery) {
  return Object.keys(SKILLS)
    .map((k) => ({ skill: k, priority: (1 - mastery[k]) * WEIGHTS[k] }))
    .sort((a, b) => b.priority - a.priority);
}

/** 依優先度分配每日練習分鐘數(以 5 分鐘為單位,至少 5 分鐘)。 */
export function allocateMinutes(ranking, total) {
  const sum = ranking.reduce((a, x) => a + x.priority, 0) || 1;
  return ranking.map((x) => ({
    skill: x.skill,
    minutes: Math.max(5, Math.round(((x.priority / sum) * total) / 5) * 5),
  }));
}
