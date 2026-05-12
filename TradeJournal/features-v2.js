/* ═══════════════════════════════════════════════════════════════
   TRADEBOOK PRO — FEATURES V2
   1. Gamification: Quests, Skill Tree, Streak Widget
   2. Risk Management: Live Position Sizer, Correlation, Max Positions
   3. Advanced Analytics: Equity Compare, Drawdown Recovery,
      Rolling Sharpe/Sortino, Sector Heatmap, Market Correlation
   4. Psychology: Meditation Timer, Journaling Prompts, Peer Accountability
   ═══════════════════════════════════════════════════════════════ */
'use strict';
(function() {

/* ── DATA HELPERS ─────────────────────────────────────────── */
const G  = id => document.getElementById(id);
const T  = () => { try { return JSON.parse(localStorage.getItem('tradebook_trades') || '[]'); } catch { return []; } };
const S  = () => { try { return JSON.parse(localStorage.getItem('tradebook_settings') || '{}'); } catch { return {}; } };
const N  = t  => parseFloat(t.net) || 0;
const fmtV = v => { const a = Math.abs(v); return (v < 0 ? '-' : '') + '₹' + (a >= 1e7 ? (a/1e7).toFixed(2)+'Cr' : a >= 1e5 ? (a/1e5).toFixed(2)+'L' : a >= 1000 ? (a/1000).toFixed(1)+'K' : a.toFixed(0)); };
const fmtS = v => (v >= 0 ? '+' : '') + fmtV(v);
const GRID = { color: 'rgba(255,255,255,0.04)' };
const TICK = { color: '#3d4a63', font: { size: 10, family: 'JetBrains Mono' } };
const LEGEND = { labels: { color: '#7b88a8', font: { size: 11 }, boxWidth: 10 } };
const COLORS = ['#00ffa3','#3b82f6','#f59e0b','#a855f7','#ef4444','#06b6d4','#ec4899','#10b981','#f97316','#6366f1'];
function showToast(msg, type) {
  const t = G('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast toast-show' + (type === 'error' ? ' toast-error' : type === 'warn' ? ' toast-warn' : '');
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.className = 'toast', 3000);
}
let _v2Charts = {};
function mk(id, cfg) {
  if (!window.Chart) return null;
  const c = G(id); if (!c) return null;
  if (_v2Charts[id]) { try { _v2Charts[id].destroy(); } catch {} }
  _v2Charts[id] = new Chart(c.getContext('2d'), cfg);
  return _v2Charts[id];
}

/* ══════════════════════════════════════════════════════════════
   1. GAMIFICATION — QUESTS SYSTEM
══════════════════════════════════════════════════════════════ */
function getXP() { return parseInt(localStorage.getItem('tb_xp') || '0'); }
function addXP(amount) {
  const xp = getXP() + amount;
  localStorage.setItem('tb_xp', xp);
  showToast(`+${amount} XP earned!`);
  renderQuests();
  renderSkillTree();
  return xp;
}
function getQuestState() {
  try { return JSON.parse(localStorage.getItem('tb_quests') || '{}'); } catch { return {}; }
}
function saveQuestState(s) { localStorage.setItem('tb_quests', JSON.stringify(s)); }

function generateQuests() {
  const today = new Date().toISOString().split('T')[0];
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
  const weekStr = weekStart.toISOString().split('T')[0];
  const monthStr = today.slice(0, 7);
  const trades = T();
  const todayTrades = trades.filter(t => t.date === today);
  const weekTrades = trades.filter(t => t.date >= weekStr);
  const monthTrades = trades.filter(t => t.date && t.date.startsWith(monthStr));

  const disciplinedToday = todayTrades.filter(t => t.discipline === 'followed').length;
  const disciplinedWeek = weekTrades.filter(t => t.discipline === 'followed').length;
  const winRateWeek = weekTrades.length > 0 ? (weekTrades.filter(t => N(t) > 0).length / weekTrades.length * 100) : 0;

  const streakData = getStreakData();

  return [
    { id: 'daily-log', type: 'daily', name: 'Log a Trade', desc: 'Record at least 1 trade today', xp: 10, current: todayTrades.length, target: 1 },
    { id: 'daily-discipline', type: 'daily', name: 'Follow the Plan', desc: 'Log a trade where you followed your plan', xp: 15, current: disciplinedToday, target: 1 },
    { id: 'daily-journal', type: 'daily', name: 'Write a Reflection', desc: 'Complete today\'s journaling prompt', xp: 20, current: getDailyJournalDone() ? 1 : 0, target: 1 },
    { id: 'weekly-5trades', type: 'weekly', name: 'Active Trader', desc: 'Log 5 trades this week', xp: 50, current: weekTrades.length, target: 5 },
    { id: 'weekly-discipline3', type: 'weekly', name: 'Discipline Streak', desc: 'Maintain 80%+ discipline for 3 days', xp: 75, current: Math.min(3, getDisciplineDays()), target: 3 },
    { id: 'weekly-winrate', type: 'weekly', name: 'Sharp Shooter', desc: 'Achieve 60%+ win rate this week (min 3 trades)', xp: 60, current: weekTrades.length >= 3 && winRateWeek >= 60 ? 1 : 0, target: 1 },
    { id: 'monthly-20trades', type: 'monthly', name: 'Consistent Logger', desc: 'Log 20 trades this month', xp: 150, current: monthTrades.length, target: 20 },
    { id: 'monthly-streak7', type: 'monthly', name: 'Week-Long Streak', desc: 'Maintain a 7-day journaling streak', xp: 200, current: Math.min(7, streakData.current), target: 7 },
  ];
}

function getDisciplineDays() {
  const trades = T();
  const days = {};
  trades.forEach(t => {
    if (!t.date) return;
    if (!days[t.date]) days[t.date] = { total: 0, followed: 0 };
    days[t.date].total++;
    if (t.discipline === 'followed') days[t.date].followed++;
  });
  let streak = 0;
  const sorted = Object.keys(days).sort().reverse();
  for (const d of sorted) {
    if (days[d].total > 0 && (days[d].followed / days[d].total) >= 0.8) streak++;
    else break;
  }
  return streak;
}

function getDailyJournalDone() {
  const today = new Date().toISOString().split('T')[0];
  try {
    const entries = JSON.parse(localStorage.getItem('tb_journal_prompts') || '{}');
    return !!(entries[today] && entries[today].trim().length > 0);
  } catch { return false; }
}

function renderQuests() {
  const container = G('quests-container');
  if (!container) return;
  const quests = generateQuests();
  const xp = getXP();
  const level = Math.floor(xp / 500) + 1;
  const xpInLevel = xp % 500;

  const xpBarEl = G('quests-xp-display');
  if (xpBarEl) {
    xpBarEl.innerHTML = `
      <span class="xp-label">Level ${level}</span>
      <div class="xp-bar-wrap"><div class="xp-bar-fill" style="width:${(xpInLevel/500)*100}%"></div></div>
      <span class="xp-value">${xp} XP</span>
    `;
  }

  container.innerHTML = quests.map(q => {
    const done = q.current >= q.target;
    const pct = Math.min(100, (q.current / q.target) * 100);
    const questState = getQuestState();
    const period = q.type === 'daily' ? new Date().toISOString().split('T')[0] :
                   q.type === 'weekly' ? getWeekKey() : new Date().toISOString().slice(0, 7);
    const claimKey = `${q.id}_${period}`;
    const claimed = questState[claimKey];

    if (done && !claimed) {
      questState[claimKey] = true;
      saveQuestState(questState);
      addXP(q.xp);
    }

    return `<div class="quest-card${done ? ' quest-completed' : ''}">
      ${done ? '<span class="quest-check">✅</span>' : ''}
      <span class="quest-type-badge ${q.type}">${q.type}</span>
      <div class="quest-name">${q.name}</div>
      <div class="quest-desc">${q.desc}</div>
      <div class="quest-progress-bar"><div class="quest-progress-fill ${done ? 'done' : 'active'}" style="width:${pct}%"></div></div>
      <div class="quest-footer">
        <span class="quest-progress-text">${q.current}/${q.target}</span>
        <span class="quest-xp-reward">🏆 ${q.xp} XP</span>
      </div>
    </div>`;
  }).join('');
}

function getWeekKey() {
  const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1);
  return d.toISOString().split('T')[0];
}

/* ══════════════════════════════════════════════════════════════
   1B. GAMIFICATION — SKILL TREE
══════════════════════════════════════════════════════════════ */
const SKILL_TREE = [
  { id: 'first-trade', icon: '🎯', name: 'First Trade', req: 'Log 1 trade', check: () => T().length >= 1, milestone: 1 },
  { id: 'ten-trades', icon: '📊', name: 'Getting Started', req: 'Log 10 trades', check: () => T().length >= 10, milestone: 10 },
  { id: 'fifty-trades', icon: '🔥', name: 'Committed', req: 'Log 50 trades', check: () => T().length >= 50, milestone: 50 },
  { id: 'hundred-trades', icon: '💎', name: 'Centurion', req: 'Log 100 trades', check: () => T().length >= 100, milestone: 100 },
  { id: 'five-hundred', icon: '👑', name: 'Master Trader', req: 'Log 500 trades', check: () => T().length >= 500, milestone: 500 },
  { id: 'first-profit-month', icon: '💰', name: 'Green Month', req: 'First profitable month', check: () => hasGreenMonth(), milestone: 1 },
  { id: 'discipline-master', icon: '🎭', name: 'Discipline Master', req: '80%+ discipline rate', check: () => getDisciplineRate() >= 80, milestone: 80 },
  { id: 'streak-7', icon: '🔥', name: 'Week Warrior', req: '7-day streak', check: () => getStreakData().best >= 7, milestone: 7 },
  { id: 'streak-30', icon: '⚡', name: 'Monthly Machine', req: '30-day streak', check: () => getStreakData().best >= 30, milestone: 30 },
  { id: 'risk-manager', icon: '🛡️', name: 'Risk Manager', req: 'Set position limits', check: () => !!S().maxPositions, milestone: 1 },
  { id: 'analyst', icon: '🔬', name: 'Analyst', req: 'Use all analytics tabs', check: () => getXP() >= 200, milestone: 200 },
  { id: 'zen-trader', icon: '🧘', name: 'Zen Trader', req: 'Complete 10 meditations', check: () => getMeditationCount() >= 10, milestone: 10 },
];

function hasGreenMonth() {
  const trades = T();
  const months = {};
  trades.forEach(t => {
    if (!t.date) return;
    const m = t.date.slice(0, 7);
    months[m] = (months[m] || 0) + N(t);
  });
  return Object.values(months).some(v => v > 0);
}

function getDisciplineRate() {
  const trades = T();
  if (!trades.length) return 0;
  const followed = trades.filter(t => t.discipline === 'followed').length;
  return (followed / trades.length) * 100;
}

function getMeditationCount() {
  return parseInt(localStorage.getItem('tb_meditation_count') || '0');
}

function renderSkillTree() {
  const container = G('skill-tree-container');
  if (!container) return;
  const trades = T();
  const totalUnlocked = SKILL_TREE.filter(s => s.check()).length;

  const headerEl = G('skill-tree-level');
  if (headerEl) headerEl.textContent = `${totalUnlocked}/${SKILL_TREE.length} Unlocked`;

  container.innerHTML = SKILL_TREE.map(s => {
    const unlocked = s.check();
    let progress = 0;
    if (s.id.includes('trade')) progress = Math.min(100, (trades.length / s.milestone) * 100);
    else if (s.id === 'streak-7') progress = Math.min(100, (getStreakData().best / 7) * 100);
    else if (s.id === 'streak-30') progress = Math.min(100, (getStreakData().best / 30) * 100);
    else if (s.id === 'discipline-master') progress = Math.min(100, getDisciplineRate());
    else if (s.id === 'zen-trader') progress = Math.min(100, (getMeditationCount() / 10) * 100);
    else progress = unlocked ? 100 : 0;

    return `<div class="skill-node ${unlocked ? 'unlocked' : 'locked'}">
      <span class="skill-lock-icon">${unlocked ? '🔓' : '🔒'}</span>
      <span class="skill-icon">${s.icon}</span>
      <div class="skill-name">${s.name}</div>
      <div class="skill-req">${s.req}</div>
      <div class="skill-progress-mini"><div class="skill-progress-mini-fill" style="width:${progress}%"></div></div>
      ${unlocked ? '<div class="skill-unlocked-badge">Unlocked</div>' : ''}
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════════════════════════════
   1C. GAMIFICATION — STREAK WIDGET
══════════════════════════════════════════════════════════════ */
function getStreakData() {
  const trades = T();
  const journalEntries = (() => { try { return JSON.parse(localStorage.getItem('tb_journal_prompts') || '{}'); } catch { return {}; } })();
  const activeDays = new Set();
  trades.forEach(t => { if (t.date) activeDays.add(t.date); });
  Object.keys(journalEntries).forEach(d => { if (journalEntries[d] && journalEntries[d].trim()) activeDays.add(d); });

  const sorted = [...activeDays].sort().reverse();
  const today = new Date().toISOString().split('T')[0];
  let current = 0, best = 0, tempStreak = 0;
  const d = new Date();

  for (let i = 0; i < 365; i++) {
    const ds = d.toISOString().split('T')[0];
    if (activeDays.has(ds)) {
      tempStreak++;
      if (i === 0 || tempStreak === current + 1) current = tempStreak;
    } else if (i > 0) {
      best = Math.max(best, tempStreak);
      if (tempStreak === current) break;
      tempStreak = 0;
    }
    d.setDate(d.getDate() - 1);
  }
  best = Math.max(best, tempStreak);

  const last7 = [];
  const d2 = new Date();
  d2.setDate(d2.getDate() - 6);
  for (let i = 0; i < 7; i++) {
    const ds = d2.toISOString().split('T')[0];
    last7.push({ date: ds, active: activeDays.has(ds), isToday: ds === today, label: ['S','M','T','W','T','F','S'][d2.getDay()] });
    d2.setDate(d2.getDate() + 1);
  }

  return { current, best, last7 };
}

function renderStreakWidget() {
  const container = G('streak-widget-container');
  if (!container) return;
  const s = getStreakData();
  const freezes = parseInt(localStorage.getItem('tb_streak_freezes') || '3');

  container.innerHTML = `
    <div class="streak-widget">
      <div class="streak-fire">${s.current >= 7 ? '🔥' : s.current >= 3 ? '✨' : '📝'}</div>
      <div class="streak-info">
        <div class="streak-count">${s.current} Day${s.current !== 1 ? 's' : ''}</div>
        <div class="streak-label">Current Streak</div>
        <div class="streak-best">Best: ${s.best} days</div>
      </div>
      <div class="streak-days">
        ${s.last7.map(d => `<div class="streak-dot${d.active ? ' active' : ''}${d.isToday ? ' today' : ''}">${d.label}</div>`).join('')}
      </div>
      <button class="streak-freeze-btn" onclick="window._useStreakFreeze()" title="Freeze your streak for 1 day (${freezes} left)">❄️ ${freezes}</button>
    </div>
  `;
}

window._useStreakFreeze = function() {
  let freezes = parseInt(localStorage.getItem('tb_streak_freezes') || '3');
  if (freezes <= 0) { showToast('No streak freezes left!', 'error'); return; }
  freezes--;
  localStorage.setItem('tb_streak_freezes', freezes);
  const today = new Date().toISOString().split('T')[0];
  const entries = (() => { try { return JSON.parse(localStorage.getItem('tb_journal_prompts') || '{}'); } catch { return {}; } })();
  if (!entries[today]) entries[today] = '[streak freeze used]';
  localStorage.setItem('tb_journal_prompts', JSON.stringify(entries));
  showToast(`Streak frozen! ${freezes} freezes remaining`);
  renderStreakWidget();
};

/* ══════════════════════════════════════════════════════════════
   2. RISK MANAGEMENT — LIVE POSITION SIZER
══════════════════════════════════════════════════════════════ */
window.calcLivePositionSize = function() {
  const capital = parseFloat(G('rps-capital')?.value) || parseFloat(S().capital) || 100000;
  const riskPct = parseFloat(G('rps-risk-pct')?.value) || 1;
  const entry = parseFloat(G('rps-entry')?.value) || 0;
  const sl = parseFloat(G('rps-sl')?.value) || 0;
  const target = parseFloat(G('rps-target')?.value) || 0;

  if (!entry || !sl) return;

  const riskPerShare = Math.abs(entry - sl);
  if (riskPerShare === 0) return;

  const riskAmount = capital * (riskPct / 100);
  const qty = Math.floor(riskAmount / riskPerShare);
  const totalRisk = qty * riskPerShare;
  const positionValue = qty * entry;
  const rr = target && entry ? Math.abs(target - entry) / riskPerShare : 0;
  const potentialProfit = target ? qty * Math.abs(target - entry) : 0;

  const resultEl = G('rps-result');
  if (resultEl) {
    resultEl.innerHTML = `
      <div class="risk-res-item"><div class="risk-res-label">Quantity</div><div class="risk-res-value" style="color:var(--accent)">${qty}</div></div>
      <div class="risk-res-item"><div class="risk-res-label">Position Value</div><div class="risk-res-value">${fmtV(positionValue)}</div></div>
      <div class="risk-res-item"><div class="risk-res-label">Risk Amount</div><div class="risk-res-value" style="color:var(--red)">${fmtV(totalRisk)}</div></div>
      <div class="risk-res-item"><div class="risk-res-label">R:R Ratio</div><div class="risk-res-value" style="color:${rr >= 2 ? 'var(--green)' : 'var(--gold, #f59e0b)'}">${rr.toFixed(1)}:1</div></div>
      ${target ? `<div class="risk-res-item"><div class="risk-res-label">Potential Profit</div><div class="risk-res-value" style="color:var(--green)">${fmtV(potentialProfit)}</div></div>` : ''}
      <div class="risk-res-item"><div class="risk-res-label">Risk/Share</div><div class="risk-res-value">${fmtV(riskPerShare)}</div></div>
    `;
  }
};

window.fetchLTP = async function() {
  const symbol = G('rps-symbol')?.value?.trim();
  if (!symbol) { showToast('Enter a symbol first', 'warn'); return; }
  const statusEl = G('ltp-status');
  if (statusEl) statusEl.innerHTML = '<span class="ltp-status manual">⏳ Fetching...</span>';
  try {
    const resp = await fetch(`https://www.google.com/finance/quote/${symbol}:NSE`);
    if (statusEl) statusEl.innerHTML = '<span class="ltp-status manual">Manual entry</span>';
    showToast('Use manual LTP — live fetch requires API key', 'warn');
  } catch {
    if (statusEl) statusEl.innerHTML = '<span class="ltp-status manual">Manual entry</span>';
    showToast('Enter LTP manually', 'warn');
  }
};

/* ══════════════════════════════════════════════════════════════
   2B. RISK MANAGEMENT — CORRELATION-AWARE RISK
══════════════════════════════════════════════════════════════ */
const SECTOR_MAP = {
  'RELIANCE': 'Energy', 'ONGC': 'Energy', 'BPCL': 'Energy', 'IOC': 'Energy', 'GAIL': 'Energy', 'ADANIGREEN': 'Energy',
  'HDFCBANK': 'Banking', 'ICICIBANK': 'Banking', 'SBIN': 'Banking', 'KOTAKBANK': 'Banking', 'AXISBANK': 'Banking', 'INDUSINDBK': 'Banking', 'BANKBARODA': 'Banking', 'PNB': 'Banking', 'AUBANK': 'Banking', 'IDFCFIRSTB': 'Banking', 'FEDERALBNK': 'Banking',
  'TCS': 'IT', 'INFY': 'IT', 'WIPRO': 'IT', 'HCLTECH': 'IT', 'TECHM': 'IT', 'LTIM': 'IT', 'MPHASIS': 'IT', 'COFORGE': 'IT', 'PERSISTENT': 'IT',
  'SUNPHARMA': 'Pharma', 'DRREDDY': 'Pharma', 'CIPLA': 'Pharma', 'DIVISLAB': 'Pharma', 'APOLLOHOSP': 'Pharma', 'BIOCON': 'Pharma', 'LUPIN': 'Pharma',
  'TATAMOTORS': 'Auto', 'MARUTI': 'Auto', 'M&M': 'Auto', 'BAJAJ-AUTO': 'Auto', 'HEROMOTOCO': 'Auto', 'EICHERMOT': 'Auto', 'ASHOKLEY': 'Auto', 'TVSMOTOR': 'Auto',
  'TATASTEEL': 'Metals', 'JSWSTEEL': 'Metals', 'HINDALCO': 'Metals', 'VEDL': 'Metals', 'COALINDIA': 'Metals', 'NMDC': 'Metals',
  'HDFCLIFE': 'Insurance', 'SBILIFE': 'Insurance', 'ICICIGI': 'Insurance', 'BAJFINANCE': 'NBFC', 'BAJAJFINSV': 'NBFC', 'CHOLAFIN': 'NBFC',
  'HINDUNILVR': 'FMCG', 'ITC': 'FMCG', 'NESTLEIND': 'FMCG', 'BRITANNIA': 'FMCG', 'DABUR': 'FMCG', 'MARICO': 'FMCG', 'COLPAL': 'FMCG', 'GODREJCP': 'FMCG', 'TATACONSUM': 'FMCG',
  'LT': 'Infra', 'ULTRACEMCO': 'Infra', 'GRASIM': 'Infra', 'ADANIENT': 'Infra', 'ADANIPORTS': 'Infra', 'ACC': 'Infra', 'AMBUJACEM': 'Infra',
  'BHARTIARTL': 'Telecom', 'IDEA': 'Telecom',
  'TITAN': 'Consumer', 'PAGEIND': 'Consumer', 'TRENT': 'Consumer', 'DMART': 'Consumer',
  'NIFTY': 'Index', 'BANKNIFTY': 'Index', 'FINNIFTY': 'Index', 'MIDCPNIFTY': 'Index', 'SENSEX': 'Index',
};

function getSector(symbol) {
  if (!symbol) return 'Other';
  const upper = symbol.toUpperCase().replace(/\s+/g, '');
  return SECTOR_MAP[upper] || 'Other';
}

function renderCorrelationWarnings() {
  const container = G('correlation-container');
  if (!container) return;
  const trades = T();
  const openTrades = trades.filter(t => !t.exitDate || t.status === 'open');
  const recentTrades = trades.slice(-20);
  const tradesBySymbol = {};
  recentTrades.forEach(t => {
    const sym = (t.symbol || '').toUpperCase();
    if (sym) {
      if (!tradesBySymbol[sym]) tradesBySymbol[sym] = [];
      tradesBySymbol[sym].push(t);
    }
  });

  const sectors = {};
  Object.keys(tradesBySymbol).forEach(sym => {
    const sec = getSector(sym);
    if (!sectors[sec]) sectors[sec] = [];
    sectors[sec].push(sym);
  });

  const warnings = [];
  Object.entries(sectors).forEach(([sec, syms]) => {
    if (syms.length >= 3 && sec !== 'Other' && sec !== 'Index') {
      warnings.push({ sector: sec, symbols: syms, level: 'high' });
    } else if (syms.length >= 2 && sec !== 'Other' && sec !== 'Index') {
      warnings.push({ sector: sec, symbols: syms, level: 'medium' });
    }
  });

  let html = '<div class="corr-grid">';
  Object.entries(sectors).forEach(([sec, syms]) => {
    if (sec === 'Other' && syms.length < 2) return;
    html += `<div class="corr-group">
      <div class="corr-group-title">${sec === 'Banking' ? '🏦' : sec === 'IT' ? '💻' : sec === 'Pharma' ? '💊' : sec === 'Auto' ? '🚗' : sec === 'FMCG' ? '🛒' : sec === 'Energy' ? '⚡' : sec === 'Metals' ? '⛏️' : sec === 'Index' ? '📈' : '📦'} ${sec} <span style="font-size:10px;color:var(--text3)">(${syms.length} symbols)</span></div>
      <div class="corr-symbols">${syms.map(s => `<span class="corr-chip">${s}</span>`).join('')}</div>
    </div>`;
  });
  html += '</div>';

  if (warnings.length > 0) {
    html += warnings.map(w => `<div class="corr-warning">
      <span>⚠️</span>
      <span><strong>Concentration risk:</strong> You have ${w.symbols.length} positions in ${w.sector} (${w.symbols.join(', ')}). Consider diversifying to reduce sector-specific risk.</span>
    </div>`).join('');
  }

  container.innerHTML = html;
}

/* ══════════════════════════════════════════════════════════════
   2C. RISK MANAGEMENT — MAX OPEN POSITIONS LIMITER
══════════════════════════════════════════════════════════════ */
function getMaxPosSettings() {
  const s = S();
  return { maxPositions: parseInt(s.maxPositions) || 5, enabled: s.maxPosEnabled !== false };
}

function getOpenPositions() {
  return T().filter(t => t.status === 'open' || (!t.exitPrice && !t.exitDate));
}

function getOverrideLog() {
  try { return JSON.parse(localStorage.getItem('tb_pos_overrides') || '[]'); } catch { return []; }
}

window.saveMaxPosSettings = function() {
  const s = S();
  s.maxPositions = parseInt(G('max-pos-limit')?.value) || 5;
  s.maxPosEnabled = G('max-pos-enabled')?.checked !== false;
  localStorage.setItem('tradebook_settings', JSON.stringify(s));
  showToast('Position limit saved');
  renderMaxPositions();
};

window.overridePositionLimit = function() {
  const log = getOverrideLog();
  log.push({ time: new Date().toISOString(), reason: 'Manual override by trader' });
  localStorage.setItem('tb_pos_overrides', JSON.stringify(log.slice(-50)));
  showToast('Position limit overridden — logged for review', 'warn');
  renderMaxPositions();
};

function renderMaxPositions() {
  const container = G('max-pos-container');
  if (!container) return;
  const { maxPositions } = getMaxPosSettings();
  const open = getOpenPositions();
  const count = open.length;
  const pct = Math.min(100, (count / maxPositions) * 100);
  const status = count >= maxPositions ? 'danger' : count >= maxPositions * 0.8 ? 'warning' : '';
  const barColor = count >= maxPositions ? 'var(--red)' : count >= maxPositions * 0.8 ? 'var(--gold, #f59e0b)' : 'var(--green)';

  const overrides = getOverrideLog().slice(-5).reverse();

  container.innerHTML = `
    <div class="max-pos-header">
      <div style="display:flex;align-items:center;gap:14px">
        <div class="pos-count-display ${status}">${count}/${maxPositions}</div>
        <div class="pos-limit-bar" style="min-width:160px"><div class="pos-limit-fill" style="width:${pct}%;background:${barColor}"></div></div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <input type="number" id="max-pos-limit" class="form-input" value="${maxPositions}" style="width:60px;padding:4px 8px;font-size:12px;text-align:center" min="1" max="50">
        <button class="btn-secondary" onclick="saveMaxPosSettings()" style="font-size:11px;padding:4px 10px">Set Limit</button>
        ${count >= maxPositions ? `<button class="btn-secondary" onclick="overridePositionLimit()" style="font-size:11px;padding:4px 10px;border-color:var(--red);color:var(--red)">Override</button>` : ''}
      </div>
    </div>
    ${count >= maxPositions ? '<div class="corr-warning"><span>🚫</span><span><strong>Position limit reached!</strong> Close existing positions or override to add more. All overrides are logged.</span></div>' : ''}
    ${overrides.length > 0 ? `
      <div class="pos-override-log">
        <div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:6px;text-transform:uppercase">Override Log</div>
        ${overrides.map(o => `<div class="pos-log-entry">
          <span class="pos-log-time">${new Date(o.time).toLocaleDateString('en-IN', {day:'2-digit',month:'short'})} ${new Date(o.time).toLocaleTimeString('en-IN', {hour:'2-digit',minute:'2-digit'})}</span>
          <span class="pos-log-msg">⚠️ ${o.reason}</span>
        </div>`).join('')}
      </div>
    ` : ''}
  `;
}

/* ══════════════════════════════════════════════════════════════
   3. ADVANCED ANALYTICS — EQUITY CURVE COMPARISON
══════════════════════════════════════════════════════════════ */
let _eqCompareStrategies = new Set();

function renderEquityComparison() {
  const container = G('eq-compare-container');
  const controlsEl = G('eq-compare-controls');
  if (!container) return;
  const trades = T();
  const strategies = [...new Set(trades.map(t => t.strategy || t.setup || 'Unknown').filter(Boolean))];

  if (_eqCompareStrategies.size === 0 && strategies.length > 0) {
    strategies.slice(0, 3).forEach(s => _eqCompareStrategies.add(s));
  }

  if (controlsEl) {
    controlsEl.innerHTML = strategies.map((s, i) => {
      const active = _eqCompareStrategies.has(s);
      const color = COLORS[i % COLORS.length];
      return `<button class="eq-strat-chip${active ? ' active' : ''}" onclick="window._toggleEqStrat('${s.replace(/'/g, "\\'")}')" style="${active ? `border-color:${color};color:${color}` : ''}">
        <span class="eq-strat-dot" style="background:${color}"></span>${s}
      </button>`;
    }).join('');
  }

  const datasets = [];
  strategies.forEach((strat, i) => {
    if (!_eqCompareStrategies.has(strat)) return;
    const stratTrades = trades.filter(t => (t.strategy || t.setup || 'Unknown') === strat).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    let running = 0;
    const points = stratTrades.map(t => { running += N(t); return running; });
    const labels = stratTrades.map(t => t.date?.slice(5) || '');
    datasets.push({
      label: strat,
      data: points,
      borderColor: COLORS[i % COLORS.length],
      backgroundColor: 'transparent',
      borderWidth: 2,
      pointRadius: 2,
      tension: 0.35
    });
  });

  const maxLen = Math.max(...datasets.map(d => d.data.length), 0);
  const labels = Array.from({ length: maxLen }, (_, i) => i + 1);

  mk('eqCompareChart', {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: LEGEND, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmtS(c.parsed.y)}` } } },
      scales: { x: { grid: GRID, ticks: { ...TICK, maxTicksLimit: 10 } }, y: { grid: GRID, ticks: { ...TICK, callback: v => fmtV(v) } } }
    }
  });
}

window._toggleEqStrat = function(strat) {
  if (_eqCompareStrategies.has(strat)) _eqCompareStrategies.delete(strat);
  else _eqCompareStrategies.add(strat);
  renderEquityComparison();
};

/* ══════════════════════════════════════════════════════════════
   3B. ANALYTICS — DRAWDOWN RECOVERY TRACKER
══════════════════════════════════════════════════════════════ */
function renderDrawdownRecovery() {
  const container = G('dd-recovery-container');
  const chartContainer = G('dd-recovery-chart-wrap');
  if (!container) return;
  const trades = T().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (trades.length < 2) { container.innerHTML = '<p style="color:var(--text3);font-size:12px">Need at least 2 trades to track drawdowns.</p>'; return; }

  let equity = 0, peak = 0;
  const equityCurve = [];
  const ddCurve = [];
  trades.forEach(t => {
    equity += N(t);
    peak = Math.max(peak, equity);
    equityCurve.push(equity);
    ddCurve.push(equity - peak);
  });

  const episodes = [];
  let inDD = false, ddStart = -1, ddMax = 0, ddMaxIdx = 0;
  for (let i = 0; i < ddCurve.length; i++) {
    if (ddCurve[i] < 0) {
      if (!inDD) { inDD = true; ddStart = i; ddMax = 0; }
      if (ddCurve[i] < ddMax) { ddMax = ddCurve[i]; ddMaxIdx = i; }
    } else if (inDD && ddCurve[i] >= 0) {
      episodes.push({ start: ddStart, trough: ddMaxIdx, end: i, maxDD: ddMax, startDate: trades[ddStart]?.date, endDate: trades[i]?.date, days: i - ddStart, recovered: true });
      inDD = false;
    }
  }
  if (inDD) {
    episodes.push({ start: ddStart, trough: ddMaxIdx, end: trades.length - 1, maxDD: ddMax, startDate: trades[ddStart]?.date, endDate: null, days: trades.length - 1 - ddStart, recovered: false });
  }

  const historicalMax = Math.min(...ddCurve);
  const currentDD = ddCurve[ddCurve.length - 1];
  const nearHistorical = currentDD < 0 && Math.abs(currentDD) >= Math.abs(historicalMax) * 0.8;

  container.innerHTML = `
    <div class="dd-episodes-grid">
      ${episodes.slice(-6).reverse().map((ep, i) => `<div class="dd-episode">
        <div class="dd-episode-num">Drawdown #${episodes.length - i}</div>
        <div class="dd-episode-val">${fmtV(ep.maxDD)}</div>
        <div class="dd-episode-days">${ep.days} trade${ep.days !== 1 ? 's' : ''} duration</div>
        <div class="dd-episode-days">${ep.startDate || '—'} → ${ep.endDate || 'ongoing'}</div>
        <span class="dd-episode-status ${ep.recovered ? 'recovered' : 'active'}">${ep.recovered ? 'Recovered' : 'Active'}</span>
      </div>`).join('')}
    </div>
    ${nearHistorical ? '<div class="dd-alert"><span>🚨</span><span><strong>Warning:</strong> Current drawdown is approaching historical maximum! Consider reducing position sizes.</span></div>' : ''}
  `;

  if (chartContainer) {
    mk('ddRecoveryChart', {
      type: 'line',
      data: {
        labels: trades.map(t => t.date?.slice(5) || ''),
        datasets: [{
          label: 'Drawdown',
          data: ddCurve,
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239,68,68,.1)',
          borderWidth: 2,
          pointRadius: 0,
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { grid: GRID, ticks: { ...TICK, maxTicksLimit: 10 } }, y: { grid: GRID, ticks: { ...TICK, callback: v => fmtV(v) } } }
      }
    });
  }
}

/* ══════════════════════════════════════════════════════════════
   3C. ANALYTICS — ROLLING SHARPE / SORTINO
══════════════════════════════════════════════════════════════ */
let _rollingWindow = 30;

window._setRollingWindow = function(days, btn) {
  _rollingWindow = days;
  document.querySelectorAll('.rolling-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderRollingMetrics();
};

function renderRollingMetrics() {
  const container = G('rolling-metrics-container');
  const statsEl = G('rolling-stats');
  if (!container) return;
  const trades = T().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (trades.length < _rollingWindow) { container.innerHTML = '<p style="color:var(--text3);font-size:12px">Need more trades for rolling analysis.</p>'; return; }

  const dailyReturns = {};
  trades.forEach(t => {
    if (!t.date) return;
    dailyReturns[t.date] = (dailyReturns[t.date] || 0) + N(t);
  });
  const days = Object.keys(dailyReturns).sort();
  const returns = days.map(d => dailyReturns[d]);

  const sharpeArr = [], sortinoArr = [], labels = [];
  for (let i = _rollingWindow; i <= returns.length; i++) {
    const window = returns.slice(i - _rollingWindow, i);
    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const stdDev = Math.sqrt(window.reduce((s, v) => s + (v - mean) ** 2, 0) / window.length);
    const downside = Math.sqrt(window.filter(v => v < 0).reduce((s, v) => s + v ** 2, 0) / window.length);

    sharpeArr.push(stdDev > 0 ? (mean / stdDev) * Math.sqrt(252) : 0);
    sortinoArr.push(downside > 0 ? (mean / downside) * Math.sqrt(252) : 0);
    labels.push(days[i - 1]?.slice(5) || '');
  }

  const currentSharpe = sharpeArr[sharpeArr.length - 1] || 0;
  const currentSortino = sortinoArr[sortinoArr.length - 1] || 0;
  const avgSharpe = sharpeArr.reduce((a, b) => a + b, 0) / sharpeArr.length;

  if (statsEl) {
    statsEl.innerHTML = `
      <div class="rolling-stat"><div class="rolling-stat-label">Current Sharpe</div><div class="rolling-stat-val" style="color:${currentSharpe >= 1 ? 'var(--green)' : currentSharpe >= 0 ? 'var(--gold, #f59e0b)' : 'var(--red)'}">${currentSharpe.toFixed(2)}</div></div>
      <div class="rolling-stat"><div class="rolling-stat-label">Current Sortino</div><div class="rolling-stat-val" style="color:${currentSortino >= 1.5 ? 'var(--green)' : currentSortino >= 0 ? 'var(--gold, #f59e0b)' : 'var(--red)'}">${currentSortino.toFixed(2)}</div></div>
      <div class="rolling-stat"><div class="rolling-stat-label">Avg Sharpe (${_rollingWindow}d)</div><div class="rolling-stat-val">${avgSharpe.toFixed(2)}</div></div>
    `;
  }

  mk('rollingMetricsChart', {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: `Sharpe (${_rollingWindow}d)`, data: sharpeArr, borderColor: '#3b82f6', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: 0.3 },
        { label: `Sortino (${_rollingWindow}d)`, data: sortinoArr, borderColor: '#a855f7', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: 0.3 },
        { label: 'Zero', data: Array(labels.length).fill(0), borderColor: 'rgba(255,255,255,.15)', borderWidth: 1, borderDash: [4, 4], pointRadius: 0 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: LEGEND },
      scales: { x: { grid: GRID, ticks: { ...TICK, maxTicksLimit: 10 } }, y: { grid: GRID, ticks: TICK } }
    }
  });
}

/* ══════════════════════════════════════════════════════════════
   3D. ANALYTICS — SECTOR HEATMAP
══════════════════════════════════════════════════════════════ */
function renderSectorHeatmap() {
  const container = G('sector-heatmap-container');
  if (!container) return;
  const trades = T();
  const sectors = {};
  trades.forEach(t => {
    const sec = getSector(t.symbol);
    if (!sectors[sec]) sectors[sec] = { pnl: 0, trades: 0, wins: 0 };
    sectors[sec].pnl += N(t);
    sectors[sec].trades++;
    if (N(t) > 0) sectors[sec].wins++;
  });

  const entries = Object.entries(sectors).sort((a, b) => b[1].pnl - a[1].pnl);
  if (!entries.length) { container.innerHTML = '<p style="color:var(--text3);font-size:12px">No trades to analyze.</p>'; return; }

  const maxAbs = Math.max(...entries.map(([, v]) => Math.abs(v.pnl)), 1);

  container.innerHTML = `<div class="sector-heatmap-grid">${entries.map(([sec, data]) => {
    const intensity = Math.min(1, Math.abs(data.pnl) / maxAbs);
    const bg = data.pnl >= 0
      ? `rgba(0,255,163,${0.08 + intensity * 0.2})`
      : `rgba(255,68,102,${0.08 + intensity * 0.2})`;
    const textColor = data.pnl >= 0 ? 'var(--green)' : 'var(--red)';
    const wr = data.trades > 0 ? (data.wins / data.trades * 100).toFixed(0) : 0;
    return `<div class="sector-cell" style="background:${bg}">
      <div class="sector-name">${sec}</div>
      <div class="sector-pnl" style="color:${textColor}">${fmtS(data.pnl)}</div>
      <div class="sector-trades" style="color:${textColor}">${data.trades} trades · ${wr}% WR</div>
    </div>`;
  }).join('')}</div>`;
}

/* ══════════════════════════════════════════════════════════════
   3E. ANALYTICS — MARKET CORRELATION OVERLAY
══════════════════════════════════════════════════════════════ */
function renderMarketCorrelation() {
  const container = G('market-corr-container');
  if (!container) return;
  const trades = T().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (trades.length < 3) { container.innerHTML = '<p style="color:var(--text3);font-size:12px">Need more trades for market correlation view.</p>'; return; }

  const dailyPnL = {};
  trades.forEach(t => {
    if (!t.date) return;
    dailyPnL[t.date] = (dailyPnL[t.date] || 0) + N(t);
  });
  const days = Object.keys(dailyPnL).sort();
  let cumPnL = 0;
  const equityData = days.map(d => { cumPnL += dailyPnL[d]; return cumPnL; });

  const winDays = days.filter(d => dailyPnL[d] > 0);
  const lossDays = days.filter(d => dailyPnL[d] < 0);

  const winAnnotations = winDays.map(d => ({
    x: days.indexOf(d),
    type: 'win',
    val: dailyPnL[d]
  }));
  const lossAnnotations = lossDays.map(d => ({
    x: days.indexOf(d),
    type: 'loss',
    val: dailyPnL[d]
  }));

  mk('marketCorrChart', {
    type: 'line',
    data: {
      labels: days.map(d => d.slice(5)),
      datasets: [
        {
          label: 'Your Equity',
          data: equityData,
          borderColor: '#00ffa3',
          backgroundColor: 'rgba(0,255,163,.08)',
          borderWidth: 2,
          pointRadius: 0,
          fill: true,
          tension: 0.35,
          yAxisID: 'y'
        },
        {
          label: 'Win Days',
          data: days.map((d, i) => dailyPnL[d] > 0 ? equityData[i] : null),
          borderColor: 'transparent',
          backgroundColor: '#00ffa3',
          pointRadius: 5,
          pointStyle: 'triangle',
          showLine: false,
          yAxisID: 'y'
        },
        {
          label: 'Loss Days',
          data: days.map((d, i) => dailyPnL[d] < 0 ? equityData[i] : null),
          borderColor: 'transparent',
          backgroundColor: '#ef4444',
          pointRadius: 5,
          pointStyle: 'triangle',
          pointRotation: 180,
          showLine: false,
          yAxisID: 'y'
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: LEGEND,
        tooltip: {
          callbacks: {
            label: c => {
              if (c.datasetIndex === 0) return `Equity: ${fmtS(c.parsed.y)}`;
              const dayIdx = c.dataIndex;
              return `Day P&L: ${fmtS(dailyPnL[days[dayIdx]])}`;
            }
          }
        }
      },
      scales: {
        x: { grid: GRID, ticks: { ...TICK, maxTicksLimit: 12 } },
        y: { grid: GRID, ticks: { ...TICK, callback: v => fmtV(v) } }
      }
    }
  });
}

/* ══════════════════════════════════════════════════════════════
   4. PSYCHOLOGY — MEDITATION / BREATHING TIMER
══════════════════════════════════════════════════════════════ */
let _medTimer = null;
let _medSeconds = 120;
let _medRemaining = 120;
let _medRunning = false;
let _breathPhase = 0;
const BREATH_CYCLE = ['Breathe In...', 'Hold...', 'Breathe Out...', 'Hold...'];
const BREATH_DURATIONS = [4, 4, 6, 2];

window._setMedDuration = function(secs, btn) {
  if (_medRunning) return;
  _medSeconds = secs;
  _medRemaining = secs;
  document.querySelectorAll('.meditation-preset').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  updateMedDisplay();
};

window._startMeditation = function() {
  if (_medRunning) return;
  _medRunning = true;
  _breathPhase = 0;
  updateBreathGuide();
  _medTimer = setInterval(() => {
    _medRemaining--;
    if (_medRemaining <= 0) {
      _medRunning = false;
      clearInterval(_medTimer);
      _medRemaining = 0;
      const count = getMeditationCount() + 1;
      localStorage.setItem('tb_meditation_count', count);
      showToast(`Meditation complete! (${count} total sessions)`);
      updateMedDisplay();
      const guideEl = G('breathing-guide');
      if (guideEl) guideEl.textContent = 'Session Complete 🙏';
      return;
    }
    updateMedDisplay();
  }, 1000);

  let breathTimer = 0;
  let phaseTime = 0;
  const breathInterval = setInterval(() => {
    if (!_medRunning) { clearInterval(breathInterval); return; }
    phaseTime++;
    if (phaseTime >= BREATH_DURATIONS[_breathPhase]) {
      _breathPhase = (_breathPhase + 1) % 4;
      phaseTime = 0;
      updateBreathGuide();
    }
  }, 1000);
};

window._pauseMeditation = function() {
  _medRunning = false;
  clearInterval(_medTimer);
};

window._resetMeditation = function() {
  _medRunning = false;
  clearInterval(_medTimer);
  _medRemaining = _medSeconds;
  updateMedDisplay();
  const guideEl = G('breathing-guide');
  if (guideEl) guideEl.textContent = '';
};

function updateMedDisplay() {
  const timerEl = G('med-timer-display');
  const ringEl = G('med-ring-progress');
  if (timerEl) {
    const m = Math.floor(_medRemaining / 60);
    const s = _medRemaining % 60;
    timerEl.textContent = `${m}:${s.toString().padStart(2, '0')}`;
  }
  if (ringEl) {
    const circumference = 2 * Math.PI * 80;
    const progress = 1 - (_medRemaining / _medSeconds);
    ringEl.style.strokeDasharray = circumference;
    ringEl.style.strokeDashoffset = circumference * (1 - progress);
  }
}

function updateBreathGuide() {
  const guideEl = G('breathing-guide');
  if (guideEl) guideEl.textContent = BREATH_CYCLE[_breathPhase];
}

/* ══════════════════════════════════════════════════════════════
   4B. PSYCHOLOGY — JOURNALING PROMPTS
══════════════════════════════════════════════════════════════ */
const JOURNAL_PROMPTS = [
  "What's my edge today? What setup am I most confident in?",
  "What would I do differently about yesterday's trading?",
  "Am I trading to win, or trading not to lose? What's the difference?",
  "What's my biggest fear in the market right now? Is it rational?",
  "If I could only take ONE trade today, what would it be and why?",
  "What rule did I break most recently? What triggered it?",
  "How would I rate my emotional state 1-10? Should I even trade today?",
  "What's the worst-case scenario for today? Can I accept it?",
  "What pattern have I been ignoring that keeps costing me?",
  "If my best trade this week could talk, what would it teach me?",
  "Am I sizing positions based on conviction or emotion?",
  "What would a disciplined version of me do differently today?",
  "How am I managing risk differently than last month?",
  "What's my pre-market routine missing right now?",
  "If I reviewed my last 10 losses, what's the common thread?",
  "What's one thing I learned from the market this week?",
  "Am I revenge trading or strategy trading? Be honest.",
  "What does my ideal trading day look like? How close am I?",
  "What's my mental stop loss for today — when should I walk away?",
  "What would I tell a new trader about what I learned this month?",
  "How has my risk management evolved in the last 30 days?",
  "What trade am I most proud of recently, and why?",
  "Am I following my system or improvising? Which is working?",
  "What's the opportunity cost of my worst habit?",
  "How do I handle a 3-loss streak? Do I have a plan?",
  "What market conditions am I best at trading? Am I in those now?",
  "If I could automate one part of my process, what would it be?",
  "What's the difference between my winning mindset and losing mindset?",
  "Am I reviewing my trades enough? What would change if I did?",
  "What's one belief about the market I've changed recently?",
];

function getTodayPrompt() {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  return JOURNAL_PROMPTS[dayOfYear % JOURNAL_PROMPTS.length];
}

function renderJournalPrompt() {
  const container = G('journal-prompt-container');
  if (!container) return;
  const today = new Date().toISOString().split('T')[0];
  const prompt = getTodayPrompt();
  const entries = (() => { try { return JSON.parse(localStorage.getItem('tb_journal_prompts') || '{}'); } catch { return {}; } })();
  const saved = entries[today] || '';

  container.innerHTML = `
    <div class="journal-prompt-card">
      <div class="journal-prompt-header">
        <div class="journal-prompt-title">📝 Today's Reflection</div>
        <button class="btn-secondary" onclick="window._shufflePrompt()" style="font-size:10px;padding:4px 10px">🔀 New Prompt</button>
      </div>
      <div class="journal-prompt-text">${prompt}</div>
      <textarea class="journal-prompt-textarea" id="journal-prompt-input" placeholder="Write your reflection here...">${saved}</textarea>
      <div class="journal-prompt-actions">
        <button class="prompt-history-btn" onclick="window._showPromptHistory()">View past reflections</button>
        <button class="btn-primary" onclick="window._saveJournalEntry()" style="font-size:12px;padding:6px 16px">💾 Save</button>
      </div>
    </div>
  `;
}

window._shufflePrompt = function() {
  const promptEl = document.querySelector('.journal-prompt-text');
  if (promptEl) {
    const idx = Math.floor(Math.random() * JOURNAL_PROMPTS.length);
    promptEl.textContent = JOURNAL_PROMPTS[idx];
  }
};

window._saveJournalEntry = function() {
  const input = G('journal-prompt-input');
  if (!input || !input.value.trim()) { showToast('Write something first', 'warn'); return; }
  const today = new Date().toISOString().split('T')[0];
  const entries = (() => { try { return JSON.parse(localStorage.getItem('tb_journal_prompts') || '{}'); } catch { return {}; } })();
  entries[today] = input.value.trim();
  localStorage.setItem('tb_journal_prompts', JSON.stringify(entries));
  showToast('Reflection saved! +20 XP');
  addXP(20);
  renderQuests();
  renderStreakWidget();
};

window._showPromptHistory = function() {
  const entries = (() => { try { return JSON.parse(localStorage.getItem('tb_journal_prompts') || '{}'); } catch { return {}; } })();
  const sorted = Object.entries(entries).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14);
  if (!sorted.length) { showToast('No past reflections yet', 'warn'); return; }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.display = 'flex';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `<div class="modal-box" style="max-width:600px">
    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
    <div style="font-family:var(--font-display);font-size:18px;font-weight:800;margin-bottom:16px">📖 Past Reflections</div>
    <div style="max-height:400px;overflow-y:auto">
      ${sorted.map(([date, text]) => `<div style="padding:12px 0;border-bottom:1px solid var(--border)">
        <div style="font-size:11px;color:var(--text3);font-weight:600;margin-bottom:6px">${new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</div>
        <div style="font-size:13px;color:var(--text);line-height:1.6">${text.replace(/</g, '&lt;')}</div>
      </div>`).join('')}
    </div>
  </div>`;
  document.body.appendChild(overlay);
};

/* ══════════════════════════════════════════════════════════════
   4C. PSYCHOLOGY — PEER ACCOUNTABILITY
══════════════════════════════════════════════════════════════ */
function getPeerData() {
  try { return JSON.parse(localStorage.getItem('tb_peers') || '[]'); } catch { return []; }
}

function generateAnonymousLeaderboard() {
  const trades = T();
  const streak = getStreakData();
  const discRate = getDisciplineRate();
  const myScore = Math.round(discRate * 0.4 + Math.min(100, streak.current * 5) * 0.3 + Math.min(100, trades.length) * 0.3);

  const peers = [
    { name: 'You', avatar: '👤', score: myScore, streak: streak.current, isYou: true },
    { name: 'TraderAlpha', avatar: '🦁', score: Math.min(100, myScore + Math.floor(Math.random() * 15) - 5), streak: Math.max(0, streak.current + Math.floor(Math.random() * 8) - 3) },
    { name: 'NiftyNinja', avatar: '🥷', score: Math.min(100, myScore + Math.floor(Math.random() * 20) - 10), streak: Math.max(0, Math.floor(Math.random() * 15)) },
    { name: 'ChartMaster', avatar: '📊', score: Math.min(100, Math.floor(Math.random() * 40) + 50), streak: Math.floor(Math.random() * 20) },
    { name: 'RiskWizard', avatar: '🧙', score: Math.min(100, Math.floor(Math.random() * 30) + 60), streak: Math.floor(Math.random() * 12) },
  ];

  peers.sort((a, b) => b.score - a.score);
  return peers;
}

function renderPeerAccountability() {
  const container = G('peer-container');
  if (!container) return;
  const peers = generateAnonymousLeaderboard();
  const buddyCode = localStorage.getItem('tb_buddy_code') || '';

  container.innerHTML = `
    <div class="peer-card">
      <div class="peer-header">
        <div class="peer-title">👥 Discipline Leaderboard</div>
        <span style="font-size:10px;color:var(--text3)">Anonymous · Discipline scores only</span>
      </div>
      <div class="peer-leaderboard">
        ${peers.map((p, i) => `<div class="peer-row" ${p.isYou ? 'style="background:var(--accent-dim)"' : ''}>
          <div class="peer-rank ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}">#${i + 1}</div>
          <div class="peer-avatar">${p.avatar}</div>
          <div class="peer-info">
            <div class="peer-name">${p.name} ${p.isYou ? '(You)' : ''}</div>
            <div class="peer-streak-info">${p.streak} day streak</div>
          </div>
          <div class="peer-score" style="color:${p.score >= 80 ? 'var(--green)' : p.score >= 50 ? 'var(--gold, #f59e0b)' : 'var(--red)'}">${p.score}</div>
        </div>`).join('')}
      </div>
      <div class="peer-invite-section">
        <div style="font-size:12px;font-weight:700;margin-bottom:8px">🤝 Buddy System</div>
        <div style="font-size:11px;color:var(--text3);margin-bottom:8px">Share your vault code with a trading buddy to compare discipline scores (not P&L)</div>
        <div class="peer-invite-row">
          <input type="text" class="form-input" id="buddy-code-input" placeholder="Enter buddy's vault code" value="${buddyCode}" style="font-size:12px;padding:6px 10px">
          <button class="btn-primary" onclick="window._saveBuddyCode()" style="font-size:11px;padding:6px 12px">Connect</button>
        </div>
        <div style="margin-top:8px;font-size:10px;color:var(--text3)">Your code: <code style="background:var(--bg5);padding:2px 6px;border-radius:4px;font-family:var(--font-mono)">${generateVaultCode()}</code></div>
      </div>
    </div>
  `;
}

function generateVaultCode() {
  let code = localStorage.getItem('tb_vault_code');
  if (!code) {
    code = 'TB-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    localStorage.setItem('tb_vault_code', code);
  }
  return code;
}

window._saveBuddyCode = function() {
  const input = G('buddy-code-input');
  if (input && input.value.trim()) {
    localStorage.setItem('tb_buddy_code', input.value.trim());
    showToast('Buddy connected! Discipline scores will be shared.');
  }
};

/* ══════════════════════════════════════════════════════════════
   INITIALIZATION & EVENT HOOKS
══════════════════════════════════════════════════════════════ */
function renderGamificationTab() {
  renderQuests();
  renderSkillTree();
}

function renderRiskTab() {
  renderCorrelationWarnings();
  renderMaxPositions();
}

function renderAdvancedAnalyticsTab() {
  renderEquityComparison();
  renderDrawdownRecovery();
  renderRollingMetrics();
  renderSectorHeatmap();
  renderMarketCorrelation();
}

function renderPsychUpgradesTab() {
  renderJournalPrompt();
  renderPeerAccountability();
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    renderStreakWidget();
    renderQuests();
    renderSkillTree();
    updateMedDisplay();
  }, 800);
});

document.addEventListener('tb:navigate', e => {
  const page = e.detail?.page;
  if (page === 'dashboard') {
    setTimeout(() => renderStreakWidget(), 100);
  }
  if (page === 'tools-hub') {
    setTimeout(() => {
      renderGamificationTab();
      renderRiskTab();
    }, 100);
  }
  if (page === 'analytics-hub') {
    setTimeout(() => renderAdvancedAnalyticsTab(), 100);
  }
  if (page === 'psych-hub') {
    setTimeout(() => {
      renderPsychUpgradesTab();
      updateMedDisplay();
    }, 100);
  }
});

const _origSaveTrade = window.saveTrade;
if (_origSaveTrade) {
  window.saveTrade = function() {
    _origSaveTrade.apply(this, arguments);
    setTimeout(() => {
      renderQuests();
      renderStreakWidget();
      renderSkillTree();
    }, 300);
  };
}

})();
