/* ═══════════════════════════════════════════════════════════════
   TRADEBOOK PRO — DEEP INSIGHTS ENGINE
   Advanced statistics, probabilities, warnings, health scores,
   pattern detection — injected into all existing pages.
   ═══════════════════════════════════════════════════════════════ */
'use strict';

(function () {

/* ── helpers ────────────────────────────────────────────────── */
const G = (id) => document.getElementById(id);
const N = (t) => parseFloat(t.net) || 0;
function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function stdDev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}
function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function percentile(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.floor(p / 100 * (s.length - 1));
  return s[idx];
}
function zScore(value, arr) {
  const m = mean(arr), s = stdDev(arr);
  return s > 0 ? (value - m) / s : 0;
}
// Normal CDF approximation
function normCDF(z) {
  const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911;
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.sqrt(2);
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-x*x);
  return 0.5 * (1 + sign * y);
}
function binomialProb(n, k, p) {
  // P(X >= k) using normal approximation
  const mu = n * p, sigma = Math.sqrt(n * p * (1 - p));
  return sigma > 0 ? 1 - normCDF((k - 0.5 - mu) / sigma) : (k <= mu ? 1 : 0);
}
function getFmt() { return window.fmt || (v => '₹' + Number(v).toFixed(0)); }
function getFmtS() { return window.fmtS || (v => (v >= 0 ? '+₹' : '-₹') + Math.abs(v).toFixed(0)); }
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const GRID = { color: 'rgba(255,255,255,0.04)' };
const TICK = { color: '#3d4a63', font: { size: 10, family: 'JetBrains Mono' } };

function mkChart(id, cfg) {
  const canvas = G(id);
  if (!canvas || !window.Chart) return null;
  if (window._charts && window._charts[id]) { try { window._charts[id].destroy(); } catch {} }
  const chart = new Chart(canvas.getContext('2d'), cfg);
  if (!window._charts) window._charts = {};
  window._charts[id] = chart;
  return chart;
}

/* ── Section injector ───────────────────────────────────────── */
function inject(parentId, id, html, position = 'beforeend') {
  const parent = G(parentId);
  if (!parent || G(id)) return;
  const div = document.createElement('div');
  div.id = id;
  div.innerHTML = html;
  parent.insertAdjacentElement(position === 'afterbegin' ? 'afterbegin' : 'beforeend', div);
}

function card(title, sub, body, extraStyle = '') {
  return `<div class="chart-card full-width" style="margin-top:16px${extraStyle ? ';' + extraStyle : ''}">
    <div class="chart-header">
      <div class="chart-title">${title}</div>
      ${sub ? `<div class="chart-sub">${sub}</div>` : ''}
    </div>
    ${body}
  </div>`;
}

function badge(text, color, bg) {
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;background:${bg};color:${color};letter-spacing:.04em">${text}</span>`;
}

function statusIcon(val, good, warn) {
  if (val >= good) return `<span style="color:var(--green)">✅ GOOD</span>`;
  if (val >= warn) return `<span style="color:var(--gold)">⚠️ WARN</span>`;
  return `<span style="color:var(--red)">🔴 POOR</span>`;
}

function gauge(label, val, max, color, suffix = '') {
  const pct = Math.min(100, Math.max(0, val / max * 100));
  return `<div style="margin-bottom:10px">
    <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px">
      <span style="color:var(--text2)">${label}</span>
      <span style="color:${color};font-weight:700;font-family:var(--font-mono)">${typeof val === 'number' ? val.toFixed(1) : val}${suffix}</span>
    </div>
    <div style="height:5px;background:var(--bg5);border-radius:3px;overflow:hidden">
      <div style="height:100%;width:${pct}%;background:${color};border-radius:3px;transition:width 1s"></div>
    </div>
  </div>`;
}

/* ════════════════════════════════════════════════════════════════
   MASTER COMPUTE ENGINE
════════════════════════════════════════════════════════════════ */
function compute(trades) {
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  const wins = trades.filter(t => N(t) > 0);
  const losses = trades.filter(t => N(t) < 0);
  const rets = trades.map(t => N(t));
  const winRets = wins.map(N);
  const lossRets = losses.map(v => Math.abs(N(v)));

  // Daily map
  const dailyMap = {};
  sorted.forEach(t => { dailyMap[t.date] = (dailyMap[t.date] || 0) + N(t); });
  const dailyRets = Object.values(dailyMap);

  const totalPnl = rets.reduce((a, b) => a + b, 0);
  const wr = trades.length ? wins.length / trades.length : 0;
  const avgWin = mean(winRets);
  const avgLoss = mean(lossRets);
  const pf = avgLoss > 0 ? avgWin * wr / (avgLoss * (1 - wr)) : Infinity;
  const expectancy = wr * avgWin - (1 - wr) * avgLoss;
  const medWin = median(winRets);
  const medLoss = median(lossRets);
  const rr = avgLoss > 0 ? avgWin / avgLoss : 0;

  // Risk metrics
  const dMean = mean(dailyRets);
  const dStd = stdDev(dailyRets);
  const dDownRets = dailyRets.filter(r => r < 0);
  const dDownStd = dDownRets.length ? stdDev(dDownRets) : 1;
  const sharpe = dStd > 0 ? dMean / dStd * Math.sqrt(252) : 0;
  const sortino = dDownStd > 0 ? dMean / dDownStd * Math.sqrt(252) : 0;
  let peak = 0, eq = 0, maxDD = 0, maxDDStart = 0, maxDDEnd = 0, peakIdx = 0;
  sorted.forEach((t, i) => { eq += N(t); if (eq > peak) { peak = eq; peakIdx = i; } const dd = peak - eq; if (dd > maxDD) { maxDD = dd; maxDDStart = peakIdx; maxDDEnd = i; } });
  const calmar = maxDD > 0 ? totalPnl / maxDD : Infinity;

  // Streak analysis
  let curStreak = 0, maxWinStreak = 0, maxLossStreak = 0, curType = null;
  const streaks = [];
  sorted.forEach(t => {
    const w = N(t) > 0;
    if (w === curType) { curStreak++; } else { if (curType !== null) streaks.push({ type: curType, len: curStreak }); curType = w; curStreak = 1; }
    if (w) maxWinStreak = Math.max(maxWinStreak, curStreak);
    else maxLossStreak = Math.max(maxLossStreak, curStreak);
  });
  if (curType !== null) streaks.push({ type: curType, len: curStreak });
  const curStreakObj = streaks[streaks.length - 1] || { type: true, len: 0 };

  // Prob of next loss streak (binomial)
  const probNext3Loss = trades.length >= 10 ? binomialProb(3, 3, 1 - wr) : null;
  const probWRByChance = trades.length >= 20 ? (1 - normCDF(zScore(wr * 100, Array(trades.length).fill(50)))).toFixed(3) : null;

  // Day-of-week
  const byDay = Array(7).fill(null).map(() => ({ pnl: 0, count: 0, wins: 0 }));
  trades.forEach(t => { const d = new Date(t.date + 'T00:00:00').getDay(); byDay[d].pnl += N(t); byDay[d].count++; if (N(t) > 0) byDay[d].wins++; });

  // Strategy stats
  const byStrat = {};
  trades.forEach(t => {
    const s = t.strategy || 'Unknown';
    if (!byStrat[s]) byStrat[s] = { pnl: 0, count: 0, wins: 0, rets: [] };
    byStrat[s].pnl += N(t); byStrat[s].count++; if (N(t) > 0) byStrat[s].wins++; byStrat[s].rets.push(N(t));
  });

  // Consecutive loss probability given current wr
  const prob3consec = Math.pow(1 - wr, 3);
  const prob5consec = Math.pow(1 - wr, 5);

  // Hour analysis (if entryTime present)
  const byHour = {};
  trades.filter(t => t.entryTime).forEach(t => {
    const h = parseInt((t.entryTime || '').split(':')[0]);
    if (!isNaN(h)) { if (!byHour[h]) byHour[h] = { pnl: 0, count: 0, wins: 0 }; byHour[h].pnl += N(t); byHour[h].count++; if (N(t) > 0) byHour[h].wins++; }
  });

  // Trade size consistency
  const qtys = trades.filter(t => t.qty).map(t => parseFloat(t.qty));
  const qtyStd = stdDev(qtys);
  const qtyMean = mean(qtys);
  const sizeConsistency = qtyMean > 0 ? Math.max(0, 100 - (qtyStd / qtyMean * 100)) : 100;

  // Discipline score
  const discTrades = trades.filter(t => t.discipline);
  const discScore = discTrades.length ? discTrades.filter(t => t.discipline === 'followed').length / discTrades.length * 100 : 50;

  // Quality score avg
  const qualityTrades = trades.filter(t => t.qualityScore);
  const avgQuality = qualityTrades.length ? mean(qualityTrades.map(t => t.qualityScore)) : 50;

  // Revenge trade ratio
  let revengeTrades = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].date === sorted[i - 1].date && N(sorted[i - 1]) < 0) revengeTrades++;
  }
  const revengePct = trades.length ? revengeTrades / trades.length * 100 : 0;

  // Recent vs historical (last 20 vs rest)
  const recent20 = sorted.slice(-20);
  const historical = sorted.slice(0, -20);
  const recentWR = recent20.length ? recent20.filter(t => N(t) > 0).length / recent20.length * 100 : wr * 100;
  const histWR = historical.length ? historical.filter(t => N(t) > 0).length / historical.length * 100 : wr * 100;

  // P-value for win rate (is it > 50% by skill, not luck?)
  const pValueWR = trades.length >= 10 ? (1 - normCDF((wr - 0.5) / Math.sqrt(0.5 * 0.5 / trades.length))).toFixed(4) : null;

  // VaR
  const var95 = percentile(dailyRets, 5);
  const var99 = percentile(dailyRets, 1);

  // Kelly
  const kelly = pf > 0 && pf !== Infinity ? Math.max(0, (pf * wr - (1 - wr)) / pf * 100) : 0;

  return {
    sorted, wins, losses, rets, winRets, lossRets, dailyRets, dailyMap,
    totalPnl, wr, avgWin, avgLoss, pf, expectancy, medWin, medLoss, rr,
    sharpe, sortino, maxDD, calmar, dMean, dStd,
    maxWinStreak, maxLossStreak, curStreakObj, streaks,
    prob3consec, prob5consec, probNext3Loss, probWRByChance, pValueWR,
    byDay, byStrat, byHour,
    sizeConsistency, discScore, avgQuality, revengePct, revengeTrades,
    recentWR, histWR, recent20, historical,
    var95, var99, kelly,
    n: trades.length
  };
}

/* ════════════════════════════════════════════════════════════════
   1. DASHBOARD — TRADING HEALTH SCORE + ALERTS
════════════════════════════════════════════════════════════════ */
function injectDashboardInsights(trades) {
  if (!trades.length) return;
  const c = compute(trades);
  const fmt = getFmt(), fmtS = getFmtS();

  /* ── Health Score ── */
  const scores = {
    winRate: Math.min(100, c.wr * 100 / 0.65 * 40),
    profitFactor: Math.min(100, c.pf / 3 * 30),
    discipline: c.discScore * 0.15,
    consistency: c.sizeConsistency * 0.15,
  };
  const healthScore = Math.round(Object.values(scores).reduce((a, b) => a + b, 0));
  const healthColor = healthScore >= 75 ? 'var(--green)' : healthScore >= 50 ? 'var(--gold)' : 'var(--red)';
  const healthLabel = healthScore >= 75 ? 'ELITE' : healthScore >= 60 ? 'GOOD' : healthScore >= 45 ? 'AVERAGE' : healthScore >= 30 ? 'STRUGGLING' : 'CRITICAL';

  /* ── Warnings ── */
  const warnings = [];
  if (c.wr < 0.35) warnings.push({ level: 'critical', icon: '🔴', text: `Win rate ${(c.wr * 100).toFixed(1)}% is critically low. You need ${Math.ceil(0.40 * c.n) - c.wins.length} more wins to reach 40%.` });
  else if (c.wr < 0.45) warnings.push({ level: 'warn', icon: '🟡', text: `Win rate ${(c.wr * 100).toFixed(1)}% is below average. Focus on setup quality over trade count.` });
  if (c.pf < 1.0 && c.n > 5) warnings.push({ level: 'critical', icon: '🔴', text: `Profit Factor ${c.pf.toFixed(2)} < 1.0 — you are losing money systematically. Review exit strategy.` });
  if (c.maxDD > 0 && c.totalPnl > 0 && c.maxDD / c.totalPnl > 0.5) warnings.push({ level: 'warn', icon: '🟡', text: `Max drawdown is ${((c.maxDD / c.totalPnl) * 100).toFixed(0)}% of your total profit. Reduce position size during drawdowns.` });
  if (c.revengePct > 15) warnings.push({ level: 'critical', icon: '🔴', text: `${c.revengePct.toFixed(0)}% of trades are potential revenge trades. Implement a 30-min cooling-off rule after losses.` });
  if (c.curStreakObj.type === false && c.curStreakObj.len >= 3) warnings.push({ level: 'warn', icon: '🟡', text: `Current losing streak: ${c.curStreakObj.len} trades. Probability of 1 more loss: ${((1 - c.wr) * 100).toFixed(0)}%. Consider reducing size.` });
  if (c.sizeConsistency < 50) warnings.push({ level: 'warn', icon: '🟡', text: `Position sizing is inconsistent (score: ${c.sizeConsistency.toFixed(0)}/100). Inconsistent sizing magnifies losses on bad days.` });
  if (c.recentWR < c.histWR - 15 && c.historical.length >= 10) warnings.push({ level: 'warn', icon: '🟡', text: `Recent 20-trade WR (${c.recentWR.toFixed(0)}%) is ${(c.histWR - c.recentWR).toFixed(0)}pp below historical (${c.histWR.toFixed(0)}%). Performance is declining.` });
  if (c.avgQuality < 50 && c.n >= 5) warnings.push({ level: 'info', icon: '🔵', text: `Average trade quality score is ${c.avgQuality.toFixed(0)}/100. Review your setup and execution criteria.` });
  if (!warnings.length) warnings.push({ level: 'good', icon: '✅', text: `No active warnings. Your trading metrics are healthy. Keep following your process.` });

  /* ── Probabilities ── */
  const probWin = c.wr;
  const prob2wins = probWin ** 2;
  const prob5wins = probWin ** 5;
  const prob3losses = (1 - probWin) ** 3;

  const html = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:0">
      <!-- Health Score -->
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:24px">
        <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.1em;margin-bottom:14px">🏥 Trading Health Score</div>
        <div style="display:flex;align-items:center;gap:20px;margin-bottom:16px">
          <div style="position:relative;width:88px;height:88px;flex-shrink:0">
            <svg viewBox="0 0 88 88" style="transform:rotate(-90deg)">
              <circle cx="44" cy="44" r="36" fill="none" stroke="var(--bg5)" stroke-width="8"/>
              <circle cx="44" cy="44" r="36" fill="none" stroke="${healthColor}" stroke-width="8"
                stroke-dasharray="${2 * Math.PI * 36}" stroke-dashoffset="${2 * Math.PI * 36 * (1 - healthScore / 100)}"
                stroke-linecap="round" style="transition:stroke-dashoffset 1.2s ease"/>
            </svg>
            <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
              <div style="font-family:var(--font-display);font-size:22px;font-weight:800;color:${healthColor}">${healthScore}</div>
              <div style="font-size:8px;color:var(--text3)">/ 100</div>
            </div>
          </div>
          <div>
            <div style="font-size:18px;font-weight:800;color:${healthColor}">${healthLabel}</div>
            <div style="font-size:11px;color:var(--text2);margin-top:4px">Based on ${c.n} trades</div>
            ${gauge('Win Rate', c.wr * 100, 65, c.wr >= 0.55 ? 'var(--green)' : c.wr >= 0.4 ? 'var(--gold)' : 'var(--red)', '%')}
            ${gauge('Profit Factor', Math.min(c.pf, 5), 5, c.pf >= 2 ? 'var(--green)' : c.pf >= 1 ? 'var(--gold)' : 'var(--red)')}
          </div>
        </div>
        ${gauge('Discipline Score', c.discScore, 100, c.discScore >= 70 ? 'var(--green)' : c.discScore >= 50 ? 'var(--gold)' : 'var(--red)', '%')}
        ${gauge('Size Consistency', c.sizeConsistency, 100, c.sizeConsistency >= 70 ? 'var(--green)' : c.sizeConsistency >= 50 ? 'var(--gold)' : 'var(--red)', '%')}
      </div>

      <!-- Warnings Panel -->
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:24px">
        <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.1em;margin-bottom:14px">⚡ Active Alerts & Warnings</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${warnings.map(w => `
            <div style="background:${w.level === 'critical' ? 'rgba(255,68,102,0.08)' : w.level === 'warn' ? 'rgba(255,209,102,0.08)' : w.level === 'good' ? 'rgba(0,255,163,0.08)' : 'rgba(6,214,245,0.08)'};
              border:1px solid ${w.level === 'critical' ? 'rgba(255,68,102,0.3)' : w.level === 'warn' ? 'rgba(255,209,102,0.3)' : w.level === 'good' ? 'rgba(0,255,163,0.3)' : 'rgba(6,214,245,0.2)'};
              border-radius:var(--radius-sm);padding:10px 12px;display:flex;gap:10px;align-items:flex-start">
              <span style="font-size:14px;flex-shrink:0;margin-top:1px">${w.icon}</span>
              <span style="font-size:12px;color:var(--text2);line-height:1.5">${w.text}</span>
            </div>`).join('')}
        </div>
      </div>
    </div>

    <!-- Probability Row -->
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin-top:16px">
      ${[
        ['P(next win)', (probWin * 100).toFixed(1) + '%', 'Based on your WR', probWin >= 0.5 ? 'var(--green)' : 'var(--red)'],
        ['P(2 wins in a row)', (prob2wins * 100).toFixed(1) + '%', 'Consecutive wins', prob2wins >= 0.25 ? 'var(--green)' : 'var(--gold)'],
        ['P(5 wins in a row)', (prob5wins * 100).toFixed(1) + '%', 'Luck or skill?', 'var(--blue)'],
        ['P(3 losses in a row)', (prob3losses * 100).toFixed(1) + '%', 'Drawdown risk', prob3losses < 0.15 ? 'var(--green)' : prob3losses < 0.30 ? 'var(--gold)' : 'var(--red)'],
        ['Expectancy/trade', getFmtS()(c.expectancy), 'Avg edge per trade', c.expectancy >= 0 ? 'var(--green)' : 'var(--red)'],
        ['Trades to target', c.expectancy > 0 ? Math.ceil(parseFloat(getSettings().weeklyTarget || 1000) / c.expectancy) + '' : '∞', 'At current edge', 'var(--purple)'],
      ].map(([l, v, d, col]) => `
        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px">
          <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px">${l}</div>
          <div style="font-family:var(--font-display);font-size:20px;font-weight:800;color:${col}">${v}</div>
          <div style="font-size:10px;color:var(--text3);margin-top:3px">${d}</div>
        </div>`).join('')}
    </div>`;

  const container = G('dash-insights-section');
  if (container) { container.innerHTML = html; return; }
  const dashPage = G('page-dashboard');
  if (!dashPage) return;
  const div = document.createElement('div');
  div.id = 'dash-insights-section';
  div.innerHTML = card('📊 Trading Health Dashboard', 'Real-time performance score, active alerts & probability engine', html);
  const bottomRow = dashPage.querySelector('.dash-bottom-row');
  if (bottomRow) bottomRow.before(div); else dashPage.querySelector('.pages-container, .page-header')?.after(div);
}

/* ════════════════════════════════════════════════════════════════
   2. JOURNAL — TRADE-LEVEL INSIGHTS COLUMN
════════════════════════════════════════════════════════════════ */
function injectJournalInsights(trades) {
  if (!trades.length) return;
  const c = compute(trades);
  const fmt = getFmt(), fmtS = getFmtS();

  // Best/worst/outlier detection
  const sorted_by_pnl = [...trades].sort((a, b) => N(b) - N(a));
  const best3 = sorted_by_pnl.slice(0, 3);
  const worst3 = sorted_by_pnl.slice(-3).reverse();
  const outlierThreshold = c.dMean + 2 * c.dStd;
  const outliers = trades.filter(t => Math.abs(N(t)) > outlierThreshold && outlierThreshold > 0);

  // Consecutive
  const html = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
      <div style="background:var(--bg4);border:1px solid rgba(0,255,163,0.2);border-radius:var(--radius-sm);padding:14px">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;margin-bottom:8px">🏆 Top 3 Trades</div>
        ${best3.map((t, i) => `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px">
          <span style="color:var(--text2)">${['🥇','🥈','🥉'][i]} ${t.symbol || '—'} <span style="color:var(--text3);font-size:10px">${t.date}</span></span>
          <span style="color:var(--green);font-family:var(--font-mono)">${fmtS(N(t))}</span>
        </div>`).join('')}
      </div>
      <div style="background:var(--bg4);border:1px solid rgba(255,68,102,0.2);border-radius:var(--radius-sm);padding:14px">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;margin-bottom:8px">💔 Worst 3 Trades</div>
        ${worst3.map((t, i) => `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px">
          <span style="color:var(--text2)">${['💀','😰','😤'][i]} ${t.symbol || '—'} <span style="color:var(--text3);font-size:10px">${t.date}</span></span>
          <span style="color:var(--red);font-family:var(--font-mono)">${fmtS(N(t))}</span>
        </div>`).join('')}
      </div>
      <div style="background:var(--bg4);border:1px solid rgba(255,209,102,0.2);border-radius:var(--radius-sm);padding:14px">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;margin-bottom:8px">⚡ Streak & Stats</div>
        <div style="font-size:12px;color:var(--text2);display:flex;flex-direction:column;gap:5px">
          <div>Current: <strong style="color:${c.curStreakObj.type ? 'var(--green)' : 'var(--red)'}">${c.curStreakObj.len} ${c.curStreakObj.type ? 'wins' : 'losses'}</strong></div>
          <div>Best win streak: <strong style="color:var(--green)">${c.maxWinStreak}</strong></div>
          <div>Worst loss streak: <strong style="color:var(--red)">${c.maxLossStreak}</strong></div>
          <div>Outlier trades: <strong style="color:var(--gold)">${outliers.length}</strong> (±2σ)</div>
          <div>Median win: <strong style="color:var(--green)">${fmt(c.medWin)}</strong></div>
          <div>Median loss: <strong style="color:var(--red)">${fmt(c.medLoss)}</strong></div>
        </div>
      </div>
    </div>
    ${outliers.length ? `<div style="margin-top:10px;padding:12px;background:rgba(255,209,102,0.07);border:1px solid rgba(255,209,102,0.25);border-radius:var(--radius-sm)">
      <div style="font-size:11px;font-weight:700;color:var(--gold);margin-bottom:6px">⚠️ Outlier Trades (>2σ from mean) — These distort your averages</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">${outliers.map(t => `<span style="font-size:11px;background:var(--bg4);border:1px solid var(--border);padding:3px 8px;border-radius:4px">${t.symbol} ${fmtS(N(t))} <span style="color:var(--text3)">${t.date}</span></span>`).join('')}</div>
      <div style="font-size:11px;color:var(--text3);margin-top:6px">Remove these from your analysis to see your true median performance.</div>
    </div>` : ''}`;

  const container = G('journal-insights-box');
  if (container) { container.innerHTML = html; return; }
  const journalPage = G('page-journal');
  if (!journalPage) return;
  const div = document.createElement('div');
  div.id = 'journal-insights-box';
  div.innerHTML = card('🔬 Journal Intelligence', 'Top/worst trades, streaks, statistical outliers', html);
  div.style.marginBottom = '16px';
  const tableWrap = journalPage.querySelector('.journal-table-wrap');
  if (tableWrap) tableWrap.before(div);
}

/* ════════════════════════════════════════════════════════════════
   3. ANALYTICS — DEEP STATS INJECTION
════════════════════════════════════════════════════════════════ */
function injectAnalyticsDeep(trades) {
  if (trades.length < 3) return;
  const c = compute(trades);
  const fmt = getFmt(), fmtS = getFmtS();

  // ── Statistical significance ──
  const pValue = c.pValueWR;
  const isStatSig = pValue !== null && parseFloat(pValue) < 0.05;
  const sigText = pValue !== null
    ? `p-value = ${pValue} ${isStatSig ? '✅ Statistically significant edge!' : '⚠️ Not yet proven — could be luck'}`
    : 'Need 10+ trades for significance test';

  // ── Distribution analysis ──
  const pnls = trades.map(N);
  const skewness = (() => {
    const m = mean(pnls), s = stdDev(pnls);
    if (s === 0) return 0;
    return pnls.reduce((a, v) => a + ((v - m) / s) ** 3, 0) / pnls.length;
  })();
  const kurtosis = (() => {
    const m = mean(pnls), s = stdDev(pnls);
    if (s === 0) return 0;
    return pnls.reduce((a, v) => a + ((v - m) / s) ** 4, 0) / pnls.length - 3;
  })();

  // ── Recovery analysis ──
  let recoveries = [], ddStart = 0, inDD = false, ddDepth = 0;
  let running = 0, runPeak = 0;
  c.sorted.forEach(t => {
    running += N(t);
    if (running > runPeak) {
      if (inDD) { recoveries.push(ddDepth); inDD = false; }
      runPeak = running;
    } else if (!inDD && running < runPeak) {
      inDD = true; ddDepth = runPeak - running;
    }
  });
  const avgRecovery = mean(recoveries);

  // ── Strategy ranking ──
  const stratRanking = Object.entries(c.byStrat)
    .map(([name, d]) => ({
      name, pnl: d.pnl, count: d.count,
      wr: d.count ? d.wins / d.count * 100 : 0,
      expectancy: d.count ? d.pnl / d.count : 0,
      sharpe: stdDev(d.rets) > 0 ? mean(d.rets) / stdDev(d.rets) * Math.sqrt(252) : 0,
      score: (d.pnl > 0 ? 40 : 0) + (d.wins / (d.count || 1) * 30) + (d.count >= 5 ? 30 : d.count * 6)
    }))
    .sort((a, b) => b.score - a.score);

  // ── What's GOOD / BAD / MISSING / LAGGING ──
  const audit = {
    good: [], bad: [], missing: [], lagging: []
  };

  if (c.wr >= 0.55) audit.good.push(`Win rate ${(c.wr*100).toFixed(1)}% — above average`);
  if (c.pf >= 2) audit.good.push(`Profit factor ${c.pf.toFixed(2)} — professional level`);
  if (c.sharpe >= 1) audit.good.push(`Sharpe ${c.sharpe.toFixed(2)} — risk-adjusted returns are strong`);
  if (c.discScore >= 75) audit.good.push(`Discipline score ${c.discScore.toFixed(0)}% — excellent rule following`);
  if (c.maxWinStreak >= 5) audit.good.push(`Max win streak ${c.maxWinStreak} — momentum is real`);
  if (c.rr >= 2) audit.good.push(`R:R ratio ${c.rr.toFixed(1)} — letting winners run`);
  if (c.sizeConsistency >= 75) audit.good.push(`Position sizing consistent (${c.sizeConsistency.toFixed(0)}%)`);

  if (c.wr < 0.4) audit.bad.push(`Win rate ${(c.wr*100).toFixed(1)}% — critically below 40%`);
  if (c.pf < 1.2 && c.n > 5) audit.bad.push(`Profit factor ${c.pf.toFixed(2)} — barely above breakeven`);
  if (c.revengePct > 10) audit.bad.push(`${c.revengePct.toFixed(0)}% revenge trading detected`);
  if (c.maxLossStreak >= 5) audit.bad.push(`Max loss streak ${c.maxLossStreak} — systemic issue`);
  if (c.sortino < 0) audit.bad.push(`Negative Sortino ratio — downside volatility exceeds returns`);
  if (c.avgQuality < 45) audit.bad.push(`Low avg trade quality ${c.avgQuality.toFixed(0)}/100`);
  if (skewness < -0.5) audit.bad.push(`Negative skew (${skewness.toFixed(2)}) — frequent small wins, rare big losses (dangerous)`);

  const tradedDays = Object.keys(c.dailyMap).length;
  const totalDays = c.sorted.length ? Math.ceil((new Date(c.sorted[c.sorted.length - 1].date) - new Date(c.sorted[0].date)) / 86400000) : 0;
  if (c.n > 5 && !c.sorted.some(t => t.strategy)) audit.missing.push('Strategy tags — needed for pattern analysis');
  if (!c.sorted.some(t => t.emotion)) audit.missing.push('Emotion tracking — critical for psych analysis');
  if (!c.sorted.some(t => t.discipline)) audit.missing.push('Discipline tracking — can\'t measure rule adherence');
  if (!c.sorted.some(t => t.regime)) audit.missing.push('Market regime tags — needed for regime analysis');
  if (!c.sorted.some(t => t.qty)) audit.missing.push('Position size (Qty) — needed for sizing analysis');
  if (!c.sorted.some(t => t.tax)) audit.missing.push('Tax/charges — needed for accurate net P&L');
  if (c.n < 20) audit.missing.push(`More trades (${c.n}/20 minimum for reliable statistics)`);

  if (c.recentWR < c.wr * 100 - 10) audit.lagging.push(`Recent WR ${c.recentWR.toFixed(0)}% vs all-time ${(c.wr*100).toFixed(0)}% — declining`);
  if (c.sortino < c.sharpe * 0.7) audit.lagging.push(`Sortino lagging Sharpe — downside risk is growing`);
  const lateMonths = [...new Set(c.sorted.slice(-30).map(t => t.date?.slice(0, 7)))];
  const earlyMonths = [...new Set(c.sorted.slice(0, 30).map(t => t.date?.slice(0, 7)))];
  if (lateMonths.length && earlyMonths.length) {
    const recentAvg = c.sorted.slice(-30).reduce((s, t) => s + N(t), 0) / 30;
    const earlyAvg = c.sorted.slice(0, Math.min(30, c.n)).reduce((s, t) => s + N(t), 0) / Math.min(30, c.n);
    if (recentAvg < earlyAvg * 0.7 && earlyAvg > 0) audit.lagging.push(`Recent avg P&L/trade (${fmt(recentAvg)}) lagging early period (${fmt(earlyAvg)})`);
  }

  const auditHtml = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:0">
      ${[
        ['✅ Doing Well', audit.good, 'rgba(0,255,163,0.08)', 'rgba(0,255,163,0.25)', 'var(--green)'],
        ['❌ Needs Fixing', audit.bad, 'rgba(255,68,102,0.08)', 'rgba(255,68,102,0.25)', 'var(--red)'],
        ['🔍 Missing Data', audit.missing, 'rgba(255,209,102,0.08)', 'rgba(255,209,102,0.25)', 'var(--gold)'],
        ['📉 Lagging / Declining', audit.lagging, 'rgba(6,214,245,0.08)', 'rgba(6,214,245,0.25)', 'var(--blue)'],
      ].map(([title, items, bg, border, color]) => `
        <div style="background:${bg};border:1px solid ${border};border-radius:var(--radius-sm);padding:14px">
          <div style="font-size:11px;font-weight:700;color:${color};margin-bottom:8px">${title}</div>
          ${items.length
            ? items.map(i => `<div style="font-size:12px;color:var(--text2);padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.04);display:flex;gap:6px"><span>→</span><span>${i}</span></div>`).join('')
            : `<div style="font-size:12px;color:var(--text3)">Nothing in this category.</div>`}
        </div>`).join('')}
    </div>`;

  const distHtml = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px">
      ${[
        ['Skewness', skewness.toFixed(3), skewness > 0 ? '✅ Positive (good)' : '⚠️ Negative (risky)', skewness > 0 ? 'var(--green)' : 'var(--red)'],
        ['Kurtosis', kurtosis.toFixed(3), Math.abs(kurtosis) > 1 ? '⚠️ Fat tails' : '✅ Normal-ish', Math.abs(kurtosis) > 1 ? 'var(--gold)' : 'var(--green)'],
        ['Stat. Significance', pValue || '—', isStatSig ? '✅ Real edge' : '⚠️ Inconclusive', isStatSig ? 'var(--green)' : 'var(--gold)'],
        ['Kelly Fraction', c.kelly.toFixed(1) + '%', 'Optimal risk per trade', 'var(--blue)'],
        ['VaR 95%', fmt(Math.abs(c.var95)), '1-in-20 day loss', 'var(--red)'],
        ['VaR 99%', fmt(Math.abs(c.var99)), '1-in-100 day loss', 'var(--red)'],
        ['Avg Recovery', avgRecovery > 0 ? fmt(avgRecovery) : '—', 'Avg drawdown depth', 'var(--orange)'],
        ['P(WR by luck)', c.probWRByChance || '—', 'Prob win rate is random', parseFloat(c.probWRByChance) < 0.05 ? 'var(--green)' : 'var(--gold)'],
      ].map(([l, v, d, col]) => `
        <div style="background:var(--bg4);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px">
          <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px">${l}</div>
          <div style="font-family:var(--font-mono);font-size:17px;font-weight:700;color:${col}">${v}</div>
          <div style="font-size:10px;color:var(--text3);margin-top:3px">${d}</div>
        </div>`).join('')}
    </div>`;

  const stratHtml = `
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="color:var(--text3);border-bottom:1px solid var(--border)">${['Rank','Strategy','Trades','Win Rate','P&L','Expectancy/Trade','Sharpe','Status'].map(h => `<th style="padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase">${h}</th>`).join('')}</tr></thead>
        <tbody>${stratRanking.map((s, i) => `
          <tr style="border-bottom:1px solid var(--border)">
            <td style="padding:8px 10px;color:var(--text3)">${i + 1}</td>
            <td style="padding:8px 10px;font-weight:600">${s.name}</td>
            <td style="padding:8px 10px;color:var(--text2)">${s.count}</td>
            <td style="padding:8px 10px;color:${s.wr >= 55 ? 'var(--green)' : s.wr >= 40 ? 'var(--gold)' : 'var(--red)'}">
              ${s.wr.toFixed(1)}% ${statusIcon(s.wr, 55, 40)}
            </td>
            <td style="padding:8px 10px;font-family:var(--font-mono);color:${s.pnl >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtS(s.pnl)}</td>
            <td style="padding:8px 10px;font-family:var(--font-mono);color:${s.expectancy >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtS(s.expectancy)}</td>
            <td style="padding:8px 10px;font-family:var(--font-mono);color:${s.sharpe >= 1 ? 'var(--green)' : s.sharpe >= 0 ? 'var(--gold)' : 'var(--red)'}">${s.sharpe.toFixed(2)}</td>
            <td style="padding:8px 10px">${s.score >= 80 ? badge('KEEP', '#000', 'var(--green)') : s.score >= 50 ? badge('REVIEW', '#000', 'var(--gold)') : badge('CUT', 'var(--text)', 'rgba(255,68,102,0.4)')}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  // Inject into analytics overview panel
  const overviewPanel = G('analytics-hub-panel-overview');
  if (!overviewPanel) return;

  if (!G('analytics-audit-card')) {
    const d1 = document.createElement('div'); d1.id = 'analytics-audit-card';
    d1.innerHTML = card('🎯 Performance Audit — Good / Bad / Missing / Lagging', 'What\'s working, what needs fixing, what data you\'re missing', auditHtml);
    overviewPanel.prepend(d1);
  } else G('analytics-audit-card').querySelector('.chart-card > div:last-child, .chart-card > div + div').innerHTML = auditHtml;

  if (!G('analytics-dist-card')) {
    const d2 = document.createElement('div'); d2.id = 'analytics-dist-card';
    d2.innerHTML = card('📐 Statistical Deep-Dive', 'Distribution shape, fat tails, statistical significance, VaR, Kelly', distHtml);
    overviewPanel.appendChild(d2);
  }

  if (!G('analytics-strat-rank-card')) {
    const d3 = document.createElement('div'); d3.id = 'analytics-strat-rank-card';
    d3.innerHTML = card('⚔️ Strategy Ranking & Verdict', 'Ranked by composite score — KEEP, REVIEW, or CUT each strategy', stratHtml);
    overviewPanel.appendChild(d3);
  }

  // Inject into insights panel
  injectProbabilityEngine(c, G('analytics-hub-panel-insights'));
}

function injectProbabilityEngine(c, panel) {
  if (!panel || G('prob-engine-card')) return;
  const fmtS = getFmtS();

  // N trades forward simulation
  const N_SIM = 50, RUNS = 1000;
  const results = [];
  for (let r = 0; r < RUNS; r++) {
    let eq = 0;
    for (let i = 0; i < N_SIM; i++) {
      eq += Math.random() < c.wr ? c.avgWin : -c.avgLoss;
    }
    results.push(eq);
  }
  results.sort((a, b) => a - b);
  const p10 = results[Math.floor(RUNS * 0.1)];
  const p25 = results[Math.floor(RUNS * 0.25)];
  const p50 = results[Math.floor(RUNS * 0.5)];
  const p75 = results[Math.floor(RUNS * 0.75)];
  const p90 = results[Math.floor(RUNS * 0.9)];
  const probPos = results.filter(r => r > 0).length / RUNS * 100;

  const html = `
    <div style="margin-bottom:14px;padding:12px;background:var(--bg4);border-radius:var(--radius-sm);border:1px solid var(--border)">
      <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:4px">Monte Carlo: Next ${N_SIM} trades at your current edge (${RUNS} simulations)</div>
      <div style="font-size:11px;color:var(--text3)">Probability of being profitable: <strong style="color:${probPos >= 70 ? 'var(--green)' : 'var(--gold)'}">${probPos.toFixed(0)}%</strong></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:14px">
      ${[['10th %ile (Worst case)',p10,'var(--red)'],['25th %ile',p25,'var(--orange)'],['50th %ile (Median)',p50,'var(--text)'],['75th %ile',p75,'var(--teal)'],['90th %ile (Best case)',p90,'var(--green)']].map(([l,v,col])=>`
        <div style="background:var(--bg4);border-radius:var(--radius-sm);padding:10px;text-align:center;border:1px solid var(--border)">
          <div style="font-size:9px;color:var(--text3);margin-bottom:4px">${l}</div>
          <div style="font-family:var(--font-mono);font-size:15px;font-weight:700;color:${col}">${fmtS(v)}</div>
        </div>`).join('')}
    </div>
    <div style="position:relative;height:140px"><canvas id="prob-histogram"></canvas></div>`;

  const div = document.createElement('div');
  div.id = 'prob-engine-card';
  div.innerHTML = card('🎲 Probability Engine', `Forward simulation of ${N_SIM} trades using your historical edge`, html);
  panel.prepend(div);

  setTimeout(() => {
    // Histogram of results
    const buckets = 20;
    const min = results[0], max = results[results.length - 1];
    const step = (max - min) / buckets;
    const counts = Array(buckets).fill(0);
    results.forEach(v => { const b = Math.min(buckets - 1, Math.floor((v - min) / step)); counts[b]++; });
    const labels = Array.from({ length: buckets }, (_, i) => getFmt()(min + i * step));
    mkChart('prob-histogram', {
      type: 'bar',
      data: { labels, datasets: [{ data: counts, backgroundColor: counts.map((_, i) => (min + i * step) >= 0 ? 'rgba(0,255,163,0.5)' : 'rgba(255,68,102,0.5)'), borderRadius: 2, borderSkipped: false }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: GRID, ticks: { ...TICK, maxTicksLimit: 6 } }, y: { grid: GRID, ticks: { ...TICK } } } }
    });
  }, 200);
}

/* ════════════════════════════════════════════════════════════════
   4. PSYCHOLOGY — PATTERN WARNINGS + EMOTIONAL STATISTICS
════════════════════════════════════════════════════════════════ */
function injectPsychInsights(trades) {
  if (!trades.length) return;
  const c = compute(trades);
  const fmt = getFmt(), fmtS = getFmtS();

  // Emotion-stratified statistics
  const emotions = [...new Set(trades.map(t => t.emotion).filter(Boolean))];
  const emoStats = emotions.map(emo => {
    const et = trades.filter(t => t.emotion === emo);
    const pnl = et.reduce((s, t) => s + N(t), 0);
    const wr = et.length ? et.filter(t => N(t) > 0).length / et.length * 100 : 0;
    const avgPnl = et.length ? pnl / et.length : 0;
    const vol = stdDev(et.map(N));
    return { emo, pnl, wr, avgPnl, count: et.length, vol };
  }).sort((a, b) => b.avgPnl - a.avgPnl);

  // PTSD score (post-loss trauma — do you trade worse after losses?)
  const sorted = c.sorted;
  let postLossWins = 0, postLossTotal = 0, postWinWins = 0, postWinTotal = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (N(sorted[i - 1]) < 0) { postLossTotal++; if (N(sorted[i]) > 0) postLossWins++; }
    else if (N(sorted[i - 1]) > 0) { postWinTotal++; if (N(sorted[i]) > 0) postWinWins++; }
  }
  const postLossWR = postLossTotal ? postLossWins / postLossTotal * 100 : null;
  const postWinWR = postWinTotal ? postWinWins / postWinTotal * 100 : null;
  const ptsdEffect = postLossWR !== null && postWinWR !== null ? postWinWR - postLossWR : null;

  // Time-of-day P&L (using date patterns as proxy if no entryTime)
  const hourStats = Object.entries(c.byHour).map(([h, d]) => ({
    h: parseInt(h), ...d,
    wr: d.count ? d.wins / d.count * 100 : 0,
    avg: d.count ? d.pnl / d.count : 0
  })).sort((a, b) => a.h - b.h);

  const html = `
    <!-- Emotion Stats Table -->
    <div style="overflow-x:auto;margin-bottom:0">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="color:var(--text3);border-bottom:1px solid var(--border)">${['Emotion','Trades','Win Rate','Avg P&L/Trade','Total P&L','Volatility','Verdict'].map(h => `<th style="padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase">${h}</th>`).join('')}</tr></thead>
        <tbody>${emoStats.length ? emoStats.map(e => `<tr style="border-bottom:1px solid var(--border)">
          <td style="padding:8px 10px;font-weight:600">${{Calm:'😌',Confident:'💪',Anxious:'😰',Greedy:'🤑',FOMO:'😱',Disciplined:'🎯'}[e.emo]||'🎭'} ${e.emo}</td>
          <td style="padding:8px 10px;color:var(--text2)">${e.count}</td>
          <td style="padding:8px 10px;color:${e.wr >= 55 ? 'var(--green)' : e.wr >= 40 ? 'var(--gold)' : 'var(--red)'}">${e.wr.toFixed(1)}%</td>
          <td style="padding:8px 10px;font-family:var(--font-mono);color:${e.avgPnl >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtS(e.avgPnl)}</td>
          <td style="padding:8px 10px;font-family:var(--font-mono);color:${e.pnl >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtS(e.pnl)}</td>
          <td style="padding:8px 10px;font-family:var(--font-mono);color:var(--text2)">${fmt(e.vol)}</td>
          <td style="padding:8px 10px">${e.avgPnl >= 0 && e.wr >= 50 ? badge('TRADE MORE', '#000', 'var(--green)') : e.avgPnl < 0 ? badge('AVOID', 'var(--text)', 'rgba(255,68,102,0.4)') : badge('CAUTION', '#000', 'var(--gold)')}</td>
        </tr>`).join('') : '<tr><td colspan="7" style="padding:16px;color:var(--text3)">No emotion data — start logging emotions with trades.</td></tr>'}
        </tbody>
      </table>
    </div>

    <!-- Post-trade effect -->
    ${ptsdEffect !== null ? `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:12px">
      <div style="background:var(--bg4);border-radius:var(--radius-sm);padding:12px;border:1px solid ${postLossWR < c.wr * 100 - 5 ? 'rgba(255,68,102,0.3)' : 'var(--border)'}">
        <div style="font-size:10px;color:var(--text3);margin-bottom:4px">WR after a LOSS</div>
        <div style="font-size:20px;font-weight:800;color:${postLossWR >= c.wr * 100 - 5 ? 'var(--green)' : 'var(--red)'}">${postLossWR.toFixed(1)}%</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px">${postLossTotal} instances</div>
      </div>
      <div style="background:var(--bg4);border-radius:var(--radius-sm);padding:12px;border:1px solid ${postWinWR > c.wr * 100 + 5 ? 'rgba(0,255,163,0.3)' : 'var(--border)'}">
        <div style="font-size:10px;color:var(--text3);margin-bottom:4px">WR after a WIN</div>
        <div style="font-size:20px;font-weight:800;color:${postWinWR >= c.wr * 100 ? 'var(--green)' : 'var(--gold)'}">${postWinWR.toFixed(1)}%</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px">${postWinTotal} instances</div>
      </div>
      <div style="background:var(--bg4);border-radius:var(--radius-sm);padding:12px;border:1px solid ${Math.abs(ptsdEffect) > 10 ? 'rgba(255,209,102,0.3)' : 'var(--border)'}">
        <div style="font-size:10px;color:var(--text3);margin-bottom:4px">Post-result Effect</div>
        <div style="font-size:20px;font-weight:800;color:${Math.abs(ptsdEffect) < 5 ? 'var(--green)' : 'var(--red)'}">${ptsdEffect > 0 ? '+' : ''}${ptsdEffect.toFixed(1)}pp</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px">${Math.abs(ptsdEffect) > 10 ? '⚠️ Emotional bias detected' : '✅ Emotionally stable'}</div>
      </div>
    </div>` : ''}

    <!-- Hour of day if data exists -->
    ${hourStats.length >= 3 ? `
    <div style="margin-top:12px"><div style="font-size:11px;font-weight:700;color:var(--text);margin-bottom:8px">⏰ Performance by Hour of Day</div>
    <div style="position:relative;height:120px"><canvas id="hour-pnl-chart"></canvas></div></div>` : ''}`;

  const psychPanel = G('psych-hub-panel-psych');
  if (!psychPanel) return;

  if (!G('psych-deep-stats')) {
    const div = document.createElement('div');
    div.id = 'psych-deep-stats';
    div.innerHTML = card('🧠 Emotion Performance Statistics', 'Which mental state makes you money? Which costs you?', html);
    psychPanel.prepend(div);
  }

  if (hourStats.length >= 3) {
    setTimeout(() => {
      mkChart('hour-pnl-chart', {
        type: 'bar',
        data: { labels: hourStats.map(h => h.h + ':00'), datasets: [{ data: hourStats.map(h => h.avg), backgroundColor: hourStats.map(h => h.avg >= 0 ? 'rgba(0,255,163,0.6)' : 'rgba(255,68,102,0.6)'), borderRadius: 3, borderSkipped: false }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => 'Avg: ' + getFmtS()(ctx.parsed.y) } } }, scales: { x: { grid: GRID, ticks: TICK }, y: { grid: GRID, ticks: { ...TICK, callback: v => getFmt()(v) } } } }
      });
    }, 200);
  }
}

/* ════════════════════════════════════════════════════════════════
   5. TOOLS HUB — STREAK PROBABILITY + POSITION ANALYTICS
════════════════════════════════════════════════════════════════ */
function injectToolsInsights(trades) {
  if (!trades.length) return;
  const c = compute(trades);
  const fmt = getFmt(), fmtS = getFmtS();

  // Streak display
  const container = G('streak-display');
  if (container) {
    const streakProbs = [2, 3, 4, 5, 6].map(n => ({
      n,
      winP: (c.wr ** n * 100).toFixed(1),
      lossP: ((1 - c.wr) ** n * 100).toFixed(1)
    }));
    container.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
        <div style="background:var(--bg);border-radius:6px;padding:10px;text-align:center">
          <div style="font-size:10px;color:var(--text3)">Current Streak</div>
          <div style="font-size:22px;font-weight:800;color:${c.curStreakObj.type ? 'var(--green)' : 'var(--red)'}">${c.curStreakObj.len} ${c.curStreakObj.type ? '🟢' : '🔴'}</div>
          <div style="font-size:10px;color:var(--text3)">${c.curStreakObj.type ? 'wins' : 'losses'}</div>
        </div>
        <div style="background:var(--bg);border-radius:6px;padding:10px">
          <div style="font-size:10px;color:var(--text3);margin-bottom:4px">Streak Records</div>
          <div style="font-size:12px;color:var(--green)">Best win: <strong>${c.maxWinStreak}</strong></div>
          <div style="font-size:12px;color:var(--red)">Worst loss: <strong>${c.maxLossStreak}</strong></div>
        </div>
      </div>
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;margin-bottom:6px">Probability Table (at your ${(c.wr*100).toFixed(0)}% WR)</div>
      <table style="width:100%;font-size:11px;border-collapse:collapse">
        <thead><tr style="color:var(--text3)">${['Streak','P(all wins)','P(all losses)'].map(h=>`<th style="padding:4px 6px;text-align:left">${h}</th>`).join('')}</tr></thead>
        <tbody>${streakProbs.map(p=>`<tr style="border-top:1px solid var(--border)">
          <td style="padding:4px 6px;font-weight:700">${p.n} in a row</td>
          <td style="padding:4px 6px;color:var(--green)">${p.winP}%</td>
          <td style="padding:4px 6px;color:var(--red)">${p.lossP}%</td>
        </tr>`).join('')}</tbody>
      </table>`;
  }

  // Position sizing deep stats
  const psPanel = G('tools-hub-panel-protools');
  if (!psPanel || G('tools-position-stats')) return;

  const qtys = trades.filter(t => t.qty > 0).map(t => parseFloat(t.qty));
  const sizeByOutcome = {
    win: mean(trades.filter(t => N(t) > 0 && t.qty).map(t => parseFloat(t.qty))),
    loss: mean(trades.filter(t => N(t) < 0 && t.qty).map(t => parseFloat(t.qty))),
  };
  const oversizeRatio = sizeByOutcome.win > 0 && sizeByOutcome.loss > 0 ? sizeByOutcome.loss / sizeByOutcome.win : 1;

  const div = document.createElement('div');
  div.id = 'tools-position-stats';
  div.innerHTML = card('📏 Position Sizing Analytics', 'Are you oversizing on losers? Consistency analysis', `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px">
      ${[
        ['Avg size on WINS', sizeByOutcome.win > 0 ? sizeByOutcome.win.toFixed(1) + ' qty' : '—', 'var(--green)'],
        ['Avg size on LOSSES', sizeByOutcome.loss > 0 ? sizeByOutcome.loss.toFixed(1) + ' qty' : '—', oversizeRatio > 1.15 ? 'var(--red)' : 'var(--green)'],
        ['Oversize ratio', oversizeRatio.toFixed(2) + 'x', oversizeRatio > 1.15 ? 'var(--red)' : 'var(--green)'],
        ['Size consistency', c.sizeConsistency.toFixed(0) + '/100', c.sizeConsistency >= 70 ? 'var(--green)' : 'var(--gold)'],
        ['Recommended Kelly', c.kelly.toFixed(1) + '%', 'var(--blue)'],
        ['Half Kelly', (c.kelly / 2).toFixed(1) + '%', 'var(--accent)'],
      ].map(([l, v, col]) => `<div style="background:var(--bg4);border-radius:var(--radius-sm);padding:12px;border:1px solid var(--border)">
        <div style="font-size:10px;color:var(--text3);margin-bottom:5px">${l}</div>
        <div style="font-size:18px;font-weight:800;color:${col}">${v}</div>
      </div>`).join('')}
    </div>
    ${oversizeRatio > 1.15 ? `<div style="margin-top:10px;padding:10px 12px;background:rgba(255,68,102,0.1);border:1px solid rgba(255,68,102,0.3);border-radius:var(--radius-sm);font-size:12px;color:var(--red)">⚠️ You trade ${((oversizeRatio - 1) * 100).toFixed(0)}% larger on losing trades than winning ones. This is the #1 account killer. Apply uniform sizing.</div>` : ''}`);
  psPanel.appendChild(div);
}

/* ════════════════════════════════════════════════════════════════
   MASTER RENDER — called on each page nav
════════════════════════════════════════════════════════════════ */
function renderInsightsForPage(page) {
  const trades = (window.getTrades || (() => { try { return JSON.parse(localStorage.getItem('tradebook_trades') || '[]'); } catch { return []; } }))();
  if (!trades.length && page !== 'settings') return;
  if (page === 'dashboard') injectDashboardInsights(trades);
  else if (page === 'journal') injectJournalInsights(trades);
  else if (page === 'analytics-hub') injectAnalyticsDeep(trades);
  else if (page === 'psych-hub') injectPsychInsights(trades);
  else if (page === 'tools-hub') injectToolsInsights(trades);
}

/* Hook into navigation event */
document.addEventListener('tb:navigate', e => {
  setTimeout(() => renderInsightsForPage(e.detail.page), 350);
});

/* Also render on initial load */
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => renderInsightsForPage('dashboard'), 900);
  setTimeout(() => renderInsightsForPage('journal'), 1000);
});

/* Re-render after trade saves */
const origSaveTrades = window.saveTrades;
if (typeof origSaveTrades === 'function') {
  window.saveTrades = function (t) {
    origSaveTrades(t);
    setTimeout(() => {
      const activePage = document.querySelector('.nav-item.active')?.dataset?.page || 'dashboard';
      renderInsightsForPage(activePage);
    }, 400);
  };
}

window.renderInsightsForPage = renderInsightsForPage;

})();
