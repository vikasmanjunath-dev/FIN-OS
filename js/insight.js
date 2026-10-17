document.addEventListener("DOMContentLoaded", () => {
  const theme = localStorage.getItem('theme') || 'dark';
  const textColor = theme === 'light' ? '#333' : '#ccc';

  // --- 1. INFLATION CHART (If element exists) ---
  const inflCtx = document.getElementById('inflationChart');
  if (inflCtx) {
    new Chart(inflCtx, {
      type: 'line',
      data: {
        labels: ['Start', 'Year 2', 'Year 4', 'Year 6', 'Year 8', 'Year 10'],
        datasets: [
          { label: 'Illustrative price index (not CPI data)', data: [100, 112, 125, 140, 155, 172], borderColor: '#4F7CFF', borderWidth: 2 },
          { label: 'Illustrative household basket (not measured)', data: [100, 120, 145, 175, 210, 250], borderColor: '#ff4757', borderWidth: 3 }
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
          data: [1.75, 0.495], // ₹ crore; assumed ₹5,000 monthly SIP at 12% annual return
          backgroundColor: ['#2ecc71', '#ff4757'],
          borderRadius: 8
        }]
      },
      options: { plugins: { title: { display: true, text: 'Illustration: ₹5,000/month at an assumed 12% annual return (₹ crore)', color: textColor } } }
    });
  }

  // --- 3. EMI AMORTISATION EXAMPLE ---
  const emiSlider = document.getElementById('emiSlider');
  if (emiSlider) {
    const principal = 1000000;
    const annualRate = 0.09;
    const months = 20 * 12;
    const monthlyRate = annualRate / 12;
    const emi = principal * monthlyRate * Math.pow(1 + monthlyRate, months) /
      (Math.pow(1 + monthlyRate, months) - 1);
    const updateEmiSplit = () => {
      const year = Number(emiSlider.value);
      let balance = principal;
      let interestInYear = 0;
      let paymentsInYear = 0;
      for (let month = 1; month <= year * 12; month += 1) {
        const interest = balance * monthlyRate;
        const principalPaid = Math.min(balance, emi - interest);
        if (month > (year - 1) * 12) {
          interestInYear += interest;
          paymentsInYear += interest + principalPaid;
        }
        balance = Math.max(0, balance - principalPaid);
      }
      const interestWidth = Math.max(0, Math.min(100, interestInYear / paymentsInYear * 100));
      document.querySelector('.emi-interest').style.width = interestWidth + '%';
      document.querySelector('.emi-principal').style.width = (100 - interestWidth) + '%';
      document.getElementById('emiYear').innerText = `Illustrative year ${year}: ${interestWidth.toFixed(0)}% interest / ${(100 - interestWidth).toFixed(0)}% principal`;
    };
    emiSlider.addEventListener('input', updateEmiSplit);
    updateEmiSplit();
  }
});