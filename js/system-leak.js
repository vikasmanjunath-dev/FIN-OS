/* ============================================================
   FIN-OS PROTOCOL 0X: THE INVESTIGATIVE ENGINE
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {

    // --- 1. THE INFLATION GAP SCAN ---
    const inflationCtx = document.getElementById('inflationGapChart').getContext('2d');
    const redGradient = inflationCtx.createLinearGradient(0, 0, 0, 400);
    redGradient.addColorStop(0, 'rgba(255, 71, 87, 0.4)');
    redGradient.addColorStop(1, 'rgba(255, 71, 87, 0)');

    new Chart(inflationCtx, {
        type: 'line',
        data: {
            labels: ['2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026'],
            datasets: [{
                label: 'Real Desi Inflation (9%)',
                data: [100, 109, 119, 130, 142, 155, 169, 185],
                borderColor: '#ff4757',
                borderWidth: 4,
                backgroundColor: redGradient,
                fill: true,
                tension: 0.4,
                pointRadius: 0
            }, {
                label: 'Official CPI (5.5%)',
                data: [100, 105, 111, 117, 123, 130, 137, 145],
                borderColor: '#4F7CFF',
                borderDash: [10, 5],
                borderWidth: 2,
                fill: false,
                tension: 0.4,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', labels: { color: '#888', font: { family: 'JetBrains Mono' } } }
            },
            scales: {
                y: { display: false },
                x: { grid: { display: false }, ticks: { color: '#555', font: { family: 'JetBrains Mono' } } }
            }
        }
    });

    // --- 2. THE WEDDING COST VS INCOME CHART ---
    const weddingCtx = document.getElementById('weddingCostChart').getContext('2d');
    new Chart(weddingCtx, {
        type: 'bar',
        data: {
            labels: ['2000', '2026'],
            datasets: [{
                label: 'Wedding Cost (Lakhs)',
                data: [4, 25],
                backgroundColor: '#ff4757',
                borderRadius: 12
            }, {
                label: 'Avg Annual Income (Lakhs)',
                data: [1.2, 7.5], 
                backgroundColor: '#4F7CFF',
                borderRadius: 12
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { labels: { color: '#888', font: { family: 'JetBrains Mono' } } } },
            scales: {
                y: { display: false },
                x: { grid: { display: false }, ticks: { color: '#555' } }
            }
        }
    });

    // --- 3. THE 3D SCROLL & GAUGE OBSERVER ---
    const forensicObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('reveal-active');
                
                // Trigger leak meter animation
                const meter = entry.target.querySelector('.leak-fill');
                if (meter) {
                    const level = meter.parentElement.getAttribute('data-level') || meter.dataset.level || '85%';
                    meter.style.width = level;
                }

                // Screen shake on high-risk protocols
                if (entry.target.id === 'housing-audit' || entry.target.id === 'credit-audit') {
                    document.body.classList.add('system-alert');
                    setTimeout(() => document.body.classList.remove('system-alert'), 500);
                }
            }
        });
    }, { threshold: 0.25 });

    document.querySelectorAll('.leak-section').forEach(section => {
        forensicObserver.observe(section);
    });

    // --- 4. THE LIVE WEALTH DRAIN (Holographic Ticker) ---
    let totalLeakValue = 0;
    const tickerValue = document.querySelector('.value.high');
    
    setInterval(() => {
        // Average Indian household loses ~₹14,000/day to inflation/lifestyle
        // 14000 / 86400 sec ≈ 0.16 per second
        totalLeakValue += 0.16; 
        if (tickerValue) {
            tickerValue.innerText = `₹${totalLeakValue.toFixed(2)} DRAINED`;
        }
    }, 1000);

});



/* ============================================================
   FIX: FORENSIC TRIGGER ENGINE
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
    
    // 1. REVEAL OBSERVER: Forces cards to appear as you scroll
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Add classes used by our CSS fix
                entry.target.classList.add('reveal-active');
                entry.target.classList.add('terminal-active');

                // Animate the internal leak-fill meters
                const meter = entry.target.querySelector('.leak-fill');
                if (meter) {
                    const level = meter.getAttribute('data-level') || '75%';
                    meter.style.width = level;
                }

                // Shake effect for critical debt protocols
                if (entry.target.id === 'housing-audit' || entry.target.id === 'credit-audit') {
                    document.body.classList.add('system-alert');
                    setTimeout(() => document.body.classList.remove('system-alert'), 400);
                }
            }
        });
    }, { threshold: 0.15 });

    // Apply observer to every section
    document.querySelectorAll('.leak-section').forEach(section => {
        revealObserver.observe(section);
    });

    // 2. RENDER FORENSIC CHARTS (Ensure Chart.js is loaded)
    const renderCharts = () => {
        const infCanvas = document.getElementById('inflationGapChart');
        if (infCanvas) {
            new Chart(infCanvas.getContext('2d'), {
                type: 'line',
                data: {
                    labels: ['2019', '2021', '2023', '2025', '2026'],
                    datasets: [{
                        label: 'Real Desi Inflation (9%)',
                        data: [100, 118, 141, 168, 185],
                        borderColor: '#ff4757',
                        fill: true,
                        backgroundColor: 'rgba(255, 71, 87, 0.05)',
                        tension: 0.4
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }
    };

    renderCharts();
});


/* ============================================================
   PROTOCOL 03: REFINED INTERACTION LOGIC
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {

    const protocol03 = document.getElementById('protocol-03');
    
    if (protocol03) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    // 1. Activate the section styling
                    entry.target.classList.add('reveal-active');

                    // 2. Animate the Debt Penetration Meter
                    const meter = entry.target.querySelector('.leak-fill');
                    if (meter) {
                        // Force a redraw for smooth animation
                        meter.style.width = '0%';
                        setTimeout(() => {
                            meter.style.width = meter.getAttribute('data-level');
                        }, 100);
                    }

                    // 3. Trigger Hologram Pulse Effect
                    const rings = entry.target.querySelectorAll('.hologram-ring-assembly div');
                    rings.forEach(ring => {
                        ring.style.opacity = '0.8';
                        ring.style.boxShadow = '0 0 30px rgba(79, 124, 255, 0.3)';
                        // Reset after pulse
                        setTimeout(() => {
                             ring.style.opacity = '';
                             ring.style.boxShadow = '';
                        }, 2000);
                    });
                }
            });
        }, { threshold: 0.3 });

        observer.observe(protocol03);
    }
});


/* ============================================================
   PROTOCOL 05: UPI SINKHOLE VELOCITY ENGINE
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
    const protocol05 = document.getElementById('protocol-05');
    const dotField = document.getElementById('upi-dot-field');
    const leakCounter = document.getElementById('live-leak-counter');
    let totalLeak = 0;

    if (protocol05) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !entry.target.dataset.active) {
                    entry.target.dataset.active = "true";
                    entry.target.classList.add('reveal-active');
                    startUpiSimulation();
                }
            });
        }, { threshold: 0.4 });

        observer.observe(protocol05);
    }

    function startUpiSimulation() {
        const amounts = [120, 180, 90, 250, 60, 450, 110];
        let count = 0;

        const interval = setInterval(() => {
            if (count >= 40) { // Simulate 40 transactions
                clearInterval(interval);
                return;
            }

            // 1. Create Random Transaction Dot
            const amount = amounts[Math.floor(Math.random() * amounts.length)];
            createTransactionDot(amount);

            // 2. Update Central Counter
            totalLeak += amount;
            leakCounter.innerText = `₹${totalLeak.toLocaleString()}`;
            
            count++;
        }, 150);
    }

    function createTransactionDot(val) {
        const dot = document.createElement('div');
        dot.className = 'transaction-dot';
        
        // Random Position in Radar
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 200;
        const x = 250 + Math.cos(angle) * dist;
        const y = 250 + Math.sin(angle) * dist;

        dot.style.left = `${x}px`;
        dot.style.top = `${y}px`;
        dot.innerHTML = `<span class="dot-val">₹${val}</span>`;
        
        dotField.appendChild(dot);
        
        // Remove after animation
        setTimeout(() => dot.remove(), 2000);
    }
});

/* ============================================================
   PROTOCOL 05: REFINED PARTICLE ENGINE
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
    const stage = document.getElementById('sinkholeStage');
    const counter = document.getElementById('live-leak-counter');
    const protocolSection = document.getElementById('protocol-05');
    
    let totalLeak = 0;
    let particleInterval;

    // A list of common micro-expenses
    const expenses = [
        { name: "Chai", cost: 120 }, { name: "Auto", cost: 90 },
        { name: "Zomato", cost: 450 }, { name: "Netflix", cost: 199 },
        { name: "Cigarette", cost: 180 }, { name: "Starbucks", cost: 350 },
        { name: "Zepto", cost: 240 }, { name: "Uber", cost: 310 },
        { name: "Swiggy", cost: 280 }, { name: "Blinkit", cost: 150 },
        { name: "Dunzo", cost: 110 }, { name: "Rapido", cost: 75 }
    ];

    if (protocolSection && stage && counter) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    // Activate section animations
                    entry.target.classList.add('reveal-active');

                    // Animate the leak meter in the bottom panel
                    const meter = entry.target.querySelector('.leak-fill');
                    if(meter) meter.style.width = meter.getAttribute('data-level');

                    // Start generating particles if not already running
                    if (!particleInterval) {
                        // Spawn a new particle every 600ms
                        particleInterval = setInterval(spawnExpense, 600);
                    }
                } else {
                     // Optional: Stop the engine when out of view to save performance
                     if (particleInterval) {
                         clearInterval(particleInterval);
                         particleInterval = null;
                     }
                }
            });
        }, { threshold: 0.3 });

        observer.observe(protocolSection);
    }


    function spawnExpense() {
        // 1. Create the particle element
        const item = expenses[Math.floor(Math.random() * expenses.length)];
        const particle = document.createElement('div');
        particle.className = 'expense-particle';
        particle.innerHTML = `${item.name} <span>₹${item.cost}</span>`;
        stage.appendChild(particle);

        // 2. CALCULATE SPAWN POSITION (just outside the stage)
        const stageRect = stage.getBoundingClientRect();
        const side = Math.floor(Math.random() * 4); // 0: top, 1: right, 2: bottom, 3: left
        const padding = 60; // Distance outside the stage
        let startX, startY;

        if (side === 0) { // Top
            startX = Math.random() * stageRect.width; startY = -padding;
        } else if (side === 1) { // Right
            startX = stageRect.width + padding; startY = Math.random() * stageRect.height;
        } else if (side === 2) { // Bottom
            startX = Math.random() * stageRect.width; startY = stageRect.height + padding;
        } else { // Left
            startX = -padding; startY = Math.random() * stageRect.height;
        }

        particle.style.left = `${startX}px`;
        particle.style.top = `${startY}px`;

        // 3. CALCULATE DESTINATION (Center of the stage)
        const centerX = stageRect.width / 2;
        const centerY = stageRect.height / 2;
        const dx = centerX - startX;
        const dy = centerY - startY;
        
        // Add a random rotation for a more dynamic effect
        const randomRotate = Math.random() * 60 - 30;

        // 4. ANIMATE
        // Force a reflow to ensure the starting position is applied
        particle.getBoundingClientRect();

        // Translate to center, scale down, and rotate
        particle.style.transform = `translate(${dx}px, ${dy}px) scale(0.2) rotate(${randomRotate}deg)`;
        particle.style.opacity = '0';
        
        // 5. UPDATE COUNTER & CLEANUP
        setTimeout(() => {
            totalLeak += item.cost;
            // Format with Indian numbering system (e.g., 1,20,000)
            counter.innerText = `₹${totalLeak.toLocaleString('en-IN')}`;
            // Update glitch text attribute for the effect
            counter.setAttribute('data-text', counter.innerText);
            particle.remove();
        }, 1200); // Match CSS transition duration
    }
});


/* ============================================================
   PROTOCOL 06: REFINED STRESS LOGIC
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
    const p06 = document.getElementById('protocol-06');
    const riskFill = document.getElementById('riskFill');
    const house = document.getElementById('anchorHouse');
    const field = document.getElementById('careerPathField');

    const paths = ["STARTUP IDEA", "CAREER SWITCH", "SABBATICAL", "RISKY BET"];

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !entry.target.dataset.active) {
                entry.target.dataset.active = "true";
                runGravityAudit();
            }
        });
    }, { threshold: 0.4 });

    observer.observe(p06);

    function runGravityAudit() {
        // 1. House grows heavier
        house.style.transform = 'rotateX(-20deg) rotateY(45deg) scale(1.6)';
        house.style.boxShadow = '0 0 80px rgba(255, 71, 87, 0.6)';

        // 2. Spawn Career Paths and suck them in
        paths.forEach((p, i) => {
            const node = document.createElement('div');
            node.className = 'career-node';
            node.innerText = p;
            node.style.top = `${Math.random() * 100}%`;
            node.style.left = `${Math.random() * 100}%`;
            field.appendChild(node);

            setTimeout(() => {
                node.style.transform = `translate(${150 - (i*20)}px, ${150 - (i*20)}px) scale(0)`;
                node.style.opacity = '0';
            }, 500 + (i * 300));
        });

        // 3. Freedom bar crashes
        setTimeout(() => {
            riskFill.style.width = '0%';
            document.body.classList.add('system-alert');
            setTimeout(() => document.body.classList.remove('system-alert'), 500);
        }, 2000);
    }
});


document.addEventListener("DOMContentLoaded", () => {
    
    // 1. REFINED PARTICLE ENGINE (PROTOCOL 05)
    const stage = document.getElementById('sinkholeStage');
    const counter = document.getElementById('live-leak-counter');
    let totalLeak = 0;

    const expenses = [
        { name: "Zomato", cost: 450 }, { name: "Netflix", cost: 199 },
        { name: "Chai", cost: 40 }, { name: "Auto", cost: 120 },
        { name: "Zepto", cost: 320 }, { name: "Starbucks", cost: 480 },
        { name: "Cigarettes", cost: 180 }, { name: "Uber", cost: 250 }
    ];

    function spawnExpense() {
        if(!stage) return;
        const item = expenses[Math.floor(Math.random() * expenses.length)];
        const particle = document.createElement('div');
        particle.className = 'expense-particle';
        particle.innerHTML = `${item.name} <span>₹${item.cost}</span>`;
        stage.appendChild(particle);

        // Random Start Position (Everywhere outside center)
        const angle = Math.random() * Math.PI * 2;
        const radius = 300; 
        const startX = Math.cos(angle) * radius;
        const startY = Math.sin(angle) * radius;

        particle.style.transform = `translate(${startX}px, ${startY}px)`;
        
        // Trigger Motion to Center
        requestAnimationFrame(() => {
            setTimeout(() => {
                particle.style.transition = "all 1.5s cubic-bezier(0.25, 0.1, 0.25, 1)";
                particle.style.transform = `translate(0, 0) scale(0.2)`;
                particle.style.opacity = "0";
            }, 50);
        });

        // Cleanup & Counter Update
        setTimeout(() => {
            totalLeak += item.cost;
            if(counter) counter.innerText = `₹${totalLeak.toLocaleString()}`;
            particle.remove();
        }, 1550);
    }

    // Initialize with IntersectionObserver
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                if (entry.target.id === 'protocol-05') {
                    setInterval(spawnExpense, 700);
                }
            }
        });
    }, { threshold: 0.3 });

    document.querySelectorAll('.leak-section').forEach(s => observer.observe(s));
});


/* ============================================================
   PROTOCOL 08: THE TRAPDOOR ENGINE
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
    const p08 = document.getElementById('protocol-08');
    const sprayContainer = document.getElementById('interestSpray');
    const timeVal = document.getElementById('timePenalty');

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !entry.target.dataset.active) {
                entry.target.dataset.active = "true";
                runTrapdoorAudit();
            }
        });
    }, { threshold: 0.4 });

    if (p08) observer.observe(p08);

    function runTrapdoorAudit() {
        // 1. Particle Spray (The Compounding Leak)
        const interval = setInterval(() => {
            if (sprayContainer.childElementCount > 40) return;
            const p = document.createElement('div');
            p.className = 'interest-particle';
            const angle = Math.random() * Math.PI * 2;
            const dist = 150;
            p.style.setProperty('--tx', `${Math.cos(angle) * dist}px`);
            p.style.setProperty('--ty', `${Math.sin(angle) * dist}px`);
            sprayContainer.appendChild(p);
            setTimeout(() => p.remove(), 1500);
        }, 80);

        // 2. Repayment Time Escalation
        let years = 0;
        const timeCounter = setInterval(() => {
            years += 1;
            timeVal.innerText = `${years} YEARS`;
            if (years >= 8) clearInterval(timeCounter); //
        }, 200);

        // 3. System Shake (Critical Alert)
        setTimeout(() => {
            document.body.classList.add('system-alert');
            setTimeout(() => document.body.classList.remove('system-alert'), 500);
        }, 1000);
    }
});


/* ============================================================
   RADAR ENGINE: ACTIVE DETECTION LOGIC
   ============================================================ */

let leakTotal = 0;
const transactions = [
    { name: "Chai Scan", cost: 120, x: 30, y: 25, angle: 310 },
    { name: "Zomato Impulse", cost: 680, x: 65, y: 55, angle: 45 },
    { name: "Auto UPI", cost: 90, x: 40, y: 75, angle: 160 },
    { name: "Subscription Leak", cost: 499, x: 80, y: 20, angle: 25 }
];

function startForensicScan() {
    const blipField = document.getElementById('radar-blip-field');
    const ticker = document.getElementById('ticker-stream');
    const status = document.getElementById('scan-status');
    
    status.innerText = "ACTIVE_DEEP_SCAN...";
    status.style.color = "#C7F000";

    // Inject Blips
    transactions.forEach(t => {
        const dot = document.createElement('div');
        dot.className = 'blip';
        dot.style.left = t.x + '%';
        dot.style.top = t.y + '%';
        dot.id = `blip-${t.angle}`;
        blipField.appendChild(dot);
    });

    // Detect Angle for Ping
    let rotation = 0;
    setInterval(() => {
        rotation = (rotation + 1.5) % 360; // Match CSS animation speed
        
        transactions.forEach(t => {
            // If scan line is near the transaction's angle
            if (Math.abs(rotation - t.angle) < 2) {
                const targetBlip = document.getElementById(`blip-${t.angle}`);
                if (targetBlip && !targetBlip.classList.contains('detected')) {
                    triggerPing(t, targetBlip);
                }
            }
        });
        
        // Reset blips on full rotation to allow repeat scanning
        if (rotation < 1) {
            document.querySelectorAll('.blip').forEach(b => b.classList.remove('detected'));
        }
    }, 16);
}

function triggerPing(data, element) {
    element.classList.add('detected');
    
    // Update Ticker
    const ticker = document.getElementById('ticker-stream');
    const entry = document.createElement('div');
    entry.className = 'ticker-entry';
    entry.innerText = `[DETECTED] ${data.name}: +₹${data.cost}`;
    ticker.appendChild(entry);
    
    // Update Total
    leakTotal += data.cost;
    document.getElementById('radar-total-leak').innerText = `₹${leakTotal.toLocaleString()}`;
}



