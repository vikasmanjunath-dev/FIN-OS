/* =========================================================
   QUANTUM STOCK ENGINE — stock-platform.js
   Live data simulation, Chart.js candlesticks, indicator math,
   AI insights rule engine, watchlist, sector heatmap, search.
   Self-contained: works without backend. Drop the FastAPI in
   /stock-engine/backend/ and flip USE_BACKEND = true.
   ========================================================= */

(() => {
  'use strict';

  // ============== CONFIG ==============
  const USE_BACKEND = false; // flip to true once FastAPI is up at API_BASE
  const API_BASE = 'http://localhost:8000/api';
  const POLL_MS = 4000;

  // ============== TICKER UNIVERSE ==============
  const UNIVERSE = [
    { sym: 'RELIANCE.NS', name: 'Reliance Industries', sector: 'Energy', basePx: 2840, mcap: 19.2 },
    { sym: 'TCS.NS', name: 'Tata Consultancy Services', sector: 'IT', basePx: 3920, mcap: 14.3 },
    { sym: 'INFY.NS', name: 'Infosys', sector: 'IT', basePx: 1620, mcap: 6.7 },
    { sym: 'HDFCBANK.NS', name: 'HDFC Bank', sector: 'Banking', basePx: 1545, mcap: 11.7 },
    { sym: 'ICICIBANK.NS', name: 'ICICI Bank', sector: 'Banking', basePx: 1180, mcap: 8.3 },
    { sym: 'SBIN.NS', name: 'State Bank of India', sector: 'Banking', basePx: 770, mcap: 6.9 },
    { sym: 'KOTAKBANK.NS', name: 'Kotak Mahindra Bank', sector: 'Banking', basePx: 1810, mcap: 3.6 },
    { sym: 'AXISBANK.NS', name: 'Axis Bank', sector: 'Banking', basePx: 1140, mcap: 3.5 },
    { sym: 'ITC.NS', name: 'ITC', sector: 'FMCG', basePx: 432, mcap: 5.4 },
    { sym: 'HINDUNILVR.NS', name: 'Hindustan Unilever', sector: 'FMCG', basePx: 2410, mcap: 5.7 },
    { sym: 'BHARTIARTL.NS', name: 'Bharti Airtel', sector: 'Telecom', basePx: 1480, mcap: 8.4 },
    { sym: 'LT.NS', name: 'Larsen & Toubro', sector: 'Capital Goods', basePx: 3580, mcap: 4.9 },
    { sym: 'ADANIENT.NS', name: 'Adani Enterprises', sector: 'Conglomerate', basePx: 2950, mcap: 3.4 },
    { sym: 'ADANIPORTS.NS', name: 'Adani Ports', sector: 'Infrastructure', basePx: 1320, mcap: 2.8 },
    { sym: 'TATAMOTORS.NS', name: 'Tata Motors', sector: 'Auto', basePx: 970, mcap: 3.6 },
    { sym: 'M&M.NS', name: 'Mahindra & Mahindra', sector: 'Auto', basePx: 2880, mcap: 3.6 },
    { sym: 'MARUTI.NS', name: 'Maruti Suzuki', sector: 'Auto', basePx: 12450, mcap: 3.9 },
    { sym: 'BAJFINANCE.NS', name: 'Bajaj Finance', sector: 'Banking', basePx: 7320, mcap: 4.5 },
    { sym: 'WIPRO.NS', name: 'Wipro', sector: 'IT', basePx: 535, mcap: 2.8 },
    { sym: 'HCLTECH.NS', name: 'HCL Technologies', sector: 'IT', basePx: 1730, mcap: 4.7 },
    { sym: 'ASIANPAINT.NS', name: 'Asian Paints', sector: 'Consumer', basePx: 2250, mcap: 2.2 },
    { sym: 'TITAN.NS', name: 'Titan Company', sector: 'Consumer', basePx: 3520, mcap: 3.1 },
    { sym: 'SUNPHARMA.NS', name: 'Sun Pharma', sector: 'Pharma', basePx: 1690, mcap: 4.0 },
    { sym: 'POWERGRID.NS', name: 'Power Grid', sector: 'Power', basePx: 312, mcap: 2.9 },
    { sym: 'NTPC.NS', name: 'NTPC', sector: 'Power', basePx: 360, mcap: 3.5 },
    { sym: 'ONGC.NS', name: 'ONGC', sector: 'Energy', basePx: 268, mcap: 3.4 },
    { sym: 'COALINDIA.NS', name: 'Coal India', sector: 'Energy', basePx: 425, mcap: 2.6 },
    { sym: 'JSWSTEEL.NS', name: 'JSW Steel', sector: 'Metals', basePx: 935, mcap: 2.3 },
    { sym: 'TATASTEEL.NS', name: 'Tata Steel', sector: 'Metals', basePx: 158, mcap: 1.9 },
    { sym: 'NESTLEIND.NS', name: 'Nestle India', sector: 'FMCG', basePx: 2480, mcap: 2.4 },
  ];

  // ============== STATE ==============
  const state = {
    symbol: 'RELIANCE.NS',
    timeframe: '1W',
    series: [],          // [{t, o, h, l, c, v}]
    overlays: { ma20: true, ma50: true, ma200: false, bb: false },
    watchlist: loadWatchlist(),
    charts: { main: null, rsi: null, macd: null },
    pollHandle: null,
  };

  // ============== UTIL ==============
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const fmtINR = n => n == null ? '—' : '₹ ' + Number(n).toLocaleString('en-IN', {maximumFractionDigits: 2, minimumFractionDigits: 2});
  const fmtNum = n => n == null ? '—' : Number(n).toLocaleString('en-IN', {maximumFractionDigits: 2});
  const fmtPct = n => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
  const tickerInfo = sym => UNIVERSE.find(u => u.sym === sym) || { sym, name: sym, sector: '—', basePx: 100, mcap: 0 };

  function loadWatchlist() {
    try {
      const raw = localStorage.getItem('qs_watchlist');
      if (raw) return JSON.parse(raw);
    } catch(e) {}
    return ['RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'TATAMOTORS.NS'];
  }
  function saveWatchlist() {
    try { localStorage.setItem('qs_watchlist', JSON.stringify(state.watchlist)); } catch(e) {}
  }

  // ============== DATA SIMULATION ==============
  // Seeded RNG so same symbol => same series (stable demo)
  function mulberry32(seed) {
    return function() {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashSym(sym) {
    let h = 2166136261;
    for (let i=0;i<sym.length;i++) { h ^= sym.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function generateSeries(symbol, timeframe) {
    const cfg = {
      '1D': { points: 78, stepMin: 5,  vol: 0.0035 },   // 5-min bars over a session
      '1W': { points: 60, stepMin: 60, vol: 0.0070 },   // hourly over 5 days
      '1M': { points: 22, stepMin: 1440, vol: 0.0140 },
      '6M': { points: 130, stepMin: 1440, vol: 0.0150 },
      '1Y': { points: 252, stepMin: 1440, vol: 0.0160 },
      '5Y': { points: 260, stepMin: 7*1440, vol: 0.0190 },
    }[timeframe] || { points: 60, stepMin: 60, vol: 0.008 };

    const info = tickerInfo(symbol);
    const rng = mulberry32(hashSym(symbol) ^ hashSym(timeframe));
    const drift = ((rng() - 0.45) * 0.0008);
    const series = [];
    let px = info.basePx * (0.9 + rng() * 0.2);
    const now = Date.now();
    const stepMs = cfg.stepMin * 60 * 1000;

    for (let i = cfg.points - 1; i >= 0; i--) {
      const t = now - i * stepMs;
      const shock = (rng() - 0.5) * cfg.vol * 2;
      const ret = drift + shock;
      const o = px;
      const c = px * (1 + ret);
      const wick = Math.abs(rng() - 0.5) * cfg.vol * 1.4;
      const h = Math.max(o, c) * (1 + wick);
      const l = Math.min(o, c) * (1 - wick);
      const v = Math.round((info.basePx * 4500 + rng() * info.basePx * 9000) * (1 + (i % 9 === 0 ? rng() * 1.8 : 0)));
      series.push({ t, o, h, l, c, v });
      px = c;
    }
    return series;
  }

  // ============== INDICATORS ==============
  function sma(arr, period) {
    const out = new Array(arr.length).fill(null);
    let sum = 0;
    for (let i = 0; i < arr.length; i++) {
      sum += arr[i];
      if (i >= period) sum -= arr[i - period];
      if (i >= period - 1) out[i] = sum / period;
    }
    return out;
  }
  function ema(arr, period) {
    const k = 2 / (period + 1);
    const out = new Array(arr.length).fill(null);
    let prev = null;
    for (let i = 0; i < arr.length; i++) {
      if (i < period - 1) continue;
      if (prev == null) {
        let s = 0;
        for (let j = i - period + 1; j <= i; j++) s += arr[j];
        prev = s / period;
      } else {
        prev = arr[i] * k + prev * (1 - k);
      }
      out[i] = prev;
    }
    return out;
  }
  function rsi(closes, period = 14) {
    const out = new Array(closes.length).fill(null);
    if (closes.length < period + 1) return out;
    let gain = 0, loss = 0;
    for (let i = 1; i <= period; i++) {
      const d = closes[i] - closes[i - 1];
      if (d >= 0) gain += d; else loss -= d;
    }
    let avgG = gain / period, avgL = loss / period;
    out[period] = 100 - 100 / (1 + (avgG / (avgL || 1e-9)));
    for (let i = period + 1; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      const g = d > 0 ? d : 0;
      const l = d < 0 ? -d : 0;
      avgG = (avgG * (period - 1) + g) / period;
      avgL = (avgL * (period - 1) + l) / period;
      out[i] = 100 - 100 / (1 + (avgG / (avgL || 1e-9)));
    }
    return out;
  }
  function macd(closes, fast = 12, slow = 26, signal = 9) {
    const ef = ema(closes, fast);
    const es = ema(closes, slow);
    const line = closes.map((_, i) => (ef[i] != null && es[i] != null) ? ef[i] - es[i] : null);
    const validLine = line.map(v => v == null ? 0 : v);
    const sig = ema(validLine, signal).map((v, i) => line[i] == null ? null : v);
    const hist = line.map((v, i) => (v != null && sig[i] != null) ? v - sig[i] : null);
    return { line, signal: sig, hist };
  }
  function bollinger(closes, period = 20, mult = 2) {
    const mid = sma(closes, period);
    const upper = new Array(closes.length).fill(null);
    const lower = new Array(closes.length).fill(null);
    for (let i = period - 1; i < closes.length; i++) {
      let s = 0;
      for (let j = i - period + 1; j <= i; j++) s += (closes[j] - mid[i]) ** 2;
      const sd = Math.sqrt(s / period);
      upper[i] = mid[i] + mult * sd;
      lower[i] = mid[i] - mult * sd;
    }
    return { mid, upper, lower };
  }

  // ============== INSIGHTS ENGINE ==============
  function generateInsights(symbol, series) {
    const closes = series.map(b => b.c);
    const vols = series.map(b => b.v);
    const last = series[series.length - 1];
    const rsiArr = rsi(closes);
    const macdRes = macd(closes);
    const ma20 = sma(closes, 20), ma50 = sma(closes, 50), ma200 = sma(closes, 200);
    const insights = [];

    const lastRSI = rsiArr[rsiArr.length - 1];
    if (lastRSI != null) {
      if (lastRSI > 70) insights.push({type:'bear', title:'Overbought zone', body:`RSI at ${lastRSI.toFixed(1)}. Mean-reversion risk elevated. Watch for fade-the-rip setups.`, conf:'85%'});
      else if (lastRSI < 30) insights.push({type:'bull', title:'Oversold zone', body:`RSI at ${lastRSI.toFixed(1)}. Snapback possible — but knife-catching has rules.`, conf:'82%'});
      else if (lastRSI > 60) insights.push({type:'info', title:'Bullish momentum', body:`RSI ${lastRSI.toFixed(1)} — buyers in control without exhaustion.`, conf:'68%'});
      else if (lastRSI < 40) insights.push({type:'info', title:'Bearish momentum', body:`RSI ${lastRSI.toFixed(1)} — sellers driving the tape.`, conf:'68%'});
    }

    // Trend regime via MAs
    const m50 = ma50[ma50.length - 1], m200 = ma200[ma200.length - 1] || ma50[ma50.length - 1];
    if (m50 != null && m200 != null && last != null) {
      if (last.c > m200 && m50 > m200) insights.push({type:'bull', title:'Strong uptrend regime', body:`Price above 200-MA, 50-MA stacked above 200-MA — textbook bullish structure.`, conf:'90%'});
      else if (last.c < m200 && m50 < m200) insights.push({type:'bear', title:'Bearish regime', body:`Price below 200-MA, 50-MA below 200-MA — distribution mode.`, conf:'88%'});
      else insights.push({type:'warn', title:'Choppy / transitional', body:`MAs not aligned. Avoid directional bets, prefer range plays.`, conf:'72%'});
    }

    // MACD cross
    const ml = macdRes.line, ms = macdRes.signal;
    if (ml.length > 2) {
      const i = ml.length - 1;
      if (ml[i] != null && ms[i] != null && ml[i-1] != null && ms[i-1] != null) {
        if (ml[i-1] < ms[i-1] && ml[i] > ms[i]) insights.push({type:'bull', title:'MACD bullish cross', body:`MACD line crossed above signal — short-term momentum flip up.`, conf:'76%'});
        if (ml[i-1] > ms[i-1] && ml[i] < ms[i]) insights.push({type:'bear', title:'MACD bearish cross', body:`MACD line crossed below signal — momentum rolling over.`, conf:'76%'});
      }
    }

    // Volume Z-score
    const recentVols = vols.slice(-20);
    const meanV = recentVols.reduce((a,b) => a+b, 0) / recentVols.length;
    const sdV = Math.sqrt(recentVols.reduce((a,b) => a + (b - meanV) ** 2, 0) / recentVols.length);
    const z = sdV ? (last.v - meanV) / sdV : 0;
    if (z > 2) insights.push({type:'warn', title:'Unusual volume spike', body:`Today's volume is ${z.toFixed(1)}σ above 20-day mean. Institutional flow suspected.`, conf:'80%'});
    else if (z < -1.5) insights.push({type:'info', title:'Volume drying up', body:`Volume ${Math.abs(z).toFixed(1)}σ below mean — apathy or pre-breakout coil.`, conf:'62%'});

    // 52W proximity
    const high52 = Math.max(...closes);
    const low52 = Math.min(...closes);
    const pos = (last.c - low52) / (high52 - low52 || 1);
    if (pos > 0.95) insights.push({type:'bull', title:'Near 52-week high', body:`Trading at ${(pos*100).toFixed(0)}% of 52W range. Breakout watch active.`, conf:'78%'});
    else if (pos < 0.05) insights.push({type:'bear', title:'Near 52-week low', body:`Sitting at ${(pos*100).toFixed(0)}% of 52W range. Capitulation or value?`, conf:'74%'});

    return insights.slice(0, 6);
  }

  // ============== RENDER: STOCK HEAD ==============
  function renderStockHead(symbol, series) {
    const info = tickerInfo(symbol);
    const last = series[series.length - 1];
    const first = series[0];
    const ch = last.c - first.c;
    const chPct = (ch / first.c) * 100;
    const isUp = ch >= 0;

    const ic = $('#qsStockIc'); ic.textContent = info.name[0];
    $('#qsStockName').textContent = info.name;
    $('#qsStockSym').textContent = `${symbol} · NSE`;

    const px = $('#qsPrice');
    const old = parseFloat(px.dataset.last || '0');
    px.textContent = fmtINR(last.c);
    px.dataset.last = last.c;
    if (old && old !== last.c) {
      px.classList.remove('qs-flash-up','qs-flash-down');
      void px.offsetWidth; // restart animation
      px.classList.add(last.c > old ? 'qs-flash-up' : 'qs-flash-down');
    }

    const chEl = $('#qsChange');
    chEl.textContent = `${isUp ? '+' : ''}${fmtNum(ch)} (${fmtPct(chPct)})`;
    chEl.classList.toggle('up', isUp);
    chEl.classList.toggle('down', !isUp);
  }

  // ============== RENDER: MAIN CHART ==============
  function buildMainDatasets(series) {
    const closes = series.map(b => b.c);
    const labels = series.map(b => b.t);
    const datasets = [];

    // OHLC closing line (we render a smooth area chart for cross-browser stability)
    datasets.push({
      label: 'Close',
      data: series.map(b => ({ x: b.t, y: b.c })),
      borderColor: '#4F7CFF',
      backgroundColor: ctx => {
        const chart = ctx.chart;
        const {ctx: c, chartArea} = chart;
        if (!chartArea) return 'rgba(79,124,255,0.18)';
        const grad = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
        grad.addColorStop(0, 'rgba(79,124,255,0.32)');
        grad.addColorStop(1, 'rgba(79,124,255,0)');
        return grad;
      },
      fill: true,
      borderWidth: 2,
      tension: 0.25,
      pointRadius: 0,
      pointHoverRadius: 5,
      pointHoverBackgroundColor: '#fff',
      pointHoverBorderColor: '#4F7CFF',
    });

    // High/Low envelope as a faint band (synthetic via two lines)
    datasets.push({
      label: 'High',
      data: series.map(b => ({ x: b.t, y: b.h })),
      borderColor: 'rgba(0,200,83,0.0)',
      borderWidth: 0, pointRadius: 0,
      backgroundColor: 'rgba(0,200,83,0.06)',
      fill: '+1',
      tension: 0.3,
    });
    datasets.push({
      label: 'Low',
      data: series.map(b => ({ x: b.t, y: b.l })),
      borderColor: 'rgba(255,61,0,0.0)',
      borderWidth: 0, pointRadius: 0,
      backgroundColor: 'rgba(255,61,0,0.04)',
      tension: 0.3,
    });

    if (state.overlays.ma20) {
      const m = sma(closes, 20);
      datasets.push(maDataset('MA 20', series, m, '#C7F000'));
    }
    if (state.overlays.ma50) {
      const m = sma(closes, 50);
      datasets.push(maDataset('MA 50', series, m, '#FFB800'));
    }
    if (state.overlays.ma200) {
      const m = sma(closes, 200);
      datasets.push(maDataset('MA 200', series, m, '#B388FF'));
    }
    if (state.overlays.bb) {
      const b = bollinger(closes, 20, 2);
      datasets.push(maDataset('BB Upper', series, b.upper, 'rgba(199,240,0,0.55)', [4,4]));
      datasets.push(maDataset('BB Mid',   series, b.mid,   'rgba(255,255,255,0.30)'));
      datasets.push(maDataset('BB Lower', series, b.lower, 'rgba(199,240,0,0.55)', [4,4]));
    }
    return { datasets };
  }
  function maDataset(label, series, arr, color, dash) {
    return {
      label,
      data: series.map((b, i) => ({ x: b.t, y: arr[i] })),
      borderColor: color,
      borderWidth: 1.6,
      borderDash: dash || [],
      pointRadius: 0,
      tension: 0.25,
      fill: false,
    };
  }

  function renderMainChart() {
    const ctx = $('#qsMainChart').getContext('2d');
    const { datasets } = buildMainDatasets(state.series);
    if (state.charts.main) {
      state.charts.main.data.datasets = datasets;
      state.charts.main.update('none');
      return;
    }
    state.charts.main = new Chart(ctx, {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 600, easing: 'easeOutCubic' },
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: {
            type: 'time',
            time: { tooltipFormat: 'dd LLL yyyy HH:mm' },
            grid: { color: 'rgba(255,255,255,0.04)', drawTicks: false },
            ticks: { color: '#9AA0B4', font: { family: 'JetBrains Mono', size: 10 }, maxTicksLimit: 8 },
          },
          y: {
            position: 'right',
            grid: { color: 'rgba(255,255,255,0.04)' },
            ticks: { color: '#9AA0B4', font: { family: 'JetBrains Mono', size: 10 }, callback: v => '₹' + Number(v).toLocaleString('en-IN') },
          },
        },
        plugins: {
          legend: {
            position: 'top',
            align: 'end',
            labels: { color: '#9AA0B4', font: { family: 'JetBrains Mono', size: 11 }, boxWidth: 10, boxHeight: 2, filter: it => !['High','Low'].includes(it.text) },
          },
          tooltip: {
            backgroundColor: 'rgba(11,13,18,0.95)',
            borderColor: 'rgba(255,255,255,0.12)',
            borderWidth: 1,
            titleColor: '#F5F7FA',
            bodyColor: '#F5F7FA',
            titleFont: { family: 'JetBrains Mono', size: 11 },
            bodyFont: { family: 'JetBrains Mono', size: 12 },
            padding: 12,
            cornerRadius: 10,
            callbacks: {
              label: ctx => `${ctx.dataset.label}: ₹${Number(ctx.parsed.y).toLocaleString('en-IN', {maximumFractionDigits: 2})}`,
            },
          },
        },
      },
    });
  }

  // ============== RENDER: RSI / MACD ==============
  function renderRSI() {
    const closes = state.series.map(b => b.c);
    const arr = rsi(closes);
    const last = arr.filter(v => v != null).slice(-1)[0];
    $('#qsRsiVal').textContent = last != null ? last.toFixed(1) : '—';
    $('#qsRsiVal').style.color = last == null ? '#F5F7FA' : last > 70 ? '#FF3D00' : last < 30 ? '#00C853' : '#F5F7FA';

    const ctx = $('#qsRsiChart').getContext('2d');
    const data = {
      datasets: [
        {
          label: 'RSI',
          data: state.series.map((b, i) => ({ x: b.t, y: arr[i] })),
          borderColor: '#C7F000',
          backgroundColor: ctxx => {
            const ch = ctxx.chart; if (!ch.chartArea) return 'rgba(199,240,0,0.15)';
            const g = ctxx.chart.ctx.createLinearGradient(0, ch.chartArea.top, 0, ch.chartArea.bottom);
            g.addColorStop(0, 'rgba(199,240,0,0.30)'); g.addColorStop(1, 'rgba(199,240,0,0)'); return g;
          },
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 1.5,
        },
      ],
    };
    if (state.charts.rsi) { state.charts.rsi.data = data; state.charts.rsi.update('none'); return; }
    state.charts.rsi = new Chart(ctx, {
      type: 'line', data,
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        scales: {
          x: { type: 'time', display: false },
          y: { min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#9AA0B4', font: { family: 'JetBrains Mono', size: 9 }, stepSize: 50 } },
        },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
          annotation: false,
        },
      },
      plugins: [{
        id: 'rsiBands',
        beforeDraw(chart) {
          const { ctx, chartArea, scales } = chart;
          if (!chartArea) return;
          ctx.save();
          ctx.fillStyle = 'rgba(255,61,0,0.07)';
          ctx.fillRect(chartArea.left, scales.y.getPixelForValue(70), chartArea.right - chartArea.left, scales.y.getPixelForValue(100) - scales.y.getPixelForValue(70));
          ctx.fillStyle = 'rgba(0,200,83,0.07)';
          ctx.fillRect(chartArea.left, scales.y.getPixelForValue(30), chartArea.right - chartArea.left, scales.y.getPixelForValue(0) - scales.y.getPixelForValue(30));
          ctx.strokeStyle = 'rgba(255,255,255,0.1)';
          ctx.setLineDash([3,3]);
          [70,30].forEach(v => {
            ctx.beginPath();
            const y = scales.y.getPixelForValue(v);
            ctx.moveTo(chartArea.left, y); ctx.lineTo(chartArea.right, y); ctx.stroke();
          });
          ctx.restore();
        },
      }],
    });
  }
  function renderMACD() {
    const closes = state.series.map(b => b.c);
    const m = macd(closes);
    const lastL = m.line.filter(v => v != null).slice(-1)[0];
    const lastS = m.signal.filter(v => v != null).slice(-1)[0];
    $('#qsMacdVal').textContent = (lastL != null && lastS != null) ? `${lastL.toFixed(2)} / ${lastS.toFixed(2)}` : '—';

    const ctx = $('#qsMacdChart').getContext('2d');
    const data = {
      datasets: [
        {
          label: 'Histogram',
          type: 'bar',
          data: state.series.map((b, i) => ({ x: b.t, y: m.hist[i] })),
          backgroundColor: state.series.map((_, i) => (m.hist[i] || 0) >= 0 ? 'rgba(0,200,83,0.5)' : 'rgba(255,61,0,0.5)'),
          borderWidth: 0,
          barThickness: 'flex',
          maxBarThickness: 4,
        },
        {
          label: 'MACD',
          data: state.series.map((b, i) => ({ x: b.t, y: m.line[i] })),
          borderColor: '#4F7CFF', borderWidth: 1.5, pointRadius: 0, tension: 0.3,
        },
        {
          label: 'Signal',
          data: state.series.map((b, i) => ({ x: b.t, y: m.signal[i] })),
          borderColor: '#FFB800', borderWidth: 1.2, pointRadius: 0, tension: 0.3, borderDash: [3,3],
        },
      ],
    };
    if (state.charts.macd) { state.charts.macd.data = data; state.charts.macd.update('none'); return; }
    state.charts.macd = new Chart(ctx, {
      data,
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        scales: {
          x: { type: 'time', display: false },
          y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#9AA0B4', font: { family: 'JetBrains Mono', size: 9 }, maxTicksLimit: 4 } },
        },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
      },
    });
  }

  // ============== RENDER: WATCHLIST ==============
  function renderWatchlist() {
    const wrap = $('#qsWatchlist');
    wrap.innerHTML = '';
    state.watchlist.forEach(sym => {
      const info = tickerInfo(sym);
      const seed = mulberry32(hashSym(sym) ^ Math.floor(Date.now()/30000))();
      const chPct = (seed - 0.5) * 6; // -3% .. +3%
      const px = info.basePx * (1 + chPct/100);
      const isUp = chPct >= 0;
      const item = document.createElement('div');
      item.className = 'qs-watch-item' + (sym === state.symbol ? ' active' : '');
      item.innerHTML = `
        <div>
          <div class="qs-watch-sym">${sym.replace('.NS','')}</div>
          <div class="qs-watch-name">${info.name}</div>
        </div>
        <div>
          <div class="qs-watch-px">${fmtINR(px)}</div>
          <div class="qs-watch-ch ${isUp ? 'qs-up' : 'qs-down'}">${fmtPct(chPct)}</div>
        </div>
      `;
      item.addEventListener('click', () => selectSymbol(sym));
      wrap.appendChild(item);
    });
  }

  // ============== RENDER: INSIGHTS ==============
  function renderInsights() {
    const list = generateInsights(state.symbol, state.series);
    const wrap = $('#qsInsights');
    wrap.innerHTML = '';
    if (!list.length) {
      wrap.innerHTML = `<div class="qs-insight info"><div class="qs-insight-head"><span class="qs-insight-title">No signals</span></div><div class="qs-insight-body">Market is in a quiet regime for this ticker.</div></div>`;
      return;
    }
    list.forEach((it, i) => {
      const el = document.createElement('div');
      el.className = `qs-insight ${it.type}`;
      el.style.animationDelay = (i * 60) + 'ms';
      el.innerHTML = `
        <div class="qs-insight-head">
          <span class="qs-insight-title">${it.title}</span>
          <span class="qs-insight-conf">${it.conf}</span>
        </div>
        <div class="qs-insight-body">${it.body}</div>
      `;
      wrap.appendChild(el);
    });
  }

  // ============== RENDER: DEPTH ==============
  function renderDepth() {
    const last = state.series[state.series.length - 1];
    const px = last.c;
    const tick = px > 1000 ? 0.5 : px > 200 ? 0.1 : 0.05;
    const rng = mulberry32(hashSym(state.symbol) ^ Math.floor(Date.now()/4000));

    const bids = [], asks = [];
    let cumB = 0, cumA = 0;
    for (let i = 1; i <= 5; i++) {
      const bp = px - i * tick;
      const ap = px + i * tick;
      const bq = Math.round(120 + rng() * 4800);
      const aq = Math.round(120 + rng() * 4800);
      cumB += bq; cumA += aq;
      bids.push({ p: bp, q: bq, cum: cumB });
      asks.push({ p: ap, q: aq, cum: cumA });
    }
    const maxCum = Math.max(cumB, cumA, 1);

    $('#qsBids').innerHTML = bids.map(b =>
      `<div class="qs-depth-row" style="--w:${(b.cum/maxCum*100).toFixed(0)}%"><span>${b.p.toFixed(2)}</span><span>${b.q}</span></div>`
    ).join('');
    $('#qsAsks').innerHTML = asks.map(a =>
      `<div class="qs-depth-row" style="--w:${(a.cum/maxCum*100).toFixed(0)}%"><span>${a.p.toFixed(2)}</span><span>${a.q}</span></div>`
    ).join('');
  }

  // ============== RENDER: FUNDAMENTALS ==============
  function renderFundamentals() {
    const info = tickerInfo(state.symbol);
    const rng = mulberry32(hashSym(state.symbol));
    const pe = (10 + rng() * 38).toFixed(1);
    const eps = (10 + rng() * 90).toFixed(1);
    const pb = (1 + rng() * 7).toFixed(1);
    const roe = (8 + rng() * 24).toFixed(1) + '%';
    const div = (rng() * 3.5).toFixed(2) + '%';
    const npm = (5 + rng() * 22).toFixed(1) + '%';
    const debt = (rng() * 1.4).toFixed(2);
    const mcap = '₹ ' + (info.mcap).toFixed(1) + ' Lakh Cr';

    const rows = [
      ['Market Cap', mcap], ['P/E (TTM)', pe], ['EPS', eps], ['P/B', pb],
      ['ROE', roe], ['Net margin', npm], ['Div yield', div], ['Debt/Eq', debt],
    ];
    $('#qsFund').innerHTML = rows.map(([k, v]) =>
      `<div class="qs-fund-cell"><div class="qs-fund-key">${k}</div><div class="qs-fund-val">${v}</div></div>`
    ).join('');
  }

  // ============== RENDER: HEATMAP ==============
  function renderHeatmap() {
    const sectors = {};
    UNIVERSE.forEach(u => { (sectors[u.sector] ||= []).push(u); });
    const data = Object.entries(sectors).map(([name, items]) => {
      const rng = mulberry32(hashSym(name) ^ Math.floor(Date.now()/15000));
      const pct = (rng() - 0.4) * 5;
      return { name, items, pct };
    }).sort((a,b) => b.items.length - a.items.length);

    const colorFor = pct => {
      const a = Math.min(Math.abs(pct) / 4, 1);
      if (pct >= 0) return `linear-gradient(135deg, rgba(0,200,83,${0.25 + a*0.55}), rgba(0,160,68,${0.4 + a*0.5}))`;
      return `linear-gradient(135deg, rgba(255,61,0,${0.25 + a*0.55}), rgba(200,40,0,${0.4 + a*0.5}))`;
    };

    const wrap = $('#qsHeatmap');
    wrap.innerHTML = data.map((s, i) => {
      const big = i < 3 ? 'size-2' : '';
      const top = s.items.slice(0, 3).map(t => t.sym.replace('.NS','')).join(' · ');
      return `
        <div class="qs-heat-cell ${big}" style="--bg:${colorFor(s.pct)}">
          <div>
            <div class="qs-heat-name">${s.name}</div>
            <div class="qs-heat-tickers">${top}</div>
          </div>
          <div class="qs-heat-pct">${fmtPct(s.pct)}</div>
        </div>
      `;
    }).join('');
  }

  // ============== ORCHESTRATION ==============
  function refreshAll() {
    state.series = generateSeries(state.symbol, state.timeframe);
    renderStockHead(state.symbol, state.series);
    renderMainChart();
    renderRSI();
    renderMACD();
    renderInsights();
    renderDepth();
    renderFundamentals();
    renderWatchlist();
  }

  function selectSymbol(sym) {
    state.symbol = sym;
    $$('.qs-chip').forEach(c => c.classList.toggle('active', c.dataset.symbol === sym));
    refreshAll();
  }

  // ============== TICK SIMULATION ==============
  function tick() {
    const last = state.series[state.series.length - 1];
    if (!last) return;
    const vol = 0.0018;
    const ret = (Math.random() - 0.49) * vol * 2;
    const newC = last.c * (1 + ret);
    const updated = {
      ...last,
      c: newC,
      h: Math.max(last.h, newC),
      l: Math.min(last.l, newC),
      v: last.v + Math.round(Math.random() * 8000),
    };
    state.series[state.series.length - 1] = updated;
    renderStockHead(state.symbol, state.series);
    if (state.charts.main) {
      const ds = state.charts.main.data.datasets[0];
      ds.data[ds.data.length - 1] = { x: updated.t, y: updated.c };
      state.charts.main.update('none');
    }
    renderDepth();
  }

  // ============== EVENT WIRING ==============
  function wireEvents() {
    // Chip selection
    $$('.qs-chip').forEach(chip => {
      chip.addEventListener('click', () => selectSymbol(chip.dataset.symbol));
    });

    // Timeframe
    $$('.qs-tf').forEach(tf => {
      tf.addEventListener('click', () => {
        $$('.qs-tf').forEach(x => x.classList.remove('active'));
        tf.classList.add('active');
        state.timeframe = tf.dataset.tf;
        if (state.charts.main) { state.charts.main.destroy(); state.charts.main = null; }
        if (state.charts.rsi)  { state.charts.rsi.destroy();  state.charts.rsi  = null; }
        if (state.charts.macd) { state.charts.macd.destroy(); state.charts.macd = null; }
        refreshAll();
      });
    });

    // Overlay toggles
    const wireToggle = (id, key) => {
      const el = $('#' + id);
      el.addEventListener('change', () => {
        state.overlays[key] = el.checked;
        if (state.charts.main) { state.charts.main.destroy(); state.charts.main = null; }
        renderMainChart();
      });
    };
    wireToggle('qsMA20', 'ma20');
    wireToggle('qsMA50', 'ma50');
    wireToggle('qsMA200', 'ma200');
    wireToggle('qsBB', 'bb');

    // Search
    const search = $('#qsSearch');
    const sug = $('#qsSuggest');
    let actIdx = -1;
    const update = () => {
      const q = search.value.trim().toLowerCase();
      if (!q) { sug.classList.remove('open'); sug.innerHTML = ''; return; }
      const hits = UNIVERSE.filter(u =>
        u.sym.toLowerCase().includes(q) || u.name.toLowerCase().includes(q)
      ).slice(0, 8);
      if (!hits.length) { sug.classList.remove('open'); sug.innerHTML = ''; return; }
      sug.innerHTML = hits.map((u, i) => `
        <div class="qs-suggest-item" data-sym="${u.sym}">
          <span class="qs-suggest-sym">${u.sym.replace('.NS','')}</span>
          <span class="qs-suggest-name">${u.name}</span>
          <span class="qs-tiny">${u.sector}</span>
        </div>
      `).join('');
      sug.classList.add('open');
      actIdx = -1;
      $$('.qs-suggest-item', sug).forEach(it => {
        it.addEventListener('mousedown', (e) => {
          e.preventDefault();
          selectSymbol(it.dataset.sym);
          search.value = '';
          sug.classList.remove('open');
        });
      });
    };
    search.addEventListener('input', debounce(update, 120));
    search.addEventListener('keydown', e => {
      const items = $$('.qs-suggest-item', sug);
      if (e.key === 'ArrowDown') { e.preventDefault(); actIdx = Math.min(items.length - 1, actIdx + 1); items.forEach((it, i) => it.classList.toggle('active', i === actIdx)); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); actIdx = Math.max(0, actIdx - 1);                 items.forEach((it, i) => it.classList.toggle('active', i === actIdx)); }
      if (e.key === 'Enter' && actIdx >= 0) { e.preventDefault(); selectSymbol(items[actIdx].dataset.sym); search.value = ''; sug.classList.remove('open'); }
      if (e.key === 'Escape') { sug.classList.remove('open'); search.blur(); }
    });
    document.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); search.focus(); }
    });
    document.addEventListener('click', e => {
      if (!e.target.closest('.qs-search')) sug.classList.remove('open');
    });

    // Add to watchlist
    $('#qsAddWatch').addEventListener('click', () => {
      if (!state.watchlist.includes(state.symbol)) {
        state.watchlist.unshift(state.symbol);
        saveWatchlist();
        renderWatchlist();
      } else {
        state.watchlist = state.watchlist.filter(s => s !== state.symbol);
        saveWatchlist();
        renderWatchlist();
      }
    });

    // Architecture node hover
    $$('.qs-node').forEach(n => {
      n.addEventListener('mouseenter', () => {
        $('#archInfo').innerHTML = `
          <span class="qs-arch-info-label">SYSTEM TRACE</span>
          <p><b>${n.querySelector('.qs-node-name').textContent}</b> — ${n.dataset.info}</p>
        `;
      });
    });

    // API click-to-copy
    $$('.qs-api').forEach(a => {
      a.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(a.dataset.curl);
          const code = a.querySelector('code');
          const orig = code.textContent;
          code.textContent = '✓ copied';
          setTimeout(() => code.textContent = orig, 1100);
        } catch(e) {}
      });
    });

    // Animate hero stat counters
    const stats = $$('[data-counter]');
    const obs = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting) {
          const el = en.target;
          const target = parseFloat(el.dataset.counter);
          let cur = 0; const start = performance.now();
          const dur = 1400;
          const step = () => {
            const t = Math.min(1, (performance.now() - start) / dur);
            const eased = 1 - Math.pow(1 - t, 3);
            el.textContent = Math.round(target * eased).toLocaleString();
            if (t < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
          obs.unobserve(el);
        }
      });
    }, { threshold: 0.4 });
    stats.forEach(s => obs.observe(s));
  }

  function debounce(fn, ms) {
    let id; return (...args) => { clearTimeout(id); id = setTimeout(() => fn(...args), ms); };
  }

  // ============== BOOT ==============
  function boot() {
    refreshAll();
    renderHeatmap();
    wireEvents();
    state.pollHandle = setInterval(tick, POLL_MS);
    setInterval(renderHeatmap, 15000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
