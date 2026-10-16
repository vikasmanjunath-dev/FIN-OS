// What the forecast screen reads from the phone, and the one value it writes.
// It reads the person's own normalised transactions (lib/budget.ts) and their budget limits (finos_budgets, the Budget tracker's key).
// It writes ONLY its own key, finos_forecast_next_month (the website's key): a prediction never replaces a recorded
// monthly expense, savings rate or income.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadTransactions } from '@/lib/txnStorage';
import { getMany } from '@/lib/safeStore';
import type { IndexedTxn } from '@/lib/budget';

export const FORECAST_KEY = 'finos_forecast_next_month';
const BUDGETS_KEY = 'finos_budgets';
const INCOME_KEY = 'finos_monthly_income';

export interface ForecastInputs {
  txns: IndexedTxn[];
  limits: Record<string, number>;
  /** Recorded monthly income, or 0 when it has not been recorded (never guessed). */
  income: number;
}

export function parseLimits(raw: string | null | undefined): Record<string, number> {
  try {
    const lim = JSON.parse(raw ?? 'null')?.limits;
    if (!lim || typeof lim !== 'object') return {};
    return Object.fromEntries(Object.entries(lim).filter(([, v]) => Number.isFinite(Number(v)) && Number(v) > 0).map(([k, v]) => [k, Number(v)]));
  } catch { return {}; }
}

export async function loadForecastInputs(): Promise<ForecastInputs> {
  const [txns, m] = await Promise.all([loadTransactions(), getMany([BUDGETS_KEY, INCOME_KEY])]);
  const inc = parseFloat(m[INCOME_KEY] ?? '');
  return { txns, limits: parseLimits(m[BUDGETS_KEY]), income: Number.isFinite(inc) && inc > 0 ? inc : 0 };
}

/** Stores the baseline forecast (no events applied) under its own key. A zero or unknown forecast is not written. */
export async function saveForecastTotal(total: number): Promise<void> {
  if (!(total > 0) || !Number.isFinite(total)) return;
  await AsyncStorage.setItem(FORECAST_KEY, String(Math.round(total)));
}
