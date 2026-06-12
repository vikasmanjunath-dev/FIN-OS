/**
 * FIN•OS — God Mode X-Ray | finances.js
 * Production-Ready v3.0  (June 13, 2026)
 *
 * v3.0 CRITICAL FIX: All financial calculations now client-side.
 *  - Ratios (savings rate, debt-to-asset, net-worth grade) computed inline — NO backend needed.
 *  - FIRE corpus + expenses computed inline using present-value annuity formula — NO backend needed.
 *  - AI verdict (God Mode analysis) now tries:
 *      1. Local brain.py at http://127.0.0.1:8000/api/chat/stream  (full AI narrative)
 *      2. Local Ollama at http://127.0.0.1:11434/api/generate      (direct LLM fallback)
 *      3. Inline template verdict built from the computed numbers   (100% offline fallback)
 *  - Page now works fully on finos1.vercel.app without ANY local backend.
 *  - Arya pre-scan coaching gracefully shows offline message when AryaAI is unavailable.
 *
 * v2.0 fixes retained:
 *  - isScanning guard prevents duplicate requests.
 *  - Per-step input validation with inline error messages.
 *  - Surplus color coding (green = positive, red = negative).
 *  - MutationObserver-based print button injection.
 *  - XSS protection via escapeHtml() before innerHTML injection.
 */

document.addEventListener("DOMContentLoaded", () => {
    // ─── DOM References ─────────────────────────────────────────────────────
    const inputSection    = document.getElementById('inputSection');
    const reportSection   = document.getElementById('reportSection');
    const loader          = document.getElementById('loader');
    const wizardForm      = document.getElementById('wizardForm');
    const nextBtn         = document.getElementById('nextBtn');
    const prevBtn         = document.getElementById('prevBtn');
    const progressText    = document.getElementById('progressText');
    const wizProgress     = document.getElementById('wizProgress');
    const chatInputArea   = document.getElementById('chatInputArea');
    const followUpInput   = document.getElementById('followUpInput');
    const sendFollowUpBtn = document.getElementById('sendFollowUpBtn');

    // ─── State ───────────────────────────────────────────────────────────────
    let currentStep       = 0;
    let isScanning        = false;
    let currentSessionId  = null;
    const userData        = {};

    // Cached computed results — used by fallback AI template
    let _computed = {};

    // ─── Wizard Steps ────────────────────────────────────────────────────────
    const steps = [
        {
            title: "01/06: INCOME STREAMS",
            fields: ['base_income', 'bonus_income', 'side_income'],
            html: `
                <label class="x-ray-label">Base In-Hand Salary (₹ / Month)</label>
                <input type="number" id="base_income" class="x-ray-input" placeholder="e.g. 120000" min="0" />
                <label class="x-ray-label">RSUs / Average Monthly Bonus (₹ / Month)</label>
                <input type="number" id="bonus_income" class="x-ray-input" placeholder="e.g. 25000" min="0" />
                <label class="x-ray-label">Side Hustle / Dividend Income (₹ / Month)</label>
                <input type="number" id="side_income" class="x-ray-input" placeholder="e.g. 5000" min="0" />
            `
        },
        {
            title: "02/06: FIXED OBLIGATIONS",
            fields: ['housing_cost', 'other_emis', 'fixed_utils'],
            html: `
                <label class="x-ray-label">Rent / Home Loan EMI (₹ / Month)</label>
                <input type="number" id="housing_cost" class="x-ray-input" placeholder="e.g. 35000" min="0" />
                <label class="x-ray-label">Other EMIs (Car, Phone, Personal) (₹ / Month)</label>
                <input type="number" id="other_emis" class="x-ray-input" placeholder="e.g. 12000" min="0" />
                <label class="x-ray-label">Fixed Utilities & Insurance (₹ / Month)</label>
                <input type="number" id="fixed_utils" class="x-ray-input" placeholder="e.g. 8000" min="0" />
            `
        },
        {
            title: "03/06: LIFESTYLE BURN",
            fields: ['groceries', 'fun_money', 'subs_misc'],
            html: `
                <label class="x-ray-label">Groceries & Essentials (₹ / Month)</label>
                <input type="number" id="groceries" class="x-ray-input" placeholder="e.g. 15000" min="0" />
                <label class="x-ray-label">Dining, Travel & Entertainment (₹ / Month)</label>
                <input type="number" id="fun_money" class="x-ray-input" placeholder="e.g. 20000" min="0" />
                <label class="x-ray-label">Subscriptions & Miscellaneous (₹ / Month)</label>
                <input type="number" id="subs_misc" class="x-ray-input" placeholder="e.g. 5000" min="0" />
            `
        },
        {
            title: "04/06: ASSET ALLOCATION",
            fields: ['asset_equity', 'asset_safe', 'asset_alt', 'asset_cash'],
            html: `
                <label class="x-ray-label">Equity Portfolio (Stocks + MFs) (Total ₹)</label>
                <input type="number" id="asset_equity" class="x-ray-input" placeholder="e.g. 1200000 (12L)" min="0" />
                <label class="x-ray-label">Safe Assets (EPF, PPF, FDs) (Total ₹)</label>
                <input type="number" id="asset_safe" class="x-ray-input" placeholder="e.g. 800000 (8L)" min="0" />
                <label class="x-ray-label">Alternative (Gold, Crypto, Real Estate Equity) (Total ₹)</label>
                <input type="number" id="asset_alt" class="x-ray-input" placeholder="e.g. 300000 (3L)" min="0" />
                <label class="x-ray-label">Liquid Emergency Cash (Total ₹)</label>
                <input type="number" id="asset_cash" class="x-ray-input" placeholder="e.g. 400000 (4L)" min="0" />
            `
        },
        {
            title: "05/06: LIABILITIES",
            fields: ['total_debt', 'avg_interest'],
            html: `
                <label class="x-ray-label">Total Debt Outstanding (Total ₹)</label>
                <input type="number" id="total_debt" class="x-ray-input" placeholder="e.g. 4500000 (45L)" min="0" />
                <label class="x-ray-label">Average Blended Interest Rate (%)</label>
                <input type="number" id="avg_interest" class="x-ray-input" placeholder="e.g. 8.5" min="0" max="100" step="0.1" />
            `
        },
        {
            title: "06/06: THE HORIZON",
            fields: ['curr_age', 'fire_age'],
            html: `
                <label class="x-ray-label">Current Age</label>
                <input type="number" id="curr_age" class="x-ray-input" placeholder="e.g. 28" min="18" max="79" />
                <label class="x-ray-label">Target F.I.R.E. Age</label>
                <input type="number" id="fire_age" class="x-ray-input" placeholder="e.g. 45" min="19" max="80" />
            `
        }
    ];

    // ─── Client-Side Financial Math ─────────────────────────────────────────
    /**
     * Compute ratios without any backend call.
     * Indian net-worth benchmark: Thomas Stanley rule adapted — (Age − 27) × Annual Income / 10
     */
    function computeRatios(totalIncome, totalExpenses, monthlySurplus, totalAssets, totalDebt, age) {
        const netWorth      = totalAssets - totalDebt;
        const savingsRate   = totalIncome > 0
            ? ((Math.max(monthlySurplus, 0) / totalIncome) * 100).toFixed(1)
            : '0.0';
        const debtToAsset   = totalAssets > 0
            ? ((totalDebt / totalAssets) * 100).toFixed(1)
            : '0.0';

        // Indian benchmarked expected NW: years_working × annual_income × 0.1
        const annualIncome  = totalIncome * 12;
        const yearsWorking  = Math.max(0, age - 22);
        const expectedNW    = yearsWorking * annualIncome * 0.1;

        let nwGrade;
        if (expectedNW <= 0) {
            nwGrade = netWorth > 0 ? 'Building ↑' : 'Getting started';
        } else {
            const pct = ((netWorth / expectedNW - 1) * 100).toFixed(0);
            nwGrade = pct >= 0 ? `+${pct}% vs target ✅` : `${pct}% vs target ⚠`;
        }

        return {
            net_worth_inr:          netWorth,
            savings_rate_percent:   parseFloat(savingsRate),
            debt_to_asset_ratio:    parseFloat(debtToAsset),
            expected_net_worth_inr: expectedNW,
            net_worth_grade:        nwGrade
        };
    }

    /**
     * FIRE corpus using present-value annuity formula.
     * Inflation: 6% | Post-retire return: 10% | Life expectancy: 85
     */
    function computeFIRE(totalExpenses, currAge, fireAge, lifeExp = 85, inflation = 6.0, postReturn = 10.0) {
        const yearsToFire   = Math.max(1, fireAge - currAge);
        const retireYears   = Math.max(1, lifeExp - fireAge);

        // Inflate today's annual expenses to retirement age
        const expAtRetire   = totalExpenses * 12 * Math.pow(1 + inflation / 100, yearsToFire);

        // Real rate of return in retirement (Fisher equation)
        const realReturn    = (postReturn - inflation) / 100;
        let corpus;
        if (realReturn > 0) {
            corpus = expAtRetire * (1 - Math.pow(1 + realReturn, -retireYears)) / realReturn;
        } else {
            corpus = expAtRetire * retireYears;   // zero-real-return edge case
        }

        // Monthly SIP needed at 12% CAGR to hit corpus in yearsToFire years
        const monthlyRate = 0.12 / 12;
        const months      = yearsToFire * 12;
        const sipNeeded   = corpus * monthlyRate / (Math.pow(1 + monthlyRate, months) - 1);

        let realityCheck;
        const corpusCr = corpus / 1e7;
        if (yearsToFire <= 5) {
            realityCheck = `⚡ Aggressive ${yearsToFire}-year timeline. You need ₹${Math.round(sipNeeded / 1000)}K/month SIP at 12% CAGR — or a major income event. Every ₹1L of expense reduction saves ₹${(16.7 / 10).toFixed(1)}L in corpus needed.`;
        } else if (yearsToFire <= 15) {
            realityCheck = `Achievable with discipline. Target ₹${Math.round(sipNeeded / 1000)}K/month SIP (10% annual step-up). Cutting ₹10K/month in lifestyle burn saves ₹${(10000 * 12 * Math.pow(1.06, yearsToFire) / 1e5).toFixed(1)}L corpus needed at retirement.`;
        } else {
            realityCheck = `Long runway — time is your biggest asset. Start ₹${Math.round(sipNeeded / 1000)}K/month SIP today, step up 10%/year. At 12% CAGR over ${yearsToFire} years, compounding does the heavy lifting.`;
        }

        return {
            required_fire_corpus_inr: corpus,
            expenses_at_retirement_inr: Math.round(expAtRetire),
            sip_needed_monthly: Math.round(sipNeeded),
            reality_check: realityCheck
        };
    }

    // ─── Inline Verdict Template (100% offline fallback) ─────────────────────
    function buildInlineVerdict(c) {
        const { totalIncome, totalExpenses, monthlySurplus, ratioData, fireData, userData } = c;
        const savRate  = ratioData.savings_rate_percent;
        const dta      = ratioData.debt_to_asset_ratio;
        const nw       = ratioData.net_worth_inr;
        const corpus   = fireData.required_fire_corpus_inr;
        const yearsToFire = (userData.fire_age || 45) - (userData.curr_age || 30);

        // Reality Check grade
        const srGrade  = savRate >= 30 ? '✅ Excellent' : savRate >= 20 ? '⚠ Average' : '🔴 Critical';
        const dtaGrade = dta <= 30 ? '✅ Healthy' : dta <= 60 ? '⚠ Watch this' : '🔴 Debt-heavy';
        const emiPct   = totalIncome > 0 ? ((userData.housing_cost + userData.other_emis) / totalIncome * 100).toFixed(0) : 0;

        const aryaFmt  = v => `₹${Math.abs(Math.round(v)).toLocaleString('en-IN')}`;

        return `
### 🔍 The Reality Check

Your **savings rate is ${savRate}%** — ${srGrade === '✅ Excellent' ? 'above the 30% threshold. You\'re building wealth.' : savRate >= 20 ? 'in average range. Optimise 2–3 expenses to cross 30%.' : 'below 20% danger zone. Structural fix needed, not just cutting chai.'} EMIs consume **${emiPct}%** of income — ${emiPct > 40 ? '🔴 above 40%, you\'re working for your lenders.' : emiPct > 25 ? '⚠ manageable but watch scope creep.' : '✅ healthy ratio.'} Debt-to-asset: **${dta}%** — ${dtaGrade}.

---

### 📐 The Math

| Metric | Your Number | Benchmark |
|--------|------------|-----------|
| Monthly Surplus | **${monthlySurplus >= 0 ? aryaFmt(monthlySurplus) : '-' + aryaFmt(monthlySurplus)}** | > 30% of income |
| Savings Rate | **${savRate}%** | ≥30% for wealth-builders |
| Debt-to-Asset | **${dta}%** | <30% = fortress |
| FIRE Corpus Needed | **₹${(corpus / 1e7).toFixed(2)} Cr** | at age ${userData.fire_age || 45} |
| Monthly SIP needed | **${aryaFmt(fireData.sip_needed_monthly)}/month** | at 12% CAGR |
| Net Worth | **${nw >= 0 ? aryaFmt(nw) : '-' + aryaFmt(nw)}** | ${ratioData.net_worth_grade} |

---

### ⚠️ Where People Fail

${dta > 60 ? '**Debt trap:** Your liabilities-to-assets ratio signals you\'re building someone else\'s wealth. Every high-interest EMI is compounding *against* you. Prepay the highest-rate debt first — calculate the post-tax return equivalent before investing elsewhere.' : '**Lifestyle creep:** The biggest wealth destroyer for Indian professionals isn\'t debt — it\'s invisible spending (eating out, subscriptions, "one-time" purchases) that prevents the savings rate from crossing 30%. At 12% CAGR, every extra ₹10K/month invested today = ₹' + (10000 * Math.pow(1.12, yearsToFire) / 1000).toFixed(0) + 'K in ' + yearsToFire + ' years.'}

${savRate < 20 ? '**Low savings rate:** If you can\'t save 20%+ monthly, your FIRE timeline extends by years. Run the 50-30-20 rule: 50% needs, 30% wants, 20% minimum savings. Anything above 30% savings is the real wealth-building zone.' : ''}

---

### ✅ The FIN-OS Fix

1. **Automate investments first** — move SIP debit to Day 1 of the month. Invest first, live on the rest.
2. **Step up SIP 10% every April** — on your salary hike date. Automate this decision.
3. **Kill the drain** — identify your single biggest discretionary leak and cut it by 50%.
${userData.total_debt > 0 ? '4. **Debt waterfall** — list all debts by interest rate. Extra cash goes to highest rate first. Free ₹ from closed EMIs flows directly to investments.' : '4. **Corpus bridge** — you\'re debt-light. Focus capital on equity SIPs and NPS 80CCD(1B) for tax-free ₹50K deduction.'}

*To get a personalised AI-driven analysis, start the FIN-OS backend: cd chatbot && uvicorn brain:app --port 8000*
        `.trim();
    }

    // ─── Rendering ───────────────────────────────────────────────────────────
    function renderStep() {
        const step = steps[currentStep];
        wizardForm.innerHTML = `
            <h3 style="margin-bottom:20px; color:#fff;">${step.title}</h3>
            ${step.html}
            <div id="stepError" style="color:#FF4F4F; font-family:'JetBrains Mono'; font-size:12px; margin-top:8px; min-height:18px;"></div>
        `;

        progressText.innerText = `PHASE ${currentStep + 1}/${steps.length}`;
        wizProgress.style.width = `${((currentStep + 1) / steps.length) * 100}%`;

        prevBtn.disabled = currentStep === 0;
        nextBtn.innerText = currentStep === steps.length - 1 ? "INITIALIZE GOD MODE ▶" : "NEXT SECTOR →";
        nextBtn.disabled = isScanning;

        // Restore previously saved values
        for (const key in userData) {
            const input = document.getElementById(key);
            if (input) input.value = userData[key] || '';
        }
    }

    function saveCurrentStep() {
        const inputs = wizardForm.querySelectorAll('input[id]');
        inputs.forEach(input => {
            userData[input.id] = parseFloat(input.value) || 0;
        });
    }

    function validateCurrentStep() {
        const errorEl = document.getElementById('stepError');
        if (currentStep === 0) {
            const baseIncome = parseFloat(document.getElementById('base_income')?.value) || 0;
            if (baseIncome <= 0) {
                if (errorEl) errorEl.innerText = '⚠ Base salary must be greater than ₹0 to proceed.';
                return false;
            }
        }
        if (currentStep === 5) {
            const currAge = parseFloat(document.getElementById('curr_age')?.value) || 0;
            const fireAge = parseFloat(document.getElementById('fire_age')?.value) || 0;
            if (currAge < 18 || currAge > 79) {
                if (errorEl) errorEl.innerText = '⚠ Current age must be between 18 and 79.';
                return false;
            }
            if (fireAge <= currAge) {
                if (errorEl) errorEl.innerText = '⚠ F.I.R.E. age must be greater than your current age.';
                return false;
            }
        }
        if (errorEl) errorEl.innerText = '';
        return true;
    }

    // ─── Navigation ──────────────────────────────────────────────────────────
    nextBtn.addEventListener('click', async () => {
        if (isScanning) return;
        if (!validateCurrentStep()) return;
        saveCurrentStep();
        if (currentStep < steps.length - 1) {
            currentStep++;
            renderStep();
        } else {
            await executeDeepScan();
        }
    });

    prevBtn.addEventListener('click', () => {
        saveCurrentStep();
        if (currentStep > 0) {
            currentStep--;
            renderStep();
        }
    });

    document.getElementById('editDataBtn')?.addEventListener('click', () => {
        reportSection.classList.add('hidden');
        inputSection.classList.remove('hidden');
        currentStep = 0;
        isScanning = false;
        renderStep();
    });

    // ─── Deep Scan ─────────────────────────────────────────────────────────
    async function executeDeepScan() {
        if (isScanning) return;
        isScanning = true;
        nextBtn.disabled = true;
        inputSection.classList.add('hidden');
        loader.classList.remove('hidden');

        // ── Derived aggregates ──────────────────────────────────────────────
        const totalIncome   = userData.base_income   + userData.bonus_income + userData.side_income;
        const totalFixed    = userData.housing_cost  + userData.other_emis   + userData.fixed_utils;
        const totalVariable = userData.groceries     + userData.fun_money    + userData.subs_misc;
        const totalExpenses = totalFixed + totalVariable;
        const monthlySurplus= totalIncome - totalExpenses;
        const totalAssets   = userData.asset_equity + userData.asset_safe + userData.asset_alt + userData.asset_cash;
        const totalDebt     = userData.total_debt || 0;
        const age           = userData.curr_age || 25;
        const fireAge       = userData.fire_age || 45;

        // ── Client-side calculations (no backend needed) ────────────────────
        const ratioData = computeRatios(totalIncome, totalExpenses, monthlySurplus, totalAssets, totalDebt, age);
        const fireData  = computeFIRE(totalExpenses, age, fireAge);

        // Cache computed context for AI prompt and inline fallback
        _computed = { totalIncome, totalExpenses, monthlySurplus, totalAssets, totalDebt, ratioData, fireData, userData: { ...userData } };

        // ── Populate Report ─────────────────────────────────────────────────
        document.getElementById('repNetWorth').innerText =
            `₹${Math.round(ratioData.net_worth_inr).toLocaleString('en-IN')}`;
        document.getElementById('repTotalIncome').innerText =
            `₹${totalIncome.toLocaleString('en-IN')}`;
        document.getElementById('repTotalBurn').innerText =
            `₹${totalExpenses.toLocaleString('en-IN')}`;

        const surplusEl = document.getElementById('repSurplus');
        surplusEl.innerText = `₹${Math.abs(monthlySurplus).toLocaleString('en-IN')}${monthlySurplus < 0 ? ' deficit' : ''}`;
        surplusEl.style.color = monthlySurplus >= 0 ? '#4F7CFF' : '#FF4F4F';

        document.getElementById('repSavingsRate').innerText =
            `${ratioData.savings_rate_percent}%`;
        document.getElementById('repDebtRatio').innerText =
            `${ratioData.debt_to_asset_ratio}%`;
        document.getElementById('repNwGrade').innerText =
            ratioData.net_worth_grade;

        document.getElementById('repEquity').innerText  = `₹${userData.asset_equity.toLocaleString('en-IN')}`;
        document.getElementById('repSafe').innerText    = `₹${userData.asset_safe.toLocaleString('en-IN')}`;
        document.getElementById('repAlt').innerText     = `₹${userData.asset_alt.toLocaleString('en-IN')}`;
        document.getElementById('repLiquid').innerText  = `₹${userData.asset_cash.toLocaleString('en-IN')}`;

        document.getElementById('fireResults').innerHTML = `
            <p>
              <strong>Corpus Required at Age ${fireAge}:</strong>
              <span style="color:#C7F000; font-size:18px;">
                ₹${(fireData.required_fire_corpus_inr / 1e7).toFixed(2)} Cr
              </span>
            </p>
            <p><strong>Projected Yearly Burn at ${fireAge}:</strong> ₹${fireData.expenses_at_retirement_inr.toLocaleString('en-IN')}</p>
            <p><strong>SIP Needed Now:</strong> <span style="color:#a78bfa">₹${fireData.sip_needed_monthly.toLocaleString('en-IN')}/month</span> at 12% CAGR</p>
            <div class="api-insight">> ${fireData.reality_check}</div>
        `;

        // ── Verdict Box spinner ─────────────────────────────────────────────
        const verdictBox = document.getElementById('verdictGrid');
        verdictBox.innerHTML = `
            <div id="qftResponseStream" style="margin-bottom:20px;">
                <div style="text-align:center; padding:40px 10px;" id="streamLoader">
                    <div style="width:30px; height:30px; border:2px solid rgba(199,240,0,0.2);
                         border-top-color:#C7F000; border-radius:50%;
                         animation:spin 1s linear infinite; margin:0 auto 15px;"></div>
                    <span style="color:#C7F000; font-family:'JetBrains Mono',monospace; font-size:13px;">
                        QFT CORE IS ANALYZING YOUR DATA...
                    </span>
                </div>
            </div>
            <style>@keyframes spin { 100% { transform:rotate(360deg); } }</style>
        `;

        loader.classList.add('hidden');
        reportSection.classList.remove('hidden');
        isScanning = false;
        nextBtn.disabled = false;

        // ── God Mode AI prompt ──────────────────────────────────────────────
        const godModePrompt = `
PERFORM A 'GOD MODE' FINANCIAL X-RAY ON MY EXACT DATA.
[INCOME] ₹${totalIncome}/month | [BURN] ₹${totalExpenses}/month | [SURPLUS] ₹${monthlySurplus}/month | [SAVINGS RATE] ${ratioData.savings_rate_percent}%
[EQUITY] ₹${userData.asset_equity} | [SAFE] ₹${userData.asset_safe} | [LIQUID] ₹${userData.asset_cash} | [ALT] ₹${userData.asset_alt}
[DEBT] ₹${totalDebt} at ${userData.avg_interest || 0}% | [NW] ₹${Math.round(ratioData.net_worth_inr)} vs Target ₹${Math.round(ratioData.expected_net_worth_inr)}
[FIRE] Target Age ${fireAge} | Corpus needed: ₹${(fireData.required_fire_corpus_inr / 1e7).toFixed(2)} Cr | SIP needed: ₹${fireData.sip_needed_monthly}/month
[DEBT-TO-ASSET] ${ratioData.debt_to_asset_ratio}% | [EMI LOAD] ${totalIncome > 0 ? ((userData.housing_cost + userData.other_emis) / totalIncome * 100).toFixed(0) : 0}% of income

Assess my true wealth trajectory with brutal honesty. Use these markdown headers:
### 🔍 The Reality Check
### 📐 The Math
### ⚠️ Where People Fail
### ✅ The FIN-OS Fix
        `.trim();

        // Try AI streaming with cascading fallbacks
        await streamWithFallback(godModePrompt, true);
    }

    // ─── Streaming with 3-tier fallback ──────────────────────────────────────
    async function streamWithFallback(promptText, isInitialLoad = false) {
        // Tier 1: Local brain.py
        const tier1Success = await tryStreamBrain(promptText, isInitialLoad);
        if (tier1Success) return;

        // Tier 2: Local Ollama directly
        const tier2Success = await tryStreamOllama(promptText, isInitialLoad);
        if (tier2Success) return;

        // Tier 3: Inline template (100% offline)
        renderInlineVerdict(isInitialLoad);
    }

    // Tier 1: chatbot/brain.py at :8000
    async function tryStreamBrain(promptText, isInitialLoad) {
        const verdictBox = document.getElementById('verdictGrid');
        if (!verdictBox) return false;

        try {
            const controller  = new AbortController();
            const timeoutId   = setTimeout(() => controller.abort(), 5000); // 5s probe timeout

            const response = await fetch('http://127.0.0.1:8000/api/chat/stream', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                signal:  controller.signal,
                body: JSON.stringify({
                    message:    promptText,
                    session_id: currentSessionId,
                    context:    'God Mode X-Ray'
                })
            });
            clearTimeout(timeoutId);
            if (!response.ok) return false;

            await readSSEStream(response, verdictBox, isInitialLoad, 'brain');
            return true;
        } catch (e) {
            return false; // offline or refused connection
        }
    }

    // Tier 2: Ollama directly at :11434
    async function tryStreamOllama(promptText, isInitialLoad) {
        const verdictBox = document.getElementById('verdictGrid');
        if (!verdictBox) return false;

        try {
            const controller = new AbortController();
            const timeoutId  = setTimeout(() => controller.abort(), 5000);

            const response = await fetch('http://127.0.0.1:11434/api/generate', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                signal:  controller.signal,
                body: JSON.stringify({
                    model:  'llama3.2:3b',
                    prompt: `You are a ruthless Indian financial analyst. ${promptText}`,
                    stream: true,
                    options: { temperature: 0.3, num_predict: 700 }
                })
            });
            clearTimeout(timeoutId);
            if (!response.ok) return false;

            await readOllamaStream(response, verdictBox, isInitialLoad);
            return true;
        } catch (e) {
            return false;
        }
    }

    // Read brain.py SSE stream
    async function readSSEStream(response, verdictBox, isInitialLoad, source) {
        const responseId = `msg-${Date.now()}`;
        verdictBox.innerHTML += `<div id="${responseId}" class="qft-msg" style="margin-bottom:20px;"><span style="color:#888;">Thinking...</span></div>`;
        const msgDiv = document.getElementById(responseId);

        document.getElementById('streamLoader')?.remove();
        chatInputArea?.classList.add('hidden');

        const reader  = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let fullContent = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                for (const line of chunk.split('\n')) {
                    if (!line.startsWith('data: ')) continue;
                    const raw = line.slice(6).trim();
                    if (!raw || raw === '[DONE]') continue;
                    try {
                        const data = JSON.parse(raw);
                        if (data.error) throw new Error(data.error);
                        if (data.session_id) currentSessionId = data.session_id;
                        const token = data.token || data.t || '';
                        if (token) {
                            fullContent += token;
                            msgDiv.innerHTML = renderMarkdown(fullContent);
                            verdictBox.scrollTop = verdictBox.scrollHeight;
                        }
                        if (data.done) break;
                    } catch (e) {
                        if (!(e instanceof SyntaxError)) throw e; // re-throw real errors, skip malformed JSON
                    }
                }
            }
        } finally {
            chatInputArea?.classList.remove('hidden');
            if (followUpInput && !chatInputArea?.classList.contains('hidden')) followUpInput.focus();
            verdictBox.scrollTop = verdictBox.scrollHeight;
        }

        // If stream ended with no content, remove the empty "Thinking..." and signal failure
        if (!fullContent) {
            msgDiv.remove();
            throw new Error('empty stream — Ollama offline');
        }
    }

    // Read Ollama NDJSON stream
    async function readOllamaStream(response, verdictBox, isInitialLoad) {
        const responseId = `msg-${Date.now()}`;
        verdictBox.innerHTML += `<div id="${responseId}" class="qft-msg" style="margin-bottom:20px;"><span style="color:#888;">Thinking via Ollama...</span></div>`;
        const msgDiv = document.getElementById(responseId);

        document.getElementById('streamLoader')?.remove();
        chatInputArea?.classList.add('hidden');

        const reader  = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let fullContent = '';
        let buf = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
                const parts = buf.split('\n');
                buf = parts.pop(); // keep incomplete last line
                for (const part of parts) {
                    if (!part.trim()) continue;
                    try {
                        const data = JSON.parse(part);
                        if (data.response) {
                            fullContent += data.response;
                            msgDiv.innerHTML = renderMarkdown(fullContent);
                            verdictBox.scrollTop = verdictBox.scrollHeight;
                        }
                        if (data.done) break;
                    } catch { /* skip */ }
                }
            }
        } finally {
            chatInputArea?.classList.remove('hidden');
            if (followUpInput && !chatInputArea?.classList.contains('hidden')) followUpInput.focus();
            verdictBox.scrollTop = verdictBox.scrollHeight;
        }
    }

    // Tier 3: fully offline inline verdict
    function renderInlineVerdict(isInitialLoad) {
        const verdictBox = document.getElementById('verdictGrid');
        if (!verdictBox) return;

        document.getElementById('streamLoader')?.remove();

        const md = buildInlineVerdict(_computed);
        const responseId = `msg-${Date.now()}`;
        verdictBox.innerHTML += `
            <div id="${responseId}" class="qft-msg" style="margin-bottom:20px;">
                ${renderMarkdown(md)}
                <div style="margin-top:16px;padding:10px 14px;background:rgba(199,240,0,.04);border:1px solid rgba(199,240,0,.15);border-radius:8px;font-family:'JetBrains Mono',monospace;font-size:11px;color:rgba(199,240,0,.5);">
                    ⚡ AI OFFLINE — showing computed analysis. For personalised AI narrative, run <code>cd chatbot && uvicorn brain:app --port 8000</code> locally.
                </div>
            </div>`;
        verdictBox.scrollTop = verdictBox.scrollHeight;
        chatInputArea?.classList.remove('hidden');
        if (followUpInput && !chatInputArea?.classList.contains('hidden')) followUpInput.focus();
    }

    // ─── Markdown renderer ───────────────────────────────────────────────────
    function renderMarkdown(md) {
        if (typeof marked !== 'undefined' && marked.parse) {
            const raw = marked.parse(md);
            return typeof DOMPurify !== 'undefined'
                ? DOMPurify.sanitize(raw)
                : raw.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/javascript:/gi, '');
        }
        // Basic fallback if marked hasn't loaded yet
        return md
            .replace(/^### (.+)$/gm, '<strong style="color:#C7F000;font-size:13px;display:block;margin:14px 0 6px">$1</strong>')
            .replace(/^---$/gm, '<hr style="border-color:rgba(255,255,255,0.08);margin:12px 0">')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');
    }

    // ─── Follow-up chat (also uses cascading fallback) ────────────────────────
    async function streamOllamaResponse(promptText) {
        const verdictBox = document.getElementById('verdictGrid');
        if (!verdictBox) return;

        verdictBox.innerHTML += `
            <div style="background:rgba(79,124,255,0.1); border-left:3px solid #4F7CFF; padding:15px; margin:20px 0;">
                <strong style="color:#4F7CFF;">YOU:</strong> ${escapeHtml(promptText)}
            </div>
        `;

        // Enrich follow-up with computed context so AI has full picture
        const enriched = `
Context from earlier God Mode scan:
Income ₹${_computed.totalIncome}/month | Savings rate ${_computed.ratioData?.savings_rate_percent}% | NW ₹${Math.round(_computed.ratioData?.net_worth_inr)} | Debt ₹${_computed.totalDebt}
FIRE corpus needed: ₹${(_computed.fireData?.required_fire_corpus_inr / 1e7).toFixed(2)} Cr at age ${_computed.userData?.fire_age}

User follow-up question: ${promptText}

Answer concisely (3-5 sentences) with specific ₹ amounts. Be direct and brutally honest.`.trim();

        await streamWithFallback(enriched, false);
    }

    sendFollowUpBtn?.addEventListener('click', () => {
        const text = followUpInput.value.trim();
        if (!text) return;
        followUpInput.value = '';
        streamOllamaResponse(text);
    });
    followUpInput?.addEventListener('keypress', e => {
        if (e.key === 'Enter') {
            const text = followUpInput.value.trim();
            if (!text) return;
            followUpInput.value = '';
            streamOllamaResponse(text);
        }
    });

    // ─── Print / PDF ──────────────────────────────────────────────────────────
    function injectPrintButton() {
        const actionBar = document.querySelector('.action-bar');
        if (!actionBar || document.getElementById('printReportBtn')) return;
        const printBtn = document.createElement('button');
        printBtn.id        = 'printReportBtn';
        printBtn.className = 'stylish-button';
        printBtn.style.cssText = 'margin-left:10px;';
        printBtn.innerHTML = '🖨 EXPORT PDF';
        printBtn.addEventListener('click', () => window.print());
        actionBar.appendChild(printBtn);
    }

    const observer = new MutationObserver(() => {
        if (!reportSection.classList.contains('hidden')) injectPrintButton();
    });
    if (reportSection) observer.observe(reportSection, { attributes: true, attributeFilter: ['class'] });

    // ─── Utilities ────────────────────────────────────────────────────────────
    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // ─── Boot ─────────────────────────────────────────────────────────────────
    renderStep();
});
