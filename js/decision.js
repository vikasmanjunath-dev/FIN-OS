// DECISION CORE LOGIC

function switchMode(mode) {
  // 1. UI Toggle
  document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('active'));
  document.querySelector(`.mode-card.${mode}`).classList.add('active');

  // 2. Scenario Update
  const fastR = document.getElementById('fastReaction');
  const slowR = document.getElementById('slowReaction');

  if (mode === 'fast') {
    fastR.classList.remove('hidden');
    slowR.classList.add('hidden');
  } else {
    fastR.classList.add('hidden');
    slowR.classList.remove('hidden');
  }
}

// PROBABILITY CHART
document.addEventListener("DOMContentLoaded", () => {
  const ctx = document.getElementById('probChart').getContext('2d');
  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Success', 'Failure', 'Neutral'],
      datasets: [{
        data: [20, 50, 30],
        backgroundColor: ['#C7F000', '#ff4757', '#4a5568'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'right', labels: { color: '#888' } } }
    }
  });

  // 3D TILT EFFECT FOR CARDS
  document.querySelectorAll('.bug-card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      const rotateX = (y - centerY) / 20;
      const rotateY = (centerX - x) / 20;
      
      card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = `perspective(1000px) rotateX(0) rotateY(0)`;
    });
  });
});