// 使用者學習狀態，答題後儲存於目前瀏覽器的 localStorage。
import { normalizeInterests } from "./review.js";
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
    attempts: [],
    interests: [],
    current: null,
    reason: "",
  };
}

export function daysUntil(date) {
  return Math.max(0, Math.ceil((date - new Date()) / 864e5));
}

const STORAGE_KEY = "leapscore-learning-v1";

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, used: [...state.used] }));
    return true;
  } catch {
    return false;
  }
}

export function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Array.isArray(saved.attempts) || !Array.isArray(saved.used)) return createState();
    if (!["placement", "practice"].includes(saved.phase) || !Number.isFinite(saved.theta)) return createState();
    if (!Object.keys(SKILLS).every((k) => Number.isFinite(saved.mastery?.[k]) && Number.isFinite(saved.seen?.[k]))) return createState();
    const examDate = new Date(saved.examDate);
    if (!Number.isFinite(examDate.getTime())) return createState();
    return { ...createState(), ...saved, examDate, interests: normalizeInterests(saved.interests), used: new Set(saved.used), current: null };
  } catch {
    return createState();
  }
}
