/**
 * finos-sip-tracker.js — Live MF SIP Portfolio Tracker  v1.0  (Phase 26)
 * ─────────────────────────────────────────────────────────────────────────
 * Lets users maintain their SIP investments with live NAV from arya-ai's
 * AMFI data feed. Calculates P&L, XIRR, and pushes data to finos-context.
 *
 * Features:
 *   • Fund search autocomplete via arya-ai /api/mf/search
 *   • Live NAV fetch via arya-ai /api/mf/nav/{scheme_code}
 *   • Add / edit / delete SIP entries (localStorage persistent)
 *   • XIRR approximation using Newton-Raphson on monthly cash flows
 *   • Portfolio summary: invested, current value, P&L%, XIRR
 *   • Context push to window.FinosContext / finos_sip_value localStorage
 *
 * Public API:
 *   FinosSIPTracker.renderPortfolio(containerEl)   — renders full tracker UI
 *   FinosSIPTracker.renderFundSearch(containerEl)  — renders standalone NAV search
 *   FinosSIPTracker.getPortfolio()                 — returns current SIP array
 *   FinosSIPTracker.refresh()                      — re-fetches all NAVs
 */
(function (global) {
  'use strict';

  const ARYA = 'http://localhost:7475';
  const STORE_KEY = 'finos_sip_portfolio';

  /* ── Helpers ─────────────────────────────────────────────────────── */
  function INR(n) {
    n = Number(n) || 0;
    if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr';
    if (n >= 1e5) return '₹' + (n / 1e5).toFixed(2) + ' L';
    if (n >= 1e3) return '₹' + Math.round(n / 1e3) + 'K';
    return '₹' + Math.round(n).toLocaleString('en-IN');
  }

  function pct(n) { return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'; }

  function monthsBetween(start, end) {
    const s = new Date(start), e = new Date(end);
    return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  }

  /**
   * XIRR via Newton-Raphson.
   * cashflows: [{amount, date}] — negative for investments, positive for final value.
   * Returns annual rate (e.g. 0.14 = 14%).
   */
  function xirr(cashflows, guess = 0.1) {
    const dates = cashflows.map(cf => new Date(cf.date));
    const t0    = dates[0];
    const days  = dates.map(d => (d - t0) / (1000 * 86400));

    function npv(rate) {
      return cashflows.reduce((s, cf, i) => s + cf.amount / Math.pow(1 + rate, days[i] / 365), 0);
    }
    function dnpv(rate) {
      return cashflows.reduce((s, cf, i) =>
        s - (days[i] / 365) * cf.amount / Math.pow(1 + rate, days[i] / 365 + 1), 0);
    }

    let rate = guess;
    for (let i = 0; i < 100; i++) {
      const f  = npv(rate);
      const df = dnpv(rate);
      if (Math.abs(df) < 1e-12) break;
      const next = rate - f / df;
      if (Math.abs(next - rate) < 1e-8) { rate = next; break; }
      rate = next;
      if (rate <= -1) rate = -0.9999;
    }
    return isFinite(rate) ? rate : null;
  }

  /* ── Data layer ─────────────────────────────────────────────────── */
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch { return []; }
  }
  function save(arr) { localStorage.setItem(STORE_KEY, JSON.stringify(arr)); }

  async function fetchNAV(schemeCode) {
    try {
      const r = await fetch(`${ARYA}/api/mf/nav/${schemeCode}`, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) return null;
      const d = await r.json();
      return d.error ? null : d;
    } catch { return null; }
  }

  async function searchFunds(q) {
    try {
      const r = await fetch(`${ARYA}/api/mf/search?q=${encodeURIComponent(q)}&limit=10`, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) return [];
      const d = await r.json();
      return d.results || [];
    } catch { return []; }
  }

  /* ── XIRR builder for one SIP ───────────────────────────────────── */
  function calcSIPMetrics(sip, currentNAV) {
    const start   = new Date(sip.startDate);
    const today   = new Date();
    const months  = Math.max(monthsBetween(sip.startDate, today.toISOString().slice(0, 10)), 1);
    const monthly = sip.monthlyAmount;
    const invested = monthly * months;

    // Simplified unit accumulation: assume constant NAV at navAtStart for all historical
    // purchases, then current NAV for the terminal value. This is a reasonable
    // approximation when historical per-month NAVs are unavailable.
    const navAtStart = sip.navAtStart || currentNAV;
    // Each SIP instalment bought units at navAtStart (conservative simplification)
    const totalUnits = (invested / navAtStart);
    const currentValue = totalUnits * currentNAV;
    const pnlAmt = currentValue - invested;
    const pnlPct = invested > 0 ? (pnlAmt / invested) * 100 : 0;

    // Build monthly cash flows for XIRR
    const cfs = [];
    for (let m = 0; m < months; m++) {
      const d = new Date(start);
      d.setMonth(d.getMonth() + m);
      cfs.push({ amount: -monthly, date: d.toISOString().slice(0, 10) });
    }
    cfs.push({ amount: currentValue, date: today.toISOString().slice(0, 10) });

    const xirrRate = months >= 3 ? xirr(cfs) : null;

    return {
      months,
      invested,
      totalUnits,
      currentValue,
      pnlAmt,
      pnlPct,
      xirr: xirrRate !== null ? xirrRate * 100 : null,
    };
  }

  /* ── Context push ───────────────────────────────────────────────── */
  function pushToContext(portfolio, totals) {
    localStorage.setItem('finos_sip_value', totals.currentValue.toString());
    localStorage.setItem('finos_sip_invested', totals.invested.toString());
    if (window.FinosContext?.update) {
      window.FinosContext.update({ sipPortfolio: portfolio, sipTotals: totals });
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     PORTFOLIO RENDERER
  ═══════════════════════════════════════════════════════════════════ */
  async function renderPortfolio(container) {
    if (!container) return;
    container.innerHTML = _portfolioSkeleton();

    const portfolio = load();
    const navData   = {};

    // Fetch live NAVs in parallel
    await Promise.all(portfolio.map(async sip => {
      if (sip.schemeCode) {
        navData[sip.schemeCode] = await fetchNAV(sip.schemeCode);
      }
    }));

    // Compute metrics
    let totalInvested = 0, totalCurrent = 0;
    const enriched = portfolio.map(sip => {
      const info = navData[sip.schemeCode];
      const currentNAV = info?.nav ?? sip.navAtStart ?? 100;
      const metrics = calcSIPMetrics(sip, currentNAV);
      totalInvested += metrics.invested;
      totalCurrent  += metrics.currentValue;
      return { ...sip, metrics, currentNAV, fundInfo: info };
    });

    const totalPnL   = totalCurrent - totalInvested;
    const totalPnLPct = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;
    const overallColor = totalPnL >= 0 ? '#22D3A6' : '#FF4444';

    pushToContext(enriched, { invested: totalInvested, currentValue: totalCurrent, pnl: totalPnL });

    container.innerHTML = `
      <style>
        .sip-summary-row { display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px; }
        .sip-pill { background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:14px 18px;flex:1;min-width:130px; }
        .sip-pill-label { font-size:10px;font-weight:700;color:var(--text-muted,#8892A4);text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px; }
        .sip-pill-value { font-size:20px;font-weight:800;color:var(--text-primary,#F5F7FA); }
        .sip-card { background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:16px;padding:16px;margin-bottom:12px;position:relative; }
        .sip-card-header { display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px; }
        .sip-card-name { font-size:14px;font-weight:800;color:var(--text-primary,#F5F7FA);margin-bottom:2px;max-width:340px;line-height:1.3; }
        .sip-card-sub { font-size:11px;color:var(--text-muted,#8892A4); }
        .sip-card-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px;margin-top:10px; }
        .sip-metric { }
        .sip-metric-label { font-size:10px;font-weight:700;color:var(--text-muted,#8892A4);text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px; }
        .sip-metric-value { font-size:14px;font-weight:700;color:var(--text-primary,#F5F7FA); }
        .sip-del-btn { background:none;border:none;color:rgba(255,68,68,.5);cursor:pointer;font-size:16px;padding:4px 8px;border-radius:6px;transition:.15s; }
        .sip-del-btn:hover { background:rgba(255,68,68,.1);color:#FF4444; }
        .sip-add-btn { display:inline-flex;align-items:center;gap:6px;padding:10px 18px;border-radius:12px;background:rgba(0,212,255,.1);border:1px solid rgba(0,212,255,.3);color:#00D4FF;font-size:13px;font-weight:700;cursor:pointer;transition:.2s; }
        .sip-add-btn:hover { background:rgba(0,212,255,.18); }
        .sip-refresh-btn { display:inline-flex;align-items:center;gap:6px;padding:10px 16px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);color:rgba(255,255,255,.6);font-size:12px;font-weight:700;cursor:pointer;transition:.2s; }
        .sip-refresh-btn:hover { background:rgba(255,255,255,.07); }
        .sip-empty { text-align:center;padding:40px;color:var(--text-muted,#8892A4);font-size:13px; }
        .sip-category-tag { display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:.4px;text-transform:uppercase; }
        .bar-invested { height:6px;border-radius:3px;background:rgba(255,255,255,.12);overflow:hidden;margin-top:8px; }
        .bar-current { height:100%;border-radius:3px;background:linear-gradient(90deg,#00D4FF,#22D3A6);transition:width .6s ease; }
      </style>

      <!-- Summary pills -->
      <div class="sip-summary-row">
        <div class="sip-pill">
          <div class="sip-pill-label">Total Invested</div>
          <div class="sip-pill-value">${INR(totalInvested)}</div>
        </div>
        <div class="sip-pill">
          <div class="sip-pill-label">Current Value</div>
          <div class="sip-pill-value">${INR(totalCurrent)}</div>
        </div>
        <div class="sip-pill">
          <div class="sip-pill-label">Total P&L</div>
          <div class="sip-pill-value" style="color:${overallColor};">${totalPnL>=0?'+':''}${INR(Math.abs(totalPnL))}</div>
          <div style="font-size:11px;color:${overallColor};margin-top:2px;">${pct(totalPnLPct)}</div>
        </div>
        <div class="sip-pill">
          <div class="sip-pill-label">SIPs Running</div>
          <div class="sip-pill-value">${portfolio.length}</div>
        </div>
      </div>

      <!-- Action row -->
      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
        <button class="sip-add-btn" onclick="FinosSIPTracker._openAddModal()">+ Add SIP</button>
        <button class="sip-refresh-btn" onclick="FinosSIPTracker.renderPortfolio(document.getElementById('tab-my-sips'))">
          🔄 Refresh NAVs
        </button>
      </div>

      <!-- SIP cards -->
      <div id="sip-cards-list">
        ${enriched.length === 0 ? `
          <div class="sip-empty">
            <div style="font-size:32px;margin-bottom:10px;">📈</div>
            <div style="font-weight:700;margin-bottom:6px;">No SIPs tracked yet</div>
            <div>Click "Add SIP" to start tracking your mutual fund investments with live NAV.</div>
          </div>
        ` : enriched.map(sip => _sipCard(sip)).join('')}
      </div>

      <div style="font-size:11px;color:rgba(255,255,255,.2);text-align:right;margin-top:12px;">
        NAV data from AMFI · Updated daily · Values are indicative
      </div>`;
  }

  function _sipCard(sip) {
    const m = sip.metrics;
    const c = m.pnlAmt >= 0 ? '#22D3A6' : '#FF4444';
    const barWidth = m.invested > 0 ? Math.min((m.currentValue / m.invested) * 100, 200).toFixed(1) : '0';
    const catColors = {
      large_cap: '#00D4FF', mid_cap: '#7B2FF7', small_cap: '#F0A500',
      flexi_cap: '#22D3A6', elss: '#FF8C42', index: '#4DB8FF',
      debt: '#8892A4', hybrid: '#A78BFA', international: '#34D399',
    };
    const catColor = catColors[sip.category] || '#8892A4';
    const catLabel = (sip.category || 'fund').replace(/_/g, ' ');

    return `
      <div class="sip-card">
        <div class="sip-card-header">
          <div>
            <div class="sip-card-name">${sip.fundName}</div>
            <div class="sip-card-sub">
              <span class="sip-category-tag" style="background:${catColor}22;color:${catColor};">${catLabel}</span>
              &nbsp;·&nbsp; Since ${new Date(sip.startDate).toLocaleDateString('en-IN', {month:'short', year:'numeric'})}
              &nbsp;·&nbsp; ${m.months} months
              ${sip.schemeCode ? `&nbsp;·&nbsp; Scheme #${sip.schemeCode}` : ''}
            </div>
          </div>
          <button class="sip-del-btn" onclick="FinosSIPTracker._deleteSIP('${sip.id}')" title="Remove">×</button>
        </div>

        <div class="sip-card-grid">
          <div class="sip-metric">
            <div class="sip-metric-label">Monthly SIP</div>
            <div class="sip-metric-value">${INR(sip.monthlyAmount)}</div>
          </div>
          <div class="sip-metric">
            <div class="sip-metric-label">Invested</div>
            <div class="sip-metric-value">${INR(m.invested)}</div>
          </div>
          <div class="sip-metric">
            <div class="sip-metric-label">Current Value</div>
            <div class="sip-metric-value">${INR(m.currentValue)}</div>
          </div>
          <div class="sip-metric">
            <div class="sip-metric-label">P&L</div>
            <div class="sip-metric-value" style="color:${c};">${m.pnlAmt>=0?'+':''}${INR(Math.abs(m.pnlAmt))}</div>
            <div style="font-size:10px;color:${c};">${pct(m.pnlPct)}</div>
          </div>
          <div class="sip-metric">
            <div class="sip-metric-label">Live NAV</div>
            <div class="sip-metric-value">₹${sip.currentNAV?.toFixed(4) ?? '—'}</div>
          </div>
          <div class="sip-metric">
            <div class="sip-metric-label">XIRR</div>
            <div class="sip-metric-value" style="color:${(m.xirr||0)>=12?'#22D3A6':(m.xirr||0)>=6?'#F0A500':'#FF4444'};">
              ${m.xirr !== null ? pct(m.xirr) : 'Need 3m+'}
            </div>
          </div>
        </div>

        <!-- Progress bar: invested vs current -->
        <div class="bar-invested" title="${INR(m.currentValue)} of ${INR(m.invested)} invested">
          <div class="bar-current" style="width:${Math.min(parseFloat(barWidth),100)}%;background:${m.pnlAmt>=0?'linear-gradient(90deg,#00D4FF,#22D3A6)':'linear-gradient(90deg,#FF4444,#FF6B6B)'};"></div>
        </div>
      </div>`;
  }

  /* ── Add SIP Modal ──────────────────────────────────────────────── */
  let _addModalOpen = false;

  async function _openAddModal() {
    if (_addModalOpen) return;
    _addModalOpen = true;

    const modal = document.createElement('div');
    modal.id = 'sip-add-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;padding:20px;';
    modal.innerHTML = `
      <div style="background:linear-gradient(145deg,#0d0f1a,#0f1525);border:1px solid rgba(0,212,255,.2);border-radius:20px;padding:28px;max-width:480px;width:100%;font-family:-apple-system,sans-serif;max-height:90vh;overflow-y:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
          <div style="font-size:17px;font-weight:800;color:#F5F7FA;">+ Add SIP Investment</div>
          <button onclick="FinosSIPTracker._closeAddModal()" style="background:none;border:none;color:#8892A4;font-size:22px;cursor:pointer;line-height:1;">×</button>
        </div>

        <!-- Fund search -->
        <div style="margin-bottom:14px;">
          <label style="font-size:11px;font-weight:700;color:#8892A4;text-transform:uppercase;letter-spacing:.6px;display:block;margin-bottom:6px;">Fund Name</label>
          <input id="sip-fund-search" type="text" placeholder="Search e.g. HDFC Flexi Cap, Mirae Small Cap…"
            style="width:100%;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#F5F7FA;font-size:13px;box-sizing:border-box;outline:none;"
            oninput="FinosSIPTracker._onFundSearch(this.value)" autocomplete="off">
          <div id="sip-fund-results" style="margin-top:6px;max-height:200px;overflow-y:auto;border-radius:10px;border:1px solid rgba(255,255,255,.07);display:none;background:#0d0f1a;"></div>
          <div id="sip-selected-fund" style="margin-top:8px;font-size:12px;color:#00D4FF;font-weight:700;min-height:18px;"></div>
        </div>

        <!-- Monthly amount -->
        <div style="margin-bottom:14px;">
          <label style="font-size:11px;font-weight:700;color:#8892A4;text-transform:uppercase;letter-spacing:.6px;display:block;margin-bottom:6px;">Monthly SIP Amount (₹)</label>
          <input id="sip-amount" type="number" min="100" step="100" placeholder="5000"
            style="width:100%;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#F5F7FA;font-size:13px;box-sizing:border-box;outline:none;">
        </div>

        <!-- Start date -->
        <div style="margin-bottom:14px;">
          <label style="font-size:11px;font-weight:700;color:#8892A4;text-transform:uppercase;letter-spacing:.6px;display:block;margin-bottom:6px;">SIP Start Date</label>
          <input id="sip-start-date" type="month"
            style="width:100%;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#F5F7FA;font-size:13px;box-sizing:border-box;outline:none;"
            max="${new Date().toISOString().slice(0, 7)}" value="${new Date(Date.now() - 86400000*365).toISOString().slice(0,7)}">
        </div>

        <!-- Category -->
        <div style="margin-bottom:20px;">
          <label style="font-size:11px;font-weight:700;color:#8892A4;text-transform:uppercase;letter-spacing:.6px;display:block;margin-bottom:6px;">Fund Category</label>
          <select id="sip-category"
            style="width:100%;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#F5F7FA;font-size:13px;box-sizing:border-box;outline:none;appearance:auto;">
            <option value="large_cap">Large Cap</option>
            <option value="mid_cap">Mid Cap</option>
            <option value="small_cap">Small Cap</option>
            <option value="flexi_cap" selected>Flexi Cap</option>
            <option value="elss">ELSS (Tax Saver)</option>
            <option value="index">Index Fund</option>
            <option value="hybrid">Hybrid</option>
            <option value="debt">Debt</option>
            <option value="international">International</option>
          </select>
        </div>

        <button onclick="FinosSIPTracker._saveSIP()"
          style="width:100%;padding:13px;border-radius:12px;background:linear-gradient(135deg,rgba(0,212,255,.3),rgba(34,211,166,.2));border:1px solid rgba(0,212,255,.4);color:#00D4FF;font-size:14px;font-weight:800;cursor:pointer;transition:.2s;">
          Save SIP
        </button>

        <div id="sip-save-status" style="margin-top:10px;font-size:12px;text-align:center;color:#8892A4;min-height:18px;"></div>
      </div>`;

    document.body.appendChild(modal);
  }

  function _closeAddModal() {
    document.getElementById('sip-add-modal')?.remove();
    _addModalOpen = false;
    FinosSIPTracker._searchTimer = null;
    FinosSIPTracker._pendingScheme = null;
  }

  let _searchTimer = null;
  let _pendingScheme = null;

  async function _onFundSearch(val) {
    clearTimeout(_searchTimer);
    const resultsEl = document.getElementById('sip-fund-results');
    const selectedEl = document.getElementById('sip-selected-fund');

    if (!val.trim() || val.length < 2) {
      if (resultsEl) resultsEl.style.display = 'none';
      return;
    }

    _searchTimer = setTimeout(async () => {
      const results = await searchFunds(val);
      if (!resultsEl) return;

      if (!results.length) {
        resultsEl.innerHTML = `<div style="padding:10px 12px;font-size:12px;color:#8892A4;">No funds found — try a different name</div>`;
        resultsEl.style.display = 'block';
        return;
      }

      resultsEl.innerHTML = results.map(r => `
        <div onclick="FinosSIPTracker._selectFund(${r.scheme_code || 0}, '${(r.scheme_name||'').replace(/'/g,"\\'")}', ${r.nav || 0})"
          style="padding:10px 12px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.04);font-size:12px;transition:.1s;"
          onmouseover="this.style.background='rgba(255,255,255,.04)'" onmouseout="this.style.background=''">
          <div style="font-weight:700;color:#F5F7FA;margin-bottom:2px;">${r.scheme_name}</div>
          <div style="color:#8892A4;">${r.fund_house || ''} · NAV ₹${r.nav || '—'} · Code ${r.scheme_code || '—'}</div>
        </div>`).join('');
      resultsEl.style.display = 'block';
    }, 320);
  }

  function _selectFund(schemeCode, schemeName, nav) {
    _pendingScheme = { schemeCode, schemeName, navAtStart: nav };
    const input = document.getElementById('sip-fund-search');
    const resultsEl = document.getElementById('sip-fund-results');
    const selectedEl = document.getElementById('sip-selected-fund');
    if (input) input.value = schemeName;
    if (resultsEl) resultsEl.style.display = 'none';
    if (selectedEl) selectedEl.textContent = `✓ Scheme #${schemeCode} · Current NAV ₹${nav}`;
  }

  async function _saveSIP() {
    const statusEl = document.getElementById('sip-save-status');

    const fundSearchVal = document.getElementById('sip-fund-search')?.value?.trim();
    const amountVal = parseFloat(document.getElementById('sip-amount')?.value || '0');
    const startVal  = document.getElementById('sip-start-date')?.value;
    const catVal    = document.getElementById('sip-category')?.value || 'flexi_cap';

    if (!fundSearchVal) { if (statusEl) statusEl.textContent = '⚠️ Enter a fund name'; return; }
    if (!amountVal || amountVal < 100) { if (statusEl) statusEl.textContent = '⚠️ Enter a valid SIP amount (min ₹100)'; return; }
    if (!startVal) { if (statusEl) statusEl.textContent = '⚠️ Select a start date'; return; }

    if (statusEl) statusEl.textContent = 'Fetching live NAV…';

    let schemeCode = _pendingScheme?.schemeCode || null;
    let navAtStart = _pendingScheme?.navAtStart || null;

    // If no scheme selected from search, try to search by the typed name
    if (!schemeCode && fundSearchVal.length >= 2) {
      const results = await searchFunds(fundSearchVal);
      if (results.length) {
        schemeCode = results[0].scheme_code;
        navAtStart = results[0].nav;
      }
    }

    const portfolio = load();
    const sip = {
      id:            `sip_${Date.now()}`,
      fundName:      _pendingScheme?.schemeName || fundSearchVal,
      schemeCode:    schemeCode || null,
      monthlyAmount: amountVal,
      startDate:     startVal + '-01',
      category:      catVal,
      navAtStart:    navAtStart || 100,
      addedAt:       new Date().toISOString(),
    };

    portfolio.push(sip);
    save(portfolio);

    if (statusEl) statusEl.textContent = '✅ SIP saved!';
    setTimeout(() => {
      _closeAddModal();
      FinosSIPTracker.renderPortfolio(document.getElementById('tab-my-sips'));
    }, 600);
  }

  function _deleteSIP(id) {
    if (!confirm('Remove this SIP from your tracker?')) return;
    const portfolio = load().filter(s => s.id !== id);
    save(portfolio);
    FinosSIPTracker.renderPortfolio(document.getElementById('tab-my-sips'));
  }

  function _portfolioSkeleton() {
    return `<div style="text-align:center;padding:40px;color:#8892A4;font-size:13px;">Loading NAVs…</div>`;
  }

  /* ═══════════════════════════════════════════════════════════════════
     FUND SEARCH RENDERER
  ═══════════════════════════════════════════════════════════════════ */
  function renderFundSearch(container) {
    if (!container) return;
    container.innerHTML = `
      <style>
        .nav-search-box { display:flex;gap:8px;margin-bottom:16px; }
        .nav-search-input { flex:1;padding:11px 14px;border-radius:12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#F5F7FA;font-size:13px;outline:none;font-family:inherit; }
        .nav-search-btn { padding:11px 20px;border-radius:12px;background:rgba(0,212,255,.12);border:1px solid rgba(0,212,255,.3);color:#00D4FF;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap; }
        .nav-search-btn:hover { background:rgba(0,212,255,.22); }
        .nav-result-card { background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:14px;padding:14px 16px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px; }
        .nav-result-name { font-size:13px;font-weight:700;color:#F5F7FA;margin-bottom:3px; }
        .nav-result-sub  { font-size:11px;color:#8892A4; }
        .nav-value-pill  { font-size:18px;font-weight:800;color:#F5F7FA;text-align:right; }
        .nav-add-sip-btn { padding:7px 14px;border-radius:10px;background:rgba(0,212,255,.1);border:1px solid rgba(0,212,255,.25);color:#00D4FF;font-size:11px;font-weight:700;cursor:pointer;transition:.2s;white-space:nowrap; }
        .nav-add-sip-btn:hover { background:rgba(0,212,255,.2); }
        #nav-search-results { min-height:40px; }
      </style>

      <p style="font-size:13px;color:#8892A4;margin-bottom:16px;">
        Search any mutual fund by name to see its live NAV from AMFI's daily feed.
      </p>

      <div class="nav-search-box">
        <input class="nav-search-input" id="nav-search-input" type="text"
          placeholder="e.g. Parag Parikh Flexi Cap, SBI Small Cap, Mirae…"
          onkeydown="if(event.key==='Enter') FinosSIPTracker._runFundSearch()">
        <button class="nav-search-btn" onclick="FinosSIPTracker._runFundSearch()">Search</button>
      </div>

      <div id="nav-search-results"></div>

      <div style="font-size:11px;color:rgba(255,255,255,.2);margin-top:16px;">
        Data sourced from AMFI NAVAll.txt · Updated daily after 5pm
      </div>`;
  }

  async function _runFundSearch() {
    const input = document.getElementById('nav-search-input');
    const results = document.getElementById('nav-search-results');
    if (!input || !results) return;
    const q = input.value.trim();
    if (!q) return;

    results.innerHTML = `<div style="padding:20px;text-align:center;color:#8892A4;font-size:12px;">Searching AMFI…</div>`;

    const funds = await searchFunds(q);
    if (!funds.length) {
      results.innerHTML = `<div style="padding:20px;text-align:center;color:#8892A4;font-size:12px;">No funds found. Try a shorter search term.</div>`;
      return;
    }

    results.innerHTML = funds.map(f => `
      <div class="nav-result-card">
        <div>
          <div class="nav-result-name">${f.scheme_name}</div>
          <div class="nav-result-sub">${f.fund_house || ''} &nbsp;·&nbsp; Code: ${f.scheme_code || '—'} &nbsp;·&nbsp; ${f.scheme_type || ''}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
          <div class="nav-value-pill">₹${f.nav ? Number(f.nav).toFixed(4) : '—'}</div>
          <div style="font-size:10px;color:#8892A4;">NAV as of ${f.date || 'latest'}</div>
          <button class="nav-add-sip-btn"
            onclick="FinosSIPTracker._prefillAndOpenModal(${f.scheme_code||0}, '${(f.scheme_name||'').replace(/'/g,"\\'")}', ${f.nav||0})">
            + Track SIP
          </button>
        </div>
      </div>`).join('');
  }

  function _prefillAndOpenModal(schemeCode, schemeName, nav) {
    _pendingScheme = { schemeCode, schemeName, navAtStart: nav };
    _openAddModal();
    setTimeout(() => {
      const input = document.getElementById('sip-fund-search');
      const sel   = document.getElementById('sip-selected-fund');
      if (input) input.value = schemeName;
      if (sel)   sel.textContent = `✓ Scheme #${schemeCode} · Current NAV ₹${nav}`;
    }, 100);
  }

  /* ── Public API ─────────────────────────────────────────────────── */
  const FinosSIPTracker = {
    renderPortfolio,
    renderFundSearch,
    getPortfolio: load,
    refresh: () => renderPortfolio(document.getElementById('tab-my-sips')),
    _openAddModal,
    _closeAddModal,
    _onFundSearch,
    _selectFund,
    _saveSIP,
    _deleteSIP,
    _runFundSearch,
    _prefillAndOpenModal,
    _searchTimer,
    _pendingScheme,
  };

  global.FinosSIPTracker = FinosSIPTracker;

}(window));
