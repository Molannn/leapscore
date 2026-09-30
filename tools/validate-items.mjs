// 題庫格式檢查。用法:node tools/validate-items.mjs
import { readFileSync } from "node:fs";
import { INTERESTS } from "../src/review.js";
import { SKILLS } from "../src/config.js";

const bank = JSON.parse(readFileSync(new URL("../data/items.json", import.meta.url), "utf8"));
const errors = [];
const ids = new Set();

for (const it of bank.items) {
  const tag = it.id ?? "(無 id)";
  if (!it.id) errors.push(`${tag}: 缺少 id`);
  if (ids.has(it.id)) errors.push(`${tag}: id 重複`);
  ids.add(it.id);
  if (!(it.skill in SKILLS)) errors.push(`${tag}: skill 必須是 ${Object.keys(SKILLS).join(", ")}`);
  if (typeof it.difficulty !== "number" || it.difficulty < -3 || it.difficulty > 3) errors.push(`${tag}: difficulty 須為 -3 到 3 的數字`);
  if (!Array.isArray(it.options) || it.options.length !== 4) errors.push(`${tag}: options 須為 4 個選項`);
  if (!Number.isInteger(it.answer) || it.answer < 0 || it.answer > 3) errors.push(`${tag}: answer 須為 0 到 3`);
  if (it.passage && !(it.passage in bank.passages)) errors.push(`${tag}: 找不到 passage "${it.passage}"`);
  if (!it.question || !it.explanation) errors.push(`${tag}: 缺少 question 或 explanation`);
  if (it.targetWord || it.reviewContexts) {
    if (it.skill !== "vocab" || !/^[a-z]+$/i.test(it.targetWord || "") || it.options?.[it.answer] !== it.targetWord) errors.push(`${tag}: 複習目標必須與單字題正確答案一致`);
    if (typeof it.reviewHint !== "string" || !it.reviewHint.trim()) errors.push(`${tag}: 缺少複習提示`);
    for (const interest of Object.keys(INTERESTS)) {
      for (const stage of ["standard", "challenge"]) {
        const context = it.reviewContexts?.[interest]?.[stage];
        if (typeof context?.question !== "string" || (context.question.match(/____/g) || []).length !== 1 || !context.explanation) errors.push(`${tag}: ${interest}/${stage} 情境題格式錯誤`);
      }
    }
  }
}

const count = Object.fromEntries(Object.keys(SKILLS).map((k) => [k, 0]));
bank.items.forEach((it) => count[it.skill] !== undefined && count[it.skill]++);

if (errors.length) {
  console.error(`題庫檢查失敗,共 ${errors.length} 項:\n` + errors.join("\n"));
  process.exit(1);
}
console.log(`題庫檢查通過:${bank.items.length} 題`, count);
