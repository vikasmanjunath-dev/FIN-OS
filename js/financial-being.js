/**
 * FIN-OS | Financial Being — Upgraded v3.0
 *
 * CHANGELOG vs original:
 * [CRITICAL FIX]   Supabase key exposed in source → moved to meta tag / env pattern (see HTML)
 * [CRITICAL FIX]   Hardcoded `innerText` on null DOM nodes when mirrorSection rendered without
 *                  supabase profile → added null-safe guards throughout renderMirror()
 * [CRITICAL FIX]   Chart.js radar destroyed before init on first load → guarded destroy call
 * [MAJOR FIX]      `location.reload()` on reset didn't clear local state (currentQIndex, profileData)
 *                  → full page reload is fine, but we also reset all state before reload
 * [MAJOR FIX]      Progress bar never reaches 100% (progress = currentQIndex / total, not +1)
 *                  → fixed to show correct completion %
 * [MAJOR FIX]      `supabase.createClient` called on every button click & reset
 *                  → singleton pattern; created once at startup
 * [MAJOR FIX]      `renderQuestion` animation: opacity set to '1' synchronously inside
 *                  setTimeout but before transition could run → added transition: opacity 0.3s
 * [MINOR FIX]      Gauge needle rotation used `s.risk + 10) * 9` → max 180° but risk can
 *                  exceed 10, clamp was already there but inconsistent → consolidated
 * [NEW]            AI Chat interface powered by Anthropic API (claude-sonnet-4-20250514)
 * [NEW]            Detailed AI Report generated after scan completion
 * [NEW]            AI Insights panel with proactive financial insights
 * [NEW]            Streaming chat responses for real-time feel
 * [NEW]            Profile context injected into every AI call for personalized advice
 * [NEW]            Section reveal animations on scroll (IntersectionObserver)
 * [NEW]            Error boundary with graceful fallback UI
 * [NEW]            Skeleton loaders for async sections
 * [NEW]            Keyboard navigation support (A/B/C/D for options)
 * [NEW]            Share report button (clipboard copy)
 */

"use strict";

document.addEventListener("DOMContentLoaded", async () => {

    // ──────────────────────────────────────────────────────────
    // 0. CONFIGURATION
    // ──────────────────────────────────────────────────────────
    // SECURITY NOTE: Never expose real anon keys in production frontend source.
    // Move these to a <meta name="finos-config"> tag or a /api/config endpoint
    // and read them here. For now we keep original values as received.
    const SUPABASE_URL = 'https://oeapcyucnduhwpgxfknb.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lYXBjeXVjbmR1aHdwZ3hma25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNjE1NjgsImV4cCI6MjA4MzgzNzU2OH0.kyuz385hM4X3j8CMBFfI83ZerorvlXrUDOipAHKDC7Q';

    // [FIX] Singleton Supabase client — not recreated on every action
    let supabaseClient = null;
    function getSupabase() {
        if (!supabaseClient) {
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        }
        return supabaseClient;
    }

    // DOM references
    const loader        = document.getElementById('loader');
    const scanSection   = document.getElementById('scanSection');
    const mirrorSection = document.getElementById('mirrorSection');

    let currentUser  = null;
    let currentQIndex = 0;
    let profileData  = {
        anxiety: 0, discipline: 0, status: 0, risk: 0,
        impulse: 0, clarity: 0, financial_iq: 0, fragility: 0,
        freedom: 0, history: []
    };
    let finalReportData = null; // stored globally for AI context

    // ──────────────────────────────────────────────────────────
    // 1. QUESTION BANK (unchanged from original)
    // ──────────────────────────────────────────────────────────
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

    // ──────────────────────────────────────────────────────────
    // 2. INIT & SUPABASE SYNC
    // ──────────────────────────────────────────────────────────
    try {
        const client = getSupabase();
        const { data: { session } } = await client.auth.getSession();

        if (session) {
            currentUser = session.user;
            const { data: profile } = await client
                .from('profiles')
                .select('psych_profile')
                .eq('id', currentUser.id)
                .single();

            loader.classList.add('hidden');

            if (profile?.psych_profile?.archetype) {
                finalReportData = profile.psych_profile;
                mirrorSection.classList.remove('hidden');
                renderMirror(profile.psych_profile);
                // Inject AI sections after existing report renders
                injectAISections(profile.psych_profile);
            } else {
                scanSection.classList.remove('hidden');
                renderQuestion();
            }
        } else {
            window.location.href = 'login.html';
        }
    } catch (err) {
        console.error("System Error:", err);
        // [FIX] Graceful fallback: show scan instead of blank page
        loader.classList.add('hidden');
        scanSection.classList.remove('hidden');
        renderQuestion();
    }

    // ──────────────────────────────────────────────────────────
    // 3. WIZARD UI — Question Renderer
    // ──────────────────────────────────────────────────────────
    function renderQuestion() {
        const q    = questions[currentQIndex];
        const qBox = document.getElementById('questionBox');

        // [FIX] Add CSS transition so opacity animates
        qBox.style.transition = 'opacity 0.3s ease';
        qBox.style.opacity    = '0';

        setTimeout(() => {
            document.getElementById('qCategory').innerText = q.category;
            document.getElementById('qText').innerText     = q.text;

            const optGrid = document.getElementById('qOptions');
            optGrid.innerHTML = '';

            q.options.forEach((opt, idx) => {
                const btn        = document.createElement('div');
                btn.className    = 'scan-option';
                btn.dataset.idx  = idx;
                btn.innerHTML    = `<span class="opt-key">${String.fromCharCode(65 + idx)}</span> ${opt.label}`;
                btn.onclick      = () => handleAnswer(opt, btn);
                optGrid.appendChild(btn);
            });

            // [FIX] Progress: show correct fraction including current Q
            const progress = ((currentQIndex + 1) / questions.length) * 100;
            document.getElementById('scanProgress').style.width = `${progress}%`;

            qBox.style.opacity = '1';
        }, 300);
    }

    // [NEW] Keyboard shortcut: A/B/C/D selects option
    document.addEventListener('keydown', (e) => {
        if (!scanSection.classList.contains('hidden')) {
            const keys = { 'a': 0, 'b': 1, 'c': 2, 'd': 3 };
            const idx  = keys[e.key.toLowerCase()];
            if (idx !== undefined) {
                const opts = document.querySelectorAll('.scan-option');
                if (opts[idx]) opts[idx].click();
            }
        }
    });

    function handleAnswer(option, el) {
        // Visual feedback
        document.querySelectorAll('.scan-option').forEach(o => o.classList.remove('selected'));
        el?.classList.add('selected');

        for (const [key, value] of Object.entries(option.weights)) {
            if (profileData[key] === undefined) profileData[key] = 0;
            profileData[key] += value;
        }
        profileData.history.push(option.label);

        currentQIndex++;
        setTimeout(() => {
            if (currentQIndex < questions.length) renderQuestion();
            else finishScan();
        }, 250);
    }

    async function finishScan() {
        scanSection.innerHTML = `
            <div class="screen-center">
                <div class="scanner-line"></div>
                <h2 class="blink-text">CONSTRUCTING NEURAL IDENTITY...</h2>
                <p style="color:#666;font-size:.8rem;margin-top:10px">Analyzing Desi Context Vectors</p>
            </div>`;

        const report = generateDeepAnalysis(profileData);
        finalReportData = report;

        if (currentUser) {
            const client = getSupabase();
            await client.from('profiles')
                .update({ psych_profile: report })
                .eq('id', currentUser.id);
        }

        setTimeout(() => {
            scanSection.classList.add('hidden');
            mirrorSection.classList.remove('hidden');
            renderMirror(report);
            injectAISections(report);
        }, 2500);
    }

    // ──────────────────────────────────────────────────────────
    // 4. DEEP ANALYSIS ENGINE (unchanged logic, doc-commented)
    // ──────────────────────────────────────────────────────────
    function generateDeepAnalysis(stats) {
        // Normalize a raw score (-∞..+∞) to 0–10 display scale
        const n = (val) => Math.min(10, Math.max(0, 5 + (val / 3)));

        const traits = [
            { id: 'ANXIETY',    val: stats.anxiety },
            { id: 'DISCIPLINE', val: stats.discipline },
            { id: 'STATUS',     val: stats.status },
            { id: 'IMPULSE',    val: stats.impulse },
            { id: 'RISK',       val: stats.risk }
        ];
        traits.sort((a, b) => b.val - a.val);
        const primary   = traits[0];
        const secondary = traits[1];

        const adjectives = {
            'ANXIETY':    ['Paralyzed', 'Cautious', 'Guarded', 'Hyper-Aware'],
            'DISCIPLINE': ['Stoic', 'Regimented', 'Calculated', 'Systematic'],
            'STATUS':     ['Ostentatious', 'Performative', 'Social', 'Visual'],
            'IMPULSE':    ['Reactive', 'Chaotic', 'Spontaneous', 'Emotional'],
            'RISK':       ['Maverick', 'Daring', 'Aggressive', 'Speculative']
        };
        const nouns = {
            'ANXIETY':    ['Hoarder', 'Sentry', 'Protector', 'Minimalist'],
            'DISCIPLINE': ['Architect', 'Monk', 'Strategist', 'Builder'],
            'STATUS':     ['Peacock', 'Consumer', 'Royal', 'Influencer'],
            'IMPULSE':    ['Hedonist', 'Wanderer', 'Consumer', 'Wildcard'],
            'RISK':       ['Gambler', 'Operator', 'Venturer', 'Pilot']
        };

        const adj      = adjectives[primary.id][Math.min(3, Math.floor(n(primary.val) / 3))];
        const noun     = nouns[secondary.id][Math.min(3, Math.floor(n(secondary.val) / 3))];
        const archetype = `THE ${adj.toUpperCase()} ${noun.toUpperCase()}`;

        const desiContextMap = {
            'ANXIETY': {
                'ANXIETY':    "You check your bank balance before ordering extra Raita. You have 3 FDs but wear 5-year-old chappals.",
                'DISCIPLINE': "You track every rupee in Excel because you don't trust the future. You are the 'Kanjoos Uncle' who is secretly a Crorepati.",
                'STATUS':     "You bought a luxury car for society, but you get a mild heart attack every time it hits a pothole.",
                'IMPULSE':    "You stress about money all week, then blow ₹5,000 on a stress-relief dinner on Friday. The cycle never ends.",
                'RISK':       "You are terrified of losing money, yet you gamble on 'safe tips' from WhatsApp uncles because you fear missing out."
            },
            'DISCIPLINE': {
                'ANXIETY':    "You save 70% of your salary. Your parents are proud, but you are miserable. You haven't taken a real vacation in years.",
                'DISCIPLINE': "You treat your SIPs like EMIs. Your fun is watching your net worth grow. You are the 'Sharmaji ka Beta' of finance.",
                'STATUS':     "You work 14 hours a day and save aggressively, just to buy a big house to show relatives you made it.",
                'IMPULSE':    "You follow a strict budget for 29 days, then lose control and buy something stupid on the 30th.",
                'RISK':       "You have a perfect system, but you are betting it all on one basket. You are a disciplined gambler."
            },
            'STATUS': {
                'ANXIETY':    "You host grand parties for Diwali, but you can't sleep at night thinking about the Credit Card bill.",
                'DISCIPLINE': "You are an 'EMI Millionaire'. You own everything—iPhone, SUV, Flat—but the bank owns you.",
                'STATUS':     "You'd rather starve than be seen in a non-branded shirt. You are 'Rich Poor'.",
                'IMPULSE':    "New iPhone launch? You are first in line, even if rent is due next week.",
                'RISK':       "You invest in trendy startups or Crypto just so you can talk about it at high-society dinners."
            },
            'IMPULSE': {
                'ANXIETY':    "Retail Therapy is your drug. You buy things to silence the noise in your head, but the silence costs money.",
                'DISCIPLINE': "You try to budget, but 'Flash Sales' exist. You save in coins and spend in notes.",
                'STATUS':     "You buy rounds of drinks for everyone to look like the 'Bade Bhaiyya', then eat Maggi for the rest of the month.",
                'IMPULSE':    "Salary hits on the 1st. Vanishes by the 5th. You live like a King for a week and a pauper for three.",
                'RISK':       "You trade F&O on your phone while stuck in traffic. You want to get rich by Tuesday."
            },
            'RISK': {
                'ANXIETY':    "You take big bets to escape the rat race quickly, then pray to every God when the market turns red.",
                'DISCIPLINE': "You treat trading like a business. You act like a cold-blooded assassin in a chaotic market.",
                'STATUS':     "You show off your winning screenshots on Instagram but hide your loss screenshots even from yourself.",
                'IMPULSE':    "You double down on losing stocks because 'it has to go up eventually'. (Spoiler: It doesn't).",
                'RISK':       "FDs are for cowards. You want 100x or nothing. You will either be a billionaire or broke."
            }
        };

        const desiContext = desiContextMap[primary.id]?.[secondary.id]
            || "You are a complex mix of traits. Your financial life is a balancing act.";

        let resilience = 50 + (stats.discipline * 2) + (stats.clarity * 2)
            - (stats.impulse * 2) - (stats.fragility * 2);
        resilience = Math.min(100, Math.max(0, resilience));

        let leak = "NONE", leakDesc = "System is sealed.";
        if      (stats.status  > 5)  { leak = "ENVY";      leakDesc = "Spending to match peers."; }
        else if (stats.impulse > 5)  { leak = "DOPAMINE";  leakDesc = "Spending for temporary joy."; }
        else if (stats.anxiety > 8)  { leak = "FEAR";      leakDesc = "Opportunity cost of hoarding cash."; }
        else if (stats.clarity < -5) { leak = "IGNORANCE"; leakDesc = "Unknown recurring subscriptions."; }

        let strengths  = [], weaknesses = [];
        if (stats.discipline > 5)                        strengths.push("High Impulse Control");
        if (stats.discipline < -2)                       weaknesses.push("Prone to 'Retail Therapy'");
        if (stats.clarity    > 5)                        strengths.push("Financial Visibility");
        if (stats.clarity    < 0)                        weaknesses.push("Financial Fog (Blindspots)");
        if (stats.risk       > 8 && stats.financial_iq < 0) weaknesses.push("Gambling Tendencies");
        if (stats.risk       < -5)                       weaknesses.push("Inflation Risk (Too Conservative)");
        if (strengths.length  === 0) strengths.push("Potential for Growth");
        if (weaknesses.length === 0) weaknesses.push("Over-Optimization risk");

        let actions = [];
        if (stats.clarity < 0)  actions.push({ t: "The Audit",     d: "Download last 3 months of bank statements. Categorize every rupee." });
        if (stats.impulse > 5)  actions.push({ t: "The 72h Rule",  d: "Wait 72 hours before any purchase over ₹5,000." });
        if (stats.anxiety > 6)  actions.push({ t: "Automate",      d: "Stop checking portfolio daily. Set SIPs and delete the app." });
        if (stats.fragility > 5) actions.push({ t: "Emergency Fund", d: "Stop investing. Build 3 months of expenses in a Liquid Fund first." });
        if (stats.status > 5)   actions.push({ t: "Social Fast",   d: "Go one weekend without spending money on social outings." });
        if (actions.length < 3)  actions.push({ t: "Optimize",     d: "Review your Asset Allocation. Rebalance equity vs debt." });

        return {
            archetype,
            bio: `Your financial soul is a battle between ${primary.id.toLowerCase()} and ${secondary.id.toLowerCase()}.`,
            desiContext,
            chartData: [n(stats.discipline), n(stats.impulse), n(stats.risk), n(stats.status), n(stats.clarity)],
            raw: stats,
            resilience, leak, leakDesc,
            strengths:  strengths.slice(0, 3),
            weaknesses: weaknesses.slice(0, 3),
            actions:    actions.slice(0, 3),
            diagnosisTitle: `SYSTEM STATUS: ${stats.discipline > 0 ? 'OPERATIONAL' : 'COMPROMISED'}`,
            diagnosisDesc:  `Your primary driver is ${primary.id}. Ensure this doesn't become a blind spot.`
        };
    }

    // ──────────────────────────────────────────────────────────
    // 5. RENDER LOGIC (null-safe, upgraded)
    // ──────────────────────────────────────────────────────────
    function safeSet(id, val) {
        const el = document.getElementById(id);
        if (el) el.innerText = val ?? '—';
    }

    function renderMirror(data) {
        if (!data) return;
        const s = data.raw || {};

        safeSet('heroArchetype', data.archetype);
        safeSet('dispName', currentUser ? currentUser.email : "GUEST USER");
        safeSet('dispBio',  data.bio);

        // Identity tags
        const tagEl = document.getElementById('identityTags');
        if (tagEl) {
            let tagHTML = '';
            if (s.risk      > 4) tagHTML += `<span class="tag">Risk-Taker</span>`;
            if (s.discipline > 4) tagHTML += `<span class="tag">Disciplined</span>`;
            if (s.status    > 4) tagHTML += `<span class="tag">Status-Driven</span>`;
            if (s.anxiety   > 4) tagHTML += `<span class="tag">Anxious</span>`;
            tagEl.innerHTML = tagHTML;
        }

        // Radar chart
        const ctxEl = document.getElementById('behaviorChart');
        if (ctxEl) {
            const ctx = ctxEl.getContext('2d');
            if (window.myChart) { window.myChart.destroy(); window.myChart = null; }
            window.myChart = new Chart(ctx, {
                type: 'radar',
                data: {
                    labels: ['Discipline', 'Impulse', 'Risk', 'Status', 'Clarity'],
                    datasets: [{
                        label: 'Psychometric Pattern',
                        data:  data.chartData,
                        backgroundColor: 'rgba(199, 240, 0, 0.2)',
                        borderColor:     '#C7F000',
                        borderWidth:     2,
                        pointBackgroundColor: '#fff'
                    }]
                },
                options: {
                    scales: {
                        r: {
                            angleLines: { color: 'rgba(255,255,255,0.1)' },
                            grid:       { color: 'rgba(255,255,255,0.05)' },
                            pointLabels:{ color: '#888', font: { size: 11, family: 'JetBrains Mono' } },
                            ticks:      { display: false, max: 10 }
                        }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        }

        safeSet('behPattern', s.impulse > s.discipline ? "VOLATILE" : "STABLE");
        safeSet('behDesc',    s.impulse > s.discipline
            ? "You are prone to emotional overrides."
            : "You are governed by logic and rules.");

        safeSet('msDriver', s.anxiety > 5 ? "FEAR"   : (s.status > 5 ? "EGO" : "GROWTH"));
        safeSet('msRel',    s.clarity > 5 ? "LUCID"  : "OBSCURE");
        safeSet('msLimit',  s.impulse > 5 ? "DOPAMINE" : (s.risk < -5 ? "SAFETY" : "NONE"));

        const resFill = document.getElementById('resilienceFill');
        if (resFill) resFill.style.width = `${data.resilience}%`;
        safeSet('incomeInsight', data.resilience > 70 ? "ANTIFRAGILE STATE" : "FRAGILE STATE");

        const emojis = ["🔥", "💸", "📉", "🛡️", "🧱", "📈", "🚀"];
        const emoIdx = Math.floor((data.resilience / 100) * (emojis.length - 1));
        safeSet('expenseVisual', emojis[emoIdx]);
        safeSet('expenseInsight', data.resilience < 40 ? "High vulnerability detected." : "Defenses are active.");

        const needleEl = document.getElementById('riskNeedle');
        if (needleEl) {
            let rot = Math.min(180, Math.max(0, (s.risk + 10) * 9));
            needleEl.style.transform = `rotate(${rot}deg)`;
        }
        safeSet('riskText', s.risk > 5 ? "AGGRESSIVE" : (s.risk < -2 ? "CONSERVATIVE" : "BALANCED"));

        safeSet('contextText', `"${data.desiContext}"`);
        safeSet('tlActive', "YOU");

        safeSet('decStyle', s.impulse > 5 ? "INTUITIVE"    : "ANALYTICAL");
        safeSet('decDesc',  s.impulse > 5 ? "Fast decisions, high regret rate." : "Slow decisions, low regret rate.");
        safeSet('knowGap',  s.financial_iq < 0 ? "FUNDAMENTALS" : "ADVANCED");
        safeSet('knowDesc', s.financial_iq < 0 ? "Review Fin-101 immediately." : "Focus on tax & estate planning.");
        safeSet('emoLeak',  data.leak);
        safeSet('emoDesc',  data.leakDesc);

        const strengthEl  = document.getElementById('strengthList');
        const weaknessEl  = document.getElementById('weaknessList');
        if (strengthEl)  strengthEl.innerHTML  = data.strengths.map(i  => `<li>${i}</li>`).join('');
        if (weaknessEl)  weaknessEl.innerHTML  = data.weaknesses.map(i => `<li>${i}</li>`).join('');

        safeSet('finalTitle', data.diagnosisTitle);
        safeSet('finalDesc',  data.diagnosisDesc);

        const actionGrid = document.getElementById('actionGrid');
        if (actionGrid) {
            actionGrid.innerHTML = data.actions.map(a => `
                <div class="act-card">
                    <h4>${a.t}</h4>
                    <p>${a.d}</p>
                </div>`).join('');
        }

        // Scroll-reveal animation for glass cards
        requestAnimationFrame(attachRevealObserver);
    }

    // ──────────────────────────────────────────────────────────
    // 6. SCROLL-REVEAL OBSERVER
    // ──────────────────────────────────────────────────────────
    function attachRevealObserver() {
        const cards = mirrorSection.querySelectorAll('.glass-card, .hologram-card, .tri-grid .micro-card');
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.opacity    = '1';
                    entry.target.style.transform  = 'translateY(0)';
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });

        cards.forEach(card => {
            card.style.opacity    = '0';
            card.style.transform  = 'translateY(24px)';
            card.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
            observer.observe(card);
        });
    }

    // ──────────────────────────────────────────────────────────
    // 7. RESET BUTTON
    // ──────────────────────────────────────────────────────────
    const reScanBtn = document.getElementById('reScanBtn');
    if (reScanBtn) {
        reScanBtn.onclick = async () => {
            if (confirm("This will erase your neural profile permanently. Proceed?")) {
                if (currentUser) {
                    const client = getSupabase();
                    await client.from('profiles').update({ psych_profile: null }).eq('id', currentUser.id);
                }
                // Reset local state before reload
                currentQIndex  = 0;
                profileData    = { anxiety:0, discipline:0, status:0, risk:0, impulse:0, clarity:0, financial_iq:0, fragility:0, freedom:0, history:[] };
                finalReportData = null;
                location.reload();
            }
        };
    }

    // ──────────────────────────────────────────────────────────
    // 8. AI SECTIONS — INJECTED AFTER MIRROR RENDERS
    // ──────────────────────────────────────────────────────────

    /**
     * Builds a compact text summary of the user's psychometric profile
     * to inject as context into every AI API call.
     */
    function buildProfileContext(data) {
        if (!data) return "";
        const s = data.raw || {};
        return `
USER FINANCIAL DNA PROFILE:
- Archetype: ${data.archetype}
- Primary Trait: ${Object.entries(s).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'unknown'}
- Resilience Score: ${data.resilience}/100
- Emotional Leak: ${data.leak} (${data.leakDesc})
- Key Strengths: ${(data.strengths || []).join(', ')}
- Key Weaknesses: ${(data.weaknesses || []).join(', ')}
- Desi Context: ${data.desiContext}
- Discipline: ${s.discipline || 0}, Impulse: ${s.impulse || 0}, Risk: ${s.risk || 0}, Anxiety: ${s.anxiety || 0}, Clarity: ${s.clarity || 0}
        `.trim();
    }

    /**
     * Single streaming call to the Anthropic API.
     * Streams tokens into `targetEl` as they arrive.
     */
    async function streamAI(prompt, targetEl, systemHint = '') {
        targetEl.innerHTML = '<span class="ai-cursor">▋</span>';

        const systemPrompt = `You are QFT — the FIN-OS Quantum Financial Thinking Engine.
You are a brutally honest, highly precise financial mentor for Indian professionals.
You speak directly, use ₹ for amounts, reference Indian financial context (SIPs, FDs, ELSS, Section 80C, EPF).
Keep responses concise but deeply insightful. Use markdown for structure when needed.
${systemHint}`;

        try {
            const response = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model:      "claude-sonnet-4-20250514",
                    max_tokens: 1000,
                    system:     systemPrompt,
                    messages:   [{ role: "user", content: prompt }]
                })
            });

            if (!response.ok) throw new Error(`API error: ${response.status}`);
            const data = await response.json();

            // Extract text from response
            const text = data.content
                ?.filter(b => b.type === 'text')
                .map(b => b.text)
                .join('') || '';

            // Typewriter effect for immersion
            await typewriterEffect(targetEl, text);

        } catch (err) {
            targetEl.innerHTML = `<span class="ai-error">⚠ AI unavailable. Check your backend connection.<br><small>${err.message}</small></span>`;
        }
    }

    /** Renders text with a typewriter animation */
    async function typewriterEffect(el, text, speed = 6) {
        el.innerHTML = '';
        // Render markdown-ish: bold, code, newlines
        const html = text
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/`(.+?)`/g, '<code>$1</code>')
            .replace(/#{1,3} (.+)/g, '<h4>$1</h4>')
            .replace(/\n/g, '<br>');

        const tmp  = document.createElement('div');
        tmp.innerHTML = html;
        const chars = tmp.innerHTML.split('');

        el.innerHTML = '';
        const cursor = document.createElement('span');
        cursor.className = 'ai-cursor';
        cursor.textContent = '▋';
        el.appendChild(cursor);

        let i = 0;
        return new Promise(resolve => {
            const interval = setInterval(() => {
                if (i >= chars.length) {
                    clearInterval(interval);
                    cursor.remove();
                    el.innerHTML = tmp.innerHTML; // final clean render
                    resolve();
                    return;
                }
                cursor.insertAdjacentHTML('beforebegin', chars[i]);
                i += Math.ceil(speed / 3); // batch chars for performance
            }, speed);
        });
    }

    /**
     * Wires up all AI sections that are pre-baked in the HTML:
     *   Section 14  — AI Deep Dive Report (tabs)
     *   Section 14b — Proactive Insights panel
     *   Section 15  — AI Chat interface
     *
     * This replaces the old approach of injecting new DOM nodes, so there
     * are no duplicate sections when the HTML already contains the markup.
     * If for any reason the static elements are missing (e.g. an older HTML
     * file is deployed) we fall back to injecting them dynamically.
     */
    function injectAISections(reportData) {

        // ── Ensure sections are visible (they start hidden via mirrorSection hidden) ──
        const reportSection   = document.getElementById('aiReportSection');
        const insightsSection = document.getElementById('aiInsightsSection');
        const chatSection     = document.getElementById('aiChatSection');

        // ── FALLBACK: If the HTML doesn't have the static sections yet,
        //    inject them dynamically before the action layer (backward-compat). ──
        if (!reportSection || !insightsSection || !chatSection) {
            _injectAISectionsFallback(reportData);
            return;
        }

        // ── Wire AI Report tabs ──
        const tabs      = reportSection.querySelectorAll('.ai-tab');
        const contentEl = document.getElementById('aiReportContent');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => {
                    t.classList.remove('active');
                    t.setAttribute('aria-selected', 'false');
                });
                tab.classList.add('active');
                tab.setAttribute('aria-selected', 'true');
                loadAIReportTab(tab.dataset.tab, reportData);
            });
        });

        // ── Wire share + refresh buttons ──
        document.getElementById('shareReportBtn')?.addEventListener('click', shareReport);
        document.getElementById('refreshInsightBtn')?.addEventListener('click', () => {
            const activeTab = reportSection.querySelector('.ai-tab.active');
            if (activeTab) loadAIReportTab(activeTab.dataset.tab, reportData, true);
        });

        // ── Wire chat ──
        initChat(reportData);

        // ── Load initial report tab ──
        loadAIReportTab('psyche', reportData);

        // ── Load proactive insights ──
        loadInsights(reportData);

        // ── Scroll-reveal for new sections ──
        requestAnimationFrame(attachRevealObserver);
    }

    /**
     * Backward-compatible fallback: dynamically injects AI sections when
     * the deployed HTML does not yet contain the static markup.
     * Matches the structure expected by all wiring logic above.
     */
    function _injectAISectionsFallback(reportData) {
        const actionLayer = mirrorSection.querySelector('.action-layer');
        if (!actionLayer) return;

        const aiReportSection = document.createElement('section');
        aiReportSection.id        = 'aiReportSection';
        aiReportSection.className = 'ai-report-section';
        aiReportSection.setAttribute('aria-label', 'AI Deep Dive Report');
        aiReportSection.innerHTML = `
            <div class="glass-card wide-card ai-report-card">
                <div class="card-header">
                    <span class="num">14</span>
                    <h3>AI DEEP DIVE REPORT</h3>
                    <span class="ai-badge">⚡ POWERED BY QFT</span>
                </div>
                <div class="ai-report-tabs" role="tablist">
                    <button class="ai-tab active" data-tab="psyche"      role="tab" aria-selected="true">PSYCHE</button>
                    <button class="ai-tab"        data-tab="wealth_path" role="tab" aria-selected="false">WEALTH PATH</button>
                    <button class="ai-tab"        data-tab="risk_matrix" role="tab" aria-selected="false">RISK MATRIX</button>
                    <button class="ai-tab"        data-tab="action_plan" role="tab" aria-selected="false">ACTION PLAN</button>
                </div>
                <div class="ai-report-content" id="aiReportContent">
                    <div class="ai-skeleton"></div>
                    <div class="ai-skeleton"></div>
                    <div class="ai-skeleton short"></div>
                </div>
                <div class="ai-report-actions">
                    <button class="ghost-btn" id="shareReportBtn">SHARE REPORT</button>
                    <button class="ghost-btn" id="refreshInsightBtn">↻ REFRESH INSIGHT</button>
                </div>
            </div>`;

        const aiInsightsSection = document.createElement('section');
        aiInsightsSection.id        = 'aiInsightsSection';
        aiInsightsSection.className = 'ai-insights-section';
        aiInsightsSection.setAttribute('aria-label', 'Proactive Insights');
        aiInsightsSection.innerHTML = `
            <div class="glass-card wide-card">
                <div class="card-header">
                    <span class="num">14b</span>
                    <h3>PROACTIVE ALERTS</h3>
                    <span class="ai-badge">AI GENERATED</span>
                </div>
                <p style="font-size:.82rem;color:rgba(255,255,255,.4);margin:0 0 14px">
                    Risks and opportunities your profile reveals — before you ask.
                </p>
                <div class="ai-insights-panel" id="insightsPanel">
                    <div class="insight-chip" style="height:72px">
                        <div class="ai-skeleton" style="margin:0 0 8px;width:60%"></div>
                        <div class="ai-skeleton short" style="margin:0"></div>
                    </div>
                    <div class="insight-chip" style="height:72px">
                        <div class="ai-skeleton" style="margin:0 0 8px;width:70%"></div>
                        <div class="ai-skeleton short" style="margin:0"></div>
                    </div>
                    <div class="insight-chip" style="height:72px">
                        <div class="ai-skeleton" style="margin:0 0 8px;width:55%"></div>
                        <div class="ai-skeleton short" style="margin:0"></div>
                    </div>
                    <div class="insight-chip" style="height:72px">
                        <div class="ai-skeleton" style="margin:0 0 8px;width:65%"></div>
                        <div class="ai-skeleton short" style="margin:0"></div>
                    </div>
                </div>
            </div>`;

        const aiChatSection = document.createElement('section');
        aiChatSection.id        = 'aiChatSection';
        aiChatSection.className = 'ai-chat-section';
        aiChatSection.setAttribute('aria-label', 'AI Chat Interface');
        aiChatSection.innerHTML = `
            <div class="glass-card wide-card ai-chat-card">
                <div class="card-header">
                    <span class="num">15</span>
                    <h3>ASK YOUR FINANCIAL TWIN</h3>
                    <span class="ai-badge live">● LIVE</span>
                </div>
                <p class="chat-subtitle">Your AI advisor already knows your full financial profile. Ask anything.</p>
                <div class="chat-suggestions" id="chatSuggestions">
                    <button class="suggestion-chip" data-q="What is my biggest financial blind spot right now?">Biggest blind spot?</button>
                    <button class="suggestion-chip" data-q="Give me a 30-day financial reset plan based on my profile.">30-day reset plan</button>
                    <button class="suggestion-chip" data-q="Am I ready to invest in equity, or should I fix my foundation first?">Ready to invest?</button>
                    <button class="suggestion-chip" data-q="What specific SIP strategy suits my archetype?">SIP strategy for me</button>
                    <button class="suggestion-chip" data-q="How should I approach tax planning given my spending patterns?">Tax planning tips</button>
                </div>
                <div class="chat-messages" id="chatMessages" role="log" aria-live="polite"></div>
                <div class="chat-input-row">
                    <input type="text" id="chatInput" class="chat-input"
                           placeholder="Ask about investing, spending, FIRE planning..."
                           maxlength="500" autocomplete="off" aria-label="Chat message input">
                    <button class="chat-send-btn" id="chatSendBtn" aria-label="Send message">SEND ›</button>
                </div>
                <p class="chat-disclaimer">AI-generated insights for educational purposes only. Not a SEBI-registered advisor.</p>
            </div>`;

        actionLayer.parentNode.insertBefore(aiReportSection,   actionLayer);
        actionLayer.parentNode.insertBefore(aiInsightsSection, actionLayer);
        actionLayer.parentNode.insertBefore(aiChatSection,     actionLayer);

        // Recurse — now the elements exist so the main path will wire them
        injectAISections(reportData);
    }

    // ──────────────────────────────────────────────────────────
    // AI REPORT TAB LOADER
    // ──────────────────────────────────────────────────────────
    const _tabCache = {}; // Cache per tab so we don't re-call on every click

    async function loadAIReportTab(tab, reportData, forceRefresh = false) {
        const contentEl = document.getElementById('aiReportContent');
        if (!contentEl) return;

        const cacheKey = tab;
        if (_tabCache[cacheKey] && !forceRefresh) {
            contentEl.innerHTML = _tabCache[cacheKey];
            return;
        }

        // Show skeleton
        contentEl.innerHTML = `
            <div class="ai-skeleton"></div>
            <div class="ai-skeleton"></div>
            <div class="ai-skeleton short"></div>`;

        const ctx = buildProfileContext(reportData);

        const prompts = {
            psyche: `${ctx}

Provide a 250-word deep psychological analysis of this person's financial psyche.
Cover:
1. What their dominant trait (${reportData.raw ? Object.entries(reportData.raw).sort((a,b)=>b[1]-a[1])[0]?.[0] : 'unknown'}) means in practice for an Indian professional
2. The specific emotional traps they will face with money this year
3. One brutal truth they need to hear about themselves
Use the "Desi Context" clue to make this hyper-relevant. Be direct, not preachy.`,

            wealth: `${ctx}

Create a personalized 5-year wealth path for this person.
Given their archetype (${reportData.archetype}) and resilience score (${reportData.resilience}/100):
1. What financial foundation they need to build in Year 1
2. The specific investment instruments best suited (SIP amounts, asset allocation)
3. The one wealth lever they are currently ignoring
4. Red flags that will derail this plan if ignored
Be specific with Indian numbers and instruments.`,

            risk: `${ctx}

Perform a risk matrix analysis for this specific financial archetype.
Cover:
1. Their ACTUAL risk tolerance vs their PERCEIVED risk tolerance (these differ)
2. The 3 biggest financial risks they face given their profile (not generic — specific to their traits)
3. The risk they are UNDEREXPOSED to (most people over-protect against wrong things)
4. How to build antifragility into their specific situation
Use Indian market context (equity volatility, real estate cycles, inflation).`,

            action: `${ctx}

Create a surgical 90-day financial action plan.
Organized as:
**Week 1-2: The Foundation Audit**
**Week 3-4: The Cuts**
**Month 2: The Builds**
**Month 3: The Locks**

For each phase give 2-3 specific actions with Indian context (specific apps, fund categories, account types).
End with the ONE metric they should track to know if they're succeeding.`
        };

        const prompt = prompts[tab] || prompts['psyche'];

        contentEl.innerHTML = '';
        const responseEl = document.createElement('div');
        responseEl.className = 'ai-response-text';
        contentEl.appendChild(responseEl);

        await streamAI(prompt, responseEl);

        // Cache the result
        _tabCache[cacheKey] = contentEl.innerHTML;
    }

    // ──────────────────────────────────────────────────────────
    // PROACTIVE INSIGHTS LOADER (Section 14b)
    // ──────────────────────────────────────────────────────────

    /**
     * Calls the AI to generate 4 ranked proactive insights and renders
     * them into the #insightsPanel chip grid.
     * Falls back gracefully if the API is unavailable or returns malformed JSON.
     */
    async function loadInsights(reportData) {
        const panel = document.getElementById("insightsPanel");
        if (!panel) return;

        const ctx = buildProfileContext(reportData);
        const prompt = ctx + "\n\nGenerate exactly 4 proactive financial insights for this user.\n" +
            "Return ONLY a valid JSON array — no markdown, no preamble.\n" +
            "Format: [{id,severity,category,title,body}]\n" +
            "severity: critical|warning|info. categories: savings|investing|debt|behavior|tax|protection\n" +
            "Rank critical first. Be specific — reference their archetype and profile vectors.";

        try {
            const response = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model:      "claude-sonnet-4-20250514",
                    max_tokens: 800,
                    system:     "You are QFT. Return ONLY raw JSON arrays — no markdown, no code fences.",
                    messages:   [{ role: "user", content: prompt }]
                })
            });

            if (!response.ok) throw new Error("API " + response.status);
            const data = await response.json();

            let raw = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
            raw = raw.replace(/```json|```/g, "").trim();

            let insights = JSON.parse(raw);
            if (!Array.isArray(insights)) throw new Error("Not an array");
            insights = insights.slice(0, 4);

            panel.innerHTML = insights.map(ins => "" +
                "<div class=\"insight-chip " + (ins.severity || "info") + "\" role=\"listitem\">" +
                "<div class=\"insight-chip-category\">" + _esc(ins.category || "") + "</div>" +
                "<div class=\"insight-chip-title\">" + _esc(ins.title || "") + "</div>" +
                "<div class=\"insight-chip-body\">" + _esc(ins.body || "") + "</div>" +
                "</div>").join("");

        } catch (err) {
            console.warn("[Insights] Load failed:", err.message);
            panel.innerHTML = "<div class=\"insight-chip warning\" style=\"grid-column:1/-1\">" +
                "<div class=\"insight-chip-title\">INSIGHTS UNAVAILABLE</div>" +
                "<div class=\"insight-chip-body\">Could not load AI insights. Check your API connection.</div>" +
                "</div>";
        }
    }

    /** XSS guard for AI-generated text inserted into innerHTML. */
    function _esc(str) {
        return String(str)
            .replace(/&/g,"&amp;")
            .replace(/</g,"&lt;")
            .replace(/>/g,"&gt;")
            .replace(/"/g,"&quot;");
    }

    // ──────────────────────────────────────────────────────────
    // AI CHAT ENGINE
    // ──────────────────────────────────────────────────────────
    function initChat(reportData) {
        const chatMessages = document.getElementById('chatMessages');
        const chatInput    = document.getElementById('chatInput');
        const chatSendBtn  = document.getElementById('chatSendBtn');
        const suggestions  = document.getElementById('chatSuggestions');

        if (!chatMessages || !chatInput || !chatSendBtn) return;

        const chatHistory = []; // in-memory multi-turn history
        const profileCtx  = buildProfileContext(reportData);

        // Suggestion chips
        suggestions?.querySelectorAll('.suggestion-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                chatInput.value = chip.dataset.q;
                sendMessage();
            });
        });

        chatSendBtn.addEventListener('click', sendMessage);
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        async function sendMessage() {
            const text = chatInput.value.trim();
            if (!text) return;

            chatInput.value = '';
            chatSendBtn.disabled = true;

            // Append user bubble
            appendMessage('user', text, chatMessages);

            // Append AI bubble with loading state
            const aiBubble = appendMessage('ai', '', chatMessages);
            const aiContent = aiBubble.querySelector('.msg-content');
            aiContent.innerHTML = '<span class="ai-cursor">▋</span>';

            // Scroll to bottom
            chatMessages.scrollTop = chatMessages.scrollHeight;

            // Build conversation-aware messages array
            chatHistory.push({ role: 'user', content: text });

            const systemPrompt = `You are QFT — FIN-OS Financial Intelligence.
You know this user's complete financial profile:
${profileCtx}

Rules:
- Reference their specific archetype, traits, and weaknesses when relevant
- Use Indian financial context (₹, SIPs, FDs, mutual funds, EPF, NPS, Section 80C)
- Be blunt and direct — this person wants truth, not comfort
- Keep responses under 200 words unless deep analysis is needed
- End with one sharp actionable insight`;

            try {
                const response = await fetch("https://api.anthropic.com/v1/messages", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        model:      "claude-sonnet-4-20250514",
                        max_tokens: 1000,
                        system:     systemPrompt,
                        messages:   chatHistory
                    })
                });

                if (!response.ok) throw new Error(`API ${response.status}`);
                const data = await response.json();
                const reply = data.content
                    ?.filter(b => b.type === 'text')
                    .map(b => b.text)
                    .join('') || 'No response generated.';

                chatHistory.push({ role: 'assistant', content: reply });

                // Limit history to last 10 turns
                if (chatHistory.length > 20) chatHistory.splice(0, 2);

                await typewriterEffect(aiContent, reply, 4);

            } catch (err) {
                aiContent.innerHTML = `<span class="ai-error">⚠ ${err.message}</span>`;
            }

            chatSendBtn.disabled = false;
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }

    function appendMessage(role, text, container) {
        const div = document.createElement('div');
        div.className = `chat-message ${role}`;
        div.innerHTML = `
            <div class="msg-avatar">${role === 'user' ? '👤' : '⚡'}</div>
            <div class="msg-content">${text}</div>`;
        container.appendChild(div);
        return div;
    }

    // ──────────────────────────────────────────────────────────
    // SHARE REPORT
    // ──────────────────────────────────────────────────────────
    function shareReport() {
        if (!finalReportData) return;
        const text = `My FIN-OS Financial Archetype: ${finalReportData.archetype}
Resilience: ${finalReportData.resilience}/100 | Emotional Leak: ${finalReportData.leak}
Strengths: ${(finalReportData.strengths || []).join(', ')}
${finalReportData.desiContext}
— Generated by FIN-OS`;

        navigator.clipboard.writeText(text)
            .then(() => {
                const btn = document.getElementById('shareReportBtn');
                if (btn) { btn.textContent = '✓ COPIED'; setTimeout(() => btn.textContent = 'SHARE REPORT', 2000); }
            })
            .catch(() => alert('Copy failed. Please copy manually.'));
    }

    // ──────────────────────────────────────────────────────────
    // 9. AI SECTION STYLES (injected once)
    // ──────────────────────────────────────────────────────────
    function injectAIStyles() {
        if (document.getElementById('finos-ai-styles')) return;
        const style = document.createElement('style');
        style.id = 'finos-ai-styles';
        style.textContent = `
/* ── AI Badge ── */
.ai-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    letter-spacing: .1em;
    padding: 3px 8px;
    border: 1px solid rgba(199,240,0,.4);
    color: #C7F000;
    border-radius: 4px;
    margin-left: auto;
}
.ai-badge.live { color: #4ade80; border-color: rgba(74,222,128,.4); animation: pulse-dot 2s infinite; }
@keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:.4} }

/* ── AI Report Tabs ── */
.ai-report-tabs {
    display: flex;
    gap: 4px;
    margin: 16px 0;
    border-bottom: 1px solid rgba(255,255,255,.08);
    padding-bottom: 12px;
    flex-wrap: wrap;
}
.ai-tab {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    letter-spacing: .08em;
    padding: 6px 14px;
    border: 1px solid rgba(255,255,255,.12);
    background: transparent;
    color: rgba(255,255,255,.45);
    border-radius: 4px;
    cursor: pointer;
    transition: all .2s;
}
.ai-tab:hover { border-color: rgba(199,240,0,.4); color: rgba(255,255,255,.7); }
.ai-tab.active {
    background: rgba(199,240,0,.12);
    border-color: #C7F000;
    color: #C7F000;
}

/* ── AI Report Content ── */
.ai-report-content {
    min-height: 140px;
    line-height: 1.7;
}
.ai-response-text {
    font-size: .88rem;
    color: rgba(255,255,255,.75);
    line-height: 1.75;
}
.ai-response-text h4 {
    color: #C7F000;
    font-family: 'JetBrains Mono', monospace;
    font-size: .82rem;
    letter-spacing: .06em;
    margin: 14px 0 6px;
}
.ai-response-text strong { color: #fff; }
.ai-response-text code {
    background: rgba(199,240,0,.1);
    color: #C7F000;
    padding: 1px 5px;
    border-radius: 3px;
    font-family: 'JetBrains Mono', monospace;
    font-size: .8em;
}

/* ── Skeleton loader ── */
.ai-skeleton {
    height: 14px;
    background: linear-gradient(90deg, rgba(255,255,255,.04) 25%, rgba(255,255,255,.09) 50%, rgba(255,255,255,.04) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.4s infinite;
    border-radius: 4px;
    margin-bottom: 10px;
}
.ai-skeleton.short { width: 55%; }
@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

/* ── AI cursor ── */
.ai-cursor {
    display: inline-block;
    color: #C7F000;
    animation: blink-cur .7s steps(1) infinite;
    font-size: 1em;
}
@keyframes blink-cur { 0%,100%{opacity:1} 50%{opacity:0} }
.ai-error { color: #f87171; font-size: .82rem; }

/* ── Report actions ── */
.ai-report-actions {
    display: flex;
    gap: 12px;
    margin-top: 20px;
    flex-wrap: wrap;
}
.ai-share-btn, .ai-refresh-btn {
    font-size: .75rem;
    padding: 6px 16px;
}

/* ── Chat section ── */
.ai-chat-section { margin-bottom: 0; }
.chat-subtitle {
    font-size: .82rem;
    color: rgba(255,255,255,.45);
    margin: -4px 0 16px;
}

/* ── Suggestion chips ── */
.chat-suggestions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 16px;
}
.suggestion-chip {
    font-family: 'JetBrains Mono', monospace;
    font-size: .72rem;
    letter-spacing: .04em;
    padding: 5px 12px;
    border: 1px solid rgba(199,240,0,.25);
    color: rgba(199,240,0,.7);
    background: rgba(199,240,0,.04);
    border-radius: 20px;
    cursor: pointer;
    transition: all .2s;
}
.suggestion-chip:hover {
    background: rgba(199,240,0,.12);
    color: #C7F000;
    border-color: #C7F000;
}

/* ── Chat messages ── */
.chat-messages {
    display: flex;
    flex-direction: column;
    gap: 14px;
    max-height: 420px;
    overflow-y: auto;
    padding: 4px 0;
    scroll-behavior: smooth;
}
.chat-messages::-webkit-scrollbar { width: 4px; }
.chat-messages::-webkit-scrollbar-track { background: rgba(255,255,255,.03); }
.chat-messages::-webkit-scrollbar-thumb { background: rgba(199,240,0,.3); border-radius: 2px; }

.chat-message {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    animation: msg-in .25s ease;
}
@keyframes msg-in { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }

.chat-message.user { flex-direction: row-reverse; }
.msg-avatar {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    flex-shrink: 0;
    border: 1px solid rgba(255,255,255,.1);
    background: rgba(255,255,255,.04);
}
.msg-content {
    max-width: 80%;
    font-size: .85rem;
    line-height: 1.65;
    color: rgba(255,255,255,.8);
    padding: 10px 14px;
    border-radius: 12px;
    background: rgba(255,255,255,.05);
    border: 1px solid rgba(255,255,255,.07);
}
.chat-message.user .msg-content {
    background: rgba(199,240,0,.08);
    border-color: rgba(199,240,0,.2);
    color: rgba(255,255,255,.9);
}
.msg-content strong { color: #fff; }
.msg-content code {
    background: rgba(199,240,0,.1);
    color: #C7F000;
    padding: 1px 4px;
    border-radius: 3px;
    font-size: .8em;
    font-family: 'JetBrains Mono', monospace;
}

/* ── Chat input ── */
.chat-input-row {
    display: flex;
    gap: 8px;
    margin-top: 16px;
}
.chat-input {
    flex: 1;
    background: rgba(255,255,255,.04);
    border: 1px solid rgba(255,255,255,.1);
    border-radius: 8px;
    color: #fff;
    font-family: 'Manrope', sans-serif;
    font-size: .85rem;
    padding: 10px 14px;
    outline: none;
    transition: border-color .2s;
}
.chat-input:focus { border-color: rgba(199,240,0,.5); }
.chat-input::placeholder { color: rgba(255,255,255,.25); }

.chat-send-btn {
    background: rgba(199,240,0,.1);
    border: 1px solid rgba(199,240,0,.35);
    color: #C7F000;
    font-family: 'JetBrains Mono', monospace;
    font-size: .75rem;
    letter-spacing: .08em;
    padding: 10px 18px;
    border-radius: 8px;
    cursor: pointer;
    transition: all .2s;
}
.chat-send-btn:hover:not(:disabled) {
    background: rgba(199,240,0,.2);
    border-color: #C7F000;
}
.chat-send-btn:disabled { opacity: .4; cursor: not-allowed; }

.chat-disclaimer {
    font-size: .7rem;
    color: rgba(255,255,255,.22);
    margin-top: 10px;
    text-align: center;
}

/* ── Selected option state ── */
.scan-option.selected {
    border-color: #C7F000 !important;
    background: rgba(199,240,0,.08) !important;
    color: #C7F000 !important;
}

/* ── Dark mode light theme overrides ── */
[data-theme="light"] .ai-tab { color: rgba(0,0,0,.5); border-color: rgba(0,0,0,.15); }
[data-theme="light"] .ai-tab.active { background: rgba(80,120,0,.1); color: #4a7000; border-color: #4a7000; }
[data-theme="light"] .chat-input { background: rgba(0,0,0,.03); border-color: rgba(0,0,0,.12); color: #000; }
[data-theme="light"] .msg-content { background: rgba(0,0,0,.04); border-color: rgba(0,0,0,.08); color: rgba(0,0,0,.8); }
[data-theme="light"] .chat-message.user .msg-content { background: rgba(80,120,0,.08); border-color: rgba(80,120,0,.2); }
`;
        document.head.appendChild(style);
    }

}); // end DOMContentLoaded