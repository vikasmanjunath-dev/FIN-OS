/**
 * FIN-OS Sidebar — Hydration Engine
 * Reads localStorage → sets DNA colours, fills identity card, health pill,
 * streak badge, Arya status. Runs before paint (no defer).
 */
(function FinosSidebar() {
  'use strict';

  /* ── helpers ─────────────────────────────────────────────────── */
  const get  = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
  const getJ = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };

  /* ── data ────────────────────────────────────────────────────── */
  const name   = get('finos_display_name', '');
  const dna    = get('finos_financial_dna', '');
  const health = parseFloat(get('finos_health_score', '0'));
  const streak = getJ('finos_streak', { count: 0 });
  const first  = name.trim().split(/\s+/)[0] || 'Investor';
  const init   = (first[0] || 'I').toUpperCase();

  /* ── DNA → gradient colours ──────────────────────────────────── */
  const THEMES = {
    Builder:   { a: '#4f7cff', b: '#7b2ff7', rgb: '79,124,255',  glow: 'rgba(79,124,255,.35)'  },
    Guardian:  { a: '#22d3a6', b: '#0d9488', rgb: '34,211,166',  glow: 'rgba(34,211,166,.32)'  },
    Explorer:  { a: '#f59e0b', b: '#ef4444', rgb: '245,158,11',  glow: 'rgba(245,158,11,.32)'  },
    Optimizer: { a: '#c7f000', b: '#22d3a6', rgb: '199,240,0',   glow: 'rgba(199,240,0,.30)'   },
    Achiever:  { a: '#a855f7', b: '#ec4899', rgb: '168,85,247',  glow: 'rgba(168,85,247,.32)'  },
    Visionary: { a: '#00d4ff', b: '#4f7cff', rgb: '0,212,255',   glow: 'rgba(0,212,255,.30)'   },
    Realist:   { a: '#fb923c', b: '#f43f5e', rgb: '251,146,60',  glow: 'rgba(251,146,60,.32)'  },
  };
  const T = THEMES[dna] || THEMES.Builder;

  /* ── apply CSS vars immediately (prevent FOUC) ───────────────── */
  function applyVars() {
    const sb = document.querySelector('.sidebar');
    if (!sb) return;
    sb.style.setProperty('--sb-accent',     T.a);
    sb.style.setProperty('--sb-accent-rgb', T.rgb);
    sb.style.setProperty('--sb-glow',       T.glow);
    sb.style.setProperty('--sb-av-a',       T.a);
    sb.style.setProperty('--sb-av-b',       T.b);
  }
  applyVars();

  /* ── DOM hydration ───────────────────────────────────────────── */
  function onReady(fn) {
    if (document.readyState !== 'loading') { fn(); return; }
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  }

  /* ── Canonical nav — single source of truth for the 9 core links ─────
     Every html/*.html page carries its OWN copy of this markup, which is
     how pages have drifted (a stray duplicate link on one page, others
     missing a link or a title="" attribute entirely, found and patched by
     hand more than once). This makes the link SET self-healing instead of
     relying on every page's static HTML staying in sync by hand: if a
     page's nav doesn't contain exactly these 9 links in this order, it
     gets rebuilt from here. Zone labels (GROW/INVEST/EXPLORE) and the
     Goals link are layered on afterward by the injectors further down,
     which already no-op safely once their target exists — untouched here
     so this stays a small, focused addition rather than a rewrite. */
  const CANONICAL_LINKS = [
    { title: 'Home', href: 'home.html',
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>' },
    { title: 'Dashboard', href: 'dashboard.html', badge: 'sb-streak',
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>' },
    { title: 'Learn', href: 'foundations.html', divider: true,
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>' },
    { title: 'Mindset', href: 'simulator-landing.html',
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.66z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-1.66z"/></svg>' },
    { title: 'Diagnostics', href: 'diagnostics.html', divider: true,
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>' },
    { title: 'Track', href: 'track-finances.html',
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>' },
    { title: 'Markets', href: 'markets.html', divider: true,
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>' },
    { title: 'Tools', href: 'tools.html',
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>' },
    { title: 'News', href: 'news.html', divider: true,
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M19 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h10l4 4v10a2 2 0 0 1-2 2z"/><line x1="8" y1="9" x2="14" y2="9"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="12" y2="17"/></svg>' },
  ];

  function _buildNavHTML(currentFile) {
    return CANONICAL_LINKS.map(item => {
      const active  = item.href === currentFile;
      const divider = item.divider ? '<hr class="sb-divider" aria-hidden="true"/>' : '';
      const badge   = item.badge ? `<span class="sb-badge" id="${item.badge}" aria-label="count"></span>` : '';
      return divider +
        `<a href="${item.href}" class="sb-link${active ? ' active' : ''}"` +
        `${active ? ' aria-current="page"' : ''} title="${item.title}">` +
        `<span class="sb-icon" aria-hidden="true">${item.icon}</span>` +
        `<span class="sb-label">${item.title}</span>${badge}</a>`;
    }).join('');
  }

  function _ensureCanonicalNav() {
    const nav = document.querySelector('.sb-nav');
    if (!nav) return;

    const current  = [...nav.querySelectorAll('.sb-link')].map(a => a.getAttribute('title'));
    const expected = CANONICAL_LINKS.map(i => i.title);

    // Fast path: already correct — zero DOM churn on the vast majority of pages.
    if (current.length === expected.length && current.every((t, i) => t === expected[i])) return;

    nav.innerHTML = _buildNavHTML(location.pathname.split('/').pop());
  }

  onReady(() => {
    _ensureCanonicalNav();   // must run before anything below hydrates into the nav (e.g. the streak badge)
    applyVars();   // re-apply in case sidebar DOM loaded after first try

    /* Avatar */
    const av = document.getElementById('sb-av');
    if (av) {
      av.textContent = init;
      av.style.background = `linear-gradient(145deg,${T.a},${T.b})`;
      av.style.boxShadow  = `0 1px 8px ${T.glow}`;
    }

    /* Logomark gradient also adapts */
    const lm = document.querySelector('.sb-logomark');
    if (lm) {
      lm.style.background = `linear-gradient(145deg,${T.a},${T.b})`;
      lm.style.boxShadow  = `0 2px 10px ${T.glow}`;
    }

    /* Name */
    const nm = document.getElementById('sb-name');
    if (nm) nm.textContent = first;

    /* DNA */
    const dn = document.getElementById('sb-dna');
    if (dn) {
      dn.textContent   = dna ? dna + ' DNA' : 'Set up profile →';
      dn.style.color   = dna ? T.a : 'rgba(255,255,255,.25)';
      dn.style.opacity = dna ? '.78' : '1';
    }

    /* Health pill */
    const hp = document.getElementById('sb-health-pill');
    if (hp && health > 0) {
      const emoji = health >= 70 ? '❤️' : health >= 45 ? '💛' : '❤️';
      const cls   = health >= 70 ? ''    : health >= 45 ? 'warn' : 'crit';
      hp.textContent = emoji + ' ' + Math.round(health);
      hp.classList.add('show');
      if (cls) hp.classList.add(cls);
    }

    /* Streak badge on Dashboard link */
    if (streak.count > 1) {
      const sb = document.getElementById('sb-streak');
      if (sb) {
        sb.textContent = streak.count + '';
        sb.classList.add('show');
      }
    }

    /* ⌘K shortcut */
    const cmd = document.getElementById('sb-cmd');
    if (cmd) {
      const open = () => {
        const el = document.getElementById('finos-search-trigger')
          || document.querySelector('[data-search-trigger]')
          || document.querySelector('.finos-search-input');
        el?.click?.(); el?.focus?.();
      };
      cmd.addEventListener('click', open);
      document.addEventListener('keydown', e => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); open(); }
      });
    }

    /* Progressive mode badge — injected below DNA line */
    const idBody = document.querySelector('.sb-identity-body');
    if (idBody && !idBody.querySelector('.sb-mode-pill')) {
      const mp = document.createElement('span');
      mp.className = 'sb-mode-pill finos-mode-badge';
      mp.style.cssText = 'display:block;font-size:10px;font-weight:700;' +
        'color:rgba(255,255,255,.28);letter-spacing:.04em;margin-top:2px;transition:color .3s;' +
        'background:none!important;border:none!important;padding:0!important;';
      idBody.appendChild(mp);
    }

    /* Load progressive-mode engine once, then apply */
    if (window.FinosMode) {
      window.FinosMode.applyMode(window.FinosMode.getMode?.() || 'starter');
    } else {
      const pm = document.createElement('script');
      pm.src = '../js/finos-progressive-mode.js?v=3';
      pm.onload = () => {
        window.FinosMode?.applyMode?.(
          localStorage.getItem('finos_complexity_mode') || 'starter'
        );
      };
      document.head.appendChild(pm);
    }

    /* Arya status */
    _checkArya();

    /* Nav badges */
    _navBadges();
    window.addEventListener('finos-context-ready', _navBadges);
  });

  /* ── Arya status display ─────────────────────────────────────────
     The actual probing (which endpoint, timeouts, retries) lives in
     arya-sidebar-panel.js's checkStatus() — that's the one loaded on every
     page with this markup, and it already checks both known Ollama
     endpoints on an interval. This used to duplicate that with its own
     weaker, one-shot, single-endpoint fetch that raced the real one and
     could disagree with it; now it just renders whatever the authoritative
     checker reports, live, for as long as the page stays open. */
  function _checkArya() {
    const dot = document.getElementById('sb-arya-dot');
    const txt = document.getElementById('sb-arya-status');
    if (!dot && !txt) return;

    const set = (state, label) => {
      if (dot) dot.className = 'sb-arya-dot ' + state;
      if (txt) { txt.className = 'sb-arya-status ' + state; txt.textContent = label; }
    };

    set('checking', 'Connecting…');
    if (typeof window._aryaOnline !== 'undefined') {
      set(window._aryaOnline ? 'online' : 'offline',
          window._aryaOnline ? 'Online · Ask anything' : 'Offline · Start Ollama');
    }

    window.addEventListener('arya-status-change', e => {
      set(e.detail?.online ? 'online' : 'offline',
          e.detail?.online ? 'Online · Ask anything' : 'Offline · Start Ollama');
    });
  }

  function _navBadges() {
    // `FinosPersona?.injectNavBadges` looks safe but isn't: optional chaining
    // only guards a null/undefined VALUE, not an unbound identifier — on any
    // page that doesn't load finos-personalization.js (most pages outside
    // home/dashboard), merely referencing the bare name threw an uncaught
    // ReferenceError here and silently skipped the rest of this callback.
    if (typeof FinosPersona !== 'undefined' && typeof FinosPersona.injectNavBadges === 'function') {
      FinosPersona.injectNavBadges();
    }
  }

  /* Some pages' sidebar markup drifted and lacks title="" on links; the
     injectors below key off titles, so backfill them from the visible
     label text to keep every page's sidebar identical. */
  function _normalizeLinkTitles(nav) {
    nav.querySelectorAll('.sb-link').forEach(a => {
      if (!a.getAttribute('title')) {
        const label = a.querySelector('.sb-label');
        if (label) a.setAttribute('title', label.textContent.trim());
      }
    });
  }

  /* ── Zone labels (injected once — works on all 96 pages) ────────────── */
  function _injectZoneLabels() {
    const nav = document.querySelector('.sb-nav');
    if (!nav || nav.querySelector('.sb-zone-label')) return;
    _normalizeLinkTitles(nav);

    // Inject CSS once
    const s = document.createElement('style');
    s.textContent = [
      '.sb-zone-label{display:block;font-size:9px;font-weight:700;letter-spacing:.13em;',
      'text-transform:uppercase;color:rgba(255,255,255,.22);padding:4px 10px 3px;',
      'pointer-events:none;user-select:none;}',
      '[data-theme="light"] .sb-zone-label{color:rgba(0,0,0,.28);}',
    ].join('');
    document.head.appendChild(s);

    // Group boundaries: insert a divider + label before each anchor title
    [
      { label: 'GROW',    before: 'Learn'   },
      { label: 'INVEST',  before: 'Track'   },
      { label: 'EXPLORE', before: 'Tools'   },
    ].forEach(({ label, before }) => {
      const link = nav.querySelector(`[title="${before}"]`);
      if (!link) return;
      // Learn/Markets/News already carry a static divider in every page's
      // own markup (only Track never does) — inserting another one here
      // unconditionally silently doubled up the rule on every page that had
      // one already. Only add it where one isn't already sitting right there.
      const already = link.previousElementSibling?.tagName === 'HR';
      if (!already) {
        const hr = document.createElement('hr');
        hr.className = 'sb-divider';
        hr.setAttribute('aria-hidden', 'true');
        nav.insertBefore(hr, link);
      }
      const span = document.createElement('span');
      span.className = 'sb-zone-label';
      span.setAttribute('aria-hidden', 'true');
      span.textContent = label;
      nav.insertBefore(span, link);
    });
  }

  onReady(_injectZoneLabels);

  /* ── Goals link (injected after Track — visible on all 96 pages) ─── */
  function _injectGoalsLink() {
    const nav = document.querySelector('.sb-nav');
    if (!nav) return;
    _normalizeLinkTitles(nav);
    if (nav.querySelector('[title="Goals"]')) return;

    const trackLink = nav.querySelector('[title="Track"]');
    if (!trackLink) return;

    const isHtml = location.pathname.includes('/html/');
    const href   = isHtml ? 'life-goals-planner.html' : 'html/life-goals-planner.html';
    const isActive = location.pathname.includes('life-goals-planner');

    const a = document.createElement('a');
    a.href = href;
    a.className = 'sb-link' + (isActive ? ' active' : '');
    a.title = 'Goals';
    if (isActive) a.setAttribute('aria-current', 'page');
    a.innerHTML =
      '<span class="sb-icon" aria-hidden="true">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' +
          '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>' +
        '</svg>' +
      '</span>' +
      '<span class="sb-label">Goals</span>';

    trackLink.after(a);
  }

  onReady(_injectGoalsLink);
})();
