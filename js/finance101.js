document.addEventListener("DOMContentLoaded", () => {
  
  // --- INTELLIGENT THEME DETECTION ---
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  
  // Dynamic Colors
  const textColor = isDark ? '#9CA0AB' : '#4a5568'; // Grey vs Dark Grey
  const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
  
  // Set Defaults
  Chart.defaults.color = textColor;
  Chart.defaults.font.family = "'Inter', sans-serif";
  
  const neonGreen = '#C7F000';
  const electricBlue = '#4F7CFF';
  const dangerRed = '#ff4757';

  // --- CHART 1: INCOME VS WEALTH ---
  const ctx1 = document.getElementById('incomeWealthChart').getContext('2d');
  new Chart(ctx1, {
    type: 'line',
    data: {
      labels: ['Year 1', 'Year 3', 'Year 5', 'Year 7', 'Year 10'],
      datasets: [
        {
          label: 'Salary (Income)',
          data: [5, 8, 12, 18, 25],
          borderColor: electricBlue,
          borderWidth: 3,
          tension: 0.4,
          pointRadius: 0
        },
        {
          label: 'Net Worth (The Reality)',
          data: [1, 2, 3, 4, 5],
          borderColor: dangerRed,
          borderWidth: 3,
          borderDash: [5, 5],
          tension: 0.4,
          pointRadius: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: textColor } }
      },
      scales: {
        y: { 
          grid: { color: gridColor }, 
          ticks: { color: textColor },
          title: { display: true, text: 'Amount (₹ Lakhs)', color: textColor } 
        },
        x: { 
          grid: { display: false },
          ticks: { color: textColor }
        }
      }
    }
  });

// --- CHART 2: NEEDS VS WANTS (Radar) ---
  const ctx2 = document.getElementById('needsWantsChart').getContext('2d');
  new Chart(ctx2, {
    type: 'radar',
    data: {
      labels: ['Housing', 'Food', 'Transport', 'Status', 'Social', 'FOMO'],
      datasets: [{
        label: 'Typical Spender',
        data: [40, 30, 20, 80, 90, 70],
        backgroundColor: 'rgba(255, 71, 87, 0.2)',
        borderColor: dangerRed,
        pointBackgroundColor: dangerRed,
      },
      {
        label: 'Fin-OS User',
        data: [50, 40, 30, 20, 10, 10],
        backgroundColor: 'rgba(199, 240, 0, 0.2)',
        borderColor: neonGreen,
        pointBackgroundColor: neonGreen,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false, // <--- THIS LINE STOPS THE INFINITE GROWTH
      scales: {
        r: {
          angleLines: { color: 'rgba(255,255,255,0.1)' },
          grid: { color: 'rgba(255,255,255,0.1)' },
          pointLabels: { color: '#888', font: { size: 11 } },
          ticks: { display: false, backdropColor: 'transparent' }
        }
      },
      plugins: { legend: { position: 'bottom', labels: {color: '#888'} } }
    }
  });

  // --- CHART 3: INFLATION THIEF ---
  const ctx3 = document.getElementById('inflationChart').getContext('2d');
  new Chart(ctx3, {
    type: 'bar',
    data: {
      labels: ['2014', '2024'],
      datasets: [
        {
          label: 'Salary (Growth)',
          data: [100, 180],
          backgroundColor: electricBlue,
          borderRadius: 8
        },
        {
          label: 'Cost of Living',
          data: [100, 220],
          backgroundColor: dangerRed,
          borderRadius: 8
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: textColor } }
      },
      scales: {
        y: { display: false },
        x: { grid: { display: false }, ticks: { color: textColor } }
      }
    }
  });

// --- SCROLL DRAG LOGIC (Keep this for the cards) ---
  const sliders = document.querySelectorAll('.scrolling-wrapper');
  let isDown = false;
  let startX;
  let scrollLeft;

  sliders.forEach(slider => {
    slider.addEventListener('mousedown', (e) => {
      isDown = true;
      slider.classList.add('active');
      startX = e.pageX - slider.offsetLeft;
      scrollLeft = slider.scrollLeft;
      slider.style.cursor = 'grabbing';
    });

    slider.addEventListener('mouseleave', () => {
      isDown = false;
      slider.classList.remove('active');
      slider.style.cursor = 'grab';
    });

    slider.addEventListener('mouseup', () => {
      isDown = false;
      slider.classList.remove('active');
      slider.style.cursor = 'grab';
    });

    slider.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - slider.offsetLeft;
      const walk = (x - startX) * 2;
      slider.scrollLeft = scrollLeft - walk;
    });
  });

  // --- REMOVED THE SCROLL REVEAL ANIMATION TO STOP INFINITE MOVEMENT ---
  // Elements will now load statically and won't jump around.
  document.querySelectorAll('.module, .intro-card, .fin-footer').forEach(el => {
    el.style.opacity = 1;
    el.style.transform = 'none';
    });
  });

  