import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INTERESTS, createInterestReview, reviewStage, normalizeInterests } from '../src/review.js';
import { createState, loadState, saveState } from '../src/state.js';
import { validateGenerated, generateReview } from '../server/generate.mjs';

const bank = JSON.parse(readFileSync(new URL('../data/items.json', import.meta.url)));
const item = bank.items[0];
const attempt = (correct, interest = 'sports') => ({ mode: 'interest-review', sourceItemId: item.id, correct, interest });

test('all 48 built-in contexts keep the correct target and four distinct options', () => {
  for (const source of bank.items.filter(i => i.skill === 'vocab')) {
    for (const interest of Object.keys(INTERESTS)) {
      for (const challenge of [false, true]) {
        const history = challenge ? [true, true].map(correct => ({ ...attempt(correct, interest), sourceItemId: source.id })) : [];
        const generated = createInterestReview(source, [interest], history, () => 0.5);
        assert.equal(generated.options[generated.answer], source.targetWord);
        assert.equal(new Set(generated.options).size, 4);
        assert.equal(generated.sourceItemId, source.id);
        assert.equal(generated.stage, challenge ? 'challenge' : 'standard');
        assert.equal(validateGenerated({ ...generated, hint: '' }, source), true, generated.contextId);
      }
    }
  }
});

test('wrong answers add support; two consecutive successes unlock challenge; preferences rotate', () => {
  assert.equal(reviewStage([], item.id), 'standard');
  assert.equal(reviewStage([attempt(false)], item.id), 'supported');
  assert.equal(reviewStage([attempt(true), attempt(false)], item.id), 'supported');
  assert.equal(reviewStage([attempt(false), attempt(true)], item.id), 'standard');
  assert.equal(reviewStage([attempt(true), attempt(true)], item.id), 'challenge');
  const generated = createInterestReview(item, ['sports', 'music'], [attempt(false)]);
  assert.equal(generated.interest, 'music');
  assert.ok(generated.hint);
  assert.throws(() => createInterestReview(item, [], []));
  assert.throws(() => createInterestReview(bank.items.find(i => i.skill === 'gram'), ['sports'], []));
  assert.deepEqual(normalizeInterests(['sports', 'bad', 'sports']), ['sports']);
  const again = createInterestReview(item, ['sports'], [{ ...attempt(false), contextId: `${item.id}:sports:standard` }]);
  assert.equal(again.reused, true);
});

test('existing storage migrates interests and restores new review records', () => {
  let saved;
  globalThis.localStorage = { getItem: () => saved, setItem: (_, value) => { saved = value; } };
  const state = createState();
  delete state.interests;
  saveState(state);
  assert.deepEqual(loadState().interests, []);
  state.interests = ['games'];
  state.attempts.push(attempt(false, 'games'));
  assert.equal(saveState(state), true);
  assert.deepEqual(loadState().interests, ['games']);
  assert.equal(loadState().attempts[0].sourceItemId, item.id);
});

const good = { question: 'At the cold soccer field, put a ____ over your shirt to stay warm.', explanation: '球場很冷，穿 jacket（外套）可以保暖。', hint: '' };
const result = (value = good) => ({ ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] }) });

test('Gemini request fixes target, selects interest and parses structured output', async () => {
  const generated = await generateReview({ item, interests: ['sports'], history: [], apiKey: 'test-key', model: 'gemini-2.5-flash',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
      assert.equal(options.headers['x-goog-api-key'], 'test-key');
      const payload = JSON.parse(options.body);
      const context = JSON.parse(payload.contents[0].parts[0].text);
      assert.equal(context.targetWord, 'jacket');
      assert.equal(context.interest, '運動');
      assert.equal(payload.generationConfig.responseMimeType, 'application/json');
      return result();
    },
  });
  assert.equal(generated.generationSource, 'ai');
  assert.equal(generated.options[generated.answer], 'jacket');
  assert.equal(generated.question, good.question);
});

test('reject answer leakage, duplicates, missing blanks and malformed model responses', async () => {
  assert.equal(validateGenerated({ ...good, question: 'Wear a jacket. Choose ____ to stay warm.' }, item), false);
  assert.equal(validateGenerated({ ...good, hint: 'The word is jacket.' }, item), false);
  assert.equal(validateGenerated(good, item, [good.question]), false);
  assert.equal(validateGenerated({ ...good, question: 'There is no blank in this question.' }, item), false);
  assert.equal(validateGenerated({ ...good, question: '<script>____</script>' }, item), false);
  const args = { item, interests: ['sports'], history: [], apiKey: 'test', model: 'gemini-2.5-flash' };
  await assert.rejects(generateReview({ ...args, apiKey: '' }), /GEMINI_API_KEY/);
  await assert.rejects(generateReview({ ...args, fetchImpl: async () => { throw new Error('network'); } }), /逾時/);
  await assert.rejects(generateReview({ ...args, fetchImpl: async () => ({ ok: false }) }), /暫時無法使用/);
  await assert.rejects(generateReview({ ...args, fetchImpl: async () => result({ question: 'bad' }) }), /未通過/);
  await assert.rejects(generateReview({ ...args, fetchImpl: async () => ({ ok: true, json: async () => ({ candidates: [{ finishReason: 'MAX_TOKENS' }] }) }) }), /未通過/);
});
