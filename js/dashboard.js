// js/dashboard.js
// No login required — works in guest mode with optional Supabase enrichment.

const _SUPABASE_URL = 'https://oeapcyucnduhwpgxfknb.supabase.co';
const _SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lYXBjeXVjbmR1aHdwZ3hma25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNjE1NjgsImV4cCI6MjA4MzgzNzU2OH0.kyuz385hM4X3j8CMBFfI83ZerorvlXrUDOipAHKDC7Q';

document.addEventListener("DOMContentLoaded", async () => {

    // ── 1. RESOLVE DISPLAY NAME ─────────────────────────────────────────────
    // Priority: localStorage saved name → Supabase session → "User"
    let displayName = localStorage.getItem('finos_display_name') || '';
    let dnaTag      = localStorage.getItem('finos_financial_dna') || '';
    let supabaseUser = null;
    let client = null;

    // Try Supabase silently — never redirect if it fails
    try {
        if (window.supabase) {
            client = window.supabase.createClient(_SUPABASE_URL, _SUPABASE_KEY);
            const { data: { session } } = await client.auth.getSession();

            if (session) {
                supabaseUser = session.user;

                // Get name from metadata first
                displayName = session.user.user_metadata?.full_name || displayName;

                // Then try DB profile
                try {
                    const { data: profile } = await client
                        .from('profiles')
                        .select('full_name, financial_dna')
                        .eq('id', session.user.id)
                        .single();

                    if (profile?.full_name)    displayName = profile.full_name;
                    if (profile?.financial_dna) dnaTag     = profile.financial_dna;
                } catch (_) { /* DB not set up — no problem */ }

                // Fallback to email prefix
                if (!displayName) {
                    displayName = session.user.email.split('@')[0];
                }

                // Cache for offline use
                localStorage.setItem('finos_display_name', displayName);
                if (dnaTag) localStorage.setItem('finos_financial_dna', dnaTag);
            }
        }
    } catch (e) {
        console.debug('[Dashboard] Supabase optional — continuing as guest:', e.message);
    }

    // Final fallback
    if (!displayName) displayName = 'Trader';

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

            // ── Use finos-context.js enriched data (DB + budget tracker + journal)
            // Wait up to 5s for full Supabase sync, then proceed with whatever we have
            AryaAI.onContextReady(async (finosCtx) => {
                const prof = finosCtx?.profile || {};
                const tx   = finosCtx?.financial?.transactions || {};
                const goals_db = finosCtx?.financial?.goals || [];
                const portfolio = finosCtx?.financial?.portfolio || null;
                const budget = finosCtx?.budget_tracker || null;
                const journal = finosCtx?.trade_journal || null;

                // Build anomaly list from DB transaction data
                const anomalies = [];
                if (tx.top_categories?.length) {
                    const totalSpend = tx.total_expense || 0;
                    tx.top_categories.forEach(c => {
                        const pct = totalSpend > 0 ? Math.round((c.amt / totalSpend) * 100) : 0;
                        if (pct > 30) anomalies.push(`⚠ ${c.cat} is ${pct}% of expenses (₹${Number(c.amt).toLocaleString('en-IN')})`);
                    });
                }
                if (budget && !budget.goals?.some(g => /sip|invest|mutual/i.test(g.name || ''))) {
                    anomalies.push('⚠ No SIP/investment goal tracked in Budget Tracker');
                }
                if (journal?.total_trades > 0 && journal.win_rate < 40) {
                    anomalies.push(`⚠ Trade journal: win rate ${journal.win_rate}% — below 40% threshold`);
                }
                if (portfolio && portfolio.pnl_pct < -10) {
                    anomalies.push(`⚠ Portfolio down ${portfolio.pnl_pct}% overall`);
                }
                // Goals behind target
                goals_db.filter(g => g.progress < 25 && g.deadline).forEach(g => {
                    anomalies.push(`⚠ Goal "${g.name}" only ${g.progress}% complete`);
                });

                const netWorth    = parseFloat(prof.net_worth    || localStorage.getItem('finos_net_worth')    || 0);
                const savingsRate = parseFloat(prof.savings_rate || localStorage.getItem('finos_savings_rate') || budget?.savings_rate || 0);
                const healthScore = parseFloat(prof.health_score || localStorage.getItem('finos_health_score') || 0);

                AryaAI.dashboardBrief({
                    name:        displayName,
                    netWorth,
                    savingsRate,
                    healthScore,
                    anomalies:   anomalies.slice(0, 5),
                    customNote:  journal?.total_trades > 0
                        ? `Trade journal: ${journal.total_trades} trades, ${journal.win_rate}% win rate`
                        : (budget ? `Budget tracker active: savings rate ${budget.savings_rate}%` : null),
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
