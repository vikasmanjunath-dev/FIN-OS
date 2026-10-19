// Draft reels: written, checked by machine, but not yet read by a native Hindi speaker and a compliance reader. They stay out of the app
// until lib/reels/review.ts holds a sign-off for them (or the build sets EXPO_PUBLIC_REELS_DRAFTS=1 for a review session).
import { W4_GUESS, W4_PATH, W4_SLIDE } from '@/lib/reels/content-w4-play';
import { W4_EXPLAIN, W4_MYTH, W4_ORDER, W4_SORT } from '@/lib/reels/content-w4-more';
import { W4_SPOT } from '@/lib/reels/content-w4-spot';
import { isLive } from '@/lib/reels/review';
import type { Reel } from '@/lib/reels/types';

/** Every draft reel, live or not. Tests and the review sheet read this. */
export const DRAFT_REELS: Reel[] = [...W4_SPOT, ...W4_PATH, ...W4_GUESS, ...W4_SLIDE, ...W4_SORT, ...W4_ORDER, ...W4_MYTH, ...W4_EXPLAIN];
export const DRAFT_IDS = new Set(DRAFT_REELS.map(r => r.id));
/** Only the drafts that have been signed off (or are included for review). */
export const liveDrafts = (): Reel[] => DRAFT_REELS.filter(r => isLive(r.id));
