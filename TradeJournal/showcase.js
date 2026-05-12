/* ═══════════════════════════════════════════════════════════════
   PREMIUM SHOWCASE JS LOGIC
   Handles IntersectionObservers and Cursor Glow Effects
   ═══════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Scroll Reveal Animations (Intersection Observer)
  const revealElements = document.querySelectorAll('.reveal-up');
  
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target); // Only animate once
      }
    });
  }, {
    root: null,
    threshold: 0.1, // Trigger when 10% visible
    rootMargin: "0px 0px -50px 0px"
  });

  revealElements.forEach(el => revealObserver.observe(el));

  // 2. Bento Card Mouse Tracking (Linear/Stripe style glow effect)
  const bentoCards = document.querySelectorAll('.sc-bento-card');
  
  bentoCards.forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Update custom properties for the pseudo-element glow
      card.style.setProperty('--mouse-x', `${x}px`);
      card.style.setProperty('--mouse-y', `${y}px`);
    });
  });

  // 3. Optional: Add a simple chart animation to the mockup if it becomes visible
  const mockChart = document.querySelector('.sc-mock-chart');
  if (mockChart) {
    // Generate some fake bars inside the mock chart for visual flair
    for(let i=0; i<20; i++) {
      const bar = document.createElement('div');
      const height = 20 + Math.random() * 60; // 20% to 80%
      bar.style.cssText = `
        position: absolute;
        bottom: 0;
        left: ${5 * i}%;
        width: 4%;
        height: ${height}%;
        background: var(--accent);
        opacity: ${0.2 + Math.random() * 0.5};
        border-top-left-radius: 2px;
        border-top-right-radius: 2px;
      `;
      mockChart.appendChild(bar);
    }
  }
});
