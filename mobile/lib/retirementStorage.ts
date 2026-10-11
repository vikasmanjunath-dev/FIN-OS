// Retirement planner storage: same finos_retire_* keys the website uses, so a plan made on either side follows you.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RETIRE_KEYS, type Plan } from '@/lib/retirementPlan';

/** Everything the planner reads, as a plain map (missing keys are simply absent). */
export async function loadRetirementStore(): Promise<Record<string, string>> {
  const pairs = await AsyncStorage.multiGet([...RETIRE_KEYS]);
  const out: Record<string, string> = {};
  pairs.forEach(([k, v]) => { if (v != null && v !== '') out[k] = v; });
  return out;
}

export async function saveRetirementInput(key: string, value: string): Promise<void> {
  if (value === '') await AsyncStorage.removeItem(key);
  else await AsyncStorage.setItem(key, value);
}

/** The four totals other screens read (health score, Arya, the website). The website writes the same keys from its planner. */
export async function persistRetirementOutputs(p: Plan): Promise<void> {
  await AsyncStorage.multiSet([
    ['finos_retire_corpus', String(p.totalCorpus)],
    ['finos_retire_required', String(p.requiredCorpus)],
    ['finos_retire_gap', String(p.corpusGap)],
    ['finos_retire_monthly_income', String(p.totalMonthlyIncome)],
  ]);
}
