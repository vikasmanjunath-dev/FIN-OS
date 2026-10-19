// Reels health: simple counters the reels keep about how they are used, on this phone only, so the product can be judged by whether people's
// money moves rather than by how long they stay. Day by day, bounded, with no reel ids or figures in it; a person can read and erase them
// (they are in the privacy inventory and removed with everything else). Pure functions, tested with known answers.
import { isPlainObject, parseJSON } from '@/lib/safeStore';

export interface DayStats {
  /** reels finished (the question answered) */ fin: number;
  /** of those, answered right the first time */ right: number;
  /** interactive beats shown */ poke: number;
  /** of those, played with rather than skipped */ engaged: number;
  /** "I know this" taps */ know: number;
  /** "less of this topic" taps */ less: number;
  /** moves started from a reel's tool */ moves: number;
  /** receipts earned (a figure really improved) */ receipts: number;
  /** Ask Mitra questions */ asks: number;
  /** milliseconds with the reels on screen */ ms: number;
}
export type StatField = keyof DayStats;
export const FIELDS: StatField[] = ['fin', 'right', 'poke', 'engaged', 'know', 'less', 'moves', 'receipts', 'asks', 'ms'];
export interface StatsState { v: 1; days: Record<string, DayStats> }
export const EMPTY_STATS: StatsState = { v: 1, days: {} };

export const KEEP_DAYS = 90;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const CAP: Record<StatField, number> = { fin: 500, right: 500, poke: 500, engaged: 500, know: 500, less: 500, moves: 500, receipts: 500, asks: 500, ms: 24 * 3_600_000 };
const blank = (): DayStats => ({ fin: 0, right: 0, poke: 0, engaged: 0, know: 0, less: 0, moves: 0, receipts: 0, asks: 0, ms: 0 });
const clean = (n: unknown, cap: number): number => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.min(cap, Math.floor(n)) : 0);

export function parseStats(raw: string | null | undefined): StatsState {
  const p = parseJSON(raw ?? null);
  if (!p.ok || !isPlainObject(p.value) || !isPlainObject((p.value as { days?: unknown }).days)) return { v: 1, days: {} };
  const days: Record<string, DayStats> = {};
  for (const [k, v] of Object.entries((p.value as { days: Record<string, unknown> }).days)) {
    if (!DAY_KEY.test(k) || !isPlainObject(v)) continue;
    const d = blank();
    for (const f of FIELDS) d[f] = clean((v as Record<string, unknown>)[f], CAP[f]);
    // a count of "right" or "engaged" can never exceed what it is a part of
    d.right = Math.min(d.right, d.fin); d.engaged = Math.min(d.engaged, d.poke);
    days[k] = d;
  }
  return { v: 1, days: trim(days) };
}

function trim(days: Record<string, DayStats>): Record<string, DayStats> {
  const keys = Object.keys(days).sort();
  return Object.fromEntries(keys.slice(-KEEP_DAYS).map(k => [k, days[k]]));
}

/** Adds `n` to one counter for one day. `right` and `engaged` never exceed `fin` and `poke`. */
export function bump(state: StatsState, day: string, field: StatField, n = 1): StatsState {
  if (!DAY_KEY.test(day) || !(n > 0) || !FIELDS.includes(field)) return state;
  const d = { ...(state.days[day] ?? blank()) };
  d[field] = clean(d[field] + n, CAP[field]);
  d.right = Math.min(d.right, d.fin); d.engaged = Math.min(d.engaged, d.poke);
  return { v: 1, days: trim({ ...state.days, [day]: d }) };
}

export interface Health {
  windowDays: number;
  /** Days in the window with at least one reel finished (Money Days). */
  activeDays: number;
  finished: number;
  /** Share of finished reels answered right first time, or null with nothing finished. */
  rightRate: number | null;
  /** Share of interactive beats played with, or null when none were shown. */
  pokeRate: number | null;
  /** Moves started per 100 reels finished. */
  movesPer100: number | null;
  receipts: number;
  /** "I know this" plus "less of this" taps per 100 reels finished (lower is better). */
  steeringPer100: number | null;
  /** The median minutes with the reels on screen, over days they were used. */
  medianMinutes: number | null;
  asks: number;
}

const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function healthOf(state: StatsState, now: Date, windowDays = 28): Health {
  const keys: string[] = [];
  for (let i = 0; i < windowDays; i++) keys.push(day(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)));
  const rows = keys.map(k => state.days[k]).filter((x): x is DayStats => !!x);
  const sum = (f: StatField) => rows.reduce((n, r) => n + r[f], 0);
  const fin = sum('fin'), poke = sum('poke');
  const used = rows.filter(r => r.ms > 0 || r.fin > 0).map(r => r.ms / 60_000).sort((a, b) => a - b);
  const median = used.length ? (used.length % 2 ? used[(used.length - 1) / 2] : (used[used.length / 2 - 1] + used[used.length / 2]) / 2) : null;
  return {
    windowDays, activeDays: rows.filter(r => r.fin > 0).length, finished: fin,
    rightRate: fin ? sum('right') / fin : null,
    pokeRate: poke ? sum('engaged') / poke : null,
    movesPer100: fin ? (sum('moves') / fin) * 100 : null,
    receipts: sum('receipts'),
    steeringPer100: fin ? ((sum('know') + sum('less')) / fin) * 100 : null,
    medianMinutes: median,
    asks: sum('asks'),
  };
}

/** The blueprint's starting hypotheses, to be reset after a baseline. `ok` says whether a value is on the right side of its line. */
export const HYPOTHESES = {
  activeDays: { en: '8 or more in 28', hi: '28 में 8 या ज़्यादा', ok: (v: number) => v >= 8 },
  movesPer100: { en: '15 or more per 100 reels', hi: '100 रीलों पर 15 या ज़्यादा', ok: (v: number) => v >= 15 },
  steeringPer100: { en: 'under 8 per 100 reels', hi: '100 रीलों पर 8 से कम', ok: (v: number) => v < 8 },
  medianMinutes: { en: 'under 3 minutes a day', hi: 'दिन में 3 मिनट से कम', ok: (v: number) => v < 3 },
} as const;
