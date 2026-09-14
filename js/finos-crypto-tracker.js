/**
 * finos-crypto-tracker.js — Crypto Portfolio Tracker  v1.0  (Phase 38)
 * ───────────────────────────────────────────────────────────────────────
 * Track crypto holdings with cost basis, P&L, and India tax impact.
 *
 * India crypto tax rules (post Apr 2022 / Finance Act 2022):
 *   • 30% flat tax on ALL crypto gains — no deductions (except acquisition cost)
 *   • 1% TDS on sell/swap transactions > ₹50,000/year (Form 26AS)
 *   • Losses CANNOT be offset against other income or carried forward
 *   • No netting of losses across different coins
 *   • Wallet-to-wallet transfers: NOT taxable
 *   • Crypto received as gift > ₹50,000: taxable at 30% for recipient
 *
 * localStorage keys written:
 *   finos_crypto_value      — total current value (sum of all holdings)
 *   finos_crypto_portfolio  — JSON array of holding objects
 *   finos_crypto_prices     — JSON map { symbol: priceINR } for quick recompute
 */
(function (global) {
  'use strict';

  const TAX_RATE = 0.30;
  const TDS_THRESHOLD = 50000;

  /* ── Helpers ─────────────────────────────────────────────────────── */
  function safeJSON(k, d) { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (_) { return d; } }
  function ss(k, v) { try { localStorage.setItem(k, typeof v === 'object' ? JSON.stringify(v) : String(v)); } catch (_) {} }

  function INR(n) {
    n = Number(n) || 0;
    if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr';
    if (n >= 1e5) return '₹' + (n / 1e5).toFixed(1) + ' L';
    if (n >= 1e3) return '₹' + Math.round(n / 1e3) + 'K';
    return '₹' + Math.round(n).toLocaleString('en-IN');
  }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* ── Popular coins list for autocomplete hint ────────────────────── */
  const COINS = [
    { symbol: 'BTC',  name: 'Bitcoin' },
    { symbol: 'ETH',  name: 'Ethereum' },
    { symbol: 'USDT', name: 'Tether' },
    { symbol: 'BNB',  name: 'BNB' },
    { symbol: 'SOL',  name: 'Solana' },
    { symbol: 'XRP',  name: 'XRP' },
    { symbol: 'ADA',  name: 'Cardano' },
    { symbol: 'DOGE', name: 'Dogecoin' },
    { symbol: 'MATIC',name: 'Polygon' },
    { symbol: 'DOT',  name: 'Polkadot' },
    { symbol: 'AVAX', name: 'Avalanche' },
    { symbol: 'SHIB', name: 'Shiba Inu' },
    { symbol: 'LTC',  name: 'Litecoin' },
    { symbol: 'TRX',  name: 'TRON' },
    { symbol: 'LINK', name: 'Chainlink' },
  ];

  /* ── Portfolio I/O ───────────────────────────────────────────────── */
  function load() { return safeJSON('finos_crypto_portfolio', []); }
  function loadPrices() { return safeJSON('finos_crypto_prices', {}); }

  function savePortfolio(holdings, prices) {
    ss('finos_crypto_portfolio', holdings);
    if (prices) ss('finos_crypto_prices', prices);
    _recompute(holdings, prices || loadPrices());
  }

  function _recompute(holdings, prices) {
    let total = 0;
    (holdings || load()).forEach(h => {
      const px = prices?.[h.symbol] ?? h.currentPrice ?? 0;
      total += (h.quantity || 0) * px;
    });
    total = Math.round(total);
    ss('finos_crypto_value', total);
    global.FinosContext?.update?.({ cryptoValue: total });
    return total;
  }

  /* ── Render: price update bar ────────────────────────────────────── */
  function _renderPriceBar(el) {
    const holdings = load();
    const prices   = loadPrices();
    if (!holdings.length) { el.innerHTML = ''; return; }

    const coins = [...new Set(holdings.map(h => h.symbol))];
    el.innerHTML = `
      <div class="ct-price-bar">
        <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.4);margin-bottom:12px;">Update Current Prices (₹)</div>
        <div class="ct-price-grid">
          ${coins.map(sym => `
            <div class="ct-price-item">
              <label class="ct-price-sym">${sym}</label>
              <input type="number" class="ct-price-inp" id="ct-px-${sym}"
                value="${prices[sym] || ''}" placeholder="price in ₹"
                oninput="FinosCryptoTracker._onPriceInput('${sym}', this.value)">
            </div>`).join('')}
        </div>
      </div>`;
  }

  /* ── Render: holdings ────────────────────────────────────────────── */
  function renderHoldings(el) {
    if (!el) return;
    const holdings = load();
    const prices   = loadPrices();

    _renderPriceBar(document.getElementById('ct-price-mount'));

    if (!holdings.length) {
      el.innerHTML = `
        <div class="ct-empty">No crypto holdings yet. Add your first position below.</div>
        ${_addFormHTML()}`;
      return;
    }

    let totalCost = 0, totalValue = 0, totalGain = 0;
    holdings.forEach(h => {
      const px   = prices[h.symbol] ?? h.currentPrice ?? 0;
      const cost = (h.quantity || 0) * (h.avgBuyPrice || 0);
      const val  = (h.quantity || 0) * px;
      totalCost  += cost;
      totalValue += val;
      totalGain  += val - cost;
    });
    totalValue = Math.round(totalValue);
    const pnlPct = totalCost > 0 ? ((totalValue - totalCost) / totalCost * 100) : 0;
    const taxLiab = Math.max(0, totalGain) * TAX_RATE;

    let html = `
      <div class="ct-summary-strip">
        <div class="ct-sum-item ct-sum-total">
          <div class="ct-sum-lbl">Portfolio Value</div>
          <div class="ct-sum-val">${INR(totalValue)}</div>
        </div>
        <div class="ct-sum-item">
          <div class="ct-sum-lbl">Invested</div>
          <div class="ct-sum-val" style="color:#fff">${INR(totalCost)}</div>
        </div>
        <div class="ct-sum-item">
          <div class="ct-sum-lbl">Unrealised P&L</div>
          <div class="ct-sum-val" style="color:${totalGain >= 0 ? '#22D3A6' : '#EF4444'}">${totalGain >= 0 ? '+' : ''}${INR(totalGain)}</div>
          <div class="ct-sum-sub">${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%</div>
        </div>
        <div class="ct-sum-item">
          <div class="ct-sum-lbl">Tax if sold (30%)</div>
          <div class="ct-sum-val" style="color:#FF9500">${INR(taxLiab)}</div>
        </div>
      </div>

      <div class="ct-section-title">Holdings</div>
      <div class="ct-holdings-list">`;

    holdings.forEach(h => {
      const px      = prices[h.symbol] ?? h.currentPrice ?? 0;
      const cost    = (h.quantity || 0) * (h.avgBuyPrice || 0);
      const val     = Math.round((h.quantity || 0) * px);
      const gain    = val - cost;
      const gainPct = cost > 0 ? (gain / cost * 100) : 0;
      const tds     = val >= TDS_THRESHOLD ? Math.round(val * 0.01) : 0;

      html += `
        <div class="ct-holding-card">
          <div class="ct-hc-left">
            <div class="ct-hc-symbol">${h.symbol}</div>
            <div class="ct-hc-name">${h.name || COINS.find(c => c.symbol === h.symbol)?.name || ''}</div>
            <div class="ct-hc-qty">${h.quantity} coins · Avg ₹${(h.avgBuyPrice || 0).toLocaleString('en-IN')}</div>
          </div>
          <div class="ct-hc-mid">
            <div class="ct-hc-price">₹${px ? px.toLocaleString('en-IN') : '—'} <span class="ct-hc-current-lbl">current</span></div>
            ${px ? `<div class="ct-hc-gain ${gain >= 0 ? 'ct-gain-pos' : 'ct-gain-neg'}">${gain >= 0 ? '+' : ''}${INR(gain)} (${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}%)</div>` : ''}
          </div>
          <div class="ct-hc-right">
            <div class="ct-hc-val">${px ? INR(val) : '—'}</div>
            ${tds > 0 ? `<div class="ct-hc-tds">1% TDS: ${INR(tds)}</div>` : ''}
            <button class="ct-del-btn" onclick="FinosCryptoTracker._delete('${h.id}')">🗑</button>
          </div>
        </div>`;
    });

    html += `</div>${_addFormHTML()}`;
    el.innerHTML = html;
  }

  /* ── Add form ─────────────────────────────────────────────────────── */
  function _addFormHTML() {
    const coinOptions = COINS.map(c => `<option value="${c.symbol}">${c.symbol} — ${c.name}</option>`).join('');
    return `
      <div class="ct-section-title" style="margin-top:24px;">Add Holding</div>
      <div class="ct-add-form">
        <div class="ct-field-grid">
          <div class="ct-field">
            <label>Coin</label>
            <select id="ct-coin" class="ct-inp">
              <option value="">— Select coin —</option>
              ${coinOptions}
              <option value="OTHER">Other (type below)</option>
            </select>
          </div>
          <div class="ct-field" id="ct-custom-sym-wrap" style="display:none;">
            <label>Custom Symbol</label>
            <input type="text" id="ct-custom-sym" class="ct-inp" placeholder="e.g. PEPE" maxlength="12">
          </div>
          <div class="ct-field">
            <label>Quantity held</label>
            <input type="number" id="ct-qty" class="ct-inp" placeholder="e.g. 0.05" min="0" step="any">
          </div>
          <div class="ct-field">
            <label>Avg buy price (₹)</label>
            <input type="number" id="ct-avg" class="ct-inp" placeholder="e.g. 4500000" min="0">
          </div>
          <div class="ct-field">
            <label>Current price (₹, optional)</label>
            <input type="number" id="ct-cur" class="ct-inp" placeholder="leave blank to update later" min="0">
          </div>
        </div>
        <button class="ct-add-btn" onclick="FinosCryptoTracker._add()">+ Add Holding</button>
      </div>`;
  }

  /* ── Render: tax tab ─────────────────────────────────────────────── */
  function renderTax(el) {
    if (!el) return;
    const holdings = load();
    const prices   = loadPrices();

    if (!holdings.length) {
      el.innerHTML = `<div class="ct-empty">Add holdings first to see tax impact.</div>`;
      return;
    }

    let totalGain = 0, totalTDS = 0;
    const rows = holdings.map(h => {
      const px   = prices[h.symbol] ?? h.currentPrice ?? 0;
      const cost = (h.quantity || 0) * (h.avgBuyPrice || 0);
      const val  = Math.round((h.quantity || 0) * px);
      const gain = val - cost;
      const tax  = gain > 0 ? Math.round(gain * TAX_RATE) : 0;
      const tds  = val >= TDS_THRESHOLD ? Math.round(val * 0.01) : 0;
      totalGain += gain;
      totalTDS  += tds;
      return { ...h, px, cost, val, gain, tax, tds };
    });
    const totalTax = Math.max(0, totalGain) * TAX_RATE;

    el.innerHTML = `
      <div class="ct-tax-hero">
        <div class="ct-tax-hero-row">
          <div>
            <div class="ct-tax-lbl">Total unrealised gain</div>
            <div class="ct-tax-val ${totalGain >= 0 ? '' : 'ct-loss'}">${totalGain >= 0 ? '+' : ''}${INR(totalGain)}</div>
          </div>
          <div>
            <div class="ct-tax-lbl">Tax @30% if sold today</div>
            <div class="ct-tax-val ct-tax-orange">${INR(totalTax)}</div>
          </div>
          <div>
            <div class="ct-tax-lbl">Accumulated 1% TDS</div>
            <div class="ct-tax-val" style="color:#4F7CFF">${INR(totalTDS)}</div>
            <div class="ct-tax-sub">Adjustable against tax liability</div>
          </div>
        </div>
      </div>

      <div class="ct-section-title" style="margin-top:24px;">Per-coin tax breakdown</div>
      <div class="ct-tax-table">
        <div class="ct-tax-header">
          <span>Coin</span><span>Cost basis</span><span>Value</span><span>Gain / Loss</span><span>Tax @30%</span><span>TDS</span>
        </div>
        ${rows.map(r => `
          <div class="ct-tax-row">
            <span class="ct-tax-sym">${r.symbol}</span>
            <span>${INR(r.cost)}</span>
            <span>${r.px ? INR(r.val) : '—'}</span>
            <span class="${r.gain >= 0 ? 'ct-gain-pos' : 'ct-gain-neg'}">${r.gain >= 0 ? '+' : ''}${INR(r.gain)}</span>
            <span class="ct-tax-orange">${r.tax > 0 ? INR(r.tax) : '—'}</span>
            <span style="color:#4F7CFF">${r.tds > 0 ? INR(r.tds) : '—'}</span>
          </div>`).join('')}
      </div>

      <div class="ct-tax-rules">
        <div class="ct-rules-title">🇮🇳 India Crypto Tax Rules (Finance Act 2022)</div>
        <div class="ct-rule">📌 <strong>30% flat tax</strong> on all crypto profits — no deductions except cost of acquisition</div>
        <div class="ct-rule">📌 <strong>1% TDS</strong> on sell/swap transactions above ₹50,000/year — deducted by exchange, adjustable in ITR</div>
        <div class="ct-rule">📌 <strong>Losses cannot</strong> be offset against other income or carried forward to next year</div>
        <div class="ct-rule">📌 <strong>No netting</strong> — loss in BTC cannot reduce gain in ETH for tax purposes</div>
        <div class="ct-rule">📌 <strong>Crypto received as gift</strong> > ₹50,000 is taxable at 30% for recipient</div>
        <div class="ct-rule">📌 <strong>Wallet transfers</strong> are NOT taxable — only sell, swap, or spend events trigger tax</div>
      </div>`;
  }

  /* ── Event handlers ──────────────────────────────────────────────── */
  function _onPriceInput(symbol, val) {
    const n = parseFloat(val) || 0;
    if (n > 0) {
      const prices = loadPrices();
      prices[symbol] = n;
      ss('finos_crypto_prices', prices);
      _recompute(load(), prices);
      const el = document.getElementById('ct-holdings-mount');
      if (el) renderHoldings(el);
    }
  }

  function _add() {
    const selectEl = document.getElementById('ct-coin');
    let symbol = selectEl?.value || '';
    if (symbol === 'OTHER') {
      symbol = (document.getElementById('ct-custom-sym')?.value || '').trim().toUpperCase();
    }
    if (!symbol) { _toast('Select or enter a coin'); return; }

    const qty = parseFloat(document.getElementById('ct-qty')?.value || '0');
    const avg = parseFloat(document.getElementById('ct-avg')?.value || '0');
    const cur = parseFloat(document.getElementById('ct-cur')?.value || '0');
    if (!qty || qty <= 0) { _toast('Enter quantity'); return; }
    if (!avg || avg <= 0) { _toast('Enter avg buy price'); return; }

    const coinInfo = COINS.find(c => c.symbol === symbol);
    const holding  = { id: uid(), symbol, name: coinInfo?.name || symbol, quantity: qty, avgBuyPrice: avg };

    const holdings = load();
    const prices   = loadPrices();
    holdings.push(holding);
    if (cur > 0) prices[symbol] = cur;
    savePortfolio(holdings, prices);

    const el = document.getElementById('ct-holdings-mount');
    if (el) renderHoldings(el);
    _toast('Added ' + symbol, true);
  }

  function _delete(id) {
    const holdings = load().filter(h => h.id !== id);
    savePortfolio(holdings);
    const el = document.getElementById('ct-holdings-mount');
    if (el) renderHoldings(el);
    _renderPriceBar(document.getElementById('ct-price-mount'));
  }

  function _toast(msg, ok) {
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;padding:10px 18px;border-radius:10px;
      font-size:13px;font-weight:600;color:#fff;pointer-events:none;opacity:0;transition:opacity .2s;
      background:${ok ? 'rgba(34,211,166,.9)' : 'rgba(239,68,68,.9)'};`;
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => { t.style.opacity = '1'; });
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 2200);
  }

  /* ── coin select — show custom field for OTHER ───────────────────── */
  global.addEventListener('change', function (e) {
    if (e.target?.id === 'ct-coin') {
      const wrap = document.getElementById('ct-custom-sym-wrap');
      if (wrap) wrap.style.display = e.target.value === 'OTHER' ? 'block' : 'none';
    }
  });

  /* ── Public API ──────────────────────────────────────────────────── */
  function renderSetup(priceMount, holdingsMount) {
    if (priceMount) {
      priceMount.id = 'ct-price-mount';
      _renderPriceBar(priceMount);
    }
    if (holdingsMount) {
      holdingsMount.id = 'ct-holdings-mount';
      renderHoldings(holdingsMount);
    }
  }

  global.FinosCryptoTracker = { renderSetup, renderHoldings, renderTax, _onPriceInput, _add, _delete };

})(window);
