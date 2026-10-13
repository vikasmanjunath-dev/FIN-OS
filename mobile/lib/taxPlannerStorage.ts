// Tax Planner on the device: what to prefill from the trackers, and the figures the rest of FIN-OS reads after a plan.
// The same keys as the website's pushToContext: finos_tax_best_regime / _old_tax / _new_tax / _liability, finos_80c_used, finos_80c_gap.
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface PlannerFields {
  income: string; basic_pct: string; hra_received: string; monthly_rent: string; city: 'metro' | 'non_metro';
  inv_80c: string; home_loan_pri: string; health_self: string; health_parent: string; parents_senior: boolean;
  nps_self: string; employer_nps: string; home_loan_int: string; ltcg: string; stcg: string; other_ded: string;
}
export const PLANNER_DEFAULTS: PlannerFields = {
  income: '', basic_pct: '50', hra_received: '', monthly_rent: '', city: 'metro', inv_80c: '', home_loan_pri: '', health_self: '', health_parent: '',
  parents_senior: false, nps_self: '', employer_nps: '', home_loan_int: '', ltcg: '', stcg: '', other_ded: '',
};
export const PLANNER_KEY = 'finos_tax_planner_inputs_v1';

const num = (raw: unknown) => { const n = parseFloat(String(raw ?? '')); return Number.isFinite(n) && n > 0 ? n : 0; };
const list = (raw: string | null | undefined): any[] => { try { const v = JSON.parse(raw ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };

/** Starting figures from what the person already tracks (only used for fields they have not filled in). */
export async function loadPrefill(): Promise<Partial<PlannerFields>> {
  const got = Object.fromEntries(await AsyncStorage.multiGet(['finos_monthly_income', 'finos_gross_income', 'finos_fd_portfolio', 'finos_insurance_policies', 'finos_salary_ctc']));
  const out: Partial<PlannerFields> = {};
  const income = num(got.finos_salary_ctc) || num(got.finos_gross_income) || num(got.finos_monthly_income) * 12;
  if (income > 0) out.income = String(Math.round(income));
  const ppf = list(got.finos_fd_portfolio).filter(e => e && e.type === 'ppf').reduce((s, e) => s + num(e.annualAmount), 0);
  if (ppf > 0) out.inv_80c = String(Math.round(Math.min(ppf, 150000)));
  const health = list(got.finos_insurance_policies).filter(p => p && p.type === 'health').reduce((s, p) => s + num(p.premium || p.annual_premium), 0);
  if (health > 0) out.health_self = String(Math.round(health));
  return out;
}

export function toParams(f: PlannerFields) {
  return {
    income: num(f.income), basic_pct: num(f.basic_pct) || 50, hra_received: num(f.hra_received), monthly_rent: num(f.monthly_rent), city: f.city,
    inv_80c: num(f.inv_80c), home_loan_pri: num(f.home_loan_pri), health_self: num(f.health_self), health_parent: num(f.health_parent),
    parents_senior: f.parents_senior, nps_self: num(f.nps_self), employer_nps: num(f.employer_nps), home_loan_int: num(f.home_loan_int),
    ltcg: num(f.ltcg), stcg: num(f.stcg), other_ded: num(f.other_ded),
  };
}

export function savePlannerResults(r: { best: string; oldRegime: any; newRegime: any; params: any }): Promise<void> {
  return AsyncStorage.multiSet([
    ['finos_tax_best_regime', r.best],
    ['finos_tax_old_tax', String(r.oldRegime.total_tax)],
    ['finos_tax_new_tax', String(r.newRegime.total_tax)],
    ['finos_tax_liability', String(Math.min(r.oldRegime.total_tax, r.newRegime.total_tax))],
    ['finos_80c_used', String(Math.min((r.params.inv_80c || 0) + (r.params.home_loan_pri || 0), 150000))],
    ['finos_80c_gap', String(r.oldRegime.gaps?.s80c || 0)],
  ]);
}
