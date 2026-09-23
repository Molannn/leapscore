// 畫面渲染:只負責把狀態畫到 DOM 上,不包含演算法。
import { SKILLS, LEVELS, DAILY_MINUTES, PLACEMENT_LENGTH } from "../config.js";
import { thetaToLevel, rankSkills, allocateMinutes } from "../model.js";
import { daysUntil } from "../state.js";

const $ = (id) => document.getElementById(id);
const SCREENS = ["intro", "quiz", "report", "parent"];
const LETTERS = "ABCD";

export function showScreen(id) {
  SCREENS.forEach((s) => $(s).classList.toggle("hidden", s !== id));
  document.querySelectorAll("nav button").forEach((b) => {
    const active = b.dataset.go === id || (id === "quiz" && b.dataset.go === "practice");
    b.setAttribute("aria-current", active ? "true" : "false");
  });
  window.scrollTo(0, 0);
}

export function enableNav() {
  document.querySelectorAll("nav button").forEach((b) => (b.disabled = false));
}

export function renderTargetOptions(selected) {
  const sel = $("target");
  sel.innerHTML = "";
  for (let v = LEVELS.length - 1; v >= 2; v--) {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = LEVELS[v];
    o.selected = v === selected;
    sel.appendChild(o);
  }
}

const difficultyLabel = (b) => (b > 0.6 ? "高" : b > -0.2 ? "中" : "基礎");

export function renderQuestion(state, item, passages, onAnswer) {
  $("qmeta").textContent =
    state.phase === "placement"
      ? `程度檢測 第 ${state.placementCount + 1} / ${PLACEMENT_LENGTH} 題`
      : `今日練習 第 ${state.answered - PLACEMENT_LENGTH + 1} 題`;
  $("qskill").textContent = `${SKILLS[item.skill]}  難度 ${difficultyLabel(item.difficulty)}`;

  const why = $("why");
  why.classList.toggle("hidden", state.phase === "placement");
  why.textContent = state.reason;

  const passage = item.passage ? passages[item.passage] : "";
  $("passage").classList.toggle("hidden", !passage);
  $("passage").textContent = passage;
  $("qtext").textContent = item.question;

  const box = $("opts");
  box.innerHTML = "";
  item.options.forEach((text, i) => {
    const b = document.createElement("button");
    b.className = "opt";
    const letter = document.createElement("b");
    letter.textContent = LETTERS[i];
    const span = document.createElement("span");
    span.textContent = text;
    b.append(letter, span);
    b.onclick = () => onAnswer(i);
    box.appendChild(b);
  });
  $("fb").classList.add("hidden");
  showScreen("quiz");
}

export function renderFeedback({ item, choice, correct, skillBefore, skillAfter, levelBefore, levelAfter, isLastPlacement, isPractice }, handlers) {
  document.querySelectorAll(".opt").forEach((b, j) => {
    b.disabled = true;
    if (j === item.answer) b.classList.add("right");
    else if (j === choice) b.classList.add("wrong");
  });
  const fb = $("fb");
  fb.classList.remove("hidden");
  fb.innerHTML = `
    <div><span class="mark ${correct ? "r" : "w"}">${correct ? "正確" : "再想想"}</span><span id="expl"></span></div>
    <div class="delta">${SKILLS[item.skill]}掌握度 ${Math.round(skillBefore * 100)}% 變為 ${Math.round(skillAfter * 100)}%  預估等級 ${LEVELS[levelBefore]} 變為 ${LEVELS[levelAfter]}</div>
    <div class="row">
      <button class="btn" id="next">${isLastPlacement ? "查看診斷報告" : "下一題"}</button>
      ${isPractice ? '<button class="btn ghost" id="toRep">看報告</button>' : ""}
    </div>`;
  $("expl").textContent = item.explanation;
  $("next").onclick = handlers.onNext;
  if (isPractice) $("toRep").onclick = handlers.onReport;
  $("next").focus();
}

export function renderReport(state) {
  const level = thetaToLevel(state.theta);
  const gap = state.target - level;
  const max = LEVELS.length - 1;
  $("bigScore").textContent = LEVELS[level];
  $("gapText").textContent =
    gap > 0
      ? `距離目標 ${LEVELS[state.target]} 還差 ${gap} 個等級,考前剩 ${daysUntil(state.examDate)} 天。`
      : `已達目標 ${LEVELS[state.target]},建議維持練習並挑戰更高難度。`;
  $("fill").style.width = (level / max) * 100 + "%";
  $("tgt").style.left = `calc(${(state.target / max) * 100}% - 1px)`;

  const ranking = rankSkills(state.mastery);
  const weakest = ranking[0].skill;
  $("skills").innerHTML = Object.keys(SKILLS)
    .map((k) => {
      const pct = Math.round(state.mastery[k] * 100);
      return `<div class="sk${k === weakest ? " weak" : ""}"><span>${SKILLS[k]}</span><div class="bar"><i style="width:${pct}%"></i></div><span class="pct">${pct}%</span></div>`;
    })
    .join("");

  $("planTitle").textContent = `每日練習配置(${DAILY_MINUTES} 分鐘)`;
  $("plan").innerHTML = allocateMinutes(ranking, DAILY_MINUTES)
    .map((x) => `<div><span>${SKILLS[x.skill]}</span><span>${x.minutes} 分鐘</span></div>`)
    .join("");
}

export function renderParent(state) {
  const level = thetaToLevel(state.theta);
  const acc = state.answered ? Math.round((state.correct / state.answered) * 100) : 0;
  const ranking = rankSkills(state.mastery);
  const max = LEVELS.length - 1;

  $("parentLead").textContent =
    `本週共完成 ${state.answered} 題,目前預估 ${LEVELS[level]},目標 ${LEVELS[state.target]},考前剩 ${daysUntil(state.examDate)} 天。`;
  $("stats").innerHTML =
    `<div class="stat"><b>${state.answered}</b><span>完成題數</span></div>` +
    `<div class="stat"><b>${acc}%</b><span>答對率</span></div>` +
    `<div class="stat"><b>${LEVELS[level]}</b><span>預估等級</span></div>`;

  const h = state.levelHistory.length ? state.levelHistory : [level];
  const n = h.length;
  const X = (i) => (n === 1 ? 300 : 30 + i * (540 / (n - 1)));
  const Y = (v) => 140 - (v / max) * 120;
  let svg = `<line x1="30" x2="570" y1="${Y(state.target)}" y2="${Y(state.target)}" stroke="currentColor" stroke-dasharray="4 4" opacity=".5"/>`;
  svg += `<text x="570" y="${Y(state.target) - 6}" text-anchor="end" font-size="12" fill="currentColor" opacity=".7">目標 ${LEVELS[state.target]}</text>`;
  svg += `<polyline fill="none" stroke="var(--red)" stroke-width="2.5" points="${h.map((v, i) => X(i) + "," + Y(v)).join(" ")}"/>`;
  h.forEach((v, i) => (svg += `<circle cx="${X(i)}" cy="${Y(v)}" r="3.5" fill="var(--red)"/>`));
  $("trend").style.color = "var(--ink)";
  $("trend").innerHTML = svg;

  const [a, b] = ranking;
  $("focus").textContent =
    `孩子目前最需要加強的是「${SKILLS[a.skill]}」(掌握度 ${Math.round(state.mastery[a.skill] * 100)}%),其次為「${SKILLS[b.skill]}」。` +
    `系統已自動將每日練習時間優先分配到這兩項,並在答錯的題型安排間隔複習。`;
}

export function renderLoadError(message) {
  $("intro").insertAdjacentHTML("beforeend", `<p class="why" role="alert"></p>`);
  $("intro").lastElementChild.textContent = message;
  $("start").disabled = true;
}
