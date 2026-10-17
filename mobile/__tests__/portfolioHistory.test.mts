import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRetro, riskMetrics, perHoldingRisk, type PricePoint, type HoldingSeries } from '../lib/portfolioHistory.ts';
import { drawdown, recoveryNeededPct, expectancy, breakEvenWinRate, profitFactor, ulcerIndex } from '../lib/portfolioStats.ts';

const day = (i: number) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
const series = (f: (i: number) => number, n: number, skip: number[] = []): PricePoint[] => Array.from({ length: n }, (_, i) => i).filter(i => !skip.includes(i)).map(i => ({ date: day(i), close: f(i) }));
const near = (a: number, b: number, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);

test('portfolio return is the value-weighted mean of holding returns, day by day', () => {
  const bench = series(i => 100 + i, 40);
  const A: HoldingSeries = { key: 'A', label: 'A', value: 300, points: series(i => 10 * 1.01 ** i, 40) };
  const B: HoldingSeries = { key: 'B', label: 'B', value: 100, points: series(i => 50 * 0.99 ** i, 40) };
  const r = buildRetro([A, B], bench)!;
  assert.equal(r.port.length, 39);
  near(r.port[0], 0.75 * 0.01 + 0.25 * -0.01);
  near(r.bench[0], 1 / 100);
  assert.equal(r.coveragePct, 100);
  assert.equal(r.excluded.length, 0);
});

test('a holding with no history is excluded with a reason and lowers the coverage; nothing is carried forward over a gap', () => {
  const bench = series(i => 100 + i, 60);
  const A: HoldingSeries = { key: 'A', label: 'A', value: 300, points: series(() => 10, 60, [10, 11, 12]) };
  const B: HoldingSeries = { key: 'B', label: 'B', value: 100, points: [] };
  const r = buildRetro([A, B], bench)!;
  assert.deepEqual(r.excluded.map(e => e.key), ['B']);
  assert.match(r.excluded[0].reason, /No price history/);
  near(r.coveragePct, 75);
  // days 10, 11, 12 are missing for A, so the returns ending on days 10, 11, 12 and 13 are absent (59 pairs minus 4)
  assert.equal(r.port.length, 59 - 4);
  assert.ok(!r.dates.includes(day(11)));
});

test('price series are normalised: invalid dates and prices are ignored, dates sort, last duplicate wins', () => {
  const bench = series(i => 100 + i, 40).reverse();
  bench.push({ date: day(5), close: 999 }, { date: '2026-02-30', close: 100 }, { date: day(6), close: Infinity });
  const points = series(i => 10 + i, 40).reverse();
  points.push({ date: day(5), close: 50 });
  const r = buildRetro([{ key: 'A', label: 'A', value: 1, points }], bench)!;
  assert.equal(r.dates.length, 39);
  assert.equal(r.dates[0], day(1));
  // The duplicate quote for day 5 is the last one in the source; day 6 returns use it.
  near(r.port[r.dates.indexOf(day(6))], 16 / 50 - 1);
  assert.equal(r.bench[r.dates.indexOf(day(6))], 106 / 999 - 1);
});

test('too little history, or no holdings, gives null rather than numbers', () => {
  const bench = series(i => 100 + i, 20);
  assert.equal(buildRetro([{ key: 'A', label: 'A', value: 1, points: series(() => 1, 20) }], bench), null);
  assert.equal(buildRetro([], series(i => 100 + i, 60)), null);
  assert.equal(riskMetrics({ dates: ['2026-01-01'], port: [0.01], bench: [0.01] }, 6.5), null);
});

test('non-finite holding weights are excluded and overflowing cumulative returns are refused', () => {
  const bench = series(i => 100 + i, 60);
  const good: HoldingSeries = { key: 'A', label: 'A', value: 1, points: series(i => 100 + i, 60) };
  const r = buildRetro([good, { key: 'bad', label: 'bad', value: Infinity, points: series(i => 10 + i, 60) }], bench)!;
  assert.deepEqual(r.excluded.map(x => x.key), ['bad']);
  assert.equal(r.coveragePct, 100);
  const dates = Array.from({ length: 60 }, (_, i) => day(i));
  const extreme = Array.from({ length: 60 }, (_, i) => i < 2 ? 1e200 : 0);
  assert.equal(riskMetrics({ dates, port: extreme, bench: dates.map(() => 0) }, 0), null);
});

test('a portfolio that is exactly 1.5 times Nifty has beta 1.5, R squared 1 and no alpha', () => {
  const bench = Array.from({ length: 120 }, (_, i) => Math.sin(i / 3) * 0.01 + 0.0003);
  const port = bench.map(b => 1.5 * b);
  const m = riskMetrics({ dates: bench.map((_, i) => day(i)), port, bench }, 0)!;
  near(m.beta, 1.5, 1e-9); near(m.r2, 1, 1e-9); near(m.alphaAnnPct, 0, 1e-9); near(m.correlation!, 1, 1e-9);
});

test('flat benchmark does not produce a fabricated zero beta or alpha', () => {
  const dates = Array.from({ length: 60 }, (_, i) => day(i));
  const m = riskMetrics({ dates, port: dates.map((_, i) => i % 2 ? 0.01 : -0.01), bench: dates.map(() => 0) }, 6.5)!;
  assert.equal(m.beta, null); assert.equal(m.alphaAnnPct, null); assert.equal(m.r2, null);
});

test('CAPM alpha uses excess portfolio and benchmark returns, and malformed series are refused', () => {
  const dates = Array.from({ length: 80 }, (_, i) => day(i));
  const bench = dates.map((_, i) => Math.sin(i / 3) * 0.01 + 0.0003);
  const port = bench.map(b => 1.5 * b);
  const m = riskMetrics({ dates, port, bench }, 6.5)!;
  near(m.alphaAnnPct, (6.5 / 100 / 252) * 0.5 * 252 * 100, 1e-8);
  assert.equal(riskMetrics({ dates, port: port.map((x, i) => i === 10 ? NaN : x), bench }, 6.5), null);
  assert.equal(riskMetrics({ dates, port, bench: bench.map((x, i) => i === 10 ? -1 : x) }, 6.5), null);
  assert.equal(riskMetrics({ dates: [...dates.slice(1), dates[0]], port, bench }, 6.5), null);
  assert.equal(riskMetrics({ dates, port, bench }, 6.5, 0), null);
});

test('drawdown: 100 -> 120 -> 90 -> 130 falls 25% and recovers; ulcer and recovery maths', () => {
  const d = drawdown([100, 120, 90, 130])!;
  near(d.maxDd, -0.25); assert.equal(d.peakIndex, 1); assert.equal(d.troughIndex, 2); assert.equal(d.recoveredIndex, 3);
  assert.equal(drawdown([100, 120, 90, 100])!.recoveredIndex, null);
  assert.equal(drawdown([100]), null); assert.equal(drawdown([100, -1]), null);
  near(recoveryNeededPct(50)!, 100); near(recoveryNeededPct(10)!, 100 / 9);
  assert.equal(recoveryNeededPct(100), null); assert.equal(recoveryNeededPct(-1), null);
  near(ulcerIndex([0, -0.1, -0.1, 0]), Math.sqrt((100 + 100) / 4));
});

test('metrics: flat portfolio has no volatility and no Sharpe; dates of the worst fall are reported', () => {
  const dates = Array.from({ length: 60 }, (_, i) => day(i));
  const flat = riskMetrics({ dates, port: dates.map(() => 0), bench: dates.map((_, i) => (i % 2 ? 0.01 : -0.01)) }, 6.5)!;
  assert.equal(flat.volPct, 0); assert.equal(flat.maxDdPct, 0);
  const port = dates.map((_, i) => (i === 30 ? -0.1 : 0.002));
  const m = riskMetrics({ dates, port, bench: port }, 6.5)!;
  assert.ok(m.maxDdPct < -9.9); assert.equal(m.ddTroughDate, dates[30]); assert.equal(m.worstDayPct, -10);
  assert.equal(m.annualisedReturnPct, null);          // 60 days: not annualised
});

test('per-holding beta against the benchmark', () => {
  const bench = series(i => 100 * (1 + 0.01 * Math.sin(i)) ** 1 + i, 80);
  const px = bench.map(p => p.close);
  const H: HoldingSeries = { key: 'H', label: 'H', value: 1, points: bench.map((p, i) => ({ date: p.date, close: px[0] * (px[i] / px[0]) })) };
  const r = buildRetro([H], bench)!;
  const ph = perHoldingRisk([H], bench, r.included);
  near(ph[0].beta!, 1, 1e-9);
});

test('trade statistics', () => {
  near(expectancy(0.4, 4000, 900)!, 1060);
  assert.equal(expectancy(1.2, 1, 1), null); assert.equal(expectancy(0.5, -1, 1), null);
  near(breakEvenWinRate(4000, 900)!, 900 / 4900);
  assert.equal(breakEvenWinRate(0, 0), null);
  near(profitFactor(120000, 60000)!, 2); assert.equal(profitFactor(1, 0), null);
});

test('a day on which too little of the portfolio had a price is dropped, not averaged over what is left', () => {
  const bench = series(i => 100 + i, 80);
  const A: HoldingSeries = { key: 'A', label: 'A', value: 100, points: series(i => 10 + i * 0.01, 80) };
  const B: HoldingSeries = { key: 'B', label: 'B', value: 300, points: series(i => 50 + i * 0.01, 80).slice(0, 40) };
  const r = buildRetro([A, B], bench)!;
  assert.ok(r.droppedDays > 30);
  assert.equal(r.port.length + r.droppedDays, 79);
  assert.ok(r.avgDayCoveragePct >= 60);
});
