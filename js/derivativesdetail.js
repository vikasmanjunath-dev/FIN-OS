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

  // 3. CHART: TIME DECAY
  const ctx = document.getElementById('decayChart').getContext('2d');
  
  function getThemeColor() {
    const theme = document.documentElement.getAttribute('data-theme');
    return theme === 'light' ? '#475569' : '#A1A8B8';
  }

  let decayChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['30 Days', '15 Days', '7 Days', '3 Days', '1 Day', 'Expiry'],
      datasets: [{
        label: 'Option Value',
        data: [100, 90, 75, 50, 20, 0], // Exponential Decay
        borderColor: '#ff4757',
        borderWidth: 2,
        tension: 0.4,
        pointRadius: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { 
        y: { display: false, grid: { display: false } }, 
        x: { grid: { display: false }, ticks: { color: getThemeColor(), font: { size: 10 } } } 
      }
    }
  });

  if(themeBtn) {
    themeBtn.addEventListener('click', () => {
      setTimeout(() => {
        const newColor = getThemeColor();
        decayChart.options.scales.x.ticks.color = newColor;
        decayChart.update();
      }, 100);
    });
  }
});