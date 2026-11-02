const test = require('node:test');
const assert = require('node:assert');
const A = require('../../../js/sml/router-advisory.js');
const R = require('../../../js/sml/router-shadow.js');
const G = require('../../../js/arya-guardrails.js');
const NOTE = G.NOTES.advice_requested;
const adv = { intent: 'advice_seeking', needs_guard: true, risk: 'high', router_version: '0.4.1' };

test('note only for a router-only advice request', () => {
  const r = A.decide(adv, [], 'Index funds are diversified.', NOTE);
  assert.strictEqual(r.reason, 'shown'); assert.strictEqual(r.note, NOTE);
});
test('not added when the regex guard already flagged, nor for other intents', () => {
  assert.strictEqual(A.decide(adv, ['advice_requested'], 'x', NOTE).reason, 'regex_already_flagged');
  assert.strictEqual(A.decide(adv, ['evasion_request'], 'x', NOTE).reason, 'regex_already_flagged');
  assert.strictEqual(A.decide({ intent: 'concept_explainer', needs_guard: false }, [], 'x', NOTE).reason, 'not_advice');
  assert.strictEqual(A.decide({ intent: 'advice_seeking', needs_guard: false }, [], 'x', NOTE).reason, 'not_advice');
});
test('evasion: no visible text, counter only', () => {
  const r = A.decide({ intent: 'evasion_request', needs_guard: true }, [], 'x', NOTE);
  assert.strictEqual(r.note, null); assert.strictEqual(r.reason, 'evasion_counter_only');
});
test('not added when the model wrote its own disclaimer or the note is already there; idempotent', () => {
  assert.strictEqual(A.decide(adv, [], 'Note: I am not a SEBI-registered adviser.', NOTE).reason, 'own_disclaimer');
  assert.strictEqual(A.decide(adv, [], 'blah\n\n' + NOTE, NOTE).reason, 'already_present');
  const once = A.append('Answer.', NOTE);
  assert.strictEqual(A.decide(adv, [], once, NOTE).note, null);
  assert.strictEqual(A.append('Answer.\n', NOTE), 'Answer.\n\n' + NOTE);
  assert.strictEqual(A.append('Answer.', null), 'Answer.');
});
test('fail-open on missing, malformed or error decisions and a missing note', () => {
  for (const d of [null, undefined, 5, 'x', {}, { error: 'HTTP 503' }, { intent: 42, needs_guard: true }]) assert.strictEqual(A.decide(d, [], 'x', NOTE).note, null, JSON.stringify(d));
  assert.strictEqual(A.decide(adv, [], 'x', '').reason, 'no_note');
  assert.strictEqual(A.decide(adv, undefined, 'x', NOTE).reason, 'shown');
  assert.strictEqual(A.decide(adv, [], undefined, NOTE).reason, 'shown');
});
test('advisory counters: three whitelisted integers, nothing else can change, no text', () => {
  let s = R.record(R.emptyStats(1), { intent: 'a_b', needs_guard: false, risk: 'low' }, false);
  s = R.recordAdvisory(s, 'shown'); s = R.recordAdvisory(s, 'shown'); s = R.recordAdvisory(s, 'own_disclaimer'); s = R.recordAdvisory(s, 'late');
  s = R.recordAdvisory(s, 'my PAN ABCDE1234F'); s = R.recordAdvisory(s, undefined);
  assert.strictEqual(s.advisory_shown, 2); assert.strictEqual(s.advisory_skipped_own_disclaimer, 1); assert.strictEqual(s.advisory_late, 1);
  assert.ok(!/PAN|ABCDE/.test(JSON.stringify(s)));
  assert.match(R.summary(s), /advisory note shown 2, skipped \(own disclaimer\) 1, late 1/);
  const dirty = Object.assign({}, s, { advisory_shown: -5, advisory_late: 'x' });
  const st = { v: null, getItem() { return this.v; }, setItem(k, v) { this.v = v; } }; R.saveStats(st, dirty);
  assert.strictEqual(R.loadStats(st).advisory_shown, 0); assert.strictEqual(R.loadStats(st).advisory_late, 0);
});
test('the real guardrails note and the decide() de-duplication agree with AryaGuardrails.apply', () => {
  const user = 'should i buy this stock';
  const viaRegex = G.apply(user, 'Some answer.').text;                    // the regex guard adds the note itself ...
  const flags = G.apply(user, '').flags;
  assert.deepStrictEqual(flags, ['advice_requested']);
  assert.strictEqual(A.decide(adv, flags, viaRegex, NOTE).note, null);    // ... so the router must not add it a second time
});
