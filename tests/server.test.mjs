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

test('Pages origin receives exact CORS headers on preflight, health and generation errors', async t => {
  const origin = 'https://molannn.github.io';
  const url = await start(t, { apiKey: '', allowedOrigins: [origin], publicOrigin: 'https://leapscore.onrender.com' });
  const preflight = await fetch(`${url}/api/review`, { method: 'OPTIONS', headers: {
    Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type',
  } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  assert.equal(preflight.headers.get('access-control-allow-methods'), 'POST');
  const health = await fetch(`${url}/api/health`, { headers: { Origin: origin } });
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });
  assert.equal(health.headers.get('access-control-allow-origin'), origin);
  const missingKey = await post(url, request, { Origin: origin });
  assert.equal(missingKey.status, 503);
  assert.equal(missingKey.headers.get('access-control-allow-origin'), origin);
  const untrusted = await post(url, request, { Origin: 'https://molannn.github.io.attacker.example' });
  assert.equal(untrusted.status, 403);
  assert.equal(untrusted.headers.get('access-control-allow-origin'), null);
  const wrongHeader = await fetch(`${url}/api/review`, { method: 'OPTIONS', headers: {
    Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization',
  } });
  assert.equal(wrongHeader.status, 403);
  assert.equal((await fetch(`${url}/api/health`)).status, 200);
  assert.equal((await post(url, request, { Origin: 'null' })).status, 403);
});

test('daily quota stops additional Gemini calls', async t => {
  let calls = 0;
  const url = await start(t, { apiKey: 'test-key', dailyLimit: 1,
    fetchImpl: async () => { calls++; return { ok: false }; },
  });
  assert.equal((await post(url, request)).status, 502);
  const limited = await post(url, request);
  assert.equal(limited.status, 429);
  assert.match((await limited.json()).error, /今日/);
  assert.equal(calls, 1);
});

test('origin configuration rejects paths, wildcards and public HTTP', async () => {
  const { parseOrigins } = await import('../server/index.mjs');
  assert.deepEqual(parseOrigins('https://molannn.github.io, https://example.com'), ['https://molannn.github.io', 'https://example.com']);
  for (const value of ['https://molannn.github.io/leapscore/', '*', 'http://example.com']) assert.throws(() => parseOrigins(value));
  assert.throws(() => createApp({ dailyLimit: NaN }));
});
