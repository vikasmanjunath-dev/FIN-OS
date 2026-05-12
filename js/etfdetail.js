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

  // 3. CHART: COST IMPACT
  const ctx = document.getElementById('costChart').getContext('2d');
  
  function getThemeColor() {
    const theme = document.documentElement.getAttribute('data-theme');
    return theme === 'light' ? '#475569' : '#9CA0AB';
  }

  let costChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Year 0', 'Year 5', 'Year 10', 'Year 15', 'Year 20'],
      datasets: [
        {
          label: 'ETF (0.1% Fee) - Wealth',
          data: [10, 16, 26, 42, 68], // Simulating ~10% CAGR
          borderColor: '#C7F000',
          borderWidth: 3,
          tension: 0.4
        },
        {
          label: 'Mutual Fund (1.5% Fee) - Wealth',
          data: [10, 15, 22, 33, 49], // 1.5% drag compounds massively
          borderColor: '#ff4757',
          borderWidth: 3,
          tension: 0.4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { 
        legend: { labels: { color: getThemeColor() } },
        tooltip: { callbacks: { label: (context) => ` ₹${context.raw} Lakhs` } } 
      },
      scales: { 
        y: { display: true, grid: { display: false }, ticks: { color: getThemeColor(), callback: (value) => '₹' + value + 'L' } }, 
        x: { grid: { display: false }, ticks: { color: getThemeColor() } } 
      }
    }
  });

  if(themeBtn) {
    themeBtn.addEventListener('click', () => {
      setTimeout(() => {
        const newColor = getThemeColor();
        costChart.options.plugins.legend.labels.color = newColor;
        costChart.options.scales.x.ticks.color = newColor;
        costChart.options.scales.y.ticks.color = newColor;
        costChart.update();
      }, 100);
    });
  }
});