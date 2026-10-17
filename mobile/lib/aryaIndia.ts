// Arya "India" tab: India's money rules as RULES with their source and the year they are for, and the statutory dates.
// The website's India tab is a map of state "cost of life" figures with no source; it is not ported (see docs/agent-notes/arya-tabs.md).
// Every number below is also used by the app's own tax code; __tests__/aryaIndia.test.mts rebuilds the tax from this table and
// requires it to equal lib/taxcore on random incomes, and checks the limits against lib/taxSavings and lib/taxHarvest.
// The app's rules are for FY 2025-26. If today's financial year is later, `staleness()` says so: the screen must show it.
import { STD_NEW, STD_OLD, NEW_REBATE_LIMIT, OLD_REBATE_LIMIT, CESS, best } from '@/lib/taxcore';
import { LTCG_EXEMPT, LTCG_RATE, STCG_RATE } from '@/lib/taxHarvest';
import { taxDatesForFY, fyLabel, fyOf, isoDate, type CalEvent } from '@/lib/calendar';

export const RULES_FY = 2025;                       // FY 2025-26, assessment year 2026-27
export const RULES_AS_OF = 'FY 2025-26 (assessment year 2026-27)';
export const SOURCE_TAX = 'Income-tax Act, 1961 as amended by the Finance Act 2025 (new regime: section 115BAC); the app\'s tax core, lib/taxcore.ts';

export type Slab = readonly [from: number, to: number, rate: number];
export const NEW_SLABS: Slab[] = [[0, 400000, 0], [400000, 800000, 0.05], [800000, 1200000, 0.10], [1200000, 1600000, 0.15], [1600000, 2000000, 0.20], [2000000, 2400000, 0.25], [2400000, Infinity, 0.30]];
export const OLD_SLABS: Slab[] = [[0, 250000, 0], [250000, 500000, 0.05], [500000, 1000000, 0.20], [1000000, Infinity, 0.30]];

const slabTax = (income: number, slabs: Slab[]) => slabs.reduce((t, [lo, hi, r]) => (income > lo ? t + (Math.min(income, hi) - lo) * r : t), 0);
/** Tax from the table above (rebate, marginal relief, cess): must equal lib/taxcore. */
export function taxFromTable(taxable: number, regime: 'new' | 'old'): number {
  const inc = Math.max(0, taxable);
  let t = slabTax(inc, regime === 'new' ? NEW_SLABS : OLD_SLABS);
  if (regime === 'new') t = inc <= NEW_REBATE_LIMIT ? 0 : Math.min(t, inc - NEW_REBATE_LIMIT);
  else if (inc <= OLD_REBATE_LIMIT) t = 0;
  return Math.round(t * (1 + CESS));
}

export interface Rule { id: string; group: 'Income-tax slabs' | 'Deductions and rebates' | 'Capital gains' | 'Not modelled'; title: string; statement: string; applies: 'new regime' | 'old regime' | 'both'; source: string; asOf: string }
const L = (n: number) => '₹' + n.toLocaleString('en-IN');
const row = (id: string, group: Rule['group'], title: string, statement: string, applies: Rule['applies'], source = SOURCE_TAX): Rule => ({ id, group, title, statement, applies, source, asOf: RULES_AS_OF });
const slabText = (s: Slab[]) => s.map(([lo, hi, r]) => `${L(lo)}${hi === Infinity ? ' and above' : ' to ' + L(hi)}: ${Math.round(r * 100)}%`).join('; ');

export const RULES: Rule[] = [
  row('slabs-new', 'Income-tax slabs', 'New regime slabs', slabText(NEW_SLABS), 'new regime'),
  row('slabs-old', 'Income-tax slabs', 'Old regime slabs (below 60)', slabText(OLD_SLABS), 'old regime', 'Income-tax Act, 1961 (First Schedule); the app\'s tax core, lib/taxcore.ts'),
  row('cess', 'Income-tax slabs', 'Health and education cess', `${CESS * 100}% on the tax, in both regimes.`, 'both'),
  row('std-new', 'Deductions and rebates', 'Standard deduction (salary)', `${L(STD_NEW)} in the new regime.`, 'new regime'),
  row('std-old', 'Deductions and rebates', 'Standard deduction (salary)', `${L(STD_OLD)} in the old regime.`, 'old regime'),
  row('rebate-new', 'Deductions and rebates', 'Section 87A rebate', `No tax if taxable income is up to ${L(NEW_REBATE_LIMIT)}; just above it the tax is capped at the income over ${L(NEW_REBATE_LIMIT)} (marginal relief).`, 'new regime'),
  row('rebate-old', 'Deductions and rebates', 'Section 87A rebate', `No tax if taxable income is up to ${L(OLD_REBATE_LIMIT)}.`, 'old regime'),
  row('80c', 'Deductions and rebates', 'Section 80C', 'Up to ₹1,50,000 a year (PPF, ELSS, EPF, life premiums and others). Not available in the new regime.', 'old regime', 'Income-tax Act, 1961, section 80C; lib/taxSavings.ts'),
  row('80d', 'Deductions and rebates', 'Section 80D (health insurance)', 'Up to ₹25,000 for self and family; ₹50,000 when the person insured is a senior citizen (the Tax planner applies the higher limit to parents only). Not available in the new regime.', 'old regime', 'Income-tax Act, 1961, section 80D; lib/taxSavings.ts, lib/taxPlanner.ts'),
  row('80ccd1b', 'Deductions and rebates', 'Section 80CCD(1B) (NPS)', 'An extra ₹50,000 above 80C. Not available in the new regime (only the employer\'s NPS share, 80CCD(2), is).', 'old regime', 'Income-tax Act, 1961, section 80CCD; lib/taxSavings.ts'),
  row('24b', 'Deductions and rebates', 'Section 24(b) (home-loan interest)', 'Up to ₹2,00,000 a year on a self-occupied home. Old regime.', 'old regime', 'Income-tax Act, 1961, section 24(b); lib/taxPlanner.ts'),
  row('ltcg', 'Capital gains', 'Listed equity and equity funds held over 12 months', `Gains up to ${L(LTCG_EXEMPT)} a year are exempt; above that ${LTCG_RATE * 100}% plus cess, with no indexation.`, 'both', 'Income-tax Act, 1961, section 112A as amended in 2024; lib/taxHarvest.ts'),
  row('stcg', 'Capital gains', 'Listed equity and equity funds sold within 12 months', `${STCG_RATE * 100}% plus cess.`, 'both', 'Income-tax Act, 1961, section 111A as amended in 2024; lib/taxHarvest.ts'),
  row('surcharge', 'Not modelled', 'Surcharge', 'Applies above ₹50 lakh of income. The app\'s tax core does not model it, so estimates above that are understated.', 'both'),
  row('other', 'Not modelled', 'Everything else', 'HRA, other capital gains (debt funds, property, gold), tax deducted at source, advance-tax interest, carried-forward losses and your employer\'s choices are not in the estimate.', 'both'),
];

/** The financial year of `now` is later than the one the rules were written for. */
export function staleness(now: Date): string | null {
  const fy = fyOf(isoDate(now));
  return fy > RULES_FY ? `Today is in ${fyLabel(fy)}. These are the ${fyLabel(RULES_FY)} rules built into the app. If a Budget changed a slab or limit since, the app has not been updated: check incometax.gov.in before relying on a number.` : null;
}

export function currentDates(now: Date): CalEvent[] {
  const today = isoDate(now), fy = fyOf(today);
  return [...taxDatesForFY(fy - 1), ...taxDatesForFY(fy)].filter(e => e.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
}

/** Both regimes on the annual income given to the Tax planner: the slab each reaches after the standard deduction ONLY, and the tax. No regime is assumed. */
export function bothRegimes(income: number) {
  const nt = Math.max(0, income - STD_NEW), ot = Math.max(0, income - STD_OLD);
  const top = (s: Slab[], x: number) => s.slice().reverse().find(([lo]) => x > lo) ?? s[0];
  const b = best(nt, ot);
  return { income, newTaxable: nt, oldTaxable: ot, newTop: Math.round(top(NEW_SLABS, nt)[2] * 100), oldTop: Math.round(top(OLD_SLABS, ot)[2] * 100), taxNew: b.taxNew, taxOld: b.taxOld, lower: b.regime };
}
