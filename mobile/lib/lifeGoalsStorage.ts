// Life goals planner on the device. It pre-fills ONLY from what the person has recorded, and leaves every other field blank:
//   age, income      the profile (finos_age, finos_monthly_income)
//   can invest       income x the recorded savings rate (finos_savings_rate), when there is one
//   emergency fund   finos_emergency_fund
//   other savings    savings / cash + deposits recorded in Net worth (finos_cash_value, finos_fd_value). Investments and retirement
//                    accounts are left out because they are not freely available; the person can add what they want to count.
//   goals            finos_goals (name, target, date -> years from today)
// The website guessed 30% of income as "what you can invest" and used total net worth (house, EPF and all) as "savings".
// What the person typed is kept on the device as a draft; what the plan produced is saved under the website's keys.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getMany } from '@/lib/safeStore';
import { summaryTotals, type PlanResult } from '@/lib/lifeGoals';

export const DRAFT_KEY = 'finos_life_goals_planner_v1';
export const FEAS_KEY = 'finos_life_goals_feasibility';       // its own key: finos_goals_feasibility belongs to the Goal optimizer

export interface GoalRow { name: string; amount: string; years: string; inflation: string }
export interface PlannerForm {
  age: string; income: string; surplus: string; efSaved: string; otherSavings: string; retireAge: string; returnPct: string;
  goals: GoalRow[];
}
export interface Prefilled { form: PlannerForm; from: Partial<Record<keyof PlannerForm, string>>; dependents: number | null; termCover: number | null; goalsNote: number }

export const DEFAULT_INFLATION = '6';      // an assumption the person can change, shown as one
export const BLANK_GOAL: GoalRow = { name: '', amount: '', years: '', inflation: DEFAULT_INFLATION };
export const BLANK_FORM: PlannerForm = { age: '', income: '', surplus: '', efSaved: '', otherSavings: '', retireAge: '', returnPct: '', goals: [{ ...BLANK_GOAL }] };

const pos = (v: unknown): number => { const x = parseFloat(String(v ?? '').replace(/[₹,\s]/g, '')); return Number.isFinite(x) && x > 0 ? x : 0; };
const txt = (n: number) => (n > 0 ? String(Math.round(n * 100) / 100) : '');

/** Years from `now` to a goal date, one decimal, or '' when there is no usable future date. */
export function yearsUntil(date: unknown, now: Date): string {
  if (typeof date !== 'string' || !date) return '';
  const t = Date.parse(date);
  if (!Number.isFinite(t)) return '';
  const y = (t - now.getTime()) / (365.25 * 86400000);
  return y > 0 ? String(Math.max(0.1, Math.round(y * 10) / 10)) : '';
}

export function buildPrefill(raw: Record<string, string | null | undefined>, now: Date): Prefilled {
  const form: PlannerForm = { ...BLANK_FORM, goals: [] };
  const from: Prefilled['from'] = {};
  const age = pos(raw.finos_age);
  if (age >= 18 && age <= 80) { form.age = String(Math.round(age)); from.age = 'your profile'; }
  const income = pos(raw.finos_monthly_income);
  if (income > 0) { form.income = txt(income); from.income = 'your profile'; }
  const rate = pos(raw.finos_savings_rate);
  if (income > 0 && rate > 0 && rate < 100) { form.surplus = txt(Math.round((income * rate) / 100)); from.surplus = `your recorded savings rate of ${Math.round(rate)}%`; }
  const ef = pos(raw.finos_emergency_fund);
  if (ef > 0) { form.efSaved = txt(ef); from.efSaved = 'your emergency fund tracker'; }
  const other = pos(raw.finos_cash_value) + pos(raw.finos_fd_value);
  if (other > 0) { form.otherSavings = txt(other); from.otherSavings = 'savings / cash and deposits in Net worth'; }

  let goalsList: any[] = [];
  try { const g = JSON.parse(raw.finos_goals ?? '[]'); if (Array.isArray(g)) goalsList = g.filter(x => x && typeof x === 'object'); } catch { /* none */ }
  let withSaved = 0;
  goalsList.forEach(g => {
    const target = pos(g.target ?? g.target_amount ?? g.amount);
    if (!(target > 0) || typeof g.name !== 'string') return;
    form.goals.push({ name: g.name.slice(0, 60), amount: txt(target), years: yearsUntil(g.target_date ?? g.deadline, now), inflation: DEFAULT_INFLATION });
    if (pos(g.current) > 0) withSaved++;
  });
  if (!form.goals.length) form.goals.push({ ...BLANK_GOAL });
  const deps = raw.finos_dependents == null || raw.finos_dependents === '' ? NaN : Number(raw.finos_dependents);
  const term = pos(raw.finos_term_insurance);
  return {
    form, from, goalsNote: withSaved,
    dependents: Number.isFinite(deps) && deps >= 0 ? deps : null,
    termCover: term > 0 ? term : null,
  };
}

const KEYS = ['finos_age', 'finos_monthly_income', 'finos_savings_rate', 'finos_emergency_fund', 'finos_cash_value', 'finos_fd_value',
  'finos_goals', 'finos_dependents', 'finos_term_insurance', DRAFT_KEY];

export async function loadPlanner(now: Date = new Date()): Promise<Prefilled & { draft: PlannerForm | null }> {
  let got: Record<string, string | null> = {};
  try { got = await getMany(KEYS); } catch { /* storage unavailable: start blank */ }
  const pre = buildPrefill(got, now);
  let draft: PlannerForm | null = null;
  try {
    const d = JSON.parse(got[DRAFT_KEY] ?? 'null');
    if (d && typeof d === 'object' && Array.isArray(d.goals)) {
      const s = (v: unknown) => (typeof v === 'string' ? v.slice(0, 40) : '');
      draft = {
        age: s(d.age), income: s(d.income), surplus: s(d.surplus), efSaved: s(d.efSaved), otherSavings: s(d.otherSavings), retireAge: s(d.retireAge), returnPct: s(d.returnPct),
        goals: d.goals.slice(0, 20).map((g: any) => ({ name: s(g?.name), amount: s(g?.amount), years: s(g?.years), inflation: s(g?.inflation) })),
      };
      if (!draft.goals.length) draft.goals = [{ ...BLANK_GOAL }];
    }
  } catch { draft = null; }
  return { ...pre, draft };
}

export const saveDraft = (f: PlannerForm) => AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(f)).catch(() => {});
export const clearDraft = () => AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});

/** The totals other screens read (same keys as the website's planner), and the feasibility under the planner's own key. */
export async function savePlanTotals(p: PlanResult): Promise<void> {
  const t = summaryTotals(p);
  await AsyncStorage.multiSet([
    ['finos_goals_monthly_sip', String(t.monthlySip)],
    ['finos_goals_target_total', String(t.targetTotal)],
    ['finos_goals_count', String(t.count)],
    [FEAS_KEY, String(p.feasPct)],
  ]);
}
