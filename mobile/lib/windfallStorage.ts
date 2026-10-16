// What the windfall allocator reads from the device, and the two figures it saves (the website's keys).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getMany } from '@/lib/safeStore';
import type { WindfallContext } from '@/lib/windfall';

const KEYS = ['finos_monthly_expense', 'finos_budget_expenses', 'finos_emergency_fund', 'finos_80c_gap', 'finos_credit_card_debt', 'finos_personal_loan',
  'finos_home_loan_outstanding', 'finos_home_loan', 'finos_goals_total_sip', 'finos_home_loan_emi',
  'finos_salary_basic', 'finos_salary_hra_received', 'finos_salary_lta', 'finos_salary_special', 'finos_salary_nps_er', 'finos_gross_salary', 'finos_monthly_income'];
const n = (v: string | null | undefined) => { const x = parseFloat(v ?? ''); return Number.isFinite(x) && x > 0 ? x : 0; };

export async function loadWindfallContext(): Promise<{ ctx: WindfallContext; salary: number; employerNps: number; basic: number; salaryFrom: 'salary' | 'income' | 'none' }> {
  const g = await getMany(KEYS);
  const comp = n(g.finos_salary_basic) + n(g.finos_salary_hra_received) + n(g.finos_salary_lta) + n(g.finos_salary_special);
  const salary = comp || n(g.finos_gross_salary) || n(g.finos_monthly_income) * 12;
  return {
    ctx: {
      monthlyExpense: n(g.finos_monthly_expense) || n(g.finos_budget_expenses), efCurrent: n(g.finos_emergency_fund), c80cGap: n(g['finos_80c_gap']),
      creditDebt: n(g.finos_credit_card_debt), personalLoan: n(g.finos_personal_loan), homeLoanOut: n(g.finos_home_loan_outstanding) || n(g.finos_home_loan),
      goalsSip: n(g.finos_goals_total_sip), homeEmi: n(g.finos_home_loan_emi),
    },
    salary, employerNps: n(g.finos_salary_nps_er), basic: n(g.finos_salary_basic),
    salaryFrom: comp || n(g.finos_gross_salary) ? 'salary' : n(g.finos_monthly_income) ? 'income' : 'none',
  };
}

export function saveWindfall(amount: number, type: string, totalAllocated: number) {
  return AsyncStorage.multiSet([['finos_windfall_amount', String(amount)], ['finos_windfall_type', type], ['finos_windfall_allocated', String(totalAllocated)]]);
}
