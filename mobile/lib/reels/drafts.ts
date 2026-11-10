// Draft reels: written, checked by machine, but not yet read by a native Hindi speaker and a compliance reader. They stay out of the app
// until lib/reels/review.ts holds a sign-off for them (or the build sets EXPO_PUBLIC_REELS_DRAFTS=1 for a review session).
import { W4_GUESS, W4_PATH, W4_SLIDE } from '@/lib/reels/content-w4-play';
import { W4_EXPLAIN, W4_MYTH, W4_ORDER, W4_SORT } from '@/lib/reels/content-w4-more';
import { W5_EXPLAIN } from '@/lib/reels/content-w5';
import { W6_MYTH } from '@/lib/reels/content-w6';
import { W7_PLAY } from '@/lib/reels/content-w7';
import { W8_PATH } from '@/lib/reels/content-w8';
import { W9_SPOT } from '@/lib/reels/content-w9';
import { W4_SPOT } from '@/lib/reels/content-w4-spot';
import { isLive } from '@/lib/reels/review';
import type { Reel } from '@/lib/reels/types';

/** Every draft reel, live or not. Tests and the review sheet read this. */
export const DRAFT_REELS: Reel[] = [...W4_SPOT, ...W4_PATH, ...W4_GUESS, ...W4_SLIDE, ...W4_SORT, ...W4_ORDER, ...W4_MYTH, ...W4_EXPLAIN, ...W5_EXPLAIN, ...W6_MYTH, ...W7_PLAY, ...W8_PATH, ...W9_SPOT];
export const DRAFT_IDS = new Set(DRAFT_REELS.map(r => r.id));
/** Only the drafts that have been signed off (or are included for review). */
export const liveDrafts = (): Reel[] => DRAFT_REELS.filter(r => isLive(r.id));
