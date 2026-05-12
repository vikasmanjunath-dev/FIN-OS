/* FIN-OS Trading Simulator — Full JavaScript Engine */
'use strict';

// ─── GLOBAL STATE ────────────────────────────────────────────────
const STATE = {
    capital: 100000,
    pnl: 0,
    positions: [],
    orders: [],
    journal: [],
    currentSymbol: 'RELIANCE',
    currentPrice: 2847.50,
    side: 'BUY',
    playing: false,
    speed: 1,
    scenario: 'breakout',
    whyMode: false,
    candleIndex: 0,
    replayTimer: null,
    tradeCount: 0,
    winCount: 0,
    maxDrawdown: 0,
    peakCapital: 100000,
    onboardDone: false,
};

// ─── NSE STOCK WATCHLIST ─────────────────────────────────────────
const STOCKS = [
    { sym: 'RELIANCE', name: 'Reliance Industries', price: 2847.50, chg: 1.24, sector: 'Energy' },
    { sym: 'TCS', name: 'Tata Consultancy', price: 3412.00, chg: -0.58, sector: 'IT' },
    { sym: 'HDFCBANK', name: 'HDFC Bank', price: 1672.30, chg: 0.87, sector: 'Bank' },
    { sym: 'INFY', name: 'Infosys', price: 1549.75, chg: -1.12, sector: 'IT' },
    { sym: 'ICICIBANK', name: 'ICICI Bank', price: 1123.40, chg: 2.01, sector: 'Bank' },
    { sym: 'SBIN', name: 'State Bank of India', price: 784.60, chg: 0.34, sector: 'PSU' },
    { sym: 'BAJFIN', name: 'Bajaj Finance', price: 7234.80, chg: -0.72, sector: 'NBFC' },
    { sym: 'LT', name: 'Larsen & Toubro', price: 3521.00, chg: 1.45, sector: 'Infra' },
    { sym: 'ITC', name: 'ITC Limited', price: 456.20, chg: 0.16, sector: 'FMCG' },
    { sym: 'AXISBANK', name: 'Axis Bank', price: 1234.50, chg: -0.45, sector: 'Bank' },
];

// ─── SCENARIOS ────────────────────────────────────────────────────
const SCENARIOS = {
    breakout: {
        title: 'Opening Breakout', icon: 'fa-arrow-trend-up',
        desc: 'Nifty gaps up at open and breaks above yesterday\'s high with strong volume. This is a classic momentum breakout — the first 15 minutes decide the entire day.',
        context: ['📊 Pre-market: Nifty futures +0.8%', '💹 FII net buying: ₹1,200 Cr yesterday', '📰 Trigger: Strong GDP data released at 5:30 AM', '⚡ Key level: RELIANCE above ₹2,820 = Breakout confirmed'],
        priceBase: 2820, priceEnd: 2920, direction: 'up', volatility: 0.4,
        aiHint: 'This is a momentum day. Buy on the first pullback after breakout. Avoid chasing the first candle.',
    },
    trend: {
        title: 'Trend Day', icon: 'fa-chart-line',
        desc: 'Market trends in one direction all day — a classic "one way" trend day. FIIs accumulating large-cap stocks.',
        context: ['📈 Market trending up since open', '📊 High-volume participation = institutional buying', '🎯 Strategy: Buy dips, don\'t short', '⚠️ Risk: Don\'t trade against the trend'],
        priceBase: 2800, priceEnd: 2980, direction: 'up', volatility: 0.3,
        aiHint: 'Trend day detected. Stay with the trend. Every dip is a buy. Exit before last 30 minutes.',
    },
    reversal: {
        title: 'Reversal Day', icon: 'fa-rotate',
        desc: 'Market opens weak, then reverses sharply. Typical after retail panic creates a washout bottom.',
        context: ['📉 Gap down at open — panic selling', '🔄 V-shaped recovery forming', '📊 Divergence: Price new low, RSI higher low', '🎯 Strategy: Wait for reversal confirmation'],
        priceBase: 2780, priceEnd: 2860, direction: 'reversal', volatility: 0.6,
        aiHint: 'Reversal setup: Don\'t short the open. Wait for the washout + recovery. Enter on confirmation candle.',
    },
    news: {
        title: 'News Volatility (RBI)', icon: 'fa-newspaper',
        desc: 'RBI Monetary Policy announcement at 10 AM. Rate unchanged — market reacts with spike and whipsaw.',
        context: ['📰 RBI rate decision at 10:00 AM', '⚡ Expect 2-3% swing in either direction', '🎯 Tip: Don\'t hold positions into news', '🛑 Strategy: Trade the reaction, not the prediction'],
        priceBase: 2840, priceEnd: 2800, direction: 'volatile', volatility: 1.2,
        aiHint: 'News events cause spikes. Wait 5 minutes after news for price to stabilize. Never enter in first 2 candles.',
    },
    crash: {
        title: 'Market Crash', icon: 'fa-skull',
        desc: 'Global cues negative. Nifty circuit breaker risk. 5% down day. Capital preservation is the ONLY goal.',
        context: ['🌍 US Fed hawkish surprise overnight', '📉 Nifty already -2.5% in pre-market', '🛑 Strategy: STAY OUT or short with tight stop', '💡 Buffett lesson: Cash is a position'],
        priceBase: 2850, priceEnd: 2560, direction: 'down', volatility: 0.8,
        aiHint: 'CRASH scenario: The best trade is often no trade. If you must trade, only short with very tight stop loss.',
    },
};

// ─── WHY TOOLTIPS DATA ────────────────────────────────────────────
const WHY_DATA = {
    product: {
        title: 'Product Type (MIS / CNC / NRML)',
        items: [
            { label: 'MIS (Intraday)', val: 'Square off before 3:15 PM. Higher leverage. For day traders.' },
            { label: 'CNC (Delivery)', val: 'Hold for days/months. No leverage. For investors.' },
            { label: 'NRML', val: 'For futures/options. Held overnight with margin.' },
            { label: '🇮🇳 Example', val: 'Buying SBIN for budget day trade → use MIS. Buying for 1 year → use CNC.' },
        ]
    },
    ordertype: {
        title: 'Order Types Explained',
        items: [
            { label: 'Market Order', val: 'Executes instantly at market price. Risk: slippage in illiquid stocks.' },
            { label: 'Limit Order', val: 'Buy only at ₹X or lower. Better price, but may not execute.' },
            { label: 'Stop Loss (SL)', val: 'Exit when price hits ₹X. Protects capital. MUST USE ALWAYS.' },
            { label: 'SL-Market', val: 'Triggers a market order when SL price hit. Faster exit.' },
            { label: '🇮🇳 Kink', val: 'During RBI policy days, market orders cause massive slippage. Always use Limit.' },
        ]
    },
    qty: {
        title: 'Quantity & Position Sizing',
        items: [
            { label: 'Rule', val: 'Never risk more than 2% of capital on ONE trade.' },
            { label: 'Formula', val: 'Qty = (Capital × 2%) / (Entry − Stop Loss)' },
            { label: 'Example', val: 'Capital ₹1L, Entry ₹500, SL ₹490 → Qty = 2000/10 = 200 shares' },
            { label: '🚨 Beginner Mistake', val: 'Buying "round numbers" (10, 100 shares) without sizing formula.' },
        ]
    },
    price: {
        title: 'Limit Price — Why It Matters',
        items: [
            { label: 'Slippage', val: 'Market order for illiquid stock → you pay ₹5–15 more than expected.' },
            { label: 'Tip', val: 'Place limit order 0.1% above current price for quick fills with price control.' },
            { label: '🇮🇳 Example', val: 'Reliance at ₹2,847. Place limit at ₹2,850 → fills quickly, saves slippage.' },
        ]
    },
    sl: {
        title: 'Stop Loss — The Only Rule That Saves You',
        items: [
            { label: 'What', val: 'Auto-exit order that triggers when price moves against you.' },
            { label: 'Why CRITICAL', val: '90% of retail traders blow up due to missing stop losses.' },
            { label: 'Rule', val: 'Set SL before entry. NEVER after. Move SL to breakeven when profitable.' },
            { label: '🇮🇳 Stat', val: 'SEBI data: avg retail trader loses ₹1.1L in first year. Main reason: no SL.' },
            { label: 'Formula', val: 'SL must be below last swing low (for buys) or a logical chart level.' },
        ]
    },
};

// ─── GENERATE CANDLE DATA ─────────────────────────────────────────
function generateCandles(scenario) {
    const scen = SCENARIOS[scenario];
    const candles = [];
    const start = new Date('2024-01-15T09:15:00+05:30');
    let price = scen.priceBase;
    const totalCandles = 375; // Simulate 375 minutes (6.25 hrs full intraday)
    const priceRange = scen.priceEnd - scen.priceBase;

    for (let i = 0; i < totalCandles; i++) {
        const t = new Date(start.getTime() + i * 5 * 60000);
        const progress = i / totalCandles;
        const trend = priceRange * progress;

        let direction = trend;
        if (scen.direction === 'volatile') {
            direction = Math.sin(progress * Math.PI * 4) * Math.abs(priceRange) * 0.5;
        } else if (scen.direction === 'reversal') {
            direction = i < 20 ? -Math.abs(priceRange) * progress * 2 : Math.abs(priceRange) * (progress - 0.27);
        }

        const noise = (Math.random() - 0.5) * scen.priceBase * scen.volatility * 0.01;
        const open = price;
        const close = price + direction / totalCandles + noise;
        const high = Math.max(open, close) + Math.random() * scen.priceBase * 0.003;
        const low = Math.min(open, close) - Math.random() * scen.priceBase * 0.003;
        const vol = Math.floor(50000 + Math.random() * 200000);

        candles.push({
            time: Math.floor(t.getTime() / 1000),
            open: parseFloat(open.toFixed(2)),
            high: parseFloat(high.toFixed(2)),
            low: parseFloat(low.toFixed(2)),
            close: parseFloat(close.toFixed(2)),
            volume: vol,
        });
        price = close;
    }
    return candles;
}

// ─── CHART SETUP ──────────────────────────────────────────────────
let chart, candleSeries, volumeSeries, allCandles = [];

function initChart() {
    const container = document.getElementById('tvChart');
    if (chart) { chart.remove(); }

    chart = LightweightCharts.createChart(container, {
        layout: { background: { color: '#07070c' }, textColor: '#9ca3af' },
        grid: { vertLines: { color: 'rgba(255,255,255,0.03)' }, horzLines: { color: 'rgba(255,255,255,0.03)' } },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
            vertLine: { color: 'rgba(255,255,255,0.2)', labelBackgroundColor: '#141418' },
            horzLine: { color: 'rgba(255,255,255,0.2)', labelBackgroundColor: '#141418' }
        },
        rightPriceScale: { borderColor: 'rgba(255,255,255,0.07)', textColor: '#6b7280' },
        timeScale: { borderColor: 'rgba(255,255,255,0.07)', textColor: '#6b7280', timeVisible: true, secondsVisible: false },
        handleScroll: true, handleScale: true,
        width: container.clientWidth, height: container.clientHeight,
    });

    candleSeries = chart.addCandlestickSeries({
        upColor: '#26a17b', downColor: '#e05260',
        borderUpColor: '#26a17b', borderDownColor: '#e05260',
        wickUpColor: '#26a17b', wickDownColor: '#e05260',
    });

    volumeSeries = chart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
        color: '#ffffff10',
    });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

    // Crosshair subscription → update OHLC bar
    chart.subscribeCrosshairMove(param => {
        if (!param || !param.seriesData || !candleSeries) return;
        const data = param.seriesData.get(candleSeries);
        if (data) {
            document.getElementById('ohlcO').textContent = data.open?.toFixed(2) ?? '--';
            document.getElementById('ohlcH').textContent = data.high?.toFixed(2) ?? '--';
            document.getElementById('ohlcL').textContent = data.low?.toFixed(2) ?? '--';
            document.getElementById('ohlcC').textContent = data.close?.toFixed(2) ?? '--';
        }
    });

    chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
        if (typeof syncChartOverlays === 'function') syncChartOverlays();
    });

    window.addEventListener('resize', () => {
        chart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
        if (typeof syncChartOverlays === 'function') syncChartOverlays();
    });
}

// ─── REPLAY ENGINE ────────────────────────────────────────────────
let displayedCandles = [];

function startReplay() {
    STATE.playing = true;
    document.getElementById('playIcon').className = 'fa-solid fa-pause';
    document.getElementById('playLabel').textContent = 'PAUSE';

    const interval = Math.max(100, 1000 / STATE.speed);

    STATE.replayTimer = setInterval(() => {
        if (STATE.candleIndex >= allCandles.length) {
            stopReplay(); return;
        }
        const candle = allCandles[STATE.candleIndex];
        displayedCandles.push(candle);
        candleSeries.update(candle);
        volumeSeries.update({ time: candle.time, value: candle.volume, color: candle.close >= candle.open ? 'rgba(38,161,123,0.3)' : 'rgba(224,82,96,0.3)' });

        STATE.currentPrice = candle.close;
        updateLTP(candle.close, candle.close >= candle.open);
        updatePortfolioPnl();
        checkAutoExits(candle.close);
        if (typeof syncChartOverlays === 'function') syncChartOverlays();

        // AI mentor hints at key moments
        if (STATE.candleIndex === 5) showAIMentor(SCENARIOS[STATE.scenario].aiHint);
        if (STATE.candleIndex === 15) checkForMistakes();

        STATE.candleIndex++;
    }, interval);
}

function stopReplay() {
    STATE.playing = false;
    clearInterval(STATE.replayTimer);
    document.getElementById('playIcon').className = 'fa-solid fa-play';
    document.getElementById('playLabel').textContent = 'PLAY';
}

function updateLTP(price, isUp) {
    const el = document.getElementById('activeLtp');
    const old = parseFloat(el.textContent.replace('₹', '').replace(',', ''));
    el.textContent = '₹' + price.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    el.className = 'text-sm font-mono ' + (isUp ? 'text-kgreen price-glow-green' : 'text-kred price-glow-red');

    // Update order button price
    document.getElementById('estValue').textContent = '₹' + (price * parseInt(document.getElementById('qtyInput').value || 1)).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    refreshRiskDisplay();
}

// ─── WATCHLIST ────────────────────────────────────────────────────
function renderWatchlist() {
    const body = document.getElementById('watchlistBody');
    body.innerHTML = '';
    STOCKS.forEach((s, i) => {
        const up = s.chg >= 0;
        const div = document.createElement('div');
        div.className = 'wl-item' + (s.sym === STATE.currentSymbol ? ' active' : '');
        div.innerHTML = `
      <div>
        <div class="wl-sym">${s.sym}</div>
        <div class="wl-name">${s.name.substring(0, 15)}</div>
      </div>
      <div>
        <div class="wl-price ${up ? 'text-kgreen' : 'text-kred'}">₹${s.price.toFixed(2)}</div>
        <div class="wl-chg ${up ? 'text-kgreen' : 'text-kred'}">${up ? '+' : ''}${s.chg.toFixed(2)}%</div>
      </div>`;
        div.addEventListener('click', () => selectStock(s));
        body.appendChild(div);
    });

    // Mini heatmap
    const heat = document.getElementById('miniHeatmap');
    heat.innerHTML = '';
    ['IT', 'Bank', 'PSU', 'FMCG', 'Infra', 'NBFC', 'Energy', 'Auto'].forEach(s => {
        const v = (Math.random() - 0.4) * 3;
        const up = v >= 0;
        const d = document.createElement('div');
        d.className = 'heat-cell';
        d.style.background = up ? `rgba(38,161,123,${0.15 + Math.abs(v) * 0.1})` : `rgba(224,82,96,${0.15 + Math.abs(v) * 0.1})`;
        d.style.color = up ? '#26a17b' : '#e05260';
        d.style.fontSize = '7px';
        d.textContent = s.substring(0, 3);
        heat.appendChild(d);
    });
}

function selectStock(stock) {
    STATE.currentSymbol = stock.sym;
    STATE.currentPrice = stock.price;
    document.getElementById('activeSymbol').textContent = stock.sym;
    document.getElementById('activeLtp').textContent = '₹' + stock.price.toFixed(2);
    document.getElementById('placeOrderBtn').textContent = (STATE.side) + ' ' + stock.sym;
    loadScenario(STATE.scenario, stock.price);
    renderWatchlist();
}

// ─── SCENARIO LOADER ──────────────────────────────────────────────
function showScenarioCard(key) {
    const s = SCENARIOS[key];
    document.getElementById('scenarioIcon').className = 'fa-solid ' + s.icon + ' text-kgold text-xl';
    document.getElementById('scenarioTitle').textContent = s.title;
    document.getElementById('scenarioDesc').textContent = s.desc;
    document.getElementById('scenarioContext').innerHTML = s.context.map(c => `<div class="flex items-start gap-2"><span>${c}</span></div>`).join('');
    document.getElementById('scenarioCard').classList.remove('hidden');
}

function loadScenario(key, basePrice) {
    stopReplay();
    STATE.scenario = key;
    STATE.candleIndex = 0;
    displayedCandles = [];
    const scen = SCENARIOS[key];
    if (basePrice) scen.priceBase = basePrice;
    allCandles = generateCandles(key);
    candleSeries.setData([]);
    volumeSeries.setData([]);
    showAIMentor('Scenario loaded: ' + scen.title + '. Press PLAY to begin. ' + scen.aiHint);
    // Story + Pre-Trade panel update
    if (typeof updateStoryBanner === 'function') { updateStoryBanner(key); insightIdx = 0; }
    if (typeof updatePreTradePanel === 'function') updatePreTradePanel();
}

// ─── ORDER SYSTEM ─────────────────────────────────────────────────
function placeOrder() {
    const qty = parseInt(document.getElementById('qtyInput').value) || 1;
    const orderType = document.getElementById('orderTypeSelect').value;
    const priceInput = parseFloat(document.getElementById('priceInput').value) || STATE.currentPrice;
    const slInput = parseFloat(document.getElementById('slInput').value) || 0;
    const targetInput = parseFloat(document.getElementById('targetInput')?.value) || 0;
    const side = STATE.side;
    const sym = STATE.currentSymbol;
    const execPrice = orderType === 'MARKET' ? STATE.currentPrice * (1 + (Math.random() - 0.5) * 0.001) : priceInput;

    // Validate: no stop loss warning
    if (!slInput || slInput <= 0) {
        showMistake('No Stop Loss set! This is the #1 reason traders blow up. Set a stop loss before entering.');
        document.getElementById('noSlWarning').classList.remove('hidden');
    } else {
        document.getElementById('noSlWarning').classList.add('hidden');
    }

    const cost = execPrice * qty;
    if (side === 'BUY' && cost > STATE.capital) {
        showMistake('Insufficient capital! You need ₹' + cost.toFixed(0) + ' but have ₹' + STATE.capital.toFixed(0));
        return;
    }

    const order = {
        id: Date.now(),
        sym, side, qty, type: orderType,
        execPrice: parseFloat(execPrice.toFixed(2)),
        sl: slInput,
        time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        status: 'EXECUTED',
    };

    STATE.orders.unshift(order);
    STATE.tradeCount++;

    // Update positions
    const existing = STATE.positions.find(p => p.sym === sym && p.side === side);
    if (existing) {
        existing.qty += qty;
        existing.avgPrice = (existing.avgPrice * (existing.qty - qty) + execPrice * qty) / existing.qty;
        existing.sl = slInput;
        existing.target = targetInput;
    } else {
        STATE.positions.push({ sym, side, qty, avgPrice: parseFloat(execPrice.toFixed(2)), sl: slInput, target: targetInput, ltp: execPrice });
    }

    if (side === 'BUY') STATE.capital -= cost + 20; // brokerage ₹20
    else STATE.capital += cost - 20;

    renderBottomTab(document.querySelector('.btab-btn.active')?.dataset?.tab || 'orders');
    flashOrderRow();
    showAIMentor(`Order placed: ${side} ${qty} ${sym} @ ₹${execPrice.toFixed(2)}. ${slInput ? 'Good — stop loss set at ₹' + slInput + '.' : '⚠️ No stop loss — HIGH RISK.'}`);
    updatePortfolioDisplay();
    if (typeof syncChartOverlays === 'function') syncChartOverlays();
    if (typeof window._afterPlaceOrder === 'function') window._afterPlaceOrder();
}

function exitPosition(sym) {
    const pos = STATE.positions.find(p => p.sym === sym);
    if (!pos) return;
    const exitPrice = STATE.currentPrice * (1 + (Math.random() - 0.5) * 0.001);
    const pnl = pos.side === 'BUY'
        ? (exitPrice - pos.avgPrice) * pos.qty
        : (pos.avgPrice - exitPrice) * pos.qty;

    STATE.pnl += pnl;
    STATE.capital += (pos.side === 'BUY' ? exitPrice * pos.qty : 0) - 20;
    if (pnl > 0) STATE.winCount++;

    STATE.journal.push({
        sym: pos.sym, side: pos.side, qty: pos.qty,
        entry: pos.avgPrice, exit: parseFloat(exitPrice.toFixed(2)),
        pnl: parseFloat(pnl.toFixed(2)),
        time: new Date().toLocaleTimeString('en-IN'),
        rr: pos.sl ? Math.abs(pnl / ((pos.avgPrice - pos.sl) * pos.qty)).toFixed(2) : 'N/A',
    });

    STATE.positions = STATE.positions.filter(p => p.sym !== sym);
    updatePortfolioDisplay();
    renderBottomTab('positions');
    showTradeFeedback(pnl, pos);
    if (typeof syncChartOverlays === 'function') syncChartOverlays();
}

// ─── UI UPDATES ───────────────────────────────────────────────────
function updatePortfolioPnl() {
    let unrealizedPnl = 0;
    STATE.positions.forEach(p => {
        p.ltp = STATE.currentPrice;
        const pnl = p.side === 'BUY' ? (STATE.currentPrice - p.avgPrice) * p.qty : (p.avgPrice - STATE.currentPrice) * p.qty;
        unrealizedPnl += pnl;
    });
    const total = STATE.pnl + unrealizedPnl;
    const el = document.getElementById('todayPnl');
    el.textContent = (total >= 0 ? '+' : '') + '₹' + total.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    el.className = 'text-sm font-display font-bold ' + (total >= 0 ? 'text-kgreen' : 'text-kred');
    document.getElementById('totalPnl').textContent = (total >= 0 ? '+' : '') + '₹' + total.toFixed(2);
    document.getElementById('totalPnl').className = 'font-mono font-bold ' + (total >= 0 ? 'text-kgreen' : 'text-kred');
}

function updatePortfolioDisplay() {
    const total = STATE.capital;
    document.getElementById('portfolioVal').textContent = '₹' + total.toLocaleString('en-IN', { maximumFractionDigits: 0 });
    updatePortfolioPnl();
}

function refreshRiskDisplay() {
    const sl = parseFloat(document.getElementById('slInput').value) || 0;
    const qty = parseInt(document.getElementById('qtyInput').value) || 1;
    const risk = sl > 0 ? Math.abs(STATE.currentPrice - sl) * qty : 0;
    document.getElementById('riskDisplay').textContent = sl ? '₹' + risk.toFixed(0) : 'No SL!';
    document.getElementById('riskDisplay').className = 'font-mono ' + (sl ? 'text-kred' : 'text-red-500 font-bold');
    // AI Risk Bar
    const riskPct = (risk / STATE.capital) * 100;
    document.getElementById('aiRiskFill').style.width = Math.min(100, riskPct * 10) + '%';
    document.getElementById('aiRiskFill').className = 'h-full rounded-full transition-all duration-500 ' + (riskPct < 1 ? 'bg-kgreen' : riskPct < 2 ? 'bg-kgold' : 'bg-kred');
    document.getElementById('aiRiskLabel').textContent = riskPct < 1 ? 'LOW RISK — Good setup' : riskPct < 2 ? 'MEDIUM RISK — Acceptable' : 'HIGH RISK — Reduce size!';
    document.getElementById('aiRiskLabel').className = 'text-[10px] font-mono ' + (riskPct < 1 ? 'text-kgreen' : riskPct < 2 ? 'text-kgold' : 'text-kred');
}

// ─── BOTTOM TABS (core) ───────────────────────────────────────────
function _renderBottomTabCore(tab) {
    const c = document.getElementById('bottomTabContent');
    if (tab === 'orders') {
        if (STATE.orders.length === 0) { c.innerHTML = '<p class="text-[10px] text-gray-600 mt-3">No orders yet. Place your first trade.</p>'; return; }
        c.innerHTML = `<table class="sim-table"><thead><tr><th>Time</th><th>Symbol</th><th>Type</th><th>Side</th><th>Qty</th><th>Price</th><th>Status</th></tr></thead><tbody id="ordersBody"></tbody></table>`;
        STATE.orders.slice(0, 10).forEach(o => {
            const row = document.createElement('tr');
            row.innerHTML = `<td>${o.time}</td><td class="font-bold">${o.sym}</td><td>${o.type}</td><td class="${o.side === 'BUY' ? 'green' : 'red'}">${o.side}</td><td>${o.qty}</td><td class="font-mono">₹${o.execPrice}</td><td class="text-kgreen">${o.status}</td>`;
            document.getElementById('ordersBody').appendChild(row);
        });
    } else if (tab === 'positions') {
        if (STATE.positions.length === 0) { c.innerHTML = '<p class="text-[10px] text-gray-600 mt-3">No open positions.</p>'; return; }
        c.innerHTML = `<table class="sim-table"><thead><tr><th>Symbol</th><th>Side</th><th>Qty</th><th>Avg</th><th>LTP</th><th>P&L</th><th>Action</th></tr></thead><tbody id="posBody"></tbody></table>`;
        STATE.positions.forEach(p => {
            const pnl = p.side === 'BUY' ? (STATE.currentPrice - p.avgPrice) * p.qty : (p.avgPrice - STATE.currentPrice) * p.qty;
            const row = document.createElement('tr');
            row.innerHTML = `<td class="font-bold">${p.sym}</td><td class="${p.side === 'BUY' ? 'green' : 'red'}">${p.side}</td><td>${p.qty}</td><td class="font-mono">₹${p.avgPrice.toFixed(2)}</td><td class="font-mono">₹${STATE.currentPrice.toFixed(2)}</td><td class="font-mono ${pnl >= 0 ? 'green' : 'red'}">${pnl >= 0 ? '+' : ''}₹${pnl.toFixed(2)}</td><td><button class="action-exit" onclick="exitPosition('${p.sym}')">EXIT</button></td>`;
            document.getElementById('posBody').appendChild(row);
        });
    } else if (tab === 'holdings') {
        c.innerHTML = '<p class="text-[10px] text-gray-600 mt-3">Holdings (CNC positions) will appear here after delivery trades.</p>';
    } else if (tab === 'journal') {
        if (STATE.journal.length === 0) { c.innerHTML = '<p class="text-[10px] text-gray-600 mt-3">Trade journal empty. Close positions to record trades.</p>'; return; }
        c.innerHTML = `<table class="sim-table"><thead><tr><th>Symbol</th><th>Side</th><th>Qty</th><th>Entry</th><th>Exit</th><th>P&L</th><th>R:R</th><th>Time</th></tr></thead><tbody id="journalBody"></tbody></table>`;
        STATE.journal.forEach(j => {
            const row = document.createElement('tr');
            row.innerHTML = `<td class="font-bold">${j.sym}</td><td class="${j.side === 'BUY' ? 'green' : 'red'}">${j.side}</td><td>${j.qty}</td><td class="font-mono">₹${j.entry.toFixed(2)}</td><td class="font-mono">₹${j.exit.toFixed(2)}</td><td class="font-mono ${j.pnl >= 0 ? 'green' : 'red'}">${j.pnl >= 0 ? '+' : ''}₹${j.pnl.toFixed(2)}</td><td class="font-mono">${j.rr}</td><td>${j.time}</td>`;
            document.getElementById('journalBody').appendChild(row);
        });
    } else if (tab === 'analytics') {
        const winRate = STATE.tradeCount > 0 ? ((STATE.winCount / STATE.tradeCount) * 100).toFixed(0) : 0;
        const totalPnl = STATE.pnl;
        c.innerHTML = `
      <div class="grid grid-cols-5 gap-2 mt-2">
        <div class="analytics-card"><p class="text-[8px] text-gray-500 uppercase">Win Rate</p><p class="text-sm font-display font-bold ${winRate >= 50 ? 'text-kgreen' : 'text-kred'}">${winRate}%</p></div>
        <div class="analytics-card"><p class="text-[8px] text-gray-500 uppercase">Total Trades</p><p class="text-sm font-display font-bold text-white">${STATE.tradeCount}</p></div>
        <div class="analytics-card"><p class="text-[8px] text-gray-500 uppercase">Realized P&L</p><p class="text-sm font-display font-bold ${totalPnl >= 0 ? 'text-kgreen' : 'text-kred'}">${totalPnl >= 0 ? '+' : ''}₹${totalPnl.toFixed(0)}</p></div>
        <div class="analytics-card"><p class="text-[8px] text-gray-500 uppercase">Capital</p><p class="text-sm font-display font-bold text-white">₹${STATE.capital.toFixed(0)}</p></div>
        <div class="analytics-card"><p class="text-[8px] text-gray-500 uppercase">Scenario</p><p class="text-sm font-display font-bold text-kgold">${SCENARIOS[STATE.scenario].title.split(' ')[0]}</p></div>
      </div>`;
    }
}

// renderBottomTab called by bottom panel - extended below to include new tabs
function renderBottomTab(tab) { _renderBottomTabCore(tab); }

function flashOrderRow() {
    const rows = document.querySelectorAll('#ordersBody tr');
    if (rows.length > 0) rows[0].classList.add('row-flash');
}

// ─── AI MENTOR ────────────────────────────────────────────────────
function showAIMentor(text) {
    document.getElementById('aiMentorText').textContent = '"' + text + '"';
    document.getElementById('aiMentorOverlay').classList.remove('hidden');
    clearTimeout(window.mentorTimer);
    window.mentorTimer = setTimeout(() => {
        document.getElementById('aiMentorOverlay').classList.add('hidden');
    }, 8000);
}

function checkForMistakes() {
    if (STATE.positions.length > 3) showMistake('Overtrading detected! You have ' + STATE.positions.length + ' open positions. Pros focus on 1-2 high conviction trades.');
    const noSl = STATE.positions.filter(p => !p.sl || p.sl <= 0);
    if (noSl.length > 0) showMistake('Position without stop loss: ' + noSl.map(p => p.sym).join(', ') + '. Set SL immediately.');
}

function showMistake(text) {
    document.getElementById('mistakeText').textContent = text;
    document.getElementById('mistakeAlert').classList.remove('hidden');
    clearTimeout(window.mistakeTimer);
    window.mistakeTimer = setTimeout(() => document.getElementById('mistakeAlert').classList.add('hidden'), 5000);
}

function showTradeFeedback(pnl, pos) {
    const win = pnl >= 0;

    // Clean status messaging
    let title = win ? '✅ Trade Won' : '❌ Trade Lost';
    let subtitle = '<div class="text-[10px] text-gray-500 font-normal mt-0.5">Manual Exit / End of Day</div>';
    if (pos.reason === 'SL hit') {
        title = '🛡️ STOP LOSS HIT';
        subtitle = '<div class="text-[10px] text-red-500 font-normal mt-0.5 bg-red-500/10 inline-block px-2 py-0.5 rounded mt-1">Risk Managed. Capital Protected.</div>';
    } else if (pos.reason === 'Target hit') {
        title = '🎯 TARGET HIT';
        subtitle = '<div class="text-[10px] text-green-500 font-normal mt-0.5 bg-green-500/10 inline-block px-2 py-0.5 rounded mt-1">Target Reached. Profit Booked!</div>';
    }

    document.getElementById('feedbackIcon').className = 'w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 ' + (win ? 'bg-kgreen/20' : 'bg-kred/20');
    document.getElementById('feedbackIcon').innerHTML = `<i class="fa-solid ${win ? 'fa-check' : 'fa-xmark'} text-${win ? 'kgreen' : 'kred'} text-lg"></i>`;
    document.getElementById('feedbackTitle').innerHTML = `${title}<br>${subtitle}`;

    document.getElementById('feedbackBody').innerHTML = `
    <div class="flex justify-between"><span class="text-gray-400">P&L:</span><span class="font-mono ${win ? 'text-kgreen' : 'text-kred'} font-bold text-lg">${pnl >= 0 ? '+' : ''}₹${pnl.toFixed(2)}</span></div>
    <div class="flex justify-between"><span class="text-gray-400">Hold Time:</span><span class="font-mono text-white">~${Math.floor(Math.random() * 30 + 5)} min</span></div>
    <div class="flex justify-between"><span class="text-gray-400">Slippage:</span><span class="font-mono text-kgold">₹${(Math.random() * 5).toFixed(2)}</span></div>
    <div class="mt-4 p-3 bg-[#0d0d12] border border-[#ffffff10] rounded-lg text-[10px] text-gray-400">
      <p class="text-[9px] text-kblue font-bold uppercase mb-1 flex items-center gap-1"><i class="fa-solid fa-robot"></i> FIN-OS AI Analysis</p>
      <p class="leading-relaxed">${win ? pos.sl ? 'Excellent discipline displaying professional-tier risk management. Target execution was precise.' : 'Lucky win. Executing without a stop loss is gambling, not trading. Rectify immediately.' : pos.sl ? 'The Stop Loss worked exactly as intended. Experiencing small controlled losses is the hallmark of a professional.' : 'Massive preventable damage. Never enter without an SL.'}</p>
    </div>`;
    document.getElementById('feedbackModal').classList.remove('hidden');
}

// ─── WHY MODE ─────────────────────────────────────────────────────
function toggleWhyMode() {
    STATE.whyMode = !STATE.whyMode;
    document.body.classList.toggle('why-on', STATE.whyMode);
    if (STATE.whyMode) showAIMentor('WHY MODE ON — Hover over any field label to see explanations. Every element is labeled to teach you the "why" behind it.');
}

function showWhyTooltip(key, el) {
    if (!STATE.whyMode) return;
    const data = WHY_DATA[key];
    if (!data) return;
    const tip = document.getElementById('whyTooltip');
    document.getElementById('whyTitle').textContent = data.title;
    document.getElementById('whyBody').innerHTML = data.items.map(i => `<div class="why-item mb-1"><span class="text-kgold font-bold">${i.label}:</span> ${i.val}</div>`).join('');
    const rect = el.getBoundingClientRect();
    const chartRect = document.getElementById('chartContainer').getBoundingClientRect();
    tip.style.left = (rect.left - chartRect.left - 10) + 'px';
    tip.style.top = (rect.bottom - chartRect.top + 8) + 'px';
    tip.classList.remove('hidden');
    tip.classList.add('visible');
}

function hideWhyTooltip() {
    document.getElementById('whyTooltip').classList.add('hidden');
    document.getElementById('whyTooltip').classList.remove('visible');
}

// ─── ONBOARDING ───────────────────────────────────────────────────
const ONBOARD_STEPS = [
    { icon: 'fa-chart-candlestick', title: 'Welcome to FIN-OS Simulator', body: 'India\'s first Thinking Trading OS. This is NOT just a simulator — it\'s a behavioral training system.', color: 'kblue' },
    { icon: 'fa-film', title: 'Choose Your Scenario', body: 'Pick a trading scenario — Breakout, Trend Day, News Event. Each teaches different market behavior.', color: 'kgold' },
    { icon: 'fa-play', title: 'Press Play to Start', body: 'Price replays candle-by-candle. Watch how markets actually move. Control speed with 1× 5× 10×.', color: 'kgreen' },
    { icon: 'fa-lightbulb', title: 'Enable WHY MODE', body: 'Toggle WHY MODE ON — hover any field to see what it means, why it exists, and how professionals use it.', color: 'kgold' },
    { icon: 'fa-robot', title: 'AI Mentor Watches You', body: 'Our AI analyzes every trade. It detects overtrading, missing stop losses, and emotional decisions.', color: 'kblue' },
];
let onboardIdx = 0;

function renderOnboard() {
    const step = ONBOARD_STEPS[onboardIdx];
    document.getElementById('onboardStep').innerHTML = `
    <div class="onboard-step">
      <div class="w-16 h-16 rounded-2xl bg-${step.color}/20 border border-${step.color}/30 flex items-center justify-center mx-auto mb-6">
        <i class="fa-solid ${step.icon} text-${step.color} text-2xl"></i>
      </div>
      <p class="text-[11px] text-gray-500 uppercase tracking-widest mb-2">${onboardIdx + 1} of ${ONBOARD_STEPS.length}</p>
      <h2 class="text-2xl font-display font-bold text-white mb-4">${step.title}</h2>
      <p class="text-gray-400 text-sm leading-relaxed mb-8">${step.body}</p>
      <div class="flex justify-center gap-2 mb-8">${ONBOARD_STEPS.map((_, i) => `<div class="onboard-dot${i === onboardIdx ? ' active' : ''}"></div>`).join('')}</div>
      <button id="onboardNext" class="px-8 py-3.5 bg-gradient-to-r from-kblue to-blue-700 text-white font-display font-bold rounded-xl text-sm hover:opacity-90 transition-all shadow-lg shadow-kblue/20">
        ${onboardIdx < ONBOARD_STEPS.length - 1 ? 'Next →' : 'Start Trading →'}
      </button>
    </div>`;
    document.getElementById('onboardNext').addEventListener('click', () => {
        onboardIdx++;
        if (onboardIdx >= ONBOARD_STEPS.length) {
            document.getElementById('onboardOverlay').classList.add('hidden');
            STATE.onboardDone = true;
            showScenarioCard(STATE.scenario);
        } else { renderOnboard(); }
    });
}

// ─── EVENT LISTENERS ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initChart();
    renderWatchlist();
    renderOnboard();
    loadScenario('breakout');
    renderBottomTab('orders');

    // Play/Pause
    document.getElementById('playBtn').addEventListener('click', () => {
        STATE.playing ? stopReplay() : startReplay();
    });

    // Speed buttons
    document.querySelectorAll('.speed-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            STATE.speed = parseInt(btn.dataset.speed);
            document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (STATE.playing) { stopReplay(); startReplay(); }
        });
    });

    // Scenario selector
    document.getElementById('scenarioSelect').addEventListener('change', e => {
        loadScenario(e.target.value);
        showScenarioCard(e.target.value);
    });

    // Scenario card buttons
    document.getElementById('scenarioStart').addEventListener('click', () => {
        document.getElementById('scenarioCard').classList.add('hidden');
        startReplay();
    });
    document.getElementById('scenarioClose').addEventListener('click', () => document.getElementById('scenarioCard').classList.add('hidden'));

    // Buy/Sell tabs
    document.querySelectorAll('.order-side-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            STATE.side = btn.dataset.side;
            document.getElementById('buyTab').className = 'order-side-btn flex-1 py-2.5 text-xs font-bold ' + (STATE.side === 'BUY' ? 'text-kgreen border-b-2 border-kgreen bg-kgreen/5' : 'text-gray-500 hover:text-kgreen transition-colors');
            document.getElementById('sellTab').className = 'order-side-btn flex-1 py-2.5 text-xs font-bold ' + (STATE.side === 'SELL' ? 'text-kred border-b-2 border-kred bg-kred/5' : 'text-gray-500 hover:text-kred transition-colors');
            document.getElementById('placeOrderBtn').textContent = STATE.side + ' ' + STATE.currentSymbol;
            document.getElementById('placeOrderBtn').className = 'w-full py-3 rounded-xl text-sm font-display font-bold text-white bg-gradient-to-r ' + (STATE.side === 'BUY' ? 'from-kgreen to-emerald-600 shadow-kgreen/20' : 'from-kred to-rose-700 shadow-kred/20') + ' hover:opacity-90 transition-all shadow-lg mt-2';
        });
    });

    // Product type
    document.querySelectorAll('.ptype-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.ptype-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Timeframe buttons
    document.querySelectorAll('.tf-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Bottom tabs
    document.querySelectorAll('.btab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.btab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderBottomTab(btn.dataset.tab);
        });
    });

    // Qty controls
    document.getElementById('qtyPlus').addEventListener('click', () => { document.getElementById('qtyInput').value = (parseInt(document.getElementById('qtyInput').value) || 1) + 1; refreshRiskDisplay(); });
    document.getElementById('qtyMinus').addEventListener('click', () => { const v = (parseInt(document.getElementById('qtyInput').value) || 1) - 1; if (v >= 1) document.getElementById('qtyInput').value = v; refreshRiskDisplay(); });
    document.getElementById('qtyInput').addEventListener('input', refreshRiskDisplay);
    document.getElementById('slInput').addEventListener('input', () => { refreshRiskDisplay(); document.getElementById('noSlWarning').classList.add('hidden'); });

    // Place order
    document.getElementById('placeOrderBtn').addEventListener('click', placeOrder);

    // WHY MODE
    document.getElementById('whyToggle').addEventListener('click', toggleWhyMode);
    document.querySelectorAll('.why-trigger').forEach(el => {
        el.addEventListener('mouseenter', () => showWhyTooltip(el.dataset.why, el));
        el.addEventListener('mouseleave', hideWhyTooltip);
    });

    // AI Mentor dismiss
    document.getElementById('dismissMentor').addEventListener('click', () => document.getElementById('aiMentorOverlay').classList.add('hidden'));

    // Feedback close
    document.getElementById('feedbackClose').addEventListener('click', () => document.getElementById('feedbackModal').classList.add('hidden'));

    // Live watchlist price ticker
    setInterval(() => {
        STOCKS.forEach(s => {
            s.price += (Math.random() - 0.49) * 3;
            s.price = Math.max(50, s.price);
        });
        renderWatchlist();
    }, 3000);

    // WHY TRADE — button selection
    document.querySelectorAll('.why-trade-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.why-trade-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            STATE.tradeReason = btn.dataset.reason;
            const warn = document.getElementById('whyTradeWarn');
            if (STATE.tradeReason === 'guess') {
                warn.classList.remove('hidden');
                showMistake('⚠️ "Guess / FOMO" selected. This is gambling, not trading. 90% of beginner losses come from this.');
            } else { warn.classList.add('hidden'); }
        });
    });

    // Safety Mode toggle
    document.getElementById('safetyToggle').addEventListener('click', () => {
        STATE.safetyMode = !STATE.safetyMode;
        document.body.classList.toggle('safety-off', !STATE.safetyMode);
        showAIMentor(STATE.safetyMode
            ? '🛡️ SAFETY MODE ON — Forced stop loss, max 3 trades/day. Perfect for beginners.'
            : '⚡ SAFETY MODE OFF — Full freedom. With freedom comes responsibility. Set your own stops.');
    });

    // SL + QTY live → update R:R and Pre-Trade panel
    document.getElementById('slInput').addEventListener('input', updatePreTradePanel);
    document.getElementById('qtyInput').addEventListener('input', updatePreTradePanel);
    document.getElementById('slInput').addEventListener('input', () => {
        refreshRiskDisplay();
        document.getElementById('noSlWarning').classList.add('hidden');
    });

    // Story banner scenario update
    updateStoryBanner(STATE.scenario);

    // Chart insight auto-rotate
    setInterval(rotatechartInsight, 5000);
    rotatechartInsight();

    // Capital used tracker
    setInterval(updateCapitalUsed, 2000);
});

// ╔══════════════════════════════════════════════════════════════════╗
// ║        TIER 1: PRE-TRADE INTELLIGENCE ENGINE                   ║
// ╚══════════════════════════════════════════════════════════════════╝

const SETUP_GRADES = {
    breakout: { grade: 'A', trend: 'Strong Uptrend', signal: 'Breakout', proWould: 'BUY', insight: 'Volume confirms the breakout. Classic high-probability setup.', gradeClass: 'grade-a' },
    trend: { grade: 'B+', trend: 'Uptrend', signal: 'Trend Follow', proWould: 'BUY DIP', insight: 'Good trend day. Wait for the first pullback before entering.', gradeClass: 'grade-b' },
    reversal: { grade: 'B', trend: 'Ranging→Up', signal: 'Reversal', proWould: 'WAIT', insight: 'Reversal forming. Wait for confirmation candle before entry.', gradeClass: 'grade-b' },
    news: { grade: 'C', trend: 'Volatile', signal: 'News Spike', proWould: 'SIT OUT', insight: 'News event = unpredictable. Soros says: wait for the dust to settle.', gradeClass: 'grade-c' },
    crash: { grade: 'D', trend: 'Downtrend', signal: 'Distribution', proWould: 'CASH', insight: 'Cash is a position. Buffett stays out on crash days.', gradeClass: 'grade-d' },
};

function updatePreTradePanel() {
    const scen = STATE.scenario;
    const g = SETUP_GRADES[scen] || SETUP_GRADES.breakout;
    const sl = parseFloat(document.getElementById('slInput').value) || 0;
    const entry = STATE.currentPrice;
    const target = entry + (entry - sl) * 2; // default 1:2 R:R
    const rr = sl > 0 ? (Math.abs(target - entry) / Math.abs(entry - sl)).toFixed(1) : '—';

    const gradeEl = document.getElementById('setupGrade');
    gradeEl.textContent = g.grade;
    gradeEl.className = 'text-sm font-display font-black ' + g.gradeClass;

    document.getElementById('trendLabel').textContent = g.trend;
    document.getElementById('signalLabel').textContent = g.signal;
    document.getElementById('rrRatio').textContent = rr !== '—' ? rr + ':1' : '—';
    document.getElementById('proWould').textContent = g.proWould;
    document.getElementById('setupInsight').textContent = g.insight;

    // Live R:R in bottom bar
    if (document.getElementById('globalRR')) {
        document.getElementById('globalRR').textContent = rr !== '—' ? rr + ':1' : '—';
    }

    // Pro Would color
    const pw = document.getElementById('proWould');
    pw.className = 'font-bold ' + (g.proWould.includes('BUY') ? 'text-kgreen' : g.proWould === 'CASH' || g.proWould === 'SIT OUT' ? 'text-kred' : 'text-purple-400');
}

// ╔══════════════════════════════════════════════════════════════════╗
// ║        TIER 1: SCENARIO STORY MODE                             ║
// ╚══════════════════════════════════════════════════════════════════╝

const STORY_TEXTS = {
    breakout: '📢 Today: Reliance reacting to strong GDP data. Nifty breaking above 22,500. Smart money is buying. Watch ₹2,820 as the key breakout level.',
    trend: '📢 Trend Day: FIIs net buyers for 5th consecutive day. Market in "one-way traffic" mode. Every dip is being bought.',
    reversal: '📢 Reversal: Gap down at open triggered panic. But smart money is accumulating quietly. Watch for the V-shaped recovery.',
    news: '📢 RBI Surprise: Rate decision at 10 AM. Market whipsawing ±2%. Soros says: trade the reaction, not the prediction.',
    crash: '📢 🚨 Crash Day: US Fed surprise triggered global selloff. Nifty circuit breaker possible. Buffett is watching Netflix.',
};

const MARKET_PHASES = {
    breakout: { label: '📈 BREAKOUT', color: 'text-kgreen border-kgreen/30 bg-kgreen/10' },
    trend: { label: '📊 TRENDING', color: 'text-kgold border-kgold/30 bg-kgold/10' },
    reversal: { label: '🔄 REVERSAL', color: 'text-kblue border-kblue/30 bg-kblue/10' },
    news: { label: '⚡ VOLATILE', color: 'text-kred border-kred/30 bg-kred/10' },
    crash: { label: '💥 CRASH', color: 'text-kred border-kred/30 bg-kred/10' },
};

function updateStoryBanner(scenario) {
    const text = STORY_TEXTS[scenario] || STORY_TEXTS.breakout;
    const phase = MARKET_PHASES[scenario] || MARKET_PHASES.breakout;
    const storyEl = document.getElementById('storyText');
    const phaseEl = document.getElementById('marketPhase');
    if (storyEl) storyEl.textContent = text;
    if (phaseEl) { phaseEl.textContent = phase.label; phaseEl.className = 'text-[9px] font-bold border px-2 py-0.5 rounded-full ' + phase.color; }
}

// ╔══════════════════════════════════════════════════════════════════╗
// ║        TIER 1: SMART CHART INSIGHTS                            ║
// ╚══════════════════════════════════════════════════════════════════╝

const CHART_INSIGHTS = {
    breakout: ['📈 Price breaking above yesterday\'s high — strong signal', '🔥 Volume spike on breakout = institutional confirmation', '⚡ First 15 minutes = momentum setup. Watch closely.', '📊 Opening Range: ₹2,820–₹2,840. Break above = bullish.'],
    trend: ['📊 Trend day: First 30-min range defines the day direction', '💪 Every pullback is a buy opportunity in uptrend', '📉 Wait for dip to 9-period EMA before entering', '⚡ Volume declining on pullbacks = trend still strong'],
    reversal: ['🔄 V-shape reversal forming — wait for the second leg up', '💡 RSI divergence visible — price new low, momentum higher', '⚠️ False breakdowns trap short sellers. Watch for squeeze.', '🎯 Entry on the first green candle after reversal'],
    news: ['⚡ News spike: Wait 5 min post-announcement before trading', '📊 First candle after news = trap candle. Avoid it.', '🛑 High volatility = wider stops needed. Adjust SL.', '🧠 Soros rule: Trade the second move, not the first.'],
    crash: ['💥 Circuit breaker likely below Nifty -5%', '🛑 Selling into panic = amateur behavior', '💡 Buffett: "Be greedy when others are fearful"', '🏦 Cash is a position. Preservation beats return today.'],
};
let insightIdx = 0;

function rotatechartInsight() {
    const insights = CHART_INSIGHTS[STATE.scenario] || CHART_INSIGHTS.breakout;
    const el = document.getElementById('chartInsightText');
    if (!el) return;
    el.textContent = insights[insightIdx % insights.length];
    const isBearish = STATE.scenario === 'crash' || STATE.scenario === 'news';
    el.className = 'text-[9px] font-mono ' + (isBearish ? 'insight-bearish' : 'insight-bullish');
    insightIdx++;
}

// ╔══════════════════════════════════════════════════════════════════╗
// ║        TIER 2: POST-TRADE AUTOPSY + EMOTION TRACKING           ║
// ╚══════════════════════════════════════════════════════════════════╝

function showPostTradeAutopsy(pnl, pos, tradeReason) {
    const win = pnl >= 0;
    const rr = pos.sl ? Math.abs(pnl / ((pos.avgPrice - pos.sl) * pos.qty)).toFixed(2) : 'N/A';
    const entryQuality = STATE.candleIndex > 30 ? 'Late Entry' : STATE.candleIndex < 8 ? 'Early / Premature' : 'Good Timing';
    const exitQuality = win ? 'Disciplined ✅' : 'Forced / Emotional';
    const mistake = !pos.sl ? 'No stop loss — preventable loss' :
        tradeReason === 'guess' ? 'Entered with no strategy (FOMO)' :
            STATE.positions.length > 3 ? 'Overtrading — too many positions' : 'None detected ✅';

    document.getElementById('feedbackIcon').className = 'w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 ' + (win ? 'bg-kgreen/20' : 'bg-kred/20');
    document.getElementById('feedbackIcon').innerHTML = `<i class="fa-solid ${win ? 'fa-check' : 'fa-xmark'} text-${win ? 'kgreen' : 'kred'} text-lg"></i>`;
    document.getElementById('feedbackTitle').textContent = win ? '✅ Trade Won — Autopsy' : '❌ Trade Lost — Autopsy';

    document.getElementById('feedbackBody').innerHTML = `
      <div class="autopsy-row"><span class="text-gray-500">P&L</span><span class="font-mono font-bold ${win ? 'text-kgreen' : 'text-kred'}">${pnl >= 0 ? '+' : ''}₹${pnl.toFixed(2)}</span></div>
      <div class="autopsy-row"><span class="text-gray-500">R:R achieved</span><span class="font-mono">${rr}</span></div>
      <div class="autopsy-row"><span class="text-gray-500">Entry Quality</span><span class="autopsy-badge ${entryQuality === 'Good Timing' ? 'badge-good' : entryQuality.includes('Late') ? 'badge-warn' : 'badge-bad'}">${entryQuality}</span></div>
      <div class="autopsy-row"><span class="text-gray-500">Exit Quality</span><span class="autopsy-badge ${win ? 'badge-good' : 'badge-warn'}">${exitQuality}</span></div>
      <div class="autopsy-row"><span class="text-gray-500">Mistake</span><span class="autopsy-badge ${mistake.includes('None') ? 'badge-good' : 'badge-bad'}">${mistake}</span></div>
      <div class="autopsy-row"><span class="text-gray-500">Strategy</span><span class="font-mono text-kblue text-[9px]">${tradeReason || 'Unknown'}</span></div>
      <div class="mt-2 p-2 bg-[#0d1117] rounded-lg text-[9px]">
        <p class="text-kblue font-bold uppercase mb-1">Pro vs You</p>
        <p class="text-gray-400"><span class="text-white font-bold">You:</span> ${entryQuality} @ ₹${pos.avgPrice.toFixed(2)}</p>
        <p class="text-gray-400"><span class="text-purple-400 font-bold">Pro:</span> ${STATE.candleIndex > 20 ? 'Already in + has moved stop to breakeven' : 'Would wait for volume confirmation before entry'}</p>
      </div>`;

    document.getElementById('feedbackModal').classList.remove('hidden');

    // Show emotion tracking after a small delay
    setTimeout(() => showEmotionModal(pnl), 3000);

    // Log mistake
    if (!mistake.includes('None')) {
        STATE.mistakeLog = STATE.mistakeLog || [];
        STATE.mistakeLog.push({ trade: pos.sym, mistake, time: new Date().toLocaleTimeString('en-IN'), pnl: parseFloat(pnl.toFixed(2)) });
    }
    STATE.insightLog = STATE.insightLog || [];
    STATE.insightLog.push({
        lesson: win ? `Won on ${pos.sym}: ${entryQuality} entry with ${tradeReason} strategy` : `Lost on ${pos.sym}: ${mistake}`,
        pnl: parseFloat(pnl.toFixed(2)), win,
    });
}

function showEmotionModal(pnl) {
    const overlay = document.createElement('div');
    overlay.id = 'emotionOverlay';
    overlay.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm';
    overlay.innerHTML = `
      <div class="bg-[#0d0d12] border border-[#ffffff10] rounded-2xl p-6 max-w-sm w-full mx-4">
        <p class="text-[9px] text-kgold font-bold uppercase tracking-widest mb-1">EMOTION TRACKER — Soros Technique</p>
        <h3 class="text-lg font-display font-bold mb-1">How did you feel during this trade?</h3>
        <p class="text-[10px] text-gray-500 mb-4">Correlating emotion with outcome helps identify your behavioral patterns.</p>
        <div class="grid grid-cols-3 gap-2 mb-4">
          <button class="emotion-btn" data-emotion="confident">😤<br>Confident</button>
          <button class="emotion-btn" data-emotion="fearful">😰<br>Fearful</button>
          <button class="emotion-btn" data-emotion="fomo">🔥<br>FOMO</button>
          <button class="emotion-btn" data-emotion="calm">🧘<br>Calm</button>
          <button class="emotion-btn" data-emotion="revenge">😤<br>Revenge</button>
          <button class="emotion-btn" data-emotion="neutral">😐<br>Neutral</button>
        </div>
        <p class="text-[9px] text-gray-600 text-center">Soros: "Markets are driven by human emotion — your edge is knowing your own emotions."</p>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelectorAll('.emotion-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const emotion = btn.dataset.emotion;
            STATE.emotionLog = STATE.emotionLog || [];
            STATE.emotionLog.push({ emotion, pnl: parseFloat(pnl.toFixed(2)), win: pnl >= 0, time: new Date().toLocaleTimeString('en-IN') });
            overlay.remove();
            showAIMentor(`Emotion logged: "${emotion}". ${emotion === 'fomo' ? 'FOMO trades lose 73% of the time according to SEBI data.' : emotion === 'revenge' ? 'Revenge trading is the fastest way to blow up your account.' : emotion === 'calm' ? 'Trading calm = best outcomes. You are building discipline.' : ''}`);
        });
    });
    setTimeout(() => overlay?.remove(), 15000);
}

// ╔══════════════════════════════════════════════════════════════════╗
// ║        TIER 2: MISTAKES + INSIGHTS TABS                        ║
// ╚══════════════════════════════════════════════════════════════════╝

// Extend renderBottomTab to handle new tabs; calls _renderBottomTabCore for existing tabs
function renderBottomTab(tab) {
    if (tab === 'mistakes') {
        const c = document.getElementById('bottomTabContent');
        const logs = STATE.mistakeLog || [];
        if (!logs.length) { c.innerHTML = '<p class="text-[10px] text-gray-600 mt-3">✅ No mistakes detected yet. Keep trading.</p>'; return; }
        c.innerHTML = logs.map(m => `
          <div class="mistake-item">
            <div class="flex items-center justify-between mb-1">
              <span class="text-[10px] font-bold text-kred">${m.trade}</span>
              <span class="font-mono text-[9px] ${m.pnl >= 0 ? 'text-kgreen' : 'text-kred'}">${m.pnl >= 0 ? '+' : ''}₹${m.pnl.toFixed(0)}</span>
            </div>
            <p class="text-[9px] text-gray-400">⚠️ ${m.mistake}</p>
            <p class="text-[8px] text-gray-600 mt-0.5">${m.time}</p>
          </div>`).join('');
    } else if (tab === 'insights') {
        const c = document.getElementById('bottomTabContent');
        const logs = STATE.insightLog || [];
        const emotions = STATE.emotionLog || [];
        if (!logs.length) { c.innerHTML = '<p class="text-[10px] text-gray-600 mt-3">💡 Trade and close positions to generate AI insights.</p>'; return; }
        c.innerHTML = logs.map(l => `
          <div class="insight-item">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-[10px]">${l.win ? '✅' : '❌'}</span>
              <span class="text-[10px] text-gray-300">${l.lesson}</span>
            </div>
            <span class="font-mono text-[9px] ${l.pnl >= 0 ? 'text-kgreen' : 'text-kred'}">${l.pnl >= 0 ? '+' : ''}₹${l.pnl.toFixed(0)}</span>
          </div>`).join('') +
            (emotions.length ? `<div class="mt-2 p-2 bg-[#0d1117] rounded-lg">
          <p class="text-[9px] text-kgold font-bold mb-1">EMOTION PATTERN</p>
          ${emotions.map(e => `<p class="text-[9px] text-gray-400">${e.emotion} → ${e.win ? 'WIN ✅' : 'LOSS ❌'} (₹${e.pnl.toFixed(0)})</p>`).join('')}
        </div>` : '');
    } else {
        _renderBottomTabCore(tab);
    }
}

// ╔══════════════════════════════════════════════════════════════════╗
// ║        TIER 2: UPGRADED WATCHLIST WITH MOMENTUM TAGS           ║
// ╚══════════════════════════════════════════════════════════════════╝

const MOMENTUM_TAGS = ['🔥 HOT', '📈 UP', '💤 LOW', '📊 FLAT', '⚡ SURGE'];
const MOMENTUM_CLASSES = ['tag-hot', 'tag-up', 'tag-low', 'tag-low', 'tag-up'];

const _origRenderWatchlist = renderWatchlist;
function renderWatchlist() {
    const body = document.getElementById('watchlistBody');
    body.innerHTML = '';
    STOCKS.forEach((s, i) => {
        const up = s.chg >= 0;
        const tagIdx = Math.floor(Math.abs(s.chg) > 1.5 ? (up ? 1 : 4) : Math.abs(s.chg) < 0.3 ? 2 : (up ? 1 : 0));
        const tagLabel = MOMENTUM_TAGS[tagIdx] || '📊';
        const tagClass = MOMENTUM_CLASSES[tagIdx] || 'tag-low';
        const div = document.createElement('div');
        div.className = 'wl-item' + (s.sym === STATE.currentSymbol ? ' active' : '');
        div.innerHTML = `
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="wl-sym">${s.sym}</span>
              <span class="momentum-tag ${tagClass}">${tagLabel}</span>
            </div>
            <div class="wl-name">${s.name.substring(0, 14)}</div>
          </div>
          <div class="text-right shrink-0">
            <div class="wl-price ${up ? 'text-kgreen' : 'text-kred'}">₹${s.price.toFixed(2)}</div>
            <div class="wl-chg ${up ? 'text-kgreen' : 'text-kred'}">${up ? '+' : ''}${s.chg.toFixed(2)}%</div>
          </div>`;
        div.addEventListener('click', () => selectStock(s));
        body.appendChild(div);
    });

    // Mini heatmap
    const heat = document.getElementById('miniHeatmap');
    heat.innerHTML = '';
    ['IT', 'Bank', 'PSU', 'FMCG', 'Infra', 'NBFC', 'Energy', 'Auto'].forEach(s => {
        const v = (Math.random() - 0.4) * 3;
        const up = v >= 0;
        const d = document.createElement('div');
        d.className = 'heat-cell';
        d.style.background = up ? `rgba(38,161,123,${0.15 + Math.abs(v) * 0.1})` : `rgba(224,82,96,${0.15 + Math.abs(v) * 0.1})`;
        d.style.color = up ? '#26a17b' : '#e05260';
        d.style.fontSize = '7px';
        d.textContent = s.substring(0, 3);
        heat.appendChild(d);
    });
}

// ╔══════════════════════════════════════════════════════════════════╗
// ║        UPGRADED: placeOrder with reason tracking               ║
// ╚══════════════════════════════════════════════════════════════════╝

function placeOrder() {
    const qty = parseInt(document.getElementById('qtyInput').value) || 1;
    const orderType = document.getElementById('orderTypeSelect').value;
    const priceInput = parseFloat(document.getElementById('priceInput').value) || STATE.currentPrice;
    const slInput = parseFloat(document.getElementById('slInput').value) || 0;
    const side = STATE.side;
    const sym = STATE.currentSymbol;
    const tradeReason = STATE.tradeReason || null;

    // Safety Mode: block if no SL
    if (STATE.safetyMode !== false && (!slInput || slInput <= 0)) {
        showMistake('🛡️ SAFETY MODE ACTIVE — Stop Loss is required. Set a stop loss price before placing this order.');
        document.getElementById('noSlWarning').classList.remove('hidden');
        return;
    }

    // Require a trade reason
    if (!tradeReason) {
        showMistake('⚠️ Select "Why This Trade?" before executing. Don\'t click blindly — think first.');
        document.getElementById('whyTradeWarn').textContent = '⚠️ You must select a reason before trading.';
        document.getElementById('whyTradeWarn').classList.remove('hidden');
        return;
    }

    // Safety Mode: max 3 trades per day
    if (STATE.safetyMode !== false && STATE.tradeCount >= 3) {
        showMistake('🛡️ SAFETY MODE: Maximum 3 trades/day reached. Overtrading is a beginner trap.');
        return;
    }

    const execPrice = orderType === 'MARKET' ? STATE.currentPrice * (1 + (Math.random() - 0.5) * 0.001) : priceInput;

    if (!slInput || slInput <= 0) {
        showMistake('No Stop Loss set! This is the #1 reason traders blow up.');
        document.getElementById('noSlWarning').classList.remove('hidden');
    } else { document.getElementById('noSlWarning').classList.add('hidden'); }

    const cost = execPrice * qty;
    if (side === 'BUY' && cost > STATE.capital) {
        showMistake('Insufficient capital! You need ₹' + cost.toFixed(0) + ' but have ₹' + STATE.capital.toFixed(0));
        return;
    }

    const order = {
        id: Date.now(), sym, side, qty, type: orderType,
        execPrice: parseFloat(execPrice.toFixed(2)),
        sl: slInput, reason: tradeReason,
        time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        status: 'EXECUTED',
    };

    STATE.orders.unshift(order);
    STATE.tradeCount++;

    const existing = STATE.positions.find(p => p.sym === sym && p.side === side);
    if (existing) {
        existing.qty += qty;
        existing.avgPrice = (existing.avgPrice * (existing.qty - qty) + execPrice * qty) / existing.qty;
    } else {
        STATE.positions.push({ sym, side, qty, avgPrice: parseFloat(execPrice.toFixed(2)), sl: slInput, ltp: execPrice, reason: tradeReason });
    }

    if (side === 'BUY') STATE.capital -= cost + 20;
    else STATE.capital += cost - 20;

    // Reset why trade selection
    document.querySelectorAll('.why-trade-btn').forEach(b => b.classList.remove('active'));
    STATE.tradeReason = null;
    document.getElementById('whyTradeWarn').classList.add('hidden');

    renderBottomTab(document.querySelector('.btab-btn.active')?.dataset?.tab || 'orders');
    flashOrderRow();
    showAIMentor(`Order placed: ${side} ${qty} ${sym} @ ₹${execPrice.toFixed(2)} — Reason: ${tradeReason}. ${slInput ? 'Stop loss ₹' + slInput + ' ✅' : '⚠️ No SL!'}`);
    updatePortfolioDisplay();
    updateCapitalUsed();
}

// ╔══════════════════════════════════════════════════════════════════╗
// ║        UPGRADED: exitPosition with autopsy                     ║
// ╚══════════════════════════════════════════════════════════════════╝

function exitPosition(sym) {
    const pos = STATE.positions.find(p => p.sym === sym);
    if (!pos) return;
    const exitPrice = STATE.currentPrice * (1 + (Math.random() - 0.5) * 0.001);
    const pnl = pos.side === 'BUY'
        ? (exitPrice - pos.avgPrice) * pos.qty
        : (pos.avgPrice - exitPrice) * pos.qty;

    STATE.pnl += pnl;
    STATE.capital += (pos.side === 'BUY' ? exitPrice * pos.qty : 0) - 20;
    if (pnl > 0) STATE.winCount++;

    STATE.journal.push({
        sym: pos.sym, side: pos.side, qty: pos.qty,
        entry: pos.avgPrice, exit: parseFloat(exitPrice.toFixed(2)),
        pnl: parseFloat(pnl.toFixed(2)),
        time: new Date().toLocaleTimeString('en-IN'),
        rr: pos.sl ? Math.abs(pnl / ((pos.avgPrice - pos.sl) * pos.qty)).toFixed(2) : 'N/A',
    });

    STATE.positions = STATE.positions.filter(p => p.sym !== sym);
    updatePortfolioDisplay();
    renderBottomTab('positions');
    showPostTradeAutopsy(pnl, pos, pos.reason || STATE.tradeReason || 'unknown');
    if (typeof window._afterExitPosition === 'function') window._afterExitPosition();
}

// ╔══════════════════════════════════════════════════════════════════╗
// ║        HELPERS                                                 ║
// ╚══════════════════════════════════════════════════════════════════╝

function updateCapitalUsed() {
    const usedCapital = 100000 - STATE.capital;
    const pct = Math.max(0, Math.min(100, (usedCapital / 100000) * 100));
    const el = document.getElementById('capitalUsed');
    if (el) {
        const label = pct > 50 ? `<span class="text-kred font-bold">${pct.toFixed(0)}%</span>` : `<span class="text-white">${pct.toFixed(0)}%</span>`;
        el.innerHTML = `Capital Used: ${label}`;
        if (pct > 80) showAIMentor('🏦 CAPITAL ALERT: You\'ve used ' + pct.toFixed(0) + '% of your capital. Professionals never use more than 10–15% in one trade.');
    }
}

// loadScenario extras are now inlined directly in the function above.
// No override needed.

// Initialize extra state
STATE.safetyMode = true;
STATE.tradeReason = null;
STATE.mistakeLog = [];
STATE.insightLog = [];
STATE.emotionLog = [];

// ╔══════════════════════════════════════════════════════════════════╗
// ║   BEGINNER EXPERIENCE LAYER — XP, GUIDE, MISSION, GLOSSARY     ║
// ╚══════════════════════════════════════════════════════════════════╝

// ─── XP + LEVEL SYSTEM ───────────────────────────────────────────
const XP_STATE = {
    xp: 5,
    level: 1,
    streak: 0,
    lastTradeWin: null,
    discipline: 100,
};
const LEVELS = [
    { lvl: 1, name: 'Curious Beginner', min: 0, max: 100, cls: '' },
    { lvl: 2, name: 'Learning Trader', min: 100, max: 250, cls: 'lvl2' },
    { lvl: 3, name: 'Disciplined Trader', min: 250, max: 500, cls: 'lvl3' },
    { lvl: 4, name: 'Strategic Thinker', min: 500, max: 900, cls: 'lvl4' },
    { lvl: 5, name: 'Market Maestro', min: 900, max: 1500, cls: 'lvl5' },
];

function awardXP(amount, reason) {
    XP_STATE.xp += amount;
    updateXPBar();
    // Float toast
    const toast = document.createElement('div');
    toast.className = 'xp-toast';
    toast.textContent = `+${amount} XP — ${reason}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 1900);
}

function updateXPBar() {
    const lvl = LEVELS.find(l => XP_STATE.xp >= l.min && XP_STATE.xp < l.max) || LEVELS[LEVELS.length - 1];
    XP_STATE.level = lvl.lvl;
    const progress = ((XP_STATE.xp - lvl.min) / (lvl.max - lvl.min)) * 100;
    document.getElementById('xpFill').style.width = Math.min(100, progress) + '%';
    document.getElementById('xpLabel').textContent = `${XP_STATE.xp} / ${lvl.max} XP`;
    const badge = document.getElementById('levelBadge');
    badge.textContent = `LVL ${lvl.lvl}`;
    badge.className = `text-[9px] font-black bg-kblue/20 text-kblue border border-kblue/30 px-2 py-0.5 rounded-full ${lvl.cls}`;
    document.getElementById('levelName').textContent = lvl.name;
    document.getElementById('streakCount').textContent = XP_STATE.streak;
}

function updateDisciplineScore(delta) {
    XP_STATE.discipline = Math.max(0, Math.min(100, XP_STATE.discipline + delta));
    const el = document.getElementById('disciplineScore');
    if (!el) return;
    el.textContent = XP_STATE.discipline;
    el.className = 'text-[9px] font-bold font-mono ' + (XP_STATE.discipline >= 80 ? 'text-purple-400' : XP_STATE.discipline >= 50 ? 'text-kgold' : 'text-kred');
}

// ─── GUIDED FIRST TRADE STRIP ────────────────────────────────────
let guideStep = 1;
const GUIDE_HINTS = {
    1: 'Click PLAY ▶ to start your first simulation — watch prices move',
    2: 'Watch at least 5 candles before deciding anything. Patience = profit.',
    3: 'Select WHY THIS TRADE using the buttons in the order panel',
    4: 'Set a Stop Loss price below your entry — this limits your downside',
    5: 'Click BUY or SELL. Your first trade is placed! 🎉',
    6: 'Watch the position. When ready, hit EXIT to close and see your result.',
    7: 'First trade complete! You just learned how real traders operate. 💪',
};

function advanceGuideStep(step) {
    if (step <= guideStep) return;
    guideStep = step;
    document.querySelectorAll('.guide-step').forEach(el => {
        const s = parseInt(el.dataset.step);
        if (s < guideStep) el.classList.add('done');
        else if (s === guideStep) el.classList.add('active');
        else { el.classList.remove('active', 'done'); }
    });
    const hint = document.getElementById('guideHint');
    if (hint) hint.textContent = GUIDE_HINTS[guideStep] || '';
    if (guideStep >= 7) {
        setTimeout(() => {
            const strip = document.getElementById('guidedStrip');
            if (strip) { strip.style.opacity = '0'; setTimeout(() => strip.classList.add('hidden'), 500); }
        }, 3000);
    }
}

// ─── DAILY MISSIONS ───────────────────────────────────────────────
const MISSIONS = [
    { text: 'Place 1 trade with a Stop Loss set', xp: 30, target: 1, key: 'tradesWithSL', unlock: 'Candle Analysis Mode' },
    { text: 'Close 1 winning trade', xp: 50, target: 1, key: 'wins', unlock: 'Pro Comparison Panel' },
    { text: 'Complete 3 trades without FOMO entry', xp: 75, target: 3, key: 'nonFOMO', unlock: 'Advanced Scenarios' },
    { text: 'Achieve 2:1 R:R on any trade', xp: 60, target: 1, key: 'goodRR', unlock: 'Risk Calculator' },
    { text: 'Use Trend Follow strategy 2 times', xp: 40, target: 2, key: 'trendTrades', unlock: 'Sector Heatmap' },
];
const MISSION_STATE = { idx: 0, progress: {}, done: false };
MISSIONS.forEach(m => { MISSION_STATE.progress[m.key] = 0; });

function initMission() {
    const m = MISSIONS[MISSION_STATE.idx];
    document.getElementById('missionText').innerHTML = `${m.text} → Earn <span class="text-kgold font-bold">+${m.xp} XP</span>`;
    document.getElementById('missionProgress').textContent = `0/${m.target}`;
    document.getElementById('missionReward').innerHTML = `Complete to unlock: <span class="text-kgold">${m.unlock}</span>`;
}

function updateMission(key, amount = 1) {
    const m = MISSIONS[MISSION_STATE.idx];
    if (m.key !== key || MISSION_STATE.done) return;
    MISSION_STATE.progress[key] = (MISSION_STATE.progress[key] || 0) + amount;
    const pct = Math.min(100, (MISSION_STATE.progress[key] / m.target) * 100);
    document.getElementById('missionFill').style.width = pct + '%';
    document.getElementById('missionProgress').textContent = `${Math.min(MISSION_STATE.progress[key], m.target)}/${m.target}`;
    if (MISSION_STATE.progress[key] >= m.target && !MISSION_STATE.done) {
        MISSION_STATE.done = true;
        awardXP(m.xp, 'Daily Mission ✅');
        showAIMentor(`🏆 Mission Complete! ${m.unlock} unlocked. You earned +${m.xp} XP. Tomorrow: new mission awaits!`);
        document.getElementById('missionBanner').style.background = 'linear-gradient(to right, rgba(38,161,123,0.08), rgba(38,161,123,0.02))';
        document.getElementById('missionText').innerHTML = `✅ <strong class="text-kgreen">MISSION COMPLETE!</strong> ${m.unlock} unlocked 🔓`;
    }
}

// ─── QUICK GLOSSARY ───────────────────────────────────────────────
const GLOSSARY = {
    'Stop Loss': { meaning: 'A pre-set price at which your trade automatically exits to prevent further loss.', example: 'e.g. Bought at ₹2,840. SL at ₹2,820 = max loss ₹20/share.' },
    'P&L': { meaning: 'Profit and Loss — your financial gain or loss from a trade.', example: 'P&L = (Exit Price − Entry Price) × Quantity' },
    'Candlestick': { meaning: 'A chart bar showing Open, High, Low, and Close price for a time period.', example: 'Green candle = price rose. Red candle = price fell.' },
    'Volume': { meaning: 'Number of shares traded in a period. High volume confirms price moves.', example: 'Breakout on 3× avg volume = strong signal.' },
    'Breakout': { meaning: 'When price moves above a key resistance level with high volume.', example: 'RELIANCE above ₹2,820 resistance = breakout confirmed.' },
    'Support': { meaning: 'A price level where demand historically stops price from falling further.', example: '₹2,800 has been support 3 times — it\'s a strong floor.' },
    'Resistance': { meaning: 'A price level where supply historically stops price from rising further.', example: '₹2,850 has rejected price twice — strong ceiling.' },
    'R:R Ratio': { meaning: 'Risk-to-Reward ratio. How much you can earn vs how much you can lose.', example: 'Risk ₹20 to make ₹60 = 1:3 R:R. Professionals only take 1:2+.' },
    'FOMO': { meaning: 'Fear Of Missing Out — emotional buying after a move has already happened.', example: 'Stock already up 5% and you buy chasing the move = FOMO.' },
    'Slippage': { meaning: 'Difference between expected trade price and actual executed price.', example: 'Placed order at ₹2,840, executed at ₹2,842 = ₹2 slippage.' },
    'Order Type': { meaning: 'Market order = execute now at best price. Limit order = only at your price.', example: 'LIMIT order at ₹2,820 — only fills if price drops there.' },
    'Position': { meaning: 'An active trade you currently hold (open exposure in the market).', example: 'Open Position: BUY 5 RELIANCE @ ₹2,840.' },
    'Bullish': { meaning: 'Expecting price to rise. A bullish trader buys.', example: 'GDP data positive → market bullish → price rises.' },
    'Bearish': { meaning: 'Expecting price to fall. A bearish trader sells/shorts.', example: 'Inflation data bad → market bearish → price falls.' },
    'Trend': { meaning: 'General direction of price — uptrend (higher highs), downtrend (lower lows).', example: 'Nifty making new highs every week = uptrend.' },
    'Brokerage': { meaning: 'Fee charged by your broker per trade executed.', example: 'Zerodha charges ₹20/order flat. Always factor into P&L.' },
    'Capital': { meaning: 'The money you have available to invest or trade.', example: 'Starting capital ₹1,00,000 = your practice bankroll.' },
    'Qty': { meaning: 'Quantity — number of shares you are buying or selling.', example: 'Qty: 10 = you\'re buying/selling 10 shares of the stock.' },
    'LTP': { meaning: 'Last Traded Price — latest price at which a share was bought/sold.', example: 'LTP ₹2,847 = the most recent transaction happened there.' },
    'Sector': { meaning: 'A group of related companies. e.g. IT, Banking, FMCG, Energy.', example: 'When interest rates rise, Bank sector often benefits.' },
};

function openGlossary(term) {
    const panel = document.getElementById('glossaryPanel');
    const body = document.getElementById('glossaryBody');
    body.innerHTML = '';
    const terms = term ? [term, ...Object.keys(GLOSSARY).filter(k => k !== term).slice(0, 5)] : Object.keys(GLOSSARY).slice(0, 10);
    terms.forEach(t => {
        const def = GLOSSARY[t];
        if (!def) return;
        const div = document.createElement('div');
        div.className = 'glossary-entry';
        div.innerHTML = `<div class="term">${t}</div><div class="meaning">${def.meaning}</div><div class="example">${def.example}</div>`;
        body.appendChild(div);
    });
    panel.classList.remove('hidden');
}

// ─── SUPPORT / RESISTANCE AUTO-DRAW ──────────────────────────────
function drawSupportResistance() {
    if (!window.chart || !window.candleSeries) return;
    const scen = STATE.scenario;
    const basePrice = (window.SCENARIOS || {})[scen]?.priceBase || STATE.currentPrice;
    const supportPrice = parseFloat((basePrice * 0.985).toFixed(2));
    const resistPrice = parseFloat((basePrice * 1.012).toFixed(2));
    try {
        if (!window._srLines) window._srLines = [];
        window._srLines.forEach(l => { try { chart.removePriceLine(l); } catch (e) { } });
        window._srLines = [];
        window._srLines.push(candleSeries.createPriceLine({
            price: supportPrice, color: 'rgba(38,161,123,0.5)', lineWidth: 1,
            lineStyle: 2, axisLabelVisible: true, title: '🟢 Support',
        }));
        window._srLines.push(candleSeries.createPriceLine({
            price: resistPrice, color: 'rgba(224,82,96,0.5)', lineWidth: 1,
            lineStyle: 2, axisLabelVisible: true, title: '🔴 Resistance',
        }));
    } catch (e) { }
}

// ─── WIRING ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Init mission
    initMission();
    updateXPBar();

    // Dismiss buttons
    document.getElementById('guideDismiss')?.addEventListener('click', () => {
        document.getElementById('guidedStrip').classList.add('hidden');
    });
    document.getElementById('missionDismiss')?.addEventListener('click', () => {
        document.getElementById('missionBanner').classList.add('hidden');
    });

    // Reset capital button
    document.getElementById('resetCapitalBtn')?.addEventListener('click', () => {
        if (!confirm('Reset capital to ₹1,00,000 and clear all trades? This is for practice — no shame in starting fresh! 💪')) return;
        STATE.capital = 100000;
        STATE.pnl = 0;
        STATE.positions = [];
        STATE.orders = [];
        STATE.journal = [];
        STATE.tradeCount = 0;
        STATE.winCount = 0;
        STATE.mistakeLog = [];
        STATE.insightLog = [];
        XP_STATE.discipline = 100;
        MISSION_STATE.done = false;
        MISSION_STATE.progress = {};
        MISSIONS.forEach(m => { MISSION_STATE.progress[m.key] = 0; });
        initMission();
        updateDisciplineScore(0);
        updatePortfolioDisplay();
        renderBottomTab('orders');
        document.getElementById('missionFill').style.width = '0%';
        document.getElementById('missionProgress').textContent = '0/1';
        showAIMentor('Capital reset to ₹1,00,000. Fresh start! Every expert was once a beginner. Go again. 💪');
        awardXP(10, 'Brave restart 💪');
    });

    // Glossary open via button in order panel
    const glossaryBtn = document.getElementById('glossaryBtn');
    if (glossaryBtn) glossaryBtn.addEventListener('click', () => openGlossary(null));
    document.getElementById('glossaryClose')?.addEventListener('click', () => {
        document.getElementById('glossaryPanel').classList.add('hidden');
    });

    // Guide: advance to step 2 when play clicked
    document.getElementById('playBtn')?.addEventListener('click', () => {
        if (STATE.playing) {
            advanceGuideStep(2);
            setTimeout(() => drawSupportResistance(), 1500);
        }
    }, true);

    // Guide: advance to step 4 when strategy selected
    document.querySelectorAll('.why-btn').forEach(btn => {
        btn.addEventListener('click', () => advanceGuideStep(3), true);
    });

    // Guide: advance to step 4 when SL field focused
    document.getElementById('slInput')?.addEventListener('focus', () => advanceGuideStep(4), true);
    document.getElementById('slInput')?.addEventListener('input', () => {
        if (parseFloat(document.getElementById('slInput').value) > 0) advanceGuideStep(4);
    }, true);

    // XP on scenario load
    awardXP(5, 'Scenario loaded');
});

// XP hooks are wired via window._afterPlaceOrder callback called inside the existing placeOrder function.
// See placeOrder definition above — it calls window._afterPlaceOrder() at end if defined.

// XP exit hooks are wired via window._afterExitPosition callback called inside the existing exitPosition function.
// See exitPosition definition above — it calls window._afterExitPosition(sym) at end if defined.

// Register the actual XP hooks via window callbacks (safe — no hoisting conflict)
window._afterPlaceOrder = function () {
    const slInput = parseFloat(document.getElementById('slInput')?.value) || 0;
    const reason = STATE.tradeReason;
    if (STATE.orders.length === 0) return;
    if (typeof awardXP !== 'undefined') awardXP(15, 'Trade placed');
    if (typeof advanceGuideStep !== 'undefined') advanceGuideStep(5);
    if (typeof updateDisciplineScore !== 'undefined') updateDisciplineScore(slInput > 0 ? 5 : -10);
    if (typeof updateMission !== 'undefined') {
        if (slInput > 0) updateMission('tradesWithSL');
        if (reason && reason !== 'guess') updateMission('nonFOMO');
        if (reason === 'trend') updateMission('trendTrades');
    }
    if (typeof advanceGuideStep !== 'undefined') advanceGuideStep(6);
};

window._afterExitPosition = function () {
    if (typeof advanceGuideStep !== 'undefined') advanceGuideStep(7);
    const last = STATE.journal[STATE.journal.length - 1];
    if (!last) return;
    const win = last.pnl >= 0;
    if (typeof awardXP !== 'undefined') awardXP(win ? 25 : 10, win ? 'Winning trade 🎉' : 'Learning trade 📚');
    if (win) {
        XP_STATE.streak++;
        if (XP_STATE.streak >= 2 && typeof awardXP !== 'undefined') awardXP(15, `${XP_STATE.streak}× win streak 🔥`);
        if (typeof updateDisciplineScore !== 'undefined') updateDisciplineScore(8);
        if (typeof updateMission !== 'undefined') updateMission('wins');
    } else {
        XP_STATE.streak = 0;
        if (typeof updateDisciplineScore !== 'undefined') updateDisciplineScore(-5);
    }
    const rr = parseFloat(last.rr);
    if (!isNaN(rr) && rr >= 2 && typeof updateMission !== 'undefined') updateMission('goodRR');
    if (typeof updateXPBar !== 'undefined') updateXPBar();
};

// ─── ON-CHART TRADING (Interactive Drag & Drop) ───────────────────
let onChartDragState = null;

function checkAutoExits(price) {
    [...STATE.positions].forEach(pos => {
        if (pos.side === 'BUY') {
            if (pos.sl && price <= pos.sl) { pos.reason = 'SL hit'; exitPosition(pos.sym); }
            if (pos.target && price >= pos.target) { pos.reason = 'Target hit'; exitPosition(pos.sym); }
        } else {
            if (pos.sl && price >= pos.sl) { pos.reason = 'SL hit'; exitPosition(pos.sym); }
            if (pos.target && price <= pos.target) { pos.reason = 'Target hit'; exitPosition(pos.sym); }
        }
    });
}

function syncChartOverlays() {
    const container = document.getElementById('onChartTradingContainer');
    if (!container || !candleSeries) return;

    if (STATE.positions.length === 0) {
        container.innerHTML = '';
        return;
    }

    // Don't overwrite if actively dragging
    if (onChartDragState) return;

    // We render for the latest position only to keep it clean, but could loop.
    const pos = STATE.positions[STATE.positions.length - 1];
    let html = '';

    // Buy/Entry Price Line
    const entryY = candleSeries.priceToCoordinate(pos.avgPrice);
    if (entryY !== null) {
        const livePnl = pos.side === 'BUY' ? (STATE.currentPrice - pos.avgPrice) * pos.qty : (pos.avgPrice - STATE.currentPrice) * pos.qty;
        const isWin = livePnl >= 0;
        const clrStyle = isWin ? 'text-[#26a17b] bg-[#26a17b]/10 border-[#26a17b]' : 'text-[#e05260] bg-[#e05260]/10 border-[#e05260]';
        const lineStyle = pos.side === 'BUY' ? 'border-[#3b82f6]' : 'border-[#a855f7]';

        html += `
            <div style="top:${entryY}px; z-index:10;" class="absolute left-0 right-0 h-px border-t border-dashed ${lineStyle} pointer-events-none transition-transform">
                <div class="absolute right-0 top-0 transform -translate-y-1/2 flex items-center pr-2 pointer-events-auto">
                    <div class="flex items-center gap-2 px-2 py-0.5 rounded border border-[#ffffff10] bg-[#141418]/90 backdrop-blur text-[10px] shadow-lg">
                        <span class="text-gray-300 font-mono">${pos.side} ${pos.qty} @ ₹${pos.avgPrice}</span>
                        <span class="font-bold ${clrStyle} px-1.5 rounded">₹${Math.abs(livePnl).toFixed(2)}</span>
                        <button onclick="exitPosition('${pos.sym}')" class="ml-1 bg-[#e05260]/10 hover:bg-[#e05260] text-[#e05260] hover:text-white border border-[#e05260]/30 px-2 py-0.5 rounded shadow-[0_0_8px_rgba(224,82,96,0.3)] hover:shadow-[0_0_12px_rgba(224,82,96,0.8)] text-[9px] font-bold transition-all duration-300">✖ EXIT</button>
                    </div>
                </div>
            </div>
        `;
    }

    // Stop Loss Line (Draggable)
    if (pos.sl && pos.sl > 0) {
        const slY = candleSeries.priceToCoordinate(pos.sl);
        if (slY !== null) {
            html += `
                <div id="dragSL" style="top:${slY}px; z-index:20;" class="absolute left-0 right-0 h-[20px] -mt-[10px] pointer-events-auto cursor-ns-resize group"
                     onmousedown="startChartDrag(event, 'sl', ${pos.sl})">
                    <div class="absolute top-1/2 left-0 right-0 h-px border-t border-dashed border-[#e05260] group-hover:border-solid"></div>
                    <div class="absolute right-0 top-1/2 transform -translate-y-1/2 pr-2">
                        <div class="bg-[#141418]/90 border border-[#e05260] text-[10px] text-[#e05260] px-2 py-0.5 rounded group-hover:bg-[#e05260]/20 font-mono shadow-lg transition-colors flex items-center gap-1">
                            SL: ₹${pos.sl.toFixed(2)} <i class="fa-solid fa-grip-lines opacity-50 text-[8px]"></i>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    // Target Line (Draggable)
    if (pos.target && pos.target > 0) {
        const tpY = candleSeries.priceToCoordinate(pos.target);
        if (tpY !== null) {
            html += `
                <div id="dragTP" style="top:${tpY}px; z-index:20;" class="absolute left-0 right-0 h-[20px] -mt-[10px] pointer-events-auto cursor-ns-resize group"
                     onmousedown="startChartDrag(event, 'target', ${pos.target})">
                    <div class="absolute top-1/2 left-0 right-0 h-px border-t border-dashed border-[#26a17b] group-hover:border-solid"></div>
                    <div class="absolute right-0 top-1/2 transform -translate-y-1/2 pr-2">
                        <div class="bg-[#141418]/90 border border-[#26a17b] text-[10px] text-[#26a17b] px-2 py-0.5 rounded group-hover:bg-[#26a17b]/20 font-mono shadow-lg transition-colors flex items-center gap-1">
                            TP: ₹${pos.target.toFixed(2)} <i class="fa-solid fa-grip-lines opacity-50 text-[8px]"></i>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    container.innerHTML = html;
}

window.startChartDrag = function (e, type, currentPrice) {
    e.preventDefault();
    e.stopPropagation();
    onChartDragState = { type, startY: e.clientY, startPrice: currentPrice };

    // Disable panning
    chart.applyOptions({ handleScroll: false, handleScale: false });

    document.addEventListener('mousemove', onChartDragMove);
    document.addEventListener('mouseup', onChartDragEnd);
};

function onChartDragMove(e) {
    if (!onChartDragState) return;
    const tvChart = document.getElementById('tvChart');
    const rect = tvChart.getBoundingClientRect();
    const yPixels = Math.max(0, Math.min(e.clientY - rect.top, rect.height)); // constrain to chart

    let newPrice = candleSeries.coordinateToPrice(yPixels);
    if (newPrice !== null) {
        newPrice = parseFloat(newPrice.toFixed(2));
        onChartDragState.currentHoverPrice = newPrice;

        // Visual update only
        const handle = onChartDragState.type === 'sl' ? document.getElementById('dragSL') : document.getElementById('dragTP');
        if (handle) {
            handle.style.top = yPixels + 'px';
            const label = handle.querySelector('.font-mono');
            const lblType = onChartDragState.type === 'sl' ? 'SL' : 'TP';
            if (label) label.innerHTML = `${lblType}: ₹${newPrice.toFixed(2)} <i class="fa-solid fa-grip-lines opacity-50 text-[8px]"></i>`;
        }
    }
}

function onChartDragEnd(e) {
    if (!onChartDragState) return;
    const { type, currentHoverPrice } = onChartDragState;
    if (currentHoverPrice && STATE.positions.length > 0) {
        // Find current active position
        const p = STATE.positions[STATE.positions.length - 1];
        if (type === 'sl') p.sl = currentHoverPrice;
        if (type === 'target') p.target = currentHoverPrice;

        // Auto-sync input fields in the right panel if they represent this trade
        if (type === 'sl') document.getElementById('slInput').value = currentHoverPrice;
        if (type === 'target') document.getElementById('targetInput').value = currentHoverPrice;

        // Show AI Hint on drag successful
        showAIMentor(`${type === 'sl' ? 'Stop Loss' : 'Target'} modified on chart to ₹${currentHoverPrice}.`);
    }

    // Resume panning
    chart.applyOptions({ handleScroll: true, handleScale: true });

    document.removeEventListener('mousemove', onChartDragMove);
    document.removeEventListener('mouseup', onChartDragEnd);
    onChartDragState = null;
    syncChartOverlays();
}
