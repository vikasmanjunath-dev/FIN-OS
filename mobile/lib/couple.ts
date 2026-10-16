// Couple finance, on one phone. The website's page (html/couple-finance.html) shows what a server (alerts/alert-engine.py,
// /couple/overview) works out for two linked accounts; there is no browser-side logic to port. This module is the arithmetic that
// server does that is sound (joint income, spending and savings, the share each person earns, joint goals with both contributions),
// plus a proportional split of shared bills, which the website does not have. What is NOT carried over, and why:
//   - the server counts ANY positive transaction amount as income (alerts/health_score.py _monthly_income), so it can double count;
//   - its "top 20% of couples" message has no source behind it;
//   - it halves every spending figure on the assumption of a 60-day window with a 100-row cap.
// Both people's figures are typed on this phone and stay on it. Nothing is a default: an unknown figure is null, never 0.

export interface Person { name: string; income: number | null; expense: number | null }
export type Payer = 'a' | 'b' | 'joint';
export interface SharedExpense { id: string; label: string; amount: number; paidBy: Payer }
export interface JointGoal { id: string; title: string; target: number; current: number; targetDate: string | null; contribA: number; contribB: number }
export interface CoupleState { a: Person; b: Person; shared: SharedExpense[]; goals: JointGoal[] }

export const EMPTY_COUPLE: CoupleState = { a: { name: '', income: null, expense: null }, b: { name: '', income: null, expense: null }, shared: [], goals: [] };

/** The website's server flags a spending category that is more than this share of joint income. */
export const LARGE_ITEM_SHARE = 0.15;

const pos = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

export interface Overview {
  incomeA: number | null; incomeB: number | null; jointIncome: number | null;
  expenseA: number | null; expenseB: number | null; jointExpense: number | null;
  savingsA: number | null; savingsB: number | null; jointSavings: number | null;
  savingsRate: number | null;            // jointSavings / jointIncome, as a fraction; null while either input is unknown
  shareA: number | null; shareB: number | null;   // each person's share of joint income
}

export function overview(a: Person, b: Person): Overview {
  const ia = pos(a.income), ib = pos(b.income), ea = pos(a.expense), eb = pos(b.expense);
  const both = (x: number | null, y: number | null) => (x !== null && y !== null ? x + y : null);
  const diff = (i: number | null, e: number | null) => (i !== null && e !== null ? i - e : null);
  const ji = both(ia, ib), je = both(ea, eb);
  const js = ji !== null && je !== null ? ji - je : null;
  return {
    incomeA: ia, incomeB: ib, jointIncome: ji, expenseA: ea, expenseB: eb, jointExpense: je,
    savingsA: diff(ia, ea), savingsB: diff(ib, eb), jointSavings: js,
    savingsRate: js !== null && ji !== null && ji > 0 ? js / ji : null,
    shareA: ji !== null && ji > 0 ? (ia as number) / ji : null, shareB: ji !== null && ji > 0 ? (ib as number) / ji : null,
  };
}

export interface Split {
  total: number;                         // bills paid by a or b (joint-account bills are listed apart and not settled)
  jointAccount: number;
  paidA: number; paidB: number;
  fairA: number | null; fairB: number | null;       // proportional to income; null while incomes are unknown
  equalA: number; equalB: number;                    // 50:50, for comparison
  /** Positive: B should pay A this much to even out; negative: A should pay B. Null while incomes are unknown. */
  settle: number | null;
  settleEqual: number;
  largeItems: { id: string; label: string; amount: number; share: number }[];
}

export function splitShared(shared: SharedExpense[], a: Person, b: Person): Split {
  const o = overview(a, b);
  const items = shared.filter(s => Number.isFinite(s.amount) && s.amount > 0);
  const paidA = items.filter(s => s.paidBy === 'a').reduce((t, s) => t + s.amount, 0);
  const paidB = items.filter(s => s.paidBy === 'b').reduce((t, s) => t + s.amount, 0);
  const jointAccount = items.filter(s => s.paidBy === 'joint').reduce((t, s) => t + s.amount, 0);
  const total = paidA + paidB;
  const fairA = o.shareA !== null ? total * o.shareA : null;
  const fairB = o.shareB !== null ? total * o.shareB : null;
  const settle = fairB !== null ? fairB - paidB : null;       // what B should have paid minus what B paid
  const largeItems = o.jointIncome !== null && o.jointIncome > 0
    ? items.filter(s => s.amount / (o.jointIncome as number) > LARGE_ITEM_SHARE).map(s => ({ id: s.id, label: s.label, amount: s.amount, share: s.amount / (o.jointIncome as number) }))
    : [];
  return { total, jointAccount, paidA, paidB, fairA, fairB, equalA: total / 2, equalB: total / 2, settle, settleEqual: total / 2 - paidB, largeItems };
}

export type GoalStatus = 'done' | 'on-track' | 'short' | 'no-contribution' | 'past-date' | 'no-date';
export interface GoalView {
  id: string; title: string; pct: number; remaining: number; monthly: number;
  monthsToFinish: number | null;         // at the current contributions, with no growth
  monthsLeft: number | null; requiredMonthly: number | null; gap: number | null;
  status: GoalStatus;
  suggestedA: number | null; suggestedB: number | null;      // the required monthly split by income share
}

export function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

/** Contributions are added up with no interest: a plain savings pace, which the screen says. */
export function goalView(g: JointGoal, a: Person, b: Person, now: Date): GoalView {
  const target = Math.max(0, g.target), current = Math.max(0, g.current);
  const remaining = Math.max(0, target - current);
  const monthly = Math.max(0, g.contribA) + Math.max(0, g.contribB);
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  const monthsToFinish = remaining === 0 ? 0 : monthly > 0 ? Math.ceil(remaining / monthly) : null;
  let monthsLeft: number | null = null;
  if (g.targetDate) {
    const t = new Date(`${g.targetDate}T00:00:00`);
    if (!Number.isNaN(t.getTime())) monthsLeft = monthsBetween(now, t);
  }
  const o = overview(a, b);
  let status: GoalStatus, requiredMonthly: number | null = null, gap: number | null = null;
  if (remaining === 0) status = 'done';
  else if (monthsLeft === null) status = monthly > 0 ? 'no-date' : 'no-contribution';
  else if (monthsLeft <= 0) status = 'past-date';
  else {
    requiredMonthly = remaining / monthsLeft;
    gap = requiredMonthly - monthly;
    status = monthly <= 0 ? 'no-contribution' : gap <= 0 ? 'on-track' : 'short';
  }
  return {
    id: g.id, title: g.title, pct, remaining, monthly, monthsToFinish, monthsLeft, requiredMonthly, gap, status,
    suggestedA: requiredMonthly !== null && o.shareA !== null ? requiredMonthly * o.shareA : null,
    suggestedB: requiredMonthly !== null && o.shareB !== null ? requiredMonthly * o.shareB : null,
  };
}

/** Reads whatever is stored and returns a clean state (anything unusable becomes unknown / dropped). */
export function normaliseState(raw: unknown): CoupleState {
  const o: any = raw && typeof raw === 'object' ? raw : {};
  const person = (p: any): Person => ({
    name: typeof p?.name === 'string' ? p.name.slice(0, 40) : '',
    income: pos(typeof p?.income === 'number' ? p.income : null), expense: pos(typeof p?.expense === 'number' ? p.expense : null),
  });
  const str = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');
  const shared: SharedExpense[] = (Array.isArray(o.shared) ? o.shared : []).slice(0, 50).flatMap((s: any, i: number) => {
    const amount = Number(s?.amount);
    if (!(amount > 0) || !Number.isFinite(amount)) return [];
    const paidBy: Payer = s.paidBy === 'a' || s.paidBy === 'b' || s.paidBy === 'joint' ? s.paidBy : 'joint';
    return [{ id: str(s.id, 40) || `s${i}`, label: str(s.label, 60), amount, paidBy }];
  });
  const goals: JointGoal[] = (Array.isArray(o.goals) ? o.goals : []).slice(0, 30).flatMap((g: any, i: number) => {
    const target = Number(g?.target);
    if (!(target > 0) || !Number.isFinite(target)) return [];
    const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : 0; };
    const date = typeof g.targetDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(g.targetDate) ? g.targetDate : null;
    return [{ id: str(g.id, 40) || `g${i}`, title: str(g.title, 60), target, current: n(g.current), targetDate: date, contribA: n(g.contribA), contribB: n(g.contribB) }];
  });
  return { a: person(o.a), b: person(o.b), shared, goals };
}
