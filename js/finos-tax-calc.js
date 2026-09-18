/**
 * finos-tax-calc.js — India Income Tax Optimiser  v1.0  (Phase 29)
 * ─────────────────────────────────────────────────────────────────
 * Deterministic Old vs. New regime calculator for FY 2025-26.
 * No backend, no AI — pure math. Arya AI in tax.html can use these
 * numbers as a pre-computed base.
 *
 * Public API:
 *   FinosTaxCalc.compute(params)    → { old, new, best, saving, actions }
 *   FinosTaxCalc.renderPlanner(el)  — full interactive deduction form
 *   FinosTaxCalc.autoFill()         — reads from localStorage / finos-context
 *   FinosTaxCalc.pushToContext()    — writes finos_tax_* keys to localStorage
 *
 * params shape:
 *   income        — gross annual salary (CTC)
 *   basic_pct     — basic as % of gross (default 50)
 *   hra_received  — HRA component per year (0 if not applicable)
 *   monthly_rent  — actual monthly rent paid
 *   city          — 'metro' | 'non_metro'
 *   inv_80c       — total 80C investments already done
 *   health_self   — health insurance premium (self + family)
 *   health_parent — health insurance premium (parents)
 *   parents_senior— true if parents aged 60+
 *   nps_self      — NPS contribution 80CCD(1B) (max ₹50K)
 *   employer_nps  — employer NPS 80CCD(2) (max 14% of basic, both regimes)
 *   home_loan_int — home loan interest paid (max ₹2L, section 24B)
 *   home_loan_pri — home loan principal (within 80C limit)
 *   ltcg          — equity LTCG realised this year
 *   stcg          — equity STCG realised this year
 *   other_ded     — any other 80C/80G/80E deductions
 */
(function (global) {
  'use strict';

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
  function gs(key, def = 0) { return parseFloat(localStorage.getItem(key) || def) || 0; }
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

  function _surcharge(tax, income) {
    if (income <= 5000000)  return 0;
    if (income <= 10000000) return tax * 0.10;
    if (income <= 20000000) return tax * 0.15;
    return tax * 0.15; // new regime capped at 15% (Budget 2023)
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
    let   tax     = taxable <= NEW_REBATE_LIMIT ? 0 : _slabTax(taxable, NEW_SLABS);
    const surCh   = _surcharge(tax, p.income);
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
      base_tax:       taxable <= NEW_REBATE_LIMIT ? 0 : _slabTax(taxable, NEW_SLABS),
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
    const surCh    = _surchargeOld(tax, p.income);
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

  /* ── Push to context ────────────────────────────────────────────── */
  function pushToContext(result) {
    if (!result) return;
    localStorage.setItem('finos_tax_best_regime', result.best);
    localStorage.setItem('finos_tax_old_tax',     result.oldRegime.total_tax.toString());
    localStorage.setItem('finos_tax_new_tax',     result.newRegime.total_tax.toString());
    localStorage.setItem('finos_tax_liability',   Math.min(result.oldRegime.total_tax, result.newRegime.total_tax).toString());
    localStorage.setItem('finos_80c_used',        Math.min((result.params.inv_80c || 0) + (result.params.home_loan_pri || 0), 150000).toString());
    localStorage.setItem('finos_80c_gap',         (result.oldRegime.gaps?.s80c || 0).toString());
    if (window.FinosContext?.update) {
      window.FinosContext.update({
        taxBestRegime: result.best,
        taxOldLiability: result.oldRegime.total_tax,
        taxNewLiability: result.newRegime.total_tax,
      });
    }
  }

  /* ── Auto-fill from existing data ───────────────────────────────── */
  function autoFill() {
    const ctx = window.FINOS_USER_CONTEXT;
    const INCOME_MAP = { '0-25k': 15000 * 12, '25k-1L': 50000 * 12, '1L-2.5L': 175000 * 12, '2.5L+': 300000 * 12 };
    const income = (ctx?.budget_tracker?.income_monthly || 0) * 12 || INCOME_MAP[localStorage.getItem('finos_income') || ''] || 0;

    // PPF from FD tracker → 80C
    let ppf80c = 0;
    try {
      const fdPortfolio = JSON.parse(localStorage.getItem('finos_fd_portfolio') || '[]');
      fdPortfolio.filter(e => e.type === 'ppf').forEach(e => { ppf80c += Number(e.annualAmount || 0); });
    } catch {}

    // Health premium from insurance-hub → 80D
    let healthPremium = 0, parentPremium = 0;
    try {
      const policies = JSON.parse(localStorage.getItem('finos_insurance_policies') || '[]');
      policies.filter(p => p.type === 'health').forEach(p => {
        healthPremium += Number(p.premium || 0);
      });
    } catch {}

    return { income, inv_80c: ppf80c, health_self: healthPremium, health_parent: parentPremium };
  }

  /* ══════════════════════════════════════════════════════════════════
     PLANNER RENDERER
  ══════════════════════════════════════════════════════════════════ */
  function renderPlanner(container) {
    if (!container) return;
    const prefill = autoFill();

    container.innerHTML = `
      <style>
        .tc-form { display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr));gap:12px;margin-bottom:20px; }
        @media (min-width:769px) {
          /* Whichever field lands here is covered by the fixed #finos-fab
             or #qft-fab; this keeps every field clear of both regardless
             of which one ends up at this scroll position. */
          .tc-form { padding-right:100px; }
        }
        .tc-field { display:flex;flex-direction:column;gap:5px; }
        .tc-label { font-size:10px;font-weight:700;color:#8892A4;text-transform:uppercase;letter-spacing:.6px; }
        .tc-input { padding:10px 12px;border-radius:10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#F5F7FA;font-size:14px;outline:none;transition:.2s; }
        .tc-input:focus { border-color:rgba(0,212,255,.5);background:rgba(0,212,255,.04); }
        .tc-input::-webkit-inner-spin-button { opacity:.4; }
        .tc-hint { font-size:10px;color:rgba(255,255,255,.3); }
        .tc-section-head { font-size:11px;font-weight:700;color:rgba(255,255,255,.3);text-transform:uppercase;letter-spacing:.8px;padding:10px 0 4px;border-top:1px solid rgba(255,255,255,.06);margin-top:4px; }
        .tc-compare { display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid rgba(255,255,255,.08);border-radius:16px;overflow:hidden;margin-bottom:20px; }
        .tc-regime { padding:20px; }
        .tc-regime-new { background:rgba(0,212,255,.04); }
        .tc-regime-old { background:rgba(34,211,166,.04); }
        .tc-regime-badge { font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;padding:3px 8px;border-radius:10px;display:inline-block;margin-bottom:10px; }
        .tc-regime-row { display:flex;justify-content:space-between;padding:4px 0;font-size:12px;border-bottom:1px solid rgba(255,255,255,.04); }
        .tc-regime-row:last-child { border-bottom:none; }
        .tc-regime-row .label { color:#8892A4; }
        .tc-regime-row .value { font-weight:700;color:#F5F7FA; }
        .tc-winner { grid-column:1/-1;padding:14px 20px;background:rgba(0,0,0,.2);display:flex;align-items:center;gap:10px;flex-wrap:wrap; }
        .tc-actions { margin-top:16px; }
        .tc-action-item { padding:12px 14px;border-radius:12px;border-left:3px solid;margin-bottom:8px;font-size:13px; }
        .tc-action-high   { background:rgba(255,68,68,.06);border-color:#FF4444; }
        .tc-action-medium { background:rgba(240,165,0,.06);border-color:#F0A500; }
        .tc-action-info   { background:rgba(0,212,255,.06);border-color:#00D4FF; }
        .tc-action-cat { font-size:9px;font-weight:800;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:.6px;margin-bottom:3px; }
        .tc-deduction-row { display:flex;justify-content:space-between;padding:4px 0;font-size:12px; }
        .tc-btn { padding:12px 24px;border-radius:12px;background:rgba(0,212,255,.15);border:1px solid rgba(0,212,255,.3);color:#00D4FF;font-size:13px;font-weight:800;cursor:pointer;transition:.15s; }
        .tc-btn:hover { background:rgba(0,212,255,.25); }
        @media (max-width:500px) { .tc-compare { grid-template-columns:1fr; } }
      </style>

      <!-- Sticky Calculate bar -->
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:20px;flex-wrap:wrap;">
        <div style="flex:1;min-width:180px;">
          <div style="font-size:11px;font-weight:700;color:#8892A4;text-transform:uppercase;letter-spacing:.6px;margin-bottom:5px;">Annual Income (₹)</div>
          <input id="tc-income" type="number" class="tc-input" style="width:100%;box-sizing:border-box;" placeholder="e.g. 1200000" value="${prefill.income || ''}">
        </div>
        <button class="tc-btn" onclick="FinosTaxCalc._runCalc()" style="margin-top:18px;">Calculate →</button>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
        <!-- Old Regime Deductions -->
        <div>
          <div class="tc-section-head" style="border-top:none;padding-top:0;">80C Investments (Old Regime)</div>
          <div class="tc-form" style="grid-template-columns:1fr;">
            <div class="tc-field">
              <label class="tc-label">PPF / NSC / 5yr FD (₹)</label>
              <input id="tc-ppf" type="number" class="tc-input" placeholder="0" value="${prefill.inv_80c || ''}">
              <span class="tc-hint">Max ₹1.5L combined with all 80C</span>
            </div>
            <div class="tc-field">
              <label class="tc-label">ELSS Mutual Funds (₹)</label>
              <input id="tc-elss" type="number" class="tc-input" placeholder="0">
            </div>
            <div class="tc-field">
              <label class="tc-label">LIC Premium (₹)</label>
              <input id="tc-lic" type="number" class="tc-input" placeholder="0">
            </div>
            <div class="tc-field">
              <label class="tc-label">Home Loan Principal (₹)</label>
              <input id="tc-hlpri" type="number" class="tc-input" placeholder="0">
            </div>
          </div>
        </div>

        <div>
          <div class="tc-section-head" style="border-top:none;padding-top:0;">Other Deductions (Old Regime)</div>
          <div class="tc-form" style="grid-template-columns:1fr;">
            <div class="tc-field">
              <label class="tc-label">Health Insurance – Self (₹)</label>
              <input id="tc-health-self" type="number" class="tc-input" placeholder="0" value="${prefill.health_self || ''}">
              <span class="tc-hint">80D — max ₹25K (₹50K if age 60+)</span>
            </div>
            <div class="tc-field">
              <label class="tc-label">Health Insurance – Parents (₹)</label>
              <input id="tc-health-par" type="number" class="tc-input" placeholder="0">
              <span class="tc-hint">80D — max ₹25K (₹50K if parents 60+)</span>
            </div>
            <div class="tc-field">
              <label class="tc-label">NPS Contribution 80CCD(1B) (₹)</label>
              <input id="tc-nps" type="number" class="tc-input" placeholder="0">
              <span class="tc-hint">Max ₹50K above 80C limit</span>
            </div>
            <div class="tc-field">
              <label class="tc-label">Home Loan Interest (₹)</label>
              <input id="tc-hlint" type="number" class="tc-input" placeholder="0">
              <span class="tc-hint">Section 24B — max ₹2L (self-occupied)</span>
            </div>
          </div>
        </div>
      </div>

      <!-- HRA + LTCG row -->
      <div class="tc-form" style="margin-bottom:16px;">
        <div class="tc-field">
          <label class="tc-label">Monthly Rent Paid (₹)</label>
          <input id="tc-rent" type="number" class="tc-input" placeholder="0 if no HRA">
          <span class="tc-hint">HRA exemption auto-computed (50% basic metro)</span>
        </div>
        <div class="tc-field">
          <label class="tc-label">LTCG from Equity (₹)</label>
          <input id="tc-ltcg" type="number" class="tc-input" placeholder="0">
          <span class="tc-hint">₹1.25L free per year @ 12.5%</span>
        </div>
        <div class="tc-field">
          <label class="tc-label">STCG from Equity (₹)</label>
          <input id="tc-stcg" type="number" class="tc-input" placeholder="0">
          <span class="tc-hint">Taxed @ 20% in both regimes</span>
        </div>
        <div class="tc-field">
          <label class="tc-label">City</label>
          <select id="tc-city" class="tc-input">
            <option value="metro">Metro (Delhi, Mumbai, Kolkata, Chennai)</option>
            <option value="non_metro">Non-Metro</option>
          </select>
        </div>
      </div>

      <!-- Result area -->
      <div id="tc-result" style="display:none;"></div>
    `;
  }

  function _runCalc() {
    const income = parseFloat(document.getElementById('tc-income')?.value || '0');
    if (!income) {
      const el = document.getElementById('tc-income');
      if (el) { el.style.borderColor = '#FF4444'; setTimeout(() => el.style.borderColor = '', 1500); }
      return;
    }

    const params = {
      income,
      basic_pct:     50,
      monthly_rent:  parseFloat(document.getElementById('tc-rent')?.value   || '0'),
      city:          document.getElementById('tc-city')?.value || 'metro',
      inv_80c:       (parseFloat(document.getElementById('tc-ppf')?.value    || '0') +
                      parseFloat(document.getElementById('tc-elss')?.value   || '0') +
                      parseFloat(document.getElementById('tc-lic')?.value    || '0')),
      home_loan_pri: parseFloat(document.getElementById('tc-hlpri')?.value   || '0'),
      health_self:   parseFloat(document.getElementById('tc-health-self')?.value || '0'),
      health_parent: parseFloat(document.getElementById('tc-health-par')?.value  || '0'),
      nps_self:      parseFloat(document.getElementById('tc-nps')?.value     || '0'),
      home_loan_int: parseFloat(document.getElementById('tc-hlint')?.value   || '0'),
      ltcg:          parseFloat(document.getElementById('tc-ltcg')?.value    || '0'),
      stcg:          parseFloat(document.getElementById('tc-stcg')?.value    || '0'),
    };

    const result = compute(params);
    pushToContext(result);
    _renderResult(result);
  }

  function _renderResult(r) {
    const el = document.getElementById('tc-result');
    if (!el) return;

    const n = r.newRegime, o = r.oldRegime;
    const bestIsNew = r.best === 'new';
    const winnerText = bestIsNew
      ? `New Regime wins — save ${INR(r.saving)} compared to Old Regime`
      : `Old Regime wins — save ${INR(r.saving)} compared to New Regime`;

    const deductionRows = [
      { label: 'Standard Deduction', val: o.deductions.std },
      { label: 'HRA Exemption',       val: o.deductions.hra },
      { label: '80C (PPF/ELSS/LIC)',  val: o.deductions.s80c },
      { label: '80D Health Insurance',val: o.deductions.s80d },
      { label: '80CCD(1B) NPS',       val: o.deductions.nps },
      { label: '80CCD(2) Employer NPS',val:o.deductions.emp_nps },
      { label: 'Section 24B (HL Int)', val: o.deductions.sec24b },
    ].filter(d => d.val > 0);

    el.style.display = 'block';
    el.innerHTML = `
      <!-- Side-by-side regime table -->
      <div class="tc-compare">
        <div class="tc-regime tc-regime-new" style="${bestIsNew ? 'background:rgba(0,212,255,.08);' : ''}">
          <span class="tc-regime-badge" style="background:rgba(0,212,255,.12);color:#00D4FF;">New Regime FY25-26</span>
          <div class="tc-regime-row"><span class="label">Gross Income</span><span class="value">${INR(n.gross)}</span></div>
          <div class="tc-regime-row"><span class="label">Standard Deduction</span><span class="value">- ${INR(n.std_ded)}</span></div>
          ${n.emp_nps > 0 ? `<div class="tc-regime-row"><span class="label">Employer NPS 80CCD(2)</span><span class="value">- ${INR(n.emp_nps)}</span></div>` : ''}
          <div class="tc-regime-row" style="padding:8px 0;"><span class="label">Taxable Income</span><span class="value" style="color:#00D4FF;">${INR(n.taxable)}</span></div>
          <div class="tc-regime-row"><span class="label">Income Tax</span><span class="value">${INR(n.base_tax)}</span></div>
          ${n.surcharge > 0 ? `<div class="tc-regime-row"><span class="label">Surcharge</span><span class="value">${INR(n.surcharge)}</span></div>` : ''}
          <div class="tc-regime-row"><span class="label">Cess @4%</span><span class="value">${INR(n.cess)}</span></div>
          ${n.ltcg_tax > 0 ? `<div class="tc-regime-row"><span class="label">LTCG Tax @12.5%</span><span class="value">${INR(n.ltcg_tax)}</span></div>` : ''}
          ${n.stcg_tax > 0 ? `<div class="tc-regime-row"><span class="label">STCG Tax @20%</span><span class="value">${INR(n.stcg_tax)}</span></div>` : ''}
          <div style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.1);">
            <div class="tc-regime-row"><span class="label" style="font-weight:800;">Total Tax</span><span class="value" style="font-size:22px;color:#00D4FF;font-weight:900;">${INR(n.total_tax)}</span></div>
            <div class="tc-regime-row"><span class="label">Effective Rate</span><span class="value">${n.effective_rate.toFixed(1)}%</span></div>
          </div>
          ${bestIsNew ? '<div style="margin-top:10px;font-size:11px;font-weight:700;color:#00D4FF;text-align:center;background:rgba(0,212,255,.08);border-radius:8px;padding:6px;">✓ RECOMMENDED</div>' : ''}
        </div>

        <div class="tc-regime tc-regime-old" style="${!bestIsNew ? 'background:rgba(34,211,166,.08);' : ''}">
          <span class="tc-regime-badge" style="background:rgba(34,211,166,.12);color:#22D3A6;">Old Regime FY25-26</span>
          <div class="tc-regime-row"><span class="label">Gross Income</span><span class="value">${INR(o.gross)}</span></div>
          ${deductionRows.map(d => `<div class="tc-regime-row"><span class="label">${d.label}</span><span class="value">- ${INR(d.val)}</span></div>`).join('')}
          <div class="tc-regime-row"><span class="label" style="font-weight:700;color:rgba(255,255,255,.5);">Total Deductions</span><span class="value" style="color:#22D3A6;">- ${INR(o.deductions.total)}</span></div>
          <div class="tc-regime-row" style="padding:8px 0;"><span class="label">Taxable Income</span><span class="value" style="color:#22D3A6;">${INR(o.taxable)}</span></div>
          <div class="tc-regime-row"><span class="label">Income Tax</span><span class="value">${INR(o.base_tax)}</span></div>
          ${o.surcharge > 0 ? `<div class="tc-regime-row"><span class="label">Surcharge</span><span class="value">${INR(o.surcharge)}</span></div>` : ''}
          <div class="tc-regime-row"><span class="label">Cess @4%</span><span class="value">${INR(o.cess)}</span></div>
          ${o.ltcg_tax > 0 ? `<div class="tc-regime-row"><span class="label">LTCG Tax @12.5%</span><span class="value">${INR(o.ltcg_tax)}</span></div>` : ''}
          ${o.stcg_tax > 0 ? `<div class="tc-regime-row"><span class="label">STCG Tax @20%</span><span class="value">${INR(o.stcg_tax)}</span></div>` : ''}
          <div style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.1);">
            <div class="tc-regime-row"><span class="label" style="font-weight:800;">Total Tax</span><span class="value" style="font-size:22px;color:#22D3A6;font-weight:900;">${INR(o.total_tax)}</span></div>
            <div class="tc-regime-row"><span class="label">Effective Rate</span><span class="value">${o.effective_rate.toFixed(1)}%</span></div>
          </div>
          ${!bestIsNew ? '<div style="margin-top:10px;font-size:11px;font-weight:700;color:#22D3A6;text-align:center;background:rgba(34,211,166,.08);border-radius:8px;padding:6px;">✓ RECOMMENDED</div>' : ''}
        </div>

        <div class="tc-winner">
          <span style="font-size:20px;">${bestIsNew ? '🆕' : '📋'}</span>
          <div>
            <div style="font-size:13px;font-weight:800;color:#F5F7FA;">${winnerText}</div>
            <div style="font-size:11px;color:#8892A4;">Based on your deductions for FY 2025-26. Submit declaration to employer before Feb 28.</div>
          </div>
        </div>
      </div>

      <!-- Action plan -->
      ${r.actions.length > 0 ? `
        <div class="tc-actions">
          <div style="font-size:12px;font-weight:700;color:#8892A4;text-transform:uppercase;letter-spacing:.7px;margin-bottom:10px;">📋 Action Plan — Before March 31</div>
          ${r.actions.map(a => `
            <div class="tc-action-item tc-action-${a.priority}">
              <div class="tc-action-cat">${a.category}</div>
              <div style="color:#F5F7FA;line-height:1.5;">${a.text}</div>
            </div>`).join('')}
        </div>` : ''}

      <!-- Gap summary (old regime only) -->
      ${r.best === 'old' && (o.gaps.s80c > 0 || o.gaps.nps > 0) ? `
        <div style="margin-top:16px;padding:16px;background:rgba(255,255,255,.02);border-radius:12px;border:1px solid rgba(255,255,255,.06);">
          <div style="font-size:11px;font-weight:700;color:#8892A4;text-transform:uppercase;letter-spacing:.7px;margin-bottom:10px;">Unused Deduction Capacity (Old Regime)</div>
          ${o.gaps.s80c > 0 ? `<div class="tc-deduction-row"><span style="color:#8892A4;">80C capacity remaining</span><span style="font-weight:700;color:#F0A500;">${INR(o.gaps.s80c)}</span></div>` : ''}
          ${o.gaps.nps > 0  ? `<div class="tc-deduction-row"><span style="color:#8892A4;">NPS 80CCD(1B) remaining</span><span style="font-weight:700;color:#F0A500;">${INR(o.gaps.nps)}</span></div>` : ''}
          ${o.gaps.ltcg_free > 0 ? `<div class="tc-deduction-row"><span style="color:#8892A4;">LTCG tax-free window remaining</span><span style="font-weight:700;color:#22D3A6;">${INR(o.gaps.ltcg_free)}</span></div>` : ''}
        </div>` : ''}

      <div style="font-size:11px;color:rgba(255,255,255,.2);margin-top:12px;">
        Rates: FY 2025-26 · Includes Health & Education Cess @4% · Surcharge for income &gt;₹50L · LTCG ₹1.25L exempt @12.5% (Budget 2024) · For professional advice consult a CA.
      </div>
    `;

    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ── Public API ─────────────────────────────────────────────────── */
  global.FinosTaxCalc = { compute, autoFill, pushToContext, renderPlanner, _runCalc, _renderResult };

}(window));
