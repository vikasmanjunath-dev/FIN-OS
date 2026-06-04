/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║  FIN-OS Alert Center  v1                                       ║
 * ║  Drop this script on any page. Zero dependencies.              ║
 * ║                                                                 ║
 * ║  What it does:                                                  ║
 * ║  • Subscribes the browser to Web Push notifications             ║
 * ║  • Injects a live bell icon into the nav with unread badge      ║
 * ║  • Opens a slide-out drawer with all your financial alerts      ║
 * ║  • Syncs with Supabase Realtime — new alerts appear instantly   ║
 * ║  • Marks alerts read when opened                                ║
 * ║  • Deep-links to the relevant FIN-OS page from each alert       ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */
(function FinosAlerts() {
  'use strict';

  /* ── Config ──────────────────────────────────────────────────────────── */
  // ALERT_API only works when the local Python server is running.
  // On production (Vercel) it gracefully degrades to Supabase-only alerts.
  const IS_LOCAL  = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  const ALERT_API = IS_LOCAL ? 'http://localhost:8001' : null;

  // Use the centralised config if available, fall back to inline values.
  const SUPABASE_URL = (window.FINOS_SB && window.FINOS_SB.url)
    ? window.FINOS_SB.url
    : 'https://oeapcyucnduhwpgxfknb.supabase.co';
  const SUPABASE_KEY = (window.FINOS_SB && window.FINOS_SB.key)
    ? window.FINOS_SB.key
    : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lYXBjeXVjbmR1aHdwZ3hma25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNjE1NjgsImV4cCI6MjA4MzgzNzU2OH0.kyuz385hM4X3j8CMBFfI83ZerorvlXrUDOipAHKDC7Q';

  /* ── State ──────────────────────────────────────────────────────────── */
  let _userId      = null;
  let _alerts      = [];
  let _unread      = 0;
  let _drawerOpen  = false;
  let _realtimeSub = null;

  /* ── Priority config ─────────────────────────────────────────────────── */
  const PRIORITY = {
    critical:    { color: '#f04444', bg: 'rgba(240,68,68,.12)',    icon: '🚨', label: 'Critical'    },
    warning:     { color: '#f0a500', bg: 'rgba(240,165,0,.12)',    icon: '⚠️',  label: 'Warning'     },
    info:        { color: '#00d4ff', bg: 'rgba(0,212,255,.10)',    icon: '💡', label: 'Info'        },
    celebration: { color: '#22d3a6', bg: 'rgba(34,211,166,.12)',   icon: '🎉', label: 'Celebration' },
  };

  /* ── CSS injection ───────────────────────────────────────────────────── */
  const css = `
    /* Bell button */
    #finos-alert-bell {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 38px;
      height: 38px;
      border-radius: 10px;
      border: 1px solid rgba(0,212,255,.2);
      background: rgba(0,212,255,.05);
      cursor: pointer;
      transition: border-color .2s, background .2s, transform .15s;
      flex-shrink: 0;
      margin-right: 4px;
    }
    #finos-alert-bell:hover {
      border-color: rgba(0,212,255,.5);
      background: rgba(0,212,255,.12);
      transform: translateY(-1px);
    }
    #finos-alert-bell svg { width: 17px; height: 17px; fill: #00d4ff; }
    #finos-alert-badge {
      position: absolute;
      top: -5px; right: -5px;
      min-width: 17px; height: 17px;
      background: #f04444;
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      border: 2px solid var(--bg, #0b0d12);
      padding: 0 3px;
      animation: bellPop .3s cubic-bezier(.34,1.56,.64,1);
    }
    @keyframes bellPop { from { transform: scale(0); } to { transform: scale(1); } }
    #finos-alert-bell.shake { animation: bellShake .5s ease; }
    @keyframes bellShake {
      0%,100% { transform: rotate(0); }
      20%      { transform: rotate(-12deg); }
      40%      { transform: rotate(12deg); }
      60%      { transform: rotate(-8deg); }
      80%      { transform: rotate(8deg); }
    }

    /* Backdrop */
    #finos-alert-backdrop {
      display: none;
      position: fixed; inset: 0;
      z-index: 99990;
      background: rgba(0,0,0,.45);
      backdrop-filter: blur(3px);
      opacity: 0;
      transition: opacity .2s;
    }
    #finos-alert-backdrop.open { display: block; }
    #finos-alert-backdrop.visible { opacity: 1; }

    /* Drawer */
    #finos-alert-drawer {
      position: fixed;
      top: 0; right: -420px;
      width: 400px;
      max-width: 100vw;
      height: 100vh;
      z-index: 99991;
      background: #080f1c;
      border-left: 1px solid rgba(0,212,255,.15);
      box-shadow: -20px 0 60px rgba(0,0,0,.6);
      display: flex;
      flex-direction: column;
      transition: right .28s cubic-bezier(.22,1,.36,1);
      font-family: -apple-system, BlinkMacSystemFont, 'Outfit', 'Segoe UI', sans-serif;
    }
    #finos-alert-drawer.open { right: 0; }

    /* Drawer header */
    .fad-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 18px 18px 14px;
      border-bottom: 1px solid rgba(0,212,255,.1);
      background: rgba(0,212,255,.04);
      flex-shrink: 0;
    }
    .fad-title {
      flex: 1;
      font-size: 15px;
      font-weight: 700;
      color: #00d4ff;
      letter-spacing: .5px;
    }
    .fad-subtitle {
      font-size: 11px;
      color: rgba(255,255,255,.35);
      letter-spacing: .2px;
      margin-top: 1px;
    }
    .fad-close {
      width: 28px; height: 28px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,.1);
      background: rgba(255,255,255,.06);
      color: rgba(255,255,255,.5);
      font-size: 15px;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background .15s, color .15s;
    }
    .fad-close:hover { background: rgba(255,255,255,.14); color: #fff; }
    .fad-mark-all {
      font-size: 11px; color: rgba(0,212,255,.7);
      border: none; background: none;
      cursor: pointer; padding: 4px 8px; border-radius: 6px;
      transition: color .15s, background .15s;
      white-space: nowrap;
    }
    .fad-mark-all:hover { color: #00d4ff; background: rgba(0,212,255,.08); }

    /* Alert list */
    .fad-list {
      flex: 1;
      overflow-y: auto;
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .fad-list::-webkit-scrollbar { width: 3px; }
    .fad-list::-webkit-scrollbar-thumb { background: rgba(0,212,255,.2); border-radius: 3px; }

    /* Empty state */
    .fad-empty {
      text-align: center;
      padding: 60px 20px;
      color: rgba(255,255,255,.3);
      font-size: 13px;
      line-height: 1.7;
    }
    .fad-empty-icon { font-size: 40px; margin-bottom: 12px; }

    /* Alert card */
    .fad-card {
      border-radius: 12px;
      padding: 12px 14px;
      cursor: pointer;
      transition: transform .15s, opacity .2s;
      border: 1px solid transparent;
      position: relative;
      animation: cardSlide .3s ease;
    }
    @keyframes cardSlide { from { opacity:0; transform: translateX(20px); } to { opacity:1; transform: none; } }
    .fad-card:hover { transform: translateX(-3px); }
    .fad-card.read { opacity: .55; }
    .fad-card-top {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin-bottom: 5px;
    }
    .fad-card-icon { font-size: 18px; flex-shrink: 0; margin-top: 1px; }
    .fad-card-title {
      flex: 1;
      font-size: 13px;
      font-weight: 700;
      color: #e8f4ff;
      line-height: 1.4;
    }
    .fad-card-time {
      font-size: 10px;
      color: rgba(255,255,255,.3);
      white-space: nowrap;
      flex-shrink: 0;
    }
    .fad-card-msg {
      font-size: 12px;
      color: rgba(200,216,232,.7);
      line-height: 1.6;
      padding-left: 26px;
    }
    .fad-card-action {
      display: inline-block;
      margin-top: 8px;
      margin-left: 26px;
      font-size: 11px;
      font-weight: 600;
      padding: 4px 12px;
      border-radius: 20px;
      border: 1px solid transparent;
      text-decoration: none;
      transition: background .15s, color .15s;
    }
    .fad-unread-dot {
      position: absolute;
      top: 10px; right: 10px;
      width: 7px; height: 7px;
      border-radius: 50%;
      background: #00d4ff;
    }

    /* Priority tabs */
    .fad-tabs {
      display: flex;
      gap: 4px;
      padding: 8px 12px 4px;
      flex-shrink: 0;
    }
    .fad-tab {
      font-size: 11px;
      padding: 4px 10px;
      border-radius: 20px;
      border: 1px solid rgba(255,255,255,.1);
      background: transparent;
      color: rgba(255,255,255,.4);
      cursor: pointer;
      transition: all .15s;
    }
    .fad-tab.active {
      background: rgba(0,212,255,.12);
      border-color: rgba(0,212,255,.4);
      color: #00d4ff;
    }

    /* Settings link */
    .fad-footer {
      padding: 12px 16px;
      border-top: 1px solid rgba(255,255,255,.06);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    .fad-settings-link {
      font-size: 11px; color: rgba(255,255,255,.35);
      text-decoration: none;
      transition: color .15s;
    }
    .fad-settings-link:hover { color: rgba(0,212,255,.7); }
    .fad-push-status { font-size: 11px; color: rgba(255,255,255,.25); }

    /* ── Light mode — comprehensive overrides ── */
    [data-theme="light"] #finos-alert-bell {
      background: rgba(0,120,180,.08);
      border-color: rgba(0,120,180,.25);
    }
    [data-theme="light"] #finos-alert-bell:hover {
      border-color: rgba(0,120,180,.55);
      background: rgba(0,120,180,.14);
    }
    [data-theme="light"] #finos-alert-bell svg { fill: #0078b4; }

    /* Drawer surface */
    [data-theme="light"] #finos-alert-drawer {
      background: #f4f7fb;
      border-left-color: rgba(0,100,180,.18);
      box-shadow: -12px 0 40px rgba(0,0,0,.12);
    }

    /* Drawer header */
    [data-theme="light"] .fad-header {
      background: rgba(0,100,180,.04);
      border-bottom-color: rgba(0,100,180,.1);
    }
    [data-theme="light"] .fad-title  { color: #0078b4; }
    [data-theme="light"] .fad-subtitle { color: rgba(0,0,0,.45); }
    [data-theme="light"] .fad-mark-all { color: rgba(0,100,200,.75); }
    [data-theme="light"] .fad-mark-all:hover {
      color: #0064c8;
      background: rgba(0,100,200,.07);
    }
    [data-theme="light"] .fad-close {
      border-color: rgba(0,0,0,.12);
      background: rgba(0,0,0,.05);
      color: rgba(0,0,0,.5);
    }
    [data-theme="light"] .fad-close:hover {
      background: rgba(0,0,0,.1);
      color: #0b0d12;
    }

    /* Filter tabs */
    [data-theme="light"] .fad-tab {
      border-color: rgba(0,0,0,.12);
      color: rgba(0,0,0,.5);
      background: transparent;
    }
    [data-theme="light"] .fad-tab:hover {
      background: rgba(0,100,200,.06);
      border-color: rgba(0,100,200,.3);
      color: #0064c8;
    }
    [data-theme="light"] .fad-tab.active {
      background: rgba(0,100,200,.1);
      border-color: rgba(0,100,200,.4);
      color: #0064c8;
    }

    /* Alert cards */
    [data-theme="light"] .fad-card-title { color: #0b1c30; }
    [data-theme="light"] .fad-card-msg   { color: rgba(20,40,65,.72); }
    [data-theme="light"] .fad-card-time  { color: rgba(0,0,0,.35); }
    [data-theme="light"] .fad-unread-dot { background: #0078b4; }

    /* Empty state */
    [data-theme="light"] .fad-empty       { color: rgba(0,0,0,.4); }
    [data-theme="light"] .fad-empty-icon  { opacity: .7; }

    /* Scrollbar */
    [data-theme="light"] .fad-list::-webkit-scrollbar-thumb {
      background: rgba(0,100,200,.18);
    }

    /* Footer */
    [data-theme="light"] .fad-footer {
      border-top-color: rgba(0,0,0,.08);
    }
    [data-theme="light"] .fad-settings-link { color: rgba(0,0,0,.38); }
    [data-theme="light"] .fad-settings-link:hover { color: #0064c8; }
    [data-theme="light"] .fad-push-status { color: rgba(0,0,0,.28); }

    @media (max-width: 480px) {
      #finos-alert-drawer { width: 100vw; }
    }
  `;
  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ── Build DOM ─────────────────────────────────────────────────────────── */
  // Bell button
  const bell = document.createElement('button');
  bell.id = 'finos-alert-bell';
  bell.setAttribute('aria-label', 'FIN-OS Alerts');
  bell.innerHTML = `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 22a2 2 0 0 0 2-2H10a2 2 0 0 0 2 2zm6-6V11a6 6 0 0 0-5-5.91V4a1 1 0 0 0-2 0v1.09A6 6 0 0 0 6 11v5l-1.3 1.3A1 1 0 0 0 5 19h14a1 1 0 0 0 .7-1.7L18 16z"/>
    </svg>
  `;

  // Backdrop
  const backdrop = document.createElement('div');
  backdrop.id = 'finos-alert-backdrop';

  // Drawer
  const drawer = document.createElement('div');
  drawer.id = 'finos-alert-drawer';
  drawer.innerHTML = `
    <div class="fad-header">
      <div>
        <div class="fad-title">🔔 FIN-OS Alerts</div>
        <div class="fad-subtitle" id="fad-subtitle">Loading…</div>
      </div>
      <button class="fad-mark-all" id="fad-mark-all" onclick="window._finosAlerts.markAllRead()">Mark all read</button>
      <button class="fad-close" id="fad-close" aria-label="Close">✕</button>
    </div>

    <div class="fad-tabs" id="fad-tabs">
      <button class="fad-tab active" data-filter="all">All</button>
      <button class="fad-tab" data-filter="unread">Unread</button>
      <button class="fad-tab" data-filter="critical">🚨 Critical</button>
      <button class="fad-tab" data-filter="celebration">🎉 Good News</button>
    </div>

    <div class="fad-list" id="fad-list">
      <div class="fad-empty">
        <div class="fad-empty-icon">🔔</div>
        Loading alerts…
      </div>
    </div>

    <div class="fad-footer">
      <a class="fad-settings-link" href="../html/settings.html">⚙️ Alert Settings</a>
      <span class="fad-push-status" id="fad-push-status"></span>
    </div>
  `;

  document.body.appendChild(backdrop);
  document.body.appendChild(drawer);

  /* ── Inject bell into header ──────────────────────────────────────────────── */
  function injectBell() {
    // Guard: only inject once per page
    if (document.getElementById('finos-alert-bell')) return;

    // 1. Standard pages: bundle search + bell + theme in one right-side group
    const toggle = document.getElementById('themeToggle');
    if (toggle && toggle.parentNode) {
      let group = document.getElementById('finos-header-actions');
      if (!group) {
        group = document.createElement('div');
        group.id = 'finos-header-actions';
        group.style.cssText = 'display:flex;align-items:center;gap:8px;flex-shrink:0;';
        toggle.parentNode.insertBefore(group, toggle);
        group.appendChild(toggle);
      }
      // Bell goes just before themeToggle (to the left of it, right of search)
      group.insertBefore(bell, toggle);
      return;
    }

    // 2. Pages with a floating fixed theme button (#floatThemeBtn):
    //    create / reuse a shared controls bar to the left of it
    const floatBtn = document.getElementById('floatThemeBtn');
    if (floatBtn) {
      let bar = document.getElementById('finos-fixed-controls');
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'finos-fixed-controls';
        bar.style.cssText = 'position:fixed;top:14px;right:62px;z-index:9900;display:flex;align-items:center;gap:8px;';
        document.body.appendChild(bar);
      }
      bar.appendChild(bell);  // bell goes after search (rightmost in bar)
      return;
    }

    // 3. Safe named containers only (nav & bare header excluded)
    const containerSelectors = [
      '.nav-actions',
      '.header-flex',
      '.nav-right',
      '.topbar-r',
      '.navbar-right',
    ];
    for (const sel of containerSelectors) {
      const target = document.querySelector(sel);
      if (target) {
        target.appendChild(bell);
        return;
      }
    }

    // 4. Fixed-position fallback: top-right corner
    bell.style.cssText = 'position:fixed;top:14px;right:70px;z-index:99985;';
    document.body.appendChild(bell);
  }

  /* ── Time formatter ─────────────────────────────────────────────────────── */
  function timeAgo(iso) {
    const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (diff < 60)     return 'just now';
    if (diff < 3600)   return `${Math.floor(diff/60)}m ago`;
    if (diff < 86400)  return `${Math.floor(diff/3600)}h ago`;
    return `${Math.floor(diff/86400)}d ago`;
  }

  /* ── Render alerts ─────────────────────────────────────────────────────── */
  let _activeFilter = 'all';

  function renderAlerts() {
    const list = document.getElementById('fad-list');
    if (!list) return;

    let filtered = _alerts;
    if (_activeFilter === 'unread')     filtered = _alerts.filter(a => !a.read);
    if (_activeFilter === 'critical')   filtered = _alerts.filter(a => a.priority === 'critical');
    if (_activeFilter === 'celebration')filtered = _alerts.filter(a => a.priority === 'celebration');

    if (!filtered.length) {
      list.innerHTML = `
        <div class="fad-empty">
          <div class="fad-empty-icon">${_activeFilter === 'all' ? '✅' : '🔍'}</div>
          ${_activeFilter === 'all'
            ? 'Sab thik hai! Koi urgent alert nahi hai.<br><small>FIN-OS continuously monitors your finances.</small>'
            : `No ${_activeFilter} alerts`}
        </div>`;
      return;
    }

    list.innerHTML = filtered.map(a => {
      const p      = PRIORITY[a.priority] || PRIORITY.info;
      const isRead = a.read;
      const isMilestone = a.rule_id === 'NETWORTH_MILESTONE' && a.priority === 'celebration';

      // Build milestone share button if applicable
      const shareBtn = isMilestone ? (() => {
        const milestoneKey = _extractMilestoneKey(a.data);
        return milestoneKey
          ? `<button class="fad-card-action"
               style="border-color:#22d3a655;color:#22d3a6;background:rgba(34,211,166,.1);margin-left:6px;"
               onclick="event.stopPropagation();_finosShowMilestoneShare('${milestoneKey}')">
               🎉 Share
             </button>`
          : '';
      })() : '';

      return `
        <div class="fad-card${isRead ? ' read' : ''}"
             style="background:${p.bg};border-color:${p.color}22;"
             data-id="${a.id}"
             onclick="window._finosAlerts.openAlert('${a.id}','${a.action_url || ''}')">
          ${!isRead ? '<div class="fad-unread-dot"></div>' : ''}
          <div class="fad-card-top">
            <span class="fad-card-icon">${p.icon}</span>
            <span class="fad-card-title">${escHtml(a.title)}</span>
            <span class="fad-card-time">${timeAgo(a.created_at)}</span>
          </div>
          <div class="fad-card-msg">${escHtml(a.message)}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
            ${a.action_url
              ? `<a class="fad-card-action" href="${a.action_url}"
                    style="border-color:${p.color}55;color:${p.color};background:${p.bg}"
                    onclick="event.stopPropagation()">
                  ${escHtml(a.action_label || 'Details →')}
                 </a>`
              : ''}
            ${shareBtn}
          </div>
        </div>`;
    }).join('');

    // Update subtitle
    const sub = document.getElementById('fad-subtitle');
    if (sub) sub.textContent = `${_unread} unread  ·  ${_alerts.length} total`;
  }

  function updateBadge() {
    let badge = document.getElementById('finos-alert-badge');
    if (_unread > 0) {
      if (!badge) {
        badge = document.createElement('div');
        badge.id = 'finos-alert-badge';
        bell.appendChild(badge);
      }
      badge.textContent = _unread > 99 ? '99+' : _unread;
      // Shake the bell on new alerts
      bell.classList.remove('shake');
      void bell.offsetWidth;
      bell.classList.add('shake');
      setTimeout(() => bell.classList.remove('shake'), 600);
    } else if (badge) {
      badge.remove();
    }
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /** Extract milestone key (e.g. '1L', '1CR') from alert data payload. */
  function _extractMilestoneKey(data) {
    if (!data) return null;

    // 1. Prefer explicit milestone_key field added in rules.py v2
    const directKey = String(data.milestone_key || '').toUpperCase();
    if (['1L','5L','10L','25L','50L','1CR','5CR'].includes(directKey)) return directKey;

    // 2. Numeric milestone value → key map (rules.py stores numeric: 100000 = 1L)
    const numericMap = {
      '100000':   '1L',
      '500000':   '5L',
      '1000000':  '10L',
      '2500000':  '25L',
      '5000000':  '50L',
      '10000000': '1CR',
      '50000000': '5CR',
    };
    const numVal = String(data.milestone || data.milestone_value || data.current_nw || '');
    if (numericMap[numVal]) return numericMap[numVal];

    // 3. Label string fallback: "₹1 Lakh" → "1L"
    const labelMap = {
      '₹1 LAKH': '1L', '₹5 LAKH': '5L', '₹10 LAKH': '10L',
      '₹25 LAKH': '25L', '₹50 LAKH': '50L', '₹1 CRORE': '1CR', '₹5 CRORE': '5CR',
    };
    const labelVal = String(data.label || '').toUpperCase();
    return labelMap[labelVal] || null;
  }

  /** Trigger ShareCard modal for a milestone. Falls back gracefully. */
  window._finosShowMilestoneShare = function(milestoneKey) {
    if (typeof ShareCard !== 'undefined' && ShareCard.showShareModal) {
      const ctx = window.FINOS_USER_CONTEXT || {};
      const budget = ctx.budget_tracker || {};
      ShareCard.showShareModal(milestoneKey, {
        savingsRate: budget.savings_rate || '--',
        healthScore: ctx.profile?.health_score || '--',
        healthTier:  ctx.profile?.health_tier  || 'GOOD',
        userName:    ctx.identity?.name || '',
      });
    } else {
      // Load share-card.js dynamically if not already present
      const s = document.createElement('script');
      s.src = '/js/share-card.js';
      s.onload = () => window._finosShowMilestoneShare(milestoneKey);
      document.head.appendChild(s);
    }
  };

  /* ── Open/close drawer ──────────────────────────────────────────────────── */
  function openDrawer() {
    if (_drawerOpen) return;
    _drawerOpen = true;
    backdrop.classList.add('open');
    requestAnimationFrame(() => {
      backdrop.classList.add('visible');
      drawer.classList.add('open');
    });
    renderAlerts();
  }

  function closeDrawer() {
    if (!_drawerOpen) return;
    _drawerOpen = false;
    backdrop.classList.remove('visible');
    drawer.classList.remove('open');
    setTimeout(() => backdrop.classList.remove('open'), 280);
  }

  /* ── Alert actions ─────────────────────────────────────────────────────── */
  async function markRead(alertId) {
    // Optimistic update
    const alert = _alerts.find(a => a.id === alertId);
    if (alert && !alert.read) {
      alert.read = true;
      _unread = Math.max(0, _unread - 1);
      updateBadge();
      renderAlerts();
      // Persist to local server if available
      if (ALERT_API) {
        try { await fetch(`${ALERT_API}/alerts/${alertId}/read`, { method: 'POST' }); } catch {}
      }
    }
  }

  async function markAllRead() {
    if (!_userId) return;
    _alerts.forEach(a => { a.read = true; });
    _unread = 0;
    updateBadge();
    renderAlerts();
    if (ALERT_API) {
      try { await fetch(`${ALERT_API}/alerts/mark-all-read/${_userId}`, { method: 'POST' }); } catch {}
    }
  }

  function openAlert(alertId, actionUrl) {
    markRead(alertId);
    if (actionUrl && actionUrl !== 'undefined') {
      setTimeout(() => {
        closeDrawer();
        window.location.href = actionUrl;
      }, 200);
    }
  }

  // Expose to global scope for onclick handlers
  window._finosAlerts = { markAllRead, openAlert };

  /* ── Fetch alerts from API ──────────────────────────────────────────────── */
  async function fetchAlerts() {
    if (!_userId || !ALERT_API) return; // Gracefully skip on production
    try {
      const r = await fetch(`${ALERT_API}/alerts/${_userId}?limit=50`);
      if (!r.ok) return;
      const data = await r.json();
      _alerts  = data.alerts || [];
      _unread  = data.unread_count || 0;
      updateBadge();
      if (_drawerOpen) renderAlerts();
    } catch (e) {
      console.debug('[FIN-OS Alerts] API unreachable:', e.message);
    }
  }

  /* ── Supabase Realtime subscription ────────────────────────────────────── */
  function subscribeRealtime() {
    if (!_userId || _realtimeSub) return;
    try {
      const sb = window.supabase?.createClient?.(SUPABASE_URL, SUPABASE_KEY);
      if (!sb) return;
      _realtimeSub = sb
        .channel(`alerts:${_userId}`)
        .on('postgres_changes', {
          event:  'INSERT',
          schema: 'public',
          table:  'alerts',
          filter: `user_id=eq.${_userId}`,
        }, (payload) => {
          const newAlert = payload.new;
          _alerts.unshift(newAlert);
          _unread++;
          updateBadge();
          if (_drawerOpen) renderAlerts();
          // Native notification if drawer is closed
          if (!_drawerOpen) showToast(newAlert);
        })
        .subscribe();
      console.debug('[FIN-OS Alerts] Realtime subscribed for', _userId.slice(0, 8));
    } catch (e) {
      console.debug('[FIN-OS Alerts] Realtime subscribe failed:', e.message);
    }
  }

  /* ── Toast notification (in-page, drawer closed) ─────────────────────── */
  function showToast(alert) {
    const p = PRIORITY[alert.priority] || PRIORITY.info;
    const toast = document.createElement('div');
    toast.style.cssText = `
      position:fixed;bottom:90px;right:20px;z-index:99999;
      max-width:320px;
      background:#080f1c;border:1px solid ${p.color}55;border-radius:14px;
      padding:14px 16px;
      box-shadow:0 8px 32px rgba(0,0,0,.6), 0 0 0 1px ${p.color}22;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      animation:toastIn .35s cubic-bezier(.34,1.56,.64,1);
      cursor:pointer;
    `;
    // Inject animation CSS only once
    if (!document.getElementById('fad-toast-style')) {
      const styleToast = document.createElement('style');
      styleToast.id = 'fad-toast-style';
      styleToast.textContent = `@keyframes toastIn{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:none}}`;
      document.head.appendChild(styleToast);
    }
    toast.innerHTML = `
      <div style="display:flex;gap:8px;align-items:flex-start">
        <span style="font-size:18px;flex-shrink:0">${p.icon}</span>
        <div>
          <div style="font-size:13px;font-weight:700;color:#e8f4ff;margin-bottom:3px">${escHtml(alert.title)}</div>
          <div style="font-size:11.5px;color:rgba(200,216,232,.65);line-height:1.5">${escHtml(alert.message.slice(0, 100))}${alert.message.length > 100 ? '…' : ''}</div>
        </div>
      </div>
    `;
    toast.onclick = () => {
      toast.remove();
      openDrawer();
    };
    // Cap toasts at 5 to prevent DOM accumulation
    const existingToasts = document.querySelectorAll('.fad-toast-notification');
    if (existingToasts.length >= 5) existingToasts[0].remove();
    toast.classList.add('fad-toast-notification');
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(40px)';
      toast.style.transition = 'all .3s';
      setTimeout(() => toast.remove(), 300);
    }, 6000);
  }

  /* ── Web Push subscription ─────────────────────────────────────────────── */
  async function setupPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      document.getElementById('fad-push-status').textContent = 'Push: not supported';
      return;
    }

    const pushStatus = document.getElementById('fad-push-status');

    // Check existing permission
    const perm = Notification.permission;
    if (perm === 'denied') {
      pushStatus.textContent = 'Push: blocked';
      return;
    }

    // Get VAPID public key — only available when local server is running
    if (!ALERT_API) {
      pushStatus.textContent = 'Push: not available in production';
      return;
    }
    let vapidKey;
    try {
      const r = await fetch(`${ALERT_API}/vapid-public-key`);
      if (!r.ok) throw new Error('No VAPID key');
      vapidKey = (await r.json()).public_key;
    } catch {
      pushStatus.textContent = 'Push: server offline';
      return;
    }

    // Register service worker + subscribe
    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();

      if (!sub) {
        // Request permission first
        const result = await Notification.requestPermission();
        if (result !== 'granted') {
          pushStatus.textContent = 'Push: permission denied';
          return;
        }
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: _urlBase64ToUint8Array(vapidKey),
        });
      }

      // Register with alert engine
      if (_userId && sub) {
        const subJson = sub.toJSON();
        await fetch(`${ALERT_API}/alerts/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id:    _userId,
            endpoint:   subJson.endpoint,
            p256dh:     subJson.keys.p256dh,
            auth_key:   subJson.keys.auth,
            user_agent: navigator.userAgent.slice(0, 100),
          }),
        });
        pushStatus.textContent = '✅ Push: active';
        console.debug('[FIN-OS Alerts] Push subscription registered');
      }
    } catch (e) {
      console.debug('[FIN-OS Alerts] Push setup failed:', e.message);
      pushStatus.textContent = 'Push: setup failed';
    }
  }

  function _urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw     = window.atob(base64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  }

  /* ── Tab filters ────────────────────────────────────────────────────────── */
  document.getElementById('fad-tabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.fad-tab');
    if (!btn) return;
    document.querySelectorAll('.fad-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    _activeFilter = btn.dataset.filter;
    renderAlerts();
  });

  /* ── Wire up bell + drawer ──────────────────────────────────────────────── */
  bell.addEventListener('click', () => _drawerOpen ? closeDrawer() : openDrawer());
  backdrop.addEventListener('click', closeDrawer);
  document.getElementById('fad-close')?.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

  /* ── Boot: get user ID from Supabase session ────────────────────────────── */
  async function boot() {
    // Inject bell first
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectBell);
    } else {
      injectBell();
    }

    // Get user ID
    try {
      const sb = window.supabase?.createClient?.(SUPABASE_URL, SUPABASE_KEY);
      if (sb) {
        const { data: { session } } = await sb.auth.getSession();
        if (session) {
          _userId = session.user.id;
          console.debug('[FIN-OS Alerts] User:', _userId.slice(0, 8));
          await fetchAlerts();
          subscribeRealtime();
          setupPush();   // async — doesn't block
          // Refresh every 5 minutes
          const _pollInterval = setInterval(fetchAlerts, 5 * 60 * 1000);
          window.addEventListener('beforeunload', () => clearInterval(_pollInterval), { once: true });
        }
      }
    } catch (e) {
      console.debug('[FIN-OS Alerts] Auth check failed:', e.message);
    }

    // Also listen for context-ready event (if finos-context.js is on the page)
    window.addEventListener('finos-context-ready', (e) => {
      if (e.detail?.user_id && !_userId) {
        _userId = e.detail.user_id;
        fetchAlerts();
        subscribeRealtime();
        setupPush();
      }
    });
  }

  boot();

})();
