// The quiz options of a reel are shown in a fixed, scrambled order, so the right answer is not almost always the first one (in the library 85% of
// answers are written in position 1, and a viewer who notices stops reading). The order depends only on the reel's id, so a reel always shows the
// same order, and the answer index moves with the options. Applied once, where the feed builds its reels; never to the stored content.
import type { Reel } from '@/lib/reels/types';

/** An option that must stay where an author put it: "all of these", "none of these" and the like read wrongly anywhere but last. */
const STAYS_LAST = /\b(all|none|both|neither)\b.{0,12}\b(above|these|them|of)\b/i;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** A deterministic permutation of 0..n-1 from a seed (Fisher-Yates over a small generator). */
export function permutation(n: number, seed: string): number[] {
  const out = Array.from({ length: n }, (_, i) => i);
  let x = hash(seed) || 1;
  const next = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x; };
  for (let i = n - 1; i > 0; i--) { const j = next() % (i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

/** The reel with its quiz options in the scrambled order and `answer` pointing at the same option as before. A quiz with a "stays last" option, or fewer than 2 options, is left as written. */
export function withScrambledQuiz(r: Reel): Reel {
  const opts = r.quiz.options;
  if (opts.length < 2 || opts.some(o => STAYS_LAST.test(o.en))) return r;
  const p = permutation(opts.length, r.id);
  const options = p.map(i => opts[i]);
  const answer = p.indexOf(r.quiz.answer);
  if (answer < 0) return r;
  return { ...r, quiz: { ...r.quiz, options, answer } };
}
