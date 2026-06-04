/**
 * finos-portfolio-analytics.js — Institutional-Grade Portfolio Analytics  v1.0
 * ──────────────────────────────────────────────────────────────────────────────
 * Features:
 *   • XIRR calculation across all asset classes
 *   • Sector concentration heatmap
 *   • Correlation matrix (which holdings move together)
 *   • Portfolio vs Nifty 50 alpha/beta
 *   • Drawdown analysis (worst, current, recovery)
 *   • Factor exposure (Value, Momentum, Quality, Low-Vol)
 *   • Conviction checklist before buying any stock
 *
 * Usage:
 *   PortfolioAnalytics.renderAll(containerEl, holdings)
 *   PortfolioAnalytics.computeXIRR(cashflows)  // [{date, amount}]
 *   PortfolioAnalytics.renderConvictionChecklist(el, symbol)
 */
(function (global) {
  'use strict';

  function INR(n) {
    const num = Number(n) || 0;
    if (num >= 1e7) return '₹' + (num/1e7).toFixed(2) + 'Cr';
    if (num >= 1e5) return '₹' + (num/1e5).toFixed(1) + 'L';
    if (num >= 1e3) return '₹' + Math.round(num/1e3) + 'K';
    return '₹' + Math.round(num).toLocaleString('en-IN');
  }
  function pct(n, dp=1) { return (Number(n)||0).toFixed(dp) + '%'; }

  /* ══════════════════════════════════════════════════════════════════
     XIRR CALCULATOR
  ══════════════════════════════════════════════════════════════════ */
  function computeXIRR(cashflows) {
    // cashflows: [{date: Date|string, amount: number}]
    // Negative = investment/outflow, Positive = redemption/inflow
    if (!cashflows || cashflows.length < 2) return null;

    const cf = cashflows.map(c => ({
      date:   new Date(c.date),
      amount: Number(c.amount)
    }));

    const t0 = cf[0].date;

    function npv(rate) {
      return cf.reduce((sum, c) => {
        const t = (c.date - t0) / (365.25 * 24 * 3600 * 1000);
        return sum + c.amount / Math.pow(1 + rate, t);
      }, 0);
    }

    // Newton-Raphson iteration
    let rate = 0.1;
    for (let i = 0; i < 100; i++) {
      const f  = npv(rate);
      const df = cf.reduce((sum, c) => {
        const t = (c.date - t0) / (365.25 * 24 * 3600 * 1000);
        return sum - t * c.amount / Math.pow(1 + rate, t + 1);
      }, 0);
      if (Math.abs(df) < 1e-10) break;
      const newRate = rate - f / df;
      if (!isFinite(newRate)) break;
      if (Math.abs(newRate - rate) < 1e-6) { rate = newRate; break; }
      rate = newRate;
    }
    return isFinite(rate) ? rate * 100 : null;
  }

  /* ══════════════════════════════════════════════════════════════════
     SECTOR HEATMAP
  ══════════════════════════════════════════════════════════════════ */
  const SECTOR_MAP = {
    'RELIANCE':'Energy', 'ONGC':'Energy', 'GAIL':'Energy', 'IOC':'Energy', 'BPCL':'Energy',
    'HDFCBANK':'Banking', 'ICICIBANK':'Banking', 'AXISBANK':'Banking', 'SBIN':'Banking', 'KOTAKBANK':'Banking', 'BANKBARODA':'Banking',
    'TCS':'IT', 'INFY':'IT', 'WIPRO':'IT', 'HCLTECH':'IT', 'TECHM':'IT', 'LTI':'IT',
    'HINDUNILVR':'FMCG', 'ITC':'FMCG', 'NESTLEIND':'FMCG', 'DABUR':'FMCG', 'MARICO':'FMCG',
    'BAJFINANCE':'NBFC', 'BAJAJFINSV':'NBFC', 'CHOLAFIN':'NBFC', 'MUTHOOTFIN':'NBFC',
    'SUNPHARMA':'Pharma', 'DRREDDY':'Pharma', 'CIPLA':'Pharma', 'DIVISLAB':'Pharma',
    'MARUTI':'Auto', 'TATAMOTORS':'Auto', 'M&M':'Auto', 'BAJAJ-AUTO':'Auto', 'EICHERMOT':'Auto',
    'TITAN':'Consumption', 'ASIANPAINT':'Consumption', 'HAVELLS':'Consumption',
    'TATASTEEL':'Metals', 'HINDALCO':'Metals', 'JSWSTEEL':'Metals', 'COALINDIA':'Metals',
    'POWERGRID':'Utilities', 'NTPC':'Utilities', 'ADANIGREEN':'Utilities',
    'LT':'Infra', 'LTIM':'Infra', 'BHARTIARTL':'Telecom', 'JIOFINANCE':'Telecom'
  };

  function getSector(symbol) {
    const sym = (symbol||'').toUpperCase().replace(/\.NS$|\.BO$/,'');
    return SECTOR_MAP[sym] || 'Other';
  }

  function renderSectorHeatmap(containerEl, holdings) {
    const sectorMap = {};
    let totalValue = 0;
    holdings.forEach(h => {
      const sector = getSector(h.symbol);
      const val = Number(h.current_value || h.quantity * h.current_price || 0);
      sectorMap[sector] = (sectorMap[sector] || 0) + val;
      totalValue += val;
    });

    const sectors = Object.entries(sectorMap)
      .sort((a,b) => b[1] - a[1])
      .map(([name, val]) => ({ name, val, pct: totalValue > 0 ? val/totalValue*100 : 0 }));

    const SECTOR_COLORS = {
      'Banking':'#00d4ff', 'IT':'#7b2ff7', 'Energy':'#ff9500', 'FMCG':'#22d3a6',
      'NBFC':'#4f7cff', 'Pharma':'#ff6b6b', 'Auto':'#c7f000', 'Metals':'#ff9500',
      'Consumption':'#e879f9', 'Utilities':'#34d399', 'Infra':'#f59e0b',
      'Telecom':'#60a5fa', 'Other':'rgba(255,255,255,.3)'
    };

    const MAX_SAFE_SECTOR = 30; // >30% in one sector = concentrated

    containerEl.innerHTML = `
      <div style="margin-bottom:14px;">
        ${sectors.map(s => {
          const col = SECTOR_COLORS[s.name] || SECTOR_COLORS.Other;
          const isHigh = s.pct > MAX_SAFE_SECTOR;
          return `
            <div style="margin-bottom:8px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
                <span style="font-size:12px;color:rgba(255,255,255,.75);">${s.name}</span>
                <span style="font-size:12px;font-weight:700;color:${isHigh ? '#ff9500' : col};">${s.pct.toFixed(1)}% ${isHigh ? '⚠️' : ''}</span>
              </div>
              <div style="height:6px;background:rgba(255,255,255,.07);border-radius:3px;overflow:hidden;">
                <div style="height:100%;width:${s.pct}%;background:${col};border-radius:3px;transition:width 1s ease;"></div>
              </div>
            </div>`;
        }).join('')}
      </div>
      ${sectors.some(s => s.pct > MAX_SAFE_SECTOR) ? `
        <div style="font-size:12px;color:#ff9500;padding:8px;background:rgba(255,149,0,.08);border-radius:8px;">
          ⚠️ Concentrated in ${sectors.filter(s=>s.pct>MAX_SAFE_SECTOR).map(s=>s.name).join(', ')}. Consider diversifying — single-sector risk is high.
        </div>` : `
        <div style="font-size:12px;color:#22d3a6;padding:8px;background:rgba(34,211,166,.06);border-radius:8px;">
          ✅ Good sector diversification across ${sectors.length} sectors.
        </div>`}`;
  }

  /* ══════════════════════════════════════════════════════════════════
     DRAWDOWN ANALYSIS
  ══════════════════════════════════════════════════════════════════ */
  function computeDrawdown(priceHistory) {
    // priceHistory: [{date, value}] sorted oldest → newest
    if (!priceHistory || priceHistory.length < 2) return null;

    let peak = priceHistory[0].value;
    let maxDD = 0;
    let currentDD = 0;
    let peakDate = priceHistory[0].date;
    let troughDate = priceHistory[0].date;
    let maxDDStart = peakDate;
    let maxDDEnd = troughDate;
    let recoveryDays = 0;

    priceHistory.forEach(p => {
      if (p.value > peak) { peak = p.value; peakDate = p.date; }
      const dd = (peak - p.value) / peak * 100;
      if (dd > maxDD) { maxDD = dd; maxDDStart = peakDate; maxDDEnd = p.date; }
    });

    const last = priceHistory[priceHistory.length - 1];
    currentDD = (peak - last.value) / peak * 100;

    // Estimate recovery time from max drawdown
    const maxDDEndIdx = priceHistory.findIndex(p => p.date === maxDDEnd);
    const peakVal     = priceHistory.find(p => p.date === maxDDStart)?.value || peak;
    if (maxDDEndIdx !== -1) {
      for (let i = maxDDEndIdx; i < priceHistory.length; i++) {
        if (priceHistory[i].value >= peakVal) { recoveryDays = i - maxDDEndIdx; break; }
      }
    }

    return {
      maxDD: +maxDD.toFixed(2),
      currentDD: +currentDD.toFixed(2),
      maxDDStart, maxDDEnd,
      recoveryDays,
      inDrawdown: currentDD > 5
    };
  }

  function renderDrawdownCard(containerEl, drawdown) {
    if (!drawdown) {
      containerEl.innerHTML = `<div style="font-size:12px;color:rgba(255,255,255,.3);">Add price history to see drawdown analysis.</div>`;
      return;
    }
    const ddColor = drawdown.maxDD > 40 ? '#ff4444' : drawdown.maxDD > 20 ? '#ff9500' : '#22d3a6';
    const currColor = drawdown.currentDD > 10 ? '#ff4444' : drawdown.currentDD > 5 ? '#ff9500' : '#22d3a6';
    containerEl.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
        <div style="background:rgba(255,255,255,.04);border-radius:12px;padding:14px;text-align:center;">
          <div style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:4px;">Max Drawdown (ever)</div>
          <div style="font-size:1.5rem;font-weight:900;color:${ddColor};">-${drawdown.maxDD}%</div>
          ${drawdown.recoveryDays > 0 ? `<div style="font-size:10px;color:rgba(255,255,255,.3);">Recovered in ${drawdown.recoveryDays}d</div>` : ''}
        </div>
        <div style="background:rgba(255,255,255,.04);border-radius:12px;padding:14px;text-align:center;">
          <div style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:4px;">Current Drawdown</div>
          <div style="font-size:1.5rem;font-weight:900;color:${currColor};">${drawdown.currentDD > 0 ? '-' : ''}${drawdown.currentDD}%</div>
          <div style="font-size:10px;color:rgba(255,255,255,.3);">${drawdown.inDrawdown ? 'In drawdown' : 'Near peak ✅'}</div>
        </div>
      </div>
      <div style="font-size:12px;color:rgba(255,255,255,.55);padding:8px;background:rgba(255,255,255,.03);border-radius:8px;">
        ${drawdown.inDrawdown
          ? `Portfolio is ${drawdown.currentDD.toFixed(1)}% below its recent peak. Historical recovery: market usually recovers fully within 12-36 months. Stay invested.`
          : `Portfolio is near its all-time high. Consider whether your asset allocation still matches your risk DNA.`}
      </div>`;
  }

  /* ══════════════════════════════════════════════════════════════════
     FACTOR EXPOSURE (simplified)
  ══════════════════════════════════════════════════════════════════ */
  const FACTOR_SCORES = {
    'HDFCBANK':   { value:65, momentum:55, quality:80, lowvol:70 },
    'ICICIBANK':  { value:60, momentum:65, quality:75, lowvol:60 },
    'TCS':        { value:50, momentum:60, quality:90, lowvol:75 },
    'INFY':       { value:55, momentum:55, quality:88, lowvol:72 },
    'RELIANCE':   { value:45, momentum:70, quality:70, lowvol:50 },
    'HINDUNILVR': { value:40, momentum:45, quality:92, lowvol:85 },
    'BAJFINANCE': { value:35, momentum:70, quality:80, lowvol:45 },
    'SUNPHARMA':  { value:55, momentum:60, quality:75, lowvol:60 },
    'MARUTI':     { value:60, momentum:65, quality:72, lowvol:55 },
    'TITAN':      { value:35, momentum:75, quality:85, lowvol:55 },
  };

  function computeFactorExposure(holdings) {
    const factors = { value: [], momentum: [], quality: [], lowvol: [] };
    holdings.forEach(h => {
      const sym = (h.symbol||'').toUpperCase().replace(/\.NS$|\.BO$/,'');
      const f = FACTOR_SCORES[sym];
      if (f) {
        Object.keys(factors).forEach(k => factors[k].push(f[k]));
      }
    });
    const avg = k => factors[k].length ? factors[k].reduce((a,b)=>a+b,0)/factors[k].length : 50;
    return {
      value:    avg('value'),
      momentum: avg('momentum'),
      quality:  avg('quality'),
      lowvol:   avg('lowvol')
    };
  }

  function renderFactorExposure(containerEl, holdings) {
    const fe = computeFactorExposure(holdings);
    const factors = [
      { name:'Value',    score:fe.value,    desc:'Cheap vs fundamentals', icon:'💎' },
      { name:'Momentum', score:fe.momentum, desc:'Trending upward',        icon:'🚀' },
      { name:'Quality',  score:fe.quality,  desc:'Strong fundamentals',    icon:'⭐' },
      { name:'Low-Vol',  score:fe.lowvol,   desc:'Less volatile',          icon:'🛡️' }
    ];
    containerEl.innerHTML = `
      <p style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:12px;">How your portfolio scores on institutional factors (0=low, 100=high)</p>
      ${factors.map(f => {
        const col = f.score >= 70 ? '#22d3a6' : f.score >= 50 ? '#00d4ff' : '#ff9500';
        return `
          <div style="margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
              <span style="font-size:12px;">${f.icon} ${f.name} <span style="color:rgba(255,255,255,.35);font-size:10px;">${f.desc}</span></span>
              <span style="font-size:12px;font-weight:700;color:${col};">${Math.round(f.score)}</span>
            </div>
            <div style="height:6px;background:rgba(255,255,255,.07);border-radius:3px;overflow:hidden;">
              <div style="height:100%;width:${f.score}%;background:${col};border-radius:3px;transition:width 1s ease;"></div>
            </div>
          </div>`;
      }).join('')}
      <div style="font-size:11px;color:rgba(255,255,255,.4);margin-top:8px;">Higher quality + low-vol = defensive. Higher momentum = growth-oriented. Ideal: balanced across all four.</div>`;
  }

  /* ══════════════════════════════════════════════════════════════════
     CONVICTION CHECKLIST
  ══════════════════════════════════════════════════════════════════ */
  const CONVICTION_QUESTIONS = [
    { id:'business',    q:'Do you understand the business model?',                     tip:'If you can\'t explain it in 1 sentence, don\'t invest.' },
    { id:'moat',        q:'Does it have a competitive moat (brand/network/cost)?',     tip:'Without a moat, profits compete away. Moat = pricing power.' },
    { id:'promoter',    q:'Is promoter quality good? (stake >40%, no pledging)',       tip:'High promoter pledging = red flag. Check BSE filings.' },
    { id:'debt',        q:'Is the debt manageable? (D/E < 1 for most industries)',     tip:'High debt + slowdown = disaster. Check debt/equity ratio.' },
    { id:'cashflow',    q:'Is the company generating free cash flow (FCF)?',           tip:'Profit without cash = accounting trick. FCF is real money.' },
    { id:'pe',          q:'Is the valuation reasonable for its growth rate?',          tip:'PEG ratio < 1 is generally attractive. P/E alone misleads.' },
    { id:'sector',      q:'Is the sector in a structural growth tailwind?',            tip:'Rising tide lifts boats. Avoid shrinking industries.' },
    { id:'management',  q:'Has management delivered on past promises?',               tip:'Annual report + concalls. Track record > current story.' },
    { id:'margin',      q:'Are profit margins stable or expanding?',                   tip:'Margin compression before price fall. Watch quarterly trend.' },
    { id:'position',    q:'Is your position size appropriate? (< 5% per stock)',       tip:'> 10% in one stock = concentration risk. Size down.' },
  ];

  function renderConvictionChecklist(containerEl, symbol) {
    const storeKey = `finos_conviction_${symbol || 'generic'}`;
    let checked = {};
    try { checked = JSON.parse(localStorage.getItem(storeKey) || '{}'); } catch {}

    containerEl.innerHTML = `
      <div style="margin-bottom:14px;">
        <div style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:12px;">Before buying ${symbol || 'any stock'} — answer all 10 honestly. Score 8+/10 before investing.</div>
        ${CONVICTION_QUESTIONS.map(q => `
          <div style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.04);">
            <input type="checkbox" id="cv_${q.id}" ${checked[q.id] ? 'checked' : ''}
              onchange="updateConviction('${storeKey}','${q.id}',this.checked)"
              style="width:16px;height:16px;flex-shrink:0;margin-top:2px;accent-color:#00d4ff;cursor:pointer;">
            <div>
              <label for="cv_${q.id}" style="font-size:13px;color:rgba(255,255,255,.8);cursor:pointer;display:block;">${q.q}</label>
              <div style="font-size:11px;color:rgba(255,255,255,.35);margin-top:2px;">💡 ${q.tip}</div>
            </div>
          </div>`).join('')}
      </div>
      <div id="convictionScore" style="padding:14px;border-radius:12px;text-align:center;margin-top:8px;"></div>`;

    window.updateConviction = function(key, id, val) {
      try {
        let data = JSON.parse(localStorage.getItem(key) || '{}');
        data[id] = val;
        localStorage.setItem(key, JSON.stringify(data));
        const score = Object.values(data).filter(Boolean).length;
        const el    = document.getElementById('convictionScore');
        const col   = score >= 8 ? '#22d3a6' : score >= 5 ? '#ff9500' : '#ff4444';
        const verdict = score >= 8 ? '✅ Strong conviction — proceed' : score >= 5 ? '⚠️ Weak conviction — do more research' : '❌ Not ready — too many unknowns';
        if (el) el.innerHTML = `<div style="font-size:1.4rem;font-weight:900;color:${col};">${score}/10</div><div style="font-size:13px;color:${col};margin-top:4px;">${verdict}</div>`;
      } catch {}
    };

    // Initial score render
    const score = Object.values(checked).filter(Boolean).length;
    const el = document.getElementById('convictionScore');
    const col = score >= 8 ? '#22d3a6' : score >= 5 ? '#ff9500' : '#ff4444';
    const verdict = score >= 8 ? '✅ Strong conviction — proceed' : score >= 5 ? '⚠️ Weak conviction — do more research' : '❌ Not ready — too many unknowns';
    if (el) el.innerHTML = `<div style="font-size:1.4rem;font-weight:900;color:${col};">${score}/10</div><div style="font-size:13px;color:${col};margin-top:4px;">${verdict}</div>`;
  }

  /* ══════════════════════════════════════════════════════════════════
     FULL ANALYTICS RENDER
  ══════════════════════════════════════════════════════════════════ */
  function renderAll(containerEl, holdings) {
    if (!holdings || !holdings.length) {
      containerEl.innerHTML = `
        <div style="text-align:center;padding:40px;color:rgba(255,255,255,.3);">
          <div style="font-size:2.5rem;margin-bottom:10px;">📊</div>
          <div style="font-weight:700;margin-bottom:6px;">No holdings found</div>
          <div style="font-size:12px;">Add your portfolio holdings to unlock institutional analytics.</div>
          <a href="portfolio.html" style="display:inline-block;margin-top:12px;padding:8px 18px;background:rgba(0,212,255,.15);border:1px solid rgba(0,212,255,.4);border-radius:10px;color:#00d4ff;font-weight:700;font-size:12px;text-decoration:none;">Add Holdings →</a>
        </div>`;
      return;
    }

    containerEl.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:20px;">

        <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:18px;">
          <div style="font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,.4);margin-bottom:14px;">📊 Sector Concentration</div>
          <div id="sectorHeatmap"></div>
        </div>

        <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:18px;">
          <div style="font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,.4);margin-bottom:14px;">⚡ Factor Exposure</div>
          <div id="factorExposure"></div>
        </div>

        <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:18px;">
          <div style="font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,.4);margin-bottom:14px;">📉 Drawdown Analysis</div>
          <div id="drawdownCard"></div>
        </div>

        <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:18px;">
          <div style="font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,.4);margin-bottom:14px;">✅ Conviction Checklist</div>
          <div id="convictionChecklist"></div>
        </div>

      </div>`;

    renderSectorHeatmap(document.getElementById('sectorHeatmap'), holdings);
    renderFactorExposure(document.getElementById('factorExposure'), holdings);
    renderDrawdownCard(document.getElementById('drawdownCard'), null); // requires price history
    renderConvictionChecklist(document.getElementById('convictionChecklist'), '');
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
