/* Reveal on load — uses IntersectionObserver for performance */
(function () {
  var reveals = document.querySelectorAll(".reveal");
  if (!reveals.length) return;

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.style.opacity = "1";
          entry.target.style.transform = "translateY(0)";
          entry.target.style.transition = "opacity 1s cubic-bezier(0.16,1,0.3,1), transform 1s cubic-bezier(0.16,1,0.3,1)";
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    // Fallback: show all immediately
    reveals.forEach(function (el) {
      el.style.opacity = "1";
      el.style.transform = "translateY(0)";
    });
  }
})();

/* Magnetic Button — null-guarded, only activates when element exists */
(function () {
  var btn = document.querySelector(".magnetic");
  if (!btn) return;

  btn.addEventListener("mousemove", function (e) {
    var rect = btn.getBoundingClientRect();
    var x = e.clientX - rect.left - rect.width / 2;
    var y = e.clientY - rect.top - rect.height / 2;
    btn.style.transform = "translate(" + (x * 0.15) + "px, " + (y * 0.15) + "px)";
  });

  btn.addEventListener("mouseleave", function () {
    btn.style.transform = "translate(0,0)";
  });
})();
