document.addEventListener("DOMContentLoaded", async () => {

    // ==========================================
    // 1. CONFIGURATION & DATABASE
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

    // ==========================================
    // 2. THE PROTOCOL (Cleaned & De-duplicated)
    // ==========================================
    const steps = [
        {
            lvl: "LEVEL_00",
            id: "age",
            q: "How many orbits have you completed? (Age)",
            options: [
                { text: "18-24 (Gen Z / Rookie)", impact: [10, -5, 5, -10, 20] },
                { text: "25-35 (Early Career)", impact: [5, 5, 10, 5, 10] },
                { text: "50+ (Exit Planning)", impact: [-15, 25, -5, 15, -15] }
            ]
        },
        {
            lvl: "LEVEL_01",
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
            lvl: "LEVEL_02",
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
            lvl: "LEVEL_03",
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
            lvl: "LEVEL_04",
            id: "patience",
            q: "Can you wait 10 years for a Banyan Tree to grow?",
            options: [
                { text: "Short-term (I need results in months)", impact: [20, -10, 10, -20, 5] },
                { text: "Medium-term (1-5 years)", impact: [5, 5, 5, 5, 10] },
                { text: "Long-term (10+ years)", impact: [-10, 15, -5, 30, 20] }
            ]
        },
        {
            lvl: "LEVEL_05",
            id: "risk",
            q: "Portfolio drops 20% (₹1 Lakh becomes ₹80k). Your move?",
            options: [
                { text: "Panic Sell (Protect what's left)", impact: [-30, 30, -10, -10, -20] },
                { text: "Wait & Pray (Do nothing)", impact: [0, 10, 0, 5, 0] },
                { text: "Buy the Dip (Alpha move)", impact: [30, -10, 5, 15, 25] }
            ]
        },
        {
            lvl: "LEVEL_06",
            id: "involvement",
            q: "How do you want to drive your financial car?",
            options: [
                { text: "Pilot (I want full control)", impact: [15, 0, 5, 10, 15] },
                { text: "Co-Pilot (I need guidance)", impact: [5, 5, 5, 10, 10] },
                { text: "Passenger (Automate everything)", impact: [-10, 15, 0, 20, 5] }
            ]
        },
        {
            lvl: "LEVEL_07",
            id: "social",
            q: "The 'Sharma-ji' Comparison Index: Do you feel behind?",
            options: [
                { text: "Frequently (Social pressure is real)", impact: [5, -10, 25, -5, 5] },
                { text: "Occasionally", impact: [0, 0, 5, 0, 0] },
                { text: "Never (I run my own race)", impact: [-5, 15, -10, 20, 10] }
            ]
        },
        {
            lvl: "LEVEL_08",
            id: "learning",
            q: "How do you prefer to absorb financial data?",
            options: [
                { text: "Visual Charts & Unreal UI", impact: [0, 0, 0, 0, 0] },
                { text: "Real-life Desi Stories", impact: [0, 0, 0, 0, 0] },
                { text: "Hard Numbers & Logic", impact: [0, 0, 0, 0, 0] }
            ]
        }
    ];

    // ==========================================
    // 3. INITIALIZE RADAR CHART
    // ==========================================
    const ctx = document.getElementById('dnaChart').getContext('2d');
    window.dnaChart = new Chart(ctx, {
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
            scales: {
                r: {
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { display: false },
                    pointLabels: { color: '#fff' }
                }
            },
            plugins: { legend: { display: false } }
        }
    });

    // ==========================================
    // 4. AUTHENTICATION & LOAD SAVED PROGRESS
    // ==========================================
    const { data: { session } } = await client.auth.getSession();
    if (!session) {
        window.location.href = 'login.html';
        return;
    }
    const user = session.user;

    const { data: profile } = await client
        .from('profiles')
        .select('dna_results, dna_scores')
        .eq('id', user.id)
        .single();

    if (profile) {
        if (profile.dna_scores) {
            userData.scores = profile.dna_scores;
            window.dnaChart.data.datasets[0].data = userData.scores;
            window.dnaChart.update();
        }

        if (profile.dna_results) {
            userData.responses = profile.dna_results;
            const answeredCount = Object.keys(userData.responses).length;
            userData.step = answeredCount;
        }
    }

    // ==========================================
    // 5. RENDER ENGINE & LOGIC
    // ==========================================
    function renderStep() {
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

        const opts = container.querySelectorAll('.dna-option');
        opts.forEach(opt => {
            opt.addEventListener('click', () => processAnswer(parseInt(opt.dataset.idx)));
        });

        document.getElementById('dna-progress').style.width = `${((userData.step) / steps.length) * 100}%`;
    }

    async function processAnswer(index) {
        const currentStepObj = steps[userData.step];
        const choice = currentStepObj.options[index];

        // 1. Update Chart
        userData.scores = userData.scores.map((val, i) => Math.max(0, val + choice.impact[i]));
        window.dnaChart.data.datasets[0].data = userData.scores;
        window.dnaChart.update();

        // 2. Update Local State
        userData.responses[currentStepObj.lvl] = choice.text;

        // 3. Save locally for Ollama Backend (Instant read access for chat)
        localStorage.setItem('FINOS_CORE_DNA', JSON.stringify({
            responses: userData.responses,
            scores: userData.scores
        }));

        // 4. Save to Supabase
        await client
            .from('profiles')
            .update({
                dna_results: userData.responses,
                dna_scores: userData.scores
            })
            .eq('id', user.id);

        // 5. Advance
        userData.step++;
        renderStep();
    }

    renderStep();
});

// ==========================================
// 6. GLOBAL HELPERS (Attached to window)
// ==========================================

window.toggleAppTheme = function() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    html.setAttribute('data-theme', newTheme);
    
    const btn = document.getElementById('themeToggle');
    if (btn) btn.textContent = newTheme === 'dark' ? '🌙' : '☀️';

    if (window.dnaChart) {
        const isDark = newTheme === 'dark';
        const labelColor = isDark ? '#9AA0B4' : '#5E6475';
        const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

        window.dnaChart.options.scales.r.pointLabels.color = labelColor;
        window.dnaChart.options.scales.r.grid.color = gridColor;
        window.dnaChart.options.scales.r.angleLines.color = gridColor;
        
        window.dnaChart.update('none'); 
    }

    localStorage.setItem('FINOS_THEME', newTheme);
};

window.getDNAContextForOllama = function() {
    const rawData = localStorage.getItem('FINOS_CORE_DNA');
    if (!rawData) return "";
    
    try {
        const dnaData = JSON.parse(rawData);
        return `
Scores (Out of 100):
- Risk Tolerance: ${dnaData.scores[0]}
- Security Need: ${dnaData.scores[1]}
- Status Drive: ${dnaData.scores[2]}
- Financial Discipline: ${dnaData.scores[3]}
- Growth Ambition: ${dnaData.scores[4]}

Key Mindset Indicators:
${Object.entries(dnaData.responses).map(([level, answer]) => `- ${level}: ${answer}`).join('\n')}
        `;
    } catch (e) {
        console.error("Error parsing DNA data", e);
        return "";
    }
};