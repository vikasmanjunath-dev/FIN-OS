// FIN-OS Simulator Guide Interactive Script
document.addEventListener("DOMContentLoaded", () => {
    initThreeJSBG();
    renderDynamicSections();
    initScrollSpy();
});

// ─── THREE.JS BACKGROUND ──────────────────────────────────────────
function initThreeJSBG() {
    const canvas = document.getElementById('bgCanvas');
    if (!canvas || typeof THREE === 'undefined') return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const particlesGeometry = new THREE.BufferGeometry();
    const particlesCount = 300;
    const posArray = new Float32Array(particlesCount * 3);

    for (let i = 0; i < particlesCount * 3; i++) {
        posArray[i] = (Math.random() - 0.5) * 15;
    }

    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    const material = new THREE.PointsMaterial({
        size: 0.02,
        color: 0x3b82f6,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending
    });

    const particlesMesh = new THREE.Points(particlesGeometry, material);
    scene.add(particlesMesh);
    camera.position.z = 3;

    let mouseX = 0;
    let mouseY = 0;
    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX / window.innerWidth - 0.5;
        mouseY = e.clientY / window.innerHeight - 0.5;
    });

    const clock = new THREE.Clock();
    function animate() {
        requestAnimationFrame(animate);
        const elapsedTime = clock.getElapsedTime();
        particlesMesh.rotation.y = mouseX * 0.5 + elapsedTime * 0.05;
        particlesMesh.rotation.x = mouseY * 0.5;
        renderer.render(scene, camera);
    }
    animate();

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

// ─── DYNAMIC SECTION CONTENT ───
const SECTIONS = [
    {
        id: "story",
        icon: "fa-bolt",
        title: "Live Story",
        subtitle: "The Market Narrative",
        desc: "Markets move because of news and sentiment. The Live Story translates boring data into a breathing narrative.",
        cards: [
            {
                title: "Context Example",
                badge: "REALITY CHECK",
                badgeColor: "blue",
                content: `<div class="bg-black/50 p-3 rounded font-mono text-xs text-gray-300 italic mb-3">
                            "📢 Today: Reliance reacting to GDP data. Smart money is watching ₹2820."
                         </div>
                         <p class="text-[11px] text-gray-400"><strong>Why this teaches:</strong> GDP strong → economy strong → stocks go up. It connects real-world events to chart movements.</p>`
            }
        ]
    },
    {
        id: "xp",
        icon: "fa-gamepad",
        title: "Learning Progression",
        subtitle: "Level Up Your Mindset",
        desc: "Trading is a skill, and skill requires tracking. We gamified discipline.",
        cards: [
            {
                title: "Curious Beginner to Maestro",
                badge: "LVL SYSTEM",
                badgeColor: "purple",
                content: `<ul class="space-y-2 text-xs text-gray-400">
                    <li class="flex items-center gap-2"><i class="fa-solid fa-star text-kgold"></i> <strong>XP (Experience Points):</strong> Earned for smart actions (Stop Loss). Lost for gambling.</li>
                    <li class="flex items-center gap-2"><i class="fa-solid fa-brain text-purple-400 text-sm"></i> <strong>Discipline Score:</strong> A hard metric of how coldly logical you are acting.</li>
                    <li class="flex items-center gap-2"><i class="fa-solid fa-fire text-orange-500"></i> <strong>Streak:</strong> Days traded without breaking rules.</li>
                </ul>`
            }
        ]
    },
    {
        id: "guide",
        icon: "fa-map",
        title: "First Trade Guide",
        subtitle: "Step-by-step System",
        desc: "A forced training pipeline to prevent random clicking = losses.",
        cards: [
            {
                title: "The 6-Step Pipeline",
                badge: "STRICT",
                badgeColor: "red",
                content: `<div class="flex flex-wrap gap-2 text-[10px] uppercase font-bold tracking-wider">
                            <span class="bg-[#ffffff10] px-2 py-1 rounded text-gray-300">1. Press Play</span> <i class="fa-solid fa-arrow-right text-gray-600 self-center"></i>
                            <span class="bg-[#ffffff10] px-2 py-1 rounded text-gray-300">2. Watch candles</span> <i class="fa-solid fa-arrow-right text-gray-600 self-center"></i>
                            <span class="bg-[#ffffff10] px-2 py-1 rounded text-gray-300">3. Select Strategy</span> <i class="fa-solid fa-arrow-right text-gray-600 self-center"></i>
                            <span class="bg-blue-500/20 text-blue-400 px-2 py-1 rounded">4. Set Stop Loss</span> <i class="fa-solid fa-arrow-right text-gray-600 self-center"></i>
                            <span class="bg-[#ffffff10] px-2 py-1 rounded text-gray-300">5. Place Order</span> <i class="fa-solid fa-arrow-right text-gray-600 self-center"></i>
                            <span class="bg-[#ffffff10] px-2 py-1 rounded text-gray-300">6. Watch & Exit</span>
                         </div>`
            }
        ]
    },
    {
        id: "mission",
        icon: "fa-trophy",
        title: "Today's Mission",
        subtitle: "Targeted Goals",
        desc: "Builds habit. Forces discipline. Makes learning addictive.",
        cards: [
            {
                title: "Example Mission",
                badge: "+30 XP",
                badgeColor: "green",
                content: `<div class="bg-black/50 p-3 rounded flex items-center gap-3">
                            <i class="fa-solid fa-crosshairs text-kgreen text-xl"></i>
                            <div>
                                <p class="text-sm font-bold text-white mb-1">Place 1 trade with a Stop Loss set</p>
                                <div class="w-full bg-[#ffffff10] h-1.5 rounded-full overflow-hidden"><div class="bg-kgreen w-1/2 h-full"></div></div>
                            </div>
                         </div>`
            }
        ]
    },
    {
        id: "watchlist",
        icon: "fa-list",
        title: "Watchlist & Heatmap",
        subtitle: "Focus Your View",
        desc: "You don't trade everything. You focus on selected stocks based on Sector Heat.",
        cards: [
            {
                title: "Sector Heatmap",
                badge: "MACRO",
                badgeColor: "blue",
                content: `<p class="text-xs text-gray-400 mb-3">If BANKING is green → prefer HDFC, ICICI over weak sectors.</p>
                          <div class="flex gap-2">
                             <span class="bg-kgreen/20 text-kgreen border border-kgreen/30 px-3 py-1 rounded font-bold text-xs">IT</span>
                             <span class="bg-kgreen/20 text-kgreen border border-kgreen/30 px-3 py-1 rounded font-bold text-xs">BANKING</span>
                             <span class="bg-kred/20 text-kred border border-kred/30 px-3 py-1 rounded font-bold text-xs">FMCG</span>
                          </div>`
            }
        ]
    },
    {
        id: "chart",
        icon: "fa-chart-candlestick",
        title: "Main Chart",
        subtitle: "Where Real Trading Happens",
        desc: "The visual heartbeat of the market composed of Timeframes, Candles, and Volume.",
        cards: [
            {
                title: "The Anatomy of a Candle",
                badge: "CORE",
                badgeColor: "gold",
                content: `<div class="flex justify-around items-center bg-black/30 p-4 rounded-xl border border-[#ffffff0a]">
                            <div class="text-center">
                                <div class="h-20 candle-demo candle-green"><div class="body top-4 bottom-2 h-10 w-full"></div></div>
                                <p class="text-[10px] font-bold text-kgreen mt-2 uppercase">Price Rose</p>
                            </div>
                            <div class="text-[10px] text-gray-400 w-32 list-disc ml-4 space-y-1">
                                <li><strong>Body:</strong> Open to Close</li>
                                <li><strong>Wick:</strong> High / Low</li>
                            </div>
                            <div class="text-center">
                                <div class="h-20 candle-demo candle-red"><div class="body top-6 bottom-4 h-8 w-full"></div></div>
                                <p class="text-[10px] font-bold text-kred mt-2 uppercase">Price Fell</p>
                            </div>
                         </div>`
            },
            {
                title: "Timeframes & Volume",
                badge: "CRITICAL",
                badgeColor: "purple",
                content: `<p class="text-[11px] text-gray-400 mb-2">Beginners should start with <strong class="text-white">5m</strong> or <strong class="text-white">15m</strong> charts. 1m is too fast and noisy.</p>
                          <p class="text-[11px] text-gray-400"><strong class="text-white">Volume Bars</strong> show participation. High volume = strong move. Low volume = weak move.</p>`
            }
        ]
    },
    {
        id: "insight",
        icon: "fa-brain",
        title: "Strategy Insight",
        subtitle: "The AI Copilot",
        desc: "Highlights the key levels you need to watch so you aren't flying blind.",
        cards: [
            {
                title: "Live Zone Detection",
                badge: "PRO TOOL",
                badgeColor: "blue",
                content: `<div class="bg-blue-500/10 border border-blue-500/20 p-3 rounded mb-2">
                             <p class="text-xs text-blue-300 font-mono">Opening Range: ₹2820–₹2840</p>
                          </div>
                          <ul class="text-[11px] text-gray-400 space-y-1">
                              <li><span class="text-kgreen font-bold">Rule:</span> Above range → Bullish</li>
                              <li><span class="text-kred font-bold">Rule:</span> Below range → Bearish</li>
                          </ul>`
            }
        ]
    },
    {
        id: "order",
        icon: "fa-money-bill-transfer",
        title: "Order Panel",
        subtitle: "Where Trades Happen",
        desc: "Selecting how and when you enter the market. Every input carries massive risk.",
        cards: [
            {
                title: "Product & Order Types",
                badge: "EXECUTION",
                badgeColor: "gold",
                content: `<div class="grid grid-cols-2 gap-4 text-[11px]">
                             <div>
                                <p class="font-bold text-white mb-1"><i class="fa-solid fa-clock text-kgold"></i> Product (MIS/CNC)</p>
                                <p class="text-gray-400">Beginners use <strong class="text-white">MIS (Intraday)</strong>. CNC is for holding long term.</p>
                             </div>
                             <div>
                                <p class="font-bold text-white mb-1"><i class="fa-solid fa-tag text-kblue"></i> Type (MKT/LMT)</p>
                                <p class="text-gray-400"><strong class="text-white">Market:</strong> Instant buy. <strong class="text-white">Limit:</strong> Wait for your price.</p>
                             </div>
                          </div>`
            },
            {
                title: "STOP LOSS",
                badge: "ACCOUNT SAVER",
                badgeColor: "red",
                content: `<div class="bg-red-500/10 border border-red-500/30 p-3 rounded flex items-center gap-3">
                             <i class="fa-solid fa-triangle-exclamation text-kred text-2xl"></i>
                             <p class="text-xs text-red-200">Price where trade exits if you are wrong. <strong class="text-white">Rule: NO STOP LOSS = ACCOUNT BLOWN OUT.</strong></p>
                          </div>`
            }
        ]
    },
    {
        id: "analytics",
        icon: "fa-clipboard-list",
        title: "Trade Analytics",
        subtitle: "The Autopsy Bay",
        desc: "This is where pros actually improve. Bottom panel tabs store your history and mistakes.",
        cards: [
            {
                title: "Analytics Hub",
                badge: "FEEDBACK",
                badgeColor: "purple",
                content: `<div class="flex flex-wrap gap-2 text-xs">
                             <span class="bg-[#ffffff10] px-2 py-1 rounded"><strong class="text-white">Orders:</strong> Trades placed</span>
                             <span class="bg-[#ffffff10] px-2 py-1 rounded"><strong class="text-white">Positions:</strong> Active trades</span>
                             <span class="bg-[#ffffff10] px-2 py-1 rounded"><strong class="text-white">Journal:</strong> Trade notes</span>
                             <span class="bg-[#ffffff10] px-2 py-1 rounded"><strong class="text-white">Mistakes:</strong> Errors</span>
                             <span class="bg-[#ffffff10] px-2 py-1 rounded"><strong class="text-white">Insights:</strong> AI lessons</span>
                          </div>`
            }
        ]
    },
    {
        id: "risk",
        icon: "fa-shield-cat",
        title: "Risk & Summary",
        subtitle: "Putting It All Together",
        desc: "Risk Meter calculates dynamically based on your Stop Loss distance and Size.",
        cards: [
            {
                title: "The Ultimate Flow",
                badge: "THE SYSTEM",
                badgeColor: "gold",
                content: `<div class="bg-[#ffffff05] p-4 rounded-xl border border-[#ffffff10]">
                             <p class="text-[11px] text-gray-300 font-mono leading-relaxed">
                                <span class="text-kblue">1.</span> Watch chart 📉 &nbsp;➔&nbsp; 
                                <span class="text-kblue">2.</span> Identify strategy 📊 <br>
                                <span class="text-kblue">3.</span> Confirm volume 📊 &nbsp;➔&nbsp; 
                                <span class="text-kblue">4.</span> Place trade 💰 <br>
                                <span class="text-kblue">5.</span> Set stop loss 🚨 &nbsp;➔&nbsp; 
                                <span class="text-kblue">6.</span> Manage trade 🎯 <br>
                                <span class="text-kblue">7.</span> Review performance 📘
                             </p>
                          </div>`
            }
        ]
    }
];

function renderDynamicSections() {
    const container = document.getElementById('dynamic-sections-container');
    if (!container) return;

    let html = '';

    // Map badge colors
    const colors = {
        blue: { bg: 'bg-kblue/10', text: 'text-kblue', border: 'border-kblue/20' },
        green: { bg: 'bg-kgreen/10', text: 'text-kgreen', border: 'border-kgreen/20' },
        red: { bg: 'bg-kred/10', text: 'text-kred', border: 'border-kred/20' },
        purple: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20' },
        gold: { bg: 'bg-kgold/10', text: 'text-kgold', border: 'border-kgold/20' },
    };

    SECTIONS.forEach((sec, idx) => {
        let cardsHtml = '';
        sec.cards.forEach(card => {
            const bc = colors[card.badgeColor] || colors.blue;
            cardsHtml += `
                <div class="anim-card bg-kpanel border border-kborder p-5 rounded-2xl">
                    <div class="flex items-center justify-between mb-3">
                        <h4 class="text-white font-bold text-sm">
                            ${card.title}
                        </h4>
                        <span class="${bc.bg} ${bc.text} ${bc.border} border text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full">
                            ${card.badge}
                        </span>
                    </div>
                    ${card.content}
                </div>
            `;
        });

        html += `
            <section id="section-${sec.id}" class="mb-40 guide-section">
                <div class="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
                    <div class="lg:col-span-4 space-y-4">
                        <div class="inline-flex flex-col gap-1 px-4 py-3 bg-[#ffffff03] border border-[#ffffff08] rounded-2xl mb-2">
                            <i class="fa-solid ${sec.icon} text-3xl text-gray-500 mb-2"></i>
                            <span class="text-[9px] text-gray-400 uppercase tracking-widest font-bold">Module ${idx + 2}</span>
                        </div>
                        <h2 class="text-4xl font-display font-bold text-white leading-tight">${sec.title}</h2>
                        <h3 class="text-md text-kgold uppercase tracking-widest font-bold">${sec.subtitle}</h3>
                        <p class="text-sm text-gray-400 leading-relaxed pt-2">${sec.desc}</p>
                    </div>
                    <div class="lg:col-span-8">
                        <div class="grid sm:grid-cols-2 gap-4">
                            ${cardsHtml}
                        </div>
                    </div>
                </div>
            </section>
        `;
    });

    container.innerHTML = html;
}

// ─── SCROLL SPY & REVEAL ANIMATIONS ───────────────────────────────
function initScrollSpy() {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
    gsap.registerPlugin(ScrollTrigger);

    const sections = document.querySelectorAll('.guide-section');
    const navLinks = document.querySelectorAll('.nav-link');
    const scrollContainer = document.getElementById('mainScroll');

    sections.forEach(sec => {
        // Fade in reveal
        ScrollTrigger.create({
            trigger: sec,
            scroller: scrollContainer,
            start: "top 80%",
            onEnter: () => sec.classList.add('visible'),
            once: true
        });

        // Sync sidebar active state
        ScrollTrigger.create({
            trigger: sec,
            scroller: scrollContainer,
            start: "top center",
            end: "bottom center",
            onToggle: (self) => {
                if (self.isActive) {
                    const id = sec.id.replace('section-', '');
                    navLinks.forEach(link => {
                        link.classList.remove('active');
                        if (link.dataset.target === id) {
                            link.classList.add('active');
                            // Ensure it is visible in sidebar
                            link.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        }
                    });
                }
            }
        });
    });

    // Smooth scroll for nav clicks
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = 'section-' + link.dataset.target;
            const targetEl = document.getElementById(targetId);
            if (targetEl) {
                targetEl.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
}
