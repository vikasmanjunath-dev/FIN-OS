document.addEventListener("DOMContentLoaded", () => {
  
  const progressBar = document.getElementById('progressBar');
  const scrollContainer = document.getElementById('scrollContainer');
  const tocLinks = document.querySelectorAll('.toc-link');
  const chapters = document.querySelectorAll('.chapter');

  // --- 1. SCROLL SPY & PROGRESS ---
  scrollContainer.addEventListener('scroll', () => {
    const scrollTop = scrollContainer.scrollTop;
    const scrollHeight = scrollContainer.scrollHeight - scrollContainer.clientHeight;
    const scrolled = (scrollTop / scrollHeight) * 100;
    
    progressBar.style.width = scrolled + "%";

    chapters.forEach(chapter => {
      const rect = chapter.getBoundingClientRect();
      const id = chapter.getAttribute('id');
      
      // Trigger Point: When section is 40% into view
      if(rect.top >= 0 && rect.top < window.innerHeight * 0.4) {
        
        // Update TOC
        tocLinks.forEach(link => {
          link.classList.remove('active');
          if(link.getAttribute('href') === `#${id}`) {
            link.classList.add('active');
          }
        });

        // Highlight Section
        chapters.forEach(c => c.style.opacity = '0.3');
        chapter.style.opacity = '1';
      }
    });
  });

  // --- 2. SMOOTH CLICK SCROLL ---
  tocLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = link.getAttribute('href').substring(1);
      const targetSection = document.getElementById(targetId);
      
      targetSection.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    });
  });

  // --- 3. CHART.JS VISUALIZATION ---
  const ctx = document.getElementById('expectationChart').getContext('2d');
  
  // Theme Aware Colors
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#9CA0AB' : '#475569';

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Q1', 'Q2', 'Q3 (Result Day)', 'Q4'],
      datasets: [
        {
          label: 'Market Expectation',
          data: [100, 120, 150, 160],
          borderColor: '#4F7CFF',
          borderDash: [5, 5],
          tension: 0.4
        },
        {
          label: 'Actual Reality',
          data: [100, 120, 140, 130], // Missed expectation
          borderColor: '#ff4757',
          borderWidth: 3,
          tension: 0.4
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: textColor } },
        tooltip: { mode: 'index', intersect: false }
      },
      scales: {
        y: { display: false },
        x: { grid: { display: false }, ticks: { color: textColor } }
      }
    }
  });

});

// 4. Chart (Expectation vs Reality)
  const ctx = document.getElementById('expectationChart').getContext('2d');
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Q1', 'Q2', 'Q3 (Result)', 'Q4'],
      datasets: [
        { label: 'Market Expectation', data: [100, 120, 150, 160], borderColor: '#4F7CFF', borderDash: [5, 5] },
        { label: 'Reality (Miss)', data: [100, 120, 140, 130], borderColor: '#ff4757', borderWidth: 3 }
      ]
    },
    options: { responsive: true, scales: { y: { display: false }, x: { grid: { display: false } } } }
  });



    if(themeBtn) {
    themeBtn.addEventListener('click', () => {
      setTimeout(() => {
        const newColor = getThemeColor();
        chartInstance.options.plugins.legend.labels.color = newColor;
        chartInstance.options.scales.x.ticks.color = newColor;
        chartInstance.update();
      }, 100);
    });
  }
