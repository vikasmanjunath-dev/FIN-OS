/**
 * js/investor-mindset.js
 * Core Interactive Logic for FIN-OS Investor Mindset Experience
 */

document.addEventListener("DOMContentLoaded", () => {

    // --- 1. THREE.JS HERO BACKGROUND (Neural / Particle Network) ---
    const initThreeJS = () => {
        const canvas = document.getElementById('heroCanvas');
        if (!canvas) return;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });

        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        // Particles
        const particlesGeometry = new THREE.BufferGeometry();
        const particlesCount = 700;

        const posArray = new Float32Array(particlesCount * 3);

        for (let i = 0; i < particlesCount * 3; i++) {
            // Spread particles across the screen
            posArray[i] = (Math.random() - 0.5) * 15;
        }

        particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));

        // Material
        const material = new THREE.PointsMaterial({
            size: 0.02,
            color: 0x00f2fe,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending
        });
        window.heroMaterial = material; // Exposed for Mindset Switcher Engine

        const particlesMesh = new THREE.Points(particlesGeometry, material);
        scene.add(particlesMesh);

        camera.position.z = 4;

        // Mouse interaction
        let mouseX = 0;
        let mouseY = 0;

        document.addEventListener('mousemove', (event) => {
            mouseX = event.clientX / window.innerWidth - 0.5;
            mouseY = event.clientY / window.innerHeight - 0.5;
        });

        // Animation Loop
        const clock = new THREE.Clock();

        const animate = () => {
            const elapsedTime = clock.getElapsedTime();

            particlesMesh.rotation.y = elapsedTime * 0.05;
            particlesMesh.rotation.x = elapsedTime * 0.02;

            // Subtle mouse parallax
            camera.position.x += (mouseX * 0.5 - camera.position.x) * 0.05;
            camera.position.y += (-mouseY * 0.5 - camera.position.y) * 0.05;
            camera.lookAt(scene.position);

            renderer.render(scene, camera);
            requestAnimationFrame(animate);
        }
        animate();

        // Resize handler
        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });
    };

    initThreeJS();

    // --- 2. GSAP SCROLL ANIMATIONS ---
    gsap.registerPlugin(ScrollTrigger);

    // Point ScrollTrigger at the in-page scroll container (not window)
    const scrollContainer = document.querySelector('.scroll-container');
    ScrollTrigger.defaults({ scroller: scrollContainer });

    // Section Headers Reveal
    gsap.utils.toArray('.sec-header').forEach(header => {
        gsap.fromTo(header,
            { y: 50, opacity: 0 },
            {
                y: 0, opacity: 1, duration: 1,
                scrollTrigger: {
                    trigger: header,
                    start: "top 90%",
                    toggleActions: "play none none none"
                }
            }
        );
    });

    // Investor Cards Stagger
    gsap.fromTo('.investor-card',
        { y: 60, opacity: 0 },
        {
            y: 0, opacity: 1, duration: 0.8, stagger: 0.1,
            scrollTrigger: {
                trigger: '#mindset',
                start: "top 80%"
            }
        }
    );

    // Decision Modules slide in
    gsap.fromTo('.decision-module',
        { x: -40, opacity: 0 },
        {
            x: 0, opacity: 1, duration: 0.8, stagger: 0.2,
            scrollTrigger: {
                trigger: '#decision',
                start: "top 80%"
            }
        }
    );

    // --- 3. INVESTOR MINDSET MODALS & SWITCH ENGINE ---
    const investorData = {
        buffett: {
            name: "Warren Buffett",
            color: "text-green-400",
            bg: "bg-green-500",
            icon: "fa-tree",
            themeHex: 0x4ade80,
            quote: "\"Price is what you pay. Value is what you get.\"",
            philosophy: "Buffett doesn’t chase markets — he waits for markets to come to him. He focuses on intrinsic value, not price movement.",
            framework: [
                { title: "Business First, Stock Second", desc: "Ask: Would I buy this entire company?" },
                { title: "Economic Moat", desc: "Durable competitive advantage (brand, cost, network)" },
                { title: "Time Arbitrage", desc: "Long-term horizon beats short-term noise" },
                { title: "Margin of Safety", desc: "Buy below intrinsic value → downside protection" }
            ],
            decisionProcess: [
                "Understand the business deeply",
                "Estimate intrinsic value",
                "Compare with current price",
                "Act ONLY if undervalued significantly"
            ],
            ignores: ["Daily price fluctuations", "Market news noise", "Short-term volatility"],
            interactiveIdea: { title: "Intrinsic Value Slider", details: "Adjust Growth rate, Discount rate & Cash flows → System outputs True value vs market price and Buy / Wait / Avoid signal." },
            whenToUse: "Long-term investing, Stable businesses, Low emotional environments"
        },
        simons: {
            name: "Jim Simons",
            color: "text-blue-400",
            bg: "bg-blue-500",
            icon: "fa-square-root-variable",
            themeHex: 0x60a5fa,
            quote: "\"We don’t predict — we model probabilities.\"",
            philosophy: "Markets are not emotional — they are mathematical systems with patterns.",
            framework: [
                { title: "Everything is Data", desc: "Price, volume, timing, correlations" },
                { title: "Remove Human Emotion", desc: "Decisions = algorithm outputs" },
                { title: "Repeatable Edge", desc: "Small statistical advantages → massive scale" },
                { title: "High Frequency Thinking", desc: "Many trades, small edges, consistent execution" }
            ],
            decisionProcess: [
                "Collect massive historical data",
                "Identify patterns/anomalies",
                "Build models & Backtest rigorously",
                "Execute automatically"
            ],
            ignores: ["Opinions", "News narratives", "'Gut feeling'"],
            interactiveIdea: { title: "Pattern Detection Engine", details: "Select Volume spike or Price anomaly → System shows probability of outcome and highlights similar past patterns." },
            whenToUse: "Intraday / short-term trading, Algorithmic strategies, High data environments"
        },
        soros: {
            name: "George Soros",
            color: "text-red-500",
            bg: "bg-red-500",
            icon: "fa-globe",
            themeHex: 0xf87171,
            quote: "\"Markets can influence the fundamentals they are supposed to reflect.\"",
            philosophy: "Markets are not rational — they are self-reinforcing belief systems.",
            framework: [
                { title: "Reflexivity Loop", desc: "Perception → Action → Reality → Reinforced perception" },
                { title: "Macro Awareness", desc: "Interest rates, liquidity, geopolitics" },
                { title: "Aggressive When Right", desc: "Small bets early → massive bets when conviction increases" },
                { title: "Asymmetry", desc: "Limited downside, unlimited upside" }
            ],
            decisionProcess: [
                "Identify macro imbalance",
                "Observe market perception",
                "Detect feedback loop forming",
                "Enter early and scale aggressively if confirmed"
            ],
            ignores: ["Static valuation models", "Linear thinking", "'Markets are always right'"],
            interactiveIdea: { title: "Reflexivity Simulator", details: "Input News event & Market reaction → System shows Feedback loop evolution and Bubble/crash probability." },
            whenToUse: "Macro trading, News-driven markets, Volatile environments"
        },
        burry: {
            name: "Michael Burry",
            color: "text-orange-400",
            bg: "bg-orange-500",
            icon: "fa-microscope",
            themeHex: 0xfb923c,
            quote: "\"If you’re right and everyone else is wrong — you win big.\"",
            philosophy: "The best opportunities exist where everyone else is wrong.",
            framework: [
                { title: "Deep Research", desc: "Read what others ignore" },
                { title: "Anti-Consensus", desc: "If everyone agrees → be cautious" },
                { title: "Independent Thinking", desc: "No reliance on crowd validation" },
                { title: "High Conviction Bets", desc: "Few trades, massive impact" }
            ],
            decisionProcess: [
                "Find overlooked data",
                "Identify market mispricing",
                "Validate with deep research",
                "Take contrarian position & Wait (often painfully long)"
            ],
            ignores: ["Market hype", "Social sentiment", "Short-term losses"],
            interactiveIdea: { title: "Contrarian Detector", details: "See Market sentiment (bullish/bearish) → System flags Overcrowded trades and Potential reversal setups." },
            whenToUse: "Bubble environments, Mispriced assets, High conviction scenarios"
        },
        lynch: {
            name: "Peter Lynch",
            color: "text-yellow-400",
            bg: "bg-yellow-500",
            icon: "fa-binoculars",
            themeHex: 0xfacc15,
            quote: "\"Jahan bheed hai, wahan paisa hai — if you know why.\"",
            philosophy: "Reality appears in streets BEFORE it appears in financial statements.",
            framework: [
                { title: "Ground Signal", desc: "You are closer to demand than institutions." },
                { title: "Habit Formation", desc: "Customers habituate → predictable revenue." },
                { title: "Aspiration Shift", desc: "Category expansion beats company growth." },
                { title: "Story matches Numbers", desc: "Observation must be validated by revenue." }
            ],
            decisionProcess: [
                "Observe daily consumption surges",
                "Identify if behavior is sticky/structural",
                "Check balance sheet for confirmation",
                "Enter before mutual funds arrive"
            ],
            ignores: ["Wall Street 'expert' opinions", "Over-complicated math models", "Sectors outside daily life"],
            interactiveIdea: { title: "Ground Reality Scanner", details: "Input real-world observations → Map to actionable alpha and cycle phases." },
            whenToUse: "Retail / Consumer environments, High visibility scaling, Identifying emerging multibaggers"
        },
        dalio: {
            name: "Ray Dalio",
            color: "text-purple-400",
            bg: "bg-purple-500",
            icon: "fa-gears",
            themeHex: 0xa855f7,
            quote: "\"Paisa system ka game hai. Trade the flow, not the stock.\"",
            philosophy: "You don't need to be right, you need to survive all scenarios.",
            framework: [
                { title: "Liquidity Flow", desc: "Credit expansion drives asset prices upward." },
                { title: "Risk Parity", desc: "Balance risk allocation across equity, bonds, gold." },
                { title: "Economic Cycles", desc: "Identify if we are in early, mid, or late cycle modes." },
                { title: "System > Human", desc: "Eliminate ego, run radical transparency algorithms." }
            ],
            decisionProcess: [
                "Track RBI interest repo rates",
                "Measure overall Credit and Liquidity flows",
                "Locate the position in the Economic Cycle",
                "Allocate capital via strict risk parity"
            ],
            ignores: ["Company micro-fundamentals", "Emotional crowd behavior", "Individual stock picking"],
            interactiveIdea: { title: "Economic Machine Dashboard", details: "View overall market liquidity, cycles, and risk environments mapped against global macro shifts." },
            whenToUse: "Macro shifts, Portfolio structuring, Deciphering broad systemic rallies/crashes"
        },
        livermore: {
            name: "Jesse Livermore",
            color: "text-cyan-400",
            bg: "bg-cyan-500",
            icon: "fa-water",
            themeHex: 0x06b6d4,
            quote: "\"Market ki leher pe sawar ho ja. Trend = Direction × Momentum.\"",
            philosophy: "Price movement represents absolute truth. Never predict, always react.",
            framework: [
                { title: "Accumulation", desc: "Smart money buys quietly with low retail visibility." },
                { title: "Markup Phase", desc: "Trend becomes visible, momentum spikes heavily." },
                { title: "Distribution", desc: "The public enters euphorically while smart money exits." },
                { title: "Breakout Confirmation", desc: "Enter purely on volume confirmation breaking resistance." }
            ],
            decisionProcess: [
                "Wait entirely until the market dictates direction",
                "Enter on confirmed volume breakout",
                "Start small, and add exclusively to winning positions",
                "Sit tight without emotion until the trend exhausts"
            ],
            ignores: ["Fundamentals", "Expert News", "Overtrading during consolidation"],
            interactiveIdea: { title: "Breakout Trend Engine", details: "Visualize accumulation blocks bursting into aggressive markup trends." },
            whenToUse: "Following intense momentum rallies, capitalizing on operator-driven spikes"
        },
        munger: {
            name: "Charlie Munger",
            color: "text-amber-400",
            bg: "bg-amber-500",
            icon: "fa-brain",
            themeHex: 0xf59e0b,
            quote: "\"Soch badlo, paisa apne aap badhega. Better Thinking = Better Capital.\"",
            philosophy: "You don't need more information. You need better thinking using multiple mental models.",
            framework: [
                { title: "Incentive X-Ray", desc: "Ask: 'Isko kya fayda hai?' before trusting any advice." },
                { title: "Inversion Thinking", desc: "Ask: 'Isme kya galat ho sakta hai?' before any decision." },
                { title: "Social Proof Trap", desc: "When everyone is bullish, that IS the danger zone." },
                { title: "Loss Aversion Reversal", desc: "Cut losses. Hold winners. Not the instinctive opposite." }
            ],
            decisionProcess: [
                "Run the Incentive X-Ray on all advice and analyst opinion",
                "Invert the thesis — seek exact failure scenarios first",
                "Identify active cognitive biases in current market environment",
                "Allocate only after all psychological interference is removed"
            ],
            ignores: ["Short-term noise", "Overconfidence signals", "FOMO-driven decisions"],
            interactiveIdea: { title: "Cognitive Bias Detector", details: "Identify which biases are active in the market before placing any trade." },
            whenToUse: "Pre-trade analysis, Filtering qualitative information, Long-term capital allocation decisions"
        },
        naval: {
            name: "Naval Ravikant",
            color: "text-amber-600",
            bg: "bg-amber-700",
            icon: "fa-infinity",
            themeHex: 0xb45309,
            quote: "\"Trading paisa deta hai. Ownership wealth banata hai.\"",
            philosophy: "You don't get rich renting out your time. Build systems — code, media, equity — that scale infinitely.",
            framework: [
                { title: "Labor Leverage", desc: "Teams and employees: limited ceiling, hard to scale infinitely." },
                { title: "Capital Leverage", desc: "Money invested creates compounding at scale." },
                { title: "Code Leverage", desc: "Software works 24/7 for zero marginal cost — infinite scale." },
                { title: "Media Leverage", desc: "Content distributes knowledge at zero cost — the new power." }
            ],
            decisionProcess: [
                "Identify what specific knowledge only you can provide",
                "Find the highest available leverage type (aim for Code/Media)",
                "Deploy capital into ownership — equity, not salary",
                "Play the 10-20 year time game; ignore short-term noise"
            ],
            ignores: ["Fixed salary traps", "Low-leverage busy work", "Short-term trading as primary wealth vehicle"],
            interactiveIdea: { title: "Leverage Pyramid", details: "Map your current income sources and identify how to migrate to higher-leverage wealth models." },
            whenToUse: "Long-term wealth strategy, Career pivots, Identifying scalable assets over active income"
        },
        graham: {
            name: "Benjamin Graham",
            color: "text-green-500",
            bg: "bg-green-700",
            icon: "fa-scale-balanced",
            themeHex: 0x16a34a,
            quote: "\"Sasta kharid, mehenga nahi — bas patience rakh. Price ≠ Value.\"",
            philosophy: "Markets are emotion-driven mispricing machines. Exploit the gap between Mr. Market's mood and true intrinsic value with a rigid margin of safety.",
            framework: [
                { title: "Mr. Market", desc: "Treat market as an irrational partner offering prices — use it, don't follow it." },
                { title: "Margin of Safety", desc: "Always buy below intrinsic value to protect against errors." },
                { title: "Intrinsic Value", desc: "Calculated from earnings, assets, and growth — not from sentiment." },
                { title: "Defensive Investing", desc: "Diversify, prioritize stability, survival first before returns." }
            ],
            decisionProcess: [
                "Calculate intrinsic value from fundamentals (earnings, book value, growth)",
                "Wait until market price is at least 30% below intrinsic value",
                "Ignore Mr. Market's daily mood swings entirely",
                "Hold until price meets or exceeds value, then exit"
            ],
            ignores: ["News narratives", "Market mood", "Short-term price action"],
            interactiveIdea: { title: "Margin of Safety Meter", details: "Input a stock's fundamentals to calculate intrinsic value and see the current safety margin." },
            whenToUse: "Bear markets, Panic selling events, Identifying fundamentally mispriced smallcaps and PSU stocks"
        }
    };

    const cards = document.querySelectorAll('.investor-card');
    const modal = document.getElementById('investorModal');

    cards.forEach(card => {
        card.addEventListener('click', () => {
            const type = card.getAttribute('data-investor');
            const data = investorData[type];

            // Redirect directly to the interactive Gen Z Diagrams page
            window.location.href = `investor-profile.html?investor=${type}`;
        });
    });

    // --- 4. DECISION ENGINE LOGIC ---
    const sentSlider = document.getElementById('sentimentSlider');
    const volSlider = document.getElementById('volumeSlider');
    const priceSlider = document.getElementById('priceSlider');

    const sentVal = document.getElementById('sentVal');
    const volVal = document.getElementById('volVal');
    const priceVal = document.getElementById('priceVal');

    const actionOut = document.getElementById('actionOutput');
    const convBar = document.getElementById('convictionBar');
    const convLevel = document.getElementById('convictionLevel');
    const rScore = document.getElementById('riskScore');
    const aiResp = document.getElementById('aiReasoning');
    const nodeCore = document.getElementById('processingCore');
    const glowBox = document.getElementById('outputGlow');
    const trendBar = document.getElementById('trendBar');
    const trendStr = document.getElementById('trendStr');
    const systemThought = document.getElementById('systemThought');
    const reasoningTree = document.getElementById('reasoningTree');

    // Volume Pulse bars
    const volumePulse = document.getElementById('volumePulse');
    if (volumePulse) {
        for (let i = 0; i < 18; i++) {
            const bar = document.createElement('div');
            bar.className = 'vol-pulse-bar rounded-sm transition-all duration-200';
            bar.style.cssText = 'width:4px; background:#ffffff20; height:50%';
            volumePulse.appendChild(bar);
        }
    }

    const aiLines = {
        ACCUMULATE: ["✅ Extreme fear = smart money buying", "⚠️ Volume surge = institutions loading", "❌ Price still weak but trend forming"],
        WAIT: ["⚠️ Market in equilibrium — no edge", "⚠️ Volume neutral — no conviction", "⚠️ Preserve capital. No trade."],
        DISTRIBUTE: ["❌ Greed at extreme = danger zone", "❌ Low volume on high price = distribution", "✅ Exit strategy activated"],
        "MOMENTUM BUY": ["✅ Price breaking resistance hard", "✅ Volume surge = institutional momentum", "⚠️ Late entry risk — use tight stop-loss"],
    };

    const thoughts = {
        ACCUMULATE: "Smart money accumulation detected. Fear is your friend.",
        WAIT: "Insufficient edge. System holds. No trade executed.",
        DISTRIBUTE: "Euphoria zone. Professionals are selling. Exit.",
        "MOMENTUM BUY": "Momentum breakout confirmed. Trend following engaged.",
    };

    const updateEngine = () => {
        const s = parseInt(sentSlider.value);
        const v = parseInt(volSlider.value);
        const p = parseInt(priceSlider.value);

        sentVal.textContent = s < 30 ? "Fearful" : s > 70 ? "Greedy" : "Neutral";
        volVal.textContent = v < 30 ? "Low" : v > 70 ? "High/Spike" : "Average";
        priceVal.textContent = p < 30 ? "Downtrend" : p > 70 ? "Uptrend" : "Ranging";

        // Update Volume Pulse bars
        if (volumePulse) {
            volumePulse.querySelectorAll('.vol-pulse-bar').forEach((bar, i) => {
                const h = Math.max(20, Math.min(100, (v * 0.7) + (Math.random() * 30)));
                const col = v > 70 ? '#22c55e' : v > 40 ? '#facc15' : '#ffffff30';
                bar.style.height = h + '%';
                bar.style.background = col;
            });
        }

        // Trend Strength
        const ts = Math.floor((p + v) / 2);
        if (trendBar) { trendBar.style.width = ts + '%'; }
        if (trendStr) { trendStr.textContent = ts + '/100'; }

        // Market Context badges
        const moodBadge = document.getElementById('moodBadge');
        const moodText = document.getElementById('moodText');
        const volatilityText = document.getElementById('volatilityText');
        const liquidityText = document.getElementById('liquidityText');
        if (moodText) {
            if (s < 30) { moodText.textContent = 'BEARISH FEAR'; moodText.className = 'text-xs font-bold text-red-400'; if (moodBadge) moodBadge.className = 'flex items-center gap-2 px-4 py-2 rounded-xl border border-red-500/30 bg-red-500/10'; }
            else if (s > 70) { moodText.textContent = 'GREEDY / EUPHORIC'; moodText.className = 'text-xs font-bold text-yellow-400'; if (moodBadge) moodBadge.className = 'flex items-center gap-2 px-4 py-2 rounded-xl border border-yellow-500/30 bg-yellow-500/10'; }
            else { moodText.textContent = 'NEUTRAL'; moodText.className = 'text-xs font-bold text-green-400'; if (moodBadge) moodBadge.className = 'flex items-center gap-2 px-4 py-2 rounded-xl border border-green-500/30 bg-green-500/10'; }
        }
        if (volatilityText) volatilityText.textContent = p > 70 ? 'EXPLOSIVE' : p > 40 ? 'MODERATE' : 'CALM';
        if (liquidityText) liquidityText.textContent = v > 70 ? 'HIGH LIQUIDITY' : v > 40 ? 'MEDIUM' : 'LOW LIQUIDITY';

        let action = "WAIT", color = "text-gray-400", shadow = "", risk = "Medium", riskColor = "text-yellow-500", reason = "Market in equilibrium. Preserving capital is the priority.", bgGlow = "bg-gray-500/10";
        let rawConviction = Math.abs(50 - s) + Math.abs(50 - p) + (v / 2);
        let conviction = Math.min(Math.max(Math.floor(rawConviction), 10), 99);

        if (s < 30 && p < 40 && v > 60) {
            action = "ACCUMULATE"; color = "text-green-400"; risk = "Low"; riskColor = "text-green-500";
            reason = "High volume capitulation with extreme fear indicates smart money accumulation."; bgGlow = "bg-green-500/10"; conviction = Math.min(conviction + 15, 98);
        } else if (s > 70 && p > 70 && v < 40) {
            action = "DISTRIBUTE"; color = "text-red-500"; risk = "High"; riskColor = "text-red-500";
            reason = "Price pushing high on low volume with extreme greed. Institutional distribution phase."; bgGlow = "bg-red-500/10"; conviction += 10;
        } else if (p > 80 && v > 80) {
            action = "MOMENTUM BUY"; color = "text-neonBlue"; risk = "Medium";
            reason = "Price breaking out with heavy volume support. Trend following activated."; bgGlow = "bg-neonBlue/10";
        }

        actionOut.textContent = action;
        actionOut.className = `text-4xl font-display font-black transition-colors ${color}`;
        convBar.style.width = `${conviction}%`;
        convLevel.textContent = `${conviction}%`;
        convBar.className = `h-1 rounded transition-all duration-500 ${action === "WAIT" ? "bg-gray-500" : action === "DISTRIBUTE" ? "bg-red-500" : "bg-green-400"}`;
        rScore.textContent = risk; rScore.className = `text-xl font-bold font-mono ${riskColor}`;
        aiResp.innerHTML = `"${reason}"`;
        if (glowBox) glowBox.className = `absolute -right-10 -top-10 w-32 h-32 rounded-full blur-3xl transition-colors ${bgGlow}`;
        if (systemThought) systemThought.textContent = thoughts[action] || thoughts.WAIT;

        // Reasoning Tree
        if (reasoningTree) {
            reasoningTree.innerHTML = (aiLines[action] || aiLines.WAIT).map(l => {
                const col = l.startsWith("✅") ? "text-green-400" : l.startsWith("❌") ? "text-red-400" : "text-yellow-400";
                return `<div class="flex items-center gap-2 ${col} text-[10px] font-mono"><span>${l}</span></div>`;
            }).join("");
        }

        nodeCore.classList.remove('animate-spin-slow');
        void nodeCore.offsetWidth;
        nodeCore.classList.add('animate-spin-slow');
    };

    [sentSlider, volSlider, priceSlider].forEach(el => el && el.addEventListener('input', updateEngine));
    updateEngine();

    // Challenge The System
    const challengeBtn = document.getElementById('challengeBtn');
    const challengeResult = document.getElementById('challengeResult');
    if (challengeBtn) {
        challengeBtn.addEventListener('click', () => {
            const s = parseInt(sentSlider.value), v = parseInt(volSlider.value), p = parseInt(priceSlider.value);
            const prob = Math.floor(20 + (s / 2) - (v / 4) + (p / 3));
            const capped = Math.min(Math.max(prob, 10), 90);
            const verdict = capped < 40 ? "❌ HIGH RISK OVERRIDE" : capped < 60 ? "⚠️ MARGINAL TRADE" : "✅ ACCEPTABLE";
            if (challengeResult) {
                challengeResult.className = "w-full mt-3 p-3 border border-red-500/30 bg-red-500/10 rounded-xl text-xs text-red-300 font-mono";
                challengeResult.textContent = `${verdict} — This setup has a ${capped}% historical success rate. Professionals would NOT take this trade. System recommendation stands: system verdict is authoritative.`;
            }
        });
    }

    // --- 5. RISK SIMULATION ---
    const riskSlider = document.getElementById('riskPerTrade');
    const riskVal = document.getElementById('riskPerTradeVal');
    const chart = document.getElementById('drawdownChart');
    const ruinProbTxt = document.getElementById('ruinProb');
    const ruinIcon = document.getElementById('ruinIcon');
    const ruinIconCont = document.getElementById('ruinIconContainer');
    const shockBtn = document.getElementById('shockBtn');

    // Create 30 bars conceptually representing 30 consecutive trades
    const numBars = 30;
    for (let i = 0; i < numBars; i++) {
        const bar = document.createElement('div');
        bar.className = 'chart-bar';
        bar.style.height = '100%';
        chart.appendChild(bar);
    }

    const updateRiskSim = (shock = false) => {
        const risk = parseFloat(riskSlider.value);
        riskVal.textContent = risk.toFixed(1) + "%";

        const bars = chart.querySelectorAll('.chart-bar');
        let currentCapital = 100;
        let ruined = false;

        bars.forEach((bar, index) => {
            if (ruined) {
                bar.style.height = '0%';
                return;
            }

            // Simulate trade sequence. If shock is true, guarantee a severe losing streak
            let winProb = shock ? 0.3 : 0.6;
            let rr = 2; // Risk Reward 1:2

            if (Math.random() > winProb) {
                // Loss
                currentCapital -= (currentCapital * (risk / 100));
            } else {
                // Win
                currentCapital += (currentCapital * ((risk * rr) / 100));
            }

            // Cap UI height at 100 max visually, baseline at 0
            let visualHeight = Math.max(0, currentCapital);
            if (visualHeight > 100) visualHeight = 100;

            if (currentCapital < 20) { // Ruin threshold
                ruined = true;
                bar.classList.add('ruin');
            } else {
                bar.classList.remove('ruin');
            }

            // Stagger animation
            setTimeout(() => {
                bar.style.height = `${visualHeight}%`;
                if (shock && index < 5) bar.style.height = `${visualHeight * 0.5}%`; // Dramatic initial drop
            }, index * 20);
        });

        // Ruin Probability math simulation based on risk
        let ruinMath = (risk * risk) / 2; // mock math formula
        if (risk < 2) ruinMath = 0.01;
        if (risk > 10) ruinMath = Math.min(risk * 5, 99.9);

        ruinProbTxt.textContent = shock ? "99.9%" : ruinMath.toFixed(2) + "%";

        if (ruinMath > 20 || shock) {
            ruinProbTxt.classList.replace('text-green-400', 'text-red-500');
            ruinIcon.classList.replace('text-green-500', 'text-red-500');
            ruinIcon.className = "fa-solid fa-skull text-2xl text-red-500 transition-colors";
            ruinIconCont.classList.add('shadow-[0_0_20px_rgba(248,113,113,0.5)]');
        } else {
            ruinProbTxt.classList.replace('text-red-500', 'text-green-400');
            ruinIcon.classList.replace('text-red-500', 'text-green-500');
            ruinIcon.className = "fa-solid fa-shield text-2xl text-green-500 transition-colors";
            ruinIconCont.classList.remove('shadow-[0_0_20px_rgba(248,113,113,0.5)]');
        }
    };

    riskSlider && riskSlider.addEventListener('input', () => updateRiskSim(false));

    // Shock event
    shockBtn && shockBtn.addEventListener('click', () => {
        document.body.classList.add('market-shock');
        shockBtn.innerHTML = "<i class=\"fa-solid fa-skull mr-2\"></i>SYSTEM FAILURE";
        shockBtn.classList.replace('bg-red-500/10', 'bg-red-600');
        shockBtn.classList.add('animate-pulse');
        updateRiskSim(true);
        setTimeout(() => {
            document.body.classList.remove('market-shock');
            shockBtn.innerHTML = "<i class=\"fa-solid fa-bolt mr-2\"></i>SIMULATE MARKET CRASH";
            shockBtn.classList.replace('bg-red-600', 'bg-red-500/10');
            shockBtn.classList.remove('animate-pulse');
        }, 3000);
    });

    // Discipline Score + Account Health (driven by riskSlider)
    const updateDiscipline = () => {
        const r = riskSlider ? parseFloat(riskSlider.value) : 2;
        const disc = document.getElementById('disciplineScore');
        const discMsg = document.getElementById('disciplineMsg');
        const healthInd = document.getElementById('healthIndicator');
        const healthLabel = document.getElementById('accountHealthLabel');
        const ruinIcon = document.getElementById('ruinIcon');
        const ruinIconCont = document.getElementById('ruinIconContainer');

        const pct = ((r - 0.5) / 19.5) * 100;
        if (healthInd) healthInd.style.left = pct + '%';

        if (r <= 2) {
            if (disc) { disc.textContent = 'A+'; disc.className = 'text-3xl font-display font-bold text-green-400'; }
            if (discMsg) { discMsg.textContent = 'Professional level risk control'; discMsg.className = 'text-[10px] text-green-500 mt-1'; }
            if (healthLabel) { healthLabel.textContent = '✅ ACCOUNT SAFE'; healthLabel.className = 'ml-auto px-3 py-1.5 border border-green-500/30 bg-green-500/10 text-green-400 font-bold text-xs rounded-xl'; }
            if (ruinIcon) ruinIcon.className = 'fa-solid fa-shield text-2xl text-green-500 transition-colors';
        } else if (r <= 6) {
            if (disc) { disc.textContent = 'B'; disc.className = 'text-3xl font-display font-bold text-yellow-400'; }
            if (discMsg) { discMsg.textContent = 'Acceptable — reduce for safety'; discMsg.className = 'text-[10px] text-yellow-500 mt-1'; }
            if (healthLabel) { healthLabel.textContent = '⚠️ STRESS ZONE'; healthLabel.className = 'ml-auto px-3 py-1.5 border border-yellow-500/30 bg-yellow-500/10 text-yellow-400 font-bold text-xs rounded-xl'; }
            if (ruinIcon) ruinIcon.className = 'fa-solid fa-triangle-exclamation text-2xl text-yellow-500 transition-colors';
        } else {
            if (disc) { disc.textContent = 'F'; disc.className = 'text-3xl font-display font-bold text-red-500'; }
            if (discMsg) { discMsg.textContent = '⛔ Blowup risk is HIGH. Reduce immediately.'; discMsg.className = 'text-[10px] text-red-500 mt-1'; }
            if (healthLabel) { healthLabel.textContent = '🔴 DANGER ZONE'; healthLabel.className = 'ml-auto px-3 py-1.5 border border-red-500/30 bg-red-500/10 text-red-400 font-bold text-xs rounded-xl'; }
            if (ruinIcon) ruinIcon.className = 'fa-solid fa-skull text-2xl text-red-500 transition-colors';
        }

        // Capital After 5 losses
        let cap = 100000;
        for (let i = 0; i < 5; i++) cap -= cap * (r / 100);
        const capEl = document.getElementById('capitalAfter');
        if (capEl) capEl.textContent = '₹' + Math.floor(cap).toLocaleString('en-IN');
    };

    riskSlider && riskSlider.addEventListener('input', updateDiscipline);

    // Trade Risk Calculator
    const calcTradeRisk = () => {
        const entry = parseFloat(document.getElementById('entryPrice')?.value || 500);
        const sl = parseFloat(document.getElementById('stopLoss')?.value || 470);
        const qty = 100; // assumed quantity
        const capital = 100000;
        const risk = entry - sl;
        const rupeeRisk = risk * qty;
        const pctRisk = (risk / entry) * 100;
        const accImpact = (rupeeRisk / capital) * 100;
        const r = document.getElementById('rupeeRisk');
        const p = document.getElementById('pctRisk');
        const a = document.getElementById('accImpact');
        if (r) r.textContent = '₹' + Math.max(0, rupeeRisk).toLocaleString('en-IN');
        if (p) { p.textContent = Math.max(0, pctRisk).toFixed(1) + '%'; p.className = `text-sm font-bold font-mono ${pctRisk > 10 ? 'text-red-400' : pctRisk > 5 ? 'text-orange-400' : 'text-green-400'}`; }
        if (a) { a.textContent = '-' + Math.max(0, accImpact).toFixed(1) + '%'; a.className = `text-sm font-bold font-mono ${accImpact > 5 ? 'text-red-400' : accImpact > 2 ? 'text-yellow-400' : 'text-green-400'}`; }
    };

    document.getElementById('entryPrice')?.addEventListener('input', calcTradeRisk);
    document.getElementById('stopLoss')?.addEventListener('input', calcTradeRisk);
    calcTradeRisk();

    // Init
    setTimeout(() => { updateRiskSim(false); updateDiscipline(); }, 500);

    // --- DNA Generator Logic ---
    const dnaState = { horizon: "long", risk: "med", goal: "wealth" };
    const dnaProfiles = {
        // horizon: long + risk: low => Graham/Defensive
        "long-low-wealth": { label: "GUARDIAN", sub: "Graham + Buffett Core", icon: "fa-shield-halved", color: "#16a34a", rules: ["✅ Only buy at 30%+ Margin of Safety", "✅ No leverage ever", "⛔ Ignore all short-term news"] },
        "long-med-wealth": { label: "HYBRID", sub: "Buffett Core + Livermore Timing", icon: "fa-dna", color: "#6366f1", rules: ["✅ Compounding first, trading second", "✅ Max 20% capital in active trades", "⛔ No leveraged overnight positions"] },
        "long-high-wealth": { label: "APEX COMPOUNDER", sub: "Dalio Macro + Buffett Foundation", icon: "fa-infinity", color: "#b45309", rules: ["✅ Macro-first stock selection", "✅ Equity ownership mandatory", "⛔ No tips, no hot stocks"] },
        "short-high-trade": { label: "OPERATOR", sub: "Livermore Momentum + Soros Reflexivity", icon: "fa-bolt", color: "#06b6d4", rules: ["✅ Only trade confirmed breakouts", "✅ Max 2% risk per trade", "⛔ Never add to losing position"] },
        "short-low-trade": { label: "DEFENSIVE TRADER", sub: "Graham Filter + Lynch Signals", icon: "fa-shield", color: "#22c55e", rules: ["✅ Only high-volume stocks", "✅ Wide stop-loss buffer", "⛔ No illiquid smallcaps"] },
        "mid-med-hybrid": { label: "TACTICIAN", sub: "Lynch Ground + Munger Mental Models", icon: "fa-chess-knight", color: "#a855f7", rules: ["✅ Ground-level sector signals first", "✅ Bias-check before every trade", "⛔ No FOMO entries"] },
    };

    window.setDNA = (key, val) => {
        dnaState[key] = val;
        // Update active button
        document.querySelectorAll(`.dna-btn[data-key="${key}"]`).forEach(btn => {
            const isActive = btn.dataset.val === val;
            btn.className = btn.className.replace(/border-\S+\/\d+ |bg-\S+\/\d+ |text-\S+-\d+ /g, "");
            if (isActive) {
                btn.className += ` border-neonTeal/40 text-neonTeal bg-neonTeal/5`;
            } else {
                btn.className = `dna-btn text-[10px] py-2 border border-white/10 rounded-lg text-gray-400 hover:border-neonTeal hover:text-neonTeal transition-all`;
            }
        });
        // Pick a matching profile
        const profileKey = `${dnaState.horizon}-${dnaState.risk}-${dnaState.goal}`;
        const profile = dnaProfiles[profileKey] || dnaProfiles["long-med-wealth"];
        document.getElementById("dnaOutput").textContent = profile.label;
        document.getElementById("dnaOutput").style.backgroundImage = `linear-gradient(to right, ${profile.color}, #6366f1)`;
        document.getElementById("dnaSubtitle").textContent = profile.sub;
        document.getElementById("dnaIcon").className = `fa-solid ${profile.icon} text-3xl`;
        document.getElementById("dnaIcon").style.color = profile.color;
        document.getElementById("dnaRules").innerHTML = profile.rules.map(r =>
            `<div class="text-[10px] bg-white/5 border border-white/10 rounded px-3 py-2 text-gray-300">${r}</div>`
        ).join("");
    };

    // --- Opportunity Radar: Heatmap Grid ---
    const heatmapSectors = [
        { name: "PSU", score: 82, color: "#22c55e" },
        { name: "Defense", score: 78, color: "#22c55e" },
        { name: "IT", score: 61, color: "#facc15" },
        { name: "Banks", score: 44, color: "#facc15" },
        { name: "FMCG", score: 28, color: "#ef4444" },
        { name: "Reality", score: 55, color: "#facc15" },
        { name: "EV", score: 70, color: "#22c55e" },
        { name: "Pharma", score: 51, color: "#facc15" },
        { name: "Oil", score: 35, color: "#ef4444" },
    ];
    const heatGrid = document.getElementById("heatmapGrid");
    if (heatGrid) {
        heatGrid.innerHTML = heatmapSectors.map(s => `
            <div class="p-2 rounded-lg border border-white/5 text-center" style="background:${s.color}18; border-color:${s.color}30;">
                <p class="text-[9px] text-gray-400 font-bold uppercase">${s.name}</p>
                <p class="text-base font-display font-bold" style="color:${s.color}">${s.score}</p>
            </div>
        `).join("");
    }

    // --- Momentum Scanner: Run Scan button ---
    const scanBtn = document.getElementById("scanBtn");
    if (scanBtn) {
        const indices = [
            { name: "Nifty 50", getter: () => 60 + Math.floor(Math.random() * 30), colorFn: s => s > 70 ? "text-green-400" : s > 50 ? "text-yellow-400" : "text-red-400", statusFn: s => s > 70 ? "Bullish Trend" : s > 50 ? "Neutral" : "Weak" },
            { name: "Bank Nifty", getter: () => 30 + Math.floor(Math.random() * 50), colorFn: s => s > 70 ? "text-green-400" : s > 50 ? "text-yellow-400" : "text-red-400", statusFn: s => s > 70 ? "Momentum" : s > 50 ? "Consolidating" : "Bearish" },
            { name: "PSU Index", getter: () => 65 + Math.floor(Math.random() * 30), colorFn: s => s > 70 ? "text-green-400" : s > 50 ? "text-yellow-400" : "text-red-400", statusFn: s => s > 70 ? "Strong Breakout" : s > 50 ? "Watch" : "Fading" },
            { name: "FMCG Index", getter: () => 10 + Math.floor(Math.random() * 45), colorFn: s => s > 70 ? "text-green-400" : s > 50 ? "text-yellow-400" : "text-red-400", statusFn: s => s > 70 ? "Recovering" : s > 50 ? "Neutral" : "Weak / Avoid" },
        ];
        scanBtn.addEventListener("click", () => {
            const results = document.getElementById("scanResults");
            scanBtn.innerHTML = `<i class="fa-solid fa-spinner animate-spin mr-1"></i> SCANNING...`;
            setTimeout(() => {
                results.innerHTML = indices.map(idx => {
                    const s = idx.getter();
                    return `<div class="scan-card bg-black/40 border border-white/5 rounded-xl p-4 text-center transition-all">
                        <p class="text-[10px] text-gray-500 uppercase tracking-wider mb-1">${idx.name}</p>
                        <p class="text-xl font-display font-bold ${idx.colorFn(s)}">${s}</p>
                        <p class="text-[10px] ${idx.colorFn(s)}">${idx.statusFn(s)}</p>
                    </div>`;
                }).join("");
                scanBtn.innerHTML = `<i class="fa-solid fa-bolt mr-1"></i> RUN SCAN`;
            }, 900);
        });
    }

});

