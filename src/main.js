// 程式進入點:載入題庫、串接事件與流程。
import { ITEMS_URL, PLACEMENT_LENGTH, DEFAULT_EXAM_DATE } from "./config.js";
import { loadState, saveState } from "./state.js";
import { updateTheta, updateMastery, thetaToLevel } from "./model.js";
import { pickPlacementItem, pickPracticeItem } from "./selector.js";
import { createInterestReview, canReview, reviewHistory } from "./review.js";
import { requestReview } from "./api.js";
import * as view from "./ui/views.js";

let bank = { items: [], passages: {} };
const state = loadState();
let bankReady = false;
let reviewSource = null;
let activeReview = null;
let reviewAnswered = false;
let pendingReview = null;

function persist() {
  if (!saveState(state)) view.showStorageWarning();
}

async function loadBank() {
  const res = await fetch(ITEMS_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function nextQuestion() {
  const pick = state.phase === "placement" ? pickPlacementItem(bank.items, state) : pickPracticeItem(bank.items, state);
  if (!pick.item) return;
  state.currentAnswered = false;
  state.current = pick.item;
  state.reason = pick.reason;
  state.used.add(pick.item.id);
  view.renderQuestion(state, pick.item, bank.passages, answer);
}

function answer(choice) {
  const item = state.current;
  if (!item || state.currentAnswered) return;
  state.currentAnswered = true;
  const correct = choice === item.answer;
  const levelBefore = thetaToLevel(state.theta);
  const skillBefore = state.mastery[item.skill];

  state.theta = updateTheta(state.theta, item.difficulty, correct, { phase: state.phase, n: state.placementCount });
  state.mastery[item.skill] = updateMastery(skillBefore, item.difficulty, correct, state.seen[item.skill] > 0);
  state.seen[item.skill]++;
  state.answered++;
  if (correct) state.correct++;
  state.levelHistory.push(thetaToLevel(state.theta));

  state.attempts.push({
    itemId: item.id, skill: item.skill, question: item.question,
    options: [...item.options], answer: item.answer, choice, correct,
    explanation: item.explanation, passage: bank.passages[item.passage] || "",
    phase: state.phase, answeredAt: new Date().toISOString(),
  });
  if (state.phase === "placement") state.placementCount++;
  const isLastPlacement = state.phase === "placement" && state.placementCount >= PLACEMENT_LENGTH;
  if (isLastPlacement) {
    state.phase = "practice";
    view.enableNav();
  }
  persist();
  view.renderFeedback(
    {
      item, choice, correct, skillBefore,
      skillAfter: state.mastery[item.skill],
      levelBefore, levelAfter: thetaToLevel(state.theta),
      isLastPlacement, isPractice: state.phase === "practice" && !isLastPlacement,
    },
    { onNext: isLastPlacement ? () => openScreen("report") : onNext, onReport: () => openScreen("report") }
  );
}

function onNext() {
  nextQuestion();
}

function openScreen(id) {
  pendingReview?.abort();
  pendingReview = null;
  if (id === "practice") return nextQuestion();
  if (id === "report") view.renderReport(state);
  if (id === "analysis") view.renderAnalysis(state, {
    canReview: (id) => canReview(bank.items.find(item => item.id === id)),
    onReview: startReview,
    onInterests: (interests) => { state.interests = interests; persist(); },
  });
  if (id === "parent") view.renderParent(state);
  view.showScreen(id);
}

function startReview(sourceItemId) {
  const item = bank.items.find(x => x.id === sourceItemId);
  if (!canReview(item) || !state.attempts.some(a => !a.correct && (a.sourceItemId || a.itemId) === sourceItemId)) return;
  pendingReview?.abort();
  pendingReview = null;
  reviewSource = item;
  activeReview = null;
  view.showScreen("review");
  view.prepareReview(item, state.interests);
  if (!state.interests.length) {
    view.reviewError("請先返回學習分析，選擇至少一項興趣。", false);
    return;
  }
  generateReview();
}

async function generateReview(useFallback = false) {
  if (!reviewSource || !state.interests.length || pendingReview) return;
  const source = reviewSource;
  const controller = new AbortController();
  pendingReview = controller;
  activeReview = null;
  view.reviewLoading();
  try {
    let item;
    if (useFallback) {
      item = { ...createInterestReview(source, state.interests, state.attempts), generationSource: "built-in" };
    } else {
      const history = reviewHistory(state.attempts, source.id).slice(-30).map(a => ({
        correct: a.correct, question: a.question, interest: a.interest,
      }));
      item = await requestReview({ sourceItemId: source.id, interests: state.interests, history }, {
        signal: controller.signal,
        onConnecting: () => view.reviewLoading("正在連線到出題服務，首次開啟可能需要稍等片刻…"),
      });
      if (!item || item.sourceItemId !== source.id || item.targetWord !== source.targetWord ||
          !state.interests.includes(item.interest) || !Array.isArray(item.options) || item.options.length !== 4 ||
          item.options[item.answer] !== source.targetWord || typeof item.question !== "string" ||
          typeof item.explanation !== "string") throw new Error("出題資料不完整，請重試。");
    }
    if (pendingReview !== controller) return;
    activeReview = item;
    reviewAnswered = false;
    view.renderReviewQuestion(item, answerReview);
  } catch (error) {
    if (pendingReview !== controller) return;
    view.reviewError(["AbortError", "TimeoutError"].includes(error.name) ? "出題逾時，請重試或改用內建情境題。" : error.message);
  } finally {
    if (pendingReview === controller) pendingReview = null;
  }
}

function answerReview(choice) {
  if (!activeReview || reviewAnswered) return;
  reviewAnswered = true;
  const item = activeReview;
  const correct = choice === item.answer;
  state.attempts.push({
    itemId: `review:${crypto.randomUUID()}`, sourceItemId: item.sourceItemId,
    mode: "interest-review", generationSource: item.generationSource,
    interest: item.interest, stage: item.stage, contextId: item.contextId,
    skill: "vocab", targetWord: item.targetWord, question: item.question,
    options: [...item.options], answer: item.answer, explanation: item.explanation,
    hint: item.hint, choice, correct, phase: "practice", answeredAt: new Date().toISOString(),
  });
  // 情境題未校準難度，只更新複習紀錄，不變更會考能力估計。
  persist();
  view.renderReviewFeedback(item, choice, correct, reviewHistory(state.attempts, item.sourceItemId));
}

function bindEvents() {
  document.getElementById("generateReview").onclick = () => generateReview();
  document.getElementById("fallbackReview").onclick = () => generateReview(true);
  document.getElementById("start").onclick = () => {
    if (!bankReady) return;
    if (state.phase === "practice") return openScreen("analysis");
    state.target = Number(document.getElementById("target").value);
    state.examDate = new Date(document.getElementById("date").value || DEFAULT_EXAM_DATE);
    persist();
    nextQuestion();
  };
  document.querySelectorAll("[data-go]").forEach((b) =>
    b.addEventListener("click", () => {
      if (state.phase === "placement") return;
      openScreen(b.dataset.go);
    })
  );
}

async function init() {
  view.renderTargetOptions(state.target);
  document.getElementById("date").value = state.examDate.toISOString().slice(0, 10);
  document.getElementById("start").disabled = true;
  bindEvents();
  try {
    bank = await loadBank();
    bankReady = true;
    document.getElementById("start").disabled = false;
    if (state.phase === "practice") {
      view.enableNav();
      openScreen("analysis");
    } else if (state.placementCount) {
      document.getElementById("start").textContent = "繼續程度檢測";
    }
  } catch (err) {
    view.renderLoadError("題庫載入失敗。若直接以檔案開啟 index.html,請改用本機伺服器(見 README)。");
    console.error(err);
  }
}

init();
