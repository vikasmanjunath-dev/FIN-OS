/**
 * FIN-OS Voice AI — Floating Widget
 * Drop this script on any page. One <script> tag. Zero dependencies.
 */
(function () {
  'use strict';

  // Resolve voiceagent path relative to the current page depth.
  // Works whether Live Server is rooted at the project folder or its parent,
  // and works on Vercel where pages live under /html/.
  const AGENT_URL = (function () {
    const parts = window.location.pathname.split('/').filter(Boolean);
    // Drop the filename, then drop one directory level (e.g. "html" or "calculators")
    parts.pop();  // remove file
    parts.pop();  // go up to project root
    return (parts.length ? '/' + parts.join('/') : '') + '/voiceagent/index.html';
  }());

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

  /* ── QUICK-LOG BUTTON (Voice Journal) ──────────────────────────────────── */
  const qlCSS = `
    #finos-ql-btn {
      position:fixed; bottom:88px; right:28px; z-index:99997;
      width:40px; height:40px; border-radius:50%; border:none; cursor:pointer;
      background:linear-gradient(135deg,#c7f000,#22d3a6);
      box-shadow:0 3px 14px rgba(199,240,0,.35);
      display:flex; align-items:center; justify-content:center;
      font-size:16px; transition:transform .18s ease, opacity .18s ease;
      opacity:.88;
    }
    #finos-ql-btn:hover { transform:scale(1.12); opacity:1; }
    #finos-ql-panel {
      position:fixed; bottom:136px; right:28px; z-index:99997;
      width:320px; background:#12151d; border:1px solid rgba(199,240,0,.2);
      border-radius:18px; padding:16px; box-shadow:0 8px 40px rgba(0,0,0,.6);
      display:none; flex-direction:column; gap:10px;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    }
    #finos-ql-panel.open { display:flex; }
    #finos-ql-input {
      width:100%; padding:10px 14px; border-radius:10px;
      background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.12);
      color:#fff; font-size:13px; outline:none; resize:none; min-height:42px;
      font-family:inherit;
    }
    #finos-ql-input::placeholder { color:rgba(255,255,255,.3); }
    .ql-row { display:flex; gap:6px; }
    .ql-btn {
      flex:1; padding:8px; border-radius:8px; border:none; cursor:pointer;
      font-size:11px; font-weight:700; transition:all .15s;
    }
    .ql-btn.primary { background:#c7f000; color:#000; }
    .ql-btn.primary:hover { filter:brightness(1.1); }
    .ql-btn.voice { background:rgba(255,255,255,.06); color:rgba(255,255,255,.7); border:1px solid rgba(255,255,255,.1); }
    .ql-btn.voice.listening { background:rgba(255,71,87,.12); color:#ff4757; border-color:rgba(255,71,87,.3); animation:qlPulse .7s infinite; }
    .ql-btn.close-ql { background:transparent; color:rgba(255,255,255,.3); border:1px solid rgba(255,255,255,.08); flex:0; padding:8px 10px; }
    #finos-ql-parsed { font-size:11px; padding:8px 10px; border-radius:8px; background:rgba(0,0,0,.2); color:rgba(255,255,255,.6); display:none; line-height:1.5; }
    #finos-ql-history { max-height:100px; overflow-y:auto; display:flex; flex-direction:column; gap:4px; }
    .ql-entry { font-size:11px; padding:5px 8px; border-radius:6px; background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.05); color:rgba(255,255,255,.55); display:flex; justify-content:space-between; }
    .ql-entry-amount { color:#c7f000; font-weight:700; }
    @keyframes qlPulse { 0%,100%{opacity:1} 50%{opacity:.5} }
    [data-theme="light"] #finos-ql-panel { background:#fff; border-color:rgba(0,0,0,.1); box-shadow:0 8px 32px rgba(0,0,0,.12); }
    [data-theme="light"] #finos-ql-input { background:rgba(0,0,0,.04); border-color:rgba(0,0,0,.12); color:#0B0D12; }
    [data-theme="light"] .ql-entry { background:rgba(0,0,0,.02); border-color:rgba(0,0,0,.06); color:#4A5068; }
    [data-theme="light"] #finos-ql-parsed { background:rgba(0,0,0,.04); color:#4A5068; }
    [data-theme="light"] .ql-btn.voice { background:rgba(0,0,0,.04); color:#4A5068; border-color:rgba(0,0,0,.1); }
  `;
  const qlStyle = document.createElement('style');
  qlStyle.textContent = qlCSS;
  document.head.appendChild(qlStyle);

  const qlBtn = document.createElement('button');
  qlBtn.id = 'finos-ql-btn';
  qlBtn.title = 'Quick Log — voice or type an expense/note';
  qlBtn.innerHTML = '✏️';

  const qlPanel = document.createElement('div');
  qlPanel.id = 'finos-ql-panel';
  qlPanel.setAttribute('role', 'dialog');
  qlPanel.setAttribute('aria-label', 'Quick Log');
  qlPanel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px;">
      <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#c7f000;font-weight:700;">✏️ Quick Log</div>
      <button class="ql-btn close-ql" onclick="window._finosQlClose()">✕</button>
    </div>
    <textarea id="finos-ql-input" placeholder="Type or speak: 'spent 800 on food' · 'saved 5000 this week' · 'bought groceries 1200'" rows="2"></textarea>
    <div id="finos-ql-parsed"></div>
    <div class="ql-row">
      <button class="ql-btn voice" id="finos-ql-voice-btn" onclick="window._finosQlVoice()">🎙 Voice</button>
      <button class="ql-btn primary" onclick="window._finosQlLog()">Log it →</button>
    </div>
    <div id="finos-ql-history"></div>
  `;

  document.body.appendChild(qlBtn);
  document.body.appendChild(qlPanel);

  /* ── Voice Journal Logic ─────────────────────────────────────────────── */
  let _qlRecog = null;
  let _qlListening = false;

  function _qlINR(n) {
    const num = Number(n) || 0;
    if (num >= 1e5) return '₹' + (num/1e5).toFixed(1) + 'L';
    if (num >= 1e3) return '₹' + Math.round(num/1e3) + 'K';
    return '₹' + Math.round(num);
  }

  /* Intent parser — natural language → structured entry */
  function _qlParse(text) {
    if (!text || !text.trim()) return null;
    const t = text.toLowerCase().trim();

    // Amount detection — match ₹1200, 1,200, 1200, 1.2k, 1.2 lakh
    let amount = 0;
    const amtMatch =
      t.match(/₹?\s*([\d,]+(?:\.\d+)?)\s*(?:k|thousand|rupees|rs)?/i) ||
      t.match(/([\d,]+(?:\.\d+)?)\s*(?:lakh|l\b)/i);
    if (amtMatch) {
      const raw = parseFloat(amtMatch[1].replace(/,/g, ''));
      if (/lakh|^l\b/i.test(t)) amount = raw * 100000;
      else if (/k|thousand/i.test(amtMatch[0])) amount = raw * 1000;
      else amount = raw;
    }

    // Category detection
    const CATS = {
      food:       ['food','eat','lunch','dinner','breakfast','restaurant','zomato','swiggy','pizza','biryani','snack'],
      groceries:  ['grocery','groceries','bigbasket','blinkit','vegetables','milk','provisions'],
      transport:  ['petrol','fuel','uber','ola','auto','cab','bus','train','metro','travel'],
      shopping:   ['bought','shopping','amazon','flipkart','clothes','shirt','shoes','mall'],
      bills:      ['bill','electricity','water','gas','broadband','internet','recharge','phone'],
      health:     ['medicine','doctor','hospital','pharmacy','health','gym','medical'],
      investment: ['sip','mutual fund','invest','stock','nifty','equity','ppf','fd'],
      savings:    ['saved','saving','transfer','put aside','emergency'],
      income:     ['salary','received','got paid','income','bonus','freelance','earned'],
    };
    let category = 'other';
    for (const [cat, keywords] of Object.entries(CATS)) {
      if (keywords.some(k => t.includes(k))) { category = cat; break; }
    }

    // Type detection
    const isIncome = ['salary','received','got paid','income','bonus','earned','saved','saving','sip','invest'].some(k => t.includes(k));
    const type = isIncome ? 'income' : 'expense';

    // Description — strip amount & filler words
    const desc = text
      .replace(/₹?[\d,]+(?:\.\d+)?(?:\s*(?:k|thousand|lakh|rupees|rs))?/gi, '')
      .replace(/\b(spent|spend|bought|paid|on|for|the|a|an|i|my)\b/gi, '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 60) || category;

    return { amount, type, category, description: desc || category, raw: text, timestamp: new Date().toISOString() };
  }

  function _qlRenderParsed(entry) {
    const el = document.getElementById('finos-ql-parsed');
    if (!el) return;
    if (!entry || !entry.amount) { el.style.display = 'none'; return; }
    const typeColor = entry.type === 'income' ? '#22d3a6' : '#ff6b6b';
    el.style.display = 'block';
    el.innerHTML = `
      <span style="color:${typeColor};font-weight:700;">${entry.type === 'income' ? '↑ Income' : '↓ Expense'}</span>
      <span style="color:#c7f000;font-weight:700;margin:0 6px;">${_qlINR(entry.amount)}</span>
      <span>· ${entry.category} · "${entry.description.slice(0,30)}"</span>`;
  }

  function _qlSaveEntry(entry) {
    try {
      const txns = JSON.parse(localStorage.getItem('finos_transactions') || '[]');
      txns.push({
        id: Date.now(),
        date: new Date().toISOString().slice(0, 10),
        amount: entry.amount,
        type: entry.type,
        category: entry.category,
        description: entry.description,
        source: 'voice_journal',
      });
      localStorage.setItem('finos_transactions', JSON.stringify(txns));

      // Update totals
      if (entry.type === 'expense') {
        const prev = Number(localStorage.getItem('finos_expense_total')) || 0;
        localStorage.setItem('finos_expense_total', prev + entry.amount);
      }
    } catch {}
  }

  function _qlRenderHistory() {
    const el = document.getElementById('finos-ql-history');
    if (!el) return;
    try {
      const txns = JSON.parse(localStorage.getItem('finos_transactions') || '[]')
        .filter(t => t.source === 'voice_journal')
        .slice(-5).reverse();
      if (!txns.length) { el.innerHTML = ''; return; }
      el.innerHTML = txns.map(t => `
        <div class="ql-entry">
          <span>${t.date.slice(5)} · ${t.category} · ${t.description.slice(0,22)}</span>
          <span class="ql-entry-amount">${t.type === 'income' ? '+' : '-'}${_qlINR(t.amount)}</span>
        </div>`).join('');
    } catch {}
  }

  window._finosQlClose = function () {
    qlPanel.classList.remove('open');
  };

  window._finosQlLog = function () {
    const input = document.getElementById('finos-ql-input');
    if (!input) return;
    const entry = _qlParse(input.value);
    if (!entry || !entry.amount) {
      const parsedEl = document.getElementById('finos-ql-parsed');
      if (parsedEl) { parsedEl.style.display = 'block'; parsedEl.innerHTML = '<span style="color:#ff6b6b;">Could not parse an amount — try "spent 800 on food"</span>'; }
      return;
    }
    _qlSaveEntry(entry);
    input.value = '';
    const parsedEl = document.getElementById('finos-ql-parsed');
    if (parsedEl) { parsedEl.style.display = 'block'; parsedEl.innerHTML = `<span style="color:#22d3a6;font-weight:700;">✓ Logged!</span> ${entry.type} of ${_qlINR(entry.amount)} in ${entry.category}`; }
    _qlRenderHistory();
    setTimeout(() => { if (parsedEl) parsedEl.style.display = 'none'; }, 3000);
    // Refresh AI context so Arya sees the new transaction immediately
    window.dispatchEvent(new CustomEvent('finos-context-ready', { detail: { phase: 'partial', source: 'voice_journal' } }));
  };

  window._finosQlVoice = function () {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      const el = document.getElementById('finos-ql-parsed');
      if (el) { el.style.display = 'block'; el.innerHTML = '<span style="color:#ff9500;">Browser speech not supported — type instead</span>'; }
      return;
    }
    const voiceBtn = document.getElementById('finos-ql-voice-btn');
    if (_qlListening) {
      if (_qlRecog) _qlRecog.stop();
      _qlListening = false;
      if (voiceBtn) voiceBtn.classList.remove('listening');
      return;
    }
    _qlRecog = new SpeechRecognition();
    _qlRecog.lang = 'hi-IN'; // Hinglish (Hindi + English)
    _qlRecog.interimResults = true;
    _qlRecog.maxAlternatives = 1;

    _qlListening = true;
    if (voiceBtn) { voiceBtn.classList.add('listening'); voiceBtn.textContent = '⏹ Stop'; }

    _qlRecog.onresult = e => {
      const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
      const input = document.getElementById('finos-ql-input');
      if (input) input.value = transcript;
      const entry = _qlParse(transcript);
      _qlRenderParsed(entry);
    };
    _qlRecog.onend = () => {
      _qlListening = false;
      if (voiceBtn) { voiceBtn.classList.remove('listening'); voiceBtn.textContent = '🎙 Voice'; }
    };
    _qlRecog.onerror = () => {
      _qlListening = false;
      if (voiceBtn) { voiceBtn.classList.remove('listening'); voiceBtn.textContent = '🎙 Voice'; }
    };
    _qlRecog.start();
  };

  /* Live parse as user types */
  qlPanel.addEventListener('input', e => {
    if (e.target.id === 'finos-ql-input') {
      _qlRenderParsed(_qlParse(e.target.value));
    }
  });

  qlBtn.addEventListener('click', () => {
    const isOpen = qlPanel.classList.toggle('open');
    if (isOpen) {
      _qlRenderHistory();
      setTimeout(() => document.getElementById('finos-ql-input')?.focus(), 100);
    }
  });

  /* Enter to log */
  qlPanel.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && e.target.id === 'finos-ql-input') {
      e.preventDefault();
      window._finosQlLog();
    }
  });

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
    clearInterval(_ctxTimer);

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
        // Strip query-string (?v=2 etc.) before extracting the directory path
        const cleanSrc = s.src.split('?')[0];
        return cleanSrc.replace('finos-widget.js', '');
      }
    }
    return './js/';  // fallback
  }

  /* ── Auto-inject finos-context.js if not already loaded ─────────────────
     Makes the widget self-sufficient: drop one <script> tag, everything runs. */
  if (typeof window.FINOS_USER_CONTEXT === 'undefined') {
    const ctxScript = document.createElement('script');
    ctxScript.src   = _widgetBasePath() + 'finos-context.js?v=3';
    ctxScript.async = true;
    document.head.appendChild(ctxScript);
  }

  /* ── Auto-inject finos-alerts.js if not already loaded ──────────────────
     Gives every page the alert bell + real-time drawer with zero extra markup. */
  if (!window._finosAlertsLoaded) {
    window._finosAlertsLoaded = true;   // guard against double-inject
    const alertScript = document.createElement('script');
    alertScript.src   = _widgetBasePath() + 'finos-alerts.js?v=2';
    alertScript.async = true;
    document.head.appendChild(alertScript);
  }

  /* ── Auto-inject finos-health-score.js if not already loaded ────────────
     Adds a live Financial Health Score button to every page. */
  if (!window._finosHealthScoreLoaded) {
    window._finosHealthScoreLoaded = true;
    const hsScript = document.createElement('script');
    hsScript.src   = _widgetBasePath() + 'finos-health-score.js?v=3';
    hsScript.async = true;
    document.head.appendChild(hsScript);
  }

})();
