// Returns from a fund's NAV history: point-to-point, rolling and an example SIP.
// Pure. The history comes from a backend endpoint that does not exist yet (see docs/agent-notes/insurance-mf.md); until it does, the
// screens show "history not available" and none of this runs. It is built and tested now so the data can be plugged in without
// touching the maths, and so the rule below holds from day one:
//
//   A return is only produced when the history really covers the window it names. A "3 year return" needs a NAV within
//   MAX_GAP_DAYS before the date three years back; otherwise the answer is `insufficient`, with the reason, never a shorter-period
//   number dressed up as a 3 year one.
import { xirr } from './xirr.ts';
import { parseNavDate } from './funds.ts';

export interface NavPoint { date: string; nav: number }
export interface History { points: NavPoint[]; asOf: string | null; source: string | null }

/** The most days a NAV may sit before a target date and still stand for it (a weekend plus a holiday or two). */
export const MAX_GAP_DAYS = 7;
const DAY = 86400000;
const pad = (n: number) => String(n).padStart(2, '0');
const t = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };

/** Same day-of-month `months` earlier, clamped to the month's last day (31 Mar - 1 month = 28/29 Feb). */
export function monthsBefore(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const idx = y * 12 + (m - 1) - months;
  const ny = Math.floor(idx / 12), nm = idx % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${pad(nm + 1)}-${pad(Math.min(d, last))}`;
}

/**
 * Reads the backend's history payload: { points: [{ date, nav }], as_of?, source? }. Dates may be ISO or the feed's DD-Mon-YYYY /
 * DD-MM-YYYY. Rows that are not a real date and a positive NAV are dropped; duplicates keep the last; the result is ascending.
 * Returns null when nothing usable is left.
 */
export function parseHistory(payload: any): History | null {
  const rows = Array.isArray(payload?.points) ? payload.points : Array.isArray(payload?.data) ? payload.data : null;
  if (!rows) return null;
  const byDate = new Map<string, number>();
  for (const r of rows) {
    const date = parseNavDate(r?.date);
    const nav = typeof r?.nav === 'number' ? r.nav : parseFloat(String(r?.nav ?? ''));
    if (date && Number.isFinite(nav) && nav > 0) byDate.set(date, nav);
  }
  const points = [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, nav]) => ({ date, nav }));
  if (!points.length) return null;
  const asOf = parseNavDate(payload?.as_of) || null;
  return { points, asOf, source: typeof payload?.source === 'string' ? payload.source : null };
}

/** The last NAV on or before `target`, and how many days earlier it is. Binary search over an ascending list. */
export function navOnOrBefore(points: NavPoint[], target: string): { point: NavPoint; gapDays: number } | null {
  let lo = 0, hi = points.length - 1, at = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].date <= target) { at = mid; lo = mid + 1; } else hi = mid - 1;
  }
  if (at < 0) return null;
  return { point: points[at], gapDays: Math.round((t(target) - t(points[at].date)) / DAY) };
}

/** The first NAV on or after `target` (an instalment bought on the next business day). */
export function navOnOrAfter(points: NavPoint[], target: string): { point: NavPoint; gapDays: number } | null {
  let lo = 0, hi = points.length - 1, at = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].date >= target) { at = mid; hi = mid - 1; } else lo = mid + 1;
  }
  if (at < 0) return null;
  return { point: points[at], gapDays: Math.round((t(points[at].date) - t(target)) / DAY) };
}

export type PeriodResult =
  | { ok: true; months: number; startDate: string; endDate: string; startNav: number; endNav: number; days: number; absolutePct: number; annualisedPct: number | null; kind: 'absolute' | 'annualised'; points: number }
  | { ok: false; months: number; reason: string };

/**
 * Return over the last `months` months, ending at the latest NAV. 12 months or more is annualised (CAGR over the actual days between
 * the two NAV dates); under 12 months it is the absolute change. `points` is how many NAVs lie in the window.
 */
export function periodReturn(h: History, months: number): PeriodResult {
  const pts = h.points;
  if (pts.length < 2) return { ok: false, months, reason: 'Fewer than two NAVs in the history.' };
  const end = pts[pts.length - 1];
  const target = monthsBefore(end.date, months);
  const start = navOnOrBefore(pts, target);
  if (!start) return { ok: false, months, reason: `History starts ${pts[0].date}, after the ${target} this needs.` };
  if (start.gapDays > MAX_GAP_DAYS) return { ok: false, months, reason: `No NAV within ${MAX_GAP_DAYS} days before ${target} (nearest is ${start.point.date}).` };
  const days = Math.round((t(end.date) - t(start.point.date)) / DAY);
  if (days <= 0) return { ok: false, months, reason: 'The start and end NAV are on the same day.' };
  const ratio = end.nav / start.point.nav;
  const inWindow = pts.filter(p => p.date >= start.point.date).length;
  const absolutePct = (ratio - 1) * 100;
  const annual = months >= 12;
  return {
    ok: true, months, startDate: start.point.date, endDate: end.date, startNav: start.point.nav, endNav: end.nav, days,
    absolutePct, annualisedPct: annual ? (Math.pow(ratio, 365 / days) - 1) * 100 : null, kind: annual ? 'annualised' : 'absolute', points: inWindow,
  };
}

export type RollingResult =
  | { ok: true; months: number; observations: number; minPct: number; medianPct: number; maxPct: number; positiveShare: number; firstEnd: string; lastEnd: string }
  | { ok: false; months: number; reason: string };

export const MIN_ROLLING_OBSERVATIONS = 12;

/**
 * Rolling `months`-month returns, one observation per calendar month-end (the last NAV of the month), annualised when the window is
 * 12 months or more. Needs at least 12 observations; with fewer the answer is `insufficient`.
 */
export function rollingReturns(h: History, months: number): RollingResult {
  const pts = h.points;
  const monthEnds = new Map<string, NavPoint>();
  for (const p of pts) monthEnds.set(p.date.slice(0, 7), p);       // ascending, so the last one of each month wins
  const ends = [...monthEnds.values()];
  const values: { end: string; pct: number }[] = [];
  for (const e of ends) {
    const start = navOnOrBefore(pts, monthsBefore(e.date, months));
    if (!start || start.gapDays > MAX_GAP_DAYS) continue;
    const days = Math.round((t(e.date) - t(start.point.date)) / DAY);
    if (days <= 0) continue;
    const ratio = e.nav / start.point.nav;
    values.push({ end: e.date, pct: months >= 12 ? (Math.pow(ratio, 365 / days) - 1) * 100 : (ratio - 1) * 100 });
  }
  if (values.length < MIN_ROLLING_OBSERVATIONS) {
    return { ok: false, months, reason: `Only ${values.length} month-end observation${values.length === 1 ? '' : 's'} of ${months}-month returns; at least ${MIN_ROLLING_OBSERVATIONS} are needed.` };
  }
  const sorted = values.map(v => v.pct).sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return {
    ok: true, months, observations: values.length, minPct: sorted[0], medianPct: median, maxPct: sorted[sorted.length - 1],
    positiveShare: values.filter(v => v.pct > 0).length / values.length, firstEnd: values[0].end, lastEnd: values[values.length - 1].end,
  };
}

export type SipResult =
  | { ok: true; instalments: number; monthlyAmount: number; invested: number; units: number; value: number; gainPct: number; xirrPct: number | null; firstDate: string; lastDate: string; endDate: string }
  | { ok: false; reason: string };

export const MIN_SIP_INSTALMENTS = 12;

/**
 * A hypothetical SIP: `amount` on `dayOfMonth` each month for `months` months back from the latest NAV, each bought at the first NAV
 * on or after that day (up to MAX_GAP_DAYS later), valued at the latest NAV. XIRR comes from the dated instalments. Every instalment
 * has to find a NAV; one that cannot makes the whole answer `insufficient` instead of a smaller SIP passed off as the asked one.
 */
export function sipReturn(h: History, amount: number, months: number, dayOfMonth = 1): SipResult {
  if (!(amount > 0)) return { ok: false, reason: 'Enter a monthly amount.' };
  if (!Number.isInteger(months) || months < MIN_SIP_INSTALMENTS) return { ok: false, reason: `A SIP return needs at least ${MIN_SIP_INSTALMENTS} monthly instalments.` };
  const pts = h.points;
  if (pts.length < 2) return { ok: false, reason: 'Fewer than two NAVs in the history.' };
  const end = pts[pts.length - 1];
  const dom = Math.min(28, Math.max(1, Math.floor(dayOfMonth)));
  // instalment months: the `months` calendar months ending with the month of the latest NAV; an instalment later than the latest NAV is skipped
  const [ey, em] = end.date.split('-').map(Number);
  const flows: { date: string; amount: number }[] = [];
  let units = 0, invested = 0, n = 0;
  let firstDate = '', lastDate = '';
  for (let i = months - 1; i >= 0; i--) {
    const idx = ey * 12 + (em - 1) - i;
    const target = `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}-${pad(dom)}`;
    if (target > end.date) continue;
    const buy = navOnOrAfter(pts, target);
    if (!buy || buy.gapDays > MAX_GAP_DAYS) {
      return { ok: false, reason: buy ? `No NAV within ${MAX_GAP_DAYS} days after ${target} (nearest is ${buy.point.date}).` : `History does not cover ${target}.` };
    }
    units += amount / buy.point.nav;
    invested += amount;
    flows.push({ date: buy.point.date, amount: -amount });
    if (!firstDate) firstDate = buy.point.date;
    lastDate = buy.point.date;
    n++;
  }
  if (n < MIN_SIP_INSTALMENTS) return { ok: false, reason: `Only ${n} instalments fall inside the history; at least ${MIN_SIP_INSTALMENTS} are needed.` };
  const value = units * end.nav;
  flows.push({ date: end.date, amount: value });
  const x = xirr(flows);
  return {
    ok: true, instalments: n, monthlyAmount: amount, invested, units, value, gainPct: (value / invested - 1) * 100,
    xirrPct: x === null ? null : x * 100, firstDate, lastDate, endDate: end.date,
  };
}
