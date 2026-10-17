// Retirement planner — the arithmetic of js/finos-retirement-planner.js, separated from its storage and rendering.
//   computePlan(read)  → projected corpus by source, the 25× required corpus, the gap, monthly income at retirement
//   mcConfig(plan, read) → the configuration the Monte Carlo engine runs on (assets split equity / debt / gold)
// `read(key)` returns the stored string for a key (or null). The website reads localStorage in the same places and
// __tests__/retirementPlan.parity.test.mts loads the website's real file and compares the two on random data.
import { DEFAULT_ASSUMPTIONS } from '@/lib/montecarlo';

export type Reader = (key: string) => string | null | undefined;

const gs = (read: Reader, k: string) => {
  const raw = String(read(k) ?? '').trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(raw)) return 0;
  const value = Number(raw.replace(/,/g, ''));
  return Number.isFinite(value) && value > 0 ? value : 0;
};
const gss = (read: Reader, k: string) => String(read(k) ?? '');
const fv = (pv: number, r: number, n: number) => Math.round(pv * Math.pow(1 + r, n));
const wholeAge = (raw: string, min: number, max: number) => {
  const value = raw.trim();
  if (!/^\d{1,3}$/.test(value)) return 0;
  const age = Number(value);
  return age >= min && age <= max ? age : 0;
};
const validDob = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const dim = [31, ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return month >= 1 && month <= 12 && day >= 1 && day <= dim;
};

export const RETIRE_KEYS = [
  'finos_retire_age', 'finos_retire_exp_mo', 'finos_retire_inflation', 'finos_retire_return', 'finos_epf_dob', 'finos_nps_dob',
  'finos_retire_current_age', 'finos_epf_projected', 'finos_epf_value', 'finos_epf_pension', 'finos_nps_projected', 'finos_nps_tier1',
  'finos_nps_value', 'finos_nps_tier2', 'finos_nps_annuity_pct', 'finos_nps_equity_pct', 'finos_ppf_value', 'finos_sip_value',
  'finos_portfolio_value', 'finos_mf_import_value', 'finos_fd_value', 'finos_gold_value', 'finos_retire_manual_corpus',
  'finos_retire_monthly_invest', 'finos_retire_stepup', 'finos_retire_end_age', 'finos_retire_eq_return',
] as const;

export interface Plan {
  ready: boolean;
  ageNow: number; retireAge: number; yearsLeft: number; expMo: number; inflatedMonthlyExp: number; inflatedAnnualExp: number;
  inflation: number; portfolioR: number;
  epfProjected: number; epsPension: number; npsLumpSum: number; npsTier2Projected: number; npsAnnuityMo: number; npsAnnuityPct: number;
  ppfProjected: number; sipProjected: number; equityProj: number; fdProjected: number; goldProjected: number; manualCorpus: number;
  totalCorpus: number; requiredCorpus: number; corpusGap: number;
  swrMonthly: number; totalMonthlyIncome: number; expCoverage: number; runwayYears: number;
}

export function computePlan(read: Reader, now: Date = new Date()): Plan {
  const retireAge = wholeAge(gss(read, 'finos_retire_age'), 40, 80) || 60;
  const expMo = gs(read, 'finos_retire_exp_mo');                         // today's rupees; omitted means unknown
  const inflation = (gs(read, 'finos_retire_inflation') || 6) / 100;
  const portfolioR = (gs(read, 'finos_retire_return') || 10) / 100;

  // Current age from the date of birth the EPF or NPS tracker holds
  const dob = gss(read, 'finos_epf_dob') || gss(read, 'finos_nps_dob');
  let ageNow = 0;
  const birth = validDob(dob) ? new Date(dob + 'T00:00:00') : null;
  const today = new Date(now.getTime());
  today.setHours(0, 0, 0, 0);
  if (birth && Number.isFinite(birth.getTime()) && birth <= today) {
    ageNow = today.getFullYear() - birth.getFullYear()
      - (today < new Date(today.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0);
  } else {
    ageNow = wholeAge(gss(read, 'finos_retire_current_age'), 18, 100);
  }
  // No age means no projection horizon. Missing personal data is never replaced by an assumed age.
  const yearsLeft = ageNow > 0 ? Math.max(retireAge - ageNow, 0) : 0;
  const ready = ageNow > 0 && expMo > 0;

  const epfProjected = gs(read, 'finos_epf_projected') || fv(gs(read, 'finos_epf_value'), 0.0825, yearsLeft);
  const epsPension = gs(read, 'finos_epf_pension');                       // monthly EPS pension

  // The selected annuity share of NPS Tier 1 is converted to a pension; the rest is a lump sum. Tier 2 stays liquid.
  const npsProjected = gs(read, 'finos_nps_projected') || fv(gs(read, 'finos_nps_tier1') || gs(read, 'finos_nps_value'), 0.085, yearsLeft);
  const npsTier2Projected = fv(gs(read, 'finos_nps_tier2'), portfolioR, yearsLeft);
  const savedAnnuityPct = parseInt(gss(read, 'finos_nps_annuity_pct'), 10);
  const npsAnnuityPct = [0, 20, 40, 80].includes(savedAnnuityPct) ? savedAnnuityPct : 40;
  const npsLumpSum = Math.round(npsProjected * (1 - npsAnnuityPct / 100));
  const npsAnnuityC = npsProjected - npsLumpSum;
  const npsAnnuityMo = Math.round(npsAnnuityC * 0.07 / 12);               // 7% annuity rate estimate

  const ppfProjected = fv(gs(read, 'finos_ppf_value'), 0.071, yearsLeft);
  const sipProjected = fv(gs(read, 'finos_sip_value'), portfolioR, yearsLeft);
  const equityProj = fv(gs(read, 'finos_portfolio_value') + gs(read, 'finos_mf_import_value'), portfolioR, yearsLeft);
  const fdProjected = fv(gs(read, 'finos_fd_value'), 0.07, yearsLeft);
  const goldProjected = fv(gs(read, 'finos_gold_value'), 0.08, yearsLeft);
  const manualCorpus = gs(read, 'finos_retire_manual_corpus');

  const totalCorpus = epfProjected + npsLumpSum + npsTier2Projected + ppfProjected + sipProjected
    + equityProj + fdProjected + goldProjected + manualCorpus;

  // Today's monthly expense inflated to the retirement year; 25× annual = a 4% safe withdrawal rate
  const inflatedMonthlyExp = Math.round(expMo * Math.pow(1 + inflation, yearsLeft));
  const inflatedAnnualExp = inflatedMonthlyExp * 12;
  const requiredCorpus = inflatedAnnualExp * 25;
  const corpusGap = requiredCorpus - totalCorpus;                         // negative = surplus

  const swrMonthly = Math.round(totalCorpus * 0.04 / 12);
  const totalMonthlyIncome = swrMonthly + epsPension + npsAnnuityMo;
  const expCoverage = inflatedMonthlyExp > 0 ? (totalMonthlyIncome / inflatedMonthlyExp) * 100 : 0;
  const runwayYears = totalCorpus > 0 && inflatedMonthlyExp > 0 ? totalCorpus / (inflatedMonthlyExp * 12) : 0;

  return {
    ready, ageNow, retireAge, yearsLeft, expMo, inflatedMonthlyExp, inflatedAnnualExp, inflation, portfolioR,
    epfProjected, epsPension, npsLumpSum, npsTier2Projected, npsAnnuityMo, npsAnnuityPct, ppfProjected,
    sipProjected, equityProj, fdProjected, goldProjected, manualCorpus,
    totalCorpus, requiredCorpus, corpusGap, swrMonthly, totalMonthlyIncome, expCoverage, runwayYears,
  };
}

export function mcConfig(c: Plan, read: Reader) {
  const A = DEFAULT_ASSUMPTIONS as Record<string, { mean: number; vol: number; beta: number }>;
  const eqRet = (gs(read, 'finos_retire_eq_return') || 12) / 100;
  const npsEq = Math.min(Math.max(gs(read, 'finos_nps_equity_pct') || 50, 0), 100) / 100;
  const npsPctRaw = parseInt(gss(read, 'finos_nps_annuity_pct'), 10);
  const npsPct = [0, 20, 40, 80].includes(npsPctRaw) ? npsPctRaw : 40;
  const npsTier1Lump = gs(read, 'finos_nps_tier1') * (1 - npsPct / 100);
  const npsTier2 = gs(read, 'finos_nps_tier2');
  const equity = gs(read, 'finos_sip_value') + gs(read, 'finos_portfolio_value') + gs(read, 'finos_mf_import_value') + npsTier1Lump * npsEq;
  const debt = gs(read, 'finos_epf_value') + gs(read, 'finos_ppf_value') + gs(read, 'finos_fd_value') + npsTier1Lump * (1 - npsEq) + npsTier2 + gs(read, 'finos_retire_manual_corpus');
  const gold = gs(read, 'finos_gold_value');
  const mk = (name: string, value: number, key: string, mean?: number) => ({ name, value, mean: mean === undefined ? A[key].mean : mean, vol: A[key].vol, beta: A[key].beta });
  return {
    startAge: c.ageNow, retireAge: Math.max(c.retireAge, c.ageNow), endAge: Math.max(gs(read, 'finos_retire_end_age') || 90, c.retireAge + 1),
    assets: [mk('Equity', equity, 'equity', eqRet), mk('Debt', debt, 'debt'), mk('Gold', gold, 'gold')],
    monthlyContribution: gs(read, 'finos_retire_monthly_invest'),
    stepUp: (gs(read, 'finos_retire_stepup') || 0) / 100,
    monthlyExpenseToday: c.expMo,
    inflation: c.inflation, inflationVol: 0.015,
    pensionMonthlyAtRetire: c.epsPension + c.npsAnnuityMo, pensionIndexation: 0,
    runs: 4000, seed: 2026,
  };
}

/** Plain-English verdict for a success probability (same cut-offs and words as the website). */
export function verdictFor(pct: number): { label: string; tone: 'good' | 'warn' | 'bad' } {
  if (pct >= 85) return { label: 'Strong — your money very likely outlasts you.', tone: 'good' };
  if (pct >= 65) return { label: 'Borderline — a bad decade could hurt. Consider saving more or spending less.', tone: 'warn' };
  return { label: 'At risk — most simulated futures run out of money. Act now: a small change early is cheap.', tone: 'bad' };
}
