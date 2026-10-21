// Your Number for the playable reels: the guess and the slider run on the person's own SIP or loan, read from figures already on the phone
// (lib/reels/mine.ts, the same source lib/reels/personal.ts uses). A reel is rebuilt only when its figure is present and sensible; otherwise it
// keeps its example. Nothing is written or sent, and a shared lesson still uses the example (lib/reels/share.ts reads the library as it is).
import type { Mine } from '@/lib/reels/mine';
import { loanFor, personaliseMore, type PersonalCtx } from '@/lib/reels/personal-more';
import { buildDelayCost, buildGuessEmi, buildGuessSip } from '@/lib/reels/content-play';
import { monthsLeft } from '@/lib/reels/figures-play';
import type { Reel } from '@/lib/reels/types';

export { monthsLeft, loanFor };

/**
 * `ctx` is optional (the signals fit it). With `strain` set, the two SIP reels (which talk of growth) keep their examples.
 * The wave-2 reels (lib/reels/personal-more.ts) are rebuilt here too, after these three, so the feed needs no other call.
 */
export function personalisePlay(base: Reel[], mine: Mine, ctx?: PersonalCtx): Reel[] {
  const first = base.map(r => {
    if (r.id === 'guess-sip' && mine.sip && !ctx?.strain) return buildGuessSip(mine.sip, true);
    if (r.id === 'delay-cost' && mine.sip && !ctx?.strain) return buildDelayCost(mine.sip, true);
    if (r.id === 'guess-emi' && mine.loan) { const l = loanFor(mine.loan); return l ? buildGuessEmi(l) : r; }
    return r;
  });
  return personaliseMore(first, mine, ctx);
}
