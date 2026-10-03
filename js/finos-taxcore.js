/**
 * FIN-OS tax core — pure, DOM-free income-tax maths (FY 2025-26 slabs).   (v1.0)
 *
 *   FinosTaxCore.taxNew(taxableIncome)     → tax incl. 4% cess, with Sec 87A rebate + marginal relief
 *   FinosTaxCore.taxOld(taxableIncome)     → tax incl. 4% cess, with Sec 87A rebate (≤ ₹5L)
 *   FinosTaxCore.best(newTaxable, oldTaxable) → { regime, tax, taxNew, taxOld }
 *   FinosTaxCore.savingsPlan(income, sections) → deduction-headroom savings vs the better regime (tax.html tracker)
 *   FinosTaxCore.STD_NEW / STD_OLD         → standard deduction (₹75,000 / ₹50,000)
 *
 * New regime: 0–4L nil · 4–8L 5% · 8–12L 10% · 12–16L 15% · 16–20L 20% · 20–24L 25% · >24L 30%.
 * 87A: taxable income up to ₹12,00,000 → no tax; just above it, tax is capped at the income over ₹12L
 * (marginal relief) so a ₹1 raise never costs more than ₹1 of tax.
 * Surcharge (income > ₹50L) is NOT modelled — callers should say so.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FinosTaxCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const NEW_SLABS = [
    [0, 400000, 0], [400000, 800000, 0.05], [800000, 1200000, 0.10], [1200000, 1600000, 0.15],
    [1600000, 2000000, 0.20], [2000000, 2400000, 0.25], [2400000, Infinity, 0.30],
  ];
  const OLD_SLABS = [[0, 250000, 0], [250000, 500000, 0.05], [500000, 1000000, 0.20], [1000000, Infinity, 0.30]];
  const NEW_REBATE_LIMIT = 1200000;
  const OLD_REBATE_LIMIT = 500000;
  const CESS = 0.04;

  function slabTax(income, slabs) {
    let tax = 0;
    for (const [lo, hi, rate] of slabs) {
      if (income <= lo) break;
      tax += (Math.min(income, hi) - lo) * rate;
    }
    return tax;
  }
  const clamp = (n) => (Number.isFinite(n) && n > 0 ? n : 0);

  function taxNew(taxable) {
    const income = clamp(taxable);
    let tax = slabTax(income, NEW_SLABS);
    if (income <= NEW_REBATE_LIMIT) tax = 0;
    else tax = Math.min(tax, income - NEW_REBATE_LIMIT);          // marginal relief
    return Math.round(tax * (1 + CESS));
  }

  function taxOld(taxable) {
    const income = clamp(taxable);
    let tax = slabTax(income, OLD_SLABS);
    if (income <= OLD_REBATE_LIMIT) tax = 0;
    return Math.round(tax * (1 + CESS));
  }

  function best(newTaxable, oldTaxable) {
    const n = taxNew(newTaxable);
    const o = taxOld(oldTaxable);
    return n <= o ? { regime: 'new', tax: n, taxNew: n, taxOld: o } : { regime: 'old', tax: o, taxNew: n, taxOld: o };
  }

  /**
   * "How much could deductions save me?" — the model behind the Tax Savings Tracker on tax.html.
   *
   * Deductions only exist in the OLD regime, so the saving is measured there and then compared with what the new
   * regime would cost anyway:
   *   current   = the cheaper of (new regime) and (old regime with what you already claim)
   *   potential = current − the cheaper of (new regime) and (old regime with every "core" deduction maxed)
   * so it is ₹0 whenever the new regime already beats the old one — deductions are then irrelevant.
   *
   * sections: [{ id, maxDeduction, kind }]   kind 'core' (anyone can act: 80C, 80D, NPS) is summed into the total;
   *           'conditional' (HRA, 24(b): only if you pay rent / have a home loan) gets its own maximum, not summed;
   *           'uncapped' (80E: equals the interest you pay) gets no number.
   * Core savings are applied one after another so they add up exactly to the combined old-regime saving.
   * opts.alreadyClaimed80c (₹) defaults to min(₹1.5L, 12% of income) — what salaried people typically already use.
   */
  function savingsPlan(income, sections, opts) {
    const gross = clamp(income);
    const used80c = Math.max(0, opts && opts.alreadyClaimed80c != null ? Number(opts.alreadyClaimed80c) : Math.min(150000, gross * 0.12));
    const oldTaxableOf = (extra) => Math.max(0, gross - 50000 - used80c - extra);

    const newTax = taxNew(gross - 75000);
    const oldNow = taxOld(oldTaxableOf(0));
    const rows = [];
    let cum = 0, prev = oldNow;
    (sections || []).filter((x) => x.kind === 'core').forEach((x) => {
      const headroom = Math.max(0, x.maxDeduction - (x.id === 's80c' ? used80c : 0));
      cum += headroom;
      const after = taxOld(oldTaxableOf(cum));
      rows.push({ id: x.id, kind: 'core', headroom, taxSaved: prev - after });
      prev = after;
    });
    const oldOpt = prev;
    (sections || []).filter((x) => x.kind !== 'core').forEach((x) => {
      if (x.kind === 'uncapped' || !(x.maxDeduction > 0)) { rows.push({ id: x.id, kind: 'uncapped', headroom: null, taxSaved: null }); return; }
      rows.push({ id: x.id, kind: 'conditional', headroom: x.maxDeduction, taxSaved: oldOpt - taxOld(oldTaxableOf(cum + x.maxDeduction)) });
    });
    const current = Math.min(newTax, oldNow);
    const best = Math.min(newTax, oldOpt);

    // Smallest total of old-regime deductions (above the ₹50,000 standard deduction, everything included) at which the
    // old regime costs no more than the new one.
    const oldWith = (d) => taxOld(Math.max(0, gross - 50000 - d));
    let breakEven = 0;
    if (oldWith(0) > newTax) {
      let lo = 0, hi = Math.max(0, gross - 50000);              // at d = hi the taxable income is 0, so tax is 0 ≤ newTax
      for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (oldWith(mid) > newTax) lo = mid; else hi = mid; }
      breakEven = Math.ceil(hi / 1000) * 1000;
    }
    return {
      income: gross, newTax, oldNow, oldOpt,
      current, currentRegime: newTax <= oldNow ? 'new' : 'old',
      potential: current - best,
      oldPotential: oldNow - oldOpt,                    // saving available *inside* the old regime by maxing the core deductions
      breakEvenDeductions: breakEven,
      coreCapacity: used80c + rows.reduce((t, r) => t + (r.kind === 'core' ? r.headroom : 0), 0),
      bestRegime: newTax <= oldOpt ? 'new' : 'old',
      newBeatsOldEvenOptimised: newTax <= oldOpt,
      oldMinusNew: oldOpt - newTax,
      sections: rows,
    };
  }

  return { taxNew, taxOld, best, savingsPlan, STD_NEW: 75000, STD_OLD: 50000, NEW_REBATE_LIMIT, OLD_REBATE_LIMIT, CESS };
});
