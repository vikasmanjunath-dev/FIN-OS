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

            // Gather data from Supabase if logged in, else use cached/empty
            let transactions = [], goals = [], profile = {};
            const anomalies = [];

            if (client && supabaseUser) {
                const [txRes, goalRes, profileRes] = await Promise.allSettled([
                    client.from('transactions').select('amount,type,category,date')
                        .eq('user_id', supabaseUser.id)
                        .gte('date', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
                        .order('date', { ascending: false }).limit(30),
                    client.from('goals').select('name,target_amount,current_amount,deadline')
                        .eq('user_id', supabaseUser.id).limit(5),
                    client.from('profiles').select('health_score,net_worth,savings_rate,financial_dna')
                        .eq('id', supabaseUser.id).single()
                ]);

                transactions = txRes.value?.data  || [];
                goals        = goalRes.value?.data || [];
                profile      = profileRes.value?.data || {};

                // Anomaly: category > 30% of total spend
                const catSpend = {};
                transactions.filter(t => t.type === 'expense').forEach(t => {
                    catSpend[t.category] = (catSpend[t.category] || 0) + Math.abs(t.amount);
                });
                const totalSpend = Object.values(catSpend).reduce((s, v) => s + v, 0);
                Object.entries(catSpend).forEach(([cat, amt]) => {
                    if (amt / totalSpend > 0.3 && totalSpend > 0)
                        anomalies.push(`⚠ ${cat} spending: ₹${Number(amt).toLocaleString('en-IN')} (${(amt / totalSpend * 100).toFixed(0)}% of budget)`);
                });

                const hasSIP = transactions.some(t => /sip|mutual|invest/i.test(t.category));
                if (!hasSIP) anomalies.push('⚠ No SIP transaction this month detected');
            }

            // Pull any locally stored financial data as fallback context
            const localNetWorth    = parseFloat(localStorage.getItem('finos_net_worth')    || profile.net_worth    || 0);
            const localSavingsRate = parseFloat(localStorage.getItem('finos_savings_rate') || profile.savings_rate || 0);
            const localHealthScore = parseFloat(localStorage.getItem('finos_health_score') || profile.health_score || 0);

            AryaAI.dashboardBrief({
                name:        displayName,
                netWorth:    localNetWorth,
                savingsRate: localSavingsRate,
                healthScore: localHealthScore,
                anomalies,
            }, anchorEl);

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
