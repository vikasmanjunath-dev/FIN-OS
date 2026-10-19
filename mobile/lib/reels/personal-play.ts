// Your Number for the playable reels: the guess and the slider run on the person's own SIP or loan, read from figures already on the phone
// (lib/reels/mine.ts, the same source lib/reels/personal.ts uses). A reel is rebuilt only when its figure is present and sensible; otherwise it
// keeps its example. Nothing is written or sent, and a shared lesson still uses the example (lib/reels/share.ts reads the library as it is).
import type { Mine, MineLoan } from '@/lib/reels/mine';
import { buildDelayCost, buildGuessEmi, buildGuessSip, type LoanFor } from '@/lib/reels/content-play';
import { monthsLeft } from '@/lib/reels/figures-play';
import type { Reel } from '@/lib/reels/types';

export { monthsLeft };

/** The loan as the guess reel needs it, or null if the remaining time is not one a reel can sensibly describe (1 to 40 years). */
export function loanFor(loan: MineLoan): LoanFor | null {
  const months = Math.round(monthsLeft(loan.balance, loan.rate, loan.emi));
  return Number.isFinite(months) && months >= 12 && months <= 480 ? { label: loan.label, balance: loan.balance, rate: loan.rate, months, emi: loan.emi } : null;
}

export function personalisePlay(base: Reel[], mine: Mine): Reel[] {
  return base.map(r => {
    if (r.id === 'guess-sip' && mine.sip) return buildGuessSip(mine.sip, true);
    if (r.id === 'delay-cost' && mine.sip) return buildDelayCost(mine.sip, true);
    if (r.id === 'guess-emi' && mine.loan) { const l = loanFor(mine.loan); return l ? buildGuessEmi(l) : r; }
    return r;
  });
}
