// CLARITY HUD LOGIC

document.addEventListener("DOMContentLoaded", () => {
  
  // 1. SCANNER ANIMATION TEXT
  const netWorthEl = document.querySelector('.value.success');
  const debtEl = document.querySelector('.value.warning');
  
  setTimeout(() => {
    netWorthEl.innerText = "DETECTED";
    debtEl.innerText = "ANALYZED";
  }, 2000); // Simulate scanning time

  // 2. EMI TIME MACHINE
  const slider = document.getElementById('emiSlider');
  const emiDisplay = document.getElementById('emiDisplay');
  const lossDisplay = document.getElementById('lossDisplay');

  slider.addEventListener('input', () => {
    const emi = parseInt(slider.value) * 1000; // 0 to 50k
    
    // Future Value Calculation: FV = P * ((1+r)^n - 1) / r
    // Actually simpler: Opportunity Cost = EMI * 12 * 10 years * Growth
    // Approx Logic: 10k EMI for 10 years @ 12% = ~23 Lakhs lost
    
    const yearly = emi * 12;
    const years = 10;
    const rate = 0.12;
    
    // Simple FV of SIP formula approximation for visual impact
    const lostWealth = (emi * 120) * 1.8; // Rough multiplier for 10yr @ 12%

    emiDisplay.innerText = `₹${emi.toLocaleString()}`;
    
    if (emi > 0) {
      lossDisplay.innerText = `₹${Math.floor(lostWealth).toLocaleString()}`;
    } else {
      lossDisplay.innerText = "₹0";
    }
  });

});

// --- LADDER ACCORDION LOGIC ---
function toggleLadder(element) {
  // 1. Close all other steps
  document.querySelectorAll('.ladder-step').forEach(step => {
    if (step !== element) {
      step.classList.remove('active');
    }
  });

  // 2. Toggle clicked step
  element.classList.toggle('active');
}