// Home-loan inputs on the device, under the website's finos_hl_* keys. Opening the screen writes nothing (the website writes
// its default ₹50L loan's EMI into finos_home_loan_emi on every render, which the debt optimizer then treats as a real loan);
// the figures other trackers read are written only when the person taps "Save as my home loan".
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HL_KEYS, type HomeLoanResult } from '@/lib/homeLoan';

export type HomeLoanFields = Record<keyof typeof HL_KEYS, string> & { income: string };
const INCOME_KEY = 'finos_hl_income_v1';                    // mobile-only; the website takes income from finos_monthly_income

const clean = (raw: string | null | undefined) => { const n = parseFloat(raw ?? ''); return Number.isFinite(n) && n > 0 ? String(n) : ''; };

export async function loadHomeLoanFields(): Promise<HomeLoanFields & { incomeDefault: string }> {
  const keys = [...Object.values(HL_KEYS), INCOME_KEY, 'finos_monthly_income', 'finos_gross_income'];
  const got = Object.fromEntries(await AsyncStorage.multiGet(keys));
  const monthly = parseFloat(got.finos_monthly_income ?? '') || (parseFloat(got.finos_gross_income ?? '') / 12) || 0;
  return {
    loanAmount: clean(got[HL_KEYS.loanAmount]), interestRate: clean(got[HL_KEYS.interestRate]), tenureYears: clean(got[HL_KEYS.tenureYears]),
    prepayAmount: clean(got[HL_KEYS.prepayAmount]), prepayYear: clean(got[HL_KEYS.prepayYear]),
    income: clean(got[INCOME_KEY]), incomeDefault: monthly > 0 ? String(Math.round(monthly)) : '',
  };
}

export function saveHomeLoanField(k: keyof HomeLoanFields, v: string): Promise<void> {
  const key = k === 'income' ? INCOME_KEY : HL_KEYS[k];
  return AsyncStorage.setItem(key, String(parseFloat(v) || 0));
}

/** Make this the person's home loan everywhere: Net Worth liability, Debt payoff (balance, rate, EMI) and the website's totals. */
export function saveAsMyHomeLoan(loanAmount: number, rate: number, r: HomeLoanResult): Promise<void> {
  return AsyncStorage.multiSet([
    ['finos_home_loan', String(Math.round(loanAmount))],
    ['finos_home_loan_rate', String(rate)],
    ['finos_home_loan_emi', String(r.emi)],
    ['finos_home_loan_total_interest', String(r.sched.totalInterest)],
    ['finos_home_loan_outstanding', String(Math.round(loanAmount))],
  ]);
}
