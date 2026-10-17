import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readWeb, sliceBlock, runIn, stubDom } from './helpers/webText.mts';
import { greeks, normalCDF, payoffAt, summarisePayoff, STRATEGIES, validateLegs, type Leg } from '../lib/marketDataOptions.ts';

const OI = readWeb('html/options-intelligence.html');
function R(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const rnd = R(77);
const near = (a: number, b: number, eps: number) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test('Greeks equal the website _calcGreeks (same formulas, same approximation) on random inputs', () => {
  for (let i = 0; i < 300; i++) {
    const spot = Math.round(5000 + rnd() * 30000), strike = Math.round(spot * (0.8 + rnd() * 0.4) / 50) * 50, dte = 1 + Math.floor(rnd() * 300), iv = 5 + Math.floor(rnd() * 80);
    for (const type of ['call', 'put'] as const) {
      const { els, document } = stubDom({ 'g-spot': String(spot), 'g-strike': String(strike), 'g-dte': String(dte), 'g-iv': String(iv) });
      const win: any = {};
      const ctx: any = { document, window: win };
      runIn(ctx, sliceBlock(OI, 'function _normalCDF(x) {'), sliceBlock(OI, 'window._calcGreeks = function(type) {'));
      win._calcGreeks(type);
      const g = greeks({ spot, strike, days: dte, ivPct: iv, type })!;
      assert.equal(g.delta.toFixed(3), els['g-delta'].textContent);
      assert.equal(g.theta.toFixed(2), els['g-theta'].textContent);
      assert.equal(g.gamma.toFixed(4), els['g-gamma'].textContent);
      assert.equal('₹' + g.vega.toFixed(2), els['g-vega'].textContent);
      assert.ok(els['greeks-summary'].innerHTML.includes(`Theoretical ${type.toUpperCase()} Price: ₹${g.price.toFixed(2)}`));
      assert.ok(els['greeks-summary'].innerHTML.includes(`Moneyness: <strong>${g.moneyness}</strong>`));
    }
  }
});

test('Black-Scholes reference values and put-call parity', () => {
  const c = greeks({ spot: 100, strike: 100, days: 365, ivPct: 20, type: 'call', riskFree: 0.05 })!;
  const p = greeks({ spot: 100, strike: 100, days: 365, ivPct: 20, type: 'put', riskFree: 0.05 })!;
  near(c.price, 10.4506, 2e-3); near(p.price, 5.5735, 2e-3);
  near(c.price - p.price, 100 - 100 * Math.exp(-0.05), 2e-3);
  near(c.delta, 0.6368, 1e-3); near(p.delta, c.delta - 1, 1e-9);
  near(normalCDF(0), 0.5, 1e-7); near(normalCDF(1.96), 0.975, 1e-4); near(normalCDF(-1.96), 0.025, 1e-4);
  assert.ok(c.gamma > 0 && c.vega > 0 && c.theta < 0);
});

test('bad inputs give null, never a default', () => {
  for (const bad of [{ spot: 0 }, { spot: NaN }, { strike: -1 }, { days: 0 }, { days: 5000 }, { ivPct: 0 }, { ivPct: 900 }, { ivPct: NaN }]) {
    assert.equal(greeks({ spot: 100, strike: 100, days: 30, ivPct: 20, type: 'call', ...bad }), null);
  }
});

const L = (kind: Leg['kind'], side: 1 | -1, strike: number, premium: number, qty = 1): Leg => ({ kind, side, strike, premium, qty });

test('strategy payoffs: hand-worked maximum, minimum and break-even', () => {
  const bull = summarisePayoff([L('call', 1, 100, 10), L('call', -1, 110, 5)])!;
  assert.deepEqual([bull.maxProfit, bull.maxLoss, bull.breakevens, bull.netPremium], [5, -5, [105], 5]);
  const covered = summarisePayoff([L('shares', 1, 100, 0), L('call', -1, 110, 3)])!;
  assert.deepEqual([covered.maxProfit, covered.maxLoss, covered.breakevens], [13, -97, [97]]);
  const straddle = summarisePayoff([L('call', 1, 100, 5), L('put', 1, 100, 4)])!;
  assert.deepEqual([straddle.maxProfit, straddle.maxLoss, straddle.breakevens], [null, -9, [91, 109]]);
  const condor = summarisePayoff([L('put', 1, 90, 1), L('put', -1, 95, 2), L('call', -1, 105, 2), L('call', 1, 110, 1)])!;
  assert.deepEqual([condor.maxProfit, condor.maxLoss, condor.breakevens, condor.netPremium], [2, -3, [93, 107], -2]);
  const lp = summarisePayoff([L('put', 1, 100, 3)])!;
  assert.deepEqual([lp.maxProfit, lp.maxLoss, lp.breakevens], [97, -3, [97]]);
  const sc = summarisePayoff([L('call', -1, 100, 4)])!;
  assert.deepEqual([sc.maxProfit, sc.maxLoss, sc.breakevens], [4, null, [104]]);
});

test('the summary agrees with brute-force sampling of the payoff on random strategies', () => {
  for (let i = 0; i < 300; i++) {
    const n = 1 + Math.floor(rnd() * 4);
    const legs: Leg[] = Array.from({ length: n }, () => L((['call', 'put', 'shares'] as const)[Math.floor(rnd() * 3)], rnd() < 0.5 ? 1 : -1, 50 + Math.floor(rnd() * 100), Math.floor(rnd() * 20), 1 + Math.floor(rnd() * 3)));
    const s = summarisePayoff(legs)!;
    let hi = -Infinity, lo = Infinity;
    for (let sp = 0; sp <= 1000; sp += 0.5) { const v = payoffAt(legs, sp); hi = Math.max(hi, v); lo = Math.min(lo, v); }
    const slope = (payoffAt(legs, 100001) - payoffAt(legs, 100000));
    if (s.maxProfit === null) assert.ok(slope > 0); else { near(s.maxProfit, hi, 1e-6); assert.ok(slope <= 1e-9); }
    if (s.maxLoss === null) assert.ok(slope < 0); else { near(s.maxLoss, lo, 1e-6); assert.ok(slope >= -1e-9); }
    for (const b of s.breakevens) near(payoffAt(legs, b), 0, 1e-4);
  }
});

test('every template builds legs that pass validation and has a premium-free reading', () => {
  for (const def of STRATEGIES) {
    const v: Record<string, number> = {};
    def.fields.forEach((f, i) => { v[f.id] = f.kind === 'qty' ? 2 : f.kind === 'premium' ? 3 : 100 + i * 5; });
    const legs = def.build(v);
    assert.equal(validateLegs(legs), null, def.id);
    assert.ok(summarisePayoff(legs), def.id);
  }
  assert.ok(validateLegs([L('call', 1, 0, 1)]));
  assert.ok(validateLegs([L('call', 1, 100, -1)]));
  assert.ok(validateLegs([L('call', 1, 100, 1, 0)]));
  assert.equal(summarisePayoff([]), null);
});
