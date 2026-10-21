// Known findings of the library QA (lib/reels/qa.ts), one line each, so the suite stays green without hiding anything.
// An entry names a reel id and the finding code it excuses, and says why. It excuses that one error on that one reel and nothing else:
// warnings are never listed here (they are always printed), and a new problem on the same reel still fails.
// Fix the reel, then delete its line. `npm run reels:check -- --all` lists entries that no longer match anything as "stale".
// Found Oct 20 2026 when the checks were first run on the live library (177 reels); the content session owns the fixes.
export interface Known { id: string; code: string; reason: string }

const W4_TRUST = 'Wave 4 draft guess or slider reel with no trust.ts entry yet; add formula, assumptions and date before the reel is signed off.';

export const QA_ALLOWLIST: Known[] = [
  { id: 'guess-edu-cost-15y', code: 'trust-missing', reason: W4_TRUST },
  { id: 'guess-lump-10y', code: 'trust-missing', reason: W4_TRUST },
  { id: 'guess-first-year-interest', code: 'trust-missing', reason: W4_TRUST },
  { id: 'guess-rate-two-points', code: 'trust-missing', reason: W4_TRUST },
  { id: 'slide-home-rate', code: 'trust-missing', reason: W4_TRUST },
  { id: 'slide-child-goal', code: 'trust-missing', reason: W4_TRUST },
  { id: 'slide-pension-spend', code: 'trust-missing', reason: W4_TRUST },
  { id: 'slide-sip-thousand', code: 'trust-missing', reason: W4_TRUST },
  { id: 'slide-tax-big-deductions', code: 'trust-missing', reason: W4_TRUST },
  { id: 'slide-step-up-small', code: 'trust-missing', reason: W4_TRUST },
  { id: 'library', code: 'answer-skew', reason: 'About 85% of live quiz answers are option 1 (first). Shuffle the options so the right answer is spread across positions; the answer index and the "why" must follow.' },
];
