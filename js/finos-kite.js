/**
 * finos-kite.js — Zerodha Kite Connect live portfolio sync (Phase 19)
 *
 * Replaces the CSV upload flow in portfolio.html with a one-click OAuth
 * connection that pulls live holdings, positions, and fund margins directly
 * from Zerodha's Kite Connect API.
 *
 * Architecture:
 *   Browser ──OAuth popup──▶ Zerodha kite.zerodha.com
 *   Zerodha ──redirect──▶ arya-ai :7475/api/kite/callback
 *   arya-ai ──postMessage──▶ this module (access_token)
 *   this module ──GET──▶ arya-ai :7475/api/kite/holdings (proxied)
 *   this module ──push──▶ finos-context.js (window.FinosContext)
 *
 * Usage (from any page):
 *   FinosKite.renderConnectPanel('kite-panel-container');
 *   FinosKite.connect();               // triggers OAuth popup
 *   FinosKite.sync();                  // fetches live data (token required)
 *   FinosKite.isConnected()            // → boolean
 *   FinosKite.getHoldings()            // → cached array or null
 *
 * Setup (one-time):
 *   1. Create an app at https://developers.kite.trade/
 *   2. Set redirect_uri: http://localhost:7475/api/kite/callback
 *   3. Add KITE_API_KEY + KITE_API_SECRET to arya-ai/.env
 *   4. Restart arya-ai
 */
(function (global) {
  'use strict';

  const ARYA_BASE   = 'http://localhost:7475';
  const TOKEN_KEY   = 'finos_kite_access_token';
  const TOKEN_TS    = 'finos_kite_token_ts';
  const CACHE_KEY   = 'finos_kite_holdings_cache';
  const CACHE_TS    = 'finos_kite_holdings_ts';
  const MARGINS_KEY = 'finos_kite_margins_cache';
  const STALE_MS    = 5 * 60 * 1000;    // 5-minute holdings cache
  const TOKEN_TTL   = 8 * 60 * 60 * 1000; // token valid until market-day rollover (~8h)

  /* ── Internals ──────────────────────────────────────────────────────── */
  function _token() { return localStorage.getItem(TOKEN_KEY); }

  function _isTokenFresh() {
    const ts = parseInt(localStorage.getItem(TOKEN_TS) || '0', 10);
    return Date.now() - ts < TOKEN_TTL;
  }

  function _headers() {
    return { 'X-Kite-Token': _token(), 'Content-Type': 'application/json' };
  }

  async function _get(path, timeout = 8000) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(`${ARYA_BASE}${path}`, {
        headers: _headers(), signal: ctrl.signal,
      });
      clearTimeout(id);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || res.statusText);
      }
      return res.json();
    } catch (e) {
      clearTimeout(id);
      throw e;
    }
  }

  function _toast(msg, type = 'info') {
    if (window.FinosToast?.show) { window.FinosToast.show(msg, type); return; }
    const el = document.createElement('div');
    el.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
      background:#0D1117;border:1px solid rgba(0,212,255,.3);border-radius:12px;
      padding:10px 18px;font-size:13px;color:#F5F7FA;z-index:99999;font-family:-apple-system,sans-serif;`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  /* ── OAuth popup ────────────────────────────────────────────────────── */
  function _handlePostMessage(event) {
    if (!event.data || typeof event.data !== 'object') return;

    if (event.data.type === 'kite_auth_success') {
      const { access_token, user_name, login_time } = event.data;
      if (!access_token) { _toast('⚠️ Auth failed — no token received', 'error'); return; }

      localStorage.setItem(TOKEN_KEY, access_token);
      localStorage.setItem(TOKEN_TS, Date.now().toString());
      if (user_name) localStorage.setItem('finos_kite_user_name', user_name);

      window.removeEventListener('message', _handlePostMessage);
      _toast(`✅ Zerodha connected${user_name ? ' — ' + user_name : ''}. Syncing…`, 'success');

      // Auto-sync immediately after connect
      FinosKite.sync().catch(() => {});
      FinosKite.renderConnectPanel(_lastPanelId);

    } else if (event.data.type === 'kite_auth_error') {
      window.removeEventListener('message', _handlePostMessage);
      _toast(`❌ Kite auth failed: ${event.data.error}`, 'error');
    }
  }

  let _lastPanelId = null;

  /* ── Public API ─────────────────────────────────────────────────────── */
  const FinosKite = {

    isConnected() {
      return Boolean(_token()) && _isTokenFresh();
    },

    getHoldings() {
      try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); }
      catch { return null; }
    },

    /** Open Zerodha OAuth popup. */
    async connect() {
      // Check arya-ai has Kite credentials configured
      let loginUrl;
      try {
        const status = await fetch(`${ARYA_BASE}/api/kite/status`).then(r => r.json());
        if (!status.configured) {
          _showSetupModal();
          return;
        }
        loginUrl = status.login_url;
      } catch {
        _toast('⚠️ arya-ai is not reachable on :7475', 'error');
        return;
      }

      window.addEventListener('message', _handlePostMessage);
      const popup = window.open(
        loginUrl,
        'kite_login',
        'width=500,height=700,scrollbars=yes,resizable=yes',
      );
      if (!popup) {
        _toast('⚠️ Please allow popups for this page to connect Zerodha.', 'error');
        window.removeEventListener('message', _handlePostMessage);
      }
    },

    /** Disconnect — revoke local token (Kite has no server-side revoke endpoint). */
    disconnect() {
      if (!confirm('Disconnect Zerodha? Your local holdings cache will be cleared.')) return;
      [TOKEN_KEY, TOKEN_TS, CACHE_KEY, CACHE_TS, MARGINS_KEY, 'finos_kite_user_name']
        .forEach(k => localStorage.removeItem(k));
      _toast('Disconnected from Zerodha.', 'info');
      FinosKite.renderConnectPanel(_lastPanelId);
    },

    /** Fetch live holdings + margins and push to finos-context. */
    async sync() {
      if (!_token()) { _toast('Connect Zerodha first.', 'error'); return; }

      try {
        const [holdingRes, marginRes] = await Promise.all([
          _get('/api/kite/holdings'),
          _get('/api/kite/margins'),
        ]);

        const holdings = holdingRes.data || [];
        const margins  = marginRes.data  || {};

        // Cache locally
        localStorage.setItem(CACHE_KEY, JSON.stringify(holdings));
        localStorage.setItem(CACHE_TS,  Date.now().toString());
        localStorage.setItem(MARGINS_KEY, JSON.stringify(margins));

        // Push to finos-context.js
        _syncToContext(holdings, margins);

        _toast(`✅ Synced ${holdings.length} holdings from Zerodha`, 'success');
        document.dispatchEvent(new CustomEvent('kite-sync-complete', { detail: { holdings, margins } }));
        return { holdings, margins };

      } catch (err) {
        _toast(`❌ Sync failed: ${err.message}`, 'error');
        throw err;
      }
    },

    /** Auto-sync if token exists and cache is stale. */
    autoSync() {
      if (!this.isConnected()) return;
      const lastSync = parseInt(localStorage.getItem(CACHE_TS) || '0', 10);
      if (Date.now() - lastSync > STALE_MS) {
        setTimeout(() => this.sync().catch(() => {}), 2000);
      }
    },

    /**
     * Render the Kite connect panel into the given container element.
     * Shows "Connect Zerodha" when disconnected, live holdings table when connected.
     */
    renderConnectPanel(containerId) {
      _lastPanelId = containerId;
      const container = typeof containerId === 'string'
        ? document.getElementById(containerId)
        : containerId;
      if (!container) return;

      if (!this.isConnected()) {
        _renderConnectButton(container);
      } else {
        _renderHoldingsTable(container);
      }
    },
  };

  /* ── UI: Connect button ─────────────────────────────────────────────── */
  function _renderConnectButton(container) {
    const userName = localStorage.getItem('finos_kite_user_name');
    container.innerHTML = `
      <style>
        .kite-panel { font-family:-apple-system,sans-serif; }
        .kite-hero { background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:32px;text-align:center;margin-bottom:16px; }
        .kite-logo { font-size:48px;margin-bottom:12px; }
        .kite-title { font-size:20px;font-weight:800;color:#F5F7FA;margin-bottom:6px; }
        .kite-sub { font-size:13px;color:#8892A4;max-width:380px;margin:0 auto 24px; }
        .kite-btn { display:inline-block;padding:12px 28px;border-radius:12px;font-size:14px;font-weight:800;cursor:pointer;border:none;transition:all .2s; }
        .kite-btn-primary { background:linear-gradient(135deg,#387ed1,#4d95e8);color:#fff; }
        .kite-btn-primary:hover { transform:translateY(-1px);box-shadow:0 4px 16px rgba(56,126,209,.4); }
        .kite-steps { display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin-top:20px; }
        .kite-step { font-size:12px;color:#8892A4;display:flex;align-items:center;gap:6px; }
        .kite-setup-link { font-size:12px;color:rgba(255,255,255,.3);margin-top:14px;display:block; }
      </style>
      <div class="kite-panel">
        <div class="kite-hero">
          <div class="kite-logo">🔐</div>
          <div class="kite-title">Connect Zerodha (Live Sync)</div>
          <div class="kite-sub">
            Import your actual holdings, positions, and fund margins directly
            from Zerodha — no CSV upload needed.
          </div>
          <button class="kite-btn kite-btn-primary" onclick="window.FinosKite.connect()">
            Connect with Zerodha
          </button>
          <div class="kite-steps">
            <span class="kite-step">🔒 RBI-compliant OAuth</span>
            <span class="kite-step">📊 Live P&L, holdings, margins</span>
            <span class="kite-step">🔄 Auto-refresh every 5 min</span>
          </div>
          <a class="kite-setup-link" href="https://developers.kite.trade/" target="_blank" rel="noopener">
            First time? Create a Kite Connect app →
          </a>
        </div>
        <div style="font-size:11px;color:rgba(255,255,255,.2);text-align:center;">
          Your access token is stored locally and expires at end of trading day.
          FIN·OS never stores your credentials.
        </div>
      </div>
    `;
  }

  /* ── UI: Holdings table ─────────────────────────────────────────────── */
  function _renderHoldingsTable(container) {
    const holdings = FinosKite.getHoldings() || [];
    const userName = localStorage.getItem('finos_kite_user_name') || 'You';
    const margins  = JSON.parse(localStorage.getItem(MARGINS_KEY) || '{}');
    const equity   = margins.equity || {};
    const lastSync = localStorage.getItem(CACHE_TS)
      ? new Date(parseInt(localStorage.getItem(CACHE_TS))).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
      : '—';

    const totalInvested = holdings.reduce((s, h) => s + (h.average_price * h.quantity), 0);
    const totalCurrent  = holdings.reduce((s, h) => s + (h.last_price * h.quantity), 0);
    const totalPnL      = totalCurrent - totalInvested;
    const pnlPct        = totalInvested > 0 ? ((totalPnL / totalInvested) * 100).toFixed(1) : '0.0';
    const pnlColor      = totalPnL >= 0 ? '#22D3A6' : '#FF4444';

    const rows = holdings.map(h => {
      const invested = h.average_price * h.quantity;
      const current  = h.last_price * h.quantity;
      const pnl      = current - invested;
      const pnlPctH  = invested > 0 ? ((pnl / invested) * 100).toFixed(1) : '0.0';
      const color    = pnl >= 0 ? '#22D3A6' : '#FF4444';
      const dayColor = (h.day_change_percentage || 0) >= 0 ? '#22D3A6' : '#FF4444';
      return `
        <tr>
          <td style="font-weight:700;color:#F5F7FA;">${h.tradingsymbol}</td>
          <td style="color:#8892A4;">${h.exchange}</td>
          <td style="text-align:right;">${h.quantity}</td>
          <td style="text-align:right;color:#8892A4;">₹${h.average_price.toLocaleString('en-IN',{maximumFractionDigits:2})}</td>
          <td style="text-align:right;color:#F5F7FA;">₹${h.last_price.toLocaleString('en-IN',{maximumFractionDigits:2})}</td>
          <td style="text-align:right;color:${dayColor};">${(h.day_change_percentage||0)>=0?'+':''}${(h.day_change_percentage||0).toFixed(2)}%</td>
          <td style="text-align:right;color:#F5F7FA;">₹${current.toLocaleString('en-IN',{maximumFractionDigits:0})}</td>
          <td style="text-align:right;color:${color};font-weight:700;">
            ${pnl>=0?'+':''}₹${Math.abs(pnl).toLocaleString('en-IN',{maximumFractionDigits:0})}
            <span style="font-size:10px;opacity:.7;">(${pnl>=0?'+':''}${pnlPctH}%)</span>
          </td>
        </tr>`;
    }).join('');

    container.innerHTML = `
      <style>
        .kite-table-wrap { overflow-x:auto; }
        .kite-holdings-table { width:100%;border-collapse:collapse;font-size:12px;font-family:-apple-system,sans-serif; }
        .kite-holdings-table th { font-size:10px;font-weight:700;color:#8892A4;text-transform:uppercase;letter-spacing:.6px;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.06); }
        .kite-holdings-table td { padding:10px 10px;border-bottom:1px solid rgba(255,255,255,.04);color:#F5F7FA; }
        .kite-holdings-table tr:hover td { background:rgba(255,255,255,.02); }
        .kite-summary-row { display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px; }
        .kite-summary-pill { background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:12px 16px;flex:1;min-width:140px; }
        .kite-summary-label { font-size:10px;font-weight:700;color:#8892A4;text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px; }
        .kite-summary-value { font-size:18px;font-weight:800;color:#F5F7FA; }
        .kite-actions { display:flex;gap:8px;margin-bottom:16px; }
        .kite-action-btn { padding:8px 16px;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;border:1px solid; }
      </style>
      <div style="font-family:-apple-system,sans-serif;">
        <!-- Summary pills -->
        <div class="kite-summary-row">
          <div class="kite-summary-pill">
            <div class="kite-summary-label">Portfolio Value</div>
            <div class="kite-summary-value">₹${totalCurrent.toLocaleString('en-IN',{maximumFractionDigits:0})}</div>
          </div>
          <div class="kite-summary-pill">
            <div class="kite-summary-label">Total P&L</div>
            <div class="kite-summary-value" style="color:${pnlColor};">${totalPnL>=0?'+':''}₹${Math.abs(totalPnL).toLocaleString('en-IN',{maximumFractionDigits:0})}</div>
            <div style="font-size:11px;color:${pnlColor};margin-top:2px;">${totalPnL>=0?'+':''}${pnlPct}% overall</div>
          </div>
          <div class="kite-summary-pill">
            <div class="kite-summary-label">Available Margin</div>
            <div class="kite-summary-value" style="color:#00D4FF;">₹${((equity.available||{}).live_balance||0).toLocaleString('en-IN',{maximumFractionDigits:0})}</div>
          </div>
          <div class="kite-summary-pill" style="min-width:120px;">
            <div class="kite-summary-label">Holdings</div>
            <div class="kite-summary-value">${holdings.length}</div>
            <div style="font-size:11px;color:#8892A4;margin-top:2px;">synced ${lastSync}</div>
          </div>
        </div>

        <!-- Action row -->
        <div class="kite-actions">
          <button class="kite-action-btn" style="background:rgba(0,212,255,.1);border-color:rgba(0,212,255,.3);color:#00D4FF;"
            onclick="window.FinosKite.sync().then(()=>window.FinosKite.renderConnectPanel('${_lastPanelId}'))">
            🔄 Sync Now
          </button>
          <button class="kite-action-btn" style="background:rgba(34,211,166,.08);border-color:rgba(34,211,166,.25);color:#22D3A6;"
            onclick="window.FinosKite._openPositions()">
            📊 Positions
          </button>
          <button class="kite-action-btn" style="background:transparent;border-color:rgba(255,68,68,.2);color:#ff6666;margin-left:auto;"
            onclick="window.FinosKite.disconnect()">
            Disconnect
          </button>
        </div>

        <!-- Holdings table -->
        <div class="kite-table-wrap">
          ${holdings.length === 0
            ? '<div style="text-align:center;padding:32px;color:#8892A4;font-size:13px;">No holdings found. Have you placed equity trades in this Zerodha account?</div>'
            : `<table class="kite-holdings-table">
                <thead><tr>
                  <th>Symbol</th><th>Exchange</th><th style="text-align:right">Qty</th>
                  <th style="text-align:right">Avg Cost</th><th style="text-align:right">LTP</th>
                  <th style="text-align:right">Day %</th><th style="text-align:right">Value</th>
                  <th style="text-align:right">Overall P&L</th>
                </tr></thead>
                <tbody>${rows}</tbody>
              </table>`
          }
        </div>

        <div style="font-size:11px;color:rgba(255,255,255,.2);text-align:right;margin-top:10px;">
          Connected as ${userName} · Token refreshes after market day
        </div>
      </div>`;
  }

  /* ── Context push ───────────────────────────────────────────────────── */
  function _syncToContext(holdings, margins) {
    const totalCurrent  = holdings.reduce((s, h) => s + h.last_price  * h.quantity, 0);
    const totalInvested = holdings.reduce((s, h) => s + h.average_price * h.quantity, 0);

    // Push to finos-context.js
    if (window.FinosContext?.update) {
      window.FinosContext.update({
        portfolioValue: totalCurrent,
        kiteHoldings:   holdings,
        kiteMargins:    margins,
      });
    }

    // Also persist individual keys for compatibility
    localStorage.setItem('finos_portfolio_value', totalCurrent.toString());
    localStorage.setItem('finos_kite_pnl', (totalCurrent - totalInvested).toString());

    const equity = margins.equity || {};
    const avail  = (equity.available || {}).live_balance || 0;
    localStorage.setItem('finos_kite_margin', avail.toString());
  }

  /* ── Setup modal (if arya-ai not configured) ────────────────────────── */
  function _showSetupModal() {
    const modal = document.createElement('div');
    modal.id = 'kite-setup-modal';
    modal.innerHTML = `
      <style>
        #kite-setup-modal { position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;padding:20px; }
        .kite-modal-box { background:linear-gradient(145deg,#0d0f1a,#161929);border:1px solid rgba(56,126,209,.25);border-radius:20px;padding:32px;max-width:460px;width:100%;font-family:-apple-system,sans-serif; }
      </style>
      <div class="kite-modal-box">
        <div style="font-size:32px;margin-bottom:10px;">⚙️</div>
        <div style="font-size:18px;font-weight:800;color:#F5F7FA;margin-bottom:6px;">Kite Connect Setup Required</div>
        <div style="font-size:13px;color:#8892A4;margin-bottom:20px;line-height:1.6;">
          To enable live Zerodha sync, you need a Kite Connect developer account and API credentials.
        </div>
        <ol style="font-size:13px;color:#a0aec0;padding-left:20px;margin-bottom:20px;line-height:2;">
          <li>Visit <a href="https://developers.kite.trade/" target="_blank" style="color:#387ed1;">developers.kite.trade</a> → Create App</li>
          <li>Set redirect_uri: <code style="background:rgba(255,255,255,.06);padding:2px 6px;border-radius:4px;">http://localhost:7475/api/kite/callback</code></li>
          <li>Copy your <strong style="color:#F5F7FA;">API Key</strong> and <strong style="color:#F5F7FA;">API Secret</strong></li>
          <li>Add to <code style="background:rgba(255,255,255,.06);padding:2px 6px;border-radius:4px;">arya-ai/.env</code>:<br>
            <code style="display:block;margin-top:4px;background:rgba(255,255,255,.06);padding:8px;border-radius:6px;font-size:11px;">KITE_API_KEY=your_key<br>KITE_API_SECRET=your_secret</code>
          </li>
          <li>Restart arya-ai and try again</li>
        </ol>
        <div style="display:flex;gap:10px;">
          <a href="https://developers.kite.trade/" target="_blank" rel="noopener"
            style="flex:1;padding:11px;border-radius:12px;background:rgba(56,126,209,.15);border:1px solid rgba(56,126,209,.4);color:#4d95e8;font-size:13px;font-weight:700;text-align:center;text-decoration:none;">
            Open Kite Developer Portal →
          </a>
          <button onclick="document.getElementById('kite-setup-modal')?.remove()"
            style="padding:11px 20px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#F5F7FA;font-size:13px;cursor:pointer;">
            Close
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  /* ── Positions popup (bonus) ────────────────────────────────────────── */
  FinosKite._openPositions = async function () {
    if (!_token()) { _toast('Connect Zerodha first.', 'error'); return; }
    try {
      const res = await _get('/api/kite/positions');
      const net = (res.data?.net || []).filter(p => p.quantity !== 0);
      if (!net.length) { _toast('No open positions today.', 'info'); return; }

      const modal = document.createElement('div');
      modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;padding:20px;';
      const rows = net.map(p => {
        const pnl = p.pnl || 0;
        const c   = pnl >= 0 ? '#22D3A6' : '#FF4444';
        return `<tr>
          <td style="padding:8px 10px;font-weight:700;color:#F5F7FA;">${p.tradingsymbol}</td>
          <td style="padding:8px 10px;color:#8892A4;">${p.product}</td>
          <td style="padding:8px 10px;text-align:right;">${p.quantity}</td>
          <td style="padding:8px 10px;text-align:right;color:${c};font-weight:700;">
            ${pnl>=0?'+':''}₹${Math.abs(pnl).toLocaleString('en-IN',{maximumFractionDigits:0})}
          </td></tr>`;
      }).join('');
      modal.innerHTML = `
        <div style="background:#0D1117;border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:24px;max-width:500px;width:100%;font-family:-apple-system,sans-serif;max-height:80vh;overflow-y:auto;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <div style="font-size:16px;font-weight:800;color:#F5F7FA;">Open Positions</div>
            <button onclick="this.closest('[style*=fixed]').remove()" style="background:none;border:none;color:#8892A4;font-size:20px;cursor:pointer;">×</button>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead><tr style="border-bottom:1px solid rgba(255,255,255,.06);">
              <th style="padding:6px 10px;text-align:left;font-size:10px;color:#8892A4;text-transform:uppercase;letter-spacing:.6px;">Symbol</th>
              <th style="padding:6px 10px;text-align:left;font-size:10px;color:#8892A4;text-transform:uppercase;letter-spacing:.6px;">Product</th>
              <th style="padding:6px 10px;text-align:right;font-size:10px;color:#8892A4;text-transform:uppercase;letter-spacing:.6px;">Qty</th>
              <th style="padding:6px 10px;text-align:right;font-size:10px;color:#8892A4;text-transform:uppercase;letter-spacing:.6px;">P&L</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
      document.body.appendChild(modal);
    } catch (err) {
      _toast(`Failed to load positions: ${err.message}`, 'error');
    }
  };

  /* ── Auto-sync on context ready ─────────────────────────────────────── */
  window.addEventListener('finos-context-ready', e => {
    if (e.detail?.phase !== 'full') return;
    FinosKite.autoSync();
  });

  global.FinosKite = FinosKite;

}(window));
