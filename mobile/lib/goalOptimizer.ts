// Goal optimizer: for every goal, the monthly SIP that reaches its inflation-adjusted target, a priority score, whether the money you
// can set aside is enough for all of them, and which goals compete for it. Port of _compute in js/finos-goal-optimizer.js with the goals,
// income and the clock passed in. __tests__/goalOptimizer.parity.test.mts compares them.
// One deliberate fix, made in the website file too: money already saved is today's rupees and compounds on its own; the old code took
// the saved percentage of the INFLATED target, counting inflation twice.

export const INFLATION = 0.06;
export const GOAL_RETURNS: Record<string, number> = { retirement: 0.10, education: 0.10, home: 0.08, car: 0.07, travel: 0.07, emergency: 0.065, wedding: 0.08, default: 0.10 };

export interface GoalIn { id?: string; name?: string; goal?: string; type?: string; category?: string; target?: number; amount?: number; current?: number; progress?: number; target_date?: string | null }
export interface GoalPlan extends GoalIn {
  id: string; monthsLeft: number; yearsLeft: number; targetInflated: number; progress: number; fundedAmt: number;
  annualR: number; sipNeeded: number; priority: number; onTrack: boolean; targetDate: string | null;
}
export interface Conflict { a: string; b: string; diff: number; combined: number }
export interface OptimizerResult {
  goals: GoalPlan[]; income: number; savingsRate: number; availableSIP: number; totalSIPNeeded: number; feasibility: number; conflicts: Conflict[];
}

export function sip(targetFV: number, annualReturn: number, months: number, existingCorpus: number): number {
  if (months <= 0) return 0;
  const r = annualReturn / 12;
  const fvC = existingCorpus * Math.pow(1 + r, months);
  const needed = Math.max(0, targetFV - fvC);
  if (needed <= 0) return 0;
  if (r === 0) return Math.round(needed / months);
  return Math.round((needed * r) / (Math.pow(1 + r, months) - 1));
}
export const inflatedTarget = (todayAmount: number, years: number) => Math.round(todayAmount * Math.pow(1 + INFLATION, years));

function priorityScore(goal: GoalIn, monthsLeft: number, sipRequired: number, income: number) {
  const urgency = monthsLeft <= 0 ? 100 : Math.max(0, 100 - monthsLeft / 2);
  const progress = Number(goal.progress) || (Number(goal.current) / Math.max(1, Number(goal.target))) * 100 || 0;
  const gap = Math.max(0, 100 - progress);
  const pressure = income > 0 ? Math.min(100, (sipRequired / income) * 100 * 2) : 50;
  return Math.round(urgency * 0.5 + gap * 0.3 + pressure * 0.2);
}

export function goalReturn(goal: GoalIn): number {
  const type = (goal.type || goal.category || goal.name || '').toLowerCase();
  for (const [key, r] of Object.entries(GOAL_RETURNS)) if (type.includes(key)) return r;
  return GOAL_RETURNS.default;
}

function deadline(value: string | null | undefined, now: Date): { month: string | null; monthsLeft: number } {
  if (!value) return { month: null, monthsLeft: 120 };
  const text = String(value);
  let year: number, month: number, day: number, monthOnly = false;
  if (/^\d{4}-\d{2}$/.test(text)) {
    [year, month] = text.split('-').map(Number); day = 1; monthOnly = true;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    [year, month, day] = text.split('-').map(Number); monthOnly = day === 1;
  } else {
    const date = new Date(text);
    if (!Number.isFinite(date.getTime())) return { month: null, monthsLeft: 120 };
    year = date.getFullYear(); month = date.getMonth() + 1; day = date.getDate();
  }
  const dim = [31, ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (month < 1 || month > 12 || day < 1 || day > dim) return { month: null, monthsLeft: 120 };
  const monthDelta = (year - now.getFullYear()) * 12 + month - 1 - now.getMonth();
  const due = new Date(year, month - 1, day);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthsLeft = monthOnly ? Math.max(0, monthDelta + 1) : (due < today ? 0 : Math.max(1, monthDelta + 1));
  return { month: `${year}-${String(month).padStart(2, '0')}`, monthsLeft };
}

export function compute(goals: GoalIn[], ctx: { income: number; savingsRate: number }, now: Date = new Date()): OptimizerResult {
  const { income, savingsRate } = ctx;
  const availableSIP = Math.round((income * savingsRate) / 100);
  const enriched = goals.map((g, i): GoalPlan => {
    const target = deadline(g.target_date, now);
    const monthsLeft = target.monthsLeft;
    const yearsLeft = monthsLeft / 12;
    const targetToday = Number(g.target) || Number(g.amount) || 0;
    const targetInflated = inflatedTarget(targetToday, yearsLeft);
    const progress = Number(g.progress) || (Number(g.current) > 0 ? Math.round((Number(g.current) / Math.max(1, targetToday)) * 100) : 0);
    const fundedAmt = Number(g.current) > 0 ? Math.round(Number(g.current)) : Math.round((targetToday * progress) / 100);
    const annualR = goalReturn(g);
    const sipNeeded = sip(targetInflated, annualR, monthsLeft, fundedAmt);
    const priority = priorityScore(g, monthsLeft, sipNeeded, income);
    const onTrack = progress >= Math.max(0, 100 - (monthsLeft / 120) * 100);
    return {
      ...g, id: g.id || `g${i}`, monthsLeft, yearsLeft, targetInflated, progress, fundedAmt, annualR, sipNeeded, priority, onTrack,
      targetDate: target.month,
    };
  }).sort((a, b) => b.priority - a.priority);

  const totalSIPNeeded = enriched.reduce((s, g) => s + g.sipNeeded, 0);
  const feasibility = totalSIPNeeded > 0 ? Math.min(100, Math.round((availableSIP / totalSIPNeeded) * 100)) : 100;

  const conflicts: Conflict[] = [];
  for (let i = 0; i < enriched.length; i++) {
    for (let j = i + 1; j < enriched.length; j++) {
      const a = enriched[i], b = enriched[j];
      if (!a.targetDate || !b.targetDate) continue;
      const diff = Math.abs(a.monthsLeft - b.monthsLeft);
      if (diff <= 12 && a.sipNeeded + b.sipNeeded > availableSIP * 0.8) {
        conflicts.push({ a: a.name || a.goal || `Goal ${i + 1}`, b: b.name || b.goal || `Goal ${j + 1}`, diff, combined: a.sipNeeded + b.sipNeeded });
      }
    }
  }
  return { goals: enriched, income, savingsRate, availableSIP, totalSIPNeeded, feasibility, conflicts };
}

export function badge(priority: number) {
  if (priority >= 75) return { label: 'Urgent', tone: 'bad' as const, icon: '🔴' };
  if (priority >= 50) return { label: 'High', tone: 'warn' as const, icon: '🟡' };
  if (priority >= 25) return { label: 'Medium', tone: 'good' as const, icon: '🟢' };
  return { label: 'Low', tone: 'dim' as const, icon: '⚪' };
}
