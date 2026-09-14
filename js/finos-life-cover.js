/* finos-life-cover.js — Life Insurance Need Calculator
 *
 * Calculates how much life cover you need using two standard actuarial
 * methods used by Indian insurers and financial planners:
 *
 *   1. Human Life Value (HLV): Present value of all future income you would
 *      have earned until retirement, discounted at a conservative rate.
 *      HLV = annual_income × [(1 - (1+real_rate)^-years) / real_rate]
 *      where real_rate = (expected_return - inflation) / (1 + inflation)
 *
 *   2. Income Replacement: How much corpus would generate equivalent monthly
 *      income for the family's expected need duration.
 *      Corpus = monthly_need × 12 / SWR_rate (4% SWR)
 *
 * Recommended cover = MAX(HLV, Income Replacement) - existing cover + liabilities
 *
 * localStorage written:
 *   finos_life_cover_needed   — recommended additional cover
 *   finos_life_cover_hlv      — HLV method result
 *   finos_life_cover_ircorpus — income replacement corpus
 *
 * Reads:
 *   finos_gross_income, finos_monthly_expense, finos_total_liabilities,
 *   finos_insurance_life_cover, finos_retire_age (via Retirement Planner),
 *   finos_current_age
 *
 * Exported: window.FinosLifeCover
 */
window.FinosLifeCover = (function () {
  'use strict';

  const gs  = k => parseFloat(localStorage.getItem(k)) || 0;
  const ss  = (k, v) => localStorage.setItem(k, String(v));
  const gss = k => localStorage.getItem(k) || '';
  const INR = v => '₹' + Math.abs(Math.round(v)).toLocaleString('en-IN');
  const CR  = v => (v / 1e7).toFixed(2) + ' Cr';
  const L   = v => (v / 1e5).toFixed(1) + ' L';
  const fmt = v => v >= 1e7 ? CR(v) : v >= 1e5 ? L(v) : INR(v);

  /* ── Input fields ──────────────────────────────────────────────── */
  const FIELDS = {
    annualIncome:    { key:'finos_lc_income',    fallback: () => gs('finos_gross_income') || gs('finos_annual_income') || gs('finos_net_salary') * 12 || 1200000 },
    currentAge:      { key:'finos_lc_age',       fallback: () => gs('finos_current_age')   || 30 },
    retireAge:       { key:'finos_lc_retire',    fallback: () => gs('finos_retire_age')    || 60 },
    monthlyNeed:     { key:'finos_lc_need',      fallback: () => gs('finos_monthly_expense') * 0.75 || gs('finos_budget_expenses') * 0.75 || 60000 },
    needYears:       { key:'finos_lc_yrs',       fallback: () => 25 },
    existingCover:   { key:'finos_lc_existing',  fallback: () => gs('finos_insurance_life_cover') || 0 },
    totalLiab:       { key:'finos_lc_liab',      fallback: () => gs('finos_total_liabilities') || 0 },
    discountRate:    { key:'finos_lc_disc',      fallback: () => 6 },
    inflationRate:   { key:'finos_lc_infl',      fallback: () => 6 },
  };

  function _loadInputs() {
    const out = {};
    for (const [k, { key, fallback }] of Object.entries(FIELDS)) {
      const stored = parseFloat(gss(key));
      out[k] = !isNaN(stored) ? stored : fallback();
    }
    return out;
  }

  function _saveInputs(p) {
    for (const [k, { key }] of Object.entries(FIELDS)) {
      if (p[k] != null) localStorage.setItem(key, String(p[k]));
    }
  }

  /* ── Core computation ──────────────────────────────────────────── */
  function _compute(p) {
    const yearsToRetire = Math.max(1, p.retireAge - p.currentAge);
    // Real rate = (discount - inflation) / (1 + inflation/100), compounding correctly
    const nomDisc = p.discountRate / 100;
    const nomInfl = p.inflationRate / 100;
    const realRate = (nomDisc - nomInfl) / (1 + nomInfl);

    // HLV
    let hlv;
    if (Math.abs(realRate) < 1e-6) {
      hlv = p.annualIncome * yearsToRetire;
    } else {
      hlv = p.annualIncome * (1 - Math.pow(1 + realRate, -yearsToRetire)) / realRate;
    }
    hlv = Math.round(hlv);

    // Income Replacement Corpus (4% SWR for family needs)
    const irCorpus = Math.round(p.monthlyNeed * 12 / 0.04);
    // Alternative: inflation-adjusted for needYears
    const r        = nomDisc;
    const annualNeed = p.monthlyNeed * 12;
    let irPV;
    if (Math.abs(r) < 1e-6) {
      irPV = annualNeed * p.needYears;
    } else {
      irPV = annualNeed * (1 - Math.pow(1 + r, -p.needYears)) / r;
    }
    irPV = Math.round(irPV);

    // Recommended = MAX of both methods + liabilities - existing cover
    const baseRecommended = Math.max(hlv, irCorpus);
    const withLiab        = baseRecommended + Math.round(p.totalLiab);
    const coverGap        = Math.max(0, withLiab - p.existingCover);
    const coverageRatio   = withLiab > 0 ? Math.round((p.existingCover / withLiab) * 100) : 0;

    ss('finos_life_cover_needed',   coverGap);
    ss('finos_life_cover_hlv',      hlv);
    ss('finos_life_cover_ircorpus', irCorpus);

    return {
      hlv, irCorpus, irPV, withLiab, coverGap,
      coverageRatio, yearsToRetire,
      baseRecommended, existingCover: p.existingCover, totalLiab: p.totalLiab,
    };
  }

  /* ── Input row helper ──────────────────────────────────────────── */
  function _inp(id, label, val, min, max, step, unit, hint) {
    return `<div style="margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <label style="font-size:13px;font-weight:700;color:var(--text-secondary);">${label}</label>
        <div style="display:flex;align-items:center;gap:6px;">
          <input type="number" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}"
            style="width:110px;background:var(--border-soft);border:1px solid var(--border-medium);border-radius:8px;color:var(--text-primary);font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:14px;font-weight:800;padding:6px 10px;text-align:right;outline:none;"
            oninput="_lcRecalc()">
          <span style="font-size:12px;color:var(--text-muted);">${unit}</span>
        </div>
      </div>
      ${hint ? `<div style="font-size:11px;color:var(--text-muted);">${hint}</div>` : ''}
    </div>`;
  }

  /* ── Status badge ──────────────────────────────────────────────── */
  function _statusBadge(ratio) {
    if (ratio >= 90)  return { label:'Well Covered',     color:'#22D3A6', icon:'✅' };
    if (ratio >= 60)  return { label:'Partially Covered', color:'#FFB347', icon:'⚠️' };
    if (ratio >= 30)  return { label:'Under-Insured',     color:'#FF6B6B', icon:'🚨' };
    return               { label:'Critically Under-Insured', color:'#FF3B3B', icon:'💀' };
  }

  /* ══════════════════════════════════════════════════════════════
     CALCULATOR TAB
  ══════════════════════════════════════════════════════════════ */
  function renderCalculator(container) {
    if (!container) return;
    const p = _loadInputs();
    const c = _compute(p);
    const st = _statusBadge(c.coverageRatio);
    const gapColor = c.coverGap > 0 ? '#FF6B6B' : '#22D3A6';

    container.innerHTML = `
<style>
.lc-hero{background:linear-gradient(135deg,rgba(79,124,255,.08),rgba(34,211,166,.05));border:1px solid rgba(79,124,255,.2);border-radius:22px;padding:28px;margin-bottom:22px;}
.lc-inp-box{background:var(--border-soft);border:1px solid var(--border-soft);border-radius:16px;padding:22px;margin-bottom:20px;}
.lc-method-card{background:var(--border-soft);border:1px solid var(--border-soft);border-radius:14px;padding:18px;}
</style>

<div class="lc-hero">
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
    <div style="font-size:28px;">${st.icon}</div>
    <div>
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">Coverage Status</div>
      <div style="font-size:22px;font-weight:900;color:${st.color};">${st.label}</div>
      <div style="font-size:12px;color:var(--text-muted);">You have ${c.coverageRatio}% of recommended cover</div>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:16px;" id="lc-hero-grid">
    <div>
      <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px;">Recommended Cover</div>
      <div id="lc-r-rec" style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:28px;font-weight:900;color:#4F7CFF;">${fmt(c.withLiab)}</div>
    </div>
    <div>
      <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px;">Existing Cover</div>
      <div id="lc-r-exist" style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:28px;font-weight:900;color:var(--text-secondary);">${fmt(c.existingCover)}</div>
    </div>
    <div>
      <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px;">Additional Cover Needed</div>
      <div id="lc-r-gap" style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:28px;font-weight:900;color:${gapColor};">${c.coverGap > 0 ? fmt(c.coverGap) : 'Covered ✓'}</div>
    </div>
  </div>
  <div style="margin-top:16px;background:var(--border-soft);border-radius:10px;overflow:hidden;height:8px;" id="lc-bar-wrap">
    <div id="lc-bar" style="height:100%;width:${Math.min(100,c.coverageRatio)}%;background:${st.color};border-radius:10px;transition:width .5s;"></div>
  </div>
</div>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px;" id="lc-methods">
  <div class="lc-method-card">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:10px;">Method 1 — Human Life Value</div>
    <div id="lc-m-hlv" style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:24px;font-weight:900;color:#4F7CFF;">${fmt(c.hlv)}</div>
    <div style="font-size:11px;color:var(--text-muted);margin-top:6px;">PV of income for ${c.yearsToRetire} working years at ${Math.round(p.discountRate-p.inflationRate)}% real return</div>
  </div>
  <div class="lc-method-card">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:10px;">Method 2 — Income Replacement (4% SWR)</div>
    <div id="lc-m-ir" style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:24px;font-weight:900;color:#22D3A6;">${fmt(c.irCorpus)}</div>
    <div style="font-size:11px;color:var(--text-muted);margin-top:6px;">Corpus to generate ${INR(p.monthlyNeed)}/mo indefinitely</div>
  </div>
</div>

<div class="lc-inp-box">
  <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:16px;">Your Details</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 24px;">
    <div>
      ${_inp('lc-income',  'Annual Income',          p.annualIncome,  0,      50000000, 50000, '₹/yr',  'Gross CTC / total annual income')}
      ${_inp('lc-age',     'Current Age',            p.currentAge,    18,     65,       1,     'yr',    '')}
      ${_inp('lc-retire',  'Retirement Age',         p.retireAge,     40,     75,       1,     'yr',    '')}
      ${_inp('lc-need',    'Family Monthly Need',    p.monthlyNeed,   0,      500000,   1000,  '₹/mo',  '~75% of current expenses is a good rule of thumb')}
    </div>
    <div>
      ${_inp('lc-yrs',     'Income-Need Duration',   p.needYears,     5,      40,       1,     'yr',    'Years family needs income replacement')}
      ${_inp('lc-existing','Existing Life Cover',    p.existingCover, 0,      100000000,100000,'₹',    'Sum of all term/ULIP/group life policies')}
      ${_inp('lc-liab',    'Total Outstanding Liabilities', p.totalLiab, 0,  50000000, 50000,'₹',    'Home loan + car loan + personal loans outstanding')}
      ${_inp('lc-disc',    'Discount Rate',          p.discountRate,  3,      12,       0.5,   '% p.a.','Expected return on corpus — conservative debt rate')}
    </div>
  </div>
</div>

<div style="background:rgba(79,124,255,.05);border:1px solid rgba(79,124,255,.12);border-radius:14px;padding:16px;">
  <div style="font-size:13px;font-weight:800;color:#4F7CFF;margin-bottom:10px;">💡 Term Insurance — India Context</div>
  <div style="font-size:12px;color:var(--text-secondary);line-height:1.75;display:flex;flex-direction:column;gap:5px;">
    <span>📋 Buy pure term insurance — NOT ULIPs or money-back plans (separation of insurance + investment)</span>
    <span>📋 Rule of thumb: cover = 10-20× annual income · Liabilities must be separately added</span>
    <span>📋 Premium: a ₹1 Cr / 30-year term costs ~₹8,000-12,000/year for a 30-year-old non-smoker</span>
    <span>📋 Section 80C: term premium eligible for deduction · Death claim — 100% tax-free under Sec 10(10D)</span>
    <span>📋 Add critical illness & accidental death riders for ₹200-500 extra per year</span>
    <span>📋 Best: buy before 35 · Single pay or annual pay from reputed insurers (LIC, HDFC, ICICI, Max)</span>
  </div>
</div>

<script>
(function(){
  window._lcRecalc = function() {
    const read = id => parseFloat(document.getElementById(id)?.value) || 0;
    const p = {
      annualIncome:  read('lc-income'),
      currentAge:    read('lc-age'),
      retireAge:     read('lc-retire'),
      monthlyNeed:   read('lc-need'),
      needYears:     read('lc-yrs'),
      existingCover: read('lc-existing'),
      totalLiab:     read('lc-liab'),
      discountRate:  read('lc-disc'),
      inflationRate: 6,
    };
    if (window.FinosLifeCover) {
      const c = window.FinosLifeCover._compute(p);
      const fmt = v => v>=1e7?(v/1e7).toFixed(2)+' Cr':v>=1e5?(v/1e5).toFixed(1)+' L':'₹'+Math.round(v).toLocaleString('en-IN');
      const upd = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
      upd('lc-r-rec',   fmt(c.withLiab));
      upd('lc-r-exist', fmt(c.existingCover));
      upd('lc-r-gap',   c.coverGap>0 ? fmt(c.coverGap) : 'Covered ✓');
      upd('lc-m-hlv',   fmt(c.hlv));
      upd('lc-m-ir',    fmt(c.irCorpus));
      const bar = document.getElementById('lc-bar');
      if (bar) bar.style.width = Math.min(100, c.coverageRatio) + '%';
    }
  };
})();
<\/script>`;
  }

  /* ══════════════════════════════════════════════════════════════
     ANALYSIS TAB
  ══════════════════════════════════════════════════════════════ */
  function renderAnalysis(container) {
    if (!container) return;
    const p = _loadInputs();
    const c = _compute(p);

    // Age-specific premium estimates (30yo non-smoker ₹1Cr term)
    const premMap = { 25:7000, 30:10000, 35:15000, 40:22000, 45:35000 };
    const closestAge = [25,30,35,40,45].reduce((a,b) => Math.abs(b-p.currentAge)<Math.abs(a-p.currentAge)?b:a);
    const crNeeded = Math.ceil(Math.max(1, c.withLiab / 1e7));
    const estPremium = (premMap[closestAge] || 15000) * crNeeded;
    const premMonth = Math.round(estPremium / 12);

    // Annual income % check
    const premPct = p.annualIncome > 0 ? (estPremium / p.annualIncome * 100).toFixed(1) : '—';

    // Affordability
    const monthlyIncome = p.annualIncome / 12;
    const affordable = premMonth < monthlyIncome * 0.02;

    container.innerHTML = `
<div style="display:grid;gap:14px;">
  <div style="background:var(--border-soft);border:1px solid var(--border-soft);border-radius:16px;padding:20px;">
    <div style="font-size:13px;font-weight:800;color:var(--text-primary);margin-bottom:14px;">Estimated Term Premium</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;">
      <div>
        <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px;">Cover Recommended</div>
        <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:22px;font-weight:900;color:#4F7CFF;">${fmt(c.withLiab)}</div>
      </div>
      <div>
        <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px;">Est. Annual Premium</div>
        <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:22px;font-weight:900;color:#22D3A6;">${INR(estPremium)}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:3px;">${INR(premMonth)}/mo</div>
      </div>
      <div>
        <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px;">% of Income</div>
        <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:22px;font-weight:900;color:${affordable?'#22D3A6':'#FFB347'};">${premPct}%</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:3px;">${affordable?'Very affordable':'Manageable'}</div>
      </div>
    </div>
    <div style="margin-top:14px;font-size:11px;color:var(--text-muted);">Estimate based on ${p.currentAge}yo non-smoker, level-term policy, pure term (no savings component). Get actual quotes from PolicyBazaar / Ditto / insurers.</div>
  </div>

  <div style="background:var(--border-soft);border:1px solid var(--border-soft);border-radius:16px;padding:20px;">
    <div style="font-size:13px;font-weight:800;color:var(--text-primary);margin-bottom:14px;">Coverage Breakdown</div>
    ${[
      { label:'Human Life Value (Method 1)',    val: c.hlv,      color:'#4F7CFF', desc:`PV of ${c.yearsToRetire}yr income @ ${Math.max(0,p.discountRate-p.inflationRate).toFixed(1)}% real return` },
      { label:'Income Replacement (Method 2)',  val: c.irCorpus, color:'#22D3A6', desc:`Corpus for ${INR(p.monthlyNeed)}/mo (4% SWR)` },
      { label:'+ Outstanding Liabilities',      val: c.totalLiab,color:'#FF6B6B', desc:'Debts family inherits' },
      { label:'= Total Recommended',            val: c.withLiab, color:'var(--text-primary)', desc:'MAX(HLV, IR) + Liabilities', bold:true },
      { label:'– Existing Cover',               val: c.existingCover, color:'var(--text-muted)', desc:'All existing term/group life policies', sub:true },
      { label:'= Additional Cover Needed',      val: c.coverGap, color: c.coverGap>0?'#FF6B6B':'#22D3A6', desc: c.coverGap>0 ? 'Buy a term plan for this amount' : 'You are sufficiently covered', bold:true },
    ].map(r => `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border-soft);${r.bold?'border-top:1px solid var(--border-medium);margin-top:4px;padding-top:14px;':''}">
      <div>
        <div style="font-size:13px;font-weight:${r.bold?900:600};color:${r.color};">${r.label}</div>
        <div style="font-size:11px;color:var(--text-muted);">${r.desc}</div>
      </div>
      <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:16px;font-weight:800;color:${r.color};">${fmt(r.val)}</div>
    </div>`).join('')}
  </div>
</div>`;
  }

  return { renderCalculator, renderAnalysis, _compute };
})();
