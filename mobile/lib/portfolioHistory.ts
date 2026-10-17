// "What would today's portfolio have done over the last year": the price history of each holding, combined at today's
// weights, set against Nifty 50 (a retrospective proxy, the same idea as the website's "current-weight price-return proxy").
//
// It is NOT the person's actual return: it ignores when they bought, SIP timing, sales, dividends and tax, uses price/NAV
// changes only, and covers only the holdings whose history could be fetched (the share of value it covers is reported).
// Pure: price series in, numbers out. "Now" and the network are the caller's business.
import { mean, std, cov, linReg, drawdown, ulcerIndex, growthIndex } from '@/lib/portfolioStats';

export interface PricePoint { date: string; close: number }          // date is YYYY-MM-DD, ascending
export interface HoldingSeries { key: string; label: string; value: number; points: PricePoint[] }

export const TRADING_DAYS = 252;
export const MIN_POINTS = 30;            // a history shorter than this says nothing about risk
export const MIN_DAY_COVERAGE = 0.6;     // a day counts only if holdings worth at least this share of the included value moved that day

export interface Retro {
  dates: string[];                // the day each return ends on
  port: number[];                 // portfolio return that day at today's weights
  bench: number[];                // Nifty 50 return that day
  included: { key: string; label: string; weightPct: number }[];
  excluded: { key: string; label: string; reason: string }[];
  /** share of the portfolio's current value that is in `included`, percent */
  coveragePct: number;
  /** average over the counted days of the value share that had a return that day, percent of the included value */
  avgDayCoveragePct: number;
  /** days dropped because too little of the portfolio had a price that day */
  droppedDays: number;
}

const validDate = (date: unknown): date is string => {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === date;
};
/** Valid dated closes, ordered by date; the last valid duplicate date wins. */
const cleanPoints = (pts: PricePoint[]) => {
  const byDay = new Map<string, number>();
  pts.forEach(p => { if (p && validDate(p.date) && Number.isFinite(p.close) && p.close > 0) byDay.set(p.date, p.close); });
  return [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, close]) => ({ date, close }));
};
const byDate = (pts: PricePoint[]) => new Map(cleanPoints(pts).map(p => [p.date, p.close]));

/**
 * Builds the aligned daily series. `bench` fixes the trading days. A holding contributes on a day only if it has a price on that
 * day AND on the previous benchmark day (no price is carried forward: a stale price would show as a fake flat day). Holdings with
 * fewer than MIN_POINTS usable points are listed under `excluded` with the reason.
 */
export function buildRetro(holdings: HoldingSeries[], bench: PricePoint[]): Retro | null {
  const bm = cleanPoints(bench);
  if (bm.length < MIN_POINTS) return null;
  const excluded: Retro['excluded'] = [];
  const usable: { key: string; label: string; value: number; px: Map<string, number> }[] = [];
  for (const h of holdings) {
    const px = byDate(h.points);
    const hits = bm.filter(p => px.has(p.date)).length;
    if (!Number.isFinite(h.value) || !(h.value > 0)) { excluded.push({ key: h.key, label: h.label, reason: 'No finite positive value to weight it by' }); continue; }
    if (hits < MIN_POINTS) { excluded.push({ key: h.key, label: h.label, reason: px.size ? 'Too little price history on the same days as Nifty' : 'No price history came back' }); continue; }
    usable.push({ key: h.key, label: h.label, value: h.value, px });
  }
  if (!usable.length) return null;
  const incTotal = usable.reduce((s, u) => s + u.value, 0);
  const allTotal = holdings.reduce((s, h) => s + (Number.isFinite(h.value) && h.value > 0 ? h.value : 0), 0);   // a holding whose fetch failed is passed in with no points, so it counts here and is listed as excluded
  if (!Number.isFinite(incTotal) || incTotal <= 0 || !Number.isFinite(allTotal)) return null;
  const dates: string[] = [], port: number[] = [], benchR: number[] = [];
  let covSum = 0, dropped = 0;
  for (let i = 1; i < bm.length; i++) {
    const d0 = bm[i - 1].date, d1 = bm[i].date;
    let w = 0, wr = 0;
    for (const u of usable) {
      const p0 = u.px.get(d0), p1 = u.px.get(d1);
      if (p0 === undefined || p1 === undefined) continue;
      const ret = p1 / p0 - 1;
      if (!Number.isFinite(ret) || ret <= -1) continue;
      const contribution = u.value * ret;
      if (!Number.isFinite(contribution)) continue;
      w += u.value; wr += contribution;
    }
    const cov = w / incTotal;
    const benchReturn = bm[i].close / bm[i - 1].close - 1;
    const portfolioReturn = wr / w;
    if (cov < MIN_DAY_COVERAGE || !Number.isFinite(benchReturn) || benchReturn <= -1 || !Number.isFinite(portfolioReturn) || portfolioReturn <= -1) { dropped++; continue; }
    dates.push(d1); port.push(portfolioReturn); benchR.push(benchReturn); covSum += cov;
  }
  if (port.length < MIN_POINTS) return null;
  return {
    dates, port, bench: benchR,
    included: usable.map(u => ({ key: u.key, label: u.label, weightPct: (u.value / incTotal) * 100 })),
    excluded,
    coveragePct: allTotal > 0 ? (incTotal / allTotal) * 100 : 100,
    avgDayCoveragePct: (covSum / port.length) * 100,
    droppedDays: dropped,
  };
}

export interface RiskMetrics {
  days: number; startDate: string; endDate: string;
  totalReturnPct: number; annualisedReturnPct: number | null; benchTotalReturnPct: number;
  volPct: number; benchVolPct: number;
  sharpe: number | null; sortino: number | null;
  maxDdPct: number; ddPeakDate: string | null; ddTroughDate: string | null; ddRecovered: boolean; calmar: number | null; ulcer: number;
  beta: number | null; alphaAnnPct: number | null; r2: number | null; correlation: number | null;
  trackingErrorPct: number; infoRatio: number | null;
  bestDayPct: number; worstDayPct: number; downDaysPct: number;
  rfAnnualPct: number; periodsPerYear: number;
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/**
 * Risk numbers from the aligned series. Beta and CAPM alpha use excess returns regressed on Nifty excess returns;
 * Sharpe, tracking error and the information ratio use the website's formulas (excess = return minus rf/periods, annualised by
 * sqrt(periods); alpha annualised by simple multiplication). Sortino uses the usual downside deviation (root mean square of the
 * shortfall below the risk-free rate), not the website's standard deviation of the negative days.
 * `periodsPerYear` is 252 for daily series (the website, which uses weekly data, passes 52).
 */
export function riskMetrics(r: Pick<Retro, 'dates' | 'port' | 'bench'>, rfAnnualPct: number, periodsPerYear = TRADING_DAYS): RiskMetrics | null {
  const n = r.port.length;
  if (n < 5 || r.bench.length !== n || r.dates.length !== n || !Number.isFinite(rfAnnualPct) || !Number.isFinite(periodsPerYear) || periodsPerYear <= 0) return null;
  if (r.dates.some((d, i) => !validDate(d) || (i > 0 && d <= r.dates[i - 1]))) return null;
  if (r.port.some(x => !Number.isFinite(x) || x <= -1) || r.bench.some(x => !Number.isFinite(x) || x <= -1)) return null;
  const rf = rfAnnualPct / 100 / periodsPerYear;
  const excess = r.port.map(x => x - rf);
  const sd = std(excess);
  const growth = growthIndex(r.port), bgrowth = growthIndex(r.bench);
  if (growth.some(x => !Number.isFinite(x) || x <= 0) || bgrowth.some(x => !Number.isFinite(x) || x <= 0)) return null;
  const dd = drawdown(growth);
  const total = growth[growth.length - 1] - 1;
  const years = dayDiff(r.dates[0], r.dates[n - 1]) / 365;
  // annualising less than ~3 months of returns would turn noise into a headline number
  const annualised = years >= 0.25 && total > -1 ? (Math.pow(1 + total, 1 / years) - 1) * 100 : null;
  const benchmarkVol = std(r.bench), portfolioVol = std(r.port);
  const regression = linReg(r.bench, r.port);
  // A zero-variance benchmark has no slope; a constant portfolio has no defined R².
  const beta = benchmarkVol > 0 ? regression.b : null;
  const r2 = benchmarkVol > 0 && portfolioVol > 0 ? regression.r2 : null;
  const capmAlphaDaily = beta === null ? null : mean(excess) - beta * mean(r.bench.map(x => x - rf));
  const active = r.port.map((x, i) => x - r.bench[i]);
  const activeSd = std(active);
  const sp = std(r.port), sb = std(r.bench);
  const downside = Math.sqrt(r.port.reduce((s, x) => s + Math.min(0, x - rf) ** 2, 0) / n);
  const maxDdPct = dd ? dd.maxDd * 100 : 0;
  const calculated = [total * 100, annualised, (bgrowth[bgrowth.length - 1] - 1) * 100,
    sp * Math.sqrt(periodsPerYear) * 100, sb * Math.sqrt(periodsPerYear) * 100,
    sd ? (mean(excess) / sd) * Math.sqrt(periodsPerYear) : null,
    downside ? (mean(excess) / downside) * Math.sqrt(periodsPerYear) : null,
    maxDdPct, dd ? ulcerIndex(dd.series) : 0, beta, r2,
    capmAlphaDaily === null ? null : capmAlphaDaily * periodsPerYear * 100,
    activeSd * Math.sqrt(periodsPerYear) * 100,
    activeSd ? (mean(active) / activeSd) * Math.sqrt(periodsPerYear) : null,
    Math.max(...r.port) * 100, Math.min(...r.port) * 100];
  if (calculated.some(x => x !== null && !Number.isFinite(x))) return null;
  return {
    days: n, startDate: r.dates[0], endDate: r.dates[n - 1],
    totalReturnPct: total * 100, annualisedReturnPct: annualised, benchTotalReturnPct: (bgrowth[bgrowth.length - 1] - 1) * 100,
    volPct: sp * Math.sqrt(periodsPerYear) * 100, benchVolPct: sb * Math.sqrt(periodsPerYear) * 100,
    sharpe: sd ? (mean(excess) / sd) * Math.sqrt(periodsPerYear) : null,
    sortino: downside ? (mean(excess) / downside) * Math.sqrt(periodsPerYear) : null,
    // growth[i] is the value at the end of dates[i-1]; growth[0] is the start of the window, so a peak at index 0 has no date (null = the start)
    maxDdPct, ddPeakDate: dd && dd.maxDd < 0 && dd.peakIndex > 0 ? r.dates[dd.peakIndex - 1] : null,
    ddTroughDate: dd && dd.maxDd < 0 ? r.dates[dd.troughIndex - 1] ?? null : null,
    ddRecovered: !!dd && dd.maxDd < 0 && dd.recoveredIndex !== null,
    calmar: annualised !== null && maxDdPct < 0 ? annualised / Math.abs(maxDdPct) : null,
    ulcer: dd ? ulcerIndex(dd.series) : 0,
    beta, alphaAnnPct: capmAlphaDaily === null ? null : capmAlphaDaily * periodsPerYear * 100, r2,
    correlation: sp && sb ? Math.max(-1, Math.min(1, cov(r.port, r.bench) / (sp * sb))) : null,
    trackingErrorPct: activeSd * Math.sqrt(periodsPerYear) * 100,
    infoRatio: activeSd ? (mean(active) / activeSd) * Math.sqrt(periodsPerYear) : null,
    bestDayPct: Math.max(...r.port) * 100, worstDayPct: Math.min(...r.port) * 100,
    downDaysPct: (r.port.filter(x => x < 0).length / n) * 100,
    rfAnnualPct, periodsPerYear,
  };
}

export interface HoldingRisk { key: string; label: string; weightPct: number; days: number; returnPct: number; volPct: number; beta: number | null }
/** Per-holding price change, volatility and beta over the same window, from each holding's own aligned daily returns. */
export function perHoldingRisk(holdings: HoldingSeries[], bench: PricePoint[], included: Retro['included']): HoldingRisk[] {
  const bm = cleanPoints(bench);
  const out: HoldingRisk[] = [];
  for (const inc of included) {
    const h = holdings.find(x => x.key === inc.key);
    if (!h) continue;
    const px = byDate(h.points);
    const hr: number[] = [], br: number[] = [];
    let first: number | null = null, last: number | null = null;
    for (let i = 1; i < bm.length; i++) {
      const p0 = px.get(bm[i - 1].date), p1 = px.get(bm[i].date);
      if (p0 === undefined || p1 === undefined) continue;
      if (first === null) first = p0;
      last = p1;
      hr.push(p1 / p0 - 1); br.push(bm[i].close / bm[i - 1].close - 1);
    }
    if (hr.length < MIN_POINTS || first === null || last === null) continue;
    const sb = std(br);
    out.push({
      key: h.key, label: h.label, weightPct: inc.weightPct, days: hr.length,
      returnPct: (last / first - 1) * 100,       // first and last priced days: a gap in the middle is not bridged, so this is the start-to-end move
      volPct: std(hr) * Math.sqrt(TRADING_DAYS) * 100,
      beta: sb ? cov(br, hr) / (sb * sb) : null,
    });
  }
  return out.sort((a, b) => b.weightPct - a.weightPct);
}
