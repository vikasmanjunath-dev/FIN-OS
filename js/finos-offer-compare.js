/**
 * FIN-OS job-offer comparer — pure maths, DOM-free.   (v1.0)
 *
 * Why: CTC is not salary. Two offers with the same CTC can differ by lakhs in what reaches your bank account
 * (variable pay, employer PF/NPS/gratuity sitting inside the CTC, joining bonus, tax regime).
 *
 *   FinosOfferCompare.evaluate(offer, opts)      → one offer, year by year
 *   FinosOfferCompare.compare([offer, …], opts)  → evaluations + who wins on monthly in-hand vs total value
 *
 * offer = { name, ctc, variable?, payout? (% of variable you expect, default 100), basicPct? (of fixed, default 40),
 *           pfBasis? 'actual'|'ceiling' (default 'actual'), npsPct? (employer NPS, % of basic, default 0),
 *           joiningBonus?, hike? (% per year, default 8) }
 * opts  = { years? (default 5), oldDeductions? (default 150000 — everything you'd claim under the old regime:
 *           80C incl. your own PF, 80D, HRA exemption…), profTax? (default 2400) }
 *
 * Per year:  fixed = ctc − variable;  basic = basicPct × fixed;  PF wage = basic (or ₹15,000/mo ceiling)
 *            employer PF = employee PF = 12% × PF wage;  gratuity = 4.81% × basic;  employer NPS = npsPct × basic
 *            cash gross = fixed − employer PF − gratuity − employer NPS + variable × payout (+ joining bonus in year 1)
 *            tax = lower of new/old regime (FinosTaxCore);  take-home = cash gross − employee PF − prof. tax − tax
 *            total value = take-home + employee PF + employer PF + employer NPS + gratuity accrual
 * Gratuity is only payable after 5 years of service; surcharge (> ₹50L) is not modelled.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FinosOfferCompare = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const Tax = (typeof module !== 'undefined' && module.exports && typeof require === 'function')
    ? require('./finos-taxcore.js') : root.FinosTaxCore;

  const PF_RATE = 0.12;
  const GRATUITY_RATE = 0.0481;
  const PF_CEILING_ANNUAL = 15000 * 12;
  const NPS_CAP_NEW = 0.14;     // 80CCD(2) limit, % of basic
  const NPS_CAP_OLD = 0.10;

  const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

  function normalize(o) {
    const ctc = Math.max(0, num(o && o.ctc, 0));
    return {
      name: String((o && o.name) || 'Offer').trim() || 'Offer',
      ctc,
      variable: Math.min(ctc, Math.max(0, num(o && o.variable, 0))),
      payout: Math.max(0, Math.min(200, num(o && o.payout, 100))),
      basicPct: Math.max(1, Math.min(100, num(o && o.basicPct, 40))),
      pfBasis: o && o.pfBasis === 'ceiling' ? 'ceiling' : 'actual',
      npsPct: Math.max(0, Math.min(14, num(o && o.npsPct, 0))),
      joiningBonus: Math.max(0, num(o && o.joiningBonus, 0)),
      hike: Math.max(0, Math.min(50, num(o && o.hike, 8))),
    };
  }

  function yearCalc(o, y, includeBonus, opts) {
    const g = Math.pow(1 + o.hike / 100, y);
    const ctc = o.ctc * g;
    const variable = o.variable * g;
    const fixed = ctc - variable;
    const basic = fixed * (o.basicPct / 100);
    const pfWage = o.pfBasis === 'ceiling' ? Math.min(basic, PF_CEILING_ANNUAL) : basic;
    const erPF = PF_RATE * pfWage;
    const eePF = PF_RATE * pfWage;
    const gratuity = GRATUITY_RATE * basic;
    const erNPS = (o.npsPct / 100) * basic;
    const fixedCash = Math.max(0, fixed - erPF - gratuity - erNPS);
    const variableCash = variable * (o.payout / 100);
    const bonus = includeBonus && y === 0 ? o.joiningBonus : 0;
    const gross = fixedCash + variableCash + bonus;

    const taxableNew = gross - Tax.STD_NEW - Math.min(erNPS, NPS_CAP_NEW * basic);
    const taxableOld = gross - Tax.STD_OLD - opts.profTax - Math.min(erNPS, NPS_CAP_OLD * basic) - opts.oldDeductions;
    const t = Tax.best(taxableNew, taxableOld);
    const takeHome = gross - eePF - opts.profTax - t.tax;
    const locked = eePF + erPF + erNPS;
    return {
      year: y + 1, ctc, gross, tax: t.tax, regime: t.regime, taxNew: t.taxNew, taxOld: t.taxOld,
      eePF, erPF, erNPS, gratuity, bonus, takeHome, locked,
      totalValue: takeHome + locked + gratuity,
    };
  }

  function evaluate(offer, options) {
    const o = normalize(offer);
    const opts = {
      years: Math.max(1, Math.min(10, Math.round(num(options && options.years, 5)))),
      oldDeductions: Math.max(0, num(options && options.oldDeductions, 150000)),
      profTax: Math.max(0, num(options && options.profTax, 2400)),
    };
    const years = [];
    for (let y = 0; y < opts.years; y++) years.push(yearCalc(o, y, true, opts));
    const steady = yearCalc(o, 0, false, opts);              // year 1 without the one-time joining bonus
    const sum = (k) => years.reduce((a, r) => a + r[k], 0);
    return {
      offer: o, opts, years,
      monthlyInHand: steady.takeHome / 12,
      regime: steady.regime,
      takeHomeShare: o.ctc > 0 ? steady.takeHome / o.ctc : 0,
      totals: {
        takeHome: sum('takeHome'), locked: sum('locked'), gratuity: sum('gratuity'),
        tax: sum('tax'), totalValue: sum('totalValue'), ctc: sum('ctc'),
      },
    };
  }

  function compare(offers, options) {
    const list = (offers || []).filter((o) => num(o && o.ctc, 0) > 0).slice(0, 3);
    const results = list.map((o) => evaluate(o, options));
    const pick = (fn) => (results.length ? results.reduce((b, r) => (fn(r) > fn(b) ? r : b), results[0]) : null);
    const byMonthly = pick((r) => r.monthlyInHand);
    const byTotal = pick((r) => r.totals.totalValue);
    return {
      results,
      winnerMonthly: byMonthly ? results.indexOf(byMonthly) : -1,
      winnerTotal: byTotal ? results.indexOf(byTotal) : -1,
      gapMonthly: results.length > 1 ? Math.max(...results.map((r) => r.monthlyInHand)) - Math.min(...results.map((r) => r.monthlyInHand)) : 0,
      gapTotal: results.length > 1 ? Math.max(...results.map((r) => r.totals.totalValue)) - Math.min(...results.map((r) => r.totals.totalValue)) : 0,
    };
  }

  return { evaluate, compare, normalize, PF_RATE, GRATUITY_RATE };
});
