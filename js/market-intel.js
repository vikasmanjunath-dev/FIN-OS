document.addEventListener("DOMContentLoaded", () => {
  
  // --- 1. SETUP THE LIVE PULSE CHART (Chart.js) ---
  const ctx = document.getElementById('pulseChart').getContext('2d');
  
  // Gradient for the line
  const gradient = ctx.createLinearGradient(0, 0, 0, 400);
  gradient.addColorStop(0, 'rgba(79, 124, 255, 0.5)'); // Blue glow
  gradient.addColorStop(1, 'rgba(79, 124, 255, 0)');

  const pulseChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: Array.from({length: 20}, (_, i) => i + 1), // 1 to 20
      datasets: [{
        label: 'Market Momentum',
        data: [10, 12, 11, 14, 13, 16, 18, 17, 22, 24, 23, 21, 25, 28, 30, 29, 32, 35, 33, 36],
        borderColor: '#4F7CFF',
        backgroundColor: gradient,
        borderWidth: 3,
        pointBackgroundColor: '#fff',
        pointBorderColor: '#4F7CFF',
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.4 // Smooth curves
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.8)',
          titleColor: '#C7F000',
          bodyColor: '#fff',
          callbacks: {
            label: function(context) {
              return 'Momentum: ' + context.parsed.y;
            }
          }
        }
      },
      scales: {
        x: { display: false }, // Hide X axis for cleaner look
        y: {
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#6B7280' }
        }
      },
      animation: {
        y: { duration: 2000, easing: 'easeOutQuart' }
      }
    }
  });

  // --- 2. DESI ANALOGY ENGINE LOGIC ---
  
  const analogyData = {
    'vol': {
      icon: '📢',
      title: 'Volume = Dadar Station',
      tech: 'High Volume Breakout',
      reality: 'Imagine Dadar station at 6 PM. If the crowd is pushing you, you HAVE to move. That is High Volume. If the price moves but volume is low, it is an empty train. Fake move.'
    },
    'sup': {
      icon: '🧱',
      title: 'Support = The Floor',
      tech: 'Price Rejection at Support',
      reality: 'Think of a ball hitting the floor. It bounces back up. Support is where buyers are waiting like a safety net. If the floor breaks, you fall to the basement (Next Support).'
    },
    'mom': {
      icon: '🚂',
      title: 'Momentum = Mumbai Local',
      tech: 'RSI > 60',
      reality: 'The train has started moving. It is hard to stop. Don\'t stand in front of it (Shorting). Jump in if you can run fast (Scalping).'
    }
  };

  window.changeAnalogy = function(type) {
    const card = document.getElementById('analogyCard');
    const data = analogyData[type];
    
    // Animate Out
    card.style.opacity = '0';
    card.style.transform = 'translateY(10px)';
    
    setTimeout(() => {
      // Update Content
      card.innerHTML = `
        <div class="icon-box">${data.icon}</div>
        <h4>${data.title}</h4>
        <p><strong>Technical:</strong> ${data.tech}</p>
        <p><strong>Reality:</strong> ${data.reality}</p>
      `;
      
      // Animate In
      card.style.opacity = '1';
      card.style.transform = 'translateY(0)';
      
      // Update Border Color dynamically
      if(type === 'vol') card.style.borderLeftColor = '#C7F000'; // Green
      if(type === 'sup') card.style.borderLeftColor = '#4F7CFF'; // Blue
      if(type === 'mom') card.style.borderLeftColor = '#9b59b6'; // Purple
      
    }, 300);
  };

  // --- 3. SIMULATE LIVE DATA (The "Unreal" Effect) ---
  setInterval(() => {
    // Get current data array
    const data = pulseChart.data.datasets[0].data;
    
    // Remove first point
    data.shift();
    
    // Add new random point (Simulating market noise)
    const lastValue = data[data.length - 1];
    const noise = Math.floor(Math.random() * 5) - 2; // -2 to +2
    let newValue = lastValue + noise;
    
    // Keep within bounds
    if(newValue < 10) newValue = 15;
    if(newValue > 50) newValue = 45;
    
    data.push(newValue);
    
    // Update chart
    pulseChart.update('none'); // 'none' for performance
    
  }, 1500); // Every 1.5 seconds

});