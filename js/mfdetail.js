document.addEventListener("DOMContentLoaded", () => {
  const progressBar = document.getElementById('progressBar');
  const scrollContainer = document.getElementById('scrollContainer');
  const tocLinks = document.querySelectorAll('.toc-link');
  const chapters = document.querySelectorAll('.chapter');
  const themeBtn = document.getElementById('themeToggle');

  // 1. SCROLL SPY
  scrollContainer.addEventListener('scroll', () => {
    const scrollTop = scrollContainer.scrollTop;
    const scrollHeight = scrollContainer.scrollHeight - scrollContainer.clientHeight;
    const scrolled = (scrollTop / scrollHeight) * 100;
    progressBar.style.width = scrolled + "%";

    chapters.forEach(chapter => {
      const rect = chapter.getBoundingClientRect();
      const id = chapter.getAttribute('id');
      
      if(rect.top >= -150 && rect.top < window.innerHeight * 0.5) {
        tocLinks.forEach(link => {
          link.classList.remove('active');
          if(link.getAttribute('href') === `#${id}`) link.classList.add('active');
        });
        chapters.forEach(c => c.style.opacity = '0.3');
        chapter.style.opacity = '1';
      }
    });
  });

  // 2. SMOOTH SCROLL
  tocLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = link.getAttribute('href').substring(1);
      document.getElementById(targetId).scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // 3. CHART: SIP vs LUMP SUM (Visualizing Volatility Smoothing)
  const ctx = document.getElementById('sipChart').getContext('2d');
  
  function getThemeColor() {
    const theme = document.documentElement.getAttribute('data-theme');
    return theme === 'light' ? '#475569' : '#9CA0AB';
  }

  let sipChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'],
      datasets: [
        {
          label: 'Market Price (Volatile)',
          data: [100, 90, 85, 110, 105, 95, 120, 130, 115, 140],
          borderColor: '#ff4757', // Red for danger/volatility
          borderWidth: 2,
          tension: 0.4,
          pointRadius: 0
        },
        {
          label: 'SIP Portfolio Value (Smoothed)',
          data: [100, 102, 105, 108, 112, 116, 122, 130, 138, 148], // Steady climb
          borderColor: '#C7F000', // Neon Green for growth
          borderWidth: 3,
          tension: 0.4,
          backgroundColor: 'rgba(199, 240, 0, 0.1)',
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { 
        legend: { labels: { color: getThemeColor(), font: { family: 'JetBrains Mono' } } },
        tooltip: { mode: 'index', intersect: false }
      },
      scales: { 
        y: { display: false }, 
        x: { grid: { display: false }, ticks: { color: getThemeColor() } } 
      }
    }
  });

  if(themeBtn) {
    themeBtn.addEventListener('click', () => {
      setTimeout(() => {
        const newColor = getThemeColor();
        sipChart.options.plugins.legend.labels.color = newColor;
        sipChart.options.scales.x.ticks.color = newColor;
        sipChart.update();
      }, 100);
    });
  }
});