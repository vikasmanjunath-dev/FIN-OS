/* finos-rebalancer.js — Portfolio Rebalancing Engine
 *
 * Reads current allocation from all FIN-OS trackers and compares
 * against the user's target allocation. Computes:
 *   • Current allocation % per asset class
 *   • Deviation from target (drift)
 *   • Exact rupee action to rebalance each class (buy / sell / hold)
 *   • Drift alert threshold: rebalance triggered when any class drifts >5%
 *
 * Asset classes tracked:
 *   Equity (stocks + equity MF), Debt (FD + debt MF), Gold,
 *   Real Estate, Crypto, Government (EPF + NPS + PPF)
 *
 * localStorage:
 *   finos_target_alloc      — JSON { equity, debt, gold, realestate, crypto, govt }
 *   finos_rebalance_needed  — '1' if any class drifts > threshold
 *
 * Public API (window.FinosRebalancer):
 *   renderOverview(el)   — current vs target doughnut-style + actions
 *   renderSetup(el)      — target allocation sliders + save
 *   renderActions(el)    — buy/sell action plan
 *   _compute()           — raw data
 */
window.FinosRebalancer = (function () {
  'use strict';

  const gs  = k => parseFloat(localStorage.getItem(k)) || 0;
  const ss  = (k, v) => localStorage.setItem(k, String(v));
  const gss = k => localStorage.getItem(k) || '';
  const INR = v => '₹' + Math.abs(Math.round(v)).toLocaleString('en-IN');

  const DRIFT_THRESHOLD = 5; // % — rebalance if any class drifts beyond this

  const CLASS_META = {
    equity:     { label: 'Equity',       icon: '📈', color: '#4F7CFF', desc: 'Stocks + Equity MF' },
    debt:       { label: 'Debt',         icon: '🏦', color: '#00D4FF', desc: 'FD + Debt MF + Bonds' },
    gold:       { label: 'Gold',         icon: '🥇', color: '#FFB347', desc: 'Physical + SGB + ETF' },
    realestate: { label: 'Real Estate',  icon: '🏠', color: '#34D399', desc: 'Property value' },
    crypto:     { label: 'Crypto',       icon: '🪙', color: '#9B5DE5', desc: 'Bitcoin + altcoins' },
    govt:       { label: 'Govt Savings', icon: '🏛️', color: '#22D3A6', desc: 'EPF + NPS + PPF' },
  };

  const DEFAULT_TARGET = { equity: 50, debt: 20, gold: 10, realestate: 10, crypto: 5, govt: 5 };

  function _loadTarget() {
    try {
      const raw = JSON.parse(gss('finos_target_alloc') || 'null');
      if (raw && typeof raw === 'object') return raw;
    } catch {}
    return { ...DEFAULT_TARGET };
  }

  function _saveTarget(t) {
    localStorage.setItem('finos_target_alloc', JSON.stringify(t));
  }

  function _compute() {
    // Current values from all trackers
    const equity     = gs('finos_portfolio_value') + gs('finos_sip_value');
    const debt       = gs('finos_fd_value');
    const gold       = gs('finos_gold_value');
    const realestate = gs('finos_property_value');
    const crypto     = gs('finos_crypto_value');
    const govt       = gs('finos_epf_value') + gs('finos_nps_value') + gs('finos_ppf_value');

    const currentValues = { equity, debt, gold, realestate, crypto, govt };
    const totalPortfolio = Object.values(currentValues).reduce((s, v) => s + v, 0);

    // Current allocation %
    const currentAlloc = {};
    for (const [k, v] of Object.entries(currentValues)) {
      currentAlloc[k] = totalPortfolio > 0 ? (v / totalPortfolio) * 100 : 0;
    }

    const target = _loadTarget();
    // Normalise target to sum to 100
    const targetSum = Object.values(target).reduce((s, v) => s + v, 0);
    const normTarget = {};
    for (const [k, v] of Object.entries(target)) {
      normTarget[k] = targetSum > 0 ? (v / targetSum) * 100 : DEFAULT_TARGET[k];
    }

    // Drift and action for each class
    const classes = {};
    let rebalanceNeeded = false;
    for (const k of Object.keys(CLASS_META)) {
      const curr = currentAlloc[k] || 0;
      const tgt  = normTarget[k]   || 0;
      const drift = curr - tgt;
      const driftAbs = Math.abs(drift);
      const targetValue = (tgt / 100) * totalPortfolio;
      const action = Math.abs(drift) < 0.5 ? 'hold'
        : drift > 0 ? 'sell'   // overweight → trim
        : 'buy';               // underweight → add
      const actionAmount = Math.abs(targetValue - currentValues[k]);
      if (driftAbs > DRIFT_THRESHOLD) rebalanceNeeded = true;

      classes[k] = {
        currentValue: currentValues[k], currentPct: curr,
        targetPct: tgt, targetValue,
        drift, driftAbs, action, actionAmount,
      };
    }

    ss('finos_rebalance_needed', rebalanceNeeded ? '1' : '0');

    return { totalPortfolio, currentValues, currentAlloc, target: normTarget, classes, rebalanceNeeded };
  }

  /* ── SVG horizontal bar ─────────────────────────────────────────── */
  function _bar(currPct, tgtPct, color) {
    const w = 200;
    const cW = Math.round((currPct / 100) * w);
    const tX = Math.round((tgtPct / 100) * w);
    return `<svg width="${w}" height="16" viewBox="0 0 ${w} 16" style="display:block;border-radius:4px;overflow:hidden;">
      <rect x="0" y="0" width="${w}" height="16" fill="var(--border-soft)" rx="4"/>
      <rect x="0" y="0" width="${cW}" height="16" fill="${color}" rx="4" style="transition:width .6s;"/>
      <line x1="${tX}" y1="0" x2="${tX}" y2="16" stroke="var(--text-primary)" stroke-width="2" stroke-dasharray="2 2" opacity=".6"/>
    </svg>`;
  }

  /* ══════════════════════════════════════════════════════════════
     OVERVIEW
  ══════════════════════════════════════════════════════════════ */
  function renderOverview(container) {
    if (!container) return;
    const c = _compute();

    const classRows = Object.entries(CLASS_META).map(([k, m]) => {
      const cl = c.classes[k];
      const driftColor = cl.driftAbs > DRIFT_THRESHOLD ? '#EF4444' : cl.driftAbs > 2 ? '#FFB347' : '#22D3A6';
      const actionLabel = cl.action === 'hold' ? '✓ Hold' : cl.action === 'buy' ? `↑ Add ${INR(cl.actionAmount)}` : `↓ Trim ${INR(cl.actionAmount)}`;
      const actionColor = cl.action === 'hold' ? '#22D3A6' : cl.action === 'buy' ? '#4F7CFF' : '#FFB347';
      return `<div style="padding:14px 0;border-bottom:1px solid var(--border-soft);">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <span style="font-size:18px;">${m.icon}</span>
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:700;color:var(--text-primary);">${m.label}</div>
            <div style="font-size:11px;color:var(--text-muted);">${m.desc} · ${INR(cl.currentValue)}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:13px;font-weight:800;color:${m.color};">${cl.currentPct.toFixed(1)}%</div>
            <div style="font-size:10px;color:var(--text-muted);">target: ${cl.targetPct.toFixed(1)}%</div>
          </div>
          <div style="min-width:70px;text-align:right;">
            <div style="font-size:12px;font-weight:700;color:${driftColor};">${cl.drift >= 0 ? '+' : ''}${cl.drift.toFixed(1)}%</div>
            <div style="font-size:10px;color:var(--text-muted);">drift</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="flex:1;">${_bar(cl.currentPct, cl.targetPct, m.color)}</div>
          <div style="min-width:140px;text-align:right;font-size:12px;font-weight:700;color:${actionColor};">${actionLabel}</div>
        </div>
      </div>`;
    }).join('');

    const alertBanner = c.rebalanceNeeded ? `
      <div style="background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.25);border-radius:14px;padding:14px 18px;margin-bottom:20px;display:flex;gap:12px;align-items:center;">
        <span style="font-size:20px;">⚠️</span>
        <div>
          <div style="font-size:13px;font-weight:800;color:#EF4444;">Rebalancing Required</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">One or more asset classes have drifted more than ${DRIFT_THRESHOLD}% from target. See Actions tab for the rebalancing plan.</div>
        </div>
      </div>` : `
      <div style="background:rgba(34,211,166,.06);border:1px solid rgba(34,211,166,.18);border-radius:14px;padding:14px 18px;margin-bottom:20px;display:flex;gap:12px;align-items:center;">
        <span style="font-size:20px;">✅</span>
        <div style="font-size:13px;font-weight:700;color:#22D3A6;">Portfolio within balance — no rebalancing needed (all classes within ±${DRIFT_THRESHOLD}%)</div>
      </div>`;

    container.innerHTML = `
<style>
.rb-hero{background:var(--border-soft);border:1px solid var(--border-soft);border-radius:20px;padding:24px;margin-bottom:20px;display:flex;gap:20px;flex-wrap:wrap;align-items:center;}
.rb-kpi{text-align:center;flex:1;min-width:120px;}
.rb-kpi-lbl{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin-bottom:5px;}
.rb-kpi-val{font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:22px;font-weight:900;}
</style>

<div class="rb-hero">
  <div class="rb-kpi">
    <div class="rb-kpi-lbl">Total Portfolio</div>
    <div class="rb-kpi-val" style="color:#4F7CFF;">${INR(c.totalPortfolio)}</div>
  </div>
  <div class="rb-kpi">
    <div class="rb-kpi-lbl">Asset Classes</div>
    <div class="rb-kpi-val" style="color:#22D3A6;">${Object.values(c.classes).filter(cl => cl.currentValue > 0).length}</div>
  </div>
  <div class="rb-kpi">
    <div class="rb-kpi-lbl">Classes Off-Target</div>
    <div class="rb-kpi-val" style="color:${c.rebalanceNeeded ? '#EF4444' : '#22D3A6'};">${Object.values(c.classes).filter(cl => cl.driftAbs > DRIFT_THRESHOLD).length}</div>
  </div>
  <div class="rb-kpi">
    <div class="rb-kpi-lbl">Drift Threshold</div>
    <div class="rb-kpi-val" style="color:var(--text-secondary);">±${DRIFT_THRESHOLD}%</div>
  </div>
</div>

${alertBanner}

<div style="background:var(--border-soft);border:1px solid var(--border-soft);border-radius:16px;padding:20px;">
  <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:4px;">Current vs Target Allocation</div>
  <div style="font-size:11px;color:var(--text-muted);margin-bottom:16px;">Solid bar = current allocation · Dashed line = target · Drift shown on right</div>
  ${c.totalPortfolio > 0 ? classRows : '<div style="color:var(--text-muted);font-size:13px;padding:20px 0;text-align:center;">No portfolio data found. Fill in your trackers (Portfolio, SIP, FD, Gold, EPF, NPS, PPF, Crypto) to see allocation analysis.</div>'}
</div>

<div style="margin-top:16px;background:var(--border-soft);border:1px solid var(--border-soft);border-radius:14px;padding:16px;font-size:12px;color:var(--text-muted);line-height:1.7;">
  ℹ️ <strong>Dashed line</strong> = target allocation set in Setup tab · Edit your targets there · Rebalance annually or when any class drifts beyond ${DRIFT_THRESHOLD}% · <strong>Govt Savings</strong> (EPF/NPS/PPF) shown at current balance — projections not used here as they're illiquid until retirement
</div>`;
  }

  /* ══════════════════════════════════════════════════════════════
     SETUP TAB — target sliders
  ══════════════════════════════════════════════════════════════ */
  function renderSetup(container) {
    if (!container) return;
    const target = _loadTarget();

    const presets = [
      { name: 'Aggressive (60/20/10/0/5/5)', vals: { equity:60, debt:20, gold:10, realestate:0, crypto:5, govt:5 } },
      { name: 'Moderate (50/20/10/10/5/5)',  vals: { equity:50, debt:20, gold:10, realestate:10, crypto:5, govt:5 } },
      { name: 'Conservative (30/40/15/10/0/5)', vals: { equity:30, debt:40, gold:15, realestate:10, crypto:0, govt:5 } },
      { name: 'Income (20/50/10/10/0/10)',   vals: { equity:20, debt:50, gold:10, realestate:10, crypto:0, govt:10 } },
    ];

    const sliders = Object.entries(CLASS_META).map(([k, m]) => `
      <div style="margin-bottom:18px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:16px;">${m.icon}</span>
            <div>
              <div style="font-size:13px;font-weight:700;color:var(--text-primary);">${m.label}</div>
              <div style="font-size:11px;color:var(--text-muted);">${m.desc}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <input type="number" id="rb-inp-${k}" min="0" max="100" value="${target[k] || 0}"
              style="width:60px;background:var(--border-soft);border:1px solid var(--border-medium);border-radius:8px;color:var(--text-primary);font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:14px;font-weight:800;padding:5px 8px;text-align:center;outline:none;"
              oninput="document.getElementById('rb-rng-${k}').value=this.value;_rbUpdateTotal()">
            <span style="color:var(--text-muted);font-size:13px;">%</span>
          </div>
        </div>
        <input type="range" id="rb-rng-${k}" min="0" max="100" value="${target[k] || 0}"
          style="width:100%;accent-color:${m.color};"
          oninput="document.getElementById('rb-inp-${k}').value=this.value;_rbUpdateTotal()">
      </div>`).join('');

    const presetBtns = presets.map(p => `
      <button onclick="_rbApplyPreset(${JSON.stringify(p.vals)})"
        style="background:var(--border-soft);border:1px solid var(--border-medium);border-radius:10px;padding:8px 14px;font-size:12px;font-weight:600;color:var(--text-secondary);cursor:pointer;font-family:inherit;white-space:nowrap;transition:all .2s;"
        onmouseover="this.style.background='var(--border-soft)';this.style.color='var(--text-primary)'"
        onmouseout="this.style.background='var(--border-soft)';this.style.color='var(--text-secondary)'"
      >${p.name}</button>`).join('');

    container.innerHTML = `
<div style="margin-bottom:18px;">
  <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:10px;">Quick Presets</div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;">${presetBtns}</div>
</div>

<div style="background:var(--border-soft);border:1px solid var(--border-soft);border-radius:16px;padding:20px;margin-bottom:16px;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">Set Target Allocation</div>
    <div id="rb-total-display" style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:14px;font-weight:800;color:#FFB347;">Total: —%</div>
  </div>
  ${sliders}
  <button onclick="_rbSaveTarget()"
    style="width:100%;padding:13px;border-radius:12px;font-weight:800;font-size:14px;cursor:pointer;
    background:linear-gradient(135deg,rgba(79,124,255,.2),rgba(34,211,166,.1));
    border:1px solid rgba(79,124,255,.3);color:#4F7CFF;transition:all .2s;font-family:inherit;margin-top:6px;"
    onmouseover="this.style.borderColor='rgba(79,124,255,.6)'"
    onmouseout="this.style.borderColor='rgba(79,124,255,.3)'"
  >💾 Save Target Allocation & Recompute</button>
</div>

<div style="background:rgba(79,124,255,.05);border:1px solid rgba(79,124,255,.12);border-radius:14px;padding:16px;font-size:12px;color:var(--text-muted);line-height:1.7;">
  <strong style="color:#4F7CFF;">Allocation guidelines</strong><br>
  🟢 Equity: higher allocation = higher long-term return, higher short-term volatility<br>
  🔵 Debt: capital protection, lower returns — FD, liquid funds, bonds<br>
  🥇 Gold: inflation hedge — 5-15% for most portfolios<br>
  🏠 Real Estate: illiquid; include only your own property at current market value<br>
  🟣 Crypto: highly volatile; cap at 5% unless you have high risk tolerance<br>
  🏛️ Govt Savings: EPF/NPS/PPF — forced long-term savings; count toward debt/stable bucket
</div>

<script>
(function(){
  function _getVals(){ return ${JSON.stringify(Object.keys(CLASS_META))}.reduce((o,k)=>{ o[k]=parseInt(document.getElementById('rb-inp-'+k)?.value||0)||0; return o; }, {}); }
  window._rbUpdateTotal = function(){
    const vals = _getVals();
    const total = Object.values(vals).reduce((s,v)=>s+v,0);
    const el = document.getElementById('rb-total-display');
    if(el){ el.textContent='Total: '+total+'%'; el.style.color = total===100?'#22D3A6':Math.abs(total-100)<=5?'#FFB347':'#EF4444'; }
  };
  window._rbApplyPreset = function(p){
    Object.entries(p).forEach(([k,v])=>{
      const inp = document.getElementById('rb-inp-'+k); const rng = document.getElementById('rb-rng-'+k);
      if(inp) inp.value=v; if(rng) rng.value=v;
    });
    _rbUpdateTotal();
  };
  window._rbSaveTarget = function(){
    const vals = _getVals();
    localStorage.setItem('finos_target_alloc', JSON.stringify(vals));
    if(window.FinosRebalancer){
      window.FinosRebalancer.renderOverview(document.getElementById('rb-panel-overview'));
      window.FinosRebalancer.renderActions(document.getElementById('rb-panel-actions'));
    }
    const btn = document.querySelector('[onclick="_rbSaveTarget()"]');
    if(btn){ btn.textContent='✓ Saved!'; btn.style.color='#22D3A6'; setTimeout(()=>{ btn.textContent='💾 Save Target Allocation & Recompute'; btn.style.color='#4F7CFF'; },1500); }
  };
  _rbUpdateTotal();
})();
<\/script>`;
  }

  /* ══════════════════════════════════════════════════════════════
     ACTIONS TAB
  ══════════════════════════════════════════════════════════════ */
  function renderActions(container) {
    if (!container) return;
    const c = _compute();

    const buys  = Object.entries(c.classes).filter(([,cl]) => cl.action === 'buy'  && cl.actionAmount > 1000);
    const sells = Object.entries(c.classes).filter(([,cl]) => cl.action === 'sell' && cl.actionAmount > 1000);
    const holds = Object.entries(c.classes).filter(([,cl]) => cl.action === 'hold' || cl.actionAmount <= 1000);

    const _actionCard = (k, cl, type) => {
      const m = CLASS_META[k];
      const color = type === 'buy' ? '#4F7CFF' : type === 'sell' ? '#FFB347' : '#22D3A6';
      const bg    = type === 'buy' ? 'rgba(79,124,255,.07)' : type === 'sell' ? 'rgba(255,179,71,.07)' : 'rgba(34,211,166,.05)';
      const border= type === 'buy' ? 'rgba(79,124,255,.2)' : type === 'sell' ? 'rgba(255,179,71,.2)' : 'rgba(34,211,166,.15)';
      const verb  = type === 'buy' ? '↑ ADD' : type === 'sell' ? '↓ TRIM' : '✓ HOLD';
      const suggestion = _actionSuggestion(k, type, cl.actionAmount);
      return `<div style="padding:16px;background:${bg};border:1px solid ${border};border-radius:14px;margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <span style="font-size:20px;">${m.icon}</span>
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:800;color:${color};">${verb} ${m.label}</div>
            <div style="font-size:11px;color:var(--text-muted);">Current: ${INR(cl.currentValue)} (${cl.currentPct.toFixed(1)}%) → Target: ${cl.targetPct.toFixed(1)}%</div>
          </div>
          ${type !== 'hold' ? `<div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:18px;font-weight:900;color:${color};">${INR(cl.actionAmount)}</div>` : ''}
        </div>
        ${suggestion ? `<div style="font-size:12px;color:var(--text-secondary);padding:8px 10px;background:var(--border-soft);border-radius:8px;">${suggestion}</div>` : ''}
      </div>`;
    };

    function _actionSuggestion(k, type, amount) {
      const amtK = Math.round(amount / 1000);
      if (type === 'buy') {
        if (k === 'equity')     return `💡 Add ₹${amtK}K to your equity SIP or buy index fund (Nifty 50 / Nifty Next 50)`;
        if (k === 'debt')       return `💡 Open FD or invest in liquid/short-duration debt fund for ₹${amtK}K`;
        if (k === 'gold')       return `💡 Buy Sovereign Gold Bond in next RBI window or Gold ETF via NSE for ₹${amtK}K`;
        if (k === 'realestate') return `💡 Real estate is illiquid — consider REIT (Embassy, Mindspace) as a liquid proxy`;
        if (k === 'crypto')     return `💡 Add ₹${amtK}K to BTC/ETH on CoinDCX/WazirX (remember 30% flat tax on India crypto gains)`;
        if (k === 'govt')       return `💡 Increase EPF VPF contribution or invest ₹${amtK}K in PPF / NPS Tier 1`;
      }
      if (type === 'sell') {
        if (k === 'equity')     return `💡 Redeem ₹${amtK}K from equity MF or sell stocks; watch LTCG (₹1.25L exempt annually)`;
        if (k === 'debt')       return `💡 Allow ₹${amtK}K FD to mature and redeploy; or exit debt MF (check exit load)`;
        if (k === 'gold')       return `💡 Sell ₹${amtK}K of gold ETF on NSE (SGB: wait for maturity for tax-free capital gain)`;
        if (k === 'crypto')     return `💡 Book ₹${amtK}K of crypto profit; note 30% flat tax applies + 1% TDS`;
        if (k === 'realestate') return `💡 Real estate is illiquid — consider trimming exposure via REIT units instead`;
      }
      return '';
    }

    container.innerHTML = `
${!c.rebalanceNeeded ? `<div style="background:rgba(34,211,166,.06);border:1px solid rgba(34,211,166,.18);border-radius:14px;padding:16px;margin-bottom:20px;text-align:center;font-size:13px;font-weight:700;color:#22D3A6;">
  ✅ Portfolio is well-balanced — no action required (all classes within ±${DRIFT_THRESHOLD}% of target)
</div>` : ''}

${buys.length ? `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#4F7CFF;margin-bottom:10px;">↑ Underweight — Add</div>
${buys.map(([k,cl]) => _actionCard(k,cl,'buy')).join('')}` : ''}

${sells.length ? `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#FFB347;margin:16px 0 10px;">↓ Overweight — Trim</div>
${sells.map(([k,cl]) => _actionCard(k,cl,'sell')).join('')}` : ''}

${holds.length ? `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#22D3A6;margin:16px 0 10px;">✓ On Target — Hold</div>
${holds.map(([k,cl]) => _actionCard(k,cl,'hold')).join('')}` : ''}

<div style="margin-top:18px;background:var(--border-soft);border:1px solid var(--border-soft);border-radius:14px;padding:16px;font-size:12px;color:var(--text-muted);line-height:1.7;">
  ⚡ <strong>Rebalancing tips</strong><br>
  • Rebalance by adding new money to underweight classes first — avoids triggering capital gains<br>
  • Sell only when the drift is large (>10%) or you're rebalancing EPF/NPS at year-end<br>
  • Do annual rebalancing in March — align with 80C investments and FY close<br>
  • Avoid over-rebalancing: costs (brokerage, tax, exit loads) can erode the benefit
</div>`;
  }

  return { renderOverview, renderSetup, renderActions, _compute };
})();
