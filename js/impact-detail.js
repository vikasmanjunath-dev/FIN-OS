document.addEventListener("DOMContentLoaded", () => {

  /* =========================
     READ WHICH CARD WAS CLICKED
     ========================= */
  const params = new URLSearchParams(window.location.search);
  const activeCase = params.get("case") || "sip-500";

  /* =========================
     ALL INSIGHT FLOWS
     ========================= */
  const insightFlows = {

    /* ---------- SIP ---------- */
    "sip-500": {
      1: {
        title: "A very Indian beginning",
        text: `
Ravi earns ₹25,000 per month.
His friend says:
"Abhi mat invest kar, salary badhne de."

₹500 feels too small.
30 years feels too far.
`
      },
      2: {
        title: "Time vs Money",
        text: `
Money is visible.
Time is invisible.

But time does the heavy lifting.
The earlier you start, the less you need.
`
      },
      3: {
        title: "Pressure Cooker Analogy",
        text: `
Compounding is like a pressure cooker.

First 10 minutes — nothing.
Next 10 — steam.
Last 5 — explosion.

Most people turn off the stove too early.
`
      },
      4: {
        title: "Reality Check",
        text: `
₹500 × 12 × 30 = ₹1.8 lakh invested  
Final value ≈ ₹1 crore+

Waiting 5 years can cost 30–40% of final wealth.
`
      },
      5: {
        title: "The real insight",
        text: `
Small money + long time
beats
big money + short time.

Always.
`
      }
    },

    /* ---------- HOME PURCHASE ---------- */
    "home-early": {
      1: {
        title: "A very Indian beginning",
        text: `
Ankit is 27.
Family says:
“Rent is waste. Buy a house.”

Loan starts.
Freedom pauses.
`
      },
      2: {
        title: "Time vs Money",
        text: `
A house locks money in one place.
Life needs money in many places.
`
      },
      3: {
        title: "The Handcuffs Analogy",
        text: `
A big EMI is like golden handcuffs.
Looks safe.
Limits movement.
`
      },
      4: {
        title: "Reality Check",
        text: `
High EMI = low savings.
Low savings = high stress.
`
      },
      5: {
        title: "The real insight",
        text: `
A house is shelter.
Flexibility is wealth.
`
      }
    },

    /* ---------- SIMPLICITY ---------- */
    "simplicity": {
      1: {
        title: "A very Indian beginning",
        text: `
LIC, ULIP, FD, ELSS, Stocks, Crypto.

Rohit owns everything.
Understands nothing.
`
      },
      2: {
        title: "Time vs Money",
        text: `
More products need more tracking.
Time leaks silently.
`
      },
      3: {
        title: "Kitchen Analogy",
        text: `
Too many masalas spoil the sabzi.
`
      },
      4: {
        title: "Reality Check",
        text: `
Simple portfolios often outperform
complex ones.
`
      },
      5: {
        title: "The real insight",
        text: `
Discipline beats complexity.
`
      }
    },

    /* ---------- DELAY ---------- */
    "delay-5-years": {
      1: {
        title: "A very Indian beginning",
        text: `
“Next year pakka.”
Life keeps happening.
Years pass.
`
      },
      2: {
        title: "Time vs Money",
        text: `
Money can be increased.
Time cannot.
`
      },
      3: {
        title: "Train Analogy",
        text: `
Miss the first train,
reach much later.
`
      },
      4: {
        title: "Reality Check",
        text: `
5 year delay =
30–40% less wealth.
`
      },
      5: {
        title: "The real insight",
        text: `
Delay is expensive.
`
      }
    },

    "fd-vs-market": {
  1: {
    title: "A very Indian beginning",
    text: `
Parents say:
“FD safest hai. Market risky hai.”

Money feels protected.
But it quietly loses power.
`
  },
  2: {
    title: "Time vs Money",
    text: `
FD protects money.
Market grows money.

Inflation eats safety silently.
`
  },
  3: {
    title: "The Leaking Bucket Analogy",
    text: `
FD is a bucket with a small hole.
Money stays.
Value leaks every year.
`
  },
  4: {
    title: "Reality Check",
    text: `
FD return: 5–6%
Inflation: 6–7%

Real growth = zero or negative.
`
  },
  5: {
    title: "The real insight",
    text: `
Safety without growth
is slow financial decline.
`
  }
},


"gold-vs-equity": {
  1: {
    title: "A very Indian beginning",
    text: `
Gold means security.
Weddings, festivals, lockers.

Stocks feel uncertain.
`
  },
  2: {
    title: "Time vs Money",
    text: `
Gold preserves value.
Equity multiplies value.
`
  },
  3: {
    title: "The Farm Analogy",
    text: `
Gold is land.
Equity is crops.

Land sits.
Crops grow every season.
`
  },
  4: {
    title: "Reality Check",
    text: `
Gold: protects purchasing power.
Equity: creates new purchasing power.
`
  },
  5: {
    title: "The real insight",
    text: `
Gold protects wealth.
Equity builds wealth.
`
  }
},


"lic-myth": {
  1: {
    title: "A very Indian beginning",
    text: `
LIC feels guaranteed.
Agents are trusted.
Returns are misunderstood.
`
  },
  2: {
    title: "Time vs Money",
    text: `
Insurance is protection.
Investment is growth.

Mixing both weakens both.
`
  },
  3: {
    title: "The Umbrella Analogy",
    text: `
Umbrella saves you from rain.
It doesn’t grow crops.
`
  },
  4: {
    title: "Reality Check",
    text: `
LIC returns ≈ 4–6%
Market investing historically higher.
`
  },
  5: {
    title: "The real insight",
    text: `
Insurance is for safety.
Investments are for wealth.
`
  }
},


"lifestyle-inflation": {
  1: {
    title: "A very Indian beginning",
    text: `
Salary increases.
Phone upgrades.
Bigger car.
Better house.

Savings stay the same.
`
  },
  2: {
    title: "Time vs Money",
    text: `
Income rises fast.
Expenses rise faster.
`
  },
  3: {
    title: "The Bigger Plate Analogy",
    text: `
More food on a bigger plate
still feels insufficient.
`
  },
  4: {
    title: "Reality Check",
    text: `
No investment increase
means no future freedom.
`
  },
  5: {
    title: "The real insight",
    text: `
Wealth grows only when
expenses grow slower than income.
`
  }
}


};

  /* =========================
     FLOW ENGINE (UNCHANGED)
     ========================= */
  const steps = document.querySelectorAll(".flow-step");
  const insightBox = document.getElementById("flowInsight");
  const activeInsights = insightFlows[activeCase];

  steps.forEach(step => {
    step.addEventListener("click", () => {
      steps.forEach(s => s.classList.remove("active"));
      step.classList.add("active");

      const id = step.dataset.step;
      const data = activeInsights[id];

      insightBox.innerHTML = `
        <h4>${data.title}</h4>
        <p>${data.text.replace(/\n/g, "<br>")}</p>
      `;

      insightBox.classList.add("show");
      insightBox.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });

  /* Auto open first step */
  steps[0].click();
});




  const steps = document.querySelectorAll(".flow-step");
  const insightBox = document.getElementById("flowInsight");

  steps.forEach(step => {
    step.addEventListener("click", () => {
      steps.forEach(s => s.classList.remove("active"));
      step.classList.add("active");

      const id = step.dataset.step;
      const data = insights[id];

      insightBox.innerHTML = `
        <h4>${data.title}</h4>
        <p>${data.text.replace(/\n/g, "<br>")}</p>
      `;

      insightBox.classList.add("show");
      insightBox.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });

  // Auto-open first insight
  steps[0].click();




