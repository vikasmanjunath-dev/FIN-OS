// Run: node --test tests/api.test.js
const test = require('node:test');
const assert = require('node:assert');

function load(env = {}) {
  delete require.cache[require.resolve('../js/finos-api.js')];
  Object.assign(globalThis, { location: { hostname: env.host || 'finos1.vercel.app' } });
  globalThis.localStorage = { getItem: (k) => (env.ls || {})[k] || null };
  delete globalThis.FINOS_API_GATEWAY;
  // the alerts service is token-only, so tests run signed in unless one sets its own FINOS_SB
  globalThis.FINOS_SB = { getClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 't0' } } }) } }) };
  return require('../js/finos-api.js');
}
const ok = (obj, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(obj) });

test('base(): gateway > localhost dev ports > unavailable', () => {
  assert.strictEqual(load({ host: 'localhost' }).base('arya'), 'http://localhost:7475');
  assert.strictEqual(load({ host: 'localhost', ls: { finos_api_gateway: 'http://gw:8000/' } }).base('rag'), 'http://gw:8000/api/rag');
  assert.strictEqual(load().base('arya'), null);
  assert.throws(() => load().base('nope'), /Unknown service/);
});

test('request(): parses JSON, sends request id, no auth when no client', async () => {
  const A = load({ host: 'localhost' });
  let seen; globalThis.fetch = async (url, init) => { seen = { url, init }; return ok({ a: 1 }); };
  assert.deepStrictEqual(await A.request('arya', '/x', { method: 'POST', body: { q: 1 } }), { a: 1 });
  assert.strictEqual(seen.url, 'http://localhost:7475/x');
  assert.match(seen.init.headers['X-Request-Id'], /^fe-/);
  assert.strictEqual(seen.init.headers['Content-Type'], 'application/json');
});

test('GET retries 5xx then succeeds; POST is never retried', async () => {
  const A = load({ host: 'localhost' });
  let n = 0; globalThis.fetch = async () => (++n < 3 ? ok({}, 503) : ok({ done: true }));
  assert.deepStrictEqual(await A.request('arya', '/x', { retryDelay: 1 }), { done: true });
  assert.strictEqual(n, 3);
  n = 0; globalThis.fetch = async () => { n++; return ok({}, 503); };
  await assert.rejects(A.request('arya', '/x', { method: 'POST', retryDelay: 1 }), (e) => e.code === 'http' && e.status === 503);
  assert.strictEqual(n, 1);
});

test('4xx is not retried; network failure is typed offline', async () => {
  const A = load({ host: 'localhost' });
  let n = 0; globalThis.fetch = async () => { n++; return ok({}, 404); };
  await assert.rejects(A.request('arya', '/x', { retryDelay: 1 }), (e) => e.code === 'http' && !e.retryable);
  assert.strictEqual(n, 1);
  globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
  await assert.rejects(A.request('arya', '/x', { retries: 0 }), (e) => e.name === 'FinosApiError' && e.code === 'offline');
});

test('unavailable backend throws a typed error without calling fetch', async () => {
  const A = load();
  globalThis.fetch = async () => { throw new Error('should not be called'); };
  await assert.rejects(A.request('arya', '/x'), (e) => e.code === 'unavailable');
});

test('timeout aborts and is reported as timeout', async () => {
  const A = load({ host: 'localhost' });
  globalThis.fetch = (url, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(new Error('aborted'))));
  await assert.rejects(A.request('arya', '/x', { timeout: 20, retries: 0 }), (e) => e.code === 'timeout');
});

test('concurrent identical GETs share one network call', async () => {
  const A = load({ host: 'localhost' });
  let n = 0; globalThis.fetch = async () => { n++; await new Promise((r) => setTimeout(r, 5)); return ok({ v: n }); };
  const [a, b, c] = await Promise.all([A.request('alerts', '/h/1'), A.request('alerts', '/h/1'), A.request('alerts', '/h/1')]);
  assert.strictEqual(n, 1);
  assert.deepStrictEqual([a, b, c], [{ v: 1 }, { v: 1 }, { v: 1 }]);
  await A.request('alerts', '/h/1');            // no ttl → a later call is a fresh request
  assert.strictEqual(n, 2);
});

test('a failed shared GET is not cached or left in flight', async () => {
  const A = load({ host: 'localhost' });
  let n = 0; globalThis.fetch = async () => { n++; return n === 1 ? ok({}, 404) : ok({ ok: true }); };
  await assert.rejects(A.request('alerts', '/x', { retries: 0 }));
  assert.deepStrictEqual(await A.request('alerts', '/x', { retries: 0 }), { ok: true });
});

test('ttl reuses the response; a write to the same service invalidates it; other services are untouched', async () => {
  const A = load({ host: 'localhost' });
  let n = 0; globalThis.fetch = async () => ok({ n: ++n });
  assert.deepStrictEqual(await A.request('alerts', '/s', { ttl: 60000 }), { n: 1 });
  assert.deepStrictEqual(await A.request('alerts', '/s', { ttl: 60000 }), { n: 1 });
  assert.deepStrictEqual(await A.request('arya', '/s', { ttl: 60000 }), { n: 2 });
  await A.request('alerts', '/w', { method: 'POST', body: {} });
  assert.deepStrictEqual(await A.request('alerts', '/s', { ttl: 60000 }), { n: 4 });   // n=3 was the POST
  assert.deepStrictEqual(await A.request('arya', '/s', { ttl: 60000 }), { n: 2 });
  A.invalidate();
  assert.deepStrictEqual(await A.request('arya', '/s', { ttl: 60000 }), { n: 5 });
});

test('available() never throws; an unavailable backend is not fetched', () => {
  assert.strictEqual(load({ host: 'localhost' }).available('alerts'), true);
  assert.strictEqual(load().available('alerts'), false);
  assert.strictEqual(load().available('nope'), false);
});

test('timeout also covers a body that never arrives', async () => {
  const A = load({ host: 'localhost' });
  globalThis.fetch = async (_u, init) => ({ ok: true, status: 200,
    text: () => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted')))) });
  await assert.rejects(A.request('alerts', '/slow', { timeout: 20, retries: 0 }), (e) => e.code === 'timeout');
});

test('poll(): runs on the interval, never overlaps, skips while hidden, stop() ends it', async () => {
  const A = load({ host: 'localhost' });
  const listeners = {};
  globalThis.document = { hidden: false, addEventListener: (t, f) => { listeners[t] = f; }, removeEventListener: (t) => { delete listeners[t]; } };
  let calls = 0, concurrent = 0, maxConcurrent = 0;
  const stop = A.poll(async () => { calls++; concurrent++; maxConcurrent = Math.max(maxConcurrent, concurrent); await new Promise((r) => setTimeout(r, 25)); concurrent--; }, 10, { immediate: true });
  await new Promise((r) => setTimeout(r, 80));
  assert.ok(calls >= 2, 'ran repeatedly');
  assert.strictEqual(maxConcurrent, 1, 'never overlapped');
  document.hidden = true;
  const before = calls; await new Promise((r) => setTimeout(r, 60));
  assert.ok(calls - before <= 1, 'paused while hidden');
  stop();
  assert.strictEqual(listeners.visibilitychange, undefined, 'visibility listener removed');
  const after = calls; await new Promise((r) => setTimeout(r, 40));
  assert.strictEqual(calls, after, 'stopped');
  delete globalThis.document;
});

test('alerts service: bearer token on every call; no session means no fetch and a signed_out error', async () => {
  const A = load({ host: 'localhost' });
  let calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return ok({ a: 1 }); };
  globalThis.window = globalThis;
  globalThis.FINOS_SB = { getClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }) } }) };
  await assert.rejects(A.request('alerts', '/health-score/u1'), (e) => e.code === 'signed_out');
  await assert.rejects(A.request('alerts', '/health-score/u1', { auth: false }), (e) => e.code === 'signed_out');
  await assert.rejects(A.alertsFetch('/benchmark/u1'), (e) => e.code === 'signed_out');
  assert.strictEqual(calls.length, 0);
  globalThis.FINOS_SB = { getClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'tok-1' } } }) } }) };
  await A.request('alerts', '/health-score/u1');
  await A.alertsFetch('/couple/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.strictEqual(calls.length, 2);
  for (const c of calls) { assert.strictEqual(c.init.headers.Authorization, 'Bearer tok-1'); assert.ok(!c.url.includes('tok-1')); }
  assert.strictEqual(calls[1].init.headers['Content-Type'], 'application/json');
  delete globalThis.FINOS_SB;
});
