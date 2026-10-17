// Net-worth history kept on the phone, for the PULSE "Net worth over time" and "How fast it is moving" cards and Arya's trend tool.
//
// The website's PULSE records one net-worth value per day under `finos_nw_history` (a { "YYYY-MM-DD": value } map, newest 90 days) every
// time its timeline is built. This is the same key and shape, written by the same rule: one value per day, the last write of the day
// wins, 90 days kept. Differences, all on purpose:
//   - a value is recorded only when the phone really knows a net worth (some asset or loan is recorded), and a negative net worth is a
//     real value (the website skipped anything <= 0);
//   - the speed card does NOT fall back to "(SIP + 1% of net worth) / 30" when there is no history (the website's "estimated" mode):
//     no history, no speed;
//   - no "Top 1% of India" labels: they rested on no source.
// Pure: no storage, "today" is a parameter.
export interface NwPoint { date: string; value: number }

export const HISTORY_KEY = 'finos_nw_history';
export const MAX_POINTS = 90;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86400000;

/** Points from the stored map (or a list of points), repaired: real dates, finite values, sorted, newest 90. */
export function normaliseHistory(raw: unknown): NwPoint[] {
  let o: any = raw;
  if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch { return []; } }
  const pts: NwPoint[] = [];
  if (Array.isArray(o)) {
    for (const p of o) if (p && typeof p === 'object' && DATE.test(String(p.date)) && Number.isFinite(Number(p.value))) pts.push({ date: String(p.date), value: Number(p.value) });
  } else if (o && typeof o === 'object') {
    for (const [d, v] of Object.entries(o)) {
      const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
      if (DATE.test(d) && Number.isFinite(n) && Number.isFinite(Date.parse(d))) pts.push({ date: d, value: n });
    }
  }
  const byDate = new Map<string, number>();
  for (const p of pts) byDate.set(p.date, p.value);
  return [...byDate].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date)).slice(-MAX_POINTS);
}

/** The history as the website stores it. */
export const toMap = (pts: NwPoint[]): Record<string, number> => Object.fromEntries(pts.map(p => [p.date, Math.round(p.value)]));

/** Add today's value (replacing today's earlier one). Unchanged when `value` is null (net worth not known). */
export function record(pts: NwPoint[], today: string, value: number | null): { points: NwPoint[]; changed: boolean } {
  if (value === null || !Number.isFinite(value) || !DATE.test(today)) return { points: pts, changed: false };
  const v = Math.round(value);
  const cur = pts.find(p => p.date === today);
  if (cur && cur.value === v) return { points: pts, changed: false };
  const next = normaliseHistory([...pts.filter(p => p.date !== today), { date: today, value: v }]);
  return { points: next, changed: true };
}

const dayNum = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / DAY;

export interface Trend {
  first: NwPoint; last: NwPoint; points: number; spanDays: number;
  change: number;
  /** change as a share of the first value; null when the first value is 0 or negative (a percentage of that means nothing) */
  changePct: number | null;
  /** average change a month over the span; null when the span is under 14 days (too short to call a speed) */
  perMonth: number | null;
  /** only with 4+ points and a span of 28+ days: compares the two halves. Words, not a score. */
  direction: 'faster' | 'slower' | 'about the same' | null;
}

/** How the recorded net worth moved. null with fewer than 2 points. */
export function trend(pts: NwPoint[]): Trend | null {
  const p = normaliseHistory(pts);
  if (p.length < 2) return null;
  const first = p[0], last = p[p.length - 1];
  const spanDays = Math.max(0, dayNum(last.date) - dayNum(first.date));
  const change = last.value - first.value;
  const perMonth = spanDays >= 14 ? Math.round((change / spanDays) * 30.4375) : null;
  let direction: Trend['direction'] = null;
  if (p.length >= 4 && spanDays >= 28) {
    const mid = Math.floor(p.length / 2);
    const d1 = Math.max(1, dayNum(p[mid].date) - dayNum(p[0].date));
    const d2 = Math.max(1, dayNum(p[p.length - 1].date) - dayNum(p[mid].date));
    const r1 = (p[mid].value - p[0].value) / d1, r2 = (p[p.length - 1].value - p[mid].value) / d2;
    // "about the same" within ₹200 a day, the website's own threshold
    direction = r2 > r1 + 200 ? 'faster' : r2 < r1 - 200 ? 'slower' : 'about the same';
  }
  return { first, last, points: p.length, spanDays, change, changePct: first.value > 0 ? Math.round((change / first.value) * 1000) / 10 : null, perMonth, direction };
}
