/**
 * finos-gold-tracker.js — Gold & Precious Metals Tracker  v1.0  (Phase 37)
 * ─────────────────────────────────────────────────────────────────────────
 * Tracks Physical Gold, Sovereign Gold Bonds (SGB), Gold ETFs, and Gold
 * Mutual Funds. Computes current value, SGB coupon income, and tax angles.
 *
 * Indian context:
 *   Physical gold — MCX price per gram × weight in grams
 *   SGB            — 2.5% p.a. coupon on face value (semi-annual), 8-yr tenure;
 *                    capital gains EXEMPT if held to maturity; LTCG 20%+indexation
 *                    if redeemed on secondary market after 5 yrs
 *   Gold ETF       — units × current NAV; LTCG 12.5% without indexation after 1 yr
 *   Gold MF        — current value entered directly
 *
 * localStorage keys written:
 *   finos_gold_value       — total current value (sum of all holdings)
 *   finos_gold_price_per_g — MCX price per gram (user input, for recomputing)
 *   finos_gold_portfolio   — JSON array of holding objects
 */
(function (global) {
  'use strict';

  const SGB_COUPON_RATE = 0.025;  // 2.5% p.a. on face value

  /* ── Helpers ─────────────────────────────────────────────────────── */
  function gs(k) { return parseFloat(localStorage.getItem(k) || '0') || 0; }
  function safeJSON(k, d) { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (_) { return d; } }
  function ss(k, v) { try { localStorage.setItem(k, typeof v === 'object' ? JSON.stringify(v) : String(v)); } catch (_) {} }

  function INR(n) {
    n = Number(n) || 0;
    if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr';
    if (n >= 1e5) return '₹' + (n / 1e5).toFixed(1) + ' L';
    if (n >= 1e3) return '₹' + Math.round(n / 1e3) + 'K';
    return '₹' + Math.round(n).toLocaleString('en-IN');
  }

  function dateStr(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function addYears(isoStr, yrs) {
    if (!isoStr) return null;
    const d = new Date(isoStr);
    d.setFullYear(d.getFullYear() + yrs);
    return d.toISOString().slice(0, 10);
  }

  function daysFrom(isoStr) {
    if (!isoStr) return Infinity;
    return Math.ceil((new Date(isoStr) - new Date()) / 86400000);
  }

  /* ── Core calculations ───────────────────────────────────────────── */
  function calcPhysicalValue(grams, pricePerG) {
    return Math.round(grams * pricePerG);
  }

  function calcSGBCurrentValue(units, faceValue, currentGoldPerG) {
    // SGB issued in grams of gold (face value = price per gram at issue)
    // Current value = units × (current MCX price per gram)
    return Math.round(units * currentGoldPerG);
  }

  function calcSGBAnnualCoupon(units, faceValue) {
    // Coupon = 2.5% p.a. on face value (issue price × units)
    return Math.round(units * faceValue * SGB_COUPON_RATE);
  }

  /* ── Load / save portfolio ───────────────────────────────────────── */
  function loadPortfolio() {
    return safeJSON('finos_gold_portfolio', []);
  }

  function savePortfolio(holdings) {
    ss('finos_gold_portfolio', holdings);
    recomputeTotal(holdings);
  }

  function recomputeTotal(holdings) {
    const pricePerG = gs('finos_gold_price_per_g') || 9500; // default MCX approx
    let total = 0;
    (holdings || loadPortfolio()).forEach(h => {
      if (h.type === 'physical')    total += calcPhysicalValue(h.grams || 0, pricePerG);
      else if (h.type === 'sgb')    total += calcSGBCurrentValue(h.units || 0, h.faceValue || 0, pricePerG);
      else if (h.type === 'etf')    total += Math.round((h.units || 0) * (h.nav || 0));
      else if (h.type === 'goldmf') total += h.currentValue || 0;
    });
    ss('finos_gold_value', total);
    global.FinosContext?.update?.({ goldValue: total });
    return total;
  }

  /* ── Generate unique ID ──────────────────────────────────────────── */
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* ── Render: price bar ───────────────────────────────────────────── */
  function renderPriceBar(mount) {
    const pricePerG = gs('finos_gold_price_per_g') || '';
    mount.innerHTML = `
      <div class="gt-price-bar">
        <div class="gt-price-icon">🏅</div>
        <div style="flex:1;">
          <div class="gt-price-lbl">Gold price (MCX / market rate)</div>
          <div class="gt-price-sub">Enter today's price per gram — used to compute current value of all holdings</div>
        </div>
        <div class="gt-price-input-wrap">
          <span class="gt-price-sym">₹</span>
          <input type="number" id="gt-price-per-g" class="gt-price-inp" value="${pricePerG}"
            placeholder="9500" min="1"
            oninput="FinosGoldTracker._onPriceChange(this.value)">
          <span class="gt-price-unit">/gm</span>
        </div>
      </div>`;
  }

  /* ── Render: holdings list ───────────────────────────────────────── */
  function renderHoldings(el) {
    if (!el) return;
    const holdings   = loadPortfolio();
    const pricePerG  = gs('finos_gold_price_per_g') || 9500;
    const total      = recomputeTotal(holdings);

    if (!holdings.length) {
      el.innerHTML = `
        <div class="gt-empty">
          No gold holdings yet. Add one below — physical gold, Sovereign Gold Bonds, Gold ETF, or Gold Mutual Fund.
        </div>
        ${renderAddFormHTML()}`;
      _bindAddForm();
      return;
    }

    let html = '';

    // Summary strip
    const physVal  = holdings.filter(h => h.type === 'physical').reduce((s, h) => s + calcPhysicalValue(h.grams || 0, pricePerG), 0);
    const sgbVal   = holdings.filter(h => h.type === 'sgb').reduce((s, h) => s + calcSGBCurrentValue(h.units || 0, h.faceValue || 0, pricePerG), 0);
    const etfVal   = holdings.filter(h => h.type === 'etf').reduce((s, h) => s + (h.units || 0) * (h.nav || 0), 0);
    const mfVal    = holdings.filter(h => h.type === 'goldmf').reduce((s, h) => s + (h.currentValue || 0), 0);
    const totalGrams = holdings.filter(h => h.type === 'physical').reduce((s, h) => s + (h.grams || 0), 0)
                     + holdings.filter(h => h.type === 'sgb').reduce((s, h) => s + (h.units || 0), 0);
    const annualCoupon = holdings.filter(h => h.type === 'sgb').reduce((s, h) => s + calcSGBAnnualCoupon(h.units || 0, h.faceValue || 0), 0);

    html += `
      <div class="gt-summary-strip">
        <div class="gt-summary-item gt-sum-total">
          <div class="gt-sum-lbl">Total Gold Value</div>
          <div class="gt-sum-val">${INR(total)}</div>
          <div class="gt-sum-note">${totalGrams.toFixed(2)} gm equiv. at ₹${pricePerG.toLocaleString('en-IN')}/gm</div>
        </div>
        ${physVal > 0 ? `<div class="gt-summary-item"><div class="gt-sum-lbl">Physical</div><div class="gt-sum-val" style="color:#FFB347">${INR(physVal)}</div></div>` : ''}
        ${sgbVal  > 0 ? `<div class="gt-summary-item"><div class="gt-sum-lbl">SGB</div><div class="gt-sum-val" style="color:#22D3A6">${INR(sgbVal)}</div></div>` : ''}
        ${etfVal  > 0 ? `<div class="gt-summary-item"><div class="gt-sum-lbl">Gold ETF</div><div class="gt-sum-val" style="color:#4F7CFF">${INR(Math.round(etfVal))}</div></div>` : ''}
        ${mfVal   > 0 ? `<div class="gt-summary-item"><div class="gt-sum-lbl">Gold MF</div><div class="gt-sum-val" style="color:#9B5DE5">${INR(mfVal)}</div></div>` : ''}
        ${annualCoupon > 0 ? `<div class="gt-summary-item"><div class="gt-sum-lbl">SGB Coupon/yr</div><div class="gt-sum-val" style="color:#22D3A6">${INR(annualCoupon)}</div><div class="gt-sum-note">Tax-free interest</div></div>` : ''}
      </div>`;

    // Holdings cards
    html += `<div class="gt-section-title">Your Holdings</div><div class="gt-holdings-list">`;
    holdings.forEach(h => {
      html += renderHoldingCard(h, pricePerG);
    });
    html += `</div>`;

    // Add form
    html += renderAddFormHTML();

    el.innerHTML = html;
    _bindAddForm();
    _bindDeleteButtons();
  }

  function renderHoldingCard(h, pricePerG) {
    const typeLabel = { physical: 'Physical Gold 🪙', sgb: 'Sovereign Gold Bond 📜', etf: 'Gold ETF 📈', goldmf: 'Gold Mutual Fund 💰' }[h.type] || h.type;
    const typeColor = { physical: '#FFB347', sgb: '#22D3A6', etf: '#4F7CFF', goldmf: '#9B5DE5' }[h.type] || '#fff';

    let valueStr = '', details = '';
    if (h.type === 'physical') {
      const val = calcPhysicalValue(h.grams || 0, pricePerG);
      valueStr = INR(val);
      details  = `${h.grams}gm × ₹${pricePerG.toLocaleString('en-IN')}/gm`;
    } else if (h.type === 'sgb') {
      const val    = calcSGBCurrentValue(h.units || 0, h.faceValue || 0, pricePerG);
      const coupon = calcSGBAnnualCoupon(h.units || 0, h.faceValue || 0);
      const maturity = addYears(h.purchaseDate, 8);
      const daysLeft = daysFrom(maturity);
      valueStr = INR(val);
      details  = `${h.units} units · Issue ₹${(h.faceValue || 0).toLocaleString('en-IN')}/gm · Coupon: ${INR(coupon)}/yr`;
      if (maturity) details += ` · Matures ${dateStr(maturity)}${daysLeft < 365 ? ` <span style="color:#c7f000">(${Math.round(daysLeft/30)} mo)</span>` : ''}`;
    } else if (h.type === 'etf') {
      const val = Math.round((h.units || 0) * (h.nav || 0));
      valueStr = INR(val);
      details  = `${h.units} units × ₹${h.nav}/NAV`;
    } else if (h.type === 'goldmf') {
      valueStr = INR(h.currentValue || 0);
      details  = h.fundName || 'Gold Mutual Fund';
    }

    return `
      <div class="gt-holding-card" data-id="${h.id}">
        <div class="gt-hc-top">
          <div>
            <div class="gt-hc-type" style="color:${typeColor}">${typeLabel}</div>
            <div class="gt-hc-name">${h.name || h.series || h.fundName || 'Gold holding'}</div>
            <div class="gt-hc-detail">${details}</div>
          </div>
          <div class="gt-hc-right">
            <div class="gt-hc-val">${valueStr}</div>
            <button class="gt-del-btn" data-id="${h.id}">🗑</button>
          </div>
        </div>
      </div>`;
  }

  /* ── Add form ─────────────────────────────────────────────────────── */
  function renderAddFormHTML() {
    return `
      <div class="gt-add-section">
        <div class="gt-section-title" style="margin-top:24px;">Add Holding</div>
        <div class="gt-add-form">
          <div class="gt-type-row">
            <button class="gt-type-btn active" data-type="physical" onclick="FinosGoldTracker._selectType('physical')">🪙 Physical</button>
            <button class="gt-type-btn" data-type="sgb"      onclick="FinosGoldTracker._selectType('sgb')">📜 SGB</button>
            <button class="gt-type-btn" data-type="etf"      onclick="FinosGoldTracker._selectType('etf')">📈 Gold ETF</button>
            <button class="gt-type-btn" data-type="goldmf"   onclick="FinosGoldTracker._selectType('goldmf')">💰 Gold MF</button>
          </div>

          <!-- Physical -->
          <div id="gt-fields-physical" class="gt-fields-block">
            <div class="gt-field-grid">
              <div class="gt-field"><label>Description (optional)</label><input type="text" id="gt-physical-name" class="gt-inp" placeholder="e.g. 24K bar, jewellery"></div>
              <div class="gt-field"><label>Weight (grams)</label><input type="number" id="gt-physical-grams" class="gt-inp" placeholder="e.g. 50" min="0" step="0.1"></div>
              <div class="gt-field"><label>Purchase Date (optional)</label><input type="date" id="gt-physical-date" class="gt-inp"></div>
            </div>
          </div>

          <!-- SGB -->
          <div id="gt-fields-sgb" class="gt-fields-block" style="display:none;">
            <div class="gt-field-grid">
              <div class="gt-field"><label>Series / Tranche</label><input type="text" id="gt-sgb-series" class="gt-inp" placeholder="e.g. SGB 2022-23 Series I"></div>
              <div class="gt-field"><label>Units (grams)</label><input type="number" id="gt-sgb-units" class="gt-inp" placeholder="e.g. 10" min="1" step="1"></div>
              <div class="gt-field"><label>Issue Price (₹/gm)</label><input type="number" id="gt-sgb-face" class="gt-inp" placeholder="e.g. 5409" min="1"></div>
              <div class="gt-field"><label>Purchase Date</label><input type="date" id="gt-sgb-date" class="gt-inp"></div>
            </div>
            <div class="gt-sgb-note">💡 SGB matures 8 years from purchase. Coupon = 2.5% p.a. on issue price, paid semi-annually. Capital gains EXEMPT at maturity.</div>
          </div>

          <!-- ETF -->
          <div id="gt-fields-etf" class="gt-fields-block" style="display:none;">
            <div class="gt-field-grid">
              <div class="gt-field"><label>ETF Name</label><input type="text" id="gt-etf-name" class="gt-inp" placeholder="e.g. GOLDBEES, SBI-ETF Gold"></div>
              <div class="gt-field"><label>Units held</label><input type="number" id="gt-etf-units" class="gt-inp" placeholder="e.g. 20" min="0" step="0.001"></div>
              <div class="gt-field"><label>Current NAV (₹)</label><input type="number" id="gt-etf-nav" class="gt-inp" placeholder="e.g. 68.5" min="0" step="0.01"></div>
              <div class="gt-field"><label>Purchase Date (optional)</label><input type="date" id="gt-etf-date" class="gt-inp"></div>
            </div>
          </div>

          <!-- Gold MF -->
          <div id="gt-fields-goldmf" class="gt-fields-block" style="display:none;">
            <div class="gt-field-grid">
              <div class="gt-field"><label>Fund Name</label><input type="text" id="gt-mf-name" class="gt-inp" placeholder="e.g. Axis Gold Fund"></div>
              <div class="gt-field"><label>Current Value (₹)</label><input type="number" id="gt-mf-value" class="gt-inp" placeholder="e.g. 85000" min="0"></div>
              <div class="gt-field"><label>Invested Amount (₹, optional)</label><input type="number" id="gt-mf-invested" class="gt-inp" placeholder="e.g. 70000" min="0"></div>
            </div>
          </div>

          <button class="gt-add-btn" onclick="FinosGoldTracker._addHolding()">+ Add Holding</button>
        </div>
      </div>`;
  }

  let _currentType = 'physical';

  function _selectType(type) {
    _currentType = type;
    document.querySelectorAll('.gt-type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === type));
    ['physical', 'sgb', 'etf', 'goldmf'].forEach(t => {
      const el = document.getElementById('gt-fields-' + t);
      if (el) el.style.display = t === type ? 'block' : 'none';
    });
  }

  function _addHolding() {
    const t = _currentType;
    let holding = { id: uid(), type: t };

    if (t === 'physical') {
      const grams = parseFloat(document.getElementById('gt-physical-grams')?.value || '0');
      if (!grams || grams <= 0) { _toast('Enter weight in grams'); return; }
      holding.name         = document.getElementById('gt-physical-name')?.value.trim() || 'Physical gold';
      holding.grams        = grams;
      holding.purchaseDate = document.getElementById('gt-physical-date')?.value || '';
    } else if (t === 'sgb') {
      const units = parseFloat(document.getElementById('gt-sgb-units')?.value || '0');
      const face  = parseFloat(document.getElementById('gt-sgb-face')?.value  || '0');
      if (!units || units <= 0) { _toast('Enter number of units'); return; }
      if (!face  || face  <= 0) { _toast('Enter issue price per gram'); return; }
      holding.series       = document.getElementById('gt-sgb-series')?.value.trim() || 'SGB';
      holding.units        = units;
      holding.faceValue    = face;
      holding.purchaseDate = document.getElementById('gt-sgb-date')?.value || '';
    } else if (t === 'etf') {
      const units = parseFloat(document.getElementById('gt-etf-units')?.value || '0');
      const nav   = parseFloat(document.getElementById('gt-etf-nav')?.value   || '0');
      if (!units || units <= 0) { _toast('Enter number of units'); return; }
      if (!nav   || nav   <= 0) { _toast('Enter current NAV'); return; }
      holding.name         = document.getElementById('gt-etf-name')?.value.trim() || 'Gold ETF';
      holding.units        = units;
      holding.nav          = nav;
      holding.purchaseDate = document.getElementById('gt-etf-date')?.value || '';
    } else if (t === 'goldmf') {
      const val = parseFloat(document.getElementById('gt-mf-value')?.value || '0');
      if (!val || val <= 0) { _toast('Enter current value'); return; }
      holding.fundName     = document.getElementById('gt-mf-name')?.value.trim() || 'Gold MF';
      holding.currentValue = val;
      holding.invested     = parseFloat(document.getElementById('gt-mf-invested')?.value || '0') || 0;
    }

    const portfolio = loadPortfolio();
    portfolio.push(holding);
    savePortfolio(portfolio);

    const mountEl = document.getElementById('gt-holdings-mount');
    if (mountEl) renderHoldings(mountEl);
    _toast('Holding added!', true);
  }

  function _bindAddForm() { /* event delegation used — no-op */ }

  function _bindDeleteButtons() {
    document.querySelectorAll('.gt-del-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        const id = this.dataset.id;
        const portfolio = loadPortfolio().filter(h => h.id !== id);
        savePortfolio(portfolio);
        const mountEl = document.getElementById('gt-holdings-mount');
        if (mountEl) renderHoldings(mountEl);
      });
    });
  }

  function _onPriceChange(val) {
    const n = parseFloat(val) || 0;
    if (n > 0) {
      ss('finos_gold_price_per_g', n);
      recomputeTotal();
      const mountEl = document.getElementById('gt-holdings-mount');
      if (mountEl) renderHoldings(mountEl);
      const taxEl = document.getElementById('gt-tax-mount');
      if (taxEl) renderTax(taxEl);
    }
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

  /* ── Render: tax analysis tab ────────────────────────────────────── */
  function renderTax(el) {
    if (!el) return;
    const holdings  = loadPortfolio();
    const pricePerG = gs('finos_gold_price_per_g') || 9500;

    if (!holdings.length) {
      el.innerHTML = `<div class="gt-empty">Add holdings first to see tax analysis.</div>`;
      return;
    }

    const today    = new Date();
    const sgbs     = holdings.filter(h => h.type === 'sgb');
    const physical = holdings.filter(h => h.type === 'physical');
    const etfs     = holdings.filter(h => h.type === 'etf');

    let html = '';

    // SGB tax
    if (sgbs.length) {
      html += `<div class="gt-tax-card gt-tax-sgb">
        <div class="gt-tax-title">📜 Sovereign Gold Bond — Tax Benefits</div>`;
      sgbs.forEach(h => {
        const maturity     = addYears(h.purchaseDate, 8);
        const redemption5  = addYears(h.purchaseDate, 5);
        const daysToMat    = daysFrom(maturity);
        const daysTo5yr    = daysFrom(redemption5);
        const coupon       = calcSGBAnnualCoupon(h.units, h.faceValue);
        const currentVal   = calcSGBCurrentValue(h.units, h.faceValue, pricePerG);
        const cost         = (h.units || 0) * (h.faceValue || 0);
        const gain         = currentVal - cost;
        html += `
          <div class="gt-tax-row">
            <div class="gt-tax-series">${h.series || 'SGB'}</div>
            <div class="gt-tax-detail">
              <span class="gt-tax-badge gt-tax-green">✅ Coupon ${INR(coupon)}/yr — Tax-free</span>
              ${maturity ? `<span class="gt-tax-badge ${daysToMat > 0 ? 'gt-tax-blue' : 'gt-tax-green'}">
                ${daysToMat > 0 ? `Maturity: ${dateStr(maturity)} (${Math.ceil(daysToMat/30)} mo)` : `MATURED — Capital gain EXEMPT`}
              </span>` : ''}
              ${gain > 0 ? `<span class="gt-tax-badge gt-tax-amber">Unrealised gain: ${INR(gain)} — ${daysToMat > 0 ? 'EXEMPT if held to maturity' : 'EXEMPT'}</span>` : ''}
            </div>
          </div>`;
      });
      html += `</div>`;
    }

    // Physical gold tax
    if (physical.length) {
      html += `<div class="gt-tax-card">
        <div class="gt-tax-title">🪙 Physical Gold — Tax on Sale</div>
        <div class="gt-tax-desc">LTCG (held &gt; 2 years): 12.5% without indexation. STCG (≤ 2 years): added to income, taxed at slab rate.</div>
        <div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;font-size:12px;color:rgba(255,255,255,.6);">
          <div><strong style="color:#FFB347;">Holding period</strong></div>
          <div><strong style="color:#FFB347;">Tax type</strong></div>
          <div><strong style="color:#FFB347;">Rate</strong></div>
          <div>≤ 2 years</div><div>STCG</div><div>Slab rate</div>
          <div>&gt; 2 years</div><div>LTCG</div><div>12.5% (no indexation)</div>
        </div>
        <div class="gt-tax-note">⚠️ Applies to jewellery and bullion. Keep purchase bills for cost basis proof.</div>
      </div>`;
    }

    // Gold ETF tax
    if (etfs.length) {
      html += `<div class="gt-tax-card">
        <div class="gt-tax-title">📈 Gold ETF & Gold MF — Tax</div>
        <div class="gt-tax-desc">Post-budget 2023 amendment: LTCG after 1 year at 12.5% without indexation. STCG added to income at slab rate.</div>
        <div class="gt-tax-note">Debt MF taxation applies to Gold MFs — gains taxed at slab regardless of holding period from FY 2023-24.</div>
      </div>`;
    }

    // SGB vs alternatives summary
    html += `
      <div class="gt-tax-card gt-tax-compare">
        <div class="gt-tax-title">⚖️ SGB vs Physical vs Gold ETF — Tax Comparison</div>
        <div class="gt-compare-tax-grid">
          ${[
            { label:'Physical Gold', coupon:'None', ltcgRate:'12.5%', period:'&gt; 2 yr', status:'Taxable', col:'#FFB347' },
            { label:'Gold ETF',      coupon:'None', ltcgRate:'12.5%', period:'&gt; 1 yr', status:'Taxable', col:'#4F7CFF' },
            { label:'SGB (maturity)',coupon:'2.5% tax-free', ltcgRate:'Exempt', period:'8 yr', status:'Best ✅', col:'#22D3A6' },
          ].map(x => `
            <div class="gt-ctg-item" style="border-color:${x.col}20;">
              <div class="gt-ctg-name" style="color:${x.col}">${x.label}</div>
              <div class="gt-ctg-row"><span>Coupon/Yield</span><strong>${x.coupon}</strong></div>
              <div class="gt-ctg-row"><span>LTCG tax</span><strong>${x.ltcgRate}</strong></div>
              <div class="gt-ctg-row"><span>Period</span><strong>${x.period}</strong></div>
              <div class="gt-ctg-status">${x.status}</div>
            </div>`).join('')}
        </div>
      </div>`;

    el.innerHTML = html;
  }

  /* ── Public API ──────────────────────────────────────────────────── */
  function renderSetup(mount) {
    if (!mount) return;

    const priceBar = document.createElement('div');
    mount.appendChild(priceBar);
    renderPriceBar(priceBar);

    const holdingsWrap = document.createElement('div');
    holdingsWrap.id = 'gt-holdings-mount';
    mount.appendChild(holdingsWrap);
    renderHoldings(holdingsWrap);
  }

  function renderTaxPanel(mount) {
    if (!mount) return;
    mount.id = 'gt-tax-mount';
    renderTax(mount);
  }

  global.FinosGoldTracker = {
    renderSetup,
    renderTaxPanel,
    _selectType,
    _addHolding,
    _onPriceChange,
  };

})(window);
