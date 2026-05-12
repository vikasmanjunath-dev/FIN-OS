// js/dashboard.js
// js/dashboard.js

// 1. CONFIGURATION
document.addEventListener("DOMContentLoaded", async () => {
    
    // 1. SAFE INITIALIZATION
    // We check if 'supabase' is already defined globally. If not, we create it.
const supabaseUrl = 'https://oeapcyucnduhwpgxfknb.supabase.co'  ;
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lYXBjeXVjbmR1aHdwZ3hma25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNjE1NjgsImV4cCI6MjA4MzgzNzU2OH0.kyuz385hM4X3j8CMBFfI83ZerorvlXrUDOipAHKDC7Q';

    // FIX: We name this 'client' instead of 'supabase' to avoid name collisions
    const client = window.supabase.createClient(supabaseUrl, supabaseKey);

    console.log("Dashboard engine started...");

    // 2. CHECK LOGIN
    const { data: { session } } = await client.auth.getSession();

    if (!session) {
        console.log("No session found. Redirecting...");
        window.location.href = 'login.html';
        return;
    }

    const user = session.user;
    console.log("User detected:", user.email);

    // 3. GET NAME (Metadata -> DB -> Email)
    let displayName = user.user_metadata.full_name;

    // If no metadata name, check Database
    if (!displayName) {
        const { data: profile } = await client
            .from('profiles')
            .select('full_name, financial_dna')
            .eq('id', user.id)
            .single();
        
        if (profile && profile.full_name) {
            displayName = profile.full_name;
        }
        
        // While we are here, update the DNA tag
        const dnaEl = document.getElementById('userDNA');
        if (dnaEl && profile) {
            dnaEl.innerText = profile.financial_dna || "Unassigned";
        }
    }

    // Fallback to email
    if (!displayName) {
        displayName = user.email.split('@')[0];
    }

    // 4. UPDATE HTML
    const nameEl = document.getElementById('userName');
    if (nameEl) {
        nameEl.innerText = displayName;
        // Make sure it's visible (in case css hid it)
        nameEl.style.opacity = "1"; 
    }

    // 5. LOGOUT HANDLER
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await client.auth.signOut();
            window.location.href = 'login.html';
        });
    }
});

requireOnboarding();

const articles = [
  { title: "Why inflation hurts your lifestyle", minAge: 20 },
  { title: "₹500 SIP vs delaying investment", minAge: 18 },
  { title: "Good debt vs bad debt (India)", minAge: 22 },
  { title: "EMI lifestyle disease", minAge: 25 },
  { title: "RBI decisions explained for you", minAge: 21 }
];

function loadDailyFeed() {
  const feed = document.querySelector(".cards");
  feed.innerHTML = "";

  articles.slice(0, 5).forEach(a => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerText = a.title;
    feed.appendChild(card);
  });
}

loadDailyFeed();
