// Extra figures for the playable reels (content-play.ts), kept apart from figures.ts, which the content files own. Same rule: a caption never
// holds a typed number; it comes from here, with a known-answer test.

/** Months left on a loan from its balance, yearly rate and EMI: n = −ln(1 − B·r / EMI) ÷ ln(1 + r), r the monthly rate. NaN if the EMI never clears it. */
export function monthsLeft(balance: number, ratePct: number, emiAmount: number): number {
  const r = ratePct / 1200;
  if (!(balance > 0) || !(emiAmount > 0)) return NaN;
  if (r === 0) return balance / emiAmount;
  const x = 1 - (balance * r) / emiAmount;
  return x > 0 ? -Math.log(x) / Math.log(1 + r) : NaN;
}

/** What a one-time amount grows to after `years` at an assumed `annualPct` % a year, compounded yearly. */
export const lumpSumFuture = (amount: number, annualPct: number, years: number): number => amount * Math.pow(1 + annualPct / 100, years);

/**
 * The interest saved by paying `extra` off a loan today and keeping the EMI the same, so the loan ends sooner.
 * `balance` and `ratePct` describe the loan now; `emiAmount` is the EMI. Returns the months saved and the interest saved.
 */
export function prepaySaving(balance: number, ratePct: number, emiAmount: number, extra: number): { monthsSaved: number; interestSaved: number } {
  const before = monthsLeft(balance, ratePct, emiAmount);
  if (!Number.isFinite(before) || !(extra > 0)) return { monthsSaved: 0, interestSaved: 0 };
  if (extra >= balance) return { monthsSaved: before, interestSaved: emiAmount * before - balance };
  const after = monthsLeft(balance - extra, ratePct, emiAmount);
  const interestBefore = emiAmount * before - balance, interestAfter = emiAmount * after - (balance - extra);
  return { monthsSaved: before - after, interestSaved: interestBefore - interestAfter };
}
