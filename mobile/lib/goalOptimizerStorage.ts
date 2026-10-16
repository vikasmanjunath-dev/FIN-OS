// Goal optimizer on the device: the goals (the website's finos_goals), the two assumptions it needs, and the three figures it saves.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getMany, asList, flatRecord } from '@/lib/safeStore';
import type { GoalIn, OptimizerResult } from '@/lib/goalOptimizer';

const n = (v: unknown) => { const x = parseFloat(String(v ?? '')); return Number.isFinite(x) && x > 0 ? x : 0; };

export async function loadGoalInputs(): Promise<{ goals: GoalIn[]; income: number; savingsRate: number }> {
  const g = await getMany(['finos_goals', 'finos_monthly_income', 'finos_salary_take_home', 'finos_monthly_expense', 'finos_savings_rate']);
  const goals = asList(g.finos_goals).map(flatRecord).filter((x): x is NonNullable<typeof x> => x !== null) as unknown as GoalIn[];
  const income = n(g.finos_monthly_income) || n(g.finos_salary_take_home);
  const exp = n(g.finos_monthly_expense);
  // Savings rate: the saved figure when there is one, otherwise what is left after spending, otherwise unknown (0).
  const rate = n(g.finos_savings_rate) || (income > 0 && exp > 0 && exp < income ? Math.round(((income - exp) / income) * 100) : 0);
  return { goals, income, savingsRate: rate };
}

export function saveGoalPlan(r: OptimizerResult) {
  return AsyncStorage.multiSet([
    ['finos_goals_priority', JSON.stringify(r.goals.map(g => ({ id: g.id, name: g.name || g.goal, sipNeeded: g.sipNeeded, priority: g.priority })))],
    ['finos_goals_total_sip', String(r.totalSIPNeeded)],
    ['finos_goals_feasibility', String(r.feasibility)],
  ]);
}
