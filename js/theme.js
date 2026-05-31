document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("loginThemeToggle");
  if (!toggle) return;

  toggle.addEventListener("click", () => {
    const root = document.documentElement;
    const current = root.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";

    root.setAttribute("data-theme", next);
    localStorage.setItem("finos-theme", next);
  });
});
