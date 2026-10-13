// Life insurance need: two standard methods (human life value and income replacement), added to debts, less what is already covered.
// Port of _compute and the status / premium helpers in js/finos-life-cover.js; __tests__/lifeCover.parity.test.mts compares them.
// The premium figure is the website's rough age table (₹ per ₹1 Cr of pure term cover) and is only an illustration.

export interface CoverInputs {
  annualIncome: number; currentAge: number; retireAge: number; monthlyNeed: number; needYears: number;
  existingCover: number; totalLiab: number; discountRate: number; inflationRate: number;
}
export interface CoverResult {
  hlv: number; irCorpus: number; irPV: number; withLiab: number; coverGap: number; coverageRatio: number; yearsToRetire: number;
  baseRecommended: number; existingCover: number; totalLiab: number;
}

export const COVER_DEFAULTS = { currentAge: 30, retireAge: 60, needYears: 25, discountRate: 6, inflationRate: 6 };

export function compute(p: CoverInputs): CoverResult {
  const yearsToRetire = Math.max(1, p.retireAge - p.currentAge);
  const nomDisc = p.discountRate / 100;
  const nomInfl = p.inflationRate / 100;
  const realRate = (nomDisc - nomInfl) / (1 + nomInfl);

  let hlv = Math.abs(realRate) < 1e-6 ? p.annualIncome * yearsToRetire : (p.annualIncome * (1 - Math.pow(1 + realRate, -yearsToRetire))) / realRate;
  hlv = Math.round(hlv);

  const irCorpus = Math.round((p.monthlyNeed * 12) / 0.04);
  const annualNeed = p.monthlyNeed * 12;
  let irPV = Math.abs(nomDisc) < 1e-6 ? annualNeed * p.needYears : (annualNeed * (1 - Math.pow(1 + nomDisc, -p.needYears))) / nomDisc;
  irPV = Math.round(irPV);

  const baseRecommended = Math.max(hlv, irCorpus);
  const withLiab = baseRecommended + Math.round(p.totalLiab);
  const coverGap = Math.max(0, withLiab - p.existingCover);
  const coverageRatio = withLiab > 0 ? Math.round((p.existingCover / withLiab) * 100) : 0;
  return { hlv, irCorpus, irPV, withLiab, coverGap, coverageRatio, yearsToRetire, baseRecommended, existingCover: p.existingCover, totalLiab: p.totalLiab };
}

export function status(ratio: number) {
  if (ratio >= 90) return { label: 'Well covered', tone: 'good' as const, icon: '✅' };
  if (ratio >= 60) return { label: 'Partly covered', tone: 'warn' as const, icon: '⚠️' };
  if (ratio >= 30) return { label: 'Under-insured', tone: 'bad' as const, icon: '🚨' };
  return { label: 'Critically under-insured', tone: 'bad' as const, icon: '💀' };
}

const PREMIUM_PER_CR: Record<number, number> = { 25: 7000, 30: 10000, 35: 15000, 40: 22000, 45: 35000 };
/** Rough yearly premium for the cover recommended: the website's age table, rounded up to whole crores. */
export function premiumEstimate(coverNeeded: number, age: number, annualIncome: number) {
  const closest = [25, 30, 35, 40, 45].reduce((a, b) => (Math.abs(b - age) < Math.abs(a - age) ? b : a));
  const crores = Math.ceil(Math.max(1, coverNeeded / 1e7));
  const annual = (PREMIUM_PER_CR[closest] || 15000) * crores;
  return { annual, monthly: Math.round(annual / 12), pctOfIncome: annualIncome > 0 ? Math.round((annual / annualIncome) * 1000) / 10 : null, atAge: closest, crores };
}
