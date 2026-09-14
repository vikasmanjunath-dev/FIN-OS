/* finos-salary-optimizer.js — Salary CTC Restructuring & Optimization
 *
 * Public API (window.FinosSalaryOptimizer):
 *   renderStructure(el)   — CTC breakup form + take-home calculator
 *   renderHRA(el)         — HRA exemption deep-dive
 *   renderOptimize(el)    — restructuring suggestions for max tax saving
 *
 * Key India rules implemented:
 *   HRA exemption = min(actualHRA, rent-10%basic, 50%/40% of basic)
 *   LTA: exempt 2× in 4-year block; only travel cost, not hotel
 *   NPS 80CCD(2): employer NPS deductible — 10% of basic (14% for govt)
 *   Standard deduction: ₹75,000 (FY 2025-26 new regime), ₹50,000 old
 *   Professional tax: ₹2,400/yr max (state-specific)
 *   Gratuity: 4.81% of basic (provisioned; tax-free up to ₹20L on exit)
 *
 * localStorage written:
 *   finos_salary_ctc         — annual CTC
 *   finos_salary_basic       — annual basic
 *   finos_salary_hra_received— annual HRA from employer
 *   finos_salary_lta         — annual LTA
 *   finos_salary_special     — special allowance
 *   finos_salary_nps_er      — employer NPS contribution (annual)
 *   finos_salary_rent_paid   — annual rent paid
 *   finos_salary_city        — metro / non-metro flag
 *   finos_salary_pf          — employee PF contribution (annual, 12% basic)
 *   finos_salary_take_home   — computed net monthly take-home
 *   finos_monthly_income     — alias for finos_salary_take_home (feeds budget)
 */
window.FinosSalaryOptimizer = (function () {
  'use strict';

  const gs  = k => parseFloat(localStorage.getItem(k)) || 0;
  const ss  = (k, v) => localStorage.setItem(k, v);
  const gss = k => localStorage.getItem(k) || '';
  const INR = v => '₹' + Math.abs(Math.round(v)).toLocaleString('en-IN');

  /* ── HRA exemption (Section 10(13A)) ─────────────────────────── */
  function _hraExempt(basic, hraReceived, rentPaid, isMetro) {
    if (rentPaid <= 0) return 0;
    const a = hraReceived;
    const b = rentPaid - 0.1 * basic;
    const c = basic * (isMetro ? 0.5 : 0.4);
    return Math.max(0, Math.min(a, b, c));
  }

  /* ── Core computation ─────────────────────────────────────────── */
  function _compute() {
    const ctc       = gs('finos_salary_ctc');
    const basic     = gs('finos_salary_basic');
    const hraRcvd   = gs('finos_salary_hra_received');
    const lta       = gs('finos_salary_lta');
    const special   = gs('finos_salary_special');
    const npsEr     = gs('finos_salary_nps_er');
    const rentPaid  = gs('finos_salary_rent_paid');
    const isMetro   = gss('finos_salary_city') !== 'non-metro';
    const regime    = gss('finos_salary_regime') || 'new';

    // Standard deductions
    const stdDedn   = regime === 'new' ? 75000 : 50000;
    const pfEmp     = Math.round(basic * 0.12);          // employee PF
    const pfEr      = Math.min(Math.round(basic * 0.0367), 1800 * 12); // employer PF (EPF)
    const gratuity  = Math.round(basic * 0.0481);        // provisioned
    const profTax   = 2400;                              // max ₹2,400/yr

    // HRA
    const hraExempt = _hraExempt(basic, hraRcvd, rentPaid, isMetro);

    // Gross taxable (old regime uses exemptions)
    const grossSalary   = basic + hraRcvd + lta + special;
    const taxableOld    = grossSalary - hraExempt - stdDedn - profTax;
    const taxableNew    = grossSalary - stdDedn;          // no HRA/LTA exemptions

    // 80C bucket (PF employee contribution)
    const c80c          = Math.min(pfEmp, 150000);
    // 80CCD(2) employer NPS
    const c80ccd2       = Math.min(npsEr, Math.round(basic * 0.10));
    const taxableOldNet = Math.max(taxableOld - c80c - c80ccd2, 0);
    const taxableNewNet = Math.max(taxableNew - c80ccd2, 0);

    // Simple slab tax (no surcharge, no cess for brevity — approximate)
    const _tax = (income, isNew) => {
      if (isNew) {
        // New regime FY 2025-26
        if (income <= 400000)  return 0;
        if (income <= 800000)  return (income - 400000) * 0.05;
        if (income <= 1200000) return 20000 + (income - 800000) * 0.10;
        if (income <= 1600000) return 60000 + (income - 1200000) * 0.15;
        if (income <= 2000000) return 120000 + (income - 1600000) * 0.20;
        if (income <= 2400000) return 200000 + (income - 2000000) * 0.25;
        return 300000 + (income - 2400000) * 0.30;
      } else {
        // Old regime FY 2025-26
        if (income <= 250000)  return 0;
        if (income <= 500000)  return (income - 250000) * 0.05;
        if (income <= 1000000) return 12500 + (income - 500000) * 0.20;
        return 112500 + (income - 1000000) * 0.30;
      }
    };

    const taxOld    = Math.round(_tax(taxableOldNet, false) * 1.04); // +4% cess
    const taxNew    = Math.round(_tax(taxableNewNet, true)  * 1.04);
    const betterRegime = taxNew <= taxOld ? 'new' : 'old';
    const taxChosen = regime === 'new' ? taxNew : taxOld;

    // Take-home
    const deductions  = pfEmp + profTax + taxChosen / 12 * 12; // annual
    const takeHomeAnn = grossSalary - deductions;
    const takeHomeMo  = Math.round(takeHomeAnn / 12);

    ss('finos_salary_pf',        pfEmp);
    ss('finos_salary_take_home', takeHomeMo);
    ss('finos_monthly_income',   takeHomeMo);

    return {
      ctc, basic, hraRcvd, lta, special, npsEr, rentPaid, isMetro, regime,
      hraExempt, grossSalary, pfEmp, pfEr, gratuity, profTax, stdDedn,
      c80c, c80ccd2, taxableOldNet, taxableNewNet,
      taxOld, taxNew, betterRegime, taxChosen,
      takeHomeMo, takeHomeAnn
    };
  }

  /* ── Auto-save debounce ───────────────────────────────────────── */
  let _t;
  function _save(key, val) {
    ss(key, val);
    clearTimeout(_t);
    _t = setTimeout(_refresh, 600);
  }

  function _refresh() {
    const c = _compute();
    const el = id => document.getElementById(id);
    const set = (id, txt) => el(id) && (el(id).textContent = txt);
    set('so-takehome',    INR(c.takeHomeMo) + '/mo');
    set('so-tax-chosen',  INR(c.taxChosen));
    set('so-hra-exempt',  INR(c.hraExempt));
    set('so-pf-emp',      INR(c.pfEmp));
    set('so-gross',       INR(c.grossSalary));
    set('so-tax-old',     INR(c.taxOld));
    set('so-tax-new',     INR(c.taxNew));
  }

  /* ══════════════════════════════════════════════════════════════
     STRUCTURE TAB
  ══════════════════════════════════════════════════════════════ */
  function renderStructure(container) {
    if (!container) return;
    const c = _compute();

    container.innerHTML = `
<style>
.so-hero{background:linear-gradient(135deg,rgba(155,93,229,.08),rgba(79,124,255,.05));border:1px solid rgba(155,93,229,.2);border-radius:20px;padding:26px;margin-bottom:22px;display:flex;align-items:center;gap:28px;flex-wrap:wrap;}
.so-hero-lbl{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,.4);margin-bottom:6px;}
.so-hero-val{font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:40px;font-weight:900;color:#9B5DE5;letter-spacing:-1px;line-height:1;}
.so-hero-sub{font-size:13px;color:rgba(255,255,255,.45);margin-top:7px;}
.so-regime-row{display:flex;gap:10px;margin-top:12px;}
.so-regime-pill{flex:1;padding:10px 14px;border-radius:12px;border:1px solid;text-align:center;}
.so-stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;margin-bottom:22px;}
.so-stat{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:14px;text-align:center;}
.so-stat-lbl{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,.4);margin-bottom:6px;}
.so-stat-val{font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:17px;font-weight:800;color:#fff;}
.so-stat-sub{font-size:10px;color:rgba(255,255,255,.35);margin-top:3px;}
.so-form{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:20px;margin-bottom:20px;}
.so-sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,.4);margin:0 0 12px;}
.so-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px;margin-bottom:16px;}
.so-field{display:flex;flex-direction:column;gap:6px;}
.so-field label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:rgba(255,255,255,.4);}
.so-inp{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:#fff;font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:14px;padding:10px 14px;width:100%;box-sizing:border-box;outline:none;transition:border-color .2s;}
.so-inp:focus{border-color:rgba(155,93,229,.5);background:rgba(155,93,229,.05);}
.so-note{font-size:11px;color:rgba(255,255,255,.35);margin-top:3px;line-height:1.5;}
[data-theme="light"] .so-hero,.so-form,.so-stat{background:#fff;border-color:rgba(0,0,0,.08);}
[data-theme="light"] .so-inp{background:#F4F6FB;border-color:rgba(0,0,0,.12);color:#0B0D12;}
[data-theme="light"] .so-hero{background:rgba(155,93,229,.05);}
[data-theme="light"] .so-hero-val{color:#7B2FF7;}
[data-theme="light"] .so-stat-val{color:#0B0D12;}
</style>

<div class="so-hero">
  <div>
    <div class="so-hero-lbl">Monthly Take-Home</div>
    <div class="so-hero-val" id="so-takehome">${INR(c.takeHomeMo)}/mo</div>
    <div class="so-hero-sub">Gross salary ${INR(c.grossSalary/12)}/mo &nbsp;·&nbsp; Tax (annual) <span id="so-tax-chosen">${INR(c.taxChosen)}</span> &nbsp;·&nbsp; PF <span id="so-pf-emp">${INR(c.pfEmp)}</span>/yr</div>
    <div class="so-regime-row">
      <div class="so-regime-pill" style="${c.betterRegime==='new'?'background:rgba(34,211,166,.08);border-color:rgba(34,211,166,.3);':'background:rgba(255,255,255,.03);border-color:rgba(255,255,255,.1);'}">
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,.4);margin-bottom:3px;">New Regime</div>
        <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:15px;font-weight:800;color:${c.betterRegime==='new'?'#22D3A6':'rgba(255,255,255,.6)'};" id="so-tax-new">${INR(c.taxNew)}</div>
        ${c.betterRegime==='new'?'<div style="font-size:9px;color:#22D3A6;margin-top:2px;">BETTER ✓</div>':''}
      </div>
      <div class="so-regime-pill" style="${c.betterRegime==='old'?'background:rgba(34,211,166,.08);border-color:rgba(34,211,166,.3);':'background:rgba(255,255,255,.03);border-color:rgba(255,255,255,.1);'}">
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,.4);margin-bottom:3px;">Old Regime</div>
        <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:15px;font-weight:800;color:${c.betterRegime==='old'?'#22D3A6':'rgba(255,255,255,.6)'};" id="so-tax-old">${INR(c.taxOld)}</div>
        ${c.betterRegime==='old'?'<div style="font-size:9px;color:#22D3A6;margin-top:2px;">BETTER ✓</div>':''}
      </div>
    </div>
  </div>
</div>

<div class="so-stats">
  <div class="so-stat" style="border-color:rgba(155,93,229,.2);">
    <div class="so-stat-lbl">Annual CTC</div>
    <div class="so-stat-val" style="color:#9B5DE5;">${INR(c.ctc)}</div>
    <div class="so-stat-sub">cost to company</div>
  </div>
  <div class="so-stat" style="border-color:rgba(0,212,255,.2);">
    <div class="so-stat-lbl">Gross Salary</div>
    <div class="so-stat-val" style="color:#00D4FF;" id="so-gross">${INR(c.grossSalary)}</div>
    <div class="so-stat-sub">before deductions</div>
  </div>
  <div class="so-stat" style="border-color:rgba(34,211,166,.2);">
    <div class="so-stat-lbl">HRA Exemption</div>
    <div class="so-stat-val" style="color:#22D3A6;" id="so-hra-exempt">${INR(c.hraExempt)}</div>
    <div class="so-stat-sub">Sec 10(13A)</div>
  </div>
  <div class="so-stat" style="border-color:rgba(255,179,71,.2);">
    <div class="so-stat-lbl">PF (Employee)</div>
    <div class="so-stat-val" style="color:#FFB347;">${INR(c.pfEmp)}</div>
    <div class="so-stat-sub">12% of basic/yr</div>
  </div>
</div>

<div class="so-form">
  <p class="so-sec">CTC Breakup (Annual ₹)</p>
  <div class="so-grid">
    <div class="so-field">
      <label>Total CTC</label>
      <input class="so-inp" type="number" min="0" step="10000" placeholder="1200000"
        value="${c.ctc||''}" oninput="_soSave('finos_salary_ctc',this.value)">
    </div>
    <div class="so-field">
      <label>Basic Salary</label>
      <input class="so-inp" type="number" min="0" step="5000" placeholder="480000"
        value="${c.basic||''}" oninput="_soSave('finos_salary_basic',this.value)">
      <span class="so-note">Typically 40–50% of CTC. Drives PF, HRA, gratuity.</span>
    </div>
    <div class="so-field">
      <label>HRA (from employer)</label>
      <input class="so-inp" type="number" min="0" step="5000" placeholder="240000"
        value="${c.hraRcvd||''}" oninput="_soSave('finos_salary_hra_received',this.value)">
      <span class="so-note">Typically 50% of basic (metro) or 40% (non-metro).</span>
    </div>
    <div class="so-field">
      <label>LTA</label>
      <input class="so-inp" type="number" min="0" step="5000" placeholder="50000"
        value="${c.lta||''}" oninput="_soSave('finos_salary_lta',this.value)">
      <span class="so-note">Leave Travel Allowance — tax-free 2× in 4-year block.</span>
    </div>
    <div class="so-field">
      <label>Special Allowance</label>
      <input class="so-inp" type="number" min="0" step="5000" placeholder="200000"
        value="${c.special||''}" oninput="_soSave('finos_salary_special',this.value)">
      <span class="so-note">Fully taxable. Balancing component in most pay slips.</span>
    </div>
    <div class="so-field">
      <label>Employer NPS (annual)</label>
      <input class="so-inp" type="number" min="0" step="1000" placeholder="0"
        value="${c.npsEr||''}" oninput="_soSave('finos_salary_nps_er',this.value)">
      <span class="so-note">80CCD(2): deductible up to 10% of basic — on top of 80C.</span>
    </div>
  </div>
  <p class="so-sec">Housing & Location</p>
  <div class="so-grid">
    <div class="so-field">
      <label>Actual Rent Paid (annual)</label>
      <input class="so-inp" type="number" min="0" step="5000" placeholder="0"
        value="${c.rentPaid||''}" oninput="_soSave('finos_salary_rent_paid',this.value)">
    </div>
    <div class="so-field">
      <label>City Type</label>
      <select class="so-inp" onchange="_soSave('finos_salary_city',this.value)">
        <option value="metro"     ${c.isMetro?'selected':''}>Metro (Mumbai/Delhi/Bengaluru/Chennai/Kolkata/Hyderabad) — 50% basic</option>
        <option value="non-metro" ${!c.isMetro?'selected':''}>Non-Metro — 40% of basic</option>
      </select>
    </div>
    <div class="so-field">
      <label>Tax Regime</label>
      <select class="so-inp" onchange="_soSave('finos_salary_regime',this.value)">
        <option value="new" ${c.regime==='new'?'selected':''}>New Regime (default from FY 2024-25)</option>
        <option value="old" ${c.regime==='old'?'selected':''}>Old Regime (opt-in; file Form 10-IEA)</option>
      </select>
    </div>
  </div>
</div>

<script>
function _soSave(k,v){localStorage.setItem(k,v);clearTimeout(window._soT);window._soT=setTimeout(()=>window.FinosSalaryOptimizer&&window.FinosSalaryOptimizer._refresh(),600);}
</script>`;
  }

  /* ══════════════════════════════════════════════════════════════
     HRA TAB
  ══════════════════════════════════════════════════════════════ */
  function renderHRA(container) {
    if (!container) return;
    const c = _compute();
    const a = c.hraRcvd;
    const b = Math.max(c.rentPaid - 0.1 * c.basic, 0);
    const city = c.isMetro ? 0.5 : 0.4;
    const cc   = c.basic * city;
    const exempt = c.hraExempt;
    const taxable = c.hraRcvd - exempt;

    const leg = (label, val, isMin) => `
      <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:12px;margin-bottom:8px;
        background:${isMin?'rgba(34,211,166,.07)':'rgba(255,255,255,.02)'};
        border:1px solid ${isMin?'rgba(34,211,166,.25)':'rgba(255,255,255,.06)'};">
        <div style="flex:1;font-size:13px;color:${isMin?'#fff':'rgba(255,255,255,.55)'};">${label}</div>
        <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:15px;font-weight:800;color:${isMin?'#22D3A6':'rgba(255,255,255,.5)'};">${INR(val)}</div>
        ${isMin?'<div style="font-size:10px;color:#22D3A6;font-weight:700;">MIN ✓</div>':''}
      </div>`;

    const minVal = Math.min(a, b, cc);

    container.innerHTML = `
<div style="background:rgba(34,211,166,.06);border:1px solid rgba(34,211,166,.18);border-radius:20px;padding:24px;margin-bottom:22px;">
  <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,.4);margin-bottom:8px;">HRA Exemption (Section 10(13A))</div>
  <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:38px;font-weight:900;color:#22D3A6;">${INR(exempt)}</div>
  <div style="font-size:13px;color:rgba(255,255,255,.45);margin-top:6px;">
    of ${INR(c.hraRcvd)} HRA received &nbsp;·&nbsp; ${INR(taxable)} remains taxable
  </div>
</div>

<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:20px;margin-bottom:20px;">
  <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,.4);margin-bottom:14px;">The Three-Way Minimum Rule</div>
  <div style="font-size:12px;color:rgba(255,255,255,.4);margin-bottom:10px;">Exemption = minimum of (A, B, C):</div>
  ${leg('A — Actual HRA received from employer', a, a === minVal && a > 0)}
  ${leg(`B — Rent paid (${INR(c.rentPaid)}) minus 10% of basic (${INR(c.basic * 0.1)})`, b, b === minVal && b > 0)}
  ${leg(`C — ${c.isMetro?'50%':'40%'} of basic salary (${c.isMetro?'metro':'non-metro'} city)`, cc, cc === minVal && cc > 0)}
</div>

<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:20px;">
  <div style="font-size:13px;font-weight:800;color:#22D3A6;margin-bottom:12px;">HRA Optimization Tips</div>
  <div style="display:flex;flex-direction:column;gap:8px;font-size:13px;color:rgba(255,255,255,.65);line-height:1.7;">
    <span>🟢 Pay rent to <strong>parents</strong> if you live with them — rent paid to parents is valid if they own the house and declare it as income.</span>
    <span>🟢 Keep <strong>rent receipts</strong> for rent above ₹1L/yr and get landlord's PAN — employer will require it.</span>
    <span>🟡 Rent above ₹50,000/month → <strong>TDS 5%</strong> must be deducted (Section 194-IB).</span>
    <span>🟡 If you own a house in the same city you work — HRA exemption <strong>is not available</strong>.</span>
    <span>🔴 HRA exemption is only available under the <strong>old regime</strong>. Under the new regime, full HRA is taxable.</span>
    <span>💡 Claim HRA + home loan interest (Sec 24) if house is in a different city — both exemptions are valid simultaneously.</span>
  </div>
</div>`;
  }

  /* ══════════════════════════════════════════════════════════════
     OPTIMIZE TAB
  ══════════════════════════════════════════════════════════════ */
  function renderOptimize(container) {
    if (!container) return;
    const c = _compute();

    // Identify optimization opportunities
    const tips = [];

    // 1. Employer NPS
    const maxNpsEr = Math.round(c.basic * 0.10);
    if (c.npsEr < maxNpsEr) {
      const gap = maxNpsEr - c.npsEr;
      const saving = Math.round(gap * 0.30 * 1.04); // ~30% slab + cess
      tips.push({
        icon: '🏛️', title: 'Maximise Employer NPS (80CCD(2))',
        saving, action: `Ask HR to route ${INR(gap)}/yr more as employer NPS. This reduces your special allowance by the same amount but saves ~${INR(saving)} in tax — completely outside 80C limit.`,
        color: '#00D4FF'
      });
    }

    // 2. HRA if not claiming
    if (c.rentPaid === 0 && c.hraRcvd > 0) {
      const potentialExempt = Math.min(c.hraRcvd, c.basic * (c.isMetro ? 0.5 : 0.4));
      const saving = Math.round(potentialExempt * 0.30 * 1.04);
      tips.push({
        icon: '🏠', title: 'Claim HRA Exemption (Old Regime)',
        saving, action: `If you pay rent, switch to old regime and claim HRA. With your current HRA of ${INR(c.hraRcvd)}, you could exempt up to ~${INR(potentialExempt)}, saving ~${INR(saving)} in tax.`,
        color: '#22D3A6'
      });
    }

    // 3. Special allowance → flexi benefits
    if (c.special > 100000) {
      tips.push({
        icon: '🎁', title: 'Convert Special Allowance to Flexi Benefits',
        saving: Math.round(c.special * 0.30 * 0.30), // rough estimate 30% of 30% slab
        action: `Ask HR to convert part of the ₹${INR(c.special)} special allowance into tax-exempt perquisites: meal coupons (₹26,400/yr), telephone reimbursement, books & periodicals, uniform allowance. Each reduces taxable income.`,
        color: '#FFB347'
      });
    }

    // 4. Regime switch
    if (c.taxOld < c.taxNew) {
      const saving = c.taxNew - c.taxOld;
      tips.push({
        icon: '🔄', title: 'Switch to Old Regime',
        saving, action: `Old regime saves you ${INR(saving)}/yr after accounting for HRA, 80C, and other deductions. File Form 10-IEA before July 31 to opt in. Your employer needs updated Form 12BB.`,
        color: '#9B5DE5'
      });
    } else if (c.taxNew < c.taxOld) {
      const saving = c.taxOld - c.taxNew;
      tips.push({
        icon: '✅', title: 'Stay on New Regime (Already Optimal)',
        saving, action: `New regime saves ${INR(saving)}/yr vs old regime given your current deduction profile. Higher standard deduction (₹75,000) and simpler compliance make this the right choice.`,
        color: '#22D3A6'
      });
    }

    // 5. LTA
    if (c.lta === 0) {
      tips.push({
        icon: '✈️', title: 'Request LTA in Salary Structure',
        saving: Math.round(50000 * 0.30),
        action: 'Ask HR to include Leave Travel Allowance — exempt for domestic travel (cheapest airfare) 2× in a 4-year block. ₹50,000/yr LTA saves ~₹15,000/yr in old regime.',
        color: '#4F7CFF'
      });
    }

    const tipCards = tips.map(t => `
      <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-left:3px solid ${t.color};border-radius:14px;padding:18px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px;flex-wrap:wrap;">
          <div style="font-size:14px;font-weight:800;color:#F5F7FA;">${t.icon} ${t.title}</div>
          <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:15px;font-weight:900;color:${t.color};white-space:nowrap;">Save ~${INR(t.saving)}/yr</div>
        </div>
        <div style="font-size:13px;color:rgba(255,255,255,.6);line-height:1.65;">${t.action}</div>
      </div>`).join('');

    container.innerHTML = `
<div style="background:rgba(155,93,229,.06);border:1px solid rgba(155,93,229,.18);border-radius:20px;padding:22px;margin-bottom:22px;">
  <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,.4);margin-bottom:6px;">Potential Annual Tax Saving</div>
  <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:36px;font-weight:900;color:#9B5DE5;">
    ${INR(tips.reduce((s,t)=>s+t.saving,0))}
  </div>
  <div style="font-size:13px;color:rgba(255,255,255,.4);margin-top:6px;">across ${tips.length} optimization${tips.length!==1?'s':''} identified for your salary structure</div>
</div>

${tips.length ? tipCards : '<div style="text-align:center;padding:28px;color:rgba(255,255,255,.35);font-size:13px;">Enter your salary breakup to see personalized optimization tips.</div>'}

<div style="background:rgba(255,179,71,.05);border:1px solid rgba(255,179,71,.12);border-radius:14px;padding:16px;margin-top:16px;font-size:12px;color:rgba(255,255,255,.5);line-height:1.6;">
  ⚠️ Tax estimates are approximate — based on simplified slabs without surcharge or all perquisite rules. Consult a CA for exact structuring.
</div>`;
  }

  /* Public */
  return { renderStructure, renderHRA, renderOptimize, _refresh, _compute };
})();
