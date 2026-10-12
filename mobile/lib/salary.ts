// Salary structure: CTC → gross → HRA exemption → tax in both regimes → monthly take-home, plus restructuring tips.
// A typed port of the calculation half of js/finos-salary-optimizer.js (which reads localStorage; here the numbers are passed in).
// __tests__/salary.parity.test.mts loads the website file and compares every figure and every tip on random salaries.
// Tax comes from lib/taxcore.ts (the website's _compute carries its own copy of the same FY 2025-26 slabs; the test proves they agree).
import { taxNew, taxOld } from './taxcore.ts';

export type SalaryRegime = 'new' | 'old';
export interface SalaryInputs {
  ctc: number; basic: number; hraRcvd: number; lta: number; special: number; npsEr: number; rentPaid: number;
  isMetro: boolean; regime: SalaryRegime;
}
export interface SalaryResult extends SalaryInputs {
  hraExempt: number; grossSalary: number; pfEmp: number; pfEr: number; gratuity: number; profTax: number; stdDedn: number;
  c80c: number; c80ccd2: number; taxableOldNet: number; taxableNewNet: number;
  taxOld: number; taxNew: number; betterRegime: SalaryRegime; taxChosen: number; takeHomeMo: number; takeHomeAnn: number;
}

export const SALARY_KEYS = {
  ctc: 'finos_salary_ctc', basic: 'finos_salary_basic', hraRcvd: 'finos_salary_hra_received', lta: 'finos_salary_lta',
  special: 'finos_salary_special', npsEr: 'finos_salary_nps_er', rentPaid: 'finos_salary_rent_paid',
  city: 'finos_salary_city', regime: 'finos_salary_regime', pf: 'finos_salary_pf', takeHome: 'finos_salary_take_home',
} as const;

const INR = (v: number) => '₹' + Math.abs(Math.round(v)).toLocaleString('en-IN');
const n0 = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

/** Section 10(13A): the least of HRA received, rent − 10% of basic, and 50% (metro) / 40% of basic. Nothing when no rent is paid. */
export function hraExempt(basic: number, hraReceived: number, rentPaid: number, isMetro: boolean): number {
  if (rentPaid <= 0) return 0;
  const a = hraReceived;
  const b = rentPaid - 0.1 * basic;
  const c = basic * (isMetro ? 0.5 : 0.4);
  return Math.max(0, Math.min(a, b, c));
}

export function compute(input: SalaryInputs): SalaryResult {
  const { ctc, basic, hraRcvd, lta, special, npsEr, rentPaid, isMetro, regime } = input;
  const stdDedn = regime === 'new' ? 75000 : 50000;
  const pfEmp = Math.round(basic * 0.12);
  const pfEr = Math.min(Math.round(basic * 0.0367), 1800 * 12);
  const gratuity = Math.round(basic * 0.0481);
  const profTax = 2400;

  const hraEx = hraExempt(basic, hraRcvd, rentPaid, isMetro);
  const grossSalary = basic + hraRcvd + lta + special;
  const taxableOld = grossSalary - hraEx - stdDedn - profTax;
  const taxableNew = grossSalary - stdDedn;               // no HRA / LTA exemption in the new regime

  const c80c = Math.min(pfEmp, 150000);
  const c80ccd2 = Math.min(npsEr, Math.round(basic * 0.10));
  const taxableOldNet = Math.max(taxableOld - c80c - c80ccd2, 0);
  const taxableNewNet = Math.max(taxableNew - c80ccd2, 0);

  const tOld = taxOld(taxableOldNet);
  const tNew = taxNew(taxableNewNet);
  const taxChosen = regime === 'new' ? tNew : tOld;
  const takeHomeAnn = grossSalary - (pfEmp + profTax + taxChosen);
  return {
    ctc, basic, hraRcvd, lta, special, npsEr, rentPaid, isMetro, regime,
    hraExempt: hraEx, grossSalary, pfEmp, pfEr, gratuity, profTax, stdDedn, c80c, c80ccd2, taxableOldNet, taxableNewNet,
    taxOld: tOld, taxNew: tNew, betterRegime: tNew <= tOld ? 'new' : 'old', taxChosen,
    takeHomeMo: Math.round(takeHomeAnn / 12), takeHomeAnn,
  };
}

export interface HraLeg { id: 'A' | 'B' | 'C'; label: string; value: number; isMin: boolean }
export interface HraBreakdown { exempt: number; taxable: number; legs: HraLeg[] }
/** The three-way minimum, as the HRA tab lays it out. */
export function hraBreakdown(c: SalaryResult): HraBreakdown {
  const a = c.hraRcvd;
  const b = Math.max(c.rentPaid - 0.1 * c.basic, 0);
  const cc = c.basic * (c.isMetro ? 0.5 : 0.4);
  const min = Math.min(a, b, cc);
  return {
    exempt: c.hraExempt,
    taxable: c.hraRcvd - c.hraExempt,
    legs: [
      { id: 'A', label: 'Actual HRA received from employer', value: a, isMin: a === min && a > 0 },
      { id: 'B', label: `Rent paid (${INR(c.rentPaid)}) minus 10% of basic (${INR(c.basic * 0.1)})`, value: b, isMin: b === min && b > 0 },
      { id: 'C', label: `${c.isMetro ? '50%' : '40%'} of basic salary (${INR(c.basic * (c.isMetro ? 0.5 : 0.4))}, ${c.isMetro ? 'metro' : 'non-metro'} city)`, value: cc, isMin: cc === min && cc > 0 },
    ],
  };
}

export interface Tip { id: string; icon: string; title: string; saving: number; action: string }
/**
 * Restructuring ideas, in the website's order. The savings are rough (a flat ~30% slab + cess); they are estimates to start a
 * conversation with HR, not tax advice. The website printed "₹₹" in the flexi-benefits tip; it is a single ₹ here.
 */
export function tips(c: SalaryResult): Tip[] {
  const out: Tip[] = [];
  const maxNpsEr = Math.round(c.basic * 0.10);
  if (c.npsEr < maxNpsEr) {
    const gap = maxNpsEr - c.npsEr;
    const saving = Math.round(gap * 0.30 * 1.04);
    out.push({ id: 'nps', icon: '🏛️', title: 'Maximise Employer NPS (80CCD(2))', saving,
      action: `Ask HR to route ${INR(gap)}/yr more as employer NPS. This reduces your special allowance by the same amount but saves ~${INR(saving)} in tax — completely outside 80C limit.` });
  }
  if (c.rentPaid === 0 && c.hraRcvd > 0) {
    const potentialExempt = Math.min(c.hraRcvd, c.basic * (c.isMetro ? 0.5 : 0.4));
    const saving = Math.round(potentialExempt * 0.30 * 1.04);
    out.push({ id: 'hra', icon: '🏠', title: 'Claim HRA Exemption (Old Regime)', saving,
      action: `If you pay rent, switch to old regime and claim HRA. With your current HRA of ${INR(c.hraRcvd)}, you could exempt up to ~${INR(potentialExempt)}, saving ~${INR(saving)} in tax.` });
  }
  if (c.special > 100000) {
    out.push({ id: 'flexi', icon: '🎁', title: 'Convert Special Allowance to Flexi Benefits', saving: Math.round(c.special * 0.30 * 0.30),
      action: `Ask HR to convert part of the ${INR(c.special)} special allowance into tax-exempt perquisites: meal coupons (₹26,400/yr), telephone reimbursement, books & periodicals, uniform allowance. Each reduces taxable income.` });
  }
  if (c.taxOld < c.taxNew) {
    const saving = c.taxNew - c.taxOld;
    out.push({ id: 'regime', icon: '🔄', title: 'Switch to Old Regime', saving,
      action: `Old regime saves you ${INR(saving)}/yr after accounting for HRA, 80C, and other deductions. File Form 10-IEA before July 31 to opt in. Your employer needs updated Form 12BB.` });
  } else if (c.taxNew < c.taxOld) {
    const saving = c.taxOld - c.taxNew;
    out.push({ id: 'stay', icon: '✅', title: 'Stay on New Regime (Already Optimal)', saving,
      action: `New regime saves ${INR(saving)}/yr vs old regime given your current deduction profile. Higher standard deduction (₹75,000) and simpler compliance make this the right choice.` });
  }
  if (c.lta === 0) {
    out.push({ id: 'lta', icon: '✈️', title: 'Request LTA in Salary Structure', saving: Math.round(50000 * 0.30),
      action: 'Ask HR to include Leave Travel Allowance — exempt for domestic travel (cheapest airfare) 2× in a 4-year block. ₹50,000/yr LTA saves ~₹15,000/yr in old regime.' });
  }
  return out;
}

/** Clean raw field text / stored strings into the number the maths takes: finite and never negative. */
export const money = (v: unknown) => Math.max(0, n0(parseFloat(String(v ?? ''))));
