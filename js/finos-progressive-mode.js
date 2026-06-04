/**
 * finos-progressive-mode.js — FIN·OS Progressive Complexity Modes  v1.0
 * ────────────────────────────────────────────────────────────────────────
 * Four modes that control feature visibility and UX depth:
 *   Starter    → Track expenses, 1 goal, basic calculators, Arya explains all
 *   Builder    → Budget, multiple goals, SIPs, portfolio, learn modules
 *   Investor   → Trade journal, stock screener, technical analysis
 *   Power User → All features + raw data, API access, custom alerts, export
 *
 * Users level up naturally. Arya nudges them when ready.
 * Mode stored in localStorage + Supabase profile.
 *
 * Usage: include this JS on every page. Add data-min-mode="builder" to
 * nav items to auto-hide/show them. Call FinosMode.render() for the badge.
 */
(function (global) {
  'use strict';

  const MODE_KEY = 'finos_complexity_mode';

  /* ── Mode definitions ──────────────────────────────────────────── */
  const MODES = {
    starter: {
      label:    'Starter',
      icon:     '🌱',
      color:    '#22d3a6',
      level:    1,
      tagline:  'Tracking + 1 goal + basics',
      unlocks:  ['track-finances', 'calculator', 'money-ai', 'learn-mf', 'learn-equity', 'onboarding', 'dashboard'],
      arya_style: 'simple',
      description: 'Perfect if you\'re just starting your financial journey. Clean, simple, Arya explains everything.',
    },
    builder: {
      label:    'Builder',
      icon:     '🏗️',
      color:    '#00d4ff',
      level:    2,
      tagline:  'Budget + goals + SIPs + portfolio',
      unlocks:  ['budget-forecast', 'life-goals-planner', 'portfolio', 'sip', 'markets', 'tax', 'insurance-hub', 'financial-health'],
      arya_style: 'balanced',
      description: 'You\'re building wealth systematically. Full budget, multiple goals, SIP tracking.',
    },
    investor: {
      label:    'Investor',
      icon:     '📈',
      color:    '#f0a500',
      level:    3,
      tagline:  'Trading + screener + technical analysis',
      unlocks:  ['trading-simulator', 'stock-platform', 'market-intel', 'mf-intelligence', 'markets-deep', 'derivativesdetail', 'options-intelligence'],
      arya_style: 'expert',
      description: 'You invest actively. Trade journal, stock screener, technical + fundamental analysis.',
    },
    power: {
      label:    'Power User',
      icon:     '⚡',
      color:    '#7b2ff7',
      level:    4,
      tagline:  'All features + raw data + exports',
      unlocks:  ['*'], // everything
      arya_style: 'concise',
      description: 'You want it all. Custom alerts, data exports, API access, advanced analytics.',
    }
  };

  /* ── Progression thresholds ────────────────────────────────────── */
  const PROGRESSION = [
    {
      from: 'starter', to: 'builder',
      trigger: ctx => {
        const days  = Number(ctx?.engagement?.days_since_first || 0);
        const goals = (ctx?.financial?.goals || []).length;
        const txns  = Number(ctx?.financial?.transactions?.count || localStorage.getItem('finos_txn_count') || 0);
        return days >= 30 && (goals >= 1 || txns >= 20);
      },
      message: "You've been tracking expenses for 30 days! Ready to set up your budget, goals, and first SIP? Level up to Builder mode?"
    },
    {
      from: 'builder', to: 'investor',
      trigger: ctx => {
        const goals    = (ctx?.financial?.goals || []).filter(g => (g.progress || 0) >= 50).length;
        const sipCount = (ctx?.financial?.sips || []).length;
        return goals >= 2 && sipCount >= 1;
      },
      message: "2 goals funded 50%+ and a SIP running! You're ready for active investing. Want to unlock the Investor toolkit?"
    },
    {
      from: 'investor', to: 'power',
      trigger: ctx => {
        const trades = Number(ctx?.trade_journal?.total_trades || 0);
        return trades >= 20;
      },
      message: "20 trades recorded — you're operating like a pro! Unlock Power User mode for custom alerts, data exports, and advanced analytics?"
    },
  ];

  /* ── Current mode ──────────────────────────────────────────────── */
  function getMode() {
    return localStorage.getItem(MODE_KEY) || 'starter';
  }

  function getModeData(modeKey) {
    return MODES[modeKey] || MODES.starter;
  }

  function setMode(modeKey) {
    if (!MODES[modeKey]) return;
    const prev = getMode();
    localStorage.setItem(MODE_KEY, modeKey);

    /* Sync to profile if possible */
    try {
      const profile = JSON.parse(localStorage.getItem('finos_profile') || '{}');
      profile.complexity_mode = modeKey;
      localStorage.setItem('finos_profile', JSON.stringify(profile));
    } catch (_) {}

    document.dispatchEvent(new CustomEvent('finos-mode-changed', {
      detail: { from: prev, to: modeKey, mode: MODES[modeKey] }
    }));

    applyMode(modeKey);
  }

  /* ── Apply mode to DOM ─────────────────────────────────────────── */
  function applyMode(modeKey) {
    const mode = MODES[modeKey];
    if (!mode) return;

    /* Show/hide elements with data-min-mode attribute */
    document.querySelectorAll('[data-min-mode]').forEach(el => {
      const minLevel = MODES[el.dataset.minMode]?.level || 1;
      if (mode.level >= minLevel) {
        el.style.display = '';
        el.removeAttribute('data-mode-hidden');
      } else {
        el.style.display = 'none';
        el.dataset.modeHidden = 'true';
      }
    });

    /* Update mode badges */
    document.querySelectorAll('.finos-mode-badge').forEach(el => {
      el.innerHTML = `${mode.icon} ${mode.label}`;
      el.style.color = mode.color;
      el.style.borderColor = mode.color + '40';
      el.style.background  = mode.color + '15';
    });

    /* Update sidebar nav links */
    _updateSidebarVisibility(mode);
  }

  function _updateSidebarVisibility(mode) {
    const sidebarLinks = document.querySelectorAll('.sidebar a, .nav-link, .sidebar-link');
    const starterPages = new Set(MODES.starter.unlocks);
    const builderPages = new Set([...MODES.starter.unlocks, ...MODES.builder.unlocks]);
    const investorPages = new Set([...builderPages, ...MODES.investor.unlocks]);

    sidebarLinks.forEach(link => {
      const href = (link.getAttribute('href') || '').split('/').pop().replace('.html', '');
      if (mode.level === 4) { link.style.display = ''; return; } // power: show all

      const visible =
        mode.level >= 3 ? investorPages.has(href) :
        mode.level >= 2 ? builderPages.has(href) :
        starterPages.has(href) || href === '' || href === 'home' || href === 'dashboard';

      /* Don't hide unknown links — only hide explicitly listed advanced pages */
      const isAdvancedPage = Object.values(MODES)
        .flatMap(m => m.unlocks)
        .includes(href);

      if (isAdvancedPage && !visible) {
        link.dataset.modeHidden = 'true';
        link.style.opacity = '0.25';
        link.style.pointerEvents = 'none';
        link.title = `Unlock in ${_modeRequiredFor(href)} mode`;
      } else {
        link.removeAttribute('data-mode-hidden');
        link.style.opacity = '';
        link.style.pointerEvents = '';
        link.title = '';
      }
    });
  }

  function _modeRequiredFor(page) {
    for (const [key, m] of Object.entries(MODES)) {
      if (m.unlocks.includes(page)) return m.label;
    }
    return 'Builder';
  }

  /* ── Progression checker ───────────────────────────────────────── */
  function checkProgression(ctx) {
    const currentMode = getMode();
    const currentLevel = MODES[currentMode]?.level || 1;

    for (const rule of PROGRESSION) {
      if (rule.from !== currentMode) continue;
      try {
        if (rule.trigger(ctx)) {
          _showLevelUpPrompt(rule.from, rule.to, rule.message);
          break;
        }
      } catch (_) {}
    }
  }

  function _showLevelUpPrompt(from, to, message) {
    const key  = `finos_levelup_shown_${from}_${to}`;
    const shown = localStorage.getItem(key);
    if (shown) return;
    localStorage.setItem(key, '1');

    const toMode = MODES[to];

    const banner = document.createElement('div');
    banner.id = 'finos-levelup-banner';
    banner.innerHTML = `
      <style>
        #finos-levelup-banner {
          position:fixed;top:20px;left:50%;transform:translateX(-50%);
          z-index:99999;max-width:400px;width:calc(100vw - 40px);
          background:linear-gradient(145deg,#0d0f1a,#161929);
          border:1px solid ${toMode.color}40;border-top:3px solid ${toMode.color};
          border-radius:18px;padding:22px 24px;
          box-shadow:0 20px 60px rgba(0,0,0,.7);
          animation:_bannerIn .4s cubic-bezier(.34,1.56,.64,1);
          font-family:-apple-system,sans-serif;
        }
        @keyframes _bannerIn { from{opacity:0;transform:translateX(-50%) translateY(-20px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
      </style>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
        <div style="font-size:30px;">${toMode.icon}</div>
        <div>
          <div style="font-size:11px;color:${toMode.color};font-weight:800;letter-spacing:.1em;text-transform:uppercase;">Level Up Ready!</div>
          <div style="font-size:16px;font-weight:800;color:#F5F7FA;">${toMode.label} Mode Unlocked</div>
        </div>
        <button onclick="document.getElementById('finos-levelup-banner')?.remove()" style="margin-left:auto;background:none;border:none;color:#8892a4;font-size:20px;cursor:pointer;line-height:1;">×</button>
      </div>
      <p style="font-size:13px;color:#a0aec0;line-height:1.6;margin:0 0 16px;">${message}</p>
      <div style="display:flex;gap:10px;">
        <button onclick="window.FinosMode.setMode('${to}');document.getElementById('finos-levelup-banner')?.remove();" style="flex:1;padding:10px;border-radius:10px;background:${toMode.color}20;border:1px solid ${toMode.color}50;color:${toMode.color};font-size:13px;font-weight:700;cursor:pointer;">
          ✨ Level Up!
        </button>
        <button onclick="document.getElementById('finos-levelup-banner')?.remove()" style="padding:10px 16px;border-radius:10px;background:transparent;border:1px solid rgba(255,255,255,.1);color:#8892a4;font-size:13px;cursor:pointer;">
          Later
        </button>
      </div>
    `;

    document.body.appendChild(banner);
    setTimeout(() => banner?.remove(), 30000);
  }

  /* ── Mode Selector UI ──────────────────────────────────────────── */
  function renderModeSelector(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const current = getMode();

    container.innerHTML = `
      <style>
        .mode-grid { display:grid;grid-template-columns:repeat(2,1fr);gap:12px;font-family:-apple-system,sans-serif; }
        .mode-card { padding:18px;border-radius:16px;border:2px solid;cursor:pointer;transition:all .2s; }
        .mode-card:hover { transform:translateY(-2px); }
        .mode-card-active { box-shadow:0 8px 30px rgba(0,0,0,.4); }
        .mode-icon { font-size:28px;margin-bottom:8px; }
        .mode-name { font-size:15px;font-weight:800;color:#F5F7FA;margin-bottom:4px; }
        .mode-tag { font-size:11px;margin-bottom:8px; }
        .mode-desc { font-size:12px;color:#8892a4;line-height:1.5; }
        .mode-active-badge { display:inline-block;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;margin-top:10px; }
        @media (max-width: 480px) { .mode-grid { grid-template-columns:1fr; } }
      </style>
      <div class="mode-grid">
        ${Object.entries(MODES).map(([key, m]) => {
          const isActive = key === current;
          return `
            <div class="mode-card ${isActive ? 'mode-card-active' : ''}"
                 style="border-color:${isActive ? m.color : 'rgba(255,255,255,.08)'};background:${isActive ? m.color + '10' : 'rgba(255,255,255,.02)'};"
                 onclick="window.FinosMode.setMode('${key}');window.FinosMode.renderModeSelector('${containerId}')">
              <div class="mode-icon">${m.icon}</div>
              <div class="mode-name">${m.label}</div>
              <div class="mode-tag" style="color:${m.color}">${m.tagline}</div>
              <div class="mode-desc">${m.description}</div>
              ${isActive ? `<div class="mode-active-badge" style="background:${m.color}20;color:${m.color};border:1px solid ${m.color}40">✓ Active</div>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  /* ── Inline mode badge HTML ────────────────────────────────────── */
  function getBadgeHTML() {
    const m = getModeData(getMode());
    return `<span class="finos-mode-badge" style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;cursor:pointer;color:${m.color};border:1px solid ${m.color}40;background:${m.color}15;" onclick="window.location.href='settings.html#mode'">${m.icon} ${m.label}</span>`;
  }

  /* ── Public API ─────────────────────────────────────────────────── */
  const FinosMode = {
    MODES,
    getMode,
    getModeData,
    setMode,
    applyMode,
    checkProgression,
    renderModeSelector,
    getBadgeHTML,

    get current() { return getModeData(getMode()); },
    get level()   { return this.current.level; },
    is(mode)      { return getMode() === mode; },
    atLeast(mode) { return this.level >= (MODES[mode]?.level || 1); },
  };

  global.FinosMode = FinosMode;

  /* ── Auto-init ─────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    applyMode(getMode());

    /* Inject mode badge into header if it has the right slot */
    const slot = document.getElementById('finos-mode-slot');
    if (slot) slot.innerHTML = getBadgeHTML();
  });

  window.addEventListener('finos-context-ready', e => {
    if (e.detail?.phase !== 'full') return;
    const ctx = window.FINOS_USER_CONTEXT;
    if (ctx) {
      setTimeout(() => checkProgression(ctx), 5000);
    }
  });

}(window));
