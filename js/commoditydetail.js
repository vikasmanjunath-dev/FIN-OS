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

  // 3. CHART: PORTFOLIO ALLOCATION
  const ctx = document.getElementById('allocationChart').getContext('2d');
  
  function getThemeColor() {
    const theme = document.documentElement.getAttribute('data-theme');
    return theme === 'light' ? '#475569' : '#A1A8B8';
  }

  let allocationChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Equity (Growth)', 'Debt (Stability)', 'Commodities (Protection)'],
      datasets: [{
        data: [70, 20, 10],
        backgroundColor: [
          '#4F7CFF', // Equity Blue
          '#2ecc71', // Debt Green
          '#F39C12'  // Commodity Gold
        ],
        borderWidth: 0,
        hoverOffset: 10
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { 
        legend: { labels: { color: getThemeColor(), font: { family: 'JetBrains Mono' } } },
        tooltip: { callbacks: { label: (c) => ` ${c.label}: ${c.raw}%` } } 
      }
    }
  });

  if(themeBtn) {
    themeBtn.addEventListener('click', () => {
      setTimeout(() => {
        const newColor = getThemeColor();
        allocationChart.options.plugins.legend.labels.color = newColor;
        allocationChart.update();
      }, 100);
    });
  }
});