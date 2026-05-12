// js/impact.js

function sipImpact() {
  const monthly = 500;
  const years = 30;
  const rate = 0.12;

  const months = years * 12;
  const futureValue =
    monthly *
    ((Math.pow(1 + rate / 12, months) - 1) / (rate / 12));

  alert("₹500/month → ₹" + Math.round(futureValue));
}

document.querySelectorAll(".card.insight").forEach(card => {
  card.addEventListener("click", () => {
    const key = card.dataset.impact;
    window.location.href = `impact-detail.html?case=${key}`;
  });
});


