const test = require('node:test'); const assert = require('node:assert');
const X = require('../../../js/sml/pulse-explore.js');
const RULE = ['crossPageHUD', 'a', 'smartInsightCards', 'b', 'c', 'd', 'e', 'f'];
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };

test('eps 0 never explores; propensity 1; order unchanged', () => {
  const c = X.choose(RULE, { eps: 0, rand: seq(0.5) });
  assert.deepStrictEqual(c.order, RULE); assert.strictEqual(c.featured, 'a'); assert.strictEqual(c.propensity, 1); assert.strictEqual(c.explored, false);
});
test('exploring promotes one top-K widget; pinned stay; nobody drops more than one place', () => {
  const c = X.choose(RULE, { eps: 0.5, k: 4, rand: seq(0.1, 0.6) });      // explore, index floor(0.6*4)=2 -> 'c'
  assert.strictEqual(c.featured, 'c'); assert.strictEqual(c.explored, true);
  assert.strictEqual(c.order[0], 'crossPageHUD'); assert.strictEqual(c.order[2], 'smartInsightCards');
  assert.deepStrictEqual(c.order.slice().sort(), RULE.slice().sort());
  const np = (o) => o.filter((w) => X.PINNED.indexOf(w) < 0);
  np(RULE).forEach((w) => assert.ok(np(c.order).indexOf(w) - np(RULE).indexOf(w) <= 1, w + ' dropped too far'));
  assert.ok(np(RULE).slice(0, 4).indexOf(np(c.order)[0]) >= 0);
});
test('propensities: rule-first gets 1-eps+eps/K, others eps/K; they sum to 1 over the candidates', () => {
  const eps = 0.2, k = 4;
  const first = X.choose(RULE, { eps, k, rand: seq(0.9) }), other = X.choose(RULE, { eps, k, rand: seq(0.1, 0.99) });
  assert.strictEqual(first.propensity, 0.85); assert.strictEqual(other.propensity, 0.05);
  assert.ok(Math.abs(0.85 + 3 * 0.05 - 1) < 1e-9);
});
test('empirical frequencies match the logged propensities (seeded)', () => {
  let s = 12345; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const n = 20000, cnt = {}; let ps = {};
  for (let i = 0; i < n; i++) { const c = X.choose(RULE, { eps: 0.3, k: 4, rand: rnd }); cnt[c.featured] = (cnt[c.featured] || 0) + 1; ps[c.featured] = c.propensity; }
  Object.keys(cnt).forEach((w) => assert.ok(Math.abs(cnt[w] / n - ps[w]) < 0.02, w));
});
test('log: rows in replay.py format, tap marks only the newest featured widget, ids and propensities are validated, cap holds', () => {
  const c = X.choose(RULE, { eps: 0, rand: seq(0.5) });
  let l = X.record([], RULE, c, Date.UTC(2026, 10, 9));
  assert.deepStrictEqual(Object.keys(l[0]), ['v', 'day', 'rule_order', 'featured', 'propensity', 'tap']); assert.strictEqual(l[0].day, '2026-11-09');
  assert.strictEqual(X.markTap(l, 'zzz')[0].tap, 0); assert.strictEqual(X.markTap(l, 'a')[0].tap, 1);
  assert.deepStrictEqual(X.cleanLog([{ rule_order: ['a'], featured: 'a', propensity: 0 }, { rule_order: ['a'], featured: '<x>', propensity: 1 }, { rule_order: ['a'], featured: 'b', propensity: 1 }]), []);
  for (let i = 0; i < 450; i++) l = X.record(l, RULE, c);
  assert.strictEqual(l.length, X.MAX_ROWS);
  assert.strictEqual(X.toJsonl(l).split('\n').length, X.MAX_ROWS);
});
test('flag needs both keys; bad storage is safe', () => {
  const st = (o) => ({ getItem: (k) => (k in o ? o[k] : null) });
  assert.strictEqual(X.enabled(st({ finos_pulse_explore_on: '1' })), false);
  assert.strictEqual(X.enabled(st({ finos_pulse_explore_on: '1', finos_pulse_counters_on: '1' })), true);
  assert.strictEqual(X.enabled({ getItem() { throw new Error('x'); } }), false);
});
