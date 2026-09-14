/**
 * finos-debt-optimizer.js — Debt Payoff Optimizer  v1.0  (Phase 35)
 * ──────────────────────────────────────────────────────────────────
 * Reads existing loan balances from Net Worth tracker localStorage keys,
 * accepts interest rates + EMI from user, then computes Avalanche vs
 * Snowball payoff strategies and prepayment impact.
 *
 * localStorage keys read (balances from Net Worth tracker):
 *   finos_home_loan, finos_car_loan, finos_personal_loan, finos_credit_card_debt
 *
 * localStorage keys written (rates + EMIs entered here):
 *   finos_home_loan_rate, finos_home_loan_emi
 *   finos_car_loan_rate,  finos_car_loan_emi
 *   finos_personal_loan_rate, finos_personal_loan_emi
 *   finos_cc_rate, finos_cc_min_payment
 */
(function (global) {
  'use strict';

  /* ── Helpers ─────────────────────────────────────────────────────── */
  function gs(k) { return parseFloat(localStorage.getItem(k) || '0') || 0; }
  function ss(k, v) { try { localStorage.setItem(k, String(v)); } catch (_) {} }

  function INR(n) {
    n = Number(n) || 0;
    if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr';
    if (n >= 1e5) return '₹' + (n / 1e5).toFixed(1) + ' L';
    if (n >= 1e3) return '₹' + Math.round(n / 1e3) + 'K';
    return '₹' + Math.round(n);
  }

  function monthsToText(m) {
    if (!m || m <= 0) return '—';
    const y = Math.floor(m / 12), mo = m % 12;
    return (y > 0 ? y + 'yr ' : '') + (mo > 0 ? mo + 'mo' : '');
  }

  function addMonths(months) {
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  }

  /* ── Financial math ──────────────────────────────────────────────── */
  function calcEMI(principal, annualRate, tenureMonths) {
    if (!principal || !annualRate || !tenureMonths) return 0;
    const r = annualRate / 100 / 12;
    return Math.round(principal * r * Math.pow(1 + r, tenureMonths) / (Math.pow(1 + r, tenureMonths) - 1));
  }

  function calcRemainingMonths(balance, emi, annualRate) {
    if (!balance || !emi || emi <= 0) return 0;
    const r = annualRate / 100 / 12;
    if (r <= 0) return Math.ceil(balance / emi);
    if (emi <= balance * r) return 999; // EMI too low — never pays off
    return Math.ceil(-Math.log(1 - balance * r / emi) / Math.log(1 + r));
  }

  /* ── Payoff simulation ───────────────────────────────────────────── */
  function simulatePayoff(loans, extraMonthly, strategy) {
    // strategy: 'avalanche' (highest rate) | 'snowball' (lowest balance)
    const working = loans.map(l => ({
      ...l,
      balance: l.balance,
      totalInterest: 0,
    }));

    // Priority order
    if (strategy === 'avalanche') {
      working.sort((a, b) => b.rate - a.rate);
    } else {
      working.sort((a, b) => a.balance - b.balance);
    }

    let months = 0;
    let totalInterest = 0;
    const MAX_MONTHS = 600; // 50-year safety cap

    while (working.some(l => l.balance > 0.01) && months < MAX_MONTHS) {
      months++;
      let extra = extraMonthly;

      working.forEach(l => {
        if (l.balance <= 0) return;
        const monthlyRate = l.rate / 100 / 12;
        const interest = l.balance * monthlyRate;
        l.totalInterest += interest;
        totalInterest += interest;
        l.balance += interest;
        const payment = Math.min(l.balance, l.emi);
        l.balance = Math.max(0, l.balance - payment);
      });

      // Apply extra to first unpaid loan in priority order
      for (const l of working) {
        if (l.balance <= 0) continue;
        const applied = Math.min(extra, l.balance);
        l.balance = Math.max(0, l.balance - applied);
        extra -= applied;
        if (extra <= 0) break;
      }
    }

    return { months, totalInterest: Math.round(totalInterest), perLoan: working };
  }

  /* ── Prepayment calculator ───────────────────────────────────────── */
  function calcPrepayment(balance, annualRate, emi, extraMonthly) {
    const r = annualRate / 100 / 12;
    let b = balance, months = 0, interest = 0;
    const MAX = 600;
    while (b > 0.01 && months < MAX) {
      months++;
      const intCharge = b * r;
      interest += intCharge;
      b += intCharge - emi;
      if (extraMonthly > 0) b = Math.max(0, b - extraMonthly);
    }
    return { months, interest: Math.round(interest) };
  }

  /* ── Loan catalogue ──────────────────────────────────────────────── */
  const LOAN_TYPES = [
    { key: 'home',     balKey: 'finos_home_loan',        rateKey: 'finos_home_loan_rate',     emiKey: 'finos_home_loan_emi',     label: 'Home Loan',     icon: '🏠', color: '#FF4444', defaultRate: 8.5, defaultTenure: 240 },
    { key: 'car',      balKey: 'finos_car_loan',         rateKey: 'finos_car_loan_rate',      emiKey: 'finos_car_loan_emi',      label: 'Car Loan',      icon: '🚗', color: '#FF8C42', defaultRate: 9.5, defaultTenure: 60  },
    { key: 'personal', balKey: 'finos_personal_loan',    rateKey: 'finos_personal_loan_rate', emiKey: 'finos_personal_loan_emi', label: 'Personal Loan', icon: '👤', color: '#FFB347', defaultRate: 14.0, defaultTenure: 36 },
    { key: 'cc',       balKey: 'finos_credit_card_debt', rateKey: 'finos_cc_rate',            emiKey: 'finos_cc_min_payment',    label: 'Credit Card',   icon: '💳', color: '#FF4D4D', defaultRate: 36.0, defaultTenure: 24 },
  ];

  /* ── Render: loan setup form ─────────────────────────────────────── */
  function renderSetup(el) {
    if (!el) return;

    const activeLoans = LOAN_TYPES.filter(l => gs(l.balKey) > 0 || gs(l.emiKey) > 0);

    const loanCards = LOAN_TYPES.map(l => {
      const bal  = gs(l.balKey);
      const rate = gs(l.rateKey) || l.defaultRate;
      const emi  = gs(l.emiKey);
      const show = bal > 0 || emi > 0;

      return `
        <div class="do-loan-card${show ? ' do-loan-active' : ''}" data-key="${l.key}">
          <div class="do-loan-head">
            <span class="do-loan-icon">${l.icon}</span>
            <span class="do-loan-label">${l.label}</span>
            <label class="do-toggle" title="Include this loan">
              <input type="checkbox" class="do-loan-toggle" data-key="${l.key}"${show ? ' checked' : ''}
                onchange="FinosDebtOptimizer._toggleLoan('${l.key}', this.checked)">
              <span class="do-toggle-knob"></span>
            </label>
          </div>
          <div class="do-loan-fields" id="do-fields-${l.key}" style="${show ? '' : 'display:none'}">
            <div class="do-field-row">
              <div class="do-field">
                <label>Outstanding Balance (₹)</label>
                <input type="number" class="do-inp" id="do-bal-${l.key}"
                  value="${bal || ''}" placeholder="e.g. 3500000"
                  onchange="FinosDebtOptimizer._save('${l.balKey}', this.value)">
              </div>
              <div class="do-field">
                <label>Interest Rate (% p.a.)</label>
                <input type="number" class="do-inp" id="do-rate-${l.key}"
                  value="${rate || ''}" placeholder="${l.defaultRate}" step="0.1"
                  onchange="FinosDebtOptimizer._save('${l.rateKey}', this.value)">
              </div>
              <div class="do-field">
                <label>Monthly EMI / Min. Payment (₹)</label>
                <input type="number" class="do-inp" id="do-emi-${l.key}"
                  value="${emi || ''}" placeholder="auto-compute"
                  onchange="FinosDebtOptimizer._save('${l.emiKey}', this.value)">
                <button class="do-calc-btn" onclick="FinosDebtOptimizer._computeEMI('${l.key}')">Compute EMI</button>
              </div>
            </div>
          </div>
        </div>`;
    }).join('');

    el.innerHTML = `
      <div class="do-setup">
        <div class="do-section-title">Your Loans</div>
        <p class="do-hint">Balances auto-filled from Net Worth tracker. Enter interest rates and EMIs (or click Compute EMI).</p>
        ${loanCards}

        <div class="do-extra-row">
          <div class="do-field" style="flex:1">
            <label>💪 Extra monthly payment (₹)</label>
            <input type="number" class="do-inp" id="do-extra-payment"
              value="${gs('finos_debt_extra_payment') || ''}" placeholder="e.g. 5000"
              onchange="FinosDebtOptimizer._save('finos_debt_extra_payment', this.value)">
            <span class="do-field-hint">Amount you can pay beyond all EMIs each month</span>
          </div>
        </div>

        <button class="do-cta-btn" onclick="FinosDebtOptimizer.runOptimizer()">
          🔍 Optimize My Debt Payoff
        </button>
      </div>
      <div id="do-results-mount"></div>`;
  }

  /* ── Helpers for inline interactions ─────────────────────────────── */
  function _toggleLoan(key, checked) {
    const fields = document.getElementById('do-fields-' + key);
    if (fields) fields.style.display = checked ? '' : 'none';
    const card = document.querySelector(`.do-loan-card[data-key="${key}"]`);
    if (card) card.classList.toggle('do-loan-active', checked);
  }

  function _save(lsKey, value) {
    ss(lsKey, parseFloat(value) || 0);
  }

  function _computeEMI(key) {
    const l    = LOAN_TYPES.find(x => x.key === key);
    const bal  = parseFloat(document.getElementById('do-bal-' + key)?.value || '0') || gs(l.balKey);
    const rate = parseFloat(document.getElementById('do-rate-' + key)?.value || '0') || l.defaultRate;
    if (!bal || !rate) { alert('Enter balance and interest rate first.'); return; }
    const emi  = calcEMI(bal, rate, l.defaultTenure);
    const inp  = document.getElementById('do-emi-' + key);
    if (inp) { inp.value = emi; ss(l.emiKey, emi); }
  }

  /* ── Run the optimizer ───────────────────────────────────────────── */
  function runOptimizer() {
    const loans = [];
    LOAN_TYPES.forEach(l => {
      const toggle = document.querySelector(`.do-loan-toggle[data-key="${l.key}"]`);
      if (toggle && !toggle.checked) return;
      const bal  = parseFloat(document.getElementById('do-bal-' + l.key)?.value || '0') || gs(l.balKey);
      const rate = parseFloat(document.getElementById('do-rate-' + l.key)?.value || '0') || gs(l.rateKey);
      const emi  = parseFloat(document.getElementById('do-emi-' + l.key)?.value || '0') || gs(l.emiKey);
      if (bal > 0 && rate > 0 && emi > 0) {
        loans.push({ key: l.key, label: l.label, icon: l.icon, color: l.color, balance: bal, rate, emi });
      }
    });

    if (!loans.length) {
      alert('Add at least one active loan with balance, rate and EMI.'); return;
    }

    const extra = parseFloat(document.getElementById('do-extra-payment')?.value || '0') || gs('finos_debt_extra_payment');
    const el = document.getElementById('do-results-mount');
    if (el) renderResults(el, loans, extra);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ── Render: results ─────────────────────────────────────────────── */
  function renderResults(el, loans, extraMonthly) {
    if (!el) return;

    const minOnly  = simulatePayoff(loans, 0, 'avalanche');
    const avRaw    = simulatePayoff(loans, extraMonthly, 'avalanche');
    const swRaw    = simulatePayoff(loans, extraMonthly, 'snowball');

    const avSaved  = minOnly.totalInterest - avRaw.totalInterest;
    const swSaved  = minOnly.totalInterest - swRaw.totalInterest;
    const avWins   = avRaw.totalInterest <= swRaw.totalInterest;

    const totalBalance = loans.reduce((s, l) => s + l.balance, 0);

    // Prepayment section for home loan only
    const homeLoan = loans.find(l => l.key === 'home');
    let prepayHTML = '';
    if (homeLoan && extraMonthly > 0) {
      const std  = calcPrepayment(homeLoan.balance, homeLoan.rate, homeLoan.emi, 0);
      const prep = calcPrepayment(homeLoan.balance, homeLoan.rate, homeLoan.emi, extraMonthly);
      const mSaved = std.months - prep.months;
      const iSaved = std.interest - prep.interest;
      prepayHTML = `
        <div class="do-prepay-box">
          <div class="do-section-title" style="margin-bottom:12px;">🏠 Home Loan Prepayment Impact</div>
          <div class="do-prepay-grid">
            <div class="do-prepay-card do-prepay-std">
              <div class="do-prepay-lbl">Without extra payment</div>
              <div class="do-prepay-val">${monthsToText(std.months)}</div>
              <div class="do-prepay-sub">Total interest: ${INR(std.interest)}</div>
              <div class="do-prepay-date">Free: ${addMonths(std.months)}</div>
            </div>
            <div class="do-prepay-arrow">→</div>
            <div class="do-prepay-card do-prepay-acc">
              <div class="do-prepay-lbl">With ₹${Math.round(extraMonthly).toLocaleString('en-IN')}/mo extra</div>
              <div class="do-prepay-val">${monthsToText(prep.months)}</div>
              <div class="do-prepay-sub">Total interest: ${INR(prep.interest)}</div>
              <div class="do-prepay-date">Free: ${addMonths(prep.months)}</div>
            </div>
          </div>
          <div class="do-prepay-savings">
            You save <strong>${INR(iSaved)}</strong> in interest and become debt-free
            <strong>${monthsToText(mSaved)}</strong> earlier.
          </div>
        </div>`;
    }

    el.innerHTML = `
      <div class="do-results" style="margin-top:28px;">

        <!-- Summary strip -->
        <div class="do-summary-strip">
          <div class="do-summary-item">
            <div class="do-summary-lbl">Total Debt</div>
            <div class="do-summary-val" style="color:#EF4444">${INR(totalBalance)}</div>
          </div>
          <div class="do-summary-item">
            <div class="do-summary-lbl">Min-only interest</div>
            <div class="do-summary-val">${INR(minOnly.totalInterest)}</div>
          </div>
          <div class="do-summary-item">
            <div class="do-summary-lbl">Min-only payoff</div>
            <div class="do-summary-val">${monthsToText(minOnly.months)}</div>
          </div>
          <div class="do-summary-item">
            <div class="do-summary-lbl">Extra/mo</div>
            <div class="do-summary-val" style="color:#22D3A6">${extraMonthly > 0 ? INR(extraMonthly) : '₹0'}</div>
          </div>
        </div>

        <!-- Strategy comparison -->
        <div class="do-section-title">Strategy Comparison${extraMonthly > 0 ? ` (with ${INR(extraMonthly)}/mo extra)` : ' (minimum payments only)'}</div>
        <div class="do-strategy-grid">
          <div class="do-strategy-card${avWins ? ' do-strategy-winner' : ''}">
            ${avWins ? '<div class="do-winner-badge">⭐ Recommended</div>' : ''}
            <div class="do-strategy-name">🏔️ Avalanche</div>
            <div class="do-strategy-sub">Highest interest rate first</div>
            <div class="do-strategy-stat"><span class="do-stat-lbl">Total interest</span><span class="do-stat-val" style="color:#EF4444">${INR(avRaw.totalInterest)}</span></div>
            <div class="do-strategy-stat"><span class="do-stat-lbl">Time to debt-free</span><span class="do-stat-val">${monthsToText(avRaw.months)}</span></div>
            <div class="do-strategy-stat"><span class="do-stat-lbl">Free by</span><span class="do-stat-val">${addMonths(avRaw.months)}</span></div>
            ${avSaved > 0 ? `<div class="do-strategy-saving">Saves ${INR(avSaved)} vs min-only</div>` : ''}
            <div class="do-strategy-order">Payoff order: ${loans.slice().sort((a,b) => b.rate - a.rate).map(l => l.icon + ' ' + l.label).join(' → ')}</div>
          </div>

          <div class="do-strategy-card${!avWins ? ' do-strategy-winner' : ''}">
            ${!avWins ? '<div class="do-winner-badge">⭐ Recommended</div>' : ''}
            <div class="do-strategy-name">⛄ Snowball</div>
            <div class="do-strategy-sub">Smallest balance first</div>
            <div class="do-strategy-stat"><span class="do-stat-lbl">Total interest</span><span class="do-stat-val" style="color:#EF4444">${INR(swRaw.totalInterest)}</span></div>
            <div class="do-strategy-stat"><span class="do-stat-lbl">Time to debt-free</span><span class="do-stat-val">${monthsToText(swRaw.months)}</span></div>
            <div class="do-strategy-stat"><span class="do-stat-lbl">Free by</span><span class="do-stat-val">${addMonths(swRaw.months)}</span></div>
            ${swSaved > 0 ? `<div class="do-strategy-saving">Saves ${INR(swSaved)} vs min-only</div>` : ''}
            <div class="do-strategy-order">Payoff order: ${loans.slice().sort((a,b) => a.balance - b.balance).map(l => l.icon + ' ' + l.label).join(' → ')}</div>
          </div>
        </div>

        ${avSaved !== swSaved ? `
        <div class="do-insight-box">
          ${avWins
            ? `🏔️ Avalanche saves ${INR(avSaved - swSaved)} more interest than Snowball. Choose Snowball only if you need quick motivation from paying off small loans fast.`
            : `⛄ Snowball is marginally better here — your loan rates are close enough that the psychological "win" from faster payoffs outweighs the math.`}
        </div>` : ''}

        ${prepayHTML}

        <button class="do-edit-btn" onclick="document.getElementById('do-results-mount').innerHTML='';window.scrollTo({top:0,behavior:'smooth'})">
          ← Edit Loans
        </button>
      </div>`;

    // Write summary to localStorage for context
    try {
      ss('finos_debt_avalanche_months', avRaw.months);
      ss('finos_debt_total_interest', avRaw.totalInterest);
      ss('finos_debt_interest_saved', Math.max(avSaved, swSaved));
      window.FinosContext?.update?.({ debtFreeMonths: avRaw.months, debtInterestSaved: Math.max(avSaved, swSaved) });
    } catch (_) {}
  }

  /* ── Export ──────────────────────────────────────────────────────── */
  global.FinosDebtOptimizer = {
    renderSetup, renderResults, runOptimizer,
    _toggleLoan, _save, _computeEMI,
  };

})(window);
