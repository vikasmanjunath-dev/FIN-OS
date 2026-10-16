// Debt optimizer inputs on the device. Balances live under the same keys as the Net Worth tracker (so they are shared), rates and EMIs
// under the website's keys, and the three result figures the rest of FIN-OS reads are written after each plan.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getMany } from '@/lib/safeStore';
import { LOAN_TYPES, EXTRA_KEY, type LoanKey, type Plan } from '@/lib/debt';

export interface LoanInput { balance: string; rate: string; emi: string; on: boolean }
export type DebtInputs = Record<LoanKey, LoanInput> & { extra: string };

const num = (raw: string | null) => { const n = parseFloat(raw ?? ''); return Number.isFinite(n) && n > 0 ? String(n) : ''; };

export async function loadDebtInputs(): Promise<DebtInputs> {
  const keys = LOAN_TYPES.flatMap(l => [l.balKey, l.rateKey, l.emiKey]).concat(EXTRA_KEY);
  const got = await getMany(keys);
  const out: any = { extra: num(got[EXTRA_KEY] ?? null) };
  LOAN_TYPES.forEach(l => {
    const balance = num(got[l.balKey] ?? null), emi = num(got[l.emiKey] ?? null);
    out[l.key] = { balance, rate: num(got[l.rateKey] ?? null), emi, on: !!(balance || emi) };    // a loan is "on" when it has a balance or an EMI, as on the website
  });
  return out as DebtInputs;
}

/** Save one field under the website's key (a cleared field stores 0, like the website). */
export function saveDebtField(kind: 'balance' | 'rate' | 'emi' | 'extra', loan: LoanKey | null, value: string): Promise<void> {
  const t = loan ? LOAN_TYPES.find(l => l.key === loan)! : null;
  const key = kind === 'extra' ? EXTRA_KEY : kind === 'balance' ? t!.balKey : kind === 'rate' ? t!.rateKey : t!.emiKey;
  return AsyncStorage.setItem(key, String(parseFloat(value) || 0));
}

export function saveDebtResults(p: Plan): Promise<void> {
  return AsyncStorage.multiSet([
    ['finos_debt_avalanche_months', String(p.avalanche.months)],
    ['finos_debt_total_interest', String(p.avalanche.totalInterest)],
    ['finos_debt_interest_saved', String(Math.max(p.avSaved, p.swSaved))],
  ]);
}
