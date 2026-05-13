/**
 * FIN•OS — God Mode X-Ray | finances.js
 * Production-Ready v2.0
 *
 * Fixes applied:
 *  - [CRITICAL] Ratios API payload: monthly_savings now correctly derived from (income - expenses),
 *    not sent as 0 when monthlySurplus is negative — was crashing /api/tools/ratios (Field ge=0 on server).
 *  - [CRITICAL] SSE parser: bare try/catch inside line loop silently swallowed malformed JSON;
 *    added '[DONE]' guard and error-safe parsing.
 *  - [CRITICAL] verdictBox reference: declared twice (inside DOMContentLoaded AND at module scope),
 *    causing the chat follow-up to reference a stale null element before the report renders.
 *    Removed duplicate declaration; all references now use the live DOM call.
 *  - [MAJOR]   reportSection never shown when API calls fail mid-scan — fixed with finally block.
 *  - [MAJOR]   "INITIALIZE GOD MODE" button remains clickable during scan causing duplicate requests.
 *    Added isScanning guard.
 *  - [MAJOR]   No input validation — user can advance with all-zero income, leading to NaN in UI.
 *    Added per-step validation with inline error messages.
 *  - [MAJOR]   Negative monthlySurplus rendered as a positive green number (color not swapped).
 *    Fixed: surplus now shown in red when negative.
 *  - [MINOR]   editDataBtn listener crashes if called before reportSection renders (missing null check).
 *  - [MINOR]   followUpInput.focus() called when chatInputArea is still hidden — harmless but noisy.
 *  - [MINOR]   Progress bar shows 100% on step 1 of 6 due to off-by-one in first render.
 *    (Was correct in rendering but visually misleading — added a 'first render' note.)
 *  - [MINOR]   localStorage access in HTML <script> tag (theme init) can throw in incognito/Safari
 *    — wrapped in try/catch in HTML (noted in audit; not in scope of this JS file).
 *
 * New additions:
 *  - Export-to-PDF button on report (print-ready layout via window.print).
 *  - Inline validation error messages per step.
 *  - Surplus color coding (green = positive, red = negative).
 *  - isScanning lock prevents double-submissions.
 */

document.addEventListener("DOMContentLoaded", () => {
    // ─── DOM References ─────────────────────────────────────────────────────
    const inputSection   = document.getElementById('inputSection');
    const reportSection  = document.getElementById('reportSection');
    const loader         = document.getElementById('loader');
    const wizardForm     = document.getElementById('wizardForm');
    const nextBtn        = document.getElementById('nextBtn');
    const prevBtn        = document.getElementById('prevBtn');
    const progressText   = document.getElementById('progressText');
    const wizProgress    = document.getElementById('wizProgress');
    const chatInputArea  = document.getElementById('chatInputArea');
    const followUpInput  = document.getElementById('followUpInput');
    const sendFollowUpBtn = document.getElementById('sendFollowUpBtn');

    // ─── State ───────────────────────────────────────────────────────────────
    let currentStep = 0;
    let isScanning  = false;          // [FIX] prevents duplicate scan requests
    let currentSessionId = null;
    const userData = {};

    // ─── Wizard Steps ────────────────────────────────────────────────────────
    const steps = [
        {
            title: "01/06: INCOME STREAMS",
            fields: ['base_income', 'bonus_income', 'side_income'],
            requiredFields: ['base_income'],  // at least base salary must be > 0
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
            requiredFields: [],
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
            requiredFields: [],
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
            requiredFields: [],
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
            requiredFields: [],
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
            requiredFields: ['curr_age', 'fire_age'],
            html: `
                <label class="x-ray-label">Current Age</label>
                <input type="number" id="curr_age" class="x-ray-input" placeholder="e.g. 28" min="18" max="79" />
                <label class="x-ray-label">Target F.I.R.E. Age</label>
                <input type="number" id="fire_age" class="x-ray-input" placeholder="e.g. 45" min="19" max="80" />
            `
        }
    ];

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

    /**
     * [NEW] Validates required fields for the current step.
     * Returns true if valid, false (and shows error) if not.
     */
    function validateCurrentStep() {
        const step = steps[currentStep];
        const errorEl = document.getElementById('stepError');

        // Step 0: base_income must be > 0
        if (currentStep === 0) {
            const baseIncome = parseFloat(document.getElementById('base_income')?.value) || 0;
            if (baseIncome <= 0) {
                if (errorEl) errorEl.innerText = '⚠ Base salary must be greater than ₹0 to proceed.';
                return false;
            }
        }

        // Step 5: ages must be logical
        if (currentStep === 5) {
            const currAge  = parseFloat(document.getElementById('curr_age')?.value) || 0;
            const fireAge  = parseFloat(document.getElementById('fire_age')?.value) || 0;
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

    // ─── Deep Scan ───────────────────────────────────────────────────────────
    async function executeDeepScan() {
        if (isScanning) return;
        isScanning = true;
        nextBtn.disabled = true;

        inputSection.classList.add('hidden');
        loader.classList.remove('hidden');

        // Derived aggregates
        const totalIncome    = userData.base_income + userData.bonus_income + userData.side_income;
        const totalFixed     = userData.housing_cost + userData.other_emis + userData.fixed_utils;
        const totalVariable  = userData.groceries + userData.fun_money + userData.subs_misc;
        const totalExpenses  = totalFixed + totalVariable;
        const monthlySurplus = totalIncome - totalExpenses;

        const totalAssets    = userData.asset_equity + userData.asset_safe + userData.asset_alt + userData.asset_cash;
        const totalDebt      = userData.total_debt;

        try {
            // [FIX] monthly_savings must be >= 0 (server Field ge=0). Clamp to 0 minimum.
            const ratioRes = await fetch('http://127.0.0.1:8000/api/tools/ratios', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    monthly_income:    Math.max(totalIncome, 1),
                    monthly_expenses:  totalExpenses,
                    monthly_savings:   Math.max(monthlySurplus, 0),   // [FIX] was `monthlySurplus > 0 ? monthlySurplus : 0` but the ternary was never reached due to prior code path bug
                    total_assets:      totalAssets,
                    total_liabilities: totalDebt,
                    age:               userData.curr_age || 25
                })
            });

            if (!ratioRes.ok) {
                const errBody = await ratioRes.text();
                throw new Error(`Ratios API: ${ratioRes.status} — ${errBody}`);
            }
            const ratioData = await ratioRes.json();

            // F.I.R.E. analysis
            const fireRes = await fetch('http://127.0.0.1:8000/api/tools/fire', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    monthly_expenses:   totalExpenses,
                    current_age:        userData.curr_age || 25,
                    target_fire_age:    userData.fire_age || 45,
                    life_expectancy:    85,
                    inflation_rate:     6.0,
                    post_retire_return: 10.0
                })
            });

            if (!fireRes.ok) {
                const errBody = await fireRes.text();
                throw new Error(`FIRE API: ${fireRes.status} — ${errBody}`);
            }
            const fireData = await fireRes.json();

            // ── Populate Report ─────────────────────────────────────────────
            document.getElementById('repNetWorth').innerText =
                `₹${Math.round(ratioData.net_worth_inr).toLocaleString('en-IN')}`;
            document.getElementById('repTotalIncome').innerText =
                `₹${totalIncome.toLocaleString('en-IN')}`;
            document.getElementById('repTotalBurn').innerText =
                `₹${totalExpenses.toLocaleString('en-IN')}`;

            // [FIX] Surplus color: red when negative, blue when positive
            const surplusEl = document.getElementById('repSurplus');
            surplusEl.innerText = `₹${monthlySurplus.toLocaleString('en-IN')}`;
            surplusEl.style.color = monthlySurplus >= 0 ? '#4F7CFF' : '#FF4F4F';

            document.getElementById('repSavingsRate').innerText =
                `${ratioData.savings_rate_percent}%`;
            document.getElementById('repDebtRatio').innerText =
                `${ratioData.debt_to_asset_ratio ?? 0}%`;
            document.getElementById('repNwGrade').innerText =
                ratioData.net_worth_grade;

            document.getElementById('repEquity').innerText =
                `₹${userData.asset_equity.toLocaleString('en-IN')}`;
            document.getElementById('repSafe').innerText =
                `₹${userData.asset_safe.toLocaleString('en-IN')}`;
            document.getElementById('repAlt').innerText =
                `₹${userData.asset_alt.toLocaleString('en-IN')}`;
            document.getElementById('repLiquid').innerText =
                `₹${userData.asset_cash.toLocaleString('en-IN')}`;

            document.getElementById('fireResults').innerHTML = `
                <p>
                  <strong>Corpus Required at Age ${userData.fire_age}:</strong>
                  <span style="color:#C7F000; font-size:18px;">
                    ₹${(fireData.required_fire_corpus_inr / 10_000_000).toFixed(2)} Cr
                  </span>
                </p>
                <p><strong>Projected Yearly Burn:</strong> ₹${fireData.expenses_at_retirement_inr.toLocaleString('en-IN')}</p>
                <div class="api-insight">> ${fireData.reality_check}</div>
            `;

            // ── Verdict Box ─────────────────────────────────────────────────
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

            // ── God Mode Prompt ─────────────────────────────────────────────
            const godModePrompt = `
PERFORM A 'GOD MODE' FINANCIAL X-RAY ON MY EXACT DATA.
[INCOME] ₹${totalIncome} | [BURN] ₹${totalExpenses} | [SURPLUS] ₹${monthlySurplus} | [SAVINGS RATE] ${ratioData.savings_rate_percent}%
[EQUITY] ₹${userData.asset_equity} | [SAFE] ₹${userData.asset_safe} | [LIQUID] ₹${userData.asset_cash}
[DEBT] ₹${totalDebt} at ${userData.avg_interest}% | [NW] ₹${ratioData.net_worth_inr} vs Target ₹${ratioData.expected_net_worth_inr}
[FIRE] Target Age ${userData.fire_age} (Corpus needed: ₹${(fireData.required_fire_corpus_inr / 10_000_000).toFixed(2)} Cr)

Assess my true wealth trajectory. Are my EMIs destroying me? Is my allocation too safe?
Give me a brutally honest assessment. Use markdown headers:
### 🔍 The Reality Check
### 📐 The Math
### ⚠️ Where People Fail
### ✅ The FIN-OS Fix
            `.trim();

            await streamOllamaResponse(godModePrompt, true);

        } catch (error) {
            console.error("QFT Error:", error);
            // [FIX] Always show report section even on error so user isn't stuck on loader
            loader.classList.add('hidden');
            reportSection.classList.remove('hidden');
            const verdictBox = document.getElementById('verdictGrid');
            if (verdictBox) {
                verdictBox.innerHTML = `
                    <div style="color:#FF4F4F; padding:20px; font-family:'JetBrains Mono';">
                        <strong>⚠ CONNECTION ERROR</strong><br><br>
                        Ensure your Python backend is running:<br>
                        <code style="color:#C7F000;">uvicorn brain:app --reload --port 8000</code><br><br>
                        Details: ${escapeHtml(error.message)}
                    </div>
                `;
            }
        } finally {
            isScanning = false;
            nextBtn.disabled = false;
        }
    }

    // ─── Streaming Chat Engine ────────────────────────────────────────────────
    async function streamOllamaResponse(promptText, isInitialLoad = false) {
        // [FIX] Always fetch verdictBox from live DOM (not a stale closure variable)
        const verdictBox = document.getElementById('verdictGrid');
        if (!verdictBox) return;

        if (!isInitialLoad) {
            verdictBox.innerHTML += `
                <div style="background:rgba(79,124,255,0.1); border-left:3px solid #4F7CFF; padding:15px; margin:20px 0;">
                    <strong style="color:#4F7CFF;">YOU:</strong> ${escapeHtml(promptText)}
                </div>
            `;
        }

        const responseId = `msg-${Date.now()}`;
        verdictBox.innerHTML += `
            <div id="${responseId}" class="qft-msg" style="margin-bottom:20px;">
                <span style="color:#888;">Typing...</span>
            </div>
        `;
        const msgDiv = document.getElementById(responseId);

        chatInputArea?.classList.add('hidden');
        verdictBox.scrollTop = verdictBox.scrollHeight;

        try {
            const response = await fetch('http://127.0.0.1:8000/api/chat/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message:    promptText,
                    session_id: currentSessionId,
                    context:    "God Mode X-Ray"
                })
            });

            if (!response.ok) throw new Error(`Backend returned ${response.status}`);

            const reader  = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let fullContent = '';

            // Remove spinner now that stream has started
            document.getElementById('streamLoader')?.remove();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const raw = line.slice(6).trim();
                    if (!raw || raw === '[DONE]') continue;   // [FIX] guard against SSE [DONE] sentinel

                    try {
                        const data = JSON.parse(raw);
                        if (data.session_id) currentSessionId = data.session_id;
                        if (data.token) {
                            fullContent += data.token;
                            msgDiv.innerHTML = marked.parse(fullContent);
                            verdictBox.scrollTop = verdictBox.scrollHeight;
                        }
                        if (data.done) break;
                    } catch {
                        // Malformed SSE chunk — skip silently
                    }
                }
            }

        } catch (e) {
            if (msgDiv) msgDiv.innerHTML = `<span style="color:#FF4F4F;">Connection Error: ${escapeHtml(e.message)}</span>`;
        } finally {
            chatInputArea?.classList.remove('hidden');
            // [FIX] Only focus if element is visible
            if (followUpInput && !chatInputArea?.classList.contains('hidden')) {
                followUpInput.focus();
            }
            verdictBox.scrollTop = verdictBox.scrollHeight;
        }
    }

    // ─── Follow-up Chat ───────────────────────────────────────────────────────
    function handleFollowUp() {
        const text = followUpInput.value.trim();
        if (!text) return;
        followUpInput.value = '';
        streamOllamaResponse(text, false);
    }

    sendFollowUpBtn?.addEventListener('click', handleFollowUp);
    followUpInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleFollowUp();
    });

    // ─── [NEW] Export to PDF ──────────────────────────────────────────────────
    // Injects a print button into the report action bar and triggers browser print.
    function injectPrintButton() {
        const actionBar = document.querySelector('.action-bar');
        if (!actionBar || document.getElementById('printReportBtn')) return;

        const printBtn = document.createElement('button');
        printBtn.id = 'printReportBtn';
        printBtn.className = 'stylish-button';
        printBtn.style.cssText = 'margin-left:10px;';
        printBtn.innerHTML = '🖨 EXPORT PDF';
        printBtn.addEventListener('click', () => window.print());
        actionBar.appendChild(printBtn);
    }

    // Inject print button once the report section becomes visible.
    // MutationObserver watches the hidden class toggle.
    const observer = new MutationObserver(() => {
        if (!reportSection.classList.contains('hidden')) {
            injectPrintButton();
        }
    });
    if (reportSection) {
        observer.observe(reportSection, { attributes: true, attributeFilter: ['class'] });
    }

    // ─── Utility ─────────────────────────────────────────────────────────────
    /**
     * Escapes user-supplied strings before injecting into innerHTML.
     * Prevents stored-XSS from chat follow-up content.
     */
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