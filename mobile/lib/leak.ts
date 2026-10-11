// Future Loss: what a monthly money leak would have become if it had been invested.
// A typed port of the pure half of js/finos-leak.js (compute / fv). __tests__/leak.parity.test.mts compares it with the real file.
// Only `expense` rows count; income and money put aside never do. Subscriptions use the larger of the tracker figure and the logged
// payments, never the sum.
import type { Txn } from '@/lib/budget';

export const DEFAULT_INCLUDE = ['Food & Dining', 'Entertainment', 'Shopping', 'Subscriptions'];
export const HORIZONS = [10, 20, 30];
export const MIN_DAYS = 14;
export const WINDOW_DAYS = 90;
export const DEFAULT_RATE = 12;
export const DEFAULT_REDIRECT = 25;
const SUBS = 'Subscriptions';

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Future value of `monthly` invested at the start of every month for `years` at `annualPct` a year. */
export function fv(monthly: number, annualPct: number, years: number): number {
  const n = Math.round(years * 12), i = annualPct / 1200;
  if (!(monthly > 0) || n <= 0) return 0;
  return i === 0 ? monthly * n : monthly * ((Math.pow(1 + i, n) - 1) / i) * (1 + i);
}

export interface HorizonRow { years: number; invested: number; value: number; gain: number }
const horizonRows = (monthly: number, rate: number): HorizonRow[] => HORIZONS.map(years => {
  const invested = monthly * years * 12, value = fv(monthly, rate, years);
  return { years, invested: Math.round(invested), value: Math.round(value), gain: Math.round(value - invested) };
});

// dates as plain YYYY-MM-DD strings (UTC maths, so IST never shifts a day)
const ISO = /^(\d{4})-(\d{2})-(\d{2})/;
const dayNum = (iso: string) => { const m = ISO.exec(iso); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5 : NaN; };
const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (d: Date) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

export interface LeakOptions { txns?: Pick<Txn, 'kind' | 'amount' | 'date' | 'category'>[]; subscriptionsMonthly?: number; now?: Date; include?: string[]; rate?: number; redirectPct?: number }
export interface LeakCategory { category: string; monthly: number; included: boolean }
export interface LeakResult {
  enoughData: boolean; days: number; rate: number; redirectPct: number; categories: LeakCategory[]; monthly: number; hasAnyData: boolean;
  horizons: HorizonRow[]; redirect: { pct: number; monthly: number; horizons: HorizonRow[] };
}

export function compute(opts: LeakOptions = {}): LeakResult {
  const rate = clamp(Number.isFinite(+(opts.rate as number)) ? +(opts.rate as number) : DEFAULT_RATE, 0, 30);
  const redirectPct = clamp(Number.isFinite(+(opts.redirectPct as number)) ? +(opts.redirectPct as number) : DEFAULT_REDIRECT, 0, 100);
  const include = new Set(Array.isArray(opts.include) ? opts.include : DEFAULT_INCLUDE);
  const subsMonthly = Math.max(0, Number(opts.subscriptionsMonthly) || 0);
  const todayISO = isoOf(opts.now instanceof Date ? opts.now : new Date());
  const today = dayNum(todayISO), start = today - (WINDOW_DAYS - 1);

  const rows = (Array.isArray(opts.txns) ? opts.txns : []).filter(t => t && t.kind === 'expense' && t.amount > 0 && Number.isFinite(dayNum(t.date)));
  const win = rows.filter(t => { const d = dayNum(t.date); return d >= start && d <= today; });
  const first = win.reduce((m, t) => Math.min(m, dayNum(t.date)), Infinity);
  const days = win.length ? today - first + 1 : 0;
  const enoughData = days >= MIN_DAYS;

  const byCat: Record<string, number> = {};
  if (enoughData) win.forEach(t => { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
  const monthlyOf: Record<string, number> = {};
  Object.keys(byCat).forEach(c => { monthlyOf[c] = (byCat[c] * 30) / days; });
  if (subsMonthly > 0) monthlyOf[SUBS] = Math.max(monthlyOf[SUBS] || 0, subsMonthly);

  const categories = Object.keys(monthlyOf)
    .map(category => ({ category, monthly: Math.round(monthlyOf[category]), included: include.has(category) }))
    .filter(c => c.monthly > 0)
    .sort((a, b) => b.monthly - a.monthly);
  const monthly = categories.reduce((s, c) => s + (c.included ? c.monthly : 0), 0);
  const redirectMonthly = Math.round((monthly * redirectPct) / 100);

  return {
    enoughData, days, rate, redirectPct, categories, monthly,
    hasAnyData: categories.length > 0,
    horizons: horizonRows(monthly, rate),
    redirect: { pct: redirectPct, monthly: redirectMonthly, horizons: horizonRows(redirectMonthly, rate) },
  };
}
