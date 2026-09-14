/* finos-passive-income.js — Dividend & Passive Income Tracker
 *
 * Tracks all income that arrives without active work:
 *   • Stock dividends
 *   • Mutual Fund SWP (Systematic Withdrawal Plan)
 *   • FD / Debt interest income
 *   • Rental income from property
 *   • Custom / other streams
 *
 * Computes:
 *   • Total monthly passive income
 *   • Passive income coverage ratio (passive ÷ monthly expense)
 *   • Financial freedom distance (months of expense covered; FIRE proximity)
 *   • Passive income CAGR vs inflation
 *
 * localStorage written:
 *   finos_passive_total_mo      — total monthly passive income
 *   finos_passive_coverage      — % of monthly expenses covered passively
 *   finos_passive_streams       — JSON array of income streams
 *
 * Public API (window.FinosPassiveIncome):
 *   renderOverview(el)   — hero + coverage ring + source list
 *   renderStreams(el)     — add/edit/delete income streams
 *   renderFreedom(el)    — financial freedom progress + FIRE proximity
 */
window.FinosPassiveIncome = (function () {
  'use strict';

  const gs  = k => parseFloat(localStorage.getItem(k)) || 0;
  const ss  = (k, v) => localStorage.setItem(k, String(v));
  const gss = k => localStorage.getItem(k) || '';
  const INR = v => '₹' + Math.abs(Math.round(v)).toLocaleString('en-IN');

  const STREAM_KEY = 'finos_passive_streams';

  const DEFAULT_STREAMS = [
    { id: 's1', type: 'dividend',  label: 'Equity Dividends',     monthly: 0, taxable: true,  note: '' },
    { id: 's2', type: 'fd',        label: 'FD / Debt Interest',   monthly: 0, taxable: true,  note: '' },
    { id: 's3', type: 'rental',    label: 'Rental Income',        monthly: 0, taxable: true,  note: '' },
    { id: 's4', type: 'swp',       label: 'SWP from MF',          monthly: 0, taxable: false, note: '' },
    { id: 's5', type: 'sgb',       label: 'SGB Coupon (2.5%)',    monthly: 0, taxable: true,  note: '' },
    { id: 's6', type: 'other',     label: 'Other Passive Income', monthly: 0, taxable: false, note: '' },
  ];

  function _loadStreams() {
    try {
      const raw = JSON.parse(gss(STREAM_KEY) || 'null');
      if (Array.isArray(raw) && raw.length) return raw;
    } catch {}
    // Auto-seed from other trackers on first load
    const seeded = JSON.parse(JSON.stringify(DEFAULT_STREAMS));
    // FD interest estimate from fd tracker (simple: 7% annual / 12)
    const fdVal = gs('finos_fd_value');
    if (fdVal > 0) seeded[1].monthly = Math.round(fdVal * 0.07 / 12);
    // SGB coupon estimate from gold tracker
    const sgbVal = gs('finos_gold_sgb_value');
    if (sgbVal > 0) seeded[4].monthly = Math.round(sgbVal * 0.025 / 12);
    return seeded;
  }

  function _saveStreams(streams) {
    localStorage.setItem(STREAM_KEY, JSON.stringify(streams));
    _recompute(streams);
  }

  function _recompute(streams) {
    streams = streams || _loadStreams();
    const total = streams.reduce((s, x) => s + (Number(x.monthly) || 0), 0);
    const monthlyExp = gs('finos_monthly_expense') || gs('finos_budget_expenses') || 0;
    const coverage = monthlyExp > 0 ? Math.min((total / monthlyExp) * 100, 200) : 0;
    ss('finos_passive_total_mo', total);
    ss('finos_passive_coverage',  coverage.toFixed(1));
    return { total, monthlyExp, coverage, streams };
  }

  /* ── Progress ring ───────────────────────────────────────────────── */
  function _ring(pct, color, size) {
    const r = size === 'lg' ? 70 : 54;
    const cx = r + 14;
    const dim = cx * 2;
    const c = 2 * Math.PI * r;
    const dash = Math.min(pct / 100, 1) * c;
    return `<svg width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}">
      <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="var(--border-soft)" stroke-width="10"/>
      <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${color}" stroke-width="10"
        stroke-dasharray="${dash} ${c}" stroke-dashoffset="${c*0.25}" stroke-linecap="round"
        style="transition:stroke-dasharray 1s ease;"/>
    </svg>`;
  }

  const TYPE_META = {
    dividend: { icon:'📊', color:'#22D3A6', label:'Dividends' },
    fd:       { icon:'🏦', color:'#00D4FF', label:'FD/Debt' },
    rental:   { icon:'🏠', color:'#FFB347', label:'Rental' },
    swp:      { icon:'📈', color:'#9B5DE5', label:'SWP' },
    sgb:      { icon:'🥇', color:'#F59E0B', label:'SGB' },
    other:    { icon:'💡', color:'#4F7CFF', label:'Other' },
  };

  /* ══════════════════════════════════════════════════════════════
     OVERVIEW
  ══════════════════════════════════════════════════════════════ */
  function renderOverview(container) {
    if (!container) return;
    const { total, monthlyExp, coverage, streams } = _recompute();
    const activeStreams = streams.filter(s => (Number(s.monthly) || 0) > 0);
    const mainColor = coverage >= 100 ? '#22D3A6' : coverage >= 50 ? '#FFB347' : '#00D4FF';
    const freedomLabel = coverage >= 100 ? 'Financially Free 🎉' : coverage >= 75 ? 'Almost There' : coverage >= 50 ? 'Half Way' : coverage >= 25 ? 'Building Up' : 'Just Started';

    const taxable   = streams.filter(s => s.taxable).reduce((a, s) => a + (Number(s.monthly) || 0), 0);
    const taxFree   = total - taxable;
    const annualTaxable = taxable * 12;

    const byType = {};
    streams.forEach(s => {
      if (!byType[s.type]) byType[s.type] = 0;
      byType[s.type] += Number(s.monthly) || 0;
    });
    const typeRows = Object.entries(byType).filter(([,v]) => v > 0).map(([t, v]) => {
      const m = TYPE_META[t] || { icon:'💡', color:'#888', label: t };
      const pct = total > 0 ? (v / total * 100).toFixed(0) : 0;
      return `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--border-soft);border:1px solid var(--border-soft);border-radius:10px;margin-bottom:6px;">
        <span style="font-size:18px;">${m.icon}</span>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:700;color:var(--text-primary);">${m.label}</div>
          <div style="font-size:11px;color:var(--text-muted);">${pct}% of passive income</div>
        </div>
        <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:14px;font-weight:800;color:${m.color};">${INR(v)}/mo</div>
      </div>`;
    }).join('');

    const annualIncome = gs('finos_monthly_income') * 12 || gs('finos_salary_ctc') || 0;
    const passiveRatio = annualIncome > 0 ? ((total * 12) / annualIncome * 100).toFixed(0) : 0;

    container.innerHTML = `
<style>
.pi-hero{background:linear-gradient(135deg,rgba(34,211,166,.07),rgba(0,212,255,.04));border:1px solid rgba(34,211,166,.18);border-radius:22px;padding:28px;margin-bottom:22px;display:flex;gap:28px;flex-wrap:wrap;align-items:center;}
.pi-ring-wrap{position:relative;width:168px;height:168px;flex-shrink:0;}
.pi-ring-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;}
.pi-ring-pct{font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:26px;font-weight:900;}
.pi-ring-lbl{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-top:2px;}
.pi-body{flex:1;min-width:200px;}
.pi-kpi-row{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;margin-bottom:22px;}
.pi-kpi{background:var(--border-soft);border:1px solid var(--border-soft);border-radius:14px;padding:14px;text-align:center;}
.pi-kpi-lbl{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin-bottom:6px;}
.pi-kpi-val{font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:18px;font-weight:800;}
.pi-kpi-sub{font-size:11px;color:var(--text-muted);margin-top:3px;}
.pi-src-box{background:var(--border-soft);border:1px solid var(--border-soft);border-radius:16px;padding:20px;}
.pi-sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin:0 0 14px;}
</style>

<div class="pi-hero">
  <div class="pi-ring-wrap">
    ${_ring(Math.min(coverage, 100), mainColor, 'lg')}
    <div class="pi-ring-center">
      <div class="pi-ring-pct" style="color:${mainColor};">${Math.round(Math.min(coverage, 100))}%</div>
      <div class="pi-ring-lbl">covered</div>
    </div>
  </div>
  <div class="pi-body">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin-bottom:6px;">Total Passive Income</div>
    <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:38px;font-weight:900;letter-spacing:-1px;color:${mainColor};">${INR(total)}<span style="font-size:16px;font-weight:600;color:var(--text-muted);">/mo</span></div>
    <div style="font-size:13px;color:var(--text-muted);margin-top:8px;line-height:1.6;">
      ${monthlyExp > 0 ? `Covers <strong style="color:${mainColor};">${Math.round(coverage)}%</strong> of ₹${Math.round(monthlyExp/1000)}K monthly expenses` : 'Set monthly expenses for coverage calculation'}
      <br><strong style="color:${mainColor};">${freedomLabel}</strong>
    </div>
    ${passiveRatio > 0 ? `<div style="margin-top:10px;font-size:12px;color:var(--text-muted);">${passiveRatio}% of earned income · ₹${Math.round(total*12/1000)}K annually</div>` : ''}
  </div>
</div>

<div class="pi-kpi-row">
  <div class="pi-kpi" style="border-color:rgba(34,211,166,.2);">
    <div class="pi-kpi-lbl">Monthly Passive</div>
    <div class="pi-kpi-val" style="color:#22D3A6;">${INR(total)}</div>
    <div class="pi-kpi-sub">${activeStreams.length} active stream${activeStreams.length !== 1 ? 's' : ''}</div>
  </div>
  <div class="pi-kpi" style="border-color:rgba(0,212,255,.2);">
    <div class="pi-kpi-lbl">Annual Passive</div>
    <div class="pi-kpi-val" style="color:#00D4FF;">${INR(total * 12)}</div>
    <div class="pi-kpi-sub">before tax</div>
  </div>
  <div class="pi-kpi" style="border-color:rgba(255,179,71,.2);">
    <div class="pi-kpi-lbl">Taxable / Tax-Free</div>
    <div class="pi-kpi-val" style="color:#FFB347;">${INR(taxFree)}<span style="font-size:11px;color:var(--text-muted);font-weight:400;">/mo</span></div>
    <div class="pi-kpi-sub">tax-free · ${INR(taxable)}/mo taxable</div>
  </div>
  ${monthlyExp > 0 ? `<div class="pi-kpi" style="border-color:rgba(79,124,255,.2);">
    <div class="pi-kpi-lbl">Expense Gap</div>
    <div class="pi-kpi-val" style="color:${total >= monthlyExp ? '#22D3A6' : '#EF4444'};">${total >= monthlyExp ? '+' : '-'}${INR(Math.abs(total - monthlyExp))}</div>
    <div class="pi-kpi-sub">${total >= monthlyExp ? 'surplus monthly' : 'still needed'}</div>
  </div>` : ''}
</div>

<div class="pi-src-box">
  <p class="pi-sec">Income Sources</p>
  ${typeRows || '<div style="color:var(--text-muted);font-size:13px;padding:8px 0;">Add income streams in the Streams tab to see the breakdown.</div>'}
</div>

<div style="margin-top:18px;background:rgba(255,179,71,.05);border:1px solid rgba(255,179,71,.12);border-radius:14px;padding:16px;">
  <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,179,71,.8);margin-bottom:10px;">Tax on Passive Income</div>
  <div style="font-size:12px;color:var(--text-secondary);line-height:1.7;display:flex;flex-direction:column;gap:5px;">
    <span>🔵 <strong>Dividends</strong>: taxed at slab rate (added to income) since 2020 — no DDT</span>
    <span>🔵 <strong>FD Interest</strong>: added to income, taxed at slab rate; TDS 10% if interest > ₹40K/yr (₹50K for senior citizens)</span>
    <span>🟢 <strong>SGB Coupon (2.5%)</strong>: taxed at slab; but capital gains at maturity are tax-exempt</span>
    <span>🟢 <strong>LTCG on equity SWP</strong>: ₹1.25L/yr exempt; above that 12.5% LTCG (FY 2024-25 onwards)</span>
    <span>🔵 <strong>Rental income</strong>: 30% standard deduction on net rent, then taxed at slab</span>
  </div>
</div>`;
  }

  /* ══════════════════════════════════════════════════════════════
     STREAMS TAB
  ══════════════════════════════════════════════════════════════ */
  function renderStreams(container) {
    if (!container) return;
    const streams = _loadStreams();

    function _rowHtml(s, i) {
      const m = TYPE_META[s.type] || { icon:'💡', color:'#888', label: s.type };
      return `<div id="pi-row-${s.id}" style="padding:14px 16px;background:var(--border-soft);border:1px solid var(--border-soft);border-radius:12px;margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <span style="font-size:18px;">${m.icon}</span>
          <input style="flex:1;background:transparent;border:none;color:var(--text-primary);font-size:14px;font-weight:700;outline:none;font-family:inherit;"
            value="${s.label}" onchange="_piUpdateLabel('${s.id}', this.value)" placeholder="Stream label">
          <select style="background:var(--border-soft);border:1px solid var(--border-medium);border-radius:8px;color:var(--text-primary);font-size:12px;padding:4px 8px;outline:none;"
            onchange="_piUpdateType('${s.id}', this.value)">
            ${Object.entries(TYPE_META).map(([k, v]) => `<option value="${k}" ${k === s.type ? 'selected' : ''}>${v.label}</option>`).join('')}
          </select>
          <button onclick="_piDeleteStream('${s.id}')" style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);color:#EF4444;border-radius:8px;padding:4px 10px;font-size:12px;cursor:pointer;">✕</button>
        </div>
        <div style="display:flex;gap:10px;align-items:center;">
          <div style="flex:1;display:flex;flex-direction:column;gap:4px;">
            <label style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);">Monthly Amount (₹)</label>
            <input type="number" min="0" step="500" value="${s.monthly || ''}" placeholder="0"
              style="background:var(--border-soft);border:1px solid var(--border-medium);border-radius:8px;color:var(--text-primary);font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:14px;padding:8px 12px;width:100%;box-sizing:border-box;outline:none;"
              onchange="_piUpdateAmount('${s.id}', this.value)">
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;min-width:110px;">
            <label style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);">Taxable?</label>
            <select style="background:var(--border-soft);border:1px solid var(--border-medium);border-radius:8px;color:var(--text-primary);font-size:13px;padding:9px 10px;outline:none;"
              onchange="_piUpdateTax('${s.id}', this.value === 'true')">
              <option value="true"  ${s.taxable ? 'selected' : ''}>Yes</option>
              <option value="false" ${!s.taxable ? 'selected' : ''}>No</option>
            </select>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;flex:1;">
            <label style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);">Note</label>
            <input style="background:var(--border-soft);border:1px solid var(--border-medium);border-radius:8px;color:var(--text-primary);font-size:12px;padding:8px 12px;width:100%;box-sizing:border-box;outline:none;font-family:inherit;"
              value="${s.note || ''}" placeholder="e.g. HDFC Bank div" onchange="_piUpdateNote('${s.id}', this.value)">
          </div>
        </div>
      </div>`;
    }

    container.innerHTML = `
<div style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;">
  <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">Income Streams</div>
  <button onclick="_piAddStream()" style="background:rgba(34,211,166,.1);border:1px solid rgba(34,211,166,.25);color:#22D3A6;border-radius:10px;padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">+ Add Stream</button>
</div>
<div id="pi-streams-list">
  ${streams.map((s, i) => _rowHtml(s, i)).join('')}
</div>

<script>
(function(){
  function _loadS(){ try { return JSON.parse(localStorage.getItem('${STREAM_KEY}') || 'null') || ${JSON.stringify(streams)}; } catch { return []; } }
  function _saveS(arr){ localStorage.setItem('${STREAM_KEY}', JSON.stringify(arr)); if(window.FinosPassiveIncome) { window.FinosPassiveIncome.renderOverview(document.getElementById('pi-panel-overview')); } }
  function _find(id, arr){ return arr.findIndex(x => x.id === id); }
  window._piUpdateLabel  = function(id, v){ const a = _loadS(); const i = _find(id, a); if(i >= 0){ a[i].label = v; _saveS(a); } };
  window._piUpdateType   = function(id, v){ const a = _loadS(); const i = _find(id, a); if(i >= 0){ a[i].type  = v; _saveS(a); } };
  window._piUpdateAmount = function(id, v){ const a = _loadS(); const i = _find(id, a); if(i >= 0){ a[i].monthly = parseFloat(v)||0; _saveS(a); } };
  window._piUpdateTax    = function(id, v){ const a = _loadS(); const i = _find(id, a); if(i >= 0){ a[i].taxable = v; _saveS(a); } };
  window._piUpdateNote   = function(id, v){ const a = _loadS(); const i = _find(id, a); if(i >= 0){ a[i].note  = v; _saveS(a); } };
  window._piDeleteStream = function(id){
    const a = _loadS(); const updated = a.filter(x => x.id !== id);
    _saveS(updated);
    const el = document.getElementById('pi-row-' + id); if(el) el.remove();
  };
  window._piAddStream = function(){
    const a = _loadS();
    const id = 'pi_' + Date.now();
    a.push({ id, type:'other', label:'New Stream', monthly:0, taxable:true, note:'' });
    _saveS(a);
    const list = document.getElementById('pi-streams-list');
    if(list){ const div = document.createElement('div'); div.id = 'pi-row-'+id;
      div.innerHTML = '<div style="padding:12px 14px;background:var(--border-soft);border:1px solid var(--border-soft);border-radius:12px;">New stream added — please refresh the page to edit it.</div>';
      list.appendChild(div);
    }
  };
})();
<\/script>`;
  }

  /* ══════════════════════════════════════════════════════════════
     FREEDOM TAB
  ══════════════════════════════════════════════════════════════ */
  function renderFreedom(container) {
    if (!container) return;
    const { total, monthlyExp, coverage } = _recompute();
    const deficit   = Math.max(0, monthlyExp - total);
    const surplus   = Math.max(0, total - monthlyExp);
    const netWorth  = gs('finos_net_worth') || gs('finos_portfolio_value') + gs('finos_sip_value');
    const firePct   = gs('finos_fire_percent');
    const inflation = 6;

    // How much additional corpus needed to generate the deficit passively at 4% SWR
    const additionalCorpusNeeded = deficit > 0 ? Math.round(deficit * 12 / 0.04) : 0;

    // Milestone targets
    const milestones = [
      { pct: 25,  label: '25% Freedom',   desc: 'Side income covers dining, travel, subscriptions' },
      { pct: 50,  label: '50% Lean-FIRE', desc: 'Half expenses passive — option to go part-time' },
      { pct: 75,  label: '75% Coast',     desc: 'Only essential spending needs active income' },
      { pct: 100, label: '100% Free!',    desc: 'Full financial independence — active income optional' },
    ];

    const milestonesHtml = milestones.map(m => {
      const reached = coverage >= m.pct;
      return `<div style="padding:14px 16px;background:${reached ? 'rgba(34,211,166,.05)' : 'var(--border-soft)'};border:1px solid ${reached ? 'rgba(34,211,166,.2)' : 'var(--border-soft)'};border-radius:12px;margin-bottom:8px;display:flex;gap:12px;align-items:center;">
        <div style="font-size:20px;">${reached ? '✅' : '⬜'}</div>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:700;color:${reached ? '#22D3A6' : 'var(--text-primary)'};">${m.label}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${m.desc}</div>
        </div>
        <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:12px;font-weight:700;color:${reached ? '#22D3A6' : 'var(--text-muted)'};">${m.pct}%</div>
      </div>`;
    }).join('');

    // Scenarios to close the gap
    const scenarios = [500, 1000, 2000, 5000, 10000].map(extra => {
      const newTotal = total + extra;
      const newCov   = monthlyExp > 0 ? (newTotal / monthlyExp * 100) : 0;
      return `<div style="display:flex;align-items:center;gap:10px;padding:9px 14px;background:var(--border-soft);border:1px solid var(--border-soft);border-radius:8px;margin-bottom:6px;">
        <div style="font-size:12px;color:var(--text-muted);min-width:100px;">+${INR(extra)}/mo</div>
        <div style="flex:1;height:5px;background:var(--border-soft);border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${Math.min(newCov,100).toFixed(0)}%;background:linear-gradient(90deg,#00D4FF,#22D3A6);border-radius:3px;"></div>
        </div>
        <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:12px;font-weight:700;color:#22D3A6;min-width:50px;text-align:right;">${Math.round(newCov)}%</div>
      </div>`;
    }).join('');

    container.innerHTML = `
<div style="background:rgba(34,211,166,.07);border:1px solid rgba(34,211,166,.2);border-radius:20px;padding:24px;margin-bottom:22px;">
  <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:14px;">Financial Freedom Status</div>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px;">
    <div>
      <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px;">Coverage</div>
      <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:32px;font-weight:900;color:#22D3A6;">${Math.round(coverage)}%</div>
    </div>
    <div>
      <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px;">Monthly Gap</div>
      <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:32px;font-weight:900;color:${deficit > 0 ? '#EF4444' : '#22D3A6'};">${deficit > 0 ? '-' + INR(deficit) : '+' + INR(surplus)}</div>
    </div>
    ${additionalCorpusNeeded > 0 ? `<div>
      <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px;">Corpus to Close Gap</div>
      <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:22px;font-weight:900;color:#FFB347;">${INR(additionalCorpusNeeded)}</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:3px;">at 4% SWR</div>
    </div>` : ''}
    ${firePct > 0 ? `<div>
      <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px;">FIRE Progress</div>
      <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:32px;font-weight:900;color:#c7f000;">${firePct.toFixed(1)}%</div>
    </div>` : ''}
  </div>
</div>

<div style="background:var(--border-soft);border:1px solid var(--border-soft);border-radius:16px;padding:20px;margin-bottom:20px;">
  <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:14px;">Milestones</div>
  ${milestonesHtml}
</div>

${deficit > 0 ? `<div style="background:var(--border-soft);border:1px solid var(--border-soft);border-radius:16px;padding:20px;margin-bottom:20px;">
  <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:14px;">If You Added More Passive Income…</div>
  ${scenarios}
</div>` : ''}

<div style="background:rgba(34,211,166,.05);border:1px solid rgba(34,211,166,.12);border-radius:14px;padding:18px;">
  <div style="font-size:13px;font-weight:800;color:#22D3A6;margin-bottom:12px;">How to Grow Passive Income</div>
  <div style="display:flex;flex-direction:column;gap:7px;font-size:13px;color:var(--text-secondary);line-height:1.7;">
    <span>💡 <strong>Dividend stocks</strong>: focus on PSU companies (Coal India, IOCL) — 5-8% dividend yield + growth</span>
    <span>💡 <strong>SGB (Sovereign Gold Bond)</strong>: 2.5% guaranteed coupon + gold price appreciation; capital gain tax-free on maturity</span>
    <span>💡 <strong>SWP from equity MF</strong>: set up monthly SWP from growth MF — 1.25L LTCG exempt; tax-efficient income</span>
    <span>💡 <strong>REITs</strong>: Embassy, Mindspace — 7-8% dividend yield from commercial real estate; liquid on NSE</span>
    <span>💡 <strong>Debt MF SWP</strong>: ultra-short or low-duration fund + SWP beats FD post-tax for 30% bracket</span>
    <span>🔑 Rule of thumb: to generate ₹1L/mo passively, you need ~₹3 Cr corpus at 4% SWR</span>
  </div>
</div>`;
  }

  /* Public */
  return { renderOverview, renderStreams, renderFreedom, _recompute };
})();
