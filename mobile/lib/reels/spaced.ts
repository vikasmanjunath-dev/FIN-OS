// Spaced review: a reel the person answered comes back at growing gaps (1, 3, 7, 21, 60 days) as long as they keep getting it right, and starts again
// at one day when they miss it. Nothing is shown as a score or a streak; it only decides when a quick refresher is worth offering. Pure, tested.
import type { Watched } from '@/lib/reels/journey';

export const INTERVAL_DAYS = [1, 3, 7, 21, 60] as const;
export const MAX_STAGE = INTERVAL_DAYS.length - 1;
const DAY = 86_400_000;
type W = Watched[string];

/** Reels answered before stages existed: a right answer counts as stage 2 (a week, as before), a missed one as stage 0. */
export const stageOf = (w: W): number => (typeof w.n === 'number' && Number.isInteger(w.n) && w.n >= 0 && w.n <= MAX_STAGE ? w.n : w.correct ? 2 : 0);

/** The stage after an answer: one step up for a right answer, back to the start for a miss. */
export const nextStage = (prev: W | undefined, correct: boolean): number => (correct ? Math.min(MAX_STAGE, (prev ? stageOf(prev) : -1) + 1) : 0);

/** When this reel is next worth a refresher. */
export const dueAt = (w: W): Date => new Date(new Date(w.at).getTime() + INTERVAL_DAYS[stageOf(w)] * DAY);

export const isDue = (w: W, now: Date): boolean => { const t = dueAt(w).getTime(); return Number.isFinite(t) && now.getTime() >= t; };

/** Reels due for review, most overdue first (ties by id, so the order is stable). */
export function dueReels(watched: Watched, now: Date, only?: (id: string) => boolean): { id: string; overdueDays: number; stage: number }[] {
  return Object.entries(watched)
    .filter(([id, w]) => isDue(w, now) && (!only || only(id)))
    .map(([id, w]) => ({ id, overdueDays: Math.floor((now.getTime() - dueAt(w).getTime()) / DAY), stage: stageOf(w) }))
    .sort((a, b) => b.overdueDays - a.overdueDays || a.id.localeCompare(b.id));
}

/** How many of the last answers are still "fresh" per stage, for a simple retention view: reels per stage. */
export function stageCounts(watched: Watched): number[] {
  const out = INTERVAL_DAYS.map(() => 0);
  for (const w of Object.values(watched)) out[stageOf(w)]++;
  return out;
}
