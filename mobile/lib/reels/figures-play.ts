// Extra figures for the playable reels (content-play.ts), kept apart from figures.ts, which the content files own. Same rule: a caption never
// holds a typed number; it comes from here, with a known-answer test.
import { emi } from '@/lib/reels/figures';

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

// ── Your Number, wave 2 (lib/reels/personal-more.ts) ───────────────────────────────────────────────────────────────

/**
 * An `extra` paid on top of the EMI every month: how many months sooner the loan ends and how much interest that saves.
 * Months come from monthsLeft with the bigger payment; the interest is each plan's payments minus the balance (the last payment is treated as a full one, so it is "about").
 */
export function extraMonthlySaving(balance: number, ratePct: number, emiAmount: number, extra: number): { monthsBefore: number; monthsAfter: number; monthsSaved: number; interestSaved: number } {
  const monthsBefore = monthsLeft(balance, ratePct, emiAmount), monthsAfter = monthsLeft(balance, ratePct, emiAmount + extra);
  if (!Number.isFinite(monthsBefore) || !Number.isFinite(monthsAfter) || !(extra > 0)) return { monthsBefore, monthsAfter: monthsBefore, monthsSaved: 0, interestSaved: 0 };
  return { monthsBefore, monthsAfter, monthsSaved: monthsBefore - monthsAfter, interestSaved: (emiAmount * monthsBefore - balance) - ((emiAmount + extra) * monthsAfter - balance) };
}

/**
 * What the EMI becomes if the yearly rate rises by `risePct` points while the same `months` are left. The change is the ratio of the two standard
 * EMIs applied to the person's own `currentEmi`, so the starting figure is the one on their statement, not a recalculated one.
 */
export function emiAfterRateRise(balance: number, ratePct: number, months: number, risePct: number, currentEmi: number): number {
  if (!(balance > 0) || !(months > 0)) return NaN;
  const y = months / 12, a = emi(balance, ratePct, y), b = emi(balance, ratePct + risePct, y);
  return Number.isFinite(a) && a > 0 ? (currentEmi * b) / a : NaN;
}
/** What a SIP raised by `stepPct` % each year has put in over `years` years (deposits only, no growth). */
export function stepUpPaid(monthly: number, stepPct: number, years: number): number {
  let paid = 0, sip = monthly;
  for (let y = 0; y < years; y++) { paid += sip * 12; sip *= 1 + stepPct / 100; }
  return paid;
}

/** A retirement corpus by the rough rule of `multiple` times the yearly spend, with the monthly spend first grown by `inflationPct` % a year for `years`. */
export function retireCorpus(monthlyToday: number, inflationPct: number, years: number, multiple = 25): { futureMonthly: number; corpus: number } {
  const futureMonthly = monthlyToday * Math.pow(1 + inflationPct / 100, years);
  return { futureMonthly, corpus: futureMonthly * 12 * multiple };
}

/** How many months of spending a sum covers. */
export const monthsCovered = (amount: number, monthlySpend: number): number => amount / monthlySpend;
