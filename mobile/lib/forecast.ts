// Spending forecast: port of js/finos-forecast.js (the website's Budget Forecast), with the data and the clock passed in.
// __tests__/forecast.parity.test.mts runs the website's real file against the same transactions and a frozen clock.
//
// Method (identical to the website): per category, Holt's double exponential smoothing over the complete months before `now`.
//   - only 'expense' rows are forecast (income and investing never count as spending);
//   - months before the first logged expense are "not recorded", not Rs 0;
//   - fewer than 3 months of logged spending is flagged as low confidence, and no trend or risk is read from it;
//   - event adjustments are FIXED RULES OF THUMB the person chooses to apply, not something learned from their history.
//
// Additions that are not in the website (all derived from the same numbers, none of them a new prediction):
//   `base` (the forecast before any event), `eventNotes` (which event moved which category, by which factor),
//   `lastMonth` per category, and compareToBudget().
//
// One deliberate difference: a category that is an empty string never matches an event (on the website, "".includes() matched everything).
import type { Txn } from './budget.ts';

export const EVENT_MULTIPLIERS: Record<string, Record<string, number>> = {
  'diwali':        { Shopping: 1.8, Entertainment: 1.5, Food: 1.3, Gifts: 2.5 },
  'eid':           { Shopping: 1.6, Food: 1.4, Gifts: 2.0 },
  'christmas':     { Shopping: 1.5, Entertainment: 1.4, Food: 1.3 },
  'new year':      { Entertainment: 1.6, Food: 1.3, Shopping: 1.3 },
  'holi':          { Food: 1.3, Entertainment: 1.4, Shopping: 1.2 },
  'wedding':       { Shopping: 2.0, Food: 1.5, Travel: 1.8 },
  'vacation':      { Travel: 2.5, Entertainment: 1.6, Food: 1.4 },
  'car insurance': { Insurance: 3.0, Transport: 1.2 },
  'school fees':   { Education: 2.0 },
  'tax filing':    { Investment: 1.5 },
  'medical':       { Healthcare: 2.5, Health: 2.5 },
};

export const EVENT_LABELS: Record<string, string> = {
  'diwali': 'Diwali', 'eid': 'Eid', 'christmas': 'Christmas', 'new year': 'New Year', 'holi': 'Holi', 'wedding': 'Wedding',
  'vacation': 'Vacation', 'car insurance': 'Car insurance', 'school fees': 'School fees', 'tax filing': 'Tax filing', 'medical': 'Medical',
};
export const EVENT_IDS = Object.keys(EVENT_MULTIPLIERS);

const pad = (n: number) => String(n).padStart(2, '0');

/** Month keys (YYYY-MM) for the `monthsBack` complete months before `now`, oldest first. */
export function monthKeys(monthsBack: number, now: Date = new Date()): string[] {
  const keys: string[] = [];
  for (let i = monthsBack; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  }
  return keys;
}

/** The month being forecast: the month after the last complete month of the window (the month `now` is in). */
export const forecastMonth = (now: Date = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;

/** Holt's linear smoothing: the next value of a series (never negative). */
export function holt(series: number[], alpha = 0.3, beta = 0.1): number {
  if (!series.length) return 0;
  if (series.length === 1) return series[0];
  let level = series[0];
  let trend = series[1] - series[0];
  for (let i = 1; i < series.length; i++) {
    const prev = level;
    level = alpha * series[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - prev) + (1 - beta) * trend;
  }
  return Math.max(0, level + trend);
}

/** The multiplier an event list applies to one category (first matching rule per event, events multiply). */
export function eventFactor(cat: string, events: string[] | undefined | null): number {
  let f = 1;
  const c = String(cat).toLowerCase();
  if (!c) return 1;
  (events || []).forEach(ev => {
    const mults = EVENT_MULTIPLIERS[ev] || {};
    for (const [mCat, mult] of Object.entries(mults)) {
      const m = mCat.toLowerCase();
      if (c.includes(m) || m.includes(c)) { f *= mult; break; }
    }
  });
  return f;
}

export type Trend = 'up' | 'down' | 'stable';
export interface EventNote { event: string; category: string; factor: number }
export interface ForecastResult {
  total: number;
  byCategory: Record<string, number>;
  base: Record<string, number>;               // the same forecast before any event is applied
  lastMonth: Record<string, number>;          // what the last complete month actually was, per forecast category
  trends: Record<string, Trend>;
  riskCats: string[];
  eventNotes: EventNote[];
  catMonthly: Record<string, Record<string, number>>;
  months: string[];
  monthsWithData: number;
  confidence: 'ok' | 'low';
  /** Plain amounts the website words as sentences; the screen words them itself. */
  buffer20: number;                           // 20% of the total, to the nearest 100
  topRiskLock: { category: string; amount: number } | null;   // 30% of the top risk category, to the nearest 100 (only with events)
}

export interface ForecastOptions { monthsBack?: number; events?: string[]; now?: Date }

export function compute(txns: Pick<Txn, 'date' | 'amount' | 'kind' | 'category'>[] | null | undefined, opts: ForecastOptions = {}): ForecastResult {
  const monthsBack = (opts.monthsBack as number) > 0 ? (opts.monthsBack as number) : 6;
  const events = opts.events || [];
  const months = monthKeys(monthsBack, opts.now);
  const inWindow = new Set(months);

  const catMonthly: Record<string, Record<string, number>> = {};
  const monthHasData = new Set<string>();
  (txns || []).forEach(t => {
    if (!t || t.kind !== 'expense') return;
    const key = String(t.date).slice(0, 7);
    if (!inWindow.has(key)) return;
    const row = (catMonthly[t.category] = catMonthly[t.category] || {});
    row[key] = (row[key] || 0) + t.amount;
    monthHasData.add(key);
  });

  // Only months from the first one with any logged spending count: earlier months are "not recorded", not "Rs 0".
  const firstIdx = months.findIndex(m => monthHasData.has(m));
  const usable = firstIdx < 0 ? [] : months.slice(firstIdx);

  const byCategory: Record<string, number> = {}, base: Record<string, number> = {}, lastMonth: Record<string, number> = {};
  const trends: Record<string, Trend> = {};
  const riskCats: string[] = [];
  const eventNotes: EventNote[] = [];
  Object.entries(catMonthly).forEach(([cat, monthly]) => {
    const series = usable.map(m => monthly[m] || 0);
    if (!series.length || series.every(v => v === 0)) return;
    const b = holt(series);
    const factor = eventFactor(cat, events);
    const predicted = b * factor;
    byCategory[cat] = Math.round(predicted);
    base[cat] = Math.round(b);
    lastMonth[cat] = Math.round(series[series.length - 1]);
    if (factor !== 1) {
      // which event(s) moved this category (same matching rule as eventFactor)
      const c = cat.toLowerCase();
      events.forEach(ev => {
        for (const [mCat, mult] of Object.entries(EVENT_MULTIPLIERS[ev] || {})) {
          const m = mCat.toLowerCase();
          if (c.includes(m) || m.includes(c)) { eventNotes.push({ event: ev, category: cat, factor: mult }); break; }
        }
      });
    }

    const last3 = series.slice(-3);
    const avg3 = last3.reduce((a, x) => a + x, 0) / Math.max(1, last3.length);
    const last = series[series.length - 1];
    const pct = avg3 > 0 ? (last - avg3) / avg3 : 0;
    // a trend needs at least three months to mean anything
    trends[cat] = series.length < 3 ? 'stable' : pct > 0.10 ? 'up' : pct < -0.10 ? 'down' : 'stable';
    if (series.length >= 3 && avg3 > 0 && (predicted - avg3) / avg3 > 0.20) riskCats.push(cat);
  });

  const total = Object.values(byCategory).reduce((a, b) => a + b, 0);
  let topRiskLock: ForecastResult['topRiskLock'] = null;
  if (events.length && riskCats.length) {
    const top = riskCats.slice().sort((a, b) => byCategory[b] - byCategory[a])[0];
    topRiskLock = { category: top, amount: Math.round((byCategory[top] * 0.3) / 100) * 100 };
  }
  const monthsWithData = usable.length;
  return {
    total, byCategory, base, lastMonth, trends, riskCats, eventNotes, catMonthly, months, monthsWithData,
    confidence: monthsWithData >= 3 ? 'ok' : 'low',
    buffer20: total > 0 ? Math.round((total * 0.2) / 100) * 100 : 0,
    topRiskLock,
  };
}

// ── The forecast against the person's own budget limits ────────────────────────────────────────────

export type LimitState = 'within' | 'close' | 'over';
export interface LimitRow { category: string; predicted: number; limit: number; diff: number; pct: number; state: LimitState }
export interface LimitCompare { rows: LimitRow[]; over: LimitRow[]; noLimit: string[]; totalPredicted: number; totalLimit: number }

/**
 * Each category that has a limit, with what is forecast for it. 'close' means within 10% of the limit.
 * Totals cover only the categories that have a limit, so a category you did not budget never makes the total look worse or better.
 * `noLimit` lists forecast categories without a limit (so the screen can say they are not compared).
 */
export function compareToBudget(byCategory: Record<string, number>, limits: Record<string, number> | null | undefined): LimitCompare {
  const lim = limits || {};
  const rows: LimitRow[] = [];
  Object.entries(lim).forEach(([category, limit]) => {
    if (!(limit > 0)) return;
    const predicted = byCategory[category] || 0;
    const diff = Math.round(predicted - limit);
    const pct = Math.round((predicted / limit) * 100);
    const state: LimitState = predicted > limit ? 'over' : predicted >= limit * 0.9 ? 'close' : 'within';
    rows.push({ category, predicted, limit, diff, pct, state });
  });
  rows.sort((a, b) => b.pct - a.pct);
  const noLimit = Object.keys(byCategory).filter(c => !(lim[c] > 0));
  return {
    rows, over: rows.filter(r => r.state === 'over'), noLimit,
    totalPredicted: rows.reduce((s, r) => s + r.predicted, 0),
    totalLimit: rows.reduce((s, r) => s + r.limit, 0),
  };
}
