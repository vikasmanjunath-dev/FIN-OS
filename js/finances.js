document.addEventListener("DOMContentLoaded", async () => {
    
    // ========================================================
    // 1. DATA DEFINITIONS (MUST BE AT THE TOP)
    // ========================================================
    const sectors = [
        // --- SECTOR 1: INCOME ---
        { id: 'income', title: "INCOME REALITY", inputs: [
            { id: 'salary', label: "Monthly Fixed Salary (In-Hand)", type: "number", hint: "Post-tax only. What hits the bank." },
            { id: 'variable', label: "Variable Income (Freelance/Biz)", type: "number", hint: "Average of last 6 months." },
            { id: 'bonus', label: "Annual Bonus (Monthly Avg)", type: "number", hint: "Divide yearly bonus by 12." },
            { id: 'rental', label: "Rental / Dividend Income", type: "number", hint: "Passive cashflow only." }
        ]},
        // --- SECTOR 2: FIXED NEEDS ---
        { id: 'fixed', title: "FIXED COMMITMENTS (NEEDS)", inputs: [
            { id: 'rent', label: "Rent / Home Loan EMI", type: "number", hint: "Your biggest shelter cost." },
            { id: 'utilities', label: "Bills (Electricity, Wifi, Gas)", type: "number", hint: "The cost of running your home." },
            { id: 'insurance', label: "Insurance (Life + Health)", type: "number", hint: "Monthly average premiums." },
            { id: 'maintenance', label: "Society / Maintenance Charges", type: "number", hint: "Recurring housing costs." }
        ]},
        // --- SECTOR 3: FAMILY ---
        { id: 'dependents', title: "FAMILY RESPONSIBILITIES", inputs: [
            { id: 'parent_support', label: "Money sent to Parents", type: "number", hint: "The 'Good Child' tax." },
            { id: 'school_fees', label: "School / College Fees", type: "number", hint: "Monthly average for kids." },
            { id: 'staff', label: "House Help / Maid / Driver", type: "number", hint: "Domestic staff salaries." },
            { id: 'black_tax', label: "Family Loans / Sibling Support", type: "number", hint: "Money you give but never get back." }
        ]},
        // --- SECTOR 4: GROCERY ---
        { id: 'grocery', title: "VARIABLE ESSENTIALS", inputs: [
            { id: 'groceries', label: "Home Groceries & Supplies", type: "number", hint: "Food, cleaning, toiletries." },
            { id: 'transport', label: "Fuel / Uber / Metro", type: "number", hint: "Cost of moving around." },
            { id: 'meds', label: "Recurring Medicines / Therapy", type: "number", hint: "Health maintenance costs." },
            { id: 'mobile', label: "Mobile Data / Recharge", type: "number", hint: "Digital connectivity." }
        ]},
        // --- SECTOR 5: LIFESTYLE ---
        { id: 'lifestyle', title: "LIFESTYLE (WANTS)", inputs: [
            { id: 'eating_out', label: "Restaurants / Zomato / Swiggy", type: "number", hint: "Food you didn't cook." },
            { id: 'entertainment', label: "Movies / Events / Clubs", type: "number", hint: "The cost of fun." },
            { id: 'shopping', label: "Clothes / Gadgets / Amazon", type: "number", hint: "Impulse buying monthly avg." },
            { id: 'grooming', label: "Salon / Skincare / Grooming", type: "number", hint: "Personal care costs." }
        ]},
        // --- SECTOR 6: VACATION ---
        { id: 'vacation', title: "TRAVEL & LEISURE", inputs: [
            { id: 'trips', label: "Vacation Fund Contribution", type: "number", hint: "How much you save/spend monthly for trips." },
            { id: 'weekend', label: "Weekend Getaways", type: "number", hint: "Short trips nearby." }
        ]},
        // --- SECTOR 7: VICES ---
        { id: 'vices', title: "HABITS & VICES", inputs: [
            { id: 'alcohol', label: "Alcohol / Party Supplies", type: "number", hint: "Be honest. No one judges you here." },
            { id: 'smoking', label: "Cigarettes / Vapes", type: "number", hint: "The cost of smoke." },
            { id: 'gambling', label: "Trading Losses / Betting", type: "number", hint: "F&O losses count here." },
            { id: 'caffeine', label: "Daily Coffee / Chai runs", type: "number", hint: "Starbucks or Tapri." }
        ]},
        // --- SECTOR 8: GROWTH ---
        { id: 'growth', title: "GROWTH SPENDING", inputs: [
            { id: 'gym', label: "Gym / Sports Membership", type: "number", hint: "Health investment." },
            { id: 'books', label: "Books / Courses / Learning", type: "number", hint: "Brain investment." },
            { id: 'tools', label: "Software Tools / Productivity", type: "number", hint: "SaaS subscriptions." }
        ]},
        // --- SECTOR 9: SUBSCRIPTIONS ---
        { id: 'subscriptions', title: "SUBSCRIPTION AUDIT", inputs: [
            { id: 'ott', label: "Netflix / Prime / Hotstar", type: "number", hint: "Streaming services." },
            { id: 'music', label: "Spotify / Apple Music", type: "number", hint: "Audio services." },
            { id: 'cloud', label: "Google Drive / iCloud", type: "number", hint: "Digital storage." },
            { id: 'gaming', label: "PS Plus / Xbox / Games", type: "number", hint: "Gaming services." }
        ]},
        // --- SECTOR 10: DEBT ---
        { id: 'debt_repay', title: "DEBT OBLIGATIONS", inputs: [
            { id: 'pl_emi', label: "Personal Loan EMIs", type: "number", hint: "Unsecured high-interest loans." },
            { id: 'car_emi', label: "Car / Bike Loan EMIs", type: "number", hint: "Vehicle debt." },
            { id: 'cc_due', label: "Credit Card Minimum Dues", type: "number", hint: "Revolving credit cost." },
            { id: 'bnpl', label: "BNPL (Simpl/LazyPay) Dues", type: "number", hint: "Buy Now Pay Later." }
        ]},
        // --- SECTOR 11: INVESTMENTS ---
        { id: 'investments', title: "ASSETS & SAVINGS", inputs: [
            { id: 'sip', label: "Mutual Fund SIPs", type: "number", hint: "Automated wealth building." },
            { id: 'stocks', label: "Direct Stock Investments", type: "number", hint: "Active market participation." },
            { id: 'pf', label: "EPF / PPF / NPS (Voluntary)", type: "number", hint: "Retirement corpus." },
            { id: 'gold', label: "Gold (Digital/Physical)", type: "number", hint: "Hedge assets." },
            { id: 'crypto', label: "Crypto Investments", type: "number", hint: "High risk assets." }
        ]}
    ];

    // State Variables
    let currentSector = 0;
    let financialData = {};

    // ========================================================
    // 2. CORE FUNCTIONS
    // ========================================================
    
    function renderSector() {
        const sect = sectors[currentSector];
        const container = document.getElementById('wizardForm');
        
        if (!container) return;

        let html = `<h3 style="color:var(--neon-cyan); margin-bottom:20px;">// SECTOR ${currentSector + 1}: ${sect.title}</h3><div class="input-group-grid">`;
        
        sect.inputs.forEach(inp => {
            const isZero = financialData[inp.id] === 0;
            const val = financialData[inp.id] ? financialData[inp.id] : (isZero ? '0' : '');
            
            html += `
                <div class="${inp.id.length > 15 ? 'full-width' : ''}">
                    <div class="fin-input-wrapper">
                        <label>${inp.label}</label>
                        <input type="${inp.type}" id="${inp.id}" class="fin-input" placeholder="0" 
                               value="${val}" ${isZero ? 'disabled style="opacity:0.3"' : ''}>
                        
                        <span class="zero-toggle ${isZero ? 'active' : ''}" 
                              onclick="toggleZero('${inp.id}', this)">I HAVE NOTHING</span>
                    </div>
                    ${inp.hint ? `<span class="hint-text">${inp.hint}</span>` : ''}
                </div>
            `;
        });
        html += `</div>`;
        container.innerHTML = html;

        // UI Updates
        document.getElementById('wizProgress').style.width = `${((currentSector + 1) / sectors.length) * 100}%`;
        document.getElementById('prevBtn').disabled = currentSector === 0;
        document.getElementById('nextBtn').innerText = currentSector === sectors.length - 1 ? "GENERATE X-RAY REPORT" : "NEXT SECTOR →";
    }

    // ========================================================
    // 3. MAIN LOGIC FLOW
    // ========================================================
    const loader = document.getElementById('loader');
    const inputSec = document.getElementById('inputSection');
    const reportSec = document.getElementById('reportSection');

    // API KEYS
    const supabaseUrl = 'https://oeapcyucnduhwpgxfknb.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lYXBjeXVjbmR1aHdwZ3hma25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNjE1NjgsImV4cCI6MjA4MzgzNzU2OH0.kyuz385hM4X3j8CMBFfI83ZerorvlXrUDOipAHKDC7Q';

    try {
        if(supabaseUrl.includes('YOUR_SUPABASE')) throw new Error("API Keys Missing in js/finances.js");

        const client = window.supabase.createClient(supabaseUrl, supabaseKey);

        // Check Session
        const { data: { session } } = await client.auth.getSession();
        if (!session) {
            window.location.href = 'login.html';
            return;
        }
        const user = session.user;

        // Fetch Data
        let { data: profile, error } = await client
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (error) {
            console.error("DB Error:", error);
            loader.classList.add('hidden');
            inputSec.classList.remove('hidden');
            renderSector();
            return;
        }

        // Router
        if (profile && profile.financial_data && Object.keys(profile.financial_data).length > 5) {
            console.log("Financial Data Found. Rendering Report...");
            // POPULATE LOCAL MEMORY WITH DB DATA SO WE CAN EDIT IT
            financialData = profile.financial_data; 
            loader.classList.add('hidden');
            reportSec.classList.remove('hidden');
            renderReport(profile.financial_data);
        } else {
            console.log("No Data. Rendering Wizard...");
            loader.classList.add('hidden');
            inputSec.classList.remove('hidden');
            renderSector();
        }

    } catch (err) {
        console.error("System Crash:", err);
        loader.innerHTML = `
            <h2 style="color:#ff4757">SYSTEM FAILURE</h2>
            <p style="color:#ccc">${err.message}</p>
            <p>Please update API Keys in js/finances.js</p>
        `;
    }

    // ========================================================
    // 4. EVENT LISTENERS
    // ========================================================
    
    // UPDATE BUTTON (The Fix)
    const updateBtn = document.getElementById('editDataBtn');
    if(updateBtn) {
        updateBtn.addEventListener('click', () => {
            // Hide Report, Show Wizard
            reportSec.classList.add('hidden');
            inputSec.classList.remove('hidden');
            
            // Reset to Sector 1 but keep 'financialData' so fields are filled
            currentSector = 0;
            renderSector();
        });
    }

    // Next Button
    document.getElementById('nextBtn').onclick = async () => {
        const currentInputs = sectors[currentSector].inputs;
        currentInputs.forEach(inp => {
            const el = document.getElementById(inp.id);
            if (!el.disabled) {
                const val = el.value;
                financialData[inp.id] = val ? parseFloat(val) : 0;
            } else {
                financialData[inp.id] = 0;
            }
        });

        if (currentSector < sectors.length - 1) {
            currentSector++;
            renderSector();
        } else {
            // FINISH
            document.getElementById('inputSection').innerHTML = `
                <div class="screen-center">
                    <div class="data-stream"></div>
                    <h2 style="color:var(--neon-cyan)">COMPILING FINANCIAL REALITY...</h2>
                    <p>Saving ${Object.keys(financialData).length} data points...</p>
                </div>
            `;
            
            const client = window.supabase.createClient(supabaseUrl, supabaseKey);
            const { data: { session } } = await client.auth.getSession();
            await client.from('profiles').update({ financial_data: financialData }).eq('id', session.user.id);
            location.reload();
        }
    };

    // Prev Button
    document.getElementById('prevBtn').onclick = () => {
        if (currentSector > 0) {
            currentSector--;
            renderSector();
        }
    };

    // ========================================================
    // 5. REPORT ENGINE
    // ========================================================
    function renderReport(data) {
        const sum = (...keys) => keys.reduce((acc, key) => acc + (data[key] || 0), 0);

        const income = sum('salary', 'variable', 'bonus', 'rental');
        const fixedNeeds = sum('rent', 'utilities', 'insurance', 'maintenance', 'parent_support', 'school_fees', 'staff', 'groceries', 'meds', 'transport', 'mobile');
        const wants = sum('eating_out', 'entertainment', 'shopping', 'grooming', 'trips', 'weekend', 'ott', 'music', 'gaming');
        const debt = sum('pl_emi', 'car_emi', 'cc_due', 'bnpl', 'black_tax');
        const investment = sum('sip', 'stocks', 'pf', 'gold', 'crypto');
        const growth = sum('gym', 'books', 'tools', 'cloud');
        const waste = sum('alcohol', 'smoking', 'gambling', 'caffeine');

        const totalOut = fixedNeeds + wants + debt + investment + growth + waste;
        const net = income - totalOut;

        // --- 1. HERO STATS ---
        const netEl = document.getElementById('netRealityValue');
        netEl.innerText = `₹ ${net.toLocaleString()}`;
        netEl.style.color = net > 0 ? "var(--neon-green)" : "var(--neon-red)";
        
        document.getElementById('repTotalIncome').innerText = `₹ ${income.toLocaleString()}`;
        document.getElementById('repFixed').innerText = `₹ ${fixedNeeds.toLocaleString()}`;
        document.getElementById('repBurn').innerText = `₹ ${totalOut.toLocaleString()}`;

        // --- 2. SIGNALS ---
        const debtRatio = income > 0 ? (debt / income) * 100 : 0;
        const saveRatio = income > 0 ? (investment / income) * 100 : 0;
        const needsRatio = income > 0 ? (fixedNeeds / income) * 100 : 0;
        const wantsRatio = income > 0 ? (wants / income) * 100 : 0;

        const healthGrid = document.getElementById('healthGrid');
        healthGrid.innerHTML = `
            <div class="signal-box"><h4>DEBT LOAD</h4><span style="color:${debtRatio > 30 ? '#ff4757' : '#C7F000'}">${debtRatio.toFixed(1)}%</span></div>
            <div class="signal-box"><h4>INVEST RATE</h4><span style="color:${saveRatio < 20 ? 'orange' : '#C7F000'}">${saveRatio.toFixed(1)}%</span></div>
            <div class="signal-box"><h4>NEEDS RATIO</h4><span style="color:${needsRatio > 50 ? '#ff4757' : '#C7F000'}">${needsRatio.toFixed(1)}%</span></div>
            <div class="signal-box"><h4>WANTS RATIO</h4><span style="color:${wantsRatio > 30 ? '#ff4757' : '#00f3ff'}">${wantsRatio.toFixed(1)}%</span></div>
        `;

        // --- 3. LEAK DETECTOR ---
        const leaks = [];
        if (waste > investment) leaks.push(`Vices (₹${waste}) > Investments (₹${investment})`);
        if (data.eating_out > data.groceries) leaks.push("Ordering out costs more than Cooking");
        if (data.cc_due > 0) leaks.push("Credit Card Revolving Debt Detected");
        if (data.subscriptions > 2000) leaks.push("High Subscription Fatigue");
        
        document.getElementById('leakList').innerHTML = leaks.length > 0 
            ? leaks.map(l => `<div class="leak-item"><span>⚠️ LEAK</span> ${l}</div>`).join('') 
            : `<div class="leak-item" style="color:var(--neon-green)">No major leaks detected. System Efficient.</div>`;

        // --- 4. CHARTS ---
        new Chart(document.getElementById('habitChart'), {
            type: 'doughnut',
            data: {
                labels: ['Growth (Gym/Books)', 'Decay (Vices)', 'Wants'],
                datasets: [{ data: [growth, waste, wants], backgroundColor: ['#C7F000', '#ff4757', '#ffbd2e'], borderWidth:0 }]
            },
            options: { cutout: '70%', plugins: { legend: { display: true, position: 'bottom', labels: {color:'#888'} } } }
        });
        
        document.getElementById('habitText').innerText = growth > waste 
            ? "You invest more in yourself than your vices." : "Warning: Your habits are expensive.";

        // Debt Visual
        const debtVis = document.getElementById('debtVisual');
        debtVis.style.background = `conic-gradient(#ff4757 ${debtRatio}%, #222 0%)`;
        document.getElementById('debtText').innerText = debtRatio > 30 
            ? "CRITICAL: Debt is consuming your future." : "Manageable Debt Level.";

        // Subs List
        const subList = document.getElementById('subList');
        const subs = [
            {n: 'OTT', v: data.ott}, {n: 'Music', v: data.music}, {n: 'Cloud', v: data.cloud}, {n: 'Gaming', v: data.gaming}
        ].filter(s => s.v > 0);
        
        subList.innerHTML = subs.length ? subs.map(s => `<li><span>${s.n}</span> <span>₹${s.v}</span></li>`).join('') : "<li>No active subscriptions logged</li>";

        // --- 5. VERDICT ---
        const verdictGrid = document.getElementById('verdictGrid');
        const actions = [];
        
        if (net < 0) actions.push({ t: "STOP THE BLEED", d: `You are spending ₹${Math.abs(net).toLocaleString()} more than you earn. Cut 'Wants' immediately.` });
        else if (saveRatio < 20) actions.push({ t: "BOOST SAVINGS", d: "Savings rate is low. Automate 20% to SIPs." });
        
        if (debtRatio > 40) actions.push({ t: "DEBT EMERGENCY", d: "Debt is dangerous. Use Snowball Method." });
        if (needsRatio > 60) actions.push({ t: "DOWNSIZE", d: "Fixed costs are too high. Consider cheaper rent." });
        if (waste > 2000) actions.push({ t: "DETOX", d: `Vices cost ₹${(waste*12).toLocaleString()} yearly. That's a vacation burnt.` });

        if (actions.length === 0) actions.push({ t: "OPTIMIZE", d: "You are financially healthy. Focus on increasing income." });

        verdictGrid.innerHTML = actions.map(a => `
            <div class="v-card"><h4>${a.t}</h4><p>${a.d}</p></div>
        `).join('');
    }
});

// ========================================================
// 6. GLOBAL HELPERS (MUST BE OUTSIDE)
// ========================================================
window.toggleZero = function(id, btn) {
    const input = document.getElementById(id);
    if (btn.classList.contains('active')) {
        // Toggle OFF (Re-enable input)
        input.value = "";
        input.disabled = false;
        input.style.opacity = "1";
        btn.classList.remove("active");
        btn.innerText = "I HAVE NOTHING";
    } else {
        // Toggle ON (Disable input)
        input.value = "0";
        input.disabled = true;
        input.style.opacity = "0.3";
        btn.classList.add("active");
        btn.innerText = "SKIPPED (0)";
    }
};