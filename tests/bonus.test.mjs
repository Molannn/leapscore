import test from 'node:test';
import assert from 'node:assert/strict';
import { BONUS_QUESTION, qualifiesForBonus, completeBonus } from '../src/bonus.js';
import { createState, loadState, saveState } from '../src/state.js';

const placement = (count = 6) => Array.from({ length: count }, (_, i) => ({ itemId: `Q${i}`, phase: 'placement', correct: false }));

test('bonus requires exactly six incorrect placement answers', () => {
  assert.equal(qualifiesForBonus(placement()), true);
  assert.equal(qualifiesForBonus(placement(5)), false);
  assert.equal(qualifiesForBonus(placement(7)), false);
  assert.equal(qualifiesForBonus([...placement(5), { phase: 'placement', correct: true }]), false);
  assert.equal(qualifiesForBonus(placement().map(a => ({ ...a, phase: 'practice' }))), false);
  assert.equal(qualifiesForBonus([...placement(), { phase: 'practice', correct: true }]), true);
});

test('A awards one separate bonus point without changing English learning records', () => {
  const state = createState();
  state.phase = 'bonus'; state.bonus = { status: 'pending' }; state.attempts = placement();
  const before = JSON.stringify({ theta: state.theta, mastery: state.mastery, attempts: state.attempts, answered: state.answered, correct: state.correct });
  assert.equal(BONUS_QUESTION.options[0], '皇額娘她推了熹娘娘');
  assert.equal(completeBonus(state, 0), true);
  assert.equal(state.bonus.points, 1);
  assert.equal(state.phase, 'practice');
  assert.equal(completeBonus(state, 0), false);
  assert.equal(state.bonus.points, 1);
  assert.equal(JSON.stringify({ theta: state.theta, mastery: state.mastery, attempts: state.attempts, answered: state.answered, correct: state.correct }), before);
});

test('wrong answers and skip finish without extra points; invalid choices are ignored', () => {
  for (const choice of [1, 2, 3, null]) {
    const state = { ...createState(), phase: 'bonus', bonus: { status: 'pending' } };
    assert.equal(completeBonus(state, 4), false);
    assert.equal(state.phase, 'bonus');
    assert.equal(completeBonus(state, choice), true);
    assert.equal(state.bonus.points, 0);
    assert.equal(state.bonus.status, choice === null ? 'skipped' : 'answered');
    assert.equal(state.phase, 'practice');
  }
});

test('pending bonus survives refresh and completed bonus is retained', () => {
  let value;
  globalThis.localStorage = { getItem: () => value, setItem: (_, saved) => { value = saved; } };
  const state = { ...createState(), phase: 'bonus', bonus: { status: 'pending' } };
  saveState(state);
  const restored = loadState();
  assert.equal(restored.phase, 'bonus');
  assert.equal(restored.bonus.status, 'pending');
  completeBonus(restored, 0); saveState(restored);
  assert.equal(loadState().bonus.points, 1);
  assert.equal(loadState().phase, 'practice');
});
