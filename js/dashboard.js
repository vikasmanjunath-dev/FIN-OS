// js/dashboard.js
// Supabase credentials live in finos-personalization.js — do not duplicate here.
// We use window.FINOS_USER_CONTEXT (set by finos-context.js) for all user data.

document.addEventListener("DOMContentLoaded", async () => {

    // ── 1. RESOLVE DISPLAY NAME ─────────────────────────────────────────────
    // finos-context.js runs synchronously before this script and populates
    // window.FINOS_USER_CONTEXT from localStorage immediately (Phase 1), then
    // enriches it from Supabase async (Phase 2). We just read it here — no
    // second Supabase client needed on this page.
    let displayName = (
        window.FINOS_USER_CONTEXT?.identity?.name ||
        localStorage.getItem('finos_display_name') ||
        'Investor'
    );
    let dnaTag = (
        window.FINOS_USER_CONTEXT?.identity?.financial_dna ||
        localStorage.getItem('finos_financial_dna') ||
        ''
    );

    // Update displayName when DB enrichment completes (async, non-blocking)
    window.addEventListener('finos-context-ready', function _nameRefresh(e) {
        if (e.detail?.phase !== 'full') return;
        const fresh = window.FINOS_USER_CONTEXT?.identity?.name;
        if (fresh && fresh !== displayName) {
            displayName = fresh;
            const nameEl = document.getElementById('userName');
            if (nameEl) nameEl.innerText = displayName;
        }
        window.removeEventListener('finos-context-ready', _nameRefresh);
    });

    // ── 2. UPDATE HEADER ─────────────────────────────────────────────────────
    const nameEl = document.getElementById('userName');
    if (nameEl) {
        nameEl.innerText = displayName;
        nameEl.style.opacity = '1';
    }

    const dnaEl = document.getElementById('userDNA');
    if (dnaEl) {
        dnaEl.innerText = dnaTag || 'Explorer';
    }

    // ── 3. LOGOUT HANDLER ────────────────────────────────────────────────────
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            // Clear local cache
            ['finos_display_name', 'finos_financial_dna'].forEach(k => localStorage.removeItem(k));
            if (client) {
                try { await client.auth.signOut(); } catch (_) {}
            }
            window.location.href = 'home.html';
        });
    }

    // ── 4. ARYA AI MORNING BRIEF ─────────────────────────────────────────────
    // One-time cleanup: purge old v1 cache that may contain broken think tokens
    try {
        const todayStr = new Date().toDateString();
        const oldKey = 'arya_dash_brief_' + todayStr;
        const oldVal = sessionStorage.getItem(oldKey);
        if (oldVal && (oldVal.includes('<think>') || oldVal.length < 15)) {
            sessionStorage.removeItem(oldKey);
        }
    } catch (_) {}

    if (typeof AryaAI !== 'undefined') {
        try {
            const anchorEl = document.getElementById('arya-brief-placeholder');

            // Wait up to 5s for full Supabase sync, then build the richest possible brief.
            AryaAI.onContextReady(async (finosCtx) => {
                const prof     = finosCtx?.profile || {};
                const tx       = finosCtx?.financial?.transactions || {};
                const goals_db = finosCtx?.financial?.goals || [];
                const portfolio = finosCtx?.financial?.portfolio || null;
                const budget   = finosCtx?.budget_tracker || null;
                const journal  = finosCtx?.trade_journal || null;

                // ── Build anomaly chips ────────────────────────────────────────
                const anomalies = [];
                if (tx.top_categories?.length) {
                    tx.top_categories.forEach(c => {
                        const pct = tx.total_expense > 0
                            ? Math.round((c.amt / tx.total_expense) * 100) : 0;
                        if (pct > 30) anomalies.push(`⚠ ${c.cat} = ${pct}% of expenses`);
                    });
                }
                if (budget && !budget.goals?.some(g => /sip|invest|mutual/i.test(g.name || ''))) {
                    anomalies.push('⚠ No SIP goal found in budget tracker');
                }
                if (journal?.total_trades > 0 && journal.win_rate < 40) {
                    anomalies.push(`⚠ Win rate ${journal.win_rate}% — below 40%`);
                }
                if (portfolio?.pnl_pct < -10) {
                    anomalies.push(`⚠ Portfolio down ${portfolio.pnl_pct}%`);
                }
                goals_db.filter(g => g.progress < 25 && g.deadline).forEach(g => {
                    anomalies.push(`⚠ Goal "${g.name}" only ${g.progress}% funded`);
                });

                const netWorth    = parseFloat(prof.net_worth    || localStorage.getItem('finos_net_worth')    || 0);
                const savingsRate = parseFloat(prof.savings_rate || localStorage.getItem('finos_savings_rate') || budget?.savings_rate || 0);
                const healthScore = parseFloat(prof.health_score || localStorage.getItem('finos_health_score') || 0);

                // ── Optional: voice agent server-side anomaly enrichment ──────
                let wsAnomalies = [];
                try {
                    wsAnomalies = await new Promise((resolve) => {
                        const ws = new WebSocket('ws://127.0.0.1:8765');
                        const timer = setTimeout(() => { try { ws.close(); } catch {} resolve([]); }, 4000);
                        ws.onopen  = () => ws.send(JSON.stringify({ type: 'dashboard_brief' }));
                        ws.onmessage = (e) => {
                            try {
                                const msg = JSON.parse(e.data);
                                if (msg.type === 'dashboard_brief_result') {
                                    clearTimeout(timer); ws.close();
                                    resolve((msg.anomalies || []).map(a => `⚠ ${a.message || a}`));
                                }
                            } catch {}
                        };
                        ws.onerror = () => { try { ws.close(); } catch {} resolve([]); };
                    });
                } catch { wsAnomalies = []; }

                const allAnomalies = [...new Set([...wsAnomalies, ...anomalies])].slice(0, 5);

                // ── Build a rich customNote from actual user data ──────────────
                // FinosPersona.buildRichBriefPrompt provides the fully structured
                // context string; we pass it as customNote so AryaAI includes it.
                let richNote = null;
                if (typeof FinosPersona !== 'undefined') {
                    richNote = FinosPersona.buildRichBriefPrompt(displayName);
                } else {
                    // Fallback: build a compact note from available data
                    const parts = [];
                    if (budget?.top_categories?.length) {
                        parts.push(`Top spend: ${budget.top_categories.slice(0,2).map(c=>`${c.cat} ₹${Number(c.amt).toLocaleString('en-IN')}`).join(', ')}`);
                    }
                    if (goals_db.length) {
                        parts.push(`Goals: ${goals_db.slice(0,2).map(g=>`${g.name} ${g.progress||0}%`).join(' | ')}`);
                    }
                    if (journal?.total_trades > 0) {
                        parts.push(`Trading: ${journal.total_trades} trades, ${journal.win_rate}% win rate`);
                    }
                    if (portfolio) {
                        parts.push(`Portfolio P&L: ${portfolio.pnl_pct > 0 ? '+' : ''}${portfolio.pnl_pct}%`);
                    }
                    richNote = parts.join('. ') || null;
                }

                AryaAI.dashboardBrief({
                    name:        displayName,
                    netWorth,
                    savingsRate,
                    healthScore,
                    anomalies:   allAnomalies,
                    customNote:  richNote,
                }, anchorEl);

            }, 5000);

        } catch (e) {
            console.debug('[Arya] Dashboard brief skipped:', e.message);
        }
    }
});

// ── 5. DAILY FEED ─────────────────────────────────────────────────────────────
const articles = [
    { title: "Why inflation hurts your lifestyle", minAge: 20 },
    { title: "₹500 SIP vs delaying investment",   minAge: 18 },
    { title: "Good debt vs bad debt (India)",      minAge: 22 },
    { title: "EMI lifestyle disease",              minAge: 25 },
    { title: "RBI decisions explained for you",   minAge: 21 },
];

function loadDailyFeed() {
    const feed = document.querySelector(".cards");
    if (!feed) return;
    // Cards are already rendered in HTML — no need to re-inject
}

loadDailyFeed();
