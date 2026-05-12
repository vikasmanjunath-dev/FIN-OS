document.addEventListener("DOMContentLoaded", async () => {

    // ========================================================
    // 0. SYSTEM CONFIGURATION
    // ========================================================
    const supabaseUrl = 'https://oeapcyucnduhwpgxfknb.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lYXBjeXVjbmR1aHdwZ3hma25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNjE1NjgsImV4cCI6MjA4MzgzNzU2OH0.kyuz385hM4X3j8CMBFfI83ZerorvlXrUDOipAHKDC7Q';

    // DOM Elements
    const loader = document.getElementById('loader');
    const scanSection = document.getElementById('scanSection');
    const mirrorSection = document.getElementById('mirrorSection');
    let currentUser = null;

    // ========================================================
    // 1. THE DEEP PROBE MATRIX (High-Sensitivity Weights)
    // ========================================================
    const questions = [
        {
            category: 'MARKET VOLATILITY RESPONSE',
            text: "The market crashes 20% in a week. Your portfolio is down significantly. Your honest physical reaction:",
            options: [
                { label: "Physical nausea. I sell to stop the pain.", weights: { anxiety: 10, risk: -8, discipline: -5, impulse: 5 } },
                { label: "Anxious, but I force myself to do nothing.", weights: { anxiety: 6, risk: -2, discipline: 6, impulse: -2 } },
                { label: "Excited. I deploy cash to buy the dip.", weights: { anxiety: -5, risk: 8, discipline: 8, clarity: 5 } },
                { label: "Indifferent. I automate everything anyway.", weights: { anxiety: -8, risk: 4, discipline: 10, detachment: 10 } }
            ]
        },
        {
            category: 'FINANCIAL RUNWAY',
            text: "If your primary income vanishes today, how long until you cannot pay rent?",
            options: [
                { label: "Less than 2 weeks. Panic mode.", weights: { anxiety: 10, clarity: -5, fragility: 10, discipline: -8 } },
                { label: "1-2 Months. It would be tight.", weights: { anxiety: 5, clarity: 2, fragility: 5, discipline: 0 } },
                { label: "6 Months (Liquid Emergency Fund).", weights: { anxiety: -5, clarity: 8, fragility: -10, discipline: 8 } },
                { label: "Indefinitely. Passive income covers needs.", weights: { anxiety: -10, clarity: 10, fragility: -10, freedom: 10 } }
            ]
        },
        {
            category: 'SOCIAL SIGNALING',
            text: "You get a ₹5 Lakh bonus. Your friends suggest a luxury trip. You:",
            options: [
                { label: "Go immediately. YOLO.", weights: { status: 10, impulse: 10, discipline: -8, anxiety: -2 } },
                { label: "Go, but feel guilty about the cost.", weights: { status: 6, impulse: 4, discipline: -2, anxiety: 6 } },
                { label: "Decline. Invest 90%, enjoy 10%.", weights: { status: -5, impulse: -8, discipline: 10, freedom: 5 } },
                { label: "Lie and say I didn't get a bonus.", weights: { status: -8, secrecy: 8, discipline: 5, anxiety: 2 } }
            ]
        },
        {
            category: 'PURCHASE PSYCHOLOGY',
            text: "You see a gadget you want on sale (30% off). You don't *need* it.",
            options: [
                { label: "Buy it. Only a fool misses a deal.", weights: { impulse: 8, logic_flaw: 8, discipline: -5 } },
                { label: "Add to cart, wait 24 hours.", weights: { impulse: -2, discipline: 6, strategy: 5 } },
                { label: "Calculate how many hours I worked to earn that price.", weights: { impulse: -5, clarity: 10, discipline: 8 } },
                { label: "I ignore sales completely.", weights: { impulse: -8, detachment: 8, discipline: 5 } }
            ]
        },
        {
            category: 'DEBT PERCEPTION',
            text: "How do you view Credit Card debt?",
            options: [
                { label: "It's free money until the bill comes.", weights: { clarity: -10, impulse: 8, risk: 5, financial_iq: -10 } },
                { label: "A necessary evil for lifestyle.", weights: { clarity: -2, status: 5, anxiety: 4 } },
                { label: "A tool for points, paid in full always.", weights: { clarity: 8, discipline: 10, financial_iq: 8 } },
                { label: "I don't use credit cards at all.", weights: { risk: -5, anxiety: 5, discipline: 5, financial_iq: -2 } }
            ]
        },
        {
            category: 'WEALTH DEFINITION',
            text: "True Wealth to you means:",
            options: [
                { label: "Status. Luxury cars and recognition.", weights: { status: 10, freedom: -5, ego: 10 } },
                { label: "Security. Never worrying about bills.", weights: { anxiety: 5, freedom: 2, risk: -5 } },
                { label: "Freedom. Doing what I want, when I want.", weights: { freedom: 10, status: -5, anxiety: -5 } },
                { label: "Power. Influence over others.", weights: { status: 8, ego: 10, risk: 5 } }
            ]
        },
        {
            category: 'TRACKING HABITS',
            text: "Do you know exactly how much you spent last month?",
            options: [
                { label: "No idea. I'm afraid to look.", weights: { clarity: -10, anxiety: 8, discipline: -8 } },
                { label: "Rough estimate within ₹5,000.", weights: { clarity: 5, discipline: 2 } },
                { label: "Yes, to the last rupee (Excel/App).", weights: { clarity: 10, discipline: 10, control: 10 } },
                { label: "No, but my savings are automated first.", weights: { clarity: 2, discipline: 8, strategy: 10 } }
            ]
        },
        {
            category: 'RISK APPETITE',
            text: "A friend tips you on a 'Guaranteed 50% return' crypto scheme.",
            options: [
                { label: "I'm in! Put in a significant amount.", weights: { risk: 10, greed: 10, financial_iq: -10 } },
                { label: "Put in a tiny 'gambling' amount.", weights: { risk: 5, curiosity: 5, discipline: 2 } },
                { label: "Ignore it. There is no free lunch.", weights: { risk: -2, financial_iq: 10, discipline: 8 } },
                { label: "Warn the friend they are being scammed.", weights: { risk: -5, financial_iq: 8, altruism: 5 } }
            ]
        }
    ];

    let currentQIndex = 0;
    
    // THE STATE VECTOR (Multidimensional)
    let profileData = {
        anxiety: 0,
        discipline: 0,
        status: 0,
        risk: 0,
        impulse: 0,
        clarity: 0,
        financial_iq: 0,
        fragility: 0,
        freedom: 0,
        history: [] 
    };

    // ========================================================
    // 2. INITIALIZATION & SUPABASE SYNC
    // ========================================================
    
    try {
        const client = window.supabase.createClient(supabaseUrl, supabaseKey);
        const { data: { session } } = await client.auth.getSession();
        
        if (session) {
            currentUser = session.user;
            let { data: profile } = await client.from('profiles').select('psych_profile').eq('id', currentUser.id).single();

            loader.classList.add('hidden');

            if (profile && profile.psych_profile && profile.psych_profile.archetype) {
                // If data exists, show report immediately
                mirrorSection.classList.remove('hidden');
                renderMirror(profile.psych_profile);
            } else {
                // Else start wizard
                scanSection.classList.remove('hidden');
                renderQuestion();
            }
        } else {
            // No user, fallback to login
            window.location.href = 'login.html';
        }

    } catch (err) {
        console.error("System Error:", err);
        loader.classList.add('hidden');
        scanSection.classList.remove('hidden');
        renderQuestion();
    }

    // ========================================================
    // 3. WIZARD UI LOGIC
    // ========================================================

    function renderQuestion() {
        const q = questions[currentQIndex];
        
        // Animate Out
        const qBox = document.getElementById('questionBox');
        qBox.style.opacity = '0';
        
        setTimeout(() => {
            document.getElementById('qCategory').innerText = q.category;
            document.getElementById('qText').innerText = q.text;
            
            const optGrid = document.getElementById('qOptions');
            optGrid.innerHTML = '';
            
            q.options.forEach((opt, idx) => {
                const btn = document.createElement('div');
                btn.className = 'scan-option';
                btn.innerHTML = `<span class="opt-key">${String.fromCharCode(65+idx)}</span> ${opt.label}`;
                btn.onclick = () => handleAnswer(opt);
                optGrid.appendChild(btn);
            });

            // Update Progress
            const progress = ((currentQIndex) / questions.length) * 100;
            document.getElementById('scanProgress').style.width = `${progress}%`;
            
            // Animate In
            qBox.style.opacity = '1';
        }, 300);
    }

    function handleAnswer(option) {
        // Accumulate Weighted Vector
        for (const [key, value] of Object.entries(option.weights)) {
            if (profileData[key] === undefined) profileData[key] = 0;
            profileData[key] += value;
        }
        profileData.history.push(option.label);

        currentQIndex++;
        if (currentQIndex < questions.length) renderQuestion();
        else finishScan();
    }

    async function finishScan() {
        scanSection.innerHTML = `
            <div class="screen-center">
                <div class="scanner-line"></div>
                <h2 class="blink-text">CONSTRUCTING NEURAL IDENTITY...</h2>
                <p style="color:#666; font-size:0.8rem; margin-top:10px;">Analyzing Desi Context Vectors</p>
            </div>
        `;
        
        const finalReport = generateDeepAnalysis(profileData);
        
        if (currentUser) {
            const client = window.supabase.createClient(supabaseUrl, supabaseKey);
            await client.from('profiles').update({ psych_profile: finalReport }).eq('id', currentUser.id);
        }
        
        setTimeout(() => {
            scanSection.classList.add('hidden');
            mirrorSection.classList.remove('hidden');
            renderMirror(finalReport);
        }, 2500);
    }

    // ========================================================
    // 4. THE DEEP ANALYSIS ENGINE (Combinatorial Logic)
    // ========================================================
    
    function generateDeepAnalysis(stats) {
        // Normalization Helper (Range 0 to 10)
        const n = (val) => Math.min(10, Math.max(0, 5 + (val / 3)));

        // --- 1. DETERMINE DOMINANT TRAITS ---
        const traits = [
            { id: 'ANXIETY', val: stats.anxiety },
            { id: 'DISCIPLINE', val: stats.discipline },
            { id: 'STATUS', val: stats.status },
            { id: 'IMPULSE', val: stats.impulse },
            { id: 'RISK', val: stats.risk }
        ];
        
        // Sort traits by absolute magnitude (Impact)
        traits.sort((a, b) => b.val - a.val);
        
        const primary = traits[0];
        const secondary = traits[1];

        // --- 2. COMBINATORIAL ARCHETYPE GENERATOR ---
        
        const adjectives = {
            'ANXIETY': ['Paralyzed', 'Cautious', 'Guarded', 'Hyper-Aware'],
            'DISCIPLINE': ['Stoic', 'Regimented', 'Calculated', 'Systematic'],
            'STATUS': ['Ostentatious', 'Performative', 'Social', 'Visual'],
            'IMPULSE': ['Reactive', 'Chaotic', 'Spontaneous', 'Emotional'],
            'RISK': ['Maverick', 'Daring', 'Aggressive', 'Speculative']
        };

        const nouns = {
            'ANXIETY': ['Hoarder', 'Sentry', 'Protector', 'Minimalist'],
            'DISCIPLINE': ['Architect', 'Monk', 'Strategist', 'Builder'],
            'STATUS': ['Peacock', 'Consumer', 'Royal', 'Influencer'],
            'IMPULSE': ['Hedonist', 'Wanderer', 'Consumer', 'Wildcard'],
            'RISK': ['Gambler', 'Operator', 'Venturer', 'Pilot']
        };

        const adj = adjectives[primary.id][Math.min(3, Math.floor(n(primary.val)/3))];
        const noun = nouns[secondary.id][Math.min(3, Math.floor(n(secondary.val)/3))];
        const archetype = `THE ${adj.toUpperCase()} ${noun.toUpperCase()}`;

        // --- 3. THE DESI MATRIX (Life Contexts) ---
        // This maps exactly how Indian society sees this combination
        
        const desiContextMap = {
            'ANXIETY': {
                'ANXIETY': "You check your bank balance before ordering extra Raita. You have 3 FDs but wear 5-year-old chappals.",
                'DISCIPLINE': "You track every rupee in Excel because you don't trust the future. You are the 'Kanjoos Uncle' who is secretly a Crorepati.",
                'STATUS': "You bought a luxury car for society, but you get a mild heart attack every time it hits a pothole.",
                'IMPULSE': "You stress about money all week, then blow ₹5,000 on a stress-relief dinner on Friday. The cycle never ends.",
                'RISK': "You are terrified of losing money, yet you gamble on 'safe tips' from WhatsApp uncles because you fear missing out."
            },
            'DISCIPLINE': {
                'ANXIETY': "You save 70% of your salary. Your parents are proud, but you are miserable. You haven't taken a real vacation in years.",
                'DISCIPLINE': "You treat your SIPs like EMIs. Your fun is watching your net worth grow. You are the 'Sharmaji ka Beta' of finance.",
                'STATUS': "You work 14 hours a day and save aggressively, just to buy a big house to show relatives you made it.",
                'IMPULSE': "You follow a strict budget for 29 days, then lose control and buy something stupid on the 30th.",
                'RISK': "You have a perfect system, but you are betting it all on one basket. You are a disciplined gambler."
            },
            'STATUS': {
                'ANXIETY': "You host grand parties for Diwali, but you can't sleep at night thinking about the Credit Card bill.",
                'DISCIPLINE': "You are an 'EMI Millionaire'. You own everything—iPhone, SUV, Flat—but the bank owns you.",
                'STATUS': "You'd rather starve than be seen in a non-branded shirt. You are 'Rich Poor'.",
                'IMPULSE': "New iPhone launch? You are first in line, even if rent is due next week.",
                'RISK': "You invest in trendy startups or Crypto just so you can talk about it at high-society dinners."
            },
            'IMPULSE': {
                'ANXIETY': "Retail Therapy is your drug. You buy things to silence the noise in your head, but the silence costs money.",
                'DISCIPLINE': "You try to budget, but 'Flash Sales' exist. You save in coins and spend in notes.",
                'STATUS': "You buy rounds of drinks for everyone to look like the 'Bade Bhaiyya', then eat Maggi for the rest of the month.",
                'IMPULSE': "Salary hits on the 1st. Vanishes by the 5th. You live like a King for a week and a pauper for three.",
                'RISK': "You trade F&O on your phone while stuck in traffic. You want to get rich by Tuesday."
            },
            'RISK': {
                'ANXIETY': "You take big bets to escape the rat race quickly, then pray to every God when the market turns red.",
                'DISCIPLINE': "You treat trading like a business. You act like a cold-blooded assassin in a chaotic market.",
                'STATUS': "You show off your winning screenshots on Instagram but hide your loss screenshots even from yourself.",
                'IMPULSE': "You double down on losing stocks because 'it has to go up eventually'. (Spoiler: It doesn't).",
                'RISK': "FDs are for cowards. You want 100x or nothing. You will either be a billionaire or broke."
            }
        };

        // Fallback if combination is rare/undefined
        let desiContext = desiContextMap[primary.id]?.[secondary.id] || "You are a complex mix of traits. Your financial life is a balancing act.";

        // --- 4. CALCULATED METRICS ---
        
        let resilience = 50 + (stats.discipline * 2) + (stats.clarity * 2) - (stats.impulse * 2) - (stats.fragility * 2);
        resilience = Math.min(100, Math.max(0, resilience));

        let leak = "NONE";
        let leakDesc = "System is sealed.";
        if (stats.status > 5) { leak = "ENVY"; leakDesc = "Spending to match peers."; }
        else if (stats.impulse > 5) { leak = "DOPAMINE"; leakDesc = "Spending for temporary joy."; }
        else if (stats.anxiety > 8) { leak = "FEAR"; leakDesc = "Opportunity cost of hoarding cash."; }
        else if (stats.clarity < -5) { leak = "IGNORANCE"; leakDesc = "Unknown recurring subscriptions."; }

        // --- 5. SWOT GENERATION ---
        let strengths = [];
        let weaknesses = [];
        
        if (stats.discipline > 5) strengths.push("High Impulse Control");
        if (stats.discipline < -2) weaknesses.push("Prone to 'Retail Therapy'");
        if (stats.clarity > 5) strengths.push("Financial Visibility");
        if (stats.clarity < 0) weaknesses.push("Financial Fog (Blindspots)");
        if (stats.risk > 8 && stats.financial_iq < 0) weaknesses.push("Gambling Tendencies");
        if (stats.risk < -5) weaknesses.push("Inflation Risk (Too Conservative)");
        
        if(strengths.length === 0) strengths.push("Potential for Growth");
        if(weaknesses.length === 0) weaknesses.push("Over-Optimization risk");

        // --- 6. ACTION PLAN ---
        let actions = [];
        
        if (stats.clarity < 0) actions.push({ t: "The Audit", d: "Download last 3 months of bank statements. Categorize every rupee." });
        if (stats.impulse > 5) actions.push({ t: "The 72h Rule", d: "Wait 72 hours before any purchase over ₹5,000." });
        if (stats.anxiety > 6) actions.push({ t: "Automate", d: "Stop checking portfolio daily. Set SIPs and delete the app." });
        if (stats.fragility > 5) actions.push({ t: "Emergency Fund", d: "Stop investing. Build 3 months of expenses in a Liquid Fund first." });
        if (stats.status > 5) actions.push({ t: "Social Fast", d: "Go one weekend without spending money on social outings." });
        
        if (actions.length < 3) actions.push({ t: "Optimize", d: "Review your Asset Allocation. Rebalance equity vs debt." });

        return {
            archetype, 
            bio: `Your financial soul is a battle between ${primary.id.toLowerCase()} and ${secondary.id.toLowerCase()}.`,
            desiContext,
            chartData: [n(stats.discipline), n(stats.impulse), n(stats.risk), n(stats.status), n(stats.clarity)],
            raw: stats,
            resilience, leak, leakDesc,
            strengths: strengths.slice(0, 3), 
            weaknesses: weaknesses.slice(0, 3),
            actions: actions.slice(0, 3),
            diagnosisTitle: `SYSTEM STATUS: ${stats.discipline > 0 ? 'OPERATIONAL' : 'COMPROMISED'}`,
            diagnosisDesc: `Your primary driver is ${primary.id}. Ensure this doesn't become a blind spot.`
        };
    }

    // ========================================================
    // 5. RENDER LOGIC (Visualizing the Report)
    // ========================================================
    
    function renderMirror(data) {
        const s = data.raw;

        // 1. HERO SECTION
        document.getElementById('heroArchetype').innerText = data.archetype;
        document.getElementById('dispName').innerText = currentUser ? currentUser.email : "GUEST USER";
        document.getElementById('dispBio').innerText = data.bio;

        // 2. TAGS
        let tagHTML = '';
        if(s.risk > 4) tagHTML += `<span class="tag">Risk-Taker</span>`;
        if(s.discipline > 4) tagHTML += `<span class="tag">Disciplined</span>`;
        if(s.status > 4) tagHTML += `<span class="tag">Status-Driven</span>`;
        if(s.anxiety > 4) tagHTML += `<span class="tag">Anxious</span>`;
        document.getElementById('identityTags').innerHTML = tagHTML;

        // 3. RADAR CHART
        const ctx = document.getElementById('behaviorChart').getContext('2d');
        if (window.myChart) window.myChart.destroy(); 
        
        window.myChart = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: ['Discipline', 'Impulse', 'Risk', 'Status', 'Clarity'],
                datasets: [{
                    label: 'Psychometric Pattern',
                    data: data.chartData,
                    backgroundColor: 'rgba(199, 240, 0, 0.2)',
                    borderColor: '#C7F000',
                    borderWidth: 2,
                    pointBackgroundColor: '#fff'
                }]
            },
            options: {
                scales: {
                    r: { 
                        angleLines: { color: 'rgba(255,255,255,0.1)' },
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        pointLabels: { color: '#888', font: {size: 11, family: 'JetBrains Mono'} },
                        ticks: { display: false, max: 10 }
                    }
                },
                plugins: { legend: { display: false } }
            }
        });

        // 4. METRICS & GAUGES
        document.getElementById('behPattern').innerText = s.impulse > s.discipline ? "VOLATILE" : "STABLE";
        document.getElementById('behDesc').innerText = s.impulse > s.discipline ? "You are prone to emotional overrides." : "You are governed by logic and rules.";

        document.getElementById('msDriver').innerText = s.anxiety > 5 ? "FEAR" : (s.status > 5 ? "EGO" : "GROWTH");
        document.getElementById('msRel').innerText = s.clarity > 5 ? "LUCID" : "OBSCURE";
        document.getElementById('msLimit').innerText = s.impulse > 5 ? "DOPAMINE" : (s.risk < -5 ? "SAFETY" : "NONE");

        document.getElementById('resilienceFill').style.width = `${data.resilience}%`;
        document.getElementById('incomeInsight').innerText = data.resilience > 70 ? "ANTIFRAGILE STATE" : "FRAGILE STATE";

        const emojis = ["🔥", "💸", "📉", "🛡️", "🧱", "📈", "🚀"];
        const emoIdx = Math.floor((data.resilience / 100) * (emojis.length - 1));
        document.getElementById('expenseVisual').innerText = emojis[emoIdx];
        document.getElementById('expenseInsight').innerText = data.resilience < 40 ? "High vulnerability detected." : "Defenses are active.";

        let rot = (s.risk + 10) * 9; 
        rot = Math.min(180, Math.max(0, rot));
        document.getElementById('riskNeedle').style.transform = `rotate(${rot}deg)`;
        document.getElementById('riskText').innerText = s.risk > 5 ? "AGGRESSIVE" : (s.risk < -2 ? "CONSERVATIVE" : "BALANCED");

        // 5. CONTEXT & MICRO CARDS
        // Inject Desi Context here
        document.getElementById('contextText').innerText = `"${data.desiContext}"`;
        document.getElementById('tlActive').innerText = "YOU";

        document.getElementById('decStyle').innerText = s.impulse > 5 ? "INTUITIVE" : "ANALYTICAL";
        document.getElementById('decDesc').innerText = s.impulse > 5 ? "Fast decisions, high regret rate." : "Slow decisions, low regret rate.";
        document.getElementById('knowGap').innerText = s.financial_iq < 0 ? "FUNDAMENTALS" : "ADVANCED";
        document.getElementById('knowDesc').innerText = s.financial_iq < 0 ? "Review Fin-101 immediately." : "Focus on tax & estate planning.";
        document.getElementById('emoLeak').innerText = data.leak;
        document.getElementById('emoDesc').innerText = data.leakDesc;

        document.getElementById('strengthList').innerHTML = data.strengths.map(i => `<li>${i}</li>`).join('');
        document.getElementById('weaknessList').innerHTML = data.weaknesses.map(i => `<li>${i}</li>`).join('');

        document.getElementById('finalTitle').innerText = data.diagnosisTitle;
        document.getElementById('finalDesc').innerText = data.diagnosisDesc;

        document.getElementById('actionGrid').innerHTML = data.actions.map(a => `
            <div class="act-card">
                <h4>${a.t}</h4>
                <p>${a.d}</p>
            </div>
        `).join('');
    }

    // RESET BUTTON
    document.getElementById('reScanBtn').onclick = async () => {
        if(confirm("This will erase your neural profile permanently. Proceed?")) {
            const client = window.supabase.createClient(supabaseUrl, supabaseKey);
            await client.from('profiles').update({ psych_profile: null }).eq('id', currentUser.id);
            location.reload();
        }
    };

});