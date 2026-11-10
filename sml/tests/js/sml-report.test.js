const test = require('node:test');
const assert = require('node:assert');
const Rep = require('../../../js/sml/report.js');
const R = require('../../../js/sml/router-shadow.js');
const P = require('../../../js/sml/pulse-counters.js');

test('empty stats give a readable report, not ready', () => {
  const r = Rep.build(R, R.emptyStats(1), P, P.emptyStats(1), { router: false, pulse: false });
  assert.match(r.text, /Router shadow: off/); assert.match(r.text, /no messages yet/); assert.match(r.text, /no renders yet/);
  assert.strictEqual(r.ready, false);
});
test('shows top intents and progress toward the gate', () => {
  let s = R.emptyStats(1);
  for (let i = 0; i < 3; i++) s = R.record(s, { intent: 'concept_explainer', needs_guard: false, risk: 'low' }, false);
  s = R.record(s, { intent: 'advice_seeking', needs_guard: true, risk: 'high' }, true);
  const r = Rep.build(R, s, P, P.emptyStats(1), { router: true });
  assert.match(r.text, /Router shadow: ON/); assert.match(r.text, /concept_explainer 3, advice_seeking 1/); assert.match(r.text, /4\/300/);
});
test('ready at the 300-message gate', () => {
  let s = R.emptyStats(1);
  for (let i = 0; i < 300; i++) s = R.record(s, { intent: 'a_b', needs_guard: false, risk: 'low' }, false);
  assert.strictEqual(Rep.build(R, s, P, P.emptyStats(1), {}).ready, true);
});
test('missing modules do not throw', () => {
  const r = Rep.build(null, null, null, null, null);
  assert.match(r.text, /module not loaded/); assert.strictEqual(r.ready, false);
});
test('resetKeys lists only counter keys, never flags', () => {
  const k = Rep.resetKeys(R, P);
  assert.deepStrictEqual(k, ['finos_sml_router_stats', 'finos_pulse_counters', 'finos_pulse_events']);
  assert.ok(!k.some((x) => /shadow|_on$/.test(x)));
});
test('report text contains no message-like content, only counters', () => {
  const s = R.record(R.emptyStats(1), { intent: 'a_b', needs_guard: true, risk: 'high', text: 'my PAN ABCDE1234F' }, true);
  assert.ok(!/PAN|ABCDE/.test(Rep.build(R, s, P, P.emptyStats(1), {}).text));
});

test('wilson interval: known values, bounds and the empty case', () => {
  const w = Rep.wilson(0, 10); assert.ok(w[0] === 0 && w[1] > 0.25 && w[1] < 0.32);
  const m = Rep.wilson(50, 100); assert.ok(Math.abs((m[0] + m[1]) / 2 - 0.5) < 0.005 && m[0] > 0.39 && m[1] < 0.61);
  assert.deepStrictEqual(Rep.wilson(0, 0), [0, 1]);
  const a = Rep.wilson(10, 100), b = Rep.wilson(100, 1000); assert.ok(b[1] - b[0] < a[1] - a[0]);
});
test('report shows rates with intervals, disagreement and errors', () => {
  let s = R.emptyStats(1);
  for (let i = 0; i < 8; i++) s = R.record(s, { intent: 'concept_explainer', needs_guard: false, risk: 'low' }, false);
  s = R.record(s, { intent: 'advice_seeking', needs_guard: true, risk: 'high' }, false);
  s = R.record(s, { intent: 'evasion_request', needs_guard: true, risk: 'high' }, true);
  s = R.record(s, null, false);
  const t = Rep.build(R, s, P, P.emptyStats(1), { router: true }).text;
  assert.match(t, /Router guard rate: 20\.0% \(95% CI/); assert.match(t, /disagree on 1 of 10/); assert.match(t, /router-only 1, regex-only 0/); assert.match(t, /Router call errors: 1/);
});
test('export keeps only whitelisted counters, whatever the input carries', () => {
  const dirty = Object.assign(R.record(R.emptyStats(1), { intent: 'a_b', needs_guard: true, risk: 'high', router_version: '0.5.1' }, true), { text: 'my PAN ABCDE1234F', by_intent_extra: { x: 'secret' } });
  dirty.by_intent['bad intent with spaces'] = 3;
  const out = Rep.exportCounters(R, dirty, P, P.recordRender(P.emptyStats(1), ['a', 'b']), { router: true, pulse: false }, 123);
  assert.strictEqual(out.schema, 'finos-sml-counters/2'); assert.strictEqual(out.exported_at, 123);
  assert.deepStrictEqual(out.flags, { router: true, pulse: false });
  assert.strictEqual(out.router.total, 1); assert.deepStrictEqual(out.router.by_version, { '0.5.1': 1 }); assert.strictEqual(out.pulse.renders, 1);
  const j = JSON.stringify(out); assert.ok(!/PAN|ABCDE|secret|spaces/.test(j));
});
test('export with a missing module gives null for that part and does not throw', () => {
  const out = Rep.exportCounters(null, null, P, P.emptyStats(1), null, 1);
  assert.strictEqual(out.router, null); assert.ok(out.pulse);
});
