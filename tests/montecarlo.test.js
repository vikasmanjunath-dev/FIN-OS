const test = require('node:test');
const assert = require('node:assert');
const MC = require('../js/finos-montecarlo.js');

const base = (o) => Object.assign({
  startAge: 30, retireAge: 60, endAge: 90,
  assets: [{ name: 'equity', value: 1e6, mean: 0.10, vol: 0, beta: 1 }],
  monthlyContribution: 0, monthlyExpenseToday: 0, inflation: 0, inflationVol: 0, runs: 200, seed: 7,
}, o);

test('same seed → identical results; different seed → different', () => {
  const a = MC.simulate(base({ assets: [{ value: 1e6, mean: .1, vol: .18 }], seed: 5 }));
  const b = MC.simulate(base({ assets: [{ value: 1e6, mean: .1, vol: .18 }], seed: 5 }));
  const c = MC.simulate(base({ assets: [{ value: 1e6, mean: .1, vol: .18 }], seed: 6 }));
  assert.deepStrictEqual(a.bands, b.bands);
  assert.notDeepStrictEqual(a.bands[10], c.bands[10]);
});

test('zero volatility reproduces deterministic compounding', () => {
  const r = MC.simulate(base({ endAge: 40 }));
  const expected = 1e6 * Math.pow(1.10, 10);
  assert.ok(Math.abs(r.bands[10].p50 - expected) / expected < 1e-9, `${r.bands[10].p50} vs ${expected}`);
  assert.strictEqual(r.bands[10].p10, r.bands[10].p90);           // no spread without vol
});

test('contributions with step-up add up (zero return, zero inflation)', () => {
  const r = MC.simulate(base({
    endAge: 33, retireAge: 33, assets: [{ value: 0, mean: 0, vol: 0, beta: 1 }],
    monthlyContribution: 1000, stepUp: 0.10,
  }));
  const expected = 12000 * (1 + 1.1 + 1.21);
  assert.ok(Math.abs(r.bands[3].p50 - expected) < 1e-6);
});

test('withdrawals: 1Cr at 0% growth, 4L/yr spend lasts exactly 25 years', () => {
  const mk = (endAge) => MC.simulate(base({
    startAge: 60, retireAge: 60, endAge, assets: [{ value: 1e7, mean: 0, vol: 0, beta: 1 }], monthlyExpenseToday: 400000 / 12,
  }));
  assert.strictEqual(mk(85).successRate, 1);                      // 25 withdrawals of 4L = 1Cr
  assert.strictEqual(mk(86).successRate, 0);                      // 26th year fails
  assert.strictEqual(mk(86).depletion.medianAge, 85);
});

test('a pension postpones depletion (and a non-indexed pension still helps)', () => {
  const mk = (pension) => MC.simulate(base({ startAge: 60, retireAge: 60, endAge: 90, assets: [{ value: 5e6, mean: .07, vol: 0 }], monthlyExpenseToday: 30000, inflation: .05, pensionMonthlyAtRetire: pension }));
  const none = mk(0), some = mk(15000);
  assert.strictEqual(none.depletion.medianAge, 75);
  assert.strictEqual(some.depletion.medianAge, 85);
  assert.ok(some.bands[15].p50 > none.bands[15].p50);
});

test('success probability is monotonic in spending and in corpus', () => {
  const mk = (value, exp) => MC.simulate(base({ startAge: 60, retireAge: 60, assets: [{ value, mean: .09, vol: .15, beta: 1 }], monthlyExpenseToday: exp, inflation: .06, inflationVol: .01, runs: 2000, seed: 3 })).successRate;
  assert.ok(mk(2e7, 60000) >= mk(2e7, 90000));
  assert.ok(mk(3e7, 80000) >= mk(2e7, 80000));
  assert.ok(mk(1e8, 50000) > 0.95);
  assert.ok(mk(1e6, 80000) < 0.05);
});

test('lognormal params keep the arithmetic mean', () => {
  const { mu, sigma } = MC._logParams(0.12, 0.18);
  assert.ok(Math.abs(Math.exp(mu + sigma * sigma / 2) - 1.12) < 1e-12);
});

test('solveContribution finds a contribution that meets the target', () => {
  const cfg = base({ startAge: 30, retireAge: 55, endAge: 85, assets: [{ value: 5e5, mean: .11, vol: .16, beta: 1 }], monthlyExpenseToday: 50000, inflation: .06, inflationVol: .01, stepUp: .05 });
  const sip = MC.solveContribution(cfg, 0.8, { runs: 1500 });
  assert.ok(sip > 0);
  const check = MC.simulate(Object.assign({}, cfg, { monthlyContribution: sip, runs: 1500 })).successRate;
  assert.ok(check >= 0.78, 'success at solved SIP: ' + check);   // allow Monte Carlo noise vs the same seed
});

test('input validation', () => {
  assert.throws(() => MC.simulate(base({ endAge: 20 })), /endAge/);
  assert.throws(() => MC.simulate(base({ assets: [] })), /asset/);
});
