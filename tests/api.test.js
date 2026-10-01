// Run: node --test tests/api.test.js
const test = require('node:test');
const assert = require('node:assert');

function load(env = {}) {
  delete require.cache[require.resolve('../js/finos-api.js')];
  Object.assign(globalThis, { location: { hostname: env.host || 'finos1.vercel.app' } });
  globalThis.localStorage = { getItem: (k) => (env.ls || {})[k] || null };
  delete globalThis.FINOS_API_GATEWAY;
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
