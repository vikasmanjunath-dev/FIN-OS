document.addEventListener("DOMContentLoaded", () => {
  const theme = localStorage.getItem('theme') || 'dark';
  const textColor = theme === 'light' ? '#333' : '#ccc';

  // --- 1. INFLATION CHART (If element exists) ---
  const inflCtx = document.getElementById('inflationChart');
  if (inflCtx) {
    new Chart(inflCtx, {
      type: 'line',
      data: {
        labels: ['2014', '2016', '2018', '2020', '2022', '2024'],
        datasets: [
          { label: 'Official Inflation (CPI)', data: [100, 112, 125, 140, 155, 172], borderColor: '#4F7CFF', borderWidth: 2 },
          { label: 'Lifestyle Inflation (Real)', data: [100, 120, 145, 175, 210, 250], borderColor: '#ff4757', borderWidth: 3 }
        ]
      },
      options: { responsive: true, plugins: { legend: { labels: { color: textColor } } }, scales: { x: { ticks: { color: textColor } }, y: { ticks: { color: textColor } } } }
    });
  }

  // --- 2. SIP DELAY CHART ---
  const sipCtx = document.getElementById('sipDelayChart');
  if (sipCtx) {
    new Chart(sipCtx, {
      type: 'bar',
      data: {
        labels: ['Start at 25', 'Start at 35 (Delay)'],
        datasets: [{
          label: 'Corpus at Age 55 (₹)',
          data: [1.8, 0.6], // Crores approx for 5k SIP
          backgroundColor: ['#2ecc71', '#ff4757'],
          borderRadius: 8
        }]
      },
      options: { plugins: { title: { display: true, text: 'Cost of Waiting 10 Years (₹ Crores)', color: textColor } } }
    });
  }

  // --- 3. EMI ANIMATION LOGIC ---
  const emiSlider = document.getElementById('emiSlider');
  if (emiSlider) {
    emiSlider.addEventListener('input', (e) => {
      const val = e.target.value; // 0 to 100 (Timeline)
      const interestWidth = Math.max(10, 90 - val); // Interest starts high, drops
      document.querySelector('.emi-interest').style.width = interestWidth + '%';
      document.querySelector('.emi-principal').style.width = (100 - interestWidth) + '%';
      
      document.getElementById('emiYear').innerText = `Year: ${Math.floor(val/10) + 1}`;
    });
  }
});