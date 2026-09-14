/* finos-home-loan.js — Home Loan EMI & Prepayment Planner
 *
 * Covers the full lifecycle of an Indian home loan:
 *   — EMI computation: P × r × (1+r)^n / ((1+r)^n - 1)
 *   — Amortisation: year-by-year principal + interest breakup
 *   — Prepayment impact: lump-sum reduces either tenure or EMI
 *   — Tax benefit: Sec 24(b) interest deduction (max ₹2L) + 80C principal (max ₹1.5L)
 *   — Affordability check: EMI ≤ 40% of gross monthly income
 *   — PMAY-CLSS eligibility: first-time buyer, income < ₹18L
 *
 * localStorage written:
 *   finos_home_loan_emi            — monthly EMI
 *   finos_home_loan_total_interest — total interest over full tenure
 *   finos_home_loan_outstanding    — current outstanding (reads finos_total_liabilities as seed)
 *
 * Reads:
 *   finos_gross_income, finos_monthly_income, finos_80c_used, finos_s80c_gap
 *
 * Exported: window.FinosHomeLoan
 */
window.FinosHomeLoan = (function () {
  'use strict';

  const gs  = k => parseFloat(localStorage.getItem(k)) || 0;
  const ss  = (k, v) => localStorage.setItem(k, String(v));
  const gss = k => localStorage.getItem(k) || '';
  const INR = v => '₹' + Math.abs(Math.round(v)).toLocaleString('en-IN');
  const CR  = v => (v / 1e7).toFixed(2) + ' Cr';
  const L   = v => (v / 1e5).toFixed(1) + ' L';
  const fmt = v => v >= 1e7 ? CR(v) : v >= 1e5 ? L(v) : INR(v);

  /* ── EMI formula ───────────────────────────────────────────────── */
  function _emi(principal, annualRate, tenureYears) {
    const r = annualRate / 100 / 12;
    const n = tenureYears * 12;
    if (r === 0) return Math.round(principal / n);
    return Math.round(principal * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1));
  }

  /* ── Amortisation schedule ─────────────────────────────────────── */
  function _amortise(principal, annualRate, tenureYears) {
    const r   = annualRate / 100 / 12;
    const emi = _emi(principal, annualRate, tenureYears);
    let balance = principal;
    const yearly = [];
    let totalInterest = 0, totalPrincipal = 0;
    const years = tenureYears;

    for (let y = 0; y < years; y++) {
      let yInt = 0, yPrin = 0;
      for (let m = 0; m < 12; m++) {
        if (balance <= 0) break;
        const intPart  = balance * r;
        const prinPart = Math.min(emi - intPart, balance);
        yInt    += intPart;
        yPrin   += prinPart;
        balance -= prinPart;
        totalInterest   += intPart;
        totalPrincipal  += prinPart;
      }
      yearly.push({ year: y + 1, interest: Math.round(yInt), principal: Math.round(yPrin), balance: Math.max(0, Math.round(balance)) });
      if (balance <= 0) break;
    }
    return { emi, yearly, totalInterest: Math.round(totalInterest), totalPrincipal: Math.round(totalPrincipal) };
  }

  /* ── Prepayment impact ─────────────────────────────────────────── */
  function _prepayImpact(principal, annualRate, tenureYears, prepayAmount, prepayYear) {
    const r   = annualRate / 100 / 12;
    const emi = _emi(principal, annualRate, tenureYears);
    let balance    = principal;
    let months     = 0;
    let totalInt   = 0;
    let prepaid    = false;

    while (balance > 0 && months < tenureYears * 12 + 120) {
      const intPart  = balance * r;
      const prinPart = Math.min(emi - intPart, balance);
      totalInt  += intPart;
      balance   -= prinPart;
      months++;
      if (!prepaid && months === prepayYear * 12) {
        balance  = Math.max(0, balance - prepayAmount);
        prepaid  = true;
      }
    }
    const savedMonths  = tenureYears * 12 - months;
    const savedInterest= Math.round(Math.max(0, _amortise(principal, annualRate, tenureYears).totalInterest - totalInt));
    return { newTenureMonths: months, savedMonths, savedInterest, newTotalInt: Math.round(totalInt) };
  }

  /* ── Load inputs ───────────────────────────────────────────────── */
  function _loadInputs() {
    const grossIncome = gs('finos_gross_income') || gs('finos_monthly_income') * 12 || 1800000;
    return {
      loanAmount:   parseFloat(gss('finos_hl_amount')   || '5000000'),
      interestRate: parseFloat(gss('finos_hl_rate')     || '8.75'),
      tenureYears:  parseInt(gss('finos_hl_tenure')     || '20'),
      prepayAmount: parseFloat(gss('finos_hl_prepay')   || '200000'),
      prepayYear:   parseInt(gss('finos_hl_prepayyr')   || '3'),
      grossIncome,
      monthlyIncome: gs('finos_monthly_income') || grossIncome / 12,
    };
  }

  /* ── Core compute ──────────────────────────────────────────────── */
  function _compute(p) {
    const sched = _amortise(p.loanAmount, p.interestRate, p.tenureYears);
    const emi   = sched.emi;
    const monthlyIncome = p.monthlyIncome || (p.grossIncome / 12);

    // Affordability
    const emiPct         = monthlyIncome > 0 ? (emi / monthlyIncome * 100).toFixed(1) : '—';
    const affordable     = parseFloat(emiPct) <= 40;
    const maxAffordEMI   = Math.round(monthlyIncome * 0.40);
    const maxAffordLoan  = monthlyIncome > 0
      ? Math.round(maxAffordEMI * (Math.pow(1+p.interestRate/100/12,p.tenureYears*12)-1) / (p.interestRate/100/12 * Math.pow(1+p.interestRate/100/12,p.tenureYears*12)))
      : 0;

    // Tax benefit (Sec 24b interest max ₹2L, 80C principal max ₹1.5L)
    const yr1Int        = sched.yearly[0]?.interest || 0;
    const yr1Prin       = sched.yearly[0]?.principal || 0;
    const sec24bDeduct  = Math.min(200000, yr1Int);
    const sec80cDeduct  = Math.min(150000, yr1Prin);
    const totalTaxDeduct= sec24bDeduct + sec80cDeduct;

    // Prepayment
    const prepay = _prepayImpact(p.loanAmount, p.interestRate, p.tenureYears, p.prepayAmount, p.prepayYear);

    // PMAY eligibility (income check — simplified)
    const grossAnnual = p.grossIncome || (monthlyIncome * 12);
    const pmayEligible = grossAnnual <= 1800000; // MIG-I ≤ ₹12L, MIG-II ≤ ₹18L

    ss('finos_home_loan_emi',            emi);
    ss('finos_home_loan_total_interest', sched.totalInterest);
    ss('finos_home_loan_outstanding',    p.loanAmount);

    return {
      emi, sched, emiPct, affordable, maxAffordEMI, maxAffordLoan,
      sec24bDeduct, sec80cDeduct, totalTaxDeduct, yr1Int, yr1Prin,
      prepay, pmayEligible,
      totalCost: p.loanAmount + sched.totalInterest,
    };
  }

  /* ── Input row ──────────────────────────────────────────────────── */
  function _inp(id, label, val, min, max, step, unit, hint) {
    return `<div style="margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
        <label style="font-size:12px;font-weight:700;color:var(--text-secondary);">${label}</label>
        <div style="display:flex;align-items:center;gap:6px;">
          <input type="number" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}"
            style="width:110px;background:var(--border-soft);border:1px solid var(--border-medium);border-radius:8px;color:var(--text-primary);font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:13px;font-weight:800;padding:5px 10px;text-align:right;outline:none;"
            oninput="_hlRecalc()">
          <span style="font-size:11px;color:var(--text-muted);">${unit}</span>
        </div>
      </div>
      ${hint ? `<div style="font-size:11px;color:var(--text-muted);">${hint}</div>` : ''}
    </div>`;
  }

  /* ══════════════════════════════════════════════════════════════
     EMI CALCULATOR TAB
  ══════════════════════════════════════════════════════════════ */
  function renderCalculator(container) {
    if (!container) return;
    const p = _loadInputs();
    const c = _compute(p);
    const emiColor = c.affordable ? '#22D3A6' : '#FF6B6B';

    container.innerHTML = `
<style>
.hl-box{background:var(--border-soft);border:1px solid var(--border-soft);border-radius:16px;padding:20px;margin-bottom:16px;}
</style>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
  <!-- Inputs -->
  <div class="hl-box">
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:14px;">Loan Parameters</div>
    ${_inp('hl-amount',  'Loan Amount',         p.loanAmount,   100000, 100000000, 100000, '₹',     'Sanctioned loan amount (property value × 80%)')}
    ${_inp('hl-rate',    'Interest Rate',        p.interestRate, 6,      18,        0.05,   '% p.a.','Current HDFC: 8.75% · SBI: 8.50% · ICICI: 8.75%')}
    ${_inp('hl-tenure',  'Loan Tenure',          p.tenureYears,  5,      30,        1,      'yr',    'Max 30 years; longer = lower EMI but more total interest')}
    ${_inp('hl-income',  'Gross Monthly Income', p.monthlyIncome,0,      1000000,   1000,   '₹/mo',  'Used for EMI affordability check (40% rule)')}
  </div>

  <!-- Results -->
  <div>
    <div class="hl-box" style="background:linear-gradient(135deg,rgba(79,124,255,.07),rgba(34,211,166,.04));border-color:rgba(79,124,255,.2);">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:12px;">Monthly EMI</div>
      <div id="hl-r-emi" style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:36px;font-weight:900;color:#4F7CFF;">${INR(c.emi)}</div>
      <div id="hl-r-emipct" style="font-size:12px;margin-top:6px;color:${emiColor};font-weight:700;">${c.emiPct}% of income ${c.affordable ? '✓ affordable' : '⚠ above 40% rule'}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      <div class="hl-box" style="padding:14px;">
        <div style="font-size:10px;color:var(--text-muted);">Total Interest</div>
        <div id="hl-r-int" style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:20px;font-weight:900;color:#FF6B6B;">${fmt(c.sched.totalInterest)}</div>
      </div>
      <div class="hl-box" style="padding:14px;">
        <div style="font-size:10px;color:var(--text-muted);">Total Cost</div>
        <div id="hl-r-total" style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:20px;font-weight:900;color:var(--text-primary);">${fmt(c.totalCost)}</div>
      </div>
      <div class="hl-box" style="padding:14px;">
        <div style="font-size:10px;color:var(--text-muted);">Yr-1 Tax Saving</div>
        <div id="hl-r-tax" style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:20px;font-weight:900;color:#22D3A6;">${INR(c.totalTaxDeduct)}</div>
        <div style="font-size:10px;color:var(--text-muted);">24(b)+80C deductions</div>
      </div>
      <div class="hl-box" style="padding:14px;">
        <div style="font-size:10px;color:var(--text-muted);">Max Affordable Loan</div>
        <div id="hl-r-maxloan" style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:20px;font-weight:900;color:${c.affordable?'var(--text-secondary)':'#22D3A6'};">${fmt(c.maxAffordLoan)}</div>
        <div style="font-size:10px;color:var(--text-muted);">at 40% EMI/income</div>
      </div>
    </div>
  </div>
</div>

<!-- Pie-style interest bar -->
<div class="hl-box">
  <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:10px;">Principal vs Interest Split</div>
  <div style="display:flex;height:16px;border-radius:8px;overflow:hidden;margin-bottom:10px;">
    <div id="hl-bar-prin" style="height:100%;background:#4F7CFF;width:${Math.round(p.loanAmount/c.totalCost*100)}%;transition:width .5s;"></div>
    <div id="hl-bar-int"  style="height:100%;background:#FF6B6B;flex:1;"></div>
  </div>
  <div style="display:flex;gap:20px;">
    <div style="display:flex;align-items:center;gap:6px;"><div style="width:10px;height:10px;border-radius:2px;background:#4F7CFF;"></div><span id="hl-leg-prin" style="font-size:11px;color:var(--text-secondary);">Principal ${Math.round(p.loanAmount/c.totalCost*100)}%</span></div>
    <div style="display:flex;align-items:center;gap:6px;"><div style="width:10px;height:10px;border-radius:2px;background:#FF6B6B;"></div><span id="hl-leg-int" style="font-size:11px;color:var(--text-secondary);">Interest ${Math.round(c.sched.totalInterest/c.totalCost*100)}%</span></div>
  </div>
</div>

${c.pmayEligible ? `<div style="background:rgba(34,211,166,.05);border:1px solid rgba(34,211,166,.15);border-radius:14px;padding:14px;">
  <div style="font-size:12px;font-weight:800;color:#22D3A6;margin-bottom:6px;">🏠 PMAY-CLSS Eligibility Detected</div>
  <div style="font-size:11px;color:var(--text-secondary);line-height:1.7;">Your income may qualify for a Pradhan Mantri Awas Yojana Credit-Linked Subsidy. MIG-I (income ≤ ₹12L): 4% interest subsidy on ₹9L · MIG-II (≤₹18L): 3% on ₹12L. Apply through your bank. First-time buyer condition applies.</div>
</div>` : ''}

<script>
(function(){
  window._hlRecalc = function() {
    const amt  = parseFloat(document.getElementById('hl-amount')?.value) || 5000000;
    const rate = parseFloat(document.getElementById('hl-rate')?.value)   || 8.75;
    const ten  = parseInt(document.getElementById('hl-tenure')?.value)   || 20;
    const inc  = parseFloat(document.getElementById('hl-income')?.value) || 150000;
    const p = { loanAmount:amt, interestRate:rate, tenureYears:ten, monthlyIncome:inc, grossIncome:inc*12, prepayAmount:200000, prepayYear:3 };
    if (window.FinosHomeLoan) {
      const c = window.FinosHomeLoan._compute(p);
      const INR = v => '₹'+Math.abs(Math.round(v)).toLocaleString('en-IN');
      const fmt = v => v>=1e7?(v/1e7).toFixed(2)+' Cr':v>=1e5?(v/1e5).toFixed(1)+' L':INR(v);
      const upd = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
      const col = (id,v) => { const el=document.getElementById(id); if(el) el.style.color=v; };
      upd('hl-r-emi',     INR(c.emi));
      upd('hl-r-emipct',  c.emiPct+'% of income '+(c.affordable?'✓ affordable':'⚠ above 40% rule'));
      col('hl-r-emipct',  c.affordable?'#22D3A6':'#FF6B6B');
      upd('hl-r-int',     fmt(c.sched.totalInterest));
      upd('hl-r-total',   fmt(c.totalCost));
      upd('hl-r-tax',     INR(c.totalTaxDeduct));
      upd('hl-r-maxloan', fmt(c.maxAffordLoan));
      const prinPct = Math.round(amt / c.totalCost * 100);
      const intPct  = 100 - prinPct;
      const bP = document.getElementById('hl-bar-prin');
      const bI = document.getElementById('hl-bar-int');
      if(bP) bP.style.width = prinPct + '%';
      upd('hl-leg-prin', 'Principal '+prinPct+'%');
      upd('hl-leg-int',  'Interest '+intPct+'%');
      localStorage.setItem('finos_hl_amount', String(amt));
      localStorage.setItem('finos_hl_rate',   String(rate));
      localStorage.setItem('finos_hl_tenure', String(ten));
    }
  };
})();
<\/script>`;
  }

  /* ══════════════════════════════════════════════════════════════
     PREPAYMENT TAB
  ══════════════════════════════════════════════════════════════ */
  function renderPrepayment(container) {
    if (!container) return;
    const p = _loadInputs();
    const c = _compute(p);
    const savedYears  = Math.floor(c.prepay.savedMonths / 12);
    const savedMonths = c.prepay.savedMonths % 12;
    const newTenYrs   = Math.floor(c.prepay.newTenureMonths / 12);
    const newTenMos   = c.prepay.newTenureMonths % 12;

    const scenarios = [100000, 200000, 500000, 1000000].map(amt => {
      const sc = _prepayImpact(p.loanAmount, p.interestRate, p.tenureYears, amt, 3);
      return `<tr style="border-top:1px solid var(--border-soft);">
        <td style="padding:10px;font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:12px;color:#4F7CFF;">${fmt(amt)}</td>
        <td style="padding:10px;font-size:12px;color:var(--text-muted);">${Math.floor(sc.newTenureMonths/12)}y ${sc.newTenureMonths%12}m</td>
        <td style="padding:10px;font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:12px;color:#22D3A6;font-weight:800;">-${Math.floor(sc.savedMonths/12)}y ${sc.savedMonths%12}m</td>
        <td style="padding:10px;font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:12px;color:#22D3A6;font-weight:800;">${INR(sc.savedInterest)}</td>
      </tr>`;
    }).join('');

    container.innerHTML = `
<div style="background:linear-gradient(135deg,rgba(34,211,166,.06),rgba(79,124,255,.03));border:1px solid rgba(34,211,166,.18);border-radius:18px;padding:22px;margin-bottom:16px;">
  <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:14px;">Prepayment Calculator</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
    ${_inp('hl-prepay',   'Prepayment Amount',    p.prepayAmount,  50000, 50000000, 50000, '₹',   'Lump-sum amount you\'d like to prepay')}
    ${_inp('hl-prepayyr', 'At End of Year',       p.prepayYear,    1,     29,        1,    'yr',  'Year when you make the prepayment (earlier = bigger saving)')}
  </div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;">
    <div>
      <div style="font-size:10px;color:var(--text-muted);">New Tenure</div>
      <div id="hl-pre-tenure" style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:24px;font-weight:900;color:#4F7CFF;">${newTenYrs}y ${newTenMos}m</div>
    </div>
    <div>
      <div style="font-size:10px;color:var(--text-muted);">Tenure Saved</div>
      <div id="hl-pre-saved" style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:24px;font-weight:900;color:#22D3A6;">-${savedYears}y ${savedMonths}m</div>
    </div>
    <div>
      <div style="font-size:10px;color:var(--text-muted);">Interest Saved</div>
      <div id="hl-pre-intsaved" style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:24px;font-weight:900;color:#22D3A6;">${INR(c.prepay.savedInterest)}</div>
    </div>
  </div>
</div>

<div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:10px;">Prepayment Scenarios (lump-sum at year 3)</div>
<div style="overflow-x:auto;border-radius:14px;border:1px solid var(--border-soft);margin-bottom:14px;">
<table style="width:100%;border-collapse:collapse;">
  <thead><tr style="background:var(--border-soft);">
    <th style="padding:10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">Prepay Amount</th>
    <th style="padding:10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">New Tenure</th>
    <th style="padding:10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#22D3A6;">Tenure Saved</th>
    <th style="padding:10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#22D3A6;">Interest Saved</th>
  </tr></thead>
  <tbody>${scenarios}</tbody>
</table>
</div>

<div style="background:rgba(79,124,255,.05);border:1px solid rgba(79,124,255,.1);border-radius:14px;padding:14px;">
  <div style="font-size:12px;font-weight:800;color:#4F7CFF;margin-bottom:8px;">💡 Prepayment Strategy — India</div>
  <div style="font-size:11px;color:var(--text-muted);line-height:1.75;display:flex;flex-direction:column;gap:4px;">
    <span>📋 RBI rule: no prepayment penalty on floating-rate home loans (banks cannot charge)</span>
    <span>📋 Fixed-rate loans: may have 2-4% penalty — check your loan agreement before prepaying</span>
    <span>📋 Prepay in years 1-5 when interest component is highest (80%+ of EMI is interest in early years)</span>
    <span>📋 ₹1L prepay at year 3 can save more interest than ₹2L at year 15 — time value matters</span>
    <span>📋 Tax angle: if your interest stays above ₹2L, the 24(b) deduction is maxed — prepaying reduces it</span>
  </div>
</div>

<script>
(function(){
  const orig = window._hlRecalc;
  window._hlPrepayRecalc = function() {
    const amt = parseFloat(document.getElementById('hl-prepay')?.value)||200000;
    const yr  = parseInt(document.getElementById('hl-prepayyr')?.value)||3;
    const p2  = window.FinosHomeLoan ? window.FinosHomeLoan._loadInputs() : { loanAmount:5000000, interestRate:8.75, tenureYears:20 };
    const sc  = window.FinosHomeLoan._prepayImpact(p2.loanAmount, p2.interestRate, p2.tenureYears, amt, yr);
    const INR = v => '₹'+Math.abs(Math.round(v)).toLocaleString('en-IN');
    const upd = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
    upd('hl-pre-tenure',   Math.floor(sc.newTenureMonths/12)+'y '+sc.newTenureMonths%12+'m');
    upd('hl-pre-saved',    '-'+Math.floor(sc.savedMonths/12)+'y '+sc.savedMonths%12+'m');
    upd('hl-pre-intsaved', INR(sc.savedInterest));
    localStorage.setItem('finos_hl_prepay',   String(amt));
    localStorage.setItem('finos_hl_prepayyr', String(yr));
  };
  document.getElementById('hl-prepay')?.addEventListener('input', window._hlPrepayRecalc);
  document.getElementById('hl-prepayyr')?.addEventListener('input', window._hlPrepayRecalc);
})();
<\/script>`;
  }

  return { renderCalculator, renderPrepayment, _compute, _prepayImpact, _loadInputs };
})();
