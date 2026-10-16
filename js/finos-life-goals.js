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
 *   • A return of 0% is honoured (it used to be read as "not given" and turned into 12%); `returnAssumed` is true only when no
 *     usable rate was passed. A goal the savings fully fund needs no SIP (rounding dust used to show ₹500), and a very large
 *     target is no longer capped at ₹1 crore a month.
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

  /**
   * Smallest monthly SIP (rounded up to the next ₹500) that reaches `target` in `years`.
   * Closed form of sipFV(sip) = target. It used to bisect between ₹100 and ₹1 crore a month, which silently capped the answer at ₹1 crore
   * for a very large target; this has no cap. A rate that cannot be solved (a monthly rate of -100% or worse) returns Infinity rather than a number.
   */
  function findSIP(target, years, annualRate) {
    if (!(target > 0) || !(years > 0)) return 0;
    const months = years * 12, r = annualRate / 12;
    const factor = Math.abs(r) < 1e-10 ? months : ((Math.pow(1 + r, months) - 1) / r) * (1 + r);
    if (!(factor > 0) || !Number.isFinite(factor)) return Infinity;
    // the tiny relative allowance keeps an exact multiple of 500 (e.g. 10000.0000000001) from rounding up a whole step
    return Math.ceil((target / factor / 500) * (1 - 1e-12)) * 500;
  }

  function plan(p) {
    const income = Number(p.income) || 0, surplus = Number(p.surplus) || 0, savings = Math.max(0, Number(p.savings) || 0);
    // 0% is a real choice (it used to be read as "not given" and turned into 12%). Only a missing or unusable rate falls back, and then
    // `returnAssumed` says so.
    const rateGiven = p.returnRate !== undefined && p.returnRate !== null && p.returnRate !== '' && Number.isFinite(Number(p.returnRate)) && Number(p.returnRate) >= 0 && Number(p.returnRate) <= 1;
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
    const byIndex = [];
    order.forEach(g => {
      const inflatedTarget = g.amount * Math.pow(1 + g.inflation, g.years);
      const growth = Math.pow(1 + returnRate, g.years);
      // The most that is worth putting into this goal is what grows to its inflated target by the due date.
      const useful = inflatedTarget / growth;
      const fromSavings = Math.min(pool, useful);
      pool -= fromSavings;
      let netTarget = Math.max(0, inflatedTarget - fromSavings * growth);
      if (netTarget < 0.5) netTarget = 0;   // a goal the savings fully fund: floating-point dust must not become a ₹500 SIP
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
      retireYears: Math.max(1, retireAge - age), returnRate, returnAssumed: !rateGiven,
    };
  }

  /** Validates the profile form; returns an error message or null. */
  function validateProfile(p) {
    if (!p.age || p.age < 18 || p.age > 80) return 'Please enter a valid age between 18 and 80.';
    if (!p.income || p.income < 1000) return 'Please enter a monthly income of at least ₹1,000.';
    if (!p.surplus || p.surplus <= 0) return 'Please enter how much you can invest each month (must be greater than 0).';
    if (p.surplus >= p.income) return 'Monthly investable amount cannot be greater than or equal to your monthly income.';
    if (p.retireAge <= p.age) return 'Retirement age must be greater than your current age.';
    // optional so older callers still work; when given it must be a real percentage (0% is allowed)
    if (p.returnRate !== undefined && !(Number.isFinite(p.returnRate) && p.returnRate >= 0 && p.returnRate <= 0.5)) return 'Enter the yearly return you expect, from 0% to 50%.';
    return null;
  }

  const L = (n) => {
    const a = Math.abs(Math.round(n)), s = n < 0 ? '-' : '';
    if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(2)} Cr`;
    if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(2)} L`;
    return `${s}₹${a.toLocaleString('en-IN')}`;
  };
  const pct = (x) => `${Math.round(x * 1000) / 10}%`;
  const yrs = (n) => (Math.abs(n - Math.round(n)) < 0.05 ? `${Math.round(n)}` : n.toFixed(1));

  /** Months until a monthly-compounded corpus crosses `goal`, starting from `start` and adding `monthly` at the start of each month. */
  function monthsToReach(goal, start, monthly, annualRate, capMonths) {
    capMonths = capMonths || 720;
    if (start >= goal) return 0;
    const r = annualRate / 12;
    let v = start;
    for (let m = 1; m <= capMonths; m++) {
      v = (v + monthly) * (1 + r);
      if (v >= goal) return m;
    }
    return null;
  }

  const WEALTH_MILESTONES = [1_000_000, 2_500_000, 5_000_000, 10_000_000, 50_000_000];

  function roadmap(i, p, rec) {
    rec = rec || {};
    const phases = [];
    const rate = p.returnRate;
    const monthlySpend = Math.max(0, i.income - i.surplus);

    // 1. Emergency fund and the cover that protects the plan
    const f = [];
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
    f.push({ kind: 'pointer', text: 'Check your cover against your own numbers in the insurance tracker and the Money Score.', href: 'insurance-hub.html' });
    phases.push({ id: 'foundation', title: 'Foundation: emergency fund and cover', when: 'Now', summary: 'The plan keeps six months of spending safe before it counts any savings toward goals.', items: f });

    // 2. After the fund is in place
    const sorted = [...p.processed].sort((a, b) => a.years - b.years);
    const a = [];
    if (p.efAlloc > 0) a.push({ kind: 'figure', text: `Once the fund is complete, the ${L(p.efAlloc)} a month that went to it is free. The amount available for goals rises from ${L(p.sipAvail)} to ${L(i.surplus)}.` });
    const nearest = sorted.find(g => g.sipNeeded > 0);
    if (nearest) a.push({ kind: 'figure', text: `${nearest.name} is due first, in ${yrs(nearest.years)} year${nearest.years === 1 ? '' : 's'} (age ${Math.round(i.age + nearest.years)}). When it is met its ${L(nearest.sipNeeded)} a month is free for the other goals.` });
    a.push({ kind: 'assumption', text: `Investing the full ${L(i.surplus)} a month at your assumed ${pct(rate)} a year would grow to about ${L(sipFV(i.surplus, 60, rate))} in 5 years. That is a projection at a rate you chose, not a forecast.` });
    if (p.pool > 0) a.push({ kind: 'figure', text: `Savings above the emergency fund (${L(p.pool)}) are shared out once, nearest goal first, and ${L(p.pool - p.poolLeft)} of it is used.` });
    phases.push({ id: 'acceleration', title: 'After the fund is in place', when: 'Once the emergency fund is complete', summary: 'The money that built the fund moves to your goals.', items: a });

    // 3. One phase per goal, nearest first
    sorted.forEach((g, idx) => {
      const items = [];
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
      if (/retire/i.test(g.name)) items.push({ kind: 'pointer', text: 'The Retirement planner works out how much you need and the odds of getting there.', href: 'retirement-planner.html' });
      phases.push({
        id: `goal-${idx}`, title: g.name, when: `${yrs(g.years)} year${g.years === 1 ? '' : 's'} from now (age ${Math.round(i.age + g.years)})`,
        summary: g.sipNeeded > 0 ? `${L(g.inflatedTarget)} needed; ${L(g.sipNeeded)} a month at ${pct(rate)}.` : `${L(g.inflatedTarget)} needed; covered by savings.`, items,
      });
    });

    // 4. Milestones if the whole investable amount is invested
    const m = [];
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
    const r = [
      { kind: 'figure', text: `Retirement at age ${Math.round(i.retireAge)} is ${Math.max(1, Math.round(i.retireAge - i.age))} years away.` },
      { kind: 'pointer', text: 'The Retirement planner estimates the corpus you need, what your EPF, NPS and PPF are likely to give, and the chance of it lasting.', href: 'retirement-planner.html' },
    ];
    phases.push({ id: 'retirement', title: 'Retirement', when: `Age ${Math.round(i.retireAge)}`, summary: 'This planner does not size a retirement corpus unless you add it as a goal.', items: r });

    return phases;
  }


  return { sipFV, findSIP, plan, validateProfile, roadmap, monthsToReach, WEALTH_MILESTONES };
});
