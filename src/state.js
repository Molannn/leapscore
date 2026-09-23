// 使用者學習狀態。目前僅存在記憶體中,重新整理即重置。
import { SKILLS, DEFAULT_TARGET, DEFAULT_EXAM_DATE } from "./config.js";

export function createState() {
  const perSkill = (v) => Object.fromEntries(Object.keys(SKILLS).map((k) => [k, v]));
  return {
    phase: "placement", // "placement" | "practice"
    theta: 0,
    target: DEFAULT_TARGET,
    examDate: new Date(DEFAULT_EXAM_DATE),
    placementCount: 0,
    mastery: perSkill(0.5),
    seen: perSkill(0),
    used: new Set(),
    answered: 0,
    correct: 0,
    levelHistory: [],
    current: null,
    reason: "",
  };
}

export function daysUntil(date) {
  return Math.max(0, Math.ceil((date - new Date()) / 864e5));
}
