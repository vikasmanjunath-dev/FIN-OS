/**
 * PULSE relevance ranking + "since your last visit".   (v1.0)
 *
 * The PULSE tab renders ~26 widgets in a fixed order. Most users only scroll the first few, so the
 * order should follow what matters for THIS person today: tax widgets in Jan–Mar, the debt planner when
 * debt is heavy, the insurance gap when no policy is on file, the stress test only if there are holdings…
 *
 *   AryaPulseRank.rank(ctx)           → [{id, score, reason|null}] best-first (stable for ties)
 *   AryaPulseRank.snapshot(ctx)       → small object persisted between visits
 *   AryaPulseRank.diff(prev, cur)     → [{icon, text, tone}]  what moved since the last snapshot
 *
 * ctx: { month(1-12), income, expense, debt, emergencyFund, sip, goals(n), policies(n), holdings(₹),
 *        txns(n), netWorth, gap80c(₹), age, retireAge }
 * Pure: no DOM, no storage. Scores are 0–100; `reason` is shown to the user on the top picks, so it
 * must be a plain-language sentence about THEM, never about the algorithm.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AryaPulseRank = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /** Widgets that are always first, in this order (orientation + the highest-signal insights). */
  const PINNED = ['crossPageHUD', 'smartInsightCards'];

  /** Default order = the historical order. Ties keep it, so unranked widgets never jump around. */
  const DEFAULT_ORDER = [
    'crossPageHUD', 'smartInsightCards', 'netWorthTimeline', 'wealthFingerprint', 'pageActivityMatrix', 'behavioralDNA',
    'wealthChart', 'goalCards', 'indiaFinCalendar', 'portfolioStressTest', 'compoundRace', 'savingsRateMeter',
    'taxDashboard', 'debtFreedomPlanner', 'scenarioLab', 'inflationEroder', 'monteCarlo', 'timeMachine',
    'peerBenchmark', 'transactionAnalyzer', 'wealthXRay', 'taxOptimizer', 'insuranceGap', 'wealthVelocity',
    'goalProbabilityMatrix', 'newsWidget',
  ];

  const taxSeason = (m) => m >= 1 && m <= 3;            // Jan–Mar: last window to invest for this FY's deductions
  const num = (v) => (isFinite(+v) ? +v : 0);

  /** Each rule returns a number (delta to the base score) or {d, why}. First sentence of the strongest positive `why` wins. */
  const RULES = {
    taxDashboard:  (c) => taxSeason(c.month) ? { d: 34, why: 'Tax-saving investments for this financial year must be made by 31 March.' } : (c.gap80c > 0 ? 8 : 0),
    taxOptimizer:  (c) => taxSeason(c.month) ? { d: 32, why: 'The 31 March tax-saving deadline is close — see what deductions you have left.' } : (c.gap80c > 0 ? { d: 12, why: `You still have ₹${Math.round(c.gap80c).toLocaleString('en-IN')} of 80C room unused.` } : 0),
    debtFreedomPlanner: (c) => {
      if (!(c.debt > 0)) return -28;
      const heavy = c.income > 0 && c.debt / (c.income * 12) > 0.3;
      return heavy ? { d: 38, why: 'Your debt is over 30% of a year\'s income — a payoff plan saves the most interest.' } : { d: 14, why: 'You have outstanding debt; the order you repay it in changes the interest you pay.' };
    },
    insuranceGap:  (c) => (c.policies === 0 && c.income > 0 ? { d: 36, why: 'No insurance policy is on file — a cover gap is the one risk that can wipe out years of saving.' } : c.policies === 0 ? 10 : -6),
    savingsRateMeter: (c) => {
      if (!(c.income > 0)) return -5;
      const rate = (c.income - c.expense) / c.income;
      return rate < 0.2 ? { d: 30, why: `You are saving about ${Math.max(0, Math.round(rate * 100))}% of income; 20%+ is the usual target.` } : 0;
    },
    portfolioStressTest: (c) => (c.holdings > 0 ? { d: 24, why: 'You hold investments — see how a market fall of 20–40% would hit them.' } : -30),
    monteCarlo:    (c) => (c.sip > 0 || c.holdings > 0 ? { d: 18, why: 'You are investing — see the range of outcomes, not just one average.' } : -12),
    goalCards:     (c) => (c.goals > 0 ? { d: 24, why: 'You have goals set — check which are on track.' } : -18),
    goalProbabilityMatrix: (c) => (c.goals > 0 ? 18 : -22),
    transactionAnalyzer: (c) => (c.txns > 0 ? { d: 20, why: 'You have logged transactions — see where the money actually goes.' } : -14),
    compoundRace:  (c) => (c.age && c.age < 35 ? 10 : 0),
    wealthXRay:    (c) => (c.netWorth > 0 ? 12 : -10),
    netWorthTimeline: (c) => (c.netWorth > 0 ? 8 : -12),
    wealthChart:   (c) => (c.netWorth > 0 ? 6 : -10),
    wealthVelocity: (c) => (c.netWorth > 0 ? 6 : -10),
    indiaFinCalendar: (c) => (taxSeason(c.month) || c.month === 3 || c.month === 6 || c.month === 9 || c.month === 12 ? { d: 18, why: 'Advance-tax and filing dates are coming up this month.' } : 0),
    inflationEroder: (c) => (c.emergencyFund > 0 && c.income > 0 && c.emergencyFund / c.income > 12 ? 10 : 0),
    peerBenchmark: () => 4,
    newsWidget:    () => -12,                      // headlines are everywhere else; keep them at the bottom
    scenarioLab:   () => 0,
    timeMachine:   (c) => (c.age && c.age < 40 ? 4 : 0),
  };

  function rank(ctx) {
    const c = {
      month: ctx.month || (new Date().getMonth() + 1), income: num(ctx.income), expense: num(ctx.expense), debt: num(ctx.debt),
      emergencyFund: num(ctx.emergencyFund), sip: num(ctx.sip), goals: num(ctx.goals), policies: num(ctx.policies),
      holdings: num(ctx.holdings), txns: num(ctx.txns), netWorth: num(ctx.netWorth), gap80c: num(ctx.gap80c), age: num(ctx.age),
    };
    const scored = DEFAULT_ORDER.map((id, i) => {
      let score = 50, reason = null;
      const r = RULES[id] ? RULES[id](c) : 0;
      if (typeof r === 'number') score += r;
      else if (r) { score += r.d; if (r.d > 0) reason = r.why; }
      score = Math.max(0, Math.min(100, score));
      if (PINNED.includes(id)) score = 1000 - PINNED.indexOf(id);   // always first
      return { id, score, reason: PINNED.includes(id) ? null : reason, _i: i };
    });
    scored.sort((a, b) => b.score - a.score || a._i - b._i);        // stable: ties keep the historical order
    return scored.map(({ id, score, reason }) => ({ id, score, reason }));
  }

  /* ── what changed since last time ────────────────────────────────────── */
  function snapshot(ctx) {
    const income = num(ctx.income), expense = num(ctx.expense);
    return {
      at: Date.now(),
      netWorth: num(ctx.netWorth), debt: num(ctx.debt), sip: num(ctx.sip),
      savingsRate: income > 0 ? Math.round(((income - expense) / income) * 100) : null,
      emergencyMonths: expense > 0 ? Math.round((num(ctx.emergencyFund) / expense) * 10) / 10 : null,
      policies: num(ctx.policies), goals: num(ctx.goals),
    };
  }

  const inr = (n) => '₹' + Math.abs(Math.round(n)).toLocaleString('en-IN');
  function diff(prev, cur) {
    if (!prev || !cur || (cur.at - prev.at) < 6 * 3600 * 1000) return [];    // too soon to be meaningful
    const out = [];
    const dNW = cur.netWorth - prev.netWorth;
    if (prev.netWorth > 0 && Math.abs(dNW) >= Math.max(1000, prev.netWorth * 0.005))
      out.push({ icon: dNW > 0 ? '📈' : '📉', tone: dNW > 0 ? 'good' : 'bad', text: `Net worth ${dNW > 0 ? 'up' : 'down'} ${inr(dNW)} (${(Math.abs(dNW) / prev.netWorth * 100).toFixed(1)}%)` });
    const dDebt = cur.debt - prev.debt;
    if (Math.abs(dDebt) >= 1000) out.push({ icon: dDebt < 0 ? '💳' : '⚠️', tone: dDebt < 0 ? 'good' : 'bad', text: `Debt ${dDebt < 0 ? 'down' : 'up'} ${inr(dDebt)}` });
    if (cur.savingsRate !== null && prev.savingsRate !== null && Math.abs(cur.savingsRate - prev.savingsRate) >= 3)
      out.push({ icon: '💾', tone: cur.savingsRate > prev.savingsRate ? 'good' : 'bad', text: `Savings rate ${prev.savingsRate}% → ${cur.savingsRate}%` });
    if (cur.emergencyMonths !== null && prev.emergencyMonths !== null && Math.abs(cur.emergencyMonths - prev.emergencyMonths) >= 0.5)
      out.push({ icon: '🛟', tone: cur.emergencyMonths > prev.emergencyMonths ? 'good' : 'bad', text: `Emergency fund ${prev.emergencyMonths} → ${cur.emergencyMonths} months` });
    if (cur.policies > prev.policies) out.push({ icon: '🛡️', tone: 'good', text: `${cur.policies - prev.policies} new insurance polic${cur.policies - prev.policies > 1 ? 'ies' : 'y'} added` });
    if (cur.goals > prev.goals) out.push({ icon: '🎯', tone: 'good', text: `${cur.goals - prev.goals} new goal${cur.goals - prev.goals > 1 ? 's' : ''} added` });
    return out.slice(0, 4);
  }

  return { rank, snapshot, diff, DEFAULT_ORDER, PINNED };
});
