/* Reveal on load */
window.addEventListener("load", () => {
  document.querySelectorAll(".reveal").forEach((el, i) => {
    setTimeout(() => {
      el.style.opacity = "1";
      el.style.transform = "translateY(0)";
      el.style.transition = "all 1s cubic-bezier(0.16, 1, 0.3, 1)";
    }, i * 150);
  });
});

/* Magnetic Button */
const btn = document.querySelector(".magnetic");

btn.addEventListener("mousemove", (e) => {
  const rect = btn.getBoundingClientRect();
  const x = e.clientX - rect.left - rect.width / 2;
  const y = e.clientY - rect.top - rect.height / 2;

  btn.style.transform = `translate(${x * 0.15}px, ${y * 0.15}px)`;
});

btn.addEventListener("mouseleave", () => {
  btn.style.transform = "translate(0,0)";
});
