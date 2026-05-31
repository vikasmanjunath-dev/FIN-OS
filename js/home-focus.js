
document.addEventListener("DOMContentLoaded", async () => {
    // 1. VISUAL FEEDBACK
    const container = document.querySelector('.home-hero .card-content');
    if (container) container.style.opacity = 0.5;

    // 2. LOAD PROFILE — prefer window.FINOS_USER_CONTEXT (already populated by
    //    finos-context.js which handles Supabase auth). No second client needed.
    let profile = null;

    function _buildProfileFromCtx() {
        const ctx = window.FINOS_USER_CONTEXT;
        if (!ctx) return null;
        const dnaData = ctx.dna || (() => {
            try { return JSON.parse(localStorage.getItem('FINOS_CORE_DNA') || 'null'); } catch { return null; }
        })();
        return {
            dna_scores: dnaData?.scores || [50, 50, 50, 50, 50],
            life_stage: ctx.identity?.life_stage || localStorage.getItem('finos_stage') || 'Rookie',
            full_name:  ctx.identity?.name       || localStorage.getItem('finos_display_name') || '',
        };
    }

    // Try the already-enriched context first
    profile = _buildProfileFromCtx();

    // If context not yet available, wait for the first context-ready event
    if (!profile) {
        await new Promise(resolve => {
            const timer = setTimeout(resolve, 3000); // max 3s wait
            window.addEventListener('finos-context-ready', () => {
                clearTimeout(timer);
                resolve();
            }, { once: true });
        });
        profile = _buildProfileFromCtx();
    }

    // Final guest fallback
    if (!profile) {
        const dna = (() => {
            try { return JSON.parse(localStorage.getItem('FINOS_CORE_DNA') || '{}'); } catch { return {}; }
        })();
        profile = {
            dna_scores: dna.scores || [50, 50, 50, 50, 50],
            life_stage: localStorage.getItem('finos_stage') || 'Rookie',
            full_name:  localStorage.getItem('finos_display_name') || '',
        };
    }

    // 4. GENERATE CONTENT (With Strict Freshness)
    try {
        const engine = new FocusEngine(profile);

        let history = JSON.parse(localStorage.getItem('finos_focus_history') || '[]');
        let insight  = null;
        let attempts = 0;

        // RETRY LOOP: Try 50 times to find a completely new sentence
        while (attempts < 50) {
            const candidate = engine.generate();
            if (!history.includes(candidate.body)) { insight = candidate; break; }
            attempts++;
        }
        if (!insight) insight = engine.generate();

        history.push(insight.body);
        if (history.length > 30) history.shift();
        localStorage.setItem('finos_focus_history', JSON.stringify(history));

        updateUI(insight.title, insight.body, insight.tag, insight.color);

    } catch (err) {
        console.error("Focus Engine Crash:", err);
        // Friendly fallback — never show an error to the user
        updateUI(
            "Today's Edge",
            "Small consistent actions create lasting wealth. <strong>One decision today changes your tomorrow.</strong>",
            "Daily Focus",
            "#C7F000"
        );
    }
});

// --- UI UPDATER FUNCTION ---
function updateUI(title, body, tag, color) {
    const container = document.querySelector('.home-hero .card-content');
    if (!container) return;

    container.style.opacity = 0; // Fade out
    
    setTimeout(() => {
        container.querySelector('h3').innerText = title;
        container.querySelector('p').innerHTML = body;
        
        const pill = container.querySelector('.pill');
        pill.innerText = tag;
        pill.style.borderColor = color;
        pill.style.color = color;
        
        container.style.opacity = 1; // Fade in
    }, 200);
}

/**
 * =======================================================
 * THE INFINITE CONTENT ENGINE (50,000+ Combinations)
 * =======================================================
 */
class FocusEngine {
    constructor(profile) {
        this.scores = profile.dna_scores || [50, 50, 50, 50, 50]; 
        this.stage = profile.life_stage || "Rookie";
        this.name = profile.full_name ? profile.full_name.split(' ')[0] : "Traveler";

        // Logic Flags
        this.isRookie = this.stage.includes('Rookie') || this.stage.includes('Student');
        this.isVeteran = this.stage.includes('Captain');
        this.isHighRisk = this.scores[0] > 70;
        this.isRiskAverse = this.scores[0] < 30;
        this.isAnxious = this.scores[1] > 70;
        this.isStatusDriven = this.scores[2] > 60;
    }

    generate() {
        const roll = Math.random();
        // 20% Hand-Crafted Gold (Static)
        // 80% Procedural Generation (Infinite)
        if (roll < 0.2) return this.getCurated();
        return this.getProcedural();
    }

    // --- MODULE A: CURATED GOLD (Top 50 Specifics) ---
    getCurated() {
        const library = [
            { cond: this.isRookie, title: "The Time Arbitrage", body: "You have the one asset billionaires can't buy: <strong>Time</strong>. Don't waste it on low-yield FDs. Take calculated risks.", tag: "Leverage", type: "growth" },
            { cond: this.isRookie, title: "Skill ROI", body: "The S&P 500 yields 10%. Upgrading your primary skill yields 1000%. <strong>Invest in your brain first.</strong>", tag: "Career", type: "growth" },
            { cond: this.isStatusDriven, title: "The Invisible Tax", body: "Trying to look rich is the most expensive hobby in the world. <strong>Wealth is what you don't see.</strong>", tag: "Psychology", type: "danger" },
            { cond: this.isAnxious, title: "Zoom Out", body: "If you zoom out 10 years, today's market crash is just a tiny blip. <strong>Stop checking the portfolio daily.</strong>", tag: "Perspective", type: "psych" },
            { cond: true, title: "Silent Compounding", body: "Real wealth is boring. It's the money you don't spend and the compounding you don't interrupt.", tag: "Wisdom", type: "growth" },
            { cond: true, title: "The 24h Rule", body: "Impulse buying destroys wealth faster than bad market returns. <strong>Wait 24 hours before any checkout >₹2k.</strong>", tag: "Habit", type: "warning" },
            { cond: true, title: "Inflation Defense", body: "Cash is a melting ice cube. Keeping it in a savings account is a guaranteed loss. <strong>Invest to survive.</strong>", tag: "Macro", type: "danger" }
        ];
        const valid = library.filter(i => i.cond);
        const item = valid[Math.floor(Math.random() * valid.length)] || library[library.length - 1];
        return { ...item, color: this.getColor(item.type) };
    }

    // --- MODULE B: THE SLOT MACHINE (Infinite combos) ---
    getProcedural() {
        // 1. CONTEXTS (20+)
        const contexts = [
            // Time Based
            { t: "Since you have decades ahead,", w: this.isRookie ? 10 : 1 },
            { t: "Because time is your asset,", w: this.isRookie ? 5 : 1 },
            { t: "To escape the rat race early,", w: 3 },
            { t: "If financial freedom is the goal,", w: 3 },
            { t: "Since the market is volatile,", w: 3 },
            { t: "To fight 7% lifestyle inflation,", w: 5 },
            { t: "Because your salary is finite,", w: 4 },
            { t: `To protect your future, ${this.name},`, w: 2 },
            // Psych Based
            { t: "Since you dislike losing money,", w: this.isAnxious ? 10 : 0 },
            { t: "To sleep better at night,", w: this.isAnxious ? 10 : 0 },
            { t: "To stop the social comparison loop,", w: this.isStatusDriven ? 10 : 0 },
            { t: "Because status games have no winners,", w: this.isStatusDriven ? 10 : 0 },
            { t: "Since you have a high risk appetite,", w: this.isHighRisk ? 10 : 0 },
            { t: "To build a legacy for your family,", w: this.isVeteran ? 10 : 1 }
        ];

        // 2. ACTIONS (30+)
        const actions = [
            // Audits
            "audit your last 30 days of UPI spends",
            "check the expense ratio of your funds",
            "calculate your exact liquid net worth",
            "review your health insurance coverage",
            "track your 'Latte Factor' expenses",
            "cancel one subscription you rarely use",
            // Behavior
            "delete shopping apps for 48 hours",
            "wait 3 days before any luxury purchase",
            "automate your SIP for salary day",
            "stop checking stock prices hourly",
            "unsubscribe from marketing emails",
            "start a 'No Spend' challenge today",
            // Learning
            "read 5 pages of a finance book",
            "learn about 'Tax Harvesting' today",
            "study the history of market crashes",
            "listen to one financial podcast episode",
            // Aggressive
            "increase your investment rate by 1%",
            "negotiate your salary or fees",
            "kill your highest interest debt now",
            "move emergency funds to a separate bank"
        ];

        // 3. OUTCOMES (25+)
        const outcomes = [
            // Logic
            "because compounding needs fuel to work.",
            "or lifestyle inflation will trap you.",
            "because what gets measured gets managed.",
            "to build a fortress around your life.",
            "because hope is not a financial strategy.",
            "so you can stop trading time for money.",
            "because fees destroy long-term returns.",
            "to separate your ego from your wallet.",
            // Emotional
            "because your future self is depending on you.",
            "to buy back your time from your boss.",
            "so you don't have to work until 70.",
            "because freedom is better than luxury.",
            "to prove that you control your money.",
            "because discipline weighs ounces, regret weighs tons.",
            "so you can weather any economic storm."
        ];

        // 4. TITLES (15+)
        const titles = [
            "Tactical Focus", "System Upgrade", "Reality Check", "Wealth Hack", 
            "Mindset Shift", "Urgent Audit", "Growth Protocol", "Daily Discipline",
            "The 1% Edge", "Financial Hygiene", "Asset Defense", "Correction Required"
        ];

        // Weighted Selection Helper
        const getWeighted = (arr) => {
            const pool = [];
            arr.forEach(x => { for(let i=0; i<(x.w||1); i++) pool.push(x); });
            return pool[Math.floor(Math.random() * pool.length)];
        };

        const context = getWeighted(contexts).t;
        const action = actions[Math.floor(Math.random() * actions.length)];
        const outcome = outcomes[Math.floor(Math.random() * outcomes.length)];
        const title = titles[Math.floor(Math.random() * titles.length)];

        // Smart Tagging & Coloring
        let type = 'growth';
        if (outcome.includes('trap') || outcome.includes('inflation') || outcome.includes('regret')) type = 'danger';
        if (action.includes('stop') || action.includes('delete') || action.includes('wait')) type = 'psych';

        return {
            title: title,
            body: `${context} <strong>${action}</strong> ${outcome}`,
            tag: "AI Generated Focus",
            color: this.getColor(type)
        };
    }

    getColor(type) {
        if (type === 'danger') return '#ff4757'; // Red
        if (type === 'growth') return '#C7F000'; // Lime
        if (type === 'psych') return '#4F7CFF';  // Blue
        return '#fff';
    }
}