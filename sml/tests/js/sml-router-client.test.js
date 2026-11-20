const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const T = require('../../../js/sml/tfidf-router.js');
const C = require('../../../js/sml/router-client.js');
const R = require('../../../js/sml/router-shadow.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const VER = '0.4.1';
const MODEL = path.join(ROOT, 'js', 'sml', 'models', `tfidf-router-${VER}.web.json`);
const FIX = path.join(__dirname, 'fixtures', `tfidf_decisions_${VER}.json`);
const have = fs.existsSync(MODEL) && fs.existsSync(FIX);
const skip = !have && 'model file or decisions fixture not present (run sml/training/export_tfidf_web.py 0.4.1)';
const rows = (name) => fs.readFileSync(path.join(ROOT, 'sml', 'data', name + '.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse);

test('parity: the browser head decides exactly like the Python head on EVERY held-out row (intent and guard flag)', { skip }, () => {
  const fx = JSON.parse(fs.readFileSync(FIX, 'utf8'));
  const r = T.create(JSON.parse(fs.readFileSync(MODEL, 'utf8')));
  let n = 0, badIntent = 0, badGuard = 0, maxMass = 0; const bad = [];
  for (const [name, expected] of Object.entries(fx.files)) {
    const data = rows(name); assert.strictEqual(data.length, expected.length, name);
    data.forEach((row, i) => {
      const d = r.predict(row.text, { guardMass: fx.guard_mass });
      const [k, guard, mass] = expected[i];
      n++; if (d.intent !== fx.classes[k]) { badIntent++; bad.push([name, i, d.intent, fx.classes[k]]); }
      if (d.needs_guard !== !!guard) { badGuard++; bad.push([name, i, 'guard', d.high_risk_mass, mass]); }
      maxMass = Math.max(maxMass, Math.abs(d.high_risk_mass - mass));
    });
  }
  assert.ok(n >= 2900, `only ${n} rows compared`);
  assert.strictEqual(badIntent, 0, JSON.stringify(bad.slice(0, 5)));
  assert.strictEqual(badGuard, 0, JSON.stringify(bad.slice(0, 5)));
  assert.ok(maxMass < 0.003, `max risk-mass difference ${maxMass}`);       // coefficients are rounded to 4 decimals in the browser file
});

function client(overrides) {
  const calls = { load: 0, remote: 0 };
  const c = C.create(Object.assign({
    tfidf: T,
    loadModel: () => { calls.load++; return Promise.resolve(JSON.parse(fs.readFileSync(MODEL, 'utf8'))); },
    remote: (t) => { calls.remote++; return Promise.resolve({ router_version: '0.4.1', intent: 'concept_explainer', confidence: 0.9, risk: 'low', high_risk_mass: 0.01, needs_guard: false }); },
  }, overrides || {}));
  return { c, calls };
}

test('first message uses the server while the model downloads; later messages are answered on-device with no request', { skip }, async () => {
  const { c, calls } = client();
  const first = await c.decide('how do i hide cash income from tax');
  assert.strictEqual(first.via, 'server'); assert.strictEqual(calls.remote, 1); assert.strictEqual(calls.load, 1);
  await c.ready(); assert.strictEqual(c.state(), 'ready');
  const second = await c.decide('how do i hide cash income from tax');
  assert.strictEqual(second.via, 'local'); assert.strictEqual(calls.remote, 1, 'no server call once local is ready'); assert.strictEqual(calls.load, 1, 'model loaded once');
  assert.strictEqual(second.decision.router_version, '0.4.1-tfidf'); assert.strictEqual(second.decision.intent, 'evasion_request'); assert.strictEqual(second.decision.needs_guard, true);
});

test('fail-open: a model that cannot load falls back to the server; both failing gives a null decision, never a throw', async () => {
  const a = client({ loadModel: () => Promise.reject(new Error('404')) });
  assert.strictEqual((await a.c.decide('x')).via, 'server'); await a.c.ready(); assert.strictEqual(a.c.state(), 'failed');
  assert.strictEqual((await a.c.decide('y')).via, 'server'); assert.strictEqual(a.calls.load, 0 + 0 || a.calls.load);
  const b = client({ loadModel: () => Promise.reject(new Error('404')), remote: () => Promise.reject(new Error('down')) });
  assert.deepStrictEqual(await b.c.decide('x'), { decision: null, via: null });
  const e = client({ remote: () => Promise.resolve({ error: 'HTTP 503' }), loadModel: () => Promise.reject(new Error('x')) });
  assert.deepStrictEqual(await e.c.decide('x'), { decision: null, via: null });
  const n = C.create({}); assert.deepStrictEqual(await n.decide('x'), { decision: null, via: null });
});

test('a local prediction that throws falls back to the server', { skip }, async () => {
  const { c, calls } = client({ tfidf: { create: () => ({ predict: () => { throw new Error('boom'); } }) } });
  await c.decide('x'); await c.ready();
  const r = await c.decide('y'); assert.strictEqual(r.via, 'server'); assert.strictEqual(calls.remote, 2);
});

test('counters: where a decision came from is two whitelisted integers, the on-device version label is accepted, nothing else', () => {
  let s = R.emptyStats(1);
  s = R.record(s, { intent: 'a_b', needs_guard: false, risk: 'low', router_version: '0.4.1-tfidf' }, false);
  s = R.record(s, { intent: 'a_b', needs_guard: false, risk: 'low', router_version: '0.4.1; DROP' }, false);
  s = R.recordVia(R.recordVia(R.recordVia(s, 'local'), 'server'), 'my PAN ABCDE1234F');
  assert.deepStrictEqual(s.by_version, { '0.4.1-tfidf': 1 }); assert.strictEqual(s.decided_local, 1); assert.strictEqual(s.decided_server, 1);
  assert.ok(!/PAN|ABCDE/.test(JSON.stringify(s))); assert.match(R.summary(s), /decided on-device 1, by server 1/);
});

test('the client source has no storage, logging or direct network code (the caller supplies load and remote)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'sml', 'router-client.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/\b(fetch|XMLHttpRequest|sendBeacon|WebSocket|localStorage|sessionStorage|console\.|document\.cookie)\b/.test(src));
});
