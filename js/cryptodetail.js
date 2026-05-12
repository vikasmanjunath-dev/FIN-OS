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

  // 3. CHART: THE CYCLE (Bitcoin Halving Logic)
  const ctx = document.getElementById('cycleChart').getContext('2d');
  
  function getThemeColor() {
    const theme = document.documentElement.getAttribute('data-theme');
    return theme === 'light' ? '#475569' : '#A1A8B8';
  }

  let cycleChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Halving', 'Year 1 (Bull)', 'Year 2 (Bear)', 'Year 3 (Boring)', 'Halving'],
      datasets: [{
        label: 'Price Cycle',
        data: [100, 500, 150, 200, 300], // The typical boom-bust pattern
        borderColor: '#9b59b6', // Crypto Purple
        borderWidth: 3,
        tension: 0.4,
        pointBackgroundColor: '#9b59b6'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { 
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => ` Sentiment: ${c.dataIndex === 1 ? 'Euphoria' : c.dataIndex === 2 ? 'Panic' : 'Hope'}` } } 
      },
      scales: { 
        y: { display: false, grid: { display: false } }, 
        x: { grid: { display: false }, ticks: { color: getThemeColor() } } 
      }
    }
  });

  if(themeBtn) {
    themeBtn.addEventListener('click', () => {
      setTimeout(() => {
        const newColor = getThemeColor();
        cycleChart.options.scales.x.ticks.color = newColor;
        cycleChart.update();
      }, 100);
    });
  }
});