// Pure port of js/finos-taxcore.js (income-tax maths, FY 2025-26 slabs). Surcharge (> ₹50L) is NOT modelled.
// taxNew / taxOld / best, and savingsPlan() (the model behind the Tax Savings Tracker).
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

export type SectionKind = 'core' | 'conditional' | 'uncapped';
export interface SectionInput { id: string; maxDeduction: number | null; kind: SectionKind }
export interface SectionRow { id: string; kind: SectionKind; headroom: number | null; taxSaved: number | null }
export interface SavingsPlan {
  income: number; newTax: number; oldNow: number; oldOpt: number;
  current: number; currentRegime: 'new' | 'old'; potential: number; oldPotential: number; breakEvenDeductions: number;
  coreCapacity: number; bestRegime: 'new' | 'old'; newBeatsOldEvenOptimised: boolean; oldMinusNew: number; sections: SectionRow[];
}

/**
 * "How much could deductions save me?" Deductions only exist in the OLD regime, so the saving is measured there and compared with
 * what the new regime would cost anyway. Core sections (80C, 80D, NPS) are applied one after another so they add up exactly;
 * 'conditional' ones (HRA, 24(b)) get their own maximum and are not summed; 'uncapped' (80E) gets no number.
 * Line for line the same as js/finos-taxcore.js; __tests__/tools.parity.test.mts checks them against each other.
 */
export function savingsPlan(income: number, sections: SectionInput[], opts?: { alreadyClaimed80c?: number; alreadyClaimedOther?: number }): SavingsPlan {
  const gross = clamp(income);
  const used80c = Math.max(0, opts && opts.alreadyClaimed80c != null ? Number(opts.alreadyClaimed80c) : Math.min(150000, gross * 0.12));
  const usedOther = Math.max(0, Number(opts && opts.alreadyClaimedOther) || 0);
  const oldTaxableOf = (extra: number) => Math.max(0, gross - STD_OLD - used80c - usedOther - extra);

  const newTax = taxNew(gross - STD_NEW);
  const oldNow = taxOld(oldTaxableOf(0));
  const rows: SectionRow[] = [];
  let cum = 0, prev = oldNow;
  (sections || []).filter(x => x.kind === 'core').forEach(x => {
    const headroom = Math.max(0, (x.maxDeduction || 0) - (x.id === 's80c' ? used80c : 0));
    cum += headroom;
    const after = taxOld(oldTaxableOf(cum));
    rows.push({ id: x.id, kind: 'core', headroom, taxSaved: prev - after });
    prev = after;
  });
  const oldOpt = prev;
  (sections || []).filter(x => x.kind !== 'core').forEach(x => {
    if (x.kind === 'uncapped' || !((x.maxDeduction || 0) > 0)) { rows.push({ id: x.id, kind: 'uncapped', headroom: null, taxSaved: null }); return; }
    rows.push({ id: x.id, kind: 'conditional', headroom: x.maxDeduction, taxSaved: oldOpt - taxOld(oldTaxableOf(cum + (x.maxDeduction as number))) });
  });
  const current = Math.min(newTax, oldNow);
  const bestNow = Math.min(newTax, oldOpt);

  const oldWith = (d: number) => taxOld(Math.max(0, gross - STD_OLD - d));
  let breakEven = 0;
  if (oldWith(0) > newTax) {
    let lo = 0, hi = Math.max(0, gross - STD_OLD);
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (oldWith(mid) > newTax) lo = mid; else hi = mid; }
    breakEven = Math.ceil(hi / 1000) * 1000;
  }
  return {
    income: gross, newTax, oldNow, oldOpt,
    current, currentRegime: newTax <= oldNow ? 'new' : 'old',
    potential: current - bestNow,
    oldPotential: oldNow - oldOpt,
    breakEvenDeductions: breakEven,
    coreCapacity: used80c + rows.reduce((t, r) => t + (r.kind === 'core' ? (r.headroom as number) : 0), 0),
    bestRegime: newTax <= oldOpt ? 'new' : 'old',
    newBeatsOldEvenOptimised: newTax <= oldOpt,
    oldMinusNew: oldOpt - newTax,
    sections: rows,
  };
}
