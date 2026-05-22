// js/auth.js

const SUPABASE_URL      = 'https://oeapcyucnduhwpgxfknb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lYXBjeXVjbmR1aHdwZ3hma25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNjE1NjgsImV4cCI6MjA4MzgzNzU2OH0.kyuz385hM4X3j8CMBFfI83ZerorvlXrUDOipAHKDC7Q';

// Fix [03]: The original code wrote `const supabase = supabase.createClient(...)`
// which is a temporal dead zone ReferenceError — the binding is read before it
// is initialized. Use `window.supabase` (the CDN namespace object) explicitly.
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function buildAppUrl(page) {
    return new URL(page, window.location.href).href;
}

// ── Auth state listener ──────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {

    const { data: { session } } = await supabaseClient.auth.getSession();

    if (session) {
        updateUIForUser(session.user);
    } else {
        // Fix [09]: Guard was an allowlist of two paths (dashboard, portfolio).
        // All other protected pages were freely accessible without login.
        // Flip to an allowlist of PUBLIC pages — everything else requires auth.
        const PUBLIC_PATHS = [
            '/index.html',
            '/login.html',
            '/',
        ];
        const path = window.location.pathname;
        const isPublic = PUBLIC_PATHS.some(p => path.endsWith(p)) || path === '/';

        if (!isPublic) {
            window.location.replace('../login.html');
            return;
        }
    }

    // Fix [02] (partial): loginBtn on index.html should only navigate to
    // login.html. No localStorage fake-auth flags.
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            window.location.href = '../login.html';
        });
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', signOut);
    }
});

// ── Sign-in (magic link OTP) ─────────────────────────────────────────────────

async function signInWithMagicLink() {
    const email = prompt('Enter your email for a Magic Link login:');
    if (!email) return;

    const { error } = await supabaseClient.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: buildAppUrl('dashboard.html') },
    });

    if (error) {
        alert('Error: ' + error.message);
    } else {
        alert('Check your email! We sent you a magic link.');
    }
}

// ── Sign-out ─────────────────────────────────────────────────────────────────

async function signOut() {
    const { error } = await supabaseClient.auth.signOut();
    if (!error) {
        window.location.href = '../login.html';
    }
}

// ── UI updater ───────────────────────────────────────────────────────────────

function updateUIForUser(user) {
    const authContainer = document.querySelector('.auth-container');
    if (authContainer) {
        authContainer.innerHTML = `
            <span style="font-size:0.9rem;margin-right:10px;">👋 ${user.email}</span>
            <button id="logoutBtn" class="theme-btn" style="border:1px solid #ff4757;color:#ff4757;">Logout</button>
        `;
        document.getElementById('logoutBtn').addEventListener('click', signOut);
    }
}
