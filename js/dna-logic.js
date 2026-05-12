// DATA PERSISTENCE
let userData = {
  responses: {},
  scores: [50, 50, 50, 50, 50], // Risk, Security, Status, Discipline, Growth
  step: 0
};

// THE 10-LEVEL PROTOCOL
const steps = [
  {
    lvl: "LEVEL_00",
    q: "How many orbits have you completed? (Age)",
    options: [
      { text: "18-24 (Gen Z / Rookie)", impact: [10, -5, 5, -10, 20] },
      { text: "25-35 (Early Career)", impact: [5, 5, 10, 5, 10] },
      { text: "50+ (Exit Planning)", impact: [-15, 25, -5, 15, -15] }
    ]
  },
  {
    lvl: "LEVEL_01",
    q: "What did money represent in your house growing up?",
    options: [
      { text: "The Hisaab Mindset (Safety/Scarcity)", impact: [-10, 30, -10, 20, -10] },
      { text: "The Showroom Mindset (Status/Weddings)", impact: [5, -10, 30, -10, 5] },
      { text: "The Taboo Mindset (Never discussed)", impact: [0, 0, 0, -20, 0] }
    ]
  },
  // Add levels 02-09 here using the same structure

  {
    lvl: "LEVEL_02",
    id: "origin",
    q: "What did money represent in your house growing up?",
    options: [
      { text: "The Hisaab Mindset (Scarcity/Safety)", impact: [-10, 30, -10, 20, -10] },
      { text: "The Showroom Mindset (Status/Weddings)", impact: [5, -10, 30, -10, 5] },
      { text: "The Comfort Mindset (Needs met)", impact: [0, 10, 0, 5, 5] },
      { text: "The Taboo Mindset (Never discussed)", impact: [0, 0, 0, -20, 0] }
    ]
  },
  {
    lvl: "LEVEL_03",
    id: "emotion",
    q: "Does checking your bank statement feel like a horror movie?",
    options: [
      { text: "Zen (I am in total control)", impact: [5, 10, 0, 20, 5] },
      { text: "Anxious (I avoid looking at it)", impact: [-5, 15, 0, -15, 0] },
      { text: "Stressed (It's never enough)", impact: [0, 20, 5, -5, 0] },
      { text: "Focused (Motivated to grow)", impact: [10, 0, 5, 15, 15] }
    ]
  },
  {
    lvl: "LEVEL_04",
    id: "freedom",
    q: "What does 'Financial Freedom' look like to you?",
    options: [
      { text: "Resigning from the 9-to-5 (Time)", impact: [15, -5, 0, 10, 20] },
      { text: "Zero Debt & Large FD (Security)", impact: [-20, 30, -10, 20, -10] },
      { text: "The ability to buy Luxury (Status)", impact: [10, -10, 30, -10, 10] },
      { text: "Supporting family comfortably", impact: [-5, 20, 5, 10, 0] }
    ]
  },
  {
    lvl: "LEVEL_05",
    id: "patience",
    q: "Can you wait 10 years for a Banyan Tree to grow?",
    options: [
      { text: "Short-term (I need results in months)", impact: [20, -10, 10, -20, 5] },
      { text: "Medium-term (1-5 years)", impact: [5, 5, 5, 5, 10] },
      { text: "Long-term (10+ years)", impact: [-10, 15, -5, 30, 20] }
    ]
  },
  {
    lvl: "LEVEL_06",
    id: "risk",
    q: "Portfolio drops 20% (₹1 Lakh becomes ₹80k). Your move?",
    options: [
      { text: "Panic Sell (Protect what's left)", impact: [-30, 30, -10, -10, -20] },
      { text: "Wait & Pray (Do nothing)", impact: [0, 10, 0, 5, 0] },
      { text: "Buy the Dip (Alpha move)", impact: [30, -10, 5, 15, 25] }
    ]
  },
  {
    lvl: "LEVEL_07",
    id: "involvement",
    q: "How do you want to drive your financial car?",
    options: [
      { text: "Pilot (I want full control)", impact: [15, 0, 5, 10, 15] },
      { text: "Co-Pilot (I need guidance)", impact: [5, 5, 5, 10, 10] },
      { text: "Passenger (Automate everything)", impact: [-10, 15, 0, 20, 5] }
    ]
  },
  {
    lvl: "LEVEL_08",
    id: "social",
    q: "The 'Sharma-ji' Comparison Index: Do you feel behind?",
    options: [
      { text: "Frequently (Social pressure is real)", impact: [5, -10, 25, -5, 5] },
      { text: "Occasionally", impact: [0, 0, 5, 0, 0] },
      { text: "Never (I run my own race)", impact: [-5, 15, -10, 20, 10] }
    ]
  },
  {
    lvl: "LEVEL_09",
    id: "learning",
    q: "How do you prefer to absorb financial data?",
    options: [
      { text: "Visual Charts & Unreal UI", impact: [0, 0, 0, 0, 0] }, // UI Preference
      { text: "Real-life Desi Stories", impact: [0, 0, 0, 0, 0] },
      { text: "Hard Numbers & Logic", impact: [0, 0, 0, 0, 0] }
    ]
  }
];

// INITIALIZE RADAR CHART
const ctx = document.getElementById('dnaChart').getContext('2d');
let dnaChart = new Chart(ctx, {
  type: 'radar',
  data: {
    labels: ['Risk', 'Security', 'Status', 'Discipline', 'Growth'],
    datasets: [{
      data: userData.scores,
      backgroundColor: 'rgba(79, 124, 255, 0.2)',
      borderColor: '#4F7CFF',
      pointBackgroundColor: '#C7F000',
      borderWidth: 2
    }]
  },
  options: {
    scales: { r: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { display: false } } },
    plugins: { legend: { display: false } }
  }
});

function renderStep() {
  const current = steps[userData.step];
  const container = document.getElementById('quiz-flow');
  
  container.innerHTML = `
    <span class="lvl-tag">${current.lvl}</span>
    <h2>${current.q}</h2>
    <div class="options-list">
      ${current.options.map((opt, i) => `
        <div class="dna-option" onclick="processAnswer(${i})">
          ${opt.text}
        </div>
      `).join('')}
    </div>
  `;
  
  // Update progress bar
  document.getElementById('dna-progress').style.width = `${((userData.step + 1) / steps.length) * 100}%`;
}

function processAnswer(index) {
  const choice = steps[userData.step].options[index];
  
  // Update neural map
  userData.scores = userData.scores.map((val, i) => Math.max(0, val + choice.impact[i]));
  dnaChart.data.datasets[0].data = userData.scores;
  dnaChart.update();

  // Save to Memory
  userData.responses[steps[userData.step].lvl] = choice.text;
  localStorage.setItem('FINOS_CORE_DNA', JSON.stringify(userData));

  // Advance Step
  userData.step++;
  if (userData.step < steps.length) {
    renderStep();
  } else {
    document.getElementById('quiz-flow').innerHTML = "<h2>SCAN COMPLETE. PERSONALIZING SYSTEM...</h2>";
    setTimeout(() => window.location.href = 'dashboard.html', 2000);
  }
}

/**
 * THEME TOGGLE LOGIC
 * Synchronizes the UI and the Radar Chart with Profile page colors.
 */
function toggleAppTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    // 1. Update Global Attribute
    html.setAttribute('data-theme', newTheme);
    
    // 2. Update Button Icon (Moon -> Sun)
    const btn = document.getElementById('themeToggle');
    if (btn) btn.textContent = newTheme === 'dark' ? '🌙' : '☀️';

    // 3. Re-calibrate Neural Radar Map Visuals
    if (window.dnaChart) {
        const isDark = newTheme === 'dark';
        // Set colors based on the new background
        const labelColor = isDark ? '#9AA0B4' : '#5E6475';
        const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

        dnaChart.options.scales.r.pointLabels.color = labelColor;
        dnaChart.options.scales.r.grid.color = gridColor;
        dnaChart.options.scales.r.angleLines.color = gridColor;
        
        dnaChart.update('none'); // Snappy update for Unreal UI feel
    }

    // 4. Save to System Memory
    localStorage.setItem('FINOS_THEME', newTheme);
}

renderStep();



/**
 * THEME TOGGLE: Attached to window to fix the "not working" issue.
 */
window.toggleAppTheme = function() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    // 1. Update global theme attribute
    html.setAttribute('data-theme', newTheme);
    
    // 2. Update button icon
    const btn = document.getElementById('themeToggle');
    if (btn) btn.textContent = newTheme === 'dark' ? '🌙' : '☀️';

    // 3. Update Radar Chart colors for light mode visibility
    if (window.dnaChart) {
        const isDark = newTheme === 'dark';
        const labelColor = isDark ? '#9AA0B4' : '#5E6475';
        const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

        window.dnaChart.options.scales.r.pointLabels.color = labelColor;
        window.dnaChart.options.scales.r.grid.color = gridColor;
        window.dnaChart.options.scales.r.angleLines.color = gridColor;
        
        window.dnaChart.update('none'); 
    }

    // 4. Save to System Settings
    localStorage.setItem('FINOS_THEME', newTheme);
};



// js/dna-logic.js

document.addEventListener("DOMContentLoaded", async () => {

  // ==========================================
  // 1. CONFIGURATION
  // ==========================================
const supabaseUrl = 'https://oeapcyucnduhwpgxfknb.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lYXBjeXVjbmR1aHdwZ3hma25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNjE1NjgsImV4cCI6MjA4MzgzNzU2OH0.kyuz385hM4X3j8CMBFfI83ZerorvlXrUDOipAHKDC7Q';
  const client = window.supabase.createClient(supabaseUrl, supabaseKey);

  // Data State
  let userData = {
    responses: {},  
    scores: [50, 50, 50, 50, 50], // Risk, Security, Status, Discipline, Growth
    step: 0
  };

  // THE 10-LEVEL PROTOCOL
  const steps = [
    {
      lvl: "LEVEL_00",
      q: "How many orbits have you completed? (Age)",
      options: [
        { text: "18-24 (Gen Z / Rookie)", impact: [10, -5, 5, -10, 20] },
        { text: "25-35 (Early Career)", impact: [5, 5, 10, 5, 10] },
        { text: "50+ (Exit Planning)", impact: [-15, 25, -5, 15, -15] }
      ]
    },
    {
      lvl: "LEVEL_01",
      q: "What did money represent in your house growing up?",
      options: [
        { text: "The Hisaab Mindset (Safety/Scarcity)", impact: [-10, 30, -10, 20, -10] },
        { text: "The Showroom Mindset (Status/Weddings)", impact: [5, -10, 30, -10, 5] },
        { text: "The Taboo Mindset (Never discussed)", impact: [0, 0, 0, -20, 0] }
      ]
    },
    {
      lvl: "LEVEL_02",
      q: "Does checking your bank statement feel like a horror movie?",
      options: [
        { text: "Zen (I am in total control)", impact: [5, 10, 0, 20, 5] },
        { text: "Anxious (I avoid looking at it)", impact: [-5, 15, 0, -15, 0] },
        { text: "Stressed (It's never enough)", impact: [0, 20, 5, -5, 0] },
        { text: "Focused (Motivated to grow)", impact: [10, 0, 5, 15, 15] }
      ]
    },
    {
      lvl: "LEVEL_03",
      q: "What does 'Financial Freedom' look like to you?",
      options: [
        { text: "Resigning from the 9-to-5 (Time)", impact: [15, -5, 0, 10, 20] },
        { text: "Zero Debt & Large FD (Security)", impact: [-20, 30, -10, 20, -10] },
        { text: "The ability to buy Luxury (Status)", impact: [10, -10, 30, -10, 10] },
        { text: "Supporting family comfortably", impact: [-5, 20, 5, 10, 0] }
      ]
    },
    {
      lvl: "LEVEL_04",
      q: "Can you wait 10 years for a Banyan Tree to grow?",
      options: [
        { text: "Short-term (I need results in months)", impact: [20, -10, 10, -20, 5] },
        { text: "Medium-term (1-5 years)", impact: [5, 5, 5, 5, 10] },
        { text: "Long-term (10+ years)", impact: [-10, 15, -5, 30, 20] }
      ]
    },
    {
      lvl: "LEVEL_05",
      q: "Portfolio drops 20% (₹1 Lakh becomes ₹80k). Your move?",
      options: [
        { text: "Panic Sell (Protect what's left)", impact: [-30, 30, -10, -10, -20] },
        { text: "Wait & Pray (Do nothing)", impact: [0, 10, 0, 5, 0] },
        { text: "Buy the Dip (Alpha move)", impact: [30, -10, 5, 15, 25] }
      ]
    },
    {
      lvl: "LEVEL_06",
      q: "How do you want to drive your financial car?",
      options: [
        { text: "Pilot (I want full control)", impact: [15, 0, 5, 10, 15] },
        { text: "Co-Pilot (I need guidance)", impact: [5, 5, 5, 10, 10] },
        { text: "Passenger (Automate everything)", impact: [-10, 15, 0, 20, 5] }
      ]
    },
    {
      lvl: "LEVEL_07",
      q: "The 'Sharma-ji' Comparison Index: Do you feel behind?",
      options: [
        { text: "Frequently (Social pressure is real)", impact: [5, -10, 25, -5, 5] },
        { text: "Occasionally", impact: [0, 0, 5, 0, 0] },
        { text: "Never (I run my own race)", impact: [-5, 15, -10, 20, 10] }
      ]
    },
    {
      lvl: "LEVEL_08",
      q: "How do you prefer to absorb financial data?",
      options: [
        { text: "Visual Charts & Unreal UI", impact: [0, 0, 0, 0, 0] }, 
        { text: "Real-life Desi Stories", impact: [0, 0, 0, 0, 0] },
        { text: "Hard Numbers & Logic", impact: [0, 0, 0, 0, 0] }
      ]
    }
  ];

  // ==========================================
  // 2. INITIALIZE CHART
  // ==========================================
  const ctx = document.getElementById('dnaChart').getContext('2d');
  let dnaChart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: ['Risk', 'Security', 'Status', 'Discipline', 'Growth'],
      datasets: [{
        data: userData.scores,
        backgroundColor: 'rgba(79, 124, 255, 0.2)',
        borderColor: '#4F7CFF',
        pointBackgroundColor: '#C7F000',
        borderWidth: 2
      }]
    },
    options: {
      scales: { r: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { display: false }, pointLabels: { color: '#fff' } } },
      plugins: { legend: { display: false } }
    }
  });

  // ==========================================
  // 3. LOAD SAVED PROGRESS (Database)
  // ==========================================
  const { data: { session } } = await client.auth.getSession();
  if (!session) {
      window.location.href = 'login.html';
      return;
  }
  const user = session.user;

  // Fetch previous results
  const { data: profile } = await client
    .from('profiles')
    .select('dna_results, dna_scores')
    .eq('id', user.id)
    .single();

  if (profile) {
    if (profile.dna_scores) {
      userData.scores = profile.dna_scores;
      dnaChart.data.datasets[0].data = userData.scores;
      dnaChart.update();
    }
    
    if (profile.dna_results) {
      userData.responses = profile.dna_results;
      // Calculate which step we are on based on how many questions answered
      const answeredCount = Object.keys(userData.responses).length;
      userData.step = answeredCount;
      console.log("Restored Progress: Level", userData.step);
    }
  }

  // ==========================================
  // 4. RENDER ENGINE
  // ==========================================
  function renderStep() {
    // Check if complete
    if (userData.step >= steps.length) {
      document.getElementById('quiz-flow').innerHTML = `
        <h2 style="color:#C7F000">SCAN COMPLETE.</h2>
        <p>Your Financial DNA has been sequenced.</p>
        <button onclick="window.location.href='dashboard.html'" class="foundation-btn" style="margin-top:20px; justify-content:center;">
           ENTER DASHBOARD
        </button>
      `;
      document.getElementById('dna-progress').style.width = '100%';
      return;
    }

    const current = steps[userData.step];
    const container = document.getElementById('quiz-flow');
    
    container.innerHTML = `
      <span class="lvl-tag" style="color:#4F7CFF; font-family:'JetBrains Mono'; font-size:0.8rem;">
         // ${current.lvl}
      </span>
      <h2 style="margin-top:10px;">${current.q}</h2>
      <div class="options-list" style="display:flex; flex-direction:column; gap:12px; margin-top:20px;">
        ${current.options.map((opt, i) => `
          <div class="dna-option" data-idx="${i}" 
               style="padding:16px; border:1px solid rgba(255,255,255,0.1); border-radius:12px; cursor:pointer; transition:all 0.2s;">
            ${opt.text}
          </div>
        `).join('')}
      </div>
    `;

    // Attach click listeners
    const opts = container.querySelectorAll('.dna-option');
    opts.forEach(opt => {
        opt.addEventListener('click', () => processAnswer(parseInt(opt.dataset.idx)));
    });
    
    // Update progress bar
    document.getElementById('dna-progress').style.width = `${((userData.step) / steps.length) * 100}%`;
  }

  async function processAnswer(index) {
    const currentStepObj = steps[userData.step];
    const choice = currentStepObj.options[index];
    
    // 1. Update Chart Logic
    userData.scores = userData.scores.map((val, i) => Math.max(0, val + choice.impact[i]));
    dnaChart.data.datasets[0].data = userData.scores;
    dnaChart.update();

    // 2. Update Local State
    userData.responses[currentStepObj.lvl] = choice.text;

    // 3. SAVE TO DATABASE (Fire & Forget)
    await client
      .from('profiles')
      .update({ 
        dna_results: userData.responses,
        dna_scores: userData.scores
      })
      .eq('id', user.id);

    // 4. Advance
    userData.step++;
    renderStep();
  }

  // Start the Engine
  renderStep();
});