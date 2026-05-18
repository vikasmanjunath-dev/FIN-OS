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

  const ALERT_API = 'http://localhost:8001';

  /* ── CSS ─────────────────────────────────────────────────────────────────── */
  const CSS = `
    /* ── Trigger button ── */
    #finos-hs-trigger {
      position: fixed;
      bottom: 90px;
      right: 28px;
      z-index: 99990;
      background: linear-gradient(135deg,#0c1628,#162540);
      border: 1px solid rgba(0,212,255,.25);
      border-radius: 14px;
      padding: 8px 14px 8px 10px;
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      box-shadow: 0 4px 20px rgba(0,0,0,.5);
      transition: transform .15s ease, box-shadow .15s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    #finos-hs-trigger:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 28px rgba(0,0,0,.6);
    }
    #finos-hs-trigger .hs-score-num {
      font-size: 18px;
      font-weight: 800;
      line-height: 1;
      transition: color .4s ease;
    }
    #finos-hs-trigger .hs-label {
      font-size: 9px;
      font-weight: 700;
      color: rgba(255,255,255,.45);
      letter-spacing: .6px;
      line-height: 1;
      margin-top: 1px;
    }
    #finos-hs-trigger .hs-tier-badge {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: .4px;
      padding: 2px 6px;
      border-radius: 5px;
      line-height: 1.4;
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

    // Update trigger button
    const num  = document.getElementById('finos-hs-score-num');
    const tier = document.getElementById('finos-hs-tier-badge');
    if (num)  { num.textContent = data.total; num.style.color = color; }
    if (tier) {
      tier.textContent = `${data.tier_emoji} ${data.tier}`;
      tier.style.background = color + '22';
      tier.style.color = color;
    }
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
    try {
      const r = await fetch(`${ALERT_API}/health-score/${userId}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      _lastData = data;
      render(data);
    } catch (e) {
      renderError(e.message);
    }
  }

  function openPanel() {
    if (_isOpen) return;
    _isOpen = true;
    const bd = document.getElementById('finos-hs-backdrop');
    const pn = document.getElementById('finos-hs-panel');
    if (bd) { bd.classList.add('open'); requestAnimationFrame(() => bd.classList.add('vis')); }
    if (pn) pn.classList.add('open');

    // Load score if we have a user
    const userId = window._finosCurrentUserId || window.FINOS_USER_CONTEXT?.identity?.user_id;
    if (userId && !_lastData) {
      fetchScore(userId);
    } else if (_lastData) {
      render(_lastData);
    } else {
      renderError('Sign in to see your score');
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
      <div style="display:flex;flex-direction:column;align-items:center;line-height:1">
        <span id="finos-hs-score-num" class="hs-score-num" style="color:#888">—</span>
        <span class="hs-label">HEALTH</span>
      </div>
      <div id="finos-hs-tier-badge" class="hs-tier-badge"
           style="background:rgba(255,255,255,.07);color:rgba(255,255,255,.4)">
        SCORE
      </div>`;
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
    if (!userId) return;

    try {
      const r = await fetch(`${ALERT_API}/health-score/${userId}/summary`);
      if (!r.ok) return;
      const d = await r.json();
      const color = { ELITE:'#f0c040', GREAT:'#22d3a6', GOOD:'#00d4ff',
                      FAIR:'#f0a500', DANGER:'#f04444' }[d.tier] || '#888';
      const num   = document.getElementById('finos-hs-score-num');
      const badge = document.getElementById('finos-hs-tier-badge');
      if (num)   { num.textContent = d.total; num.style.color = color; }
      if (badge) {
        badge.textContent = `${d.tier_emoji} ${d.tier}`;
        badge.style.background = color + '22';
        badge.style.color = color;
      }
    } catch (_) {}  // silently fail — engine may not be running
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
