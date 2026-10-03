/**
 * FIN-OS Prepay-vs-Invest — pure month-by-month simulation, DOM-free.   (v1.0)
 *
 * Question: you have surplus cash (a monthly amount and/or a lump sum). Prepay the home loan, or invest it?
 * Both strategies spend exactly the same cash every month, so the end-of-loan wealth is directly comparable.
 *
 *   A · PREPAY  — extra goes to the loan (paid at the start of the month, before interest accrues). EMI is unchanged,
 *                 so the loan closes early; from then on the whole EMI + extra is invested.
 *   B · INVEST  — loan runs its full course on the normal EMI; the extra is invested every month from day one.
 *
 *   FinosPrepayInvest.simulate(p)    → { emi, closeMonthA, interestA, interestB, finalA, finalB, diff, winner, series, … }
 *   FinosPrepayInvest.breakEven(p)   → the investment return (% p.a.) at which B catches up with A, or null
 *   FinosPrepayInvest.emi(P, ratePct, months)
 *
 * p = { loan, rate (% p.a.), years, monthly (extra ₹/mo), lump (one-time ₹), ret (% p.a.), invType: 'equity'|'debt',
 *       slab (% — your tax slab), claim24b (bool — old regime, self-occupied) }
 *
 * Conventions: monthly rate = annual/12 (same as every other FIN-OS calculator). Sec 24(b): interest up to ₹2L a year
 * is deductible, modelled as a monthly tax saving of slab × min(interest, ₹2L/12) that is invested too (so the strategy
 * that pays more interest also gets more relief). Gains tax is charged once at the end: equity LTCG 12.5% above the
 * ₹1.25L exemption, debt/FD gains at your slab; both +4% cess. Principal outstanding is zero in both strategies at the
 * end of the horizon, so net wealth = investment corpus after tax.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FinosPrepayInvest = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const INT_CAP_ANNUAL = 200000;
  const LTCG_RATE = 0.125;
  const LTCG_EXEMPT = 125000;
  const CESS = 0.04;

  const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

  function emi(P, ratePct, months) {
    if (!(P > 0) || !(months > 0)) return 0;
    const r = ratePct / 1200;
    if (r === 0) return P / months;
    const f = Math.pow(1 + r, months);
    return (P * r * f) / (f - 1);
  }

  function normalize(p) {
    return {
      loan: Math.max(0, num(p && p.loan, 0)),
      rate: Math.max(0, Math.min(40, num(p && p.rate, 0))),
      years: Math.max(1, Math.min(40, Math.round(num(p && p.years, 1)))),
      monthly: Math.max(0, num(p && p.monthly, 0)),
      lump: Math.max(0, num(p && p.lump, 0)),
      ret: Math.max(0, Math.min(60, num(p && p.ret, 0))),
      invType: p && p.invType === 'debt' ? 'debt' : 'equity',
      slab: Math.max(0, Math.min(45, num(p && p.slab, 0))),
      claim24b: !!(p && p.claim24b),
    };
  }

  function gainsTax(corpus, principal, q) {
    const gain = Math.max(0, corpus - principal);
    const tax = q.invType === 'equity' ? Math.max(0, gain - LTCG_EXEMPT) * LTCG_RATE : gain * (q.slab / 100);
    return tax * (1 + CESS);
  }

  function simulate(params) {
    const q = normalize(params);
    if (!(q.loan > 0)) return { valid: false, reason: 'loan' };
    if (!(q.monthly > 0 || q.lump > 0)) return { valid: false, reason: 'surplus' };

    const H = q.years * 12;
    const rm = q.rate / 1200;
    const im = q.ret / 1200;
    const EMI = emi(q.loan, q.rate, H);
    const credit = (interest) => (q.claim24b ? Math.min(interest, INT_CAP_ANNUAL / 12) * (q.slab / 100) : 0);

    const lumpToLoan = Math.min(q.lump, q.loan);
    const lumpLeft = q.lump - lumpToLoan;

    let balA = q.loan - lumpToLoan, balB = q.loan;
    let potA = lumpLeft, potB = q.lump;
    let prinA = lumpLeft, prinB = q.lump;
    let intA = 0, intB = 0, closeA = balA > 0 ? null : 0;
    const series = [{ year: 0, a: potA - balA, b: potB - balB }];

    for (let t = 1; t <= H; t++) {
      // ── A · prepay ──
      const prepay = Math.min(balA, q.monthly);
      balA -= prepay;
      let startA = q.monthly - prepay, endA = 0, iA = 0;
      if (balA > 0) {
        iA = balA * rm;
        const pay = Math.min(balA + iA, EMI);
        balA = balA + iA - pay;
        endA = EMI - pay;
      } else {
        startA += EMI;
      }
      if (balA <= 1e-6) { balA = 0; if (closeA === null) closeA = t; }
      intA += iA;
      const crA = credit(iA);
      potA = (potA + startA) * (1 + im) + endA + crA;
      prinA += startA + endA + crA;

      // ── B · invest ──
      let iB = 0, endB = 0, startB = q.monthly;
      if (balB > 0) {
        iB = balB * rm;
        const pay = Math.min(balB + iB, EMI);
        balB = balB + iB - pay;
        endB = EMI - pay;
      } else {
        startB += EMI;
      }
      if (balB <= 1e-6) balB = 0;
      intB += iB;
      const crB = credit(iB);
      potB = (potB + startB) * (1 + im) + endB + crB;
      prinB += startB + endB + crB;

      if (t % 12 === 0) series.push({ year: t / 12, a: potA - balA, b: potB - balB });
    }

    const taxA = gainsTax(potA, prinA, q);
    const taxB = gainsTax(potB, prinB, q);
    const finalA = potA - taxA;
    const finalB = potB - taxB;
    const slabRelief = q.claim24b ? q.slab / 100 : 0;
    return {
      valid: true,
      params: q,
      emi: EMI,
      months: H,
      closeMonthA: closeA === null ? H : closeA,
      interestA: intA,
      interestB: intB,
      interestSaved: intB - intA,
      corpusA: potA, corpusB: potB,
      taxA, taxB,
      finalA, finalB,
      diff: finalA - finalB,                         // > 0 → prepaying wins
      winner: Math.abs(finalA - finalB) < Math.max(1, 0.002 * Math.max(finalA, finalB)) ? 'tie' : (finalA > finalB ? 'prepay' : 'invest'),
      effectiveLoanRate: q.rate * (1 - slabRelief),  // post-tax "return" of prepaying (24(b) cap ignored for the headline)
      series,
    };
  }

  /** Investment return (% p.a.) at which investing matches prepaying; null if it never does within 0–40%. */
  function breakEven(params) {
    const q = normalize(params);
    const d = (ret) => { const r = simulate(Object.assign({}, q, { ret })); return r.valid ? r.finalB - r.finalA : NaN; };
    let lo = 0, hi = 40;
    const dLo = d(lo), dHi = d(hi);
    if (!Number.isFinite(dLo) || !Number.isFinite(dHi)) return null;
    if (dLo >= 0) return 0;               // investing wins even at 0% (only possible via tax quirks)
    if (dHi < 0) return null;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (d(mid) < 0) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  return { simulate, breakEven, emi, normalize };
});
