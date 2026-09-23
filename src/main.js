// 程式進入點:載入題庫、串接事件與流程。
import { ITEMS_URL, PLACEMENT_LENGTH, DEFAULT_EXAM_DATE } from "./config.js";
import { createState } from "./state.js";
import { updateTheta, updateMastery, thetaToLevel } from "./model.js";
import { pickPlacementItem, pickPracticeItem } from "./selector.js";
import * as view from "./ui/views.js";

let bank = { items: [], passages: {} };
const state = createState();

async function loadBank() {
  const res = await fetch(ITEMS_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function nextQuestion() {
  const pick = state.phase === "placement" ? pickPlacementItem(bank.items, state) : pickPracticeItem(bank.items, state);
  state.current = pick.item;
  state.reason = pick.reason;
  state.used.add(pick.item.id);
  view.renderQuestion(state, pick.item, bank.passages, answer);
}

function answer(choice) {
  const item = state.current;
  const correct = choice === item.answer;
  const levelBefore = thetaToLevel(state.theta);
  const skillBefore = state.mastery[item.skill];

  state.theta = updateTheta(state.theta, item.difficulty, correct, { phase: state.phase, n: state.placementCount });
  state.mastery[item.skill] = updateMastery(skillBefore, item.difficulty, correct, state.seen[item.skill] > 0);
  state.seen[item.skill]++;
  state.answered++;
  if (correct) state.correct++;
  state.levelHistory.push(thetaToLevel(state.theta));

  const isLastPlacement = state.phase === "placement" && state.placementCount === PLACEMENT_LENGTH - 1;
  view.renderFeedback(
    {
      item, choice, correct, skillBefore,
      skillAfter: state.mastery[item.skill],
      levelBefore, levelAfter: thetaToLevel(state.theta),
      isLastPlacement, isPractice: state.phase === "practice",
    },
    { onNext, onReport: () => openScreen("report") }
  );
}

function onNext() {
  if (state.phase === "placement") {
    state.placementCount++;
    if (state.placementCount >= PLACEMENT_LENGTH) {
      state.phase = "practice";
      view.enableNav();
      openScreen("report");
      return;
    }
  }
  nextQuestion();
}

function openScreen(id) {
  if (id === "practice") return nextQuestion();
  if (id === "report") view.renderReport(state);
  if (id === "parent") view.renderParent(state);
  view.showScreen(id);
}

function bindEvents() {
  document.getElementById("start").onclick = () => {
    state.target = Number(document.getElementById("target").value);
    state.examDate = new Date(document.getElementById("date").value || DEFAULT_EXAM_DATE);
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
  bindEvents();
  try {
    bank = await loadBank();
  } catch (err) {
    view.renderLoadError("題庫載入失敗。若直接以檔案開啟 index.html,請改用本機伺服器(見 README)。");
    console.error(err);
  }
}

init();
