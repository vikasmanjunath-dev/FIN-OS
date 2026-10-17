/**
 * finos-portfolio-analytics.js — Portfolio snapshot analytics  v1.1
 * ──────────────────────────────────────────────────────────────────────────────
 * Shows a snapshot sector breakdown and an unscored research checklist. Historical
 * return, drawdown, factor and benchmark statistics are intentionally unavailable until
 * the page receives dated cash flows, returns and validated factor data.
 *
 * Usage:
 *   PortfolioAnalytics.renderAll(containerEl, holdings)
 *   PortfolioAnalytics.computeXIRR(cashflows)  // [{date, amount}]
 *   PortfolioAnalytics.renderConvictionChecklist(el, symbol)
 */
(function (global) {
  'use strict';

  function finiteNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }
  function holdingValue(h) {
    const explicit = finiteNumber(h && h.current_value);
    if (explicit !== null && explicit >= 0) return explicit;
    const q = finiteNumber(h && h.quantity), p = finiteNumber(h && h.current_price);
    if (q !== null && q >= 0 && p !== null && p >= 0 && Number.isFinite(q * p)) return q * p;
    const cost = finiteNumber(h && h.avg_price);
    const fallback = q !== null && q >= 0 && cost !== null && cost >= 0 ? q * cost : null;
    return fallback !== null && Number.isFinite(fallback) ? fallback : null;
  }
  function INR(n) {
    const num = finiteNumber(n) || 0;
    if (num >= 1e7) return '₹' + (num/1e7).toFixed(2) + 'Cr';
    if (num >= 1e5) return '₹' + (num/1e5).toFixed(1) + 'L';
    if (num >= 1e3) return '₹' + Math.round(num/1e3) + 'K';
    return '₹' + Math.round(num).toLocaleString('en-IN');
  }
  function pct(n, dp=1) { return (Number(n)||0).toFixed(dp) + '%'; }
  function dateMillis(value) {
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : NaN;
    if (typeof value !== 'string') return NaN;
    const ms = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(value) ? value + 'T00:00:00Z' : value);
    if (!Number.isFinite(ms)) return NaN;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(ms).toISOString().slice(0, 10) !== value) return NaN;
    return ms;
  }

  /* ══════════════════════════════════════════════════════════════════
     XIRR CALCULATOR
  ══════════════════════════════════════════════════════════════════ */
  function computeXIRR(cashflows) {
    // XIRR cash flows are dated and may be irregular. Use the spreadsheet 365-day basis,
    // sort dates, require both signs, and bracket roots so Newton steps cannot diverge.
    if (!Array.isArray(cashflows) || cashflows.length < 2) return null;
    const cf = [];
    for (const c of cashflows) {
      const amount = finiteNumber(c && c.amount);
      const time = dateMillis(c && c.date);
      if (amount === null || !Number.isFinite(time)) return null;
      cf.push({ date: time, amount });
    }
    cf.sort((a, b) => a.date - b.date);
    const first = cf[0].date, flows = [];
    for (const c of cf) {
      const t = (c.date - first) / 86400000 / 365;
      const last = flows[flows.length - 1];
      if (last && last.t === t) last.amount += c.amount;
      else flows.push({ t, amount: c.amount });
    }
    if (!flows.some(c => c.amount < 0) || !flows.some(c => c.amount > 0)) return null;
    const signChanges = flows.filter(c => c.amount !== 0).reduce((state, c, i, nonzero) =>
      state + (i > 0 && Math.sign(c.amount) !== Math.sign(nonzero[i - 1].amount) ? 1 : 0), 0);
    // Multiple sign changes can produce multiple valid roots; do not report an arbitrary one.
    if (signChanges > 1) return null;
    const npvSign = rate => {
      if (!(rate > -1) || !Number.isFinite(rate)) return null;
      const logBase = Math.log1p(rate);
      const terms = flows.map(c => ({ amount: c.amount, exponent: -c.t * logBase }));
      const scale = terms.reduce((max, c) => Math.max(max, c.exponent), -Infinity);
      const value = terms.reduce((sum, c) => sum + c.amount * Math.exp(c.exponent - scale), 0);
      return Number.isFinite(value) ? value : null;
    };
    if (npvSign(0) === 0) return 0;
    const lowX = -23, highX = Math.log1p(1e6), steps = 4096;
    let previous = null, roots = [], brackets = [];
    for (let i = 0; i <= steps; i++) {
      const rate = Math.expm1(lowX + (highX - lowX) * i / steps), sign = npvSign(rate);
      if (sign === null) { previous = null; continue; }
      if (sign === 0) roots.push(rate);
      else if (previous && previous.sign * sign < 0) brackets.push({ lo: previous.rate, hi: rate, sign: previous.sign });
      previous = { rate, sign };
    }
    if (roots.length + brackets.length !== 1) return null; // no solution or more than one plausible return
    if (roots.length) return roots[0] * 100;
    let lo = brackets[0].lo, hi = brackets[0].hi, loSign = brackets[0].sign;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2, sign = npvSign(mid);
      if (sign === null) return null;
      if (Math.abs(hi - lo) < 1e-12 || sign === 0) return mid * 100;
      if (loSign * sign < 0) hi = mid;
      else { lo = mid; loSign = sign; }
    }
    return null;
  }

  /* ══════════════════════════════════════════════════════════════════
     SECTOR HEATMAP
  ══════════════════════════════════════════════════════════════════ */
  const SECTOR_MAP = {
    'RELIANCE':'Diversified', 'ONGC':'Energy', 'GAIL':'Energy', 'IOC':'Energy', 'BPCL':'Energy',
    'HDFCBANK':'Banking', 'ICICIBANK':'Banking', 'AXISBANK':'Banking', 'SBIN':'Banking', 'KOTAKBANK':'Banking', 'BANKBARODA':'Banking',
    'TCS':'IT', 'INFY':'IT', 'WIPRO':'IT', 'HCLTECH':'IT', 'TECHM':'IT', 'LTI':'IT',
    'HINDUNILVR':'FMCG', 'ITC':'FMCG', 'NESTLEIND':'FMCG', 'DABUR':'FMCG', 'MARICO':'FMCG',
    'BAJFINANCE':'NBFC', 'BAJAJFINSV':'NBFC', 'CHOLAFIN':'NBFC', 'MUTHOOTFIN':'NBFC',
    'SUNPHARMA':'Pharma', 'DRREDDY':'Pharma', 'CIPLA':'Pharma', 'DIVISLAB':'Pharma',
    'MARUTI':'Auto', 'TATAMOTORS':'Auto', 'M&M':'Auto', 'BAJAJ-AUTO':'Auto', 'EICHERMOT':'Auto',
    'TITAN':'Consumption', 'ASIANPAINT':'Consumption', 'HAVELLS':'Consumption',
    'TATASTEEL':'Metals', 'HINDALCO':'Metals', 'JSWSTEEL':'Metals', 'COALINDIA':'Metals',
    'POWERGRID':'Utilities', 'NTPC':'Utilities', 'ADANIGREEN':'Utilities',
    'LT':'Industrials', 'LTIM':'IT', 'BHARTIARTL':'Telecom', 'JIOFINANCE':'Financial Services'
  };

  function getSector(symbol) {
    const sym = String(symbol || '').toUpperCase().replace(/\.NS$|\.BO$/,'');
    return SECTOR_MAP[sym] || null;
  }

  function renderSectorHeatmap(containerEl, holdings) {
    const sectorMap = {};
    let totalValue = 0, pricedValue = 0, costValue = 0, unclassifiedValue = 0, excludedRows = 0;
    (Array.isArray(holdings) ? holdings : []).forEach(h => {
      if (!h || typeof h !== 'object') return;
      const explicitSector = typeof h.sector === 'string' && h.sector.trim() ? h.sector.trim().slice(0, 80) : null;
      const type = String(h.asset_type || h.type || '').toLowerCase();
      const isFund = /(mutual.?fund|^mf$|^elss$|etf)/.test(type);
      const sector = explicitSector || (isFund ? 'Funds (look-through unavailable)' : getSector(h.symbol) || 'Not classified');
      const val = holdingValue(h);
      if (val === null || val <= 0) return;
      if (!Number.isFinite(totalValue + val) || !Number.isFinite((sectorMap[sector] || 0) + val)) { excludedRows++; return; }
      sectorMap[sector] = (sectorMap[sector] || 0) + val;
      totalValue += val;
      const price = finiteNumber(h.current_price);
      if (price !== null && price > 0) pricedValue += val;
      else costValue += val;
      if (sector === 'Not classified') unclassifiedValue += val;
    });

    const sectors = Object.entries(sectorMap)
      .sort((a,b) => b[1] - a[1])
      .map(([name, val]) => ({ name, val, pct: totalValue > 0 ? val/totalValue*100 : 0 }));

    const SECTOR_COLORS = {
      'Banking':'#00d4ff', 'IT':'#7b2ff7', 'Energy':'#ff9500', 'FMCG':'#22d3a6',
      'NBFC':'#4f7cff', 'Pharma':'#ff6b6b', 'Auto':'#c7f000', 'Metals':'#ff9500',
      'Consumption':'#e879f9', 'Utilities':'#34d399', 'Infra':'#f59e0b',
      'Telecom':'#60a5fa', 'Financial Services':'#4f7cff', 'Diversified':'#e879f9',
      'Industrials':'#f59e0b', 'Funds (look-through unavailable)':'#9aa3b8', 'Not classified':'rgba(255,255,255,.45)'
    };

    const DISPLAY_THRESHOLD = 30; // visual cue only; not a suitability or risk verdict

    if (!sectors.length) {
      containerEl.innerHTML = '<div style="font-size:12px;color:rgba(255,255,255,.58);">No valid positive holding values are available for this breakdown.</div>';
      return { totalValue: 0, sectors: [], pricedValue: 0, costValue: 0, unclassifiedValue: 0, excludedRows };
    }

    containerEl.innerHTML = `
      <div style="margin-bottom:14px;">
        ${sectors.map(s => {
          const col = Object.prototype.hasOwnProperty.call(SECTOR_COLORS, s.name) ? SECTOR_COLORS[s.name] : SECTOR_COLORS['Not classified'];
          const isHigh = s.pct > DISPLAY_THRESHOLD && !['Funds (look-through unavailable)', 'Not classified'].includes(s.name);
          return `
            <div style="margin-bottom:8px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
                <span style="font-size:12px;color:rgba(255,255,255,.75);">${escapeHTML(s.name)}</span>
                <span style="font-size:12px;font-weight:700;color:${isHigh ? '#ff9500' : col};">${s.pct.toFixed(1)}% ${isHigh ? '⚠️' : ''}</span>
              </div>
              <div style="height:6px;background:rgba(255,255,255,.07);border-radius:3px;overflow:hidden;">
                <div style="height:100%;width:${s.pct}%;background:${col};border-radius:3px;transition:width 1s ease;"></div>
              </div>
            </div>`;
        }).join('')}
      </div>
      <div style="font-size:11px;color:rgba(255,255,255,.58);padding:8px;background:rgba(255,255,255,.03);border-radius:8px;">
        ${costValue > 0 ? `${INR(costValue)} is valued at cost because no current price was available. ` : ''}
        ${unclassifiedValue > 0 ? `${INR(unclassifiedValue)} could not be classified from the available ticker map. ` : ''}
        ${excludedRows ? `${excludedRows} holding row${excludedRows === 1 ? ' was' : 's were'} excluded because adding its value exceeded the supported numeric range. ` : ''}
        Sector labels are approximate ticker classifications; fund look-through is unavailable. The 30% marker is informational, not a suitability or diversification verdict.
      </div>`;
    return { totalValue, sectors, pricedValue, costValue, unclassifiedValue, excludedRows };
  }

  /* ══════════════════════════════════════════════════════════════════
     DRAWDOWN ANALYSIS
  ══════════════════════════════════════════════════════════════════ */
  function computeDrawdown(priceHistory) {
    if (!Array.isArray(priceHistory)) return null;
    const points = priceHistory.filter(p => p && Number.isFinite(dateMillis(p.date)) && Number.isFinite(p.value) && p.value > 0)
      .slice().sort((a, b) => dateMillis(a.date) - dateMillis(b.date));
    if (points.length < 2) return null;
    let peak = points[0].value, peakDate = points[0].date;
    let maxDD = 0, maxDDStart = peakDate, maxDDEnd = peakDate, peakAtWorst = peak;
    for (const p of points) {
      if (p.value > peak) { peak = p.value; peakDate = p.date; }
      const dd = (peak - p.value) / peak * 100;
      if (dd > maxDD) { maxDD = dd; maxDDStart = peakDate; maxDDEnd = p.date; peakAtWorst = peak; }
    }
    const last = points[points.length - 1];
    const currentDD = (peak - last.value) / peak * 100;
    let recoveredDate = null;
    if (maxDD > 0) {
      const trough = points.findIndex(p => p.date === maxDDEnd);
      for (let i = trough + 1; i < points.length; i++) {
        if (points[i].value >= peakAtWorst) { recoveredDate = points[i].date; break; }
      }
    }
    return { maxDD: +maxDD.toFixed(2), currentDD: +currentDD.toFixed(2), maxDDStart, maxDDEnd, recoveredDate };
  }

  function renderDrawdownCard(containerEl, drawdown) {
    if (!drawdown) {
      containerEl.innerHTML = `<div style="font-size:12px;color:rgba(255,255,255,0.58);">A current holdings snapshot has no dated portfolio-value history, so historical drawdown cannot be calculated here. A valid series would also need to account for deposits and withdrawals.</div>`;
      return;
    }
    const ddColor = drawdown.maxDD > 40 ? '#ff4444' : drawdown.maxDD > 20 ? '#ff9500' : '#22d3a6';
    const currColor = drawdown.currentDD > 10 ? '#ff4444' : drawdown.currentDD > 5 ? '#ff9500' : '#22d3a6';
    containerEl.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
        <div style="background:rgba(255,255,255,.04);border-radius:12px;padding:14px;text-align:center;">
          <div style="font-size:11px;color:rgba(255,255,255,0.58);margin-bottom:4px;">Worst drawdown in sample</div>
          <div style="font-size:1.5rem;font-weight:900;color:${ddColor};">-${drawdown.maxDD}%</div>
          ${drawdown.recoveredDate ? `<div style="font-size:10px;color:rgba(255,255,255,0.58);">Recovered ${escapeHTML(drawdown.recoveredDate)}</div>` : drawdown.maxDD > 0 ? `<div style="font-size:10px;color:rgba(255,255,255,0.58);">Not recovered in this series</div>` : ''}
        </div>
        <div style="background:rgba(255,255,255,.04);border-radius:12px;padding:14px;text-align:center;">
          <div style="font-size:11px;color:rgba(255,255,255,0.58);margin-bottom:4px;">Current drawdown</div>
          <div style="font-size:1.5rem;font-weight:900;color:${currColor};">${drawdown.currentDD > 0 ? '-' : ''}${drawdown.currentDD}%</div>
          <div style="font-size:10px;color:rgba(255,255,255,0.58);">At latest observation</div>
        </div>
      </div>
      <div style="font-size:12px;color:rgba(255,255,255,.55);padding:8px;background:rgba(255,255,255,.03);border-radius:8px;">
        Drawdown is measured from the running peak in the supplied dated value series. It describes this sample only and does not imply a recovery timeline.
      </div>`;
  }

  /* ══════════════════════════════════════════════════════════════════
     FACTOR EXPOSURE (simplified)
  ══════════════════════════════════════════════════════════════════ */
  function computeFactorExposure() {
    // This page does not load dated returns or validated factor data.
    return null;
  }

  function renderFactorExposure(containerEl) {
    containerEl.innerHTML = `<div style="font-size:12px;color:rgba(255,255,255,0.58);line-height:1.6;">
      Factor exposure is not calculated because this page has no dated price history or validated company fundamentals. No ticker-only scores or placeholder values are shown.
    </div>`;
  }

  /* ══════════════════════════════════════════════════════════════════
     CONVICTION CHECKLIST
  ══════════════════════════════════════════════════════════════════ */
  const CONVICTION_QUESTIONS = [
    { id:'business', q:'Can I explain how this business earns and spends money?', tip:'Use filings and audited reports; a short story is not enough evidence.' },
    { id:'cashflow', q:'Do reported earnings broadly reconcile with cash flow over time?', tip:'Differences can have legitimate causes; investigate persistent gaps.' },
    { id:'debt', q:'Have I reviewed debt, interest costs, maturities and contingencies?', tip:'A single debt-to-equity cutoff does not fit every industry.' },
    { id:'valuation', q:'Have I compared valuation with growth, risk and suitable peers?', tip:'No single P/E or PEG threshold establishes fair value.' },
    { id:'management', q:'Have I checked management disclosures and past delivery?', tip:'Review the source, date and context of each claim.' },
    { id:'position', q:'Can I tolerate a large loss in this position?', tip:'Position sizing depends on your full finances and risk capacity.' },
    { id:'horizon', q:'Does this investment fit my goal, time horizon and liquidity needs?', tip:'A sound company can still be unsuitable for a near-term goal.' },
  ];

  function renderConvictionChecklist(containerEl, symbol) {
    const safeSymbol = String(symbol || '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 40);
    const storeKey = `finos_research_checklist_${safeSymbol || 'portfolio'}`;
    let checked = {};
    try {
      const parsed = JSON.parse(global.localStorage.getItem(storeKey) || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) checked = parsed;
    } catch {}
    const subject = safeSymbol ? `Research notes for ${escapeHTML(safeSymbol)}` : 'Questions to review before making an investment decision';
    containerEl.innerHTML = `
      <div style="font-size:11px;color:rgba(255,255,255,0.58);margin-bottom:12px;line-height:1.6;">${subject}. This checklist records questions for your research; it does not score a holding or indicate whether to buy or sell.</div>
      ${CONVICTION_QUESTIONS.map(q => `
        <div style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.04);">
          <input type="checkbox" data-check-id="${q.id}" ${checked[q.id] === true ? 'checked' : ''}
            style="width:16px;height:16px;flex-shrink:0;margin-top:2px;accent-color:#00d4ff;cursor:pointer;">
          <div>
            <label style="font-size:13px;color:rgba(255,255,255,.8);cursor:pointer;display:block;">${escapeHTML(q.q)}</label>
            <div style="font-size:11px;color:rgba(255,255,255,0.58);margin-top:2px;">${escapeHTML(q.tip)}</div>
          </div>
        </div>`).join('')}`;
    containerEl.querySelectorAll('[data-check-id]').forEach(input => {
      const label = input.parentElement.querySelector('label');
      if (label) label.htmlFor = `research-${safeSymbol || 'portfolio'}-${input.dataset.checkId}`;
      input.id = `research-${safeSymbol || 'portfolio'}-${input.dataset.checkId}`;
      input.addEventListener('change', () => {
        try {
          const parsed = JSON.parse(global.localStorage.getItem(storeKey) || '{}');
          const data = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
          data[input.dataset.checkId] = input.checked;
          global.localStorage.setItem(storeKey, JSON.stringify(data));
        } catch {}
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     FULL ANALYTICS RENDER
  ══════════════════════════════════════════════════════════════════ */
  function renderAll(containerEl, holdings, options = {}) {
    if (!containerEl) return;
    containerEl.setAttribute?.('aria-busy', 'false');
    const status = options && options.status;
    if (status === 'unauthenticated') {
      containerEl.innerHTML = `
        <div class="portfolio-analytics-state">
          <div aria-hidden="true">🔒</div>
          <div><strong>Sign in to load saved holdings</strong></div>
          <p>Or upload a broker snapshot above to see its value allocation. Uploaded data is analyzed in this browser.</p>
        </div>`;
      return;
    }
    if (status === 'error') {
      containerEl.innerHTML = `
        <div class="portfolio-analytics-state" role="alert">
          <div><strong>Saved holdings could not be loaded</strong></div>
          <p>Your saved data was not changed. Refresh the page to retry, or upload a snapshot above.</p>
          <button type="button" onclick="location.reload()">Retry</button>
        </div>`;
      return;
    }
    if (status === 'loading') {
      containerEl.innerHTML = '<div class="portfolio-analytics-state">Loading saved holdings…</div>';
      containerEl.setAttribute?.('aria-busy', 'true');
      return;
    }
    if (!Array.isArray(holdings) || !holdings.length) {
      containerEl.innerHTML = `
        <div class="portfolio-analytics-state">
          <div style="font-size:2.5rem;margin-bottom:10px;">📊</div>
          <div><strong>No holdings in this snapshot</strong></div>
          <p>Add holdings in your account or upload a broker snapshot above.</p>
          <a href="#uploadSection">Go to file import</a>
        </div>`;
      return;
    }
    const valid = [];
    let snapshotValue = 0;
    for (const holding of holdings) {
      const value = holdingValue(holding);
      if (value === null || !Number.isFinite(snapshotValue + value)) continue;
      valid.push({ holding, value });
      snapshotValue += value;
    }
    const isUpload = options && options.source === 'upload';
    const atCost = isUpload ? 0 : valid.filter(x => !(finiteNumber(x.holding && x.holding.current_price) > 0)).length;
    const invalid = holdings.length - valid.length;

    containerEl.innerHTML = `
      <div style="font-size:12px;color:rgba(255,255,255,.58);line-height:1.6;margin-bottom:16px;">
        ${holdings.length} holding${holdings.length === 1 ? '' : 's'} · ${snapshotValue > 0 ? `Estimated value ${INR(snapshotValue)}.` : 'No usable positive holding value is available.'} ${isUpload ? 'Values come from the uploaded file and depend on its export date; they are not live quotes.' : `Values use saved prices; ${atCost} holding${atCost === 1 ? ' is' : 's are'} valued at cost because no positive price is saved. Prices are not live quotes and have no refresh timestamp in this data source.`}${invalid ? ` ${invalid} row${invalid === 1 ? '' : 's'} without a usable value excluded.` : ''}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:20px;">

        <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:18px;">
          <div style="font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,0.58);margin-bottom:14px;">📊 Value by Sector</div>
          <div data-analytics="sector"></div>
        </div>

        <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:18px;">
          <div style="font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,0.58);margin-bottom:14px;">⚡ Factor data</div>
          <div data-analytics="factors"></div>
        </div>

        <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:18px;">
          <div style="font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,0.58);margin-bottom:14px;">📉 Historical drawdown</div>
          <div data-analytics="drawdown"></div>
        </div>

        <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:18px;">
          <div style="font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,0.58);margin-bottom:14px;">✅ Research checklist</div>
          <div data-analytics="checklist"></div>
        </div>

      </div>`;

    renderSectorHeatmap(containerEl.querySelector('[data-analytics="sector"]'), valid.map(x => x.holding));
    renderFactorExposure(containerEl.querySelector('[data-analytics="factors"]'), holdings);
    renderDrawdownCard(containerEl.querySelector('[data-analytics="drawdown"]'), null);
    renderConvictionChecklist(containerEl.querySelector('[data-analytics="checklist"]'), '');
  }

  /* ── Export ─────────────────────────────────────────────────── */
  global.PortfolioAnalytics = {
    renderAll,
    renderSectorHeatmap,
    renderFactorExposure,
    renderDrawdownCard,
    renderConvictionChecklist,
    computeXIRR,
    computeDrawdown,
    computeFactorExposure
  };

}(window));
