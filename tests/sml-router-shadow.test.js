const test = require('node:test');
const assert = require('node:assert');
const R = require('../js/sml/router-shadow.js');

const dec = (intent, guard, risk) => ({ intent, needs_guard: guard, risk: risk || (guard ? 'high' : 'low') });
const mem = () => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, _m: m }; };

test('emptyStats has the documented shape', () => {
  const s = R.emptyStats(1000);
  assert.deepStrictEqual(s, { since: 1000, total: 0, by_intent: {}, by_risk: { low: 0, high: 0 }, router_guard: 0, regex_guard: 0, agree_both: 0, router_only: 0, regex_only: 0, errors: 0, by_version: {} });
});
test('record counts totals and intents', () => {
  let s = R.emptyStats(1);
  s = R.record(s, dec('spending_query', false), false);
  s = R.record(s, dec('spending_query', false), false);
  s = R.record(s, dec('advice_seeking', true), true);
  assert.strictEqual(s.total, 3);
  assert.deepStrictEqual(s.by_intent, { spending_query: 2, advice_seeking: 1 });
});
test('record is pure: input stats are not mutated', () => {
  const a = R.emptyStats(1); const snap = JSON.stringify(a);
  const b = R.record(a, dec('x_y', true), true);
  assert.strictEqual(JSON.stringify(a), snap); assert.notStrictEqual(a, b);
});
test('agree_both bucket', () => {
  const s = R.record(R.emptyStats(1), dec('advice_seeking', true), true);
  assert.strictEqual(s.agree_both, 1); assert.strictEqual(s.router_only, 0); assert.strictEqual(s.regex_only, 0);
});
test('router_only bucket', () => {
  const s = R.record(R.emptyStats(1), dec('advice_seeking', true), false);
  assert.deepStrictEqual([s.router_only, s.regex_only, s.agree_both], [1, 0, 0]);
});
test('regex_only bucket', () => {
  const s = R.record(R.emptyStats(1), dec('spending_query', false), true);
  assert.deepStrictEqual([s.router_only, s.regex_only, s.agree_both], [0, 1, 0]);
});
test('neither flags: no agreement counters move', () => {
  const s = R.record(R.emptyStats(1), dec('spending_query', false), false);
  assert.deepStrictEqual([s.router_guard, s.regex_guard, s.router_only, s.regex_only, s.agree_both], [0, 0, 0, 0, 0]);
});
test('guard counters', () => {
  let s = R.emptyStats(1);
  s = R.record(s, dec('a_b', true), false); s = R.record(s, dec('a_b', false), true); s = R.record(s, dec('a_b', true), true);
  assert.strictEqual(s.router_guard, 2); assert.strictEqual(s.regex_guard, 2);
});
test('risk buckets; unknown risk counts as low', () => {
  let s = R.emptyStats(1);
  s = R.record(s, { intent: 'a_b', needs_guard: true, risk: 'high' }, false);
  s = R.record(s, { intent: 'a_b', needs_guard: false, risk: 'low' }, false);
  s = R.record(s, { intent: 'a_b', needs_guard: false, risk: 'weird' }, false);
  assert.deepStrictEqual(s.by_risk, { low: 2, high: 1 });
});
test('invalid decisions count as errors, not totals', () => {
  let s = R.emptyStats(1);
  for (const bad of [null, undefined, 'x', { error: 'HTTP 503' }, { intent: 5 }, { intent: 'Has Space' }]) s = R.record(s, bad, false);
  assert.strictEqual(s.errors, 6); assert.strictEqual(s.total, 0);
});
test('no message text can appear in stats, even from extra fields or hostile intent', () => {
  const secret = 'my PAN is ABCDE1234F and salary 1,25,000';
  let s = R.emptyStats(1);
  s = R.record(s, { intent: 'spending_query', needs_guard: false, risk: 'low', text: secret, echo: secret, top3: [[secret, 1]] }, false);
  s = R.record(s, { intent: secret, needs_guard: true }, true);
  const ser = JSON.stringify(s);
  assert.ok(!ser.includes('ABCDE1234F') && !ser.includes('salary') && !ser.includes('PAN'));
  assert.deepStrictEqual(Object.keys(s).sort(), ['agree_both', 'by_intent', 'by_risk', 'by_version', 'errors', 'regex_guard', 'regex_only', 'router_guard', 'router_only', 'since', 'total']);
});
test('stats loaded from storage are re-cleaned: injected text fields are dropped', () => {
  const st = mem();
  st.setItem(R.KEY, JSON.stringify({ since: 5, total: 2, text: 'secret words', by_intent: { 'bad intent with text': 3, ok_one: 2 }, by_risk: { low: 1, high: 1, note: 'x' } }));
  const s = R.loadStats(st);
  assert.ok(!JSON.stringify(s).includes('secret'));
  assert.deepStrictEqual(s.by_intent, { ok_one: 2 }); assert.strictEqual(s.total, 2);
});
test('corrupt or missing storage gives empty stats, never throws', () => {
  const st = mem(); st.setItem(R.KEY, '{not json');
  assert.strictEqual(R.loadStats(st).total, 0);
  assert.strictEqual(R.loadStats(mem()).total, 0);
  assert.strictEqual(R.loadStats({ getItem() { throw new Error('denied'); } }).total, 0);
  assert.strictEqual(R.loadStats(null).total, 0);
  st.setItem(R.KEY, JSON.stringify({ total: -5, router_guard: 'x', by_risk: null }));
  const s = R.loadStats(st); assert.strictEqual(s.total, 0); assert.strictEqual(s.router_guard, 0);
});
test('saveStats round trips under the documented key and survives a throwing storage', () => {
  const st = mem();
  const s = R.record(R.emptyStats(9), dec('a_b', true), true);
  assert.strictEqual(R.KEY, 'finos_sml_router_stats');
  assert.strictEqual(R.saveStats(st, s), true);
  assert.deepStrictEqual(R.loadStats(st), s);
  assert.strictEqual(R.saveStats({ setItem() { throw new Error('quota'); } }, s), false);
});
test('summary math', () => {
  let s = R.emptyStats(1);
  s = R.record(s, dec('advice_seeking', true), true);
  s = R.record(s, dec('advice_seeking', true), false);
  s = R.record(s, dec('a_b', false), true);
  s = R.record(s, dec('a_b', false), false);
  s = R.record(s, null, false);
  const t = R.summary(s);
  assert.match(t, /4 msgs/); assert.match(t, /router guard 50\.0%/); assert.match(t, /regex guard 50\.0%/);
  assert.match(t, /both 1, router-only 1, regex-only 1/); assert.match(t, /errors 1/);
  assert.match(R.summary(R.emptyStats(1)), /no messages yet/);
});

test('router_version is counted per version; invalid versions are ignored', () => {
  let s = R.emptyStats(1);
  s = R.record(s, { intent: 'a_b', needs_guard: false, risk: 'low', router_version: '0.4.1' }, false);
  s = R.record(s, { intent: 'a_b', needs_guard: false, risk: 'low', router_version: '0.4.1' }, false);
  s = R.record(s, { intent: 'a_b', needs_guard: false, risk: 'low', router_version: '0.3.0' }, false);
  s = R.record(s, { intent: 'a_b', needs_guard: false, risk: 'low', router_version: 'my PAN ABCDE1234F' }, false);
  s = R.record(s, { intent: 'a_b', needs_guard: false, risk: 'low' }, false);
  assert.deepStrictEqual(s.by_version, { '0.4.1': 2, '0.3.0': 1 });
  assert.strictEqual(s.total, 5);
  assert.match(R.summary(s), /router 0\.4\.1 x2, 0\.3\.0 x1/);
});
test('stored stats keep only well-formed versions', () => {
  const st = mem(); R.saveStats(st, { total: 1, by_version: { '0.4.1': 3, 'secret text': 9 } });
  assert.deepStrictEqual(R.loadStats(st).by_version, { '0.4.1': 3 });
});
test('an intent named like an inherited member is counted as a number; __proto__ is an error', () => {
  let s = R.emptyStats(1);
  s = R.record(s, { intent: 'constructor', needs_guard: false, risk: 'low', router_version: '0.4.1' }, false);
  s = R.record(s, { intent: 'constructor', needs_guard: false, risk: 'low', router_version: '0.4.1' }, false);
  assert.deepStrictEqual(s.by_intent, { constructor: 2 });
  const e = R.record(s, { intent: '__proto__', needs_guard: false, risk: 'low' }, false);
  assert.strictEqual(e.errors, 1); assert.strictEqual(e.total, 2);
  assert.strictEqual(Object.getPrototypeOf(e.by_intent), Object.prototype);
});
test('junk intent keys in stored stats cannot crowd out valid ones', () => {
  const st = mem(); const by = {}; for (let i = 0; i < 40; i++) by['Bad Key ' + i] = 1; by.advice_seeking = 4;
  R.saveStats(st, { total: 4, by_intent: by });
  assert.deepStrictEqual(R.loadStats(st).by_intent, { advice_seeking: 4 });
});
