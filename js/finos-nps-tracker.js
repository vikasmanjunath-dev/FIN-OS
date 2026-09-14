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

  const gs  = k => parseFloat(localStorage.getItem(k)) || 0;
  const ss  = (k, v) => localStorage.setItem(k, v);
  const gss = k => localStorage.getItem(k) || '';
  const INR = v => '₹' + Math.abs(Math.round(v)).toLocaleString('en-IN');

  /* ── Asset-class assumptions ─────────────────────────────────────── */
  const RATES = { E: 0.105, C: 0.085, G: 0.075 }; // equity, corp, g-sec p.a.

  function _weightedReturn(ep, cp, gp) {
    return (ep / 100) * RATES.E + (cp / 100) * RATES.C + (gp / 100) * RATES.G;
  }

  /* ── Core projection ─────────────────────────────────────────────── */
  function _projectCorpus(corpus, monthlyContrib, months, annualR) {
    const r = annualR / 12;
    let bal = corpus;
    for (let m = 0; m < months; m++) {
      bal += monthlyContrib;
      bal *= (1 + r);
    }
    return Math.round(bal);
  }

  /* ── Tax saving estimate ─────────────────────────────────────────── */
  function _taxSaved(empAnnual, erAnnual, slab) {
    const s = slab / 100;
    const c1 = Math.min(empAnnual, 150000);          // within 80C bucket
    const c1b = Math.min(Math.max(empAnnual - 150000, 0), 50000); // 80CCD(1B) extra
    const c2  = Math.min(erAnnual, 200000);           // 80CCD(2) employer
    return Math.round((c1 + c1b + c2) * s);
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
    const slab  = gs('finos_nps_tax_slab') || 30;

    let ageNow = 30, yearsLeft = 30;
    if (dob) {
      const birth = new Date(dob);
      const today = new Date();
      ageNow = today.getFullYear() - birth.getFullYear()
        - (today < new Date(today.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0);
      yearsLeft = Math.max(60 - ageNow, 0);
    }

    const annualR   = _weightedReturn(ep, cp, gp) || 0.085;
    const projected = _projectCorpus(t1, empM + erM, Math.round(yearsLeft * 12), annualR);
    const annuityCorpus = Math.round(projected * 0.40);
    const lumpSum       = projected - annuityCorpus;
    const taxSaved      = _taxSaved(empM * 12, erM * 12, slab);

    ss('finos_nps_value',     total);
    ss('finos_nps_projected', projected);
    ss('finos_nps_annual_tax', taxSaved);

    return { t1, t2, total, ageNow, yearsLeft, annualR, projected, annuityCorpus, lumpSum, taxSaved, ep, cp, gp };
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

    const { total, t1, t2, ageNow, yearsLeft, annualR, projected, annuityCorpus, lumpSum, taxSaved, ep, cp, gp } = _compute();

    container.innerHTML = `
<style>
.nps-hero{background:linear-gradient(135deg,rgba(100,210,255,.07),rgba(0,212,255,.04));border:1px solid rgba(100,210,255,.18);border-radius:20px;padding:26px;margin-bottom:20px;}
.nps-hero-lbl{font-size:11px;font-weight:700;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;}
.nps-hero-val{font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:42px;font-weight:900;color:#00D4FF;letter-spacing:-1px;line-height:1;}
.nps-hero-sub{font-size:13px;color:rgba(255,255,255,.4);margin-top:8px;}
.nps-tier-row{display:flex;gap:14px;margin-top:16px;flex-wrap:wrap;}
.nps-tier-pill{flex:1;min-width:140px;padding:14px;border-radius:14px;border:1px solid;text-align:center;}
.nps-stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:22px;}
.nps-stat{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:14px;text-align:center;}
.nps-stat-lbl{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,.4);margin-bottom:6px;}
.nps-stat-val{font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:18px;font-weight:800;color:#fff;}
.nps-stat-sub{font-size:11px;color:rgba(255,255,255,.35);margin-top:3px;}
.nps-form{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:20px;}
.nps-section{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.4);margin:0 0 12px;}
.nps-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:18px;}
.nps-field{display:flex;flex-direction:column;gap:6px;}
.nps-field label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:rgba(255,255,255,.4);}
.nps-inp{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:#fff;font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:14px;padding:10px 14px;width:100%;box-sizing:border-box;transition:border-color .2s;outline:none;}
.nps-inp:focus{border-color:rgba(0,212,255,.5);background:rgba(0,212,255,.05);}
.nps-alloc-row{display:flex;gap:14px;align-items:flex-end;margin-bottom:8px;flex-wrap:wrap;}
.nps-alloc-label{font-size:11px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;}
.nps-alloc-total{font-size:12px;font-weight:700;padding:4px 10px;border-radius:8px;margin-top:8px;display:inline-block;}
.nps-note{font-size:11px;color:rgba(255,255,255,.35);line-height:1.6;margin-top:4px;}
[data-theme="light"] .nps-hero{background:rgba(0,212,255,.05);}
[data-theme="light"] .nps-hero-val{color:#0099CC;}
[data-theme="light"] .nps-form,[data-theme="light"] .nps-stat{background:#fff;border-color:rgba(0,0,0,.08);}
[data-theme="light"] .nps-inp{background:#F4F6FB;border-color:rgba(0,0,0,.12);color:#0B0D12;}
[data-theme="light"] .nps-stat-val{color:#0B0D12;}
</style>

<div class="nps-hero">
  <div class="nps-hero-lbl">Total NPS Corpus</div>
  <div class="nps-hero-val" id="nps-total-hero">${INR(total)}</div>
  <div class="nps-hero-sub">Age ${ageNow} &nbsp;·&nbsp; ${yearsLeft} years to retirement &nbsp;·&nbsp; ${(annualR * 100).toFixed(1)}% blended return</div>
  <div class="nps-tier-row">
    <div class="nps-tier-pill" style="background:rgba(0,212,255,.07);border-color:rgba(0,212,255,.2);">
      <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,.4);text-transform:uppercase;margin-bottom:5px;">Tier 1</div>
      <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:20px;font-weight:800;color:#00D4FF;" id="nps-t1-disp">${INR(t1)}</div>
      <div style="font-size:10px;color:rgba(255,255,255,.35);margin-top:3px;">Pension · tax-saving</div>
    </div>
    <div class="nps-tier-pill" style="background:rgba(155,93,229,.07);border-color:rgba(155,93,229,.2);">
      <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,.4);text-transform:uppercase;margin-bottom:5px;">Tier 2</div>
      <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:20px;font-weight:800;color:#9B5DE5;" id="nps-t2-disp">${INR(t2)}</div>
      <div style="font-size:10px;color:rgba(255,255,255,.35);margin-top:3px;">Voluntary · liquid</div>
    </div>
  </div>
</div>

<div class="nps-stats">
  <div class="nps-stat" style="border-color:rgba(34,211,166,.2);">
    <div class="nps-stat-lbl">Projected at 60</div>
    <div class="nps-stat-val" style="color:#22D3A6;" id="nps-proj-disp">${INR(projected)}</div>
    <div class="nps-stat-sub">${yearsLeft}yr @ ${(annualR*100).toFixed(1)}% p.a.</div>
  </div>
  <div class="nps-stat" style="border-color:rgba(255,179,71,.2);">
    <div class="nps-stat-lbl">Lump-Sum (60%)</div>
    <div class="nps-stat-val" style="color:#FFB347;" id="nps-lump-disp">${INR(lumpSum)}</div>
    <div class="nps-stat-sub">Tax-free withdrawal</div>
  </div>
  <div class="nps-stat" style="border-color:rgba(239,68,68,.2);">
    <div class="nps-stat-lbl">Annuity (40%)</div>
    <div class="nps-stat-val" style="color:#EF4444;" id="nps-ann-disp">${INR(annuityCorpus)}</div>
    <div class="nps-stat-sub">Mandatory buy — taxable pension</div>
  </div>
  <div class="nps-stat" style="border-color:rgba(79,124,255,.2);">
    <div class="nps-stat-lbl">Tax Saved / yr</div>
    <div class="nps-stat-val" style="color:#4F7CFF;" id="nps-tax-disp">${INR(taxSaved)}</div>
    <div class="nps-stat-sub">80CCD(1) + 1B + 80CCD(2)</div>
  </div>
</div>

<div class="nps-form">
  <p class="nps-section">Account Details</p>
  <div class="nps-grid">
    <div class="nps-field">
      <label>PRAN Number</label>
      <input class="nps-inp" type="text" placeholder="110000123456" maxlength="12"
        value="${gss('finos_nps_pran')}"
        oninput="_autoSave('finos_nps_pran',this.value)">
    </div>
    <div class="nps-field">
      <label>Date of Birth</label>
      <input class="nps-inp" type="date"
        value="${gss('finos_nps_dob')}"
        oninput="_npsAutoSave('finos_nps_dob',this.value)">
    </div>
    <div class="nps-field">
      <label>Tax Slab (%)</label>
      <select class="nps-inp" onchange="_npsAutoSave('finos_nps_tax_slab',this.value)">
        <option value="0"  ${slab===0?'selected':''}>0% (no tax)</option>
        <option value="5"  ${slab===5?'selected':''}>5%</option>
        <option value="20" ${slab===20?'selected':''}>20%</option>
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
      <span class="nps-note">80CCD(1): deductible up to 10% of basic</span>
    </div>
    <div class="nps-field">
      <label>Employer Contribution / mo (₹)</label>
      <input class="nps-inp" type="number" min="0" step="100" placeholder="0"
        value="${gs('finos_nps_er_monthly') || ''}"
        oninput="_npsAutoSave('finos_nps_er_monthly',this.value)">
      <span class="nps-note">80CCD(2): deductible up to 10% of basic — not from 80C limit</span>
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
  <div id="nps-alloc-total-badge" class="nps-alloc-total" style="${(ep+cp+gp)===100?'background:rgba(34,211,166,.1);border:1px solid rgba(34,211,166,.3);color:#22D3A6;':'background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:#EF4444;'}">
    ${ep+cp+gp}% / 100% ${(ep+cp+gp)===100?'✓':'— must equal 100%'}
  </div>
  <p class="nps-note" style="margin-top:10px;">Max equity cap 75% for Active Choice (auto-reduces to 50% after age 50). Using Auto Choice (LC50) sets E:50/C:30/G:20 decreasing with age.</p>
</div>

<script>
function _npsAutoSave(key, val) {
  localStorage.setItem(key, val);
  clearTimeout(window._npsSaveTimer);
  window._npsSaveTimer = setTimeout(() => {
    if (window.FinosNPSTracker) {
      const c = window.FinosNPSTracker._compute();
      document.getElementById('nps-total-hero') && (document.getElementById('nps-total-hero').textContent = '₹' + Math.round(c.total).toLocaleString('en-IN'));
      document.getElementById('nps-t1-disp')    && (document.getElementById('nps-t1-disp').textContent    = '₹' + Math.round(c.t1).toLocaleString('en-IN'));
      document.getElementById('nps-t2-disp')    && (document.getElementById('nps-t2-disp').textContent    = '₹' + Math.round(c.t2).toLocaleString('en-IN'));
      document.getElementById('nps-proj-disp')  && (document.getElementById('nps-proj-disp').textContent  = '₹' + Math.round(c.projected).toLocaleString('en-IN'));
      document.getElementById('nps-lump-disp')  && (document.getElementById('nps-lump-disp').textContent  = '₹' + Math.round(c.lumpSum).toLocaleString('en-IN'));
      document.getElementById('nps-ann-disp')   && (document.getElementById('nps-ann-disp').textContent   = '₹' + Math.round(c.annuityCorpus).toLocaleString('en-IN'));
      document.getElementById('nps-tax-disp')   && (document.getElementById('nps-tax-disp').textContent   = '₹' + Math.round(c.taxSaved).toLocaleString('en-IN'));
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
        badge.style.color = '#EF4444';
      }
    }
  }, 700);
}
</script>`;
  }

  /* ══════════════════════════════════════════════════════════════════
     PROJECTION TAB
  ══════════════════════════════════════════════════════════════════ */
  function renderProjection(container) {
    if (!container) return;
    const { total, projected, annuityCorpus, lumpSum, ageNow, yearsLeft, annualR, ep, cp, gp } = _compute();

    // Year-by-year milestones
    const empM = gs('finos_nps_emp_monthly');
    const erM  = gs('finos_nps_er_monthly');
    const milestones = [5, 10, 15, 20, 25, yearsLeft].filter(y => y > 0 && y <= yearsLeft)
      .map(y => ({
        yr: y,
        age: ageNow + y,
        val: _projectCorpus(total, empM + erM, Math.round(y * 12), annualR)
      }));

    const rows = milestones.map(m => `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:10px;margin-bottom:6px;">
        <div style="font-size:13px;color:rgba(255,255,255,.5);min-width:50px;">+${m.yr} yr</div>
        <div style="font-size:13px;color:rgba(255,255,255,.4);min-width:60px;">Age ${m.age}</div>
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
.nps-ph-lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,.4);margin-bottom:6px;}
.nps-ph-val{font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:22px;font-weight:900;}
.nps-ph-sub{font-size:11px;color:rgba(255,255,255,.35);margin-top:3px;}
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
    <div class="nps-ph-lbl">Tax-Free Lump-Sum (60%)</div>
    <div class="nps-ph-val" style="color:#22D3A6;">${INR(lumpSum)}</div>
    <div class="nps-ph-sub">Withdraw at age 60+</div>
  </div>
  <div>
    <div class="nps-ph-lbl">Annuity Purchase (40%)</div>
    <div class="nps-ph-val" style="color:#FFB347;">${INR(annuityCorpus)}</div>
    <div class="nps-ph-sub">~${INR(annuityMonthly)}/mo pension est.<br><span style="font-size:10px;opacity:.6;">(7% annuity rate assumed)</span></div>
  </div>
</div>

<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:20px;margin-bottom:20px;">
  <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,.4);margin-bottom:12px;">Asset Allocation</div>
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
  <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,.4);margin-bottom:14px;">Growth Milestones</div>
  ${milestones.length ? rows : '<div style="color:rgba(255,255,255,.35);font-size:13px;padding:20px 0;text-align:center;">Enter your Date of Birth and corpus to see milestones.</div>'}
</div>`;
  }

  /* ══════════════════════════════════════════════════════════════════
     TAX TAB
  ══════════════════════════════════════════════════════════════════ */
  function renderTax(container) {
    if (!container) return;
    const empM    = gs('finos_nps_emp_monthly');
    const erM     = gs('finos_nps_er_monthly');
    const slab    = gs('finos_nps_tax_slab') || 30;
    const empA    = empM * 12;
    const erA     = erM  * 12;
    const c1      = Math.min(empA, 150000);
    const c1b     = Math.min(Math.max(empA - 150000, 0), 50000);
    const c2      = Math.min(erA, 200000);
    const total   = c1 + c1b + c2;
    const taxSave = Math.round(total * slab / 100);
    const s       = slab / 100;

    const row = (label, deduct, max, saved, note) => `
      <div style="display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr;padding:12px 14px;font-size:13px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05);border-radius:10px;margin-bottom:6px;align-items:center;gap:8px;">
        <div>
          <div style="font-weight:700;color:#F5F7FA;">${label}</div>
          <div style="font-size:10px;color:rgba(255,255,255,.35);margin-top:2px;">${note}</div>
        </div>
        <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);color:#9B5DE5;">${INR(deduct)}</div>
        <div style="font-size:11px;color:rgba(255,255,255,.35);">${max}</div>
        <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);color:#22D3A6;font-weight:800;">${INR(saved)}</div>
      </div>`;

    container.innerHTML = `
<style>
[data-theme="light"] .nps-tax-hero{background:#fff;}
</style>
<div class="nps-tax-hero" style="background:rgba(79,124,255,.06);border:1px solid rgba(79,124,255,.18);border-radius:20px;padding:24px;margin-bottom:20px;">
  <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,.4);margin-bottom:6px;">Annual Tax Saving on NPS</div>
  <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:40px;font-weight:900;color:#4F7CFF;">${INR(taxSave)}</div>
  <div style="font-size:13px;color:rgba(255,255,255,.4);margin-top:6px;">At ${slab}% tax slab · Total deductible: ${INR(total)}</div>
</div>

<div style="display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr;padding:8px 14px;font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:rgba(255,255,255,.35);">
  <span>Section</span><span>Deductible</span><span>Max Limit</span><span>Tax Saved</span>
</div>
${row('80CCD(1)', c1, '₹1.5L (within 80C)', Math.round(c1 * s), 'Your contribution — counts toward 80C ₹1.5L ceiling')}
${row('80CCD(1B)', c1b, '₹50,000 extra', Math.round(c1b * s), 'Additional ₹50K over 80C limit — exclusive NPS benefit')}
${row('80CCD(2)', c2, '10% of basic (no cap for new regime)', Math.round(c2 * s), "Employer's contribution — NOT from 80C limit")}

<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:20px;margin-top:20px;">
  <div style="font-size:13px;font-weight:800;color:#4F7CFF;margin-bottom:14px;">NPS Tax Rules (India)</div>
  <div style="font-size:13px;color:rgba(255,255,255,.65);line-height:1.7;display:flex;flex-direction:column;gap:8px;">
    <span>🟢 <b>80CCD(1B)</b>: exclusive NPS deduction of ₹50,000 above the ₹1.5L 80C bucket — unique to NPS.</span>
    <span>🟢 <b>80CCD(2)</b>: employer contribution deductible with no upper cap under the new tax regime (10% of basic).</span>
    <span>🟢 <b>Corpus growth</b>: fully tax-free while invested — NPS is EEE (exempt-exempt-exempt).</span>
    <span>🟡 <b>60% lump sum</b>: at age 60, up to 60% withdrawal is tax-free.</span>
    <span>🔴 <b>40% annuity</b>: mandatory purchase at 60; annuity income is taxable as per your slab at that time.</span>
    <span>🔴 <b>Early exit</b>: before 60 — only 20% can be withdrawn tax-free; 80% must buy annuity (taxable).</span>
    <span>🔴 <b>Tier 2</b>: no tax deduction available (except for central govt employees).</span>
  </div>
</div>`;
  }

  /* Public */
  return { renderSetup, renderProjection, renderTax, _compute };
})();
