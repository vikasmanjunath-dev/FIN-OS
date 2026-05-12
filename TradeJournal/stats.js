/* ═══════════════════════════════════════════════════════════
   TRADEBOOK PRO — STATS.JS
   Adds from screenshots:
   • Long vs Short performance cards
   • Day Performance horizontal bars
   • Top Symbols leaderboard
   • Full comprehensive statistics table (30+ metrics)
   • Month best/worst/average cards
   All injected into Analytics Hub Overview tab
   ═══════════════════════════════════════════════════════════ */
'use strict';

(function () {

  /* ── helpers ────────────────────────────────────────────── */
  function T() { try { return JSON.parse(localStorage.getItem('tradebook_trades') || '[]'); } catch { return []; } }
  const N = t => parseFloat(t.net) || 0;
  const fmt = v => {
    const a = Math.abs(v);
    const s = v < 0 ? '-' : '';
    if (a >= 1e5) return s + '₹' + (a / 1e5).toFixed(1) + 'L';
    if (a >= 1000) return s + '₹' + (a / 1000).toFixed(1) + 'K';
    return s + '₹' + a.toFixed(2);
  };
  const fmtS = v => (v >= 0 ? '+' : '') + fmt(v);
  const fmtTime = mins => {
    if (!mins || mins <= 0) return '—';
    if (mins >= 60) return `${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m`;
    return `${Math.round(mins)}m`;
  };
  function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
  function getDuration(t) {
    if (!t.entryTime || !t.exitTime) return null;
    const [eh, em] = t.entryTime.split(':').map(Number);
    const [xh, xm] = t.exitTime.split(':').map(Number);
    const d = (xh * 60 + xm) - (eh * 60 + em);
    return d > 0 ? d : null;
  }

  /* ── DOM injection helper ───────────────────────────────── */
  function injectBefore(anchorId, id, html) {
    if (document.getElementById(id)) {
      document.getElementById(id).innerHTML = html;
      return;
    }
    const anchor = document.getElementById(anchorId);
    if (!anchor) return;
    const div = document.createElement('div');
    div.id = id;
    div.innerHTML = html;
    anchor.parentNode.insertBefore(div, anchor);
  }

  function injectAfter(anchorId, id, html) {
    if (document.getElementById(id)) {
      document.getElementById(id).innerHTML = html;
      return;
    }
    const anchor = document.getElementById(anchorId);
    if (!anchor) return;
    const div = document.createElement('div');
    div.id = id;
    div.innerHTML = html;
    anchor.parentNode.insertBefore(div, anchor.nextSibling);
  }

  function appendTo(parentId, id, html) {
    if (document.getElementById(id)) {
      document.getElementById(id).innerHTML = html;
      return;
    }
    const parent = document.getElementById(parentId);
    if (!parent) return;
    const div = document.createElement('div');
    div.id = id;
    div.innerHTML = html;
    parent.appendChild(div);
  }

  /* ════════════════════════════════════════════════════════
     MASTER COMPUTE — everything in one pass
  ════════════════════════════════════════════════════════ */
  function compute(trades) {
    const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
    const wins = trades.filter(t => N(t) > 0);
    const losses = trades.filter(t => N(t) < 0);
    const bes = trades.filter(t => N(t) === 0);

    const totalPnl = trades.reduce((s, t) => s + N(t), 0);
    const totalGross = trades.reduce((s, t) => s + (parseFloat(t.gross) || N(t)), 0);
    const totalCommissions = trades.reduce((s, t) => s + (parseFloat(t.brokerage) || 0), 0);
    const totalTax = trades.reduce((s, t) => s + (parseFloat(t.tax) || 0), 0);

    // Long vs Short
    const longs = trades.filter(t => t.direction === 'Long');
    const shorts = trades.filter(t => t.direction === 'Short');
    const longPnl = longs.reduce((s, t) => s + N(t), 0);
    const shortPnl = shorts.reduce((s, t) => s + N(t), 0);
    const longWR = longs.length ? longs.filter(t => N(t) > 0).length / longs.length * 100 : 0;
    const shortWR = shorts.length ? shorts.filter(t => N(t) > 0).length / shorts.length * 100 : 0;

    // Day of week
    const byDay = Array(7).fill(null).map(() => ({ pnl: 0, count: 0, wins: 0, losses: 0 }));
    trades.forEach(t => {
      const d = new Date(t.date + 'T00:00:00').getDay();
      byDay[d].pnl += N(t); byDay[d].count++;
      if (N(t) > 0) byDay[d].wins++; else if (N(t) < 0) byDay[d].losses++;
    });

    // Monthly
    const byMonth = {};
    trades.forEach(t => {
      const k = t.date?.slice(0, 7) || '';
      if (!byMonth[k]) byMonth[k] = { pnl: 0, count: 0 };
      byMonth[k].pnl += N(t); byMonth[k].count++;
    });
    const monthVals = Object.values(byMonth).map(m => m.pnl);
    const bestMonth = Object.entries(byMonth).sort((a, b) => b[1].pnl - a[1].pnl)[0];
    const worstMonth = Object.entries(byMonth).sort((a, b) => a[1].pnl - b[1].pnl)[0];
    const avgMonthly = monthVals.length ? mean(monthVals) : 0;

    // Daily stats
    const dailyMap = {};
    trades.forEach(t => { dailyMap[t.date] = (dailyMap[t.date] || 0) + N(t); });
    const dailyVals = Object.values(dailyMap);
    const winDays = dailyVals.filter(v => v > 0).length;
    const lossDays = dailyVals.filter(v => v < 0).length;
    const beDays = dailyVals.filter(v => v === 0).length;
    const avgDailyPnl = mean(dailyVals);
    const avgWinDay = mean(dailyVals.filter(v => v > 0));
    const avgLossDay = mean(dailyVals.filter(v => v < 0));
    const largestProfitDay = Math.max(...dailyVals, 0);
    const largestLossDay = Math.min(...dailyVals, 0);

    // Consecutive days
    const sortedDays = Object.entries(dailyMap).sort((a, b) => a[0].localeCompare(b[0]));
    let maxWinDays = 0, maxLossDays = 0, curW = 0, curL = 0;
    sortedDays.forEach(([, v]) => {
      if (v > 0) { curW++; curL = 0; maxWinDays = Math.max(maxWinDays, curW); }
      else if (v < 0) { curL++; curW = 0; maxLossDays = Math.max(maxLossDays, curL); }
      else { curW = 0; curL = 0; }
    });

    // Consecutive trades
    let maxWinTrades = 0, maxLossTrades = 0, curWT = 0, curLT = 0;
    sorted.forEach(t => {
      if (N(t) > 0) { curWT++; curLT = 0; maxWinTrades = Math.max(maxWinTrades, curWT); }
      else if (N(t) < 0) { curLT++; curWT = 0; maxLossTrades = Math.max(maxLossTrades, curLT); }
      else { curWT = 0; curLT = 0; }
    });

    // Hold times
    const allTimes = trades.map(getDuration).filter(Boolean);
    const winTimes = wins.map(getDuration).filter(Boolean);
    const lossTimes = losses.map(getDuration).filter(Boolean);

    // Max DD
    let peak = 0, eq = 0, maxDD = 0;
    const capital = parseFloat((window.getSettings?.() || JSON.parse(localStorage.getItem('tradebook_settings') || '{}')).capital) || 100000;
    sorted.forEach(t => { eq += N(t); if (eq > peak) peak = eq; maxDD = Math.max(maxDD, peak - eq); });
    const maxDDpct = capital > 0 ? maxDD / capital * 100 : 0;

    // Symbols
    const bySymbol = {};
    trades.forEach(t => {
      if (!t.symbol) return;
      if (!bySymbol[t.symbol]) bySymbol[t.symbol] = { pnl: 0, count: 0, wins: 0 };
      bySymbol[t.symbol].pnl += N(t); bySymbol[t.symbol].count++;
      if (N(t) > 0) bySymbol[t.symbol].wins++;
    });

    // Trade expectancy
    const avgWin = wins.length ? mean(wins.map(N)) : 0;
    const avgLoss = losses.length ? mean(losses.map(t => Math.abs(N(t)))) : 0;
    const wr = trades.length ? wins.length / trades.length : 0;
    const expectancy = wr * avgWin - (1 - wr) * avgLoss;

    return {
      sorted, wins, losses, bes,
      totalPnl, totalGross, totalCommissions, totalTax,
      longs, shorts, longPnl, shortPnl, longWR, shortWR,
      byDay, byMonth, bestMonth, worstMonth, avgMonthly,
      dailyVals, winDays, lossDays, beDays,
      avgDailyPnl, avgWinDay, avgLossDay, largestProfitDay, largestLossDay,
      maxWinDays, maxLossDays, maxWinTrades, maxLossTrades,
      allTimes, winTimes, lossTimes,
      maxDD, maxDDpct,
      bySymbol, avgWin, avgLoss, wr, expectancy, capital
    };
  }

  /* ════════════════════════════════════════════════════════
     1. LONG vs SHORT CARDS
  ════════════════════════════════════════════════════════ */
  function renderLongShort(c) {
    const trades = T();
    const { longs, shorts, longPnl, shortPnl, longWR, shortWR } = compute(trades);

    const card = (dir, trades, pnl, wr, icon, color) => `
      <div style="background:var(--bg4);border:1px solid var(--border);border-radius:var(--radius-sm);padding:16px 20px;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
          <span style="font-size:18px">${icon}</span>
          <span style="font-size:14px;font-weight:700;color:var(--text)">${dir}</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center">
          <div>
            <div style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">TRADES</div>
            <div style="font-size:20px;font-weight:800;color:var(--text)">${trades}</div>
          </div>
          <div>
            <div style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">P&L</div>
            <div style="font-size:20px;font-weight:800;color:${pnl >= 0 ? 'var(--green)' : 'var(--red)'};font-family:var(--font-mono)">${fmt(pnl)}</div>
          </div>
          <div>
            <div style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">WIN %</div>
            <div style="font-size:20px;font-weight:800;color:${wr >= 50 ? 'var(--green)' : 'var(--red)'}">${wr.toFixed(1)}%</div>
          </div>
        </div>
      </div>`;

    c.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div>
          <div style="font-size:15px;font-weight:700;color:var(--text)">↕ Long vs Short</div>
          <div style="font-size:12px;color:var(--text3);margin-top:2px">Performance by trade direction</div>
        </div>
        ${trades.length ? `<div style="font-size:11px;color:var(--text3)">${longs.length}L · ${shorts.length}S</div>` : ''}
      </div>
      ${!trades.length
        ? `<div style="text-align:center;padding:24px;color:var(--text3);font-size:13px">No trades logged yet</div>`
        : card('Long', longs.length, longPnl, longWR, '📈', 'var(--green)') +
          card('Short', shorts.length, shortPnl, shortWR, '📉', 'var(--red)')}`;
  }

  /* ════════════════════════════════════════════════════════
     2. DAY PERFORMANCE — horizontal bars
  ════════════════════════════════════════════════════════ */
  function renderDayPerformance(c) {
    const trades = T();
    const { byDay } = compute(trades);
    const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    // Mon=1..Sun=0 in JS Date, remap to Mon=0..Sun=6
    const reordered = [1, 2, 3, 4, 5, 6, 0].map(i => byDay[i]);
    const maxAbs = Math.max(...reordered.map(d => Math.abs(d.pnl)), 1);

    c.innerHTML = `
      <div style="margin-bottom:14px">
        <div style="font-size:15px;font-weight:700;color:var(--text)">📅 Day Performance</div>
        <div style="font-size:12px;color:var(--text3);margin-top:2px">Find your best trading days</div>
      </div>
      ${DAYS.map((day, i) => {
        const d = reordered[i];
        const barW = d.count ? Math.max(4, Math.abs(d.pnl) / maxAbs * 100) : 3;
        const color = d.pnl > 0 ? 'var(--green)' : d.pnl < 0 ? 'var(--red)' : 'var(--text3)';
        const avg = d.count ? d.pnl / d.count : 0;
        const wr = d.count ? d.wins / d.count * 100 : 0;
        return `
          <div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border)" title="${day}: ${d.count} trades · Avg ${fmtS(avg)} · ${wr.toFixed(0)}% WR">
            <div style="width:28px;font-size:12px;font-weight:600;color:var(--text2);flex-shrink:0">${day}</div>
            <div style="flex:1;height:6px;background:var(--bg5);border-radius:3px;overflow:hidden;position:relative">
              <div style="height:100%;width:${barW}%;background:${color};border-radius:3px;transition:width .6s ease"></div>
            </div>
            <div style="min-width:72px;text-align:right;font-family:var(--font-mono);font-size:12px;font-weight:700;color:${d.count ? color : 'var(--text3)'}">
              ${d.count ? fmtS(d.pnl) : '—'}
            </div>
          </div>`;
      }).join('')}`;
  }

  /* ════════════════════════════════════════════════════════
     3. TOP SYMBOLS
  ════════════════════════════════════════════════════════ */
  function renderTopSymbols(c) {
    const trades = T();
    const { bySymbol } = compute(trades);

    const symbols = Object.entries(bySymbol)
      .map(([sym, d]) => ({
        sym, pnl: d.pnl, count: d.count,
        wr: d.count ? d.wins / d.count * 100 : 0,
        avg: d.count ? d.pnl / d.count : 0
      }))
      .sort((a, b) => b.pnl - a.pnl);

    c.innerHTML = `
      <div style="margin-bottom:14px">
        <div style="font-size:15px;font-weight:700;color:var(--text)">🏆 Top Symbols</div>
        <div style="font-size:12px;color:var(--text3);margin-top:2px">Best performing assets</div>
      </div>
      ${!symbols.length
        ? `<div style="text-align:center;padding:24px;color:var(--text3);font-size:13px">No symbol data yet</div>`
        : `<div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead><tr style="border-bottom:1px solid var(--border)">
              ${['Symbol','Trades','Win %','Net P&L','Avg/Trade'].map(h => `<th style="padding:6px 10px;text-align:${h==='Symbol'?'left':'right'};font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.06em">${h}</th>`).join('')}
            </tr></thead>
            <tbody>
              ${symbols.slice(0, 10).map((s, i) => `
                <tr style="border-bottom:1px solid var(--border)" onclick="window.renderSymbolDive && (document.getElementById('symbol-dive-select') ? (document.getElementById('symbol-dive-select').value='${s.sym}',window.renderSymbolDive()) : null)" style="cursor:pointer">
                  <td style="padding:9px 10px;font-weight:700;color:var(--accent)">
                    <span style="color:var(--text3);font-size:10px;margin-right:6px">${i + 1}</span>${s.sym}
                  </td>
                  <td style="padding:9px 10px;text-align:right;color:var(--text2)">${s.count}</td>
                  <td style="padding:9px 10px;text-align:right;color:${s.wr >= 50 ? 'var(--green)' : 'var(--red)'}">${s.wr.toFixed(1)}%</td>
                  <td style="padding:9px 10px;text-align:right;font-family:var(--font-mono);font-weight:700;color:${s.pnl >= 0 ? 'var(--green)' : 'var(--red)'}">
                    ${fmtS(s.pnl)}
                  </td>
                  <td style="padding:9px 10px;text-align:right;font-family:var(--font-mono);color:${s.avg >= 0 ? 'var(--green)' : 'var(--red)'}">
                    ${fmtS(s.avg)}
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`}`;
  }

  /* ════════════════════════════════════════════════════════
     4. MONTH BEST / WORST / AVERAGE CARDS
  ════════════════════════════════════════════════════════ */
  function renderMonthCards(c) {
    const trades = T();
    const { bestMonth, worstMonth, avgMonthly, byMonth } = compute(trades);
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const fmtMonth = k => k ? MONTHS[parseInt(k.slice(5)) - 1] + ' \'' + k.slice(2, 4) : '—';

    const mc = (label, val, sub, color) => `
      <div style="background:var(--bg4);border:1px solid var(--border);border-radius:var(--radius-sm);padding:16px 20px;flex:1;min-width:140px">
        <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">${label}</div>
        <div style="font-family:var(--font-display);font-size:22px;font-weight:800;color:${color};line-height:1">${val}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:5px">${sub}</div>
      </div>`;

    c.innerHTML = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:0">
        ${mc('Best Month', bestMonth ? fmt(bestMonth[1].pnl) : '—', bestMonth ? fmtMonth(bestMonth[0]) : 'No data', 'var(--green)')}
        ${mc('Worst Month', worstMonth ? fmt(worstMonth[1].pnl) : '—', worstMonth ? fmtMonth(worstMonth[0]) : 'No data', 'var(--red)')}
        ${mc('Average', fmt(avgMonthly), 'per month', avgMonthly >= 0 ? 'var(--green)' : 'var(--red)')}
        ${mc('Months Traded', Object.keys(byMonth).length + '', 'total months', 'var(--blue)')}
      </div>`;
  }

  /* ════════════════════════════════════════════════════════
     5. COMPREHENSIVE STATISTICS TABLE
  ════════════════════════════════════════════════════════ */
  function renderStatsTable(c) {
    const trades = T();
    if (!trades.length) {
      c.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text3);font-size:13px">Log trades to see statistics</div>`;
      return;
    }

    const {
      wins, losses, bes,
      totalPnl, totalGross, totalCommissions, totalTax,
      winDays, lossDays, beDays,
      avgDailyPnl, avgWinDay, avgLossDay, largestProfitDay, largestLossDay,
      maxWinDays, maxLossDays, maxWinTrades, maxLossTrades,
      allTimes, winTimes, lossTimes,
      maxDD, maxDDpct, dailyVals,
      avgWin, avgLoss, wr, expectancy, bySymbol
    } = compute(trades);

    const rrRatio = avgLoss > 0 ? avgWin / avgLoss : 0;
    const pf = avgLoss > 0 && wr > 0 ? (avgWin * wr) / (avgLoss * (1 - wr)) : 0;
    const totalTradingDays = dailyVals.length;
    const openTrades = trades.filter(t => !t.exitTime && !t.exit).length;

    // row builder
    const row = (label, val, color = 'var(--text)') =>
      `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:9px 14px;font-size:12px;color:var(--text2)">${label}</td>
        <td style="padding:9px 14px;font-size:12px;font-weight:700;color:${color};text-align:right;font-family:var(--font-mono)">${val}</td>
      </tr>`;

    const pnlColor = v => parseFloat(v) >= 0 ? 'var(--green)' : 'var(--red)';
    const cntColor = v => parseInt(v) > 0 ? 'var(--green)' : parseInt(v) < 0 ? 'var(--red)' : 'var(--text)';
    const green = 'var(--green)', red = 'var(--red)', blue = 'var(--blue)', text = 'var(--text)';

    const col = (rows) => `
      <table style="width:100%;border-collapse:collapse">
        <tbody>${rows.join('')}</tbody>
      </table>`;

    const left = [
      row('Total P&L', fmt(totalPnl), pnlColor(totalPnl)),
      row('Total gross P&L', fmt(totalGross), pnlColor(totalGross)),
      row('Total commissions', fmt(totalCommissions), red),
      row('Total charges / tax', fmt(totalTax), red),
      row('Average daily volume', trades.length ? (trades.length / Math.max(1, totalTradingDays)).toFixed(2) : '0.00', text),
      row('Average winning trade', fmt(avgWin), green),
      row('Average losing trade', fmt(avgLoss), red),
      row('Total number of trades', trades.length + '', text),
      row('Number of winning trades', wins.length + '', green),
      row('Number of losing trades', losses.length + '', red),
      row('Number of break even trades', bes.length + '', text),
      row('Max consecutive wins', maxWinTrades + '', green),
      row('Max consecutive losses', maxLossTrades + '', red),
      row('R:R Ratio', rrRatio.toFixed(2) + ':1', rrRatio >= 2 ? green : rrRatio >= 1 ? blue : red),
      row('Profit Factor', pf > 0 ? pf.toFixed(2) : '0.00', pf >= 2 ? green : pf >= 1 ? blue : red),
      row('Expectancy / trade', fmtS(expectancy), pnlColor(expectancy)),
      row('Largest profit', fmt(Math.max(...trades.map(N), 0)), green),
      row('Largest loss', fmt(Math.min(...trades.map(N), 0)), red),
      row('Avg hold time (All)', fmtTime(mean(allTimes)), text),
      row('Avg hold time (Winners)', fmtTime(mean(winTimes)), green),
      row('Avg hold time (Losers)', fmtTime(mean(lossTimes)), red),
    ];

    const right = [
      row('Open trades', openTrades + '', openTrades > 0 ? blue : text),
      row('Total trading days', totalTradingDays + '', text),
      row('Winning days', winDays + '', green),
      row('Losing days', lossDays + '', red),
      row('Breakeven days', beDays + '', text),
      row('Max consecutive winning days', maxWinDays + '', green),
      row('Max consecutive losing days', maxLossDays + '', red),
      row('Average daily P&L', fmt(avgDailyPnl), pnlColor(avgDailyPnl)),
      row('Average winning day P&L', fmt(avgWinDay), green),
      row('Average losing day P&L', fmt(avgLossDay), red),
      row('Largest profitable day', fmt(largestProfitDay), green),
      row('Largest losing day', fmt(largestLossDay), red),
      row('Trade expectancy', fmtS(expectancy), pnlColor(expectancy)),
      row('Max drawdown', fmt(maxDD), red),
      row('Max drawdown %', maxDDpct.toFixed(1) + '%', maxDDpct > 20 ? red : maxDDpct > 10 ? 'var(--gold)' : green),
      row('Win rate', (wr * 100).toFixed(1) + '%', wr >= 0.55 ? green : wr >= 0.4 ? 'var(--gold)' : red),
      row('Symbols traded', Object.keys(bySymbol).length + '', text),
      row('Avg quality score', trades.filter(t => t.qualityScore).length
        ? (trades.filter(t => t.qualityScore).reduce((s, t) => s + t.qualityScore, 0) / trades.filter(t => t.qualityScore).length).toFixed(1) + '/100'
        : '—', blue),
      row('Disciplined trades', (() => { const d = trades.filter(t => t.discipline); return d.length ? d.filter(t => t.discipline === 'followed').length + '/' + d.length : '—'; })(), green),
      row('Revenge trades', trades.filter(t => t.isRevenge === true || t.isRevenge === 'true').length + '', red),
    ];

    c.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0">
        <div style="border-right:1px solid var(--border)">${col(left)}</div>
        <div>${col(right)}</div>
      </div>`;
  }

  /* ════════════════════════════════════════════════════════
     INJECT ALL SECTIONS INTO ANALYTICS OVERVIEW
  ════════════════════════════════════════════════════════ */
  function injectAll() {
    const overview = document.getElementById('analytics-hub-panel-overview');
    if (!overview) return;

    // ── 1. Month cards — inject BEFORE the first chart row ──
    const firstChartGrid = overview.querySelector('.charts-grid-2');
    if (firstChartGrid && !document.getElementById('month-cards-section')) {
      const d = document.createElement('div');
      d.id = 'month-cards-section';
      d.style.marginBottom = '16px';
      firstChartGrid.parentNode.insertBefore(d, firstChartGrid);
      renderMonthCards(d);
    }

    // ── 2. Long/Short + Day Performance — 2-col grid ──
    if (!document.getElementById('long-short-day-section')) {
      const d = document.createElement('div');
      d.id = 'long-short-day-section';
      d.className = 'charts-grid-2';
      d.style.marginTop = '16px';
      d.innerHTML = `
        <div class="chart-card" id="long-short-card"></div>
        <div class="chart-card" id="day-performance-card"></div>`;
      // Insert after the 2nd charts-grid-2
      const grids = overview.querySelectorAll('.charts-grid-2');
      const anchor = grids[1] || grids[0];
      if (anchor) anchor.after(d);
      else overview.appendChild(d);
    }
    renderLongShort(document.getElementById('long-short-card'));
    renderDayPerformance(document.getElementById('day-performance-card'));

    // ── 3. Top Symbols — after long/short ──
    if (!document.getElementById('top-symbols-section')) {
      const d = document.createElement('div');
      d.id = 'top-symbols-section';
      d.className = 'chart-card full-width';
      d.style.marginTop = '16px';
      const ls = document.getElementById('long-short-day-section');
      if (ls) ls.after(d); else overview.appendChild(d);
    }
    renderTopSymbols(document.getElementById('top-symbols-section'));

    // ── 4. Comprehensive Stats Table — near end of overview ──
    if (!document.getElementById('stats-table-section')) {
      const d = document.createElement('div');
      d.id = 'stats-table-section';
      d.className = 'chart-card full-width';
      d.style.marginTop = '16px';
      d.innerHTML = `
        <div class="chart-header" style="margin-bottom:16px">
          <div>
            <div class="chart-title">📋 Full Statistics</div>
            <div class="chart-sub">Every metric that matters — 40+ statistics in one place</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <select id="stats-filter-select" class="form-input" style="font-size:11px;padding:5px 10px;max-width:160px" onchange="window._filterStatsTable(this.value)">
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="year">This Year</option>
            </select>
          </div>
        </div>
        <div id="stats-table-body"></div>`;
      // Append to overview before the closing comment
      const taxVisual = document.getElementById('tax-visual');
      if (taxVisual) taxVisual.closest('.chart-card')?.after(d);
      else overview.appendChild(d);
    }
    renderStatsTable(document.getElementById('stats-table-body'));
  }

  /* ── Filter handler ──────────────────────────────────── */
  window._filterStatsTable = function (filter) {
    const now = new Date();
    const body = document.getElementById('stats-table-body');
    if (!body) return;
    let trades = T();
    const today = now.toISOString().split('T')[0];
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay() + 1);
    const weekStr = weekStart.toISOString().split('T')[0];
    const monthStr = today.slice(0, 7);
    const yearStr = today.slice(0, 4);
    if (filter === 'today') trades = trades.filter(t => t.date === today);
    else if (filter === 'week') trades = trades.filter(t => t.date >= weekStr);
    else if (filter === 'month') trades = trades.filter(t => t.date?.startsWith(monthStr));
    else if (filter === 'year') trades = trades.filter(t => t.date?.startsWith(yearStr));

    if (!trades.length) {
      body.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text3);font-size:13px">No trades in this period</div>`;
      return;
    }
    // Re-run with filtered trades — temporarily override T()
    const origT = window.T;
    const savedTrades = localStorage.getItem('tradebook_trades');
    localStorage.setItem('_temp_trades', JSON.stringify(trades));
    const filteredCompute = compute(trades);
    renderFilteredStats(body, filteredCompute, trades);
  };

  function renderFilteredStats(c, data, trades) {
    const {
      wins, losses, bes,
      totalPnl, totalGross, totalCommissions, totalTax,
      winDays, lossDays, beDays,
      avgDailyPnl, avgWinDay, avgLossDay, largestProfitDay, largestLossDay,
      maxWinDays, maxLossDays, maxWinTrades, maxLossTrades,
      allTimes, winTimes, lossTimes,
      maxDD, maxDDpct, dailyVals,
      avgWin, avgLoss, wr, expectancy, bySymbol
    } = data;
    const pf = avgLoss > 0 && wr > 0 ? (avgWin * wr) / (avgLoss * (1 - wr)) : 0;
    const rrRatio = avgLoss > 0 ? avgWin / avgLoss : 0;
    const totalTradingDays = dailyVals.length;
    const openTrades = trades.filter(t => !t.exitTime && !t.exit).length;
    const green = 'var(--green)', red = 'var(--red)', blue = 'var(--blue)', text = 'var(--text)';
    const pnlColor = v => parseFloat(v) >= 0 ? green : red;
    const row = (label, val, color = text) =>
      `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:9px 14px;font-size:12px;color:var(--text2)">${label}</td>
        <td style="padding:9px 14px;font-size:12px;font-weight:700;color:${color};text-align:right;font-family:var(--font-mono)">${val}</td>
      </tr>`;
    const col = rows => `<table style="width:100%;border-collapse:collapse"><tbody>${rows.join('')}</tbody></table>`;

    c.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:0">
      <div style="border-right:1px solid var(--border)">${col([
        row('Total P&L', fmt(totalPnl), pnlColor(totalPnl)),
        row('Total gross P&L', fmt(totalGross), pnlColor(totalGross)),
        row('Total charges', fmt(totalTax), red),
        row('Average winning trade', fmt(avgWin), green),
        row('Average losing trade', fmt(avgLoss), red),
        row('Total trades', trades.length + '', text),
        row('Winning trades', wins.length + '', green),
        row('Losing trades', losses.length + '', red),
        row('Breakeven trades', bes.length + '', text),
        row('Max consecutive wins', maxWinTrades + '', green),
        row('Max consecutive losses', maxLossTrades + '', red),
        row('Profit Factor', pf.toFixed(2), pf >= 2 ? green : pf >= 1 ? blue : red),
        row('R:R Ratio', rrRatio.toFixed(2) + ':1', rrRatio >= 2 ? green : blue),
        row('Expectancy', fmtS(expectancy), pnlColor(expectancy)),
        row('Largest profit', fmt(Math.max(...trades.map(t => parseFloat(t.net) || 0), 0)), green),
        row('Largest loss', fmt(Math.min(...trades.map(t => parseFloat(t.net) || 0), 0)), red),
        row('Avg hold time (All)', fmtTime(mean(allTimes)), text),
        row('Avg hold time (Winners)', fmtTime(mean(winTimes)), green),
        row('Avg hold time (Losers)', fmtTime(mean(lossTimes)), red),
      ])}</div>
      <div>${col([
        row('Open trades', openTrades + '', openTrades > 0 ? blue : text),
        row('Total trading days', totalTradingDays + '', text),
        row('Winning days', winDays + '', green),
        row('Losing days', lossDays + '', red),
        row('Breakeven days', beDays + '', text),
        row('Max consecutive winning days', maxWinDays + '', green),
        row('Max consecutive losing days', maxLossDays + '', red),
        row('Average daily P&L', fmt(avgDailyPnl), pnlColor(avgDailyPnl)),
        row('Average winning day P&L', fmt(avgWinDay), green),
        row('Average losing day P&L', fmt(avgLossDay), red),
        row('Largest profitable day', fmt(largestProfitDay), green),
        row('Largest losing day', fmt(largestLossDay), red),
        row('Max drawdown', fmt(maxDD), red),
        row('Max drawdown %', maxDDpct.toFixed(1) + '%', maxDDpct > 20 ? red : maxDDpct > 10 ? 'var(--gold)' : green),
        row('Win rate', (wr * 100).toFixed(1) + '%', wr >= 0.55 ? green : wr >= 0.4 ? 'var(--gold)' : red),
        row('Symbols traded', Object.keys(bySymbol).length + '', text),
        row('Commissions', fmt(totalCommissions), red),
        row('Disciplined %', (() => { const d = trades.filter(t => t.discipline); return d.length ? (d.filter(t => t.discipline === 'followed').length / d.length * 100).toFixed(0) + '%' : '—'; })(), green),
        row('Revenge trades', trades.filter(t => t.isRevenge === true || t.isRevenge === 'true').length + '', red),
      ])}</div>
    </div>`;
  }

  /* ════════════════════════════════════════════════════════
     HOOK INTO NAVIGATION + AUTO-REFRESH
  ════════════════════════════════════════════════════════ */
  document.addEventListener('tb:navigate', function (e) {
    if (e.detail.page === 'analytics-hub') {
      setTimeout(injectAll, 300);
    }
  });

  // Also refresh when analytics overview tab is clicked
  window.addEventListener('load', function () {
    const origSwitch = window.switchHubTab;
    if (typeof origSwitch === 'function') {
      window.switchHubTab = function (hub, panel, btn) {
        origSwitch(hub, panel, btn);
        if (hub === 'analytics-hub' && panel === 'overview') {
          setTimeout(injectAll, 150);
        }
      };
    }

    // Refresh after any trade save
    const origSave = window.saveTrades;
    if (typeof origSave === 'function') {
      window.saveTrades = function (trades) {
        origSave(trades);
        // Debounce refresh
        clearTimeout(window._statsRefreshTimer);
        window._statsRefreshTimer = setTimeout(function () {
          if (document.getElementById('stats-table-body')) {
            renderStatsTable(document.getElementById('stats-table-body'));
          }
          if (document.getElementById('long-short-card')) {
            renderLongShort(document.getElementById('long-short-card'));
          }
          if (document.getElementById('day-performance-card')) {
            renderDayPerformance(document.getElementById('day-performance-card'));
          }
          if (document.getElementById('top-symbols-section')) {
            renderTopSymbols(document.getElementById('top-symbols-section'));
          }
          if (document.getElementById('month-cards-section')) {
            renderMonthCards(document.getElementById('month-cards-section'));
          }
        }, 400);
      };
    }
  });

  // Initial render on DOM ready
  document.addEventListener('DOMContentLoaded', function () {
    // Delay to let other scripts initialise first
    setTimeout(injectAll, 1000);
  });

  window._statsInjectAll = injectAll;

})();
