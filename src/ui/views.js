// 畫面渲染:只負責把狀態畫到 DOM 上,不包含演算法。
import { SKILLS, LEVELS, DAILY_MINUTES, PLACEMENT_LENGTH } from "../config.js";
import { thetaToLevel, rankSkills, allocateMinutes } from "../model.js";
import { INTERESTS, reviewHistory } from "../review.js";
import { daysUntil } from "../state.js";

const $ = (id) => document.getElementById(id);
const SCREENS = ["intro", "quiz", "report", "parent", "analysis", "review"];
const LETTERS = "ABCD";

export function showScreen(id) {
  SCREENS.forEach((s) => $(s).classList.toggle("hidden", s !== id));
  document.querySelectorAll("nav button").forEach((b) => {
    const active = b.dataset.go === id || (id === "quiz" && b.dataset.go === "practice") || (id === "review" && b.dataset.go === "analysis");
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

export function showStorageWarning() {
  $("storageWarning").classList.remove("hidden");
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

const accuracy = (attempts) => attempts.length
  ? `${Math.round(attempts.filter((a) => a.correct).length / attempts.length * 100)}%`
  : "尚無紀錄";

export function renderAnalysis(state, handlers = {}) {
  renderInterests(state, handlers.onInterests);
  const attempts = state.attempts;
  const groups = new Map();
  attempts.forEach((attempt) => {
    const key = attempt.sourceItemId || attempt.itemId;
    const group = groups.get(key) || { latest: attempt, mistakes: [] };
    group.latest = attempt;
    if (!attempt.correct) group.mistakes.push(attempt);
    groups.set(key, group);
  });
  const wrong = [...groups.values()].filter((g) => g.mistakes.length);
  const pending = wrong.filter((g) => !g.latest.correct).length;
  const stats = $("learningStats");
  stats.replaceChildren();
  [[attempts.length, "累積作答次數"], [accuracy(attempts), "累積答對率"], [pending, "待加強題數"]].forEach(([value, label]) => {
    const card = element("div", undefined, "stat");
    card.append(element("b", value), element("span", label));
    stats.append(card);
  });

  const assessed = attempts.filter(a => a.mode !== "interest-review");
  const recent = assessed.slice(-10);
  const previous = assessed.slice(-20, -10);
  let insight = attempts.length
    ? `最近 ${recent.length} 次檢測／一般練習，答對率為 ${accuracy(recent)}（不含情境複習）。`
    : "完成答題後，這裡會顯示你的學習狀況。";
  if (recent.length === 10 && previous.length === 10) {
    const difference = (recent.filter((a) => a.correct).length - previous.filter((a) => a.correct).length) * 10;
    insight += difference === 0 ? "與前 10 次持平。" : `比前 10 次${difference > 0 ? "增加" : "減少"} ${Math.abs(difference)} 個百分點。`;
    insight += "題目難度不同，答對率變化僅供參考。";
  }
  const practiced = Object.keys(SKILLS).filter((key) => attempts.some((a) => a.skill === key));
  if (practiced.length) {
    const priority = rankSkills(state.mastery).filter((entry) => practiced.includes(entry.skill))[0];
    insight += `依技能掌握度與配分權重，建議優先加強「${SKILLS[priority.skill]}」。`;
  }
  $("learningInsight").textContent = insight;
  const skills = $("skillAnalysis");
  skills.replaceChildren();
  Object.entries(SKILLS).forEach(([key, label]) => {
    const records = attempts.filter((a) => a.skill === key);
    const mistakes = records.filter((a) => !a.correct).length;
    const card = element("div", undefined, "sheet");
    card.append(element("h3", label), element("p", `作答 ${records.length} 次 · 答錯 ${mistakes} 次`),
      element("p", `答對率：${accuracy(records)}`),
      element("p", records.length ? `預估掌握度：${Math.round(state.mastery[key] * 100)}%` : "預估掌握度：尚待評估", "muted"));
    skills.append(card);
  });

  const filter = $("wrongSkill");
  if (filter.options.length === 1) {
    Object.entries(SKILLS).forEach(([key, label]) => {
      const option = element("option", label);
      option.value = key;
      filter.append(option);
    });
  }
  const renderWrong = () => {
    const status = $("wrongStatus").value;
    const selected = wrong.filter((g) =>
      (filter.value === "all" || g.latest.skill === filter.value) &&
      (status === "all" || (status === "corrected" ? g.latest.correct : !g.latest.correct))
    ).sort((a, b) => b.mistakes.at(-1).answeredAt.localeCompare(a.mistakes.at(-1).answeredAt));
    $("wrongCount").textContent = `共 ${wrong.length} 題曾答錯，目前顯示 ${selected.length} 題`;
    const container = $("wrongItems");
    container.replaceChildren();
    if (!selected.length) {
      container.append(element("p", wrong.length ? "此篩選條件下沒有錯題。" : "目前沒有錯題紀錄，繼續練習累積學習成果！", "sheet"));
    }
    selected.forEach((group) => {
      const item = group.mistakes.at(-1);
      const card = element("article", undefined, "sheet wrong-card");
      card.append(element("p", `${SKILLS[item.skill]} · ${item.sourceItemId || item.itemId} · ${group.latest.correct ? "最近已答對" : "待加強"}`, "review-label"),
        element("h3", item.question),
        element("p", `答錯 ${group.mistakes.length} 次 · 最近錯答：${new Date(item.answeredAt).toLocaleString("zh-TW")} · ${item.phase === "placement" ? "程度檢測" : "練習"}`, "muted"));
      if (item.passage) {
        const details = element("details");
        details.append(element("summary", "閱讀文章"), element("p", item.passage, "passage"));
        card.append(details);
      }
      card.append(element("p", `上次錯選：${LETTERS[item.choice]}. ${item.options[item.choice]}`, "wrong-answer"),
        element("p", `正確答案：${LETTERS[item.answer]}. ${item.options[item.answer]}`, "correct-answer"));
      const explanation = element("details");
      explanation.append(element("summary", "查看詳解"), element("p", item.explanation));
      card.append(explanation);
      if (handlers.canReview?.(item.sourceItemId || item.itemId)) {
        const id = item.sourceItemId || item.itemId;
        const reviews = reviewHistory(attempts, id);
        if (reviews.length) card.append(element("p", `情境複習 ${reviews.length} 次 · 答對率 ${accuracy(reviews)} · 最近${reviews.at(-1).correct ? "答對" : "答錯"}`, "muted"));
        if (item.mode === "interest-review") card.append(element("p", `最近錯答情境：${INTERESTS[item.interest]} · ${item.generationSource === "ai" ? "Gemini 生成" : "內建題"}`, "muted"));
        const review = element("button", "依興趣生成複習題", "btn");
        review.onclick = () => handlers.onReview?.(id);
        card.append(review);
      }
      container.append(card);
    });
  };
  filter.onchange = renderWrong;
  $("wrongStatus").onchange = renderWrong;
  renderWrong();
}

function renderInterests(state, onChange) {
  const box = $("interestOptions");
  box.replaceChildren(element("legend", "我感興趣的主題"));
  const updateStatus = () => {
    $("interestStatus").textContent = state.interests.length
      ? `目前選擇：${state.interests.map(k => INTERESTS[k]).join("、")}。變更會自動儲存。`
      : "尚未選擇興趣，請先選擇至少一項主題。";
  };
  Object.entries(INTERESTS).forEach(([key, title]) => {
    const label = element("label", undefined, "interest-choice");
    const input = element("input");
    input.type = "checkbox";
    input.value = key;
    input.checked = state.interests.includes(key);
    input.onchange = () => {
      state.interests = input.checked ? [...new Set([...state.interests, key])] : state.interests.filter(k => k !== key);
      onChange?.(state.interests);
      updateStatus();
    };
    label.append(input, element("span", title));
    box.append(label);
  });
  updateStatus();
  const reviews = state.attempts.filter(a => a.mode === "interest-review");
  $("reviewSummary").textContent = reviews.length
    ? `已完成 ${reviews.length} 次情境複習 · 答對率 ${accuracy(reviews)} · 複習過 ${new Set(reviews.map(a => a.sourceItemId)).size} 個單字`
    : "還沒有情境複習紀錄。從下方單字錯題開始。";
}

export function prepareReview(item, interests) {
  $("reviewContext").textContent = `針對原錯題 ${item.id} 的單字，換個情境再試一次。${interests.length ? `主題：${interests.map(k => INTERESTS[k]).join("、")}` : ""}`;
  $("reviewQuestion").classList.add("hidden");
  $("reviewStatus").textContent = "";
  $("generateReview").disabled = !interests.length;
  $("generateReview").textContent = "依興趣生成複習題";
  $("fallbackReview").classList.add("hidden");
}

export function reviewLoading() {
  $("reviewQuestion").classList.add("hidden");
  $("reviewStatus").textContent = "正在依你的興趣與複習表現準備題目…";
  $("generateReview").disabled = true;
  $("fallbackReview").classList.add("hidden");
}

export function reviewError(message, allowRetry = true) {
  $("reviewStatus").textContent = message;
  $("generateReview").disabled = !allowRetry;
  $("generateReview").textContent = "重新生成";
  $("fallbackReview").classList.toggle("hidden", !allowRetry);
}

export function renderReviewQuestion(item, onAnswer) {
  const stages = { supported: "提示練習", standard: "情境練習", challenge: "進階情境" };
  $("reviewStatus").textContent = `${item.generationSource === "ai" ? "Gemini 即時生成" : "內建情境題"} · ${INTERESTS[item.interest]} · ${stages[item.stage]}${item.reused ? " · 再次練習熟悉情境" : ""}`;
  $("reviewQuestion").classList.remove("hidden");
  $("reviewText").textContent = item.question;
  $("reviewHint").textContent = item.hint ? `提示：${item.hint}` : "";
  $("reviewHint").classList.toggle("hidden", !item.hint);
  $("reviewFeedback").classList.add("hidden");
  $("reviewOptions").replaceChildren();
  item.options.forEach((text, index) => {
    const button = element("button", undefined, "opt");
    button.append(element("b", LETTERS[index]), element("span", text));
    button.onclick = () => onAnswer(index);
    $("reviewOptions").append(button);
  });
  $("generateReview").disabled = true;
  $("generateReview").textContent = "作答後再生成下一題";
  $("reviewOptions").firstElementChild?.focus();
}

export function renderReviewFeedback(item, choice, correct, history) {
  Array.from($("reviewOptions").children).forEach((button, index) => {
    button.disabled = true;
    if (index === item.answer) button.classList.add("right");
    else if (index === choice) button.classList.add("wrong");
  });
  const feedback = $("reviewFeedback");
  feedback.replaceChildren(element("strong", correct ? "答對了！" : "再練一次，幫助記住這個單字。", correct ? "correct-answer" : "wrong-answer"),
    element("p", item.explanation),
    element("p", `這個單字已複習 ${history.length} 次，答對 ${history.filter(a => a.correct).length} 次。`));
  const next = !correct ? "下次會加入提示與更明確的線索。"
    : history.length >= 2 && history.slice(-2).every(a => a.correct) ? "已連續答對 2 次，下次挑戰較間接的情境。" : "再換個情境，確認你能運用這個單字。";
  feedback.append(element("p", next, "muted"));
  feedback.classList.remove("hidden");
  $("generateReview").disabled = false;
  $("generateReview").textContent = "生成下一道情境題";
  $("generateReview").focus();
}
