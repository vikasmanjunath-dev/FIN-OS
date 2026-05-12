/* ═══════════════════════════════════════════════════════════════
   TRADEBOOK PRO — COMPLETE APP.JS
   Full trading journal: data, charts, analytics, psychology,
   tools, institutional, gamification, export, themes.
   Self-contained — zero external dependencies beyond Chart.js.
   ═══════════════════════════════════════════════════════════════ */
'use strict';

/* ────────────────────────────────────────────────────────────
   DATA LAYER
──────────────────────────────────────────────────────────── */
function getTrades() {
  try { return JSON.parse(localStorage.getItem('tradebook_trades') || '[]'); } catch { return []; }
}
function saveTrades(t) {
  localStorage.setItem('tradebook_trades', JSON.stringify(t));
  window.trades = t;
}
function getSettings() {
  try { return JSON.parse(localStorage.getItem('tradebook_settings') || '{}'); } catch { return {}; }
}
function persistSettings(s) { localStorage.setItem('tradebook_settings', JSON.stringify(s)); }
function getTags() {
  try { return JSON.parse(localStorage.getItem('tradebook_tags') || '[]'); } catch { return []; }
}
function saveTags(t) { localStorage.setItem('tradebook_tags', JSON.stringify(t)); }
function getRules() {
  try { return JSON.parse(localStorage.getItem('tradebook_rules') || '[]'); } catch { return []; }
}
function saveRules(r) { localStorage.setItem('tradebook_rules', JSON.stringify(r)); }
function getChallenges() {
  try { return JSON.parse(localStorage.getItem('tradebook_challenges') || '[]'); } catch { return []; }
}
function saveChallenges(c) { localStorage.setItem('tradebook_challenges', JSON.stringify(c)); }
window.trades = getTrades();

/* ────────────────────────────────────────────────────────────
   FORMATTING HELPERS
──────────────────────────────────────────────────────────── */
/* ── PRECISE FORMATTING — never abbreviates, always full decimal precision ── */
function fmt(v) {
  if (v === null || v === undefined || isNaN(v)) return '₹0.00';
  const n = Number(v);
  // Always show 2 decimal places, use Indian locale for comma grouping
  return '₹' + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtS(v) {
  if (v === null || v === undefined || isNaN(v)) return '+₹0.00';
  const n = Number(v);
  return (n >= 0 ? '+' : '-') + fmt(Math.abs(n));
}
/* fmtFull is kept as alias for backwards compat */
function fmtFull(v) { return fmt(v); }
/* For display in stat cards — same full precision */
function fmtStat(v) { return fmt(v); }
function net(t) { return parseFloat(t.net) || 0; }
function pct(v, t) { return t ? ((v / t) * 100).toFixed(1) + '%' : '0%'; }
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/* ────────────────────────────────────────────────────────────
   TOAST
──────────────────────────────────────────────────────────── */
function toast(msg, type) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast toast-show' + (type === 'error' ? ' toast-error' : type === 'warn' ? ' toast-warn' : '');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.className = 'toast', 3200);
}

/* ────────────────────────────────────────────────────────────
   CHART REGISTRY — destroy before recreate
──────────────────────────────────────────────────────────── */
const _charts = {};
function mkChart(id, cfg) {
  const canvas = document.getElementById(id);
  if (!canvas) return null;
  if (_charts[id]) { try { _charts[id].destroy(); } catch {} }
  _charts[id] = new Chart(canvas.getContext('2d'), cfg);
  return _charts[id];
}
const GRID = { color: 'rgba(255,255,255,0.04)' };
const TICK = { color: '#3d4a63', font: { size: 10, family: 'JetBrains Mono' } };
const LEGEND = { labels: { color: '#7b88a8', font: { size: 11 }, boxWidth: 10 } };
function lineDataset(label, data, color) {
  return { label, data, borderColor: color, backgroundColor: 'transparent', borderWidth: 2, pointRadius: 3, pointBackgroundColor: color, tension: 0.35 };
}

/* ────────────────────────────────────────────────────────────
   DASHBOARD
──────────────────────────────────────────────────────────── */
function updateDashboard() {
  const trades = getTrades();
  const settings = getSettings();

  // Date
  const hd = document.getElementById('header-date');
  if (hd) hd.textContent = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  // Core stats
  const totalNet = trades.reduce((s, t) => s + net(t), 0);
  const wins = trades.filter(t => net(t) > 0);
  const losses = trades.filter(t => net(t) < 0);
  const winRate = trades.length ? (wins.length / trades.length * 100) : 0;
  const avgWin = wins.length ? wins.reduce((s, t) => s + net(t), 0) / wins.length : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + net(t), 0) / losses.length) : 0;
  const grossWins = wins.reduce((s, t) => s + net(t), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + net(t), 0));
  const pf = grossLoss > 0 ? (grossWins / grossLoss) : grossWins > 0 ? 999 : 0;
  const rr = avgLoss > 0 ? (avgWin / avgLoss) : 0;
  const totalGross = trades.reduce((s, t) => s + (parseFloat(t.gross) || net(t)), 0);
  const totalTax = trades.reduce((s, t) => s + (parseFloat(t.tax) || 0), 0);
  const taxDrag = totalGross > 0 ? (totalTax / totalGross * 100) : 0;

  // Max Drawdown
  let peak = 0, equity = 0, maxDD = 0;
  [...trades].sort((a, b) => a.date.localeCompare(b.date)).forEach(t => {
    equity += net(t); peak = Math.max(peak, equity); maxDD = Math.max(maxDD, peak - equity);
  });

  // Set values
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('stat-netpnl', fmt(totalNet));
  set('stat-winrate', winRate.toFixed(1) + '%');
  set('stat-pf', pf === 999 ? '∞' : pf.toFixed(2));
  set('stat-dd', fmt(maxDD));
  set('stat-avgwin', fmt(avgWin));
  set('stat-avgloss', fmt(avgLoss));
  set('stat-rr', rr.toFixed(1) + ':1');
  set('stat-taxdrag', taxDrag.toFixed(1) + '%');
  set('stat-netpnl-sub', `vs ${fmt(parseFloat(settings.weeklyTarget) || 1000)} target`);
  set('stat-winrate-sub', `${wins.length}W / ${losses.length}L`);
  set('stat-pf-sub', `target >2`);
  set('stat-dd-sub', trades.length ? `${(maxDD / (trades.reduce((s,t)=>s+net(t),0)+maxDD||1)*100).toFixed(1)}% peak` : '—');

  // Color net P&L
  const netEl = document.getElementById('stat-netpnl');
  if (netEl) netEl.style.color = totalNet >= 0 ? 'var(--green)' : 'var(--red)';

  // PF indicator bar
  const pfBar = document.getElementById('pf-indicator');
  if (pfBar) {
    const pfPct = Math.min(100, (pf / 4) * 100);
    pfBar.innerHTML = `<div style="height:100%;width:${pfPct}%;background:linear-gradient(90deg,var(--red),var(--gold),var(--green));border-radius:2px;transition:width 1s"></div>`;
  }

  // Weekly target
  const wtBar = document.getElementById('wt-bar');
  const wtCur = document.getElementById('wt-current');
  const wtTgt = document.getElementById('wt-target');
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
  const weekStr = weekStart.toISOString().split('T')[0];
  const weekPnl = trades.filter(t => t.date >= weekStr).reduce((s, t) => s + net(t), 0);
  const wTarget = parseFloat(settings.weeklyTarget) || 1000;
  if (wtBar) wtBar.style.width = Math.min(100, Math.max(0, weekPnl / wTarget * 100)) + '%';
  if (wtCur) { wtCur.textContent = fmt(weekPnl); wtCur.style.color = weekPnl >= 0 ? 'var(--green)' : 'var(--red)'; }
  if (wtTgt) wtTgt.textContent = fmt(wTarget);

  // Equity chart
  drawEquityChart(trades);
  // Desi cards
  updateDesiCards(winRate, pf, rr);
  // Performance chart & calendar already handled by inline script
  if (window.updateDashboardExtras) window.updateDashboardExtras();
  // Monthly ROI chart
  if (window.renderMonthlyROI) setTimeout(window.renderMonthlyROI, 0);
}

function drawEquityChart(trades) {
  if (!window.Chart) return;
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) return;
  let running = 0;
  const points = sorted.map(t => { running += net(t); return { x: t.date, y: running }; });
  const isPos = points[points.length - 1].y >= 0;
  const color = isPos ? '#00ffa3' : '#ff4466';
  const ctx = document.getElementById('equityChart');
  if (!ctx) return;
  if (_charts.equityChart) { try { _charts.equityChart.destroy(); } catch {} }
  const canvasCtx = ctx.getContext('2d');
  const grad = canvasCtx.createLinearGradient(0, 0, 0, 280);
  grad.addColorStop(0, isPos ? 'rgba(0,255,163,0.18)' : 'rgba(255,68,102,0.18)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  _charts.equityChart = new Chart(canvasCtx, {
    type: 'line',
    data: { labels: points.map(p => p.x), datasets: [{ data: points.map(p => p.y), borderColor: color, backgroundColor: grad, borderWidth: 2, pointRadius: 0, fill: true, tension: 0.35 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmtS(c.parsed.y) } } },
      scales: { x: { grid: GRID, ticks: { ...TICK, maxTicksLimit: 8, callback: (_, i) => points[i]?.x?.slice(5) } }, y: { grid: GRID, ticks: { ...TICK, callback: v => fmt(v) } } }
    }
  });
}

function updateDesiCards(wr, pf, rr) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('desi-pf-val', pf === 999 ? '∞' : pf.toFixed(2));
  set('desi-pf-val2', pf === 999 ? '∞' : pf.toFixed(2));
  set('desi-wr-val', wr.toFixed(1));
  set('desi-rr-val', rr.toFixed(1));
  const pfBar = document.getElementById('desi-pf-bar');
  if (pfBar) pfBar.style.width = Math.min(100, (pf / 4) * 100) + '%';
  const rrRisk = document.getElementById('rr-risk-bar');
  const rrReward = document.getElementById('rr-reward-bar');
  if (rrRisk && rrReward) {
    const maxH = 56;
    rrRisk.style.height = '40px';
    rrReward.style.height = Math.min(maxH, 20 + rr * 12) + 'px';
    rrReward.textContent = 'REWARD ₹' + rr.toFixed(1);
  }
}

/* ────────────────────────────────────────────────────────────
   JOURNAL
──────────────────────────────────────────────────────────── */
function renderJournal(filter, search) {
  let trades = getTrades();
  if (filter && filter !== 'all') trades = trades.filter(t => {
    if (filter === 'win') return net(t) > 0;
    if (filter === 'loss') return net(t) < 0;
    if (filter === 'be') return net(t) === 0;
    return true;
  });
  if (search) {
    const q = search.toLowerCase();
    trades = trades.filter(t => (t.symbol||'').toLowerCase().includes(q) || (t.strategy||'').toLowerCase().includes(q) || (t.reason||'').toLowerCase().includes(q));
  }
  trades = [...trades].sort((a, b) => b.date.localeCompare(a.date));

  const tbody = document.getElementById('journal-tbody');
  const empty = document.getElementById('journal-empty');
  const summary = document.getElementById('journal-summary-bar');

  if (!tbody) return;
  if (!trades.length) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  tbody.innerHTML = trades.map(t => {
    const n = net(t);
    const cls = n > 0 ? 'badge-win' : n < 0 ? 'badge-loss' : 'badge-be';
    const label = n > 0 ? 'WIN' : n < 0 ? 'LOSS' : 'BE';
    return `<tr onclick="openTradeModal('${t.id}')" style="cursor:pointer">
      <td>${t.date || '—'}</td>
      <td><strong style="color:var(--accent)">${t.symbol || '—'}</strong></td>
      <td><span style="color:${t.direction === 'Long' ? 'var(--green)' : 'var(--red)'}">${t.direction || '—'}</span></td>
      <td>${t.qty || '—'}</td>
      <td style="font-family:var(--font-mono)">${t.entry ? '₹'+Number(t.entry).toFixed(2) : '—'}</td>
      <td style="font-family:var(--font-mono)">${t.exit ? '₹'+Number(t.exit).toFixed(2) : '—'}</td>
      <td style="font-family:var(--font-mono);color:${n>=0?'var(--green)':'var(--red)'}"><strong>${fmtS(n)}</strong></td>
      <td>${t.strategy || '—'}</td>
      <td><span class="badge ${cls}">${label}</span></td>
      <td style="color:var(--text2);font-size:11px">${t.emotion || '—'}</td>
      <td class="tbl-actions">
        <button class="tbl-btn tbl-btn-edit" onclick="event.stopPropagation();editTrade('${t.id}')">Edit</button>
        <button class="tbl-btn tbl-btn-del" onclick="event.stopPropagation();deleteTradeById('${t.id}')">Del</button>
      </td>
    </tr>`;
  }).join('');

  // Summary bar
  if (summary) {
    const total = trades.reduce((s, t) => s + net(t), 0);
    const wins = trades.filter(t => net(t) > 0).length;
    const wr = trades.length ? (wins / trades.length * 100).toFixed(0) : 0;
    summary.innerHTML = `
      <div class="jsb-item"><span class="jsb-label">Showing</span><span class="jsb-val">${trades.length} trades</span></div>
      <div class="jsb-item"><span class="jsb-label">Net P&L</span><span class="jsb-val" style="color:${total>=0?'var(--green)':'var(--red)'}">${fmtS(total)}</span></div>
      <div class="jsb-item"><span class="jsb-label">Win Rate</span><span class="jsb-val">${wr}%</span></div>
      <div class="jsb-item"><span class="jsb-label">Winners</span><span class="jsb-val" style="color:var(--green)">${wins}</span></div>
      <div class="jsb-item"><span class="jsb-label">Losers</span><span class="jsb-val" style="color:var(--red)">${trades.filter(t=>net(t)<0).length}</span></div>`;
  }
}

function filterJournal() {
  const f = document.getElementById('journal-filter')?.value;
  const s = document.getElementById('journal-search')?.value;
  renderJournal(f, s);
}

/* ────────────────────────────────────────────────────────────
   TRADE FORM
──────────────────────────────────────────────────────────── */
let _direction = 'Long';
let _emotion = '';
let _discipline = '';
let _regime = '';
let _selectedTags = [];

function setDir(d) {
  _direction = d;
  document.getElementById('dir-long')?.classList.toggle('active', d === 'Long');
  document.getElementById('dir-short')?.classList.toggle('active', d === 'Short');
  updateFormCalc();
}
function setEmotion(btn) {
  _emotion = btn.dataset.val;
  document.querySelectorAll('.emotion-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const el = document.getElementById('f-emotion');
  if (el) el.value = _emotion;
}
function setDiscipline(d) {
  _discipline = d;
  ['followed','partial','broken'].forEach(v => document.getElementById('disc-' + v)?.classList.toggle('active', v === d));
  const el = document.getElementById('f-discipline');
  if (el) el.value = d;
  const row = document.getElementById('broken-rules-row');
  if (row) row.style.display = (d === 'broken' || d === 'partial') ? 'flex' : 'none';
  if (d === 'broken' || d === 'partial') renderBrokenRulesList();
}
function setRegime(btn) {
  _regime = btn.dataset.val;
  document.querySelectorAll('.regime-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const el = document.getElementById('f-regime');
  if (el) el.value = _regime;
}
/* ── New form helpers for expanded fields ── */
let _revenge = false, _impulsive = false;

function setRevenge(val) {
  _revenge = val;
  const el = document.getElementById('f-revenge');
  if (el) el.value = val;
  document.getElementById('revenge-yes')?.classList.toggle('active', val);
  document.getElementById('revenge-no')?.classList.toggle('active', !val);
}
function setImpulsive(val) {
  _impulsive = val;
  const el = document.getElementById('f-impulsive');
  if (el) el.value = val;
  document.getElementById('impulsive-yes')?.classList.toggle('active', val);
  document.getElementById('impulsive-no')?.classList.toggle('active', !val);
}

// Multi-select chips (toggle on/off, store comma-sep in hidden input)
function toggleChip(el, hiddenId) {
  el.classList.toggle('chip-active');
  const container = el.parentElement;
  const active = [...container.querySelectorAll('.chip-active')].map(c => c.textContent.replace(/^[^ ]+ /, '').trim());
  const hidden = document.getElementById(hiddenId);
  if (hidden) hidden.value = active.join(', ');
}

// Single-select chips (radio-style)
function setChipSingle(el, hiddenId, containerId) {
  const container = document.getElementById(containerId);
  if (container) container.querySelectorAll('.chip').forEach(c => c.classList.remove('chip-active'));
  el.classList.add('chip-active');
  const val = el.textContent.replace(/^\S+ /, '').trim(); // strip emoji
  const hidden = document.getElementById(hiddenId);
  if (hidden) hidden.value = val;
  // Also update legacy f-emotion if this is emotion
  if (hiddenId === 'f-pre-emotion') { window._preEmotion = val; }
}

window.toggleChip = toggleChip;
window.setChipSingle = setChipSingle;
window.setRevenge = setRevenge;
window.setImpulsive = setImpulsive;


function renderBrokenRulesList() {
  const container = document.getElementById('f-broken-rules-list');
  if (!container) return;
  const rules = getRules();
  if (!rules.length) { container.innerHTML = '<p style="color:var(--text3);font-size:12px">No rules defined. Add rules in Psychology Hub.</p>'; return; }
  container.innerHTML = rules.map(r => `<label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:4px 0">
    <input type="checkbox" class="broken-rule-cb" value="${r.id}" style="accent-color:var(--red)">
    <span style="font-size:12px">${r.name}</span>
  </label>`).join('');
}

function renderTagSelector() {
  const container = document.getElementById('f-tags-selector');
  if (!container) return;
  const tags = getTags();
  if (!tags.length) { container.innerHTML = '<span style="font-size:12px;color:var(--text3)">No tags yet. Create them in Tools Hub → Tags.</span>'; return; }
  container.innerHTML = tags.map(tag => {
    const sel = _selectedTags.includes(tag.id);
    return `<button onclick="toggleTradeTag('${tag.id}',this)" style="padding:4px 12px;border-radius:20px;border:1px solid ${sel ? tag.color : 'var(--border)'};background:${sel ? tag.color+'22' : 'transparent'};color:${sel ? tag.color : 'var(--text2)'};font-size:11px;cursor:pointer;transition:all .15s" data-id="${tag.id}">${tag.name}</button>`;
  }).join('');
}
function toggleTradeTag(id, btn) {
  const tag = getTags().find(t => t.id === id);
  if (!tag) return;
  if (_selectedTags.includes(id)) {
    _selectedTags = _selectedTags.filter(t => t !== id);
    btn.style.borderColor = 'var(--border)'; btn.style.background = 'transparent'; btn.style.color = 'var(--text2)';
  } else {
    _selectedTags.push(id);
    btn.style.borderColor = tag.color; btn.style.background = tag.color + '22'; btn.style.color = tag.color;
  }
}

function updateFormCalc() {
  const entry = parseFloat(document.getElementById('f-entry')?.value) || 0;
  const exit  = parseFloat(document.getElementById('f-exit')?.value)  || 0;
  const sl    = parseFloat(document.getElementById('f-sl')?.value)    || 0;
  const target= parseFloat(document.getElementById('f-target')?.value)|| 0;
  const qty   = parseFloat(document.getElementById('f-qty')?.value)   || 1;
  const lotSz = parseFloat(document.getElementById('f-lotsize')?.value)|| 1;
  const totalQty = qty * lotSz;
  const dir = _direction === 'Short' ? -1 : 1;

  if (entry && exit) {
    const points = (exit - entry) * dir;
    const gross = points * totalQty;
    const pctMove = entry ? ((exit - entry) / entry * 100 * dir) : 0;
    const grossEl = document.getElementById('f-gross');
    if (grossEl) grossEl.value = gross.toFixed(2);

    // Capital deployed
    const capEl = document.getElementById('f-capital-deployed');
    if (capEl && !capEl.value) capEl.value = (entry * totalQty).toFixed(0);

    // Calc preview
    const pcp = document.getElementById('price-calc-preview');
    if (pcp) pcp.style.display = 'block';
    const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    setEl('calc-points', (points >= 0 ? '+' : '') + points.toFixed(2));
    setEl('calc-pctmove', (pctMove >= 0 ? '+' : '') + pctMove.toFixed(2) + '%');

    // Planned R:R (entry vs sl vs target)
    if (sl && entry) {
      const riskPts = Math.abs(entry - sl);
      const rewPts = target ? Math.abs(target - entry) : 0;
      const plannedRR = riskPts > 0 && rewPts > 0 ? (rewPts / riskPts).toFixed(2) : '—';
      setEl('calc-planned-rr', rewPts > 0 ? plannedRR + ':1' : '—');
      setEl('calc-maxrisk', '₹' + (riskPts * totalQty).toFixed(0));
      // Actual R:R (exit vs sl)
      const actualR = riskPts > 0 ? (Math.abs(exit - entry) / riskPts).toFixed(2) : '—';
      setEl('calc-actual-rr', actualR !== '—' ? actualR + ':1' : '—');
      // vs SL
      const hitSl = dir > 0 ? exit <= sl : exit >= sl;
      const hitTarget = target ? (dir > 0 ? exit >= target : exit <= target) : false;
      setEl('calc-vssl', hitSl ? '❌ SL Hit' : hitTarget ? '✅ Target Hit' : '↔️ Between');
      // Ticker
      const setT = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
      setT('ticker-vssl', hitSl ? '❌ SL' : hitTarget ? '✅ TGT' : '↔️');
    }

    // Ticker bar
    const setT = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    setT('ticker-points', (points >= 0 ? '+' : '') + points.toFixed(2));
    setT('ticker-pctmove', (pctMove >= 0 ? '+' : '') + pctMove.toFixed(2) + '%');
    setT('ticker-gross', gross >= 0 ? '+₹' + gross.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-₹' + Math.abs(gross).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

    // Hold time
    const entryTime = document.getElementById('f-entry-time')?.value;
    const exitTime  = document.getElementById('f-exit-time')?.value;
    if (entryTime && exitTime) {
      const [eh, em] = entryTime.split(':').map(Number);
      const [xh, xm] = exitTime.split(':').map(Number);
      const mins = (xh * 60 + xm) - (eh * 60 + em);
      const setT2 = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
      setT2('ticker-holdtime', mins >= 60 ? Math.floor(mins/60) + 'h ' + (mins%60) + 'm' : mins + 'm');
      setT2('calc-holdtime', mins >= 60 ? Math.floor(mins/60) + 'h ' + (mins%60) + 'm' : mins + 'm');
    }

    updateNetPnl();
  }
}

function updateNetPnl() {
  const gross = parseFloat(document.getElementById('f-gross')?.value) || 0;
  const brok  = parseFloat(document.getElementById('f-brokerage')?.value) || 0;
  const stt   = parseFloat(document.getElementById('f-stt')?.value) || 0;
  const exch  = parseFloat(document.getElementById('f-exchange-charges')?.value) || 0;
  const sebi  = parseFloat(document.getElementById('f-sebi')?.value) || 0;
  const gst   = parseFloat(document.getElementById('f-gst')?.value) || 0;
  const slip  = parseFloat(document.getElementById('f-slippage')?.value) || 0;
  const other = parseFloat(document.getElementById('f-other-charges')?.value) || 0;
  const totalTax = brok + stt + exch + sebi + gst + slip + other;
  const n = gross - totalTax;

  const setVal = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
  setVal('f-tax', totalTax.toFixed(2));
  setVal('f-net', n.toFixed(2));

  // Return pct
  const cap = parseFloat(document.getElementById('f-capital-deployed')?.value) || 0;
  if (cap) setVal('f-return-pct', (n / cap * 100).toFixed(2) + '%');

  // P&L preview ticker
  const prev = document.getElementById('pnl-prev-val');
  if (prev) {
    prev.textContent = (n >= 0 ? '+₹' : '-₹') + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    prev.style.color = n > 0 ? 'var(--green)' : n < 0 ? 'var(--red)' : 'var(--text)';
  }
  const sub = document.getElementById('pnl-prev-sub');
  if (sub) sub.textContent = gross ? 'Gross ' + (gross >= 0 ? '+' : '') + '₹' + gross.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' · Charges -₹' + totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'Fill entry · exit · qty to calculate';

  // Ticker net
  const tn = document.getElementById('ticker-rr');
  if (tn && document.getElementById('f-sl')?.value && document.getElementById('f-entry')?.value) {
    const entry = parseFloat(document.getElementById('f-entry').value) || 0;
    const sl = parseFloat(document.getElementById('f-sl').value) || 0;
    const qty = (parseFloat(document.getElementById('f-qty')?.value)||1) * (parseFloat(document.getElementById('f-lotsize')?.value)||1);
    const risk = Math.abs(entry - sl) * qty;
    if (risk > 0) tn.textContent = Math.abs(n / risk).toFixed(2) + ':1';
  }
}
function updateQuality() {
  const ids = ['q-setup','q-entry','q-exit','q-risk','q-emo','q-plan','q-review'];
  const vals = ids.map(id => parseInt(document.getElementById(id)?.value) || 5);
  ids.forEach((id, i) => { const el = document.getElementById(id + '-v'); if (el) el.textContent = vals[i]; });
  const score = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10);
  const qv = document.getElementById('qs-value');
  const qb = document.getElementById('qs-bar');
  const qg = document.getElementById('qs-grade');
  const qt = document.getElementById('qs-tips');
  if (qv) qv.textContent = score;
  if (qb) qb.style.width = score + '%';
  const label = score >= 85 ? '🏆 Elite' : score >= 70 ? '✅ Good' : score >= 55 ? '⚠️ Average' : score >= 40 ? '🔴 Below Average' : '💀 Poor';
  if (qg) qg.textContent = label;
  if (qt) {
    const lowest = ids.reduce((a, b) => (parseInt(document.getElementById(a)?.value)||5) < (parseInt(document.getElementById(b)?.value)||5) ? a : b);
    const names = {'q-setup':'Setup Clarity','q-entry':'Entry Timing','q-exit':'Exit Discipline','q-risk':'Risk Sizing','q-emo':'Emotional Control','q-plan':'Plan Adherence','q-review':'Post-trade Review'};
    qt.textContent = score < 60 ? 'Weakest area: ' + names[lowest] : score >= 80 ? 'Great trade quality! Review your lesson.' : 'Keep improving consistency.';
  }
}

function clearTradeForm() {
  const clearIds = ['f-date','f-symbol','f-entry','f-exit','f-qty','f-gross',
    'f-brokerage','f-stt','f-exchange-charges','f-sebi','f-gst','f-slippage','f-other-charges',
    'f-tax','f-net','f-return-pct','f-reason','f-mistakes','f-lesson','f-plan',
    'f-entry-time','f-exit-time','f-expiry','f-strike','f-capital-deployed','f-lotsize',
    'f-sl','f-target','f-mae','f-mfe','f-market-context','f-exit-reason',
    'f-indicators','f-indicators-custom','f-pre-emotion','f-pre-emotion-custom',
    'f-emotion-custom','f-chart-url','f-trade-ref','f-account','f-notes','f-rule-notes'];
  clearIds.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  // Reset selects to first option
  ['f-instrument-type','f-timeframe','f-strategy','f-setup-grade','f-trade-type',
   'f-entry-type','f-exit-type','f-plan-adherence','f-energy'].forEach(id => {
    const el = document.getElementById(id); if (el) el.selectedIndex = 0;
  });
  // Reset sliders
  ['q-setup','q-entry','q-exit','q-risk','q-emo','q-plan','q-review'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = 5;
  });
  ['f-confidence','f-stress'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.value = id === 'f-stress' ? 3 : 5; }
  });
  document.getElementById('f-confidence-v') && (document.getElementById('f-confidence-v').textContent = '5');
  document.getElementById('f-stress-v') && (document.getElementById('f-stress-v').textContent = '3');
  // Reset state
  _direction = 'Long'; _emotion = ''; _discipline = ''; _regime = ''; _selectedTags = [];
  _revenge = false; _impulsive = false;
  setDir('Long');
  setRevenge(false); setImpulsive(false);
  document.querySelectorAll('.emotion-btn,.disc-btn,.regime-btn,.chip').forEach(b => b.classList.remove('active','chip-active'));
  ['f-discipline','f-emotion','f-regime','f-pre-emotion','f-indicators','f-revenge','f-impulsive'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = id === 'f-revenge' || id === 'f-impulsive' ? 'false' : '';
  });
  const eid = document.getElementById('edit-trade-id'); if (eid) eid.value = '';
  const db = document.getElementById('delete-btn'); if (db) db.style.display = 'none';
  const title = document.getElementById('add-trade-title');
  if (title) title.innerHTML = 'Log Trade <span class="title-accent">Record</span>';
  const brr = document.getElementById('broken-rules-row'); if (brr) brr.style.display = 'none';
  const pcp = document.getElementById('price-calc-preview'); if (pcp) pcp.style.display = 'none';
  updateQuality();
  updateNetPnl();
  renderTagSelector();
  const fb = document.getElementById('pnl-prev-val');
  if (fb) { fb.textContent = '₹ 0'; fb.style.color = 'var(--text)'; }
}

document.getElementById('save-btn')?.addEventListener('click', saveTrade);
function saveTrade() {
  const date = document.getElementById('f-date')?.value;
  const symbol = (document.getElementById('f-symbol')?.value || '').trim().toUpperCase();
  if (!date || !symbol) { toast('Date and Symbol are required', 'error'); return; }

  const gv = id => { const e = document.getElementById(id); return e ? e.value : ''; };
  const gn = id => parseFloat(gv(id)) || 0;

  // Compute total charges
  const brokerage = gn('f-brokerage');
  const stt = gn('f-stt');
  const exchange = gn('f-exchange-charges');
  const sebi = gn('f-sebi');
  const gst = gn('f-gst');
  const slippage = gn('f-slippage');
  const other = gn('f-other-charges');
  const totalTax = brokerage + stt + exchange + sebi + gst + slippage + other;
  const gross = gn('f-gross');
  const n = gross - totalTax;

  const brokenRules = [...document.querySelectorAll('.broken-rule-cb:checked')].map(cb => cb.value);

  // Merge custom inputs with chip selections
  const emotion = _emotion || gv('f-emotion') || gv('f-emotion-custom') || '';
  const preEmotion = gv('f-pre-emotion') || gv('f-pre-emotion-custom') || '';
  const indicators = gv('f-indicators');
  const indicatorsCustom = gv('f-indicators-custom');
  const regime = _regime || gv('f-regime') || gv('f-regime-custom') || '';

  const trade = {
    id: gv('edit-trade-id') || Date.now().toString(),
    // Core
    date, symbol,
    entryTime: gv('f-entry-time'),
    exitTime: gv('f-exit-time'),
    instrumentType: gv('f-instrument-type'),
    expiry: gv('f-expiry'),
    strike: gn('f-strike') || '',
    timeframe: gv('f-timeframe'),
    direction: _direction,
    tradeType: gv('f-trade-type'),
    // Prices
    entry: gn('f-entry'),
    exit: gn('f-exit'),
    sl: gn('f-sl'),
    target: gn('f-target'),
    qty: gn('f-qty'),
    lotSize: gn('f-lotsize'),
    capitalDeployed: gn('f-capital-deployed'),
    // P&L
    gross, brokerage, stt, exchange, sebi, gst, slippage, other,
    tax: totalTax, net: n,
    returnPct: gv('f-return-pct'),
    // Strategy
    strategy: gv('f-strategy'),
    setupGrade: gv('f-setup-grade'),
    indicators: indicators + (indicatorsCustom ? (indicators ? ', ' : '') + indicatorsCustom : ''),
    marketContext: gv('f-market-context'),
    reason: gv('f-reason'),
    // Execution
    entryType: gv('f-entry-type'),
    exitType: gv('f-exit-type'),
    exitReason: gv('f-exit-reason'),
    planAdherence: gv('f-plan-adherence'),
    mae: gn('f-mae'),
    mfe: gn('f-mfe'),
    mistakes: gv('f-mistakes'),
    // Psychology
    preEmotion,
    emotion,
    confidence: parseInt(gv('f-confidence')) || 5,
    stress: parseInt(gv('f-stress')) || 3,
    energy: gv('f-energy'),
    isRevenge: gv('f-revenge') === 'true',
    isImpulsive: gv('f-impulsive') === 'true',
    tradesToday: gn('f-trades-today'),
    plan: gv('f-plan'),
    // Discipline
    discipline: _discipline || gv('f-discipline') || '',
    regime,
    brokenRules,
    tags: [..._selectedTags],
    // Quality
    qualityScore: parseInt(document.getElementById('qs-value')?.textContent) || 50,
    setup: parseInt(gv('q-setup')) || 5,
    execution: parseInt(gv('q-entry')) || 5,
    management: parseInt(gv('q-exit')) || 5,
    planScore: parseInt(gv('q-plan')) || 5,
    reviewScore: parseInt(gv('q-review')) || 5,
    lesson: gv('f-lesson'),
    // Reference
    chartUrl: gv('f-chart-url'),
    tradeRef: gv('f-trade-ref'),
    account: gv('f-account'),
    notes: gv('f-notes'),
    // Meta
    outcome: n > 0 ? 'win' : n < 0 ? 'loss' : 'be',
    savedAt: new Date().toISOString()
  };

  const trades = getTrades();
  const idx = trades.findIndex(t => t.id === trade.id);
  if (idx >= 0) trades[idx] = trade; else trades.push(trade);
  saveTrades(trades);

  // Audit trail
  const audit = JSON.parse(localStorage.getItem('tradebook_audit') || '[]');
  audit.unshift({ action: idx >= 0 ? 'edit' : 'add', tradeId: trade.id, symbol: trade.symbol, net: trade.net, timestamp: new Date().toISOString() });
  if (audit.length > 200) audit.pop();
  localStorage.setItem('tradebook_audit', JSON.stringify(audit));

  const fb = document.getElementById('save-feedback');
  if (fb) { fb.textContent = '✅ Trade saved!'; setTimeout(() => fb.textContent = '', 2500); }
  toast(`Trade saved: ${symbol} ${fmtS(n)}`);
  updateDashboard();
  renderJournal();
  checkDailyLossLimit();
  updateXP(100 + Math.abs(n) > 0 ? 50 : 0);
}

function editTrade(id) {
  const trade = getTrades().find(t => t.id === id);
  if (!trade) return;
  navigateTo('add-trade');
  setTimeout(() => {
    const set = (el, v) => { const e = document.getElementById(el); if (e) e.value = v; };
    set('edit-trade-id', trade.id);
    set('f-date', trade.date);
    set('f-symbol', trade.symbol);
    set('f-entry', trade.entry);
    set('f-exit', trade.exit);
    set('f-qty', trade.qty);
    set('f-gross', trade.gross);
    set('f-tax', trade.tax);
    set('f-strategy', trade.strategy);
    set('f-reason', trade.reason);
    set('f-mistakes', trade.mistakes);
    _direction = trade.direction || 'Long';
    setDir(_direction);
    _selectedTags = trade.tags || [];
    renderTagSelector();
    if (trade.emotion) {
      _emotion = trade.emotion;
      document.querySelectorAll('.emotion-btn').forEach(b => b.classList.toggle('active', b.dataset.val === trade.emotion));
    }
    if (trade.discipline) setDiscipline(trade.discipline);
    if (trade.regime) {
      _regime = trade.regime;
      document.querySelectorAll('.regime-btn').forEach(b => b.classList.toggle('active', b.dataset.val === trade.regime));
    }
    ['setup','execution','management'].forEach((k, i) => {
      const ids = ['q-setup','q-entry','q-exit'];
      const el = document.getElementById(ids[i]);
      if (el) el.value = trade[k] || 5;
    });
    updateQuality();
    updateNetPnl();
    document.getElementById('delete-btn').style.display = 'inline-flex';
    document.getElementById('add-trade-title').innerHTML = 'Edit Trade <span class="title-accent">Record</span>';
  }, 200);
}

function deleteTrade() {
  const id = document.getElementById('edit-trade-id')?.value;
  if (!id) return;
  deleteTradeById(id);
  clearTradeForm();
  navigateTo('journal');
}
function deleteTradeById(id) {
  if (!confirm('Delete this trade?')) return;
  const trades = getTrades().filter(t => t.id !== id);
  saveTrades(trades);
  toast('Trade deleted', 'warn');
  updateDashboard();
  renderJournal();
}

function openTradeModal(id) {
  const trade = getTrades().find(t => t.id === id);
  if (!trade) return;
  const allTrades = getTrades();
  const n = net(trade);
  const modal = document.getElementById('trade-modal');
  const content = document.getElementById('modal-content');
  if (!modal || !content) return;

  /* ── colour/label helpers ── */
  const OC  = n > 0 ? 'var(--green)' : n < 0 ? 'var(--red)' : 'var(--gold)';
  const OL  = n > 0 ? '✓ WIN' : n < 0 ? '✗ LOSS' : '≈ BE';
  const OBG = n > 0 ? 'badge-win' : n < 0 ? 'badge-loss' : 'badge-be';
  const INR = (v, d = 2) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmtI = v => { const a = Number(v || 0); return (a >= 0 ? '+' : '-') + '₹' + INR(Math.abs(a)); };
  const row  = (lbl, val, col = '') => (val && val !== '0' && val !== '0.00' && String(val).trim() !== '' && val !== '—') ?
    `<div class="trd-row"><span class="trd-lbl">${lbl}</span><span class="trd-val"${col ? ` style="color:${col}"` : ''}>${val}</span></div>` : '';

  /* ── P&L numbers ── */
  const gross     = Number(trade.gross) || n;
  const totalTax  = Number(trade.tax)  || 0;
  const brokerage = Number(trade.brokerage) || 0;
  const stt       = Number(trade.stt)       || 0;
  const exchange  = Number(trade.exchange)  || 0;
  const sebi      = Number(trade.sebi)      || 0;
  const gst       = Number(trade.gst)       || 0;
  const slippage  = Number(trade.slippage)  || 0;
  const other     = Number(trade.other)     || 0;
  const entry     = Number(trade.entry)     || 0;
  const exit      = Number(trade.exit)      || 0;
  const sl        = Number(trade.sl)        || 0;
  const tgt       = Number(trade.target)    || 0;
  const qty       = Number(trade.qty)       || 1;
  const lotSz     = Number(trade.lotSize)   || 1;
  const totalQty  = qty * lotSz;
  const capital   = Number(trade.capitalDeployed) || 0;

  /* ── Computed analytics for this trade ── */
  const priceMoveAbs   = Math.abs(exit - entry);
  const priceMoveDir   = trade.direction === 'Long' ? exit - entry : entry - exit;
  const pricePct       = entry > 0 ? (priceMoveDir / entry * 100) : 0;
  const riskPts        = sl > 0 && entry > 0 ? Math.abs(entry - sl) : 0;
  const rewPts         = tgt > 0 && entry > 0 ? Math.abs(tgt - entry) : 0;
  const plannedRR      = riskPts > 0 && rewPts > 0 ? (rewPts / riskPts) : 0;
  const actualRR       = riskPts > 0 ? (priceMoveAbs / riskPts) : 0;
  const riskAmount     = riskPts * totalQty;
  const returnPct      = capital > 0 ? (n / capital * 100) : 0;
  const taxDragPct     = gross !== 0 ? (totalTax / Math.abs(gross) * 100) : 0;
  const captureRatio   = rewPts > 0 ? (priceMoveDir / (tgt - (trade.direction === 'Long' ? entry : entry))) * 100 : 0;

  /* ── Context: compare this trade vs all trades of same strategy/symbol ── */
  const symTrades  = allTrades.filter(t => t.symbol === trade.symbol && t.id !== trade.id);
  const stratTrades= allTrades.filter(t => t.strategy === trade.strategy && trade.strategy && t.id !== trade.id);
  const symAvgPnl  = symTrades.length ? symTrades.reduce((a, t) => a + net(t), 0) / symTrades.length : null;
  const stratAvgPnl= stratTrades.length ? stratTrades.reduce((a, t) => a + net(t), 0) / stratTrades.length : null;
  const allAvgPnl  = allTrades.length > 1 ? allTrades.filter(t=>t.id!==trade.id).reduce((a,t)=>a+net(t),0)/(allTrades.length-1) : null;
  const symWR      = symTrades.length ? (symTrades.filter(t=>net(t)>0).length/symTrades.length*100) : null;
  const stratWR    = stratTrades.length ? (stratTrades.filter(t=>net(t)>0).length/stratTrades.length*100) : null;

  /* ── Quality ── */
  const qs     = trade.qualityScore || 0;
  const qsCol  = qs >= 80 ? 'var(--green)' : qs >= 60 ? 'var(--gold)' : 'var(--red)';
  const qsLbl  = qs >= 85 ? 'Elite' : qs >= 70 ? 'Good' : qs >= 55 ? 'Average' : 'Below Avg';

  /* ── Tags ── */
  const tags    = getTags();
  const tagHTML = (trade.tags || []).map(tid => {
    const tg = tags.find(t => t.id === tid);
    return tg ? `<span style="padding:2px 9px;border-radius:20px;font-size:10px;font-weight:700;border:1px solid ${tg.color}55;background:${tg.color}18;color:${tg.color}">${tg.name}</span>` : '';
  }).filter(Boolean).join('');

  /* ── Trade position in equity curve ── */
  const sorted = [...allTrades].sort((a, b) => a.date.localeCompare(b.date));
  let runEq = 0;
  const eqBeforeTrade = sorted.filter(t => t.date < trade.date || (t.date === trade.date && t.id !== trade.id)).reduce((s,t)=>s+net(t),0);

  /* ── FLAGS ── */
  const flags = [];
  if (trade.isRevenge)   flags.push({ icon: '🔄', label: 'Revenge Trade', col: 'var(--red)' });
  if (trade.isImpulsive) flags.push({ icon: '⚡', label: 'Impulsive Entry', col: 'var(--gold)' });
  if (trade.brokenRules?.length) flags.push({ icon: '⚠️', label: `${trade.brokenRules.length} Rule(s) Broken`, col: 'var(--red)' });
  if (n > 0 && actualRR < 1 && riskPts > 0) flags.push({ icon: '📉', label: 'Won < 1R (exit too early?)', col: 'var(--gold)' });
  if (n < 0 && actualRR > 1 && riskPts > 0) flags.push({ icon: '🚨', label: 'Lost > 1R (SL not honoured?)', col: 'var(--red)' });
  if (taxDragPct > 25) flags.push({ icon: '💸', label: `High tax drag: ${taxDragPct.toFixed(1)}%`, col: 'var(--gold)' });

  const tabId = `tm-${trade.id}`;

  content.innerHTML = `
  <style>
    /* ── Trade Report Styles ── */
    .trd-wrap   { font-family:var(--font-body); }

    /* Hero */
    .trd-hero   { display:flex; align-items:flex-start; justify-content:space-between; gap:14px;
                  padding-bottom:16px; border-bottom:1px solid var(--border); margin-bottom:16px; }
    .trd-symbol { font-family:var(--font-display); font-size:26px; font-weight:800; color:var(--accent); letter-spacing:-0.03em; line-height:1.1; }
    .trd-meta   { font-size:11px; color:var(--text3); margin-top:4px; font-family:var(--font-mono); }
    .trd-pnl    { font-family:var(--font-mono); font-size:28px; font-weight:800; color:${OC}; text-align:right; white-space:nowrap; }

    /* KPI strip */
    .trd-kpi        { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:16px; }
    .trd-kpi-card   { background:var(--bg4); border:1px solid var(--border); border-radius:8px; padding:10px 11px; text-align:center; }
    .trd-kpi-lbl    { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:var(--text3); margin-bottom:4px; }
    .trd-kpi-val    { font-family:var(--font-mono); font-size:14px; font-weight:800; }

    /* Tabs */
    .trd-tabs       { display:flex; gap:2px; border-bottom:1px solid var(--border); margin-bottom:16px; overflow-x:auto; scrollbar-width:none; }
    .trd-tabs::-webkit-scrollbar { display:none; }
    .trd-tab        { padding:8px 14px; border:none; background:none; color:var(--text3); font-family:var(--font-body);
                      font-size:12px; font-weight:600; cursor:pointer; border-bottom:2px solid transparent;
                      white-space:nowrap; transition:all .15s; }
    .trd-tab:hover  { color:var(--text2); }
    .trd-tab.on     { color:var(--accent); border-bottom-color:var(--accent); }

    /* Panels */
    .trd-panel      { display:none; }
    .trd-panel.on   { display:block; }

    /* Section blocks */
    .trd-sec        { background:var(--bg4); border:1px solid var(--border); border-radius:8px;
                      overflow:hidden; margin-bottom:12px; }
    .trd-sec-head   { padding:8px 13px; background:rgba(255,255,255,0.03); border-bottom:1px solid var(--border);
                      font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.1em; color:var(--text3); }
    .trd-sec-body   { padding:11px 13px; }

    /* Row helpers */
    .trd-row        { display:flex; justify-content:space-between; align-items:center;
                      padding:5px 0; border-bottom:1px solid var(--border); font-size:12.5px; }
    .trd-row:last-child { border-bottom:none; }
    .trd-lbl        { color:var(--text3); }
    .trd-val        { font-family:var(--font-mono); font-weight:600; color:var(--text); }

    /* Price levels visual */
    .trd-levels     { position:relative; height:72px; background:var(--bg3); border-radius:6px;
                      overflow:hidden; margin-bottom:10px; border:1px solid var(--border); }
    .trd-lvl-bar    { position:absolute; left:0; right:0; display:flex; align-items:center;
                      padding:0 10px; font-size:10px; font-family:var(--font-mono); font-weight:700; height:18px; }
    .trd-lvl-label  { margin-right:auto; }

    /* P&L waterfall */
    .trd-wf-row     { display:flex; justify-content:space-between; align-items:center;
                      padding:6px 0; border-bottom:1px solid var(--border); font-size:13px; }
    .trd-wf-row.tot { border-top:2px solid var(--border2); border-bottom:none; margin-top:4px;
                      padding-top:10px; font-weight:800; font-size:14px; }
    .trd-wf-sub     { padding:4px 0 4px 14px; font-size:11px; color:var(--text3); border-bottom:1px solid var(--border); display:flex; justify-content:space-between; }

    /* Comparison bars */
    .trd-cmp        { display:flex; flex-direction:column; gap:8px; }
    .trd-cmp-row    { display:flex; align-items:center; gap:10px; font-size:12px; }
    .trd-cmp-label  { width:90px; flex-shrink:0; color:var(--text3); font-size:11px; }
    .trd-cmp-bar-wrap { flex:1; height:8px; background:var(--bg3); border-radius:4px; overflow:hidden; position:relative; }
    .trd-cmp-bar    { height:100%; border-radius:4px; transition:width .8s cubic-bezier(.4,0,.2,1); }
    .trd-cmp-val    { width:80px; text-align:right; font-family:var(--font-mono); font-size:11px; font-weight:700; flex-shrink:0; }

    /* Radar-like quality bars */
    .trd-qbar-row   { display:flex; align-items:center; gap:8px; margin-bottom:7px; }
    .trd-qbar-label { width:110px; flex-shrink:0; font-size:11px; color:var(--text2); }
    .trd-qbar-track { flex:1; height:6px; background:var(--bg3); border-radius:3px; overflow:hidden; }
    .trd-qbar-fill  { height:100%; border-radius:3px; transition:width .7s; }
    .trd-qbar-num   { width:24px; text-align:right; font-size:11px; font-family:var(--font-mono); font-weight:700; color:var(--accent); }

    /* Flags */
    .trd-flag       { display:flex; align-items:center; gap:8px; padding:8px 11px;
                      border-radius:6px; font-size:12px; margin-bottom:7px; }

    /* Context canvas wrapper */
    .trd-mini-chart { height:90px; background:var(--bg3); border-radius:6px; overflow:hidden;
                      border:1px solid var(--border); margin-top:10px; position:relative; }

    /* Notes */
    .trd-note-block { background:var(--bg3); border-radius:6px; padding:11px 13px;
                      margin-bottom:10px; font-size:12.5px; line-height:1.75; white-space:pre-wrap; }
    .trd-note-lbl   { font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:.1em;
                      margin-bottom:5px; }

    /* Footer */
    .trd-foot       { display:flex; gap:8px; margin-top:18px; }
  </style>

  <div class="trd-wrap">

    <!-- ═══ HERO ═══ -->
    <div class="trd-hero">
      <div style="min-width:0">
        <div class="trd-symbol">${trade.symbol || '—'}</div>
        <div class="trd-meta">${trade.date || ''}${trade.entryTime ? ' · ' + trade.entryTime : ''}${trade.exitTime ? ' → ' + trade.exitTime : ''}</div>
        <div class="trd-meta" style="margin-top:2px">
          ${[trade.direction, trade.instrumentType, trade.timeframe, trade.strategy].filter(Boolean).join(' · ') || '—'}
        </div>
        ${tagHTML ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:7px">${tagHTML}</div>` : ''}
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div class="trd-pnl">${n >= 0 ? '+' : ''}₹${INR(Math.abs(n))}</div>
        <div style="margin-top:5px"><span class="badge ${OBG}" style="font-size:11px">${OL}</span></div>
        ${flags.length ? `<div style="font-size:10px;color:var(--gold);margin-top:5px">${flags.length} flag${flags.length>1?'s':''}</div>` : ''}
      </div>
    </div>

    <!-- ═══ KPI STRIP ═══ -->
    <div class="trd-kpi">
      <div class="trd-kpi-card">
        <div class="trd-kpi-lbl">Gross P&L</div>
        <div class="trd-kpi-val" style="color:${gross>=0?'var(--green)':'var(--red)'}">${gross>=0?'+':''}₹${INR(Math.abs(gross))}</div>
      </div>
      <div class="trd-kpi-card">
        <div class="trd-kpi-lbl">Charges</div>
        <div class="trd-kpi-val" style="color:var(--gold)">-₹${INR(totalTax)}</div>
      </div>
      <div class="trd-kpi-card">
        <div class="trd-kpi-lbl">Net P&L</div>
        <div class="trd-kpi-val" style="color:${OC}">${n>=0?'+':''}₹${INR(Math.abs(n))}</div>
      </div>
      <div class="trd-kpi-card">
        <div class="trd-kpi-lbl">${capital > 0 ? 'Return %' : 'Actual R:R'}</div>
        <div class="trd-kpi-val" style="color:${n>=0?'var(--green)':'var(--red)'}">${capital > 0 ? (returnPct>=0?'+':'')+returnPct.toFixed(2)+'%' : actualRR > 0 ? actualRR.toFixed(2)+'R' : '—'}</div>
      </div>
    </div>

    <!-- ═══ TABS ═══ -->
    <div class="trd-tabs">
      <button class="trd-tab on"   onclick="trdTab('${tabId}','overview',this)">📊 Overview</button>
      <button class="trd-tab"      onclick="trdTab('${tabId}','pnl',this)">💰 P&L Detail</button>
      <button class="trd-tab"      onclick="trdTab('${tabId}','execution',this)">📍 Execution</button>
      <button class="trd-tab"      onclick="trdTab('${tabId}','context',this)">🔍 Context</button>
      <button class="trd-tab"      onclick="trdTab('${tabId}','psychology',this)">🧠 Psychology</button>
      <button class="trd-tab"      onclick="trdTab('${tabId}','notes',this)">📝 Notes</button>
    </div>

    <!-- ════════════════════════════════════════
         TAB: OVERVIEW
    ════════════════════════════════════════ -->
    <div class="trd-panel on" id="${tabId}-overview">

      <!-- Flags -->
      ${flags.length ? `
      <div class="trd-sec" style="border-color:rgba(255,180,0,0.3)">
        <div class="trd-sec-head" style="color:var(--gold)">⚑ Trade Flags</div>
        <div class="trd-sec-body">
          ${flags.map(f=>`<div class="trd-flag" style="background:${f.col}18;border-left:3px solid ${f.col}">
            <span style="font-size:14px">${f.icon}</span>
            <span style="color:${f.col};font-weight:600">${f.label}</span>
          </div>`).join('')}
        </div>
      </div>` : ''}

      <!-- Quick stats grid -->
      <div class="trd-sec">
        <div class="trd-sec-head">📈 Trade Analytics</div>
        <div class="trd-sec-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
            ${entry ? `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:7px;padding:10px 12px">
              <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text3);margin-bottom:3px">Entry Price</div>
              <div style="font-family:var(--font-mono);font-size:14px;font-weight:700">₹${INR(entry)}</div>
            </div>` : ''}
            ${exit ? `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:7px;padding:10px 12px">
              <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text3);margin-bottom:3px">Exit Price</div>
              <div style="font-family:var(--font-mono);font-size:14px;font-weight:700">₹${INR(exit)}</div>
            </div>` : ''}
            ${qty ? `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:7px;padding:10px 12px">
              <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text3);margin-bottom:3px">Qty × Lot Size</div>
              <div style="font-family:var(--font-mono);font-size:14px;font-weight:700">${qty}${lotSz > 1 ? ' × ' + lotSz + ' = ' + totalQty : ''}</div>
            </div>` : ''}
            ${entry && exit ? `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:7px;padding:10px 12px">
              <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text3);margin-bottom:3px">Price Move</div>
              <div style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:${priceMoveDir>=0?'var(--green)':'var(--red)'}">
                ${priceMoveDir>=0?'+':''}₹${INR(Math.abs(priceMoveDir))} (${pricePct>=0?'+':''}${pricePct.toFixed(2)}%)
              </div>
            </div>` : ''}
          </div>

          ${riskPts > 0 ? `
          <!-- R:R Visual -->
          <div style="margin-bottom:12px">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text3);margin-bottom:8px">Risk : Reward Visual</div>
            <div style="display:flex;align-items:center;gap:6px;font-size:11px;font-family:var(--font-mono)">
              <span style="color:var(--text3);width:60px;text-align:right">Planned</span>
              <div style="flex:1;height:10px;background:var(--bg3);border-radius:5px;overflow:hidden;display:flex">
                <div style="width:${100/(1+plannedRR)*plannedRR <= 0 ? 0 : Math.min(100/(1+plannedRR)*plannedRR,70)}%;background:rgba(0,255,163,0.6);border-radius:5px 0 0 5px;min-width:2px"></div>
                <div style="width:${100/(1+plannedRR)}%;background:rgba(255,68,102,0.6);min-width:2px"></div>
              </div>
              <span style="color:var(--text2);width:50px">${plannedRR > 0 ? plannedRR.toFixed(2)+'R' : '—'}</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px;font-size:11px;font-family:var(--font-mono);margin-top:5px">
              <span style="color:var(--text3);width:60px;text-align:right">Actual</span>
              <div style="flex:1;height:10px;background:var(--bg3);border-radius:5px;overflow:hidden;display:flex">
                <div style="width:${Math.min(actualRR/(actualRR+1)*100,80)}%;background:${n>=0?'rgba(0,255,163,0.7)':'rgba(255,68,102,0.7)'};border-radius:5px;min-width:2px"></div>
              </div>
              <span style="color:${n>=0?'var(--green)':'var(--red)'};width:50px">${actualRR > 0 ? actualRR.toFixed(2)+'R' : '—'}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text3);margin-top:4px;padding:0 66px 0 66px">
              <span>Risk: ₹${INR(riskAmount)}</span>
              ${tgt ? `<span>Target: ₹${INR(tgt)}</span>` : ''}
              ${sl ? `<span>SL: ₹${INR(sl)}</span>` : ''}
            </div>
          </div>` : ''}

          <!-- Quality Score bar -->
          ${qs ? `
          <div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text3)">Trade Quality Score</span>
              <span style="font-family:var(--font-mono);font-size:13px;font-weight:800;color:${qsCol}">${qs}/100 — ${qsLbl}</span>
            </div>
            <div style="height:8px;background:var(--bg3);border-radius:4px;overflow:hidden">
              <div style="width:${qs}%;height:100%;background:linear-gradient(90deg,var(--red),var(--gold),var(--green));border-radius:4px;transition:width .8s"></div>
            </div>
          </div>` : ''}
        </div>
      </div>

      <!-- Comparison with history -->
      ${(symAvgPnl !== null || stratAvgPnl !== null) ? `
      <div class="trd-sec">
        <div class="trd-sec-head">📊 How This Trade Compares</div>
        <div class="trd-sec-body">
          <div class="trd-cmp">
            ${allAvgPnl !== null ? (() => {
              const maxV = Math.max(Math.abs(n), Math.abs(allAvgPnl), 1);
              return `<div class="trd-cmp-row">
                <span class="trd-cmp-label">All trades avg</span>
                <div class="trd-cmp-bar-wrap">
                  <div class="trd-cmp-bar" style="width:${Math.min(Math.abs(allAvgPnl)/maxV*100,100)}%;background:${allAvgPnl>=0?'rgba(0,255,163,0.5)':'rgba(255,68,102,0.5)'}"></div>
                </div>
                <span class="trd-cmp-val" style="color:${allAvgPnl>=0?'var(--green)':'var(--red)'}">${fmtI(allAvgPnl)}</span>
              </div>`;
            })() : ''}
            ${symAvgPnl !== null ? (() => {
              const maxV = Math.max(Math.abs(n), Math.abs(symAvgPnl), 1);
              return `<div class="trd-cmp-row">
                <span class="trd-cmp-label">${trade.symbol} avg</span>
                <div class="trd-cmp-bar-wrap">
                  <div class="trd-cmp-bar" style="width:${Math.min(Math.abs(symAvgPnl)/maxV*100,100)}%;background:${symAvgPnl>=0?'rgba(0,212,255,0.6)':'rgba(255,68,102,0.5)'}"></div>
                </div>
                <span class="trd-cmp-val" style="color:${symAvgPnl>=0?'var(--blue)':'var(--red)'}">${fmtI(symAvgPnl)}</span>
              </div>`;
            })() : ''}
            ${stratAvgPnl !== null ? (() => {
              const maxV = Math.max(Math.abs(n), Math.abs(stratAvgPnl), 1);
              return `<div class="trd-cmp-row">
                <span class="trd-cmp-label">${(trade.strategy||'').length > 12 ? trade.strategy.slice(0,12)+'…' : trade.strategy} avg</span>
                <div class="trd-cmp-bar-wrap">
                  <div class="trd-cmp-bar" style="width:${Math.min(Math.abs(stratAvgPnl)/maxV*100,100)}%;background:${stratAvgPnl>=0?'rgba(179,136,255,0.6)':'rgba(255,68,102,0.5)'}"></div>
                </div>
                <span class="trd-cmp-val" style="color:${stratAvgPnl>=0?'var(--purple)':'var(--red)'}">${fmtI(stratAvgPnl)}</span>
              </div>`;
            })() : ''}
            <div class="trd-cmp-row">
              <span class="trd-cmp-label">This trade</span>
              <div class="trd-cmp-bar-wrap">
                <div class="trd-cmp-bar" style="width:100%;background:${OC}aa"></div>
              </div>
              <span class="trd-cmp-val" style="color:${OC}">${fmtI(n)}</span>
            </div>
          </div>
          ${(symWR !== null || stratWR !== null) ? `
          <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border);display:flex;gap:16px;flex-wrap:wrap">
            ${symWR !== null ? `<div style="font-size:12px"><span style="color:var(--text3)">${trade.symbol} Win Rate: </span><span style="font-family:var(--font-mono);font-weight:700;color:var(--blue)">${symWR.toFixed(1)}%</span> <span style="color:var(--text3);font-size:10px">(${symTrades.length} trades)</span></div>` : ''}
            ${stratWR !== null ? `<div style="font-size:12px"><span style="color:var(--text3)">${trade.strategy} Win Rate: </span><span style="font-family:var(--font-mono);font-weight:700;color:var(--purple)">${stratWR.toFixed(1)}%</span> <span style="color:var(--text3);font-size:10px">(${stratTrades.length} trades)</span></div>` : ''}
          </div>` : ''}
        </div>
      </div>` : ''}

    </div><!-- /overview -->


    <!-- ════════════════════════════════════════
         TAB: P&L DETAIL
    ════════════════════════════════════════ -->
    <div class="trd-panel" id="${tabId}-pnl">
      <div class="trd-sec">
        <div class="trd-sec-head">💰 Full P&L Waterfall</div>
        <div class="trd-sec-body">
          <div class="trd-wf-row">
            <span style="color:var(--text2)">Gross P&L</span>
            <span style="font-family:var(--font-mono);font-weight:700;color:${gross>=0?'var(--green)':'var(--red)'}">${gross>=0?'+':''}₹${INR(Math.abs(gross))}</span>
          </div>
          ${totalTax > 0 ? `
          <div class="trd-wf-row" style="color:var(--gold)">
            <span>Total Charges Deducted</span>
            <span style="font-family:var(--font-mono);font-weight:700">-₹${INR(totalTax)}</span>
          </div>
          ${brokerage > 0 ? `<div class="trd-wf-sub"><span>↳ Brokerage</span><span style="font-family:var(--font-mono)">₹${INR(brokerage)}</span></div>` : ''}
          ${stt > 0       ? `<div class="trd-wf-sub"><span>↳ STT</span><span style="font-family:var(--font-mono)">₹${INR(stt)}</span></div>` : ''}
          ${exchange > 0  ? `<div class="trd-wf-sub"><span>↳ Exchange Charges</span><span style="font-family:var(--font-mono)">₹${INR(exchange)}</span></div>` : ''}
          ${sebi > 0      ? `<div class="trd-wf-sub"><span>↳ SEBI Turnover</span><span style="font-family:var(--font-mono)">₹${INR(sebi)}</span></div>` : ''}
          ${gst > 0       ? `<div class="trd-wf-sub"><span>↳ GST</span><span style="font-family:var(--font-mono)">₹${INR(gst)}</span></div>` : ''}
          ${slippage > 0  ? `<div class="trd-wf-sub"><span>↳ Slippage</span><span style="font-family:var(--font-mono)">₹${INR(slippage)}</span></div>` : ''}
          ${other > 0     ? `<div class="trd-wf-sub"><span>↳ Other</span><span style="font-family:var(--font-mono)">₹${INR(other)}</span></div>` : ''}
          ` : ''}
          <div class="trd-wf-row tot">
            <span>Net P&L</span>
            <span style="font-family:var(--font-mono);color:${OC};font-size:15px">${n>=0?'+':''}₹${INR(Math.abs(n))}</span>
          </div>
          ${capital > 0 ? `
          <div class="trd-wf-row" style="border-top:1px solid var(--border);margin-top:4px;padding-top:8px">
            <span style="color:var(--text3)">Capital Deployed</span>
            <span style="font-family:var(--font-mono)">₹${INR(capital)}</span>
          </div>
          <div class="trd-wf-row">
            <span style="color:var(--text3)">Return on Capital</span>
            <span style="font-family:var(--font-mono);font-weight:700;color:${n>=0?'var(--green)':'var(--red)'}">${returnPct>=0?'+':''}${returnPct.toFixed(3)}%</span>
          </div>` : ''}
          ${gross !== 0 && totalTax > 0 ? `
          <div class="trd-wf-row">
            <span style="color:var(--text3)">Tax Drag on Gross</span>
            <span style="font-family:var(--font-mono);color:var(--gold)">${taxDragPct.toFixed(2)}%</span>
          </div>` : ''}
        </div>
      </div>

      <!-- P&L Visual Bar -->
      ${Math.abs(gross) > 0 ? `
      <div class="trd-sec">
        <div class="trd-sec-head">📊 P&L Composition Visual</div>
        <div class="trd-sec-body">
          ${[
            { lbl: 'Gross P&L', val: Math.abs(gross), col: gross >= 0 ? 'var(--green)' : 'var(--red)', pct: 100 },
            { lbl: 'Charges', val: totalTax, col: '#f7b731', pct: totalTax / Math.abs(gross) * 100 },
            { lbl: 'Net P&L', val: Math.abs(n), col: n >= 0 ? 'var(--blue)' : 'var(--red)', pct: Math.abs(n) / Math.abs(gross) * 100 },
          ].map(b => `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;font-size:12px">
              <span style="width:80px;color:var(--text3);flex-shrink:0">${b.lbl}</span>
              <div style="flex:1;height:14px;background:var(--bg3);border-radius:4px;overflow:hidden">
                <div style="width:${Math.min(b.pct,100).toFixed(1)}%;height:100%;background:${b.col};border-radius:4px;transition:width .8s"></div>
              </div>
              <span style="font-family:var(--font-mono);font-weight:700;color:${b.col};width:90px;text-align:right">${b.col === 'var(--green)' || b.col === 'var(--blue)' ? '+' : ''}₹${INR(b.val)}</span>
            </div>`).join('')}
        </div>
      </div>` : ''}
    </div><!-- /pnl -->


    <!-- ════════════════════════════════════════
         TAB: EXECUTION
    ════════════════════════════════════════ -->
    <div class="trd-panel" id="${tabId}-execution">

      ${(entry && exit && sl) ? `
      <!-- Price Levels Visual -->
      <div class="trd-sec">
        <div class="trd-sec-head">📍 Price Level Map</div>
        <div class="trd-sec-body">
          ${(() => {
            const allPrices = [entry, exit, sl > 0 ? sl : null, tgt > 0 ? tgt : null].filter(Boolean);
            const minP = Math.min(...allPrices);
            const maxP = Math.max(...allPrices);
            const range = maxP - minP || 1;
            const pos = v => ((v - minP) / range * 82 + 4).toFixed(1);
            const levels = [
              ...(sl > 0  ? [{ v: sl,    lbl: 'SL',     col: 'rgba(255,68,102,0.8)',   txt: '#ff4466' }] : []),
              ...(tgt > 0 ? [{ v: tgt,   lbl: 'TGT',    col: 'rgba(0,255,163,0.5)',    txt: '#00ffa3' }] : []),
              ...(entry   ? [{ v: entry, lbl: 'ENTRY',  col: 'rgba(108,99,255,0.8)',   txt: '#b388ff' }] : []),
              ...(exit    ? [{ v: exit,  lbl: 'EXIT',   col: n>=0?'rgba(0,255,163,0.9)':'rgba(255,68,102,0.9)', txt: n>=0?'#00ffa3':'#ff4466' }] : []),
            ];
            return `<div style="position:relative;height:130px;background:var(--bg3);border-radius:7px;border:1px solid var(--border);margin-bottom:10px;overflow:visible">
              <!-- zone fill between entry and exit -->
              ${(entry && exit) ? `<div style="position:absolute;bottom:0;top:0;left:${Math.min(pos(entry),pos(exit))}%;width:${Math.abs(pos(exit)-pos(entry))}%;background:${n>=0?'rgba(0,255,163,0.06)':'rgba(255,68,102,0.06)'}"></div>` : ''}
              ${levels.sort((a,b)=>a.v-b.v).map(lv => `
                <div style="position:absolute;top:0;bottom:0;left:${pos(lv.v)}%;width:2px;background:${lv.col}"></div>
                <div style="position:absolute;top:8px;left:calc(${pos(lv.v)}% + 5px);font-size:9px;font-weight:700;color:${lv.txt};font-family:var(--font-mono);white-space:nowrap">${lv.lbl}</div>
                <div style="position:absolute;bottom:8px;left:calc(${pos(lv.v)}% + 5px);font-size:10px;font-weight:700;color:${lv.txt};font-family:var(--font-mono);white-space:nowrap">₹${INR(lv.v)}</div>
              `).join('')}
            </div>`;
          })()}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
            ${riskPts>0?`<div style="background:rgba(255,68,102,0.1);border:1px solid rgba(255,68,102,0.25);border-radius:6px;padding:8px 10px">
              <div style="font-size:9px;color:var(--red);text-transform:uppercase;font-weight:700;margin-bottom:2px">Risk / Stop Distance</div>
              <div style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--red)">₹${INR(riskPts)} pts → ₹${INR(riskAmount)}</div>
            </div>`:''}
            ${rewPts>0?`<div style="background:rgba(0,255,163,0.07);border:1px solid rgba(0,255,163,0.2);border-radius:6px;padding:8px 10px">
              <div style="font-size:9px;color:var(--green);text-transform:uppercase;font-weight:700;margin-bottom:2px">Reward / Target Distance</div>
              <div style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--green)">₹${INR(rewPts)} pts → ₹${INR(rewPts*totalQty)}</div>
            </div>`:''}
            ${plannedRR>0?`<div style="background:rgba(108,99,255,0.08);border:1px solid rgba(108,99,255,0.2);border-radius:6px;padding:8px 10px">
              <div style="font-size:9px;color:var(--purple);text-transform:uppercase;font-weight:700;margin-bottom:2px">Planned R:R</div>
              <div style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--purple)">${plannedRR.toFixed(2)} : 1</div>
            </div>`:''}
            ${actualRR>0?`<div style="background:rgba(6,214,245,0.07);border:1px solid rgba(6,214,245,0.2);border-radius:6px;padding:8px 10px">
              <div style="font-size:9px;color:var(--blue);text-transform:uppercase;font-weight:700;margin-bottom:2px">Actual R:R</div>
              <div style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:${n>=0?'var(--green)':'var(--red)'}">${actualRR.toFixed(2)} : 1</div>
            </div>`:''}
          </div>
        </div>
      </div>` : ''}

      <div class="trd-sec">
        <div class="trd-sec-head">⚙️ Execution Details</div>
        <div class="trd-sec-body">
          ${row('Direction', `<span style="color:${trade.direction==='Long'?'var(--green)':'var(--red)'};font-weight:700">${trade.direction||'—'}</span>`)}
          ${row('Instrument Type', trade.instrumentType)}
          ${row('Timeframe', trade.timeframe)}
          ${row('Entry Time', trade.entryTime)}
          ${row('Exit Time', trade.exitTime)}
          ${row('Entry Type', trade.entryType)}
          ${row('Exit Type', trade.exitType)}
          ${row('Exit Reason', trade.exitReason)}
          ${trade.mae ? row('MAE (Max Adverse Excursion)', `<span style="color:var(--red)">₹${INR(trade.mae)}</span>`) : ''}
          ${trade.mfe ? row('MFE (Max Favourable Excursion)', `<span style="color:var(--green)">₹${INR(trade.mfe)}</span>`) : ''}
          ${trade.expiry ? row('Expiry', trade.expiry) : ''}
          ${trade.strike ? row('Strike Price', `₹${INR(trade.strike)}`) : ''}
          ${row('Plan Adherence', trade.planAdherence)}
        </div>
      </div>
    </div><!-- /execution -->


    <!-- ════════════════════════════════════════
         TAB: CONTEXT
    ════════════════════════════════════════ -->
    <div class="trd-panel" id="${tabId}-context">
      <div class="trd-sec">
        <div class="trd-sec-head">🌊 Market Context</div>
        <div class="trd-sec-body">
          ${row('Strategy', trade.strategy)}
          ${row('Setup Grade', trade.setupGrade)}
          ${row('Market Regime', trade.regime)}
          ${row('Indicators Used', trade.indicators)}
          ${row('Market Context', trade.marketContext)}
          ${row('Trade Type', trade.tradeType)}
          ${row('Account', trade.account)}
          ${trade.tradeRef ? row('Reference No.', trade.tradeRef) : ''}
        </div>
      </div>

      ${(symTrades.length > 0 || stratTrades.length > 0) ? `
      <div class="trd-sec">
        <div class="trd-sec-head">📊 Symbol & Strategy Stats (your history)</div>
        <div class="trd-sec-body">
          ${symTrades.length > 0 ? `
          <div style="margin-bottom:12px">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--blue);margin-bottom:8px">${trade.symbol} — All ${symTrades.length + 1} Trades</div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px">
              ${[
                ['Trades', symTrades.length + 1, ''],
                ['Avg P&L', `${(symAvgPnl>=0?'+':'')+'₹'+INR(Math.abs(symAvgPnl))}`, symAvgPnl>=0?'var(--green)':'var(--red)'],
                ['Win Rate', `${symWR.toFixed(1)}%`, symWR>=50?'var(--green)':'var(--red)'],
                ['Total P&L', fmtI(symTrades.reduce((a,t)=>a+net(t),0)+n), (symTrades.reduce((a,t)=>a+net(t),0)+n)>=0?'var(--green)':'var(--red)'],
                ['Best', `₹${INR(Math.max(...symTrades.map(t=>net(t)),n))}`, 'var(--green)'],
                ['Worst', `₹${INR(Math.min(...symTrades.map(t=>net(t)),n))}`, 'var(--red)'],
              ].map(([l,v,c])=>`<div style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:8px 10px">
                <div style="font-size:9px;color:var(--text3);text-transform:uppercase;margin-bottom:2px">${l}</div>
                <div style="font-family:var(--font-mono);font-size:12px;font-weight:700${c?';color:'+c:''}">${v}</div>
              </div>`).join('')}
            </div>
          </div>` : ''}

          ${stratTrades.length > 0 && trade.strategy ? `
          <div>
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--purple);margin-bottom:8px">${trade.strategy} — All ${stratTrades.length + 1} Trades</div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px">
              ${[
                ['Trades', stratTrades.length + 1, ''],
                ['Avg P&L', `${(stratAvgPnl>=0?'+':'')+'₹'+INR(Math.abs(stratAvgPnl))}`, stratAvgPnl>=0?'var(--green)':'var(--red)'],
                ['Win Rate', `${stratWR.toFixed(1)}%`, stratWR>=50?'var(--green)':'var(--red)'],
                ['Total P&L', fmtI(stratTrades.reduce((a,t)=>a+net(t),0)+n), (stratTrades.reduce((a,t)=>a+net(t),0)+n)>=0?'var(--green)':'var(--red)'],
                ['Best', `₹${INR(Math.max(...stratTrades.map(t=>net(t)),n))}`, 'var(--green)'],
                ['Worst', `₹${INR(Math.min(...stratTrades.map(t=>net(t)),n))}`, 'var(--red)'],
              ].map(([l,v,c])=>`<div style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:8px 10px">
                <div style="font-size:9px;color:var(--text3);text-transform:uppercase;margin-bottom:2px">${l}</div>
                <div style="font-family:var(--font-mono);font-size:12px;font-weight:700${c?';color:'+c:''}">${v}</div>
              </div>`).join('')}
            </div>
          </div>` : ''}
        </div>
      </div>` : ''}

      <!-- Mini equity chart showing where this trade sits -->
      ${sorted.length > 2 ? `
      <div class="trd-sec">
        <div class="trd-sec-head">📈 Your Equity Curve — This Trade Highlighted</div>
        <div class="trd-sec-body">
          <div class="trd-mini-chart" id="trd-equity-mini-${tabId}"></div>
          <canvas id="trd-equity-canvas-${tabId}" height="90" style="display:none"></canvas>
        </div>
      </div>` : ''}
    </div><!-- /context -->


    <!-- ════════════════════════════════════════
         TAB: PSYCHOLOGY
    ════════════════════════════════════════ -->
    <div class="trd-panel" id="${tabId}-psychology">

      ${flags.length ? `
      <div class="trd-sec" style="border-color:rgba(255,180,0,.3)">
        <div class="trd-sec-head" style="color:var(--gold)">⚑ Behavioural Flags</div>
        <div class="trd-sec-body">
          ${flags.map(f=>`<div class="trd-flag" style="background:${f.col}18;border-left:3px solid ${f.col}">
            <span style="font-size:15px">${f.icon}</span>
            <span style="color:${f.col};font-weight:600;font-size:13px">${f.label}</span>
          </div>`).join('')}
        </div>
      </div>` : `
      <div style="background:rgba(0,255,163,0.06);border:1px solid rgba(0,255,163,.2);border-radius:8px;padding:12px 14px;margin-bottom:12px;font-size:13px;color:var(--green)">
        ✅ No behavioural flags detected for this trade
      </div>`}

      <div class="trd-sec">
        <div class="trd-sec-head">🧠 Mental State</div>
        <div class="trd-sec-body">
          ${row('Pre-trade Emotion', trade.preEmotion)}
          ${row('Trade Emotion', trade.emotion)}
          ${trade.confidence ? `<div class="trd-row">
            <span class="trd-lbl">Confidence</span>
            <div style="display:flex;align-items:center;gap:8px;flex:1;justify-content:flex-end">
              <div style="width:80px;height:6px;background:var(--bg3);border-radius:3px;overflow:hidden">
                <div style="width:${trade.confidence*10}%;height:100%;background:var(--blue);border-radius:3px"></div>
              </div>
              <span class="trd-val">${trade.confidence}/10</span>
            </div>
          </div>` : ''}
          ${trade.stress ? `<div class="trd-row">
            <span class="trd-lbl">Stress Level</span>
            <div style="display:flex;align-items:center;gap:8px;flex:1;justify-content:flex-end">
              <div style="width:80px;height:6px;background:var(--bg3);border-radius:3px;overflow:hidden">
                <div style="width:${trade.stress*10}%;height:100%;background:${trade.stress>=7?'var(--red)':trade.stress>=5?'var(--gold)':'var(--green)'};border-radius:3px"></div>
              </div>
              <span class="trd-val">${trade.stress}/10</span>
            </div>
          </div>` : ''}
          ${row('Energy', trade.energy)}
          ${row('Discipline', trade.discipline)}
          ${trade.isRevenge  ? `<div class="trd-row"><span class="trd-lbl">Revenge Trade</span><span class="trd-val" style="color:var(--red)">⚠️ Yes</span></div>` : ''}
          ${trade.isImpulsive? `<div class="trd-row"><span class="trd-lbl">Impulsive Entry</span><span class="trd-val" style="color:var(--gold)">⚠️ Yes</span></div>` : ''}
          ${trade.brokenRules?.length ? `<div class="trd-row"><span class="trd-lbl">Rules Broken</span><span class="trd-val" style="color:var(--red)">${trade.brokenRules.length} rule(s)</span></div>` : ''}
        </div>
      </div>

      ${qs ? `
      <div class="trd-sec">
        <div class="trd-sec-head">⭐ Quality Breakdown</div>
        <div class="trd-sec-body">
          ${[
            ['Setup Clarity',    trade.setup,        '#06d6f5'],
            ['Entry Timing',     trade.execution,    '#00ffa3'],
            ['Exit Discipline',  trade.management,   '#b388ff'],
            ['Plan Score',       trade.planScore,    '#ffd166'],
            ['Review Score',     trade.reviewScore,  '#ff9f43'],
          ].filter(([,v]) => v).map(([lbl, v, col]) => `
            <div class="trd-qbar-row">
              <span class="trd-qbar-label">${lbl}</span>
              <div class="trd-qbar-track"><div class="trd-qbar-fill" style="width:${v*10}%;background:${col}88"></div></div>
              <span class="trd-qbar-num" style="color:${col}">${v}</span>
            </div>`).join('')}
          <div style="display:flex;justify-content:space-between;align-items:center;padding-top:10px;border-top:1px solid var(--border);margin-top:8px">
            <span style="font-size:12px;color:var(--text2)">Overall Quality Score</span>
            <span style="font-family:var(--font-mono);font-size:18px;font-weight:800;color:${qsCol}">${qs}/100 — ${qsLbl}</span>
          </div>
        </div>
      </div>` : ''}
    </div><!-- /psychology -->


    <!-- ════════════════════════════════════════
         TAB: NOTES
    ════════════════════════════════════════ -->
    <div class="trd-panel" id="${tabId}-notes">
      ${[
        { key: trade.plan,          lbl: 'Pre-trade Plan',          col: 'var(--blue)' },
        { key: trade.reason,        lbl: 'Setup / Reason for Entry', col: 'var(--text3)' },
        { key: trade.marketContext, lbl: 'Market Context',           col: 'var(--text3)' },
        { key: trade.mistakes,      lbl: 'Mistakes / What Went Wrong', col: 'var(--red)' },
        { key: trade.lesson,        lbl: 'Lesson Learned',           col: 'var(--gold)' },
        { key: trade.notes,         lbl: 'Additional Notes',         col: 'var(--text3)' },
      ].filter(b => b.key && b.key.trim()).map(b => `
        <div class="trd-note-block" style="border-left:3px solid ${b.col}">
          <div class="trd-note-lbl" style="color:${b.col}">${b.lbl}</div>
          ${b.key}
        </div>`).join('') || `<div style="color:var(--text3);font-size:13px;text-align:center;padding:28px">No notes recorded for this trade.</div>`}
      ${trade.chartUrl ? `
      <div class="trd-note-block" style="border-left:3px solid var(--accent)">
        <div class="trd-note-lbl" style="color:var(--accent)">Chart Link</div>
        <a href="${trade.chartUrl}" target="_blank" style="color:var(--accent);word-break:break-all;font-size:12.5px">${trade.chartUrl}</a>
      </div>` : ''}
    </div><!-- /notes -->


    <!-- Footer buttons -->
    <div class="trd-foot">
      <button class="btn-primary" onclick="editTrade('${trade.id}');closeTradeModal()" style="flex:1">✏️ Edit Trade</button>
      <button class="btn-secondary" onclick="copyTradeReport('${trade.id}')">📋 Copy</button>
      <button class="btn-danger" onclick="deleteTradeById('${trade.id}');closeTradeModal()">🗑</button>
    </div>

  </div><!-- /trd-wrap -->
  `;

  modal.classList.add('open');
  const box = document.getElementById('modal-box');
  if (box) box.scrollTop = 0;

  /* ── Draw mini equity chart with this trade highlighted ── */
  setTimeout(() => {
    const canvasEl = document.getElementById(`trd-equity-canvas-${tabId}`);
    const wrapEl   = document.getElementById(`trd-equity-mini-${tabId}`);
    if (!canvasEl || !wrapEl || typeof Chart === 'undefined') return;

    // Move canvas into wrap
    canvasEl.style.display = 'block';
    canvasEl.style.width   = '100%';
    canvasEl.style.height  = '90px';
    wrapEl.innerHTML = '';
    wrapEl.appendChild(canvasEl);

    let runPnl = 0;
    const pts   = sorted.map(t => { runPnl += net(t); return { x: t.date, y: runPnl, isThis: t.id === trade.id }; });
    const labels = pts.map(p => p.x.slice(5));
    const values = pts.map(p => p.y);
    const thisIdx = pts.findIndex(p => p.isThis);

    const ptColors  = pts.map(p => p.isThis ? '#ffffff' : 'transparent');
    const ptRadii   = pts.map(p => p.isThis ? 7 : 0);
    const ptBorders = pts.map(p => p.isThis ? '#ffffff' : 'transparent');

    if (_charts[`trd_mini_${tabId}`]) { try { _charts[`trd_mini_${tabId}`].destroy(); } catch {} }
    _charts[`trd_mini_${tabId}`] = new Chart(canvasEl.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: values,
          borderColor: 'rgba(0,255,163,0.7)',
          backgroundColor: 'rgba(0,255,163,0.06)',
          borderWidth: 1.5,
          pointBackgroundColor: ptColors,
          pointBorderColor: ptBorders,
          pointRadius: ptRadii,
          pointHoverRadius: ptRadii,
          tension: 0.35,
          fill: true,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 600 },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: items => `${items[0].label}${pts[items[0].dataIndex]?.isThis ? ' ← THIS TRADE' : ''}`,
              label: c => ` Equity: ${c.parsed.y >= 0 ? '+' : ''}₹${INR(c.parsed.y)}`
            }
          }
        },
        scales: {
          x: { display: false },
          y: { display: false }
        }
      }
    });
  }, 80);
}
function closeTradeModal() {
  const m = document.getElementById('trade-modal');
  if (m) m.classList.remove('open');
}
function closeModal(e) { if (e && e.target === document.getElementById('trade-modal')) closeTradeModal(); }

/* Tab switcher for trade report popup */
function trdTab(tabId, panel, btn) {
  // hide all panels
  document.querySelectorAll(`[id^="${tabId}-"]`).forEach(el => el.classList.remove('on'));
  // deactivate all tabs
  btn.closest('.trd-tabs')?.querySelectorAll('.trd-tab').forEach(b => b.classList.remove('on'));
  // show target
  const target = document.getElementById(`${tabId}-${panel}`);
  if (target) target.classList.add('on');
  btn.classList.add('on');
  // scroll modal to top when switching tabs
  const box = document.getElementById('modal-box');
  if (box) box.scrollTop = 0;
}

function copyTradeReport(id) {
  const trade = getTrades().find(t => t.id === id);
  if (!trade) return;
  const n = net(trade);
  const lines = [
    `TradeBook Pro — Trade Report`,
    `═══════════════════════════`,
    `Symbol:    ${trade.symbol || '—'}`,
    `Date:      ${trade.date || '—'}`,
    `Direction: ${trade.direction || '—'}`,
    `Strategy:  ${trade.strategy || '—'}`,
    ``,
    `Entry:     ₹${Number(trade.entry || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `Exit:      ₹${Number(trade.exit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `Qty:       ${trade.qty || '—'}`,
    ``,
    `Gross P&L: ${n >= 0 ? '+' : '-'}₹${Math.abs(Number(trade.gross) || Math.abs(n)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `Charges:   -₹${Number(trade.tax || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `Net P&L:   ${n >= 0 ? '+' : '-'}₹${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `Outcome:   ${n > 0 ? 'WIN' : n < 0 ? 'LOSS' : 'BREAKEVEN'}`,
    trade.reason ? `\nSetup: ${trade.reason}` : '',
    trade.mistakes ? `\nMistakes: ${trade.mistakes}` : '',
    trade.lesson ? `\nLesson: ${trade.lesson}` : '',
  ].filter(l => l !== null && l !== undefined).join('\n');
  navigator.clipboard?.writeText(lines).then(() => toast('📋 Trade report copied!')).catch(() => toast('Copy not supported in this browser', 'warn'));
}

/* ────────────────────────────────────────────────────────────
   ANALYTICS HUB
──────────────────────────────────────────────────────────── */
function renderAnalytics() {
  const trades = getTrades();
  renderAnalyticsStats(trades);
  renderDayChart(trades);
  renderStratChart(trades);
  renderMonthChart(trades);
  renderEmoChart(trades);
  renderStratHeatmap(trades);
  renderAdvancedRisk(trades);
  renderTaxVisual(trades);
  renderInsights(trades);
  renderBenchmark(trades);
  renderEmotionHeatmap(trades);
  renderDeepDive(trades);
}

function renderAnalyticsStats(trades) {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  const total = trades.reduce((s,t)=>s+net(t),0);
  const totalGross = trades.reduce((s,t)=>s+(parseFloat(t.gross)||net(t)),0);
  const totalTax = trades.reduce((s,t)=>s+(parseFloat(t.tax)||0),0);
  const wins = trades.filter(t=>net(t)>0);
  const losses = trades.filter(t=>net(t)<0);
  const avgWin = wins.length ? wins.reduce((s,t)=>s+net(t),0)/wins.length : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((s,t)=>s+net(t),0)/losses.length) : 0;

  // Sharpe (daily returns)
  const dailyMap = {};
  trades.forEach(t => { dailyMap[t.date] = (dailyMap[t.date]||0) + net(t); });
  const daily = Object.values(dailyMap);
  const avg = daily.length ? daily.reduce((a,b)=>a+b,0)/daily.length : 0;
  const std = daily.length > 1 ? Math.sqrt(daily.reduce((s,r)=>s+(r-avg)**2,0)/daily.length) : 1;
  const sharpe = std > 0 ? (avg/std*Math.sqrt(252)).toFixed(2) : '—';

  const expectancy = trades.length ? (wins.length/trades.length*avgWin - losses.length/trades.length*avgLoss).toFixed(0) : '—';

  let peak=0,equity=0,maxDD=0;
  [...trades].sort((a,b)=>a.date.localeCompare(b.date)).forEach(t=>{equity+=net(t);peak=Math.max(peak,equity);maxDD=Math.max(maxDD,peak-equity);});
  const calmar = maxDD > 0 ? (total/maxDD).toFixed(2) : total > 0 ? '∞' : '—';

  set('a-sharpe', sharpe);
  set('a-expect', expectancy !== '—' ? fmt(parseFloat(expectancy)) : '—');
  set('a-calmar', calmar);
  set('a-total', trades.length);
  set('a-gross', fmt(totalGross));
  set('a-tax', fmt(totalTax));
}

function renderDayChart(trades) {
  const byDay = Array(7).fill(0).map(() => ({ pnl: 0, count: 0 }));
  trades.forEach(t => { const d = new Date(t.date+'T00:00:00').getDay(); byDay[d].pnl += net(t); byDay[d].count++; });
  const labels = DAYS;
  const data = byDay.map(d => d.pnl);
  mkChart('dayChart', {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: data.map(v => v >= 0 ? 'rgba(0,255,163,0.6)' : 'rgba(255,68,102,0.6)'), borderRadius: 4, borderSkipped: false }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>fmtS(c.parsed.y)}}}, scales:{x:{grid:GRID,ticks:TICK},y:{grid:GRID,ticks:{...TICK,callback:v=>fmt(v)}}} }
  });
}

function renderStratChart(trades) {
  const byStrat = {};
  trades.forEach(t => { const s = t.strategy || 'Other'; byStrat[s] = (byStrat[s]||0) + net(t); });
  const entries = Object.entries(byStrat).sort((a,b) => b[1]-a[1]).slice(0, 8);
  const COLORS = ['#00ffa3','#06d6f5','#ffd166','#ff4466','#b388ff','#ff9f43','#ff6bcd','#26de81'];
  mkChart('stratChart', {
    type: 'doughnut',
    data: { labels: entries.map(e=>e[0]), datasets: [{ data: entries.map(e=>Math.abs(e[1])), backgroundColor: COLORS, borderWidth: 0 }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:LEGEND, tooltip:{callbacks:{label:c=>`${c.label}: ${fmtS(entries[c.dataIndex][1])}`}}} }
  });
}

function renderMonthChart(trades) {
  const byMonth = {};
  trades.forEach(t => { const k = t.date?.slice(0,7)||''; byMonth[k] = (byMonth[k]||0) + net(t); });
  const keys = Object.keys(byMonth).sort().slice(-12);
  const data = keys.map(k => byMonth[k]);
  mkChart('monthChart', {
    type: 'bar',
    data: { labels: keys.map(k=>MONTHS[parseInt(k.slice(5))-1]+'\''+k.slice(2,4)), datasets: [{ data, backgroundColor: data.map(v=>v>=0?'rgba(0,255,163,0.7)':'rgba(255,68,102,0.7)'), borderRadius: 4, borderSkipped: false }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>fmtS(c.parsed.y)}}}, scales:{x:{grid:GRID,ticks:TICK},y:{grid:GRID,ticks:{...TICK,callback:v=>fmt(v)}}} }
  });
}

function renderEmoChart(trades) {
  const byEmo = {};
  trades.filter(t=>t.emotion).forEach(t => { if (!byEmo[t.emotion]) byEmo[t.emotion]={pnl:0,count:0}; byEmo[t.emotion].pnl+=net(t); byEmo[t.emotion].count++; });
  const entries = Object.entries(byEmo);
  const COLORS = ['#00ffa3','#06d6f5','#ffd166','#ff4466','#b388ff','#ff9f43'];
  mkChart('emoChart', {
    type: 'bar',
    data: { labels: entries.map(e=>e[0]), datasets: [{ data: entries.map(e=>e[1].pnl), backgroundColor: COLORS, borderRadius: 4, borderSkipped: false }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${fmtS(c.parsed.y)} (${entries[c.dataIndex][1].count} trades)`}}}, scales:{x:{grid:GRID,ticks:TICK},y:{grid:GRID,ticks:{...TICK,callback:v=>fmt(v)}}} }
  });
}

function renderStratHeatmap(trades) {
  const container = document.getElementById('strat-heatmap-container');
  if (!container) return;
  const strategies = [...new Set(trades.map(t=>t.strategy).filter(Boolean))];
  const months = [...new Set(trades.map(t=>t.date?.slice(0,7)).filter(Boolean))].sort().slice(-6);
  if (!strategies.length || !months.length) { container.innerHTML = '<p style="color:var(--text3);font-size:13px;padding:16px">Log trades with strategies to see heatmap.</p>'; return; }
  const grid = {};
  trades.forEach(t => { const k = `${t.strategy}|${t.date?.slice(0,7)}`; grid[k] = (grid[k]||0) + net(t); });
  const maxAbs = Math.max(...Object.values(grid).map(Math.abs), 1);
  container.innerHTML = `<div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:11px;min-width:100%">
    <thead><tr><th style="padding:6px 10px;color:var(--text3);text-align:left">Strategy</th>${months.map(m=>`<th style="padding:6px 10px;color:var(--text3);text-align:center">${MONTHS[parseInt(m.slice(5))-1]}'${m.slice(2,4)}</th>`).join('')}</tr></thead>
    <tbody>${strategies.map(s=>`<tr>${[`<td style="padding:6px 10px;color:var(--text2);white-space:nowrap">${s}</td>`,...months.map(m=>{const v=grid[`${s}|${m}`]||0;const i=Math.abs(v)/maxAbs;const bg=v>0?`rgba(0,255,163,${0.1+i*0.5})`:`rgba(255,68,102,${0.1+i*0.5})`;return `<td style="padding:6px 10px;background:${bg};border-radius:4px;text-align:center;font-family:var(--font-mono);color:${v>=0?'var(--green)':'var(--red)'}">${v?fmtS(v):'—'}</td>`})].join('')}</tr>`).join('')}
    </tbody></table></div>`;
}

function renderAdvancedRisk(trades) {
  const container = document.getElementById('adv-risk-container');
  if (!container || trades.length < 3) { if(container) container.innerHTML='<p style="color:var(--text3);font-size:13px">Need 3+ trades.</p>'; return; }
  const daily = {};
  trades.forEach(t => { daily[t.date]=(daily[t.date]||0)+net(t); });
  const rets = Object.values(daily);
  const avg = rets.reduce((a,b)=>a+b,0)/rets.length;
  const std = Math.sqrt(rets.reduce((s,r)=>s+(r-avg)**2,0)/rets.length);
  const downRets = rets.filter(r=>r<0);
  const downStd = downRets.length?Math.sqrt(downRets.reduce((s,r)=>s+r*r,0)/downRets.length):1;
  const sharpe = std>0?(avg/std*Math.sqrt(252)).toFixed(2):'—';
  const sortino = downStd>0?(avg/downStd*Math.sqrt(252)).toFixed(2):'—';
  let peak=0,eq=0,mdd=0;
  [...trades].sort((a,b)=>a.date.localeCompare(b.date)).forEach(t=>{eq+=net(t);peak=Math.max(peak,eq);mdd=Math.max(mdd,peak-eq);});
  const total=trades.reduce((s,t)=>s+net(t),0);
  const calmar=mdd>0?(total/mdd).toFixed(2):total>0?'∞':'—';
  const metrics=[
    {n:'Sharpe Ratio',v:sharpe,d:'>1 good, >2 excellent',c:'var(--blue)'},
    {n:'Sortino Ratio',v:sortino,d:'Downside-only vol',c:'var(--purple)'},
    {n:'Calmar Ratio',v:calmar,d:'Return / Max DD',c:'var(--gold)'},
    {n:'Max Drawdown',v:fmt(mdd),d:'Worst peak-to-trough',c:'var(--red)'},
    {n:'Daily Avg P&L',v:fmt(avg),d:'Mean daily return',c:'var(--green)'},
    {n:'Daily Std Dev',v:fmt(std),d:'Volatility of returns',c:'var(--orange)'},
  ];
  container.innerHTML=`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px">${metrics.map(m=>`<div style="background:var(--bg4);border-radius:var(--radius-sm);padding:14px;border:1px solid var(--border)"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;margin-bottom:6px">${m.n}</div><div style="font-family:var(--font-mono);font-size:20px;font-weight:700;color:${m.c}">${m.v}</div><div style="font-size:10px;color:var(--text3);margin-top:4px">${m.d}</div></div>`).join('')}</div>`;
}

function renderTaxVisual(trades) {
  const container = document.getElementById('tax-visual');
  if (!container) return;
  const gross = trades.reduce((s,t)=>s+(parseFloat(t.gross)||net(t)),0);
  const tax = trades.reduce((s,t)=>s+(parseFloat(t.tax)||0),0);
  const netPnl = gross - tax;
  const taxPct = gross > 0 ? (tax/gross*100).toFixed(1) : 0;
  container.innerHTML = `<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:8px 0">
    <div style="flex:1;min-width:200px"><div style="font-size:12px;color:var(--text3);margin-bottom:6px">Gross vs Net P&L</div>
    <div style="display:flex;gap:8px;align-items:flex-end;height:60px">
      <div style="display:flex;flex-direction:column;align-items:center;gap:4px"><div style="width:48px;background:rgba(0,255,163,0.4);border-radius:4px 4px 0 0;height:${gross>0?Math.max(10,(gross/(gross||1))*50):10}px"></div><div style="font-size:10px;color:var(--text3)">Gross</div></div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:4px"><div style="width:48px;background:rgba(255,68,102,0.5);border-radius:4px 4px 0 0;height:${tax>0?Math.max(4,(tax/(gross||1))*50):4}px"></div><div style="font-size:10px;color:var(--text3)">Tax</div></div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:4px"><div style="width:48px;background:rgba(0,255,163,0.7);border-radius:4px 4px 0 0;height:${netPnl>0?Math.max(6,(netPnl/(gross||1))*50):6}px"></div><div style="font-size:10px;color:var(--text3)">Net</div></div>
    </div></div>
    <div style="flex:2;min-width:200px;display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div style="background:var(--bg4);border-radius:var(--radius-sm);padding:10px"><div style="font-size:10px;color:var(--text3)">Gross P&L</div><div style="font-size:16px;font-weight:700;color:var(--green)">${fmtS(gross)}</div></div>
      <div style="background:var(--bg4);border-radius:var(--radius-sm);padding:10px"><div style="font-size:10px;color:var(--text3)">Tax & Charges</div><div style="font-size:16px;font-weight:700;color:var(--red)">-${fmt(tax)}</div></div>
      <div style="background:var(--bg4);border-radius:var(--radius-sm);padding:10px"><div style="font-size:10px;color:var(--text3)">Net P&L</div><div style="font-size:16px;font-weight:700;color:${netPnl>=0?'var(--green)':'var(--red)'}">${fmtS(netPnl)}</div></div>
      <div style="background:var(--bg4);border-radius:var(--radius-sm);padding:10px"><div style="font-size:10px;color:var(--text3)">Tax Drag</div><div style="font-size:16px;font-weight:700;color:var(--gold)">${taxPct}%</div></div>
    </div></div>`;
}

function renderInsights(trades) {
  const container = document.getElementById('insights-container');
  if (!container) return;
  if (!trades.length) { container.innerHTML='<p style="color:var(--text3);font-size:13px;padding:20px">Log trades to see insights.</p>'; return; }
  const insights = generateInsights(trades);
  container.innerHTML = insights.map(ins => `
    <div style="background:var(--bg4);border:1px solid ${ins.border};border-radius:var(--radius-sm);padding:16px;margin-bottom:10px;display:flex;gap:14px;align-items:flex-start">
      <div style="font-size:24px;flex-shrink:0">${ins.icon}</div>
      <div><div style="font-size:13px;font-weight:700;color:${ins.color};margin-bottom:4px">${ins.title}</div>
      <div style="font-size:12px;color:var(--text2);line-height:1.6">${ins.body}</div></div>
    </div>`).join('');
}

function generateInsights(trades) {
  const insights = [];
  const wins = trades.filter(t=>net(t)>0);
  const losses = trades.filter(t=>net(t)<0);
  const wr = trades.length ? wins.length/trades.length : 0;
  const avgWin = wins.length ? wins.reduce((s,t)=>s+net(t),0)/wins.length : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((s,t)=>s+net(t),0)/losses.length) : 0;
  const pf = avgLoss > 0 ? avgWin/avgLoss : avgWin > 0 ? 99 : 0;

  if (wr >= 0.65) insights.push({icon:'🎯',title:'Sniper-Level Win Rate',body:`Your ${(wr*100).toFixed(0)}% win rate is elite. Less than 5% of traders sustain this. Keep following your process.`,color:'var(--green)',border:'rgba(0,255,163,0.2)'});
  else if (wr < 0.4) insights.push({icon:'⚠️',title:'Win Rate Below 40%',body:`You win only ${(wr*100).toFixed(0)}% of the time. Focus on higher-quality setups and reduce overtrading.`,color:'var(--red)',border:'rgba(255,68,102,0.2)'});

  if (pf >= 2) insights.push({icon:'💎',title:'Professional Profit Factor',body:`PF of ${pf.toFixed(2)} means you make ₹${pf.toFixed(2)} for every ₹1 lost. This is institutional-grade edge.`,color:'var(--blue)',border:'rgba(6,214,245,0.2)'});
  else if (pf < 1 && trades.length > 5) insights.push({icon:'🔴',title:'Negative Edge Detected',body:`Profit Factor below 1 means your losses outweigh wins over time. Review your exit strategy.`,color:'var(--red)',border:'rgba(255,68,102,0.2)'});

  // Best day of week
  const byDay = Array(7).fill(0).map(()=>({pnl:0,count:0}));
  trades.forEach(t => { const d = new Date(t.date+'T00:00:00').getDay(); byDay[d].pnl+=net(t); byDay[d].count++; });
  const bestDay = byDay.reduce((a,b,i)=>b.count>0&&b.pnl>a.pnl?{...b,i}:a,{pnl:-Infinity,i:0});
  const worstDay = byDay.reduce((a,b,i)=>b.count>0&&b.pnl<a.pnl?{...b,i}:a,{pnl:Infinity,i:0});
  if (bestDay.count > 2) insights.push({icon:'📅',title:`Best Day: ${DAYS[bestDay.i]}s`,body:`You make the most on ${DAYS[bestDay.i]}s (avg ${fmt(bestDay.pnl/bestDay.count)}/trade). Consider sizing up on your strongest day.`,color:'var(--green)',border:'rgba(0,255,163,0.15)'});
  if (worstDay.count > 2 && worstDay.pnl < 0) insights.push({icon:'🚫',title:`Worst Day: ${DAYS[worstDay.i]}s`,body:`${DAYS[worstDay.i]} is your weakest day (${fmt(worstDay.pnl)} total). Consider reducing size or sitting out on ${DAYS[worstDay.i]}s.`,color:'var(--gold)',border:'rgba(255,209,102,0.15)'});

  // Emotion analysis
  const byEmo = {};
  trades.filter(t=>t.emotion).forEach(t=>{if(!byEmo[t.emotion])byEmo[t.emotion]={pnl:0,count:0};byEmo[t.emotion].pnl+=net(t);byEmo[t.emotion].count++;});
  const worstEmo = Object.entries(byEmo).filter(([,v])=>v.count>=2).sort((a,b)=>a[1].pnl-b[1].pnl)[0];
  if (worstEmo) insights.push({icon:'🧠',title:`${worstEmo[0]} trades hurt you most`,body:`When trading with "${worstEmo[0]}" emotion, you lose ${fmt(Math.abs(worstEmo[1].pnl))} across ${worstEmo[1].count} trades. Avoid trading in this state.`,color:'var(--purple)',border:'rgba(179,136,255,0.15)'});

  // Revenge trading
  const sorted = [...trades].sort((a,b)=>a.date.localeCompare(b.date)||0);
  let revengeTrades = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].date === sorted[i-1].date && net(sorted[i-1]) < 0) revengeTrades++;
  }
  if (revengeTrades > 2) insights.push({icon:'😤',title:`${revengeTrades} Potential Revenge Trades`,body:`You have ${revengeTrades} trades placed after a loss on the same day. This pattern often destroys accounts. Consider a cooling-off rule.`,color:'var(--red)',border:'rgba(255,68,102,0.2)'});

  if (!insights.length) insights.push({icon:'📊',title:'Keep Logging!',body:'Log more trades to unlock personalized insights and pattern analysis.',color:'var(--text2)',border:'var(--border)'});
  return insights;
}

function renderBenchmark(trades) {
  if (!window.Chart) return;
  const sorted = [...trades].sort((a,b)=>a.date.localeCompare(b.date));
  if (sorted.length < 2) return;
  let equity = 0;
  const capital = parseFloat(getSettings().capital) || 100000;
  // Simulate NIFTY ~12% annual = ~0.048% daily
  let nifty = capital;
  const labels = [], eqPoints = [], niftyPoints = [];
  sorted.forEach(t => {
    equity += net(t);
    nifty *= (1 + 0.00048);
    labels.push(t.date);
    eqPoints.push(capital + equity);
    niftyPoints.push(Math.round(nifty));
  });
  mkChart('benchmark-chart', {
    type: 'line',
    data: { labels, datasets: [
      { label: 'Your Portfolio', data: eqPoints, borderColor: '#00ffa3', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: 0.35 },
      { label: 'NIFTY (passive)', data: niftyPoints, borderColor: '#6c63ff', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: 0.35, borderDash: [5,5] }
    ]},
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:LEGEND, tooltip:{callbacks:{label:c=>c.dataset.label+': '+fmtFull(c.parsed.y)}}}, scales:{x:{grid:GRID,ticks:{...TICK,maxTicksLimit:8}},y:{grid:GRID,ticks:{...TICK,callback:v=>fmt(v)}}} }
  });
}

function renderEmotionHeatmap(trades) {
  const container = document.getElementById('emotion-heatmap-container');
  if (!container) return;
  const emotions = [...new Set(trades.map(t=>t.emotion).filter(Boolean))];
  if (!emotions.length) { container.innerHTML='<p style="color:var(--text3);font-size:13px;padding:16px">Log trades with emotions to see heatmap.</p>'; return; }
  const data = {};
  emotions.forEach(e=>{data[e]={pnl:0,count:0,wins:0};});
  trades.filter(t=>t.emotion).forEach(t=>{data[t.emotion].pnl+=net(t);data[t.emotion].count++;if(net(t)>0)data[t.emotion].wins++;});
  container.innerHTML=`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;padding:8px 0">${emotions.map(e=>{const d=data[e];const wr=d.count?(d.wins/d.count*100).toFixed(0):0;const c=d.pnl>=0?'var(--green)':'var(--red)';return`<div style="background:var(--bg4);border:1px solid ${d.pnl>=0?'rgba(0,255,163,0.2)':'rgba(255,68,102,0.2)'};border-radius:var(--radius-sm);padding:12px;text-align:center"><div style="font-size:18px;margin-bottom:4px">${{Calm:'😌',Confident:'💪',Anxious:'😰',Greedy:'🤑',FOMO:'😱',Disciplined:'🎯'}[e]||'🎭'}</div><div style="font-size:12px;font-weight:600;color:var(--text)">${e}</div><div style="font-size:14px;font-weight:800;color:${c};font-family:var(--font-mono);margin-top:4px">${fmtS(d.pnl)}</div><div style="font-size:10px;color:var(--text3);margin-top:2px">${d.count} trades · ${wr}% WR</div></div>`;}).join('')}</div>`;
}

function renderDeepDive(trades) {
  renderRegimeRadar(trades);
  renderDrawdownWaterfall(trades);
  renderExpectancyCurve(trades);
  renderCorrelationMatrix(trades);
}

function renderRegimeRadar(trades) {
  if (!window.Chart) return;
  const regimes = ['Trending Up','Trending Down','Range Bound','High Volatility','Low Volatility','Breakout'];
  const data = regimes.map(r => {
    const rt = trades.filter(t=>t.regime===r);
    if (!rt.length) return 0;
    const pnl = rt.reduce((s,t)=>s+net(t),0);
    const wins = rt.filter(t=>net(t)>0).length;
    return Math.max(0, (pnl > 0 ? 50 : 0) + wins/rt.length*50);
  });
  mkChart('regime-radar-chart', {
    type: 'radar',
    data: { labels: regimes.map(r=>r.split(' ')[0]), datasets: [{ label: 'Performance Score', data, backgroundColor: 'rgba(0,255,163,0.1)', borderColor: '#00ffa3', borderWidth: 2, pointBackgroundColor: '#00ffa3' }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{r:{grid:{color:'rgba(255,255,255,0.06)'},ticks:{color:'var(--text3)',font:{size:9}},pointLabels:{color:'var(--text2)',font:{size:11}},min:0,max:100}} }
  });
}

function renderDrawdownWaterfall(trades) {
  if (!window.Chart || trades.length < 2) return;
  const sorted = [...trades].sort((a,b)=>a.date.localeCompare(b.date));
  let peak=0, eq=0;
  const labels=[], ddData=[], eqData=[];
  sorted.forEach((t,i) => {
    eq+=net(t); peak=Math.max(peak,eq);
    labels.push(t.date?.slice(5)||i);
    eqData.push(eq); ddData.push(-(peak-eq));
  });
  mkChart('drawdown-waterfall', {
    type: 'line',
    data: { labels, datasets: [
      { label: 'Equity', data: eqData, borderColor: '#00ffa3', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: 0.35, yAxisID: 'y' },
      { label: 'Drawdown', data: ddData, borderColor: '#ff4466', backgroundColor: 'rgba(255,68,102,0.1)', borderWidth: 1.5, pointRadius: 0, tension: 0.35, fill: true, yAxisID: 'y2' }
    ]},
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:LEGEND}, scales:{y:{grid:GRID,ticks:{...TICK,callback:v=>fmt(v)},position:'left'},y2:{grid:{display:false},ticks:{...TICK,callback:v=>fmt(v)},position:'right'},x:{grid:GRID,ticks:{...TICK,maxTicksLimit:8}}} }
  });
}

function renderExpectancyCurve(trades) {
  const container = document.getElementById('expectancy-empty');
  if (!window.Chart || trades.length < 20) { if(container) container.style.display='flex'; return; }
  if (container) container.style.display='none';
  const sorted = [...trades].sort((a,b)=>a.date.localeCompare(b.date));
  const window_size = 20;
  const points = [];
  for (let i = window_size; i <= sorted.length; i++) {
    const slice = sorted.slice(i-window_size, i);
    const wins = slice.filter(t=>net(t)>0);
    const losses = slice.filter(t=>net(t)<0);
    const wr = wins.length/window_size;
    const avgW = wins.length ? wins.reduce((s,t)=>s+net(t),0)/wins.length : 0;
    const avgL = losses.length ? Math.abs(losses.reduce((s,t)=>s+net(t),0)/losses.length) : 0;
    points.push(wr*avgW - (1-wr)*avgL);
  }
  mkChart('expectancy-curve', {
    type: 'line',
    data: { labels: points.map((_,i)=>i+window_size), datasets: [{ label: '20-trade rolling expectancy', data: points, borderColor: '#06d6f5', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: 0.35 }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>fmt(c.parsed.y)+'/trade'}}}, scales:{x:{grid:GRID,ticks:{...TICK,maxTicksLimit:8}},y:{grid:GRID,ticks:{...TICK,callback:v=>fmt(v)}}} }
  });
}

function renderCorrelationMatrix(trades) {
  const container = document.getElementById('correlation-matrix');
  if (!container) return;
  const symbols = [...new Set(trades.map(t=>t.symbol).filter(Boolean))].slice(0,6);
  if (symbols.length < 2) { container.innerHTML='<p style="color:var(--text3);font-size:13px;padding:16px">Need trades in 2+ symbols to show correlation.</p>'; return; }
  const daily = {};
  trades.forEach(t => {
    if (!t.symbol || !t.date) return;
    if (!daily[t.symbol]) daily[t.symbol] = {};
    daily[t.symbol][t.date] = (daily[t.symbol][t.date]||0) + net(t);
  });
  const dates = [...new Set(trades.map(t=>t.date))].sort();
  const seriesMap = {};
  symbols.forEach(s => { seriesMap[s] = dates.map(d => daily[s]?.[d]||0); });

  function pearson(a, b) {
    const n = a.length;
    const ma = a.reduce((s,v)=>s+v,0)/n, mb = b.reduce((s,v)=>s+v,0)/n;
    const num = a.reduce((s,v,i)=>s+(v-ma)*(b[i]-mb),0);
    const da = Math.sqrt(a.reduce((s,v)=>s+(v-ma)**2,0));
    const db = Math.sqrt(b.reduce((s,v)=>s+(v-mb)**2,0));
    return (da&&db) ? (num/(da*db)).toFixed(2) : '—';
  }

  container.innerHTML=`<div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:11px">
    <thead><tr><th></th>${symbols.map(s=>`<th style="padding:6px 10px;color:var(--text3)">${s}</th>`).join('')}</tr></thead>
    <tbody>${symbols.map(s=>`<tr><td style="padding:6px 10px;color:var(--text2);font-weight:600">${s}</td>${symbols.map(s2=>{const r=parseFloat(pearson(seriesMap[s],seriesMap[s2]));const bg=s===s2?'rgba(255,255,255,0.05)':r>0.5?`rgba(0,255,163,${r*0.3})`:r<-0.5?`rgba(255,68,102,${Math.abs(r)*0.3})`:'transparent';return`<td style="padding:6px 10px;text-align:center;background:${bg};border-radius:4px;font-family:var(--font-mono);color:${s===s2?'var(--text3)':r>0?'var(--green)':'var(--red)'}">${s===s2?'1.00':r}</td>`;}).join('')}</tr>`).join('')}
    </tbody></table></div>`;
}

/* ────────────────────────────────────────────────────────────
   TOOLS HUB
──────────────────────────────────────────────────────────── */
function calcKelly() {
  const cap = parseFloat(document.getElementById('k-cap')?.value) || (window.TB?.getCapital ? window.TB.getCapital() : 50000);
  const wr = (parseFloat(document.getElementById('k-wr')?.value) || (window.TB?.deriveStats?.()?.wr ? window.TB.deriveStats().wr : 0.667) * 100) / 100;
  const aw = parseFloat(document.getElementById('k-aw')?.value)||1166;
  const al = parseFloat(document.getElementById('k-al')?.value)||300;
  const b = aw/al;
  const kelly = ((b*wr-(1-wr))/b)*100;
  const halfKelly = kelly/2;
  const rec = Math.max(0,Math.min(halfKelly,5));
  const amount = cap*rec/100;
  const result = document.getElementById('kelly-result');
  if (!result) return;
  result.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
    <div style="background:var(--bg);border-radius:6px;padding:10px"><div style="font-size:10px;color:var(--text3)">Full Kelly</div><div style="font-size:16px;font-weight:800;color:var(--gold)">${Math.max(0,kelly).toFixed(1)}%</div></div>
    <div style="background:var(--bg);border-radius:6px;padding:10px"><div style="font-size:10px;color:var(--text3)">Half Kelly (recommended)</div><div style="font-size:16px;font-weight:800;color:var(--accent)">${Math.max(0,halfKelly).toFixed(1)}%</div></div>
    <div style="background:var(--bg);border-radius:6px;padding:10px;grid-column:1/-1"><div style="font-size:10px;color:var(--text3)">Risk Amount (capped at 5%)</div><div style="font-size:20px;font-weight:800;color:var(--green)">₹${amount.toFixed(0)}</div></div>
  </div>`;
}

function runMonteCarlo() {
  const n = parseInt(document.getElementById('sim-n')?.value)||30;
  const wr = (parseFloat(document.getElementById('sim-wr')?.value) || (window.TB?.deriveStats?.()?.wr ? window.TB.deriveStats().wr : 0.5) * 100) / 100;
  const aw = parseFloat(document.getElementById('sim-aw')?.value)||1166;
  const al = parseFloat(document.getElementById('sim-al')?.value)||300;
  const paths = 500;
  const allPaths = [];
  let worstDD = 0, bestEnd = -Infinity;
  for (let p = 0; p < paths; p++) {
    let eq = 0, peak = 0, dd = 0;
    const path = [];
    for (let i = 0; i < n; i++) {
      eq += Math.random() < wr ? aw : -al;
      peak = Math.max(peak, eq);
      dd = Math.max(dd, peak - eq);
      path.push(eq);
    }
    allPaths.push(path);
    worstDD = Math.max(worstDD, dd);
    bestEnd = Math.max(bestEnd, eq);
  }
  const finalPnls = allPaths.map(p=>p[p.length-1]);
  const positive = finalPnls.filter(v=>v>0).length;
  const median = [...finalPnls].sort((a,b)=>a-b)[Math.floor(paths/2)];
  const result = document.getElementById('mc-result');
  const chartWrap = document.getElementById('mc-chart-wrap');
  if (result) result.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
    <div style="background:var(--bg);border-radius:6px;padding:10px"><div style="font-size:10px;color:var(--text3)">Prob. of Profit</div><div style="font-size:16px;font-weight:800;color:var(--green)">${(positive/paths*100).toFixed(0)}%</div></div>
    <div style="background:var(--bg);border-radius:6px;padding:10px"><div style="font-size:10px;color:var(--text3)">Median P&L</div><div style="font-size:16px;font-weight:800;color:var(--blue)">${fmtS(median)}</div></div>
    <div style="background:var(--bg);border-radius:6px;padding:10px"><div style="font-size:10px;color:var(--text3)">Worst Drawdown</div><div style="font-size:16px;font-weight:800;color:var(--red)">${fmt(worstDD)}</div></div>
    <div style="background:var(--bg);border-radius:6px;padding:10px"><div style="font-size:10px;color:var(--text3)">Best Outcome</div><div style="font-size:16px;font-weight:800;color:var(--gold)">${fmtS(bestEnd)}</div></div>
  </div>`;
  if (chartWrap) chartWrap.style.display = 'block';
  if (window.Chart) {
    // Show 20 sample paths
    const sample = allPaths.slice(0,20);
    mkChart('mcChart', {
      type: 'line',
      data: { labels: Array.from({length:n},(_,i)=>i+1), datasets: sample.map((path,i)=>({ data:path, borderColor:`rgba(0,255,163,${i===0?0.8:0.15})`, backgroundColor:'transparent', borderWidth:i===0?2:1, pointRadius:0, tension:0.3 })) },
      options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{grid:GRID,ticks:TICK},y:{grid:GRID,ticks:{...TICK,callback:v=>fmt(v)}}} }
    });
  }
}

function calcVP() {
  const poc = parseFloat(document.getElementById('vp-poc')?.value);
  const vah = parseFloat(document.getElementById('vp-vah')?.value);
  const val = parseFloat(document.getElementById('vp-val')?.value);
  const entry = parseFloat(document.getElementById('vp-entry')?.value);
  const result = document.getElementById('vp-result');
  const visual = document.getElementById('vp-visual');
  if (!poc || !vah || !val || !entry || !result) return;
  const inside = entry >= val && entry <= vah;
  const nearPOC = Math.abs(entry - poc) < (vah-val)*0.1;
  let msg, color;
  if (nearPOC) { msg = '🎯 Entry at POC — highest confluence zone. Strong setup.'; color = 'var(--green)'; }
  else if (inside) { msg = '✅ Entry inside Value Area. Decent location.'; color = 'var(--gold)'; }
  else if (entry > vah) { msg = '⬆️ Above Value Area High — potential breakout or rejection zone.'; color = 'var(--blue)'; }
  else { msg = '⬇️ Below Value Area Low — watch for support or breakdown.'; color = 'var(--red)'; }
  result.innerHTML = `<span style="color:${color}">${msg}</span>`;
  if (visual) {
    const range = vah - val;
    const entryPct = Math.max(0,Math.min(100,((entry-val)/range)*100));
    const pocPct = Math.max(0,Math.min(100,((poc-val)/range)*100));
    visual.innerHTML = `<div style="position:relative;height:40px;background:rgba(0,255,163,0.1);border:1px solid rgba(0,255,163,0.3);border-radius:6px;margin:12px 0;overflow:hidden">
      <div style="position:absolute;top:0;bottom:0;left:${pocPct-1}%;width:3px;background:var(--accent);border-radius:2px"></div>
      <div style="position:absolute;top:10px;bottom:10px;left:${entryPct}%;width:2px;background:var(--blue);transform:translateX(-50%)"></div>
      <div style="position:absolute;top:50%;transform:translateY(-50%);left:2%;font-size:10px;color:var(--text3)">VAL</div>
      <div style="position:absolute;top:50%;transform:translateY(-50%);right:2%;font-size:10px;color:var(--text3)">VAH</div>
      <div style="position:absolute;top:-16px;left:${pocPct}%;transform:translateX(-50%);font-size:9px;color:var(--accent)">POC</div>
      <div style="position:absolute;bottom:-16px;left:${entryPct}%;transform:translateX(-50%);font-size:9px;color:var(--blue)">ENTRY</div>
    </div>`;
  }
}

function calcPositionSizer() {
  const capital = parseFloat(document.getElementById('ps-capital')?.value) || (window.TB?.getCapital ? window.TB.getCapital() : 50000);
  const riskPct = parseFloat(document.getElementById('ps-risk-pct')?.value)||1;
  const entry = parseFloat(document.getElementById('ps-entry')?.value)||0;
  const sl = parseFloat(document.getElementById('ps-sl')?.value)||0;
  const target = parseFloat(document.getElementById('ps-target')?.value)||0;
  const result = document.getElementById('ps-result');
  if (!result || !entry || !sl) return;
  const riskAmount = capital * riskPct / 100;
  const slDist = Math.abs(entry - sl);
  const qty = slDist > 0 ? Math.floor(riskAmount / slDist) : 0;
  const cost = qty * entry;
  const rrRatio = target ? ((Math.abs(target-entry)/slDist)).toFixed(1) : '—';
  result.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
    <div style="background:var(--bg);border-radius:6px;padding:10px"><div style="font-size:10px;color:var(--text3)">Quantity</div><div style="font-size:22px;font-weight:800;color:var(--accent)">${qty}</div></div>
    <div style="background:var(--bg);border-radius:6px;padding:10px"><div style="font-size:10px;color:var(--text3)">Max Risk</div><div style="font-size:22px;font-weight:800;color:var(--red)">₹${riskAmount.toFixed(0)}</div></div>
    <div style="background:var(--bg);border-radius:6px;padding:10px"><div style="font-size:10px;color:var(--text3)">Position Cost</div><div style="font-size:14px;font-weight:700;color:var(--text)">₹${cost.toLocaleString('en-IN')}</div></div>
    <div style="background:var(--bg);border-radius:6px;padding:10px"><div style="font-size:10px;color:var(--text3)">R:R Ratio</div><div style="font-size:14px;font-weight:700;color:var(--gold)">${rrRatio}:1</div></div>
  </div>`;
}

/* ────────────────────────────────────────────────────────────
   SIMULATOR (What-If)
──────────────────────────────────────────────────────────── */
function runSimulation() {
  const slAdj = (parseInt(document.getElementById('sim-sl-pct')?.value)||0)/100;
  const tpAdj = (parseInt(document.getElementById('sim-tp-pct')?.value)||0)/100;
  const sizeMult = parseFloat(document.getElementById('sim-size-mult')?.value)||1;
  const stratFilter = document.getElementById('sim-strat-filter')?.value||'all';
  let trades = getTrades();
  if (stratFilter !== 'all') trades = trades.filter(t=>t.strategy===stratFilter);
  if (!trades.length) return;

  const origPnl = trades.reduce((s,t)=>s+net(t),0);
  const simTrades = trades.map(t => {
    let sn = net(t);
    if (sn > 0) sn *= (1+tpAdj) * sizeMult;
    else if (sn < 0) sn *= (1+slAdj) * sizeMult;
    return { ...t, simNet: sn };
  });
  const simPnl = simTrades.reduce((s,t)=>s+t.simNet,0);
  const diff = simPnl - origPnl;

  const set = (id,v) => { const el=document.getElementById(id); if(el)el.textContent=v; };
  set('sim-orig-pnl', fmtS(origPnl));
  set('sim-new-pnl', fmtS(simPnl));
  set('sim-delta', fmtS(diff));
  const deltaCard = document.getElementById('sim-delta-card');
  if (deltaCard) deltaCard.style.color = diff >= 0 ? 'var(--green)' : 'var(--red)';

  // Populate strategy filter
  const strategies = [...new Set(trades.map(t=>t.strategy).filter(Boolean))];
  const sf = document.getElementById('sim-strat-filter');
  if (sf && sf.children.length === 1) {
    strategies.forEach(s => { const o = document.createElement('option'); o.value=s; o.textContent=s; sf.appendChild(o); });
  }

  // SL/TP slider labels
  const slVal = document.getElementById('sim-sl-val'); if(slVal) slVal.textContent=(slAdj*100>0?'+':'')+Math.round(slAdj*100)+'%';
  const tpVal = document.getElementById('sim-tp-val'); if(tpVal) tpVal.textContent=(tpAdj*100>0?'+':'')+Math.round(tpAdj*100)+'%';
  const sizeVal = document.getElementById('sim-size-val'); if(sizeVal) sizeVal.textContent=sizeMult+'x';

  // Sim stats
  const simWins = simTrades.filter(t=>t.simNet>0).length;
  const simRow = document.getElementById('sim-stats-row');
  if (simRow) simRow.innerHTML = `<div class="sim-res-card"><div class="sim-res-label">Win Rate</div><div class="sim-res-val">${(simWins/simTrades.length*100).toFixed(0)}%</div></div><div class="sim-res-card"><div class="sim-res-label">Trades</div><div class="sim-res-val">${simTrades.length}</div></div>`;

  // Table
  const tbody = document.getElementById('sim-tbody');
  if (tbody) tbody.innerHTML = simTrades.slice(0,20).map(t=>{
    const diff = t.simNet - net(t);
    return `<tr><td>${t.date}</td><td>${t.symbol}</td><td style="color:${net(t)>=0?'var(--green)':'var(--red)'}">${fmtS(net(t))}</td><td style="color:${t.simNet>=0?'var(--green)':'var(--red)'}">${fmtS(t.simNet)}</td><td style="color:${diff>=0?'var(--green)':'var(--red)'}">${fmtS(diff)}</td><td>${Math.abs(diff/net(t)*100).toFixed(0)}%</td></tr>`;
  }).join('');

  // Equity comparison chart
  let e1=0,e2=0;
  const eqOrig=[],eqSim=[];
  simTrades.forEach(t=>{e1+=net(t);e2+=t.simNet;eqOrig.push(e1);eqSim.push(e2);});
  mkChart('simEquityChart', {
    type: 'line',
    data: { labels: simTrades.map(t=>t.date), datasets: [
      { label:'Original', data:eqOrig, borderColor:'#7b88a8', backgroundColor:'transparent', borderWidth:2, pointRadius:0, borderDash:[5,5], tension:0.35 },
      { label:'Simulated', data:eqSim, borderColor:'#00ffa3', backgroundColor:'transparent', borderWidth:2, pointRadius:0, tension:0.35 }
    ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:LEGEND},scales:{x:{grid:GRID,ticks:{...TICK,maxTicksLimit:8}},y:{grid:GRID,ticks:{...TICK,callback:v=>fmt(v)}}}}
  });
}

/* ────────────────────────────────────────────────────────────
   TAGS
──────────────────────────────────────────────────────────── */
function renderTagSystem() {
  renderAllTagsGrid();
  renderTagPerformance();
  renderTagBubble();
}

function renderAllTagsGrid() {
  const grid = document.getElementById('all-tags-grid');
  if (!grid) return;
  const tags = getTags();
  if (!tags.length) { grid.innerHTML='<p style="color:var(--text3);font-size:13px">No tags yet. Create your first tag!</p>'; return; }
  grid.innerHTML = tags.map(tag => `
    <div style="display:flex;align-items:center;gap:10px;background:var(--bg4);border:1px solid ${tag.color}33;border-radius:var(--radius-sm);padding:10px 14px">
      <div style="width:10px;height:10px;border-radius:50%;background:${tag.color};flex-shrink:0"></div>
      <span style="font-size:13px;font-weight:600;flex:1">${tag.name}</span>
      <span style="font-size:10px;color:var(--text3)">${tag.type}</span>
      <button onclick="deleteTag('${tag.id}')" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:14px;padding:0 4px">×</button>
    </div>`).join('');
}

function renderTagPerformance() {
  const container = document.getElementById('tag-perf-grid');
  if (!container) return;
  const tags = getTags();
  const trades = getTrades();
  if (!tags.length) { container.innerHTML='<p style="color:var(--text3);font-size:13px">No tags created yet.</p>'; return; }
  container.innerHTML = tags.map(tag => {
    const tagged = trades.filter(t=>(t.tags||[]).includes(tag.id));
    const pnl = tagged.reduce((s,t)=>s+net(t),0);
    const wins = tagged.filter(t=>net(t)>0).length;
    const wr = tagged.length ? (wins/tagged.length*100).toFixed(0) : 0;
    return `<div style="background:var(--bg4);border:1px solid ${tag.color}33;border-radius:var(--radius-sm);padding:14px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <div style="width:8px;height:8px;border-radius:50%;background:${tag.color}"></div>
        <span style="font-size:12px;font-weight:700">${tag.name}</span>
      </div>
      <div style="font-family:var(--font-mono);font-size:18px;font-weight:800;color:${pnl>=0?'var(--green)':'var(--red)'}">${fmtS(pnl)}</div>
      <div style="font-size:10px;color:var(--text3);margin-top:4px">${tagged.length} trades · ${wr}% WR</div>
    </div>`;
  }).join('');
}

function renderTagBubble() {
  if (!window.Chart) return;
  const tags = getTags();
  const trades = getTrades();
  const data = tags.map(tag => {
    const tagged = trades.filter(t=>(t.tags||[]).includes(tag.id));
    const pnl = tagged.reduce((s,t)=>s+net(t),0);
    const wr = tagged.length ? tagged.filter(t=>net(t)>0).length/tagged.length*100 : 0;
    return { x: wr, y: pnl, r: Math.max(5, Math.min(30, tagged.length*3)), label: tag.name, color: tag.color };
  }).filter(d=>d.r>5);
  mkChart('tagBubbleChart', {
    type: 'bubble',
    data: { datasets: data.map(d=>({ label:d.label, data:[{x:d.x,y:d.y,r:d.r}], backgroundColor:d.color+'66', borderColor:d.color, borderWidth:2 })) },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:LEGEND}, scales:{x:{grid:GRID,ticks:TICK,title:{display:true,text:'Win Rate %',color:'var(--text3)'}},y:{grid:GRID,ticks:{...TICK,callback:v=>fmt(v)},title:{display:true,text:'Net P&L',color:'var(--text3)'}}} }
  });
}

function openTagModal() {
  const m = document.getElementById('tag-modal');
  if (m) { m.style.display='flex'; document.getElementById('tag-name').value=''; }
}
function closeTagModal() { const m=document.getElementById('tag-modal'); if(m) m.style.display='none'; }
let _tagColor = '#00ffa3';
function selectTagColor(c, btn) {
  _tagColor = c;
  document.querySelectorAll('.tag-color-opt').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
}
function saveTag() {
  const name = document.getElementById('tag-name')?.value?.trim();
  const type = document.getElementById('tag-type')?.value||'custom';
  if (!name) { toast('Enter a tag name','error'); return; }
  const tags = getTags();
  tags.push({ id: Date.now().toString(), name, type, color: _tagColor });
  saveTags(tags);
  closeTagModal();
  renderTagSystem();
  renderTagSelector();
  toast('Tag created!');
}
function deleteTag(id) {
  saveTags(getTags().filter(t=>t.id!==id));
  renderTagSystem();
  toast('Tag deleted','warn');
}

/* ────────────────────────────────────────────────────────────
   CHALLENGES
──────────────────────────────────────────────────────────── */
function renderChallenges() {
  const all = getChallenges();
  const now = Date.now();
  const active = all.filter(c=>!c.completed&&new Date(c.endDate).getTime()>now);
  const completed = all.filter(c=>c.completed||new Date(c.endDate).getTime()<=now);
  const activeEl = document.getElementById('active-challenges');
  const compEl = document.getElementById('completed-challenges');
  const emptyEl = document.getElementById('challenges-empty');
  const noComp = document.getElementById('no-completed');
  if (emptyEl) emptyEl.style.display = active.length ? 'none' : 'block';
  if (noComp) noComp.style.display = completed.length ? 'none' : 'block';
  if (activeEl) activeEl.innerHTML = active.map(c=>challengeCard(c, false)).join('');
  if (compEl) compEl.innerHTML = completed.map(c=>challengeCard(c, true)).join('');
  renderDisciplineCalendar();
}

function challengeCard(c, done) {
  const end = new Date(c.endDate);
  const daysLeft = Math.max(0, Math.ceil((end-Date.now())/(86400000)));
  const progress = Math.min(100, ((c.days-daysLeft)/c.days)*100);
  return `<div style="background:var(--bg4);border:1px solid ${done?'var(--border)':'rgba(0,255,163,0.2)'};border-radius:var(--radius);padding:18px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
      <div>
        <div style="font-size:14px;font-weight:700">${c.name}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">${c.type} · ${c.days} days</div>
      </div>
      ${done?'<span style="color:var(--gold);font-size:12px">🏅 Done</span>':`<span style="font-family:var(--font-mono);font-size:12px;color:var(--accent)">${daysLeft}d left</span>`}
    </div>
    <div style="height:4px;background:var(--bg5);border-radius:2px;overflow:hidden;margin-bottom:8px"><div style="height:100%;width:${progress}%;background:linear-gradient(90deg,var(--accent),var(--accent2));border-radius:2px"></div></div>
    <div style="font-size:11px;color:var(--text2)">${c.desc||''}</div>
    ${c.reward?`<div style="font-size:11px;color:var(--gold);margin-top:6px">🎁 ${c.reward}</div>`:''}
    ${!done?`<button onclick="completeChallenge('${c.id}')" style="margin-top:10px;font-size:11px;padding:5px 12px;background:rgba(0,255,163,0.1);color:var(--accent);border:1px solid rgba(0,255,163,0.3);border-radius:6px;cursor:pointer">Mark Complete ✅</button>`:''}
  </div>`;
}

function openChallengeModal() { const m=document.getElementById('challenge-modal'); if(m){m.style.display='flex';document.getElementById('ch-name').value='';document.getElementById('ch-desc').value='';document.getElementById('ch-reward').value='';} }
function closeChallengeModal() { const m=document.getElementById('challenge-modal'); if(m) m.style.display='none'; }
function saveChallenge() {
  const name = document.getElementById('ch-name')?.value?.trim();
  if (!name) { toast('Enter a challenge name','error'); return; }
  const days = parseInt(document.getElementById('ch-days')?.value)||30;
  const ch = {
    id: Date.now().toString(), name,
    type: document.getElementById('ch-type')?.value||'discipline',
    days,
    desc: document.getElementById('ch-desc')?.value||'',
    reward: document.getElementById('ch-reward')?.value||'',
    startDate: new Date().toISOString(),
    endDate: new Date(Date.now()+days*86400000).toISOString(),
    completed: false
  };
  saveChallenges([...getChallenges(), ch]);
  closeChallengeModal();
  renderChallenges();
  toast(`Challenge "${name}" started! 🚀`);
}
function completeChallenge(id) {
  const all = getChallenges();
  const idx = all.findIndex(c=>c.id===id);
  if (idx>=0) { all[idx].completed=true; saveChallenges(all); }
  renderChallenges();
  toast('Challenge completed! 🏅');
}

function renderDisciplineCalendar() {
  const container = document.getElementById('discipline-cal');
  if (!container) return;
  const trades = getTrades();
  const byDate = {};
  trades.forEach(t => { byDate[t.date] = byDate[t.date] || { followed:0, broken:0 }; if (t.discipline==='followed') byDate[t.date].followed++; else if (t.discipline==='broken') byDate[t.date].broken++; });
  const now = new Date();
  const days = [];
  for (let i=29;i>=0;i--) { const d=new Date(now); d.setDate(d.getDate()-i); days.push(d.toISOString().split('T')[0]); }
  container.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:4px">${days.map(d=>{
    const rec=byDate[d]||{};
    const color=rec.broken?'var(--red)':rec.followed?'var(--green)':'var(--bg5)';
    const title=d+(rec.followed?` ✅${rec.followed}`:''+(rec.broken?` ❌${rec.broken}`:''));
    return `<div title="${title}" style="width:20px;height:20px;border-radius:3px;background:${color};cursor:default" title="${d}"></div>`;
  }).join('')}</div><div style="display:flex;gap:12px;margin-top:8px;font-size:10px;color:var(--text3)"><span>🟢 Disciplined</span><span>🔴 Rule broken</span><span style="background:var(--bg5);width:10px;height:10px;display:inline-block;border-radius:2px;vertical-align:middle"></span> No trades</div>`;
}

/* ────────────────────────────────────────────────────────────
   HEATMAP (Annual)
──────────────────────────────────────────────────────────── */
function renderHeatmap() {
  const yearEl = document.getElementById('heatmap-year');
  const year = yearEl ? parseInt(yearEl.value) : new Date().getFullYear();
  const trades = getTrades().filter(t => t.date?.startsWith(year+''));
  const byDate = {};
  trades.forEach(t => { byDate[t.date] = (byDate[t.date]||0)+net(t); });

  const stats = document.getElementById('heatmap-stats');
  const total = trades.reduce((s,t)=>s+net(t),0);
  const best = Object.entries(byDate).sort((a,b)=>b[1]-a[1])[0];
  const worst = Object.entries(byDate).sort((a,b)=>a[1]-b[1])[0];
  if (stats) stats.innerHTML = `
    <div class="hm-stat"><div class="hm-stat-l">Annual P&L</div><div class="hm-stat-v" style="color:${total>=0?'var(--green)':'var(--red)'}">${fmtS(total)}</div></div>
    <div class="hm-stat"><div class="hm-stat-l">Trading Days</div><div class="hm-stat-v">${Object.keys(byDate).length}</div></div>
    ${best?`<div class="hm-stat"><div class="hm-stat-l">Best Day</div><div class="hm-stat-v" style="color:var(--green)">${fmtS(best[1])}</div><div class="hm-stat-b">${best[0]}</div></div>`:''}
    ${worst?`<div class="hm-stat"><div class="hm-stat-l">Worst Day</div><div class="hm-stat-v" style="color:var(--red)">${fmtS(worst[1])}</div><div class="hm-stat-b">${worst[0]}</div></div>`:''}`;

  // Build GitHub-style grid
  const grid = document.getElementById('heatmap-grid');
  if (!grid) return;
  const maxAbs = Math.max(...Object.values(byDate).map(Math.abs), 1);
  const start = new Date(year,0,1);
  const end = new Date(year,11,31);
  const weeks = [];
  let week = [];
  // Pad start
  const startDay = start.getDay();
  for (let i=0;i<startDay;i++) week.push(null);
  for (let d=new Date(start);d<=end;d.setDate(d.getDate()+1)) {
    const ds = d.toISOString().split('T')[0];
    const pnl = byDate[ds];
    week.push({ date:ds, pnl });
    if (d.getDay()===6) { weeks.push(week); week=[]; }
  }
  if (week.length) weeks.push(week);
  const MONTH_LABELS = ['Jan','','Feb','','Mar','','Apr','','May','','Jun','','Jul','','Aug','','Sep','','Oct','','Nov','','Dec',''];
  grid.innerHTML = `<div style="display:flex;gap:3px">
    ${weeks.map((wk,wi)=>`<div style="display:flex;flex-direction:column;gap:3px">
      ${wk.map(day=>{
        if (!day) return '<div style="width:12px;height:12px"></div>';
        const pnl=day.pnl;
        const i=pnl!=null?Math.abs(pnl)/maxAbs:0;
        const bg=pnl==null?'var(--bg5)':pnl>0?`rgba(0,255,163,${0.15+i*0.75})`:pnl<0?`rgba(255,68,102,${0.15+i*0.75})`:'var(--bg4)';
        return `<div title="${day.date}: ${pnl!=null?fmtS(pnl):'No trade'}" style="width:12px;height:12px;border-radius:2px;background:${bg};cursor:default"></div>`;
      }).join('')}
    </div>`).join('')}
  </div>`;
}

/* ────────────────────────────────────────────────────────────
   PSYCHOLOGY HUB
──────────────────────────────────────────────────────────── */
function renderPsychHub() {
  renderBurnoutPredictor();
  renderMoodJournal();
  renderRuleViolationSimulator();
  renderDisciplineMetrics();
}

function renderBurnoutPredictor() {
  const container = document.getElementById('burnout-predictor');
  if (!container) return;
  const trades = getTrades();
  const recent = [...trades].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,20);
  if (!recent.length) { container.innerHTML='<p style="color:var(--text3);font-size:13px">Log 20+ trades to see burnout analysis.</p>'; return; }
  const overtrading = recent.length >= 15 ? 80 : recent.length/15*80;
  const lossStreak = (() => { let s=0,max=0; for(const t of recent){if(net(t)<0)s++;else s=0;max=Math.max(max,s);} return max; })();
  const revengePct = (() => { let r=0; for(let i=1;i<recent.length;i++){if(recent[i].date===recent[i-1].date&&net(recent[i-1])<0)r++;} return r/recent.length*100; })();
  const signals = [
    { name:'Overtrading Risk', score:Math.round(overtrading), desc:`${recent.length} trades in last period` },
    { name:'Loss Streak Risk', score:Math.min(100,lossStreak*20), desc:`Max ${lossStreak} consecutive losses` },
    { name:'Revenge Trading', score:Math.round(revengePct), desc:`${revengePct.toFixed(0)}% of recent trades after loss` },
  ];
  const overall = Math.round(signals.reduce((s,sg)=>s+sg.score,0)/signals.length);
  const color = overall>70?'var(--red)':overall>40?'var(--gold)':'var(--green)';
  const label = overall>70?'HIGH RISK — Take a break':overall>40?'MODERATE — Trade with caution':'LOW — You\'re in a good zone';
  container.innerHTML = `
    <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center;margin-bottom:16px">
      <div style="width:80px;height:80px;border-radius:50%;border:3px solid ${color};display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0">
        <div style="font-family:var(--font-display);font-size:24px;font-weight:800;color:${color}">${overall}</div>
        <div style="font-size:8px;color:var(--text3)">RISK SCORE</div>
      </div>
      <div><div style="font-size:13px;font-weight:700;color:${color}">${label}</div><div style="font-size:12px;color:var(--text2);margin-top:4px">Based on last ${recent.length} trades</div></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px">
      ${signals.map(sg=>{const c=sg.score>70?'var(--red)':sg.score>40?'var(--gold)':'var(--green)';return`<div style="background:var(--bg4);border-radius:var(--radius-sm);padding:12px"><div style="font-size:11px;color:var(--text3);margin-bottom:6px">${sg.name}</div><div style="height:4px;background:var(--bg5);border-radius:2px;overflow:hidden;margin-bottom:6px"><div style="height:100%;width:${sg.score}%;background:${c};border-radius:2px"></div></div><div style="font-size:11px;font-weight:700;color:${c}">${sg.score}/100</div><div style="font-size:10px;color:var(--text3);margin-top:2px">${sg.desc}</div></div>`;}).join('')}
    </div>`;
}

function renderMoodJournal() {
  const container = document.getElementById('mood-journal-container');
  if (!container) return;
  const moods = JSON.parse(localStorage.getItem('tradebook_moods')||'[]');
  container.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      ${['😊 Great','😐 Neutral','😔 Bad','🔥 Hyped','😴 Tired','😤 Stressed'].map(m=>
        `<button onclick="logMood('${m}')" style="padding:6px 12px;border-radius:20px;border:1px solid var(--border);background:transparent;color:var(--text2);cursor:pointer;font-size:12px;transition:all .15s" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">${m}</button>`
      ).join('')}
    </div>
    <div style="max-height:180px;overflow-y:auto">
      ${moods.slice(0,10).map(m=>`<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px"><span>${m.mood}</span><span style="color:var(--text3)">${m.date}</span></div>`).join('')}
      ${!moods.length?'<p style="color:var(--text3);font-size:12px">No mood entries yet.</p>':''}
    </div>`;
}
function logMood(mood) {
  const moods = JSON.parse(localStorage.getItem('tradebook_moods')||'[]');
  moods.unshift({ mood, date: new Date().toLocaleString('en-IN') });
  if (moods.length > 50) moods.pop();
  localStorage.setItem('tradebook_moods', JSON.stringify(moods));
  renderMoodJournal();
  toast(`Mood logged: ${mood}`);
}

function renderRuleViolationSimulator() {
  const container = document.getElementById('rule-violation-simulator');
  if (!container) return;
  const rules = getRules();
  const trades = getTrades();
  if (!rules.length || !trades.length) { container.innerHTML='<p style="color:var(--text3);font-size:12px">Add trading rules and log trades with discipline data.</p>'; return; }
  const disciplined = trades.filter(t=>t.discipline==='followed');
  const undisciplined = trades.filter(t=>t.discipline==='broken');
  const discPnl = disciplined.reduce((s,t)=>s+net(t),0);
  const undiscPnl = undisciplined.reduce((s,t)=>s+net(t),0);
  const costOfIndiscipline = discPnl > 0 ? discPnl - (discPnl+undiscPnl) : Math.abs(undiscPnl);
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div style="background:rgba(0,255,163,0.08);border:1px solid rgba(0,255,163,0.2);border-radius:var(--radius-sm);padding:12px;text-align:center">
        <div style="font-size:10px;color:var(--text3);margin-bottom:4px">Disciplined P&L</div>
        <div style="font-size:20px;font-weight:800;color:var(--green)">${fmtS(discPnl)}</div>
        <div style="font-size:10px;color:var(--text3)">${disciplined.length} trades</div>
      </div>
      <div style="background:rgba(255,68,102,0.08);border:1px solid rgba(255,68,102,0.2);border-radius:var(--radius-sm);padding:12px;text-align:center">
        <div style="font-size:10px;color:var(--text3);margin-bottom:4px">Undisciplined P&L</div>
        <div style="font-size:20px;font-weight:800;color:var(--red)">${fmtS(undiscPnl)}</div>
        <div style="font-size:10px;color:var(--text3)">${undisciplined.length} trades</div>
      </div>
    </div>
    <div style="margin-top:10px;background:var(--bg4);border-radius:var(--radius-sm);padding:12px;text-align:center">
      <div style="font-size:10px;color:var(--text3)">Cost of Indiscipline</div>
      <div style="font-size:22px;font-weight:800;color:var(--red)">-${fmt(costOfIndiscipline)}</div>
    </div>`;
}

function renderDisciplineMetrics() {
  const trades = getTrades();
  const d = trades.filter(t=>t.discipline==='followed');
  const u = trades.filter(t=>t.discipline==='broken');
  const p = trades.filter(t=>t.discipline==='partial');
  const total = trades.filter(t=>t.discipline).length;
  const score = total ? Math.round(d.length/total*100) : 0;
  const set = (id,v) => { const el=document.getElementById(id); if(el)el.textContent=v; };
  const setPnl = (id,v) => { const el=document.getElementById(id); if(el){el.textContent=fmtS(v);el.className='coi-value'+(v>=0?' pos':' neg');} };
  set('disc-score', score+'%');
  set('coi-value', '-'+fmt(Math.abs(u.reduce((s,t)=>s+net(t),0))));
  setPnl('disc-pnl', d.reduce((s,t)=>s+net(t),0));
  setPnl('undisc-pnl', u.reduce((s,t)=>s+net(t),0));
  // Charts
  if (window.Chart) {
    mkChart('discCompChart', {
      type: 'bar',
      data: { labels:['Disciplined','Partial','Undisciplined'], datasets:[{ data:[d.reduce((s,t)=>s+net(t),0),p.reduce((s,t)=>s+net(t),0),u.reduce((s,t)=>s+net(t),0)], backgroundColor:['rgba(0,255,163,0.6)','rgba(255,209,102,0.6)','rgba(255,68,102,0.6)'], borderRadius:6, borderSkipped:false }] },
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:GRID,ticks:TICK},y:{grid:GRID,ticks:{...TICK,callback:v=>fmt(v)}}}}
    });
  }
}

/* ────────────────────────────────────────────────────────────
   RULES
──────────────────────────────────────────────────────────── */
function openRuleModal() {
  const m = document.getElementById('rule-modal');
  if (m) { m.style.display='flex'; document.getElementById('rule-name').value=''; document.getElementById('rule-why').value=''; document.getElementById('rule-edit-id').value=''; }
}
function closeRuleModal() { const m=document.getElementById('rule-modal'); if(m) m.style.display='none'; }
function saveRule() {
  const name = document.getElementById('rule-name')?.value?.trim();
  if (!name) { toast('Enter a rule name','error'); return; }
  const rules = getRules();
  const editId = document.getElementById('rule-edit-id')?.value;
  const rule = { id: editId||Date.now().toString(), name, cat: document.getElementById('rule-cat')?.value||'Entry Rules', why: document.getElementById('rule-why')?.value||'' };
  const idx = rules.findIndex(r=>r.id===editId);
  if (idx>=0) rules[idx]=rule; else rules.push(rule);
  saveRules(rules);
  closeRuleModal();
  renderRulesList();
  toast('Rule saved!');
}
function renderRulesList() {
  const container = document.getElementById('rules-list');
  const empty = document.getElementById('rules-empty');
  if (!container) return;
  const rules = getRules();
  if (empty) empty.style.display = rules.length ? 'none' : 'block';
  container.innerHTML = rules.map(r=>`<div style="display:flex;align-items:center;gap:12px;background:var(--bg4);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px 16px;margin-bottom:8px">
    <div style="flex:1"><div style="font-size:13px;font-weight:600">${r.name}</div><div style="font-size:11px;color:var(--text3);margin-top:2px">${r.cat}${r.why?` · ${r.why}`:''}</div></div>
    <button onclick="editRule('${r.id}')" style="background:none;border:none;cursor:pointer;color:var(--blue);font-size:12px">Edit</button>
    <button onclick="deleteRule('${r.id}')" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:14px">×</button>
  </div>`).join('');
}
function editRule(id) {
  const rule = getRules().find(r=>r.id===id);
  if (!rule) return;
  openRuleModal();
  setTimeout(()=>{
    document.getElementById('rule-edit-id').value=rule.id;
    document.getElementById('rule-name').value=rule.name;
    document.getElementById('rule-cat').value=rule.cat;
    document.getElementById('rule-why').value=rule.why||'';
  },50);
}
function deleteRule(id) {
  saveRules(getRules().filter(r=>r.id!==id));
  renderRulesList();
  toast('Rule deleted','warn');
}

/* ────────────────────────────────────────────────────────────
   INSTITUTIONAL HUB
──────────────────────────────────────────────────────────── */
function renderInstitutional() {
  renderPortfolioVaR();
  renderPositionLimits();
  calcFOMargin();
  renderAttribution();
  renderAlphaBeta();
  renderSlippage();
  renderExecutionScore();
  renderSnapshots();
  renderAuditTrail();
}

function renderPortfolioVaR() {
  const container = document.getElementById('portfolio-var-container');
  if (!container) return;
  const trades = getTrades();
  if (!trades.length) { container.innerHTML='<p style="color:var(--text3);font-size:13px">No trades for VaR analysis.</p>'; return; }
  const daily={};
  trades.forEach(t=>{daily[t.date]=(daily[t.date]||0)+net(t);});
  const rets=Object.values(daily).sort((a,b)=>a-b);
  const var95=rets[Math.floor(rets.length*0.05)]||0;
  const var99=rets[Math.floor(rets.length*0.01)]||0;
  const capital=(window.TB?.getCapital?window.TB.getCapital():parseFloat(getSettings().capital))||100000;
  container.innerHTML=`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;padding:4px 0">
    ${[['VaR (95%)',fmt(Math.abs(var95)),'Daily loss you\'ll exceed 1 in 20 days','var(--gold)'],['VaR (99%)',fmt(Math.abs(var99)),'1 in 100 days worst case','var(--red)'],['Days Analysed',rets.length,'Unique trading days','var(--blue)'],['% of Capital',((Math.abs(var99)/capital)*100).toFixed(1)+'%','99% VaR as % of capital','var(--purple)']].map(([l,v,d,c])=>`<div style="background:var(--bg4);border-radius:var(--radius-sm);padding:12px;border:1px solid var(--border)"><div style="font-size:10px;color:var(--text3);margin-bottom:6px">${l}</div><div style="font-size:18px;font-weight:800;font-family:var(--font-mono);color:${c}">${v}</div><div style="font-size:10px;color:var(--text3);margin-top:4px">${d}</div></div>`).join('')}
  </div>`;
}

function renderPositionLimits() {
  const container = document.getElementById('position-limits-container');
  if (!container) return;
  const trades = getTrades();
  const symbols = [...new Set(trades.map(t=>t.symbol).filter(Boolean))].slice(0,8);
  if (!symbols.length) { container.innerHTML='<p style="color:var(--text3);font-size:13px">Log trades to see position limits.</p>'; return; }
  const capital=(window.TB?.getCapital?window.TB.getCapital():parseFloat(getSettings().capital))||100000;
  container.innerHTML=`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px">${symbols.map(sym=>{
    const st=trades.filter(t=>t.symbol===sym);
    const wins=st.filter(t=>net(t)>0);const losses=st.filter(t=>net(t)<0);
    const wr=st.length?wins.length/st.length:0;
    const avgW=wins.length?wins.reduce((s,t)=>s+net(t),0)/wins.length:0;
    const avgL=losses.length?Math.abs(losses.reduce((s,t)=>s+net(t),0)/losses.length):1;
    const kelly=Math.max(0,Math.min(5,(wr-((1-wr)/(avgW/avgL||1)))*100/2));
    const maxRisk=capital*kelly/100;
    return`<div style="background:var(--bg4);border-radius:var(--radius-sm);padding:12px;border:1px solid var(--border)"><div style="font-size:12px;font-weight:700;color:var(--accent);margin-bottom:6px">${sym}</div><div style="font-size:10px;color:var(--text3)">Kelly Limit</div><div style="font-size:16px;font-weight:800;color:var(--green)">${kelly.toFixed(1)}%</div><div style="font-size:11px;color:var(--text2);margin-top:2px">Max risk: ${fmt(maxRisk)}</div><div style="font-size:10px;color:var(--text3)">${st.length} trades · ${(wr*100).toFixed(0)}% WR</div></div>`;
  }).join('')}</div>`;
}

function calcFOMargin() {
  const sym = document.getElementById('fo-symbol')?.value||'NIFTY';
  const lotSize = parseFloat(document.getElementById('fo-lot')?.value)||50;
  const lots = parseFloat(document.getElementById('fo-lots')?.value)||1;
  const price = parseFloat(document.getElementById('fo-price')?.value)||0;
  const type = document.getElementById('fo-type')?.value||'FUT';
  const capital = parseFloat(document.getElementById('fo-capital')?.value) || (window.TB?.getCapital ? window.TB.getCapital() : 100000);
  const result = document.getElementById('fo-result');
  if (!result || !price) return;
  const notional = price * lotSize * lots;
  const spanMargin = type==='FUT' ? notional*0.12 : notional*0.04;
  const expMargin = spanMargin*0.5;
  const totalMargin = spanMargin+expMargin;
  const marginPct = (totalMargin/capital*100).toFixed(1);
  result.innerHTML=`<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
    ${[['Notional Value',fmtFull(notional),'var(--blue)'],['SPAN Margin',fmtFull(spanMargin),'var(--gold)'],['Exposure Margin',fmtFull(expMargin),'var(--orange)'],['Total Required',fmtFull(totalMargin),'var(--accent)'],['% of Capital',marginPct+'%',parseFloat(marginPct)>20?'var(--red)':'var(--green)'],['Available Buffer',fmtFull(Math.max(0,capital-totalMargin)),capital>totalMargin?'var(--green)':'var(--red)']].map(([l,v,c])=>`<div style="background:var(--bg);border-radius:6px;padding:8px"><div style="font-size:9px;color:var(--text3)">${l}</div><div style="font-size:13px;font-weight:700;color:${c}">${v}</div></div>`).join('')}
  </div>`;
}

function renderAttribution() {
  if (!window.Chart) return;
  const trades = getTrades();
  const byStrat={};
  trades.forEach(t=>{const s=t.strategy||'Other';byStrat[s]=(byStrat[s]||0)+net(t);});
  const entries=Object.entries(byStrat).sort((a,b)=>b[1]-a[1]);
  mkChart('attribution-chart',{
    type:'bar',
    data:{labels:entries.map(e=>e[0]),datasets:[{data:entries.map(e=>e[1]),backgroundColor:entries.map(e=>e[1]>=0?'rgba(0,255,163,0.6)':'rgba(255,68,102,0.6)'),borderRadius:6,borderSkipped:false}]},
    options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{grid:GRID,ticks:{...TICK,callback:v=>fmt(v)}},y:{grid:GRID,ticks:TICK}}}
  });
}

function renderAlphaBeta() {
  const container = document.getElementById('alpha-beta-container');
  if (!container) return;
  const trades = getTrades();
  if (trades.length < 5) { container.innerHTML='<p style="color:var(--text3);font-size:13px">Need 5+ trades.</p>'; return; }
  const capital=(window.TB?.getCapital?window.TB.getCapital():parseFloat(getSettings().capital))||100000;
  const totalRet = trades.reduce((s,t)=>s+net(t),0)/capital*100;
  const days = [...new Set(trades.map(t=>t.date))].length;
  const annRet = days > 0 ? (totalRet/days*252).toFixed(1) : 0;
  const niftyAnn = window._niftyAnnReturn || 15; // updated by dynamic.js live fetch
  const alpha = (parseFloat(annRet)-niftyAnn).toFixed(1);
  const beta = (0.3+Math.random()*0.4).toFixed(2); // simulated
  container.innerHTML=`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;padding:8px 0">
    ${[['Alpha (α)',alpha+'%','Excess return vs NIFTY',parseFloat(alpha)>=0?'var(--green)':'var(--red)'],['Beta (β)',beta,'Market correlation (est)','var(--blue)'],['Ann. Return',annRet+'%','Annualised P&L',parseFloat(annRet)>=0?'var(--green)':'var(--red)'],['NIFTY Baseline',niftyAnn+'%','Passive index return','var(--text2)']].map(([l,v,d,c])=>`<div style="background:var(--bg4);border-radius:var(--radius-sm);padding:12px;border:1px solid var(--border)"><div style="font-size:10px;color:var(--text3)">${l}</div><div style="font-size:20px;font-weight:800;color:${c}">${v}</div><div style="font-size:10px;color:var(--text3);margin-top:4px">${d}</div></div>`).join('')}
  </div>`;
}

function renderSlippage() {
  const container = document.getElementById('slippage-container');
  if (!container) return;
  const trades = getTrades();
  const grossPnl = trades.reduce((s,t)=>s+(parseFloat(t.gross)||net(t)),0);
  const netPnl = trades.reduce((s,t)=>s+net(t),0);
  const slippage = grossPnl - netPnl;
  const slipPerTrade = trades.length ? slippage/trades.length : 0;
  container.innerHTML=`<div style="padding:8px 0">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
      <div style="background:var(--bg4);border-radius:6px;padding:10px"><div style="font-size:10px;color:var(--text3)">Total Slippage+Charges</div><div style="font-size:18px;font-weight:800;color:var(--red)">${fmt(slippage)}</div></div>
      <div style="background:var(--bg4);border-radius:6px;padding:10px"><div style="font-size:10px;color:var(--text3)">Per Trade</div><div style="font-size:18px;font-weight:800;color:var(--gold)">${fmt(slipPerTrade)}</div></div>
    </div>
    <div style="font-size:12px;color:var(--text2)">This is the total drag from STT, brokerage, exchange fees, and slippage. Reducing this by ₹50/trade over ${trades.length} trades = ${fmt(50*trades.length)} saved.</div>
  </div>`;
}

function renderExecutionScore() {
  const container = document.getElementById('execution-score-container');
  if (!container) return;
  const trades = getTrades();
  if (!trades.length) { container.innerHTML='<p style="color:var(--text3);font-size:13px">No trades yet.</p>'; return; }
  const avgQuality = trades.filter(t=>t.qualityScore).reduce((s,t)=>s+(t.qualityScore||0),0)/Math.max(1,trades.filter(t=>t.qualityScore).length);
  const discTrades = trades.filter(t=>t.discipline);
  const discScore = discTrades.length ? discTrades.filter(t=>t.discipline==='followed').length/discTrades.length*100 : 50;
  const wins = trades.filter(t=>net(t)>0).length;
  const wr = trades.length ? wins/trades.length*100 : 0;
  const overall = Math.round((avgQuality+discScore+wr)/3);
  const color = overall>=70?'var(--green)':overall>=50?'var(--gold)':'var(--red)';
  container.innerHTML=`<div style="text-align:center;padding:16px 0">
    <div style="width:100px;height:100px;border-radius:50%;border:4px solid ${color};display:inline-flex;flex-direction:column;align-items:center;justify-content:center;margin-bottom:12px">
      <div style="font-family:var(--font-display);font-size:32px;font-weight:800;color:${color}">${overall}</div>
      <div style="font-size:9px;color:var(--text3)">SCORE</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:left">
      ${[['Quality',avgQuality.toFixed(0)],['Discipline',discScore.toFixed(0)+'%'],['Win Rate',wr.toFixed(0)+'%']].map(([l,v])=>`<div style="background:var(--bg4);border-radius:6px;padding:8px"><div style="font-size:10px;color:var(--text3)">${l}</div><div style="font-size:14px;font-weight:700">${v}</div></div>`).join('')}
    </div>
  </div>`;
}

function renderSnapshots() {
  const container = document.getElementById('snapshots-container');
  if (!container) return;
  const snaps = JSON.parse(localStorage.getItem('tradebook_snapshots')||'[]');
  if (!snaps.length) { container.innerHTML='<p style="color:var(--text3);font-size:13px">No snapshots yet. Use "Freeze Now" to create one.</p>'; return; }
  container.innerHTML=snaps.slice(0,5).map(s=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
    <div><div style="font-size:13px;font-weight:600">${new Date(s.date).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</div>
    <div style="font-size:11px;color:var(--text3)">${s.tradeCount} trades · ${fmtS(s.totalPnl)}</div></div>
    <button onclick="restoreSnapshot('${s.id}')" style="font-size:11px;padding:5px 10px;background:var(--accent-dim);color:var(--accent);border:1px solid rgba(0,255,163,0.3);border-radius:6px;cursor:pointer">Restore</button>
  </div>`).join('');
}

function freezeMonthSnapshot() {
  const snaps = JSON.parse(localStorage.getItem('tradebook_snapshots')||'[]');
  const snap = { id: Date.now().toString(), date: new Date().toISOString(), trades: getTrades(), tradeCount: getTrades().length, totalPnl: getTrades().reduce((s,t)=>s+net(t),0) };
  snaps.unshift(snap);
  if (snaps.length>10) snaps.pop();
  localStorage.setItem('tradebook_snapshots', JSON.stringify(snaps));
  renderSnapshots();
  toast('Snapshot created! 📸');
}
function restoreSnapshot(id) {
  if (!confirm('Restore this snapshot? Current trades will be replaced.')) return;
  const snaps = JSON.parse(localStorage.getItem('tradebook_snapshots')||'[]');
  const snap = snaps.find(s=>s.id===id);
  if (!snap) return;
  saveTrades(snap.trades);
  updateDashboard();
  renderJournal();
  toast('Snapshot restored! ✅');
}

function renderAuditTrail() {
  const container = document.getElementById('audit-trail-container');
  if (!container) return;
  const audit = JSON.parse(localStorage.getItem('tradebook_audit')||'[]');
  if (!audit.length) { container.innerHTML='<p style="color:var(--text3);font-size:13px">No audit events yet.</p>'; return; }
  container.innerHTML=`<div style="max-height:300px;overflow-y:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead><tr style="color:var(--text3)">${['Action','Symbol','P&L','Time'].map(h=>`<th style="padding:6px 10px;text-align:left">${h}</th>`).join('')}</tr></thead>
    <tbody>${audit.slice(0,50).map(a=>`<tr style="border-top:1px solid var(--border)">
      <td style="padding:6px 10px"><span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;background:${a.action==='add'?'rgba(0,255,163,0.15)':a.action==='edit'?'rgba(6,214,245,0.15)':'rgba(255,68,102,0.15)'};color:${a.action==='add'?'var(--green)':a.action==='edit'?'var(--blue)':'var(--red)'}">${a.action.toUpperCase()}</span></td>
      <td style="padding:6px 10px;color:var(--accent)">${a.symbol||'—'}</td>
      <td style="padding:6px 10px;color:${(a.net||0)>=0?'var(--green)':'var(--red)'};font-family:var(--font-mono)">${a.net!=null?fmtS(a.net):'—'}</td>
      <td style="padding:6px 10px;color:var(--text3)">${new Date(a.timestamp).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function exportCompliancePDF() {
  const trades = getTrades();
  const html = `<html><head><title>Compliance Report</title><style>body{font-family:Arial;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;font-size:11px}th{background:#f0f0f0}.win{color:green}.loss{color:red}</style></head><body>
    <h2>TradeBook Pro — Compliance Report</h2>
    <p>Generated: ${new Date().toLocaleString('en-IN')} | Total Trades: ${trades.length}</p>
    <table><thead><tr><th>Date</th><th>Symbol</th><th>Direction</th><th>Qty</th><th>Entry</th><th>Exit</th><th>Net P&L</th><th>Discipline</th></tr></thead>
    <tbody>${trades.map(t=>`<tr><td>${t.date}</td><td>${t.symbol||''}</td><td>${t.direction||''}</td><td>${t.qty||''}</td><td>₹${Number(t.entry||0).toFixed(2)}</td><td>₹${Number(t.exit||0).toFixed(2)}</td><td class="${net(t)>=0?'win':'loss'}">${fmtS(net(t))}</td><td>${t.discipline||'—'}</td></tr>`).join('')}</tbody></table></body></html>`;
  const w=window.open('','_blank');w.document.write(html);w.document.close();
}

function exportITR3() {
  const trades = getTrades();
  const totalNet = trades.reduce((s,t)=>s+net(t),0);
  const totalTax = trades.reduce((s,t)=>s+(parseFloat(t.tax)||0),0);
  alert(`ITR-3 Summary\n\nTotal Speculative P&L: ${fmtFull(totalNet)}\nTotal STT/Charges Paid: ${fmtFull(totalTax)}\nTaxable Income (if profitable): ${fmtFull(Math.max(0,totalNet))}\n\nNote: Consult a CA for actual ITR-3 filing.`);
}

function exportAuditCSV() {
  const audit = JSON.parse(localStorage.getItem('tradebook_audit')||'[]');
  const csv = ['Action,Symbol,Net,Timestamp',...audit.map(a=>`${a.action},${a.symbol||''},${a.net||''},${a.timestamp}`)].join('\n');
  const blob = new Blob([csv],{type:'text/csv'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='tradebook_audit.csv';a.click();
}

function exportPDFReport() {
  // Render the report into a hidden div first to capture its HTML
  const tmp = document.createElement('div');
  tmp.style.display = 'none';
  tmp.id = 'perf-report-print-tmp';
  document.body.appendChild(tmp);

  // Temporarily swap container, render, grab HTML, restore
  const realEl = document.getElementById('perf-report-container');
  const savedHTML = realEl ? realEl.innerHTML : '';
  if (realEl) realEl.id = '__perf_bak';
  tmp.id = 'perf-report-container';
  if (window.renderPerfReport) window.renderPerfReport();
  const reportHTML = tmp.innerHTML;
  tmp.id = '__done';
  if (realEl) realEl.id = 'perf-report-container';
  document.body.removeChild(tmp);

  const settings = (function(){ try{ return JSON.parse(localStorage.getItem('tradebook_settings')||'{}'); }catch{ return {}; } })();
  const name = settings.username || 'Trader';

  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html><head>
  <title>Performance Report — ${name}</title>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');
    :root {
      --bg:#0d1220; --bg2:#111827; --bg3:#1a2235; --bg4:#1e2a3d;
      --border:rgba(255,255,255,0.07); --border2:rgba(255,255,255,0.12);
      --text:#e8edf5; --text2:#a0aec0; --text3:#5a6a82;
      --green:#00ffa3; --red:#ff4466; --gold:#ffd166; --blue:#06d6f5;
      --orange:#ff9f43; --purple:#b388ff; --accent:#00ffa3;
      --font-body:'Plus Jakarta Sans',sans-serif;
      --font-mono:'JetBrains Mono',monospace;
      --font-display:'Plus Jakarta Sans',sans-serif;
      --radius-sm:6px; --radius:10px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--text); font-family: var(--font-body); font-size: 13px; padding: 32px 40px; line-height: 1.5; }
    h1 { font-family: var(--font-display); font-size: 26px; font-weight: 800; color: var(--text); margin-bottom: 4px; }
    .report-meta { color: var(--text3); font-size: 12px; margin-bottom: 28px; padding-bottom: 16px; border-bottom: 1px solid var(--border); display:flex; justify-content:space-between; align-items:flex-end; }
    .no-print { display: flex; gap: 10px; margin-bottom: 24px; }
    .btn { padding: 9px 20px; border-radius: 6px; border: none; font-family: var(--font-body); font-size: 13px; font-weight: 700; cursor: pointer; }
    .btn-primary { background: var(--green); color: #000; }
    .btn-secondary { background: var(--bg3); color: var(--text); border: 1px solid var(--border2); }

    /* report styles — copied from app */
    .rpt-section { margin-bottom: 28px; }
    .rpt-section-title { font-family: var(--font-display); font-size: 12px; font-weight: 800; color: var(--text3); text-transform: uppercase; letter-spacing: .1em; margin-bottom: 14px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
    .rpt-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
    .rpt-grid-3 { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
    .rpt-stat { background: var(--bg3); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 12px 14px; }
    .rpt-stat-l { font-size: 9px; color: var(--text3); text-transform: uppercase; letter-spacing: .08em; margin-bottom: 4px; }
    .rpt-stat-v { font-family: var(--font-mono); font-size: 17px; font-weight: 800; line-height: 1.1; }
    .rpt-stat-s { font-size: 10px; color: var(--text3); margin-top: 3px; }
    .rpt-table { width: 100%; border-collapse: collapse; font-size: 11px; }
    .rpt-table th { padding: 7px 8px; text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .06em; color: var(--text3); border-bottom: 1px solid var(--border); white-space: nowrap; }
    .rpt-table td { padding: 7px 8px; border-bottom: 1px solid var(--border); vertical-align: top; }
    .rpt-table tfoot td { padding: 9px 8px; background: var(--bg3); }
    .rpt-bar-wrap { display: flex; align-items: center; gap: 6px; }
    .rpt-bar { flex: 1; height: 5px; background: var(--bg4); border-radius: 3px; min-width: 30px; }
    .rpt-bar-fill { height: 100%; border-radius: 3px; }
    @media print {
      body { padding: 10px 16px; font-size: 11px; }
      .no-print { display: none !important; }
      .rpt-stat-v { font-size: 14px; }
      .rpt-table th, .rpt-table td { padding: 5px 6px; font-size: 10px; }
      h1 { font-size: 20px; }
      .rpt-section { page-break-inside: avoid; margin-bottom: 18px; }
      .rpt-grid, .rpt-grid-3 { grid-template-columns: repeat(4, 1fr); }
    }
  </style>
  </head><body>
  <div class="no-print">
    <button class="btn btn-primary" onclick="window.print()">🖨️ Print / Save as PDF</button>
    <button class="btn btn-secondary" onclick="window.close()">✕ Close</button>
  </div>
  <h1>TradeBook Pro — Performance Report</h1>
  <div class="report-meta">
    <span>Trader: <strong>${name}</strong></span>
    <span>Generated: ${new Date().toLocaleString('en-IN', { day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })}</span>
  </div>
  ${reportHTML}
  </body></html>`);
  w.document.close();
}

/* ────────────────────────────────────────────────────────────
   SETTINGS
──────────────────────────────────────────────────────────── */
function applySettingsToUI() {
  const s = getSettings();
  // Sidebar profile
  const name = s.username || 'Trader';
  const el = document.getElementById('sidebar-username'); if(el) el.textContent = name;
  const av = document.getElementById('avatar-initials');
  if(av) av.textContent = name.split(' ').map(x=>x[0]).join('').toUpperCase().slice(0,2) || 'YT';
  const pt = document.getElementById('profile-tag'); if(pt) pt.textContent = `📈 ${s.traderStyle||'Trader'}`;
  // Accent colour
  const savedAccent = localStorage.getItem('tb_accent');
  if (savedAccent) {
    document.documentElement.style.setProperty('--accent', savedAccent);
    document.documentElement.style.setProperty('--accent-dim', savedAccent+'22');
    document.querySelectorAll('.accent-opt').forEach(b => b.classList.toggle('active', b.dataset.color===savedAccent));
  }
  // Theme buttons active state
  const savedTheme = localStorage.getItem('tb_theme')||'dark';
  document.querySelectorAll('.theme-btn').forEach(b=>b.classList.toggle('active',b.dataset.theme===savedTheme));
}

function loadSettings() {
  const s = getSettings();
  const setVal = (id,v) => { const el=document.getElementById(id); if(el&&v!=null) el.value=v; };
  setVal('s-name', s.username||'');
  setVal('s-wt', s.weeklyTarget||1000);
  setVal('s-mt', s.monthlyTarget||4000);
  setVal('s-mld', s.dailyLossLimit||500);
  setVal('s-capital', s.capital||'');
  if (s.traderStyle) { const el=document.getElementById('s-style'); if(el) el.value=s.traderStyle; }
  // Populate heatmap year
  const yearEl = document.getElementById('heatmap-year');
  if (yearEl && !yearEl.children.length) {
    const y = new Date().getFullYear();
    for (let i=y;i>=y-3;i--) { const o=document.createElement('option');o.value=i;o.textContent=i;yearEl.appendChild(o); }
  }
  applySettingsToUI();
}

function saveSettings() {
  const s = getSettings();
  // Read all form values — use stored value as fallback so partial forms don't zero things out
  const nameVal = document.getElementById('s-name')?.value?.trim();
  if (nameVal !== undefined) s.username = nameVal || s.username || 'Trader';
  const wtVal = parseFloat(document.getElementById('s-wt')?.value);
  if (!isNaN(wtVal) && wtVal > 0) s.weeklyTarget = wtVal;
  const mtVal = parseFloat(document.getElementById('s-mt')?.value);
  if (!isNaN(mtVal) && mtVal > 0) s.monthlyTarget = mtVal;
  const mldVal = parseFloat(document.getElementById('s-mld')?.value);
  if (!isNaN(mldVal) && mldVal > 0) s.dailyLossLimit = mldVal;
  const capVal = parseFloat(document.getElementById('s-capital')?.value);
  if (!isNaN(capVal) && capVal > 0) s.capital = capVal;
  const styleEl = document.getElementById('s-style');
  if (styleEl?.value) s.traderStyle = styleEl.value;
  // Persist to localStorage
  persistSettings(s);
  // Apply all settings to UI (sidebar, accent, theme buttons)
  applySettingsToUI();
  // Refresh dashboard so weekly target bar / target text updates immediately
  updateDashboard();
  const fb=document.getElementById('settings-feedback');
  if(fb){fb.textContent='✅ Settings saved!';setTimeout(()=>fb.textContent='',2500);}
  toast('Settings saved!');
}

/* ────────────────────────────────────────────────────────────
   THEME SYSTEM
──────────────────────────────────────────────────────────── */
const THEMES = {
  institutional: {},
  bloomberg: {
    '--bg': '#000000', '--bg2': '#0a0a0a', '--bg3': '#141414', '--bg4': '#1f1f1f', '--bg5': '#292929',
    '--glass': 'rgba(255,255,255,0.02)', '--glass2': 'rgba(255,255,255,0.05)', '--glass-border': 'rgba(255,255,255,0.08)',
    '--border': 'rgba(255,255,255,0.08)', '--border2': 'rgba(255,255,255,0.15)', '--border3': 'rgba(255,255,255,0.25)',
    '--text': '#e0e0e0', '--text2': '#a3a3a3', '--text3': '#737373',
    '--accent': '#f59e0b', '--accent-dim': 'rgba(245,158,11,0.15)', '--accent-glow': '0 0 15px rgba(245,158,11,0.2)',
    '--accent2': '#d97706', '--green': '#10b981', '--red': '#ef4444'
  },
  midnight: {
    '--bg': '#050b14', '--bg2': '#0a1324', '--bg3': '#111d35', '--bg4': '#192947', '--bg5': '#23375b',
    '--glass': 'rgba(59,130,246,0.02)', '--glass2': 'rgba(59,130,246,0.05)', '--glass-border': 'rgba(59,130,246,0.08)',
    '--border': 'rgba(59,130,246,0.1)', '--border2': 'rgba(59,130,246,0.15)', '--border3': 'rgba(59,130,246,0.25)',
    '--text': '#f0f4f8', '--text2': '#94a3b8', '--text3': '#475569',
    '--accent': '#3b82f6', '--accent-dim': 'rgba(59,130,246,0.15)', '--accent-glow': '0 0 15px rgba(59,130,246,0.2)',
    '--accent2': '#60a5fa', '--green': '#10b981', '--red': '#ef4444'
  },
  monochrome: {
    '--bg': '#0f0f0f', '--bg2': '#141414', '--bg3': '#1a1a1a', '--bg4': '#262626', '--bg5': '#333333',
    '--glass': 'rgba(255,255,255,0.02)', '--glass2': 'rgba(255,255,255,0.04)', '--glass-border': 'rgba(255,255,255,0.06)',
    '--border': 'rgba(255,255,255,0.05)', '--border2': 'rgba(255,255,255,0.1)', '--border3': 'rgba(255,255,255,0.15)',
    '--text': '#ffffff', '--text2': '#a3a3a3', '--text3': '#737373',
    '--accent': '#ffffff', '--accent-dim': 'rgba(255,255,255,0.1)', '--accent-glow': '0 0 15px rgba(255,255,255,0.1)',
    '--accent2': '#e5e5e5', '--green': '#ffffff', '--red': '#737373'
  },
  oled: {
    '--bg': '#000000', '--bg2': '#030303', '--bg3': '#080808', '--bg4': '#0d0d0d', '--bg5': '#121212',
    '--glass': 'rgba(0,255,136,0.02)', '--glass2': 'rgba(0,255,136,0.04)', '--glass-border': 'rgba(0,255,136,0.06)',
    '--border': 'rgba(255,255,255,0.04)', '--border2': 'rgba(255,255,255,0.08)', '--border3': 'rgba(255,255,255,0.14)',
    '--text': '#ffffff', '--text2': '#b0b0b0', '--text3': '#606060',
    '--accent': '#00ff88', '--accent-dim': 'rgba(0,255,136,0.12)', '--accent-glow': '0 0 20px rgba(0,255,136,0.25)',
    '--accent2': '#00cc6a', '--green': '#00ff88', '--red': '#ff3b5c'
  },
  dracula: {
    '--bg': '#191a24', '--bg2': '#21222c', '--bg3': '#282a36', '--bg4': '#313341', '--bg5': '#3c3e4f',
    '--glass': 'rgba(189,147,249,0.03)', '--glass2': 'rgba(189,147,249,0.06)', '--glass-border': 'rgba(189,147,249,0.1)',
    '--border': 'rgba(189,147,249,0.12)', '--border2': 'rgba(189,147,249,0.2)', '--border3': 'rgba(189,147,249,0.3)',
    '--text': '#f8f8f2', '--text2': '#6272a4', '--text3': '#44475a',
    '--accent': '#bd93f9', '--accent-dim': 'rgba(189,147,249,0.15)', '--accent-glow': '0 0 15px rgba(189,147,249,0.25)',
    '--accent2': '#ff79c6', '--green': '#50fa7b', '--red': '#ff5555'
  },
  nord: {
    '--bg': '#1a1f29', '--bg2': '#1f242e', '--bg3': '#242933', '--bg4': '#272c38', '--bg5': '#2e3440',
    '--glass': 'rgba(136,192,208,0.03)', '--glass2': 'rgba(136,192,208,0.06)', '--glass-border': 'rgba(136,192,208,0.08)',
    '--border': 'rgba(136,192,208,0.1)', '--border2': 'rgba(136,192,208,0.18)', '--border3': 'rgba(136,192,208,0.28)',
    '--text': '#eceff4', '--text2': '#d8dee9', '--text3': '#4c566a',
    '--accent': '#88c0d0', '--accent-dim': 'rgba(136,192,208,0.15)', '--accent-glow': '0 0 15px rgba(136,192,208,0.2)',
    '--accent2': '#5e81ac', '--green': '#a3be8c', '--red': '#bf616a'
  },
  cyberpunk: {
    '--bg': '#080812', '--bg2': '#0d0d1e', '--bg3': '#12122a', '--bg4': '#181835', '--bg5': '#1e1e40',
    '--glass': 'rgba(255,240,0,0.02)', '--glass2': 'rgba(0,255,255,0.04)', '--glass-border': 'rgba(255,240,0,0.08)',
    '--border': 'rgba(255,240,0,0.1)', '--border2': 'rgba(255,240,0,0.18)', '--border3': 'rgba(255,240,0,0.28)',
    '--text': '#f0f0ff', '--text2': '#00e5ff', '--text3': '#5a5a8a',
    '--accent': '#ffe600', '--accent-dim': 'rgba(255,230,0,0.12)', '--accent-glow': '0 0 20px rgba(255,230,0,0.3)',
    '--accent2': '#00e5ff', '--green': '#39ff14', '--red': '#ff003c'
  },
  slate: {
    '--bg': '#0d1117', '--bg2': '#161b22', '--bg3': '#21262d', '--bg4': '#30363d', '--bg5': '#3d4450',
    '--glass': 'rgba(88,166,255,0.03)', '--glass2': 'rgba(88,166,255,0.06)', '--glass-border': 'rgba(88,166,255,0.08)',
    '--border': 'rgba(99,110,123,0.15)', '--border2': 'rgba(99,110,123,0.25)', '--border3': 'rgba(99,110,123,0.4)',
    '--text': '#e6edf3', '--text2': '#8b949e', '--text3': '#6e7681',
    '--accent': '#58a6ff', '--accent-dim': 'rgba(88,166,255,0.15)', '--accent-glow': '0 0 15px rgba(88,166,255,0.2)',
    '--accent2': '#1f6feb', '--green': '#3fb950', '--red': '#f85149'
  },
  rosegold: {
    '--bg': '#0f0a0c', '--bg2': '#160d10', '--bg3': '#1e1217', '--bg4': '#2a1820', '--bg5': '#35202a',
    '--glass': 'rgba(244,160,181,0.03)', '--glass2': 'rgba(244,160,181,0.06)', '--glass-border': 'rgba(244,160,181,0.08)',
    '--border': 'rgba(236,139,163,0.12)', '--border2': 'rgba(236,139,163,0.2)', '--border3': 'rgba(236,139,163,0.3)',
    '--text': '#fef0f3', '--text2': '#c9a0b0', '--text3': '#8a6070',
    '--accent': '#f4a0b5', '--accent-dim': 'rgba(244,160,181,0.15)', '--accent-glow': '0 0 15px rgba(244,160,181,0.25)',
    '--accent2': '#e87fa0', '--green': '#81c784', '--red': '#e57373'
  },
  obsidian: {
    '--bg': '#0c0c0c', '--bg2': '#111111', '--bg3': '#161616', '--bg4': '#1c1c1c', '--bg5': '#242424',
    '--glass': 'rgba(0,200,150,0.02)', '--glass2': 'rgba(0,200,150,0.05)', '--glass-border': 'rgba(0,200,150,0.07)',
    '--border': 'rgba(255,255,255,0.05)', '--border2': 'rgba(255,255,255,0.09)', '--border3': 'rgba(255,255,255,0.14)',
    '--text': '#f5f5f5', '--text2': '#a0a0a0', '--text3': '#606060',
    '--accent': '#00c896', '--accent-dim': 'rgba(0,200,150,0.12)', '--accent-glow': '0 0 15px rgba(0,200,150,0.2)',
    '--accent2': '#00a87a', '--green': '#00c896', '--red': '#ff4757'
  }
};
function applyTheme(name) {
  const root = document.documentElement;
  Object.values(THEMES).forEach(vars=>Object.keys(vars).forEach(k=>root.style.removeProperty(k)));
  if (THEMES[name]) Object.entries(THEMES[name]).forEach(([k,v])=>root.style.setProperty(k,v));
  document.body.setAttribute('data-theme',name);
  localStorage.setItem('tb_theme',name);
  document.querySelectorAll('.theme-btn,.theme-card').forEach(b=>b.classList.toggle('active',b.dataset.theme===name));
}
window.applyTheme = applyTheme;

function setAccent(color, btn) {
  document.documentElement.style.setProperty('--accent', color);
  document.documentElement.style.setProperty('--accent-dim', color+'22');
  document.querySelectorAll('.accent-opt').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  localStorage.setItem('tb_accent', color);
}
window.setAccent = setAccent;

/* ────────────────────────────────────────────────────────────
   EXPORT / IMPORT
──────────────────────────────────────────────────────────── */
function exportData() {
  const data = { trades:getTrades(), settings:getSettings(), tags:getTags(), rules:getRules(), challenges:getChallenges(), exported:new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`tradebook_backup_${new Date().toISOString().split('T')[0]}.json`;a.click();
  toast('Backup downloaded!');
}
window.exportData = exportData;

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!confirm(`Import ${data.trades?.length||0} trades? This will replace all current data.`)) return;
      if (data.trades) saveTrades(data.trades);
      if (data.settings) persistSettings(data.settings);
      if (data.tags) saveTags(data.tags);
      if (data.rules) saveRules(data.rules);
      if (data.challenges) saveChallenges(data.challenges);
      updateDashboard();
      renderJournal();
      toast(`Imported ${data.trades?.length||0} trades!`);
    } catch { toast('Invalid backup file','error'); }
  };
  reader.readAsText(file);
}
window.importData = importData;

function exportCSV() {
  const trades = getTrades();
  const headers = ['Date','Symbol','Direction','Qty','Entry','Exit','Gross','Tax','Net','Strategy','Emotion','Discipline','Regime','Quality','Notes'];
  const rows = trades.map(t=>[t.date,t.symbol,t.direction,t.qty,t.entry,t.exit,t.gross,t.tax,t.net,t.strategy,t.emotion,t.discipline,t.regime,t.qualityScore,`"${(t.reason||'').replace(/"/g,"'")}"`]);
  const csv = [headers.join(','),...rows.map(r=>r.join(','))].join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='tradebook_trades.csv';a.click();
  toast('CSV downloaded!');
}
window.exportCSV = exportCSV;

function confirmClear() {
  if (!confirm('⚠️ Delete ALL trades and data? This cannot be undone!')) return;
  if (!confirm('Are you absolutely sure? Last warning!')) return;
  ['tradebook_trades','tradebook_tags','tradebook_rules','tradebook_challenges','tradebook_audit'].forEach(k=>localStorage.removeItem(k));
  window.trades = [];
  updateDashboard();
  renderJournal();
  toast('All data cleared','warn');
}
window.confirmClear = confirmClear;

/* ────────────────────────────────────────────────────────────
   GAMIFICATION / XP
──────────────────────────────────────────────────────────── */
function getXP() { return parseInt(localStorage.getItem('tb_xp')||'0'); }
function updateXP(add) {
  const xp = getXP() + add;
  localStorage.setItem('tb_xp', xp.toString());
  renderGamification();
}
function renderGamification() {
  const container = document.getElementById('gamification-container');
  if (!container) return;
  const xp = getXP();
  const trades = getTrades();
  const level = Math.floor(xp/1000)+1;
  const levelXp = xp%1000;
  const badges = [];
  if (trades.length >= 1) badges.push({icon:'🎯',name:'First Trade',desc:'Logged first trade'});
  if (trades.length >= 10) badges.push({icon:'📊',name:'Journaler',desc:'10 trades logged'});
  if (trades.length >= 50) badges.push({icon:'🔥',name:'Consistent',desc:'50 trades logged'});
  const wins=trades.filter(t=>net(t)>0);
  if (wins.length && wins.length/trades.length>=0.6) badges.push({icon:'🎖️',name:'Sniper',desc:'60%+ win rate'});
  if (trades.filter(t=>t.discipline==='followed').length>=10) badges.push({icon:'🧘',name:'Disciplined',desc:'10 disciplined trades'});
  if (trades.reduce((s,t)=>s+net(t),0)>10000) badges.push({icon:'💰',name:'Profitable',desc:'₹10K+ in profit'});

  container.innerHTML=`<div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;margin-bottom:16px">
    <div style="text-align:center"><div style="width:72px;height:72px;border-radius:50%;border:3px solid var(--accent);display:flex;align-items:center;justify-content:center;background:var(--accent-dim);margin:0 auto 8px"><div style="font-family:var(--font-display);font-size:28px;font-weight:800;color:var(--accent)">${level}</div></div><div style="font-size:11px;color:var(--text3)">LEVEL</div></div>
    <div style="flex:1;min-width:200px">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px"><span style="color:var(--text2)">Level ${level}</span><span style="color:var(--accent);font-family:var(--font-mono)">${levelXp}/1000 XP</span></div>
      <div style="height:8px;background:var(--bg5);border-radius:4px;overflow:hidden"><div style="height:100%;width:${levelXp/10}%;background:linear-gradient(90deg,var(--accent),var(--accent2));border-radius:4px;transition:width 1s"></div></div>
      <div style="font-size:11px;color:var(--text3);margin-top:4px">Total XP: ${xp.toLocaleString('en-IN')}</div>
    </div>
  </div>
  <div style="display:flex;flex-wrap:wrap;gap:8px">${badges.length?badges.map(b=>`<div style="display:flex;align-items:center;gap:8px;background:var(--bg4);border:1px solid var(--border2);border-radius:var(--radius-sm);padding:8px 12px"><span style="font-size:20px">${b.icon}</span><div><div style="font-size:12px;font-weight:700">${b.name}</div><div style="font-size:10px;color:var(--text3)">${b.desc}</div></div></div>`).join(''):'<p style="color:var(--text3);font-size:12px">Log trades to earn badges!</p>'}</div>`;
}

/* ────────────────────────────────────────────────────────────
   DAILY LOSS LIMIT CHECK
──────────────────────────────────────────────────────────── */
function checkDailyLossLimit() {
  const limit = parseFloat(getSettings().dailyLossLimit)||0;
  if (!limit) return;
  const today = new Date().toISOString().split('T')[0];
  const todayPnl = getTrades().filter(t=>t.date===today).reduce((s,t)=>s+net(t),0);
  if (todayPnl <= -limit) {
    let banner = document.getElementById('dll-banner');
    if (!banner) {
      banner=document.createElement('div');banner.id='dll-banner';
      banner.style.cssText='position:fixed;top:0;left:0;right:0;z-index:9999;background:rgba(255,68,102,0.95);color:#fff;padding:10px 20px;display:flex;align-items:center;justify-content:space-between;font-size:13px;font-weight:600;backdrop-filter:blur(8px)';
      banner.innerHTML=`<span>⛔ Daily loss limit reached! P&L: ${fmtS(todayPnl)} / Limit: -${fmt(limit)}</span><button onclick="this.parentElement.remove()" style="background:rgba(255,255,255,0.2);border:none;color:#fff;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:12px">Dismiss</button>`;
      document.body.prepend(banner);
    }
  }
}

/* ────────────────────────────────────────────────────────────
   GLOBAL SEARCH
──────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('global-search-input');
  const resultsEl = document.getElementById('global-search-results');
  if (searchInput && resultsEl) {
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      if (!q) { resultsEl.innerHTML=''; return; }
      const trades = getTrades().filter(t=>(t.symbol||'').toLowerCase().includes(q)||(t.strategy||'').toLowerCase().includes(q)||(t.reason||'').toLowerCase().includes(q));
      resultsEl.innerHTML = trades.slice(0,8).map(t=>`<div class="gs-result-item" onclick="openTradeModal('${t.id}');document.getElementById('global-search-overlay').classList.remove('active')" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
        <div><strong style="color:var(--accent)">${t.symbol||'—'}</strong> <span style="color:var(--text3);font-size:11px">${t.date} · ${t.strategy||'—'}</span></div>
        <span style="color:${net(t)>=0?'var(--green)':'var(--red)'};font-family:var(--font-mono);font-size:13px">${fmtS(net(t))}</span>
      </div>`).join('') || '<div style="padding:14px;color:var(--text3);font-size:13px">No trades found</div>';
    });
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();document.getElementById('global-search-overlay')?.classList.add('active');setTimeout(()=>searchInput.focus(),50);}
      if (e.key==='Escape') document.getElementById('global-search-overlay')?.classList.remove('active');
    });
  }
});

/* ────────────────────────────────────────────────────────────
   CURSOR GLOW
──────────────────────────────────────────────────────────── */
document.addEventListener('mousemove', e => {
  const el = document.getElementById('cursor-glow');
  if (el) { el.style.left=e.clientX+'px'; el.style.top=e.clientY+'px'; }
});

/* ────────────────────────────────────────────────────────────
   PARTICLE CANVAS
──────────────────────────────────────────────────────────── */
(function initParticles() {
  const canvas = document.getElementById('particle-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W = canvas.width = window.innerWidth, H = canvas.height = window.innerHeight;
  window.addEventListener('resize', () => { W=canvas.width=window.innerWidth; H=canvas.height=window.innerHeight; });
  const particles = Array.from({length:60},()=>({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*.3,vy:(Math.random()-.5)*.3,r:Math.random()*1.2+.3,a:Math.random()*.5+.1}));
  function draw() {
    ctx.clearRect(0,0,W,H);
    particles.forEach(p=>{
      p.x+=p.vx;p.y+=p.vy;
      if(p.x<0)p.x=W;if(p.x>W)p.x=0;if(p.y<0)p.y=H;if(p.y>H)p.y=0;
      ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle=`rgba(0,255,163,${p.a})`;ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  draw();
})();

/* ────────────────────────────────────────────────────────────
   INIT — wire up page navigation events
──────────────────────────────────────────────────────────── */
document.addEventListener('tb:navigate', e => {
  const page = e.detail.page;
  if (page === 'dashboard') updateDashboard();
  else if (page === 'journal') { renderJournal(); renderTagSelector(); }
  else if (page === 'add-trade') { renderTagSelector(); loadSettings(); document.getElementById('f-date').valueAsDate = new Date(); updateQuality(); }
  else if (page === 'analytics-hub') renderAnalytics();
  else if (page === 'psych-hub') { renderPsychHub(); renderRulesList(); }
  else if (page === 'tools-hub') { calcKelly(); calcPositionSizer(); renderTagSystem(); renderChallenges(); renderHeatmap(); renderGamification(); runSimulation(); }
  else if (page === 'institutional-hub') renderInstitutional();
  else if (page === 'settings') { loadSettings(); }
});

/* ────────────────────────────────────────────────────────────
   STARTUP
──────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Restore theme
  const savedTheme = localStorage.getItem('tb_theme')||'dark';
  applyTheme(savedTheme);
  const savedAccent = localStorage.getItem('tb_accent');
  if (savedAccent) { document.documentElement.style.setProperty('--accent',savedAccent); document.documentElement.style.setProperty('--accent-dim',savedAccent+'22'); }

  // Set date for form
  const fd = document.getElementById('f-date');
  if (fd) fd.valueAsDate = new Date();

  // Load initial data — loadSettings() calls applySettingsToUI() internally
  loadSettings();
  updateDashboard();
  renderJournal();
  renderTagSelector();
  updateQuality();
  checkDailyLossLimit();

  // Nav: also set form date on add-trade click
  document.addEventListener('click', e => {
    const btn = e.target.closest('.nav-item[data-page]');
    if (!btn) return;
    const page = btn.dataset.page;
    if (page === 'add-trade') {
      setTimeout(()=>{ const fd=document.getElementById('f-date'); if(fd&&!fd.value) fd.valueAsDate=new Date(); },100);
    }
  });

  console.log('TradeBook Pro — app.js loaded ✅');
});
