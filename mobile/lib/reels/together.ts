// Money date, on one phone: two people guess the same example question without seeing each other's guess, then see both against the answer.
// Only the reel's example figures are used, never either person's own, and nothing is stored or sent: the guesses live in the screen and go
// when it closes. Pure functions, tested with known answers.
import { isBeatUsable, scoreGuess, type GuessResult } from '@/lib/reels/beats';
import { LIBRARY } from '@/lib/reels/library';
import type { Beat, Reel } from '@/lib/reels/types';

export type GuessBeat = Extract<Beat, { kind: 'guess' }>;

/** Two guesses closer than this (as a ratio of how far off each is) count as a tie, so a coin-flip difference never crowns anyone. */
export const TIE_RATIO = 1.05;

export interface TogetherResult { first: GuessResult; second: GuessResult; /** 0 or 1 for the closer player, null for a tie */ closer: 0 | 1 | null }

export function judgeTogether(g1: number, g2: number, answer: number): TogetherResult {
  const first = scoreGuess(g1, answer), second = scoreGuess(g2, answer);
  const a = first.times, b = second.times;
  const closer = !(Number.isFinite(a) && Number.isFinite(b)) || Math.max(a, b) / Math.min(a, b) < TIE_RATIO ? null : a < b ? 0 : 1;
  return { first, second, closer };
}

/** The reel's own example version (never the personalised one) when it has a guess beat that is safe to play; otherwise null. */
export function togetherBeat(reelId: string): { reel: Reel; beat: GuessBeat } | null {
  const reel = LIBRARY.find(r => r.id === reelId);
  if (!reel || !isBeatUsable(reel) || reel.poke?.beat.kind !== 'guess') return null;
  return { reel, beat: reel.poke.beat };
}
