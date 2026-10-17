/* finos-nps-tracker.js — NPS (National Pension System) tracker for India
 *
 * Public API (window.FinosNPSTracker):
 *   renderSetup(el)       — main overview + inputs
 *   renderProjection(el)  — corpus growth + annuity breakdown
 *   renderTax(el)         — 80CCD(1), 80CCD(1B), 80CCD(2) tax savings
 *
 * localStorage written:
 *   finos_nps_value       — total current corpus (Tier1 + Tier2)
 *   finos_nps_projected   — projected corpus at age 60
 *   finos_nps_annual_tax  — estimated annual tax saving
 *   finos_nps_pran        — PRAN number (informational)
 *   finos_nps_dob         — date of birth
 *   finos_nps_tier1       — Tier-1 current balance
 *   finos_nps_tier2       — Tier-2 current balance
 *   finos_nps_emp_monthly — employee monthly contribution
 *   finos_nps_er_monthly  — employer monthly contribution
 *   finos_nps_equity_pct  — equity allocation %
 *   finos_nps_corp_pct    — corporate bond allocation %
 *   finos_nps_gsec_pct    — G-Sec allocation %
 *   finos_nps_tax_slab    — income tax slab %
 */
window.FinosNPSTracker = (function () {
  'use strict';

  const gs  = k => { const v = Number(localStorage.getItem(k)); return Number.isFinite(v) && v > 0 ? v : 0; };
  const ss  = (k, v) => localStorage.setItem(k, v);
  const gss = k => localStorage.getItem(k) || '';
  const INR = v => '₹' + Math.abs(Math.round(v)).toLocaleString('en-IN');
  const esc = v => String(v).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));

  /* ── Asset-class assumptions ─────────────────────────────────────── */
  const RATES = { E: 0.105, C: 0.085, G: 0.075 }; // equity, corp, g-sec p.a.

  function _weightedReturn(ep, cp, gp) {
    const allocation = ep + cp + gp;
    if (allocation !== 100) return 0.085;
    return (ep / allocation) * RATES.E + (cp / allocation) * RATES.C + (gp / allocation) * RATES.G;
  }

  /* ── Core projection ─────────────────────────────────────────────── */
  function _projectCorpus(corpus, monthlyContrib, months, annualR) {
    const r = annualR / 12;
    let bal = corpus;
    for (let m = 0; m < months; m++) {
      bal *= (1 + r);
      bal += monthlyContrib; // monthly contribution at period end
    }
    return Math.round(bal);
  }

  function validDob(value, today) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return false;
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    return year >= 1900 && date.getFullYear() === year && date.getMonth() === month - 1
      && date.getDate() === day && date <= today;
  }

  /* ── Tax saving estimate ─────────────────────────────────────────── */
  function _taxDeductions(empAnnual, erAnnual, basicAnnual) {
    const regime = gss('finos_nps_tax_regime') || 'new';
    const govtEmployer = gss('finos_nps_govt_employer') === 'yes';
    const basic = Math.max(0, basicAnnual);
    const oldRegime = regime === 'old';
    const other80cUsed = Math.min(Math.max(gs('finos_nps_other_80c_used'), 0), 150000);
    const c1Limit = oldRegime && basic > 0 ? Math.min(150000 - other80cUsed, basic * 0.10) : 0;
    const c1 = Math.min(empAnnual, Math.max(c1Limit, 0));
    const c1b = oldRegime ? Math.min(Math.max(empAnnual - c1, 0), 50000) : 0;
    const employerRate = regime === 'new' || govtEmployer ? 0.14 : 0.10;
    const c2 = basic > 0 ? Math.min(erAnnual, basic * employerRate) : 0;
    return { c1: Math.round(c1), c1b: Math.round(c1b), c2: Math.round(c2), basic, employerRate, regime, other80cUsed };
  }

  function _taxSaved(empAnnual, erAnnual, slab, basicAnnual) {
    const d = _taxDeductions(empAnnual, erAnnual, basicAnnual);
    // Marginal-rate estimate only; the actual benefit depends on total taxable income and rebate eligibility.
    return Math.round((d.c1 + d.c1b + d.c2) * slab / 100 * 1.04);
  }

  /* The exact saving, from the shared tax core (FY 2025-26), when annual income is known; null otherwise (the slab estimate is used).
     Each section's saving is its own step down the tax curve, so the three add up to the total. Income comes from the field on the
     Profile tab, else the tracked monthly income x 12. */
  function _incomeAnnual() { return gs('finos_nps_income_annual') || gs('finos_monthly_income') * 12 || 0; }
  function _taxEffect(d, income) {
    const Core = window.FinosTaxCore;
    if (!Core || !(income > 0)) return null;
    const old = d.regime === 'old';
    const tax = t => (old ? Core.taxOld(t) : Core.taxNew(t));
    let t = Math.max(0, income - (old ? Core.STD_OLD : Core.STD_NEW) - (old ? d.other80cUsed : 0));
    const out = { income, fromTracked: !gs('finos_nps_income_annual'), c1: 0, c1b: 0, c2: 0 };
    [['c1', d.c1], ['c1b', d.c1b], ['c2', d.c2]].forEach(([k, amt]) => { const next = Math.max(0, t - amt); out[k] = Math.round(tax(t) - tax(next)); t = next; });
    out.total = out.c1 + out.c1b + out.c2;
    return out;
  }

  /* ── Compute snapshot ────────────────────────────────────────────── */
  function _compute() {
    const t1  = gs('finos_nps_tier1');
    const t2  = gs('finos_nps_tier2');
    const total = t1 + t2;
    const dob   = gss('finos_nps_dob');
    const ep    = gs('finos_nps_equity_pct');
    const cp    = gs('finos_nps_corp_pct');
    const gp    = gs('finos_nps_gsec_pct');
    const empM  = gs('finos_nps_emp_monthly');
    const erM   = gs('finos_nps_er_monthly');
    const slabValue = gss('finos_nps_tax_slab');
    const slab = slabValue === '' ? 30 : Math.max(0, Math.min(30, parseFloat(slabValue) || 0));
    const annuityPct = [0, 20, 40, 80].includes(parseInt(gss('finos_nps_annuity_pct'), 10)) ? parseInt(gss('finos_nps_annuity_pct'), 10) : 40;
    const basicAnnual = gs('finos_nps_basic_annual') || gs('finos_salary_basic');

    let ageNow = 0, yearsLeft = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (validDob(dob, today)) {
      const [year, month, day] = dob.split('-').map(Number);
      ageNow = today.getFullYear() - year
        - (today < new Date(today.getFullYear(), month - 1, day) ? 1 : 0);
      yearsLeft = Math.max(60 - ageNow, 0);
    }

    const allocationValid = ep + cp + gp === 100;
    const annualR   = _weightedReturn(ep, cp, gp);
    const projected = _projectCorpus(t1, empM + erM, Math.round(yearsLeft * 12), annualR);
    const annuityCorpus = Math.round(projected * annuityPct / 100);
    const lumpSum       = projected - annuityCorpus;
    const eff           = _taxEffect(_taxDeductions(empM * 12, erM * 12, basicAnnual), _incomeAnnual());
    const taxSaved      = eff ? eff.total : _taxSaved(empM * 12, erM * 12, slab, basicAnnual);

    ss('finos_nps_value',     total);
    if (ageNow > 0) ss('finos_nps_projected', projected);
    else localStorage.removeItem('finos_nps_projected');
    ss('finos_nps_annual_tax', taxSaved);

    return { t1, t2, total, ageNow, yearsLeft, annualR, allocationValid, projected, annuityPct, lumpSumPct: 100 - annuityPct, annuityCorpus, lumpSum, taxSaved, taxExact: !!eff, ep, cp, gp };
  }

  /* ── Auto-save with debounce ─────────────────────────────────────── */
  let _saveTimer;
  function _autoSave(key, val) {
    clearTimeout(_saveTimer);
    ss(key, val);
    _saveTimer = setTimeout(() => {
      _compute();
      if (window.FinosContext?.update) window.FinosContext.update({ npsValue: gs('finos_nps_value') });
    }, 600);
  }

  /* ══════════════════════════════════════════════════════════════════
     SETUP / OVERVIEW RENDERER
  ══════════════════════════════════════════════════════════════════ */
  function renderSetup(container) {
    if (!container) return;

    const { total, t1, t2, ageNow, yearsLeft, annualR, allocationValid, projected, annuityPct, lumpSumPct, annuityCorpus, lumpSum, taxSaved, taxExact, ep, cp, gp } = _compute();
    const savedSlab = gss('finos_nps_tax_slab');
    const slab = savedSlab === '' ? 30 : Math.max(0, Math.min(30, parseFloat(savedSlab) || 0));
    const npsRegime = gss('finos_nps_tax_regime') || 'new';

    container.innerHTML = `
<style>
.nps-hero{background:linear-gradient(135deg,rgba(100,210,255,.07),rgba(0,212,255,.04));border:1px solid rgba(100,210,255,.18);border-radius:20px;padding:26px;margin-bottom:20px;}
.nps-hero-lbl{font-size:11px;font-weight:700;color:rgba(255,255,255,0.58);text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;}
.nps-hero-val{font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:42px;font-weight:900;color:#00D4FF;letter-spacing:-1px;line-height:1;}
.nps-hero-sub{font-size:13px;color:rgba(255,255,255,0.58);margin-top:8px;}
.nps-tier-row{display:flex;gap:14px;margin-top:16px;flex-wrap:wrap;}
.nps-tier-pill{flex:1;min-width:140px;padding:14px;border-radius:14px;border:1px solid;text-align:center;}
.nps-stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:22px;}
.nps-stat{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:14px;text-align:center;}
.nps-stat-lbl{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,0.58);margin-bottom:6px;}
.nps-stat-val{font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:18px;font-weight:800;color:#fff;}
.nps-stat-sub{font-size:11px;color:rgba(255,255,255,0.58);margin-top:3px;}
.nps-form{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:20px;}
.nps-section{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,0.58);margin:0 0 12px;}
.nps-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:18px;}
.nps-field{display:flex;flex-direction:column;gap:6px;}
.nps-field label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:rgba(255,255,255,0.58);}
.nps-inp{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:#fff;font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:14px;padding:10px 14px;width:100%;box-sizing:border-box;transition:border-color .2s;outline:none;}
.nps-inp:focus{border-color:rgba(0,212,255,.5);background:rgba(0,212,255,.05);}
.nps-alloc-row{display:flex;gap:14px;align-items:flex-end;margin-bottom:8px;flex-wrap:wrap;}
.nps-alloc-label{font-size:11px;color:rgba(255,255,255,0.58);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;}
.nps-alloc-total{font-size:12px;font-weight:700;padding:4px 10px;border-radius:8px;margin-top:8px;display:inline-block;}
.nps-note{font-size:11px;color:rgba(255,255,255,0.58);line-height:1.6;margin-top:4px;}
[data-theme="light"] .nps-hero{background:rgba(0,212,255,.05);}
[data-theme="light"] .nps-hero-val{color:#0099CC;}
[data-theme="light"] .nps-form,[data-theme="light"] .nps-stat{background:#fff;border-color:rgba(0,0,0,.08);}
[data-theme="light"] .nps-inp{background:#F4F6FB;border-color:rgba(0,0,0,.12);color:#0B0D12;}
[data-theme="light"] .nps-stat-val{color:#0B0D12;}
</style>

<div class="nps-hero">
  <div class="nps-hero-lbl">Total NPS Corpus</div>
  <div class="nps-hero-val" id="nps-total-hero">${INR(total)}</div>
  <div class="nps-hero-sub">${ageNow > 0 ? `Age ${ageNow} · ${yearsLeft} years to age 60` : 'Add a valid date of birth to calculate your timeline — no age is assumed'} &nbsp;·&nbsp; ${(annualR * 100).toFixed(1)}% assumed return${allocationValid ? ' from allocation' : ' default; allocation must total 100%'}</div>
  <div class="nps-tier-row">
    <div class="nps-tier-pill" style="background:rgba(0,212,255,.07);border-color:rgba(0,212,255,.2);">
      <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.58);text-transform:uppercase;margin-bottom:5px;">Tier 1</div>
      <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:20px;font-weight:800;color:#00D4FF;" id="nps-t1-disp">${INR(t1)}</div>
      <div style="font-size:10px;color:rgba(255,255,255,0.58);margin-top:3px;">Pension · tax-saving</div>
    </div>
    <div class="nps-tier-pill" style="background:rgba(155,93,229,.07);border-color:rgba(155,93,229,.2);">
      <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.58);text-transform:uppercase;margin-bottom:5px;">Tier 2</div>
      <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:20px;font-weight:800;color:#9B5DE5;" id="nps-t2-disp">${INR(t2)}</div>
      <div style="font-size:10px;color:rgba(255,255,255,0.58);margin-top:3px;">Voluntary · liquid</div>
    </div>
  </div>
</div>

<div class="nps-stats">
  <div class="nps-stat" style="border-color:rgba(34,211,166,.2);">
  <div class="nps-stat-lbl">Tier 1 Projected at 60</div>
    <div class="nps-stat-val" style="color:#22D3A6;" id="nps-proj-disp">${ageNow > 0 ? INR(projected) : '—'}</div>
    <div class="nps-stat-sub">${ageNow > 0 ? `${yearsLeft}yr @ ${(annualR*100).toFixed(1)}% p.a.` : 'Date of birth required'}</div>
  </div>
  <div class="nps-stat" style="border-color:rgba(255,179,71,.2);">
    <div class="nps-stat-lbl" id="nps-lump-label">Lump-Sum (${lumpSumPct}%)</div>
    <div class="nps-stat-val" style="color:#FFB347;" id="nps-lump-disp">${ageNow > 0 ? INR(lumpSum) : '—'}</div>
    <div class="nps-stat-sub">Tax treatment depends on exit eligibility and current law</div>
  </div>
  <div class="nps-stat" style="border-color:rgba(239,68,68,.2);">
    <div class="nps-stat-lbl" id="nps-ann-label">Annuity (${annuityPct}%)</div>
    <div class="nps-stat-val" style="color:#EF4444;" id="nps-ann-disp">${ageNow > 0 ? INR(annuityCorpus) : '—'}</div>
    <div class="nps-stat-sub">Annuity purchase assumed; pension is taxable</div>
  </div>
  <div class="nps-stat" style="border-color:rgba(79,124,255,.2);">
  <div class="nps-stat-lbl">Tax Benefit est. / yr</div>
    <div class="nps-stat-val" style="color:#4F7CFF;" id="nps-tax-disp">${INR(taxSaved)}</div>
  <div class="nps-stat-sub" id="nps-tax-basis">${taxExact ? 'Worked out on your income' : 'Marginal-rate estimate'}</div>
  </div>
</div>

<div class="nps-form">
  <p class="nps-section">Exit Projection Assumption</p>
  <div class="nps-field" style="margin-bottom:14px;max-width:440px;">
    <label>Annuity share assumption at exit</label>
    <select class="nps-inp" onchange="_npsAutoSave('finos_nps_annuity_pct',this.value)">
      <option value="0" ${annuityPct===0?'selected':''}>0% — eligible small-corpus full withdrawal</option>
      <option value="20" ${annuityPct===20?'selected':''}>20% — All Citizen normal exit (eligible case)</option>
      <option value="40" ${annuityPct===40?'selected':''}>40% — Government / Corporate normal exit</option>
      <option value="80" ${annuityPct===80?'selected':''}>80% — premature exit assumption</option>
    </select>
    <span style="font-size:10px;color:rgba(255,255,255,.55);">Current rules depend on subscriber model, exit type, corpus size and age. 0% is only for eligible cases (including specified small-corpus limits); verify eligibility before using it.</span>
  </div>

  <p class="nps-section">Tax Estimate Inputs</p>
  <div class="nps-grid">
    <div class="nps-field">
      <label>Annual basic salary (₹)</label>
      <input class="nps-inp" type="number" min="0" step="1000" placeholder="Required for salary-based limits"
        value="${gs('finos_nps_basic_annual') || gs('finos_salary_basic') || ''}"
        oninput="_npsAutoSave('finos_nps_basic_annual',this.value)">
    </div>
    <div class="nps-field">
      <label>Tax regime</label>
      <select class="nps-inp" onchange="_npsAutoSave('finos_nps_tax_regime',this.value)">
        <option value="new" ${npsRegime==='new'?'selected':''}>New</option>
        <option value="old" ${npsRegime==='old'?'selected':''}>Old</option>
      </select>
    </div>
    <div class="nps-field">
      <label>Government employer (old regime)</label>
      <select class="nps-inp" onchange="_npsAutoSave('finos_nps_govt_employer',this.value)">
        <option value="no" ${gss('finos_nps_govt_employer')!=='yes'?'selected':''}>No</option>
        <option value="yes" ${gss('finos_nps_govt_employer')==='yes'?'selected':''}>Yes</option>
      </select>
    </div>
    <div class="nps-field">
      <label>Other 80C use (₹)</label>
      <input class="nps-inp" type="number" min="0" max="150000" step="1000" placeholder="0"
        value="${gs('finos_nps_other_80c_used') || ''}"
        oninput="_npsAutoSave('finos_nps_other_80c_used',this.value)">
    </div>
  </div>
  <p class="nps-section">Account Details</p>
  <div class="nps-grid">
    <div class="nps-field">
      <label>PRAN Number</label>
      <input class="nps-inp" type="text" placeholder="110000123456" maxlength="12"
        value="${esc(gss('finos_nps_pran'))}"
        oninput="_npsAutoSave('finos_nps_pran',this.value)">
    </div>
    <div class="nps-field">
      <label>Date of Birth</label>
      <input class="nps-inp" type="date"
        value="${esc(gss('finos_nps_dob'))}"
        oninput="_npsAutoSave('finos_nps_dob',this.value)">
    </div>
    <div class="nps-field">
      <label>Annual income before tax (₹)</label>
      <input class="nps-inp" type="number" min="0" step="10000" placeholder="${gs('finos_monthly_income') ? Math.round(gs('finos_monthly_income') * 12) : 'e.g. 1200000'}"
        value="${gs('finos_nps_income_annual') || ''}"
        oninput="_npsAutoSave('finos_nps_income_annual',this.value)">
      <span class="nps-note">Gives your exact tax saving for the regime chosen. Left blank, your tracked monthly income x 12 is used, else the slab below.</span>
    </div>
    <div class="nps-field">
      <label>Tax Slab (%) <span style="font-weight:500;opacity:.7">(only if income is unknown)</span></label>
      <select class="nps-inp" onchange="_npsAutoSave('finos_nps_tax_slab',this.value)">
        <option value="0"  ${slab===0?'selected':''}>0% (no tax)</option>
        <option value="5"  ${slab===5?'selected':''}>5%</option>
        <option value="10" ${slab===10?'selected':''}>10%</option>
        <option value="15" ${slab===15?'selected':''}>15%</option>
        <option value="20" ${slab===20?'selected':''}>20%</option>
        <option value="25" ${slab===25?'selected':''}>25%</option>
        <option value="30" ${slab===30?'selected':''}>30% (highest)</option>
      </select>
    </div>
  </div>

  <p class="nps-section">Balances</p>
  <div class="nps-grid">
    <div class="nps-field">
      <label>Tier 1 Balance (₹)</label>
      <input class="nps-inp" type="number" min="0" step="1000" placeholder="0"
        value="${t1 || ''}"
        oninput="_npsAutoSave('finos_nps_tier1',this.value)">
    </div>
    <div class="nps-field">
      <label>Tier 2 Balance (₹)</label>
      <input class="nps-inp" type="number" min="0" step="1000" placeholder="0"
        value="${t2 || ''}"
        oninput="_npsAutoSave('finos_nps_tier2',this.value)">
    </div>
  </div>

  <p class="nps-section">Monthly Contributions</p>
  <div class="nps-grid">
    <div class="nps-field">
      <label>Your Contribution / mo (₹)</label>
      <input class="nps-inp" type="number" min="500" step="100" placeholder="5000"
        value="${gs('finos_nps_emp_monthly') || ''}"
        oninput="_npsAutoSave('finos_nps_emp_monthly',this.value)">
      <span class="nps-note">Tax deduction estimate depends on regime, salary and eligible limits.</span>
    </div>
    <div class="nps-field">
      <label>Employer Contribution / mo (₹)</label>
      <input class="nps-inp" type="number" min="0" step="100" placeholder="0"
        value="${gs('finos_nps_er_monthly') || ''}"
        oninput="_npsAutoSave('finos_nps_er_monthly',this.value)">
      <span class="nps-note">Tax deduction estimate depends on regime, employer category and basic salary.</span>
    </div>
  </div>

  <p class="nps-section">Asset Allocation (Active Choice)</p>
  <div class="nps-alloc-row">
    <div class="nps-field">
      <div class="nps-alloc-label">Equity (E) %</div>
      <input class="nps-inp" type="number" min="0" max="75" step="5" placeholder="50"
        value="${ep || ''}" style="width:120px;"
        oninput="_npsAllocSave('finos_nps_equity_pct',this.value)">
    </div>
    <div class="nps-field">
      <div class="nps-alloc-label">Corp Bond (C) %</div>
      <input class="nps-inp" type="number" min="0" max="100" step="5" placeholder="30"
        value="${cp || ''}" style="width:120px;"
        oninput="_npsAllocSave('finos_nps_corp_pct',this.value)">
    </div>
    <div class="nps-field">
      <div class="nps-alloc-label">G-Sec (G) %</div>
      <input class="nps-inp" type="number" min="0" max="100" step="5" placeholder="20"
        value="${gp || ''}" style="width:120px;"
        oninput="_npsAllocSave('finos_nps_gsec_pct',this.value)">
    </div>
  </div>
  <div id="nps-alloc-total-badge" class="nps-alloc-total" style="${(ep+cp+gp)===100?'background:rgba(34,211,166,.1);border:1px solid rgba(34,211,166,.3);color:#22D3A6;':'background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:#ff7d7d;'}">
    ${ep+cp+gp}% / 100% ${(ep+cp+gp)===100?'✓':'— must equal 100%'}
  </div>
  <p class="nps-note" style="margin-top:10px;">Enter a valid allocation totaling 100%. Active Choice limits depend on subscriber model and current rules; Auto Choice allocations change with age and are not modeled here.</p>
</div>`;
  }

  /* ══════════════════════════════════════════════════════════════════
     PROJECTION TAB
  ══════════════════════════════════════════════════════════════════ */
  function renderProjection(container) {
    if (!container) return;
    const { t1, projected, annuityPct, lumpSumPct, annuityCorpus, lumpSum, ageNow, yearsLeft, annualR, ep, cp, gp } = _compute();
    if (!ageNow) {
      container.innerHTML = '<div role="status" style="padding:20px;border:1px solid rgba(255,179,71,.3);border-radius:14px;color:#FFB347;line-height:1.6">Add a valid date of birth in the Setup tab to project your NPS corpus to age 60.</div>';
      return;
    }

    // Year-by-year milestones
    const empM = gs('finos_nps_emp_monthly');
    const erM  = gs('finos_nps_er_monthly');
    const milestones = [5, 10, 15, 20, 25, yearsLeft].filter(y => y > 0 && y <= yearsLeft)
      .map(y => ({
        yr: y,
        age: ageNow + y,
        val: _projectCorpus(t1, empM + erM, Math.round(y * 12), annualR)
      }));

    const rows = milestones.map(m => `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:10px;margin-bottom:6px;">
        <div style="font-size:13px;color:rgba(255,255,255,.5);min-width:50px;">+${m.yr} yr</div>
        <div style="font-size:13px;color:rgba(255,255,255,0.58);min-width:60px;">Age ${m.age}</div>
        <div style="flex:1;height:5px;background:rgba(255,255,255,.07);border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${Math.min((m.val/projected)*100,100).toFixed(1)}%;background:linear-gradient(90deg,#00D4FF,#22D3A6);border-radius:3px;"></div>
        </div>
        <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:14px;font-weight:800;color:#00D4FF;min-width:110px;text-align:right;">
          ${INR(m.val)}
        </div>
      </div>`).join('');

    // Annuity monthly estimate (7% annuity rate)
    const annuityMonthly = Math.round(annuityCorpus * 0.07 / 12);

    container.innerHTML = `
<style>
.nps-proj-hero{background:linear-gradient(135deg,rgba(34,211,166,.07),rgba(0,212,255,.04));border:1px solid rgba(34,211,166,.18);border-radius:20px;padding:24px;margin-bottom:20px;display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:16px;}
.nps-ph-lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,0.58);margin-bottom:6px;}
.nps-ph-val{font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:22px;font-weight:900;}
.nps-ph-sub{font-size:11px;color:rgba(255,255,255,0.58);margin-top:3px;}
.nps-alloc-bar{display:flex;height:8px;border-radius:6px;overflow:hidden;margin:14px 0 6px;gap:2px;}
[data-theme="light"] .nps-ph-val{color:inherit;}
</style>

<div class="nps-proj-hero">
  <div>
    <div class="nps-ph-lbl">Projected Corpus at 60</div>
    <div class="nps-ph-val" style="color:#00D4FF;">${INR(projected)}</div>
    <div class="nps-ph-sub">${yearsLeft} years @ ${(annualR*100).toFixed(1)}% blended p.a.</div>
  </div>
  <div>
    <div class="nps-ph-lbl">Tax-Free Lump-Sum (${lumpSumPct}%)</div>
    <div class="nps-ph-val" style="color:#22D3A6;">${INR(lumpSum)}</div>
    <div class="nps-ph-sub">Withdraw at age 60+</div>
  </div>
  <div>
    <div class="nps-ph-lbl">Annuity Purchase (${annuityPct}%)</div>
    <div class="nps-ph-val" style="color:#FFB347;">${INR(annuityCorpus)}</div>
    <div class="nps-ph-sub">~${INR(annuityMonthly)}/mo pension est.<br><span style="font-size:10px;opacity:.6;">(7% annuity rate assumed)</span></div>
  </div>
</div>

<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:20px;margin-bottom:20px;">
  <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,0.58);margin-bottom:12px;">Asset Allocation</div>
  <div class="nps-alloc-bar">
    <div style="width:${ep}%;background:#00D4FF;"></div>
    <div style="width:${cp}%;background:#22D3A6;"></div>
    <div style="width:${gp}%;background:#FFB347;"></div>
  </div>
  <div style="display:flex;gap:14px;font-size:12px;flex-wrap:wrap;">
    <span style="color:#00D4FF;">■ Equity ${ep}% (${(RATES.E*100).toFixed(1)}% p.a.)</span>
    <span style="color:#22D3A6;">■ Corp Bond ${cp}% (${(RATES.C*100).toFixed(1)}% p.a.)</span>
    <span style="color:#FFB347;">■ G-Sec ${gp}% (${(RATES.G*100).toFixed(1)}% p.a.)</span>
  </div>
</div>

<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:20px;">
  <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,0.58);margin-bottom:14px;">Growth Milestones</div>
  ${milestones.length ? rows : '<div style="color:rgba(255,255,255,0.58);font-size:13px;padding:20px 0;text-align:center;">Enter your Date of Birth and corpus to see milestones.</div>'}
</div>`;
  }

  /* ══════════════════════════════════════════════════════════════════
     TAX TAB
  ══════════════════════════════════════════════════════════════════ */
  function renderTax(container) {
    if (!container) return;
    const empM    = gs('finos_nps_emp_monthly');
    const erM     = gs('finos_nps_er_monthly');
    const savedSlab = gss('finos_nps_tax_slab');
    const slab = savedSlab === '' ? 30 : Math.max(0, Math.min(30, parseFloat(savedSlab) || 0));
    const empA    = empM * 12;
    const erA     = erM  * 12;
    const basicAnnual = gs('finos_nps_basic_annual') || gs('finos_salary_basic');
    const d = _taxDeductions(empA, erA, basicAnnual);
    const { c1, c1b, c2 } = d;
    const total   = c1 + c1b + c2;
    const eff     = _taxEffect(d, _incomeAnnual());
    const taxSave = eff ? eff.total : Math.round(total * slab / 100 * 1.04);
    const s       = slab / 100;
    const saved   = k => (eff ? eff[k] : Math.round(d[k] * s * 1.04));

    const row = (label, deduct, max, saved, note) => `
      <div style="display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr;padding:12px 14px;font-size:13px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05);border-radius:10px;margin-bottom:6px;align-items:center;gap:8px;">
        <div>
          <div style="font-weight:700;color:#F5F7FA;">${label}</div>
          <div style="font-size:10px;color:rgba(255,255,255,0.58);margin-top:2px;">${note}</div>
        </div>
        <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);color:#9B5DE5;">${INR(deduct)}</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.58);">${max}</div>
        <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);color:#22D3A6;font-weight:800;">${INR(saved)}</div>
      </div>`;

    container.innerHTML = `
<style>
[data-theme="light"] .nps-tax-hero{background:#fff;}
</style>
<div class="nps-tax-hero" style="background:rgba(79,124,255,.06);border:1px solid rgba(79,124,255,.18);border-radius:20px;padding:24px;margin-bottom:20px;">
  <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,0.58);margin-bottom:6px;">${eff ? 'Tax saved on your income' : 'Estimated Marginal Tax Benefit'}</div>
  <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:40px;font-weight:900;color:#4F7CFF;">${INR(taxSave)}</div>
  <div style="font-size:13px;color:rgba(255,255,255,0.58);margin-top:6px;">${eff ? `On ${INR(eff.income)} a year${eff.fromTracked ? ' (your tracked monthly income x 12)' : ''}, FY 2025-26 slabs plus 4% cess` : `At ${slab}% marginal rate plus 4% cess`} · eligible amount: ${INR(total)} · ${d.regime==='old'?'old':'new'} regime</div>
</div>

<div style="display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr;padding:8px 14px;font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:rgba(255,255,255,0.58);">
  <span>Section</span><span>Deductible</span><span>Max Limit</span><span>Tax Saved</span>
</div>
${row('80CCD(1)', c1, '10% basic, capped by remaining ₹1.5L 80C', saved('c1'), 'Old regime only; requires annual basic salary and shares the 80C ceiling')}
${row('80CCD(1B)', c1b, '₹50,000', saved('c1b'), 'Old regime only; NPS employee contribution above eligible 80CCD(1) amount')}
${row('80CCD(2)', c2, `${Math.round(d.employerRate*100)}% of basic`, saved('c2'), "Employer's contribution; salary-based limit, subject to tax rules")}

<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:20px;margin-top:20px;">
  <div style="font-size:13px;font-weight:800;color:#4F7CFF;margin-bottom:14px;">NPS Tax Rules (India)</div>
  <div style="font-size:13px;color:rgba(255,255,255,.65);line-height:1.7;display:flex;flex-direction:column;gap:8px;">
    <span>🟢 <b>80CCD(1)</b> and <b>80CCD(1B)</b>: generally available under the old regime, within their respective salary and overall limits; 80CCD(1) shares the 80C ceiling.</span>
    <span>🟢 <b>80CCD(2)</b>: employer contribution limit depends on regime and employer category; the estimate uses the basic salary and selections above.</span>
    <span>🟡 <b>Withdrawal tax</b>: only eligible lump-sum amounts receive exemption; current rules vary by subscriber type, exit reason, corpus and applicable law.</span>
    <span>🔴 <b>Annuity income</b>: taxable under applicable rules. This page's amount is a projection, not a guaranteed pension quote.</span>
    <span>🟡 <b>Tax benefit</b>: ${eff ? 'worked out on the annual income shown above with the FY 2025-26 slabs, the standard deduction and the Sec 87A rebate; it needs your annual basic salary for the section limits, and surcharge above ₹50L is not modelled.' : 'an estimate: it needs your annual basic salary and uses the slab you picked. Enter your annual income on the Profile tab for an exact figure.'}</span>
    <span>🟡 <b>Tier 2</b>: tax treatment depends on subscriber category and applicable rules.</span>
  </div>
</div>`;
  }

  /* Public */
  return { renderSetup, renderProjection, renderTax, _compute };
})();

/* Inline-handler functions. They used to sit in a <script> inside an innerHTML template, which the browser never executes, so
   the oninput/onclick attributes above threw "is not defined". Top-level here so those attributes can reach them. */
function _npsAutoSave(key, val) {
  localStorage.setItem(key, val);
  clearTimeout(window._npsSaveTimer);
  window._npsSaveTimer = setTimeout(() => {
    if (window.FinosNPSTracker) {
      const c = window.FinosNPSTracker._compute();
      document.getElementById('nps-total-hero') && (document.getElementById('nps-total-hero').textContent = '₹' + Math.round(c.total).toLocaleString('en-IN'));
      document.getElementById('nps-t1-disp')    && (document.getElementById('nps-t1-disp').textContent    = '₹' + Math.round(c.t1).toLocaleString('en-IN'));
      document.getElementById('nps-t2-disp')    && (document.getElementById('nps-t2-disp').textContent    = '₹' + Math.round(c.t2).toLocaleString('en-IN'));
      document.getElementById('nps-proj-disp')  && (document.getElementById('nps-proj-disp').textContent  = c.ageNow > 0 ? '₹' + Math.round(c.projected).toLocaleString('en-IN') : '—');
      document.getElementById('nps-lump-disp')  && (document.getElementById('nps-lump-disp').textContent  = c.ageNow > 0 ? '₹' + Math.round(c.lumpSum).toLocaleString('en-IN') : '—');
      document.getElementById('nps-ann-disp')   && (document.getElementById('nps-ann-disp').textContent   = c.ageNow > 0 ? '₹' + Math.round(c.annuityCorpus).toLocaleString('en-IN') : '—');
      document.getElementById('nps-tax-disp')   && (document.getElementById('nps-tax-disp').textContent   = '₹' + Math.round(c.taxSaved).toLocaleString('en-IN'));
      document.getElementById('nps-tax-basis') && (document.getElementById('nps-tax-basis').textContent = c.taxExact ? 'Worked out on your income' : 'Marginal-rate estimate');
      document.getElementById('nps-exit-share') && (document.getElementById('nps-exit-share').textContent = c.annuityPct + '% annuity assumption');
      document.getElementById('nps-lump-label') && (document.getElementById('nps-lump-label').textContent = 'Lump-Sum (' + c.lumpSumPct + '%)');
      document.getElementById('nps-ann-label') && (document.getElementById('nps-ann-label').textContent = 'Annuity (' + c.annuityPct + '%)');
    }
  }, 600);
}
function _npsAllocSave(key, val) {
  _npsAutoSave(key, val);
  setTimeout(() => {
    const ep = parseFloat(localStorage.getItem('finos_nps_equity_pct')) || 0;
    const cp = parseFloat(localStorage.getItem('finos_nps_corp_pct'))   || 0;
    const gp = parseFloat(localStorage.getItem('finos_nps_gsec_pct'))   || 0;
    const tot = ep + cp + gp;
    const badge = document.getElementById('nps-alloc-total-badge');
    if (badge) {
      badge.textContent = tot + '% / 100% ' + (tot === 100 ? '✓' : '— must equal 100%');
      if (tot === 100) {
        badge.style.background = 'rgba(34,211,166,.1)';
        badge.style.borderColor = 'rgba(34,211,166,.3)';
        badge.style.color = '#22D3A6';
      } else {
        badge.style.background = 'rgba(239,68,68,.1)';
        badge.style.borderColor = 'rgba(239,68,68,.3)';
        badge.style.color = '#ff7d7d';
      }
    }
  }, 700);
}
