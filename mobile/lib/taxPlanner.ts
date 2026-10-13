// @ts-nocheck
// Tax Planner maths (FY 2025-26): both regimes with surcharge, HRA, 80C / 80D / NPS / 24(b), LTCG and STCG, and the action list.
// Machine-assisted port: sliced unchanged from js/finos-tax-calc.js (constants through compute()), minus its localStorage helper,
// so __tests__/taxPlanner.parity.test.mts can prove the phone gives the website's figures for the same inputs.
  /* ── Constants ──────────────────────────────────────────────────── */
  const FY = '2025-26';
  const CESS = 0.04;

  // New Regime FY 2025-26 slabs (post-Budget 2025)
  const NEW_SLABS = [
    [400000, 0],    // 0–4L
    [400000, 0.05], // 4–8L
    [400000, 0.10], // 8–12L
    [400000, 0.15], // 12–16L
    [400000, 0.20], // 16–20L
    [400000, 0.25], // 20–24L
    [Infinity, 0.30],
  ];
  const NEW_STD_DED = 75000;
  const NEW_REBATE_LIMIT = 1200000; // ₹12L net taxable → 87A full rebate

  // Old Regime slabs (unchanged)
  const OLD_SLABS = [
    [250000, 0],    // 0–2.5L
    [250000, 0.05], // 2.5–5L
    [500000, 0.20], // 5–10L
    [Infinity, 0.30],
  ];
  const OLD_STD_DED = 50000;
  const OLD_REBATE_LIMIT = 500000; // ₹5L net taxable → 87A full rebate

  /* ── Helpers ────────────────────────────────────────────────────── */
  function INR(n) {
    n = Number(n) || 0;
    if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr';
    if (n >= 1e5) return '₹' + (n / 1e5).toFixed(2) + ' L';
    if (n >= 1000) return '₹' + Math.round(n / 1000) + 'K';
    return '₹' + Math.round(n).toLocaleString('en-IN');
  }

  function _slabTax(taxable, slabs) {
    let tax = 0, rem = taxable;
    for (const [cap, rate] of slabs) {
      if (rem <= 0) break;
      const chunk = Math.min(rem, cap);
      tax += chunk * rate;
      rem -= chunk;
    }
    return tax;
  }

  // Surcharge rate follows the person's TAXABLE income (after deductions), not the gross salary. The new regime's top rate is 25% (above ₹2Cr),
  // not 15%: Budget 2023 capped it at 25% instead of the old regime's 37%. Marginal relief just above each threshold is not modelled.
  function _surcharge(tax, income) {
    if (income <= 5000000)  return 0;
    if (income <= 10000000) return tax * 0.10;
    if (income <= 20000000) return tax * 0.15;
    return tax * 0.25;
  }

  function _surchargeOld(tax, income) {
    if (income <= 5000000)  return 0;
    if (income <= 10000000) return tax * 0.10;
    if (income <= 20000000) return tax * 0.15;
    if (income <= 50000000) return tax * 0.25;
    return tax * 0.37;
  }

  /* ── Core computation ───────────────────────────────────────────── */
  function _calcHRA(income, basicPct, hraReceived, monthlyRent, isMetro) {
    if (monthlyRent <= 0) return 0;
    const basic = income * (basicPct / 100);
    const actualHra = hraReceived > 0 ? hraReceived : basic * 0.40;
    const rentAnn   = monthlyRent * 12;
    const rentMin10 = Math.max(0, rentAnn - basic * 0.10);
    const metroLim  = basic * (isMetro ? 0.50 : 0.40);
    return Math.min(actualHra, rentMin10, metroLim);
  }

  function computeNewRegime(p) {
    const std     = NEW_STD_DED;
    // Only employer NPS (80CCD(2)) is deductible in new regime
    const empNps  = Math.min(p.employer_nps || 0, (p.income * (p.basic_pct || 50) / 100) * 0.14);
    const taxable = Math.max(0, p.income - std - empNps);
    // 87A: nil up to ₹12L; just above it tax can't exceed the income over ₹12L (marginal relief), so there is no cliff
    const baseTax = taxable <= NEW_REBATE_LIMIT ? 0 : Math.min(_slabTax(taxable, NEW_SLABS), taxable - NEW_REBATE_LIMIT);
    let   tax     = baseTax;
    const surCh   = _surcharge(tax, taxable);
    tax           = (tax + surCh) * (1 + CESS);

    // LTCG & STCG (same in both regimes)
    const ltcg_taxable = Math.max(0, (p.ltcg || 0) - 125000);
    const ltcg_tax     = ltcg_taxable * 0.125 * (1 + CESS);
    const stcg_tax     = (p.stcg || 0) * 0.20 * (1 + CESS);

    return {
      gross:          p.income,
      std_ded:        std,
      emp_nps:        empNps,
      taxable,
      base_tax:       baseTax,
      surcharge:      surCh,
      cess:           (tax / 1.04) * CESS,
      income_tax:     tax,
      ltcg_tax,
      stcg_tax,
      total_tax:      Math.round(tax + ltcg_tax + stcg_tax),
      effective_rate: p.income > 0 ? ((tax + ltcg_tax + stcg_tax) / p.income) * 100 : 0,
    };
  }

  function computeOldRegime(p) {
    const std     = OLD_STD_DED;
    const basic   = p.income * ((p.basic_pct || 50) / 100);
    const empNps  = Math.min(p.employer_nps || 0, basic * 0.14);
    const hra     = _calcHRA(p.income, p.basic_pct || 50, p.hra_received || 0, p.monthly_rent || 0, p.city !== 'non_metro');
    const s80c_raw = (p.inv_80c || 0) + (p.home_loan_pri || 0);
    const s80c    = Math.min(s80c_raw, 150000);
    const s80d_self  = Math.min(p.health_self   || 0, p.parents_senior ? 50000 : 25000);
    const s80d_par   = Math.min(p.health_parent || 0, p.parents_senior ? 50000 : 25000);
    const s80d    = s80d_self + s80d_par;
    const nps     = Math.min(p.nps_self || 0, 50000);          // 80CCD(1B)
    const sec24b  = Math.min(p.home_loan_int || 0, 200000);    // 24B interest
    const other   = p.other_ded || 0;
    const totalDed = std + hra + s80c + s80d + nps + empNps + sec24b + other;
    const taxable  = Math.max(0, p.income - totalDed);
    let   tax      = taxable <= OLD_REBATE_LIMIT ? 0 : _slabTax(taxable, OLD_SLABS);
    const surCh    = _surchargeOld(tax, taxable);
    tax            = (tax + surCh) * (1 + CESS);

    const ltcg_taxable = Math.max(0, (p.ltcg || 0) - 125000);
    const ltcg_tax     = ltcg_taxable * 0.125 * (1 + CESS);
    const stcg_tax     = (p.stcg || 0) * 0.20 * (1 + CESS);

    const s80c_gap  = Math.max(0, 150000 - s80c_raw);
    const nps_gap   = Math.max(0, 50000  - (p.nps_self || 0));
    const ltcg_free = Math.min(p.ltcg || 0, 125000);

    return {
      gross: p.income,
      deductions: {
        std, hra, s80c, s80d, nps, emp_nps: empNps, sec24b, other,
        total: totalDed,
      },
      gaps: { s80c: s80c_gap, nps: nps_gap, ltcg_free },
      taxable,
      base_tax: taxable <= OLD_REBATE_LIMIT ? 0 : _slabTax(taxable, OLD_SLABS),
      surcharge: surCh,
      cess:      (tax / 1.04) * CESS,
      income_tax: tax,
      ltcg_tax,
      stcg_tax,
      total_tax: Math.round(tax + ltcg_tax + stcg_tax),
      effective_rate: p.income > 0 ? ((tax + ltcg_tax + stcg_tax) / p.income) * 100 : 0,
    };
  }

  function compute(params) {
    const p = {
      income: 0, basic_pct: 50, hra_received: 0, monthly_rent: 0, city: 'metro',
      inv_80c: 0, health_self: 0, health_parent: 0, parents_senior: false,
      nps_self: 0, employer_nps: 0, home_loan_int: 0, home_loan_pri: 0,
      ltcg: 0, stcg: 0, other_ded: 0,
      ...params,
    };

    const newR = computeNewRegime(p);
    const oldR = computeOldRegime(p);
    const best = newR.total_tax <= oldR.total_tax ? 'new' : 'old';
    const saving = Math.abs(oldR.total_tax - newR.total_tax);

    // Build action list
    const actions = [];
    if (oldR.gaps.s80c > 0 && best === 'old') {
      const taxSaving = Math.round(oldR.gaps.s80c * 0.30 * 1.04);
      actions.push({ priority: 'high', category: '80C', text: `Invest ${INR(oldR.gaps.s80c)} more in PPF/ELSS to fill 80C — save ${INR(taxSaving)} tax` });
    }
    if (oldR.gaps.nps > 0 && best === 'old') {
      const taxSaving = Math.round(oldR.gaps.nps * 0.30 * 1.04);
      actions.push({ priority: 'high', category: '80CCD', text: `Invest ${INR(oldR.gaps.nps)} in NPS (80CCD 1B) — save ${INR(taxSaving)} extra tax` });
    }
    if (oldR.gaps.ltcg_free > 0) {
      const taxSaving = Math.round(oldR.gaps.ltcg_free * 0.125 * 1.04);
      actions.push({ priority: 'medium', category: 'LTCG', text: `Book up to ${INR(oldR.gaps.ltcg_free)} equity gains before Apr 1 — tax-free under ₹1.25L limit` });
    }
    if (!p.health_self && best === 'old') {
      actions.push({ priority: 'high', category: '80D', text: 'Buy health insurance — ₹25K premium saves ₹7,800 tax (30% bracket) + priceless protection' });
    }
    if (!p.nps_self && p.income > 600000 && best === 'old') {
      actions.push({ priority: 'medium', category: 'NPS', text: 'Open NPS Tier-1 — ₹50K extra deduction saves ₹15,600 in 30% bracket (80CCD 1B)' });
    }
    if (best === 'new' && saving > 10000) {
      actions.push({ priority: 'info', category: 'Regime', text: `Switch to New Regime — saves ${INR(saving)} vs Old Regime at your deduction level` });
    }

    return { params: p, newRegime: newR, oldRegime: oldR, best, saving, actions, fy: FY };
  }

export { compute, computeNewRegime, computeOldRegime, FY };
