/* ═══════════════════════════════════════════════════════════════════
   TRADEBOOK PRO — SELF-CONTAINED ROUTER
   Defines navigateTo + switchHubTab immediately so sidebar clicks
   always work, regardless of whether router.js exists or loads.
   ═══════════════════════════════════════════════════════════════════ */
(function() {
  'use strict';

  var PAGE_TITLES = {
    'dashboard':        'Dashboard',
    'journal':          'Trade Journal',
    'add-trade':        'Log Trade',
    'analytics-hub':    'Analytics Hub',
    'psych-hub':        'Psychology Hub',
    'tools-hub':        'Tools Hub',
    'institutional-hub':'Institutional',
    'settings':         'Settings',
  };

  /* Core page switcher — shows the right <section>, updates nav */
  window.navigateTo = function(page) {
    console.clear();
    console.log('%c[navigateTo] Starting navigation to:', 'color: #00ff88; font-weight: bold', page);
    
    // Get all page sections
    var allPages = document.querySelectorAll('.page');
    console.log('%c[navigateTo] Found pages:', 'color: #0ff', allPages.length);
    
    // Hide all pages - be very explicit
    allPages.forEach(function(p) {
      p.classList.remove('active');
      console.log('%c  Hid:', 'color: #f88', p.id);
    });

    // Find and show target page
    var target = document.getElementById('page-' + page);
    console.log('%c[navigateTo] Looking for:', 'color: #0ff', 'page-' + page);
    console.log('%c[navigateTo] Target found:', 'color: #0ff', !!target);
    
    if (!target) {
      console.warn('[navigateTo] Page not found, fallback to dashboard');
      target = document.getElementById('page-dashboard');
      page = 'dashboard';
    }
    
    if (target) {
      target.classList.add('active');
      var computed = window.getComputedStyle(target);
      console.log('%c✓ ACTIVATED:', 'color: #0f0; font-weight: bold', target.id);
      console.log('%c  Display:', 'color: #0f0', computed.display);
      console.log('%c  Visibility:', 'color: #0f0', computed.visibility);
    }

    // Update nav buttons
    document.querySelectorAll('.nav-item').forEach(function(btn) {
      var isActive = btn.dataset.page === page;
      btn.classList.toggle('active', isActive);
      if (isActive) {
        console.log('%c  Nav active:', 'color: #0f0', btn.dataset.page);
      }
    });

    // Update breadcrumb
    var bc = document.getElementById('breadcrumb');
    if (bc) bc.textContent = PAGE_TITLES[page] || page;

    // Close sidebar on mobile
    if (window.innerWidth <= 768) {
      var sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.classList.remove('open');
      var overlay = document.getElementById('sidebar-overlay');
      if (overlay) overlay.style.display = 'none';
    }

    // Update URL hash
    if (history.replaceState) {
      history.replaceState(null, '', '#' + page);
    }

    // Fire event 
    document.dispatchEvent(new CustomEvent('tb:navigate', { detail: { page: page } }));
  };

  /* Hub tab switcher */
  window.switchHubTab = function(hub, panel, btnEl) {
    var hubEl = document.getElementById('page-' + hub);
    if (!hubEl) return;

    hubEl.querySelectorAll('.hub-panel').forEach(function(p) {
      p.classList.remove('active');
    });
    var tabsEl = document.getElementById(hub + '-tabs');
    if (tabsEl) {
      tabsEl.querySelectorAll('.hub-tab').forEach(function(b) {
        b.classList.remove('active');
      });
    }

    var targetPanel = document.getElementById(hub + '-panel-' + panel);
    if (targetPanel) targetPanel.classList.add('active');
    if (btnEl) btnEl.classList.add('active');
  };

  /* Sidebar toggle for mobile */
  window.toggleSidebar = function() {
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('sidebar-overlay');
    if (!sidebar) return;
    var isOpen = sidebar.classList.toggle('open');
    if (overlay) overlay.style.display = isOpen ? 'block' : 'none';
  };
  
  window.closeSidebar = function() {
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.style.display = 'none';
  };

  /* Global search overlay */
  window.openGlobalSearch = function() {
    var el = document.getElementById('global-search-overlay');
    if (el) {
      el.classList.add('active');
      setTimeout(function() {
        var inp = document.getElementById('global-search-input');
        if (inp) inp.focus();
      }, 50);
    }
  };

  /* Wire nav buttons to respond to clicks */
  function wireNavigation() {
    document.querySelectorAll('.nav-item[data-page]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        var page = this.getAttribute('data-page');
        console.log('%c[wireSidebar] Button clicked:', 'color: #f0f', page);
        window.navigateTo(page);
      });
    });
  }

  /* Handle hash-based routing on load */
  function routeFromHash() {
    var hash = window.location.hash.replace('#', '');
    if (hash && document.getElementById('page-' + hash)) {
      window.navigateTo(hash);
    }
  }

  /* Initialize when DOM is ready */
  function init() {
    console.log('%c[init] Initializing TradeBook router', 'color: #0f0; font-weight: bold');
    
    // Verify pages exist
    var pageCount = document.querySelectorAll('.page').length;
    console.log('%c[init] Found %d pages', 'color: #0ff', pageCount);
    
    // Wire up navigation
    wireNavigation();
    
    // Handle hash-based navigation
    routeFromHash();
    
    console.log('%c[init] Router ready!', 'color: #0f0; font-weight: bold');
  }

  // Initialize when ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 100);
  }

  // Re-wire on load just to be safe
  window.addEventListener('load', function() {
    console.log('%c[load event] Re-wiring navigation', 'color: #ff0');
    wireNavigation();
  });

})();

/* ═══════════════════════════════════════════════════════════════════
   TRADEBOOK PRO — UPGRADES.JS
   All non-AI feature upgrades:
   1.  Theme toggle (Dark / Light / Sepia)
   2.  Full keyboard navigation
   3.  Onboarding wizard
   4.  Mobile bottom nav
   5.  CSV broker import (Zerodha, Upstox, Angel One)
   6.  Quick-add from ticker
   7.  Trade templates
   8.  Intraday time-of-day heatmap
   9.  Strategy comparison overlay
   10. Risk-adjusted return metrics (Sharpe, Sortino, Calmar)
   11. Symbol deep-dive
   12. Pre-trade checklist modal
   13. Daily loss limit enforcement
   14. Weekly review prompt
   15. Export to PDF / Excel (CSV)
   16. Multi-device vault PIN
   17. Trade history snapshots / backup
   18. Share vault read-only link
   19. Streak freeze token
   20. Monthly report card
   21. Options Greeks calculator
   22. Market session planner
   23. Prop firm challenge tracker
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ─── helpers ─────────────────────────────────────────── */
  function getTrades() {
    try { return JSON.parse(localStorage.getItem('tradebook_trades') || '[]'); } catch { return []; }
  }
  function getSettings() {
    try { return JSON.parse(localStorage.getItem('tradebook_settings') || '{}'); } catch { return {}; }
  }
  function saveSettings(s) { localStorage.setItem('tradebook_settings', JSON.stringify(s)); }
  function fmtINR(v) {
    const abs = Math.abs(v);
    if (abs >= 1e7) return '₹' + (v / 1e7).toFixed(2) + 'Cr';
    if (abs >= 1e5) return '₹' + (v / 1e5).toFixed(1) + 'L';
    if (abs >= 1e3) return '₹' + (v / 1e3).toFixed(1) + 'K';
    return '₹' + v.toFixed(0);
  }
  function fmtSigned(v) { return (v >= 0 ? '+' : '-') + fmtINR(Math.abs(v)); }
  function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast toast-show' + (type === 'error' ? ' toast-error' : type === 'warn' ? ' toast-warn' : '');
    clearTimeout(t._tid);
    t._tid = setTimeout(() => t.className = 'toast', 3000);
  }

  /* ══════════════════════════════════════════════════════════
     1. THEME TOGGLE — Dark / Light / Sepia
  ══════════════════════════════════════════════════════════ */
  (function initTheme() {
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
      }
    };

    function applyTheme(name) {
      const root = document.documentElement;
      // Remove all theme vars first
      Object.values(THEMES).forEach(vars => Object.keys(vars).forEach(k => root.style.removeProperty(k)));
      if (THEMES[name]) Object.entries(THEMES[name]).forEach(([k, v]) => root.style.setProperty(k, v));
      document.body.setAttribute('data-theme', name);
      localStorage.setItem('tb_theme', name);
      // Update theme buttons
      document.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === name));
    }

    window.setTheme = applyTheme;
    const saved = localStorage.getItem('tb_theme') || 'dark';
    applyTheme(saved);

    // Inject theme switcher into settings page on DOM ready
    document.addEventListener('DOMContentLoaded', () => {
      injectThemeSwitcher();
    });

    function injectThemeSwitcher() {
      const target = document.getElementById('page-settings');
      if (!target) return;
      if (document.getElementById('theme-switcher-section')) return;
      const sec = document.createElement('div');
      sec.id = 'theme-switcher-section';
      sec.className = 'form-section';
      sec.style.marginTop = '20px';
      sec.innerHTML = `
        <div class="form-section-title">🎨 App Theme</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
          <div style="width:100%;font-size:11px;color:var(--text3);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em">Professional Themes</div>
          <button class="theme-btn btn-secondary${saved==='institutional'?' active':''}" data-theme="institutional" onclick="setTheme('institutional')" style="display:flex;align-items:center;gap:8px;padding:10px 18px">
            <span style="width:14px;height:14px;border-radius:50%;background:#0b0e14;border:2px solid #10b981;display:inline-block"></span> Institutional
          </button>
          <button class="theme-btn btn-secondary${saved==='bloomberg'?' active':''}" data-theme="bloomberg" onclick="setTheme('bloomberg')" style="display:flex;align-items:center;gap:8px;padding:10px 18px">
            <span style="width:14px;height:14px;border-radius:50%;background:#000000;border:2px solid #f59e0b;display:inline-block"></span> Classic Terminal
          </button>
          <button class="theme-btn btn-secondary${saved==='midnight'?' active':''}" data-theme="midnight" onclick="setTheme('midnight')" style="display:flex;align-items:center;gap:8px;padding:10px 18px">
            <span style="width:14px;height:14px;border-radius:50%;background:#050b14;border:2px solid #3b82f6;display:inline-block"></span> Midnight
          </button>
          <button class="theme-btn btn-secondary${saved==='monochrome'?' active':''}" data-theme="monochrome" onclick="setTheme('monochrome')" style="display:flex;align-items:center;gap:8px;padding:10px 18px">
            <span style="width:14px;height:14px;border-radius:50%;background:#0f0f0f;border:2px solid #ffffff;display:inline-block"></span> Monochrome
          </button>
        </div>
        <style>
          .theme-btn.active { background:var(--accent-dim)!important;color:var(--accent)!important;border-color:var(--accent)!important; }
        </style>`;
      target.querySelector('.pages-container, .page-header')
        ? target.querySelector('.page-header')?.after(sec)
        : target.prepend(sec);
    }
  })();

  /* ══════════════════════════════════════════════════════════
     2. KEYBOARD NAVIGATION
  ══════════════════════════════════════════════════════════ */
  (function initKeyboard() {
    const PAGE_KEYS = {
      'd': 'dashboard', 'j': 'journal', 'l': 'add-trade',
      'a': 'analytics-hub', 'p': 'psych-hub', 't': 'tools-hub', 'i': 'institutional-hub', 's': 'settings'
    };
    document.addEventListener('keydown', (e) => {
      // Ignore if typing in input
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      // Ctrl+K = search (already handled by app.js, but ensure fallback)
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); window.openGlobalSearch?.(); return; }
      // Escape closes overlays
      if (e.key === 'Escape') {
        document.getElementById('global-search-overlay')?.classList.remove('active');
        document.querySelectorAll('.modal-overlay').forEach(m => { if (m.style.display !== 'none') m.style.display = 'none'; });
        document.getElementById('onboarding-overlay')?.remove();
        return;
      }
      // Single-key page navigation when search is closed
      const search = document.getElementById('global-search-overlay');
      if (search && search.classList.contains('active')) return;
      if (PAGE_KEYS[e.key.toLowerCase()] && !e.ctrlKey && !e.metaKey && !e.altKey) {
        window.navigateTo?.(PAGE_KEYS[e.key.toLowerCase()]);
      }
      // ? = show shortcuts
      if (e.key === '?') showKeyboardShortcuts();
    });

    function showKeyboardShortcuts() {
      const existing = document.getElementById('kb-shortcuts-modal');
      if (existing) { existing.remove(); return; }
      const m = document.createElement('div');
      m.id = 'kb-shortcuts-modal';
      m.className = 'modal-overlay';
      m.style.cssText = 'display:flex';
      m.innerHTML = `<div class="modal-box" style="max-width:420px">
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
        <div style="font-family:var(--font-display);font-size:20px;font-weight:800;margin-bottom:18px">⌨️ Keyboard Shortcuts</div>
        <div style="display:grid;grid-template-columns:auto 1fr;gap:8px 16px;font-size:13px">
          ${Object.entries({...PAGE_KEYS,'Ctrl+K':'Global Search','?':'Show Shortcuts','Esc':'Close/Cancel'})
            .map(([k,v])=>`<kbd style="background:var(--bg4);border:1px solid var(--border2);padding:2px 8px;border-radius:4px;font-family:var(--font-mono);font-size:11px">${k}</kbd><span style="color:var(--text2)">${v.charAt(0).toUpperCase()+v.slice(1).replace(/-/g,' ')}</span>`).join('')}
        </div>
      </div>`;
      m.onclick = e => { if (e.target === m) m.remove(); };
      document.body.appendChild(m);
    }
  })();

  /* ══════════════════════════════════════════════════════════
     3. ONBOARDING WIZARD
  ══════════════════════════════════════════════════════════ */
  (function initOnboarding() {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        const trades = getTrades();
        const settings = getSettings();
        const dismissed = localStorage.getItem('tb_onboarding_done');
        if (dismissed || trades.length > 0 || settings.username) return;
        showOnboarding();
      }, 800);
    });

    window.showOnboarding = showOnboarding;

    function showOnboarding() {
      if (document.getElementById('onboarding-overlay')) return;
      const steps = [
        {
          icon: '👋', title: "Welcome to TradeBook Pro",
          body: "Your professional trading journal. Let's set up your profile in 4 quick steps.",
          fields: `<div class="form-group"><label>Your Name</label><input class="form-input" id="ob-name" placeholder="e.g. Rahul Sharma" value="${getSettings().username||''}"></div>
          <div class="form-group" style="margin-top:12px"><label>Trading Style</label><select class="form-input" id="ob-style"><option value="Intraday Trader">Intraday Trader</option><option value="Swing Trader">Swing Trader</option><option value="Options Trader">Options Trader</option><option value="F&O Trader">F&O Trader</option><option value="Scalper">Scalper</option></select></div>`
        },
        {
          icon: '💰', title: "Your Capital & Targets",
          body: "Set your trading capital and weekly profit target. These power your dashboard stats.",
          fields: `<div class="form-group"><label>Trading Capital (₹)</label><input class="form-input" id="ob-capital" type="number" placeholder="e.g. 100000" value="${getSettings().capital||''}"></div>
          <div class="form-group" style="margin-top:12px"><label>Weekly Target (₹)</label><input class="form-input" id="ob-weekly" type="number" placeholder="e.g. 5000" value="${getSettings().weeklyTarget||''}"></div>`
        },
        {
          icon: '🛡️', title: "Risk Management",
          body: "Protect your capital. Set a daily loss limit — TradeBook will warn you when you hit it.",
          fields: `<div class="form-group"><label>Daily Loss Limit (₹)</label><input class="form-input" id="ob-dayloss" type="number" placeholder="e.g. 3000" value="${getSettings().dailyLossLimit||''}"></div>
          <div class="form-group" style="margin-top:12px"><label>Max Risk per Trade (%)</label><input class="form-input" id="ob-riskpct" type="number" step="0.5" placeholder="e.g. 1" value="${getSettings().riskPct||''}"></div>`
        },
        {
          icon: '🚀', title: "You're All Set!",
          body: "Your trading journal is ready. Log your first trade or explore the dashboard to see what TradeBook Pro can do.",
          fields: `<div style="background:var(--bg4);border-radius:var(--radius-sm);padding:16px;border:1px solid var(--border)">
            <div style="font-size:13px;color:var(--text2);line-height:1.8">
              ✅ Dashboard with live P&L tracking<br>
              ✅ Analytics Hub with 10+ chart types<br>
              ✅ Psychology Hub & discipline tracker<br>
              ✅ Pro tools: Kelly, Monte Carlo, Position Sizer<br>
              ✅ Cloud sync via Firebase (see SETUP.md)
            </div>
          </div>`
        }
      ];
      let current = 0;

      const overlay = document.createElement('div');
      overlay.id = 'onboarding-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(4px)';

      function render() {
        const s = steps[current];
        overlay.innerHTML = `
          <div style="background:var(--bg2);border:1px solid var(--border2);border-radius:var(--radius);padding:32px;max-width:460px;width:100%;position:relative">
            <div style="display:flex;justify-content:center;gap:8px;margin-bottom:24px">
              ${steps.map((_,i)=>`<div style="width:${i===current?24:8}px;height:8px;border-radius:4px;background:${i===current?'var(--accent)':i<current?'var(--accent)':'var(--bg4)'};transition:all 0.3s"></div>`).join('')}
            </div>
            <div style="font-size:36px;margin-bottom:12px;text-align:center">${s.icon}</div>
            <h2 style="font-family:var(--font-display);font-size:22px;font-weight:800;text-align:center;margin-bottom:8px">${s.title}</h2>
            <p style="font-size:13px;color:var(--text2);text-align:center;margin-bottom:20px;line-height:1.6">${s.body}</p>
            ${s.fields}
            <div style="display:flex;gap:10px;margin-top:24px">
              ${current > 0 ? `<button class="btn-secondary" onclick="window._obBack()" style="flex:0 0 auto">← Back</button>` : ''}
              <button class="btn-primary btn-save" onclick="window._obNext()" style="flex:1">${current === steps.length-1 ? '🚀 Start Trading' : 'Next →'}</button>
              <button class="btn-secondary" onclick="window._obSkip()" style="font-size:11px;padding:8px 12px;flex:0 0 auto">Skip</button>
            </div>
            <p style="text-align:center;font-size:11px;color:var(--text3);margin-top:12px">Step ${current+1} of ${steps.length}</p>
          </div>`;
      }

      window._obNext = function () {
        // Save current step data
        const s = getSettings();
        if (current === 0) {
          const n = document.getElementById('ob-name')?.value?.trim();
          const st = document.getElementById('ob-style')?.value;
          if (n) { s.username = n; document.getElementById('sidebar-username').textContent = n; document.getElementById('avatar-initials').textContent = n.split(' ').map(x=>x[0]).join('').toUpperCase().slice(0,2); }
          if (st) s.traderStyle = st;
        } else if (current === 1) {
          const c = document.getElementById('ob-capital')?.value; if (c) s.capital = parseFloat(c);
          const w = document.getElementById('ob-weekly')?.value; if (w) s.weeklyTarget = parseFloat(w);
        } else if (current === 2) {
          const d = document.getElementById('ob-dayloss')?.value; if (d) s.dailyLossLimit = parseFloat(d);
          const r = document.getElementById('ob-riskpct')?.value; if (r) s.riskPct = parseFloat(r);
        }
        saveSettings(s);
        if (current < steps.length - 1) { current++; render(); }
        else { overlay.remove(); localStorage.setItem('tb_onboarding_done', '1'); window.updateDashboard?.(); showToast('Profile set up! Ready to trade 🚀'); }
      };
      window._obBack = function () { if (current > 0) { current--; render(); } };
      window._obSkip = function () { overlay.remove(); localStorage.setItem('tb_onboarding_done', '1'); };

      render();
      document.body.appendChild(overlay);
    }
  })();

  /* ══════════════════════════════════════════════════════════
     4. MOBILE BOTTOM NAV
  ══════════════════════════════════════════════════════════ */
  (function initMobileNav() {
    document.addEventListener('DOMContentLoaded', function () {
      if (document.getElementById('mobile-bottom-nav')) return;
      var nav = document.createElement('nav');
      nav.id = 'mobile-bottom-nav';
      var items = [
        ['dashboard','⚡','Dashboard'],
        ['journal','📓','Journal'],
        ['add-trade','➕','Log'],
        ['analytics-hub','📊','Analytics'],
        ['tools-hub','🔬','Tools'],
      ];
      nav.innerHTML = items.map(function(item, i) {
        var page = item[0], icon = item[1], label = item[2];
        var extra = (page === 'add-trade') ? ' mbn-center' : '';
        return '<button class="mbn-item' + (i===0?' active':'') + extra + '" data-page="' + page + '">' +
          '<span class="mbn-icon">' + icon + '</span><span>' + label + '</span></button>';
      }).join('');
      document.body.appendChild(nav);

      window._mbnActive = function (el) {
        document.querySelectorAll('.mbn-item').forEach(function (b) { b.classList.remove('active'); });
        el.classList.add('active');
      };

      // Attach click at event-time — window.navigateTo resolves to whatever router.js set
      nav.querySelectorAll('.mbn-item').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (window.navigateTo) window.navigateTo(btn.dataset.page);
          window._mbnActive(btn);
        });
      });
    });
  })();

  /* ══════════════════════════════════════════════════════════
     5. CSV BROKER IMPORT
  ══════════════════════════════════════════════════════════ */
  window.openCSVImport = function () {
    const modal = document.getElementById('csv-import-modal');
    if (modal) { modal.style.display = 'flex'; return; }
    const m = document.createElement('div');
    m.id = 'csv-import-modal';
    m.className = 'modal-overlay';
    m.style.display = 'flex';
    m.onclick = e => { if (e.target === m) m.style.display = 'none'; };
    m.innerHTML = `
      <div class="modal-box" style="max-width:620px;width:100%">
        <button class="modal-close" onclick="document.getElementById('csv-import-modal').style.display='none'">✕</button>
        <div style="font-family:var(--font-display);font-size:20px;font-weight:800;margin-bottom:6px">📥 Import Trades from CSV</div>
        <p style="font-size:12px;color:var(--text2);margin-bottom:16px">Supports Zerodha Kite, Upstox, Angel One, and generic CSV format.</p>
        <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
          ${['Zerodha','Upstox','Angel One','Generic'].map(b=>`<button class="btn-secondary" style="font-size:12px;padding:6px 14px" onclick="window._selectBroker('${b}',this)">${b}</button>`).join('')}
        </div>
        <div id="csv-broker-hint" style="font-size:11px;color:var(--text3);margin-bottom:12px;background:var(--bg4);padding:10px;border-radius:var(--radius-sm)">
          Select your broker above, then paste CSV data or upload a file.
        </div>
        <textarea id="csv-paste-area" class="form-input form-textarea" style="min-height:140px;font-family:var(--font-mono);font-size:11px" placeholder="Paste CSV content here, or upload a file below…"></textarea>
        <div style="margin:10px 0;display:flex;align-items:center;gap:10px">
          <input type="file" id="csv-file-input" accept=".csv,.txt" style="font-size:12px;color:var(--text2)" onchange="window._loadCSVFile(this)">
        </div>
        <div id="csv-preview" style="margin-top:10px"></div>
        <div style="display:flex;gap:10px;margin-top:14px">
          <button class="btn-primary" onclick="window._parseAndImportCSV()" style="flex:1">🔍 Preview Import</button>
          <button class="btn-secondary" onclick="document.getElementById('csv-import-modal').style.display='none'">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(m);
  };

  const BROKER_HINTS = {
    Zerodha: 'Zerodha: Go to Console → Reports → Tradebook → Download CSV. Columns: trade_date, tradingsymbol, transaction_type, quantity, price, order_execution_time.',
    Upstox: 'Upstox: Go to Reports → Trade Book → Download. Columns: Trade Date, Symbol, Instrument, Buy/Sell, Qty, Avg Price, Net Amt.',
    'Angel One': 'Angel One: Go to Portfolio → Trade History → Export CSV. Columns: Trade Date, Symbol, Side, Qty, Price, Amount.',
    Generic: 'Generic: Use columns — date, symbol, direction (BUY/SELL), quantity, entry, exit, net. Or paste any CSV and map columns manually.'
  };

  window._selectBroker = function (broker, btn) {
    document.querySelectorAll('#csv-import-modal .btn-secondary').forEach(b => b.style.background = '');
    btn.style.background = 'var(--accent-dim)'; btn.style.color = 'var(--accent)';
    document.getElementById('csv-broker-hint').textContent = BROKER_HINTS[broker] || '';
    document.getElementById('csv-file-input').dataset.broker = broker;
    document.getElementById('csv-paste-area').dataset.broker = broker;
  };

  window._loadCSVFile = function (input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => { document.getElementById('csv-paste-area').value = e.target.result; };
    reader.readAsText(file);
  };

  window._parseAndImportCSV = function () {
    const raw = document.getElementById('csv-paste-area').value.trim();
    if (!raw) { showToast('Paste CSV data first', 'error'); return; }
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    const headers = lines[0].toLowerCase().split(',').map(h => h.replace(/[^a-z_]/g, '').trim());
    const rows = lines.slice(1);
    const parsed = [];
    const colMap = {};
    // Map known column patterns
    const mappings = {
      date: ['trade_date','tradedate','date','trade date','order_date'],
      symbol: ['tradingsymbol','symbol','scrip','instrument','scripname'],
      direction: ['transaction_type','buy_sell','side','trade type','buysell'],
      qty: ['quantity','qty','order qty'],
      entry: ['price','avg_price','rate','trade_price'],
      net: ['net_amt','net','p&l','profit_loss','pnl','netamount'],
    };
    Object.entries(mappings).forEach(([field, alts]) => {
      alts.forEach(a => { if (headers.includes(a) && !colMap[field]) colMap[field] = headers.indexOf(a); });
    });

    rows.forEach(row => {
      const cells = row.split(',').map(c => c.replace(/"/g,'').trim());
      const trade = {
        id: Date.now() + Math.random(),
        date: cells[colMap.date] || new Date().toISOString().split('T')[0],
        symbol: (cells[colMap.symbol] || 'UNKNOWN').toUpperCase(),
        direction: (cells[colMap.direction] || 'BUY').toUpperCase().includes('BUY') ? 'BUY' : 'SELL',
        qty: parseFloat(cells[colMap.qty]) || 1,
        entry: parseFloat(cells[colMap.entry]) || 0,
        exit: parseFloat(cells[colMap.exit]) || 0,
        net: parseFloat(cells[colMap.net]) || 0,
        strategy: 'Imported', emotion: 'Neutral', tags: [], notes: 'CSV Import',
        setup: 7, execution: 7, management: 7,
      };
      if (trade.net > 0) trade.outcome = 'win'; else if (trade.net < 0) trade.outcome = 'loss'; else trade.outcome = 'be';
      if (trade.date.includes('/')) {
        const parts = trade.date.split('/');
        if (parts[2] && parts[2].length === 4) trade.date = `${parts[2]}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`;
      }
      parsed.push(trade);
    });

    const preview = document.getElementById('csv-preview');
    if (!parsed.length) { preview.innerHTML = '<p style="color:var(--red);font-size:13px">Could not parse CSV. Check format.</p>'; return; }

    preview.innerHTML = `
      <div style="font-size:13px;color:var(--text2);margin-bottom:8px">Found <strong style="color:var(--accent)">${parsed.length}</strong> trades to import:</div>
      <div style="background:var(--bg4);border-radius:var(--radius-sm);max-height:160px;overflow-y:auto;padding:10px">
        <table style="width:100%;font-size:11px;border-collapse:collapse">
          <thead><tr style="color:var(--text3)">${['Date','Symbol','Dir','Qty','Net P&L'].map(h=>`<th style="text-align:left;padding:4px 8px">${h}</th>`).join('')}</tr></thead>
          <tbody>${parsed.slice(0,20).map(t=>`<tr style="border-top:1px solid var(--border)">
            <td style="padding:4px 8px;color:var(--text2)">${t.date}</td>
            <td style="padding:4px 8px;color:var(--accent);font-family:var(--font-mono)">${t.symbol}</td>
            <td style="padding:4px 8px;color:${t.direction==='BUY'?'var(--green)':'var(--red)'}">${t.direction}</td>
            <td style="padding:4px 8px">${t.qty}</td>
            <td style="padding:4px 8px;color:${t.net>=0?'var(--green)':'var(--red)'}font-family:var(--font-mono)">${fmtSigned(t.net)}</td>
          </tr>`).join('')}${parsed.length>20?`<tr><td colspan="5" style="padding:6px 8px;color:var(--text3)">...and ${parsed.length-20} more</td></tr>`:''}</tbody>
        </table>
      </div>
      <div style="display:flex;gap:10px;margin-top:12px">
        <button class="btn-primary" onclick="window._commitCSVImport(${JSON.stringify(parsed).replace(/"/g,'&quot;')})" style="flex:1">✅ Import ${parsed.length} Trades</button>
        <button class="btn-secondary" onclick="document.getElementById('csv-preview').innerHTML=''">Clear</button>
      </div>`;
  };

  window._commitCSVImport = function (parsed) {
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
    const existing = getTrades();
    // Dedup by date+symbol+net
    const keys = new Set(existing.map(t => `${t.date}|${t.symbol}|${t.net}`));
    const newTrades = parsed.filter(t => !keys.has(`${t.date}|${t.symbol}|${t.net}`));
    const merged = [...existing, ...newTrades];
    localStorage.setItem('tradebook_trades', JSON.stringify(merged));
    window.trades = merged;
    window.updateDashboard?.();
    document.getElementById('csv-import-modal').style.display = 'none';
    showToast(`Imported ${newTrades.length} trades (${parsed.length - newTrades.length} duplicates skipped) 📥`);
  };

  /* ══════════════════════════════════════════════════════════
     6. QUICK-ADD FROM TICKER
  ══════════════════════════════════════════════════════════ */
  (function initTickerQuickAdd() {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        document.querySelectorAll('.ticker-item').forEach(item => {
          item.style.cursor = 'pointer';
          item.title = 'Click to log a trade';
          item.addEventListener('click', () => {
            const text = item.textContent;
            const symbol = text.split(' ')[0].trim();
            window.navigateTo?.('add-trade');
            setTimeout(() => {
              const sym = document.getElementById('trade-symbol') || document.querySelector('[name=symbol]');
              if (sym) { sym.value = symbol; sym.dispatchEvent(new Event('input')); }
            }, 300);
          });
        });
        // Make ticker items visually hinted
        const style = document.createElement('style');
        style.textContent = `.ticker-item:hover { color: var(--accent) !important; text-decoration: underline; }`;
        document.head.appendChild(style);
      }, 500);
    });
  })();

  /* ══════════════════════════════════════════════════════════
     7. TRADE TEMPLATES
  ══════════════════════════════════════════════════════════ */
  (function initTradeTemplates() {
    function getTemplates() { try { return JSON.parse(localStorage.getItem('tb_templates') || '[]'); } catch { return []; } }
    function saveTemplates(t) { localStorage.setItem('tb_templates', JSON.stringify(t)); }

    window.openSaveTemplate = function () {
      const name = prompt('Template name (e.g. "BANKNIFTY Weekly Options"):');
      if (!name) return;
      const form = document.getElementById('trade-form') || document.querySelector('.trade-form-container');
      if (!form) { showToast('Open Log Trade page first', 'error'); return; }
      const get = id => document.getElementById(id)?.value || '';
      const tpl = {
        id: Date.now(), name,
        symbol: get('trade-symbol'), direction: get('trade-direction') || document.querySelector('.toggle-btn.active')?.textContent || 'BUY',
        strategy: get('trade-strategy'), timeframe: get('trade-timeframe'),
        tags: get('trade-tags'),
      };
      const templates = getTemplates();
      templates.push(tpl);
      saveTemplates(templates);
      showToast(`Template "${name}" saved ✅`);
      renderTemplateSelector();
    };

    window.applyTemplate = function (id) {
      const tpl = getTemplates().find(t => t.id === id);
      if (!tpl) return;
      const set = (elId, val) => { const el = document.getElementById(elId); if (el && val) { el.value = val; el.dispatchEvent(new Event('input')); } };
      set('trade-symbol', tpl.symbol); set('trade-strategy', tpl.strategy); set('trade-timeframe', tpl.timeframe); set('trade-tags', tpl.tags);
      if (tpl.direction) {
        document.querySelectorAll('.toggle-btn').forEach(b => b.classList.toggle('active', b.textContent.trim() === tpl.direction));
      }
      document.getElementById('trade-templates-dropdown').style.display = 'none';
      showToast(`Template "${tpl.name}" applied`);
    };

    window.deleteTemplate = function (id) {
      const templates = getTemplates().filter(t => t.id !== id);
      saveTemplates(templates);
      renderTemplateSelector();
      showToast('Template deleted');
    };

    function renderTemplateSelector() {
      const dd = document.getElementById('trade-templates-dropdown');
      if (!dd) return;
      const templates = getTemplates();
      if (!templates.length) { dd.innerHTML = '<div style="padding:10px;font-size:12px;color:var(--text3)">No saved templates. Save a filled form as a template!</div>'; return; }
      dd.innerHTML = templates.map(t => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid var(--border);cursor:pointer" onmouseenter="this.style.background='var(--bg4)'" onmouseleave="this.style.background=''">
          <span onclick="window.applyTemplate(${t.id})" style="flex:1;font-size:13px">${t.name} <span style="color:var(--text3);font-size:11px">${t.symbol||''} · ${t.strategy||''}</span></span>
          <button onclick="window.deleteTemplate(${t.id})" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:14px;padding:2px 6px">×</button>
        </div>`).join('');
    }

    document.addEventListener('DOMContentLoaded', () => {
      // Inject template UI into the Add Trade form
      setTimeout(() => {
        const formActions = document.querySelector('.form-actions');
        if (!formActions || document.getElementById('trade-templates-btn')) return;

        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'position:relative;display:inline-block';
        wrapper.innerHTML = `
          <button id="trade-templates-btn" class="btn-secondary" type="button" onclick="window._toggleTemplatesDD()" style="display:flex;align-items:center;gap:6px">
            📋 Templates
          </button>
          <div id="trade-templates-dropdown" style="display:none;position:absolute;bottom:calc(100% + 8px);left:0;width:280px;background:var(--bg2);border:1px solid var(--border2);border-radius:var(--radius-sm);z-index:200;max-height:220px;overflow-y:auto">
            <div style="padding:8px 12px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
              <span style="font-size:12px;font-weight:700;color:var(--text3)">SAVED TEMPLATES</span>
              <button onclick="window.openSaveTemplate()" style="font-size:11px;background:var(--accent-dim);color:var(--accent);border:none;padding:3px 8px;border-radius:4px;cursor:pointer">+ Save Current</button>
            </div>
            <div id="trade-templates-inner"></div>
          </div>`;
        formActions.prepend(wrapper);

        window._toggleTemplatesDD = function () {
          const dd = document.getElementById('trade-templates-dropdown');
          dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
          if (dd.style.display === 'block') {
            const inner = document.getElementById('trade-templates-inner');
            const templates = getTemplates();
            if (!templates.length) { inner.innerHTML = '<div style="padding:10px;font-size:12px;color:var(--text3)">No templates yet. Fill the form and save!</div>'; }
            else inner.innerHTML = templates.map(t=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border)" onmouseenter="this.style.background='var(--bg4)'" onmouseleave="this.style.background=''"><span onclick="window.applyTemplate(${t.id});document.getElementById('trade-templates-dropdown').style.display='none'" style="flex:1;font-size:13px">${t.name} <span style="color:var(--text3);font-size:11px">${t.symbol||''}</span></span><button onclick="window.deleteTemplate(${t.id})" style="background:none;border:none;cursor:pointer;color:var(--red);padding:2px 6px">×</button></div>`).join('');
          }
        };
        document.addEventListener('click', e => {
          if (!wrapper.contains(e.target)) { const dd = document.getElementById('trade-templates-dropdown'); if (dd) dd.style.display = 'none'; }
        });
      }, 600);
    });
  })();

  /* ══════════════════════════════════════════════════════════
     8. INTRADAY TIME-OF-DAY HEATMAP
  ══════════════════════════════════════════════════════════ */
  window.renderIntradayHeatmap = function () {
    const container = document.getElementById('intraday-heatmap-container');
    if (!container) return;
    const trades = getTrades().filter(t => t.entryTime);
    const slots = {};
    for (let h = 9; h <= 15; h++) {
      for (let m = 0; m < 60; m += 15) {
        if (h === 9 && m < 15) continue;
        if (h === 15 && m > 30) break;
        const key = `${h}:${String(m).padStart(2,'0')}`;
        slots[key] = { pnl: 0, count: 0, wins: 0 };
      }
    }
    trades.forEach(t => {
      const time = t.entryTime?.slice(0,5) || '';
      const [h,m] = time.split(':').map(Number);
      if (isNaN(h)) return;
      const bucket = Math.floor(m/15)*15;
      const key = `${h}:${String(bucket).padStart(2,'0')}`;
      if (slots[key]) {
        slots[key].pnl += parseFloat(t.net) || 0;
        slots[key].count++;
        if (parseFloat(t.net) > 0) slots[key].wins++;
      }
    });
    const keys = Object.keys(slots);
    const maxAbs = Math.max(...keys.map(k => Math.abs(slots[k].pnl)), 1);

    container.innerHTML = `
      <div style="overflow-x:auto">
        <div style="display:flex;flex-wrap:wrap;gap:4px;min-width:500px">
          ${keys.map(k => {
            const { pnl, count, wins } = slots[k];
            const intensity = Math.min(Math.abs(pnl) / maxAbs, 1);
            const bg = count === 0 ? 'var(--bg4)' : pnl > 0 ? `rgba(0,255,136,${0.1+intensity*0.6})` : `rgba(255,77,109,${0.1+intensity*0.6})`;
            const wr = count ? Math.round(wins/count*100) : 0;
            return `<div style="background:${bg};border:1px solid var(--border);border-radius:6px;padding:8px 10px;min-width:70px;cursor:default;position:relative" title="${k}: ${count} trades, ${fmtSigned(pnl)}, ${wr}% WR">
              <div style="font-size:10px;font-weight:700;color:var(--text3);font-family:var(--font-mono)">${k}</div>
              <div style="font-size:12px;font-weight:800;color:${pnl>0?'var(--green)':pnl<0?'var(--red)':'var(--text3)'};font-family:'JetBrains Mono',monospace">${count?fmtSigned(pnl):'—'}</div>
              <div style="font-size:10px;color:var(--text3)">${count?count+' trades':''}</div>
            </div>`;
          }).join('')}
        </div>
        <div style="display:flex;align-items:center;gap:12px;margin-top:12px;font-size:11px;color:var(--text3)">
          <div style="display:flex;align-items:center;gap:4px"><div style="width:12px;height:12px;border-radius:2px;background:rgba(0,255,136,0.5)"></div>Profitable slot</div>
          <div style="display:flex;align-items:center;gap:4px"><div style="width:12px;height:12px;border-radius:2px;background:rgba(255,77,109,0.5)"></div>Loss slot</div>
          <div style="display:flex;align-items:center;gap:4px"><div style="width:12px;height:12px;border-radius:2px;background:var(--bg4)"></div>No trades</div>
        </div>
      </div>`;
  };

  /* ══════════════════════════════════════════════════════════
     9. STRATEGY COMPARISON OVERLAY
  ══════════════════════════════════════════════════════════ */
  window.renderStrategyComparison = function () {
    const container = document.getElementById('strategy-comparison-container');
    if (!container) return;
    const trades = getTrades();
    const strategies = [...new Set(trades.map(t => t.strategy).filter(Boolean))];
    if (strategies.length < 2) {
      container.innerHTML = '<p style="color:var(--text3);font-size:13px">Log trades with at least 2 different strategies to compare.</p>';
      return;
    }
    // Build per-strategy equity curves
    const stratData = {};
    strategies.forEach(s => {
      const sts = trades.filter(t => t.strategy === s).sort((a,b) => new Date(a.date)-new Date(b.date));
      let running = 0;
      stratData[s] = { points: sts.map(t => { running += parseFloat(t.net)||0; return running; }), total: running, count: sts.length, wins: sts.filter(t=>(parseFloat(t.net)||0)>0).length };
    });

    const COLORS = ['#00ff88','#00d4ff','#f7b731','#ff4d6d','#a29bfe','#ff9f43'];
    const canvasId = 'strategyCompChart';
    container.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">
        ${strategies.map((s,i)=>`<div style="display:flex;align-items:center;gap:6px;background:var(--bg4);padding:8px 12px;border-radius:var(--radius-sm);font-size:12px">
          <div style="width:10px;height:10px;border-radius:2px;background:${COLORS[i%COLORS.length]}"></div>
          <span style="font-weight:700">${s}</span>
          <span style="color:${stratData[s].total>=0?'var(--green)':'var(--red)'};font-family:var(--font-mono)">${fmtSigned(stratData[s].total)}</span>
          <span style="color:var(--text3)">${stratData[s].count}T · ${Math.round(stratData[s].wins/stratData[s].count*100)}%WR</span>
        </div>`).join('')}
      </div>
      <div style="position:relative;height:240px"><canvas id="${canvasId}"></canvas></div>`;

    setTimeout(() => {
      const canvas = document.getElementById(canvasId);
      if (!canvas || !window.Chart) return;
      const maxLen = Math.max(...strategies.map(s => stratData[s].points.length));
      new window.Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
          labels: Array.from({length: maxLen}, (_,i) => `T${i+1}`),
          datasets: strategies.map((s,i) => ({
            label: s, data: stratData[s].points,
            borderColor: COLORS[i%COLORS.length], backgroundColor: 'transparent',
            borderWidth: 2, pointRadius: 0, tension: 0.35,
          }))
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { labels: { color: '#8892a4', font: { size: 11 } } } },
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#666', font: { size: 10 } } },
            y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#666', font: { size: 10 }, callback: v => fmtINR(v) } }
          }
        }
      });
    }, 100);
  };

  /* ══════════════════════════════════════════════════════════
     10. RISK-ADJUSTED RETURN METRICS
  ══════════════════════════════════════════════════════════ */
  window.renderRiskMetrics = function () {
    const container = document.getElementById('risk-metrics-container');
    if (!container) return;
    const trades = getTrades().sort((a,b) => new Date(a.date)-new Date(b.date));
    if (trades.length < 5) { container.innerHTML = '<p style="color:var(--text3);font-size:13px">Need at least 5 trades for risk metrics.</p>'; return; }

    // Daily returns
    const dailyMap = {};
    trades.forEach(t => { dailyMap[t.date] = (dailyMap[t.date]||0) + (parseFloat(t.net)||0); });
    const returns = Object.values(dailyMap);
    const avgR = returns.reduce((a,b)=>a+b,0)/returns.length;
    const stdDev = Math.sqrt(returns.reduce((s,r)=>s+(r-avgR)**2,0)/returns.length);
    const downReturns = returns.filter(r=>r<0);
    const downDev = downReturns.length ? Math.sqrt(downReturns.reduce((s,r)=>s+r**2,0)/downReturns.length) : 1;
    const sharpe = stdDev > 0 ? (avgR / stdDev * Math.sqrt(252)).toFixed(2) : '∞';
    const sortino = downDev > 0 ? (avgR / downDev * Math.sqrt(252)).toFixed(2) : '∞';

    // Max drawdown
    let peak = 0, equity = 0, maxDD = 0;
    trades.forEach(t => { equity += parseFloat(t.net)||0; peak = Math.max(peak, equity); maxDD = Math.max(maxDD, peak-equity); });
    const annualReturn = returns.reduce((a,b)=>a+b,0);
    const calmar = maxDD > 0 ? (annualReturn/maxDD).toFixed(2) : '∞';

    const metrics = [
      { name: 'Sharpe Ratio', value: sharpe, desc: '>1 good, >2 excellent', icon: '📐', color: parseFloat(sharpe)>1?'var(--green)':parseFloat(sharpe)>0?'var(--gold)':'var(--red)' },
      { name: 'Sortino Ratio', value: sortino, desc: 'Penalises downside only', icon: '⬇️', color: parseFloat(sortino)>1?'var(--green)':parseFloat(sortino)>0?'var(--gold)':'var(--red)' },
      { name: 'Calmar Ratio', value: calmar, desc: 'Return / Max DD', icon: '🌊', color: parseFloat(calmar)>1?'var(--green)':parseFloat(calmar)>0?'var(--gold)':'var(--red)' },
      { name: 'Daily Std Dev', value: fmtINR(stdDev), desc: 'Volatility of daily P&L', icon: '📊', color: 'var(--blue)' },
      { name: 'Best Day', value: fmtSigned(Math.max(...returns)), desc: 'Single best trading day', icon: '🏆', color: 'var(--green)' },
      { name: 'Worst Day', value: fmtSigned(Math.min(...returns)), desc: 'Single worst trading day', icon: '💔', color: 'var(--red)' },
    ];

    container.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px">
      ${metrics.map(m => `<div style="background:var(--bg4);border-radius:var(--radius-sm);padding:14px;border:1px solid var(--border)">
        <div style="font-size:18px;margin-bottom:6px">${m.icon}</div>
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text3);margin-bottom:4px">${m.name}</div>
        <div style="font-family:var(--font-display);font-size:22px;font-weight:800;color:${m.color}">${m.value}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px">${m.desc}</div>
      </div>`).join('')}
    </div>`;
  };

  /* ══════════════════════════════════════════════════════════
     11. SYMBOL DEEP-DIVE
  ══════════════════════════════════════════════════════════ */
  window.openSymbolDeepDive = function (symbol) {
    if (!symbol) {
      symbol = prompt('Enter symbol to analyse (e.g. NIFTY, BANKNIFTY):');
      if (!symbol) return;
    }
    symbol = symbol.toUpperCase();
    const trades = getTrades().filter(t => (t.symbol||'').toUpperCase() === symbol);
    if (!trades.length) { showToast(`No trades found for ${symbol}`, 'warn'); return; }

    const total = trades.reduce((s,t)=>s+(parseFloat(t.net)||0),0);
    const wins = trades.filter(t=>(parseFloat(t.net)||0)>0);
    const losses = trades.filter(t=>(parseFloat(t.net)||0)<0);
    const wr = trades.length ? Math.round(wins.length/trades.length*100) : 0;
    const avgWin = wins.length ? wins.reduce((s,t)=>s+(parseFloat(t.net)||0),0)/wins.length : 0;
    const avgLoss = losses.length ? losses.reduce((s,t)=>s+(parseFloat(t.net)||0),0)/losses.length : 0;
    const best = Math.max(...trades.map(t=>parseFloat(t.net)||0));
    const worst = Math.min(...trades.map(t=>parseFloat(t.net)||0));
    const sorted = [...trades].sort((a,b)=>new Date(a.date)-new Date(b.date));

    const m = document.createElement('div');
    m.className = 'modal-overlay';
    m.style.display = 'flex';
    m.onclick = e => { if (e.target===m) m.remove(); };
    m.innerHTML = `<div class="modal-box" style="max-width:640px;width:100%;max-height:90vh;overflow-y:auto">
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
      <div style="font-family:var(--font-display);font-size:22px;font-weight:800;margin-bottom:4px">🔍 ${symbol}</div>
      <div style="font-size:13px;color:var(--text2);margin-bottom:20px">${trades.length} trades analysed</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px">
        ${[
          ['Total P&L', fmtSigned(total), total>=0?'var(--green)':'var(--red)'],
          ['Win Rate', wr+'%', wr>=60?'var(--green)':wr>=40?'var(--gold)':'var(--red)'],
          ['Avg Win', fmtSigned(avgWin), 'var(--green)'],
          ['Avg Loss', fmtSigned(avgLoss), 'var(--red)'],
          ['Best Trade', fmtSigned(best), 'var(--green)'],
          ['Worst Trade', fmtSigned(worst), 'var(--red)'],
        ].map(([l,v,c])=>`<div style="background:var(--bg4);padding:12px;border-radius:var(--radius-sm);border:1px solid var(--border)">
          <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">${l}</div>
          <div style="font-family:var(--font-display);font-size:18px;font-weight:800;color:${c}">${v}</div>
        </div>`).join('')}
      </div>
      <div style="font-size:14px;font-weight:700;margin-bottom:10px">Recent Trades</div>
      <div style="max-height:200px;overflow-y:auto;background:var(--bg4);border-radius:var(--radius-sm)">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="color:var(--text3)">${['Date','Dir','Qty','Net P&L','Strategy'].map(h=>`<th style="padding:8px 12px;text-align:left;border-bottom:1px solid var(--border)">${h}</th>`).join('')}</tr></thead>
          <tbody>${sorted.slice(-15).reverse().map(t=>`<tr style="border-bottom:1px solid var(--border)">
            <td style="padding:8px 12px;color:var(--text2)">${t.date}</td>
            <td style="padding:8px 12px;color:${t.direction==='BUY'?'var(--green)':'var(--red)'}">${t.direction||'—'}</td>
            <td style="padding:8px 12px">${t.qty||'—'}</td>
            <td style="padding:8px 12px;color:${(parseFloat(t.net)||0)>=0?'var(--green)':'var(--red)'};font-family:var(--font-mono)">${fmtSigned(parseFloat(t.net)||0)}</td>
            <td style="padding:8px 12px;color:var(--text3)">${t.strategy||'—'}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
      <div style="position:relative;height:180px;margin-top:16px"><canvas id="symbol-dd-chart"></canvas></div>
    </div>`;
    document.body.appendChild(m);

    setTimeout(() => {
      const ctx = document.getElementById('symbol-dd-chart')?.getContext('2d');
      if (!ctx || !window.Chart) return;
      let running = 0;
      const points = sorted.map(t => { running += parseFloat(t.net)||0; return running; });
      const isPos = points[points.length-1] >= 0;
      const color = isPos ? '#00ff88' : '#ff4d6d';
      new window.Chart(ctx, {
        type:'line',
        data:{ labels: sorted.map(t=>t.date), datasets:[{ data:points, borderColor:color, backgroundColor:'transparent', borderWidth:2, pointRadius:2, tension:0.3 }] },
        options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x:{display:false}, y:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#666',font:{size:10},callback:v=>fmtINR(v)}} } }
      });
    }, 100);
  };

  /* ══════════════════════════════════════════════════════════
     12. PRE-TRADE CHECKLIST MODAL
  ══════════════════════════════════════════════════════════ */
  (function initPreTradeChecklist() {
    function getChecklist() {
      try { return JSON.parse(localStorage.getItem('tb_checklist') || 'null'); }
      catch { return null; }
    }
    function defaultChecklist() {
      return [
        { id: 1, text: 'Does this trade meet my setup criteria?' },
        { id: 2, text: 'Is my stop-loss set and within daily risk limit?' },
        { id: 3, text: 'Am I trading a high-confidence setup only?' },
        { id: 4, text: 'Have I checked market context (trend/regime)?' },
        { id: 5, text: 'Am I trading with a clear head (no revenge/FOMO)?' },
      ];
    }

    window.openPreTradeChecklist = function (onConfirm) {
      if (!localStorage.getItem('tb_checklist_enabled')) { onConfirm?.(); return; }
      const checklist = getChecklist() || defaultChecklist();
      const m = document.createElement('div');
      m.className = 'modal-overlay';
      m.style.display = 'flex';
      m.innerHTML = `<div class="modal-box" style="max-width:460px">
        <div style="font-family:var(--font-display);font-size:20px;font-weight:800;margin-bottom:6px">✅ Pre-Trade Checklist</div>
        <p style="font-size:12px;color:var(--text2);margin-bottom:16px">Complete before logging this trade.</p>
        <div id="ptc-items" style="display:flex;flex-direction:column;gap:10px">
          ${checklist.map(item=>`<label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:10px;background:var(--bg4);border-radius:var(--radius-sm);border:1px solid var(--border)">
            <input type="checkbox" id="ptc-${item.id}" style="margin-top:2px;accent-color:var(--accent)">
            <span style="font-size:13px;color:var(--text)">${item.text}</span>
          </label>`).join('')}
        </div>
        <div id="ptc-warning" style="display:none;background:rgba(255,77,109,0.1);border:1px solid rgba(255,77,109,0.3);border-radius:var(--radius-sm);padding:10px;margin-top:12px;font-size:12px;color:var(--red)">
          ⚠️ You haven't checked all items. Are you sure you want to proceed?
        </div>
        <div style="display:flex;gap:10px;margin-top:16px">
          <button class="btn-primary" onclick="window._ptcConfirm()" style="flex:1">✅ Looks Good</button>
          <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        </div>
      </div>`;
      window._ptcConfirm = function () {
        const all = checklist.every(item => document.getElementById(`ptc-${item.id}`)?.checked);
        if (!all) { document.getElementById('ptc-warning').style.display = 'block'; if (!window._ptcForced) { window._ptcForced = true; return; } }
        window._ptcForced = false;
        m.remove();
        onConfirm?.();
      };
      document.body.appendChild(m);
    };

    // Inject checklist toggle into settings
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        const settings = document.getElementById('page-settings');
        if (!settings || document.getElementById('ptc-settings-section')) return;
        const sec = document.createElement('div');
        sec.id = 'ptc-settings-section';
        sec.className = 'form-section';
        sec.style.marginTop = '16px';
        const enabled = !!localStorage.getItem('tb_checklist_enabled');
        const checklist = getChecklist() || defaultChecklist();
        sec.innerHTML = `<div class="form-section-title">✅ Pre-Trade Checklist</div>
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;margin-bottom:14px">
            <input type="checkbox" id="ptc-toggle" ${enabled?'checked':''} style="accent-color:var(--accent)" onchange="window._toggleChecklist(this.checked)">
            <span style="font-size:13px">Show checklist before logging each trade</span>
          </label>
          <div id="ptc-items-settings" style="${enabled?'':'opacity:.4;pointer-events:none'}">
            <div style="font-size:12px;color:var(--text3);margin-bottom:8px">Checklist items:</div>
            ${checklist.map(item=>`<div style="display:flex;align-items:center;gap:8px;padding:8px;background:var(--bg4);border-radius:6px;margin-bottom:6px;border:1px solid var(--border)">
              <span style="flex:1;font-size:12px">${item.text}</span>
            </div>`).join('')}
            <div style="font-size:11px;color:var(--text3);margin-top:6px">Edit checklist.json in settings to customise items.</div>
          </div>`;
        window._toggleChecklist = function (on) {
          if (on) localStorage.setItem('tb_checklist_enabled','1'); else localStorage.removeItem('tb_checklist_enabled');
          document.getElementById('ptc-items-settings').style.opacity = on?'1':'0.4';
          document.getElementById('ptc-items-settings').style.pointerEvents = on?'':'none';
        };
        settings.appendChild(sec);
      }, 700);
    });
  })();

  /* ══════════════════════════════════════════════════════════
     13. DAILY LOSS LIMIT ENFORCEMENT
  ══════════════════════════════════════════════════════════ */
  (function initDailyLossLimit() {
    function checkDailyLimit() {
      const settings = getSettings();
      const limit = parseFloat(settings.dailyLossLimit);
      if (!limit) return;
      const today = new Date().toISOString().split('T')[0];
      const todayPnl = getTrades().filter(t => t.date === today).reduce((s,t) => s+(parseFloat(t.net)||0), 0);
      if (todayPnl <= -Math.abs(limit)) {
        showDailyLossAlert(todayPnl, limit);
      }
    }

    function showDailyLossAlert(pnl, limit) {
      if (document.getElementById('daily-loss-banner')) return;
      const banner = document.createElement('div');
      banner.id = 'daily-loss-banner';
      banner.style.cssText = `position:fixed;top:0;left:0;right:0;z-index:9998;background:rgba(255,77,109,0.95);color:#fff;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;font-weight:600;font-size:13px;backdrop-filter:blur(4px)`;
      banner.innerHTML = `<span>⚠️ Daily loss limit reached! P&L today: <strong>${fmtSigned(pnl)}</strong> / Limit: <strong>-${fmtINR(Math.abs(limit))}</strong> — Consider stopping for today.</span>
        <div style="display:flex;gap:10px;align-items:center">
          <button id="dll-override-btn" style="background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.4);color:#fff;padding:5px 12px;border-radius:6px;cursor:pointer;font-size:12px" onclick="window._dllOverride()">Override (30s)</button>
          <button style="background:none;border:none;color:#fff;cursor:pointer;font-size:18px" onclick="document.getElementById('daily-loss-banner').remove()">✕</button>
        </div>`;
      document.body.prepend(banner);
      // Adjust main content
      document.querySelector('.main-content').style.paddingTop = '44px';
    }

    window._dllOverride = function () {
      let sec = 30;
      const btn = document.getElementById('dll-override-btn');
      if (!btn) return;
      btn.disabled = true;
      const interval = setInterval(() => {
        sec--;
        if (btn) btn.textContent = `Wait... ${sec}s`;
        if (sec <= 0) {
          clearInterval(interval);
          const banner = document.getElementById('daily-loss-banner');
          if (banner) { banner.style.background='rgba(247,183,49,0.95)'; banner.querySelector('span').textContent='⚠️ Override active — trade with extra caution today.'; }
          if (btn) { btn.textContent='Overridden'; btn.disabled=false; }
        }
      }, 1000);
    };

    // Check on load
    document.addEventListener('DOMContentLoaded', function () { setTimeout(checkDailyLimit, 1200); });
    // Hook saveTrade after all scripts load
    window.addEventListener('load', function () {
      var origSave = window.saveTrade;
      if (typeof origSave === 'function') {
        window.saveTrade = function () {
          var result = origSave.apply(this, arguments);
          setTimeout(checkDailyLimit, 500);
          return result;
        };
      }
    });
  })();

  /* ══════════════════════════════════════════════════════════
     14. WEEKLY REVIEW PROMPT
  ══════════════════════════════════════════════════════════ */
  (function initWeeklyReview() {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        const today = new Date();
        if (today.getDay() !== 1) return; // Monday only
        const thisWeek = `week-${today.getFullYear()}-${Math.floor(today.getDate()/7)}`;
        if (localStorage.getItem('tb_reviewed_' + thisWeek)) return;

        // Get last week's stats
        const lastMonday = new Date(today); lastMonday.setDate(today.getDate()-7);
        const lastSunday = new Date(today); lastSunday.setDate(today.getDate()-1);
        const trades = getTrades().filter(t => {
          const d = new Date(t.date+'T00:00:00');
          return d >= lastMonday && d <= lastSunday;
        });
        if (!trades.length) return;

        const total = trades.reduce((s,t)=>s+(parseFloat(t.net)||0),0);
        const wins = trades.filter(t=>(parseFloat(t.net)||0)>0).length;
        const best = trades.reduce((a,b)=>(parseFloat(a.net)||0)>(parseFloat(b.net)||0)?a:b, trades[0]);
        const worst = trades.reduce((a,b)=>(parseFloat(a.net)||0)<(parseFloat(b.net)||0)?a:b, trades[0]);

        const m = document.createElement('div');
        m.className = 'modal-overlay';
        m.style.display = 'flex';
        m.innerHTML = `<div class="modal-box" style="max-width:500px">
          <div style="font-family:var(--font-display);font-size:22px;font-weight:800;margin-bottom:4px">📋 Weekly Review</div>
          <p style="font-size:12px;color:var(--text2);margin-bottom:16px">Week of ${lastMonday.toLocaleDateString('en-IN',{day:'numeric',month:'short'})} – ${lastSunday.toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
            ${[['Total P&L',fmtSigned(total),total>=0?'var(--green)':'var(--red)'],['Trades',trades.length,'var(--blue)'],['Win Rate',Math.round(wins/trades.length*100)+'%',wins/trades.length>=.5?'var(--green)':'var(--red)'],['Best Trade',fmtSigned(parseFloat(best?.net)||0),'var(--green)']].map(([l,v,c])=>`<div style="background:var(--bg4);padding:10px;border-radius:var(--radius-sm)"><div style="font-size:10px;color:var(--text3);margin-bottom:4px">${l}</div><div style="font-family:var(--font-display);font-size:18px;font-weight:800;color:${c}">${v}</div></div>`).join('')}
          </div>
          <div class="form-group">
            <label>Your reflection — what did you learn this week?</label>
            <textarea id="weekly-review-text" class="form-input form-textarea" placeholder="Write your key takeaway, what to improve, what worked…" style="min-height:80px"></textarea>
          </div>
          <div style="display:flex;gap:10px;margin-top:14px">
            <button class="btn-primary" onclick="window._saveWeeklyReview('${thisWeek}')" style="flex:1">Save Review ✅</button>
            <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Skip</button>
          </div>
        </div>`;
        window._saveWeeklyReview = function(wk) {
          const text = document.getElementById('weekly-review-text')?.value || '';
          const reviews = JSON.parse(localStorage.getItem('tb_weekly_reviews')||'[]');
          reviews.push({ week: wk, date: new Date().toISOString(), text, stats: {total, trades: trades.length, wins} });
          localStorage.setItem('tb_weekly_reviews', JSON.stringify(reviews));
          localStorage.setItem('tb_reviewed_' + wk, '1');
          m.remove();
          showToast('Weekly review saved 📋');
        };
        setTimeout(() => document.body.appendChild(m), 2000);
      }, 1500);
    });
  })();

  /* ══════════════════════════════════════════════════════════
     15. EXPORT TO PDF / EXCEL (CSV)
  ══════════════════════════════════════════════════════════ */
  window.openExport = function () {
    const existing = document.getElementById('export-modal');
    if (existing) { existing.style.display='flex'; return; }
    const m = document.createElement('div');
    m.id = 'export-modal';
    m.className = 'modal-overlay';
    m.style.display = 'flex';
    m.onclick = e => { if(e.target===m) m.style.display='none'; };
    const today = new Date().toISOString().split('T')[0];
    const trades = getTrades();
    const minDate = trades.length ? trades.reduce((a,b)=>a.date<b.date?a:b).date : today;
    m.innerHTML = `<div class="modal-box" style="max-width:440px">
      <button class="modal-close" onclick="document.getElementById('export-modal').style.display='none'">✕</button>
      <div style="font-family:var(--font-display);font-size:20px;font-weight:800;margin-bottom:16px">📤 Export Trades</div>
      <div class="form-row" style="margin-bottom:14px">
        <div class="form-group"><label>From Date</label><input type="date" id="exp-from" class="form-input" value="${minDate}"></div>
        <div class="form-group"><label>To Date</label><input type="date" id="exp-to" class="form-input" value="${today}"></div>
      </div>
      <div class="form-group" style="margin-bottom:16px">
        <label>Format</label>
        <select id="exp-format" class="form-input">
          <option value="csv">CSV (Excel-compatible)</option>
          <option value="json">JSON (Full backup)</option>
          <option value="html">HTML Report (printable PDF)</option>
        </select>
      </div>
      <div style="display:flex;gap:10px">
        <button class="btn-primary" onclick="window._doExport()" style="flex:1">⬇️ Download</button>
        <button class="btn-secondary" onclick="document.getElementById('export-modal').style.display='none'">Cancel</button>
      </div>
    </div>`;
    document.body.appendChild(m);
  };

  window._doExport = function () {
    const from = document.getElementById('exp-from').value;
    const to = document.getElementById('exp-to').value;
    const format = document.getElementById('exp-format').value;
    const trades = getTrades().filter(t => t.date >= from && t.date <= to).sort((a,b)=>a.date.localeCompare(b.date));
    if (!trades.length) { showToast('No trades in date range', 'warn'); return; }
    const settings = getSettings();

    if (format === 'csv') {
      const headers = ['Date','Symbol','Direction','Qty','Entry','Exit','Net P&L','Gross P&L','Charges','Strategy','Emotion','Setup Score','Notes'];
      const rows = trades.map(t => [t.date,t.symbol||'',t.direction||'',t.qty||'',t.entry||'',t.exit||'',t.net||0,t.gross||t.net||0,t.charges||0,t.strategy||'',t.emotion||'',t.qualityScore||'',`"${(t.notes||'').replace(/"/g,"'")}"`]);
      const csv = [headers.join(','), ...rows.map(r=>r.join(','))].join('\n');
      downloadFile(`tradebook_${from}_${to}.csv`, csv, 'text/csv');
    } else if (format === 'json') {
      downloadFile(`tradebook_backup_${today}.json`, JSON.stringify({trades, settings, exported: new Date().toISOString()}, null, 2), 'application/json');
    } else if (format === 'html') {
      const total = trades.reduce((s,t)=>s+(parseFloat(t.net)||0),0);
      const wins = trades.filter(t=>(parseFloat(t.net)||0)>0).length;
      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>TradeBook Report ${from} to ${to}</title><style>
        body{font-family:Arial,sans-serif;padding:20px;color:#111;background:#fff}
        h1{color:#00a86b;font-size:24px}h2{font-size:16px;margin-top:20px}
        .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:16px 0}
        .stat{background:#f5f5f5;padding:12px;border-radius:6px}
        .stat-label{font-size:10px;text-transform:uppercase;color:#666}
        .stat-val{font-size:20px;font-weight:bold;margin-top:4px}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th{background:#f0f0f0;padding:8px;text-align:left;border-bottom:2px solid #ddd}
        td{padding:8px;border-bottom:1px solid #eee}
        .win{color:green}.loss{color:red}
        @media print{@page{margin:15mm}}
      </style></head><body>
        <h1>TradeBook Pro — Trade Report</h1>
        <div style="color:#666;font-size:13px">${from} to ${to} · Exported ${new Date().toLocaleDateString('en-IN')}</div>
        <div class="stats">
          <div class="stat"><div class="stat-label">Net P&L</div><div class="stat-val ${total>=0?'win':'loss'}">${fmtSigned(total)}</div></div>
          <div class="stat"><div class="stat-label">Trades</div><div class="stat-val">${trades.length}</div></div>
          <div class="stat"><div class="stat-label">Win Rate</div><div class="stat-val">${Math.round(wins/trades.length*100)}%</div></div>
          <div class="stat"><div class="stat-label">Avg P&L/Trade</div><div class="stat-val ${total>=0?'win':'loss'}">${fmtSigned(total/trades.length)}</div></div>
        </div>
        <h2>Trade Log</h2>
        <table><thead><tr>${['Date','Symbol','Dir','Qty','Net P&L','Strategy','Emotion','Notes'].map(h=>`<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${trades.map(t=>`<tr><td>${t.date}</td><td><strong>${t.symbol||''}</strong></td><td class="${t.direction==='BUY'?'win':'loss'}">${t.direction||''}</td><td>${t.qty||''}</td><td class="${(parseFloat(t.net)||0)>=0?'win':'loss'}">${fmtSigned(parseFloat(t.net)||0)}</td><td>${t.strategy||''}</td><td>${t.emotion||''}</td><td>${t.notes||''}</td></tr>`).join('')}</tbody>
        </table><p style="font-size:10px;color:#999;margin-top:20px">Generated by TradeBook Pro · ${new Date().toLocaleString('en-IN')}</p>
      </body></html>`;
      downloadFile(`tradebook_report_${from}_${to}.html`, html, 'text/html');
    }
    document.getElementById('export-modal').style.display = 'none';
    showToast('Export downloaded ✅');
  };

  function downloadFile(name, content, type) {
    const blob = new Blob([content], {type});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  window.downloadFile = downloadFile;

  /* ══════════════════════════════════════════════════════════
     16. VAULT PIN LOGIN
  ══════════════════════════════════════════════════════════ */
  window.openPINSetup = function () {
    const m = document.createElement('div');
    m.className = 'modal-overlay';
    m.style.display = 'flex';
    m.innerHTML = `<div class="modal-box" style="max-width:380px;text-align:center">
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
      <div style="font-size:32px;margin-bottom:12px">🔐</div>
      <div style="font-family:var(--font-display);font-size:20px;font-weight:800;margin-bottom:6px">Set Vault PIN</div>
      <p style="font-size:12px;color:var(--text2);margin-bottom:16px">Create a 4-digit PIN for faster login. Your PIN is hashed — never stored in plaintext.</p>
      <div class="form-group" style="margin-bottom:12px"><label>New PIN (4 digits)</label><input type="password" id="pin-new" class="form-input" maxlength="4" inputmode="numeric" pattern="[0-9]*" placeholder="••••" style="text-align:center;letter-spacing:.3em;font-size:20px"></div>
      <div class="form-group" style="margin-bottom:16px"><label>Confirm PIN</label><input type="password" id="pin-confirm" class="form-input" maxlength="4" inputmode="numeric" pattern="[0-9]*" placeholder="••••" style="text-align:center;letter-spacing:.3em;font-size:20px"></div>
      <button class="btn-primary" onclick="window._savePIN()" style="width:100%">Set PIN</button>
    </div>`;
    document.body.appendChild(m);
  };

  window._savePIN = async function () {
    const pin = document.getElementById('pin-new')?.value;
    const confirm = document.getElementById('pin-confirm')?.value;
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) { showToast('Enter a 4-digit PIN', 'error'); return; }
    if (pin !== confirm) { showToast('PINs do not match', 'error'); return; }
    const hash = await sha256(pin);
    localStorage.setItem('tb_pin_hash', hash);
    document.querySelector('#pin-new')?.closest('.modal-overlay')?.remove();
    showToast('PIN set! You can now use it for quick login 🔐');
  };

  async function sha256(str) {
    if (window.crypto?.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
      return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
    }
    // Fallback simple hash (not cryptographic — for display only)
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash) + str.charCodeAt(i), hash |= 0;
    return Math.abs(hash).toString(16);
  }
  window.sha256 = sha256;

  /* ══════════════════════════════════════════════════════════
     17. TRADE HISTORY SNAPSHOTS / BACKUP
  ══════════════════════════════════════════════════════════ */
  (function initSnapshots() {
    function getSnapshots() { try { return JSON.parse(localStorage.getItem('tb_snapshots') || '[]'); } catch { return []; } }
    function saveSnapshot() {
      const snaps = getSnapshots();
      const snap = {
        id: Date.now(),
        date: new Date().toISOString(),
        label: new Date().toLocaleDateString('en-IN', {day:'numeric',month:'short',year:'numeric'}),
        trades: getTrades(),
        settings: getSettings(),
        tradeCount: getTrades().length,
        totalPnl: getTrades().reduce((s,t)=>s+(parseFloat(t.net)||0),0)
      };
      snaps.unshift(snap);
      // Keep last 20 snapshots
      if (snaps.length > 20) snaps.pop();
      localStorage.setItem('tb_snapshots', JSON.stringify(snaps));
      return snap;
    }

    window.createSnapshot = function () {
      const snap = saveSnapshot();
      showToast(`Snapshot saved: ${snap.tradeCount} trades, ${fmtSigned(snap.totalPnl)} 📸`);
      renderSnapshotManager();
    };

    window.restoreSnapshot = function (id) {
      if (!confirm('Restore this snapshot? Your current trades will be replaced.')) return;
      const snaps = getSnapshots();
      const snap = snaps.find(s => s.id === id);
      if (!snap) { showToast('Snapshot not found', 'error'); return; }
      localStorage.setItem('tradebook_trades', JSON.stringify(snap.trades));
      saveSettings(snap.settings);
      window.trades = snap.trades;
      window.updateDashboard?.();
      showToast(`Restored to ${snap.label} ✅`);
    };

    window.deleteSnapshot = function (id) {
      const snaps = getSnapshots().filter(s => s.id !== id);
      localStorage.setItem('tb_snapshots', JSON.stringify(snaps));
      renderSnapshotManager();
      showToast('Snapshot deleted');
    };

    window.renderSnapshotManager = function () {
      const container = document.getElementById('snapshot-manager-container');
      if (!container) return;
      const snaps = getSnapshots();
      if (!snaps.length) {
        container.innerHTML = `<p style="color:var(--text3);font-size:13px">No snapshots yet. Create one to back up your data.</p>`;
        return;
      }
      container.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px">
        ${snaps.map(s=>`<div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg4);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px 16px">
          <div>
            <div style="font-size:13px;font-weight:600">${s.label}</div>
            <div style="font-size:11px;color:var(--text3)">${s.tradeCount} trades · Net ${fmtSigned(s.totalPnl)}</div>
          </div>
          <div style="display:flex;gap:8px">
            <button class="tbl-btn tbl-btn-edit" onclick="window.restoreSnapshot(${s.id})">Restore</button>
            <button class="tbl-btn tbl-btn-del" onclick="window.deleteSnapshot(${s.id})">Delete</button>
          </div>
        </div>`).join('')}
      </div>`;
    };

    // Auto-snapshot weekly
    document.addEventListener('DOMContentLoaded', () => {
      const lastSnap = localStorage.getItem('tb_last_auto_snap');
      const now = Date.now();
      if (!lastSnap || now - parseInt(lastSnap) > 7 * 24 * 3600 * 1000) {
        if (getTrades().length > 0) {
          saveSnapshot();
          localStorage.setItem('tb_last_auto_snap', now.toString());
        }
      }
    });
  })();

  /* ══════════════════════════════════════════════════════════
     18. SHARE VAULT (READ-ONLY LINK)
  ══════════════════════════════════════════════════════════ */
  window.openShareVault = function () {
    const m = document.createElement('div');
    m.className = 'modal-overlay';
    m.style.display = 'flex';
    m.onclick = e => { if(e.target===m) m.remove(); };

    const trades = getTrades();
    const total = trades.reduce((s,t)=>s+(parseFloat(t.net)||0),0);
    const wins = trades.filter(t=>(parseFloat(t.net)||0)>0).length;
    const wr = trades.length ? Math.round(wins/trades.length*100) : 0;

    // Encode a compact snapshot as base64 URL param
    const shareData = {
      trades: trades.slice(-50).map(t=>({date:t.date,symbol:t.symbol,net:t.net,direction:t.direction,strategy:t.strategy})),
      stats: { total, trades: trades.length, wr },
      generated: new Date().toISOString(),
      expires: new Date(Date.now() + 7*24*3600*1000).toISOString(),
    };
    const encoded = btoa(JSON.stringify(shareData));
    const shareUrl = `${window.location.origin}${window.location.pathname}?view=${encoded}`;

    m.innerHTML = `<div class="modal-box" style="max-width:480px">
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
      <div style="font-family:var(--font-display);font-size:20px;font-weight:800;margin-bottom:6px">🔗 Share Vault</div>
      <p style="font-size:12px;color:var(--text2);margin-bottom:16px">Share a read-only view of your last 50 trades. Link expires in 7 days. No password included.</p>
      <div style="background:var(--bg4);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px;margin-bottom:14px">
        <div style="font-size:10px;color:var(--text3);margin-bottom:4px">SHARE PREVIEW</div>
        <div style="font-size:13px;color:var(--text2)">${trades.length} trades · ${fmtSigned(total)} net · ${wr}% win rate</div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px">Last 50 trades included · No personal data</div>
      </div>
      <div class="form-group" style="margin-bottom:14px">
        <label>Share Link</label>
        <div style="display:flex;gap:8px">
          <input class="form-input" value="${shareUrl}" readonly style="font-size:11px;font-family:var(--font-mono)">
          <button class="btn-primary" onclick="navigator.clipboard.writeText('${shareUrl}').then(()=>window.showToast('Link copied! 🔗'))" style="white-space:nowrap;padding:8px 14px">Copy</button>
        </div>
      </div>
      <div style="font-size:11px;color:var(--text3)">⚠️ Anyone with this link can view your trade history. Share only with trusted mentors or prop firms.</div>
    </div>`;
    document.body.appendChild(m);
  };

  // Read-only view mode
  (function checkReadOnlyView() {
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');
    if (!viewParam) return;
    try {
      const data = JSON.parse(atob(viewParam));
      if (new Date(data.expires) < new Date()) {
        document.addEventListener('DOMContentLoaded', () => {
          document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#080c14;color:#f0f4ff;font-family:system-ui;text-align:center"><div><div style="font-size:48px;margin-bottom:16px">⏰</div><h1 style="font-size:24px;margin-bottom:8px">Link Expired</h1><p style="color:#8892a4">This shared vault link has expired (7-day limit).</p></div></div>`;
        });
        return;
      }
      document.addEventListener('DOMContentLoaded', () => showReadOnlyView(data));
    } catch { /* ignore */ }
  })();

  function showReadOnlyView(data) {
    document.body.innerHTML = `<div style="background:#080c14;min-height:100vh;color:#f0f4ff;font-family:'Plus Jakarta Sans',system-ui;padding:40px 24px;max-width:900px;margin:0 auto">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
        <svg width="28" height="28" viewBox="0 0 32 32"><polygon points="16,2 30,28 2,28" fill="none" stroke="#00ff88" stroke-width="2"/></svg>
        <span style="font-size:20px;font-weight:800">TradeBook Pro</span>
        <span style="background:#1a2235;border:1px solid rgba(255,255,255,.07);font-size:10px;padding:2px 8px;border-radius:4px;color:#8892a4">READ-ONLY SHARED VIEW</span>
      </div>
      <div style="font-size:12px;color:#4a5568;margin-bottom:28px">Shared ${new Date(data.generated).toLocaleDateString('en-IN')} · Expires ${new Date(data.expires).toLocaleDateString('en-IN')}</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:28px">
        <div style="background:#111827;border-radius:12px;padding:16px"><div style="font-size:10px;color:#4a5568;text-transform:uppercase;margin-bottom:4px">Net P&L</div><div style="font-size:22px;font-weight:800;color:${data.stats.total>=0?'#00ff88':'#ff4d6d'}">${fmtSigned(data.stats.total)}</div></div>
        <div style="background:#111827;border-radius:12px;padding:16px"><div style="font-size:10px;color:#4a5568;text-transform:uppercase;margin-bottom:4px">Total Trades</div><div style="font-size:22px;font-weight:800;color:#00d4ff">${data.stats.trades}</div></div>
        <div style="background:#111827;border-radius:12px;padding:16px"><div style="font-size:10px;color:#4a5568;text-transform:uppercase;margin-bottom:4px">Win Rate</div><div style="font-size:22px;font-weight:800;color:${data.stats.wr>=50?'#00ff88':'#ff4d6d'}">${data.stats.wr}%</div></div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="border-bottom:1px solid rgba(255,255,255,.07)">${['Date','Symbol','Direction','Net P&L','Strategy'].map(h=>`<th style="padding:10px 12px;text-align:left;color:#4a5568;font-size:10px;text-transform:uppercase;letter-spacing:.06em">${h}</th>`).join('')}</tr></thead>
        <tbody>${data.trades.map(t=>`<tr style="border-bottom:1px solid rgba(255,255,255,.04)">
          <td style="padding:10px 12px;color:#8892a4">${t.date}</td>
          <td style="padding:10px 12px;color:#00ff88;font-weight:700">${t.symbol||''}</td>
          <td style="padding:10px 12px;color:${t.direction==='BUY'?'#00ff88':'#ff4d6d'}">${t.direction||''}</td>
          <td style="padding:10px 12px;color:${(parseFloat(t.net)||0)>=0?'#00ff88':'#ff4d6d'};font-family:monospace">${fmtSigned(parseFloat(t.net)||0)}</td>
          <td style="padding:10px 12px;color:#8892a4">${t.strategy||'—'}</td>
        </tr>`).join('')}</tbody>
      </table>
      <div style="margin-top:24px;font-size:11px;color:#4a5568">Get your own TradeBook Pro journal — free at tradebook.app</div>
    </div>`;
  }

  /* ══════════════════════════════════════════════════════════
     19. STREAK FREEZE TOKEN
  ══════════════════════════════════════════════════════════ */
  (function initStreakFreeze() {
    function getTokens() { return parseInt(localStorage.getItem('tb_freeze_tokens') || '0'); }
    function setTokens(n) { localStorage.setItem('tb_freeze_tokens', Math.min(3, Math.max(0, n)).toString()); }

    window.useStreakFreeze = function () {
      const tokens = getTokens();
      if (tokens <= 0) { showToast('No freeze tokens! Earn more by logging 10 disciplined days.', 'warn'); return; }
      if (!confirm(`Use 1 streak freeze token? (${tokens} remaining)\n\nThis protects your streak for today.`)) return;
      setTokens(tokens - 1);
      const today = new Date().toISOString().split('T')[0];
      const frozen = JSON.parse(localStorage.getItem('tb_frozen_days')||'[]');
      frozen.push(today);
      localStorage.setItem('tb_frozen_days', JSON.stringify(frozen));
      showToast(`❄️ Streak frozen for today! ${getTokens()} tokens left.`);
      renderFreezeWidget();
    };

    window.renderFreezeWidget = function () {
      const container = document.getElementById('streak-freeze-container');
      if (!container) return;
      const tokens = getTokens();
      container.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;background:var(--bg4);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px 16px">
          <div style="font-size:28px">❄️</div>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:700">Streak Freeze Tokens</div>
            <div style="font-size:12px;color:var(--text2);margin-top:2px">Protect your streak on rest days. Earn 1 token per 10 disciplined days.</div>
            <div style="display:flex;gap:4px;margin-top:8px">
              ${[0,1,2].map(i=>`<div style="width:28px;height:28px;border-radius:6px;background:${i<tokens?'rgba(0,212,255,0.3)':'var(--bg)'};border:1px solid ${i<tokens?'var(--blue)':'var(--border)'};display:flex;align-items:center;justify-content:center;font-size:14px">${i<tokens?'❄️':''}</div>`).join('')}
            </div>
          </div>
          <button class="btn-secondary" onclick="window.useStreakFreeze()" style="white-space:nowrap;${tokens<=0?'opacity:.5;pointer-events:none':''}">Use Token</button>
        </div>`;
    };

    // Award tokens
    function checkTokenAward() {
      const disc = parseInt(localStorage.getItem('tb_disciplined_days') || '0');
      const awarded = parseInt(localStorage.getItem('tb_tokens_awarded') || '0');
      const newTokens = Math.floor(disc / 10);
      if (newTokens > awarded) {
        setTokens(getTokens() + (newTokens - awarded));
        localStorage.setItem('tb_tokens_awarded', newTokens.toString());
        showToast('🎉 Earned a Streak Freeze Token!');
      }
    }
    document.addEventListener('DOMContentLoaded', checkTokenAward);
  })();

  /* ══════════════════════════════════════════════════════════
     20. MONTHLY REPORT CARD
  ══════════════════════════════════════════════════════════ */
  window.generateMonthlyReport = function (year, month) {
    const now = new Date();
    year = year || now.getFullYear();
    month = month !== undefined ? month : now.getMonth() - 1;
    if (month < 0) { month = 11; year--; }

    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const trades = getTrades().filter(t => {
      const d = new Date(t.date+'T00:00:00');
      return d.getFullYear() === year && d.getMonth() === month;
    });

    if (!trades.length) { showToast('No trades found for that month', 'warn'); return; }

    const total = trades.reduce((s,t)=>s+(parseFloat(t.net)||0),0);
    const wins = trades.filter(t=>(parseFloat(t.net)||0)>0).length;
    const wr = Math.round(wins/trades.length*100);
    const pf = (() => {
      const gw = trades.filter(t=>(parseFloat(t.net)||0)>0).reduce((s,t)=>s+(parseFloat(t.net)||0),0);
      const gl = Math.abs(trades.filter(t=>(parseFloat(t.net)||0)<0).reduce((s,t)=>s+(parseFloat(t.net)||0),0));
      return gl > 0 ? (gw/gl).toFixed(2) : gw > 0 ? '∞' : '0';
    })();

    // Grade algorithm
    let score = 0;
    if (wr >= 60) score += 25; else if (wr >= 45) score += 15; else score += 5;
    if (parseFloat(pf) >= 2) score += 25; else if (parseFloat(pf) >= 1.5) score += 15; else score += 5;
    if (total > 0) score += 25; else score += 5;
    const discScore = parseInt(localStorage.getItem('tb_month_disc_' + year + '_' + month) || '70');
    score += Math.round(discScore * 0.25);

    const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F';
    const gradeColor = grade === 'A' ? '#00ff88' : grade === 'B' ? '#00d4ff' : grade === 'C' ? '#f7b731' : '#ff4d6d';

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>TradeBook Report Card — ${MONTHS[month]} ${year}</title>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;700;800&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{background:#080c14;color:#f0f4ff;font-family:'Plus Jakarta Sans',system-ui;padding:40px;min-height:100vh;display:flex;flex-direction:column;align-items:center}
      .card{background:#0d1220;border:1px solid rgba(255,255,255,.07);border-radius:16px;padding:36px;max-width:520px;width:100%}
      .logo{display:flex;align-items:center;gap:10px;margin-bottom:24px}
      .logo-text{font-size:18px;font-weight:800}
      .logo-pro{background:#00ff88;color:#000;font-size:9px;padding:1px 5px;border-radius:3px;margin-left:4px;font-weight:700}
      .period{font-size:13px;color:#4a5568;margin-bottom:4px}
      .title{font-size:28px;font-weight:800;margin-bottom:24px}
      .grade-wrap{display:flex;justify-content:center;margin:28px 0}
      .grade{width:120px;height:120px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:64px;font-weight:800;border:4px solid}
      .stats{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px}
      .stat{background:#111827;border-radius:10px;padding:14px}
      .stat-lbl{font-size:10px;color:#4a5568;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}
      .stat-val{font-size:22px;font-weight:800;font-family:'JetBrains Mono',monospace}
      .score-bar{background:#1a2235;border-radius:4px;height:8px;overflow:hidden;margin-top:20px}
      .score-fill{height:100%;border-radius:4px;background:linear-gradient(90deg,${gradeColor},${gradeColor}88);transition:width 1s}
      .footer{font-size:11px;color:#4a5568;text-align:center;margin-top:24px}
    </style></head><body>
    <div class="card">
      <div class="logo">
        <svg width="24" height="24" viewBox="0 0 32 32"><polygon points="16,2 30,28 2,28" fill="none" stroke="#00ff88" stroke-width="2"/></svg>
        <span class="logo-text">TradeBook<span class="logo-pro">PRO</span></span>
      </div>
      <div class="period">Monthly Report Card</div>
      <div class="title">${MONTHS[month]} ${year}</div>
      <div class="grade-wrap">
        <div class="grade" style="color:${gradeColor};border-color:${gradeColor}">${grade}</div>
      </div>
      <div class="stats">
        <div class="stat"><div class="stat-lbl">Net P&L</div><div class="stat-val" style="color:${total>=0?'#00ff88':'#ff4d6d'}">${fmtSigned(total)}</div></div>
        <div class="stat"><div class="stat-lbl">Trades</div><div class="stat-val" style="color:#00d4ff">${trades.length}</div></div>
        <div class="stat"><div class="stat-lbl">Win Rate</div><div class="stat-val" style="color:${wr>=50?'#00ff88':'#ff4d6d'}">${wr}%</div></div>
        <div class="stat"><div class="stat-lbl">Profit Factor</div><div class="stat-val" style="color:#f7b731">${pf}</div></div>
      </div>
      <div style="font-size:12px;color:#8892a4;margin-bottom:6px">Overall Score: ${score}/100</div>
      <div class="score-bar"><div class="score-fill" style="width:${score}%"></div></div>
      <div class="footer">Generated by TradeBook Pro · ${new Date().toLocaleDateString('en-IN')}</div>
    </div>
    <button onclick="window.print()" style="margin-top:16px;background:#00ff88;color:#000;border:none;padding:10px 24px;border-radius:8px;font-weight:700;cursor:pointer;font-size:13px">🖨️ Print / Save as PDF</button>
    </body></html>`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
  };

  /* ══════════════════════════════════════════════════════════
     21. OPTIONS GREEKS CALCULATOR (Black-Scholes)
  ══════════════════════════════════════════════════════════ */
  window.renderOptionsGreeks = function () {
    const container = document.getElementById('options-greeks-container');
    if (!container) return;
    container.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin-bottom:16px">
        <div class="form-group"><label>Spot Price (₹)</label><input type="number" id="bss-spot" class="form-input" placeholder="e.g. 22450" oninput="window._calcGreeks()" value="22450"></div>
        <div class="form-group"><label>Strike Price (₹)</label><input type="number" id="bss-strike" class="form-input" placeholder="e.g. 22500" oninput="window._calcGreeks()" value="22500"></div>
        <div class="form-group"><label>Days to Expiry</label><input type="number" id="bss-days" class="form-input" placeholder="e.g. 7" oninput="window._calcGreeks()" value="7" min="1"></div>
        <div class="form-group"><label>IV (%)</label><input type="number" id="bss-iv" class="form-input" placeholder="e.g. 15" oninput="window._calcGreeks()" value="15" step="0.5"></div>
        <div class="form-group"><label>Risk-Free Rate (%)</label><input type="number" id="bss-rf" class="form-input" placeholder="e.g. 6.5" value="6.5" oninput="window._calcGreeks()" step="0.1"></div>
        <div class="form-group"><label>Option Type</label><select id="bss-type" class="form-input" onchange="window._calcGreeks()"><option value="call">Call</option><option value="put">Put</option></select></div>
      </div>
      <div id="greeks-result" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px"></div>`;
    window._calcGreeks();
  };

  window._calcGreeks = function () {
    const S = parseFloat(document.getElementById('bss-spot')?.value) || 0;
    const K = parseFloat(document.getElementById('bss-strike')?.value) || 0;
    const T = (parseFloat(document.getElementById('bss-days')?.value) || 1) / 365;
    const sigma = (parseFloat(document.getElementById('bss-iv')?.value) || 15) / 100;
    const r = (parseFloat(document.getElementById('bss-rf')?.value) || 6.5) / 100;
    const type = document.getElementById('bss-type')?.value || 'call';
    const container = document.getElementById('greeks-result');
    if (!container || !S || !K) return;

    function normCDF(x) {
      const a1=.254829592,a2=-.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=.3275911;
      const sign = x < 0 ? -1 : 1;
      x = Math.abs(x) / Math.sqrt(2);
      const t = 1 / (1 + p * x);
      const y = 1 - (((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-x*x);
      return .5*(1+sign*y);
    }
    function normPDF(x) { return Math.exp(-x*x/2) / Math.sqrt(2*Math.PI); }

    const d1 = (Math.log(S/K) + (r + sigma**2/2)*T) / (sigma*Math.sqrt(T));
    const d2 = d1 - sigma*Math.sqrt(T);

    const Nd1 = normCDF(d1), Nd2 = normCDF(d2);
    const Nnd1 = normCDF(-d1), Nnd2 = normCDF(-d2);
    const nd1 = normPDF(d1);
    const eRT = Math.exp(-r*T);

    let price, delta, gamma, theta, vega, rho;
    if (type === 'call') {
      price = S*Nd1 - K*eRT*Nd2;
      delta = Nd1;
      rho = K*T*eRT*Nd2/100;
    } else {
      price = K*eRT*Nnd2 - S*Nnd1;
      delta = Nd1 - 1;
      rho = -K*T*eRT*Nnd2/100;
    }
    gamma = nd1 / (S*sigma*Math.sqrt(T));
    theta = (-(S*nd1*sigma)/(2*Math.sqrt(T)) - r*K*eRT*(type==='call'?Nd2:Nnd2)) / 365;
    vega = S*nd1*Math.sqrt(T)/100;

    const greeks = [
      { name: 'Premium', value: '₹'+price.toFixed(2), color:'var(--accent)', desc:'Option fair value' },
      { name: 'Delta (Δ)', value: delta.toFixed(4), color:'var(--blue)', desc:'Price sensitivity' },
      { name: 'Gamma (Γ)', value: gamma.toFixed(6), color:'var(--purple)', desc:'Delta rate of change' },
      { name: 'Theta (Θ)', value: theta.toFixed(4), color:'var(--red)', desc:'Time decay per day' },
      { name: 'Vega (ν)', value: vega.toFixed(4), color:'var(--gold)', desc:'IV sensitivity' },
      { name: 'Rho (ρ)', value: rho.toFixed(4), color:'var(--teal)', desc:'Rate sensitivity' },
    ];
    container.innerHTML = greeks.map(g=>`<div style="background:var(--bg4);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px">
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">${g.name}</div>
      <div style="font-family:var(--font-mono);font-size:18px;font-weight:700;color:${g.color}">${g.value}</div>
      <div style="font-size:10px;color:var(--text3);margin-top:4px">${g.desc}</div>
    </div>`).join('');
  };

  /* ══════════════════════════════════════════════════════════
     22. MARKET SESSION PLANNER (Timeline)
  ══════════════════════════════════════════════════════════ */
  window.renderSessionTimeline = function () {
    const container = document.getElementById('session-timeline-container');
    if (!container) return;
    const today = new Date().toISOString().split('T')[0];
    const todayTrades = getTrades().filter(t => t.date === today);
    const now = new Date();
    const nowMin = now.getHours()*60 + now.getMinutes();
    const OPEN = 9*60+15, CLOSE = 15*60+30;
    const totalMins = CLOSE - OPEN;

    const sessions = [
      { name:'Opening 🔥', start:9*60+15, end:10*60, color:'rgba(255,77,109,0.3)' },
      { name:'Mid Morning', start:10*60, end:11*60+30, color:'rgba(247,183,49,0.15)' },
      { name:'Lunch Lull 😴', start:11*60+30, end:13*60, color:'rgba(74,85,104,0.2)' },
      { name:'Afternoon', start:13*60, end:14*60+30, color:'rgba(0,212,255,0.15)' },
      { name:'Closing 🔔', start:14*60+30, end:15*60+30, color:'rgba(0,255,136,0.2)' },
    ];

    function minToLabel(m) {
      const h = Math.floor(m/60), min = m%60;
      return `${h}:${String(min).padStart(2,'0')}`;
    }

    const currentPct = Math.min(100, Math.max(0, (nowMin - OPEN) / totalMins * 100));
    const isMarketOpen = nowMin >= OPEN && nowMin <= CLOSE;

    container.innerHTML = `
      <div style="position:relative;height:80px;background:var(--bg4);border-radius:var(--radius-sm);overflow:hidden;margin-bottom:8px">
        ${sessions.map(s=>`<div style="position:absolute;top:0;height:100%;left:${(s.start-OPEN)/totalMins*100}%;width:${(s.end-s.start)/totalMins*100}%;background:${s.color}"><div style="font-size:9px;font-weight:700;color:var(--text2);padding:6px 4px;white-space:nowrap">${s.name}</div></div>`).join('')}
        ${todayTrades.map(t => {
          if (!t.entryTime) return '';
          const [h,m] = (t.entryTime||'').split(':').map(Number);
          if (isNaN(h)) return '';
          const pct = ((h*60+m) - OPEN) / totalMins * 100;
          const net = parseFloat(t.net)||0;
          return `<div style="position:absolute;top:50%;transform:translateY(-50%);left:${pct}%;width:4px;height:${Math.min(60,12+Math.abs(net/100))}px;background:${net>=0?'var(--green)':'var(--red)'};border-radius:2px;cursor:pointer" title="${t.symbol}: ${fmtSigned(net)}"></div>`;
        }).join('')}
        ${isMarketOpen ? `<div style="position:absolute;top:0;bottom:0;left:${currentPct}%;width:2px;background:var(--accent);opacity:.8"><div style="position:absolute;top:2px;left:4px;font-size:9px;color:var(--accent);white-space:nowrap;font-weight:700">NOW</div></div>` : ''}
      </div>
      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text3);font-family:var(--font-mono)">
        <span>9:15</span><span>10:00</span><span>11:30</span><span>13:00</span><span>14:30</span><span>15:30</span>
      </div>
      <div style="margin-top:8px;font-size:12px;color:var(--text2)">
        Today: <strong style="color:${todayTrades.reduce((s,t)=>s+(parseFloat(t.net)||0),0)>=0?'var(--green)':'var(--red)'}">${fmtSigned(todayTrades.reduce((s,t)=>s+(parseFloat(t.net)||0),0))}</strong> · ${todayTrades.length} trades
        ${isMarketOpen?`<span style="color:var(--green);margin-left:8px">● Market Open</span>`:`<span style="color:var(--text3);margin-left:8px">Market Closed</span>`}
      </div>`;
  };

  /* ══════════════════════════════════════════════════════════
     23. PROP FIRM CHALLENGE TRACKER
  ══════════════════════════════════════════════════════════ */
  window.renderPropFirmTracker = function () {
    const container = document.getElementById('prop-firm-container');
    if (!container) return;
    const settings = getSettings();
    const pfMode = settings.propFirmMode;

    if (!pfMode) {
      container.innerHTML = `
        <div style="text-align:center;padding:32px">
          <div style="font-size:36px;margin-bottom:12px">🏦</div>
          <div style="font-size:16px;font-weight:700;margin-bottom:8px">Prop Firm Challenge Tracker</div>
          <p style="font-size:13px;color:var(--text2);max-width:380px;margin:0 auto 20px">Track FTMO, My Forex Funds, or any prop firm challenge with live gauges.</p>
          <button class="btn-primary" onclick="window._enablePropFirm()">Enable Prop Firm Mode</button>
        </div>`;
      return;
    }

    const trades = getTrades();
    const today = new Date().toISOString().split('T')[0];
    const capital = parseFloat(settings.capital) || 100000;
    const dailyLossLimit = parseFloat(settings.pfDailyLoss) || 5;
    const maxDrawdown = parseFloat(settings.pfMaxDD) || 10;
    const profitTarget = parseFloat(settings.pfTarget) || 10;

    const totalPnl = trades.reduce((s,t)=>s+(parseFloat(t.net)||0),0);
    const todayPnl = trades.filter(t=>t.date===today).reduce((s,t)=>s+(parseFloat(t.net)||0),0);

    let peak = 0, equity = 0, dd = 0;
    trades.sort((a,b)=>a.date.localeCompare(b.date)).forEach(t=>{equity+=parseFloat(t.net)||0;peak=Math.max(peak,equity);dd=Math.max(dd,peak-equity);});

    const dailyLossPct = Math.abs(Math.min(0,todayPnl))/capital*100;
    const ddPct = dd/capital*100;
    const profitPct = totalPnl/capital*100;

    function gauge(label, current, max, icon, critical) {
      const pct = Math.min(100, current/max*100);
      const color = pct >= 80 ? 'var(--red)' : pct >= 60 ? 'var(--gold)' : 'var(--green)';
      const warn = pct >= 80;
      return `<div style="background:var(--bg4);border:1px solid ${warn?'rgba(255,77,109,0.5)':'var(--border)'};border-radius:var(--radius-sm);padding:16px;${warn?'box-shadow:0 0 16px rgba(255,77,109,0.1)':''}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <span style="font-size:14px;font-weight:700">${icon} ${label}</span>
          ${warn?`<span style="background:rgba(255,77,109,0.15);color:var(--red);font-size:10px;padding:2px 8px;border-radius:4px;font-weight:700">⚠️ WARNING</span>`:''}
        </div>
        <div style="font-family:var(--font-display);font-size:28px;font-weight:800;color:${color};margin-bottom:8px">${current.toFixed(2)}% <span style="font-size:14px;color:var(--text3)">/ ${max}%</span></div>
        <div style="background:var(--bg);border-radius:4px;height:8px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${color};border-radius:4px;transition:width .5s"></div>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-top:6px">${fmtSigned(critical)} used of ${fmtINR(critical/current*max||0)} limit</div>
      </div>`;
    }

    container.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin-bottom:16px">
        ${gauge('Daily Loss Limit', dailyLossPct, dailyLossLimit, '📅', todayPnl)}
        ${gauge('Max Drawdown', ddPct, maxDrawdown, '📉', -dd)}
        <div style="background:var(--bg4);border:1px solid ${profitPct>=profitTarget?'rgba(0,255,136,0.5)':'var(--border)'};border-radius:var(--radius-sm);padding:16px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <span style="font-size:14px;font-weight:700">🎯 Profit Target</span>
            ${profitPct>=profitTarget?`<span style="background:rgba(0,255,136,0.15);color:var(--green);font-size:10px;padding:2px 8px;border-radius:4px;font-weight:700">✅ PASSED</span>`:''}
          </div>
          <div style="font-family:var(--font-display);font-size:28px;font-weight:800;color:${profitPct>=0?'var(--green)':'var(--red)'};margin-bottom:8px">${profitPct.toFixed(2)}% <span style="font-size:14px;color:var(--text3)">/ ${profitTarget}%</span></div>
          <div style="background:var(--bg);border-radius:4px;height:8px;overflow:hidden">
            <div style="height:100%;width:${Math.min(100,profitPct/profitTarget*100)}%;background:var(--green);border-radius:4px;transition:width .5s"></div>
          </div>
          <div style="font-size:11px;color:var(--text3);margin-top:6px">${fmtSigned(totalPnl)} of ${fmtINR(capital*profitTarget/100)} target</div>
        </div>
      </div>
      <button class="btn-secondary" onclick="window._editPropFirmSettings()" style="font-size:12px">⚙️ Edit Challenge Settings</button>`;
  };

  window._enablePropFirm = function () {
    window._editPropFirmSettings();
  };

  window._editPropFirmSettings = function () {
    const settings = getSettings();
    const m = document.createElement('div');
    m.className = 'modal-overlay';
    m.style.display = 'flex';
    m.onclick = e => { if(e.target===m) m.remove(); };
    m.innerHTML = `<div class="modal-box" style="max-width:440px">
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
      <div style="font-family:var(--font-display);font-size:20px;font-weight:800;margin-bottom:16px">🏦 Prop Firm Challenge Setup</div>
      <div class="form-row" style="margin-bottom:12px">
        <div class="form-group"><label>Account Capital (₹)</label><input type="number" id="pf-capital" class="form-input" value="${settings.capital||100000}"></div>
        <div class="form-group"><label>Daily Loss Limit (%)</label><input type="number" id="pf-daily" class="form-input" value="${settings.pfDailyLoss||5}" step="0.5"></div>
      </div>
      <div class="form-row" style="margin-bottom:12px">
        <div class="form-group"><label>Max Drawdown (%)</label><input type="number" id="pf-maxdd" class="form-input" value="${settings.pfMaxDD||10}" step="0.5"></div>
        <div class="form-group"><label>Profit Target (%)</label><input type="number" id="pf-target" class="form-input" value="${settings.pfTarget||10}" step="0.5"></div>
      </div>
      <div style="display:flex;gap:10px;margin-top:14px">
        <button class="btn-primary" onclick="window._savePropFirm()" style="flex:1">Save & Enable</button>
        <button class="btn-danger" onclick="window._disablePropFirm();this.closest('.modal-overlay').remove()" style="padding:10px 16px">Disable</button>
        <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
      </div>
    </div>`;
    document.body.appendChild(m);
  };

  window._savePropFirm = function () {
    const s = getSettings();
    s.capital = parseFloat(document.getElementById('pf-capital').value) || s.capital;
    s.pfDailyLoss = parseFloat(document.getElementById('pf-daily').value) || 5;
    s.pfMaxDD = parseFloat(document.getElementById('pf-maxdd').value) || 10;
    s.pfTarget = parseFloat(document.getElementById('pf-target').value) || 10;
    s.propFirmMode = true;
    saveSettings(s);
    document.querySelector('.modal-overlay:last-child').remove();
    window.renderPropFirmTracker?.();
    showToast('Prop firm mode enabled 🏦');
  };

  window._disablePropFirm = function () {
    const s = getSettings();
    s.propFirmMode = false;
    saveSettings(s);
    window.renderPropFirmTracker?.();
    showToast('Prop firm mode disabled');
  };

  /* ══════════════════════════════════════════════════════════
     INJECT ALL NEW SECTIONS INTO EXISTING PAGES
  ══════════════════════════════════════════════════════════ */
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(injectAllSections, 800);
  });

  function injectAllSections() {

    // ── Inject CSV Import button into journal page header ──
    const journalHeader = document.querySelector('#page-journal .page-header > div:last-child');
    if (journalHeader && !document.getElementById('csv-import-btn')) {
      const btn = document.createElement('button');
      btn.id = 'csv-import-btn';
      btn.className = 'btn-secondary';
      btn.innerHTML = '📥 Import CSV';
      btn.onclick = () => window.openCSVImport();
      journalHeader.prepend(btn);
    }

    // ── Inject Export button into journal ──
    if (journalHeader && !document.getElementById('export-btn')) {
      const btn = document.createElement('button');
      btn.id = 'export-btn';
      btn.className = 'btn-secondary';
      btn.innerHTML = '📤 Export';
      btn.onclick = () => window.openExport();
      journalHeader.prepend(btn);
    }

    // ── Inject risk metrics card into Analytics Hub (Insights tab) ──
    const insightsPanel = document.getElementById('analytics-hub-panel-insights');
    if (insightsPanel && !document.getElementById('risk-metrics-card')) {
      const card = document.createElement('div');
      card.id = 'risk-metrics-card';
      card.className = 'chart-card full-width';
      card.style.marginTop = '16px';
      card.innerHTML = `<div class="chart-header"><div class="chart-title">📐 Risk-Adjusted Returns</div><div class="chart-sub">Sharpe, Sortino, Calmar ratios — how institutional desks measure performance</div></div><div id="risk-metrics-container"></div>`;
      insightsPanel.appendChild(card);
      window.renderRiskMetrics();
    }

    // ── Inject strategy comparison into Analytics Hub (Insights) ──
    if (insightsPanel && !document.getElementById('strategy-compare-card')) {
      const card = document.createElement('div');
      card.id = 'strategy-compare-card';
      card.className = 'chart-card full-width';
      card.style.marginTop = '16px';
      card.innerHTML = `<div class="chart-header"><div class="chart-title">⚔️ Strategy Comparison</div><div class="chart-sub">Equity curve overlay for all your strategies</div></div><div id="strategy-comparison-container"></div>`;
      insightsPanel.appendChild(card);
      window.renderStrategyComparison();
    }

    // ── Inject intraday heatmap into Analytics Hub (Deep Dive) ──
    const deepPanel = document.getElementById('analytics-hub-panel-deep');
    if (deepPanel && !document.getElementById('intraday-hm-card')) {
      const card = document.createElement('div');
      card.id = 'intraday-hm-card';
      card.className = 'chart-card full-width';
      card.style.marginTop = '16px';
      card.innerHTML = `<div class="chart-header"><div class="chart-title">⏰ Intraday Time-of-Day Heatmap</div><div class="chart-sub">Which 15-min slot makes you the most money?</div></div><div id="intraday-heatmap-container"></div>`;
      deepPanel.appendChild(card);
      window.renderIntradayHeatmap();
    }

    // ── Inject symbol deep-dive into journal summary bar ──
    const journalSummary = document.querySelector('.journal-summary-bar');
    if (journalSummary && !document.getElementById('symbol-dive-btn')) {
      const btn = document.createElement('button');
      btn.id = 'symbol-dive-btn';
      btn.className = 'btn-secondary';
      btn.innerHTML = '🔍 Symbol Dive';
      btn.onclick = () => window.openSymbolDeepDive();
      btn.style.cssText = 'font-size:12px;padding:6px 12px;margin-left:auto';
      journalSummary.appendChild(btn);
    }

    // ── Inject Options Greeks into Tools Hub (Pro Tools) ──
    const protoolsPanel = document.getElementById('tools-hub-panel-protools');
    if (protoolsPanel && !document.getElementById('options-greeks-card')) {
      const card = document.createElement('div');
      card.id = 'options-greeks-card';
      card.className = 'chart-card full-width';
      card.style.marginTop = '16px';
      card.innerHTML = `<div class="chart-header"><div class="chart-title">📊 Options Greeks Calculator</div><div class="chart-sub">Black-Scholes: Delta, Gamma, Theta, Vega, Rho — in-browser, no API needed</div></div><div id="options-greeks-container"></div>`;
      protoolsPanel.appendChild(card);
      window.renderOptionsGreeks();
    }

    // ── Inject Streak Freeze into Pro Tools ──
    if (protoolsPanel && !document.getElementById('streak-freeze-card')) {
      const card = document.createElement('div');
      card.id = 'streak-freeze-card';
      card.className = 'chart-card full-width';
      card.style.marginTop = '16px';
      card.innerHTML = `<div class="chart-header"><div class="chart-title">❄️ Streak Freeze Tokens</div><div class="chart-sub">Protect discipline streaks on rest days</div></div><div id="streak-freeze-container"></div>`;
      protoolsPanel.appendChild(card);
      window.renderFreezeWidget();
    }

    // ── Inject Session Timeline into Dashboard ──
    const dashPage = document.getElementById('page-dashboard');
    if (dashPage && !document.getElementById('session-timeline-card')) {
      const card = document.createElement('div');
      card.id = 'session-timeline-card';
      card.className = 'chart-card full-width';
      card.style.marginTop = '24px';
      card.innerHTML = `<div class="chart-header"><div class="chart-title">📅 Today's Session Timeline</div><div class="chart-sub">Market hours with your trades plotted — click any ticker symbol to log quickly</div></div><div id="session-timeline-container"></div>`;
      // Insert before dash-bottom-row
      const bottomRow = dashPage.querySelector('.dash-bottom-row');
      if (bottomRow) bottomRow.before(card);
      else dashPage.appendChild(card);
      window.renderSessionTimeline();
    }

    // ── Inject Prop Firm Tracker as new tab in Tools Hub ──
    const toolsHubTabs = document.getElementById('tools-hub-tabs');
    const toolsHubPage = document.getElementById('page-tools-hub');
    if (toolsHubTabs && toolsHubPage && !document.getElementById('tools-hub-tab-propfirm')) {
      const btn = document.createElement('button');
      btn.id = 'tools-hub-tab-propfirm';
      btn.className = 'hub-tab';
      btn.innerHTML = '🏦 Prop Firm';
      btn.onclick = function () { window.switchHubTab?.('tools-hub','propfirm',this); };
      toolsHubTabs.appendChild(btn);

      const panel = document.createElement('div');
      panel.id = 'tools-hub-panel-propfirm';
      panel.className = 'hub-panel';
      panel.innerHTML = `<div class="chart-card full-width"><div class="chart-header"><div class="chart-title">🏦 Prop Firm Challenge Tracker</div><div class="chart-sub">FTMO, My Forex Funds, or any challenge — live gauges for daily loss, max drawdown, and profit target</div></div><div id="prop-firm-container"></div></div>`;
      toolsHubPage.appendChild(panel);
    }

    // ── Inject Snapshot Manager into Settings ──
    const settingsPage = document.getElementById('page-settings');
    if (settingsPage && !document.getElementById('snapshot-settings-card')) {
      const card = document.createElement('div');
      card.id = 'snapshot-settings-card';
      card.className = 'form-section';
      card.style.marginTop = '16px';
      card.innerHTML = `<div class="form-section-title">📸 Data Snapshots & Backup</div>
        <p style="font-size:12px;color:var(--text2);margin-bottom:14px">Auto-snapshots weekly. Create manual snapshots before major changes. Restore any time.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
          <button class="btn-primary" onclick="window.createSnapshot()">📸 Create Snapshot Now</button>
          <button class="btn-secondary" onclick="window.openExport()">📤 Export Trades</button>
          <button class="btn-secondary" onclick="window.openPINSetup()">🔐 Set Vault PIN</button>
          <button class="btn-secondary" onclick="window.openShareVault()">🔗 Share Read-Only Link</button>
        </div>
        <div id="snapshot-manager-container"></div>`;
      settingsPage.appendChild(card);
      window.renderSnapshotManager?.();
    }

    // ── Inject Monthly Report Card button into Analytics header ──
    const analyticsHeader = document.querySelector('#page-analytics-hub .page-header > div:last-child');
    if (analyticsHeader && !document.getElementById('monthly-report-btn')) {
      const btn = document.createElement('button');
      btn.id = 'monthly-report-btn';
      btn.className = 'btn-secondary';
      btn.innerHTML = '📊 Monthly Report';
      btn.style.fontSize = '12px';
      btn.onclick = () => window.generateMonthlyReport();
      analyticsHeader.appendChild(btn);
    }

    // ── Add Share & Export to topbar ──
    const topbarRight = document.querySelector('.topbar-right');
    if (topbarRight && !document.getElementById('tb-share-btn')) {
      const shareBtn = document.createElement('button');
      shareBtn.id = 'tb-share-btn';
      shareBtn.className = 'btn-search';
      shareBtn.innerHTML = '🔗';
      shareBtn.title = 'Share vault';
      shareBtn.onclick = () => window.openShareVault();
      topbarRight.insertBefore(shareBtn, topbarRight.firstChild);
    }
  }

  /* ══════════════════════════════════════════════════════════
     HOOK INTO PAGE NAVIGATION
     Patched on window 'load' — AFTER router.js has run and
     defined navigateTo / switchHubTab, so we never capture
     an undefined reference at parse-time.
  ══════════════════════════════════════════════════════════ */
  window.addEventListener('load', function () {

    // ── Patch navigateTo ──────────────────────────────────
    var _realNav = window.navigateTo;
    if (typeof _realNav === 'function') {
      window.navigateTo = function (page) {
        _realNav(page);
        _tbAfterNav(page);
      };
    } else {
      // Fallback: attach to sidebar nav-item clicks directly
      document.querySelectorAll('.nav-item[data-page]').forEach(function (btn) {
        btn.addEventListener('click', function () { _tbAfterNav(btn.dataset.page); });
      });
    }

    // ── Patch switchHubTab ────────────────────────────────
    var _realSwitch = window.switchHubTab;
    if (typeof _realSwitch === 'function') {
      window.switchHubTab = function (hub, panel, btn) {
        _realSwitch(hub, panel, btn);
        if (hub === 'tools-hub' && panel === 'propfirm')
          setTimeout(function () { window.renderPropFirmTracker && window.renderPropFirmTracker(); }, 100);
        if (hub === 'tools-hub' && panel === 'protools')
          setTimeout(function () {
            window.renderOptionsGreeks && window.renderOptionsGreeks();
            window.renderFreezeWidget && window.renderFreezeWidget();
          }, 100);
      };
    }

    // ── Re-wire mobile nav buttons to the now-patched navigateTo ──
    document.querySelectorAll('.mbn-item[data-page]').forEach(function (btn) {
      btn.onclick = function () {
        window.navigateTo(this.dataset.page);
        document.querySelectorAll('.mbn-item').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
      };
    });

    // ── Keep bottom-nav highlight in sync with sidebar clicks ──
    document.querySelectorAll('.nav-item[data-page]').forEach(function (sideBtn) {
      sideBtn.addEventListener('click', function () {
        document.querySelectorAll('.mbn-item').forEach(function (b) {
          b.classList.toggle('active', b.dataset.page === sideBtn.dataset.page);
        });
      });
    });

  }); // end window.load

  function _tbAfterNav(page) {
    setTimeout(function () {
      if (page === 'analytics-hub') {
        window.renderRiskMetrics && window.renderRiskMetrics();
        window.renderStrategyComparison && window.renderStrategyComparison();
        window.renderIntradayHeatmap && window.renderIntradayHeatmap();
      }
      if (page === 'dashboard') {
        window.renderSessionTimeline && window.renderSessionTimeline();
      }
      if (page === 'tools-hub') {
        window.renderOptionsGreeks && window.renderOptionsGreeks();
        window.renderFreezeWidget && window.renderFreezeWidget();
      }
      if (page === 'settings') {
        window.renderSnapshotManager && window.renderSnapshotManager();
      }
    }, 200);
  }

})();
