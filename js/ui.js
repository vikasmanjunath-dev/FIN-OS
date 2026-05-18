// js/ui.js

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

document.addEventListener("DOMContentLoaded", () => {

  /* =========================
     CARD HOVER INTERACTION
     ========================= */

  document.querySelectorAll(".card").forEach(card => {
    card.addEventListener("mouseenter", () => {
      card.style.transform = "translateY(-6px)";
    });

    card.addEventListener("mouseleave", () => {
      card.style.transform = "translateY(0)";
    });
  });

  /* =========================
     CARD ENTRANCE ANIMATION
     ========================= */

  const cards = document.querySelectorAll(".card");

  cards.forEach((card, i) => {
    card.style.opacity = "0";
    card.style.transform = "translateY(20px)";

    setTimeout(() => {
      card.style.transition =
        "all 0.6s cubic-bezier(0.16,1,0.3,1)";
      card.style.opacity = "1";
      card.style.transform = "translateY(0)";
    }, i * 80);
  });

  /* =========================
     THEME TOGGLE (GLOBAL)
     ========================= */

  const btn = document.getElementById("themeToggle");
  if (!btn) return;

  const savedTheme = localStorage.getItem("finos-theme") || localStorage.getItem("theme") || "dark";
  document.documentElement.setAttribute("data-theme", savedTheme);
  btn.textContent = savedTheme === "dark" ? "🌙" : "☀️";

  btn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";

    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("finos-theme", next);
    localStorage.setItem("theme", next);
    var s = JSON.parse(localStorage.getItem("FINOS_SYS_SETTINGS") || "{}");
    s.theme = next;
    localStorage.setItem("FINOS_SYS_SETTINGS", JSON.stringify(s));
    btn.textContent = next === "dark" ? "🌙" : "☀️";
  });

});


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
