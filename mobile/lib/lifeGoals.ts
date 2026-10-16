// Life goals planner: port of js/finos-life-goals.js (plan(): emergency fund first, then savings shared once nearest goal first,
// a monthly SIP per goal, feasibility) with the data passed in. __tests__/lifeGoals.parity.test.mts runs the website's real file
// against the same inputs.
//
// What it assumes (the screen says so):
//   - an emergency fund of 6 months of spending comes first; spending is income minus the monthly amount you can invest;
//   - only savings above that fund are available for goals, shared out once, nearest goal first;
//   - a goal's amount is in today's rupees and is inflated to the year it is needed;
//   - one assumed yearly return for every goal, the monthly SIP rounded up to the next Rs 500. It is arithmetic, not a forecast.
//
// roadmap() turns the plan into phases. The website's roadmap text mixed arithmetic with fixed advice (premium ranges, fund
// allocations, "60% to debt two years before", tax savings at an assumed slab). Everything here is either a figure worked out from
// the person's own numbers, an assumption the person set, or a pointer to another screen. docs/agent-notes/planners.md lists what was
// removed and why; planners.roadmap.test guards against the removed claims coming back.

export interface GoalIn { name: string; amount: number; years: number; inflation: number }
export interface GoalPlan extends GoalIn {
  inflatedTarget: number; fromSavings: number; netTarget: number; sipNeeded: number;
}
export interface PlanInput {
  age: number; income: number; savings: number; surplus: number; retireAge: number; returnRate: number; goals: GoalIn[];
}
export interface PlanResult {
  efTarget: number; efDone: number; efGap: number; efAlloc: number; pool: number; poolLeft: number;
  processed: GoalPlan[]; totalSIPNeeded: number; sipAvail: number; feasPct: number; retireYears: number;
  returnRate: number; returnAssumed: boolean;
}

/** Future value of a monthly SIP paid at the start of each month. */
export function sipFV(monthly: number, months: number, annualRate: number): number {
  const r = annualRate / 12;
  if (Math.abs(r) < 1e-10) return monthly * months;
  return monthly * ((Math.pow(1 + r, months) - 1) / r) * (1 + r);
}

/** Smallest monthly SIP (rounded up to the next Rs 500) that reaches `target` in `years`. No ceiling; Infinity if the rate cannot be solved. */
export function findSIP(target: number, years: number, annualRate: number): number {
  if (!(target > 0) || !(years > 0)) return 0;
  const months = years * 12, r = annualRate / 12;
  const factor = Math.abs(r) < 1e-10 ? months : ((Math.pow(1 + r, months) - 1) / r) * (1 + r);
  if (!(factor > 0) || !Number.isFinite(factor)) return Infinity;
  return Math.ceil((target / factor / 500) * (1 - 1e-12)) * 500;
}

export function plan(p: PlanInput): PlanResult {
  const income = Number(p.income) || 0, surplus = Number(p.surplus) || 0, savings = Math.max(0, Number(p.savings) || 0);
  const rateGiven = p.returnRate !== undefined && p.returnRate !== null && (p.returnRate as unknown) !== '' && Number.isFinite(Number(p.returnRate)) && Number(p.returnRate) >= 0 && Number(p.returnRate) <= 1;
  const returnRate = rateGiven ? Number(p.returnRate) : 0.12;
  const age = Number(p.age) || 0, retireAge = Number(p.retireAge) || 58;

  const monthlyExpenses = Math.max(0, income - surplus);
  const efTarget = monthlyExpenses * 6;
  const efDone = Math.min(savings, efTarget);
  const efGap = Math.max(0, efTarget - efDone);
  let pool = Math.max(0, savings - efTarget);           // what is left for goals, shared out once
  const poolStart = pool;

  const goals = (p.goals || []).map((g, i) => ({ ...g, _i: i }));
  const order = [...goals].sort((a, b) => (a.years - b.years) || (a._i - b._i));
  const byIndex: GoalPlan[] = [];
  order.forEach(g => {
    const inflatedTarget = g.amount * Math.pow(1 + g.inflation, g.years);
    const growth = Math.pow(1 + returnRate, g.years);
    const useful = inflatedTarget / growth;             // the most worth putting in: what grows to the inflated target by the due date
    const fromSavings = Math.min(pool, useful);
    pool -= fromSavings;
    let netTarget = Math.max(0, inflatedTarget - fromSavings * growth);
    if (netTarget < 0.5) netTarget = 0;                 // fully funded: floating-point dust must not become a Rs 500 SIP
    const sipNeeded = findSIP(netTarget, g.years, returnRate);
    byIndex[g._i] = { name: g.name, amount: g.amount, years: g.years, inflation: g.inflation, inflatedTarget, fromSavings, netTarget, sipNeeded };
  });
  const processed = byIndex.filter(Boolean);

  const totalSIPNeeded = processed.reduce((s, g) => s + g.sipNeeded, 0);
  const efAlloc = efGap > 0 ? Math.min(surplus * 0.50, efGap / 6) : 0;
  const sipAvail = surplus - efAlloc;
  const feasPct = totalSIPNeeded > 0 ? Math.min(999, Math.round((sipAvail / totalSIPNeeded) * 100)) : 100;
  return {
    efTarget, efDone, efGap, efAlloc, pool: poolStart, poolLeft: pool, processed, totalSIPNeeded, sipAvail, feasPct,
    retireYears: Math.max(1, retireAge - age), returnRate, returnAssumed: !rateGiven,
  };
}

/** Validates the profile form; returns an error message or null. */
export function validateProfile(p: { age: number; income: number; surplus: number; retireAge: number; returnRate?: number }): string | null {
  if (!p.age || p.age < 18 || p.age > 80) return 'Please enter a valid age between 18 and 80.';
  if (!p.income || p.income < 1000) return 'Please enter a monthly income of at least ₹1,000.';
  if (!p.surplus || p.surplus <= 0) return 'Please enter how much you can invest each month (must be greater than 0).';
  if (p.surplus >= p.income) return 'Monthly investable amount cannot be greater than or equal to your monthly income.';
  if (p.retireAge <= p.age) return 'Retirement age must be greater than your current age.';
  if (p.returnRate !== undefined && !(Number.isFinite(p.returnRate) && p.returnRate >= 0 && p.returnRate <= 0.5)) return 'Enter the yearly return you expect, from 0% to 50%.';
  return null;
}

/** Checks the goal rows; every goal needs a name, a target and a number of years. Nothing is filled in for the person. */
export function validateGoals(rows: { name: string; amount: number; years: number; inflation: number }[]): { goals: GoalIn[]; error: string | null } {
  const goals: GoalIn[] = [];
  for (let i = 0; i < rows.length; i++) {
    const g = rows[i], label = g.name.trim() || `Goal ${i + 1}`;
    const blank = !g.name.trim() && !(g.amount > 0) && !(g.years > 0);
    if (blank) continue;                                  // an untouched row is ignored, not an error
    if (!(g.amount > 0)) return { goals: [], error: `"${label}" needs a target amount.` };
    if (!(g.years > 0) || g.years > 60) return { goals: [], error: `"${label}" needs a time frame in years (up to 60).` };
    if (!(Number.isFinite(g.inflation) && g.inflation >= 0 && g.inflation <= 0.5)) return { goals: [], error: `"${label}" needs a yearly inflation from 0% to 50%.` };
    goals.push({ name: g.name.trim() || label, amount: g.amount, years: g.years, inflation: g.inflation });
  }
  if (!goals.length) return { goals: [], error: 'Add at least one goal with a target amount and a time frame.' };
  return { goals, error: null };
}

// ── Roadmap ───────────────────────────────────────────────────────────────────────────────────────

export type ItemKind = 'figure' | 'assumption' | 'pointer';
export interface RoadmapItem { text: string; kind: ItemKind; href?: string }
export interface Phase { id: string; title: string; when: string; summary: string; items: RoadmapItem[] }
export interface RoadmapRecorded { termCover?: number | null; healthCover?: number | null; dependents?: number | null }

const L = (n: number) => {
  const a = Math.abs(Math.round(n)), s = n < 0 ? '-' : '';
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(2)} L`;
  return `${s}₹${a.toLocaleString('en-IN')}`;
};
const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;
const yrs = (n: number) => (Math.abs(n - Math.round(n)) < 0.05 ? `${Math.round(n)}` : n.toFixed(1));

/** Months until a monthly-compounded corpus crosses `goal`, starting from `start` and adding `monthly` at the start of each month. */
export function monthsToReach(goal: number, start: number, monthly: number, annualRate: number, capMonths = 720): number | null {
  if (start >= goal) return 0;
  const r = annualRate / 12;
  let v = start;
  for (let m = 1; m <= capMonths; m++) {
    v = (v + monthly) * (1 + r);
    if (v >= goal) return m;
  }
  return null;
}

export const WEALTH_MILESTONES = [1_000_000, 2_500_000, 5_000_000, 10_000_000, 50_000_000];

export function roadmap(i: PlanInput, p: PlanResult, rec: RoadmapRecorded = {}): Phase[] {
  const phases: Phase[] = [];
  const rate = p.returnRate;
  const monthlySpend = Math.max(0, i.income - i.surplus);

  // 1. Emergency fund and the cover that protects the plan
  const f: RoadmapItem[] = [];
  if (p.efTarget > 0) {
    f.push({ kind: 'figure', text: `Emergency fund target: ${L(p.efTarget)} (6 months of spending, taking everything you do not invest as spending, ${L(monthlySpend)} a month). You have ${L(p.efDone)} of it (${Math.round((p.efDone / p.efTarget) * 100)}%).` });
    if (p.efGap > 0 && p.efAlloc > 0) {
      f.push({ kind: 'figure', text: `Setting aside ${L(p.efAlloc)} a month (this plan uses up to half of what you can invest, spread over about 6 months) closes the ${L(p.efGap)} gap in about ${Math.max(1, Math.ceil(p.efGap / p.efAlloc))} months.` });
    } else if (p.efGap <= 0) f.push({ kind: 'figure', text: 'Your emergency fund is complete on these figures.' });
  }
  const termRule = 10 * 12 * i.income;
  if (rec.dependents === 0) f.push({ kind: 'assumption', text: `You have recorded no dependents. If that changes, a common rule of thumb is term cover of about 10 times yearly income, ${L(termRule)}.` });
  else f.push({ kind: 'assumption', text: `If anyone depends on your income, a common rule of thumb is term cover of about 10 times yearly income, ${L(termRule)}.${rec.termCover && rec.termCover > 0 ? ` You have recorded ${L(rec.termCover)}.` : rec.termCover === 0 ? ' No term cover is recorded.' : ''}` });
  f.push({ kind: 'figure', text: `Each month ${L(i.surplus)} can be invested. ${p.efAlloc > 0 ? `${L(p.efAlloc)} of it goes to the fund first, leaving ${L(p.sipAvail)} for goals.` : `All of it is available for goals.`} Your goals need ${L(p.totalSIPNeeded)} a month in total.` });
  f.push({ kind: 'pointer', text: 'Check your cover against your own numbers in the insurance tracker and the Money Score.', href: '/tracker/insurance' });
  phases.push({ id: 'foundation', title: 'Foundation: emergency fund and cover', when: 'Now', summary: 'The plan keeps six months of spending safe before it counts any savings toward goals.', items: f });

  // 2. After the fund is in place
  const sorted = [...p.processed].sort((a, b) => a.years - b.years);
  const a: RoadmapItem[] = [];
  if (p.efAlloc > 0) a.push({ kind: 'figure', text: `Once the fund is complete, the ${L(p.efAlloc)} a month that went to it is free. The amount available for goals rises from ${L(p.sipAvail)} to ${L(i.surplus)}.` });
  const nearest = sorted.find(g => g.sipNeeded > 0);
  if (nearest) a.push({ kind: 'figure', text: `${nearest.name} is due first, in ${yrs(nearest.years)} year${nearest.years === 1 ? '' : 's'} (age ${Math.round(i.age + nearest.years)}). When it is met its ${L(nearest.sipNeeded)} a month is free for the other goals.` });
  a.push({ kind: 'assumption', text: `Investing the full ${L(i.surplus)} a month at your assumed ${pct(rate)} a year would grow to about ${L(sipFV(i.surplus, 60, rate))} in 5 years. That is a projection at a rate you chose, not a forecast.` });
  if (p.pool > 0) a.push({ kind: 'figure', text: `Savings above the emergency fund (${L(p.pool)}) are shared out once, nearest goal first, and ${L(p.pool - p.poolLeft)} of it is used.` });
  phases.push({ id: 'acceleration', title: 'After the fund is in place', when: 'Once the emergency fund is complete', summary: 'The money that built the fund moves to your goals.', items: a });

  // 3. One phase per goal, nearest first
  sorted.forEach((g, idx) => {
    const items: RoadmapItem[] = [];
    items.push({ kind: 'figure', text: `${L(g.amount)} in today's rupees becomes ${L(g.inflatedTarget)} in ${yrs(g.years)} year${g.years === 1 ? '' : 's'} at ${pct(g.inflation)} a year of inflation.` });
    if (g.fromSavings > 0) items.push({ kind: 'figure', text: `${L(g.fromSavings)} of your savings above the emergency fund is put toward it, which at ${pct(rate)} grows to ${L(g.fromSavings * Math.pow(1 + rate, g.years))}.` });
    if (g.sipNeeded > 0) {
      items.push({ kind: 'figure', text: `Monthly SIP needed: ${L(g.sipNeeded)}, at an assumed ${pct(rate)} a year.` });
      const low = Math.max(0, rate - 0.03);
      if (low < rate) {
        const sipLow = findSIP(g.netTarget, g.years, low);
        items.push({ kind: 'assumption', text: `If the return were ${pct(low)} instead, the SIP needed would be ${L(sipLow)}.${g.years <= 5 ? ' Goals only a few years away are more exposed to a poor year, so this figure is worth planning around.' : ''}` });
      }
    } else {
      items.push({ kind: 'figure', text: 'Your savings fully fund this goal on these assumptions, so it needs no monthly SIP.' });
    }
    items.push({ kind: 'figure', text: `Due at age ${Math.round(i.age + g.years)}${g.sipNeeded > 0 ? `; from then ${L(g.sipNeeded)} a month is free for other goals.` : '.'}` });
    if (/retire/i.test(g.name)) items.push({ kind: 'pointer', text: 'The Retirement planner works out how much you need and the odds of getting there.', href: '/tools/retirement' });
    phases.push({
      id: `goal-${idx}`, title: g.name, when: `${yrs(g.years)} year${g.years === 1 ? '' : 's'} from now (age ${Math.round(i.age + g.years)})`,
      summary: g.sipNeeded > 0 ? `${L(g.inflatedTarget)} needed; ${L(g.sipNeeded)} a month at ${pct(rate)}.` : `${L(g.inflatedTarget)} needed; covered by savings.`, items,
    });
  });

  // 4. Milestones if the whole investable amount is invested
  const m: RoadmapItem[] = [];
  const start = Math.max(0, i.savings);
  WEALTH_MILESTONES.forEach(goal => {
    const months = monthsToReach(goal, start, i.surplus, rate);
    if (months === null) { m.push({ kind: 'figure', text: `${L(goal)}: not reached within 60 years on these figures.` }); return; }
    if (months === 0) { m.push({ kind: 'figure', text: `${L(goal)}: already reached with your savings.` }); return; }
    m.push({ kind: 'figure', text: `${L(goal)}: in about ${yrs(months / 12)} years (age ${Math.round(i.age + months / 12)}).` });
  });
  phases.push({
    id: 'milestones', title: 'Wealth milestones', when: 'If you invest the full amount',
    summary: `Starting from ${L(start)} of savings and investing ${L(i.surplus)} every month at an assumed ${pct(rate)} a year, with nothing withdrawn.`, items: m,
  });

  // 5. Retirement
  const r: RoadmapItem[] = [
    { kind: 'figure', text: `Retirement at age ${Math.round(i.retireAge)} is ${Math.max(1, Math.round(i.retireAge - i.age))} years away.` },
    { kind: 'pointer', text: 'The Retirement planner estimates the corpus you need, what your EPF, NPS and PPF are likely to give, and the chance of it lasting.', href: '/tools/retirement' },
  ];
  phases.push({ id: 'retirement', title: 'Retirement', when: `Age ${Math.round(i.retireAge)}`, summary: 'This planner does not size a retirement corpus unless you add it as a goal.', items: r });

  return phases;
}

/** What the website saves after a roadmap: totals other screens (and Arya) read. */
export function summaryTotals(p: PlanResult) {
  return {
    monthlySip: Math.round(p.totalSIPNeeded),
    targetTotal: Math.round(p.processed.reduce((s, g) => s + (g.inflatedTarget || 0), 0)),
    count: p.processed.length,
  };
}
