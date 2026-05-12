document.addEventListener("DOMContentLoaded", () => {

  const steps = [
    {
      key: "age",
      q: "Where are you in life right now?",
      options: ["Just starting", "Building life", "Protecting future"],
      energy: "#4f7cff"
    },
    {
      key: "profession",
      q: "How do you earn money?",
      options: ["Fixed salary", "Business / freelance", "Multiple incomes"],
      energy: "#c7f000"
    },
    {
      key: "lifePOV",
      q: "Which feels most like you?",
      options: [
        "Enjoy life AND plan the future",
        "Future matters more than enjoyment",
        "I live in the present"
      ],
      energy: "#ffb703"
    },
    {
      key: "risk",
      q: "Your relationship with risk?",
      options: ["Avoid risk", "Calculated risk", "Comfortable with volatility"],
      energy: "#ff006e"
    },
    {
      key: "family",
      q: "Who depends on your decisions?",
      options: ["Just me", "1–2 dependents", "3+ dependents"],
      energy: "#8338ec"
    },
    {
      key: "market",
      q: "The stock market feels like…",
      options: [
        "Gambling",
        "Confusing but important",
        "A long-term wealth tool"
      ],
      energy: "#00f5d4"
    }
  ];

  let step = 0;
  let selected = null;
  const answers = {};

  const qEl = document.getElementById("question");
  const optEl = document.getElementById("options");
  const btn = document.getElementById("nextBtn");
  const orb = document.getElementById("coreOrb");

  function render() {
    selected = null;
    btn.disabled = true;
    btn.classList.remove("enabled");

    qEl.textContent = steps[step].q;
    optEl.innerHTML = "";

    steps[step].options.forEach(opt => {
      const div = document.createElement("div");
      div.className = "option";
      div.textContent = opt;

      div.onclick = () => {
        document.querySelectorAll(".option").forEach(o => o.classList.remove("active"));
        div.classList.add("active");
        selected = opt;

        orb.style.boxShadow = `0 0 60px ${steps[step].energy}, 0 0 140px ${steps[step].energy}`;
        btn.disabled = false;
        btn.classList.add("enabled");
      };

      optEl.appendChild(div);
    });
  }

  btn.onclick = () => {
    if (!selected) return;

    answers[steps[step].key] = selected;
    step++;

    if (step >= steps.length) {
      localStorage.setItem("finos_profile", JSON.stringify(answers));
      window.location.href = "home.html";
      return;
    }

    render();
  };

  render();
});
