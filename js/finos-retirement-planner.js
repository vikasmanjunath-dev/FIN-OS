/* finos-retirement-planner.js — Unified Retirement Planner
 *
 * Aggregates EPF, NPS, PPF, SIP/MF, FD and other savings into a single
 * retirement corpus view. Calculates:
 *   • Total projected corpus at retirement age
 *   • Required corpus (25× inflated annual expense — 4% SWR)
 *   • Corpus gap / surplus
 *   • Estimated monthly retirement income (SWR + EPS pension + NPS annuity)
 *   • Years of runway
 *
 * Public API (window.FinosRetirementPlanner):
 *   renderOverview(el)   — hero + gap + income breakdown
 *   renderPlan(el)       — inputs + corpus build timeline
 *   renderIncome(el)     — post-retirement income stream detail
 *
 * localStorage written:
 *   finos_retire_age          — target retirement age
 *   finos_retire_exp_mo       — expected monthly expense in retirement (today ₹)
 *   finos_retire_inflation     — inflation rate assumption %
 *   finos_retire_return        — pre-retirement portfolio return %
 *   finos_retire_corpus        — computed total projected corpus
 *   finos_retire_required      — required corpus
 *   finos_retire_gap           — gap (negative = deficit)
 *   finos_retire_monthly_income— estimated monthly income in retirement
 */
window.FinosRetirementPlanner = (function () {
  'use strict';

  const gs  = k => parseFloat(localStorage.getItem(k)) || 0;
  const ss  = (k, v) => localStorage.setItem(k, v);
  const gss = k => localStorage.getItem(k) || '';
  const INR = v => '₹' + Math.abs(Math.round(v)).toLocaleString('en-IN');

  /* ── Future value of a lump sum ──────────────────────────────── */
  function _fv(pv, r, n) { return Math.round(pv * Math.pow(1 + r, n)); }

  /* ── Core computation ─────────────────────────────────────────── */
  function _compute() {
    const retireAge   = parseInt(gss('finos_retire_age'))       || 60;
    const expMo       = gs('finos_retire_exp_mo')              || 50000; // today's rupees
    const inflation   = (gs('finos_retire_inflation')          || 6) / 100;
    const portfolioR  = (gs('finos_retire_return')             || 10) / 100;

    // Derive current age from DOB stored by EPF or NPS tracker
    const dob  = gss('finos_epf_dob') || gss('finos_nps_dob');
    let ageNow = 30;
    if (dob) {
      const birth = new Date(dob);
      const today = new Date();
      ageNow = today.getFullYear() - birth.getFullYear()
        - (today < new Date(today.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0);
    } else {
      // fall back to NPS tracker age logic
      ageNow = parseInt(gss('finos_retire_current_age')) || 30;
    }
    const yearsLeft = Math.max(retireAge - ageNow, 0);

    // ── Source data (from other trackers) ────────────────────────
    // EPF: use projected value; fall back to growing current value
    const epfProjected  = gs('finos_epf_projected') || _fv(gs('finos_epf_value'), 0.0825, yearsLeft);
    const epsPension    = gs('finos_epf_pension');          // monthly EPS pension

    // NPS: 60% of projected corpus is lump-sum; 40% buys annuity
    const npsProjected  = gs('finos_nps_projected') || _fv(gs('finos_nps_value'), 0.085, yearsLeft);
    const npsLumpSum    = Math.round(npsProjected * 0.60);
    const npsAnnuityC   = npsProjected - npsLumpSum;
    const npsAnnuityMo  = Math.round(npsAnnuityC * 0.07 / 12); // 7% annuity rate est.

    // PPF: grow current value at 7.1% for yearsLeft
    const ppfProjected  = _fv(gs('finos_ppf_value'), 0.071, yearsLeft);

    // SIP/MF: grow at portfolio return
    const sipProjected  = _fv(gs('finos_sip_value'), portfolioR, yearsLeft);

    // Equity portfolio: grow at portfolioReturn
    const equityProj    = _fv(gs('finos_portfolio_value') + gs('finos_mf_import_value'), portfolioR, yearsLeft);

    // FD / Fixed Income: grow at 7%
    const fdProjected   = _fv(gs('finos_fd_value'), 0.07, yearsLeft);

    // Gold: grow at 8%
    const goldProjected = _fv(gs('finos_gold_value'), 0.08, yearsLeft);

    // Manual override / custom savings
    const manualCorpus  = gs('finos_retire_manual_corpus');

    const totalCorpus = epfProjected + npsLumpSum + ppfProjected + sipProjected
                      + equityProj + fdProjected + goldProjected + manualCorpus;

    // ── Required corpus ────────────────────────────────────────────
    // Inflate today's monthly expense to retirement-year rupees
    const inflatedMonthlyExp = Math.round(expMo * Math.pow(1 + inflation, yearsLeft));
    const inflatedAnnualExp  = inflatedMonthlyExp * 12;
    const requiredCorpus     = inflatedAnnualExp * 25; // 4% SWR = 25× rule

    // ── Gap ────────────────────────────────────────────────────────
    const corpusGap = requiredCorpus - totalCorpus; // negative = surplus

    // ── Monthly income in retirement ───────────────────────────────
    const swrMonthly     = Math.round(totalCorpus * 0.04 / 12);
    const totalMonthlyIncome = swrMonthly + epsPension + npsAnnuityMo;
    const expCoverage    = inflatedMonthlyExp > 0 ? (totalMonthlyIncome / inflatedMonthlyExp) * 100 : 0;
    const runwayYears    = totalCorpus > 0 && inflatedMonthlyExp > 0 ? (totalCorpus / (inflatedMonthlyExp * 12)) : 0;

    // Persist key metrics
    ss('finos_retire_corpus',         totalCorpus);
    ss('finos_retire_required',        requiredCorpus);
    ss('finos_retire_gap',             corpusGap);
    ss('finos_retire_monthly_income',  totalMonthlyIncome);

    return {
      ageNow, retireAge, yearsLeft, expMo, inflatedMonthlyExp, inflatedAnnualExp, inflation, portfolioR,
      epfProjected, epsPension, npsLumpSum, npsAnnuityMo, ppfProjected,
      sipProjected, equityProj, fdProjected, goldProjected, manualCorpus,
      totalCorpus, requiredCorpus, corpusGap,
      swrMonthly, totalMonthlyIncome, expCoverage, runwayYears
    };
  }

  /* ── Progress ring SVG ──────────────────────────────────────────── */
  function _ring(pct, color, size) {
    const r = size === 'lg' ? 70 : 54;
    const cx = r + 14;
    const dim = cx * 2;
    const c = 2 * Math.PI * r;
    const dash = Math.min(pct / 100, 1) * c;
    return `<svg width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}">
      <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="10"/>
      <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${color}" stroke-width="10"
        stroke-dasharray="${dash} ${c}" stroke-dashoffset="${c*0.25}" stroke-linecap="round"
        style="transition:stroke-dasharray 1s ease;"/>
    </svg>`;
  }

  /* ══════════════════════════════════════════════════════════════
     OVERVIEW
  ══════════════════════════════════════════════════════════════ */
  function renderOverview(container) {
    if (!container) return;
    const c = _compute();
    const readyPct = c.requiredCorpus > 0 ? Math.min((c.totalCorpus / c.requiredCorpus) * 100, 100) : 0;
    const onTrack  = c.corpusGap <= 0;
    const mainColor = readyPct >= 80 ? '#22D3A6' : readyPct >= 50 ? '#FFB347' : '#EF4444';

    const sources = [
      { label: 'EPF Corpus',     val: c.epfProjected,  color: '#22D3A6' },
      { label: 'NPS Lump-Sum',   val: c.npsLumpSum,    color: '#00D4FF' },
      { label: 'PPF/Savings',    val: c.ppfProjected,  color: '#9B5DE5' },
      { label: 'SIP / MF',       val: c.sipProjected,  color: '#FFB347' },
      { label: 'Equity',         val: c.equityProj,    color: '#4F7CFF' },
      { label: 'FD',             val: c.fdProjected,   color: '#34D399' },
      { label: 'Gold',           val: c.goldProjected, color: '#F59E0B' },
      { label: 'Other / Manual', val: c.manualCorpus,  color: '#8B5CF6' },
    ].filter(s => s.val > 0);

    const maxSrc = Math.max(...sources.map(s => s.val), 1);
    const srcBars = sources.map(s => `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:7px;">
        <div style="width:110px;font-size:11px;color:rgba(255,255,255,.55);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${s.label}</div>
        <div style="flex:1;height:6px;background:rgba(255,255,255,.07);border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${(s.val/maxSrc*100).toFixed(1)}%;background:${s.color};border-radius:3px;transition:width .6s;"></div>
        </div>
        <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:12px;font-weight:800;color:${s.color};min-width:90px;text-align:right;">${INR(s.val)}</div>
      </div>`).join('');

    container.innerHTML = `
<style>
.rp-hero{background:linear-gradient(135deg,rgba(34,211,166,.07),rgba(0,212,255,.04));border:1px solid rgba(34,211,166,.18);border-radius:22px;padding:28px;margin-bottom:22px;display:flex;gap:28px;flex-wrap:wrap;align-items:center;}
.rp-ring-wrap{position:relative;width:168px;height:168px;flex-shrink:0;}
.rp-ring-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;}
.rp-ring-pct{font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:28px;font-weight:900;}
.rp-ring-lbl{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,0.58);margin-top:2px;}
.rp-body{flex:1;min-width:200px;}
.rp-lbl{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,0.58);margin-bottom:6px;}
.rp-val{font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:38px;font-weight:900;letter-spacing:-1px;line-height:1;}
.rp-sub{font-size:13px;color:rgba(255,255,255,0.58);margin-top:8px;line-height:1.6;}
.rp-gap-pill{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:12px;font-size:13px;font-weight:700;margin-top:12px;}
.rp-income-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:22px;}
.rp-inc{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:14px;text-align:center;}
.rp-inc-lbl{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,0.58);margin-bottom:6px;}
.rp-inc-val{font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:18px;font-weight:800;}
.rp-inc-sub{font-size:11px;color:rgba(255,255,255,0.58);margin-top:3px;}
.rp-src-box{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:20px;margin-bottom:22px;}
.rp-sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,0.58);margin:0 0 14px;}
[data-theme="light"] .rp-hero{background:rgba(34,211,166,.05);}
[data-theme="light"] .rp-val{color:#0B0D12;}
[data-theme="light"] .rp-src-box,[data-theme="light"] .rp-inc{background:#fff;border-color:rgba(0,0,0,.08);}
</style>

<div class="rp-hero">
  <div class="rp-ring-wrap">
    ${_ring(readyPct, mainColor, 'lg')}
    <div class="rp-ring-center">
      <div class="rp-ring-pct" style="color:${mainColor};">${Math.round(readyPct)}%</div>
      <div class="rp-ring-lbl">ready</div>
    </div>
  </div>
  <div class="rp-body">
    <div class="rp-lbl">Projected Retirement Corpus</div>
    <div class="rp-val" style="color:${mainColor};">${INR(c.totalCorpus)}</div>
    <div class="rp-sub">
      of <strong style="color:${mainColor};">${INR(c.requiredCorpus)}</strong> needed &nbsp;·&nbsp;
      Retire at ${c.retireAge} (${c.yearsLeft} years away) &nbsp;·&nbsp;
      ${c.inflatedMonthlyExp > 0 ? `₹${Math.round(c.inflatedMonthlyExp/1000)}K/mo expense in ${c.retireAge}yr terms` : ''}
    </div>
    <div class="rp-gap-pill" style="${onTrack?'background:rgba(34,211,166,.1);border:1px solid rgba(34,211,166,.3);color:#22D3A6;':'background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.25);color:#EF4444;'}">
      ${onTrack ? `✓ On track — surplus of ${INR(-c.corpusGap)}` : `⚠ Gap: ${INR(c.corpusGap)} more needed`}
    </div>
  </div>
</div>

<div class="rp-income-grid">
  <div class="rp-inc" style="border-color:rgba(34,211,166,.2);">
    <div class="rp-inc-lbl">Monthly Income (4% SWR)</div>
    <div class="rp-inc-val" style="color:#22D3A6;">${INR(c.swrMonthly)}</div>
    <div class="rp-inc-sub">from portfolio draw-down</div>
  </div>
  ${c.epsPension > 0 ? `<div class="rp-inc" style="border-color:rgba(0,212,255,.2);">
    <div class="rp-inc-lbl">EPS Pension (EPF)</div>
    <div class="rp-inc-val" style="color:#00D4FF;">${INR(c.epsPension)}/mo</div>
    <div class="rp-inc-sub">guaranteed govt pension</div>
  </div>` : ''}
  ${c.npsAnnuityMo > 0 ? `<div class="rp-inc" style="border-color:rgba(155,93,229,.2);">
    <div class="rp-inc-lbl">NPS Annuity</div>
    <div class="rp-inc-val" style="color:#9B5DE5;">${INR(c.npsAnnuityMo)}/mo</div>
    <div class="rp-inc-sub">40% corpus → annuity est.</div>
  </div>` : ''}
  <div class="rp-inc" style="border-color:rgba(79,124,255,.2);">
    <div class="rp-inc-lbl">Total Monthly Income</div>
    <div class="rp-inc-val" style="color:#4F7CFF;">${INR(c.totalMonthlyIncome)}</div>
    <div class="rp-inc-sub">${c.expCoverage.toFixed(0)}% of retirement expense</div>
  </div>
  <div class="rp-inc" style="border-color:rgba(255,179,71,.2);">
    <div class="rp-inc-lbl">Corpus Runway</div>
    <div class="rp-inc-val" style="color:#FFB347;">${c.runwayYears.toFixed(0)} yrs</div>
    <div class="rp-inc-sub">without any returns</div>
  </div>
</div>

<div class="rp-src-box">
  <p class="rp-sec">Corpus Sources at Retirement</p>
  ${sources.length ? srcBars : '<div style="color:rgba(255,255,255,0.58);font-size:13px;padding:8px 0;">Fill in EPF, NPS, SIP and other trackers to see source breakdown.</div>'}
</div>

<div style="background:rgba(255,179,71,.05);border:1px solid rgba(255,179,71,.12);border-radius:14px;padding:16px;">
  <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,179,71,.8);margin-bottom:10px;">How projections are calculated</div>
  <div style="font-size:12px;color:rgba(255,255,255,.55);line-height:1.7;display:flex;flex-direction:column;gap:5px;">
    <span>📊 EPF projected value is pulled from your EPF Tracker (8.25% p.a.)</span>
    <span>📊 NPS lump-sum = 60% of NPS projected corpus (40% must buy annuity)</span>
    <span>📊 PPF / small savings grown at 7.1% p.a. from current balance</span>
    <span>📊 SIP, equity, FD and gold grown at assumed rates (editable in Plan tab)</span>
    <span>📊 Required corpus = 25× annual expense in retirement-year rupees (4% SWR rule)</span>
    <span>⚠ These are estimates — not a guarantee. Consult a certified financial planner.</span>
  </div>
</div>`;
  }

  /* ══════════════════════════════════════════════════════════════
     PLAN TAB
  ══════════════════════════════════════════════════════════════ */
  function renderPlan(container) {
    if (!container) return;
    const c = _compute();

    // Year-by-year milestone projection
    const milestones = [5, 10, 15, 20, 25, c.yearsLeft]
      .filter((y, i, a) => y > 0 && y <= c.yearsLeft && a.indexOf(y) === i)
      .map(y => {
        const frac = y / Math.max(c.yearsLeft, 1);
        const val  = Math.round(c.totalCorpus * frac * Math.pow(1 + 0.10, y) / Math.pow(1 + 0.10, c.yearsLeft));
        return { yr: y, age: c.ageNow + y, val };
      });

    const milRows = milestones.map(m => `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05);border-radius:10px;margin-bottom:6px;">
        <div style="font-size:12px;color:rgba(255,255,255,0.58);min-width:50px;">+${m.yr} yr</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.58);min-width:60px;">Age ${m.age}</div>
        <div style="flex:1;height:5px;background:rgba(255,255,255,.07);border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${Math.min((m.val/c.totalCorpus*100),100).toFixed(1)}%;background:linear-gradient(90deg,#00D4FF,#22D3A6);border-radius:3px;"></div>
        </div>
        <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:13px;font-weight:800;color:#22D3A6;min-width:100px;text-align:right;">${INR(m.val)}</div>
      </div>`).join('');

    container.innerHTML = `
<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:20px;margin-bottom:20px;">
  <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,0.58);margin:0 0 14px;">Assumptions (edit to recalculate)</p>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px;margin-bottom:6px;">
    <div style="display:flex;flex-direction:column;gap:6px;">
      <label style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:rgba(255,255,255,0.58);">Current Age</label>
      <input style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:#fff;font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:14px;padding:10px 14px;width:100%;box-sizing:border-box;outline:none;"
        type="number" min="18" max="70" value="${c.ageNow}" oninput="_rpSave('finos_retire_current_age',this.value)">
    </div>
    <div style="display:flex;flex-direction:column;gap:6px;">
      <label style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:rgba(255,255,255,0.58);">Retire at Age</label>
      <input style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:#fff;font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:14px;padding:10px 14px;width:100%;box-sizing:border-box;outline:none;"
        type="number" min="40" max="80" value="${c.retireAge}" oninput="_rpSave('finos_retire_age',this.value)">
    </div>
    <div style="display:flex;flex-direction:column;gap:6px;">
      <label style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:rgba(255,255,255,0.58);">Monthly Expense in Retirement (₹ today)</label>
      <input style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:#fff;font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:14px;padding:10px 14px;width:100%;box-sizing:border-box;outline:none;"
        type="number" min="0" step="5000" value="${c.expMo||''}" placeholder="50000" oninput="_rpSave('finos_retire_exp_mo',this.value)">
    </div>
    <div style="display:flex;flex-direction:column;gap:6px;">
      <label style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:rgba(255,255,255,0.58);">Inflation Rate (%)</label>
      <input style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:#fff;font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:14px;padding:10px 14px;width:100%;box-sizing:border-box;outline:none;"
        type="number" min="3" max="12" step="0.5" value="${(gs('finos_retire_inflation')||6)}" oninput="_rpSave('finos_retire_inflation',this.value)">
    </div>
    <div style="display:flex;flex-direction:column;gap:6px;">
      <label style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:rgba(255,255,255,0.58);">Portfolio Return (% p.a.)</label>
      <input style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:#fff;font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:14px;padding:10px 14px;width:100%;box-sizing:border-box;outline:none;"
        type="number" min="5" max="18" step="0.5" value="${(gs('finos_retire_return')||10)}" oninput="_rpSave('finos_retire_return',this.value)">
    </div>
    <div style="display:flex;flex-direction:column;gap:6px;">
      <label style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:rgba(255,255,255,0.58);">Additional Savings / Manual Corpus (₹)</label>
      <input style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:#fff;font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:14px;padding:10px 14px;width:100%;box-sizing:border-box;outline:none;"
        type="number" min="0" step="100000" value="${c.manualCorpus||''}" placeholder="0" oninput="_rpSave('finos_retire_manual_corpus',this.value)">
    </div>
  </div>
</div>

<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:20px;">
  <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,0.58);margin:0 0 14px;">Growth Milestones</p>
  ${milestones.length ? milRows : '<div style="color:rgba(255,255,255,0.58);font-size:13px;padding:8px 0;">Enter current age and retirement age to see milestones.</div>'}
</div>`;
  }

  /* ══════════════════════════════════════════════════════════════
     INCOME TAB
  ══════════════════════════════════════════════════════════════ */
  function renderIncome(container) {
    if (!container) return;
    const c = _compute();

    const streams = [
      { label: 'SWR from Portfolio (4%)',  mo: c.swrMonthly,     color: '#22D3A6', note: 'Drawdown from total corpus at 4% p.a. — sustainable 30yr' },
      { label: 'EPS Pension (EPF)',         mo: c.epsPension,     color: '#00D4FF', note: 'Guaranteed by EPFO. Based on last 60-month avg basic × yrs/70' },
      { label: 'NPS Annuity',              mo: c.npsAnnuityMo,   color: '#9B5DE5', note: 'From 40% mandatory annuity purchase at age 60 @ 7%' },
    ].filter(s => s.mo > 0);

    const total = streams.reduce((s, x) => s + x.mo, 0);
    const maxMo = Math.max(...streams.map(s => s.mo), 1);

    const streamRows = streams.map(s => `
      <div style="padding:14px 16px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:12px;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div style="font-size:13px;font-weight:700;color:#F5F7FA;">${s.label}</div>
          <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:15px;font-weight:900;color:${s.color};">${INR(s.mo)}/mo</div>
        </div>
        <div style="height:5px;background:rgba(255,255,255,.07);border-radius:3px;overflow:hidden;margin-bottom:6px;">
          <div style="height:100%;width:${(s.mo/maxMo*100).toFixed(1)}%;background:${s.color};border-radius:3px;"></div>
        </div>
        <div style="font-size:11px;color:rgba(255,255,255,0.58);">${s.note}</div>
      </div>`).join('');

    const reqMo = c.inflatedMonthlyExp;
    const surplus = total - reqMo;

    container.innerHTML = `
<div style="background:rgba(79,124,255,.07);border:1px solid rgba(79,124,255,.2);border-radius:20px;padding:24px;margin-bottom:22px;">
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:16px;">
    <div>
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,0.58);margin-bottom:6px;">Total Monthly Income</div>
      <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:30px;font-weight:900;color:#4F7CFF;">${INR(total)}</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.58);margin-top:4px;">${c.expCoverage.toFixed(0)}% of expected expense</div>
    </div>
    <div>
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,0.58);margin-bottom:6px;">Expected Monthly Expense</div>
      <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:30px;font-weight:900;color:rgba(255,255,255,.8);">${INR(reqMo)}</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.58);margin-top:4px;">in retirement-year rupees (${c.retireAge}yr)</div>
    </div>
    <div>
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,0.58);margin-bottom:6px;">${surplus >= 0 ? 'Monthly Surplus' : 'Monthly Shortfall'}</div>
      <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:30px;font-weight:900;color:${surplus >= 0 ? '#22D3A6' : '#EF4444'};">${INR(Math.abs(surplus))}</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.58);margin-top:4px;">${surplus >= 0 ? 'can be reinvested or left to heirs' : 'top up corpus to fill gap'}</div>
    </div>
  </div>
</div>

<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:20px;margin-bottom:20px;">
  <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,0.58);margin-bottom:14px;">Income Streams</div>
  ${streams.length ? streamRows : '<div style="color:rgba(255,255,255,0.58);font-size:13px;padding:8px 0;">Fill EPF, NPS trackers and portfolio data for income breakdown.</div>'}
</div>

<div style="background:rgba(34,211,166,.05);border:1px solid rgba(34,211,166,.12);border-radius:14px;padding:18px;">
  <div style="font-size:13px;font-weight:800;color:#22D3A6;margin-bottom:12px;">Retirement Income Planning Tips</div>
  <div style="display:flex;flex-direction:column;gap:7px;font-size:13px;color:rgba(255,255,255,.65);line-height:1.7;">
    <span>🟢 <strong>4% SWR (Safe Withdrawal Rate)</strong>: withdrawing 4% of corpus annually has historically lasted 30+ years (Trinity study). Adjust down to 3.5% for conservatism.</span>
    <span>🟢 Build a <strong>bucket strategy</strong>: 2yr expenses in cash, 3–7yr in debt funds, remaining in equity. Rebalance annually.</span>
    <span>🟡 <strong>Sequence risk</strong>: avoid large equity losses in first 5 years of retirement — they can permanently impair corpus.</span>
    <span>🟡 <strong>Healthcare inflation</strong> in India (~12% p.a.) is higher than general inflation. Keep a separate ₹50L health corpus or top-up insurance.</span>
    <span>🔴 <strong>NPS annuity is taxable</strong> as per your income slab in retirement. Plan for this when estimating net income.</span>
    <span>💡 Delay NPS withdrawal by a few years if your corpus is below target — every extra year adds significantly at 85% equity allocation.</span>
  </div>
</div>`;
  }

  /* Public */

  /* ═══════════════════════════════════════════════════════
     SUCCESS ODDS TAB — Monte Carlo (js/finos-montecarlo.js)
  ════════════════════════════════════════════════════════ */
  function _mcConfig(c) {
    const A = (window.FinosMC && window.FinosMC.DEFAULT_ASSUMPTIONS) || {};
    const eqRet  = (gs('finos_retire_eq_return') || 12) / 100;
    const npsEq  = Math.min(Math.max(gs('finos_nps_equity_pct') || 50, 0), 100) / 100;
    const npsVal = gs('finos_nps_value') * 0.60;                 // 60% lump sum stays in the corpus; 40% buys the annuity
    const equity = gs('finos_sip_value') + gs('finos_portfolio_value') + gs('finos_mf_import_value') + npsVal * npsEq;
    const debt   = gs('finos_epf_value') + gs('finos_ppf_value') + gs('finos_fd_value') + npsVal * (1 - npsEq) + gs('finos_retire_manual_corpus');
    const gold   = gs('finos_gold_value');
    const mk = (name, v, key, mean) => ({ name, value: v, mean: mean === undefined ? A[key].mean : mean, vol: A[key].vol, beta: A[key].beta });
    return {
      startAge: c.ageNow, retireAge: Math.max(c.retireAge, c.ageNow), endAge: Math.max(gs('finos_retire_end_age') || 90, c.retireAge + 1),
      assets: [mk('Equity', equity, 'equity', eqRet), mk('Debt', debt, 'debt'), mk('Gold', gold, 'gold')],
      monthlyContribution: gs('finos_retire_monthly_invest'),
      stepUp: (gs('finos_retire_stepup') || 0) / 100,
      monthlyExpenseToday: c.expMo,
      inflation: c.inflation, inflationVol: 0.015,
      pensionMonthlyAtRetire: c.epsPension + c.npsAnnuityMo, pensionIndexation: 0,
      runs: 4000, seed: 2026,
    };
  }

  function _fan(bands, retireAge) {
    const W = 640, H = 250, pl = 54, pr = 10, pt = 10, pb = 26;
    const maxV = Math.max(...bands.map(b => b.p90), 1);
    const x = i => pl + (i / (bands.length - 1)) * (W - pl - pr);
    const y = v => pt + (1 - v / maxV) * (H - pt - pb);
    const line = k => bands.map((b, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(b[k]).toFixed(1)).join(' ');
    const area = (hi, lo) => bands.map((b, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(b[hi]).toFixed(1)).join(' ')
      + ' ' + bands.slice().reverse().map((b, i) => 'L' + x(bands.length - 1 - i).toFixed(1) + ' ' + y(b[lo]).toFixed(1)).join(' ') + ' Z';
    const ri = bands.findIndex(b => b.age >= retireAge);
    const ticks = [0, .25, .5, .75, 1].map(t => `<text x="${pl - 6}" y="${(y(maxV * t) + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="currentColor" opacity=".5">${window.FinosFmt ? window.FinosFmt.compact(maxV * t, { symbol: false }) : Math.round(maxV * t)}</text>`).join('');
    const ages = bands.filter((b, i) => i % Math.ceil(bands.length / 7) === 0 || i === bands.length - 1)
      .map(b => `<text x="${x(b.age - bands[0].age).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="9" fill="currentColor" opacity=".5">${b.age}</text>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Projected corpus range by age: median with 10th to 90th percentile band" style="color:var(--text-secondary,#9AA0B4)">
      ${ticks}${ages}
      <path d="${area('p90', 'p10')}" fill="rgba(79,124,255,.12)"/><path d="${area('p75', 'p25')}" fill="rgba(79,124,255,.22)"/>
      <path d="${line('p50')}" fill="none" stroke="#22D3A6" stroke-width="2.2"/>
      ${ri > 0 ? `<line x1="${x(ri).toFixed(1)}" x2="${x(ri).toFixed(1)}" y1="${pt}" y2="${H - pb}" stroke="#FFB347" stroke-dasharray="4 3"/><text x="${(x(ri) + 4).toFixed(1)}" y="${pt + 10}" font-size="9" fill="#FFB347">retire</text>` : ''}
    </svg>`;
  }

  function renderOdds(container) {
    if (!container) return;
    const c = _compute();
    if (!window.FinosMC) { container.innerHTML = '<div style="color:#EF4444;font-size:13px;padding:20px;">Simulation engine failed to load. Please refresh.</div>'; return; }
    container.style.cssText = 'display:block;';                // placeholder styles centre a single line of text; reset for real content
    const cfg = _mcConfig(c);
    const hasMoney = cfg.assets.some(a => a.value > 0) || cfg.monthlyContribution > 0;
    const fmt = v => (window.FinosFmt ? window.FinosFmt.inr(v) : INR(v));
    const cmp = v => (window.FinosFmt ? window.FinosFmt.compact(v) : INR(v));
    const inp = 'background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:inherit;padding:10px 12px;width:100%;font-family:var(--font-mono,monospace);font-size:14px;';
    const lbl = 'font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;opacity:.55;';
    const field = (label, key, val, min, max, step, ph) => `<div style="display:flex;flex-direction:column;gap:6px;"><label style="${lbl}">${label}</label>
      <input style="${inp}" type="number" min="${min}" max="${max}" step="${step}" value="${val || ''}" placeholder="${ph || ''}" oninput="_rpOddsSave('${key}',this.value)"></div>`;

    container.innerHTML = `
<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:20px;margin-bottom:20px;">
  <p style="${lbl}margin:0 0 14px;">What goes into the simulation</p>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px;">
    ${field('Monthly investing today (₹)', 'finos_retire_monthly_invest', gs('finos_retire_monthly_invest'), 0, 10000000, 1000, '0')}
    ${field('Yearly step-up (%)', 'finos_retire_stepup', gs('finos_retire_stepup'), 0, 25, 1, '0')}
    ${field('Plan to age', 'finos_retire_end_age', cfg.endAge, 70, 110, 1, '90')}
    ${field('Equity return (% p.a.)', 'finos_retire_eq_return', (cfg.assets[0].mean * 100).toFixed(1).replace(/\.0$/, ''), 6, 18, 0.5, '12')}
  </div>
  <p style="font-size:11px;opacity:.5;margin:12px 0 0;line-height:1.6;">Uses your tracked holdings (equity ${cmp(cfg.assets[0].value)} · debt ${cmp(cfg.assets[1].value)} · gold ${cmp(cfg.assets[2].value)}), expense ${fmt(c.expMo)}/mo in today's ₹, inflation ${(c.inflation * 100).toFixed(1)}% ± 1.5, and pension ${fmt(cfg.pensionMonthlyAtRetire)}/mo. Edit expense, age and inflation in <b>Corpus Builder</b>. Edit holdings in each tracker.</p>
</div>
<div id="rp-odds-out" style="min-height:160px;">${hasMoney ? '<div style="opacity:.5;font-size:13px;padding:20px;">Running 4,000 simulated futures…</div>' : '<div style="opacity:.6;font-size:13px;padding:20px;">Add holdings in your trackers (EPF, NPS, PPF, SIP, FD, Gold) or enter a monthly investment above to run the simulation.</div>'}</div>`;
    if (!hasMoney) return;

    setTimeout(() => {                                   // yield so the shell paints first
      const out = document.getElementById('rp-odds-out');
      if (!out) return;
      let r;
      try { r = window.FinosMC.simulate(cfg); }
      catch (e) { out.innerHTML = `<div style="color:#EF4444;padding:20px;font-size:13px;">${e.message}</div>`; return; }
      const pct = Math.round(r.successRate * 100);
      const col = pct >= 85 ? '#22D3A6' : pct >= 65 ? '#FFB347' : '#EF4444';
      const verdict = pct >= 85 ? 'Strong — your money very likely outlasts you.' : pct >= 65 ? 'Borderline — a bad decade could hurt. Consider saving more or spending less.' : 'At risk — most simulated futures run out of money. Act now: a small change early is cheap.';
      const atRet = r.realBands.find(b => b.age === cfg.retireAge) || r.realBands[r.realBands.length - 1];
      const dep = r.depletion ? `In the runs that fail, money typically runs out around age <b>${Math.round(r.depletion.medianAge)}</b> (worst 10%: ${Math.round(r.depletion.p10Age)}).` : 'No simulated run ran out of money.';
      out.innerHTML = `
<div style="display:flex;gap:22px;flex-wrap:wrap;align-items:center;background:rgba(255,255,255,.03);border:1px solid ${col}55;border-radius:18px;padding:22px;margin-bottom:18px;">
  <div style="text-align:center;min-width:150px;"><div style="font-family:var(--font-mono,monospace);font-size:54px;font-weight:900;color:${col};line-height:1;">${pct}%</div>
    <div style="${lbl}margin-top:6px;">chance money lasts to ${cfg.endAge}</div></div>
  <div style="flex:1;min-width:220px;"><div style="font-size:15px;font-weight:700;margin-bottom:6px;">${verdict}</div>
    <div style="font-size:12.5px;opacity:.65;line-height:1.7;">${dep}<br>At retirement (age ${cfg.retireAge}) your corpus is most likely <b>${cmp(atRet.p50)}</b> in today's ₹ — range ${cmp(atRet.p10)} to ${cmp(atRet.p90)} (10th–90th percentile).</div>
    <button id="rp-solve" style="margin-top:12px;padding:9px 16px;border-radius:10px;border:1px solid ${col}66;background:transparent;color:inherit;font-weight:700;font-size:12.5px;cursor:pointer;">What monthly SIP gets me to 85%?</button>
    <span id="rp-solve-out" style="font-size:13px;margin-left:10px;"></span></div>
</div>
<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:18px;margin-bottom:12px;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px;">
    <p style="${lbl}margin:0;">Corpus by age — median, 25–75% and 10–90% bands</p>
    <div role="group" aria-label="Value basis"><button class="rp-basis" data-k="real" style="${inp}width:auto;padding:5px 10px;font-size:11px;cursor:pointer;">Today's ₹</button>
      <button class="rp-basis" data-k="nominal" style="${inp}width:auto;padding:5px 10px;font-size:11px;cursor:pointer;opacity:.6;">Future ₹</button></div>
  </div>
  <div id="rp-fan">${_fan(r.realBands, cfg.retireAge)}</div>
</div>
<p style="font-size:11px;opacity:.45;line-height:1.7;">${r.runs.toLocaleString('en-IN')} simulated futures. Returns vary yearly (equity ${(cfg.assets[0].mean * 100).toFixed(0)}% ± 18, debt 7.5% ± 3.5, gold 8% ± 14); inflation varies; withdrawals start at ${cfg.retireAge} and the portfolio is rebalanced yearly. This is an illustration, not a prediction or investment advice.</p>`;

      out.querySelectorAll('.rp-basis').forEach(b => b.addEventListener('click', () => {
        out.querySelectorAll('.rp-basis').forEach(x => (x.style.opacity = x === b ? '1' : '.6'));
        document.getElementById('rp-fan').innerHTML = _fan(b.dataset.k === 'real' ? r.realBands : r.bands, cfg.retireAge);
      }));
      document.getElementById('rp-solve').addEventListener('click', () => {
        const o = document.getElementById('rp-solve-out'); o.textContent = 'Solving…';
        setTimeout(() => {
          const sip = window.FinosMC.solveContribution(cfg, 0.85);
          o.innerHTML = sip === null ? 'Not reachable by investing more alone — try a later retirement age or lower expenses.'
            : `<b style="color:#22D3A6;">${fmt(sip)}/month</b> (with your ${gs('finos_retire_stepup') || 0}% yearly step-up)`;
        }, 30);
      });
    }, 30);
  }

  return { renderOverview, renderPlan, renderIncome, renderOdds, _compute, _mcConfig };
})();

/* Inline-handler functions. They used to sit in a <script> inside an innerHTML template, which the browser never executes, so
   the oninput/onclick attributes above threw "is not defined". Top-level here so those attributes can reach them. */
function _rpSave(k,v){localStorage.setItem(k,v);clearTimeout(window._rpT);window._rpT=setTimeout(()=>{
  if(window.FinosRetirementPlanner){
    window.FinosRetirementPlanner.renderOverview(document.getElementById('rp-panel-overview'));
  }
},700);}

function _rpOddsSave(k,v){localStorage.setItem(k,v);clearTimeout(window._rpOT);window._rpOT=setTimeout(function(){window.FinosRetirementPlanner.renderOdds(document.getElementById('rp-panel-odds'));},800);}
