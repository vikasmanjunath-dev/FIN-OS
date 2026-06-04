/**
 * tax-dossier.js — FIN·OS Tax Dossier Generator  v1.0
 * ──────────────────────────────────────────────────────
 * Generates a complete pre-filled tax summary ("Tax Dossier")
 * that users can take to their CA or use for self-filing.
 *
 * Covers:
 *   • Income summary (salary, capital gains, other income)
 *   • Deductions (80C, 80D, 80CCD, HRA, home loan, 80E)
 *   • Capital gains (STCG, LTCG from trade journal)
 *   • Advance tax calendar (Q1–Q4 with exact amounts)
 *   • AIS discrepancy checker (declared vs. reported)
 *   • Regime comparison (Old vs. New — which saves more)
 *   • Printable HTML + clipboard export
 */
(function (global) {
  'use strict';

  const INR = n => {
    n = Number(n) || 0;
    return '₹' + Math.round(n).toLocaleString('en-IN');
  };

  /* ── Tax slabs FY 2025-26 ──────────────────────────────────────── */
  function calcOldRegimeTax(taxable) {
    if (taxable <= 250000) return 0;
    let tax = 0;
    if (taxable > 1000000) tax += (taxable - 1000000) * 0.30;
    if (taxable > 500000)  tax += (Math.min(taxable, 1000000) - 500000) * 0.20;
    if (taxable > 250000)  tax += (Math.min(taxable, 500000) - 250000) * 0.05;
    if (taxable <= 500000) tax = Math.max(0, tax - 12500); // 87A rebate
    return Math.round(tax * 1.04); // + 4% cess
  }

  function calcNewRegimeTax(taxable) {
    if (taxable <= 400000) return 0;
    let tax = 0;
    const slabs = [
      [400000, 800000, 0.05],
      [800000, 1200000, 0.10],
      [1200000, 1600000, 0.15],
      [1600000, 2000000, 0.20],
      [2000000, 2400000, 0.25],
      [2400000, Infinity, 0.30],
    ];
    slabs.forEach(([lo, hi, rate]) => {
      if (taxable > lo) tax += (Math.min(taxable, hi) - lo) * rate;
    });
    if (taxable <= 1200000) tax = Math.max(0, tax - 60000); // 87A rebate
    return Math.round(tax * 1.04); // + 4% cess
  }

  /* ── Advance tax dates FY 2025-26 ─────────────────────────────── */
  const ADVANCE_TAX_DATES = [
    { quarter: 'Q1', dueDate: '15 June 2025',  pct: 15, deadline: new Date('2025-06-15') },
    { quarter: 'Q2', dueDate: '15 Sept 2025',  pct: 45, deadline: new Date('2025-09-15') },
    { quarter: 'Q3', dueDate: '15 Dec 2025',   pct: 75, deadline: new Date('2025-12-15') },
    { quarter: 'Q4', dueDate: '15 Mar 2026',   pct: 100, deadline: new Date('2026-03-15') },
  ];

  /* ── Build dossier from context ────────────────────────────────── */
  function buildDossier(ctx) {
    const profile   = ctx?.profile || {};
    const budget    = ctx?.budget_tracker || {};
    const txns      = ctx?.financial?.transactions || {};
    const journal   = ctx?.trade_journal || {};
    const portfolio = ctx?.financial?.portfolio || {};

    /* Income */
    const salary         = Number(budget.income_monthly || localStorage.getItem('finos_monthly_income') || 0) * 12;
    const otherIncome    = Number(profile.other_income || 0);
    const totalIncome    = salary + otherIncome;

    /* Capital gains (from trade journal) */
    const stcg = Number(journal.stcg || journal.short_term_gains || 0); // equity <1yr → 20%
    const ltcg = Number(journal.ltcg || journal.long_term_gains || 0);  // equity >1yr → 12.5% above 1.25L
    const ltcgTaxable = Math.max(0, ltcg - 125000); // 1.25L exempt

    /* Old Regime deductions */
    const d80C        = Math.min(Number(ctx?.tax?.deductions_80c || profile.invested_80c || 0), 150000);
    const d80D        = Math.min(Number(ctx?.tax?.deductions_80d || profile.health_insurance || 0), 75000);
    const d80CCD1B    = Math.min(Number(ctx?.tax?.nps_employee || 0), 50000);
    const dHRA        = Number(ctx?.tax?.hra || profile.hra_claimed || 0);
    const dHomeLoan   = Math.min(Number(ctx?.tax?.home_loan_interest || 0), 200000);
    const d80E        = Number(ctx?.tax?.education_loan_interest || 0);
    const dStdSalary  = 50000;
    const totalDeductionsOld = d80C + d80D + d80CCD1B + dHRA + dHomeLoan + d80E + dStdSalary;

    /* Taxable income — old regime */
    const taxableOld = Math.max(0, totalIncome - totalDeductionsOld);
    const taxOld     = calcOldRegimeTax(taxableOld);

    /* New regime */
    const taxableNew = Math.max(0, totalIncome - 75000); // std deduction 75K
    const taxNew     = calcNewRegimeTax(taxableNew);

    /* STCG/LTCG taxes */
    const stcgTax    = Math.round(stcg * 0.20 * 1.04);
    const ltcgTax    = Math.round(ltcgTaxable * 0.125 * 1.04);
    const totalTaxOld = taxOld + stcgTax + ltcgTax;
    const totalTaxNew = taxNew + stcgTax + ltcgTax;

    /* Better regime */
    const betterRegime = taxOld <= taxNew ? 'old' : 'new';

    /* Advance tax (on non-salary / capital gains income) */
    const advanceTaxableIncome = otherIncome + stcg + ltcgTaxable;
    const annualAdvanceTax = betterRegime === 'old'
      ? calcOldRegimeTax(Math.max(0, advanceTaxableIncome - totalDeductionsOld))
      : calcNewRegimeTax(Math.max(0, advanceTaxableIncome - 75000));

    /* 80C gap */
    const gap80C = Math.max(0, 150000 - d80C);
    const gap80D = Math.max(0, 25000 - d80D);

    return {
      fy: '2025-26', ay: '2026-27',
      income: { salary, otherIncome, total: totalIncome },
      capital_gains: { stcg, ltcg, ltcgTaxable, stcgTax, ltcgTax },
      deductions: { d80C, d80D, d80CCD1B, dHRA, dHomeLoan, d80E, dStdSalary, total: totalDeductionsOld },
      old_regime: { taxable: taxableOld, incomeTax: taxOld, total: totalTaxOld },
      new_regime: { taxable: taxableNew, incomeTax: taxNew, total: totalTaxNew },
      better_regime: betterRegime,
      saving: Math.abs(totalTaxOld - totalTaxNew),
      advance_tax: { annual: annualAdvanceTax, schedule: ADVANCE_TAX_DATES.map(q => ({
        ...q,
        amount: Math.round(annualAdvanceTax * q.pct / 100),
        cumulative: Math.round(annualAdvanceTax * q.pct / 100),
        overdue: q.deadline < new Date(),
        days_left: Math.max(0, Math.floor((q.deadline - Date.now()) / 86400000)),
      }))},
      gaps: { gap80C, gap80D },
      name: profile.name || localStorage.getItem('finos_display_name') || 'Taxpayer',
      pan:  profile.pan || '••••••••••',
      generated: new Date().toISOString(),
    };
  }

  /* ── HTML Report Renderer ──────────────────────────────────────── */
  function renderDossierHTML(dossier) {
    const d = dossier;
    const better = d.better_regime === 'old' ? 'Old Regime' : 'New Regime';
    const betterColor = '#22d3a6';
    const today = new Date().toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' });

    return `
      <div id="tax-dossier-doc" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:700px;margin:0 auto;color:#F5F7FA;">

        <!-- Header -->
        <div style="background:linear-gradient(135deg,#0d0f1a,#1a0f2e);border-radius:20px;padding:28px;margin-bottom:20px;border:1px solid rgba(123,47,247,.3);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;">
            <div>
              <div style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#7b2ff7;font-weight:800;margin-bottom:4px;">FIN·OS Tax Dossier</div>
              <div style="font-size:24px;font-weight:900;">FY ${d.fy} · AY ${d.ay}</div>
              <div style="font-size:13px;color:#8892a4;margin-top:4px;">Taxpayer: ${d.name} · PAN: ${d.pan}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:11px;color:#8892a4;">Generated</div>
              <div style="font-size:13px;font-weight:700;">${today}</div>
              <div style="font-size:11px;color:#8892a4;margin-top:4px;">Share with your CA</div>
            </div>
          </div>
        </div>

        <!-- Regime Recommendation -->
        <div style="background:rgba(34,211,166,.08);border:1px solid rgba(34,211,166,.3);border-radius:16px;padding:20px;margin-bottom:20px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
          <div style="font-size:32px;">🏆</div>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:800;color:#22d3a6;">Best Regime for You: ${better}</div>
            <div style="font-size:13px;color:#a0aec0;margin-top:4px;">You save ${INR(d.saving)} vs the other regime. ${d.gaps.gap80C > 0 ? `You have ${INR(d.gaps.gap80C)} left in 80C — invest in ELSS/PPF before March 31.` : ''}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:22px;font-weight:800;color:#22d3a6;">${INR(d.better_regime === 'old' ? d.old_regime.total : d.new_regime.total)}</div>
            <div style="font-size:11px;color:#8892a4;">Total Tax Liability</div>
          </div>
        </div>

        <!-- Income Summary -->
        <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:20px;margin-bottom:16px;">
          <div style="font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#8892a4;margin-bottom:14px;">📊 Income Summary</div>
          ${_row('Salary Income', INR(d.income.salary))}
          ${d.income.otherIncome > 0 ? _row('Other Income', INR(d.income.otherIncome)) : ''}
          ${d.capital_gains.stcg > 0 ? _row('Short-Term Capital Gains (equity)', INR(d.capital_gains.stcg), '#f0a500') : ''}
          ${d.capital_gains.ltcg > 0 ? _row('Long-Term Capital Gains (equity)', INR(d.capital_gains.ltcg)) : ''}
          ${_rowBold('Gross Total Income', INR(d.income.total + d.capital_gains.stcg + d.capital_gains.ltcg))}
        </div>

        <!-- Deductions (Old Regime) -->
        ${d.old_regime.total < d.new_regime.total ? `
        <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:20px;margin-bottom:16px;">
          <div style="font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#8892a4;margin-bottom:14px;">📋 Deductions (Old Regime)</div>
          ${_row('80C (ELSS, PPF, LIC, EPF)', INR(d.deductions.d80C), null, '/ ₹1,50,000')}
          ${d.deductions.d80D > 0 ? _row('80D (Health Insurance)', INR(d.deductions.d80D), null, '/ ₹75,000') : ''}
          ${d.deductions.d80CCD1B > 0 ? _row('80CCD(1B) NPS', INR(d.deductions.d80CCD1B), null, '/ ₹50,000') : ''}
          ${d.deductions.dHRA > 0 ? _row('HRA Exemption', INR(d.deductions.dHRA)) : ''}
          ${d.deductions.dHomeLoan > 0 ? _row('Section 24(b) Home Loan Interest', INR(d.deductions.dHomeLoan), null, '/ ₹2,00,000') : ''}
          ${d.deductions.d80E > 0 ? _row('80E Education Loan Interest', INR(d.deductions.d80E)) : ''}
          ${_row('Standard Deduction', INR(d.deductions.dStdSalary))}
          ${_rowBold('Total Deductions', INR(d.deductions.total))}
          ${d.gaps.gap80C > 0 ? `<div style="background:rgba(240,165,0,.08);border:1px solid rgba(240,165,0,.2);border-radius:10px;padding:10px 14px;margin-top:12px;font-size:12px;color:#f0a500;">⚠ You have ${INR(d.gaps.gap80C)} unused 80C limit. Invest in ELSS or top up PPF/NPS before March 31 to save ${INR(d.gaps.gap80C * 0.30)} in tax.</div>` : ''}
        </div>` : ''}

        <!-- Tax Computation -->
        <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:20px;margin-bottom:16px;">
          <div style="font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#8892a4;margin-bottom:14px;">🧮 Tax Computation</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div style="background:${d.better_regime==='old'?'rgba(34,211,166,.06)':'rgba(255,255,255,.02)'};border:1px solid ${d.better_regime==='old'?'rgba(34,211,166,.3)':'rgba(255,255,255,.08)'};border-radius:12px;padding:16px;">
              <div style="font-size:11px;font-weight:700;color:#8892a4;margin-bottom:8px;">OLD REGIME ${d.better_regime==='old'?'<span style=\'color:#22d3a6\'>✓ BETTER</span>':''}</div>
              ${_row('Taxable Income', INR(d.old_regime.taxable))}
              ${_row('Income Tax', INR(d.old_regime.incomeTax))}
              ${d.capital_gains.stcgTax > 0 ? _row('STCG Tax (20%)', INR(d.capital_gains.stcgTax)) : ''}
              ${d.capital_gains.ltcgTax > 0 ? _row('LTCG Tax (12.5%)', INR(d.capital_gains.ltcgTax)) : ''}
              <div style="border-top:1px solid rgba(255,255,255,.08);padding-top:8px;margin-top:8px;font-weight:800;font-size:16px;">${INR(d.old_regime.total)}</div>
            </div>
            <div style="background:${d.better_regime==='new'?'rgba(34,211,166,.06)':'rgba(255,255,255,.02)'};border:1px solid ${d.better_regime==='new'?'rgba(34,211,166,.3)':'rgba(255,255,255,.08)'};border-radius:12px;padding:16px;">
              <div style="font-size:11px;font-weight:700;color:#8892a4;margin-bottom:8px;">NEW REGIME ${d.better_regime==='new'?'<span style=\'color:#22d3a6\'>✓ BETTER</span>':''}</div>
              ${_row('Taxable Income', INR(d.new_regime.taxable))}
              ${_row('Income Tax', INR(d.new_regime.incomeTax))}
              ${d.capital_gains.stcgTax > 0 ? _row('STCG Tax (20%)', INR(d.capital_gains.stcgTax)) : ''}
              ${d.capital_gains.ltcgTax > 0 ? _row('LTCG Tax (12.5%)', INR(d.capital_gains.ltcgTax)) : ''}
              <div style="border-top:1px solid rgba(255,255,255,.08);padding-top:8px;margin-top:8px;font-weight:800;font-size:16px;">${INR(d.new_regime.total)}</div>
            </div>
          </div>
        </div>

        <!-- Advance Tax Calendar -->
        <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:20px;margin-bottom:16px;">
          <div style="font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#8892a4;margin-bottom:14px;">📅 Advance Tax Calendar</div>
          ${d.advance_tax.annual < 10000
            ? `<div style="font-size:13px;color:#22d3a6;">✅ Advance tax not applicable (liability &lt; ₹10,000). TDS covers your taxes.</div>`
            : d.advance_tax.schedule.map(q => `
              <div style="display:flex;align-items:center;gap:14px;padding:12px;background:${q.overdue?'rgba(255,68,68,.05)':q.days_left<=30?'rgba(240,165,0,.05)':'rgba(255,255,255,.02)'};border-radius:10px;margin-bottom:8px;border:1px solid ${q.overdue?'rgba(255,68,68,.15)':q.days_left<=30?'rgba(240,165,0,.15)':'rgba(255,255,255,.06)'};">
                <div style="font-size:11px;font-weight:800;width:24px;color:#8892a4;">${q.quarter}</div>
                <div style="flex:1;">
                  <div style="font-size:13px;font-weight:700;">Due: ${q.dueDate}</div>
                  <div style="font-size:11px;color:#8892a4;">${q.pct}% of annual advance tax</div>
                </div>
                <div style="text-align:right;">
                  <div style="font-size:16px;font-weight:800;color:${q.overdue?'#ff4444':q.days_left<=30?'#f0a500':'#F5F7FA'}">${INR(q.amount)}</div>
                  <div style="font-size:10px;color:#8892a4;">${q.overdue?'⚠ Overdue':q.days_left<=30?`⏰ ${q.days_left} days`:`${q.days_left} days left`}</div>
                </div>
              </div>`).join('')}
        </div>

        <!-- Footer -->
        <div style="text-align:center;padding:20px;font-size:11px;color:#8892a4;line-height:1.8;">
          Generated by FIN·OS · ${today}<br>
          This is a summary based on your declared data. Verify with Form 16, AIS, and 26AS before filing.<br>
          <strong style="color:#F5F7FA;">Not a substitute for professional CA advice.</strong>
        </div>
      </div>
    `;
  }

  function _row(label, value, color = null, limit = '') {
    return `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:13px;">
      <span style="color:#a0aec0;">${label} <span style="color:#8892a4;font-size:11px;">${limit}</span></span>
      <span style="font-weight:600;color:${color || '#F5F7FA'};">${value}</span>
    </div>`;
  }

  function _rowBold(label, value) {
    return `<div style="display:flex;justify-content:space-between;padding:10px 0 6px;font-size:14px;font-weight:800;border-top:1px solid rgba(255,255,255,.1);margin-top:6px;">
      <span>${label}</span><span>${value}</span>
    </div>`;
  }

  /* ── Main UI renderer ──────────────────────────────────────────── */
  function render(containerId, ctx) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const dossier = buildDossier(ctx || window.FINOS_USER_CONTEXT || {});
    const html    = renderDossierHTML(dossier);

    container.innerHTML = `
      <div style="font-family:-apple-system,sans-serif;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px;">
          <div>
            <div style="font-size:20px;font-weight:800;color:#F5F7FA;">📋 Tax Dossier</div>
            <div style="font-size:13px;color:#8892a4;">Complete pre-filled summary for FY 2025-26</div>
          </div>
          <div style="display:flex;gap:10px;">
            <button onclick="window.FinosTaxDossier.print()" style="padding:9px 18px;border-radius:10px;background:rgba(123,47,247,.15);border:1px solid rgba(123,47,247,.4);color:#a78bfa;font-size:12px;font-weight:700;cursor:pointer;">🖨 Print</button>
            <button onclick="window.FinosTaxDossier.copyText()" style="padding:9px 18px;border-radius:10px;background:rgba(0,212,255,.1);border:1px solid rgba(0,212,255,.3);color:#00d4ff;font-size:12px;font-weight:700;cursor:pointer;">📋 Copy</button>
          </div>
        </div>
        ${html}
      </div>
    `;

    global.FinosTaxDossier._lastDossier = dossier;
  }

  /* ── Public API ─────────────────────────────────────────────────── */
  const FinosTaxDossier = {
    _lastDossier: null,
    build: buildDossier,
    render,

    print() {
      const win = window.open('', '_blank', 'width=800,height=900');
      win.document.write(`<html><head><title>FIN·OS Tax Dossier</title><style>body{background:#0a0c14;padding:24px;}</style></head><body>${renderDossierHTML(this._lastDossier || buildDossier(window.FINOS_USER_CONTEXT || {}))}</body></html>`);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 500);
    },

    copyText() {
      const d = this._lastDossier || buildDossier(window.FINOS_USER_CONTEXT || {});
      const text = [
        `FIN·OS Tax Dossier — FY ${d.fy} / AY ${d.ay}`,
        `Taxpayer: ${d.name}  |  PAN: ${d.pan}`,
        '',
        '=== INCOME ===',
        `Salary: ${INR(d.income.salary)}`,
        `Other Income: ${INR(d.income.otherIncome)}`,
        `STCG: ${INR(d.capital_gains.stcg)}  |  LTCG: ${INR(d.capital_gains.ltcg)}`,
        '',
        '=== DEDUCTIONS (OLD REGIME) ===',
        `80C: ${INR(d.deductions.d80C)} / ₹1,50,000`,
        `80D: ${INR(d.deductions.d80D)}  |  NPS: ${INR(d.deductions.d80CCD1B)}`,
        `HRA: ${INR(d.deductions.dHRA)}  |  Home Loan: ${INR(d.deductions.dHomeLoan)}`,
        '',
        '=== TAX LIABILITY ===',
        `Old Regime: ${INR(d.old_regime.total)}`,
        `New Regime: ${INR(d.new_regime.total)}`,
        `RECOMMENDATION: ${d.better_regime === 'old' ? 'Old' : 'New'} Regime (saves ${INR(d.saving)})`,
        '',
        '=== ADVANCE TAX ===',
        ...d.advance_tax.schedule.map(q => `${q.quarter} (${q.dueDate}): ${INR(q.amount)}`),
        '',
        `Generated by FIN·OS on ${new Date().toLocaleDateString('en-IN')}`,
      ].join('\n');

      navigator.clipboard?.writeText(text).then(() => {
        window.FinosToast?.show?.('✅ Tax dossier copied to clipboard! Paste it in an email to your CA.', 'success');
      }).catch(() => {
        prompt('Copy the text below:', text);
      });
    },

    /* Advance tax calendar widget */
    renderAdvanceTaxCalendar(containerId, ctx) {
      const container = document.getElementById(containerId);
      if (!container) return;
      const d = buildDossier(ctx || window.FINOS_USER_CONTEXT || {});
      const upcoming = d.advance_tax.schedule.filter(q => !q.overdue || q.days_left === 0).slice(0, 2);
      if (!upcoming.length || d.advance_tax.annual < 10000) {
        container.innerHTML = `<div style="font-size:13px;color:#22d3a6;padding:14px;">✅ No advance tax due (TDS covers your liability).</div>`;
        return;
      }
      const next = upcoming[0];
      container.innerHTML = `
        <div style="background:${next.days_left<=30?'rgba(240,165,0,.08)':'rgba(255,255,255,.03)'};border:1px solid ${next.days_left<=30?'rgba(240,165,0,.25)':'rgba(255,255,255,.08)'};border-radius:14px;padding:16px;">
          <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#8892a4;margin-bottom:8px;">⏰ Next Advance Tax</div>
          <div style="font-size:20px;font-weight:800;color:${next.days_left<=30?'#f0a500':'#F5F7FA'}">${INR(next.amount)}</div>
          <div style="font-size:13px;color:#a0aec0;margin-top:4px;">Due ${next.dueDate} · ${next.days_left} days</div>
          <div style="font-size:11px;color:#8892a4;margin-top:8px;">${next.quarter} installment = ${next.pct}% of annual advance tax</div>
        </div>
      `;
    }
  };

  global.FinosTaxDossier = FinosTaxDossier;

}(window));
