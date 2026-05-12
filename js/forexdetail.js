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

  // 3. CHART: SCALE COMPARISON
  const ctx = document.getElementById('scaleChart').getContext('2d');
  
  function getThemeColor() {
    const theme = document.documentElement.getAttribute('data-theme');
    return theme === 'light' ? '#475569' : '#A1A8B8';
  }

  let scaleChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['NY Stock Exchange', 'Forex Market'],
      datasets: [{
        label: 'Daily Volume ($ Billions)',
        data: [22, 7000], // Scale difference
        backgroundColor: ['#4F7CFF', '#00f260'],
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { 
        y: { type: 'logarithmic', grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: getThemeColor() } }, 
        x: { grid: { display: false }, ticks: { color: getThemeColor() } } 
      }
    }
  });

  if(themeBtn) {
    themeBtn.addEventListener('click', () => {
      setTimeout(() => {
        const newColor = getThemeColor();
        scaleChart.options.scales.x.ticks.color = newColor;
        scaleChart.options.scales.y.ticks.color = newColor;
        scaleChart.update();
      }, 100);
    });
  }
});