import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/index.mjs';

async function start(t, options) {
  const server = createApp(options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}`;
}
const post = (url, body, headers = {}) => fetch(`${url}/api/review`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
});
const request = { sourceItemId: 'V01', interests: ['sports'], history: [] };

test('public assets work; secrets and server files are inaccessible', async t => {
  const url = await start(t, { apiKey: '' });
  assert.equal((await fetch(url)).status, 200);
  assert.equal((await fetch(`${url}/src/review.js`)).status, 200);
  for (const path of ['/.env', '/.git/config', '/server/index.mjs', '/package.json']) assert.equal((await fetch(url + path)).status, 404);
});

test('missing key, bad input, foreign origins and excessive requests return useful errors', async t => {
  const url = await start(t, { apiKey: '', rateLimit: 1 });
  assert.equal((await fetch(`${url}/api/review`)).status, 405);
  assert.equal((await post(url, request, { origin: 'https://example.com' })).status, 403);
  assert.equal((await post(url, { ...request, sourceItemId: 'G01' })).status, 400);
  assert.equal((await post(url, { ...request, interests: [] })).status, 400);
  assert.equal((await post(url, { ...request, history: [{}] })).status, 400);
  assert.equal((await post(url, { ...request, extra: 'a'.repeat(13000) })).status, 413);
  const unavailable = await post(url, request);
  assert.equal(unavailable.status, 503);
  assert.match((await unavailable.json()).error, /GEMINI_API_KEY/);
  assert.equal((await post(url, request)).status, 429);
});

test('HTTP route returns a validated Gemini item and derives support from history', async t => {
  const url = await start(t, { apiKey: 'test-key', fetchImpl: async (_, options) => {
    const payload = JSON.parse(options.body);
    assert.match(payload.systemInstruction.parts[0].text, /short simple sentences/);
    return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({
      question: 'The soccer field is cold. Wear your ____ over your shirt.',
      explanation: '在寒冷的球場穿 jacket（外套）可以保暖。', hint: '注意冷天需要的衣物。',
    }) }] } }] }) };
  } });
  const response = await post(url, { ...request, history: [{ correct: false, question: 'Old question', interest: 'sports' }] });
  assert.equal(response.status, 200);
  const { item } = await response.json();
  assert.equal(item.stage, 'supported');
  assert.equal(item.generationSource, 'ai');
  assert.equal(item.options[item.answer], 'jacket');
  assert.ok(item.hint);
});
