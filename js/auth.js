// js/auth.js

// 1. Initialize Supabase
// REPLACE THESE WITH YOUR KEYS FROM SUPABASE DASHBOARD -> SETTINGS -> API
const SUPABASE_URL = 'https://oeapcyucnduhwpgxfknb.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lYXBjeXVjbmR1aHdwZ3hma25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNjE1NjgsImV4cCI6MjA4MzgzNzU2OH0.kyuz385hM4X3j8CMBFfI83ZerorvlXrUDOipAHKDC7Q';

const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function buildAppUrl(page) {
    return new URL(page, window.location.href).href;
}

// 2. Auth State Listener
// This runs on every page load to check "Is the user logged in?"
document.addEventListener("DOMContentLoaded", async () => {
    
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
        // User is logged in
        updateUIForUser(session.user);
    } else {
        // User is NOT logged in
        // If we are on a protected page (like Dashboard), kick them to home
        const path = window.location.pathname;
        if (path.includes('dashboard') || path.includes('portfolio')) {
            window.location.href = 'home.html'; 
        }
    }

    // Attach Login Button Listener
    const loginBtn = document.getElementById('loginBtn'); // You need to add this ID to your HTML button
    if(loginBtn) {
        loginBtn.addEventListener('click', signInWithGoogle);
    }
    
    // Attach Logout Button Listener
    const logoutBtn = document.getElementById('logoutBtn');
    if(logoutBtn) {
        logoutBtn.addEventListener('click', signOut);
    }
});

// 3. Sign In Function (Google)
// REPLACE the old signInWithGoogle function with this:

async function signInWithGoogle() {
    // Let's ask the user for an email (Simple prompt for now)
    const email = prompt("Enter your email for a Magic Link login:");
    
    if (!email) return;

    const { data, error } = await supabase.auth.signInWithOtp({
        email: email,
        options: {
            emailRedirectTo: buildAppUrl('dashboard.html')
        }
    });

    if (error) {
        alert("Error: " + error.message);
    } else {
        alert("Check your email! We sent you a magic link.");
    }
}

// 4. Sign Out Function
async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (!error) {
        window.location.href = 'home.html';
    }
}

// 5. UI Updater
function updateUIForUser(user) {
    console.log("Logged in as:", user.email);
    
    // Example: Change "Login" button to "Logout"
    const authContainer = document.querySelector('.auth-container'); // Need a container in your nav
    if (authContainer) {
        authContainer.innerHTML = `
            <span style="font-size:0.9rem; margin-right:10px;">👋 ${user.email}</span>
            <button id="logoutBtn" class="theme-btn" style="border:1px solid #ff4757; color:#ff4757;">Logout</button>
        `;
        // Re-attach listener to new button
        document.getElementById('logoutBtn').addEventListener('click', signOut);
    }
}
