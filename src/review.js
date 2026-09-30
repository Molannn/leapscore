// 單字複習：保留學習目標，依興趣與最近表現選擇情境及提示。
export const INTERESTS = {
  sports: "運動", games: "遊戲", music: "音樂", animals: "動物",
};

export function normalizeInterests(values) {
  return Array.isArray(values) ? [...new Set(values.filter((key) => Object.hasOwn(INTERESTS, key)))] : [];
}

export function reviewHistory(attempts, sourceItemId) {
  return attempts.filter((a) => a.mode === "interest-review" && a.sourceItemId === sourceItemId);
}

export function reviewStage(attempts, sourceItemId) {
  const history = reviewHistory(attempts, sourceItemId);
  if (history.length && !history.at(-1).correct) return "supported";
  if (history.length >= 2 && history.slice(-2).every((a) => a.correct)) return "challenge";
  return "standard";
}

export function canReview(item) {
  return item?.skill === "vocab" && Boolean(item.targetWord && item.reviewContexts);
}

export function createInterestReview(item, preferences, attempts, random = Math.random) {
  if (!canReview(item)) throw new Error("這個單字尚未提供興趣情境題。");
  const interests = normalizeInterests(preferences).filter((key) => item.reviewContexts[key]);
  if (!interests.length) throw new Error("請先選擇至少一項興趣，再開始複習。");
  const history = reviewHistory(attempts, item.id);
  const stage = reviewStage(attempts, item.id);
  // 優先使用較少練過的興趣；同次數時依偏好順序輪替。
  const interest = [...interests].sort((a, b) =>
    history.filter((x) => x.interest === a).length - history.filter((x) => x.interest === b).length
  )[0];
  const contexts = item.reviewContexts[interest];
  const variant = stage === "challenge" ? "challenge" : "standard";
  const context = contexts[variant];
  const contextId = `${item.id}:${interest}:${variant}`;
  const options = [...item.options];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return {
    id: `review:${item.id}:${history.length + 1}`,
    sourceItemId: item.id, skill: "vocab", targetWord: item.targetWord,
    mode: "interest-review", interest, stage, contextId,
    reused: history.some((a) => a.contextId === contextId),
    question: context.question, options, answer: options.indexOf(item.targetWord),
    explanation: context.explanation,
    hint: stage === "supported" ? item.reviewHint : "",
    // 僅供原題追溯；未校準的情境題不更新 theta。
    difficulty: item.difficulty,
  };
}
