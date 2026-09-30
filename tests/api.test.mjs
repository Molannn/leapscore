import test from 'node:test';
import assert from 'node:assert/strict';
import { requestReview, reviewApiBase } from '../src/api.js';

const pages = { hostname: 'molannn.github.io', origin: 'https://molannn.github.io' };
const local = { hostname: 'localhost', origin: 'http://localhost:8000' };
const remote = 'https://leapscore-test.onrender.com';

test('Pages uses configured HTTPS backend and local development stays local', () => {
  assert.equal(reviewApiBase(pages, remote), remote);
  assert.equal(reviewApiBase(pages, `${remote}/`), remote);
  assert.equal(reviewApiBase(local, remote), local.origin);
  assert.throws(() => reviewApiBase(pages, ''), /尚未啟用/);
  for (const invalid of ['http://example.com', `${remote}/api`, `${remote}?secret=key`, 'https://key:secret@example.com']) {
    assert.throws(() => reviewApiBase(pages, invalid));
  }
});

test('remote backend is warmed with health GET before exactly one generation POST', async () => {
  const calls = [];
  const body = { sourceItemId: 'V01', interests: ['sports'], history: [] };
  const result = await requestReview(body, { location: pages, configured: remote,
    fetchImpl: async (url, options) => {
      calls.push({ url, ...options });
      return { ok: true, json: async () => ({ item: { id: 'review:1' } }) };
    },
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, `${remote}/api/health`);
  assert.equal(calls[1].url, `${remote}/api/review`);
  assert.equal(calls[1].method, 'POST');
  assert.equal(calls[1].credentials, 'omit');
  assert.deepEqual(JSON.parse(calls[1].body), body);
  assert.equal(result.id, 'review:1');
});

test('health failure prevents generation; API errors are surfaced without automatic retries', async () => {
  let calls = 0;
  await assert.rejects(requestReview({}, { location: pages, configured: remote,
    fetchImpl: async () => { calls++; return { ok: false }; },
  }), /尚未就緒/);
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(requestReview({}, { location: local,
    fetchImpl: async () => { calls++; return { ok: false, json: async () => ({ error: '今日額度已用完' }) }; },
  }), /今日額度/);
  assert.equal(calls, 1);
});
