// Pure port of js/finos-taxcore.js (income-tax maths, FY 2025-26 slabs). Surcharge (> ₹50L) is NOT modelled.
// Only the pieces the mobile tools need (taxNew / taxOld / best); the web's savingsPlan() is not ported yet.
// No imports on purpose, so Node can run it and __tests__ can compare it with the web file on random incomes.

export type Slab = readonly [number, number, number];

const NEW_SLABS: Slab[] = [
  [0, 400000, 0], [400000, 800000, 0.05], [800000, 1200000, 0.10], [1200000, 1600000, 0.15],
  [1600000, 2000000, 0.20], [2000000, 2400000, 0.25], [2400000, Infinity, 0.30],
];
const OLD_SLABS: Slab[] = [[0, 250000, 0], [250000, 500000, 0.05], [500000, 1000000, 0.20], [1000000, Infinity, 0.30]];

export const NEW_REBATE_LIMIT = 1_200_000;
export const OLD_REBATE_LIMIT = 500_000;
export const CESS = 0.04;
export const STD_NEW = 75_000;
export const STD_OLD = 50_000;

function slabTax(income: number, slabs: Slab[]) {
  let tax = 0;
  for (const [lo, hi, rate] of slabs) {
    if (income <= lo) break;
    tax += (Math.min(income, hi) - lo) * rate;
  }
  return tax;
}
const clamp = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

/** New regime: Sec 87A makes tax nil up to ₹12L taxable, with marginal relief just above it. Includes 4% cess. */
export function taxNew(taxable: number): number {
  const income = clamp(taxable);
  let tax = slabTax(income, NEW_SLABS);
  if (income <= NEW_REBATE_LIMIT) tax = 0;
  else tax = Math.min(tax, income - NEW_REBATE_LIMIT);
  return Math.round(tax * (1 + CESS));
}

/** Old regime: Sec 87A nil up to ₹5L taxable. Includes 4% cess. */
export function taxOld(taxable: number): number {
  const income = clamp(taxable);
  let tax = slabTax(income, OLD_SLABS);
  if (income <= OLD_REBATE_LIMIT) tax = 0;
  return Math.round(tax * (1 + CESS));
}

export interface Best { regime: 'new' | 'old'; tax: number; taxNew: number; taxOld: number }
export function best(newTaxable: number, oldTaxable: number): Best {
  const n = taxNew(newTaxable);
  const o = taxOld(oldTaxable);
  return n <= o ? { regime: 'new', tax: n, taxNew: n, taxOld: o } : { regime: 'old', tax: o, taxNew: n, taxOld: o };
}
