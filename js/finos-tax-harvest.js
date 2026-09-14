/* finos-tax-harvest.js — Tax Loss/Gain Harvesting Planner
 *
 * India capital gains tax (post Budget 2024):
 *   LTCG (holding >12 months for equity/equity-MF/SGB):
 *     — First ₹1,25,000 per year is exempt
 *     — Gains above ₹1,25,000 taxed at 12.5% (no indexation)
 *   STCG (holding ≤12 months):
 *     — Taxed at 20% flat (raised from 15% in Budget 2024)
 *   Debt MF / FD (all):
 *     — Added to income and taxed at slab rate
 *   SGB:
 *     — Capital gain at maturity (8yr) is 100% tax-free
 *     — Early redemption after 5yr: LTCG at 12.5%
 *
 * Two harvest strategies:
 *   1. Tax-Loss Harvesting: Sell losing positions to book losses that offset
 *      gains, reducing net taxable capital gain.
 *   2. Gain Harvesting (Sweep-within-Exemption): If LTCG for the year is
 *      below ₹1.25L, sell-and-rebuy profitable equity positions to "step
 *      up" your cost basis — locking in the tax-free exemption.
 *
 * localStorage written:
 *   finos_harvest_tax_saved   — estimated tax saved by harvest actions
 *   finos_harvest_ltcg_net    — net LTCG after harvesting
 *
 * Exported: window.FinosTaxHarvest
 */
window.FinosTaxHarvest = (function () {
  'use strict';

  const gs  = k => parseFloat(localStorage.getItem(k)) || 0;
  const ss  = (k, v) => localStorage.setItem(k, String(v));
  const gss = k => localStorage.getItem(k) || '';
  const INR = v => '₹' + Math.abs(Math.round(v)).toLocaleString('en-IN');
  const fmt = v => v >= 1e7 ? (v/1e7).toFixed(2)+' Cr' : v >= 1e5 ? (v/1e5).toFixed(1)+' L' : INR(v);

  /* Tax constants FY 2025-26 */
  const LTCG_EXEMPT = 125000;  // ₹1.25L
  const LTCG_RATE   = 0.125;   // 12.5%
  const STCG_RATE   = 0.20;    // 20%

  /* ── Positions storage ──────────────────────────────────────────── */
  const POSITIONS_KEY = 'finos_harvest_positions';

  const DEFAULT_POSITIONS = [
    { id:'p1', name:'HDFC Bank',         type:'equity', qty:50,  buyPrice:1400, cmp:1650, holdMonths:15 },
    { id:'p2', name:'Infosys',           type:'equity', qty:30,  buyPrice:1800, cmp:1600, holdMonths:18 },
    { id:'p3', name:'Nippon India ETF',  type:'equity', qty:200, buyPrice:220,  cmp:265,  holdMonths:8  },
    { id:'p4', name:'Paytm',             type:'equity', qty:100, buyPrice:950,  cmp:450,  holdMonths:20 },
    { id:'p5', name:'ICICI Pru Bluechip MF', type:'equity', qty:500, buyPrice:80, cmp:110, holdMonths:25 },
  ];

  function _loadPositions() {
    try {
      const raw = gss(POSITIONS_KEY);
      return raw ? JSON.parse(raw) : DEFAULT_POSITIONS;
    } catch { return DEFAULT_POSITIONS; }
  }

  function _savePositions(positions) {
    localStorage.setItem(POSITIONS_KEY, JSON.stringify(positions));
  }

  /* ── Core computation ───────────────────────────────────────────── */
  function _taxOnGain(gainType, gain, slabRate) {
    if (gainType === 'ltcg') {
      const taxable = Math.max(0, gain - LTCG_EXEMPT);
      return Math.round(taxable * LTCG_RATE);
    }
    if (gainType === 'stcg') {
      return Math.round(Math.max(0, gain) * STCG_RATE);
    }
    return Math.round(Math.max(0, gain) * (slabRate / 100));
  }

  function _analysePositions(positions, existingLTCG, existingSTCG) {
    let ltcgFromSelected = 0, stcgFromSelected = 0;
    let ltcgLossAvailable = 0, stcgLossAvailable = 0;

    const enriched = positions.map(pos => {
      const costBasis = pos.buyPrice * pos.qty;
      const currentVal = pos.cmp * pos.qty;
      const gain = currentVal - costBasis;
      const isLong = pos.holdMonths >= 12;
      const gainType = isLong ? 'ltcg' : 'stcg';
      const isLoss = gain < 0;
      const absoluteGain = Math.abs(gain);

      return {
        ...pos,
        costBasis, currentVal, gain, isLong, gainType, isLoss, absoluteGain,
        gainPct: costBasis > 0 ? ((gain / costBasis) * 100).toFixed(1) : '0.0',
      };
    });

    // Harvest candidates
    const losses = enriched.filter(p => p.isLoss);
    const gains  = enriched.filter(p => !p.isLoss);

    // Loss harvest: offsetting gains
    const ltcgLosses = losses.filter(p => p.isLong);
    const stcgLosses = losses.filter(p => !p.isLong);
    const totalLTCGLoss = ltcgLosses.reduce((s, p) => s + p.absoluteGain, 0);
    const totalSTCGLoss = stcgLosses.reduce((s, p) => s + p.absoluteGain, 0);

    // Available LTCG exemption headroom
    const usedLTCG = existingLTCG || 0;
    const headroom = Math.max(0, LTCG_EXEMPT - usedLTCG);

    // Gain harvest: sell profitable LTCG positions within headroom to step up cost basis
    let harvestBudget = headroom;
    const gainHarvestCandidates = gains
      .filter(p => p.isLong && p.gain > 0)
      .sort((a, b) => b.gain - a.gain)
      .map(p => {
        const canHarvest = Math.min(p.gain, harvestBudget);
        harvestBudget = Math.max(0, harvestBudget - canHarvest);
        const harvestQty = canHarvest > 0 ? Math.floor(canHarvest / (p.cmp - p.buyPrice)) : 0;
        return { ...p, canHarvest, harvestQty, taxSaved: Math.round(canHarvest * LTCG_RATE) };
      })
      .filter(p => p.canHarvest > 0);

    // Net LTCG after loss offset
    const netLTCG = Math.max(0, usedLTCG - totalLTCGLoss);
    const netSTCG = Math.max(0, (existingSTCG || 0) - totalSTCGLoss);

    // Tax savings
    const ltcgTaxBefore = _taxOnGain('ltcg', usedLTCG, 0);
    const ltcgTaxAfter  = _taxOnGain('ltcg', netLTCG, 0);
    const stcgTaxBefore = _taxOnGain('stcg', existingSTCG || 0, 0);
    const stcgTaxAfter  = _taxOnGain('stcg', netSTCG, 0);
    const taxSaved      = (ltcgTaxBefore - ltcgTaxAfter) + (stcgTaxBefore - stcgTaxAfter);
    const gainHarvestSaved = gainHarvestCandidates.reduce((s, p) => s + p.taxSaved, 0);

    ss('finos_harvest_tax_saved',  taxSaved + gainHarvestSaved);
    ss('finos_harvest_ltcg_net',   netLTCG);

    return {
      enriched, losses, gains, gainHarvestCandidates,
      totalLTCGLoss, totalSTCGLoss,
      netLTCG, netSTCG,
      usedLTCG, headroom,
      taxSaved, gainHarvestSaved,
      ltcgTaxBefore, ltcgTaxAfter,
      stcgTaxBefore, stcgTaxAfter,
    };
  }

  /* ── Input helpers ──────────────────────────────────────────────── */
  function _inp(id, label, val, min, max, step, unit, hint) {
    return `<div style="margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
        <label style="font-size:12px;font-weight:700;color:var(--text-secondary);">${label}</label>
        <div style="display:flex;align-items:center;gap:6px;">
          <input type="number" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}"
            style="width:110px;background:var(--border-soft);border:1px solid var(--border-medium);border-radius:8px;color:var(--text-primary);font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:13px;font-weight:800;padding:5px 10px;text-align:right;outline:none;"
            oninput="_thRecalc()">
          <span style="font-size:11px;color:var(--text-muted);">${unit}</span>
        </div>
      </div>
      ${hint ? `<div style="font-size:11px;color:var(--text-muted);">${hint}</div>` : ''}
    </div>`;
  }

  /* ══════════════════════════════════════════════════════════════
     OVERVIEW TAB
  ══════════════════════════════════════════════════════════════ */
  function renderOverview(container) {
    if (!container) return;

    const existingLTCG = parseFloat(gss('finos_th_ltcg') || '0') || 0;
    const existingSTCG = parseFloat(gss('finos_th_stcg') || '0') || 0;
    const positions    = _loadPositions();
    const c            = _analysePositions(positions, existingLTCG, existingSTCG);

    const totalSaved = c.taxSaved + c.gainHarvestSaved;

    container.innerHTML = `
<style>
.th-card{background:var(--border-soft);border:1px solid var(--border-soft);border-radius:16px;padding:20px;margin-bottom:16px;}
.th-stat{display:flex;flex-direction:column;gap:4px;}
.th-stat .val{font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:26px;font-weight:900;}
.th-stat .lbl{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);}
</style>

<div class="th-card" style="background:linear-gradient(135deg,rgba(34,211,166,.06),rgba(79,124,255,.04));border-color:rgba(34,211,166,.2);">
  <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:14px;">Current Year Capital Gains</div>
  ${_inp('th-ltcg', 'LTCG Booked So Far (this FY)', existingLTCG, 0, 10000000, 1000, '₹', 'Long-term gains already realised — from equity, MF sold after 12+ months')}
  ${_inp('th-stcg', 'STCG Booked So Far (this FY)', existingSTCG, 0, 10000000, 1000, '₹', 'Short-term gains — equity/MF sold within 12 months')}
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:10px;">
    <div class="th-stat">
      <div class="lbl">LTCG Exempt Used</div>
      <div class="val" id="th-r-used" style="color:#22D3A6;">${fmt(Math.min(existingLTCG, LTCG_EXEMPT))}</div>
      <div style="font-size:11px;color:var(--text-muted);">of ₹1.25L exemption</div>
    </div>
    <div class="th-stat">
      <div class="lbl">Exempt Headroom Left</div>
      <div class="val" id="th-r-head" style="color:#FFB347;">${fmt(c.headroom)}</div>
      <div style="font-size:11px;color:var(--text-muted);">available to harvest into</div>
    </div>
    <div class="th-stat">
      <div class="lbl">Total Tax Saveable</div>
      <div class="val" id="th-r-saved" style="color:#4F7CFF;">${INR(totalSaved)}</div>
      <div style="font-size:11px;color:var(--text-muted);">loss + gain harvest</div>
    </div>
  </div>
</div>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
  <div class="th-card">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#FF6B6B;margin-bottom:12px;">Tax-Loss Harvest Candidates</div>
    ${c.losses.length === 0 ? '<div style="font-size:13px;color:var(--text-muted);">No losing positions found</div>' :
      c.losses.map(p => `<div style="padding:10px 0;border-bottom:1px solid var(--border-soft);">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <div style="font-size:13px;font-weight:700;color:var(--text-primary);">${p.name}</div>
            <div style="font-size:11px;color:var(--text-muted);">${p.isLong?'LTCG':'STCG'} · ${p.holdMonths}mo · ${p.qty} units</div>
          </div>
          <div style="text-align:right;">
            <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:14px;font-weight:800;color:#FF6B6B;">${fmt(p.gain)}</div>
            <div style="font-size:11px;color:var(--text-muted);">${p.gainPct}%</div>
          </div>
        </div>
        <div style="margin-top:6px;padding:6px 10px;background:rgba(255,107,107,.06);border-radius:8px;font-size:11px;color:var(--text-muted);">
          Book loss → reduce taxable ${p.isLong?'LTCG':'STCG'} by ${fmt(p.absoluteGain)} → save ${INR(Math.round(p.absoluteGain * (p.isLong ? LTCG_RATE : STCG_RATE)))}
        </div>
      </div>`).join('')}
    <div style="margin-top:12px;padding:10px;background:rgba(255,107,107,.05);border-radius:10px;font-size:11px;color:var(--text-muted);">
      <strong style="color:#FF6B6B;">Tax saved by booking losses: ${INR(c.taxSaved)}</strong><br>
      LTCG losses reduce LTCG first · STCG losses reduce STCG first<br>
      Losses can be carried forward 8 years if unutilised
    </div>
  </div>

  <div class="th-card">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#22D3A6;margin-bottom:12px;">Gain Harvest (Sweep within ₹1.25L Exemption)</div>
    ${c.headroom <= 0 ? '<div style="font-size:13px;color:var(--text-muted);">LTCG exemption of ₹1.25L fully utilised</div>' :
      c.gainHarvestCandidates.length === 0 ? '<div style="font-size:13px;color:var(--text-muted);">No LTCG gain positions available</div>' :
      c.gainHarvestCandidates.map(p => `<div style="padding:10px 0;border-bottom:1px solid var(--border-soft);">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <div style="font-size:13px;font-weight:700;color:var(--text-primary);">${p.name}</div>
            <div style="font-size:11px;color:var(--text-muted);">LTCG · ${p.holdMonths}mo · Gain: ${fmt(p.gain)}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:14px;font-weight:800;color:#22D3A6;">+${fmt(p.canHarvest)}</div>
            <div style="font-size:11px;color:var(--text-muted);">harvestable</div>
          </div>
        </div>
        <div style="margin-top:6px;padding:6px 10px;background:rgba(34,211,166,.06);border-radius:8px;font-size:11px;color:var(--text-muted);">
          Sell ${p.harvestQty} units @ ${INR(p.cmp)} → rebuy immediately → step up cost basis → ${INR(p.taxSaved)} tax avoided
        </div>
      </div>`).join('')}
    ${c.gainHarvestCandidates.length > 0 ? `<div style="margin-top:12px;padding:10px;background:rgba(34,211,166,.05);border-radius:10px;font-size:11px;color:var(--text-muted);">
      <strong style="color:#22D3A6;">Tax shielded by gain harvesting: ${INR(c.gainHarvestSaved)}</strong><br>
      Sell-and-rebuy same day · no wash-sale rule in India · new cost basis reduces future LTCG
    </div>` : ''}
  </div>
</div>

<div style="background:rgba(34,211,166,.05);border:1px solid rgba(34,211,166,.12);border-radius:14px;padding:16px;margin-top:4px;">
  <div style="font-size:13px;font-weight:800;color:#22D3A6;margin-bottom:10px;">💡 India Tax Harvest Calendar</div>
  <div style="font-size:12px;color:var(--text-secondary);line-height:1.75;display:flex;flex-direction:column;gap:4px;">
    <span>📅 <strong style="color:var(--text-primary);">March:</strong> Last chance to harvest losses before FY end — book by March 28 for settlement by March 31</span>
    <span>📅 <strong style="color:var(--text-primary);">April:</strong> New FY starts — ₹1.25L LTCG exemption resets · start fresh harvest window</span>
    <span>📅 <strong style="color:var(--text-primary);">No wash-sale rule:</strong> India has no equivalent — you can sell and rebuy the same stock same day</span>
    <span>📅 <strong style="color:var(--text-primary);">Debt MF:</strong> Post April 2023, no LTCG benefit — taxed at slab regardless of holding period</span>
    <span>📅 <strong style="color:var(--text-primary);">SGB maturity:</strong> Capital gains at 8-year maturity are fully tax-free (Sec 47)</span>
  </div>
</div>

<script>
(function(){
  window._thRecalc = function() {
    const ltcg = parseFloat(document.getElementById('th-ltcg')?.value) || 0;
    const stcg = parseFloat(document.getElementById('th-stcg')?.value) || 0;
    localStorage.setItem('finos_th_ltcg', String(ltcg));
    localStorage.setItem('finos_th_stcg', String(stcg));
    if (window.FinosTaxHarvest) {
      const positions = window.FinosTaxHarvest._loadPositions();
      const c = window.FinosTaxHarvest._analysePositions(positions, ltcg, stcg);
      const fmt = v => v>=1e7?(v/1e7).toFixed(2)+' Cr':v>=1e5?(v/1e5).toFixed(1)+' L':'₹'+Math.round(v).toLocaleString('en-IN');
      const INR = v => '₹'+Math.abs(Math.round(v)).toLocaleString('en-IN');
      const upd = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
      upd('th-r-used',  fmt(Math.min(ltcg, 125000)));
      upd('th-r-head',  fmt(c.headroom));
      upd('th-r-saved', INR(c.taxSaved + c.gainHarvestSaved));
    }
  };
})();
<\/script>`;
  }

  /* ══════════════════════════════════════════════════════════════
     POSITIONS TAB
  ══════════════════════════════════════════════════════════════ */
  function renderPositions(container) {
    if (!container) return;
    const positions = _loadPositions();
    const existingLTCG = parseFloat(gss('finos_th_ltcg') || '0') || 0;
    const existingSTCG = parseFloat(gss('finos_th_stcg') || '0') || 0;
    const c = _analysePositions(positions, existingLTCG, existingSTCG);

    const rows = c.enriched.map(p => {
      const gainColor = p.gain >= 0 ? '#22D3A6' : '#FF6B6B';
      const typeColor = p.isLong ? '#4F7CFF' : '#FFB347';
      const action = p.isLoss
        ? `<span style="background:rgba(255,107,107,.1);color:#FF6B6B;padding:3px 8px;border-radius:5px;font-size:11px;font-weight:700;">HARVEST LOSS</span>`
        : p.isLong && c.headroom > 0 && p.gain > 0
        ? `<span style="background:rgba(34,211,166,.1);color:#22D3A6;padding:3px 8px;border-radius:5px;font-size:11px;font-weight:700;">GAIN HARVEST</span>`
        : `<span style="background:var(--border-soft);color:var(--text-muted);padding:3px 8px;border-radius:5px;font-size:11px;">HOLD</span>`;
      return `<tr style="border-bottom:1px solid var(--border-soft);">
        <td style="padding:10px;font-size:13px;font-weight:700;color:var(--text-primary);">${p.name}</td>
        <td style="padding:10px;font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:12px;color:var(--text-muted);">${p.qty}</td>
        <td style="padding:10px;font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:12px;color:var(--text-muted);">${INR(p.buyPrice)}</td>
        <td style="padding:10px;font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:12px;color:var(--text-primary);">${INR(p.cmp)}</td>
        <td style="padding:10px;font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:12px;color:${gainColor};font-weight:800;">${p.gain>=0?'+':''}${fmt(p.gain)} (${p.gainPct}%)</td>
        <td style="padding:10px;font-size:12px;color:${typeColor};font-weight:700;">${p.isLong?'LTCG':'STCG'} · ${p.holdMonths}mo</td>
        <td style="padding:10px;">${action}</td>
      </tr>`;
    }).join('');

    container.innerHTML = `
<div style="margin-bottom:14px;font-size:12px;color:var(--text-muted);">Enter your portfolio positions below. Edit the table to match your actual holdings — default values are illustrative.</div>
<div style="overflow-x:auto;border-radius:14px;border:1px solid var(--border-soft);background:var(--border-soft);">
<table style="width:100%;border-collapse:collapse;">
  <thead>
    <tr style="background:var(--border-soft);">
      <th style="padding:10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">Holding</th>
      <th style="padding:10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">Qty</th>
      <th style="padding:10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">Buy Price</th>
      <th style="padding:10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">CMP</th>
      <th style="padding:10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">Gain / Loss</th>
      <th style="padding:10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">Type</th>
      <th style="padding:10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">Action</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
</div>
<div style="margin-top:12px;font-size:11px;color:var(--text-muted);">CMP = Current Market Price. LTCG = held &gt;12 months. STCG = held ≤12 months. Edit default positions in localStorage key <code style="font-size:10px;">finos_harvest_positions</code>.</div>`;
  }

  return { renderOverview, renderPositions, _compute: _analysePositions, _loadPositions, _analysePositions };
})();
