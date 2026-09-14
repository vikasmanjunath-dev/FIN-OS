/* finos-windfall.js — Bonus & Windfall Allocator
 *
 * Smart priority-based allocation of sudden large amounts:
 *   Annual bonus, RSU/ESOP vesting, property sale proceeds,
 *   inheritance, Diwali bonus, PF withdrawal, FD maturity.
 *
 * Priority waterfall (RBI/CFP best-practice order):
 *   1. Emergency Fund gap (if < 6 months, fill it first)
 *   2. High-interest debt (credit card ≥ 18%, personal loan ≥ 12%)
 *   3. 80C gap (fill ₹1.5L limit — tax-free return equivalent)
 *   4. NPS 80CCD(1B) extra (₹50K — additional tax saving)
 *   5. Home loan prepayment (guaranteed interest-rate return, tax-free)
 *   6. Medium-term goals (< 3 years away, needed soon)
 *   7. Long-term wealth (SIP top-up, equity lump-sum, SGB)
 *
 * Tax-on-windfall check:
 *   — Salary bonus: included in salary → taxed at slab (employer TDS)
 *   — RSU vesting: taxable as perquisite at fair market value on vest date
 *   — Inheritance: received as gift from relatives → exempt Sec 56(2)(x)
 *   — Property sale: LTCG (>2yr) 20% with indexation; STCG at slab
 *   — FD maturity: interest taxed at slab; principal (your own money) not taxable
 *
 * localStorage written:
 *   finos_windfall_amount      — windfall entered
 *   finos_windfall_allocated   — total auto-allocated
 *
 * Reads: finos_emergency_fund, finos_monthly_expense, finos_80c_gap,
 *        finos_total_liabilities, finos_retire_gap, finos_goals_total_sip
 *
 * Exported: window.FinosWindfall
 */
window.FinosWindfall = (function () {
  'use strict';

  const gs  = k => parseFloat(localStorage.getItem(k)) || 0;
  const ss  = (k, v) => localStorage.setItem(k, String(v));
  const gss = k => localStorage.getItem(k) || '';
  const INR = v => '₹' + Math.abs(Math.round(v)).toLocaleString('en-IN');
  const CR  = v => (v / 1e7).toFixed(2) + ' Cr';
  const L   = v => (v / 1e5).toFixed(1) + ' L';
  const fmt = v => v >= 1e7 ? CR(v) : v >= 1e5 ? L(v) : INR(v);

  /* ── Windfall types ─────────────────────────────────────────────── */
  const WINDFALL_TYPES = [
    { key:'bonus',     label:'Salary Bonus',       icon:'💰', taxNote:'Taxed as salary income (TDS by employer at slab rate)' },
    { key:'rsu',       label:'RSU / ESOP Vesting', icon:'📊', taxNote:'Taxable as perquisite at FMV on vest date — employer TDS' },
    { key:'property',  label:'Property Sale',      icon:'🏠', taxNote:'LTCG (>2yr): 20% + indexation · STCG: slab rate · 54/54F exemption if reinvesting in property/bonds' },
    { key:'fd',        label:'FD Maturity',        icon:'🏦', taxNote:'Interest taxed at slab · Principal is your own money — not taxable' },
    { key:'inheritance', label:'Inheritance/Gift', icon:'🎁', taxNote:'From close relatives (spouse, parents, siblings, in-laws) — fully exempt under Sec 56(2)(x)' },
    { key:'other',     label:'Other (Dividends, Refund…)', icon:'✨', taxNote:'Check individual tax treatment; dividends taxed at slab post-2020' },
  ];

  /* ── Allocation engine ──────────────────────────────────────────── */
  function _allocate(amount, overrides) {
    const monthlyExp   = gs('finos_monthly_expense') || gs('finos_budget_expenses') || 50000;
    const efTarget     = monthlyExp * 6;
    const efCurrent    = gs('finos_emergency_fund');
    const efGap        = Math.max(0, efTarget - efCurrent);
    const c80CGap      = gs('finos_80c_gap') || overrides?.c80CGap || 0;
    const creditDebt   = gs('finos_credit_card_debt') || overrides?.creditDebt || 0;
    const personalLoan = gs('finos_personal_loan')    || overrides?.personalLoan || 0;
    const homeLoanOut  = gs('finos_home_loan_outstanding') || 0;
    const goalsSIP     = gs('finos_goals_total_sip') || 0;

    const steps = [
      {
        id:'ef', label:'Emergency Fund Top-Up', icon:'🛡️', color:'#22D3A6',
        reason:'6-month safety net first — liquid, before investing anywhere',
        amount: Math.min(amount, efGap),
        vehicle:'Liquid mutual fund or sweep FD (same-day redemption)',
        skip: efGap <= 0,
      },
      {
        id:'ccdebt', label:'Credit Card Debt', icon:'💳', color:'#FF6B6B',
        reason:'18-42% effective rate — guaranteed return by paying off',
        amount: Math.min(0, 0),  // filled below
        vehicle:'Pay outstanding balance immediately',
        skip: creditDebt <= 0,
      },
      {
        id:'pl', label:'Personal Loan Closure', icon:'🏧', color:'#FFA07A',
        reason:'12-20% rate — paying off is better than any debt fund return',
        amount: Math.min(0, 0),
        vehicle:'Foreclose loan (check prepayment penalty)',
        skip: personalLoan <= 0,
      },
      {
        id:'c80c', label:'80C Gap (ELSS/PPF)', icon:'📋', color:'#4F7CFF',
        reason:`Fill the ₹1.5L 80C limit — tax saving worth 5-30% depending on slab`,
        amount: Math.min(0, c80CGap > 0 ? c80CGap : 150000),
        vehicle:'ELSS (3yr lock-in, equity returns) or PPF (7.1%, 15yr, EEE)',
        skip: c80CGap <= 0,
      },
      {
        id:'nps', label:'NPS 80CCD(1B) Extra', icon:'🏛️', color:'#22D3A6',
        reason:'₹50K extra deduction over 80C limit — tax saving at your slab',
        amount: 50000,
        vehicle:'NPS Tier 1 — any fund house (Zerodha, HDFC, SBI)',
        skip: false,
      },
      {
        id:'homeloan', label:'Home Loan Prepayment', icon:'🏠', color:'#FFB347',
        reason:`Guaranteed ${gs('finos_home_loan_emi') > 0 ? '8-9%' : 'interest-rate'} return, no market risk, reduces tenure`,
        amount: Math.min(0, homeLoanOut > 0 ? Math.min(homeLoanOut * 0.1, 500000) : 0),
        vehicle:'Pay to principal account (instruct bank separately — not EMI)',
        skip: homeLoanOut <= 0,
      },
      {
        id:'goals', label:'Goal Acceleration', icon:'🎯', color:'#4F7CFF',
        reason:'Top up under-funded goals (home, education, car)',
        amount: 0,
        vehicle:'Dedicated goal SIP or lump sum based on goal timeline',
        skip: false,
      },
      {
        id:'wealth', label:'Long-Term Wealth', icon:'📈', color:'#22D3A6',
        reason:'Everything left — equity lump sum or SIP top-up for long-term compounding',
        amount: 0,
        vehicle:'Equity index fund (Nifty 50 / Flexi Cap) or SGB',
        skip: false,
      },
    ];

    // Fill dynamic amounts
    steps[1].amount = Math.min(amount, creditDebt);
    steps[2].amount = Math.min(amount, personalLoan);
    steps[3].amount = Math.min(amount, c80CGap > 0 ? c80CGap : 150000);
    steps[5].amount = Math.min(amount, homeLoanOut > 0 ? Math.min(homeLoanOut * 0.1, 500000) : 200000);

    // Waterfall — each step takes from remaining
    let remaining = amount;
    const allocated = steps.filter(s => !s.skip).map(s => {
      const take = Math.min(remaining, Math.max(0, s.amount));
      remaining  = Math.max(0, remaining - take);
      return { ...s, allocated: Math.round(take), remaining: Math.round(remaining) };
    });

    // Remaining goes to goals then wealth
    const goalIdx  = allocated.findIndex(s => s.id === 'goals');
    const wealthIdx= allocated.findIndex(s => s.id === 'wealth');
    if (goalIdx > -1 && wealthIdx > -1) {
      const goalAmt  = Math.round(remaining * 0.4);
      const wealthAmt= remaining - goalAmt;
      allocated[goalIdx].allocated  = goalAmt;
      allocated[wealthIdx].allocated= wealthAmt;
      remaining = 0;
    }

    const totalAllocated = allocated.reduce((s, a) => s + a.allocated, 0);
    ss('finos_windfall_allocated', totalAllocated);

    return { allocated, totalAllocated, remaining };
  }

  /* ── Load inputs ────────────────────────────────────────────────── */
  function _loadInputs() {
    return {
      amount:    parseFloat(gss('finos_windfall_amount') || '500000'),
      type:      gss('finos_windfall_type') || 'bonus',
    };
  }

  /* ══════════════════════════════════════════════════════════════
     ALLOCATOR TAB
  ══════════════════════════════════════════════════════════════ */
  function renderAllocator(container) {
    if (!container) return;
    const p = _loadInputs();
    const a = _allocate(p.amount);
    const wfType = WINDFALL_TYPES.find(t => t.key === p.type) || WINDFALL_TYPES[0];

    const steps = a.allocated.filter(s => s.allocated > 0).map((s, i) => {
      const pct = p.amount > 0 ? Math.round(s.allocated / p.amount * 100) : 0;
      return `<div style="display:flex;gap:14px;padding:16px;background:var(--border-soft);border:1px solid var(--border-soft);border-radius:14px;align-items:flex-start;">
        <div style="flex-shrink:0;width:36px;height:36px;border-radius:50%;background:rgba(${s.color==='#22D3A6'?'34,211,166':s.color==='#4F7CFF'?'79,124,255':s.color==='#FF6B6B'?'255,107,107':s.color==='#FFB347'?'255,179,71':'255,160,122'},.12);display:flex;align-items:center;justify-content:center;font-size:16px;">${s.icon}</div>
        <div style="flex:1;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">
            <div>
              <span style="font-size:12px;font-weight:800;color:var(--text-primary);">Priority ${i+1}: ${s.label}</span>
            </div>
            <div style="text-align:right;flex-shrink:0;margin-left:10px;">
              <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:16px;font-weight:900;color:${s.color};">${fmt(s.allocated)}</div>
              <div style="font-size:10px;color:var(--text-muted);">${pct}% of windfall</div>
            </div>
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:5px;">${s.reason}</div>
          <div style="font-size:11px;color:var(--text-muted);background:var(--border-soft);border-radius:6px;padding:5px 8px;">📍 ${s.vehicle}</div>
          <!-- allocation bar -->
          <div style="margin-top:8px;background:var(--border-soft);border-radius:3px;height:4px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:${s.color};border-radius:3px;opacity:.7;"></div>
          </div>
        </div>
      </div>`;
    }).join('');

    container.innerHTML = `
<style>
.wf-box{background:var(--border-soft);border:1px solid var(--border-soft);border-radius:16px;padding:20px;margin-bottom:16px;}
</style>

<div class="wf-box" style="background:linear-gradient(135deg,rgba(34,211,166,.06),rgba(79,124,255,.04));">
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
    <div>
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:10px;">Windfall Amount</div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:13px;color:var(--text-muted);">₹</span>
        <input type="number" id="wf-amount" min="10000" max="100000000" step="10000" value="${p.amount}"
          style="flex:1;background:var(--border-soft);border:1px solid var(--border-medium);border-radius:10px;color:var(--text-primary);font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:20px;font-weight:900;padding:10px 14px;outline:none;"
          oninput="_wfRecalc()">
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:6px;">Enter the amount you've received</div>
    </div>
    <div>
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:10px;">Windfall Type</div>
      <select id="wf-type" style="width:100%;background:var(--border-soft);border:1px solid var(--border-medium);border-radius:10px;color:var(--text-primary);font-size:13px;font-weight:700;padding:10px 14px;outline:none;" onchange="_wfRecalc()">
        ${WINDFALL_TYPES.map(t => `<option value="${t.key}" ${t.key===p.type?'selected':''}>${t.icon} ${t.label}</option>`).join('')}
      </select>
      <div id="wf-tax-note" style="font-size:11px;color:var(--text-muted);margin-top:6px;line-height:1.5;">${wfType.taxNote}</div>
    </div>
  </div>
</div>

<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:12px;">Smart Allocation Plan — Priority Waterfall</div>
<div id="wf-steps" style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px;">${steps}</div>

<div class="wf-box" style="padding:14px;border-color:rgba(34,211,166,.15);">
  <div style="display:flex;gap:20px;flex-wrap:wrap;">
    <div>
      <div style="font-size:10px;color:var(--text-muted);">Total Windfall</div>
      <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:20px;font-weight:900;color:var(--text-primary);">${fmt(p.amount)}</div>
    </div>
    <div>
      <div style="font-size:10px;color:var(--text-muted);">Allocated</div>
      <div id="wf-r-alloc" style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:20px;font-weight:900;color:#22D3A6;">${fmt(a.totalAllocated)}</div>
    </div>
    <div>
      <div style="font-size:10px;color:var(--text-muted);">Unallocated</div>
      <div id="wf-r-remain" style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:20px;font-weight:900;color:${a.remaining > 0 ? '#FFB347' : '#22D3A6'};">${fmt(a.remaining)}</div>
    </div>
  </div>
</div>

<script>
(function(){
  window._wfRecalc = function() {
    const amt  = parseFloat(document.getElementById('wf-amount')?.value) || 500000;
    const type = document.getElementById('wf-type')?.value || 'bonus';
    localStorage.setItem('finos_windfall_amount', String(amt));
    localStorage.setItem('finos_windfall_type',   type);
    const TYPES = ${JSON.stringify(WINDFALL_TYPES)};
    const wfType = TYPES.find(t => t.key===type) || TYPES[0];
    const tn = document.getElementById('wf-tax-note');
    if(tn) tn.textContent = wfType.taxNote;
    if (window.FinosWindfall) {
      const a = window.FinosWindfall._allocate(amt);
      const fmt = v => v>=1e7?(v/1e7).toFixed(2)+' Cr':v>=1e5?(v/1e5).toFixed(1)+' L':'₹'+Math.round(v).toLocaleString('en-IN');
      const upd = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
      upd('wf-r-alloc',  fmt(a.totalAllocated));
      upd('wf-r-remain', fmt(a.remaining));
    }
  };
})();
<\/script>`;
  }

  /* ══════════════════════════════════════════════════════════════
     TAX ON WINDFALL TAB
  ══════════════════════════════════════════════════════════════ */
  function renderTax(container) {
    if (!container) return;
    const p  = _loadInputs();
    const wf = WINDFALL_TYPES.find(t => t.key === p.type) || WINDFALL_TYPES[0];
    const monthlyInc = gs('finos_monthly_income') || 150000;
    const annualInc  = monthlyInc * 12;

    // Tax slabs (new regime FY 2025-26)
    function taxNew(income) {
      const slabs = [[400000,0],[800000,.05],[1200000,.10],[1600000,.15],[2000000,.20],[2400000,.25],[Infinity,.30]];
      let tax = 0, prev = 0;
      for (const [lim, rate] of slabs) {
        if (income <= prev) break;
        tax += Math.min(income - prev, lim - prev) * rate;
        prev = lim;
      }
      if (income <= 700000) tax = 0;
      return Math.round(tax * 1.04);
    }

    const taxBeforeWindfall = taxNew(annualInc);
    const taxAfter          = p.type === 'bonus' || p.type === 'rsu' ? taxNew(annualInc + p.amount) : taxBeforeWindfall;
    const taxOnWindfall     = taxAfter - taxBeforeWindfall;

    const taxCards = WINDFALL_TYPES.map(t => {
      const isSelected = t.key === p.type;
      return `<div style="padding:14px;background:${isSelected?'rgba(79,124,255,.08)':'var(--border-soft)'};border:1px solid ${isSelected?'rgba(79,124,255,.2)':'var(--border-soft)'};border-radius:12px;">
        <div style="font-size:13px;font-weight:800;color:${isSelected?'#4F7CFF':'var(--text-primary)'};margin-bottom:6px;">${t.icon} ${t.label}</div>
        <div style="font-size:11px;color:var(--text-muted);line-height:1.6;">${t.taxNote}</div>
      </div>`;
    }).join('');

    container.innerHTML = `
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;margin-bottom:20px;">${taxCards}</div>

${p.type === 'bonus' || p.type === 'rsu' ? `
<div style="background:rgba(255,107,107,.05);border:1px solid rgba(255,107,107,.15);border-radius:16px;padding:18px;margin-bottom:16px;">
  <div style="font-size:12px;font-weight:800;color:#FF6B6B;margin-bottom:12px;">⚡ Tax Impact on Your ${wf.label}</div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;">
    <div>
      <div style="font-size:10px;color:var(--text-muted);">Tax Before Windfall</div>
      <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:18px;font-weight:900;color:var(--text-secondary);">${INR(taxBeforeWindfall)}</div>
    </div>
    <div>
      <div style="font-size:10px;color:var(--text-muted);">Tax After Windfall</div>
      <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:18px;font-weight:900;color:#FF6B6B;">${INR(taxAfter)}</div>
    </div>
    <div>
      <div style="font-size:10px;color:var(--text-muted);">Tax on ${wf.label}</div>
      <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:18px;font-weight:900;color:#FF6B6B;">${INR(taxOnWindfall)}</div>
      <div style="font-size:10px;color:var(--text-muted);margin-top:3px;">effective ${p.amount > 0 ? Math.round(taxOnWindfall/p.amount*100) : 0}% on windfall</div>
    </div>
  </div>
  <div style="margin-top:12px;font-size:11px;color:var(--text-muted);">Based on ${INR(annualInc)}/yr salary · New tax regime (FY 2025-26). Employer deducts TDS — check Form 16 for actual TDS on bonus.</div>
</div>` : ''}

<div style="background:rgba(34,211,166,.05);border:1px solid rgba(34,211,166,.12);border-radius:14px;padding:14px;">
  <div style="font-size:12px;font-weight:800;color:#22D3A6;margin-bottom:8px;">💡 Tax-Saving Moves on Windfall</div>
  <div style="font-size:11px;color:var(--text-muted);line-height:1.8;display:flex;flex-direction:column;gap:4px;">
    <span>📋 <strong style="color:var(--text-primary);">Bonus month NPS top-up:</strong> put bonus into NPS → full deduction at your slab (80CCD(1B) ₹50K + 80C ₹1.5L)</span>
    <span>📋 <strong style="color:var(--text-primary);">ELSS in one shot:</strong> invest in ELSS before March 31 to claim 80C on the full ₹1.5L</span>
    <span>📋 <strong style="color:var(--text-primary);">Property sale reinvestment:</strong> reinvest in residential property within 2yr (Sec 54) or NHAI bonds within 6mo (Sec 54EC — up to ₹50L) to avoid LTCG</span>
    <span>📋 <strong style="color:var(--text-primary);">RSU strategy:</strong> sell and rebuy in a tax-advantaged vehicle (NPS, ELSS) same day to net the taxable gain with a deduction</span>
    <span>📋 <strong style="color:var(--text-primary);">Spread over years:</strong> for large FD maturities, consider reinvesting in shorter-tenure FDs spread over 2-3 FYs to stay under higher slab thresholds</span>
  </div>
</div>`;
  }

  return { renderAllocator, renderTax, _allocate, _loadInputs };
})();
