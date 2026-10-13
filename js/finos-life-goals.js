/* finos-life-goals.js — the arithmetic behind html/life-goals-planner.html
 *
 *   FinosLifeGoals.plan({ age, income, savings, surplus, retireAge, returnRate, goals })
 *     goals: [{ name, amount (today's rupees), years, inflation (0.06 = 6%) }]
 *     → { efTarget, efDone, efGap, efAlloc, pool, processed[], totalSIPNeeded, sipAvail, feasPct, retireYears }
 *
 * What it assumes (and the page says so):
 *   • An emergency fund of 6 months of spending comes first. Spending is income minus the monthly amount you can invest.
 *   • Only savings above that fund are available for goals, and they are shared out once, nearest goal first. They used
 *     to be credited in full to EVERY goal, and the emergency-fund cash was counted as goal money too, which understated
 *     the monthly SIP needed and overstated feasibility.
 *   • A goal's amount is in today's rupees and is inflated to the year it is needed.
 *   • The monthly SIP is rounded up to the next ₹500; returns are a single assumed annual rate, not a promise.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FinosLifeGoals = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /** Future value of a monthly SIP paid at the start of each month. */
  function sipFV(monthly, months, annualRate) {
    const r = annualRate / 12;
    if (Math.abs(r) < 1e-10) return monthly * months;
    return monthly * ((Math.pow(1 + r, months) - 1) / r) * (1 + r);
  }

  /** Smallest monthly SIP (rounded up to ₹500) that reaches `target` in `years`. */
  function findSIP(target, years, annualRate) {
    if (!(target > 0) || !(years > 0)) return 0;
    const months = years * 12;
    let lo = 100, hi = 10000000;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (sipFV(mid, months, annualRate) < target) lo = mid; else hi = mid;
    }
    return Math.ceil((lo + hi) / 2 / 500) * 500;
  }

  function plan(p) {
    const income = Number(p.income) || 0, surplus = Number(p.surplus) || 0, savings = Math.max(0, Number(p.savings) || 0);
    const returnRate = Number.isFinite(Number(p.returnRate)) && Number(p.returnRate) > 0 ? Number(p.returnRate) : 0.12;
    const age = Number(p.age) || 0, retireAge = Number(p.retireAge) || 58;

    const monthlyExpenses = Math.max(0, income - surplus);
    const efTarget = monthlyExpenses * 6;
    const efDone = Math.min(savings, efTarget);
    const efGap = Math.max(0, efTarget - efDone);
    let pool = Math.max(0, savings - efTarget);           // what is left for goals, shared out once
    const poolStart = pool;

    const goals = (p.goals || []).map((g, i) => ({ ...g, _i: i }));
    const order = [...goals].sort((a, b) => (a.years - b.years) || (a._i - b._i));
    const byIndex = [];
    order.forEach(g => {
      const inflatedTarget = g.amount * Math.pow(1 + g.inflation, g.years);
      const growth = Math.pow(1 + returnRate, g.years);
      // The most that is worth putting into this goal is what grows to its inflated target by the due date.
      const useful = inflatedTarget / growth;
      const fromSavings = Math.min(pool, useful);
      pool -= fromSavings;
      const netTarget = Math.max(0, inflatedTarget - fromSavings * growth);
      const sipNeeded = findSIP(netTarget, g.years, returnRate);
      byIndex[g._i] = {
        name: g.name, amount: g.amount, years: g.years, inflation: g.inflation,
        inflatedTarget, fromSavings, netTarget, sipNeeded, pct80c: sipNeeded * 0.20,
      };
    });
    const processed = byIndex.filter(Boolean);

    const totalSIPNeeded = processed.reduce((s, g) => s + g.sipNeeded, 0);
    const efAlloc = efGap > 0 ? Math.min(surplus * 0.50, efGap / 6) : 0;
    const sipAvail = surplus - efAlloc;
    const feasPct = totalSIPNeeded > 0 ? Math.min(999, Math.round((sipAvail / totalSIPNeeded) * 100)) : 100;
    return {
      efTarget, efDone, efGap, efAlloc, pool: poolStart, poolLeft: pool, processed, totalSIPNeeded, sipAvail, feasPct,
      retireYears: Math.max(1, retireAge - age), returnRate,
    };
  }

  /** Validates the profile form; returns an error message or null. */
  function validateProfile(p) {
    if (!p.age || p.age < 18 || p.age > 80) return 'Please enter a valid age between 18 and 80.';
    if (!p.income || p.income < 1000) return 'Please enter a monthly income of at least ₹1,000.';
    if (!p.surplus || p.surplus <= 0) return 'Please enter how much you can invest each month (must be greater than 0).';
    if (p.surplus >= p.income) return 'Monthly investable amount cannot be greater than or equal to your monthly income.';
    if (p.retireAge <= p.age) return 'Retirement age must be greater than your current age.';
    return null;
  }

  return { sipFV, findSIP, plan, validateProfile };
});
