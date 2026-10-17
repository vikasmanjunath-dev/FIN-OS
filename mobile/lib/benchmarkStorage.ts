// Reads the figures the benchmark needs the same way the Money Score prefills (recorded data only, nothing guessed).
import { gatherScoreData } from '@/lib/moneyScoreStorage';
import { deriveInputs } from '@/lib/moneyScore';
import type { BenchInput } from '@/lib/benchmark';
import { getText } from '@/lib/safeStore';

export async function loadBenchInput(): Promise<{ input: BenchInput; sources: Record<string, string> }> {
  const g = await gatherScoreData();
  const d = deriveInputs(g.data) as { values: Record<string, number>; sources: Record<string, string> };
  const v = { ...d.values }, src = { ...d.sources };
  if (!v.monthlyExpenses && g.budgetExpense > 0) { v.monthlyExpenses = g.budgetExpense; src.monthlyExpenses = 'your budget'; }
  const n = (x: number | undefined) => (typeof x === 'number' && x >= 0 ? x : null);
  // "no dependents" (0) and "not recorded" are different answers, so read the raw value
  const rawDeps = await getText('finos_dependents');
  const deps = rawDeps == null || rawDeps.trim() === '' || !Number.isFinite(Number(rawDeps)) || Number(rawDeps) < 0 ? null : Number(rawDeps);
  return {
    sources: src,
    input: {
      age: n(v.age), monthlyIncome: n(v.monthlyIncome), monthlyExpenses: n(v.monthlyExpenses), monthlyEmi: n(v.monthlyEmi),
      liquidSavings: n(v.liquidSavings), monthlyInvesting: n(v.monthlyInvesting), investedTotal: n(v.investedTotal),
      termCover: n(v.termCover), dependents: deps,
    },
  };
}
