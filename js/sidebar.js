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

  onReady(() => {
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

    /* Arya status */
    _checkArya();

    /* Nav badges */
    _navBadges();
    window.addEventListener('finos-context-ready', _navBadges);
  });

  /* ── Arya live probe ─────────────────────────────────────────── */
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
      return;
    }

    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 2000);
    fetch('http://127.0.0.1:11434/api/tags', { signal: ctrl.signal, mode: 'no-cors' })
      .then(() => set('online',  'Online · Ask anything'))
      .catch(() => set('offline', 'Offline · Start Ollama'));

    window.addEventListener('arya-status-change', e => {
      set(e.detail?.online ? 'online' : 'offline',
          e.detail?.online ? 'Online · Ask anything' : 'Offline · Start Ollama');
    }, { once: true });
  }

  function _navBadges() {
    if (typeof FinosPersona?.injectNavBadges === 'function') FinosPersona.injectNavBadges();
  }
})();
