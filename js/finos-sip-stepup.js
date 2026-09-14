/* finos-sip-stepup.js — SIP Step-Up Planner
 *
 * Computes the dramatic impact of increasing your monthly SIP by a fixed %
 * every year (step-up / booster SIP). Core insight for Indian salaried
 * investors: redirect even 50% of your annual increment to SIP step-up.
 *
 * Formula (year-by-year):
 *   Year y: monthly SIP = baseSIP × (1 + stepUpPct/100)^y
 *   Each month: corpus = corpus × (1 + r) + SIP_monthly
 *
 * Compares flat SIP vs step-up SIP to show the "Step-Up Advantage".
 *
 * localStorage written:
 *   finos_sip_stepup_corpus   — final corpus at step-up SIP
 *   finos_sip_flat_corpus     — final corpus at flat SIP (baseline)
 *   finos_sip_stepup_gain     — extra corpus from step-up
 *
 * Public API (window.FinosSIPStepup):
 *   renderCalculator(el)  — inputs + headline result + scenario grid
 *   renderGrowth(el)      — year-by-year growth table + bar comparison
 *   _compute(params)      — raw data (used by both tabs)
 */
window.FinosSIPStepup = (function () {
  'use strict';

  const gs  = k => parseFloat(localStorage.getItem(k)) || 0;
  const ss  = (k, v) => localStorage.setItem(k, String(v));
  const gss = k => localStorage.getItem(k) || '';
  const INR = v => '₹' + Math.abs(Math.round(v)).toLocaleString('en-IN');
  const CR  = v => (v / 1e7).toFixed(2) + ' Cr';
  const L   = v => (v / 1e5).toFixed(1) + ' L';
  const fmt = v => v >= 1e7 ? CR(v) : v >= 1e5 ? L(v) : INR(v);

  /* ── Core computation ──────────────────────────────────────────── */
  function _compute(params) {
    const {
      baseSIP    = 10000,
      stepUpPct  = 10,
      years      = 20,
      returnPct  = 12,
    } = params || {};

    const r = returnPct / 100 / 12; // monthly rate

    let flatCorpus = 0, stepCorpus = 0;
    let flatInvested = 0, stepInvested = 0;
    const yearlyData = [];

    for (let y = 0; y < years; y++) {
      const monthlyFlat = Math.round(baseSIP);
      const monthlyStep = Math.round(baseSIP * Math.pow(1 + stepUpPct / 100, y));

      for (let m = 0; m < 12; m++) {
        flatCorpus  = (flatCorpus  + monthlyFlat) * (1 + r);
        stepCorpus  = (stepCorpus  + monthlyStep) * (1 + r);
        flatInvested += monthlyFlat;
        stepInvested += monthlyStep;
      }

      yearlyData.push({
        year:      y + 1,
        sipFlat:   monthlyFlat,
        sipStep:   monthlyStep,
        flatCorpus: Math.round(flatCorpus),
        stepCorpus: Math.round(stepCorpus),
        flatInvested: Math.round(flatInvested),
        stepInvested: Math.round(stepInvested),
        advantage:   Math.round(stepCorpus - flatCorpus),
      });
    }

    const finalFlat = Math.round(flatCorpus);
    const finalStep = Math.round(stepCorpus);
    const advantage = finalStep - finalFlat;
    const lastRow   = yearlyData[yearlyData.length - 1];
    const totalStepSIP = lastRow.sipStep;

    // Persist for Retirement Planner
    ss('finos_sip_stepup_corpus', finalStep);
    ss('finos_sip_flat_corpus',   finalFlat);
    ss('finos_sip_stepup_gain',   advantage);

    return { finalFlat, finalStep, advantage, flatInvested, stepInvested, yearlyData, totalStepSIP };
  }

  /* ── Saved inputs ──────────────────────────────────────────────── */
  function _loadInputs() {
    return {
      baseSIP:   parseInt(gss('finos_ss_base')    || '0') || gs('finos_sip_value') > 0 ? 10000 : 10000,
      stepUpPct: parseInt(gss('finos_ss_stepup')  || '10'),
      years:     parseInt(gss('finos_ss_years')   || '20'),
      returnPct: parseInt(gss('finos_ss_return')  || '12'),
    };
  }

  function _saveInputs(p) {
    localStorage.setItem('finos_ss_base',   String(p.baseSIP));
    localStorage.setItem('finos_ss_stepup', String(p.stepUpPct));
    localStorage.setItem('finos_ss_years',  String(p.years));
    localStorage.setItem('finos_ss_return', String(p.returnPct));
  }

  /* ── Input row helper ──────────────────────────────────────────── */
  function _inp(id, label, val, min, max, step, unit, hint) {
    return `<div style="margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <label style="font-size:13px;font-weight:700;color:var(--text-secondary);">${label}</label>
        <div style="display:flex;align-items:center;gap:6px;">
          <input type="number" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}"
            style="width:90px;background:var(--border-soft);border:1px solid var(--border-medium);border-radius:8px;color:var(--text-primary);font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:14px;font-weight:800;padding:6px 10px;text-align:right;outline:none;"
            oninput="_ssRecalc()">
          <span style="font-size:12px;color:var(--text-muted);">${unit}</span>
        </div>
      </div>
      ${hint ? `<div style="font-size:11px;color:var(--text-muted);">${hint}</div>` : ''}
    </div>`;
  }

  /* ══════════════════════════════════════════════════════════════
     CALCULATOR TAB
  ══════════════════════════════════════════════════════════════ */
  function renderCalculator(container) {
    if (!container) return;
    const p = _loadInputs();
    const c = _compute(p);

    const scenarios = [5, 10, 15, 20].map(pct => {
      const sc = _compute({ ...p, stepUpPct: pct });
      const isSelected = pct === p.stepUpPct;
      return `<div style="padding:14px;background:${isSelected ? 'rgba(34,211,166,.08)' : 'var(--border-soft)'};border:1px solid ${isSelected ? 'rgba(34,211,166,.25)' : 'var(--border-soft)'};border-radius:12px;text-align:center;">
        <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:20px;font-weight:900;color:${isSelected ? '#22D3A6' : 'var(--text-primary)'};">+${pct}%</div>
        <div style="font-size:11px;color:var(--text-muted);margin:3px 0 8px;">annual step-up</div>
        <div style="font-size:13px;font-weight:800;color:${isSelected ? '#22D3A6' : 'var(--text-primary)'};">${fmt(sc.finalStep)}</div>
        <div style="font-size:10px;color:var(--text-muted);">vs ${fmt(sc.finalFlat)} flat</div>
        <div style="margin-top:6px;font-size:11px;font-weight:700;color:#4F7CFF;">+${fmt(sc.advantage)} extra</div>
      </div>`;
    }).join('');

    const advPct = c.finalFlat > 0 ? Math.round((c.advantage / c.finalFlat) * 100) : 0;

    container.innerHTML = `
<style>
.ss-hero{background:linear-gradient(135deg,rgba(34,211,166,.08),rgba(79,124,255,.05));border:1px solid rgba(34,211,166,.2);border-radius:22px;padding:28px;margin-bottom:22px;}
.ss-inp-box{background:var(--border-soft);border:1px solid var(--border-soft);border-radius:16px;padding:22px;margin-bottom:20px;}
</style>

<div class="ss-inp-box">
  <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:16px;">SIP Parameters</div>
  ${_inp('ss-base',   'Monthly SIP (Base)',     p.baseSIP,   500,  200000, 500,  '₹/mo', 'Starting SIP amount — increases by step-up % each year')}
  ${_inp('ss-stepup', 'Annual Step-Up Rate',    p.stepUpPct, 0,    50,    1,    '%',    'Typical annual salary increment: 8-15% — redirect 50-100% to SIP')}
  ${_inp('ss-years',  'Investment Horizon',     p.years,     1,    40,    1,    'yr',   '')}
  ${_inp('ss-return', 'Expected Annual Return', p.returnPct, 6,    18,    0.5,  '% p.a.',  'Equity MF long-term CAGR: 10-14% · Nifty 50 historical: ~12%')}
</div>

<div class="ss-hero" id="ss-result">
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:18px;">
    <div>
      <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px;">Step-Up Corpus</div>
      <div id="ss-r-step" style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:32px;font-weight:900;color:#22D3A6;">${fmt(c.finalStep)}</div>
      <div id="ss-r-step-sip" style="font-size:11px;color:var(--text-muted);margin-top:4px;">Final SIP: ${INR(c.totalStepSIP)}/mo</div>
    </div>
    <div>
      <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px;">Flat SIP Corpus</div>
      <div id="ss-r-flat" style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:32px;font-weight:900;color:var(--text-secondary);">${fmt(c.finalFlat)}</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Same ${INR(p.baseSIP)}/mo throughout</div>
    </div>
    <div>
      <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px;">Step-Up Advantage</div>
      <div id="ss-r-adv" style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:32px;font-weight:900;color:#4F7CFF;">+${fmt(c.advantage)}</div>
      <div id="ss-r-advpct" style="font-size:11px;color:var(--text-muted);margin-top:4px;">${advPct}% more wealth</div>
    </div>
    <div>
      <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px;">Extra Invested</div>
      <div id="ss-r-extrainv" style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:32px;font-weight:900;color:#FFB347;">+${fmt(c.stepInvested - c.flatInvested)}</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">extra principal invested</div>
    </div>
  </div>
</div>

<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:12px;">Scenario Comparison (${p.years}-year horizon)</div>
<div id="ss-scenarios" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:22px;">${scenarios}</div>

<div style="background:rgba(34,211,166,.05);border:1px solid rgba(34,211,166,.12);border-radius:14px;padding:16px;">
  <div style="font-size:13px;font-weight:800;color:#22D3A6;margin-bottom:10px;">💡 The Increment Redirect Rule</div>
  <div style="font-size:12px;color:var(--text-secondary);line-height:1.75;display:flex;flex-direction:column;gap:5px;">
    <span>📈 Every April (salary revision month), increase your SIP by at least 10%</span>
    <span>📈 A ${INR(p.baseSIP)}/mo SIP at +${p.stepUpPct}% step-up reaches ${INR(c.totalStepSIP)}/mo by year ${p.years} — natural, gradual</span>
    <span>📈 The extra ${fmt(c.advantage)} in wealth costs only ${fmt(c.stepInvested - c.flatInvested)} extra invested — compounding does the rest</span>
    <span>📈 Use SIP mandate with step-up instruction on your MF platform (Groww, Zerodha Coin, MFCentral)</span>
    <span>📈 Even 5% step-up (half the inflation rate) delivers ${fmt(_compute({...p, stepUpPct:5}).advantage)} extra vs flat SIP</span>
  </div>
</div>

<script>
(function(){
  window._ssRecalc = function() {
    const base   = parseInt(document.getElementById('ss-base')?.value)   || 10000;
    const stepup = parseInt(document.getElementById('ss-stepup')?.value) || 10;
    const yrs    = parseInt(document.getElementById('ss-years')?.value)  || 20;
    const ret    = parseFloat(document.getElementById('ss-return')?.value) || 12;
    const p = { baseSIP: base, stepUpPct: stepup, years: yrs, returnPct: ret };
    if (window.FinosSIPStepup) {
      const c = window.FinosSIPStepup._compute(p);
      const fmt = v => v >= 1e7 ? (v/1e7).toFixed(2)+' Cr' : v >= 1e5 ? (v/1e5).toFixed(1)+' L' : '₹'+Math.round(v).toLocaleString('en-IN');
      const INR = v => '₹'+Math.abs(Math.round(v)).toLocaleString('en-IN');
      const advPct = c.finalFlat > 0 ? Math.round((c.advantage / c.finalFlat)*100) : 0;
      const upd = (id, v) => { const el = document.getElementById(id); if(el) el.textContent=v; };
      upd('ss-r-step',     fmt(c.finalStep));
      upd('ss-r-step-sip', 'Final SIP: ' + INR(c.totalStepSIP) + '/mo');
      upd('ss-r-flat',     fmt(c.finalFlat));
      upd('ss-r-adv',      '+' + fmt(c.advantage));
      upd('ss-r-advpct',   advPct + '% more wealth');
      upd('ss-r-extrainv', '+' + fmt(c.stepInvested - c.flatInvested));
      localStorage.setItem('finos_ss_base',   String(base));
      localStorage.setItem('finos_ss_stepup', String(stepup));
      localStorage.setItem('finos_ss_years',  String(yrs));
      localStorage.setItem('finos_ss_return', String(ret));
    }
  };
})();
<\/script>`;
  }

  /* ══════════════════════════════════════════════════════════════
     GROWTH TABLE TAB
  ══════════════════════════════════════════════════════════════ */
  function renderGrowth(container) {
    if (!container) return;
    const p = _loadInputs();
    const c = _compute(p);
    const maxCorpus = c.yearlyData[c.yearlyData.length - 1].stepCorpus;

    const rows = c.yearlyData.map(d => {
      const barW = Math.round((d.stepCorpus / maxCorpus) * 100);
      const flatW= Math.round((d.flatCorpus / maxCorpus) * 100);
      const milestone = d.stepCorpus >= 1e7 && c.yearlyData[d.year-2]?.stepCorpus < 1e7 ? '🎯 1 Cr!'
        : d.stepCorpus >= 5e6 && c.yearlyData[d.year-2]?.stepCorpus < 5e6 ? '✨ 50L!'
        : d.stepCorpus >= 2.5e6 && c.yearlyData[d.year-2]?.stepCorpus < 2.5e6 ? '🌱 25L!'
        : '';
      return `<tr style="border-bottom:1px solid var(--border-soft);">
        <td style="padding:8px 10px;font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:12px;color:var(--text-muted);white-space:nowrap;">Yr ${d.year} ${milestone}</td>
        <td style="padding:8px 10px;font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:12px;color:#22D3A6;">${INR(d.sipStep)}</td>
        <td style="padding:8px 10px;font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:12px;color:var(--text-primary);">${fmt(d.stepCorpus)}</td>
        <td style="padding:8px 10px;font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:12px;color:var(--text-muted);">${fmt(d.flatCorpus)}</td>
        <td style="padding:8px 10px;font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:12px;color:#4F7CFF;">+${fmt(d.advantage)}</td>
        <td style="padding:8px 10px;min-width:120px;">
          <div style="position:relative;height:12px;background:var(--border-soft);border-radius:3px;overflow:hidden;">
            <div style="position:absolute;left:0;top:0;height:100%;width:${flatW}%;background:var(--border-medium);border-radius:3px;"></div>
            <div style="position:absolute;left:0;top:0;height:100%;width:${barW}%;background:#22D3A6;border-radius:3px;opacity:.75;"></div>
          </div>
        </td>
      </tr>`;
    }).join('');

    container.innerHTML = `
<div style="overflow-x:auto;border-radius:14px;border:1px solid var(--border-soft);background:var(--border-soft);">
<table style="width:100%;border-collapse:collapse;">
  <thead>
    <tr style="background:var(--border-soft);">
      <th style="padding:10px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">Year</th>
      <th style="padding:10px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#22D3A6;">Monthly SIP</th>
      <th style="padding:10px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#22D3A6;">Step-Up Corpus</th>
      <th style="padding:10px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">Flat Corpus</th>
      <th style="padding:10px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#4F7CFF;">Advantage</th>
      <th style="padding:10px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">Progress</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
</div>
<div style="margin-top:12px;font-size:11px;color:var(--text-muted);text-align:right;">Green bar = step-up corpus · Grey bar = flat SIP corpus · Milestones marked 🎯</div>`;
  }

  return { renderCalculator, renderGrowth, _compute };
})();
