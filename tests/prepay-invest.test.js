// FinosPrepayInvest — golden values come from an independent Python re-implementation of the same spec.
const test = require('node:test');
const assert = require('node:assert');
const P = require('../js/finos-prepay-invest.js');

const near = (a, b, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('EMI formula', () => {
  near(P.emi(5000000, 8.5, 240), 43391.16, 0.01);
  near(P.emi(1200000, 0, 120), 10000, 1e-9);                  // 0% rate → straight division
  assert.strictEqual(P.emi(0, 8, 100), 0);
});

test('₹50L @ 8.5%/20y, ₹20k/mo extra, equity at 12% — investing wins', () => {
  const r = P.simulate({ loan: 5000000, rate: 8.5, years: 20, monthly: 20000, ret: 12, invType: 'equity' });
  near(r.emi, 43391.16, 0.01);
  assert.strictEqual(r.closeMonthA, 116);                      // loan gone in 9y 8m instead of 20y
  near(r.interestA, 2321404.35, 1);
  near(r.interestB, 5413878.80, 1);
  near(r.finalA, 14697823.17, 2);
  near(r.finalB, 18025423.79, 2);
  assert.strictEqual(r.winner, 'invest');
});

test('lump sum, 30% slab, Sec 24(b) claimed — the loan interest relief is modelled', () => {
  const r = P.simulate({ loan: 5000000, rate: 8.5, years: 20, lump: 1000000, ret: 12, invType: 'equity', slab: 30, claim24b: true });
  assert.strictEqual(r.closeMonthA, 150);
  near(r.interestA, 2506242.47, 1);
  near(r.finalA, 9388004.81, 2);
  near(r.finalB, 13892642.91, 2);
  assert.strictEqual(r.effectiveLoanRate, 8.5 * 0.7);
});

test('debt-fund returns taxed at slab; low return makes prepaying win', () => {
  const r = P.simulate({ loan: 3000000, rate: 9, years: 15, monthly: 15000, lump: 500000, ret: 7, invType: 'debt', slab: 30 });
  assert.strictEqual(r.closeMonthA, 72);
  near(r.finalA, 6314507.83, 2);
  near(r.finalB, 5268569.71, 2);
  assert.strictEqual(r.winner, 'prepay');
  assert.ok(r.diff > 0);
});

test('sanity: when return equals the loan rate and nothing is taxed, the two strategies tie (< 0.5%)', () => {
  const r = P.simulate({ loan: 2000000, rate: 8, years: 10, monthly: 50000, ret: 8, invType: 'debt', slab: 0 });
  near(r.finalA, 9228439.14, 2);
  near(r.finalB, 9208283.77, 2);
  assert.ok(Math.abs(r.diff) / r.finalB < 0.005);
});

test('breakEven(): at that return the strategies are level, and it exceeds the loan rate once gains are taxed', () => {
  const p = { loan: 5000000, rate: 8.5, years: 20, monthly: 20000, invType: 'equity', slab: 30, claim24b: false };
  const be = P.breakEven(p);
  assert.ok(be > 8.5 && be < 12, 'break-even should sit above the 8.5% loan rate, got ' + be);
  const r = P.simulate(Object.assign({}, p, { ret: be }));
  assert.ok(Math.abs(r.diff) / r.finalB < 1e-6, 'diff at break-even: ' + r.diff);
  assert.strictEqual(P.simulate(Object.assign({}, p, { ret: be - 2 })).winner, 'prepay');
  assert.strictEqual(P.simulate(Object.assign({}, p, { ret: be + 2 })).winner, 'invest');
});

test('series: year-0 plus one point per year, ending at corpus (loan fully repaid)', () => {
  const r = P.simulate({ loan: 1000000, rate: 9, years: 10, monthly: 5000, ret: 10 });
  assert.strictEqual(r.series.length, 11);
  assert.strictEqual(r.series[0].year, 0);
  near(r.series[10].a, r.corpusA, 1e-6);
  near(r.series[10].b, r.corpusB, 1e-6);
  assert.ok(r.series[0].a > r.series[0].b || r.series[0].a === r.series[0].b);
});

test('lump larger than the loan: loan closes at once, the excess is invested', () => {
  const r = P.simulate({ loan: 500000, rate: 9, years: 5, lump: 800000, ret: 10, invType: 'debt' });
  assert.strictEqual(r.closeMonthA, 0);
  assert.ok(Number.isFinite(r.finalA) && r.finalA > 0);
});

test('invalid / hostile inputs never produce NaN', () => {
  assert.strictEqual(P.simulate({ loan: 0, monthly: 100 }).valid, false);
  assert.strictEqual(P.simulate({ loan: 100000, rate: 9, years: 5 }).reason, 'surplus');
  const r = P.simulate({ loan: 'abc', rate: 999, years: -4, monthly: 'x', lump: -1 });
  assert.strictEqual(r.valid, false);
  const ok = P.simulate({ loan: 1000000, rate: 999, years: 999, monthly: 1000, ret: 999 });
  assert.ok(ok.valid && Number.isFinite(ok.finalA) && Number.isFinite(ok.finalB));
  assert.strictEqual(ok.months, 480);                          // years clamped to 40
});
