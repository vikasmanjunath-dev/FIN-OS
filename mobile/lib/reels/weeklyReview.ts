// The weekly money review: three short lines the person writes for themselves (a win, a gap, one move for next week). Kept on the phone, one entry per
// calendar week, the last eight weeks only. Pure parse and update functions; storage is in lib/reelsWeeklyStorage.ts.
import { isPlainObject, parseJSON } from '@/lib/safeStore';
import { weekKey } from '@/lib/reels/reelsProfile';

export interface WeekNote { win: string; gap: string; next: string; at: string }
export type WeeklyNotes = Record<string, WeekNote>;
export const MAX_WEEKS = 8, MAX_LEN = 280;
const WEEK = /^\d{4}-W\d{2}$/;
const clean = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, MAX_LEN) : '');

export function parseWeekly(raw: string | null | undefined): WeeklyNotes {
  const p = parseJSON(raw ?? null);
  if (!p.ok || !isPlainObject(p.value)) return {};
  const out: WeeklyNotes = {};
  for (const [k, v] of Object.entries(p.value as Record<string, unknown>)) {
    if (!WEEK.test(k) || !isPlainObject(v)) continue;
    const r = v as Record<string, unknown>;
    const note = { win: clean(r.win), gap: clean(r.gap), next: clean(r.next), at: typeof r.at === 'string' ? r.at.slice(0, 40) : '' };
    if (note.win || note.gap || note.next) out[k] = note;
  }
  return trim(out);
}
const trim = (n: WeeklyNotes): WeeklyNotes => Object.fromEntries(Object.keys(n).sort().slice(-MAX_WEEKS).map(k => [k, n[k]]));

/** Saves this week's note; an empty note removes it. */
export function saveWeek(all: WeeklyNotes, now: Date, note: { win: string; gap: string; next: string }): WeeklyNotes {
  const k = weekKey(now), n = { win: clean(note.win), gap: clean(note.gap), next: clean(note.next), at: now.toISOString() };
  const rest = { ...all }; delete rest[k];
  return trim(n.win || n.gap || n.next ? { ...rest, [k]: n } : rest);
}
/** What last week said to do next, to show at the top of this week's review. */
export function lastWeeksNext(all: WeeklyNotes, now: Date): string | null {
  const keys = Object.keys(all).filter(k => k < weekKey(now)).sort();
  const last = keys[keys.length - 1];
  return last && all[last].next ? all[last].next : null;
}
