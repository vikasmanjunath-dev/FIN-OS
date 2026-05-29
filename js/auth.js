// js/auth.js — Optional Supabase helper (no login required)
// Login is not enforced anywhere in FIN•OS. This module silently tries
// Supabase; if it fails or there's no session it falls back to guest mode.

const SUPABASE_URL      = 'https://oeapcyucnduhwpgxfknb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lYXBjeXVjbmR1aHdwZ3hma25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNjE1NjgsImV4cCI6MjA4MzgzNzU2OH0.kyuz385hM4X3j8CMBFfI83ZerorvlXrUDOipAHKDC7Q';

document.addEventListener('DOMContentLoaded', async () => {

    // ── Optional Supabase enrichment ─────────────────────────────────────────
    // Never redirects. If no session or Supabase unavailable → guest mode.
    try {
        if (!window.supabase) return;
        const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        const { data: { session } } = await supabaseClient.auth.getSession();

        if (session) {
            updateUIForUser(session.user);
        } else {
            renderGuestInfo();
        }

        // Wire logout button if present
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                await supabaseClient.auth.signOut().catch(() => {});
                ['finos_display_name', 'finos_financial_dna'].forEach(k => localStorage.removeItem(k));
                window.location.href = '../html/home.html';
            });
        }

        // Wire login button if present (just navigates to home for now)
        const loginBtn = document.getElementById('loginBtn');
        if (loginBtn) {
            loginBtn.addEventListener('click', () => {
                window.location.href = '../html/home.html';
            });
        }

    } catch (e) {
        console.debug('[FIN•OS] auth.js — Supabase optional, running as guest:', e.message);
        renderGuestInfo();
    }
});

function updateUIForUser(user) {
    const authContainer = document.querySelector('.auth-container');
    if (authContainer) {
        authContainer.innerHTML = `
            <span style="font-size:0.9rem;margin-right:10px;">👋 ${user.email}</span>
            <button id="logoutBtn" class="theme-btn" style="border:1px solid #ff4757;color:#ff4757;">Logout</button>
        `;
        document.getElementById('logoutBtn')?.addEventListener('click', async () => {
            try {
                const sb = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                if (sb) await sb.auth.signOut();
            } catch (_) {}
            ['finos_display_name', 'finos_financial_dna'].forEach(k => localStorage.removeItem(k));
            window.location.href = '../html/home.html';
        });
    }
}

function renderGuestInfo() {
    const authContainer = document.querySelector('.auth-container');
    if (authContainer) {
        authContainer.innerHTML = `<span style="font-size:0.9rem;opacity:0.5;">Guest Mode</span>`;
    }
}
