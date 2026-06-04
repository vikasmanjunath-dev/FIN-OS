document.addEventListener("DOMContentLoaded", async () => {

    // ==========================================
    // 1. CONFIGURATION & DATABASE (Optional)
    // ==========================================
    const supabaseUrl = 'https://oeapcyucnduhwpgxfknb.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lYXBjeXVjbmR1aHdwZ3hma25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNjE1NjgsImV4cCI6MjA4MzgzNzU2OH0.kyuz385hM4X3j8CMBFfI83ZerorvlXrUDOipAHKDC7Q';

    // Safe client — may stay null if Supabase SDK not loaded
    let client = null;
    try {
        if (window.supabase) {
            client = window.supabase.createClient(supabaseUrl, supabaseKey);
        }
    } catch (e) {
        console.debug('[DNA] Supabase optional — guest mode:', e.message);
    }

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
    // 4. LOAD SAVED PROGRESS (No login required)
    // ==========================================
    // Priority: Supabase DB (if logged in) → localStorage cache
    let user = null;

    if (client) {
        try {
            const { data: { session } } = await client.auth.getSession();
            if (session) user = session.user;
        } catch (e) {
            console.debug('[DNA] Session check skipped:', e.message);
        }
    }

    if (client && user) {
        try {
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
                    userData.step = Object.keys(userData.responses).length;
                }
            }
        } catch (e) {
            console.debug('[DNA] DB load skipped:', e.message);
        }
    } else {
        // Guest: restore from localStorage if available
        try {
            const cached = JSON.parse(localStorage.getItem('FINOS_CORE_DNA') || '{}');
            if (cached.scores) {
                userData.scores = cached.scores;
                window.dnaChart.data.datasets[0].data = userData.scores;
                window.dnaChart.update();
            }
            if (cached.responses) {
                userData.responses = cached.responses;
                userData.step = Object.keys(userData.responses).length;
            }
        } catch (_) {}
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
        userData.scores = userData.scores.map((val, i) => Math.min(100, Math.max(0, val + choice.impact[i])));
        window.dnaChart.data.datasets[0].data = userData.scores;
        window.dnaChart.update();

        // 2. Update Local State
        userData.responses[currentStepObj.lvl] = choice.text;

        // 3. Save locally (always — works in guest mode)
        localStorage.setItem('FINOS_CORE_DNA', JSON.stringify({
            responses: userData.responses,
            scores: userData.scores
        }));

        // 4. Silently sync to Supabase if logged in
        if (client && user) {
            try {
                await client
                    .from('profiles')
                    .update({
                        dna_results: userData.responses,
                        dna_scores: userData.scores
                    })
                    .eq('id', user.id);
            } catch (e) {
                console.debug('[DNA] Supabase save skipped:', e.message);
            }
        }

        // 5. Advance
        userData.step++;
        renderStep();
        // When quiz ends, trigger AI behavioral debrief
        if (userData.step >= steps.length) {
            setTimeout(() => window.runBehavioralDebrief && window.runBehavioralDebrief(), 800);
        }
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

// ==========================================
// 7. BEHAVIORAL AI DEBRIEF (Phase 2)
// ==========================================

window.runBehavioralDebrief = async function() {
    const rawData = localStorage.getItem('FINOS_CORE_DNA');
    if (!rawData) return;

    let dnaData;
    try { dnaData = JSON.parse(rawData); } catch { return; }

    const scores    = dnaData.scores || [50,50,50,50,50];
    const archetype = localStorage.getItem('finos_financial_dna') || 'Explorer';

    // Inject debrief panel into page
    let debriefEl = document.getElementById('dna-ai-debrief');
    if (!debriefEl) {
        debriefEl = document.createElement('div');
        debriefEl.id = 'dna-ai-debrief';
        debriefEl.style.cssText = 'margin-top:32px;padding:24px;border-radius:18px;background:linear-gradient(135deg,rgba(124,58,255,.08),rgba(0,255,136,.04));border:1px solid rgba(124,58,255,.2);font-family:-apple-system,sans-serif;';
        debriefEl.innerHTML = `
          <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#a78bff;margin-bottom:12px;display:flex;align-items:center;gap:8px;">
            🧠 Arya's Behavioral Finance Debrief
            <span style="font-size:10px;color:rgba(255,255,255,.25);">Kahneman · Thaler · Ariely</span>
          </div>
          <div id="dna-debrief-text" style="font-size:14px;color:rgba(255,255,255,.82);line-height:1.75;min-height:60px;">
            <span style="color:rgba(255,255,255,.35);">Arya tera behavioral profile analyse kar rahi hai…</span>
          </div>
          <div id="dna-bias-chips" style="margin-top:16px;display:flex;flex-wrap:wrap;gap:8px;"></div>
          <div id="dna-strategy-box" style="display:none;margin-top:16px;padding:14px;border-radius:12px;background:rgba(0,255,136,.05);border:1px solid rgba(0,255,136,.15);">
            <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#00ff88;margin-bottom:8px;">Recommended Strategy</div>
            <div id="dna-strategy-text" style="font-size:13px;color:rgba(255,255,255,.8);line-height:1.7;"></div>
          </div>
          <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap;">
            <button onclick="window.runBehavioralDebrief()" style="padding:8px 18px;border-radius:10px;border:1px solid rgba(124,58,255,.3);background:rgba(124,58,255,.08);color:#a78bff;font-size:12px;font-weight:700;cursor:pointer;font-family:-apple-system,sans-serif;">↺ Re-analyse</button>
            <button onclick="window._dnaVoiceDebrief()" style="padding:8px 18px;border-radius:10px;border:1px solid rgba(0,255,136,.3);background:rgba(0,255,136,.06);color:#00ff88;font-size:12px;font-weight:700;cursor:pointer;font-family:-apple-system,sans-serif;">🎙 Arya se sunna</button>
          </div>
        `;

        // Append to quiz container or visualizer section
        const target = document.querySelector('.visualizer') || document.querySelector('.dna-terminal-container') || document.body;
        target.appendChild(debriefEl);
    }

    const textEl     = document.getElementById('dna-debrief-text');
    const chipsEl    = document.getElementById('dna-bias-chips');
    const stratBoxEl = document.getElementById('dna-strategy-box');
    const stratEl    = document.getElementById('dna-strategy-text');

    textEl.innerHTML = '<span style="color:rgba(255,255,255,.35);">Arya analyse kar rahi hai…</span>';
    chipsEl.innerHTML = '';
    stratBoxEl.style.display = 'none';

    // Try WebSocket agent first for full behavioral_analysis
    let wsSuccess = false;
    try {
        await new Promise((resolve, reject) => {
            const ws = new WebSocket('ws://127.0.0.1:8765');
            const timer = setTimeout(() => { ws.close(); reject('timeout'); }, 5000);
            ws.onopen = () => {
                ws.send(JSON.stringify({
                    type: 'behavioral_analysis',
                    scores,
                    archetype,
                    responses: dnaData.responses || {},
                }));
            };
            ws.onmessage = (e) => {
                try {
                    const msg = JSON.parse(e.data);
                    if (msg.type === 'behavioral_analysis_result') {
                        clearTimeout(timer);
                        ws.close();
                        _renderDebrief(JSON.parse(msg.payload));
                        wsSuccess = true;
                        resolve();
                    }
                } catch {}
            };
            ws.onerror = () => reject('ws_error');
        });
    } catch {}

    // Fallback: direct Ollama call
    if (!wsSuccess) {
        await _dnaOllamaDebrief(scores, archetype, dnaData.responses || {});
    }
};

async function _dnaOllamaDebrief(scores, archetype, responses) {
    const OLLAMA_URL   = 'http://localhost:11434/api/generate';
    const OLLAMA_MODEL = 'qwen3:14b';

    const textEl = document.getElementById('dna-debrief-text');

    const biasDescriptions = {
        loss_aversion:    'Loss se 2-3× zyada affected hota hai compared to same gain',
        overconfidence:   'Apni abilities aur predictions ko overestimate karta hai',
        recency_bias:     'Recent events ko future ka indicator maanta hai',
        anchoring:        'Pehli number (entry price, etc.) pe too much weight deta hai',
        herd_mentality:   'Jo sab kar rahe hain wahi karta hai without analysis',
        sunk_cost:        'Losing position hold karta hai kyunki "already invest kiya hai"',
        confirmation_bias:'Sirf woh information dhundhta hai jo apna view confirm kare',
    };

    const prompt = `
Behavioral DNA scores (0-100):
Risk Tolerance: ${scores[0]}, Security Need: ${scores[1]}, Status Drive: ${scores[2]}, Financial Discipline: ${scores[3]}, Growth Ambition: ${scores[4]}
Archetype: ${archetype}

Based on these scores, identify the top 2 behavioral finance biases this person likely has.
Return JSON:
{
  "primary_bias": "bias_name",
  "secondary_bias": "bias_name",
  "cognitive_traps": ["trap1", "trap2"],
  "optimal_strategy": "one sentence",
  "annual_cost_estimate": number,
  "debrief": "3-sentence warm Hinglish debrief. Name the bias, show how it manifests in financial decisions, give one specific habit to fix it."
}
Reply ONLY with valid JSON.`.trim();

    try {
        const resp = await fetch(OLLAMA_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: OLLAMA_MODEL, prompt,
                system: 'You are a behavioral finance psychologist. Reply only with JSON. No markdown.',
                stream: false,
                options: { temperature: 0.5, num_predict: 400 },
            }),
        });
        const data = await resp.json();
        const raw  = (data.response || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?|```/g, '').trim();
        const parsed = JSON.parse(raw);
        _renderDebrief(parsed);
    } catch (e) {
        if (textEl) textEl.textContent = 'AI offline — Ollama start karo for behavioral analysis. Your scores show you\'re a ' + archetype + '.';
    }
}

function _renderDebrief(data) {
    const textEl     = document.getElementById('dna-debrief-text');
    const chipsEl    = document.getElementById('dna-bias-chips');
    const stratBoxEl = document.getElementById('dna-strategy-box');
    const stratEl    = document.getElementById('dna-strategy-text');

    if (!textEl) return;

    // Debrief text
    textEl.textContent = data.debrief || 'Analysis complete — check your score radar.';

    // Bias chips
    if (chipsEl && (data.primary_bias || data.cognitive_traps)) {
        const items = [
            data.primary_bias   ? { label: '⚠ ' + data.primary_bias.replace(/_/g,' '),   color: '#ff6b6b' } : null,
            data.secondary_bias ? { label: '⚡ ' + data.secondary_bias.replace(/_/g,' '), color: '#ffb703' } : null,
            ...(data.cognitive_traps || []).map(t => ({ label: t, color: 'rgba(255,255,255,.4)' })),
        ].filter(Boolean);

        chipsEl.innerHTML = items.map(item => `
            <span style="padding:4px 12px;border-radius:20px;font-size:11px;font-weight:600;
              background:${item.color}14;border:1px solid ${item.color}40;color:${item.color};">
              ${item.label}
            </span>`).join('');
    }

    // Strategy box
    if (stratBoxEl && stratEl && data.optimal_strategy) {
        stratBoxEl.style.display = 'block';
        let stratText = data.optimal_strategy;
        if (data.annual_cost_estimate > 0) {
            stratText += ` (Estimated bias cost: ₹${data.annual_cost_estimate.toLocaleString('en-IN')}/year)`;
        }
        stratEl.textContent = stratText;
    }

    // Save to localStorage
    try {
        const existing = JSON.parse(localStorage.getItem('FINOS_CORE_DNA') || '{}');
        existing.behavioral_analysis = data;
        localStorage.setItem('FINOS_CORE_DNA', JSON.stringify(existing));
        localStorage.setItem('finos_primary_bias', data.primary_bias || '');
    } catch {}
}

window._dnaVoiceDebrief = function() {
    const data = JSON.parse(localStorage.getItem('FINOS_CORE_DNA') || '{}');
    const debrief = data.behavioral_analysis?.debrief || data.debrief || 'Analysis not available yet — run the quiz first.';
    try {
        const ws = new WebSocket('ws://127.0.0.1:8765');
        ws.onopen = () => {
            ws.send(JSON.stringify({ type: 'text_input', text: `[BEHAVIORAL DEBRIEF — read aloud warmly]: ${debrief}` }));
            setTimeout(() => { try { ws.close(); } catch {} }, 20000);
        };
        ws.onerror = () => alert('Voice agent offline — start voiceagent/agent.py');
    } catch {}
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