/* ═══════════════════════════════════════════════════════════
   TRADEBOOK PRO — FIXES.JS
   1. Monthly ROI on Capital (Dashboard)
   2. Rolling Sharpe & Calmar chart (Institutional → Attribution)
   3. Full Performance Report — enhanced data points (Institutional → Performance Report tab)
   4. Capital setting save/load
   5. Attribution waterfall table
   6. Navigation listener to trigger institutional renders
   ═══════════════════════════════════════════════════════════ */
'use strict';

(function () {

/* ── helpers ─────────────────────────────────────────────── */
const G  = id => document.getElementById(id);
const N  = t  => parseFloat(t.net) || 0;
const T  = () => { try { return JSON.parse(localStorage.getItem('tradebook_trades') || '[]'); } catch { return []; } };
const S  = () => { try { return JSON.parse(localStorage.getItem('tradebook_settings') || '{}'); } catch { return {}; } };
const fmt  = v => { const a = Math.abs(v); return (v < 0 ? '-' : '') + '₹' + (a >= 1e7 ? (a/1e7).toFixed(2)+'Cr' : a >= 1e5 ? (a/1e5).toFixed(2)+'L' : a >= 1000 ? (a/1000).toFixed(1)+'K' : a.toFixed(0)); };
const fmtS = v => (v >= 0 ? '+' : '') + fmt(v);
const pct  = (v, cap) => cap > 0 ? (v / cap * 100).toFixed(2) + '%' : '—';
const GRID = { color: 'rgba(255,255,255,0.04)' };
const TICK = { color: '#3d4a63', font: { size: 10, family: 'JetBrains Mono' } };
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

let _fixCharts = {};
function mk(id, cfg) {
  if (!window.Chart) return;
  const c = G(id); if (!c) return;
  if (_fixCharts[id]) { try { _fixCharts[id].destroy(); } catch {} }
  _fixCharts[id] = new Chart(c.getContext('2d'), cfg);
}

function getCapital() {
  const inp = G('roi-capital-input');
  if (inp && parseFloat(inp.value) > 0) return parseFloat(inp.value);
  const s = S();
  return parseFloat(s.capital) || 100000;
}

/* ════════════════════════════════════════════════════════════
   1. MONTHLY ROI ON CAPITAL (DASHBOARD)
════════════════════════════════════════════════════════════ */
let _roiViewType = 'bar';

/* ── Monthly capital allocation storage ── */
function getMonthlyCapitals() {
  try { return JSON.parse(localStorage.getItem('tradebook_monthly_capitals') || '{}'); } catch { return {}; }
}
function saveMonthlyCapitalsData(data) {
  localStorage.setItem('tradebook_monthly_capitals', JSON.stringify(data));
}
function getCapitalForMonth(monthKey) {
  const mc = getMonthlyCapitals();
  if (mc[monthKey] && parseFloat(mc[monthKey]) > 0) return parseFloat(mc[monthKey]);
  return getCapital(); // fallback to default
}

window.toggleMonthlyCapitalEditor = function() {
  const editor = G('monthly-capital-editor');
  if (!editor) return;
  const isOpen = editor.style.display !== 'none';
  editor.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) renderMonthlyCapitalEditor();
};

function renderMonthlyCapitalEditor() {
  const grid = G('monthly-capital-grid');
  if (!grid) return;
  const trades = T();
  const months = {};
  trades.forEach(t => { if (t.date) months[t.date.slice(0, 7)] = true; });
  const keys = Object.keys(months).sort();
  if (!keys.length) { grid.innerHTML = '<p style="color:var(--text3);font-size:12px">No trades yet — log trades to set per-month capital.</p>'; return; }
  const mc = getMonthlyCapitals();
  const defaultCap = getCapital();
  grid.innerHTML = keys.map(k => {
    const [y, m] = k.split('-');
    const label = MONTH_NAMES[parseInt(m) - 1] + ' ' + y;
    const val = mc[k] || '';
    return `<div style="display:flex;align-items:center;gap:6px;padding:6px 10px;background:var(--bg4);border-radius:var(--radius-sm);border:1px solid var(--border)">
      <span style="font-size:11px;font-weight:600;color:var(--text2);min-width:60px">${label}</span>
      <input type="number" data-month="${k}" class="form-input monthly-cap-input" placeholder="${defaultCap.toLocaleString('en-IN')}" value="${val}" style="flex:1;padding:4px 8px;font-size:12px;font-family:var(--font-mono)">
    </div>`;
  }).join('');
}

window.applyDefaultCapitalAll = function() {
  const defaultCap = getCapital();
  document.querySelectorAll('.monthly-cap-input').forEach(inp => { inp.value = defaultCap; });
};

window.saveMonthlyCapitals = function() {
  const data = {};
  document.querySelectorAll('.monthly-cap-input').forEach(inp => {
    const month = inp.dataset.month;
    const val = parseFloat(inp.value);
    if (month && val > 0) data[month] = val;
  });
  saveMonthlyCapitalsData(data);
  renderMonthlyROI();
  if (window.toast) toast('Monthly capitals saved!');
};

window.setROIView = function(type, btn) {
  _roiViewType = type;
  document.querySelectorAll('#monthly-roi-card .chart-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderMonthlyROI();
};

window.renderMonthlyROI = function() {
  const trades = T();
  const defaultCapital = getCapital();
  const container = G('monthly-roi-card');
  if (!container) return;

  // Sync capital input with settings value on first load
  const inp = G('roi-capital-input');
  if (inp && !inp.value) {
    const s = S();
    if (s.capital) inp.value = s.capital;
  }

  // Build monthly buckets
  const monthly = {};
  trades.forEach(t => {
    if (!t.date) return;
    const key = t.date.slice(0, 7); // "YYYY-MM"
    if (!monthly[key]) monthly[key] = { pnl: 0, trades: 0, wins: 0, gross: 0, tax: 0 };
    monthly[key].pnl    += N(t);
    monthly[key].trades += 1;
    monthly[key].wins   += N(t) > 0 ? 1 : 0;
    monthly[key].gross  += parseFloat(t.gross) || N(t);
    monthly[key].tax    += parseFloat(t.tax) || 0;
  });

  const keys   = Object.keys(monthly).sort();
  if (!keys.length) {
    G('monthly-roi-summary').innerHTML = '<p style="color:var(--text3);font-size:13px">Log trades to see monthly ROI.</p>';
    return;
  }

  // Use per-month capital if set, otherwise fallback to default
  const monthCapitals = keys.map(k => getCapitalForMonth(k));
  const rois   = keys.map((k, i) => parseFloat((monthly[k].pnl / monthCapitals[i] * 100).toFixed(2)));
  const labels = keys.map(k => {
    const [y, m] = k.split('-');
    return MONTH_NAMES[parseInt(m) - 1] + ' ' + y.slice(2);
  });

  // Summary pills
  const bestIdx  = rois.indexOf(Math.max(...rois));
  const worstIdx = rois.indexOf(Math.min(...rois));
  const totalPnl = keys.reduce((s, k) => s + monthly[k].pnl, 0);
  const avgCap   = monthCapitals.reduce((s, c) => s + c, 0) / monthCapitals.length;
  const totalROI = (totalPnl / avgCap * 100).toFixed(2);
  const profMonths = rois.filter(r => r > 0).length;
  const hasCustomCap = keys.some(k => { const mc = getMonthlyCapitals(); return mc[k] && parseFloat(mc[k]) > 0; });

  const summary = G('monthly-roi-summary');
  if (summary) {
    const pills = [
      ['Total ROI', totalROI + '%', parseFloat(totalROI) >= 0 ? 'var(--green)' : 'var(--red)'],
      ['Best Month', labels[bestIdx] + ' ' + (rois[bestIdx] >= 0 ? '+' : '') + rois[bestIdx] + '%', 'var(--green)'],
      ['Worst Month', labels[worstIdx] + ' ' + rois[worstIdx] + '%', 'var(--red)'],
      ['Profit Months', profMonths + '/' + keys.length, profMonths >= keys.length * 0.6 ? 'var(--green)' : 'var(--gold)'],
      ['Avg Capital', fmt(avgCap), 'var(--blue)'],
    ];
    if (hasCustomCap) pills.push(['Mode', 'Per-Month', 'var(--purple)']);
    summary.innerHTML = pills.map(([l, v, c]) => `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px 14px;display:flex;flex-direction:column;gap:2px">
      <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.07em">${l}</div>
      <div style="font-family:var(--font-mono);font-size:15px;font-weight:700;color:${c}">${v}</div>
    </div>`).join('');
  }

  // Update subtitle
  const sub = G('monthly-roi-sub');
  if (sub) sub.textContent = hasCustomCap
    ? `ROI on per-month capital · ${keys.length} month${keys.length > 1 ? 's' : ''} of data`
    : `Return % on ₹${defaultCapital.toLocaleString('en-IN')} capital · ${keys.length} month${keys.length > 1 ? 's' : ''} of data`;

  // Chart
  const bgColors = rois.map(r => r >= 0 ? 'rgba(0,255,163,0.65)' : 'rgba(255,68,102,0.65)');
  const bdColors = rois.map(r => r >= 0 ? '#00ffa3' : '#ff4466');

  if (_roiViewType === 'bar') {
    mk('monthlyROIChart', {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Monthly ROI %',
          data: rois,
          backgroundColor: bgColors,
          borderColor: bdColors,
          borderWidth: 1,
          borderRadius: 5,
          borderSkipped: false,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => {
                const k = keys[ctx.dataIndex];
                const m = monthly[k];
                return [
                  ` ROI: ${ctx.parsed.y >= 0 ? '+' : ''}${ctx.parsed.y}%`,
                  ` P&L: ${fmtS(m.pnl)}`,
                  ` Trades: ${m.trades} (${((m.wins / m.trades) * 100).toFixed(0)}% WR)`,
                ];
              }
            }
          }
        },
        scales: {
          x: { grid: GRID, ticks: TICK },
          y: {
            grid: GRID, ticks: { ...TICK, callback: v => v + '%' },
            afterDataLimits: axis => {
              const ext = Math.max(Math.abs(axis.max), Math.abs(axis.min)) * 0.15;
              axis.max += ext; axis.min -= ext;
            }
          }
        }
      }
    });
  } else {
    mk('monthlyROIChart', {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Monthly ROI %',
            data: rois,
            borderColor: '#00ffa3',
            backgroundColor: 'rgba(0,255,163,0.08)',
            borderWidth: 2,
            pointRadius: 5,
            pointBackgroundColor: bgColors,
            pointBorderColor: bdColors,
            tension: 0.3,
            fill: true,
          },
          {
            label: '0% Line',
            data: Array(keys.length).fill(0),
            borderColor: 'rgba(255,255,255,0.12)',
            borderDash: [5, 5],
            borderWidth: 1,
            pointRadius: 0,
            fill: false,
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => (c.parsed.y >= 0 ? '+' : '') + c.parsed.y + '%' } } },
        scales: {
          x: { grid: GRID, ticks: TICK },
          y: { grid: GRID, ticks: { ...TICK, callback: v => v + '%' } }
        }
      }
    });
  }

  // Table — now includes Capital Deployed column
  const tbl = G('monthly-roi-table');
  if (tbl) {
    tbl.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead>
        <tr style="border-bottom:1px solid var(--border)">
          ${['Month','Capital','Net P&L','ROI %','Trades','Win Rate','Gross P&L','Charges','Avg/Trade'].map(h =>
            `<th style="padding:7px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text3);font-weight:600">${h}</th>`
          ).join('')}
        </tr>
      </thead>
      <tbody>
        ${keys.map((k, i) => {
          const m = monthly[k];
          const roi = rois[i];
          const cap = monthCapitals[i];
          const wr = m.trades ? (m.wins / m.trades * 100).toFixed(0) : 0;
          const avg = m.trades ? m.pnl / m.trades : 0;
          const isCustom = getMonthlyCapitals()[k] && parseFloat(getMonthlyCapitals()[k]) > 0;
          return `<tr style="border-bottom:1px solid var(--border);transition:background .15s" onmouseover="this.style.background='var(--bg4)'" onmouseout="this.style.background=''">
            <td style="padding:8px 10px;font-weight:600">${labels[i]}</td>
            <td style="padding:8px 10px;font-family:var(--font-mono);color:${isCustom?'var(--purple)':'var(--blue)'}" title="${isCustom?'Custom per-month capital':'Default capital'}">₹${cap.toLocaleString('en-IN')}${isCustom?' ✎':''}</td>
            <td style="padding:8px 10px;font-family:var(--font-mono);color:${m.pnl>=0?'var(--green)':'var(--red)'}">${fmtS(m.pnl)}</td>
            <td style="padding:8px 10px;font-family:var(--font-mono);color:${roi>=0?'var(--green)':'var(--red)'};font-weight:700">${roi>=0?'+':''}${roi}%</td>
            <td style="padding:8px 10px;color:var(--text2)">${m.trades}</td>
            <td style="padding:8px 10px;color:${wr>=55?'var(--green)':wr>=40?'var(--gold)':'var(--red)'}">${wr}%</td>
            <td style="padding:8px 10px;font-family:var(--font-mono);color:var(--text2)">${fmt(m.gross)}</td>
            <td style="padding:8px 10px;font-family:var(--font-mono);color:var(--red)">${fmt(m.tax)}</td>
            <td style="padding:8px 10px;font-family:var(--font-mono);color:${avg>=0?'var(--green)':'var(--red)'}">${fmtS(avg)}</td>
          </tr>`;
        }).reverse().join('')}
      </tbody>
    </table>`;
  }
};

/* ════════════════════════════════════════════════════════════
   2. ROLLING SHARPE & CALMAR (Institutional → Attribution)
════════════════════════════════════════════════════════════ */
function renderRollingMetrics() {
  const canvas = G('rolling-metrics-chart');
  if (!canvas) return;
  const trades = T();
  if (trades.length < 22) {
    canvas.parentElement.innerHTML = '<p style="color:var(--text3);font-size:13px;padding:12px 0">Need 22+ trades for rolling metrics.</p>';
    return;
  }

  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  const rets   = sorted.map(t => N(t));
  const WIN    = 20;
  const sharpePoints = [];
  const calmarPoints = [];
  const labels = [];

  for (let i = WIN; i < sorted.length; i++) {
    const slice = rets.slice(i - WIN, i);
    const mean  = slice.reduce((s, v) => s + v, 0) / WIN;
    const std   = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / WIN);
    const sharpe = std > 0 ? parseFloat((mean / std * Math.sqrt(252)).toFixed(3)) : 0;

    // rolling max drawdown over window
    let peak = -Infinity, mdd = 0, running = 0;
    slice.forEach(r => { running += r; peak = Math.max(peak, running); mdd = Math.max(mdd, peak - running); });
    const total = slice.reduce((s, v) => s + v, 0);
    const calmar = mdd > 0 ? parseFloat((total / mdd).toFixed(3)) : total > 0 ? 5 : 0;

    sharpePoints.push(sharpe);
    calmarPoints.push(Math.min(Math.max(calmar, -5), 5)); // clamp
    labels.push(`T${i + 1}`);
  }

  mk('rolling-metrics-chart', {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Rolling Sharpe',
          data: sharpePoints,
          borderColor: '#06d6f5',
          backgroundColor: 'rgba(6,214,245,0.06)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.35,
          fill: false,
          yAxisID: 'y',
        },
        {
          label: 'Rolling Calmar',
          data: calmarPoints,
          borderColor: '#ffd166',
          backgroundColor: 'rgba(255,209,102,0.06)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.35,
          fill: false,
          yAxisID: 'y',
        },
        {
          label: 'Good (1.0)',
          data: Array(labels.length).fill(1),
          borderColor: 'rgba(0,255,163,0.25)',
          borderDash: [5, 5],
          borderWidth: 1,
          pointRadius: 0,
          fill: false,
          yAxisID: 'y',
        },
        {
          label: 'Zero',
          data: Array(labels.length).fill(0),
          borderColor: 'rgba(255,255,255,0.1)',
          borderDash: [3, 3],
          borderWidth: 1,
          pointRadius: 0,
          fill: false,
          yAxisID: 'y',
        },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#7b88a8', font: { size: 11 }, boxWidth: 10 } },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.parsed.y.toFixed(2)}` } }
      },
      scales: {
        x: { grid: GRID, ticks: { ...TICK, maxTicksLimit: 10 } },
        y: { grid: GRID, ticks: { ...TICK, callback: v => v.toFixed(1) } }
      }
    }
  });
}

/* ════════════════════════════════════════════════════════════
   3. ATTRIBUTION TABLE + WATERFALL (fill missing table)
════════════════════════════════════════════════════════════ */
function renderAttributionTable() {
  const tbl = G('attribution-table');
  if (!tbl) return;
  const trades = T();
  const byStrat = {};
  trades.forEach(t => {
    const s = t.strategy || 'Other';
    if (!byStrat[s]) byStrat[s] = { pnl: 0, trades: 0, wins: 0 };
    byStrat[s].pnl    += N(t);
    byStrat[s].trades += 1;
    byStrat[s].wins   += N(t) > 0 ? 1 : 0;
  });
  const entries = Object.entries(byStrat).sort((a, b) => b[1].pnl - a[1].pnl);
  const totalPnl = entries.reduce((s, [, v]) => s + v.pnl, 0) || 1;

  tbl.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px">
    <thead><tr style="border-bottom:1px solid var(--border)">
      ${['Strategy','Net P&L','Contribution','Trades','Win Rate','Avg P&L'].map(h =>
        `<th style="padding:7px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text3)">${h}</th>`
      ).join('')}
    </tr></thead>
    <tbody>
      ${entries.map(([name, d]) => {
        const contrib = (d.pnl / totalPnl * 100).toFixed(1);
        const wr = d.trades ? (d.wins / d.trades * 100).toFixed(0) : 0;
        const avg = d.trades ? d.pnl / d.trades : 0;
        return `<tr style="border-bottom:1px solid var(--border)">
          <td style="padding:8px 10px;font-weight:600;color:var(--accent)">${name}</td>
          <td style="padding:8px 10px;font-family:var(--font-mono);color:${d.pnl>=0?'var(--green)':'var(--red)'}">${fmtS(d.pnl)}</td>
          <td style="padding:8px 10px">
            <div style="display:flex;align-items:center;gap:8px">
              <div style="flex:1;height:6px;background:var(--bg4);border-radius:3px;min-width:60px">
                <div style="height:100%;width:${Math.min(100,Math.abs(parseFloat(contrib)))}%;background:${d.pnl>=0?'var(--green)':'var(--red)'};border-radius:3px"></div>
              </div>
              <span style="font-family:var(--font-mono);font-size:11px;color:${d.pnl>=0?'var(--green)':'var(--red)'}">${d.pnl>=0?'+':''}${contrib}%</span>
            </div>
          </td>
          <td style="padding:8px 10px;color:var(--text2)">${d.trades}</td>
          <td style="padding:8px 10px;color:${wr>=55?'var(--green)':wr>=40?'var(--gold)':'var(--red)'}">${wr}%</td>
          <td style="padding:8px 10px;font-family:var(--font-mono);color:${avg>=0?'var(--green)':'var(--red)'}">${fmtS(avg)}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>`;
}

/* ════════════════════════════════════════════════════════════
   4. FULL PERFORMANCE REPORT — ENHANCED DATA POINTS
════════════════════════════════════════════════════════════ */
function renderPerfReport() {
  const el = G('perf-report-container');
  if (!el) return;
  const trades = T();
  const capital = getCapital();

  if (!trades.length) {
    el.innerHTML = '<p style="color:var(--text3);font-size:13px;padding:20px 0">No trades logged yet. Add trades to generate your performance report.</p>';
    return;
  }

  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  const nets   = sorted.map(t => N(t));
  const wins   = sorted.filter(t => N(t) > 0);
  const losses = sorted.filter(t => N(t) < 0);

  // Core P&L
  const totalNet  = nets.reduce((s, v) => s + v, 0);
  const totalGross = trades.reduce((s, t) => s + (parseFloat(t.gross) || N(t)), 0);
  const totalTax  = trades.reduce((s, t) => s + (parseFloat(t.tax) || 0), 0);
  const winRate   = trades.length ? wins.length / trades.length * 100 : 0;
  const avgWin    = wins.length ? wins.reduce((s, t) => s + N(t), 0) / wins.length : 0;
  const avgLoss   = losses.length ? Math.abs(losses.reduce((s, t) => s + N(t), 0) / losses.length) : 0;
  const grossW    = wins.reduce((s, t) => s + N(t), 0);
  const grossL    = Math.abs(losses.reduce((s, t) => s + N(t), 0));
  const pf        = grossL > 0 ? grossW / grossL : grossW > 0 ? 999 : 0;
  const rr        = avgLoss > 0 ? avgWin / avgLoss : 0;

  // Drawdown
  let peak = 0, equity = 0, maxDD = 0, maxDDPct = 0;
  sorted.forEach(t => {
    equity += N(t);
    peak = Math.max(peak, equity);
    const dd = peak - equity;
    if (dd > maxDD) { maxDD = dd; maxDDPct = peak > 0 ? dd / peak * 100 : 0; }
  });

  // Sharpe / Sortino
  const mean  = nets.reduce((s, v) => s + v, 0) / nets.length;
  const std   = Math.sqrt(nets.reduce((s, v) => s + (v - mean) ** 2, 0) / nets.length);
  const negDevs = nets.filter(v => v < 0);
  const dstd  = negDevs.length > 1 ? Math.sqrt(negDevs.reduce((s, v) => s + v * v, 0) / negDevs.length) : 0;
  const sharpe  = std > 0 ? (mean / std * Math.sqrt(252)).toFixed(2) : '—';
  const sortino = dstd > 0 ? (mean / dstd * Math.sqrt(252)).toFixed(2) : '—';
  const calmar  = maxDD > 0 ? (totalNet / maxDD).toFixed(2) : totalNet > 0 ? '∞' : '—';

  // ROI
  const roi     = (totalNet / capital * 100).toFixed(2);
  const annDays = (() => {
    if (sorted.length < 2) return 1;
    const d1 = new Date(sorted[0].date), d2 = new Date(sorted[sorted.length - 1].date);
    return Math.max(1, (d2 - d1) / 86400000);
  })();
  const annROI  = ((totalNet / capital) * (365 / annDays) * 100).toFixed(2);

  // Streak
  let curStreak = 0, maxWStreak = 0, maxLStreak = 0, wRun = 0, lRun = 0;
  sorted.forEach(t => {
    if (N(t) > 0) { wRun++; lRun = 0; maxWStreak = Math.max(maxWStreak, wRun); }
    else           { lRun++; wRun = 0; maxLStreak = Math.max(maxLStreak, lRun); }
  });
  const last = sorted[sorted.length - 1];
  if (last && N(last) > 0) curStreak = wRun; else curStreak = -lRun;

  // Best / worst trade
  const bestTrade  = sorted.reduce((b, t) => N(t) > N(b) ? t : b, sorted[0]);
  const worstTrade = sorted.reduce((b, t) => N(t) < N(b) ? t : b, sorted[0]);

  // Average holding time (if available)
  const withTime = trades.filter(t => t.entryTime && t.exitTime);
  let avgHold = '—';
  if (withTime.length) {
    const mins = withTime.map(t => {
      const [eh, em] = (t.entryTime || '09:15').split(':').map(Number);
      const [xh, xm] = (t.exitTime  || '15:30').split(':').map(Number);
      return (xh * 60 + xm) - (eh * 60 + em);
    }).filter(m => m > 0);
    if (mins.length) {
      const avg = mins.reduce((s, m) => s + m, 0) / mins.length;
      avgHold = avg >= 60 ? `${(avg / 60).toFixed(1)}h` : `${Math.round(avg)}m`;
    }
  }

  // By symbol
  const bySymbol = {};
  trades.forEach(t => {
    const sym = t.symbol || 'Unknown';
    if (!bySymbol[sym]) bySymbol[sym] = { pnl: 0, trades: 0, wins: 0 };
    bySymbol[sym].pnl    += N(t);
    bySymbol[sym].trades += 1;
    bySymbol[sym].wins   += N(t) > 0 ? 1 : 0;
  });
  const topSymbols = Object.entries(bySymbol).sort((a, b) => b[1].pnl - a[1].pnl).slice(0, 8);

  // By strategy
  const byStrat = {};
  trades.forEach(t => {
    const s = t.strategy || 'Untagged';
    if (!byStrat[s]) byStrat[s] = { pnl: 0, trades: 0, wins: 0 };
    byStrat[s].pnl    += N(t);
    byStrat[s].trades += 1;
    byStrat[s].wins   += N(t) > 0 ? 1 : 0;
  });
  const topStrategies = Object.entries(byStrat).sort((a, b) => b[1].pnl - a[1].pnl);

  // Monthly P&L
  const monthly = {};
  trades.forEach(t => {
    if (!t.date) return;
    const k = t.date.slice(0, 7);
    if (!monthly[k]) monthly[k] = { pnl: 0, trades: 0, wins: 0 };
    monthly[k].pnl    += N(t);
    monthly[k].trades += 1;
    monthly[k].wins   += N(t) > 0 ? 1 : 0;
  });
  const monthlyRows = Object.entries(monthly).sort((a, b) => a[0].localeCompare(b[0]));

  // Day-of-week breakdown
  const byDay = { Mon: { pnl: 0, trades: 0, wins: 0 }, Tue: { pnl: 0, trades: 0, wins: 0 }, Wed: { pnl: 0, trades: 0, wins: 0 }, Thu: { pnl: 0, trades: 0, wins: 0 }, Fri: { pnl: 0, trades: 0, wins: 0 } };
  trades.forEach(t => {
    if (!t.date) return;
    const d = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(t.date).getDay()];
    if (byDay[d]) { byDay[d].pnl += N(t); byDay[d].trades++; byDay[d].wins += N(t) > 0 ? 1 : 0; }
  });

  // Emotion breakdown
  const byEmo = {};
  trades.filter(t => t.emotion).forEach(t => {
    if (!byEmo[t.emotion]) byEmo[t.emotion] = { pnl: 0, trades: 0 };
    byEmo[t.emotion].pnl    += N(t);
    byEmo[t.emotion].trades += 1;
  });

  // Discipline
  const withDisc = trades.filter(t => t.discipline);
  const followed = withDisc.filter(t => t.discipline === 'followed').length;
  const discRate  = withDisc.length ? (followed / withDisc.length * 100).toFixed(0) : '—';

  // ── RENDER ──────────────────────────────────────────────
  el.innerHTML = `
  <style>
    .rpt-section { margin-bottom: 28px; }
    .rpt-section-title { font-family: var(--font-display); font-size: 13px; font-weight: 800; color: var(--text3); text-transform: uppercase; letter-spacing: .1em; margin-bottom: 14px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
    .rpt-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
    .rpt-grid-3 { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
    .rpt-stat { background: var(--bg3); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 12px 14px; }
    .rpt-stat-l { font-size: 9px; color: var(--text3); text-transform: uppercase; letter-spacing: .08em; margin-bottom: 4px; }
    .rpt-stat-v { font-family: var(--font-mono); font-size: 18px; font-weight: 800; line-height: 1.1; }
    .rpt-stat-s { font-size: 10px; color: var(--text3); margin-top: 3px; }
    .rpt-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .rpt-table th { padding: 7px 10px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: var(--text3); border-bottom: 1px solid var(--border); }
    .rpt-table td { padding: 8px 10px; border-bottom: 1px solid var(--border); }
    .rpt-table tr:last-child td { border-bottom: none; }
    .rpt-table tr:hover td { background: var(--bg4); }
    .rpt-bar-wrap { display: flex; align-items: center; gap: 8px; }
    .rpt-bar { flex: 1; height: 5px; background: var(--bg4); border-radius: 3px; min-width: 40px; }
    .rpt-bar-fill { height: 100%; border-radius: 3px; }
  </style>

  <!-- SECTION: OVERVIEW -->
  <div class="rpt-section">
    <div class="rpt-section-title">📊 Overview — ${sorted[0]?.date || '—'} to ${sorted[sorted.length-1]?.date || '—'}</div>
    <div class="rpt-grid">
      ${rptStat('Net P&L', fmtS(totalNet), totalNet>=0?'var(--green)':'var(--red)', `${trades.length} total trades`)}
      ${rptStat('ROI', (parseFloat(roi)>=0?'+':'')+roi+'%', parseFloat(roi)>=0?'var(--green)':'var(--red)', `on ₹${capital.toLocaleString('en-IN')} capital`)}
      ${rptStat('Ann. ROI', (parseFloat(annROI)>=0?'+':'')+annROI+'%', parseFloat(annROI)>=0?'var(--green)':'var(--red)', `over ${Math.round(annDays)}d`)}
      ${rptStat('Win Rate', winRate.toFixed(1)+'%', winRate>=55?'var(--green)':winRate>=40?'var(--gold)':'var(--red)', `${wins.length}W / ${losses.length}L`)}
      ${rptStat('Profit Factor', pf===999?'∞':pf.toFixed(2), pf>=2?'var(--green)':pf>=1?'var(--gold)':'var(--red)', 'target >2')}
      ${rptStat('R:R Ratio', rr.toFixed(2)+':1', rr>=2?'var(--green)':rr>=1?'var(--gold)':'var(--red)', 'avg win / avg loss')}
    </div>
  </div>

  <!-- SECTION: RISK METRICS -->
  <div class="rpt-section">
    <div class="rpt-section-title">🛡️ Risk & Ratios</div>
    <div class="rpt-grid">
      ${rptStat('Sharpe Ratio', sharpe, parseFloat(sharpe)>=1?'var(--green)':parseFloat(sharpe)>=0?'var(--gold)':'var(--red)', '>1 good, >2 excellent')}
      ${rptStat('Sortino Ratio', sortino, parseFloat(sortino)>=1?'var(--green)':parseFloat(sortino)>=0?'var(--gold)':'var(--red)', 'downside risk adjusted')}
      ${rptStat('Calmar Ratio', calmar, parseFloat(calmar)>=1?'var(--green)':parseFloat(calmar)>=0?'var(--gold)':'var(--red)', 'return / max DD')}
      ${rptStat('Max Drawdown', fmt(maxDD), 'var(--red)', maxDDPct.toFixed(1)+'% of peak equity')}
      ${rptStat('Avg Win', fmt(avgWin), 'var(--green)', 'per winning trade')}
      ${rptStat('Avg Loss', fmt(avgLoss), 'var(--red)', 'per losing trade')}
      ${rptStat('Gross P&L', fmt(totalGross), totalGross>=0?'var(--green)':'var(--red)', 'before charges')}
      ${rptStat('Total Charges', fmt(totalTax), 'var(--orange)', `${totalGross>0?((totalTax/totalGross)*100).toFixed(1):'—'}% drag`)}
    </div>
  </div>

  <!-- SECTION: TRADE BEHAVIOUR -->
  <div class="rpt-section">
    <div class="rpt-section-title">🧠 Trade Behaviour</div>
    <div class="rpt-grid">
      ${rptStat('Best Trade', fmtS(N(bestTrade)), 'var(--green)', bestTrade.symbol+' · '+bestTrade.date)}
      ${rptStat('Worst Trade', fmtS(N(worstTrade)), 'var(--red)', worstTrade.symbol+' · '+worstTrade.date)}
      ${rptStat('Max Win Streak', maxWStreak+'', 'var(--green)', 'consecutive wins')}
      ${rptStat('Max Loss Streak', maxLStreak+'', 'var(--red)', 'consecutive losses')}
      ${rptStat('Current Streak', (curStreak>0?'+':'')+curStreak, curStreak>0?'var(--green)':'var(--red)', curStreak>0?'win streak':'loss streak')}
      ${rptStat('Avg Hold Time', avgHold, 'var(--blue)', withTime.length+' trades with times')}
      ${rptStat('Discipline Rate', discRate+'%', parseFloat(discRate)>=80?'var(--green)':parseFloat(discRate)>=60?'var(--gold)':'var(--red)', withDisc.length+' rated trades')}
      ${rptStat('Unique Symbols', Object.keys(bySymbol).length+'', 'var(--purple)', 'instruments traded')}
    </div>
  </div>

  <!-- SECTION: MONTHLY BREAKDOWN -->
  <div class="rpt-section">
    <div class="rpt-section-title">📅 Monthly Breakdown</div>
    <table class="rpt-table">
      <thead><tr>
        <th>Month</th><th>Net P&L</th><th>ROI %</th><th>Trades</th><th>Win Rate</th><th>Avg P&L</th>
      </tr></thead>
      <tbody>
        ${monthlyRows.map(([k, m]) => {
          const [y, mo] = k.split('-');
          const mLabel = MONTH_NAMES[parseInt(mo)-1]+' '+y;
          const mROI = (m.pnl / capital * 100).toFixed(2);
          const wr = m.trades ? (m.wins/m.trades*100).toFixed(0) : 0;
          const avg = m.trades ? m.pnl/m.trades : 0;
          return `<tr>
            <td style="font-weight:600">${mLabel}</td>
            <td style="font-family:var(--font-mono);color:${m.pnl>=0?'var(--green)':'var(--red)'}">${fmtS(m.pnl)}</td>
            <td style="font-family:var(--font-mono);color:${parseFloat(mROI)>=0?'var(--green)':'var(--red)'};font-weight:700">${parseFloat(mROI)>=0?'+':''}${mROI}%</td>
            <td>${m.trades}</td>
            <td style="color:${wr>=55?'var(--green)':wr>=40?'var(--gold)':'var(--red)'}">${wr}%</td>
            <td style="font-family:var(--font-mono);color:${avg>=0?'var(--green)':'var(--red)'}">${fmtS(avg)}</td>
          </tr>`;
        }).reverse().join('')}
      </tbody>
    </table>
  </div>

  <!-- SECTION: SYMBOL BREAKDOWN -->
  <div class="rpt-section">
    <div class="rpt-section-title">📈 Top Symbols</div>
    <table class="rpt-table">
      <thead><tr><th>Symbol</th><th>Net P&L</th><th>Trades</th><th>Win Rate</th><th>Contribution</th></tr></thead>
      <tbody>
        ${topSymbols.map(([sym, d]) => {
          const wr = d.trades ? (d.wins/d.trades*100).toFixed(0) : 0;
          const contrib = totalNet !== 0 ? (d.pnl/Math.abs(totalNet)*100).toFixed(1) : '0';
          return `<tr>
            <td style="font-weight:700;color:var(--accent)">${sym}</td>
            <td style="font-family:var(--font-mono);color:${d.pnl>=0?'var(--green)':'var(--red)'}">${fmtS(d.pnl)}</td>
            <td>${d.trades}</td>
            <td style="color:${wr>=55?'var(--green)':wr>=40?'var(--gold)':'var(--red)'}">${wr}%</td>
            <td>
              <div class="rpt-bar-wrap">
                <div class="rpt-bar"><div class="rpt-bar-fill" style="width:${Math.min(100,Math.abs(parseFloat(contrib)))}%;background:${d.pnl>=0?'var(--green)':'var(--red)'}"></div></div>
                <span style="font-size:11px;font-family:var(--font-mono);color:${d.pnl>=0?'var(--green)':'var(--red)'}">${d.pnl>=0?'+':''}${contrib}%</span>
              </div>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>

  <!-- SECTION: STRATEGY BREAKDOWN -->
  <div class="rpt-section">
    <div class="rpt-section-title">🎯 Strategy Breakdown</div>
    <table class="rpt-table">
      <thead><tr><th>Strategy</th><th>Net P&L</th><th>Trades</th><th>Win Rate</th><th>Avg P&L</th></tr></thead>
      <tbody>
        ${topStrategies.map(([name, d]) => {
          const wr = d.trades ? (d.wins/d.trades*100).toFixed(0) : 0;
          const avg = d.trades ? d.pnl/d.trades : 0;
          return `<tr>
            <td style="font-weight:600">${name}</td>
            <td style="font-family:var(--font-mono);color:${d.pnl>=0?'var(--green)':'var(--red)'}">${fmtS(d.pnl)}</td>
            <td>${d.trades}</td>
            <td style="color:${wr>=55?'var(--green)':wr>=40?'var(--gold)':'var(--red)'}">${wr}%</td>
            <td style="font-family:var(--font-mono);color:${avg>=0?'var(--green)':'var(--red)'}">${fmtS(avg)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>

  <!-- SECTION: DAY-OF-WEEK -->
  <div class="rpt-section">
    <div class="rpt-section-title">📆 Day-of-Week Performance</div>
    <div class="rpt-grid-3">
      ${Object.entries(byDay).map(([day, d]) => {
        const wr = d.trades ? (d.wins/d.trades*100).toFixed(0) : '—';
        return rptStat(day, d.trades ? fmtS(d.pnl) : '—', d.pnl>=0?'var(--green)':'var(--red)', d.trades ? `${d.trades} trades · ${wr}% WR` : 'no trades');
      }).join('')}
    </div>
  </div>

  <!-- SECTION: EMOTION IMPACT -->
  ${Object.keys(byEmo).length ? `
  <div class="rpt-section">
    <div class="rpt-section-title">🧘 Emotion Impact</div>
    <table class="rpt-table">
      <thead><tr><th>Emotion</th><th>Trades</th><th>Net P&L</th><th>Avg P&L</th></tr></thead>
      <tbody>
        ${Object.entries(byEmo).sort((a,b)=>b[1].pnl-a[1].pnl).map(([emo, d]) => {
          const avg = d.trades ? d.pnl/d.trades : 0;
          return `<tr>
            <td style="font-weight:600">${emo}</td>
            <td>${d.trades}</td>
            <td style="font-family:var(--font-mono);color:${d.pnl>=0?'var(--green)':'var(--red)'}">${fmtS(d.pnl)}</td>
            <td style="font-family:var(--font-mono);color:${avg>=0?'var(--green)':'var(--red)'}">${fmtS(avg)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>` : ''}

  <!-- SECTION: ALL TRADES DETAIL -->
  <div class="rpt-section">
    <div class="rpt-section-title">📋 All Trades — Detailed Log (${sorted.length})</div>
    <div style="overflow-x:auto">
    <table class="rpt-table" style="min-width:900px">
      <thead><tr>
        <th>#</th>
        <th>Date</th>
        <th>Symbol</th>
        <th>Direction</th>
        <th>Qty</th>
        <th>Entry ₹</th>
        <th>Exit ₹</th>
        <th>Gross P&L</th>
        <th>Charges</th>
        <th>Net P&L</th>
        <th>Return %</th>
        <th>Strategy</th>
        <th>Emotion</th>
        <th>Discipline</th>
        <th>Setup</th>
        <th>Notes</th>
      </tr></thead>
      <tbody>
        ${sorted.map((t, i) => {
          const n = N(t);
          const gross = parseFloat(t.gross) || n;
          const tax   = parseFloat(t.tax) || 0;
          const cap   = parseFloat(t.capitalDeployed) || 0;
          const retPct = cap > 0 ? ((n / cap) * 100).toFixed(2) + '%' : '—';
          const dir = (t.direction || '').toUpperCase();
          const dirColor = dir === 'LONG' || dir === 'BUY' ? 'var(--green)' : dir === 'SHORT' || dir === 'SELL' ? 'var(--red)' : 'var(--text2)';
          const discColor = t.discipline === 'followed' ? 'var(--green)' : t.discipline === 'broken' ? 'var(--red)' : 'var(--text3)';
          return `<tr>
            <td style="color:var(--text3);font-size:11px">${i + 1}</td>
            <td style="white-space:nowrap;font-weight:500">${t.date || '—'}</td>
            <td style="font-weight:700;color:var(--accent)">${t.symbol || '—'}</td>
            <td style="color:${dirColor};font-weight:700;font-size:11px">${dir || '—'}</td>
            <td style="font-family:var(--font-mono)">${t.qty || '—'}</td>
            <td style="font-family:var(--font-mono)">₹${Number(t.entry||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
            <td style="font-family:var(--font-mono)">₹${Number(t.exit||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
            <td style="font-family:var(--font-mono);color:${gross>=0?'var(--green)':'var(--red)'}">${gross>=0?'+':''}₹${Math.abs(gross).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
            <td style="font-family:var(--font-mono);color:var(--orange)">${tax>0?'₹'+tax.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}):'—'}</td>
            <td style="font-family:var(--font-mono);font-weight:700;color:${n>=0?'var(--green)':'var(--red)'}">${n>=0?'+':''}₹${Math.abs(n).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
            <td style="font-family:var(--font-mono);color:${retPct!=='—'?(parseFloat(retPct)>=0?'var(--green)':'var(--red)'):'var(--text3)'}">${retPct}</td>
            <td style="color:var(--text2)">${t.strategy || '—'}</td>
            <td>${t.emotion || '—'}</td>
            <td style="color:${discColor};font-size:11px;font-weight:600">${t.discipline ? t.discipline.toUpperCase() : '—'}</td>
            <td style="color:var(--text2);font-size:11px">${t.setup || t.setupType || '—'}</td>
            <td style="color:var(--text3);font-size:11px;max-width:180px;white-space:normal;line-height:1.4">${t.notes || t.note || '—'}</td>
          </tr>`;
        }).join('')}
      </tbody>
      <tfoot>
        <tr style="border-top:2px solid var(--border);font-weight:700;background:var(--bg3)">
          <td colspan="7" style="padding:10px;color:var(--text3);font-size:11px">TOTALS</td>
          <td style="padding:10px;font-family:var(--font-mono);color:${totalGross>=0?'var(--green)':'var(--red)'}">${totalGross>=0?'+':''}₹${Math.abs(totalGross).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
          <td style="padding:10px;font-family:var(--font-mono);color:var(--orange)">₹${totalTax.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
          <td style="padding:10px;font-family:var(--font-mono);font-weight:800;color:${totalNet>=0?'var(--green)':'var(--red)'}">${totalNet>=0?'+':''}₹${Math.abs(totalNet).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
          <td style="padding:10px;font-family:var(--font-mono);color:${parseFloat(roi)>=0?'var(--green)':'var(--red)'}">ROI: ${parseFloat(roi)>=0?'+':''}${roi}%</td>
          <td colspan="5"></td>
        </tr>
      </tfoot>
    </table>
    </div>
  </div>

  <!-- SECTION: FOOTER -->
  <div style="padding:16px 0;font-size:11px;color:var(--text3);border-top:1px solid var(--border);margin-top:8px">
    Generated by TradeBook Pro · ${new Date().toLocaleString('en-IN', { day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit' })} · ${trades.length} trades analysed
  </div>
  `;

  function rptStat(label, value, color, sub) {
    return `<div class="rpt-stat">
      <div class="rpt-stat-l">${label}</div>
      <div class="rpt-stat-v" style="color:${color}">${value}</div>
      ${sub ? `<div class="rpt-stat-s">${sub}</div>` : ''}
    </div>`;
  }
}

/* ════════════════════════════════════════════════════════════
   5. SETTINGS — CAPITAL SAVE/LOAD
════════════════════════════════════════════════════════════ */
function patchSettingsSave() {
  const origSave = window.saveSettings;
  window.saveSettings = function() {
    // Save capital from new input
    const capEl = G('s-capital');
    if (capEl && parseFloat(capEl.value) > 0) {
      const s = S();
      s.capital = parseFloat(capEl.value);
      try { localStorage.setItem('tradebook_settings', JSON.stringify(s)); } catch {}
    }
    if (typeof origSave === 'function') origSave();
    // Update ROI capital input
    const roi = G('roi-capital-input');
    if (roi && capEl && parseFloat(capEl.value) > 0 && !roi.value) roi.value = capEl.value;
    renderMonthlyROI();
  };
}

function loadCapitalSetting() {
  const s = S();
  const capEl = G('s-capital');
  if (capEl && s.capital) capEl.value = s.capital;
  const roiEl = G('roi-capital-input');
  if (roiEl && s.capital && !roiEl.value) roiEl.value = s.capital;
}

/* ════════════════════════════════════════════════════════════
   6. NAV LISTENER — trigger renders on page switch
════════════════════════════════════════════════════════════ */
function onNavigate(page) {
  if (page === 'dashboard') {
    setTimeout(renderMonthlyROI, 50);
  }
  if (page === 'institutional-hub') {
    setTimeout(() => {
      renderRollingMetrics();
      renderAttributionTable();
      renderPerfReport();
    }, 80);
  }
}

// Hook into existing navigation event
document.addEventListener('tb:navigate', e => onNavigate(e.detail?.page));

// Patch switchHubTab to re-render attribution & perf report when those tabs open
const _origSwitch = window.switchHubTab;
window.switchHubTab = function(hub, panel, btn) {
  if (typeof _origSwitch === 'function') _origSwitch(hub, panel, btn);
  if (hub === 'institutional-hub') {
    setTimeout(() => {
      if (panel === 'attribution') { renderRollingMetrics(); renderAttributionTable(); }
      if (panel === 'perfReport') renderPerfReport();
    }, 60);
  }
};

/* ════════════════════════════════════════════════════════════
   INIT
════════════════════════════════════════════════════════════ */
function init() {
  loadCapitalSetting();
  patchSettingsSave();
  renderMonthlyROI();

  // If already on institutional hub on load
  const active = document.querySelector('.hub-panel.active[id^="institutional-hub-panel"]');
  if (active) {
    if (active.id.includes('attribution')) { renderRollingMetrics(); renderAttributionTable(); }
    if (active.id.includes('perfReport')) renderPerfReport();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Also re-render ROI whenever a trade is saved (listen for storage changes)
window.addEventListener('storage', e => {
  if (e.key === 'tradebook_trades') setTimeout(renderMonthlyROI, 100);
});

/* ════════════════════════════════════════════════════════════
   7. DATE-RANGE FILTERED EXPORTS
════════════════════════════════════════════════════════════ */
let _reportFilteredTrades = null; // null = use all trades

function getDateFilteredTrades(source) {
  const prefix = source === 'settings' ? 'settings' : 'report';
  const typeEl = G(prefix === 'settings' ? 'settings-export-type' : 'report-range-type');
  const type = typeEl ? typeEl.value : 'all';
  const trades = T();
  if (type === 'all') return trades;

  if (type === 'day') {
    const dayVal = G(prefix === 'settings' ? 'settings-day-input' : 'report-day-input')?.value;
    if (!dayVal) { if (window.toast) toast('Please select a date', 'error'); return null; }
    return trades.filter(t => t.date === dayVal);
  }
  if (type === 'month') {
    const monthVal = G(prefix === 'settings' ? 'settings-month-input' : 'report-month-input')?.value;
    if (!monthVal) { if (window.toast) toast('Please select a month', 'error'); return null; }
    return trades.filter(t => t.date && t.date.startsWith(monthVal));
  }
  if (type === 'range') {
    const fromEl = G(prefix === 'settings' ? 'settings-date-from' : 'report-date-from');
    const toEl   = G(prefix === 'settings' ? 'settings-date-to' : 'report-date-to');
    const from = fromEl?.value;
    const to   = toEl?.value;
    if (!from || !to) { if (window.toast) toast('Please select both from and to dates', 'error'); return null; }
    return trades.filter(t => t.date && t.date >= from && t.date <= to);
  }
  return trades;
}

/* Report range picker toggle */
window.toggleReportRangePicker = function() {
  const picker = G('report-range-picker');
  if (!picker) return;
  picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
};

window.updateReportRangeUI = function() {
  const type = G('report-range-type')?.value || 'all';
  ['report-range-day','report-range-month','report-range-dates'].forEach(id => {
    const el = G(id);
    if (el) el.style.display = 'none';
  });
  if (type === 'day')   { const el = G('report-range-day');   if (el) el.style.display = 'flex'; }
  if (type === 'month') { const el = G('report-range-month'); if (el) el.style.display = 'flex'; }
  if (type === 'range') { const el = G('report-range-dates'); if (el) el.style.display = 'flex'; }
};

window.updateSettingsExportUI = function() {
  const type = G('settings-export-type')?.value || 'all';
  ['settings-export-day','settings-export-month','settings-export-range'].forEach(id => {
    const el = G(id);
    if (el) el.style.display = 'none';
  });
  if (type === 'day')   { const el = G('settings-export-day');   if (el) el.style.display = 'block'; }
  if (type === 'month') { const el = G('settings-export-month'); if (el) el.style.display = 'block'; }
  if (type === 'range') { const el = G('settings-export-range'); if (el) el.style.display = 'flex'; }
};

window.applyReportRange = function() {
  const filtered = getDateFilteredTrades('report');
  if (filtered === null) return;
  _reportFilteredTrades = filtered;
  // Show info
  const info = G('report-range-info');
  const type = G('report-range-type')?.value || 'all';
  let rangeLabel = 'All Time';
  if (type === 'day') rangeLabel = G('report-day-input')?.value || '';
  if (type === 'month') {
    const mv = G('report-month-input')?.value || '';
    if (mv) { const [y,m] = mv.split('-'); rangeLabel = MONTH_NAMES[parseInt(m)-1] + ' ' + y; }
  }
  if (type === 'range') rangeLabel = (G('report-date-from')?.value || '') + ' → ' + (G('report-date-to')?.value || '');
  if (info) info.innerHTML = `<span style="color:var(--accent);font-weight:600">✓ Showing ${filtered.length} trades</span> · Range: ${rangeLabel}`;
  renderPerfReportWithTrades(filtered);
};

window.resetReportRange = function() {
  _reportFilteredTrades = null;
  const info = G('report-range-info');
  if (info) info.innerHTML = '';
  const typeEl = G('report-range-type');
  if (typeEl) typeEl.value = 'all';
  updateReportRangeUI();
  renderPerfReport();
};

/* Filtered PDF export (from settings page) */
window.exportPDFReportFiltered = function(source) {
  const filtered = getDateFilteredTrades(source);
  if (filtered === null) return;
  // Temporarily override T() for the report
  const origT = window._origTForExport;
  const bak = T;
  _reportFilteredTrades = filtered;
  renderPerfReportWithTrades(filtered);
  setTimeout(() => { exportPDFReport(); _reportFilteredTrades = null; }, 100);
};

/* Filtered CSV export */
window.exportCSVFiltered = function(source) {
  const filtered = getDateFilteredTrades(source);
  if (filtered === null) return;
  if (!filtered.length) { if (window.toast) toast('No trades in selected range', 'error'); return; }
  const headers = ['Date','Symbol','Direction','Qty','Entry','Exit','Gross','Tax','Net','Strategy','Emotion','Discipline','Notes'];
  const rows = filtered.map(t => [
    t.date||'', t.symbol||'', t.direction||'', t.qty||'', t.entry||'', t.exit||'',
    parseFloat(t.gross)||N(t), parseFloat(t.tax)||0, N(t),
    t.strategy||'', t.emotion||'', t.discipline||'', (t.notes||t.note||'').replace(/"/g,"'")
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const type = G(source === 'settings' ? 'settings-export-type' : 'report-range-type')?.value || 'all';
  let suffix = 'all';
  if (type === 'day') suffix = G(source === 'settings' ? 'settings-day-input' : 'report-day-input')?.value || 'day';
  if (type === 'month') suffix = G(source === 'settings' ? 'settings-month-input' : 'report-month-input')?.value || 'month';
  if (type === 'range') suffix = (G(source === 'settings' ? 'settings-date-from' : 'report-date-from')?.value || '') + '_to_' + (G(source === 'settings' ? 'settings-date-to' : 'report-date-to')?.value || '');
  a.download = `tradebook_${suffix}.csv`;
  a.click();
  if (window.toast) toast(`Exported ${filtered.length} trades as CSV`);
};

/* Render perf report with specific trade set */
function renderPerfReportWithTrades(trades) {
  const el = G('perf-report-container');
  if (!el) return;
  // Temporarily swap T() to return filtered trades
  const origT = window._fixesT || T;
  const savedT = T;
  // We can't easily swap T since it's a const, so we re-call renderPerfReport
  // with a localStorage override. Instead, we inline the data into the container.
  // The simplest approach: temporarily store filtered trades, patch T, render, restore.
  const backupKey = 'tradebook_trades';
  const backup = localStorage.getItem(backupKey);
  localStorage.setItem(backupKey, JSON.stringify(trades));
  renderPerfReport();
  localStorage.setItem(backupKey, backup);
}

// Expose for external calls
window.renderMonthlyROI    = window.renderMonthlyROI;
window.renderRollingMetrics = renderRollingMetrics;
window.renderPerfReport     = renderPerfReport;
window.toggleMonthlyCapitalEditor = window.toggleMonthlyCapitalEditor;
window.applyDefaultCapitalAll = window.applyDefaultCapitalAll;
window.saveMonthlyCapitals = window.saveMonthlyCapitals;
window.toggleReportRangePicker = window.toggleReportRangePicker;
window.updateReportRangeUI = window.updateReportRangeUI;
window.updateSettingsExportUI = window.updateSettingsExportUI;
window.applyReportRange = window.applyReportRange;
window.resetReportRange = window.resetReportRange;
window.exportPDFReportFiltered = window.exportPDFReportFiltered;
window.exportCSVFiltered = window.exportCSVFiltered;

})();
