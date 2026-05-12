document.addEventListener('DOMContentLoaded', () => {

  // 1. SCROLL PROGRESS BAR
  window.addEventListener('scroll', () => {
    const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
    const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    const scrolled = (scrollTop / scrollHeight) * 100;
    const bar = document.querySelector('.scroll-progress');
    if (bar) bar.style.width = scrolled + "%";
  });

  // 2. REGIME TOGGLE LOGIC
  const toggleInput = document.getElementById('regimeToggle');
  const displayArea = document.getElementById('regimeContent');

  const oldRegimeHTML = `
    <div class="regime-card fade-in">
      <h3 style="color:#4F7CFF">🏛️ OLD REGIME — FY 2025-26</h3>
      <p>Higher slab rates, but you get access to <strong>all deductions and exemptions</strong> (80C, 80D, HRA, etc.).</p>
      <table class="slab-table">
        <thead>
          <tr><th>Income Slab</th><th>Tax Rate</th></tr>
        </thead>
        <tbody>
          <tr><td>Up to ₹2,50,000</td><td class="rate nil">NIL</td></tr>
          <tr><td>₹2,50,001 – ₹5,00,000</td><td class="rate low">5%</td></tr>
          <tr><td>₹5,00,001 – ₹10,00,000</td><td class="rate mid">20%</td></tr>
          <tr><td>Above ₹10,00,000</td><td class="rate max">30%</td></tr>
        </tbody>
      </table>
      <div class="regime-note">
        <strong>Rebate u/s 87A:</strong> If taxable income ≤ ₹5,00,000 → Tax = ₹0 (rebate of ₹12,500).<br>
        <strong>Standard Deduction:</strong> ₹50,000 for salaried individuals.<br>
        <strong>Deductions available:</strong> 80C (₹1.5L), 80D (₹25K-₹1L), 80CCD(1B) (₹50K), HRA, LTA, Section 24(b) (₹2L), 80E, 80G, and more.
      </div>
      <div class="desi-tip">"Best for: Salaried employees with home loans, HRA, health insurance, and ₹1.5L+ in 80C investments."</div>
    </div>
  `;

  const newRegimeHTML = `
    <div class="regime-card fade-in">
      <h3 style="color:#C7F000">🚀 NEW REGIME (Default) — FY 2025-26</h3>
      <p>Lower slab rates with <strong>zero deductions</strong> (except standard deduction ₹75,000 and employer NPS 80CCD(2)).</p>
      <table class="slab-table">
        <thead>
          <tr><th>Income Slab</th><th>Tax Rate</th></tr>
        </thead>
        <tbody>
          <tr><td>Up to ₹4,00,000</td><td class="rate nil">NIL</td></tr>
          <tr><td>₹4,00,001 – ₹8,00,000</td><td class="rate low">5%</td></tr>
          <tr><td>₹8,00,001 – ₹12,00,000</td><td class="rate low">10%</td></tr>
          <tr><td>₹12,00,001 – ₹16,00,000</td><td class="rate mid">15%</td></tr>
          <tr><td>₹16,00,001 – ₹20,00,000</td><td class="rate mid">20%</td></tr>
          <tr><td>₹20,00,001 – ₹24,00,000</td><td class="rate high">25%</td></tr>
          <tr><td>Above ₹24,00,000</td><td class="rate max">30%</td></tr>
        </tbody>
      </table>
      <div class="regime-note">
        <strong>Rebate u/s 87A:</strong> If taxable income ≤ ₹12,00,000 → Tax = ₹0 (rebate of ₹60,000). Effectively tax-free up to ~₹12.75L with standard deduction.<br>
        <strong>Standard Deduction:</strong> ₹75,000 for salaried (enhanced from ₹50K).<br>
        <strong>Surcharge capped</strong> at 25% (vs 37% in Old Regime for income > ₹5Cr).
      </div>
      <div class="desi-tip">"Best for: Young earners, people without home loans/HRA, those who prefer simplicity over tax-saving investments."</div>
    </div>
  `;

  if (toggleInput && displayArea) {
    toggleInput.addEventListener('change', () => {
      displayArea.innerHTML = toggleInput.checked ? newRegimeHTML : oldRegimeHTML;
    });
    displayArea.innerHTML = oldRegimeHTML;
  }

  // 3. INTERSECTION OBSERVER FOR ANIMATIONS
  const sections = document.querySelectorAll('.tax-section');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = "1";
        entry.target.style.transform = "translateY(0)";
      }
    });
  }, { threshold: 0.1 });

  sections.forEach(section => {
    section.style.opacity = "0";
    section.style.transform = "translateY(30px)";
    observer.observe(section);
  });

  // 4. SMOOTH SCROLL FOR NAV LINKS
  document.querySelectorAll('.tax-nav a').forEach(link => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (href && href.startsWith('#')) {
        e.preventDefault();
        const target = document.querySelector(href);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    });
  });

  // 5. THEME TOGGLE — handled by ui.js globally, no duplicate listener needed
});
