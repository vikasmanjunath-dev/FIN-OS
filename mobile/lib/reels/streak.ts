// The day streak with a kind rule: one rest day in any seven is forgiven automatically, so a day off never breaks it. Two missed days close
// together do, and are never announced with guilt. Counts the days a reel was finished (rest days are not counted, only bridged). Pure.
// `streakOf` in journey.ts is the strict version (one missed day resets); it is kept for its own tests, and the app uses this one.
import { dayNum } from '@/lib/reels/journey';

export interface Streak {
  /** Days with a finished reel in the current run, rest days bridged but not counted. */
  streak: number;
  doneToday: boolean;
  /** The longest run ever kept in the history, by the same rule. */
  best: number;
  /** The day (YYYY-MM-DD) a rest day is currently bridging, or null. */
  resting: boolean;
}

/** Days with a reel counted back from `from`, one rest day allowed in any 7. */
function runBack(active: Set<number>, from: number): number {
  let count = 0;
  const rests: number[] = [];
  for (let cur = from, guard = 0; guard < 400; cur--, guard++) {
    if (active.has(cur)) { count++; continue; }
    if (rests.some(r => r - cur < 7)) break;                  // a second rest within a week: the run ends here
    rests.push(cur);
    if (rests.length > 60) break;
    // a run cannot continue past a rest into nothing: stop when no earlier activity exists at all
    if (![...active].some(d => d < cur)) break;
  }
  return count;
}

export function forgivingStreak(days: string[], today: string): Streak {
  const t = dayNum(today);
  const active = new Set(days.map(dayNum).filter(n => Number.isFinite(n) && n <= t));
  const doneToday = active.has(t);
  // Today not done yet is not a rest day: it is still to come. Start from yesterday.
  const start = doneToday ? t : t - 1;
  const streak = runBack(active, start);
  let best = 0;
  for (const d of active) best = Math.max(best, runBack(active, d));
  return { streak, doneToday, best: Math.max(best, streak), resting: streak > 0 && !active.has(start) };
}

/** What the Reels tab shows beside its icon, decided from the days a reel was finished. Calm on purpose: never a red alarm, never a count of what was missed. */
export interface TabState {
  /** `check`: today's reel is done. `streak`: a run is alive and today's is waiting. `dot`: today's reel is ready. */
  badge: 'check' | 'streak' | 'dot';
  streak: number;
  /** The tab's accessibility label. */
  label: string;
}

export function reelsTabState(days: string[], today: string): TabState {
  const s = forgivingStreak(days, today);
  const run = s.streak > 0 ? `, ${s.streak}-day streak` : '';
  if (s.doneToday) return { badge: 'check', streak: s.streak, label: `Reels, done for today${run}` };
  if (s.streak > 0) return { badge: 'streak', streak: s.streak, label: `Reels, today's reel is ready${run}` };
  return { badge: 'dot', streak: 0, label: "Reels, today's reel is ready" };
}
