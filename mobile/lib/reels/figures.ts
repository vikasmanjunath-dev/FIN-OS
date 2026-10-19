// The numbers the reels quote. They are computed here, never typed into a script, so a caption cannot disagree with the maths.
import type { L } from '@/lib/reels/types';

/** Future value of a monthly SIP: `monthly` rupees at the end of each month, `annualPct` % a year compounded monthly, for `years` years. */
export function sipFutureValue(monthly: number, annualPct: number, years: number): number {
  const i = annualPct / 100 / 12, n = Math.round(years * 12);
  if (!(monthly >= 0) || !(years >= 0) || !Number.isFinite(i)) return NaN;
  if (i === 0) return monthly * n;
  return monthly * ((Math.pow(1 + i, n) - 1) / i);
}

/** What `amount` today is worth in today's buying power after `years` of `ratePct` % yearly price rises. */
export const inflatedValue = (amount: number, ratePct: number, years: number): number => amount / Math.pow(1 + ratePct / 100, years);

/** Monthly instalment of a standard amortising loan. */
export function emi(principal: number, annualPct: number, years: number): number {
  const r = annualPct / 100 / 12, n = Math.round(years * 12);
  if (r === 0) return principal / n;
  const g = Math.pow(1 + r, n);
  return (principal * r * g) / (g - 1);
}

/** Interest and principal inside the first instalment. */
export function firstInstalment(principal: number, annualPct: number, years: number) {
  const e = emi(principal, annualPct, years), interest = (principal * annualPct) / 100 / 12;
  return { emi: e, interest, principal: e - interest, interestShare: interest / e };
}

/** Rule of 72: roughly how many years it takes money to double at `ratePct` % a year. */
export const doublingYears = (ratePct: number): number => 72 / ratePct;

/** Units you get for `amount` at a NAV of `nav` (before charges). */
export const unitsFor = (amount: number, nav: number): number => amount / nav;

/** The "100 minus age" rule of thumb: percent in equity and the rest in safer assets. Clamped to 0-100. */
export function hundredMinusAge(age: number): { equity: number; debt: number } {
  const equity = Math.min(100, Math.max(0, Math.round(100 - age)));
  return { equity, debt: 100 - equity };
}

const group = (n: number): string => { const s = String(Math.round(n)); const l = s.slice(-3), r = s.slice(0, -3); return r ? r.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + l : l; };
const trim = (x: number): string => (Math.round(x * 100) / 100).toString();

/** "₹8,997", "₹49 lakh", "₹1.75 crore" in English; "₹49 लाख", "₹1.75 करोड़" in Hindi. Indian grouping below a lakh. */
export function money(n: number): L {
  if (n < 100_000) { const t = '₹' + group(n); return { en: t, hi: t }; }
  if (n < 10_000_000) { const lakh = n / 100_000, v = lakh >= 10 ? String(Math.round(lakh)) : trim(lakh); return { en: `₹${v} lakh`, hi: `₹${v} लाख` }; }
  const v = trim(n / 10_000_000); return { en: `₹${v} crore`, hi: `₹${v} करोड़` };
}

/** Fill {name} gaps in both languages from a map of numbers/strings, so a caption is a sentence with the computed figures dropped in. */
export function fill(template: L, values: Record<string, L | string | number>): L {
  const pick = (v: L | string | number, lang: 'en' | 'hi') => (typeof v === 'object' ? v[lang] : String(v));
  const run = (s: string, lang: 'en' | 'hi') => s.replace(/\{(\w+)\}/g, (_, k) => { if (!(k in values)) throw new Error(`reel text uses {${k}} but no value was given`); return pick(values[k], lang); });
  return { en: run(template.en, 'en'), hi: run(template.hi, 'hi') };
}

/** The monthly SIP that grows to `target` in `years` at an assumed `annualPct` % (payments at the end of each month). */
export function sipNeeded(target: number, annualPct: number, years: number): number {
  const i = annualPct / 100 / 12, n = Math.round(years * 12);
  if (!(target > 0) || !(years > 0)) return NaN;
  return i === 0 ? target / n : (target * i) / (Math.pow(1 + i, n) - 1);
}

/** A SIP that starts at `monthly` and goes up by `stepPct` % each year, for `years` years at an assumed `annualPct` % (monthly compounding). */
export function stepUpSipFutureValue(monthly: number, stepPct: number, annualPct: number, years: number): number {
  const i = annualPct / 100 / 12; let total = 0, sip = monthly;
  for (let y = 0; y < years; y++) {
    for (let m = 0; m < 12; m++) total = total * (1 + i) + sip;
    sip *= 1 + stepPct / 100;
  }
  return total;
}

/** How many months a `corpus` lasts when it earns `annualPct` % a year and `withdrawal` is taken every month. Infinity when the growth alone covers it. */
export function monthsToDeplete(corpus: number, annualPct: number, withdrawal: number): number {
  const r = annualPct / 100 / 12;
  if (!(corpus > 0) || !(withdrawal > 0)) return NaN;
  if (r === 0) return corpus / withdrawal;
  if (withdrawal <= corpus * r) return Infinity;
  return -Math.log(1 - (corpus * r) / withdrawal) / Math.log(1 + r);
}

/** The loan an EMI of `emiAmount` can repay over `years` at `annualPct` %. */
export function loanFromEmi(emiAmount: number, annualPct: number, years: number): number {
  const r = annualPct / 100 / 12, n = Math.round(years * 12);
  return r === 0 ? emiAmount * n : (emiAmount * (1 - Math.pow(1 + r, -n))) / r;
}

/** What an unpaid balance grows to after `months` months at `monthlyPct` % a month (no payments). */
export const unpaidBalance = (balance: number, monthlyPct: number, months: number): number => balance * Math.pow(1 + monthlyPct / 100, months);

/** Value after `years` of a deposit made at the start of each year (as in a PPF account) at an assumed `annualPct` % a year. */
export function yearlyDepositsValue(deposit: number, annualPct: number, years: number): number {
  const r = annualPct / 100;
  return r === 0 ? deposit * years : deposit * ((Math.pow(1 + r, years) - 1) / r) * (1 + r);
}

// ── Figures for the second wave of reels (tax, protection, investing basics, goals) ────────────────────────────────

/** A lump sum left to grow for `years` at an assumed `annualPct` % (monthly compounding, the same as a SIP). */
export const lumpsumValue = (amount: number, annualPct: number, years: number): number => amount * Math.pow(1 + annualPct / 1200, Math.round(years * 12));

/** `monthly` paid in for `payYears` then left alone until `totalYears`, at an assumed `annualPct` %. */
export function sipThenHold(monthly: number, annualPct: number, payYears: number, totalYears: number): number {
  return sipFutureValue(monthly, annualPct, payYears) * Math.pow(1 + annualPct / 1200, Math.round((totalYears - payYears) * 12));
}

/** What `amount` bought at each of the given unit prices costs you per unit on average, and how many units it buys in all. */
export function averageCost(amount: number, navs: number[]): { units: number; invested: number; perUnit: number; avgNav: number } {
  const units = navs.reduce((s, n) => s + amount / n, 0), invested = amount * navs.length;
  return { units, invested, perUnit: invested / units, avgNav: navs.reduce((s, n) => s + n, 0) / navs.length };
}

/** The return after tax and inflation: first the tax on the interest, then what is left after prices rise. All in percent. */
export function realReturn(nominalPct: number, inflationPct: number, taxPct = 0): number {
  const afterTax = nominalPct * (1 - taxPct / 100);
  return ((1 + afterTax / 100) / (1 + inflationPct / 100) - 1) * 100;
}

/** A split such as 60/40 after each part has grown at its own rate: the new share of the first part, in percent. */
export function driftedShare(startAmounts: number[], growthPct: number[]): number[] {
  const end = startAmounts.map((a, i) => a * (1 + growthPct[i] / 100)), total = end.reduce((s, v) => s + v, 0);
  return end.map(v => (v / total) * 100);
}

/** How much of the whole pot is lost when a part worth `weightPct` % of it falls by `dropPct` %. */
export const potLoss = (weightPct: number, dropPct: number): number => (weightPct * dropPct) / 100;

/** The monthly rate (in percent) at which `payment` made `n` times equals `present` today. Bisection, no closed form. */
export function impliedMonthlyRate(present: number, payment: number, n: number): number {
  if (!(present > 0) || !(payment > 0) || n < 1 || payment * n <= present) return 0;
  let lo = 0, hi = 1;                                                                  // 0% to 100% a month
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2, pv = mid === 0 ? payment * n : (payment * (1 - Math.pow(1 + mid, -n))) / mid;
    if (pv > present) lo = mid; else hi = mid;
  }
  return ((lo + hi) / 2) * 100;
}

/** HRA exemption for a month: the least of the HRA received, rent above 10% of basic, and 50% (metro) or 40% of basic. */
export function hraExempt(basic: number, hra: number, rent: number, metro: boolean): number {
  return Math.max(0, Math.min(hra, rent - 0.1 * basic, (metro ? 0.5 : 0.4) * basic));
}

/** What a policy with a room-rent cap pays when the room costs more than the cap: the whole claim is cut in proportion. */
export function proportionalClaim(bill: number, rentCap: number, roomRent: number): number {
  return roomRent <= rentCap ? bill : bill * (rentCap / roomRent);
}

/** A base policy plus a super top-up that starts paying once the bill passes its deductible. */
export function superTopUpSplit(bill: number, base: number, deductible: number, topUpCover: number): { base: number; topUp: number; you: number } {
  const b = Math.min(bill, base), t = Math.min(Math.max(0, bill - Math.max(deductible, b)), topUpCover);
  return { base: b, topUp: t, you: bill - b - t };
}

/** Tax on `amount` at a slab rate with 4% cess, e.g. tax saved by a deduction or tax due on interest. */
export const taxAtSlab = (amount: number, slabPct: number): number => amount * (slabPct / 100) * 1.04;

/** The monthly income an annuity gives: `price` buys `ratePct` % a year, paid monthly. */
export const annuityMonthly = (price: number, ratePct: number): number => (price * ratePct) / 100 / 12;

/** What `today` costs after `years` of `ratePct` % a year price rises. */
export const grownCost = (today: number, ratePct: number, years: number): number => today * Math.pow(1 + ratePct / 100, years);

/** `pct` percent of `amount`. */
export const pctOf = (amount: number, pct: number): number => (amount * pct) / 100;

/** The average of some amounts. */
export const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;

/** `a` as a percentage of `b`. */
export const ratioPct = (a: number, b: number): number => (a / b) * 100;

/** The interest inside the `year`-th year's instalments of a standard loan (year 1 is the first twelve instalments). */
export function interestInYear(principal: number, annualPct: number, years: number, year = 1): number {
  const r = annualPct / 1200, n = Math.round(years * 12), e = r === 0 ? principal / n : (principal * r) / (1 - Math.pow(1 + r, -n));
  let bal = principal, total = 0;
  for (let m = 1; m <= year * 12 && m <= n; m++) { const c = bal * r; if (m > (year - 1) * 12) total += c; bal = bal + c - e; }
  return total;
}
