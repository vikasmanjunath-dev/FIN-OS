/* finos-itr-summary.js — ITR Filing Prep Kit
 *
 * Aggregates all tax-relevant data from every tracker into a single
 * India Income Tax Return summary. Zero manual entry — reads automatically
 * from the same localStorage keys that other FIN-OS modules write.
 *
 * Sections generated:
 *   A. Gross Income (salary, rental, FD interest, dividends)
 *   B. Deductions (80C itemised, 80CCD(1B), 80D, HRA, Sec 24b, others)
 *   C. Taxable Income & Tax Liability (old regime, new regime, winner)
 *   D. TDS Summary (employer TDS from salary + bank TDS estimates)
 *   E. Outstanding tax / refund due
 *
 * Public API (window.FinosITRSummary):
 *   renderSummary(el)    — full ITR summary with print button
 *   renderDeductions(el) — detailed 80C/80CCD/80D breakdown
 *   renderComparison(el) — regime comparison table
 *   _compute()           — returns raw data object
 */
window.FinosITRSummary = (function () {
  'use strict';

  const gs  = k => parseFloat(localStorage.getItem(k)) || 0;
  const gss = k => localStorage.getItem(k) || '';
  const INR = v => '₹' + Math.abs(Math.round(v)).toLocaleString('en-IN');

  /* ── Tax slabs FY 2025-26 ──────────────────────────────────────── */
  function _taxNew(income) {
    // New regime slabs (post April 2023, updated Budget 2024)
    // 0-4L: 0%, 4L-8L: 5%, 8L-12L: 10%, 12L-16L: 15%, 16L-20L: 20%, 20L-24L: 25%, 24L+: 30%
    const slabs = [
      [0,       400000,  0.00],
      [400000,  800000,  0.05],
      [800000,  1200000, 0.10],
      [1200000, 1600000, 0.15],
      [1600000, 2000000, 0.20],
      [2000000, 2400000, 0.25],
      [2400000, Infinity,0.30],
    ];
    let tax = 0;
    for (const [lo, hi, rate] of slabs) {
      if (income <= lo) break;
      tax += (Math.min(income, hi) - lo) * rate;
    }
    // Rebate 87A: if income ≤ 7L in new regime, tax = 0
    if (income <= 700000) tax = 0;
    return Math.round(tax * 1.04); // 4% cess
  }

  function _taxOld(income) {
    // Old regime: 0-2.5L: 0%, 2.5L-5L: 5%, 5L-10L: 20%, 10L+: 30%
    const slabs = [
      [0,       250000,  0.00],
      [250000,  500000,  0.05],
      [500000,  1000000, 0.20],
      [1000000, Infinity,0.30],
    ];
    let tax = 0;
    for (const [lo, hi, rate] of slabs) {
      if (income <= lo) break;
      tax += (Math.min(income, hi) - lo) * rate;
    }
    // Rebate 87A: if income ≤ 5L, tax = 0
    if (income <= 500000) tax = 0;
    return Math.round(tax * 1.04);
  }

  /* ── HRA exemption ─────────────────────────────────────────────── */
  function _hraExempt() {
    // Try to read from salary optimizer first
    const hraFromSalary = gs('finos_salary_hra_exempt');
    if (hraFromSalary > 0) return hraFromSalary;
    // Manual HRA inputs (from tax optimizer)
    const basic       = gs('finos_salary_basic') || gs('finos_ctc_basic');
    const hraRec      = gs('finos_hra_received');
    const rentPaid    = gs('finos_rent_paid');
    const isMetro     = (gss('finos_city_metro') || 'yes').toLowerCase() !== 'no';
    if (rentPaid <= 0) return 0;
    const a = hraRec;
    const b = rentPaid - 0.1 * basic;
    const c = basic * (isMetro ? 0.5 : 0.4);
    return Math.max(0, Math.min(a, b, c));
  }

  /* ── Core computation ──────────────────────────────────────────── */
  function _compute() {
    // ── INCOME ──
    const grossSalary    = gs('finos_salary_ctc')    || gs('finos_gross_salary');
    const basicAnnual    = gs('finos_salary_basic')  * 12 || grossSalary * 0.40;
    const hraReceived    = gs('finos_salary_hra')    || 0;
    const hraExempt      = _hraExempt();

    const rentalIncome   = gs('finos_passive_rental_annual') || gs('finos_rental_income_annual');
    const rentalStdDed   = Math.round(rentalIncome * 0.30);  // 30% standard deduction
    const rentalTaxable  = Math.max(0, rentalIncome - rentalStdDed);

    const fdValue        = gs('finos_fd_value');
    const fdInterest     = gs('finos_fd_interest_annual') || Math.round(fdValue * 0.07);
    const dividendIncome = gs('finos_passive_dividend_annual') || 0;
    const otherIncome    = gs('finos_other_income_annual') || 0;

    // Gross total income
    const grossTotalIncome = (grossSalary - hraExempt) + rentalTaxable + fdInterest + dividendIncome + otherIncome;

    // ── DEDUCTIONS (OLD REGIME ONLY) ──

    // 80C — itemised
    const epfEmployee    = gs('finos_epf_employee_annual') || Math.round(gs('finos_salary_basic') * 12 * 0.12);
    const ppf80c         = gs('finos_ppf_80c') || 0;
    const elss80c        = gs('finos_elss_invested') || 0;
    const lic80c         = gs('finos_lic_premium_annual') || 0;
    const npsEmployee    = gs('finos_nps_employee_annual') || 0;
    const homeLoan80c    = gs('finos_home_loan_principal_annual') || 0;
    const ssy80c         = gs('finos_ssy_annual') || 0;
    const children80c    = gs('finos_school_fees_annual') || 0;  // tuition fees Sec 80C
    const raw80c         = epfEmployee + ppf80c + elss80c + lic80c + npsEmployee + homeLoan80c + ssy80c + children80c;
    const total80c       = Math.min(raw80c, 150000);

    // 80CCD(1B) — NPS extra ₹50K
    const nps80ccd1b     = Math.min(gs('finos_nps_employee_annual') || 0, 50000);
    // If employee NPS was already counted in 80C, 80CCD(1B) is the additional beyond 80C
    const extra80ccd1b   = Math.min(50000, Math.max(0, (gs('finos_nps_employee_annual') || 0) - 150000));

    // 80CCD(2) — Employer NPS contribution (no cap in new regime too)
    const npsEmployer    = gs('finos_nps_employer_annual') || Math.round(basicAnnual * 0.10);

    // 80D — health insurance premiums
    const healthPremSelf  = gs('finos_health_ins_premium') || 0;
    const healthPremParent= gs('finos_health_ins_parent_premium') || 0;
    const max80DSelf      = 25000; // <60yr; 50000 for senior citizen
    const max80DParent    = gs('finos_parent_senior') === '1' ? 50000 : 25000;
    const total80D        = Math.min(healthPremSelf, max80DSelf) + Math.min(healthPremParent, max80DParent);

    // Section 24(b) — home loan interest
    const homeLoanInterest = gs('finos_home_loan_interest_annual') || 0;
    const sec24b           = Math.min(homeLoanInterest, 200000); // max ₹2L for self-occupied

    // 80E — education loan interest (if any)
    const edu80E          = gs('finos_edu_loan_interest_annual') || 0;

    // 80TTA/TTB — savings bank interest
    const sbInterest      = gs('finos_savings_interest_annual') || 0;
    const sec80tta        = Math.min(sbInterest, 10000);

    // Standard deduction from salary (₹75,000 in new regime FY 2025-26; ₹50,000 in old)
    const stdDedNew = 75000;
    const stdDedOld = 50000;

    const totalDeductionsOld = stdDedOld + total80c + extra80ccd1b + total80D + sec24b + edu80E + sec80tta;
    const totalDeductionsNew = stdDedNew + npsEmployer; // Only employer NPS + std ded in new regime

    const taxableOld = Math.max(0, grossTotalIncome - totalDeductionsOld);
    const taxableNew = Math.max(0, grossTotalIncome - totalDeductionsNew);

    const taxOld = _taxOld(taxableOld);
    const taxNew = _taxNew(taxableNew);

    const betterRegime = taxNew <= taxOld ? 'new' : 'old';
    const savedByRegime = Math.abs(taxOld - taxNew);

    // ── TDS ──
    const tdsBySalary = gs('finos_tds_salary_annual') || Math.round(Math.min(taxNew, taxOld) * 0.95);
    const tdsByBank   = gs('finos_tds_bank_annual')   || Math.round(fdInterest > 40000 ? fdInterest * 0.10 : 0);
    const totalTDS    = tdsBySalary + tdsByBank;

    // ── BALANCE ──
    const liabilityFinal  = betterRegime === 'new' ? taxNew : taxOld;
    const balanceTax      = liabilityFinal - totalTDS;  // +ve = pay, -ve = refund

    // 80C breakdown for display
    const _80cItems = [
      { label: 'EPF (Employee Contribution)',  val: epfEmployee,  note: 'Auto from EPF Tracker' },
      { label: 'PPF / Small Savings',          val: ppf80c,       note: 'From PPF Tracker' },
      { label: 'ELSS / Tax-Saving MF',         val: elss80c,      note: '' },
      { label: 'NPS (Employee — Tier 1)',       val: npsEmployee,  note: 'From NPS Tracker' },
      { label: 'Home Loan Principal',           val: homeLoan80c,  note: '' },
      { label: 'LIC / Life Insurance',         val: lic80c,       note: 'From Insurance Tracker' },
      { label: 'Sukanya Samriddhi (SSY)',       val: ssy80c,       note: '' },
      { label: 'Children Tuition Fees',        val: children80c,  note: '' },
    ].filter(i => i.val > 0);

    const fy = `FY 2025-26 (AY 2026-27)`;

    return {
      fy, grossSalary, hraExempt, rentalIncome, rentalTaxable, fdInterest, dividendIncome, otherIncome,
      grossTotalIncome, epfEmployee, ppf80c, elss80c, lic80c, npsEmployee, homeLoan80c,
      raw80c, total80c, extra80ccd1b, npsEmployer, total80D, sec24b, edu80E, sec80tta,
      totalDeductionsOld, totalDeductionsNew, taxableOld, taxableNew,
      taxOld, taxNew, betterRegime, savedByRegime, tdsBySalary, tdsByBank, totalTDS,
      liabilityFinal, balanceTax, _80cItems,
      healthPremSelf, healthPremParent,
    };
  }

  /* ── Section card helper ─────────────────────────────────────────── */
  function _sec(title, color, content) {
    return `<div style="background:var(--border-soft);border:1px solid var(--border-soft);border-radius:16px;margin-bottom:16px;overflow:hidden;">
      <div style="padding:14px 20px;background:${color}12;border-bottom:1px solid var(--border-soft);">
        <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:${color};">${title}</div>
      </div>
      <div style="padding:18px 20px;">${content}</div>
    </div>`;
  }

  function _row(label, val, sub, indent) {
    const pad = indent ? 'padding-left:20px;' : '';
    return `<div style="display:flex;align-items:baseline;gap:8px;padding:7px 0;border-bottom:1px solid var(--border-soft);${pad}">
      <div style="flex:1;font-size:13px;color:var(--text-secondary);">${label}${sub ? `<span style="font-size:10px;color:var(--text-muted);margin-left:6px;">${sub}</span>` : ''}</div>
      <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:13px;font-weight:700;color:var(--text-primary);min-width:110px;text-align:right;">${val}</div>
    </div>`;
  }

  /* ══════════════════════════════════════════════════════════════
     SUMMARY
  ══════════════════════════════════════════════════════════════ */
  function renderSummary(container) {
    if (!container) return;
    const c = _compute();
    const refundOrPay = c.balanceTax >= 0 ? `Pay ₹${Math.round(c.balanceTax).toLocaleString('en-IN')} more` : `Refund: ₹${Math.round(-c.balanceTax).toLocaleString('en-IN')}`;
    const balColor    = c.balanceTax > 0 ? '#EF4444' : '#22D3A6';

    const incomeContent = [
      _row('Gross Salary / CTC', INR(c.grossSalary)),
      _row('Less: HRA Exemption [Sec 10(13A)]', c.hraExempt > 0 ? `(${INR(c.hraExempt)})` : '₹0'),
      c.rentalIncome > 0 ? _row('Rental Income (Net after 30% std ded)', INR(c.rentalTaxable)) : '',
      c.fdInterest > 0   ? _row('FD / Interest Income', INR(c.fdInterest)) : '',
      c.dividendIncome > 0 ? _row('Dividend Income', INR(c.dividendIncome)) : '',
      c.otherIncome > 0  ? _row('Other Income', INR(c.otherIncome)) : '',
      _row('Gross Total Income', INR(c.grossTotalIncome), '', false),
    ].filter(Boolean).join('');

    const dedOldContent = [
      _row('Standard Deduction', INR(50000)),
      _row('80C — PF, PPF, ELSS, LIC etc.', INR(c.total80c), `raw: ${INR(c.raw80c)} (capped at ₹1.5L)`),
      c.extra80ccd1b > 0 ? _row('80CCD(1B) — NPS extra deduction', INR(c.extra80ccd1b), 'additional ₹50K') : '',
      c.total80D > 0 ? _row('80D — Health insurance premium', INR(c.total80D)) : '',
      c.sec24b > 0 ? _row('Sec 24(b) — Home loan interest', INR(c.sec24b), 'max ₹2L self-occupied') : '',
      c.edu80E > 0 ? _row('80E — Education loan interest', INR(c.edu80E)) : '',
      c.sec80tta > 0 ? _row('80TTA — Savings bank interest', INR(c.sec80tta), 'max ₹10K') : '',
      _row('Total Deductions', `(${INR(c.totalDeductionsOld)})`),
      _row('Taxable Income', INR(c.taxableOld)),
      _row('Tax (incl. 4% cess)', INR(c.taxOld), 'old regime'),
    ].filter(Boolean).join('');

    const dedNewContent = [
      _row('Standard Deduction', INR(75000), 'higher in new regime'),
      c.npsEmployer > 0 ? _row('80CCD(2) — Employer NPS contribution', INR(c.npsEmployer), 'no cap') : '',
      _row('Total Deductions', `(${INR(c.totalDeductionsNew)})`),
      _row('Taxable Income', INR(c.taxableNew)),
      _row('Tax (incl. 4% cess)', INR(c.taxNew), 'new regime'),
    ].filter(Boolean).join('');

    const tdsContent = [
      _row('TDS by Employer (Sec 192)', INR(c.tdsBySalary)),
      c.tdsByBank > 0 ? _row('TDS by Bank on FD interest (Sec 194A)', INR(c.tdsByBank)) : '',
      _row('Total TDS', INR(c.totalTDS)),
    ].filter(Boolean).join('');

    container.innerHTML = `
<style>
@media print {
  .itr-no-print { display: none !important; }
  body { background: #fff !important; color: #000 !important; }
  .itr-print-header { display: block !important; }
}
.itr-print-header { display: none; font-size: 18px; font-weight: 800; margin-bottom: 20px; }
</style>

<div class="itr-no-print" style="background:rgba(79,124,255,.06);border:1px solid rgba(79,124,255,.18);border-radius:16px;padding:20px;margin-bottom:22px;display:flex;gap:16px;flex-wrap:wrap;align-items:center;">
  <div style="flex:1;">
    <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:rgba(79,124,255,.8);margin-bottom:6px;">ITR Filing Prep Summary · ${c.fy}</div>
    <div style="font-size:13px;color:var(--text-secondary);">Auto-filled from EPF, NPS, PPF, Salary, Insurance and other trackers. Verify with Form 16 and AIS before filing.</div>
  </div>
  <button onclick="window.print()" style="background:rgba(79,124,255,.12);border:1px solid rgba(79,124,255,.3);color:#4F7CFF;border-radius:10px;padding:10px 20px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;">🖨️ Print / PDF</button>
</div>

<div class="itr-print-header">FIN-OS ITR Filing Summary — ${c.fy}</div>

<!-- Hero: Regime Winner -->
<div style="background:${c.betterRegime === 'new' ? 'rgba(34,211,166,.07)' : 'rgba(255,179,71,.07)'};border:1px solid ${c.betterRegime === 'new' ? 'rgba(34,211,166,.2)' : 'rgba(255,179,71,.2)'};border-radius:20px;padding:24px;margin-bottom:22px;">
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:16px;">
    <div>
      <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px;">Recommended Regime</div>
      <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:24px;font-weight:900;color:${c.betterRegime === 'new' ? '#22D3A6' : '#FFB347'};">${c.betterRegime.toUpperCase()} REGIME</div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">saves ${INR(c.savedByRegime)} vs other</div>
    </div>
    <div>
      <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px;">Tax Liability</div>
      <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:24px;font-weight:900;color:var(--text-primary);">${INR(c.liabilityFinal)}</div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">incl. 4% cess</div>
    </div>
    <div>
      <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px;">TDS Deducted</div>
      <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:24px;font-weight:900;color:#00D4FF;">${INR(c.totalTDS)}</div>
    </div>
    <div>
      <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px;">${c.balanceTax >= 0 ? 'Balance Tax Due' : 'Expected Refund'}</div>
      <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:24px;font-weight:900;color:${balColor};">${c.balanceTax >= 0 ? INR(c.balanceTax) : INR(-c.balanceTax)}</div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">${c.balanceTax > 0 ? 'pay via challan 280' : c.balanceTax < 0 ? 'claim in ITR' : 'no balance'}</div>
    </div>
  </div>
</div>

${_sec('A · Gross Income Computation', '#4F7CFF', incomeContent)}
${_sec('B · Deductions — Old Regime', '#FFB347', dedOldContent)}
${_sec('C · New Regime (less deductions, lower slabs)', '#22D3A6', dedNewContent)}
${_sec('D · TDS Already Deducted', '#00D4FF', tdsContent)}

<div style="background:rgba(239,68,68,.05);border:1px solid rgba(239,68,68,.15);border-radius:14px;padding:16px;margin-top:4px;">
  <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:rgba(239,68,68,.8);margin-bottom:10px;">⚠️ Important — Verify before Filing</div>
  <div style="font-size:12px;color:var(--text-secondary);line-height:1.7;display:flex;flex-direction:column;gap:5px;">
    <span>📋 Cross-check with your <strong>Form 16 (Part A & B)</strong> from employer and <strong>Form 26AS / AIS</strong> on the income tax portal</span>
    <span>📋 FD interest in AIS may differ from our estimate (7% assumed) — use bank's actual interest certificate</span>
    <span>📋 Capital gains from MF/equity sales must be added separately (use ELSS / MF portal statement)</span>
    <span>📋 File ITR-1 (Sahaj) if only salary + one house + interest income; ITR-2 if capital gains or more than one property</span>
    <span>📋 Deadline: 31st July for salaried individuals without audit requirement</span>
    <span>📋 This tool provides estimates for planning purposes. Consult a CA for complex situations.</span>
  </div>
</div>`;
  }

  /* ══════════════════════════════════════════════════════════════
     DEDUCTIONS DETAIL
  ══════════════════════════════════════════════════════════════ */
  function renderDeductions(container) {
    if (!container) return;
    const c = _compute();
    const pct80c = Math.min(100, Math.round(c.raw80c / 150000 * 100));
    const pct80d = c.total80D > 0 ? 100 : 0;

    const items80c = c._80cItems.map(i => `
      <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border-soft);">
        <div style="flex:1;font-size:13px;color:var(--text-secondary);">${i.label}${i.note ? `<span style="font-size:10px;color:var(--text-muted);margin-left:6px;">· ${i.note}</span>` : ''}</div>
        <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:13px;font-weight:700;color:#FFB347;">${INR(i.val)}</div>
      </div>`).join('') || '<div style="color:var(--text-muted);font-size:13px;padding:8px 0;">No 80C investments detected. Fill EPF, PPF, NPS trackers.</div>';

    container.innerHTML = `
<!-- 80C -->
<div style="background:rgba(255,179,71,.05);border:1px solid rgba(255,179,71,.15);border-radius:16px;padding:20px;margin-bottom:16px;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
    <div style="font-size:13px;font-weight:800;color:#FFB347;">Section 80C — ₹1.5L Bucket</div>
    <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:12px;color:${pct80c >= 100 ? '#22D3A6' : '#FFB347'};">${pct80c}% used · ${INR(c.total80c)} / ₹1,50,000</div>
  </div>
  <div style="height:6px;background:var(--border-soft);border-radius:3px;margin-bottom:16px;overflow:hidden;">
    <div style="height:100%;width:${pct80c}%;background:${pct80c >= 100 ? '#22D3A6' : '#FFB347'};border-radius:3px;transition:width .6s;"></div>
  </div>
  ${items80c}
  ${c.raw80c < 150000 ? `<div style="margin-top:12px;padding:10px 14px;background:rgba(255,179,71,.08);border:1px solid rgba(255,179,71,.2);border-radius:10px;font-size:12px;color:#FFB347;">
    💡 Gap: ${INR(150000 - c.raw80c)} remaining — invest in ELSS (better returns than FD) or top-up PPF before 31 March
  </div>` : '<div style="margin-top:12px;padding:10px 14px;background:rgba(34,211,166,.06);border:1px solid rgba(34,211,166,.2);border-radius:10px;font-size:12px;color:#22D3A6;">✓ 80C fully utilised</div>'}
</div>

<!-- 80CCD -->
<div style="background:rgba(155,93,229,.05);border:1px solid rgba(155,93,229,.15);border-radius:16px;padding:20px;margin-bottom:16px;">
  <div style="font-size:13px;font-weight:800;color:#9B5DE5;margin-bottom:12px;">Section 80CCD — NPS</div>
  ${_row('80CCD(1B) — Extra NPS deduction', INR(c.extra80ccd1b), '₹50K over 80C limit')}
  ${_row('80CCD(2) — Employer NPS contribution', INR(c.npsEmployer), 'no cap (new/old regime both)')}
  ${c.extra80ccd1b < 50000 ? `<div style="margin-top:10px;padding:10px 14px;background:rgba(155,93,229,.08);border:1px solid rgba(155,93,229,.2);border-radius:10px;font-size:12px;color:#9B5DE5;">
    💡 You can invest ₹${(50000 - c.extra80ccd1b).toLocaleString('en-IN')} more in NPS Tier 1 to claim full 80CCD(1B) — saves ${INR(Math.round((50000 - c.extra80ccd1b) * 0.30 * 1.04))} tax (30% bracket)
  </div>` : '<div style="margin-top:10px;padding:10px 14px;background:rgba(34,211,166,.06);border:1px solid rgba(34,211,166,.2);border-radius:10px;font-size:12px;color:#22D3A6;">✓ 80CCD(1B) fully utilised</div>'}
</div>

<!-- 80D -->
<div style="background:rgba(0,212,255,.05);border:1px solid rgba(0,212,255,.15);border-radius:16px;padding:20px;margin-bottom:16px;">
  <div style="font-size:13px;font-weight:800;color:#00D4FF;margin-bottom:12px;">Section 80D — Health Insurance</div>
  ${_row('Self + Family premium', INR(c.healthPremSelf), 'max ₹25K (₹50K if senior)')}
  ${_row('Parents premium', INR(c.healthPremParent), 'max ₹25K (₹50K if senior parent)')}
  ${_row('Total 80D deduction', INR(c.total80D))}
  ${c.total80D === 0 ? `<div style="margin-top:10px;padding:10px 14px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:10px;font-size:12px;color:#EF4444;">
    🚨 No health insurance premium detected. Update Insurance Tracker with your policy premiums.
  </div>` : ''}
</div>

<!-- HRA -->
<div style="background:rgba(34,211,166,.05);border:1px solid rgba(34,211,166,.15);border-radius:16px;padding:20px;">
  <div style="font-size:13px;font-weight:800;color:#22D3A6;margin-bottom:12px;">HRA Exemption [Sec 10(13A)]</div>
  ${_row('HRA exempt from tax', INR(c.hraExempt))}
  ${c.hraExempt === 0 ? `<div style="margin-top:10px;padding:10px 14px;background:rgba(255,179,71,.08);border:1px solid rgba(255,179,71,.2);border-radius:10px;font-size:12px;color:#FFB347;">
    💡 If you pay rent, fill rent amount in Salary Optimizer to automatically compute HRA exemption
  </div>` : ''}
  ${c.sec24b > 0 ? `<div style="margin-top:10px;">${_row('Sec 24(b) — Home loan interest', INR(c.sec24b), 'max ₹2L self-occupied')}</div>` : ''}
</div>`;
  }

  /* ══════════════════════════════════════════════════════════════
     REGIME COMPARISON
  ══════════════════════════════════════════════════════════════ */
  function renderComparison(container) {
    if (!container) return;
    const c = _compute();

    // Point-by-point comparison
    const rows = [
      ['Gross Total Income', INR(c.grossTotalIncome), INR(c.grossTotalIncome)],
      ['Standard Deduction', INR(50000), INR(75000)],
      ['80C (PF, PPF, ELSS, LIC…)', INR(c.total80c), '₹0 — not available'],
      ['80CCD(1B) NPS extra', INR(c.extra80ccd1b), '₹0 — not available'],
      ['80CCD(2) Employer NPS', INR(c.npsEmployer), INR(c.npsEmployer)],
      ['80D Health Insurance', INR(c.total80D), '₹0 — not available'],
      ['Sec 24(b) Home Loan Int.', INR(c.sec24b), '₹0 — not available'],
      ['HRA Exemption', INR(c.hraExempt), INR(c.hraExempt)],
      ['Total Deductions', INR(c.totalDeductionsOld), INR(c.totalDeductionsNew)],
      ['Taxable Income', INR(c.taxableOld), INR(c.taxableNew)],
      ['Tax + Cess (4%)', INR(c.taxOld), INR(c.taxNew)],
    ];

    const tableRows = rows.map(([label, old, nw]) => {
      const isBottom = label.includes('Tax + Cess');
      return `<tr style="${isBottom ? 'font-weight:800;background:var(--border-soft);' : ''}">
        <td style="padding:9px 14px;border-bottom:1px solid var(--border-soft);font-size:13px;color:var(--text-secondary);">${label}</td>
        <td style="padding:9px 14px;border-bottom:1px solid var(--border-soft);font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:13px;font-weight:700;color:${c.betterRegime === 'old' && isBottom ? '#22D3A6' : 'var(--text-primary)'};text-align:right;">${old}</td>
        <td style="padding:9px 14px;border-bottom:1px solid var(--border-soft);font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:13px;font-weight:700;color:${c.betterRegime === 'new' && isBottom ? '#22D3A6' : 'var(--text-primary)'};text-align:right;">${nw}</td>
      </tr>`;
    }).join('');

    container.innerHTML = `
<div style="overflow-x:auto;">
<table style="width:100%;border-collapse:collapse;background:var(--border-soft);border:1px solid var(--border-soft);border-radius:14px;overflow:hidden;">
  <thead>
    <tr style="background:var(--border-soft);">
      <th style="padding:12px 14px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">Item</th>
      <th style="padding:12px 14px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#FFB347;">Old Regime ${c.betterRegime === 'old' ? '✓' : ''}</th>
      <th style="padding:12px 14px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#22D3A6;">New Regime ${c.betterRegime === 'new' ? '✓' : ''}</th>
    </tr>
  </thead>
  <tbody>${tableRows}</tbody>
</table>
</div>

<div style="margin-top:20px;background:${c.betterRegime === 'new' ? 'rgba(34,211,166,.07)' : 'rgba(255,179,71,.07)'};border:1px solid ${c.betterRegime === 'new' ? 'rgba(34,211,166,.2)' : 'rgba(255,179,71,.2)'};border-radius:14px;padding:18px;">
  <div style="font-size:14px;font-weight:800;color:${c.betterRegime === 'new' ? '#22D3A6' : '#FFB347'};margin-bottom:8px;">
    ${c.betterRegime.toUpperCase()} REGIME saves you ${INR(c.savedByRegime)} this year
  </div>
  <div style="font-size:12px;color:var(--text-secondary);line-height:1.7;">
    ${c.betterRegime === 'new'
      ? `Your deductions (₹${Math.round(c.totalDeductionsOld/1000)}K) aren't large enough to offset the lower slabs in the new regime. Switch if not already done — inform your employer at the start of FY.`
      : `Your deductions (₹${Math.round(c.totalDeductionsOld/1000)}K in 80C/80D/HRA) make the old regime more beneficial. Maximise ELSS, PPF and NPS to keep the advantage.`}
  </div>
</div>

<div style="margin-top:14px;padding:14px 16px;background:rgba(79,124,255,.05);border:1px solid rgba(79,124,255,.12);border-radius:12px;font-size:12px;color:var(--text-muted);line-height:1.7;">
  ℹ️ New regime is now the <strong>default</strong> — you must opt-in to the old regime each year via Form 10-IEA (or through employer at start of FY). Deadline: ITR due date.
</div>`;
  }

  return { renderSummary, renderDeductions, renderComparison, _compute };
})();
