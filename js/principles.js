document.addEventListener("DOMContentLoaded", () => {

  // =========================
  // 1. TAB SWITCHER
  // =========================
  const modeBtns = document.querySelectorAll('.mode-btn');
  const views = document.querySelectorAll('.view-container');

  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Buttons
      modeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Views
      const target = btn.dataset.target;
      views.forEach(v => v.classList.remove('active'));
      document.getElementById(`${target}-view`).classList.add('active');
    });
  });

  // =========================
  // 2. SIMULATOR: LAW OF EFFORT
  // =========================
  const salaryInput = document.getElementById('monthlySalary');
  const priceInput = document.getElementById('itemPrice');
  const effortResult = document.getElementById('effortResult');

  function calcEffort() {
    const salary = parseFloat(salaryInput.value) || 0;
    const price = parseFloat(priceInput.value) || 0;
    
    // Assume 22 working days * 9 hours = ~200 hours/month
    const hourlyRate = salary / 200;
    
    if (hourlyRate > 0) {
      const hoursNeeded = (price / hourlyRate).toFixed(1);
      effortResult.innerHTML = `That item costs <strong>${hoursNeeded} Hours</strong> of your life.`;
    } else {
      effortResult.innerHTML = "Enter valid salary.";
    }
  }

  salaryInput.addEventListener('input', calcEffort);
  priceInput.addEventListener('input', calcEffort);

  // =========================
  // 3. SIMULATOR: 100 - AGE RULE
  // =========================
  const ageSlider = document.getElementById('ageSlider');
  const ageVal = document.getElementById('ageVal');
  const equityBar = document.getElementById('equityBar');
  const debtBar = document.getElementById('debtBar');

  ageSlider.addEventListener('input', () => {
    const age = parseInt(ageSlider.value);
    ageVal.innerText = age;

    let equity = 100 - age;
    // Cap equity min at 20% for safety logic visuals
    if(equity < 20) equity = 20;

    const debt = 100 - equity;

    equityBar.style.width = `${equity}%`;
    equityBar.innerText = `Equity: ${equity}%`;
    
    debtBar.style.width = `${debt}%`;
    debtBar.innerText = `Debt: ${debt}%`;
  });

  // =========================
  // 4. SIMULATOR: RULE OF 72
  // =========================
  const returnSelect = document.getElementById('returnRate');
  const doublingBox = document.getElementById('doublingResult');

  returnSelect.addEventListener('change', () => {
    const rate = parseFloat(returnSelect.value);
    const years = (72 / rate).toFixed(1);
    
    doublingBox.innerHTML = `Doubles in: <strong>${years} Years</strong>`;
  });

});