// 選題邏輯:決定下一題要出什麼。
import { SKILLS, WEIGHTS, EXAM_LABEL } from "./config.js";
import { rankSkills } from "./model.js";

/** 從候選題中挑出難度最接近目前能力值的一題(資訊量最大)。 */
function closestTo(theta, pool) {
  return [...pool].sort((a, b) => Math.abs(a.difficulty - theta) - Math.abs(b.difficulty - theta))[0];
}

/** 檢測階段:先平均覆蓋各技能,再依能力值選難度。 */
export function pickPlacementItem(items, state) {
  const minSeen = Math.min(...Object.values(state.seen));
  const unused = items.filter((x) => !state.used.has(x.id));
  const balanced = unused.filter((x) => state.seen[x.skill] === minSeen);
  return { item: closestTo(state.theta, balanced.length ? balanced : unused), reason: "" };
}

/** 練習階段:鎖定最需補強的技能,題目用完則重置該技能的使用紀錄。 */
export function pickPracticeItem(items, state) {
  const skill = rankSkills(state.mastery)[0].skill;
  let pool = items.filter((x) => x.skill === skill && !state.used.has(x.id));
  if (!pool.length) {
    items.filter((x) => x.skill === skill).forEach((x) => state.used.delete(x.id));
    pool = items.filter((x) => x.skill === skill && x.id !== state.current?.id);
  }
  const reason =
    `你的「${SKILLS[skill]}」掌握度目前 ${Math.round(state.mastery[skill] * 100)}%,` +
    `在${EXAM_LABEL}題目中占比約 ${Math.round(WEIGHTS[skill] * 100)}%,是目前最值得補強的技能。` +
    `這題難度接近你現在的能力,答對與答錯都能提供最多資訊。`;
  return { item: closestTo(state.theta, pool), reason };
}
