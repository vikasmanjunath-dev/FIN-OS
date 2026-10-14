// PULSE relevance ranking and "since your last visit" — port of js/arya-pulse-rank.js (the website's rule, line for line).
// The website's PULSE tab renders its widgets in an order that follows what matters for THIS person today: tax widgets in Jan-Mar,
// the debt planner when debt is heavy, the insurance gap when no policy is on file. The phone's PULSE feed uses the same rule so the
// two cannot disagree; __tests__/pulseRank.parity.test.mts runs both on random and edge inputs.
//
// Pure: no storage, no React. The clock is a parameter (the website reads it inside; that is the only difference).
// A reason is a plain-language sentence about THEM, never about the algorithm.

export interface RankCtx {
  month?: number; income?: unknown; expense?: unknown; debt?: unknown; emergencyFund?: unknown; sip?: unknown; goals?: unknown;
  policies?: unknown; holdings?: unknown; txns?: unknown; netWorth?: unknown; gap80c?: unknown; age?: unknown;
  /** 0-100, or null / absent / junk = not taken yet */
  moneyScore?: unknown;
}

/** A sentence that carries its numbers apart from the words, so Hindi can reorder around them. */
export interface TemplateText { key: string; params: Record<string, string | number> }
export interface Ranked { id: string; score: number; reason: string | null; reasonT: TemplateText | null }

/** Widgets that are always first, in this order (orientation + the highest-signal insights). */
export const PINNED: readonly string[] = ['crossPageHUD', 'smartInsightCards'];

/** Default order = the historical order. Ties keep it, so unranked widgets never jump around. */
export const DEFAULT_ORDER: readonly string[] = [
  'crossPageHUD', 'smartInsightCards', 'moneyScore', 'netWorthTimeline', 'wealthFingerprint', 'pageActivityMatrix', 'behavioralDNA',
  'wealthChart', 'goalCards', 'indiaFinCalendar', 'portfolioStressTest', 'compoundRace', 'savingsRateMeter',
  'taxDashboard', 'debtFreedomPlanner', 'scenarioLab', 'inflationEroder', 'monteCarlo', 'timeMachine',
  'peerBenchmark', 'transactionAnalyzer', 'wealthXRay', 'taxOptimizer', 'insuranceGap', 'wealthVelocity',
  'goalProbabilityMatrix', 'newsWidget',
];

interface C {
  month: number; income: number; expense: number; debt: number; emergencyFund: number; sip: number; goals: number; policies: number;
  holdings: number; txns: number; netWorth: number; gap80c: number; age: number; moneyScore: number | null;
}
type Rule = number | { d: number; why: string; t?: TemplateText };

const taxSeason = (m: number) => m >= 1 && m <= 3;            // Jan-Mar: last window to invest for this FY's deductions
// The website's `isFinite(+v)`: null and '' count as 0 there, undefined / NaN / junk as 0 as well, so a missing figure never poisons a sum.
const num = (v: unknown): number => (isFinite(+(v as number)) ? +(v as number) : 0);
/** 0-100, or null when the user has no score. Junk, blanks and null all mean "no score"; nothing is guessed. */
const score100 = (v: unknown): number | null => { const n = parseFloat(v as string); return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null; };
const group = (n: number) => Math.round(n).toLocaleString('en-IN');

/** Each rule returns a number (delta to the base score) or {d, why}. First sentence of the strongest positive `why` wins. */
const RULES: Record<string, (c: C) => Rule> = {
  taxDashboard: c => (taxSeason(c.month) ? { d: 34, why: 'Tax-saving investments for this financial year must be made by 31 March.' } : (c.gap80c > 0 ? 8 : 0)),
  taxOptimizer: c => (taxSeason(c.month)
    ? { d: 32, why: 'The 31 March tax-saving deadline is close — see what deductions you have left.' }
    : (c.gap80c > 0 ? { d: 12, why: `You still have ₹${group(c.gap80c)} of 80C room unused.`, t: { key: 'You still have ₹{n} of 80C room unused.', params: { n: group(c.gap80c) } } } : 0)),
  debtFreedomPlanner: c => {
    if (!(c.debt > 0)) return -28;
    const heavy = c.income > 0 && c.debt / (c.income * 12) > 0.3;
    return heavy
      ? { d: 38, why: 'Your debt is over 30% of a year\'s income — a payoff plan saves the most interest.' }
      : { d: 14, why: 'You have outstanding debt; the order you repay it in changes the interest you pay.' };
  },
  insuranceGap: c => (c.policies === 0 && c.income > 0
    ? { d: 36, why: 'No insurance policy is on file — a cover gap is the one risk that can wipe out years of saving.' }
    : c.policies === 0 ? 10 : -6),
  savingsRateMeter: c => {
    if (!(c.income > 0)) return -5;
    const rate = (c.income - c.expense) / c.income;
    return rate < 0.2
      ? { d: 30, why: `You are saving about ${Math.max(0, Math.round(rate * 100))}% of income; 20%+ is the usual target.`,
          t: { key: 'You are saving about {n}% of income; 20%+ is the usual target.', params: { n: Math.max(0, Math.round(rate * 100)) } } }
      : 0;
  },
  portfolioStressTest: c => (c.holdings > 0 ? { d: 24, why: 'You hold investments — see how a market fall of 20–40% would hit them.' } : -30),
  monteCarlo: c => (c.sip > 0 || c.holdings > 0 ? { d: 18, why: 'You are investing — see the range of outcomes, not just one average.' } : -12),
  goalCards: c => (c.goals > 0 ? { d: 24, why: 'You have goals set — check which are on track.' } : -18),
  goalProbabilityMatrix: c => (c.goals > 0 ? 18 : -22),
  transactionAnalyzer: c => (c.txns > 0 ? { d: 20, why: 'You have logged transactions — see where the money actually goes.' } : -14),
  compoundRace: c => (c.age && c.age < 35 ? 10 : 0),
  wealthXRay: c => (c.netWorth > 0 ? 12 : -10),
  netWorthTimeline: c => (c.netWorth > 0 ? 8 : -12),
  wealthChart: c => (c.netWorth > 0 ? 6 : -10),
  wealthVelocity: c => (c.netWorth > 0 ? 6 : -10),
  indiaFinCalendar: c => (taxSeason(c.month) || c.month === 3 || c.month === 6 || c.month === 9 || c.month === 12 ? { d: 18, why: 'Advance-tax and filing dates are coming up this month.' } : 0),
  inflationEroder: c => (c.emergencyFund > 0 && c.income > 0 && c.emergencyFund / c.income > 12 ? 10 : 0),
  // The Money Score card: an invitation for people who have not taken it, a nudge when it is low, out of the way when it is high.
  moneyScore: c => {
    const s = c.moneyScore;
    if (s === null) return { d: 26, why: 'You have not checked your Money Score yet. It takes about a minute and shows your three best next moves.' };
    if (s < 40) return { d: 40, why: `Your Money Score is ${s} out of 100. See the three moves that would lift it most.`, t: { key: 'Your Money Score is {n} out of 100. See the three moves that would lift it most.', params: { n: s } } };
    if (s < 60) return { d: 28, why: `Your Money Score is ${s} out of 100. Three moves would lift it.`, t: { key: 'Your Money Score is {n} out of 100. Three moves would lift it.', params: { n: s } } };
    return s < 80 ? 8 : -6;
  },
  peerBenchmark: () => 4,
  newsWidget: () => -12,                      // headlines are everywhere else; keep them at the bottom
  scenarioLab: () => 0,
  timeMachine: c => (c.age && c.age < 40 ? 4 : 0),
};

/** Best-first, stable for ties. `now` is only used when ctx.month is absent (the website reads the clock there). */
export function rank(ctx: RankCtx, now: Date = new Date()): Ranked[] {
  const c: C = {
    month: ctx.month || (now.getMonth() + 1), income: num(ctx.income), expense: num(ctx.expense), debt: num(ctx.debt),
    emergencyFund: num(ctx.emergencyFund), sip: num(ctx.sip), goals: num(ctx.goals), policies: num(ctx.policies),
    holdings: num(ctx.holdings), txns: num(ctx.txns), netWorth: num(ctx.netWorth), gap80c: num(ctx.gap80c), age: num(ctx.age),
    moneyScore: score100(ctx.moneyScore),
  };
  const scored = DEFAULT_ORDER.map((id, i) => {
    let score = 50, reason: string | null = null, reasonT: TemplateText | null = null;
    const r: Rule = RULES[id] ? RULES[id](c) : 0;
    if (typeof r === 'number') score += r;
    else if (r) { score += r.d; if (r.d > 0) { reason = r.why; reasonT = r.t || { key: r.why, params: {} }; } }
    score = Math.max(0, Math.min(100, score));
    const pinned = PINNED.includes(id);
    if (pinned) score = 1000 - PINNED.indexOf(id);                 // always first
    return { id, score, reason: pinned ? null : reason, reasonT: pinned ? null : reasonT, _i: i };
  });
  scored.sort((a, b) => b.score - a.score || a._i - b._i);        // stable: ties keep the historical order
  return scored.map(({ id, score, reason, reasonT }) => ({ id, score, reason, reasonT }));
}

/* ── what changed since last time ────────────────────────────────────── */
export interface Snapshot {
  at: number; netWorth: number; debt: number; sip: number; savingsRate: number | null; emergencyMonths: number | null;
  policies: number; goals: number; moneyScore: number | null;
}

/** A small object persisted between visits. `at` is a parameter so tests (and the app) control the clock. */
export function snapshot(ctx: RankCtx, at: number = Date.now()): Snapshot {
  const income = num(ctx.income), expense = num(ctx.expense);
  return {
    at,
    netWorth: num(ctx.netWorth), debt: num(ctx.debt), sip: num(ctx.sip),
    savingsRate: income > 0 ? Math.round(((income - expense) / income) * 100) : null,
    emergencyMonths: expense > 0 ? Math.round((num(ctx.emergencyFund) / expense) * 10) / 10 : null,
    policies: num(ctx.policies), goals: num(ctx.goals), moneyScore: score100(ctx.moneyScore),
  };
}

export interface DiffLine { icon: string; tone: 'good' | 'bad'; text: string; textT: TemplateText }

const inrAbs = (n: number) => '₹' + Math.abs(Math.round(n)).toLocaleString('en-IN');

/** Up to four lines on what moved since `prev`. Nothing under six hours old, so two quick visits never show noise. */
export function diff(prev: Snapshot | null | undefined, cur: Snapshot | null | undefined): DiffLine[] {
  if (!prev || !cur || (cur.at - prev.at) < 6 * 3600 * 1000) return [];
  const out: DiffLine[] = [];
  const dNW = cur.netWorth - prev.netWorth;
  if (prev.netWorth > 0 && Math.abs(dNW) >= Math.max(1000, prev.netWorth * 0.005)) {
    out.push({ icon: dNW > 0 ? '📈' : '📉', tone: dNW > 0 ? 'good' : 'bad',
      text: `Net worth ${dNW > 0 ? 'up' : 'down'} ${inrAbs(dNW)} (${(Math.abs(dNW) / prev.netWorth * 100).toFixed(1)}%)`,
      textT: { key: dNW > 0 ? 'Net worth up {amt} ({pct}%)' : 'Net worth down {amt} ({pct}%)', params: { amt: inrAbs(dNW), pct: (Math.abs(dNW) / prev.netWorth * 100).toFixed(1) } } });
  }
  if (cur.moneyScore != null && prev.moneyScore != null && Math.abs(cur.moneyScore - prev.moneyScore) >= 3) {
    out.push({ icon: '🧭', tone: cur.moneyScore > prev.moneyScore ? 'good' : 'bad', text: `Money Score ${prev.moneyScore} → ${cur.moneyScore}`,
      textT: { key: 'Money Score {a} → {b}', params: { a: prev.moneyScore, b: cur.moneyScore } } });
  }
  const dDebt = cur.debt - prev.debt;
  if (Math.abs(dDebt) >= 1000) {
    out.push({ icon: dDebt < 0 ? '💳' : '⚠️', tone: dDebt < 0 ? 'good' : 'bad', text: `Debt ${dDebt < 0 ? 'down' : 'up'} ${inrAbs(dDebt)}`,
      textT: { key: dDebt < 0 ? 'Debt down {amt}' : 'Debt up {amt}', params: { amt: inrAbs(dDebt) } } });
  }
  if (cur.savingsRate !== null && prev.savingsRate !== null && Math.abs(cur.savingsRate - prev.savingsRate) >= 3) {
    out.push({ icon: '💾', tone: cur.savingsRate > prev.savingsRate ? 'good' : 'bad', text: `Savings rate ${prev.savingsRate}% → ${cur.savingsRate}%`,
      textT: { key: 'Savings rate {a}% → {b}%', params: { a: prev.savingsRate, b: cur.savingsRate } } });
  }
  if (cur.emergencyMonths !== null && prev.emergencyMonths !== null && Math.abs(cur.emergencyMonths - prev.emergencyMonths) >= 0.5) {
    out.push({ icon: '🛟', tone: cur.emergencyMonths > prev.emergencyMonths ? 'good' : 'bad', text: `Emergency fund ${prev.emergencyMonths} → ${cur.emergencyMonths} months`,
      textT: { key: 'Emergency fund {a} → {b} months', params: { a: prev.emergencyMonths, b: cur.emergencyMonths } } });
  }
  if (cur.policies > prev.policies) {
    const n = cur.policies - prev.policies;
    out.push({ icon: '🛡️', tone: 'good', text: `${n} new insurance polic${n > 1 ? 'ies' : 'y'} added`,
      textT: { key: n > 1 ? '{n} new insurance policies added' : '{n} new insurance policy added', params: { n } } });
  }
  if (cur.goals > prev.goals) {
    const n = cur.goals - prev.goals;
    out.push({ icon: '🎯', tone: 'good', text: `${n} new goal${n > 1 ? 's' : ''} added`,
      textT: { key: n > 1 ? '{n} new goals added' : '{n} new goal added', params: { n } } });
  }
  return out.slice(0, 4);
}
