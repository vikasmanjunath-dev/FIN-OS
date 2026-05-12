// js/ui.js

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
