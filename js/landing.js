window.addEventListener("scroll", () => {
  const y = window.scrollY / window.innerHeight;
  document.documentElement.style.setProperty("--my", `${10 + y * 30}%`);
});


/* =========================
   LIFE MONEY ANIMATION
   ========================= */

const lifeBtn = document.getElementById("runLifeSim");
const growLines = document.querySelectorAll(".life-line.grow");
const lifeMsg = document.getElementById("lifeMessage");

lifeBtn?.addEventListener("click", () => {
  lifeMsg.classList.remove("show");

  growLines.forEach(line => {
    line.style.height = "0px";
  });

  let delay = 0;

  growLines.forEach(line => {
    setTimeout(() => {
      line.style.height = "28px";
    }, delay);
    delay += 500;
  });

  setTimeout(() => {
    lifeMsg.classList.add("show");
  }, delay + 600);
});

/* =========================
   INDIA REALITY SELECTION
   ========================= */

document.querySelectorAll(".india-card").forEach(card => {
  card.addEventListener("click", () => {
    document.querySelectorAll(".india-card").forEach(c =>
      c.style.boxShadow = "none"
    );

    card.style.boxShadow =
      "0 0 0 3px rgba(182,255,59,0.6), 0 30px 60px rgba(0,0,0,0.2)";
  });
});




/* =========================
   FINANCIAL LITERACY LOGIC
   ========================= */

const literacyBtn = document.getElementById("runLiteracy");
const misconceptionFill = document.querySelector(".misconception-fill");
const correctFill = document.querySelector(".literacy-fill-correct");
const investFill = document.querySelector(".literacy-fill-invest");
const literacyMsg = document.getElementById("literacyMessage");

literacyBtn?.addEventListener("click", () => {
  misconceptionFill.style.width = "0%";
  correctFill.style.width = "0%";
  investFill.style.width = "0%";
  literacyMsg.classList.remove("show");

  // Misconception dominance
  setTimeout(() => {
    misconceptionFill.style.width = "80%";
  }, 200);

  // Correct understanding
  setTimeout(() => {
    correctFill.style.width = "30%";
  }, 1400);

  // Investing as outcome
  setTimeout(() => {
    investFill.style.width = "15%";
  }, 2200);

  // Message
  setTimeout(() => {
    literacyMsg.classList.add("show");
  }, 3200);
});



/* =========================
   PAYCHECK TO PAYCHECK LOGIC
   ========================= */

const runBtn = document.getElementById("runPaycheck");
const incomeFill = document.querySelector(".income-fill");
const expenses = document.querySelectorAll(".expense");
const balanceText = document.getElementById("balanceAmount");
const message = document.getElementById("paycheckMessage");

let income = 50000;
let remaining = income;

runBtn?.addEventListener("click", () => {
  remaining = income;
  incomeFill.style.width = "100%";
  balanceText.textContent = "₹50,000";
  message.classList.remove("show");

  expenses.forEach(e => e.style.opacity = 0.6);

  let delay = 0;

  expenses.forEach(expense => {
    const cut = parseInt(expense.dataset.cut);

    setTimeout(() => {
      remaining -= income * (cut / 100);
      const percentLeft = (remaining / income) * 100;

      incomeFill.style.width = `${percentLeft}%`;
      balanceText.textContent = `₹${Math.max(0, Math.round(remaining))}`;
      expense.style.opacity = 1;
    }, delay);

    delay += 700;
  });

  setTimeout(() => {
    incomeFill.style.width = "0%";
    balanceText.textContent = "₹0";
    message.classList.add("show");
  }, delay + 600);
});

/* =========================
   PAYCHECK SOLUTION LOGIC
   ========================= */

const solutionBtn = document.getElementById("runSolution");
const beforeFill = document.querySelector(".before-fill");
const afterFill = document.querySelector(".after-fill");
const solutionMsg = document.getElementById("solutionMessage");

solutionBtn?.addEventListener("click", () => {
  // reset
  beforeFill.style.width = "0%";
  afterFill.style.width = "0%";
  solutionMsg.classList.remove("show");

  setTimeout(() => {
    beforeFill.style.width = "100%";
  }, 200);

  setTimeout(() => {
    afterFill.style.width = "20%"; // small but powerful
  }, 1200);

  setTimeout(() => {
    solutionMsg.classList.add("show");
  }, 2200);
});


/* =========================
   DESI MONEY BALANCE LOGIC
   ========================= */

const igniteBtn = document.getElementById("igniteLife");
const fire = document.getElementById("fireCore");
const msg = document.getElementById("desiMessage");

igniteBtn?.addEventListener("click", () => {
  // Fire grows but doesn't explode
  fire.style.opacity = "1";
  fire.style.transform = "scale(1.15)";
  fire.style.boxShadow = "0 0 40px rgba(255,152,0,0.6)";

  msg.classList.add("show");
});
s