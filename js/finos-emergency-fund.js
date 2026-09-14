/* finos-emergency-fund.js — Emergency Fund Tracker
 *
 * Public API (window.FinosEmergencyFund):
 *   renderOverview(el)     — hero ring + status + instrument guide
 *   renderPlan(el)         — build-up plan + instrument comparison
 *
 * localStorage written:
 *   finos_emergency_fund         — current emergency fund balance (₹)
 *   finos_emergency_months_target— target months (3, 6, or 12)
 *   finos_emergency_months_covered — months covered by current fund
 */
window.FinosEmergencyFund = (function () {
  'use strict';

  const gs  = k => parseFloat(localStorage.getItem(k)) || 0;
  const ss  = (k, v) => localStorage.setItem(k, v);
  const gss = k => localStorage.getItem(k) || '';
  const INR = v => '₹' + Math.abs(Math.round(v)).toLocaleString('en-IN');

  /* ── Core computation ─────────────────────────────────────────── */
  function _compute() {
    const fund   = gs('finos_emergency_fund');
    const target = parseInt(gss('finos_emergency_months_target')) || 6;
    // Pull monthly expense from budget tracker if available
    const monthlyExp = gs('finos_monthly_expense') || gs('finos_budget_expenses') || 0;
    const targetAmt  = monthlyExp * target;
    const pct        = targetAmt > 0 ? Math.min((fund / targetAmt) * 100, 100) : 0;
    const covered    = monthlyExp > 0 ? Math.round((fund / monthlyExp) * 10) / 10 : 0;
    const shortfall  = Math.max(targetAmt - fund, 0);
    const surplus    = Math.max(fund - targetAmt, 0);

    ss('finos_emergency_months_covered', covered);

    return { fund, target, monthlyExp, targetAmt, pct, covered, shortfall, surplus };
  }

  /* ── SVG ring ─────────────────────────────────────────────────── */
  function _ring(pct, color) {
    const r  = 54;
    const cx = 68;
    const c  = 2 * Math.PI * r;
    const dash = (pct / 100) * c;
    return `
<svg width="136" height="136" viewBox="0 0 136 136">
  <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="10"/>
  <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${color}" stroke-width="10"
    stroke-dasharray="${dash} ${c}" stroke-dashoffset="${c * 0.25}" stroke-linecap="round"
    style="transition:stroke-dasharray 1s ease;"/>
</svg>`;
  }

  /* ── Status helpers ───────────────────────────────────────────── */
  function _status(pct) {
    if (pct >= 100) return { label: 'Fully Funded ✓',  color: '#22D3A6', bg: 'rgba(34,211,166,.08)',  border: 'rgba(34,211,166,.25)' };
    if (pct >= 75)  return { label: 'Almost There',     color: '#00D4FF', bg: 'rgba(0,212,255,.07)',   border: 'rgba(0,212,255,.2)'   };
    if (pct >= 40)  return { label: 'Building Up',      color: '#FFB347', bg: 'rgba(255,179,71,.07)',  border: 'rgba(255,179,71,.2)'  };
    return              { label: 'Critical Gap ⚠️',   color: '#EF4444', bg: 'rgba(239,68,68,.07)',   border: 'rgba(239,68,68,.2)'   };
  }

  /* ── Instrument guide ─────────────────────────────────────────── */
  const INSTRUMENTS = [
    { name: 'High-Yield Savings Account', return: '3–4% p.a.', liquidity: 'Instant', risk: 'Zero', best: 'Tier-1 buffer (1–2 months)' },
    { name: 'Liquid Mutual Fund',         return: '6–7% p.a.', liquidity: '1 business day', risk: 'Very Low', best: 'Core emergency fund (3–4 months)' },
    { name: 'Ultra Short-Duration FD',    return: '7–8% p.a.', liquidity: '1–3 days (premature)', risk: 'Zero', best: 'Extended buffer (5–6 months)' },
    { name: 'Overnight Fund',             return: '5–6% p.a.', liquidity: 'T+1', risk: 'Near Zero', best: 'Parking between pay cycles' },
  ];

  /* ══════════════════════════════════════════════════════════════
     OVERVIEW RENDERER
  ══════════════════════════════════════════════════════════════ */
  function renderOverview(container) {
    if (!container) return;
    const { fund, target, monthlyExp, targetAmt, pct, covered, shortfall, surplus } = _compute();
    const st = _status(pct);

    const instRows = INSTRUMENTS.map(i => `
      <div style="display:grid;grid-template-columns:1.4fr 1fr 1fr 1.5fr;padding:10px 14px;font-size:12px;
        background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05);border-radius:10px;margin-bottom:5px;align-items:center;gap:8px;">
        <div style="font-weight:700;color:#F5F7FA;">${i.name}</div>
        <div style="color:#22D3A6;">${i.return}</div>
        <div style="color:rgba(255,255,255,.55);">${i.liquidity}</div>
        <div style="color:rgba(255,255,255,.4);font-size:11px;">${i.best}</div>
      </div>`).join('');

    container.innerHTML = `
<style>
.ef-hero{display:flex;align-items:center;gap:28px;flex-wrap:wrap;background:${st.bg};border:1px solid ${st.border};border-radius:20px;padding:26px;margin-bottom:22px;}
.ef-ring-wrap{position:relative;width:136px;height:136px;flex-shrink:0;}
.ef-ring-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;}
.ef-ring-pct{font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:24px;font-weight:900;color:${st.color};}
.ef-ring-lbl{font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,.4);margin-top:2px;}
.ef-hero-body{flex:1;min-width:200px;}
.ef-status-badge{display:inline-block;padding:4px 12px;border-radius:999px;font-size:11px;font-weight:800;
  background:${st.bg};border:1px solid ${st.border};color:${st.color};margin-bottom:10px;}
.ef-hero-val{font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:36px;font-weight:900;color:${st.color};letter-spacing:-1px;line-height:1.1;}
.ef-hero-sub{font-size:13px;color:rgba(255,255,255,.45);margin-top:6px;}
.ef-gap-pill{display:inline-flex;align-items:center;gap:6px;margin-top:10px;padding:8px 14px;border-radius:12px;font-size:13px;font-weight:700;}
.ef-stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;margin-bottom:22px;}
.ef-stat{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:14px;text-align:center;}
.ef-stat-lbl{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,.4);margin-bottom:6px;}
.ef-stat-val{font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:18px;font-weight:800;color:#fff;}
.ef-stat-sub{font-size:11px;color:rgba(255,255,255,.35);margin-top:3px;}
.ef-form{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:20px;margin-bottom:22px;}
.ef-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;}
.ef-field{display:flex;flex-direction:column;gap:6px;}
.ef-field label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:rgba(255,255,255,.4);}
.ef-inp{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;
  color:#fff;font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:14px;
  padding:10px 14px;width:100%;box-sizing:border-box;transition:border-color .2s;outline:none;}
.ef-inp:focus{border-color:rgba(34,211,166,.5);background:rgba(34,211,166,.05);}
.ef-section{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,.4);margin:0 0 12px;}
[data-theme="light"] .ef-hero{background:rgba(34,211,166,.05);}
[data-theme="light"] .ef-stat,.ef-form{background:#fff;border-color:rgba(0,0,0,.08);}
[data-theme="light"] .ef-inp{background:#F4F6FB;border-color:rgba(0,0,0,.12);color:#0B0D12;}
[data-theme="light"] .ef-stat-val{color:#0B0D12;}
</style>

<div class="ef-hero">
  <div class="ef-ring-wrap">
    ${_ring(pct, st.color)}
    <div class="ef-ring-center">
      <div class="ef-ring-pct">${Math.round(pct)}%</div>
      <div class="ef-ring-lbl">funded</div>
    </div>
  </div>
  <div class="ef-hero-body">
    <div class="ef-status-badge">${st.label}</div>
    <div class="ef-hero-val" id="ef-fund-disp">${INR(fund)}</div>
    <div class="ef-hero-sub">of <strong style="color:${st.color};">${INR(targetAmt)}</strong> target &nbsp;·&nbsp; ${target}-month fund &nbsp;·&nbsp; ${covered.toFixed(1)} months covered</div>
    ${shortfall > 0
      ? `<div class="ef-gap-pill" style="background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.25);color:#EF4444;">
           ⚠ Top up <strong>${INR(shortfall)}</strong> more to complete your ${target}-month safety net
         </div>`
      : `<div class="ef-gap-pill" style="background:rgba(34,211,166,.08);border:1px solid rgba(34,211,166,.25);color:#22D3A6;">
           ✓ Emergency fund is complete${surplus > 0 ? ` — surplus of ${INR(surplus)} can be invested` : ''}
         </div>`}
  </div>
</div>

<div class="ef-stats">
  <div class="ef-stat" style="border-color:rgba(34,211,166,.2);">
    <div class="ef-stat-lbl">Monthly Expenses</div>
    <div class="ef-stat-val" style="color:#22D3A6;" id="ef-exp-disp">${monthlyExp > 0 ? INR(monthlyExp) : '—'}</div>
    <div class="ef-stat-sub">auto-filled from budget</div>
  </div>
  <div class="ef-stat" style="border-color:rgba(0,212,255,.2);">
    <div class="ef-stat-lbl">Target (${target} months)</div>
    <div class="ef-stat-val" style="color:#00D4FF;" id="ef-target-disp">${monthlyExp > 0 ? INR(targetAmt) : '—'}</div>
    <div class="ef-stat-sub">₹ needed for safety net</div>
  </div>
  <div class="ef-stat" style="${shortfall > 0 ? 'border-color:rgba(239,68,68,.2);' : 'border-color:rgba(34,211,166,.2);'}">
    <div class="ef-stat-lbl">${shortfall > 0 ? 'Shortfall' : 'Surplus'}</div>
    <div class="ef-stat-val" style="color:${shortfall > 0 ? '#EF4444' : '#22D3A6'};" id="ef-gap-disp">${monthlyExp > 0 ? INR(shortfall > 0 ? shortfall : surplus) : '—'}</div>
    <div class="ef-stat-sub">${shortfall > 0 ? 'still needed' : 'investable surplus'}</div>
  </div>
  <div class="ef-stat" style="border-color:rgba(255,179,71,.2);">
    <div class="ef-stat-lbl">Months Covered</div>
    <div class="ef-stat-val" style="color:#FFB347;" id="ef-cov-disp">${covered.toFixed(1)}</div>
    <div class="ef-stat-sub">at current expense rate</div>
  </div>
</div>

<div class="ef-form">
  <p class="ef-section">Configure Emergency Fund</p>
  <div class="ef-grid">
    <div class="ef-field">
      <label>Current Emergency Fund (₹)</label>
      <input class="ef-inp" type="number" min="0" step="1000" placeholder="0"
        value="${fund || ''}"
        oninput="_efSave('finos_emergency_fund', this.value)">
    </div>
    <div class="ef-field">
      <label>Target Months</label>
      <select class="ef-inp" onchange="_efSave('finos_emergency_months_target', this.value)">
        <option value="3"  ${target===3?'selected':''}>3 months (minimum)</option>
        <option value="6"  ${target===6?'selected':''}>6 months (recommended)</option>
        <option value="12" ${target===12?'selected':''}>12 months (conservative)</option>
      </select>
    </div>
    <div class="ef-field">
      <label>Monthly Expenses (₹) — override</label>
      <input class="ef-inp" type="number" min="0" step="500" placeholder="auto from budget"
        value="${monthlyExp || ''}"
        oninput="_efSave('finos_monthly_expense', this.value)">
    </div>
  </div>
</div>

<div class="ef-form">
  <p class="ef-section">Where to Keep Your Emergency Fund</p>
  <div style="display:grid;grid-template-columns:1.4fr 1fr 1fr 1.5fr;padding:8px 14px;font-size:10px;font-weight:700;
    letter-spacing:.07em;text-transform:uppercase;color:rgba(255,255,255,.35);">
    <span>Instrument</span><span>Return</span><span>Liquidity</span><span>Best For</span>
  </div>
  ${instRows}
  <div style="margin-top:14px;padding:14px;background:rgba(0,212,255,.05);border:1px solid rgba(0,212,255,.15);border-radius:12px;font-size:12px;color:rgba(255,255,255,.6);line-height:1.7;">
    💡 <strong style="color:#00D4FF;">Recommended split:</strong> Keep 1 month in savings account for instant access + 2–3 months in a liquid fund for better returns + remaining in a short-duration FD ladder. Avoid locking the full fund in equity.
  </div>
</div>

<script>
function _efSave(key, val) {
  localStorage.setItem(key, val);
  clearTimeout(window._efTimer);
  window._efTimer = setTimeout(() => {
    if (!window.FinosEmergencyFund) return;
    const c = window.FinosEmergencyFund._compute();
    const INR = v => '₹' + Math.abs(Math.round(v)).toLocaleString('en-IN');
    const el = id => document.getElementById(id);
    el('ef-fund-disp')   && (el('ef-fund-disp').textContent   = INR(c.fund));
    el('ef-exp-disp')    && (el('ef-exp-disp').textContent    = c.monthlyExp > 0 ? INR(c.monthlyExp) : '—');
    el('ef-target-disp') && (el('ef-target-disp').textContent = c.monthlyExp > 0 ? INR(c.targetAmt)  : '—');
    el('ef-gap-disp')    && (el('ef-gap-disp').textContent    = c.monthlyExp > 0 ? INR(c.shortfall > 0 ? c.shortfall : c.surplus) : '—');
    el('ef-cov-disp')    && (el('ef-cov-disp').textContent    = c.covered.toFixed(1));
  }, 600);
}
</script>`;
  }

  /* ══════════════════════════════════════════════════════════════
     PLAN TAB
  ══════════════════════════════════════════════════════════════ */
  function renderPlan(container) {
    if (!container) return;
    const { fund, monthlyExp, targetAmt, shortfall, covered } = _compute();

    // How long to build up (save 20% of income above expenses as emergency top-up)
    const income   = gs('finos_monthly_income');
    const surplus  = income > 0 ? Math.max(income - monthlyExp, 0) * 0.20 : 0;
    const monthsToFund = surplus > 0 && shortfall > 0 ? Math.ceil(shortfall / surplus) : null;

    // Monthly top-up scenarios
    const scenarios = [2000, 5000, 10000, 20000, 30000].map(topup => ({
      topup,
      months: shortfall > 0 ? Math.ceil(shortfall / topup) : 0
    }));

    const sRows = scenarios.map(s => `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:rgba(255,255,255,.02);
        border:1px solid rgba(255,255,255,.05);border-radius:10px;margin-bottom:5px;">
        <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:14px;font-weight:800;color:#22D3A6;min-width:90px;">
          +${INR(s.topup)}/mo
        </div>
        <div style="flex:1;height:5px;background:rgba(255,255,255,.07);border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${s.months > 0 ? Math.min((1/s.months)*100*3,100).toFixed(0) : 100}%;background:#22D3A6;border-radius:3px;"></div>
        </div>
        <div style="font-size:13px;color:${s.months > 0 ? 'rgba(255,255,255,.7)' : '#22D3A6'};min-width:80px;text-align:right;">
          ${s.months > 0 ? s.months + ' months' : 'Already funded ✓'}
        </div>
      </div>`).join('');

    container.innerHTML = `
<div style="background:rgba(34,211,166,.06);border:1px solid rgba(34,211,166,.18);border-radius:18px;padding:22px;margin-bottom:20px;">
  <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,.4);margin-bottom:8px;">Current Status</div>
  <div style="display:flex;gap:20px;flex-wrap:wrap;">
    <div>
      <div style="font-size:12px;color:rgba(255,255,255,.4);margin-bottom:3px;">Have</div>
      <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:22px;font-weight:900;color:#22D3A6;">${INR(fund)}</div>
    </div>
    <div>
      <div style="font-size:12px;color:rgba(255,255,255,.4);margin-bottom:3px;">Need</div>
      <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:22px;font-weight:900;color:#00D4FF;">${monthlyExp > 0 ? INR(targetAmt) : '—'}</div>
    </div>
    <div>
      <div style="font-size:12px;color:rgba(255,255,255,.4);margin-bottom:3px;">Still Short</div>
      <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:22px;font-weight:900;color:${shortfall > 0 ? '#EF4444' : '#22D3A6'};">
        ${monthlyExp > 0 ? (shortfall > 0 ? INR(shortfall) : 'Fully Funded ✓') : '—'}
      </div>
    </div>
    ${monthsToFund ? `<div>
      <div style="font-size:12px;color:rgba(255,255,255,.4);margin-bottom:3px;">Auto-estimated (20% surplus)</div>
      <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:22px;font-weight:900;color:#FFB347;">${monthsToFund} months to complete</div>
    </div>` : ''}
  </div>
</div>

${shortfall > 0 ? `
<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:20px;margin-bottom:20px;">
  <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,.4);margin-bottom:14px;">Build-Up Scenarios — How Long to Fund ${INR(shortfall)} Shortfall</div>
  ${sRows}
</div>` : ''}

<div style="background:rgba(255,179,71,.05);border:1px solid rgba(255,179,71,.15);border-radius:16px;padding:20px;">
  <div style="font-size:13px;font-weight:800;color:#FFB347;margin-bottom:12px;">Emergency Fund Rules (India)</div>
  <div style="display:flex;flex-direction:column;gap:8px;font-size:13px;color:rgba(255,255,255,.65);line-height:1.7;">
    <span>🟢 Minimum target: <strong>3 months</strong> of essential expenses — rent, groceries, utilities, EMIs</span>
    <span>🟢 Recommended: <strong>6 months</strong> for salaried employees; <strong>12 months</strong> for self-employed</span>
    <span>🟡 Keep in liquid instruments — savings account + liquid fund. <em>Not</em> equity, <em>not</em> PPF (locked)</span>
    <span>🟡 Separate account from day-to-day use — psychologically harder to raid</span>
    <span>🔴 Do <em>not</em> invest the emergency fund in FD unless you're confident about premature withdrawal penalty</span>
    <span>🔴 Replenish immediately after any use — treat it like a system restart</span>
    <span>💡 Interest on liquid funds / savings is taxable as per your income slab — factor into real returns</span>
  </div>
</div>`;
  }

  /* Public */
  return { renderOverview, renderPlan, _compute };
})();
