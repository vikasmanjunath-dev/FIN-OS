/* =========================
   THEME TOGGLE (GLOBAL)
   ========================= */

(function () {
  const root = document.documentElement;
  const toggle = document.getElementById("themeToggle");

  if (!toggle) return;

  const savedTheme = localStorage.getItem("finos-theme");
  if (savedTheme) root.setAttribute("data-theme", savedTheme);

  toggle.textContent =
    root.getAttribute("data-theme") === "dark" ? "🌙" : "☀️";

  toggle.onclick = () => {
    const next =
      root.getAttribute("data-theme") === "dark" ? "light" : "dark";

    root.setAttribute("data-theme", next);
    localStorage.setItem("finos-theme", next);
    toggle.textContent = next === "dark" ? "🌙" : "☀️";
  };
})();
