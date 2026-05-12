document.addEventListener("DOMContentLoaded", () => {
  
  // 1. NAVIGATION SCROLL LOGIC
  const navPills = document.querySelectorAll('.nav-pill');
  
  navPills.forEach(pill => {
    pill.addEventListener('click', () => {
      // Active State
      navPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      
      // Scroll to Section
      const targetId = pill.dataset.target;
      const targetSection = document.getElementById(targetId);
      if (targetSection) {
        targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // 2. SCROLL REVEAL ANIMATION
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target); // Stop watching once revealed
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.market-section').forEach(section => {
    observer.observe(section);
  });

  // 3. CHART.JS CONFIG (Equity Returns)
  const ctx = document.getElementById('equityReturnChart').getContext('2d');
  
  // Theme check
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#9CA0AB' : '#4a5568';

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Short Term (1Yr)', 'Medium Term (5Yr)', 'Long Term (10Yr)'],
      datasets: [
        {
          label: 'Price Fluctuation (Noise)',
          data: [80, 40, 10],
          backgroundColor: '#ff4757',
          borderRadius: 6
        },
        {
          label: 'Business Growth (Profit)',
          data: [20, 60, 90],
          backgroundColor: '#C7F000',
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: textColor } },
        title: { display: true, text: 'What Drives Stock Prices?', color: textColor }
      },
      scales: {
        y: { stacked: true, display: false },
        x: { stacked: true, grid: { display: false }, ticks: { color: textColor } }
      }
    }
  });

  // 4. HORIZONTAL DRAG SCROLL (Reused from Fin-101)
  const sliders = document.querySelectorAll('.scrolling-wrapper');
  let isDown = false;
  let startX;
  let scrollLeft;

  sliders.forEach(slider => {
    slider.addEventListener('mousedown', (e) => {
      isDown = true;
      slider.style.cursor = 'grabbing';
      startX = e.pageX - slider.offsetLeft;
      scrollLeft = slider.scrollLeft;
    });
    slider.addEventListener('mouseleave', () => { isDown = false; slider.style.cursor = 'grab'; });
    slider.addEventListener('mouseup', () => { isDown = false; slider.style.cursor = 'grab'; });
    slider.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - slider.offsetLeft;
      const walk = (x - startX) * 2;
      slider.scrollLeft = scrollLeft - walk;
    });
  });

});



// --- PERSONA SELECTOR INTERACTION ---
window.selectPersona = function(type) {
  const text = document.querySelector('.you-decide');
  const buttons = document.querySelectorAll('.choice-btn');
  
  // Reset buttons
  buttons.forEach(btn => btn.style.opacity = '0.5');
  
  // Highlight text
  if (type === 'investor') {
    text.innerText = "WELCOME, INVESTOR.";
    text.style.backgroundImage = "linear-gradient(90deg, #C7F000, #fff)";
    event.target.style.opacity = '1';
    event.target.style.transform = 'scale(1.1)';
  } else {
    text.innerText = "WELCOME, TRADER.";
    text.style.backgroundImage = "linear-gradient(90deg, #4F7CFF, #fff)";
    event.target.style.opacity = '1';
    event.target.style.transform = 'scale(1.1)';
  }
};