/**
 * calc-prefill.js — Auto-fill calculator inputs from FINOS_USER_CONTEXT
 * Include at bottom of any calculator HTML: <script src="../js/calc-prefill.js"></script>
 *
 * Field mapping uses data attributes: data-prefill="income|age|risk|..."
 * Or common input IDs are detected automatically.
 */
(function () {
  'use strict';

  // Wait for context to be available (phase 2 may still be loading)
  function getCtx() {
    return window.FINOS_USER_CONTEXT || null;
  }

  function parseIncomeMidpoint(range) {
    if (!range) return null;
    const clean = String(range).replace(/[₹,\s]/g, '');
    const nums = clean.match(/\d+/g);
    if (!nums) return null;
    if (nums.length >= 2) return Math.round((+nums[0] + +nums[1]) / 2) * 1000;
    return +nums[0] * 1000 || null;
  }

  function tryFill(id, value) {
    if (!value && value !== 0) return;
    const el = document.getElementById(id);
    if (!el) return;
    // Don't overwrite if user already typed something
    if (el.value && el.value !== '0' && el.value !== '') return;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function riskIndexFromDNA(scores) {
    // DNA risk score 0-100 → slider value 1-5
    if (!scores || !scores[0]) return null;
    return Math.max(1, Math.min(5, Math.round(scores[0] / 20)));
  }

  // Common input ID patterns across all 88 calculators
  const FIELD_MAP = {
    // Age
    age:           ['age', 'current-age', 'currentAge', 'your-age', 'user-age', 'inp-age'],
    // Monthly income
    income:        ['monthly-income', 'monthlyIncome', 'monthly_income', 'income', 'salary', 'monthly-salary'],
    // Annual income
    annual_income: ['annual-income', 'annualIncome', 'yearly-income', 'annual_income'],
    // Retirement age
    retire_age:    ['retire-age', 'retireAge', 'retirement-age', 'target-age'],
    // SIP amount (default 20% of income)
    sip_amount:    ['sip-amount', 'sipAmount', 'monthly-sip', 'sip', 'monthly-investment'],
    // Risk level (1-5 scale)
    risk:          ['risk-level', 'riskLevel', 'risk', 'risk-tolerance'],
    // City tier
    city:          ['city', 'city-tier', 'location'],
  };

  function prefill() {
    const ctx = getCtx();
    if (!ctx) return;

    const identity = ctx.identity || {};
    const profile  = ctx.profile  || {};
    const budget   = ctx.budget_tracker || {};
    const dna      = ctx.dna || {};

    const income_monthly = budget.income_monthly
      || parseIncomeMidpoint(identity.income_range)
      || null;

    const income_annual = income_monthly ? income_monthly * 12 : null;
    const age           = parseInt(identity.age) || null;
    const sip_default   = income_monthly ? Math.round(income_monthly * 0.20 / 1000) * 1000 : null;
    const risk_idx      = riskIndexFromDNA(dna.scores);
    const city          = identity.city || null;

    FIELD_MAP.age.forEach(id          => tryFill(id, age));
    FIELD_MAP.income.forEach(id       => tryFill(id, income_monthly));
    FIELD_MAP.annual_income.forEach(id=> tryFill(id, income_annual));
    FIELD_MAP.sip_amount.forEach(id   => tryFill(id, sip_default));
    FIELD_MAP.risk.forEach(id         => tryFill(id, risk_idx));
    if (city) FIELD_MAP.city.forEach(id => tryFill(id, city));

    // Retirement age: default 60
    const retire_default = age ? Math.min(60, Math.max(45, 60)) : 60;
    FIELD_MAP.retire_age.forEach(id => tryFill(id, retire_default));

    // data-prefill attribute support
    document.querySelectorAll('[data-prefill]').forEach(el => {
      const key = el.getAttribute('data-prefill');
      const val = {
        income: income_monthly, annual_income: income_annual,
        age, risk: risk_idx, city, sip: sip_default,
      }[key];
      if (val && (!el.value || el.value === '0')) {
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    // Show pre-fill notice
    const notice = document.createElement('div');
    notice.style.cssText = [
      'position:fixed;bottom:20px;right:20px;z-index:9999',
      'background:rgba(0,212,255,.12);border:1px solid rgba(0,212,255,.3)',
      'color:#00d4ff;border-radius:10px;padding:10px 16px',
      'font-size:.78rem;font-weight:600;pointer-events:none',
      'animation:fadeIn .3s ease',
    ].join(';');
    notice.textContent = '✨ Pre-filled from your profile';
    document.body.appendChild(notice);
    setTimeout(() => notice.remove(), 2500);
  }

  // Run after DOM is ready and context is loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(prefill, 800));
  } else {
    setTimeout(prefill, 800);
  }

  // Also respond to context-ready event if finos-context.js fires one
  document.addEventListener('finos-context-ready', prefill);

  // Expose globally for manual trigger
  window.calcPrefill = prefill;
})();
