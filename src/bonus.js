import { PLACEMENT_LENGTH } from './config.js';

export const BONUS_QUESTION = {
  question: '以下這張圖是什麼？',
  image: 'assets/images/palace-bonus.jpg',
  options: ['皇額娘她推了熹娘娘', '臣妾做不到', '賤人就是矯情', '這幾年的情愛與時光，終究是錯付了'],
  answer: 0,
};

export function qualifiesForBonus(attempts) {
  const placement = attempts.filter(a => a.phase === 'placement' && a.mode !== 'interest-review');
  return placement.length === PLACEMENT_LENGTH && placement.every(a => a.correct === false);
}

export function completeBonus(state, choice) {
  if (state.phase !== 'bonus' || state.bonus?.status !== 'pending') return false;
  if (choice !== null && (!Number.isInteger(choice) || choice < 0 || choice >= BONUS_QUESTION.options.length)) return false;
  const correct = choice === BONUS_QUESTION.answer;
  state.bonus = { status: choice === null ? 'skipped' : 'answered', choice, correct, points: correct ? 1 : 0, answeredAt: new Date().toISOString() };
  state.phase = 'practice';
  return true;
}
