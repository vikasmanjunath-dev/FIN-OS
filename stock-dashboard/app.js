/* ══════════════════════════════════════════════════════════════
   StockOS Dashboard — Main JavaScript Engine
   Features: Live data, Charts, Watchlist, Compare, Particles
   ══════════════════════════════════════════════════════════════ */

const API_BASE = 'http://localhost:5000';

// ─── State ─────────────────────────────────────────────────────
const state = {
  currentTicker: null,
  currentPeriod: '1D',
  currentData: null,
  watchlist: JSON.parse(localStorage.getItem('stockos_watchlist') || '[]'),
  refreshInterval: null,
  refreshCountdown: 10,
  priceChart: null,
  compareChart: null,
  cmpPeriod: '1M',
  lastPrice: null,
};

// ─── DOM Refs ───────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const dom = {
  searchInput:        $('searchInput'),
  autocomplete:       $('autocompleteDropdown'),
  heroEmpty:          $('heroEmpty'),
  stockPanel:         $('stockPanel'),
  loadingOverlay:     $('loadingOverlay'),
  errorCard:          $('errorCard'),
  tickerBadge:        $('tickerBadge'),
  marketStatusBadge:  $('marketStatusBadge'),
  watchlistBtn:       $('watchlistBtn'),
  companyName:        $('companyName'),
  currentPrice:       $('currentPrice'),
  priceChange:        $('priceChange'),
  changeArrow:        $('changeArrow'),
  changeVal:          $('changeVal'),
  changePct:          $('changePct'),
  metOpen:            $('metOpen'),
  metPrevClose:       $('metPrevClose'),
  metHigh:            $('metHigh'),
  metLow:             $('metLow'),
  metVolume:          $('metVolume'),
  metMktCap:          $('metMktCap'),
  adv52H:             $('adv52H'),
  adv52L:             $('adv52L'),
  advPE:              $('advPE'),
  advExchange:        $('advExchange'),
  advCurrency:        $('advCurrency'),
  advUpdated:         $('advUpdated'),
  rangeFill:          $('rangeFill'),
  rangeThumb:         $('rangeThumb'),
  rangeL:             $('rangeL'),
  rangeH:             $('rangeH'),
  chartSkeleton:      $('chartSkeleton'),
  insightBody:        $('insightBody'),
  refreshCountdown:   $('refreshCountdown'),
  liveClock:          $('liveClock'),
  statusDot:          $('statusDot'),
  statusLabel:        $('statusLabel'),
  watchlistGrid:      $('watchlistGrid'),
  compareChartCard:   $('compareChartCard'),
  compareLegend:      $('compareLegend'),
  marketsGrid:        $('marketsGrid'),
  errorTitle:         $('errorTitle'),
  errorMsg:           $('errorMsg'),
  loaderTicker:       $('loaderTicker'),
};

// ═══════════════════════════════════════════════════════════════
// PARTICLES BACKGROUND
// ═══════════════════════════════════════════════════════════════
function initParticles() {
  const canvas = $('particleCanvas');
  const ctx = canvas.getContext('2d');
  let W = canvas.width = window.innerWidth;
  let H = canvas.height = window.innerHeight;

  const particles = Array.from({ length: 60 }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    vx: (Math.random() - 0.5) * 0.4,
    vy: (Math.random() - 0.5) * 0.4,
    r: Math.random() * 1.5 + 0.5,
    alpha: Math.random() * 0.5 + 0.1,
    color: ['#7C3AED', '#06B6D4', '#10B981', '#EC4899'][Math.floor(Math.random() * 4)],
  }));

  function draw() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color + Math.floor(p.alpha * 255).toString(16).padStart(2, '0');
      ctx.fill();
    });
    // Draw connecting lines
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(124,58,237,${0.08 * (1 - dist / 120)})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  }

  draw();
  window.addEventListener('resize', () => {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  });
}

// ═══════════════════════════════════════════════════════════════
// CLOCK
// ═══════════════════════════════════════════════════════════════
function startClock() {
  function tick() {
    const now = new Date();
    dom.liveClock.textContent = now.toLocaleTimeString('en-US', {
      hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'
    }) + ' ' + Intl.DateTimeFormat().resolvedOptions().timeZone.split('/')[1] || 'UTC';
  }
  tick();
  setInterval(tick, 1000);
}

// ═══════════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════════
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  $(`page-${page}`).classList.add('active');
  document.querySelector(`[data-page="${page}"]`).classList.add('active');

  if (page === 'watchlist') renderWatchlistPage();
  if (page === 'markets') renderMarketsPage();
}

// ═══════════════════════════════════════════════════════════════
// SEARCH & AUTOCOMPLETE
// ═══════════════════════════════════════════════════════════════
let debounceTimer = null;

dom.searchInput.addEventListener('input', e => {
  clearTimeout(debounceTimer);
  const q = e.target.value.trim();
  if (!q) { hideAutocomplete(); return; }
  debounceTimer = setTimeout(() => fetchAutocomplete(q), 250);
});

dom.searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const val = dom.searchInput.value.trim().toUpperCase();
    if (val) { hideAutocomplete(); loadStock(val); }
  }
  if (e.key === 'Escape') hideAutocomplete();
});

// CMD+K focus
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    dom.searchInput.focus();
    dom.searchInput.select();
  }
});

document.addEventListener('click', e => {
  if (!$('searchContainer').contains(e.target)) hideAutocomplete();
});

async function fetchAutocomplete(q) {
  try {
    const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    renderAutocomplete(data.results || []);
  } catch { hideAutocomplete(); }
}

function renderAutocomplete(results) {
  if (!results.length) { hideAutocomplete(); return; }
  dom.autocomplete.innerHTML = results.map(r => `
    <div class="ac-item" onclick="selectTicker('${r.symbol}')">
      <span class="ac-ticker">${r.symbol}</span>
      <span class="ac-name">${r.name}</span>
      <span class="ac-exchange">${r.exchange}</span>
    </div>
  `).join('');
  dom.autocomplete.classList.add('visible');
}

function hideAutocomplete() { dom.autocomplete.classList.remove('visible'); }

function selectTicker(symbol) {
  dom.searchInput.value = symbol;
  hideAutocomplete();
  loadStock(symbol);
}

function quickSearch(ticker) {
  dom.searchInput.value = ticker;
  loadStock(ticker);
}

// ═══════════════════════════════════════════════════════════════
// DATA FETCHING
// ═══════════════════════════════════════════════════════════════
async function loadStock(ticker, period = state.currentPeriod) {
  if (!ticker) return;
  state.currentTicker = ticker;

  showLoading(ticker);
  hideError();

  try {
    const res = await fetch(`${API_BASE}/stock?ticker=${encodeURIComponent(ticker)}&period=${period}`);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to fetch data');
    }
    const data = await res.json();
    state.currentData = data;
    state.currentPeriod = period;

    hideLoading();
    showStockPanel();
    updateUI(data);
    updateSidebarStatus(data.market_status);
    startAutoRefresh();

    // If on watchlist page and navigate to dashboard automatically
    navigate('dashboard');

  } catch (err) {
    hideLoading();
    showError(ticker, err.message);
  }
}

async function refreshCurrentStock() {
  if (!state.currentTicker) return;
  try {
    const res = await fetch(`${API_BASE}/stock?ticker=${encodeURIComponent(state.currentTicker)}&period=${state.currentPeriod}`);
    if (!res.ok) return;
    const data = await res.json();
    const oldPrice = state.lastPrice;
    state.currentData = data;
    updatePriceOnly(data, oldPrice);
    updateSidebarStatus(data.market_status);
  } catch { /* silent fail */ }
}

// ═══════════════════════════════════════════════════════════════
// UI UPDATES
// ═══════════════════════════════════════════════════════════════
function updateUI(data) {
  // Ticker + Status
  dom.tickerBadge.textContent = data.ticker;
  dom.companyName.textContent = data.name || data.ticker;
  setMarketStatusBadge(data.market_status);

  // Price
  const price = fmtPrice(data.price, data.currency);
  state.lastPrice = data.price;
  dom.currentPrice.textContent = price;
  dom.currentPrice.classList.add('counting');
  setTimeout(() => dom.currentPrice.classList.remove('counting'), 400);

  // Change
  if (data.change !== null && data.change_pct !== null) {
    const up = data.change >= 0;
    dom.priceChange.className = 'price-change ' + (up ? 'up' : 'down');
    dom.changeArrow.textContent = up ? '▲' : '▼';
    dom.changeVal.textContent = (up ? '+' : '') + fmtPrice(data.change, data.currency);
    dom.changePct.textContent = `(${up ? '+' : ''}${data.change_pct}%)`;
  }

  // Metrics
  dom.metOpen.textContent      = fmtPrice(data.open, data.currency);
  dom.metPrevClose.textContent = fmtPrice(data.prev_close, data.currency);
  dom.metHigh.textContent      = fmtPrice(data.high, data.currency);
  dom.metLow.textContent       = fmtPrice(data.low, data.currency);
  dom.metVolume.textContent    = fmtVolume(data.volume);
  dom.metMktCap.textContent    = fmtMarketCap(data.market_cap);

  // Advanced
  dom.adv52H.textContent     = fmtPrice(data.week_52_high, data.currency);
  dom.adv52L.textContent     = fmtPrice(data.week_52_low, data.currency);
  dom.advPE.textContent      = data.pe_ratio ? data.pe_ratio.toFixed(2) : 'N/A';
  dom.advExchange.textContent = data.exchange || '—';
  dom.advCurrency.textContent = data.currency || '—';
  dom.advUpdated.textContent  = new Date(data.fetched_at + 'Z').toLocaleTimeString();

  // 52-week range bar
  update52wRange(data);

  // Watchlist button
  updateWatchlistBtn(data.ticker);

  // Chart
  renderChart(data);

  // Insights
  renderInsights(data.insight || []);
}

function updatePriceOnly(data, oldPrice) {
  const newPrice = data.price;
  if (newPrice === null) return;

  const priceEl = dom.currentPrice;
  const oldText = priceEl.textContent;
  const newText = fmtPrice(newPrice, data.currency);

  if (oldText !== newText) {
    const up = oldPrice !== null ? newPrice >= oldPrice : data.change >= 0;
    priceEl.textContent = newText;
    priceEl.classList.remove('price-flash-up', 'price-flash-down');
    void priceEl.offsetWidth; // reflow
    priceEl.classList.add(up ? 'price-flash-up' : 'price-flash-down');

    // Update change
    if (data.change !== null && data.change_pct !== null) {
      const isUp = data.change >= 0;
      dom.priceChange.className = 'price-change ' + (isUp ? 'up' : 'down');
      dom.changeArrow.textContent = isUp ? '▲' : '▼';
      dom.changeVal.textContent = (isUp ? '+' : '') + fmtPrice(data.change, data.currency);
      dom.changePct.textContent = `(${isUp ? '+' : ''}${data.change_pct}%)`;
    }
    dom.advUpdated.textContent = new Date(data.fetched_at + 'Z').toLocaleTimeString();
  }

  state.lastPrice = newPrice;
}

function setMarketStatusBadge(status) {
  const el = dom.marketStatusBadge;
  el.textContent = status || '—';
  el.className = 'market-status-badge ' + (status || '').toLowerCase();
}

function update52wRange(data) {
  const low52 = data.week_52_low;
  const high52 = data.week_52_high;
  const price = data.price;
  if (!low52 || !high52 || !price) return;

  const pct = Math.max(0, Math.min(100, ((price - low52) / (high52 - low52)) * 100));
  dom.rangeFill.style.width = pct + '%';
  dom.rangeThumb.style.left = pct + '%';
  dom.rangeL.textContent = fmtPrice(low52, data.currency);
  dom.rangeH.textContent = fmtPrice(high52, data.currency);
}

function updateSidebarStatus(status) {
  const dot = dom.statusDot;
  const label = dom.statusLabel;
  if (!status) return;
  label.textContent = status;
  dot.className = 'status-dot ' + status.toLowerCase();
}

// ═══════════════════════════════════════════════════════════════
// CHART
// ═══════════════════════════════════════════════════════════════
function renderChart(data) {
  dom.chartSkeleton.classList.add('hidden');

  const history = data.history || [];
  if (!history.length) return;

  const isUp = data.change >= 0;
  const labels = history.map(h => {
    const d = new Date(h.time * 1000);
    return state.currentPeriod === '1D'
      ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
      : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });
  const prices = history.map(h => h.close);

  const accentColor = isUp ? '#10B981' : '#EF4444';
  const gradStart = isUp ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.2)';

  if (state.priceChart) {
    state.priceChart.destroy();
  }

  const canvas = $('priceChart');
  const ctx = canvas.getContext('2d');

  // Gradient fill
  const gradient = ctx.createLinearGradient(0, 0, 0, 280);
  gradient.addColorStop(0, gradStart);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');

  state.priceChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: data.ticker,
        data: prices,
        borderColor: accentColor,
        borderWidth: 2,
        backgroundColor: gradient,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: accentColor,
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2,
        fill: true,
        tension: 0.4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(13,13,22,0.95)',
          borderColor: 'rgba(124,58,237,0.4)',
          borderWidth: 1,
          titleColor: '#94A3B8',
          bodyColor: '#F1F5F9',
          bodyFont: { family: 'JetBrains Mono', weight: '600', size: 13 },
          titleFont: { family: 'Inter', size: 11 },
          padding: 12,
          cornerRadius: 10,
          callbacks: {
            label: ctx => `  ${data.currency || ''} ${ctx.parsed.y.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`,
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
          ticks: {
            color: '#475569',
            font: { family: 'Inter', size: 10 },
            maxTicksLimit: 8,
            maxRotation: 0,
          }
        },
        y: {
          position: 'right',
          grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
          ticks: {
            color: '#475569',
            font: { family: 'JetBrains Mono', size: 10 },
            callback: v => v.toLocaleString('en-IN', { maximumFractionDigits: 0 }),
          }
        }
      },
      animation: {
        duration: 800,
        easing: 'easeInOutCubic',
      }
    }
  });
}

// Timeframe
function setTimeframe(tf) {
  state.currentPeriod = tf;
  document.querySelectorAll('#timeframePills .pill').forEach(p => {
    p.classList.toggle('active', p.dataset.tf === tf);
  });
  if (state.currentTicker) {
    dom.chartSkeleton.classList.remove('hidden');
    loadStock(state.currentTicker, tf);
  }
}

// ═══════════════════════════════════════════════════════════════
// INSIGHTS
// ═══════════════════════════════════════════════════════════════
function renderInsights(insights) {
  dom.insightBody.innerHTML = insights.map((ins, i) =>
    `<div class="insight-item" style="animation-delay:${i * 0.1}s">${ins}</div>`
  ).join('');
}

// ═══════════════════════════════════════════════════════════════
// WATCHLIST
// ═══════════════════════════════════════════════════════════════
function toggleWatchlist() {
  if (!state.currentTicker || !state.currentData) return;
  const ticker = state.currentTicker;
  const idx = state.watchlist.findIndex(w => w.ticker === ticker);

  if (idx === -1) {
    state.watchlist.push({
      ticker,
      name: state.currentData.name || ticker,
      price: state.currentData.price,
      change_pct: state.currentData.change_pct,
      currency: state.currentData.currency,
    });
  } else {
    state.watchlist.splice(idx, 1);
  }

  saveWatchlist();
  updateWatchlistBtn(ticker);
}

function updateWatchlistBtn(ticker) {
  const inList = state.watchlist.some(w => w.ticker === ticker);
  dom.watchlistBtn.classList.toggle('active', inList);
  dom.watchlistBtn.title = inList ? 'Remove from watchlist' : 'Add to watchlist';
}

function saveWatchlist() {
  localStorage.setItem('stockos_watchlist', JSON.stringify(state.watchlist));
}

function clearWatchlist() {
  state.watchlist = [];
  saveWatchlist();
  renderWatchlistPage();
}

async function renderWatchlistPage() {
  const grid = dom.watchlistGrid;

  if (!state.watchlist.length) {
    grid.innerHTML = `<div class="watchlist-empty" id="watchlistEmpty">
      <div class="empty-icon">🔭</div>
      <p>No stocks in watchlist yet.</p>
      <p class="empty-sub">Search a stock and click ⭐ to track it here.</p>
    </div>`;
    return;
  }

  // Render cards with loading state then fetch prices
  grid.innerHTML = state.watchlist.map(w => `
    <div class="watchlist-card" id="wlcard-${w.ticker}" onclick="loadStock('${w.ticker}')">
      <div class="wl-header">
        <div>
          <div class="wl-ticker">${w.ticker}</div>
          <div class="wl-name">${w.name}</div>
        </div>
        <button class="wl-remove" onclick="removeFromWatchlist(event,'${w.ticker}')">×</button>
      </div>
      <div class="wl-price" id="wlp-${w.ticker}">${fmtPrice(w.price, w.currency)}</div>
      <span class="wl-change ${(w.change_pct || 0) >= 0 ? 'up' : 'down'}" id="wlc-${w.ticker}">
        ${(w.change_pct || 0) >= 0 ? '▲' : '▼'} ${Math.abs(w.change_pct || 0).toFixed(2)}%
      </span>
      <div class="wl-sparkline">
        <canvas id="spark-${w.ticker}" height="40"></canvas>
      </div>
    </div>
  `).join('');

  // Fetch live prices for each watchlist item
  state.watchlist.forEach(async w => {
    try {
      const [stockRes, sparkRes] = await Promise.all([
        fetch(`${API_BASE}/stock?ticker=${w.ticker}&period=1D`),
        fetch(`${API_BASE}/sparkline?ticker=${w.ticker}`)
      ]);
      if (stockRes.ok) {
        const d = await stockRes.json();
        w.price = d.price;
        w.change_pct = d.change_pct;
        w.currency = d.currency;
        saveWatchlist();

        const priceEl = $(`wlp-${w.ticker}`);
        const changeEl = $(`wlc-${w.ticker}`);
        if (priceEl) priceEl.textContent = fmtPrice(d.price, d.currency);
        if (changeEl) {
          const up = (d.change_pct || 0) >= 0;
          changeEl.className = 'wl-change ' + (up ? 'up' : 'down');
          changeEl.textContent = `${up ? '▲' : '▼'} ${Math.abs(d.change_pct || 0).toFixed(2)}%`;
        }
      }
      if (sparkRes.ok) {
        const sd = await sparkRes.json();
        renderSparkline(`spark-${w.ticker}`, sd.closes, w.change_pct >= 0);
      }
    } catch { /* silent */ }
  });
}

function removeFromWatchlist(e, ticker) {
  e.stopPropagation();
  state.watchlist = state.watchlist.filter(w => w.ticker !== ticker);
  saveWatchlist();
  renderWatchlistPage();
}

function renderSparkline(canvasId, closes, isUp) {
  const canvas = $(canvasId);
  if (!canvas || !closes || !closes.length) return;
  const ctx = canvas.getContext('2d');
  const color = isUp ? '#10B981' : '#EF4444';
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: closes.map((_, i) => i),
      datasets: [{
        data: closes,
        borderColor: color,
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false,
        tension: 0.4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } },
      animation: { duration: 600 },
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// COMPARE
// ═══════════════════════════════════════════════════════════════
let cmpPeriod = '1M';

function setCmpPeriod(p, btn) {
  cmpPeriod = p;
  document.querySelectorAll('#page-compare .pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

async function runComparison() {
  const t1 = $('cmpInput1').value.trim().toUpperCase();
  const t2 = $('cmpInput2').value.trim().toUpperCase();
  const t3 = $('cmpInput3').value.trim().toUpperCase();
  const tickers = [t1, t2, t3].filter(Boolean);

  if (tickers.length < 2) {
    alert('Please enter at least 2 tickers to compare');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/compare?tickers=${tickers.join(',')}&period=${cmpPeriod}`);
    const data = await res.json();
    renderCompareChart(data, tickers);
  } catch (err) {
    alert('Error fetching comparison data: ' + err.message);
  }
}

const COMPARE_COLORS = ['#7C3AED', '#06B6D4', '#10B981', '#F59E0B', '#EC4899'];

function renderCompareChart(data, tickers) {
  dom.compareChartCard.classList.remove('hidden');

  if (state.compareChart) state.compareChart.destroy();

  const ctx = $('compareChart').getContext('2d');
  const datasets = [];
  const legendItems = [];

  tickers.forEach((ticker, i) => {
    const sd = data.stocks[ticker];
    if (!sd || sd.error) return;
    const color = COMPARE_COLORS[i % COMPARE_COLORS.length];
    const labels = sd.times.map(t => {
      const d = new Date(t * 1000);
      return cmpPeriod === '1M'
        ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    datasets.push({
      label: ticker,
      data: sd.normalized,
      borderColor: color,
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 4,
      fill: false,
      tension: 0.4,
    });
    legendItems.push({ ticker, color });
  });

  const allLabels = tickers[0] && data.stocks[tickers[0]] && !data.stocks[tickers[0]].error
    ? data.stocks[tickers[0]].times.map(t => {
        const d = new Date(t * 1000);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      })
    : [];

  state.compareChart = new Chart(ctx, {
    type: 'line',
    data: { labels: allLabels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(13,13,22,0.95)',
          borderColor: 'rgba(124,58,237,0.4)',
          borderWidth: 1,
          titleColor: '#94A3B8',
          bodyColor: '#F1F5F9',
          bodyFont: { family: 'JetBrains Mono', size: 12 },
          padding: 12,
          cornerRadius: 10,
          callbacks: {
            label: ctx => `  ${ctx.dataset.label}: ${ctx.parsed.y >= 0 ? '+' : ''}${ctx.parsed.y.toFixed(2)}%`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#475569', font: { size: 10 }, maxTicksLimit: 8, maxRotation: 0 }
        },
        y: {
          position: 'right',
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: {
            color: '#475569',
            font: { family: 'JetBrains Mono', size: 10 },
            callback: v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%'
          }
        }
      },
      animation: { duration: 700, easing: 'easeInOutCubic' }
    }
  });

  // Legend
  dom.compareLegend.innerHTML = legendItems.map(li => `
    <div class="legend-item">
      <div class="legend-dot" style="background:${li.color}"></div>
      <span style="font-family:var(--font-mono);font-size:0.82rem;font-weight:700;color:${li.color}">${li.ticker}</span>
    </div>
  `).join('');
}

// ═══════════════════════════════════════════════════════════════
// MARKETS PAGE
// ═══════════════════════════════════════════════════════════════
const MARKET_INDICES = [
  { ticker: '^NSEI',  name: 'NIFTY 50',  flag: '🇮🇳', color: '#FF6B00' },
  { ticker: '^BSESN', name: 'SENSEX',    flag: '🇮🇳', color: '#FF6B00' },
  { ticker: '^GSPC',  name: 'S&P 500',   flag: '🇺🇸', color: '#3B82F6' },
  { ticker: '^DJI',   name: 'Dow Jones', flag: '🇺🇸', color: '#3B82F6' },
  { ticker: '^IXIC',  name: 'NASDAQ',    flag: '🇺🇸', color: '#8B5CF6' },
  { ticker: '^FTSE',  name: 'FTSE 100',  flag: '🇬🇧', color: '#10B981' },
  { ticker: '^N225',  name: 'Nikkei 225',flag: '🇯🇵', color: '#EF4444' },
  { ticker: '^HSI',   name: 'Hang Seng', flag: '🇭🇰', color: '#F59E0B' },
];

async function renderMarketsPage() {
  dom.marketsGrid.innerHTML = MARKET_INDICES.map(m => `
    <div class="market-card" id="mc-${m.ticker.replace('^', '_')}" onclick="loadStock('${m.ticker}')" style="--accent-color: ${m.color}">
      <div class="mc-flag">${m.flag}</div>
      <div class="mc-name">${m.name}</div>
      <div class="mc-ticker">${m.ticker}</div>
      <div class="mc-price mc-loading" id="mcp-${m.ticker.replace('^', '_')}">Loading…</div>
      <span class="mc-change" id="mcc-${m.ticker.replace('^', '_')}"></span>
    </div>
  `).join('');

  // Fetch each index
  MARKET_INDICES.forEach(async m => {
    try {
      const res = await fetch(`${API_BASE}/stock?ticker=${encodeURIComponent(m.ticker)}&period=1D`);
      if (!res.ok) return;
      const d = await res.json();
      const key = m.ticker.replace('^', '_');
      const priceEl = $(`mcp-${key}`);
      const changeEl = $(`mcc-${key}`);
      if (priceEl) {
        priceEl.textContent = fmtPrice(d.price, d.currency);
        priceEl.classList.remove('mc-loading');
      }
      if (changeEl && d.change_pct !== null) {
        const up = d.change_pct >= 0;
        changeEl.className = 'mc-change ' + (up ? 'up' : 'down');
        changeEl.textContent = `${up ? '▲' : '▼'} ${Math.abs(d.change_pct).toFixed(2)}%`;
      }
    } catch { /* silent */ }
  });
}

// ═══════════════════════════════════════════════════════════════
// AUTO-REFRESH
// ═══════════════════════════════════════════════════════════════
function startAutoRefresh() {
  if (state.refreshInterval) clearInterval(state.refreshInterval);
  state.refreshCountdown = 10;
  updateRefreshUI();

  state.refreshInterval = setInterval(() => {
    state.refreshCountdown--;
    if (state.refreshCountdown <= 0) {
      state.refreshCountdown = 10;
      refreshCurrentStock();
    }
    updateRefreshUI();
  }, 1000);
}

function updateRefreshUI() {
  dom.refreshCountdown.textContent = `Auto-refresh: ${state.refreshCountdown}s`;
}

// ═══════════════════════════════════════════════════════════════
// PANEL SHOW/HIDE
// ═══════════════════════════════════════════════════════════════
function showLoading(ticker) {
  dom.loadingOverlay.classList.remove('hidden');
  dom.loaderTicker.textContent = ticker;
  dom.heroEmpty.classList.add('hidden');
  dom.stockPanel.classList.add('hidden');
  dom.errorCard.classList.add('hidden');
}

function hideLoading() {
  dom.loadingOverlay.classList.add('hidden');
}

function showStockPanel() {
  dom.heroEmpty.classList.add('hidden');
  dom.stockPanel.classList.remove('hidden');
  dom.errorCard.classList.add('hidden');
}

function showError(ticker, msg) {
  dom.heroEmpty.classList.add('hidden');
  dom.stockPanel.classList.add('hidden');
  dom.errorCard.classList.remove('hidden');
  dom.errorTitle.textContent = `Ticker not found: ${ticker}`;
  dom.errorMsg.textContent = msg || 'Could not retrieve data. Please check the symbol and try again.';
}

function hideError() {
  dom.errorCard.classList.add('hidden');
}

function retryFetch() {
  if (state.currentTicker) loadStock(state.currentTicker);
}

// ═══════════════════════════════════════════════════════════════
// THEME TOGGLE
// ═══════════════════════════════════════════════════════════════
$('themeToggle').addEventListener('click', () => {
  document.body.classList.toggle('light-theme');
  localStorage.setItem('stockos_theme', document.body.classList.contains('light-theme') ? 'light' : 'dark');
});

// ═══════════════════════════════════════════════════════════════
// FORMATTERS
// ═══════════════════════════════════════════════════════════════
function fmtPrice(val, currency) {
  if (val === null || val === undefined) return '—';
  const isINR = currency === 'INR';
  return val.toLocaleString(isINR ? 'en-IN' : 'en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtVolume(vol) {
  if (!vol) return '—';
  if (vol >= 1e9) return (vol / 1e9).toFixed(2) + 'B';
  if (vol >= 1e6) return (vol / 1e6).toFixed(2) + 'M';
  if (vol >= 1e3) return (vol / 1e3).toFixed(2) + 'K';
  return vol.toLocaleString();
}

function fmtMarketCap(cap) {
  if (!cap) return '—';
  if (cap >= 1e12) return '₹' + (cap / 1e12).toFixed(2) + 'T';
  if (cap >= 1e9)  return (cap / 1e9).toFixed(2) + 'B';
  if (cap >= 1e6)  return (cap / 1e6).toFixed(2) + 'M';
  return cap.toLocaleString();
}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
function init() {
  // Restore theme
  const savedTheme = localStorage.getItem('stockos_theme');
  if (savedTheme === 'light') document.body.classList.add('light-theme');

  // Start particles
  initParticles();

  // Start clock
  startClock();

  // Chart.js global defaults
  if (window.Chart) {
    Chart.defaults.color = '#475569';
    Chart.defaults.borderColor = 'rgba(255,255,255,0.05)';
    Chart.defaults.font.family = 'Inter';
  }

  console.log('%c🚀 StockOS Dashboard loaded', 'color:#7C3AED;font-weight:bold;font-size:14px');
  console.log('%cTip: Press ⌘K to focus search', 'color:#06B6D4;font-size:12px');
}

document.addEventListener('DOMContentLoaded', init);
