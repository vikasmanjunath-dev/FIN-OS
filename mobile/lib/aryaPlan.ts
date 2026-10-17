// Arya "Plan" tab: a journey of money steps, each with a status worked out ONLY from what the person recorded.
// The website's roadmap (js/arya-roadmap.js) defaults spending to 75% of income and age to 30, invents premiums and returns ("7.2%",
// "12% CAGR"), and sorts unfinished safety steps near the end. Here an unrecorded figure makes a step 'unknown' and says what to record.
// Order is the usual planning order (safety, protection, debt, tax, saving, goals, independence); it is a list, not advice.
// Pure: facts in, steps out.
import { type ArFacts, inr, inrShort, incomeMonthly, ageOf, used80c, netWorthKnown } from '@/lib/aryaFacts';
import { computeCoverage } from '@/lib/retirement';
import { simulatePayoff, type DebtLoan } from '@/lib/debt';
import { retirementOdds } from '@/lib/aryaRetirement';
import { findSIP } from '@/lib/lifeGoals';

export type StepStatus = 'done' | 'progress' | 'todo' | 'unknown' | 'na';
export interface PlanStep { id: string; icon: string; title: string; status: StepStatus; progress: number | null; stat: string; detail: string; basis: string; route: string; routeLabel: string }

const step = (p: PlanStep) => p;

export function planSteps(f: ArFacts): PlanStep[] {
  const c = f.computed, out: PlanStep[] = [];
  const income = incomeMonthly(f);

  const e = c.emergency;
  out.push(!(e.monthlyExpense > 0)
    ? step({ id: 'emergency', icon: '🛟', title: 'Emergency fund', status: 'unknown', progress: null, stat: 'Cannot be measured', detail: 'Your monthly spending is not recorded, so months of cover cannot be worked out.', basis: 'Budget tracker', route: '/tracker/budget', routeLabel: 'Record spending' })
    : !(e.fund > 0)
      ? step({ id: 'emergency', icon: '🛟', title: 'Emergency fund', status: 'todo', progress: 0, stat: `None recorded (target ${e.target} months)`, detail: `${e.target} months of your recorded spending is ${inr(e.targetAmount)}.`, basis: 'Emergency fund tracker, Budget tracker', route: '/tracker/emergency', routeLabel: 'Open emergency fund' })
      : step({ id: 'emergency', icon: '🛟', title: 'Emergency fund', status: e.pct >= 100 ? 'done' : 'progress', progress: Math.round(e.pct), stat: `${e.covered.toFixed(1)} of ${e.target} months`, detail: e.shortfall > 0 ? `${inr(e.shortfall)} more reaches the tracker's ${e.target}-month target.` : 'At or above the tracker\'s target.', basis: 'Emergency fund tracker, Budget tracker', route: '/tracker/emergency', routeLabel: 'Open emergency fund' }));

  const age = ageOf(f) || null;
  const cov = computeCoverage(f.data.policies, income, age);
  out.push(f.dependents === 0
    ? step({ id: 'term', icon: '🛡️', title: 'Term life cover', status: 'na', progress: null, stat: 'You recorded no dependants', detail: 'Term cover matters mainly when someone depends on your income. If that changes, update your profile.', basis: 'Profile (dependants)', route: '/tracker/insurance', routeLabel: 'Open insurance' })
    : !cov.hasTerm
      ? step({ id: 'term', icon: '🛡️', title: 'Term life cover', status: 'todo', progress: 0, stat: 'No term policy recorded', detail: `If anyone depends on your income, the usual guide is about 15 times yearly income${income > 0 ? ` (${inrShort(cov.recLife)} for you)` : ''}. ${f.dependents === null ? 'Dependants are not recorded, so this may not apply.' : ''}`.trim(), basis: 'Insurance tracker; 15x is a rule of thumb', route: '/tracker/insurance', routeLabel: 'Open insurance' })
      : step({ id: 'term', icon: '🛡️', title: 'Term life cover', status: income > 0 && cov.totalLife < cov.recLife ? 'progress' : 'done', progress: income > 0 ? Math.min(100, Math.round((cov.totalLife / cov.recLife) * 100)) : null, stat: `${inrShort(cov.totalLife)} recorded`, detail: income > 0 ? `The 15x guide is ${inrShort(cov.recLife)}. A guide, not a requirement.` : 'Record your income to compare with the usual guide.', basis: 'Insurance tracker', route: '/tracker/insurance', routeLabel: 'Open insurance' }));

  out.push(!cov.hasHealth
    ? step({ id: 'health', icon: '🏥', title: 'Health cover', status: 'todo', progress: 0, stat: 'No health policy recorded', detail: 'This means none is recorded here. Employer cover is not counted unless you added it.', basis: 'Insurance tracker', route: '/tracker/insurance', routeLabel: 'Open insurance' })
    : step({ id: 'health', icon: '🏥', title: 'Health cover', status: income > 0 && cov.totalHealth < cov.recHealth ? 'progress' : 'done', progress: income > 0 ? Math.min(100, Math.round((cov.totalHealth / cov.recHealth) * 100)) : null, stat: `${inrShort(cov.totalHealth)} recorded`, detail: income > 0 ? `The 2x yearly income guide is ${inrShort(cov.recHealth)}.` : 'Record your income to compare with the usual guide.', basis: 'Insurance tracker', route: '/tracker/insurance', routeLabel: 'Open insurance' }));

  const owed = c.netWorth.totalLiabilities;
  if (!(owed > 0)) out.push(step({ id: 'debt', icon: '⛓️', title: 'Debt', status: 'done', progress: 100, stat: 'No loans or card dues recorded', detail: 'This means none is recorded here.', basis: 'Net Worth tracker', route: '/tracker/networth', routeLabel: 'Open net worth' }));
  else {
    const emi = f.loans.reduce((s, l) => s + l.emi, 0);
    let detail = `You owe ${inr(owed)}${emi > 0 && income > 0 ? `; EMIs are ${Math.round((emi / income) * 100)}% of income` : ''}.${c.netWorth.liabilities.some(l => l.field === 'creditCard' && l.value > 0) ? ' Card dues are usually the costliest debt, so clearing them saves their interest rate.' : ''}`;
    if (f.loans.length && f.loans.every(l => l.balance > 0 && l.rate > 0 && l.emi > 0)) {
      const r = simulatePayoff(f.loans.map(l => ({ key: l.key, label: l.label, balance: l.balance, rate: l.rate, emi: l.emi }) as DebtLoan), 0, 'avalanche');
      if (r.paidOff) detail += ` At today's EMIs: debt-free in ${Math.floor(r.months / 12)}y ${r.months % 12}m.`;
    }
    out.push(step({ id: 'debt', icon: '⛓️', title: 'Debt', status: 'progress', progress: null, stat: `${inr(owed)} outstanding`, detail, basis: 'Net Worth tracker, Debt optimizer', route: '/tools/debt', routeLabel: 'Open Debt optimizer' }));
  }

  const u = used80c(f);
  out.push(u === null
    ? step({ id: 'tax', icon: '🧾', title: 'Tax: 80C', status: 'unknown', progress: null, stat: '80C used is not recorded', detail: '80C helps only in the old regime. Which regime you use is not recorded or assumed.', basis: 'Tax planner', route: '/tools/taxplanner', routeLabel: 'Open Tax planner' })
    : step({ id: 'tax', icon: '🧾', title: 'Tax: 80C', status: u >= 150000 ? 'done' : 'progress', progress: Math.round((u / 150000) * 100), stat: `${inr(u)} of ₹1,50,000`, detail: u >= 150000 ? 'Limit used up.' : `${inr(150000 - u)} unused. Old regime only; the year ends 31 March.`, basis: 'Tax planner / tracker', route: '/tools/taxplanner', routeLabel: 'Open Tax planner' }));

  const b = c.budget;
  out.push(!b.known
    ? step({ id: 'saving', icon: '📈', title: 'Saving and investing', status: 'unknown', progress: null, stat: 'Needs income and spending', detail: 'Record both to see a savings rate.', basis: 'Budget tracker', route: '/tracker/budget', routeLabel: 'Open budget' })
    : step({ id: 'saving', icon: '📈', title: 'Saving and investing', status: b.savingsRate >= 20 ? 'done' : b.savingsRate >= 0 ? 'progress' : 'todo', progress: Math.max(0, Math.min(100, Math.round((b.savingsRate / 20) * 100))), stat: `${b.savingsRate}% of income saved`, detail: `${f.data.monthlySip > 0 ? `SIPs are ${inr(f.data.monthlySip)} a month (${Math.round((f.data.monthlySip / b.income) * 100)}% of income). ` : 'No SIP is recorded. '}About 20% is the usual guide.`, basis: 'Budget tracker', route: '/tracker/budget', routeLabel: 'Open budget' }));

  const dated = c.goals.items.filter(g => g.monthlyNeeded).sort((x, y) => (x.monthsLeft ?? 0) - (y.monthsLeft ?? 0));
  if (!c.goals.items.length) out.push(step({ id: 'goals', icon: '🎯', title: 'Goals', status: 'unknown', progress: null, stat: 'No goals recorded', detail: 'Add a goal with an amount and a date to see the monthly saving it needs.', basis: 'Goals tracker', route: '/tracker/goals', routeLabel: 'Add a goal' }));
  else {
    const total = dated.reduce((s, g) => s + (g.monthlyNeeded as number), 0);
    out.push(step({ id: 'goals', icon: '🎯', title: 'Goals', status: 'progress', progress: Math.round(c.goals.avgProgress), stat: `${c.goals.items.length} goal${c.goals.items.length === 1 ? '' : 's'}, ${Math.round(c.goals.avgProgress)}% funded`,
      detail: dated.length ? `Dated goals need ${inr(total)} a month before any return.${b.known ? ` ${inr(Math.max(0, b.saving))} is left after your recorded spending.` : ''}` : 'None has a future date yet.', basis: 'Goals tracker', route: '/tracker/goals', routeLabel: 'Open goals' }));
  }

  const r = retirementOdds(f.retirementStore, f.now, 1000);
  out.push(!r.ok
    ? step({ id: 'independence', icon: '🔥', title: 'Independence and retirement', status: 'unknown', progress: null, stat: 'Planner not set up', detail: `Needs ${r.missing.join(', ')}.`, basis: 'Retirement planner', route: '/tools/retirement', routeLabel: 'Open the Retirement planner' })
    : step({ id: 'independence', icon: '🔥', title: 'Independence and retirement', status: r.pct >= 85 ? 'done' : 'progress', progress: r.pct, stat: `${r.pct}% of simulated futures last`, detail: `${r.verdict.label} ${r.assumptions}`, basis: 'Retirement planner inputs, seeded simulation', route: '/tools/retirement', routeLabel: 'Open the Retirement planner' }));
  void netWorthKnown;
  return out;
}

/** The first step that is not done and not 'na'. 'unknown' counts as next: record it first. */
export const nextStep = (steps: PlanStep[]) => steps.find(s => s.status === 'todo' || s.status === 'progress' || s.status === 'unknown') ?? null;

export interface GoalWithReturn { name: string; monthsLeft: number; remaining: number; noReturn: number; withReturn: number }
/** Monthly saving per dated goal if the person's own savings grow at `ratePct` and the cost rises `inflPct` a year. Both are theirs to enter: null/blank = not applied. */
export function goalsWithReturn(f: ArFacts, ratePct: number | null, inflPct: number | null): GoalWithReturn[] {
  if (ratePct === null || !(ratePct >= 0 && ratePct <= 50)) return [];
  const infl = inflPct !== null && inflPct >= 0 && inflPct <= 50 ? inflPct / 100 : 0;
  const r = ratePct / 100;
  return f.computed.goals.items.filter(g => g.monthlyNeeded && (g.monthsLeft ?? 0) > 0).map(g => {
    const years = (g.monthsLeft as number) / 12;
    const target = g.target * Math.pow(1 + infl, years);
    const net = Math.max(0, target - g.current * Math.pow(1 + r, years));
    return { name: g.name, monthsLeft: g.monthsLeft as number, remaining: g.remaining, noReturn: g.monthlyNeeded as number, withReturn: findSIP(net, years, r) };
  });
}
