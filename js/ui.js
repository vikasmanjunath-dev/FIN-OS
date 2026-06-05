// js/ui.js
// Auto-loads toast + async utilities on every page

/* ── Focus-source tracking (WCAG 2.4.7)
   Sets data-focus-source="mouse" on <html> during pointer interactions
   so CSS can suppress the outline ring for mouse users only, while
   keyboard and AT users always get a visible ring. ── */
(function () {
  var html = document.documentElement;
  document.addEventListener('pointerdown', function () {
    html.setAttribute('data-focus-source', 'mouse');
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Tab' || e.key === 'Enter' || e.key === ' ') {
      html.removeAttribute('data-focus-source');
    }
  });
  // Also handle programmatic focus via AT (remove on any focusin after key)
  document.addEventListener('focusin', function () {
    if (!html.hasAttribute('data-focus-source')) {
      /* keyboard or AT — leave outline visible */
    }
  });
})();

(function () {
  function loadScript(src) {
    if (document.querySelector('script[src="' + src + '"]')) return;
    var s = document.createElement('script');
    s.src = src; s.defer = true;
    document.head.appendChild(s);
  }
  // Resolve relative path — works from any html/ sub-directory
  var base = (function () {
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      var s = scripts[i].src || '';
      if (s.indexOf('ui.js') !== -1) return s.replace('ui.js', '');
    }
    return '../js/';
  })();
  loadScript(base + 'finos-toast.js');
  loadScript(base + 'finos-async.js');
})();

/* ─── GLOBAL SETTINGS PROPAGATOR ─────────────────────────────────
   Runs immediately on every page that includes ui.js.
   Applies: accent color · font scale · reduce-motion · high-contrast
   · compact-ui — sourced from FINOS_SYS_SETTINGS in localStorage.
   Theme is handled inline in each page's <head> IIFE for zero-flash.
─────────────────────────────────────────────────────────────────── */
(function () {
  try {
    var s = JSON.parse(localStorage.getItem('FINOS_SYS_SETTINGS') || '{}');
    var root = document.documentElement;
    if (s.accent)       root.style.setProperty('--accent', s.accent);
    if (s.fontSize)     root.setAttribute('data-font-size', s.fontSize);
    if (s.reduceMotion) root.classList.add('reduce-motion');
    if (s.highContrast) root.classList.add('high-contrast');
    if (s.compactUI)    root.classList.add('compact-ui');
  } catch (e) { /* localStorage may be blocked in some contexts */ }
})();

/* ─── GLOBAL FORMAT UTILITY ──────────────────────────────────────
   window.FINOS.fmt(amount)       → "₹1,23,45,678"  (honours user's
   window.FINOS.fmtShort(amount)  → "₹12.35 Cr"       numberFormat
   Available on every page via ui.js; settings.js overrides if loaded.
─────────────────────────────────────────────────────────────────── */
(function () {
  if (window.FINOS && window.FINOS.fmt) return; // settings.js already loaded
  window.FINOS = window.FINOS || {};
  window.FINOS.fmt = function (amount, currencyOverride) {
    var cfg;
    try { cfg = JSON.parse(localStorage.getItem('FINOS_SYS_SETTINGS') || '{}'); } catch (e) { cfg = {}; }
    var numFmt  = cfg.numberFormat || 'indian';
    var curr    = currencyOverride || cfg.currency || 'inr';
    var SYMBOLS = { inr: '₹', usd: '$', eur: '€', gbp: '£' };
    var sym     = SYMBOLS[curr] || '₹';
    var n       = Number(amount);
    if (isNaN(n)) return sym + '—';
    if (numFmt === 'indian') {
      var abs = Math.abs(Math.round(n));
      var str = String(abs);
      var result = '';
      if (str.length <= 3) {
        result = str;
      } else {
        result = str.slice(-3);
        var rem = str.slice(0, -3);
        while (rem.length > 2) { result = rem.slice(-2) + ',' + result; rem = rem.slice(0, -2); }
        if (rem.length) result = rem + ',' + result;
      }
      return sym + (n < 0 ? '-' : '') + result;
    }
    return sym + Math.abs(Math.round(n)).toLocaleString('en-US') + (n < 0 ? ' (-)' : '');
  };
  window.FINOS.fmtShort = function (amount) {
    var n = Number(amount);
    if (isNaN(n)) return '—';
    var abs = Math.abs(n);
    if (abs >= 1e7)  return (n / 1e7).toFixed(2) + ' Cr';
    if (abs >= 1e5)  return (n / 1e5).toFixed(2) + ' L';
    if (abs >= 1e3)  return (n / 1e3).toFixed(1) + 'K';
    return String(Math.round(n));
  };
})();

// ui.js is loaded with defer — DOMContentLoaded may have already fired.
// Use readyState guard so init always runs regardless of load timing.
function _finosUIInit() {

  /* =========================
     CARD ENTRANCE + HOVER
     Uses IntersectionObserver + CSS classes — no layout thrashing.
     CSS handles transitions; JS only toggles class names.
     ========================= */

  var prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!prefersReduced && "IntersectionObserver" in window) {
    var cardObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var card = entry.target;
          card.classList.add("card--visible");
          cardObserver.unobserve(card);
        }
      });
    }, { threshold: 0.08 });

    document.querySelectorAll(".card").forEach(function (card, i) {
      card.style.setProperty("--card-delay", (i * 60) + "ms");
      card.classList.add("card--hidden");
      cardObserver.observe(card);
    });
  }

  /* =========================
     ACTIVE NAV LINK — auto-detect by URL
     Sets class="active" AND aria-current="page" (WCAG 4.1.2)
     ========================= */
  (function () {
    var path = window.location.pathname.split("/").pop() || "home.html";
    // Normalise: index.html → home.html for the root
    if (path === "" || path === "index.html") path = "home.html";

    document.querySelectorAll(".sidebar nav a").forEach(function (link) {
      var href = link.getAttribute("href") || "";
      var page = href.split("/").pop().split("?")[0];
      var isActive = (page === path);
      link.classList.toggle("active", isActive);
      if (isActive) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  })();

  /* =========================
     THEME TOGGLE (GLOBAL)
     ========================= */

  // Recognise all theme-button ID conventions used across the site
  var themeBtn = document.getElementById("themeToggle")
              || document.getElementById("floatThemeBtn")
              || document.getElementById("themeBtn");

  // Auto-inject a floating toggle on pages that have no existing toggle button
  if (!themeBtn) {
    themeBtn = document.createElement("button");
    themeBtn.id = "themeToggle";
    themeBtn.className = "theme-btn theme-btn--floating";
    themeBtn.setAttribute("aria-label", "Toggle dark/light theme");
    themeBtn.setAttribute("title", "Toggle theme");
    document.body.appendChild(themeBtn);
  } else {
    // Strip any pre-attached inline event listeners by cloning the node.
    // Inline IIFE/bare scripts run before this deferred script, so their
    // listeners live on the original element — the clone starts listener-free.
    var _orig = themeBtn;
    themeBtn = _orig.cloneNode(true);
    _orig.parentNode.replaceChild(themeBtn, _orig);
  }

  function _syncThemeBtn(theme) {
    themeBtn.textContent = theme === "dark" ? "🌙" : "☀️";
    themeBtn.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
  }

  function _applyTheme(next) {
    document.documentElement.setAttribute("data-theme", next);
    // Sync Tailwind darkMode: 'class' for pages that use it
    if (next === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("finos-theme", next);
    localStorage.setItem("theme", next);
    try {
      var s = JSON.parse(localStorage.getItem("FINOS_SYS_SETTINGS") || "{}");
      s.theme = next;
      localStorage.setItem("FINOS_SYS_SETTINGS", JSON.stringify(s));
    } catch (_) {}
    _syncThemeBtn(next);
    // Notify Chart.js instances and any other listeners
    window.dispatchEvent(new CustomEvent("finos-theme-changed", { detail: { theme: next } }));
  }

  var savedTheme = localStorage.getItem("finos-theme") || localStorage.getItem("theme") || "dark";
  document.documentElement.setAttribute("data-theme", savedTheme);
  _syncThemeBtn(savedTheme);

  // Clone is always a fresh node — attach exactly one listener
  themeBtn.addEventListener("click", function () {
    var current = document.documentElement.getAttribute("data-theme") || "dark";
    _applyTheme(current === "dark" ? "light" : "dark");
  });

  // Sync all theme buttons on the page if settings.js fires its own event
  window.addEventListener("finos-settings-updated", function (e) {
    if (e.detail && e.detail.key === "theme") {
      var resolved = document.documentElement.getAttribute("data-theme") || "dark";
      _syncThemeBtn(resolved);
    }
  });

} // end _finosUIInit

// Fire immediately if DOM is ready (defer scripts run after parsing),
// or wait for DOMContentLoaded if somehow called earlier.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _finosUIInit);
} else {
  _finosUIInit();
}

/* ─── GLOBAL CHART.JS THEME UPDATER ─────────────────────────────
   Listens for finos-theme-changed (dispatched by ui.js toggle)
   and finos-settings-updated (dispatched by settings.js).
   Updates all registered Chart.js instances' text colors.
──────────────────────────────────────────────────────────────── */
(function () {
  function _updateCharts(isDark) {
    if (typeof Chart === 'undefined' || !Chart.instances) return;
    var textColor = isDark ? '#A1A8B8' : '#5A6278';
    var gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
    Object.values(Chart.instances).forEach(function (chart) {
      try {
        var opts = chart.options;
        if (opts.plugins && opts.plugins.legend && opts.plugins.legend.labels) {
          opts.plugins.legend.labels.color = textColor;
        }
        var scales = opts.scales || {};
        Object.values(scales).forEach(function (scale) {
          if (scale.ticks) scale.ticks.color = textColor;
          if (scale.grid)  scale.grid.color  = gridColor;
        });
        chart.update('none'); // silent update — no animation
      } catch (e) { /* individual chart errors must not block others */ }
    });
  }

  function _onThemeChange() {
    var isDark = (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark';
    // Small delay so CSS variables are applied before chart reads colors
    setTimeout(function () { _updateCharts(isDark); }, 60);
  }

  window.addEventListener('finos-theme-changed', _onThemeChange);
  window.addEventListener('finos-settings-updated', function (e) {
    if (e.detail && e.detail.key === 'theme') _onThemeChange();
  });
})();


// =========================
// PREMIUM CARD TILT EFFECT
// =========================

document.querySelectorAll(".vision-card").forEach(card => {
  card.addEventListener("mousemove", e => {
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotateX = (y - centerY) / 18;
    const rotateY = (centerX - x) / 18;

    card.style.transform =
      `translateY(-14px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
  });

  card.addEventListener("mouseleave", () => {
    card.style.transform = "translateY(0)";
  });
});



const observer = new IntersectionObserver(
  entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
      }
    });
  },
  { threshold: 0.15 }
);

document.querySelectorAll(".reveal").forEach(el => {
  observer.observe(el);
});


// Belief → Outcome logic
const beliefResults = {
  delay: "Outcome: Time is lost. Compounding never gets a chance to work.",
  emi: "Outcome: Cashflow tightens. Flexibility disappears quietly.",
  early: "Outcome: Time does the heavy lifting. Pressure stays low."
};

document.querySelectorAll(".belief-grid button").forEach(btn => {
  btn.addEventListener("click", () => {
    document.getElementById("beliefResult").textContent =
      beliefResults[btn.dataset.outcome];
  });
});

// ===============================
// BELIEF ENGINE — INTERACTIVE (FIXED)
// ===============================

document.addEventListener("DOMContentLoaded", () => {

  const beliefMap = {
    delay: {
      text: "Waiting for the ‘right income’ often costs decades of compounding. Time, not salary, creates wealth."
    },
    emi: {
      text: "Normalized EMIs reduce flexibility. Cash flow freedom compounds faster than ownership pressure."
    },
    early: {
      text: "Small amounts started early quietly outperform large amounts started late. Time does the heavy lifting."
    }
  };

  const beliefButtons = document.querySelectorAll(".belief-grid button");
  const beliefResult = document.getElementById("beliefResult");

  if (!beliefButtons.length || !beliefResult) return;

  beliefButtons.forEach(btn => {
    btn.addEventListener("click", () => {

      // reset state
      beliefButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      // animate text
      beliefResult.style.opacity = "0";
      beliefResult.style.transform = "translateY(8px)";

      setTimeout(() => {
        beliefResult.textContent =
          beliefMap[btn.dataset.outcome].text;

        beliefResult.style.opacity = "1";
        beliefResult.style.transform = "translateY(0)";
      }, 200);
    });
  });

});
