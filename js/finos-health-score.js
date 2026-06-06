/**
 * FIN-OS Financial Health Score Widget
 * Self-contained — drop one <script> tag anywhere (or auto-injected).
 * Renders a floating score card and exposes window._finosHealthScore API.
 *
 * Requires:
 *  - Supabase JS (window.supabase) on the page
 *  - Alert engine running on http://localhost:8001
 */
(function () {
  'use strict';

  const ALERT_API = (['localhost','127.0.0.1','::1'].includes(window.location.hostname)) ? 'http://localhost:8001' : null;
  // Skip API calls when running on production (no local server)

  /* ── CSS ─────────────────────────────────────────────────────────────────── */
  const CSS = `
    /* ── Trigger button (compact pill) ── */
    #finos-hs-trigger {
      position: fixed;
      bottom: 90px;
      right: 28px;
      z-index: 99990;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 6px 14px 6px 10px;
      border-radius: 50px;
      background: var(--bg-surface, #1a2035);
      border: 1.5px solid var(--border-soft, rgba(0,212,255,.18));
      cursor: pointer;
      box-shadow: 0 2px 14px rgba(0,0,0,.25);
      transition: transform .15s ease, box-shadow .15s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      white-space: nowrap;
    }
    #finos-hs-trigger:hover {
      transform: translateY(-2px);
      box-shadow: 0 5px 20px rgba(0,0,0,.32);
    }
    #finos-hs-trigger .hs-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #888;
      flex-shrink: 0;
      transition: background .4s ease;
    }
    #finos-hs-trigger .hs-score-num {
      font-size: 14px;
      font-weight: 800;
      line-height: 1;
      color: var(--text-primary, #e8eef6);
    }
    #finos-hs-trigger .hs-label {
      font-size: 9px;
      font-weight: 700;
      color: var(--text-muted, rgba(150,160,180,.7));
      letter-spacing: .6px;
      text-transform: uppercase;
    }

    /* ── Backdrop ── */
    #finos-hs-backdrop {
      display: none;
      position: fixed;
      inset: 0;
      z-index: 99991;
      background: rgba(0,0,0,.6);
      backdrop-filter: blur(4px);
      opacity: 0;
      transition: opacity .2s ease;
    }
    #finos-hs-backdrop.open  { display: block; }
    #finos-hs-backdrop.vis   { opacity: 1; }

    /* ── Panel ── */
    #finos-hs-panel {
      position: fixed;
      right: 28px;
      bottom: 150px;
      z-index: 99992;
      width: 360px;
      max-height: calc(100vh - 180px);
      overflow-y: auto;
      background: #0b0d12;
      border: 1px solid rgba(0,212,255,.18);
      border-radius: 18px;
      padding: 20px;
      box-shadow: 0 24px 64px rgba(0,0,0,.8), inset 0 1px 0 rgba(255,255,255,.05);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      transform: translateY(16px) scale(.97);
      opacity: 0;
      pointer-events: none;
      transition: transform .24s cubic-bezier(.34,1.56,.64,1), opacity .2s ease;
    }
    #finos-hs-panel.open {
      transform: translateY(0) scale(1);
      opacity: 1;
      pointer-events: all;
    }

    /* ── Panel header ── */
    .hs-hdr {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 18px;
    }
    .hs-hdr-title {
      font-size: 11px;
      font-weight: 700;
      color: rgba(255,255,255,.45);
      letter-spacing: .8px;
      text-transform: uppercase;
    }
    .hs-close {
      background: rgba(255,255,255,.07);
      border: 1px solid rgba(255,255,255,.1);
      border-radius: 7px;
      width: 26px; height: 26px;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; color: rgba(255,255,255,.5); font-size: 14px;
      transition: background .15s;
    }
    .hs-close:hover { background: rgba(255,255,255,.14); color: #fff; }

    /* ── Big score ring ── */
    .hs-ring-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-bottom: 20px;
    }
    .hs-ring-svg { width: 120px; height: 120px; }
    .hs-ring-total {
      font-size: 36px;
      font-weight: 800;
      margin-top: 8px;
      transition: color .4s;
    }
    .hs-ring-tier {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .8px;
      margin-top: 2px;
    }
    .hs-ring-headline {
      font-size: 12px;
      color: rgba(255,255,255,.5);
      margin-top: 6px;
      text-align: center;
      line-height: 1.5;
      max-width: 260px;
    }

    /* ── Pillars ── */
    .hs-pillars { display: flex; flex-direction: column; gap: 10px; }
    .hs-pillar {
      background: rgba(255,255,255,.04);
      border: 1px solid rgba(255,255,255,.07);
      border-radius: 10px;
      padding: 10px 12px;
    }
    .hs-pillar-top {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }
    .hs-pillar-emoji { font-size: 16px; flex-shrink: 0; }
    .hs-pillar-name  { flex: 1; font-size: 12px; font-weight: 600; color: #c8d8e8; }
    .hs-pillar-grade {
      font-size: 11px;
      font-weight: 700;
      font-family: 'IBM Plex Mono', monospace;
    }
    .hs-pillar-score {
      font-size: 11px;
      color: rgba(255,255,255,.35);
      margin-left: 4px;
    }
    .hs-bar-track {
      height: 5px;
      background: rgba(255,255,255,.08);
      border-radius: 10px;
      overflow: hidden;
      margin-bottom: 5px;
    }
    .hs-bar-fill {
      height: 100%;
      border-radius: 10px;
      transition: width .6s cubic-bezier(.34,1.56,.64,1);
    }
    .hs-pillar-headline {
      font-size: 11px;
      color: rgba(255,255,255,.45);
      line-height: 1.4;
    }
    .hs-tip {
      font-size: 10px;
      color: rgba(240,165,0,.85);
      margin-top: 4px;
      padding: 4px 7px;
      background: rgba(240,165,0,.07);
      border-radius: 5px;
      line-height: 1.5;
    }

    /* ── Loading / error ── */
    .hs-loading {
      text-align: center;
      padding: 32px 0;
      color: rgba(255,255,255,.35);
      font-size: 13px;
    }
    .hs-loading .hs-spinner {
      width: 28px; height: 28px;
      border: 3px solid rgba(0,212,255,.15);
      border-top-color: #00d4ff;
      border-radius: 50%;
      animation: hsSpin .7s linear infinite;
      margin: 0 auto 12px;
    }
    @keyframes hsSpin { to { transform: rotate(360deg); } }

    /* ── Refresh row ── */
    .hs-footer {
      margin-top: 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .hs-updated { font-size: 10px; color: rgba(255,255,255,.25); }
    .hs-refresh {
      font-size: 10px;
      font-weight: 600;
      color: rgba(0,212,255,.7);
      cursor: pointer;
      background: none;
      border: none;
      padding: 4px 8px;
      border-radius: 5px;
      transition: background .15s;
    }
    .hs-refresh:hover { background: rgba(0,212,255,.1); color: #00d4ff; }

    /* Mobile */
    @media (max-width: 480px) {
      #finos-hs-panel { right: 0; left: 0; bottom: 0; width: 100%; border-radius: 18px 18px 0 0; }
      #finos-hs-trigger { bottom: 95px; right: 16px; }
    }

    /* ── Light mode overrides ── */
    [data-theme="light"] #finos-hs-trigger {
      box-shadow: 0 2px 10px rgba(0,0,0,.1);
    }
    [data-theme="light"] #finos-hs-trigger:hover {
      box-shadow: 0 5px 16px rgba(0,0,0,.14);
    }
    [data-theme="light"] #finos-hs-panel {
      background: #f4f7fb;
      border-color: rgba(0,100,180,.18);
      box-shadow: 0 20px 60px rgba(0,0,0,.14), inset 0 1px 0 rgba(255,255,255,.8);
    }
    [data-theme="light"] .hs-hdr-title { color: rgba(0,0,0,.5); }
    [data-theme="light"] .hs-close {
      border-color: rgba(0,0,0,.12);
      background: rgba(0,0,0,.05);
      color: rgba(0,0,0,.5);
    }
    [data-theme="light"] .hs-close:hover { background: rgba(0,0,0,.1); color: #0b0d12; }
    [data-theme="light"] .hs-ring-headline { color: rgba(0,0,0,.5); }
    [data-theme="light"] .hs-pillar {
      background: rgba(0,0,0,.03);
      border-color: rgba(0,0,0,.08);
    }
    [data-theme="light"] .hs-pillar-name { color: #2a3a50; }
    [data-theme="light"] .hs-pillar-score { color: rgba(0,0,0,.4); }
    [data-theme="light"] .hs-bar-track { background: rgba(0,0,0,.06); }
    [data-theme="light"] .hs-pillar-headline { color: rgba(0,0,0,.45); }
    [data-theme="light"] .hs-tip {
      color: #b87800;
      background: rgba(240,165,0,.1);
    }
    [data-theme="light"] .hs-loading { color: rgba(0,0,0,.4); }
    [data-theme="light"] .hs-loading .hs-spinner { border-color: rgba(0,100,200,.15); border-top-color: #0078b4; }
    [data-theme="light"] .hs-updated { color: rgba(0,0,0,.3); }
    [data-theme="light"] .hs-refresh { color: rgba(0,100,200,.75); }
    [data-theme="light"] .hs-refresh:hover { background: rgba(0,100,200,.08); color: #0064c8; }
  `;

  /* ── Colour helpers ──────────────────────────────────────────────────────── */
  function tierColor(tier) {
    return { ELITE:'#f0c040', GREAT:'#22d3a6', GOOD:'#00d4ff',
             FAIR:'#f0a500', DANGER:'#f04444' }[tier] || '#888';
  }
  function gradeColor(grade) {
    if (grade === 'A+' || grade === 'A') return '#22d3a6';
    if (grade === 'B')  return '#00d4ff';
    if (grade === 'C')  return '#f0a500';
    return '#f04444';
  }

  /* ── SVG ring builder ────────────────────────────────────────────────────── */
  function buildRing(score, color) {
    const r = 48, cx = 60, cy = 60;
    const circ = 2 * Math.PI * r;
    const dash  = (score / 100) * circ;
    const gap   = circ - dash;
    return `
      <svg viewBox="0 0 120 120" class="hs-ring-svg">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
          stroke="rgba(255,255,255,.08)" stroke-width="9"/>
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
          stroke="${color}" stroke-width="9"
          stroke-linecap="round"
          stroke-dasharray="${dash} ${gap}"
          stroke-dashoffset="${circ / 4}"
          style="transition:stroke-dasharray .8s cubic-bezier(.34,1.56,.64,1)"/>
      </svg>`;
  }

  /* ── Render full panel ───────────────────────────────────────────────────── */
  function render(data) {
    const color = tierColor(data.tier);
    const panel = document.getElementById('finos-hs-panel');
    if (!panel) return;

    panel.innerHTML = `
      <div class="hs-hdr">
        <span class="hs-hdr-title">Financial Health Score</span>
        <button class="hs-close" onclick="window._finosHealthScore.close()">✕</button>
      </div>

      <div class="hs-ring-wrap">
        ${buildRing(data.total, color)}
        <div class="hs-ring-total" style="color:${color}">${data.total}</div>
        <div class="hs-ring-tier"  style="color:${color}">${data.tier_emoji} ${data.tier}</div>
        <div class="hs-ring-headline">${data.headline}</div>
      </div>

      <div class="hs-pillars">
        ${(data.pillars || []).map(p => {
          const barColor = p.pct >= 75 ? '#22d3a6' : p.pct >= 50 ? '#00d4ff' : p.pct >= 30 ? '#f0a500' : '#f04444';
          return `
            <div class="hs-pillar">
              <div class="hs-pillar-top">
                <span class="hs-pillar-emoji">${p.emoji}</span>
                <span class="hs-pillar-name">${p.name}</span>
                <span class="hs-pillar-grade" style="color:${gradeColor(p.grade)}">${p.grade}</span>
                <span class="hs-pillar-score">${p.score}/${p.max_pts}</span>
              </div>
              <div class="hs-bar-track">
                <div class="hs-bar-fill"
                  style="width:${p.pct}%;background:${barColor}"></div>
              </div>
              <div class="hs-pillar-headline">${p.headline}</div>
              ${(p.tips || []).map(t =>
                `<div class="hs-tip">💡 ${t}</div>`
              ).join('')}
            </div>`;
        }).join('')}
      </div>

      <div class="hs-footer">
        <span class="hs-updated">
          Updated ${data.computed_at ? new Date(data.computed_at).toLocaleTimeString('en-IN') : 'just now'}
        </span>
        <button class="hs-refresh" onclick="window._finosHealthScore.refresh()">↻ Refresh</button>
      </div>
    `;

    // Update trigger pill
    const num = document.getElementById('finos-hs-score-num');
    const dot = document.getElementById('finos-hs-dot');
    if (num) num.textContent = data.total;
    if (dot) dot.style.background = color;
  }

  function renderLoading() {
    const panel = document.getElementById('finos-hs-panel');
    if (!panel) return;
    panel.innerHTML = `
      <div class="hs-hdr">
        <span class="hs-hdr-title">Financial Health Score</span>
        <button class="hs-close" onclick="window._finosHealthScore.close()">✕</button>
      </div>
      <div class="hs-loading">
        <div class="hs-spinner"></div>
        Computing your score…
      </div>`;
  }

  function renderError(msg) {
    const panel = document.getElementById('finos-hs-panel');
    if (!panel) return;
    panel.innerHTML = `
      <div class="hs-hdr">
        <span class="hs-hdr-title">Financial Health Score</span>
        <button class="hs-close" onclick="window._finosHealthScore.close()">✕</button>
      </div>
      <div class="hs-loading">⚠️ ${msg || 'Could not compute score — alert engine running?'}</div>`;
  }

  /* ── Core logic ──────────────────────────────────────────────────────────── */
  let _isOpen = false;
  let _lastData = null;

  async function fetchScore(userId) {
    renderLoading();
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 5000); // 5s timeout
    try {
      if (!ALERT_API) { clearTimeout(tid); return; }
      const r = await fetch(`${ALERT_API}/health-score/${userId}`, { signal: controller.signal });
      clearTimeout(tid);
      if (!r.ok) throw new Error(`Server returned ${r.status}`);
      const data = await r.json();
      _lastData = data;
      render(data);
    } catch (e) {
      clearTimeout(tid);
      if (e.name === 'AbortError') {
        renderError('Score engine timed out — is the alert service running?');
      } else {
        renderError(e.message.includes('fetch') ? 'Alert engine offline — run the backend service.' : e.message);
      }
    }
  }

  function openPanel() {
    if (_isOpen) return;
    _isOpen = true; // Set immediately to block rapid double-clicks
    const bd = document.getElementById('finos-hs-backdrop');
    const pn = document.getElementById('finos-hs-panel');
    if (bd) { bd.classList.add('open'); requestAnimationFrame(() => bd.classList.add('vis')); }
    if (pn) pn.classList.add('open');

    // Load score — try API first, fall back to local computation
    const userId = window._finosCurrentUserId || window.FINOS_USER_CONTEXT?.identity?.user_id;
    if (_lastData) {
      render(_lastData);
    } else if (userId && ALERT_API) {
      fetchScore(userId);
    } else {
      // Fully local — no backend needed
      const local = _computeLocalScore();
      _lastData = local;
      render(local);
    }
  }

  function closePanel() {
    if (!_isOpen) return;
    _isOpen = false;
    const bd = document.getElementById('finos-hs-backdrop');
    const pn = document.getElementById('finos-hs-panel');
    if (bd) { bd.classList.remove('vis'); setTimeout(() => bd.classList.remove('open'), 200); }
    if (pn) pn.classList.remove('open');
  }

  async function refreshScore() {
    const userId = window._finosCurrentUserId || window.FINOS_USER_CONTEXT?.identity?.user_id;
    if (!userId) { renderError('Not signed in'); return; }
    _lastData = null;
    fetchScore(userId);
  }

  /* ── Build DOM ───────────────────────────────────────────────────────────── */
  function init() {
    // Guard against double-init (e.g. script injected twice)
    if (document.getElementById('finos-hs-trigger')) return;

    // Inject CSS
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    // Trigger button (sits just above the FIN-OS AI FAB)
    const trigger = document.createElement('div');
    trigger.id = 'finos-hs-trigger';
    trigger.setAttribute('title', 'Financial Health Score');
    trigger.onclick = () => _isOpen ? closePanel() : openPanel();
    trigger.innerHTML = `
      <span class="hs-dot" id="finos-hs-dot"></span>
      <span id="finos-hs-score-num" class="hs-score-num">—</span>
      <span class="hs-label">Health</span>`;
    document.body.appendChild(trigger);

    // Backdrop
    const bd = document.createElement('div');
    bd.id = 'finos-hs-backdrop';
    bd.onclick = closePanel;
    document.body.appendChild(bd);

    // Panel
    const panel = document.createElement('div');
    panel.id = 'finos-hs-panel';
    document.body.appendChild(panel);

    // ESC to close
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });

    // Auto-load summary score for the trigger button (don't open panel)
    window.addEventListener('finos-context-ready', autoLoadSummary);
    window.addEventListener('message', e => {
      if (e.data?.type === 'finos_user_context') autoLoadSummary();
    });

    // If context already exists, load immediately
    if (window.FINOS_USER_CONTEXT?.identity?.user_id) {
      setTimeout(autoLoadSummary, 500);
    }
  }

  async function autoLoadSummary() {
    const userId = window._finosCurrentUserId
      || window.FINOS_USER_CONTEXT?.identity?.user_id;

    // Try API first (when backend is running)
    if (userId && ALERT_API) {
      try {
        const r = await fetch(`${ALERT_API}/health-score/${userId}/summary`);
        if (r.ok) {
          const d = await r.json();
          _applyTriggerDisplay(d.total, d.tier, d.tier_emoji);
          return;
        }
      } catch (_) {}
    }

    // Fallback: compute FIN-OS Score locally from localStorage
    const local = _computeLocalScore();
    _applyTriggerDisplay(local.total, local.tier, local.tier_emoji);
    if (_isOpen) render(local);
  }

  function _applyTriggerDisplay(total, tier, tierEmoji) {
    const color = { ELITE:'#f0c040', GREAT:'#22d3a6', GOOD:'#00d4ff',
                    FAIR:'#f0a500', DANGER:'#f04444' }[tier] || '#888';
    const num = document.getElementById('finos-hs-score-num');
    const dot = document.getElementById('finos-hs-dot');
    if (num) num.textContent = total;
    if (dot) { dot.style.background = color; dot.style.boxShadow = `0 0 6px ${color}88`; }
  }

  /* ── LOCAL FIN-OS SCORE COMPUTATION ──────────────────────────────────────
     Works 100% offline — reads from localStorage. No backend required.
     7 behavioral wealth dimensions, max 100 pts each → total /100.
  ──────────────────────────────────────────────────────────────────────── */
  function _computeLocalScore() {
    function safeNum(key, fallback) { return Number(localStorage.getItem(key)) || fallback || 0; }
    function safeJSON(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback; } catch { return fallback; } }

    const income        = safeNum('finos_income', 60000);
    const netWorth      = safeNum('finos_net_worth', 0);
    // Also pull from live context if available (Supabase data > localStorage)
    const ctx         = window.FINOS_USER_CONTEXT;
    const bt          = ctx?.budget_tracker || {};
    const prof        = ctx?.profile || {};

    const savingsRate = bt.savings_rate      || safeNum('finos_savings_rate', 0);
    const efRaw       = safeNum('finos_emergency_fund', 0);
    const efMonths    = efRaw / Math.max(1, income);
    const streak      = safeJSON('finos_streak', {}).count || ctx?.engagement?.streak_days || 0;
    const goals       = safeJSON('finos_goals', []);
    const transactions= safeJSON('finos_transactions', []);
    const dna         = safeJSON('FINOS_CORE_DNA', {});
    const learned     = safeJSON('finos_learned_modules', []);
    const tradeStats  = ctx?.trade_journal || safeJSON('finos_trade_stats', {});
    const primaryBias = localStorage.getItem('finos_primary_bias') || '';

    // User's own savings target (from settings or default 25%)
    const sysSettings    = safeJSON('FINOS_SYS_SETTINGS', {});
    const savingsTarget  = sysSettings.savingsTarget || 25; // user can set target in settings

    // ── 1. Savings Discipline (20 pts) — scored against user's own target ──
    const savingsPts = savingsRate >= savingsTarget
      ? 20
      : Math.min(19, Math.round((savingsRate / savingsTarget) * 20));

    // ── 2. Emergency Fund Coverage (15 pts) ────────────────────────────────
    // Target: 6 months (SEBI/RBI standard)
    const efPts = efMonths >= 6 ? 15 : efMonths >= 4 ? 12 : efMonths >= 3 ? 9 : efMonths >= 1 ? 4 : 0;

    // ── 3. Goal Adherence (15 pts) ─────────────────────────────────────────
    let goalPts = 0;
    const allGoals = goals.length ? goals : (ctx?.financial?.goals || []);
    if (allGoals.length > 0) {
      const avgProgress = allGoals.reduce((s, g) => s + (Number(g.progress) || Number(g.current) / Math.max(1, Number(g.target)) * 100), 0) / allGoals.length;
      goalPts = Math.min(15, Math.round(avgProgress * 0.15));
    } else {
      goalPts = 0; // 0 = no goals set — user must set goals to score here
    }

    // ── 4. Behavioral Score (15 pts) ───────────────────────────────────────
    const biasPenalties = { loss_aversion: 4, overconfidence: 5, herd_mentality: 4, recency_bias: 3, sunk_cost: 3, anchoring: 2, confirmation_bias: 2 };
    const biasPenalty = biasPenalties[primaryBias] || 0;
    const dnaScores = dna.scores || [50, 50, 50, 50, 50];
    const disciplineScore = dnaScores[3] || 50; // Financial Discipline dimension
    const behaviorPts = Math.max(0, Math.min(15, Math.round(disciplineScore * 0.15) - biasPenalty));

    // ── 5. Wealth Building (15 pts) ────────────────────────────────────────
    const annualIncome = income * 12;
    const wealthRatio = annualIncome > 0 ? netWorth / annualIncome : 0;
    const wealthPts = Math.min(15, Math.round(wealthRatio * 3)); // 5× income = 15 pts

    // ── 6. Knowledge & Engagement (10 pts) ─────────────────────────────────
    const moduleCount = Array.isArray(learned) ? learned.length : 0;
    const knowledgePts = Math.min(6, Math.floor(moduleCount * 0.43)); // 14 modules = 6 pts
    const streakPts = streak >= 30 ? 4 : streak >= 14 ? 3 : streak >= 7 ? 2 : streak >= 3 ? 1 : 0;
    const engagePts = knowledgePts + streakPts;

    // ── 7. Spending Awareness (10 pts) ─────────────────────────────────────
    const recentTxns = transactions.filter(t => {
      const d = new Date(t.date || t.timestamp || 0);
      return (Date.now() - d) < 30 * 24 * 3600 * 1000; // last 30 days
    });
    const spendingPts = recentTxns.length > 10 ? 10 : recentTxns.length > 4 ? 7 : recentTxns.length > 0 ? 4 : 0;

    const total = savingsPts + efPts + goalPts + behaviorPts + wealthPts + engagePts + spendingPts;
    const tier = total >= 80 ? 'ELITE' : total >= 65 ? 'GREAT' : total >= 50 ? 'GOOD' : total >= 35 ? 'FAIR' : 'DANGER';
    const tierEmoji = { ELITE:'🏆', GREAT:'🌟', GOOD:'✅', FAIR:'⚠️', DANGER:'🚨' }[tier];
    const headline = {
      ELITE: 'Exceptional wealth behavior — top 10% of Indian investors',
      GREAT: 'Strong financial discipline — keep building momentum',
      GOOD:  'Solid foundation — a few tweaks can make a big difference',
      FAIR:  'Room to grow — focus on savings rate and emergency fund',
      DANGER:'Critical gaps — start with emergency fund this month',
    }[tier];

    const pillars = [
      { name:'Savings Discipline', emoji:'💰', score:savingsPts, max_pts:20, pct:Math.round(savingsPts/20*100), grade: savingsPts>=16?'A+':savingsPts>=12?'A':savingsPts>=8?'B':savingsPts>=4?'C':'D',
        headline: savingsRate >= 25 ? 'Excellent savings rate!' : savingsRate >= 15 ? 'Good — push towards 25%' : 'Savings rate needs attention',
        tips: savingsRate < 20 ? ['Automate SIP before expenses — pay yourself first'] : [] },
      { name:'Emergency Fund', emoji:'🛡️', score:efPts, max_pts:15, pct:Math.round(efPts/15*100), grade: efMonths>=6?'A+':efMonths>=3?'B':efMonths>=1?'C':'D',
        headline: efMonths >= 6 ? 'Full 6-month cover — excellent!' : `${efMonths.toFixed(1)} months coverage — target 6`,
        tips: efMonths < 3 ? ['Build emergency fund to 3 months before increasing investments'] : [] },
      { name:'Goal Adherence', emoji:'🎯', score:goalPts, max_pts:15, pct:Math.round(goalPts/15*100), grade: goalPts>=12?'A':goalPts>=9?'B':goalPts>=5?'C':'D',
        headline: goals.length === 0 ? 'Set financial goals to track progress' : `${goals.length} goals tracked`,
        tips: goals.length === 0 ? ['Add your first financial goal in Track → Goals'] : [] },
      { name:'Behavioral Score', emoji:'🧠', score:behaviorPts, max_pts:15, pct:Math.round(behaviorPts/15*100), grade: behaviorPts>=12?'A':behaviorPts>=9?'B':behaviorPts>=5?'C':'D',
        headline: primaryBias ? `Primary bias: ${primaryBias.replace(/_/g,' ')}` : 'Take DNA quiz to detect biases',
        tips: primaryBias ? [`Work on ${primaryBias.replace(/_/g,' ')} — biggest wealth leak`] : [] },
      { name:'Wealth Building', emoji:'📈', score:wealthPts, max_pts:15, pct:Math.round(wealthPts/15*100), grade: wealthRatio>=5?'A+':wealthRatio>=3?'A':wealthRatio>=1?'B':wealthRatio>=0.5?'C':'D',
        headline: netWorth > 0 ? `${wealthRatio.toFixed(1)}× annual income in net worth` : 'Start building net worth',
        tips: wealthRatio < 2 ? ['Target: net worth = 5× your annual income by 40'] : [] },
      { name:'Knowledge & Engagement', emoji:'📚', score:engagePts, max_pts:10, pct:Math.round(engagePts/10*100), grade: engagePts>=8?'A':engagePts>=6?'B':engagePts>=3?'C':'D',
        headline: `${moduleCount} modules · ${streak} day streak`,
        tips: moduleCount < 5 ? ['Complete 5 learning modules to unlock personalized insights'] : [] },
      { name:'Spending Awareness', emoji:'🔍', score:spendingPts, max_pts:10, pct:Math.round(spendingPts/10*100), grade: spendingPts>=8?'A':spendingPts>=5?'B':spendingPts>=3?'C':'D',
        headline: recentTxns.length > 0 ? `${recentTxns.length} transactions logged this month` : 'No spending data — start tracking',
        tips: recentTxns.length < 5 ? ['Log expenses daily — awareness is the first step to control'] : [] },
    ];

    const result = { total, tier, tier_emoji: tierEmoji, headline, pillars, computed_at: new Date().toISOString(), source: 'local' };
    // Persist so finos-context.js can include score in Arya's context
    try {
      localStorage.setItem('finos_health_score', String(total));
      localStorage.setItem('finos_health_score_detail', JSON.stringify({ total, tier, headline }));
    } catch {}
    return result;
  }

  /* ── Expose public API ───────────────────────────────────────────────────── */
  window._finosHealthScore = {
    open:    openPanel,
    close:   closePanel,
    refresh: refreshScore,
    fetch:   fetchScore,
  };

  /* ── Boot ────────────────────────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
