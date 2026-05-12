/* ═══════════════════════════════════════════════════════════
   TRADEBOOK PRO — HUB UPGRADES
   Analytics Hub: 4 new tabs + enhanced Overview
   Psychology Hub: 3 new tabs + enhanced Psych Lab
   ═══════════════════════════════════════════════════════════ */
'use strict';

(function () {

/* ── helpers ─────────────────────────────────────────────── */
const G = id => document.getElementById(id);
const N = t => parseFloat(t.net) || 0;
const T = () => { try { return JSON.parse(localStorage.getItem('tradebook_trades') || '[]'); } catch { return []; } };
function mean(a) { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0; }
function stdDev(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
}
const fmt = v => { const a = Math.abs(v); return (v < 0 ? '-' : '') + '₹' + (a >= 1e5 ? (a / 1e5).toFixed(1) + 'L' : a >= 1000 ? (a / 1000).toFixed(1) + 'K' : a.toFixed(0)); };
const fmtS = v => (v >= 0 ? '+' : '') + fmt(v);
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const GRID = { color: 'rgba(255,255,255,0.04)' };
const TICK = { color: '#3d4a63', font: { size: 10, family: 'JetBrains Mono' } };
const LEGEND = { labels: { color: '#7b88a8', font: { size: 11 }, boxWidth: 10 } };
const REG_COLORS = { 'Trending Up': '#00ffa3', 'Trending Down': '#ff4466', 'Range Bound': '#06d6f5', 'High Volatility': '#ffd166', 'Low Volatility': '#b388ff', 'Breakout': '#ff9f43', 'Pre-Expiry': '#ff6bcd', 'Event Day': '#26de81' };
const EMO_ICONS = { Calm: '😌', Confident: '💪', Anxious: '😰', Greedy: '🤑', FOMO: '😱', Disciplined: '🎯', Focused: '🎯', Scared: '😨', Revenge: '😤', Frustrated: '😤', Tired: '😴', Overconfident: '🔥' };

let _charts = {};
function mk(id, cfg) {
  if (!window.Chart) return;
  const c = G(id); if (!c) return;
  if (_charts[id]) { try { _charts[id].destroy(); } catch {} }
  _charts[id] = new Chart(c.getContext('2d'), cfg);
}

function card(id, body) {
  const el = G(id);
  if (el) el.innerHTML = body;
}

function badge(t, bg, col) {
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;background:${bg};color:${col}">${t}</span>`;
}

function statBox(label, value, color, sub = '') {
  return `<div style="background:var(--bg4);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px">
    <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">${label}</div>
    <div style="font-family:var(--font-mono);font-size:18px;font-weight:700;color:${color}">${value}</div>
    ${sub ? `<div style="font-size:10px;color:var(--text3);margin-top:3px">${sub}</div>` : ''}
  </div>`;
}

function emptyMsg(msg) {
  return `<p style="color:var(--text3);font-size:13px;padding:12px 0">${msg}</p>`;
}

/* ════════════════════════════════════════════════════════════
   ANALYTICS HUB — OVERVIEW ENHANCEMENTS
════════════════════════════════════════════════════════════ */
function renderWrTrend(trades) {
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 5) return;
  const win = 10;
  const points = [];
  for (let i = win - 1; i < sorted.length; i++) {
    const slice = sorted.slice(i - win + 1, i + 1);
    points.push(slice.filter(t => N(t) > 0).length / win * 100);
  }
  const labels = sorted.slice(win - 1).map((t, i) => `T${i + win}`);
  mk('wrTrendChart', {
    type: 'line',
    data: {
      labels,
      datasets: [
        { data: points, borderColor: '#00ffa3', backgroundColor: 'rgba(0,255,163,0.08)', borderWidth: 2, pointRadius: 0, tension: 0.35, fill: true },
        { data: Array(points.length).fill(55), borderColor: 'rgba(0,255,163,0.3)', borderDash: [4, 4], borderWidth: 1, pointRadius: 0, fill: false },
        { data: Array(points.length).fill(40), borderColor: 'rgba(255,68,102,0.3)', borderDash: [4, 4], borderWidth: 1, pointRadius: 0, fill: false },
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => c.parsed.y.toFixed(1) + '% WR' } } }, scales: { x: { grid: GRID, ticks: { ...TICK, maxTicksLimit: 8 } }, y: { grid: GRID, ticks: { ...TICK, callback: v => v + '%' }, min: 0, max: 100 } } }
  });
}

function renderPfTrend(trades) {
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 10) return;
  const win = 20;
  const points = [];
  for (let i = win - 1; i < sorted.length; i++) {
    const slice = sorted.slice(i - win + 1, i + 1);
    const gw = slice.filter(t => N(t) > 0).reduce((s, t) => s + N(t), 0);
    const gl = Math.abs(slice.filter(t => N(t) < 0).reduce((s, t) => s + N(t), 0));
    points.push(gl > 0 ? parseFloat((gw / gl).toFixed(2)) : 0);
  }
  const labels = sorted.slice(win - 1).map((t, i) => `T${i + win}`);
  mk('pfTrendChart', {
    type: 'line',
    data: {
      labels,
      datasets: [
        { data: points, borderColor: '#ffd166', backgroundColor: 'rgba(255,209,102,0.08)', borderWidth: 2, pointRadius: 0, tension: 0.35, fill: true },
        { data: Array(points.length).fill(2), borderColor: 'rgba(0,255,163,0.4)', borderDash: [5, 5], borderWidth: 1.5, pointRadius: 0, fill: false },
        { data: Array(points.length).fill(1), borderColor: 'rgba(255,68,102,0.4)', borderDash: [5, 5], borderWidth: 1.5, pointRadius: 0, fill: false },
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => 'PF: ' + c.parsed.y.toFixed(2) } } }, scales: { x: { grid: GRID, ticks: { ...TICK, maxTicksLimit: 8 } }, y: { grid: GRID, ticks: TICK, min: 0 } } }
  });
}

function renderTimeframeChart(trades) {
  const tfs = {};
  trades.filter(t => t.timeframe).forEach(t => {
    if (!tfs[t.timeframe]) tfs[t.timeframe] = { pnl: 0, count: 0, wins: 0 };
    tfs[t.timeframe].pnl += N(t); tfs[t.timeframe].count++; if (N(t) > 0) tfs[t.timeframe].wins++;
  });
  const entries = Object.entries(tfs).filter(([, v]) => v.count >= 1);
  if (!entries.length) return;
  const labels = entries.map(e => e[0]);
  const pnlData = entries.map(e => e[1].pnl);
  const wrData = entries.map(e => e[1].count ? e[1].wins / e[1].count * 100 : 0);
  mk('timeframeChart', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Total P&L', data: pnlData, backgroundColor: pnlData.map(v => v >= 0 ? 'rgba(0,255,163,0.6)' : 'rgba(255,68,102,0.6)'), borderRadius: 4, yAxisID: 'y' },
        { label: 'Win Rate', data: wrData, type: 'line', borderColor: '#06d6f5', borderWidth: 2, pointRadius: 4, tension: 0.3, yAxisID: 'y2', fill: false }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: LEGEND }, scales: { x: { grid: GRID, ticks: TICK }, y: { grid: GRID, ticks: { ...TICK, callback: v => fmt(v) } }, y2: { position: 'right', grid: { display: false }, ticks: { ...TICK, callback: v => v.toFixed(0) + '%' } } } }
  });
}

function renderSetupGradeChart(trades) {
  const grades = ['A+', 'A', 'B', 'C', 'D'];
  const data = grades.map(g => {
    const gt = trades.filter(t => t.setupGrade === g);
    if (!gt.length) return null;
    return { count: gt.length, pnl: gt.reduce((s, t) => s + N(t), 0), avg: mean(gt.map(N)), wr: gt.filter(t => N(t) > 0).length / gt.length * 100 };
  });
  const valid = grades.filter((_, i) => data[i]);
  const validData = data.filter(Boolean);
  if (!valid.length) return;
  mk('setupGradeChart', {
    type: 'bar',
    data: {
      labels: valid,
      datasets: [
        { label: 'Avg P&L', data: validData.map(d => d.avg), backgroundColor: validData.map(d => d.avg >= 0 ? 'rgba(0,255,163,0.6)' : 'rgba(255,68,102,0.6)'), borderRadius: 4, yAxisID: 'y' },
        { label: 'Win Rate %', data: validData.map(d => d.wr), type: 'line', borderColor: '#ffd166', borderWidth: 2, pointRadius: 5, yAxisID: 'y2', fill: false }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: LEGEND }, scales: { x: { grid: GRID, ticks: TICK }, y: { grid: GRID, ticks: { ...TICK, callback: v => fmt(v) } }, y2: { position: 'right', grid: { display: false }, ticks: { ...TICK, callback: v => v.toFixed(0) + '%' } } } }
  });
}

function renderHourHeatmap(trades) {
  const c = G('hour-heatmap-container'); if (!c) return;
  const slots = {};
  for (let h = 9; h <= 15; h++) for (let m = 0; m < 60; m += 15) {
    if (h === 9 && m < 15) continue; if (h === 15 && m > 30) break;
    slots[`${h}:${String(m).padStart(2, '0')}`] = { pnl: 0, count: 0, wins: 0 };
  }
  trades.filter(t => t.entryTime).forEach(t => {
    const [h, m] = (t.entryTime || '').split(':').map(Number);
    if (isNaN(h)) return;
    const b = Math.floor(m / 15) * 15;
    const k = `${h}:${String(b).padStart(2, '0')}`;
    if (slots[k]) { slots[k].pnl += N(t); slots[k].count++; if (N(t) > 0) slots[k].wins++; }
  });
  const keys = Object.keys(slots);
  const maxAbs = Math.max(...keys.map(k => Math.abs(slots[k].pnl)), 1);
  const hasTrades = keys.some(k => slots[k].count > 0);
  if (!hasTrades) { c.innerHTML = emptyMsg('Log trades with Entry Time to see your golden hours.'); return; }
  c.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px">
    ${keys.map(k => {
      const { pnl, count, wins } = slots[k];
      const i = count ? Math.abs(pnl) / maxAbs : 0;
      const bg = count === 0 ? 'var(--bg5)' : pnl > 0 ? `rgba(0,255,163,${0.12 + i * 0.65})` : `rgba(255,68,102,${0.12 + i * 0.65})`;
      const wr = count ? Math.round(wins / count * 100) : 0;
      return `<div title="${k} — ${count} trades · ${count ? fmtS(pnl) : 'No data'} · ${wr}% WR" style="background:${bg};border:1px solid var(--border);border-radius:6px;padding:6px 10px;min-width:68px;cursor:default">
        <div style="font-size:9px;font-weight:700;color:var(--text3);font-family:var(--font-mono)">${k}</div>
        <div style="font-size:11px;font-weight:800;color:${pnl > 0 ? 'var(--green)' : pnl < 0 ? 'var(--red)' : 'var(--text3)'};font-family:var(--font-mono)">${count ? fmtS(pnl) : '—'}</div>
        <div style="font-size:9px;color:var(--text3)">${count ? count + 'T' : ''}</div>
      </div>`;
    }).join('')}
  </div>
  <div style="display:flex;gap:12px;font-size:10px;color:var(--text3)">
    <span>🟢 Profitable slot</span><span>🔴 Loss slot</span><span style="background:var(--bg5);border-radius:2px;width:10px;height:10px;display:inline-block;vertical-align:middle"></span><span>No trades</span>
  </div>`;
}

function renderAccountCompare(trades) {
  const c = G('account-compare-container'); if (!c) return;
  const accounts = [...new Set(trades.map(t => t.account).filter(Boolean))];
  if (accounts.length < 2) { c.innerHTML = emptyMsg('Log trades with Account field filled to compare accounts.'); return; }
  c.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px">
    ${accounts.map(acc => {
      const at = trades.filter(t => t.account === acc);
      const pnl = at.reduce((s, t) => s + N(t), 0);
      const wins = at.filter(t => N(t) > 0).length;
      const wr = at.length ? wins / at.length * 100 : 0;
      const dRets = {}; at.forEach(t => { dRets[t.date] = (dRets[t.date] || 0) + N(t); });
      const dr = Object.values(dRets); const dStd = stdDev(dr); const dMean = mean(dr);
      const sharpe = dStd > 0 ? (dMean / dStd * Math.sqrt(252)).toFixed(2) : '—';
      return `<div style="background:var(--bg4);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px">
        <div style="font-size:13px;font-weight:700;margin-bottom:8px">${acc}</div>
        <div style="font-family:var(--font-mono);font-size:20px;font-weight:800;color:${pnl >= 0 ? 'var(--green)' : 'var(--red)'};">${fmtS(pnl)}</div>
        <div style="font-size:11px;color:var(--text2);margin-top:4px">${at.length} trades · ${wr.toFixed(0)}% WR</div>
        <div style="font-size:11px;color:var(--text3)">Sharpe: ${sharpe}</div>
      </div>`;
    }).join('')}
  </div>`;
}

/* ════════════════════════════════════════════════════════════
   ANALYTICS HUB — PATTERNS TAB
════════════════════════════════════════════════════════════ */
function renderMaeMfeChart(trades) {
  const valid = trades.filter(t => t.mae && t.mfe);
  if (valid.length < 3) { const c = G('maeMfeChart'); if (c) { const p = c.parentElement; p.innerHTML = emptyMsg('Log trades with MAE/MFE data for this chart.') + '<canvas id="maeMfeChart" style="display:none"></canvas>'; } return; }
  mk('maeMfeChart', {
    type: 'scatter',
    data: { datasets: [
      { label: 'Wins', data: valid.filter(t => N(t) > 0).map(t => ({ x: Math.abs(parseFloat(t.mae)), y: parseFloat(t.mfe), r: 6 })), backgroundColor: 'rgba(0,255,163,0.6)', borderColor: '#00ffa3', borderWidth: 1 },
      { label: 'Losses', data: valid.filter(t => N(t) < 0).map(t => ({ x: Math.abs(parseFloat(t.mae)), y: parseFloat(t.mfe), r: 6 })), backgroundColor: 'rgba(255,68,102,0.5)', borderColor: '#ff4466', borderWidth: 1 },
    ]},
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: LEGEND, tooltip: { callbacks: { label: ctx => `MAE: ${fmt(ctx.parsed.x)} | MFE: ${fmt(ctx.parsed.y)}` } } }, scales: { x: { grid: GRID, ticks: { ...TICK, callback: v => fmt(v) }, title: { display: true, text: 'Max Adverse Excursion (₹)', color: '#3d4a63' } }, y: { grid: GRID, ticks: { ...TICK, callback: v => fmt(v) }, title: { display: true, text: 'Max Favourable Excursion (₹)', color: '#3d4a63' } } } }
  });
}

function renderEntryQualityChart(trades) {
  const valid = trades.filter(t => t.execution && N(t) !== 0);
  if (valid.length < 3) return;
  mk('entryQualityChart', {
    type: 'scatter',
    data: { datasets: [
      { label: 'Wins', data: valid.filter(t => N(t) > 0).map(t => ({ x: t.execution, y: N(t) })), backgroundColor: 'rgba(0,255,163,0.5)', borderWidth: 0, pointRadius: 5 },
      { label: 'Losses', data: valid.filter(t => N(t) < 0).map(t => ({ x: t.execution, y: N(t) })), backgroundColor: 'rgba(255,68,102,0.5)', borderWidth: 0, pointRadius: 5 },
    ]},
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: LEGEND, tooltip: { callbacks: { label: ctx => `Quality: ${ctx.parsed.x}/10 · P&L: ${fmtS(ctx.parsed.y)}` } } }, scales: { x: { grid: GRID, ticks: TICK, min: 0, max: 10, title: { display: true, text: 'Entry Quality Score (1-10)', color: '#3d4a63' } }, y: { grid: GRID, ticks: { ...TICK, callback: v => fmt(v) } } } }
  });
}

function renderRevengeDeeep(trades) {
  const c = G('revenge-deep-container'); if (!c) return;
  const revenges = trades.filter(t => t.isRevenge === true || t.isRevenge === 'true');
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  let autoRevenge = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].date === sorted[i-1].date && N(sorted[i-1]) < 0) autoRevenge++;
  }
  const totalRevenge = Math.max(revenges.length, autoRevenge);
  const revCost = revenges.reduce((s, t) => s + Math.min(0, N(t)), 0);
  const revWR = revenges.length ? revenges.filter(t => N(t) > 0).length / revenges.length * 100 : 0;
  const allWR = trades.length ? trades.filter(t => N(t) > 0).length / trades.length * 100 : 0;
  c.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-bottom:14px">
    ${statBox('Revenge Trades', totalRevenge, totalRevenge > 5 ? 'var(--red)' : 'var(--gold)')}
    ${statBox('Total Cost', fmt(Math.abs(revCost)), 'var(--red)', 'From flagged revenge trades')}
    ${statBox('Revenge WR', revWR.toFixed(0) + '%', revWR < allWR ? 'var(--red)' : 'var(--green)', `vs overall ${allWR.toFixed(0)}%`)}
    ${statBox('WR Drop', ((allWR - revWR)).toFixed(1) + 'pp', revWR < allWR ? 'var(--red)' : 'var(--green)', 'Win rate penalty')}
  </div>
  ${totalRevenge > 3 ? `<div style="padding:10px 14px;background:rgba(255,68,102,0.08);border:1px solid rgba(255,68,102,0.3);border-radius:var(--radius-sm);font-size:12px;color:var(--red)">
    ⚠️ Revenge trading costs you real money. Implement a 30-minute cooling-off rule after any loss over ${fmt(Math.abs(revCost)/Math.max(1,totalRevenge))}.
  </div>` : '<div style="font-size:12px;color:var(--green)">✅ Minimal revenge trading detected. Keep it up.</div>'}`;
}

function renderConfluence(trades) {
  const c = G('confluence-container'); if (!c) return;
  const withInd = trades.filter(t => t.indicators);
  if (!withInd.length) { c.innerHTML = emptyMsg('Log trades with Indicators filled to see confluence analysis.'); return; }
  const byCnt = {};
  withInd.forEach(t => {
    const cnt = Math.min(5, t.indicators.split(',').filter(Boolean).length);
    if (!byCnt[cnt]) byCnt[cnt] = { pnl: 0, count: 0, wins: 0 };
    byCnt[cnt].pnl += N(t); byCnt[cnt].count++; if (N(t) > 0) byCnt[cnt].wins++;
  });
  const bestCnt = Object.entries(byCnt).sort((a, b) => b[1].pnl / b[1].count - a[1].pnl / a[1].count)[0];
  c.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;margin-bottom:10px">
    ${Object.entries(byCnt).sort((a, b) => parseInt(a[0]) - parseInt(b[0])).map(([cnt, d]) => {
      const avg = d.pnl / d.count;
      const wr = d.wins / d.count * 100;
      return `<div style="background:var(--bg4);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px;text-align:center">
        <div style="font-size:10px;color:var(--text3);margin-bottom:4px">${cnt} indicator${cnt > 1 ? 's' : ''}</div>
        <div style="font-family:var(--font-mono);font-size:16px;font-weight:700;color:${avg >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtS(avg)}</div>
        <div style="font-size:10px;color:var(--text2)">${d.count} trades · ${wr.toFixed(0)}%WR</div>
      </div>`;
    }).join('')}
  </div>
  ${bestCnt ? `<div style="font-size:12px;color:var(--text2);padding:8px 12px;background:var(--bg4);border-radius:var(--radius-sm)">💡 Best confluence: <strong style="color:var(--accent)">${bestCnt[0]} indicator${bestCnt[0] > 1 ? 's' : ''}</strong> — avg ${fmtS(bestCnt[1].pnl / bestCnt[1].count)} per trade</div>` : ''}`;
}

function renderSlippageReport(trades) {
  const c = G('slippage-report-container'); if (!c) return;
  const totalSlip = trades.reduce((s, t) => s + (parseFloat(t.slippage) || 0), 0);
  const totalBrok = trades.reduce((s, t) => s + (parseFloat(t.brokerage) || 0), 0);
  const totalSTT = trades.reduce((s, t) => s + (parseFloat(t.stt) || 0), 0);
  const totalCharges = trades.reduce((s, t) => s + (parseFloat(t.tax) || 0), 0);
  const netPnl = trades.reduce((s, t) => s + N(t), 0);
  const grossPnl = trades.reduce((s, t) => s + (parseFloat(t.gross) || N(t)), 0);
  if (!totalCharges) { c.innerHTML = emptyMsg('Log trades with charges breakdown for slippage analysis.'); return; }
  c.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px">
    ${statBox('Gross P&L', fmtS(grossPnl), grossPnl >= 0 ? 'var(--green)' : 'var(--red)')}
    ${statBox('Total Charges', '-' + fmt(totalCharges), 'var(--red)', 'All taxes & fees')}
    ${statBox('Brokerage', '-' + fmt(totalBrok), 'var(--orange)')}
    ${statBox('STT', '-' + fmt(totalSTT), 'var(--red)')}
    ${statBox('Slippage', '-' + fmt(totalSlip), 'var(--gold)')}
    ${statBox('Charge Drag', totalCharges && grossPnl ? (totalCharges / Math.abs(grossPnl) * 100).toFixed(1) + '%' : '—', 'var(--purple)', '% of gross eaten')}
    ${statBox('Per Trade Avg', '-' + fmt(totalCharges / Math.max(1, trades.length)), 'var(--text2)', 'Avg cost per trade')}
    ${statBox('Without Charges', fmtS(grossPnl), 'var(--blue)', 'Your gross potential')}
  </div>`;
}

/* ════════════════════════════════════════════════════════════
   ANALYTICS HUB — TIME & PRICE TAB
════════════════════════════════════════════════════════════ */
function renderDurationScatter(trades) {
  const valid = trades.filter(t => t.entryTime && t.exitTime);
  if (valid.length < 3) { const c = G('durationScatter'); if (c) c.closest('.chart-card').querySelector('.chart-sub').textContent = 'Log trades with Entry Time + Exit Time to see this chart.'; return; }
  const data = valid.map(t => {
    const [eh, em] = t.entryTime.split(':').map(Number);
    const [xh, xm] = t.exitTime.split(':').map(Number);
    const mins = (xh * 60 + xm) - (eh * 60 + em);
    return { x: Math.max(0, mins), y: N(t), win: N(t) > 0 };
  });
  mk('durationScatter', {
    type: 'scatter',
    data: { datasets: [
      { label: 'Wins', data: data.filter(d => d.win).map(d => ({ x: d.x, y: d.y })), backgroundColor: 'rgba(0,255,163,0.5)', pointRadius: 5 },
      { label: 'Losses', data: data.filter(d => !d.win).map(d => ({ x: d.x, y: d.y })), backgroundColor: 'rgba(255,68,102,0.5)', pointRadius: 5 },
    ]},
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: LEGEND, tooltip: { callbacks: { label: ctx => `${ctx.parsed.x}min · ${fmtS(ctx.parsed.y)}` } } }, scales: { x: { grid: GRID, ticks: { ...TICK, callback: v => v + 'm' }, title: { display: true, text: 'Hold Time (minutes)', color: '#3d4a63' } }, y: { grid: GRID, ticks: { ...TICK, callback: v => fmt(v) } } } }
  });
}

function renderEntryTimeWr(trades) {
  const byHour = {};
  trades.filter(t => t.entryTime).forEach(t => {
    const h = parseInt((t.entryTime || '').split(':')[0]);
    if (!isNaN(h)) { if (!byHour[h]) byHour[h] = { count: 0, wins: 0 }; byHour[h].count++; if (N(t) > 0) byHour[h].wins++; }
  });
  const entries = Object.entries(byHour).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
  if (!entries.length) return;
  mk('entryTimeWrChart', {
    type: 'bar',
    data: { labels: entries.map(([h]) => h + ':00'), datasets: [{ data: entries.map(([, v]) => v.count ? v.wins / v.count * 100 : 0), backgroundColor: entries.map(([, v]) => { const wr = v.count ? v.wins / v.count : 0.5; return wr > 0.55 ? 'rgba(0,255,163,0.7)' : wr > 0.4 ? 'rgba(255,209,102,0.7)' : 'rgba(255,68,102,0.7)'; }), borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ctx.parsed.y.toFixed(1) + '% WR (' + entries[ctx.dataIndex][1].count + ' trades)' } } }, scales: { x: { grid: GRID, ticks: TICK }, y: { grid: GRID, ticks: { ...TICK, callback: v => v + '%' }, min: 0, max: 100 } } }
  });
}

function renderCapitalEfficiency(trades) {
  const valid = trades.filter(t => t.capitalDeployed && parseFloat(t.capitalDeployed) > 0).slice(-20);
  if (!valid.length) { const c = G('capitalEffChart'); if (c) c.closest('.chart-card').querySelector('.chart-sub').textContent = 'Log trades with Capital Deployed for this analysis.'; return; }
  const data = valid.map(t => ({ label: t.symbol + ' ' + t.date?.slice(5), eff: N(t) / parseFloat(t.capitalDeployed) * 100, pnl: N(t) }));
  data.sort((a, b) => b.eff - a.eff);
  mk('capitalEffChart', {
    type: 'bar',
    data: { labels: data.map(d => d.label), datasets: [{ data: data.map(d => parseFloat(d.eff.toFixed(2))), backgroundColor: data.map(d => d.eff >= 0 ? 'rgba(0,255,163,0.6)' : 'rgba(255,68,102,0.6)'), borderRadius: 3 }] },
    options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ctx.parsed.x.toFixed(2) + '% return · ' + fmtS(data[ctx.dataIndex].pnl) } } }, scales: { y: { grid: GRID, ticks: { ...TICK, font: { size: 9 } } }, x: { grid: GRID, ticks: { ...TICK, callback: v => v + '%' } } } }
  });
}

window.renderSymbolDive = function () {
  const sel = G('symbol-dive-select'); if (!sel) return;
  const symbol = sel.value; if (!symbol) return;
  const c = G('symbol-dive-container'); if (!c) return;
  const trades = T().filter(t => (t.symbol || '').toUpperCase() === symbol.toUpperCase());
  if (!trades.length) { c.innerHTML = emptyMsg('No trades for ' + symbol); return; }
  const total = trades.reduce((s, t) => s + N(t), 0);
  const wins = trades.filter(t => N(t) > 0);
  const losses = trades.filter(t => N(t) < 0);
  const wr = trades.length ? wins.length / trades.length * 100 : 0;
  const avgW = wins.length ? mean(wins.map(N)) : 0;
  const avgL = losses.length ? mean(losses.map(t => Math.abs(N(t)))) : 0;
  const pf = avgL > 0 ? (avgW * (wr / 100)) / (avgL * (1 - wr / 100)) : 0;
  const sorted = [...trades].sort((a, b) => N(b) - N(a));
  c.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-bottom:16px">
    ${statBox('Net P&L', fmtS(total), total >= 0 ? 'var(--green)' : 'var(--red)')}
    ${statBox('Win Rate', wr.toFixed(1) + '%', wr >= 55 ? 'var(--green)' : wr >= 40 ? 'var(--gold)' : 'var(--red)')}
    ${statBox('Profit Factor', pf ? pf.toFixed(2) : '—', pf >= 2 ? 'var(--green)' : pf >= 1 ? 'var(--gold)' : 'var(--red)')}
    ${statBox('Avg Win', fmtS(avgW), 'var(--green)')}
    ${statBox('Avg Loss', '-' + fmt(avgL), 'var(--red)')}
    ${statBox('Trades', trades.length, 'var(--blue)')}
  </div>
  <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead><tr style="color:var(--text3);border-bottom:1px solid var(--border)">${['Date','Dir','Entry','Exit','Net P&L','Strategy','Grade'].map(h => `<th style="padding:6px 10px;text-align:left">${h}</th>`).join('')}</tr></thead>
    <tbody>${sorted.slice(0, 15).map(t => `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:6px 10px;color:var(--text2)">${t.date}</td>
      <td style="padding:6px 10px;color:${t.direction === 'Long' ? 'var(--green)' : 'var(--red)'}">${t.direction || '—'}</td>
      <td style="padding:6px 10px;font-family:var(--font-mono)">₹${Number(t.entry || 0).toFixed(2)}</td>
      <td style="padding:6px 10px;font-family:var(--font-mono)">₹${Number(t.exit || 0).toFixed(2)}</td>
      <td style="padding:6px 10px;font-family:var(--font-mono);color:${N(t) >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtS(N(t))}</td>
      <td style="padding:6px 10px;color:var(--text2)">${t.strategy || '—'}</td>
      <td style="padding:6px 10px">${t.setupGrade || '—'}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
};

/* ════════════════════════════════════════════════════════════
   ANALYTICS HUB — REGIMES TAB
════════════════════════════════════════════════════════════ */
function renderRegimeMatrix(trades) {
  const c = G('regime-matrix-container'); if (!c) return;
  const regimes = [...new Set(trades.map(t => t.regime).filter(Boolean))];
  if (!regimes.length) { c.innerHTML = emptyMsg('Tag trades with Market Regime for this analysis.'); return; }
  const rows = regimes.map(r => {
    const rt = trades.filter(t => t.regime === r);
    const pnl = rt.reduce((s, t) => s + N(t), 0);
    const wins = rt.filter(t => N(t) > 0).length;
    const wr = rt.length ? wins / rt.length * 100 : 0;
    const dRets = {}; rt.forEach(t => { dRets[t.date] = (dRets[t.date] || 0) + N(t); });
    const dr = Object.values(dRets); const dStd = stdDev(dr); const dMean = mean(dr);
    const sharpe = dStd > 0 ? (dMean / dStd * Math.sqrt(252)).toFixed(2) : '—';
    // Best strategy in this regime
    const byS = {}; rt.forEach(t => { if (t.strategy) { if (!byS[t.strategy]) byS[t.strategy] = { pnl: 0, count: 0 }; byS[t.strategy].pnl += N(t); byS[t.strategy].count++; } });
    const bestS = Object.entries(byS).sort((a, b) => b[1].pnl - a[1].pnl)[0];
    return { r, pnl, wr, sharpe, count: rt.length, bestS: bestS ? bestS[0] : '—' };
  }).sort((a, b) => b.pnl - a.pnl);

  c.innerHTML = `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead><tr style="color:var(--text3);border-bottom:1px solid var(--border)">${['Regime','Trades','Net P&L','Win Rate','Sharpe','Best Strategy','Verdict'].map(h => `<th style="padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase">${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(row => `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:8px 12px;font-weight:600;display:flex;align-items:center;gap:6px">
        <span style="width:8px;height:8px;border-radius:50%;background:${REG_COLORS[row.r] || 'var(--text3)'};flex-shrink:0;display:inline-block"></span>${row.r}
      </td>
      <td style="padding:8px 12px;color:var(--text2)">${row.count}</td>
      <td style="padding:8px 12px;font-family:var(--font-mono);color:${row.pnl >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtS(row.pnl)}</td>
      <td style="padding:8px 12px;color:${row.wr >= 55 ? 'var(--green)' : row.wr >= 40 ? 'var(--gold)' : 'var(--red)'}">${row.wr.toFixed(1)}%</td>
      <td style="padding:8px 12px;font-family:var(--font-mono);color:${parseFloat(row.sharpe) >= 1 ? 'var(--green)' : 'var(--text2)'}">${row.sharpe}</td>
      <td style="padding:8px 12px;color:var(--accent)">${row.bestS}</td>
      <td style="padding:8px 12px">${row.pnl > 0 && row.wr >= 50 ? badge('IDEAL', '#000', '#00ffa3') : row.pnl > 0 ? badge('GOOD', '#000', '#06d6f5') : badge('AVOID', '#fff3', 'rgba(255,68,102,.6)')}</td>
    </tr>`).join('')}
    </tbody>
  </table></div>`;
}

function renderRegimeWrRadar(trades) {
  const regimes = ['Trending Up', 'Trending Down', 'Range Bound', 'High Volatility', 'Low Volatility', 'Breakout'];
  const data = regimes.map(r => {
    const rt = trades.filter(t => t.regime === r);
    return rt.length ? rt.filter(t => N(t) > 0).length / rt.length * 100 : 0;
  });
  mk('regime-wr-radar', {
    type: 'radar',
    data: { labels: regimes.map(r => r.split(' ')[0]), datasets: [{ label: 'Win Rate %', data, backgroundColor: 'rgba(0,255,163,0.1)', borderColor: '#00ffa3', borderWidth: 2, pointBackgroundColor: '#00ffa3' }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { r: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: 'var(--text3)', font: { size: 9 } }, pointLabels: { color: 'var(--text2)', font: { size: 11 } }, min: 0, max: 100 } } }
  });
}

function renderStratRegimeHeatmap(trades) {
  const c = G('strat-regime-heatmap'); if (!c) return;
  const strategies = [...new Set(trades.map(t => t.strategy).filter(Boolean))].slice(0, 6);
  const regimes = [...new Set(trades.map(t => t.regime).filter(Boolean))].slice(0, 6);
  if (!strategies.length || !regimes.length) { c.innerHTML = emptyMsg('Need both Strategy and Regime data for this heatmap.'); return; }
  const grid = {};
  trades.forEach(t => { const k = `${t.strategy}|${t.regime}`; grid[k] = (grid[k] || 0) + N(t); });
  const maxAbs = Math.max(...Object.values(grid).map(Math.abs), 1);
  c.innerHTML = `<div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:11px;width:100%">
    <thead><tr><th></th>${regimes.map(r => `<th style="padding:5px 8px;color:var(--text3);text-align:center;white-space:nowrap;font-size:10px">${r.split(' ')[0]}</th>`).join('')}</tr></thead>
    <tbody>${strategies.map(s => `<tr>${[`<td style="padding:5px 10px;color:var(--text2);white-space:nowrap;font-weight:600">${s}</td>`, ...regimes.map(r => { const v = grid[`${s}|${r}`] || 0; const i = Math.abs(v) / maxAbs; const bg = v > 0 ? `rgba(0,255,163,${0.1 + i * 0.55})` : v < 0 ? `rgba(255,68,102,${0.1 + i * 0.55})` : 'transparent'; return `<td style="padding:5px 8px;background:${bg};border-radius:4px;text-align:center;font-family:var(--font-mono);color:${v >= 0 ? 'var(--green)' : 'var(--red)'}">${v ? fmtS(v) : '—'}</td>`; })].join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}

function renderRegimeTimeline(trades) {
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 3) return;
  let eq = 0;
  const points = sorted.map(t => { eq += N(t); return eq; });
  const colors = sorted.map(t => REG_COLORS[t.regime] || '#7b88a8');
  mk('regime-timeline-chart', {
    type: 'line',
    data: { labels: sorted.map(t => t.date), datasets: [{ data: points, borderColor: '#00ffa3', backgroundColor: 'rgba(0,255,163,0.06)', borderWidth: 2, pointRadius: 5, pointBackgroundColor: colors, fill: true, tension: 0.35 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${fmtS(ctx.parsed.y)} · ${sorted[ctx.dataIndex]?.regime || 'No regime'}` } } }, scales: { x: { grid: GRID, ticks: { ...TICK, maxTicksLimit: 10 } }, y: { grid: GRID, ticks: { ...TICK, callback: v => fmt(v) } } } }
  });
}

/* ════════════════════════════════════════════════════════════
   ANALYTICS HUB — PROBABILITY TAB
════════════════════════════════════════════════════════════ */
function renderProbabilityDashboard(trades) {
  const c = G('probability-dashboard'); if (!c) return;
  if (!trades.length) { c.innerHTML = emptyMsg('No trades yet.'); return; }
  const wins = trades.filter(t => N(t) > 0);
  const wr = trades.length ? wins.length / trades.length : 0;
  const avgW = wins.length ? mean(wins.map(N)) : 0;
  const losses = trades.filter(t => N(t) < 0);
  const avgL = losses.length ? mean(losses.map(t => Math.abs(N(t)))) : 0;
  const expectancy = wr * avgW - (1 - wr) * avgL;
  const prob = n => (Math.pow(1 - wr, n) * 100).toFixed(1);
  const capital = parseFloat((window.getSettings || function(){try{return JSON.parse(localStorage.getItem('tradebook_settings')||'{}');}catch{return{};}}())().capital) || 100000;
  c.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-bottom:16px">
    ${statBox('P(next win)', (wr * 100).toFixed(1) + '%', wr >= 0.55 ? 'var(--green)' : wr >= 0.4 ? 'var(--gold)' : 'var(--red)', 'Based on your WR')}
    ${statBox('P(2 in a row)', (wr ** 2 * 100).toFixed(1) + '%', 'var(--blue)')}
    ${statBox('P(3 losses)', prob(3) + '%', parseFloat(prob(3)) < 15 ? 'var(--green)' : parseFloat(prob(3)) < 30 ? 'var(--gold)' : 'var(--red)', 'Consecutive loss risk')}
    ${statBox('P(5 losses)', prob(5) + '%', parseFloat(prob(5)) < 5 ? 'var(--green)' : 'var(--red)')}
    ${statBox('Expectancy', fmtS(expectancy), expectancy >= 0 ? 'var(--green)' : 'var(--red)', 'Avg edge per trade')}
    ${statBox('Trades to 10K', expectancy > 0 ? Math.ceil(10000 / expectancy) + '' : '∞', 'var(--purple)', 'At current edge')}
  </div>`;
}

function renderPnlHistogram(trades) {
  if (!trades.length) return;
  const pnls = trades.map(N);
  const min = Math.min(...pnls), max = Math.max(...pnls);
  const buckets = 20; const step = (max - min) / buckets;
  if (step === 0) return;
  const counts = Array(buckets).fill(0);
  pnls.forEach(v => { const b = Math.min(buckets - 1, Math.floor((v - min) / step)); counts[b]++; });
  const labels = Array.from({ length: buckets }, (_, i) => fmt(min + i * step));
  const midpoints = Array.from({ length: buckets }, (_, i) => min + (i + 0.5) * step);
  mk('pnlHistChart', {
    type: 'bar',
    data: { labels, datasets: [{ data: counts, backgroundColor: midpoints.map(v => v >= 0 ? 'rgba(0,255,163,0.6)' : 'rgba(255,68,102,0.6)'), borderRadius: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { title: ctx => labels[ctx[0].dataIndex], label: ctx => ctx.parsed.y + ' trades' } } }, scales: { x: { grid: GRID, ticks: { ...TICK, maxTicksLimit: 8, autoSkip: true } }, y: { grid: GRID, ticks: TICK } } }
  });
}

function renderConsecLoss(trades) {
  const c = G('consec-loss-container'); if (!c) return;
  const wr = trades.length ? trades.filter(t => N(t) > 0).length / trades.length : 0.5;
  const rows = [2, 3, 4, 5, 6, 7, 8].map(n => ({ n, p: (Math.pow(1 - wr, n) * 100).toFixed(2) }));
  c.innerHTML = `<div style="margin-bottom:10px;font-size:12px;color:var(--text2)">At your current <strong style="color:var(--accent)">${(wr * 100).toFixed(1)}% win rate</strong>:</div>
  <table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead><tr style="color:var(--text3);border-bottom:1px solid var(--border)"><th style="padding:6px 10px;text-align:left">Streak</th><th style="padding:6px 10px;text-align:left">Probability</th><th style="padding:6px 10px;text-align:left">Risk</th></tr></thead>
    <tbody>${rows.map(r => `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:6px 10px;font-weight:600">${r.n} losses in a row</td>
      <td style="padding:6px 10px;font-family:var(--font-mono);color:${parseFloat(r.p) > 20 ? 'var(--red)' : parseFloat(r.p) > 10 ? 'var(--gold)' : 'var(--green)'}">${r.p}%</td>
      <td style="padding:6px 10px">${parseFloat(r.p) > 20 ? badge('HIGH', '#fff3', 'rgba(255,68,102,.6)') : parseFloat(r.p) > 5 ? badge('MEDIUM', '#000', 'rgba(255,209,102,.8)') : badge('LOW', '#000', 'rgba(0,255,163,.6)')}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

function renderForwardSim(trades) {
  const c = G('forward-sim-container'); if (!c) return;
  if (trades.length < 5) { c.innerHTML = emptyMsg('Need 5+ trades for forward simulation.'); return; }
  const wins = trades.filter(t => N(t) > 0);
  const losses = trades.filter(t => N(t) < 0);
  const wr = trades.length ? wins.length / trades.length : 0.5;
  const avgW = wins.length ? mean(wins.map(N)) : 0;
  const avgL = losses.length ? mean(losses.map(t => Math.abs(N(t)))) : 0;
  const N_SIM = 50, RUNS = 1000;
  const finals = [];
  const paths = [];
  for (let r = 0; r < RUNS; r++) {
    let eq = 0; const path = [];
    for (let i = 0; i < N_SIM; i++) { eq += Math.random() < wr ? avgW : -avgL; path.push(parseFloat(eq.toFixed(2))); }
    finals.push(eq); if (r < 20) paths.push(path);
  }
  finals.sort((a, b) => a - b);
  const p10 = finals[Math.floor(RUNS * 0.1)], p50 = finals[Math.floor(RUNS * 0.5)], p90 = finals[Math.floor(RUNS * 0.9)];
  const probPos = finals.filter(v => v > 0).length / RUNS * 100;
  c.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-bottom:12px">
    ${statBox('Prob. of Profit', probPos.toFixed(0) + '%', probPos >= 70 ? 'var(--green)' : probPos >= 50 ? 'var(--gold)' : 'var(--red)', 'Out of 1000 sims')}
    ${statBox('10th %ile (Worst)', fmtS(p10), 'var(--red)')}
    ${statBox('Median Outcome', fmtS(p50), p50 >= 0 ? 'var(--green)' : 'var(--red)')}
    ${statBox('90th %ile (Best)', fmtS(p90), 'var(--green)')}
    ${statBox('N Simulations', '1000', 'var(--blue)', N_SIM + ' trades each')}
    ${statBox('Your Edge', fmtS(wr * avgW - (1 - wr) * avgL), 'var(--accent)', 'Per trade expectancy')}
  </div>`;
  setTimeout(() => {
    mk('simPathChart', {
      type: 'line',
      data: { labels: Array.from({ length: N_SIM }, (_, i) => i + 1), datasets: paths.map((path, i) => ({ data: path, borderColor: i === 0 ? '#00ffa3' : 'rgba(255,255,255,0.06)', borderWidth: i === 0 ? 2 : 1, pointRadius: 0, tension: 0.2, fill: false })) },
      options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } }, scales: { x: { grid: GRID, ticks: { ...TICK, maxTicksLimit: 10 } }, y: { grid: GRID, ticks: { ...TICK, callback: v => fmt(v) } } } }
    });
  }, 100);
}

/* ════════════════════════════════════════════════════════════
   PSYCHOLOGY HUB — ENHANCED PSYCH LAB
════════════════════════════════════════════════════════════ */
function renderEmoMomentum(trades) {
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date)).filter(t => t.emotion);
  if (sorted.length < 5) return;
  const EMO_SCORES = { Disciplined: 10, Focused: 9, Calm: 8, Confident: 7, Anxious: 4, Greedy: 3, FOMO: 2, Scared: 2, Frustrated: 2, Tired: 3, Overconfident: 3, Revenge: 1 };
  const win = 5;
  const points = [];
  for (let i = win - 1; i < sorted.length; i++) {
    const slice = sorted.slice(i - win + 1, i + 1);
    points.push(mean(slice.map(t => EMO_SCORES[t.emotion] || 5)));
  }
  mk('emoMomentumChart', {
    type: 'line',
    data: { labels: sorted.slice(win - 1).map((_, i) => `T${i + win}`), datasets: [{ data: points, borderColor: '#b388ff', backgroundColor: 'rgba(179,136,255,0.08)', borderWidth: 2, pointRadius: 0, tension: 0.4, fill: true }, { data: Array(points.length).fill(6), borderColor: 'rgba(0,255,163,0.3)', borderDash: [4, 4], borderWidth: 1, pointRadius: 0, fill: false }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => 'Emo score: ' + ctx.parsed.y.toFixed(1) + '/10' } } }, scales: { x: { grid: GRID, ticks: { ...TICK, maxTicksLimit: 8 } }, y: { grid: GRID, ticks: TICK, min: 0, max: 10 } } }
  });
}

function renderConfidenceChart(trades) {
  const valid = trades.filter(t => t.confidence && N(t) !== 0);
  if (valid.length < 3) return;
  const byConf = {};
  valid.forEach(t => {
    const c = parseInt(t.confidence); if (!byConf[c]) byConf[c] = { pnl: 0, count: 0, wins: 0 };
    byConf[c].pnl += N(t); byConf[c].count++; if (N(t) > 0) byConf[c].wins++;
  });
  const entries = Object.entries(byConf).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
  mk('confidenceChart', {
    type: 'bar',
    data: { labels: entries.map(([k]) => k + '/10'), datasets: [{ label: 'Avg P&L', data: entries.map(([, v]) => parseFloat((v.pnl / v.count).toFixed(2))), backgroundColor: entries.map(([, v]) => v.pnl / v.count >= 0 ? 'rgba(0,255,163,0.6)' : 'rgba(255,68,102,0.6)'), borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => 'Avg P&L: ' + fmtS(ctx.parsed.y) } } }, scales: { x: { grid: GRID, ticks: { ...TICK }, title: { display: true, text: 'Confidence Level', color: '#3d4a63' } }, y: { grid: GRID, ticks: { ...TICK, callback: v => fmt(v) } } } }
  });
}

function renderStressChart(trades) {
  const valid = trades.filter(t => t.stress && N(t) !== 0);
  if (valid.length < 3) return;
  const byStress = {};
  valid.forEach(t => {
    const s = parseInt(t.stress); if (!byStress[s]) byStress[s] = { pnl: 0, count: 0, wins: 0 };
    byStress[s].pnl += N(t); byStress[s].count++; if (N(t) > 0) byStress[s].wins++;
  });
  const entries = Object.entries(byStress).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
  const data = entries.map(([, v]) => parseFloat((v.pnl / v.count).toFixed(2)));
  mk('stressChart', {
    type: 'bar',
    data: { labels: entries.map(([k]) => 'Stress ' + k), datasets: [{ data, backgroundColor: entries.map(([k]) => parseInt(k) >= 7 ? 'rgba(255,68,102,0.7)' : parseInt(k) >= 5 ? 'rgba(255,209,102,0.7)' : 'rgba(0,255,163,0.6)'), borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: GRID, ticks: TICK }, y: { grid: GRID, ticks: { ...TICK, callback: v => fmt(v) } } } }
  });
}

function renderEnergyChart(trades) {
  const valid = trades.filter(t => t.energy);
  if (valid.length < 3) return;
  const byE = {};
  valid.forEach(t => { if (!byE[t.energy]) byE[t.energy] = { pnl: 0, count: 0, wins: 0 }; byE[t.energy].pnl += N(t); byE[t.energy].count++; if (N(t) > 0) byE[t.energy].wins++; });
  const entries = Object.entries(byE);
  mk('energyChart', {
    type: 'bar',
    data: { labels: entries.map(([k]) => k.replace('🔋 ', '').replace('💀 ', '')), datasets: [{ data: entries.map(([, v]) => parseFloat((v.pnl / v.count).toFixed(2))), backgroundColor: entries.map(([, v]) => v.pnl / v.count >= 0 ? 'rgba(0,255,163,0.6)' : 'rgba(255,68,102,0.6)'), borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: GRID, ticks: TICK }, y: { grid: GRID, ticks: { ...TICK, callback: v => fmt(v) } } } }
  });
}

function renderTiltDetector(trades) {
  const c = G('tilt-container'); if (!c) return;
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  const recent = sorted.slice(-10);
  let tiltScore = 0;
  // Signal 1: consecutive losses
  let curLoss = 0; for (let i = sorted.length - 1; i >= 0; i--) { if (N(sorted[i]) < 0) curLoss++; else break; }
  tiltScore += Math.min(40, curLoss * 12);
  // Signal 2: revenge trades
  const revengeCount = recent.filter(t => t.isRevenge === true || t.isRevenge === 'true').length;
  tiltScore += revengeCount * 15;
  // Signal 3: high stress
  const highStressTrades = recent.filter(t => parseInt(t.stress) >= 8).length;
  tiltScore += highStressTrades * 8;
  // Signal 4: declining WR
  const recentWR = recent.length ? recent.filter(t => N(t) > 0).length / recent.length : 0;
  const allWR = trades.length ? trades.filter(t => N(t) > 0).length / trades.length : 0;
  if (recentWR < allWR - 0.15) tiltScore += 20;
  // Signal 5: impulsive trades
  tiltScore += recent.filter(t => t.isImpulsive === true || t.isImpulsive === 'true').length * 10;
  tiltScore = Math.min(100, tiltScore);
  const color = tiltScore >= 70 ? 'var(--red)' : tiltScore >= 40 ? 'var(--gold)' : 'var(--green)';
  const label = tiltScore >= 70 ? '🚨 HIGH TILT — Stop trading' : tiltScore >= 40 ? '⚠️ MODERATE — Trade with care' : '✅ CALM — You\'re in control';
  c.innerHTML = `<div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap;margin-bottom:16px">
    <div style="position:relative;width:100px;height:100px;flex-shrink:0">
      <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40" fill="none" stroke="var(--bg5)" stroke-width="10"/>
        <circle cx="50" cy="50" r="40" fill="none" stroke="${color}" stroke-width="10"
          stroke-dasharray="${2*Math.PI*40}" stroke-dashoffset="${2*Math.PI*40*(1-tiltScore/100)}"
          stroke-linecap="round" transform="rotate(-90 50 50)"/>
      </svg>
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
        <div style="font-family:var(--font-display);font-size:22px;font-weight:800;color:${color}">${tiltScore}</div>
        <div style="font-size:8px;color:var(--text3)">TILT</div>
      </div>
    </div>
    <div>
      <div style="font-size:15px;font-weight:700;color:${color};margin-bottom:8px">${label}</div>
      <div style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text2)">
        <div>Loss streak: <strong style="color:${curLoss>=3?'var(--red)':'var(--green)'}">${curLoss}</strong></div>
        <div>Revenge trades (recent): <strong style="color:${revengeCount>1?'var(--red)':'var(--green)'}">${revengeCount}</strong></div>
        <div>High stress trades: <strong style="color:${highStressTrades>2?'var(--red)':'var(--green)'}">${highStressTrades}</strong></div>
        <div>Recent WR: <strong style="color:${recentWR<allWR-0.1?'var(--red)':'var(--green)'}">${(recentWR*100).toFixed(0)}%</strong> vs all-time ${(allWR*100).toFixed(0)}%</div>
      </div>
    </div>
  </div>
  ${tiltScore >= 70 ? `<div style="padding:12px;background:rgba(255,68,102,0.1);border:1px solid rgba(255,68,102,0.3);border-radius:var(--radius-sm);font-size:12px;color:var(--red)">⛔ Tilt score critically high. Log off and take a break. Come back tomorrow fresh. No trade is worth your account.</div>` : ''}`;
}

function renderImpulseContainer(trades) {
  const c = G('impulse-container'); if (!c) return;
  const planned = trades.filter(t => t.isImpulsive === false || t.isImpulsive === 'false');
  const impulsive = trades.filter(t => t.isImpulsive === true || t.isImpulsive === 'true');
  if (!impulsive.length && !planned.length) { c.innerHTML = emptyMsg('Tag trades as Impulsive/Planned for this analysis.'); return; }
  const pPnl = planned.reduce((s, t) => s + N(t), 0);
  const iPnl = impulsive.reduce((s, t) => s + N(t), 0);
  const pWR = planned.length ? planned.filter(t => N(t) > 0).length / planned.length * 100 : 0;
  const iWR = impulsive.length ? impulsive.filter(t => N(t) > 0).length / impulsive.length * 100 : 0;
  c.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
    <div style="background:rgba(0,255,163,0.06);border:1px solid rgba(0,255,163,0.2);border-radius:var(--radius-sm);padding:14px;text-align:center">
      <div style="font-size:11px;color:var(--text3);margin-bottom:6px">PLANNED TRADES (${planned.length})</div>
      <div style="font-size:22px;font-weight:800;color:${pPnl>=0?'var(--green)':'var(--red)'};">${fmtS(pPnl)}</div>
      <div style="font-size:12px;color:var(--text2);margin-top:4px">${pWR.toFixed(0)}% win rate</div>
    </div>
    <div style="background:rgba(255,68,102,0.06);border:1px solid rgba(255,68,102,0.2);border-radius:var(--radius-sm);padding:14px;text-align:center">
      <div style="font-size:11px;color:var(--text3);margin-bottom:6px">IMPULSIVE TRADES (${impulsive.length})</div>
      <div style="font-size:22px;font-weight:800;color:${iPnl>=0?'var(--green)':'var(--red)'};">${fmtS(iPnl)}</div>
      <div style="font-size:12px;color:var(--text2);margin-top:4px">${iWR.toFixed(0)}% win rate</div>
    </div>
  </div>
  ${impulsive.length > 0 ? `<div style="margin-top:10px;padding:10px 12px;background:rgba(255,209,102,0.08);border:1px solid rgba(255,209,102,0.25);border-radius:var(--radius-sm);font-size:12px;color:var(--gold)">
    💡 Cutting impulsive trades would change your net P&L by ${fmtS(-iPnl)} and your win rate by ${(pWR-iWR).toFixed(1)} pp.
  </div>` : ''}`;
}

/* ════════════════════════════════════════════════════════════
   PSYCHOLOGY HUB — BIAS SCANNER
════════════════════════════════════════════════════════════ */
function renderBiasScanner(trades) {
  const c = G('bias-scanner-container'); if (!c) return;
  if (trades.length < 5) { c.innerHTML = emptyMsg('Need 5+ trades for bias analysis.'); return; }
  const biases = [];
  // 1. Overconfidence
  const highConf = trades.filter(t => parseInt(t.confidence) >= 8);
  const highConfWR = highConf.length ? highConf.filter(t => N(t) > 0).length / highConf.length : 0;
  const allWR = trades.length ? trades.filter(t => N(t) > 0).length / trades.length : 0;
  if (highConf.length >= 3 && highConfWR < allWR - 0.1) {
    biases.push({ name: 'Overconfidence Bias', score: 80, desc: `When confidence is 8+, your WR drops from ${(allWR*100).toFixed(0)}% to ${(highConfWR*100).toFixed(0)}%. High confidence = overtrading.`, color: 'var(--red)' });
  }
  // 2. Revenge trading
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  let revCount = 0;
  for (let i = 1; i < sorted.length; i++) { if (sorted[i].date === sorted[i-1].date && N(sorted[i-1]) < 0) revCount++; }
  const revPct = revCount / trades.length * 100;
  if (revPct > 10) biases.push({ name: 'Revenge Trading', score: Math.min(100, revPct * 4), desc: `${revPct.toFixed(0)}% of your trades are taken immediately after a same-day loss. Classic revenge pattern.`, color: 'var(--red)' });
  // 3. Loss aversion (hold losers longer)
  const winTimes = trades.filter(t => N(t) > 0 && t.entryTime && t.exitTime).map(t => { const [eh,em]=t.entryTime.split(':').map(Number); const [xh,xm]=t.exitTime.split(':').map(Number); return (xh*60+xm)-(eh*60+em); }).filter(v => v > 0);
  const lossTimes = trades.filter(t => N(t) < 0 && t.entryTime && t.exitTime).map(t => { const [eh,em]=t.entryTime.split(':').map(Number); const [xh,xm]=t.exitTime.split(':').map(Number); return (xh*60+xm)-(eh*60+em); }).filter(v => v > 0);
  if (winTimes.length >= 3 && lossTimes.length >= 3) {
    const avgWinTime = mean(winTimes), avgLossTime = mean(lossTimes);
    if (avgLossTime > avgWinTime * 1.3) biases.push({ name: 'Loss Aversion', score: 70, desc: `You hold losers ${(avgLossTime/avgWinTime).toFixed(1)}× longer than winners (${avgLossTime.toFixed(0)}m vs ${avgWinTime.toFixed(0)}m). Cut losses faster.`, color: 'var(--gold)' });
  }
  // 4. Recency bias — WR change after streaks
  let postWinWR = 0, postLossWR = 0, pwCount = 0, plCount = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (N(sorted[i-1]) > 0) { pwCount++; if (N(sorted[i]) > 0) postWinWR++; }
    else { plCount++; if (N(sorted[i]) > 0) postLossWR++; }
  }
  postWinWR = pwCount ? postWinWR/pwCount : allWR;
  postLossWR = plCount ? postLossWR/plCount : allWR;
  if (Math.abs(postWinWR - postLossWR) > 0.15) {
    biases.push({ name: 'Recency Bias', score: 60, desc: `After wins your WR is ${(postWinWR*100).toFixed(0)}% vs ${(postLossWR*100).toFixed(0)}% after losses — a ${Math.abs((postWinWR-postLossWR)*100).toFixed(0)}pp swing. Previous results affect your judgement.`, color: 'var(--gold)' });
  }
  // 5. Position size after losses
  const sizeAfterLoss = trades.filter((t, i) => i > 0 && N(trades[i-1]) < 0 && t.qty).map(t => parseFloat(t.qty));
  const sizeAfterWin = trades.filter((t, i) => i > 0 && N(trades[i-1]) > 0 && t.qty).map(t => parseFloat(t.qty));
  if (sizeAfterLoss.length >= 3 && sizeAfterWin.length >= 3 && mean(sizeAfterLoss) > mean(sizeAfterWin) * 1.2) {
    biases.push({ name: 'Martingale Tendency', score: 75, desc: `After losses you size up ${(mean(sizeAfterLoss)/mean(sizeAfterWin)).toFixed(1)}× more. Increasing size after losses is the #1 account destroyer.`, color: 'var(--red)' });
  }
  if (!biases.length) biases.push({ name: 'No Major Biases Detected', score: 5, desc: 'Your trading data shows no significant psychological biases. Keep logging to improve detection accuracy.', color: 'var(--green)' });
  c.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px">
    ${biases.map(b => `<div style="background:var(--bg4);border:1px solid ${b.score > 60 ? (b.color === 'var(--red)' ? 'rgba(255,68,102,0.3)' : 'rgba(255,209,102,0.3)') : 'rgba(0,255,163,0.2)'};border-radius:var(--radius-sm);padding:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-size:13px;font-weight:700;color:${b.color}">${b.name}</div>
        <div style="font-size:11px;color:var(--text3)">Severity: <strong style="color:${b.color}">${b.score}/100</strong></div>
      </div>
      <div style="height:4px;background:var(--bg5);border-radius:2px;overflow:hidden;margin-bottom:8px">
        <div style="height:100%;width:${b.score}%;background:${b.color};border-radius:2px"></div>
      </div>
      <div style="font-size:12px;color:var(--text2)">${b.desc}</div>
    </div>`).join('')}
  </div>`;
}

function renderLossAversion(trades) {
  const c = G('loss-aversion-container'); if (!c) return;
  const withTimes = trades.filter(t => t.entryTime && t.exitTime && N(t) !== 0);
  if (withTimes.length < 5) { c.innerHTML = emptyMsg('Log trades with Entry & Exit Time for loss aversion analysis.'); return; }
  const getDuration = t => { const [eh,em]=(t.entryTime||'0:0').split(':').map(Number); const [xh,xm]=(t.exitTime||'0:0').split(':').map(Number); return Math.max(0,(xh*60+xm)-(eh*60+em)); };
  const wins = withTimes.filter(t => N(t) > 0);
  const losses = withTimes.filter(t => N(t) < 0);
  const avgWin = mean(wins.map(getDuration));
  const avgLoss = mean(losses.map(getDuration));
  c.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
    ${statBox('Avg hold (wins)', avgWin.toFixed(0) + 'm', 'var(--green)')}
    ${statBox('Avg hold (losses)', avgLoss.toFixed(0) + 'm', avgLoss > avgWin * 1.3 ? 'var(--red)' : 'var(--green)')}
    ${statBox('Loss aversion ratio', (avgLoss/Math.max(1,avgWin)).toFixed(2) + 'x', avgLoss > avgWin * 1.3 ? 'var(--red)' : 'var(--green)', '>1.3x = bias detected')}
  </div>
  ${avgLoss > avgWin * 1.3 ? `<div style="margin-top:10px;padding:10px;background:rgba(255,68,102,0.08);border:1px solid rgba(255,68,102,0.2);border-radius:var(--radius-sm);font-size:12px;color:var(--red)">
    ⚠️ You hold losing trades ${(avgLoss/avgWin).toFixed(1)}× longer than winning trades. This is loss aversion — it slowly drains your account. Set hard stop-losses and honour them.
  </div>` : '<div style="margin-top:8px;font-size:12px;color:var(--green)">✅ No significant loss aversion detected. You exit losses efficiently.</div>'}`;
}

function renderRecencyBias(trades) {
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 10) return;
  const postWinWR = [], postLossWR = [];
  for (let i = 1; i < sorted.length; i++) {
    const win = N(sorted[i]) > 0;
    if (N(sorted[i - 1]) > 0) postWinWR.push(win ? 1 : 0);
    else postLossWR.push(win ? 1 : 0);
  }
  const winMA = [], lossMA = [], labels = [];
  const w = 5;
  for (let i = w - 1; i < Math.max(postWinWR.length, postLossWR.length); i++) {
    labels.push(`T${i + 2}`);
    winMA.push(postWinWR.length > i ? mean(postWinWR.slice(Math.max(0, i - w + 1), i + 1)) * 100 : null);
    lossMA.push(postLossWR.length > i ? mean(postLossWR.slice(Math.max(0, i - w + 1), i + 1)) * 100 : null);
  }
  mk('recencyBiasChart', {
    type: 'line',
    data: { labels, datasets: [
      { label: 'WR after WIN', data: winMA, borderColor: '#00ffa3', borderWidth: 2, pointRadius: 0, tension: 0.4 },
      { label: 'WR after LOSS', data: lossMA, borderColor: '#ff4466', borderWidth: 2, pointRadius: 0, tension: 0.4 }
    ]},
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: LEGEND, tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + (ctx.parsed.y || 0).toFixed(1) + '%' } } }, scales: { x: { grid: GRID, ticks: { ...TICK, maxTicksLimit: 10 } }, y: { grid: GRID, ticks: { ...TICK, callback: v => v + '%' }, min: 0, max: 100 } } }
  });
}

/* ════════════════════════════════════════════════════════════
   PSYCHOLOGY HUB — EMOTION STATS
════════════════════════════════════════════════════════════ */
function renderEmotionMatrix(trades) {
  const c = G('emotion-matrix-container'); if (!c) return;
  const withBoth = trades.filter(t => t.preEmotion && t.emotion);
  if (withBoth.length < 3) { c.innerHTML = emptyMsg('Log trades with both Pre-trade and During-trade emotion to see the matrix.'); return; }
  const preEmos = [...new Set(withBoth.map(t => t.preEmotion))].slice(0, 6);
  const durEmos = [...new Set(withBoth.map(t => t.emotion))].slice(0, 6);
  const grid = {};
  withBoth.forEach(t => { const k = `${t.preEmotion}|${t.emotion}`; if (!grid[k]) grid[k] = { pnl: 0, count: 0 }; grid[k].pnl += N(t); grid[k].count++; });
  const maxAbs = Math.max(...Object.values(grid).map(v => Math.abs(v.pnl / v.count)), 1);
  c.innerHTML = `<div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:11px">
    <thead><tr><th style="padding:6px 10px;color:var(--text3)">Pre → During</th>${durEmos.map(e => `<th style="padding:6px 10px;color:var(--text3);text-align:center">${EMO_ICONS[e] || ''}${e}</th>`).join('')}</tr></thead>
    <tbody>${preEmos.map(pre => `<tr>${[`<td style="padding:6px 10px;color:var(--text2);font-weight:600;white-space:nowrap">${EMO_ICONS[pre] || ''}${pre}</td>`, ...durEmos.map(dur => { const v = grid[`${pre}|${dur}`]; const avg = v ? v.pnl / v.count : 0; const i = Math.abs(avg) / maxAbs; const bg = v ? (avg > 0 ? `rgba(0,255,163,${0.1+i*0.5})` : `rgba(255,68,102,${0.1+i*0.5})`) : 'transparent'; return `<td style="padding:6px 10px;background:${bg};border-radius:4px;text-align:center;font-family:var(--font-mono);color:${avg>=0?'var(--green)':'var(--red)'}">${v ? fmtS(avg) : '—'}</td>`; })].join('')}</tr>`).join('')}
    </tbody>
  </table></div>`;
}

function renderEmoWrRadar(trades) {
  const emotions = ['Calm', 'Confident', 'Disciplined', 'Focused', 'Anxious', 'FOMO', 'Greedy', 'Revenge'];
  const data = emotions.map(e => {
    const et = trades.filter(t => t.emotion === e);
    return et.length >= 2 ? et.filter(t => N(t) > 0).length / et.length * 100 : 0;
  });
  mk('emoWrRadar', {
    type: 'radar',
    data: { labels: emotions, datasets: [{ label: 'Win Rate %', data, backgroundColor: 'rgba(179,136,255,0.1)', borderColor: '#b388ff', borderWidth: 2, pointBackgroundColor: '#b388ff' }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { r: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'var(--text3)', font: { size: 9 } }, pointLabels: { color: 'var(--text2)', font: { size: 10 } }, min: 0, max: 100 } } }
  });
}

function renderEmoVolChart(trades) {
  const emotions = [...new Set(trades.map(t => t.emotion).filter(Boolean))];
  if (!emotions.length) return;
  const data = emotions.map(e => {
    const et = trades.filter(t => t.emotion === e).map(N);
    return parseFloat(stdDev(et).toFixed(2));
  });
  mk('emoVolChart', {
    type: 'bar',
    data: { labels: emotions.map(e => (EMO_ICONS[e] || '') + ' ' + e), datasets: [{ data, backgroundColor: data.map((v, i) => v > 1000 ? 'rgba(255,68,102,0.7)' : 'rgba(0,212,255,0.6)'), borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => 'Std Dev: ' + fmt(ctx.parsed.y) } } }, scales: { x: { grid: GRID, ticks: TICK }, y: { grid: GRID, ticks: { ...TICK, callback: v => fmt(v) } } } }
  });
}

function renderPTSDContainer(trades) {
  const c = G('ptsd-container'); if (!c) return;
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 5) { c.innerHTML = emptyMsg('Need 5+ trades for post-trade analysis.'); return; }
  let pwWins = 0, pwTotal = 0, plWins = 0, plTotal = 0;
  let pwPnl = 0, plPnl = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (N(sorted[i-1]) > 0) { pwTotal++; if (N(sorted[i]) > 0) pwWins++; pwPnl += N(sorted[i]); }
    else { plTotal++; if (N(sorted[i]) > 0) plWins++; plPnl += N(sorted[i]); }
  }
  const pwWR = pwTotal ? pwWins / pwTotal * 100 : 0;
  const plWR = plTotal ? plWins / plTotal * 100 : 0;
  const effect = pwWR - plWR;
  c.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
    ${statBox('WR after WIN', pwWR.toFixed(1) + '%', pwWR >= plWR ? 'var(--green)' : 'var(--red)', pwTotal + ' instances')}
    ${statBox('WR after LOSS', plWR.toFixed(1) + '%', plWR >= pwWR ? 'var(--green)' : 'var(--red)', plTotal + ' instances')}
    ${statBox('Carry-over Effect', (effect >= 0 ? '+' : '') + effect.toFixed(1) + 'pp', Math.abs(effect) < 5 ? 'var(--green)' : 'var(--red)', Math.abs(effect) > 10 ? '⚠️ Bias detected' : '✅ Neutral')}
  </div>
  <div style="margin-top:10px;font-size:12px;color:var(--text2)">
    ${Math.abs(effect) > 10 ? (effect > 0 ? '💡 You trade better after wins — momentum effect. Size up carefully after wins.' : '⚠️ You trade worse after losses — emotional carry-over detected. Take a 15-min break after each loss.') : '✅ Your win rate is consistent regardless of previous trade outcome — good emotional isolation.'}
  </div>`;
}

/* ════════════════════════════════════════════════════════════
   PSYCHOLOGY HUB — REPORT TAB
════════════════════════════════════════════════════════════ */
function renderPsychReport(trades) {
  const c = G('psych-report-container'); if (!c) return;
  if (!trades.length) { c.innerHTML = emptyMsg('Log trades to generate your psychological profile.'); return; }
  const wins = trades.filter(t => N(t) > 0);
  const wr = trades.length ? wins.length / trades.length * 100 : 0;
  const discTrades = trades.filter(t => t.discipline);
  const discScore = discTrades.length ? discTrades.filter(t => t.discipline === 'followed').length / discTrades.length * 100 : 0;
  const revengeTrades = trades.filter(t => t.isRevenge === true || t.isRevenge === 'true').length;
  const impulsiveTrades = trades.filter(t => t.isImpulsive === true || t.isImpulsive === 'true').length;
  const emotions = trades.map(t => t.emotion).filter(Boolean);
  const EMO_SCORES = { Disciplined: 10, Focused: 9, Calm: 8, Confident: 7, Anxious: 4, Greedy: 3, FOMO: 2, Scared: 2, Frustrated: 2, Tired: 3, Overconfident: 3, Revenge: 1 };
  const avgEmoScore = emotions.length ? mean(emotions.map(e => EMO_SCORES[e] || 5)) : 5;
  const psych_score = Math.round((discScore * 0.3) + (avgEmoScore * 10 * 0.3) + ((1 - revengeTrades / Math.max(1, trades.length)) * 100 * 0.2) + ((1 - impulsiveTrades / Math.max(1, trades.length)) * 100 * 0.2));
  const grade = psych_score >= 85 ? 'A' : psych_score >= 70 ? 'B' : psych_score >= 55 ? 'C' : psych_score >= 40 ? 'D' : 'F';
  const gradeColor = grade === 'A' ? 'var(--green)' : grade === 'B' ? 'var(--blue)' : grade === 'C' ? 'var(--gold)' : 'var(--red)';
  const strengths = [], weaknesses = [], recommendations = [];
  if (discScore >= 70) strengths.push('High discipline score — you follow your rules consistently');
  if (wr >= 55) strengths.push('Strong win rate — your setups are reliable');
  if (revengeTrades === 0) strengths.push('Zero revenge trades — excellent emotional control');
  if (avgEmoScore >= 7) strengths.push('Positive emotional profile — you trade in healthy states');
  if (discScore < 50) weaknesses.push('Low discipline score — rules are being broken too often');
  if (revengeTrades > trades.length * 0.1) weaknesses.push(`Revenge trading: ${revengeTrades} flagged trades — emotional instability`);
  if (impulsiveTrades > trades.length * 0.1) weaknesses.push(`Impulsive trading: ${impulsiveTrades} flagged trades — lack of planning`);
  if (avgEmoScore < 5) weaknesses.push('Negative emotional state — trading in fear/greed/FOMO too often');
  if (discScore < 50) recommendations.push('Review your rules and simplify — you can only follow rules you remember');
  if (revengeTrades > 0) recommendations.push('Implement a 30-min mandatory break rule after any loss > your avg loss');
  if (impulsiveTrades > 0) recommendations.push('Write a 3-line pre-trade plan before every entry. If you can\'t write it, don\'t trade it');
  if (avgEmoScore < 6) recommendations.push('Start your trading day with a 5-min mental checklist — score yourself before opening the terminal');
  if (!recommendations.length) recommendations.push('Keep logging consistently. Your data quality determines insight quality.');
  c.innerHTML = `<div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:20px">
    <div style="text-align:center">
      <div style="width:90px;height:90px;border-radius:50%;border:3px solid ${gradeColor};display:flex;flex-direction:column;align-items:center;justify-content:center;margin:0 auto 8px">
        <div style="font-family:var(--font-display);font-size:36px;font-weight:800;color:${gradeColor}">${grade}</div>
      </div>
      <div style="font-size:12px;color:var(--text3)">Psych Score: ${psych_score}/100</div>
    </div>
    <div style="flex:1;min-width:200px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        ${statBox('Discipline', discScore.toFixed(0) + '%', discScore >= 70 ? 'var(--green)' : 'var(--red)')}
        ${statBox('Emo Health', avgEmoScore.toFixed(1) + '/10', avgEmoScore >= 7 ? 'var(--green)' : 'var(--gold)')}
        ${statBox('Revenge Trades', revengeTrades + '', revengeTrades === 0 ? 'var(--green)' : 'var(--red)')}
        ${statBox('Impulsive Trades', impulsiveTrades + '', impulsiveTrades === 0 ? 'var(--green)' : 'var(--red)')}
      </div>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
    <div style="background:rgba(0,255,163,0.05);border:1px solid rgba(0,255,163,0.2);border-radius:var(--radius-sm);padding:14px">
      <div style="font-size:11px;font-weight:700;color:var(--green);margin-bottom:8px">✅ Strengths</div>
      ${strengths.length ? strengths.map(s => `<div style="font-size:11px;color:var(--text2);padding:3px 0;border-bottom:1px solid var(--border)">→ ${s}</div>`).join('') : '<div style="font-size:11px;color:var(--text3)">Not enough data yet.</div>'}
    </div>
    <div style="background:rgba(255,68,102,0.05);border:1px solid rgba(255,68,102,0.2);border-radius:var(--radius-sm);padding:14px">
      <div style="font-size:11px;font-weight:700;color:var(--red);margin-bottom:8px">❌ Weaknesses</div>
      ${weaknesses.length ? weaknesses.map(w => `<div style="font-size:11px;color:var(--text2);padding:3px 0;border-bottom:1px solid var(--border)">→ ${w}</div>`).join('') : '<div style="font-size:11px;color:var(--green)">No major weaknesses found.</div>'}
    </div>
    <div style="background:rgba(6,214,245,0.05);border:1px solid rgba(6,214,245,0.2);border-radius:var(--radius-sm);padding:14px">
      <div style="font-size:11px;font-weight:700;color:var(--blue);margin-bottom:8px">💡 Recommendations</div>
      ${recommendations.map((r, i) => `<div style="font-size:11px;color:var(--text2);padding:3px 0;border-bottom:1px solid var(--border)">${i+1}. ${r}</div>`).join('')}
    </div>
  </div>`;
}

function renderRuleStreak(trades) {
  const c = G('rule-streak-container'); if (!c) return;
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  let cur = 0, max = 0, curStreak = 0;
  sorted.forEach(t => { if (t.discipline === 'followed') { curStreak++; max = Math.max(max, curStreak); } else curStreak = 0; });
  cur = curStreak;
  const pct = max > 0 ? cur / max * 100 : 0;
  c.innerHTML = `<div style="text-align:center;padding:16px">
    <div style="font-family:var(--font-display);font-size:56px;font-weight:800;color:${cur>=max*0.8?'var(--green)':'var(--gold)'};">${cur}</div>
    <div style="font-size:13px;color:var(--text2);margin-bottom:8px">current streak</div>
    <div style="height:6px;background:var(--bg5);border-radius:3px;overflow:hidden;margin-bottom:8px">
      <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--accent),var(--blue));border-radius:3px"></div>
    </div>
    <div style="font-size:12px;color:var(--text3)">Personal best: <strong style="color:var(--accent)">${max}</strong></div>
    ${cur >= 10 ? '<div style="font-size:12px;color:var(--green);margin-top:6px">🔥 On fire! Keep the streak alive.</div>' : cur >= 5 ? '<div style="font-size:12px;color:var(--gold);margin-top:6px">⭐ Good streak — don\'t break it now.</div>' : '<div style="font-size:12px;color:var(--text3);margin-top:6px">Build your streak by following all rules.</div>'}
  </div>`;
}

function renderRuleROI(trades) {
  const c = G('rule-roi-container'); if (!c) return;
  const losers = trades.filter(t => N(t) < 0);
  if (!losers.length) { c.innerHTML = emptyMsg('No losing trades to analyse.'); return; }
  const totalLoss = Math.abs(losers.reduce((s, t) => s + N(t), 0));
  const avgLoss = totalLoss / losers.length;
  const suggestions = [
    { rule: 'Max 2% daily loss cap', est: avgLoss * losers.length * 0.2 },
    { rule: 'No trading in first 15 mins', est: trades.filter(t => { const h = parseInt((t.entryTime || '').split(':')[0]); const m = parseInt((t.entryTime || '').split(':')[1]); return h === 9 && m < 30; }).reduce((s, t) => s + Math.min(0, N(t)), 0) },
    { rule: 'Mandatory SL on every trade', est: avgLoss * 0.3 * losers.length },
    { rule: 'No trading after 3 consecutive losses', est: avgLoss * Math.min(5, losers.length) },
  ].filter(s => s.est !== 0).sort((a, b) => Math.abs(b.est) - Math.abs(a.est));
  c.innerHTML = `<div style="font-size:12px;color:var(--text2);margin-bottom:10px">These rules would have saved the most money based on your loss patterns:</div>
  <div style="display:flex;flex-direction:column;gap:8px">${suggestions.map((s, i) => `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--bg4);border-radius:var(--radius-sm);border:1px solid var(--border)">
    <span style="font-size:12px;font-weight:600">${i+1}. ${s.rule}</span>
    <span style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:var(--green)">+${fmt(Math.abs(s.est))} saved</span>
  </div>`).join('')}</div>`;
}

function renderWeeklyPsychScorecard(trades) {
  const c = G('weekly-psych-scorecard'); if (!c) return;
  if (!trades.length) { c.innerHTML = emptyMsg('No trades yet.'); return; }
  const weeks = {};
  trades.forEach(t => {
    const d = new Date(t.date + 'T00:00:00');
    const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const k = mon.toISOString().split('T')[0];
    if (!weeks[k]) weeks[k] = [];
    weeks[k].push(t);
  });
  const weekEntries = Object.entries(weeks).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 8);
  const EMO_SCORES = { Disciplined: 10, Focused: 9, Calm: 8, Confident: 7, Anxious: 4, Greedy: 3, FOMO: 2, Revenge: 1, Scared: 2, Tired: 3, Overconfident: 3 };
  c.innerHTML = `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead><tr style="color:var(--text3);border-bottom:1px solid var(--border)">${['Week of','Trades','Discipline','Emo Score','P&L','Grade'].map(h => `<th style="padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase">${h}</th>`).join('')}</tr></thead>
    <tbody>${weekEntries.map(([week, wt]) => {
      const disc = wt.filter(t => t.discipline);
      const discS = disc.length ? disc.filter(t => t.discipline === 'followed').length / disc.length * 100 : 50;
      const emos = wt.map(t => t.emotion).filter(Boolean);
      const emoS = emos.length ? mean(emos.map(e => EMO_SCORES[e] || 5)) : 5;
      const pnl = wt.reduce((s, t) => s + N(t), 0);
      const grade_num = Math.round(discS * 0.5 + emoS * 10 * 0.5);
      const g = grade_num >= 85 ? 'A' : grade_num >= 70 ? 'B' : grade_num >= 55 ? 'C' : grade_num >= 40 ? 'D' : 'F';
      const gc = g === 'A' ? 'var(--green)' : g === 'B' ? 'var(--blue)' : g === 'C' ? 'var(--gold)' : 'var(--red)';
      return `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:8px 12px;color:var(--text2)">${week}</td>
        <td style="padding:8px 12px">${wt.length}</td>
        <td style="padding:8px 12px;color:${discS>=70?'var(--green)':discS>=50?'var(--gold)':'var(--red)'}">${disc.length ? discS.toFixed(0)+'%' : '—'}</td>
        <td style="padding:8px 12px;color:${emoS>=7?'var(--green)':'var(--text2)'}">${emos.length ? emoS.toFixed(1)+'/10' : '—'}</td>
        <td style="padding:8px 12px;font-family:var(--font-mono);color:${pnl>=0?'var(--green)':'var(--red)'}">${fmtS(pnl)}</td>
        <td style="padding:8px 12px;font-family:var(--font-display);font-size:16px;font-weight:800;color:${gc}">${g}</td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

/* ════════════════════════════════════════════════════════════
   SYMBOL SELECT POPULATION
════════════════════════════════════════════════════════════ */
function populateSymbolSelect() {
  const sel = G('symbol-dive-select'); if (!sel || sel.children.length > 1) return;
  const symbols = [...new Set(T().map(t => t.symbol).filter(Boolean))].sort();
  symbols.forEach(s => { const o = document.createElement('option'); o.value = s; o.textContent = s; sel.appendChild(o); });
}

/* ════════════════════════════════════════════════════════════
   MASTER RENDER FUNCTIONS
════════════════════════════════════════════════════════════ */
function renderAnalyticsHub() {
  const trades = T();
  renderWrTrend(trades);
  renderPfTrend(trades);
  renderTimeframeChart(trades);
  renderSetupGradeChart(trades);
  renderHourHeatmap(trades);
  renderAccountCompare(trades);
  // Patterns
  renderMaeMfeChart(trades);
  renderEntryQualityChart(trades);
  renderRevengeDeeep(trades);
  renderConfluence(trades);
  renderSlippageReport(trades);
  // Time
  renderDurationScatter(trades);
  renderEntryTimeWr(trades);
  renderCapitalEfficiency(trades);
  populateSymbolSelect();
  // Regimes
  renderRegimeMatrix(trades);
  renderRegimeWrRadar(trades);
  renderStratRegimeHeatmap(trades);
  renderRegimeTimeline(trades);
  // Probability
  renderProbabilityDashboard(trades);
  renderPnlHistogram(trades);
  renderConsecLoss(trades);
  renderForwardSim(trades);
}

function renderPsychHub() {
  const trades = T();
  renderEmoMomentum(trades);
  renderConfidenceChart(trades);
  renderStressChart(trades);
  renderEnergyChart(trades);
  renderTiltDetector(trades);
  renderImpulseContainer(trades);
  // Biases
  renderBiasScanner(trades);
  renderLossAversion(trades);
  renderRecencyBias(trades);
  // Emotions
  renderEmotionMatrix(trades);
  renderEmoWrRadar(trades);
  renderEmoVolChart(trades);
  renderPTSDContainer(trades);
  // Report
  renderPsychReport(trades);
  renderRuleStreak(trades);
  renderRuleROI(trades);
  renderWeeklyPsychScorecard(trades);
}

/* ── Hook into navigation ───────────────────────────────── */
document.addEventListener('tb:navigate', e => {
  const p = e.detail.page;
  setTimeout(() => {
    if (p === 'analytics-hub') renderAnalyticsHub();
    if (p === 'psych-hub') renderPsychHub();
  }, 250);
});

// Show/hide rule button on psych tab
document.addEventListener('DOMContentLoaded', () => {
  const origSwitch = window.switchHubTab;
  if (typeof origSwitch === 'function') {
    window.switchHubTab = function (hub, panel, btn) {
      origSwitch(hub, panel, btn);
      if (hub === 'psych-hub') {
        const ruleBtn = G('psych-hub-btn-rule');
        if (ruleBtn) ruleBtn.style.display = panel === 'discipline' ? 'inline-flex' : 'none';
        setTimeout(() => { if (panel === 'biases') { renderBiasScanner(T()); renderLossAversion(T()); renderRecencyBias(T()); } if (panel === 'emotions') { renderEmotionMatrix(T()); renderEmoWrRadar(T()); renderEmoVolChart(T()); renderPTSDContainer(T()); } if (panel === 'report') { renderPsychReport(T()); renderRuleStreak(T()); renderRuleROI(T()); renderWeeklyPsychScorecard(T()); } if (panel === 'psych') { renderEmoMomentum(T()); renderConfidenceChart(T()); renderStressChart(T()); renderEnergyChart(T()); renderTiltDetector(T()); renderImpulseContainer(T()); } }, 100);
      }
      if (hub === 'analytics-hub') {
        setTimeout(() => {
          if (panel === 'patterns') { renderMaeMfeChart(T()); renderEntryQualityChart(T()); renderRevengeDeeep(T()); renderConfluence(T()); renderSlippageReport(T()); }
          if (panel === 'timeanalysis') { renderDurationScatter(T()); renderEntryTimeWr(T()); renderCapitalEfficiency(T()); populateSymbolSelect(); }
          if (panel === 'regimes') { renderRegimeMatrix(T()); renderRegimeWrRadar(T()); renderStratRegimeHeatmap(T()); renderRegimeTimeline(T()); }
          if (panel === 'probability') { renderProbabilityDashboard(T()); renderPnlHistogram(T()); renderConsecLoss(T()); renderForwardSim(T()); }
          if (panel === 'overview') { renderWrTrend(T()); renderPfTrend(T()); renderTimeframeChart(T()); renderSetupGradeChart(T()); renderHourHeatmap(T()); renderAccountCompare(T()); }
        }, 100);
      }
    };
  }
});

window.renderAnalyticsHub = renderAnalyticsHub;
window.renderPsychHub = renderPsychHub;

})();
