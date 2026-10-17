// Plain statistics used by the portfolio analytics screens. Pure: arrays in, numbers out, no React, no storage, no network.
//
// mean / std / cov / corr / linReg are ports of the helpers of the same name in Porfolio Analyser/portfolio-analyser-v10.html
// (kept with the same behaviour on purpose, including the sample (n-1) standard deviation and the "not enough data" results);
// __tests__/portfolioAnalytics.parity.test.mts runs the website's own code against these on random and edge inputs.
// Everything else here is new, and says so in its comment.

export function mean(a: number[]): number { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0; }
/** Sample standard deviation (n-1). 0 for fewer than two values. */
export function std(a: number[]): number {
  const m = mean(a);
  return a.length > 1 ? Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)) : 0;
}
export function cov(a: number[], b: number[]): number {
  const ma = mean(a), mb = mean(b), n = Math.min(a.length, b.length);
  return n > 1 ? a.slice(0, n).reduce((s, x, i) => s + (x - ma) * (b[i] - mb), 0) / (n - 1) : 0;
}
/** NOTE (website quirk kept for parity): cov() uses the mean of the whole of each array, std() likewise, so unequal lengths are only approximately a correlation. */
export function corr(a: number[], b: number[]): number { const s1 = std(a), s2 = std(b); return s1 && s2 ? cov(a, b) / (s1 * s2) : 0; }
/** Ordinary least squares of y on x: intercept a, slope b, R squared. Fewer than 3 points gives zeros (the website's behaviour). */
export function linReg(x: number[], y: number[]): { a: number; b: number; r2: number } {
  const n = Math.min(x.length, y.length);
  if (n < 3) return { a: 0, b: 0, r2: 0 };
  const xs = x.slice(0, n), ys = y.slice(0, n);
  const mx = mean(xs), my = mean(ys);
  const ss = xs.reduce((s, xi, i) => s + (xi - mx) * (ys[i] - my), 0);
  const sx = xs.reduce((s, xi) => s + (xi - mx) ** 2, 0);
  const b = sx ? ss / sx : 0;
  const a = my - b * mx;
  const ssRes = ys.reduce((s, yi, i) => s + (yi - (a + b * xs[i])) ** 2, 0);
  const ssTot = ys.reduce((s, yi) => s + (yi - my) ** 2, 0);
  return { a, b, r2: ssTot ? 1 - ssRes / ssTot : 0 };
}

/** Simple returns between consecutive positive closes (a non-positive or non-finite close breaks the pair). */
export function simpleReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const p0 = closes[i - 1], p1 = closes[i];
    if (Number.isFinite(p0) && Number.isFinite(p1) && p0 > 0 && p1 > 0) out.push((p1 - p0) / p0);
  }
  return out;
}

// ── new in the phone app (no website equivalent) ─────────────────────────────

export interface Drawdown {
  /** most negative peak-to-trough fall as a fraction, 0 or below (-0.18 = fell 18%) */
  maxDd: number;
  peakIndex: number; troughIndex: number;
  /** first index after the trough that is back at the old peak, or null if it had not recovered by the end */
  recoveredIndex: number | null;
  /** the fall at each point from the running peak, as fractions <= 0 */
  series: number[];
}
/** Largest fall from a running peak in a series of values (prices or a growth index). Needs at least 2 positive values. */
export function drawdown(values: number[]): Drawdown | null {
  const v = values.filter(x => Number.isFinite(x) && x > 0);
  if (v.length !== values.length || v.length < 2) return null;
  let peak = v[0], peakIdx = 0, worst = 0, wp = 0, wt = 0;
  const series: number[] = [];
  for (let i = 0; i < v.length; i++) {
    if (v[i] > peak) { peak = v[i]; peakIdx = i; }
    const d = v[i] / peak - 1;
    series.push(d);
    if (d < worst) { worst = d; wp = peakIdx; wt = i; }
  }
  let rec: number | null = null;
  if (worst < 0) for (let i = wt + 1; i < v.length; i++) if (v[i] >= v[wp]) { rec = i; break; }
  return { maxDd: worst, peakIndex: wp, troughIndex: wt, recoveredIndex: rec, series };
}

/** Ulcer index (Peter Martin): root of the mean squared percentage drawdown. In percent points, 0 or more. */
export function ulcerIndex(series: number[]): number {
  return series.length ? Math.sqrt(series.reduce((s, d) => s + (d * 100) ** 2, 0) / series.length) : 0;
}

/** Growth index (starts at 1) from a list of period returns. */
export function growthIndex(returns: number[]): number[] {
  const out = [1];
  for (const r of returns) out.push(out[out.length - 1] * (1 + r));
  return out;
}

/** Percent fall -> percent gain needed to get back: 10 -> 11.11, 50 -> 100. Null outside 0..100 (exclusive of 100). */
export function recoveryNeededPct(lossPct: number): number | null {
  if (!Number.isFinite(lossPct) || lossPct < 0 || lossPct >= 100) return null;
  return (lossPct / (100 - lossPct)) * 100;
}

/** Average profit per trade: winRate*avgWin - (1-winRate)*avgLoss. avgLoss is a positive amount. Null for rates outside 0..1 or negative amounts. */
export function expectancy(winRate: number, avgWin: number, avgLoss: number): number | null {
  if (![winRate, avgWin, avgLoss].every(Number.isFinite) || winRate < 0 || winRate > 1 || avgWin < 0 || avgLoss < 0) return null;
  return winRate * avgWin - (1 - winRate) * avgLoss;
}
/** Win rate (0..1) at which expectancy is zero: avgLoss / (avgWin + avgLoss). Null when both amounts are 0 or invalid. */
export function breakEvenWinRate(avgWin: number, avgLoss: number): number | null {
  if (![avgWin, avgLoss].every(Number.isFinite) || avgWin < 0 || avgLoss < 0 || avgWin + avgLoss === 0) return null;
  return avgLoss / (avgWin + avgLoss);
}
/** Sum of winning trades over the sum of losing trades (both positive amounts). Null when there are no losses to divide by. */
export function profitFactor(grossProfit: number, grossLoss: number): number | null {
  if (![grossProfit, grossLoss].every(Number.isFinite) || grossProfit < 0 || grossLoss <= 0) return null;
  return grossProfit / grossLoss;
}

/** Percentile of an ascending array by the website's index rule: sorted[floor(p/100 * n)] (clamped to the last element). */
export function percentileFloor(sortedAsc: number[], p: number): number {
  if (!sortedAsc.length) return NaN;
  return sortedAsc[Math.min(sortedAsc.length - 1, Math.floor((p / 100) * sortedAsc.length))];
}
