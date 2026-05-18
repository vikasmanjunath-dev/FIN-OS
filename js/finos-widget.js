/**
 * FIN-OS Voice AI — Floating Widget
 * Drop this script on any page. One <script> tag. Zero dependencies.
 */
(function () {
  'use strict';

  const AGENT_URL = 'http://localhost:8080';

  /* ── Inject CSS ─────────────────────────────────────────────────────────── */
  const css = `
    #finos-fab {
      position: fixed;
      bottom: 28px;
      right: 28px;
      z-index: 99998;
      display: flex;
      align-items: center;
      gap: 10px;
      background: linear-gradient(135deg, #00d4ff 0%, #7b2ff7 100%);
      border: none;
      border-radius: 50px;
      padding: 0 20px 0 16px;
      height: 52px;
      cursor: pointer;
      box-shadow: 0 4px 24px rgba(0,212,255,.40), 0 2px 8px rgba(0,0,0,.5);
      transition: transform .18s ease, box-shadow .18s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      outline: none;
      -webkit-tap-highlight-color: transparent;
    }
    #finos-fab:hover {
      transform: translateY(-3px) scale(1.04);
      box-shadow: 0 8px 32px rgba(0,212,255,.55), 0 4px 12px rgba(0,0,0,.6);
    }
    #finos-fab:active { transform: scale(.97); }
    #finos-fab .fab-icon {
      width: 26px;
      height: 26px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255,255,255,.18);
      border-radius: 50%;
      flex-shrink: 0;
    }
    #finos-fab .fab-icon svg { width: 15px; height: 15px; fill: #fff; }
    #finos-fab .fab-label {
      font-size: 13px;
      font-weight: 700;
      color: #fff;
      letter-spacing: .5px;
      white-space: nowrap;
    }
    #finos-fab .fab-pulse {
      position: absolute;
      top: -3px; right: -3px;
      width: 12px; height: 12px;
      background: #00ffb3;
      border-radius: 50%;
      border: 2px solid #0b0d12;
      animation: fabPulse 2.2s infinite;
    }
    @keyframes fabPulse {
      0%,100% { transform: scale(1); opacity: 1; }
      50%      { transform: scale(1.3); opacity: .7; }
    }

    /* ── Backdrop ── */
    #finos-backdrop {
      display: none;
      position: fixed;
      inset: 0;
      z-index: 99999;
      background: rgba(0,0,0,.55);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      opacity: 0;
      transition: opacity .22s ease;
    }
    #finos-backdrop.open { display: block; }
    #finos-backdrop.visible { opacity: 1; }

    /* ── Popup ── */
    #finos-popup {
      position: fixed;
      bottom: 90px;
      /* Anchor right edge; left is auto-calculated so popup never clips off screen */
      right: 28px;
      left: max(20px, calc(100vw - 948px));   /* 948 = 900px target + 28px right + 20px safety */
      z-index: 100000;
      width: auto;                             /* width driven by left + right */
      min-width: min(460px, calc(100vw - 20px));
      height: min(700px, calc(100vh - 120px));
      max-height: calc(100vh - 120px);
      background: #0b0d12;
      border: 1px solid rgba(0,212,255,.22);
      border-radius: 20px;
      overflow: hidden;
      box-shadow:
        0 32px 80px rgba(0,0,0,.75),
        0 0 0 1px rgba(0,212,255,.08),
        inset 0 1px 0 rgba(255,255,255,.06);
      display: flex;
      flex-direction: column;
      transform: translateY(20px) scale(.97);
      opacity: 0;
      pointer-events: none;
      transition: transform .25s cubic-bezier(.34,1.56,.64,1), opacity .22s ease;
    }
    #finos-popup.open {
      transform: translateY(0) scale(1);
      opacity: 1;
      pointer-events: all;
    }

    /* ── Popup header ── */
    #finos-popup-header {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 16px 13px;
      background: linear-gradient(90deg, rgba(0,212,255,.08) 0%, rgba(123,47,247,.08) 100%);
      border-bottom: 1px solid rgba(0,212,255,.12);
    }
    #finos-popup-header .ph-dot {
      width: 8px; height: 8px;
      background: #00ffb3;
      border-radius: 50%;
      animation: fabPulse 2.2s infinite;
      flex-shrink: 0;
    }
    #finos-popup-header .ph-title {
      flex: 1;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      font-weight: 700;
      color: #00d4ff;
      letter-spacing: .8px;
    }
    #finos-popup-header .ph-sub {
      font-size: 10px;
      font-weight: 400;
      color: rgba(255,255,255,.4);
      letter-spacing: .3px;
    }
    #finos-close-btn {
      background: rgba(255,255,255,.07);
      border: 1px solid rgba(255,255,255,.10);
      border-radius: 8px;
      width: 28px; height: 28px;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      transition: background .15s;
      color: rgba(255,255,255,.6);
      font-size: 16px;
      line-height: 1;
    }
    #finos-close-btn:hover {
      background: rgba(255,255,255,.14);
      color: #fff;
    }

    /* ── iframe ── */
    #finos-iframe {
      flex: 1;
      border: none;
      width: 100%;
      display: block;
      background: #0b0d12;
    }

    /* ── Tablet: tighter margins ── */
    @media (max-width: 768px) {
      #finos-popup {
        left: 12px;
        right: 12px;
        bottom: 80px;
        min-width: unset;
      }
    }

    /* ── Mobile: full-width bottom sheet ── */
    @media (max-width: 480px) {
      #finos-popup {
        bottom: 0;
        left: 0;
        right: 0;
        width: 100%;
        min-width: unset;
        height: 88vh;
        max-height: 88vh;
        border-radius: 20px 20px 0 0;
      }
      #finos-fab { bottom: 20px; right: 16px; }
    }
  `;

  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  /* ── Build DOM ──────────────────────────────────────────────────────────── */
  // FAB
  const fab = document.createElement('button');
  fab.id = 'finos-fab';
  fab.setAttribute('aria-label', 'Open FIN-OS AI assistant');
  fab.innerHTML = `
    <span class="fab-pulse"></span>
    <span class="fab-icon">
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm-6.5 9.5a.75.75 0 0 1 .75.75 5.75 5.75 0 0 0 11.5 0 .75.75 0 0 1 1.5 0 7.25 7.25 0 0 1-6.5 7.21V21h3a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h3v-2.54A7.25 7.25 0 0 1 4.75 11.25a.75.75 0 0 1 .75-.75z"/>
      </svg>
    </span>
    <span class="fab-label">FIN-OS AI</span>
  `;

  // Backdrop
  const backdrop = document.createElement('div');
  backdrop.id = 'finos-backdrop';

  // Popup
  const popup = document.createElement('div');
  popup.id = 'finos-popup';
  popup.setAttribute('role', 'dialog');
  popup.setAttribute('aria-modal', 'true');
  popup.setAttribute('aria-label', 'FIN-OS Voice AI');
  popup.innerHTML = `
    <div id="finos-popup-header">
      <span class="ph-dot"></span>
      <div style="flex:1">
        <div class="ph-title">FIN-OS AI</div>
        <div class="ph-sub">Your personal finance assistant</div>
      </div>
      <button id="finos-close-btn" aria-label="Close">✕</button>
    </div>
    <iframe
      id="finos-iframe"
      src="about:blank"
      title="FIN-OS Voice AI"
      allow="microphone; autoplay"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
    ></iframe>
  `;

  document.body.appendChild(fab);
  document.body.appendChild(backdrop);
  document.body.appendChild(popup);

  /* ── Logic ──────────────────────────────────────────────────────────────── */
  let isOpen       = false;
  let iframeLoaded = false;
  let _ctxTimer    = null;

  /* ── Context bridge: parent page → iframe ────────────────────────────────
     Sends window.FINOS_USER_CONTEXT to the voice agent iframe via postMessage.
     The iframe (voiceagent/index.html) forwards it over WebSocket to agent.py.
     SECURITY: both parent and iframe are same-origin (localhost) so this is safe.
  ── */
  function sendContextToIframe() {
    const iframeEl = document.getElementById('finos-iframe');
    if (!iframeEl || !iframeEl.contentWindow) return;
    const ctx = window.FINOS_USER_CONTEXT;
    if (!ctx) return;
    try {
      iframeEl.contentWindow.postMessage(
        { type: 'finos_user_context', payload: ctx },
        '*'    // same-origin localhost — wildcard is safe here
      );
    } catch (e) {
      console.debug('[FIN-OS Widget] postMessage failed:', e.message);
    }
  }

  /* Listen for context updates (both sync and async Supabase phase) */
  window.addEventListener('finos-context-ready', () => {
    if (iframeLoaded) sendContextToIframe();
  });

  /* Listen for context requests from the iframe (e.g., on reconnect) */
  window.addEventListener('message', function(e) {
    if (e.data?.type === 'finos_request_context') {
      sendContextToIframe();
    }
  });

  function openWidget() {
    if (isOpen) return;
    isOpen = true;

    // Lazy-load the iframe only on first open
    if (!iframeLoaded) {
      const iframeEl = document.getElementById('finos-iframe');
      iframeEl.src = AGENT_URL;
      iframeLoaded = true;
      // Wait for iframe to load, then send context
      iframeEl.addEventListener('load', function onLoad() {
        iframeEl.removeEventListener('load', onLoad);
        // Small delay so the iframe WS connection can establish first
        setTimeout(sendContextToIframe, 800);
        // Then resend every 90s to refresh page globals (portfolio prices etc.)
        clearInterval(_ctxTimer);
        _ctxTimer = setInterval(sendContextToIframe, 90_000);
      });
    } else {
      // Iframe already loaded — just push fresh context
      setTimeout(sendContextToIframe, 100);
    }

    backdrop.classList.add('open');
    requestAnimationFrame(() => {
      backdrop.classList.add('visible');
      popup.classList.add('open');
    });

    fab.style.transform = 'scale(0.9)';
    fab.style.opacity   = '0.7';
    document.addEventListener('keydown', onEsc);
  }

  function closeWidget() {
    if (!isOpen) return;
    isOpen = false;

    backdrop.classList.remove('visible');
    popup.classList.remove('open');
    setTimeout(() => backdrop.classList.remove('open'), 220);

    fab.style.transform = '';
    fab.style.opacity   = '';
    document.removeEventListener('keydown', onEsc);
  }

  function onEsc(e) {
    if (e.key === 'Escape') closeWidget();
  }

  fab.addEventListener('click', () => isOpen ? closeWidget() : openWidget());
  backdrop.addEventListener('click', closeWidget);
  document.getElementById('finos-close-btn').addEventListener('click', closeWidget);

  /* ── Alert badge on FAB ──────────────────────────────────────────────────
     Polls the alert engine and shows a red badge on the FIN-OS AI button
     when there are unread alerts, so users know to open the voice agent.
  ── */
  async function refreshAlertBadge() {
    try {
      const sb = window.supabase?.createClient?.(
        'https://oeapcyucnduhwpgxfknb.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lYXBjeXVjbmR1aHdwZ3hma25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNjE1NjgsImV4cCI6MjA4MzgzNzU2OH0.kyuz385hM4X3j8CMBFfI83ZerorvlXrUDOipAHKDC7Q'
      );
      if (!sb) return;
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;

      const r = await fetch(
        `http://localhost:8001/alerts/${session.user.id}?unread_only=true&limit=1`
      );
      if (!r.ok) return;
      const { unread_count } = await r.json();

      // Update FAB badge
      let badge = document.getElementById('finos-fab-alert-badge');
      if (unread_count > 0) {
        if (!badge) {
          badge = document.createElement('div');
          badge.id = 'finos-fab-alert-badge';
          badge.style.cssText = [
            'position:absolute', 'top:-5px', 'left:-5px',
            'min-width:18px', 'height:18px',
            'background:#f04444', 'color:#fff',
            'font-size:10px', 'font-weight:700',
            'border-radius:50%',
            'display:flex', 'align-items:center', 'justify-content:center',
            'border:2px solid #0b0d12',
            'padding:0 3px',
            'animation:fabPulse 1.5s infinite',
          ].join(';');
          fab.appendChild(badge);
        }
        badge.textContent = unread_count > 9 ? '9+' : unread_count;
      } else if (badge) {
        badge.remove();
      }
    } catch {}
  }

  // Check for alerts every 5 minutes after a 3-second initial delay
  setTimeout(() => {
    refreshAlertBadge();
    setInterval(refreshAlertBadge, 5 * 60 * 1000);
  }, 3000);

  /* ── Inject finos-context.js if not already loaded ───────────────────────
     This makes the widget self-sufficient: drop one <script> tag on any page
     and both the widget + context collector are active.                       */
  /* ── Derive base JS path from this script's own <script src> ──────────── */
  function _widgetBasePath() {
    const scripts = document.querySelectorAll('script[src]');
    for (const s of scripts) {
      if (s.src.includes('finos-widget')) {
        return s.src.replace('finos-widget.js', '');
      }
    }
    return './js/';  // fallback
  }

  /* ── Auto-inject finos-context.js if not already loaded ─────────────────
     Makes the widget self-sufficient: drop one <script> tag, everything runs. */
  if (typeof window.FINOS_USER_CONTEXT === 'undefined') {
    const ctxScript = document.createElement('script');
    ctxScript.src   = _widgetBasePath() + 'finos-context.js';
    ctxScript.async = true;
    document.head.appendChild(ctxScript);
  }

  /* ── Auto-inject finos-alerts.js if not already loaded ──────────────────
     Gives every page the alert bell + real-time drawer with zero extra markup. */
  if (!window._finosAlertsLoaded) {
    window._finosAlertsLoaded = true;   // guard against double-inject
    const alertScript = document.createElement('script');
    alertScript.src   = _widgetBasePath() + 'finos-alerts.js';
    alertScript.async = true;
    document.head.appendChild(alertScript);
  }

  /* ── Auto-inject finos-health-score.js if not already loaded ────────────
     Adds a live Financial Health Score button to every page. */
  if (!window._finosHealthScoreLoaded) {
    window._finosHealthScoreLoaded = true;
    const hsScript = document.createElement('script');
    hsScript.src   = _widgetBasePath() + 'finos-health-score.js';
    hsScript.async = true;
    document.head.appendChild(hsScript);
  }

})();;
