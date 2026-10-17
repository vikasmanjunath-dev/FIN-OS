import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateCone, validateCone, mulberry32, randn, simulatePaths, type ConeAssumptions } from '../lib/portfolioSimulate.ts';

const base: ConeAssumptions = { startValue: 1_000_000, annualReturnPct: 10, annualVolPct: 15, years: 10, monthlyContribution: 0, paths: 2000, seed: 42 };
const near = (a: number, b: number, rel: number) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${a} vs ${b}`);

test('the same assumptions and seed give exactly the same cone; another seed gives a different one', () => {
  const a = simulateCone(base)!, b = simulateCone({ ...base })!, c = simulateCone({ ...base, seed: 43 })!;
  assert.deepEqual(a, b);
  assert.notEqual(a.final.p50, c.final.p50);
  assert.deepEqual(a.assumptions, base);
});

test('with no volatility every path is the plain compounded return, so the whole range collapses to one number', () => {
  const k = simulateCone({ ...base, annualVolPct: 1, paths: 200 })!;   // 1% is the smallest volatility the screen accepts
  near(k.final.p50, 1_000_000 * 1.1 ** 10, 0.05);
  const exact = simulatePaths({ start: 1000, mu: Math.pow(1.1, 1 / 12) - 1, sigma: 0, steps: 120, paths: 3, rand: mulberry32(1) });
  exact.finals.forEach(v => near(v, 1000 * 1.1 ** 10, 1e-9));
});

test('monthly contributions with no volatility equal the annuity-due formula', () => {
  const mu = Math.pow(1.12, 1 / 12) - 1, c = 5000, n = 60;
  const r = simulatePaths({ start: 0, mu, sigma: 0, steps: n, paths: 1, rand: mulberry32(1), contribution: c });
  const expected = c * (1 + mu) * ((1 + mu) ** n - 1) / mu;
  near(r.finals[0], expected, 1e-9);
});

test('percentiles are ordered, the median sits near the theory, and a wider volatility widens the range', () => {
  const k = simulateCone({ ...base, paths: 5000 })!;
  const f = k.final;
  assert.ok(f.p5 <= f.p25 && f.p25 <= f.p50 && f.p50 <= f.p75 && f.p75 <= f.p95);
  // median of a lognormal walk: start * exp((ln(1+mu) - sigma^2/2) * steps)
  const med = 1_000_000 * Math.exp((Math.log(1 + k.monthlyMu) - k.monthlySigma ** 2 / 2) * 120);
  near(f.p50, med, 0.04);
  const wide = simulateCone({ ...base, annualVolPct: 30, paths: 5000 })!;
  assert.ok(wide.final.p95 - wide.final.p5 > f.p95 - f.p5);
  for (let i = 1; i < k.points.length; i++) assert.ok(k.points[i].month > k.points[i - 1].month);
  assert.equal(k.points[0].month, 0);
  assert.equal(k.points[0].p5, base.startValue);
  assert.equal(k.points[k.points.length - 1].month, 120);
  assert.equal(k.points[k.points.length - 1].p50, f.p50);          // the chart's end point is the headline figure
});

test('a path never goes below zero, and the money put in counts every contribution', () => {
  const k = simulateCone({ ...base, annualVolPct: 80, annualReturnPct: -20, paths: 500, monthlyContribution: 1000 })!;
  assert.ok(k.final.p5 >= 0);
  assert.equal(k.putIn, 1_000_000 + 1000 * 120);
  assert.ok(k.probBelowPutInPct >= 0 && k.probBelowPutInPct <= 100);
});

test('inputs outside the limits are refused with a reason, not clamped', () => {
  for (const bad of [{ startValue: 0 }, { annualReturnPct: 99 }, { annualVolPct: 0 }, { annualVolPct: 200 }, { years: 0 }, { years: 2.5 }, { years: 99 }, { paths: 10 }, { monthlyContribution: -5 }, { seed: 0 }, { seed: 1.5 }, { annualReturnPct: NaN }]) {
    const a = { ...base, ...bad };
    assert.ok(validateCone(a), JSON.stringify(bad));
    assert.equal(simulateCone(a), null);
  }
  assert.equal(validateCone(base), null);
});

test('the random generator is uniform in [0,1) and the normal draws have mean 0 and sd 1', () => {
  const r = mulberry32(7);
  const xs = Array.from({ length: 20000 }, () => r());
  assert.ok(xs.every(x => x >= 0 && x < 1));
  const z = Array.from({ length: 20000 }, () => randn(r));
  const m = z.reduce((s, v) => s + v, 0) / z.length, sd = Math.sqrt(z.reduce((s, v) => s + (v - m) ** 2, 0) / z.length);
  assert.ok(Math.abs(m) < 0.03 && Math.abs(sd - 1) < 0.03, `${m} ${sd}`);
});
