// Life-cover inputs on the device: what to prefill from what is tracked, and the three figures the website saves.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getMany } from '@/lib/safeStore';
import type { CoverResult } from '@/lib/lifeCover';

export interface CoverFields { annualIncome: string; currentAge: string; retireAge: string; monthlyNeed: string; needYears: string; existingCover: string; totalLiab: string; discountRate: string; inflationRate: string }
export const COVER_FIELDS_DEFAULT: CoverFields = { annualIncome: '', currentAge: '30', retireAge: '60', monthlyNeed: '', needYears: '25', existingCover: '', totalLiab: '', discountRate: '6', inflationRate: '6' };
export const COVER_KEY = 'finos_lifecover_inputs_v1';

const n = (v: unknown) => { const x = parseFloat(String(v ?? '')); return Number.isFinite(x) && x > 0 ? x : 0; };
const list = (raw: string | null | undefined): any[] => { try { const v = JSON.parse(raw ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };

export async function loadCoverPrefill(): Promise<Partial<CoverFields>> {
  const g = await getMany(['finos_salary_ctc', 'finos_gross_income', 'finos_monthly_income', 'finos_monthly_expense', 'finos_budget_expenses',
    'finos_insurance_policies', 'finos_total_liabilities', 'finos_home_loan', 'finos_car_loan', 'finos_personal_loan', 'finos_credit_card_debt']);
  const out: Partial<CoverFields> = {};
  const income = n(g.finos_salary_ctc) || n(g.finos_gross_income) || n(g.finos_monthly_income) * 12;
  if (income) out.annualIncome = String(Math.round(income));
  const exp = n(g.finos_monthly_expense) || n(g.finos_budget_expenses);
  if (exp) out.monthlyNeed = String(Math.round(exp * 0.75));              // the website's rule of thumb: about 75% of today's spending
  const cover = list(g.finos_insurance_policies).filter(p => p && (p.type === 'life_term' || p.type === 'life_ulip')).reduce((s, p) => s + n(p.sum_assured), 0);
  if (cover) out.existingCover = String(Math.round(cover));
  const liab = n(g.finos_total_liabilities) || n(g.finos_home_loan) + n(g.finos_car_loan) + n(g.finos_personal_loan) + n(g.finos_credit_card_debt);
  if (liab) out.totalLiab = String(Math.round(liab));
  return out;
}

export function saveCoverResults(r: CoverResult) {
  return AsyncStorage.multiSet([['finos_life_cover_needed', String(r.coverGap)], ['finos_life_cover_hlv', String(r.hlv)], ['finos_life_cover_ircorpus', String(r.irCorpus)]]);
}
