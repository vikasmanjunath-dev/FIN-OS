const test = require('node:test');
const assert = require('node:assert');
const Rep = require('../js/sml/report.js');
const R = require('../js/sml/router-shadow.js');
const P = require('../js/sml/pulse-counters.js');

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
  assert.deepStrictEqual(k, ['finos_sml_router_stats', 'finos_pulse_counters']);
  assert.ok(!k.some((x) => /shadow|_on$/.test(x)));
});
test('report text contains no message-like content, only counters', () => {
  const s = R.record(R.emptyStats(1), { intent: 'a_b', needs_guard: true, risk: 'high', text: 'my PAN ABCDE1234F' }, true);
  assert.ok(!/PAN|ABCDE/.test(Rep.build(R, s, P, P.emptyStats(1), {}).text));
});
