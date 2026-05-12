/* ============================================================
   FIN-OS: GENESIS ENGINE (login.js)
   Protocol: Neural Auth & Interactive Visuals
   ============================================================ */

import { 
    auth, 
    googleProvider, 
    signInWithPopup, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword 
} from "./firebase-config.js";

document.addEventListener("DOMContentLoaded", () => {
    
    console.log("FIN-OS: Script loaded");
    
    // --- 1. THEME INITIALIZATION ---
    const themeToggle = document.getElementById('themeToggle');
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    themeToggle?.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
    });

    // --- 2. NEURAL TAB SWITCHER (IDENTITY vs GENESIS) ---
    const tabs = document.querySelectorAll(".mode-btn");
    const forms = document.querySelectorAll(".auth-form");
    const glassContainer = document.querySelector(".auth-glass");
    
    console.log("Tabs found:", tabs.length);
    console.log("Forms found:", forms.length);

    if (tabs.length === 0) {
        alert("ERROR: Tab buttons not found! Check your HTML.");
        return;
    }

    // FORM SWITCHING ENGINE
    tabs.forEach((tab, index) => {
        console.log(`Setting up tab ${index}:`, tab.dataset.target);
        
        tab.addEventListener("click", (e) => {
            e.preventDefault();
            const targetMode = tab.dataset.target;
            
            alert(`🚀 TAB CLICKED: ${targetMode.toUpperCase()}`);
            console.log("Switching to:", targetMode);

            // Update Tabs UI
            tabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");

            // Toggle Visibility - Directly target the forms
            const identityForm = document.getElementById('identityForm');
            const genesisForm = document.getElementById('genesisForm');

            if (targetMode === 'identity') {
                identityForm.classList.add('active');
                genesisForm.classList.remove('active');
            } else if (targetMode === 'genesis') {
                identityForm.classList.remove('active');
                genesisForm.classList.add('active');
            }

            // Unreal Motion: Subtle tilt on switch
            if (glassContainer) {
                glassContainer.style.transform = "perspective(1000px) rotateY(10deg)";
                setTimeout(() => {
                    glassContainer.style.transform = "perspective(1000px) rotateY(0deg)";
                }, 300);
            }
        });
    });

    // --- 3. PASSWORD STRENGTH DNA (Interactive Visual) ---
    const passwordInput = document.getElementById('regPass');
    const strengthFill = document.querySelector('.strength-meter .fill');

    passwordInput?.addEventListener('input', (e) => {
        const val = e.target.value;
        let strength = 0;
        if (val.length > 5) strength += 30;
        if (/[A-Z]/.test(val)) strength += 30;
        if (/[0-9]/.test(val)) strength += 40;

        strengthFill.style.width = `${strength}%`;
        
        // Color mapping based on "Financial DNA" strength
        if (strength < 40) strengthFill.style.background = "#ff4757"; // Dangerous
        else if (strength < 80) strengthFill.style.background = "#ffa502"; // Weak
        else strengthFill.style.background = "#C7F000"; // Solid (FIN-OS Approved)
    });

    // --- 4. DESI ANALOGY INTERACTION ---
    const analogyCards = document.querySelectorAll(".desi-card");
    analogyCards.forEach(card => {
        card.addEventListener("click", () => {
            // Visual trigger to show selection
            analogyCards.forEach(c => c.style.borderColor = "rgba(255,255,255,0.1)");
            card.style.borderColor = "#C7F000";
            
            // Haptic-style subtle bounce
            card.style.transform = "scale(0.95)";
            setTimeout(() => card.style.transform = "scale(1)", 150);
        });
    });

    // --- 5. FIREBASE AUTHENTICATION PROTOCOLS ---
    
    // Login Submission
    document.getElementById("identityForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("loginEmail").value;
        const pass = document.getElementById("loginPass").value;

        try {
            await signInWithEmailAndPassword(auth, email, pass);
            window.location.href = "home.html"; // Navigate to OS Home
        } catch (err) {
            alert("Identity Verification Failed: " + err.message);
        }
    });

    // Signup Submission (Genesis Block)
    document.getElementById("genesisForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("regEmail").value;
        const pass = document.getElementById("regPass").value;
        const name = document.getElementById("regName").value;

        try {
            const userCred = await createUserWithEmailAndPassword(auth, email, pass);
            // Optional: Store name in localStorage for personalization
            localStorage.setItem("finos_username", name);
            window.location.href = "onboarding.html"; 
        } catch (err) {
            alert("Genesis Block Creation Failed: " + err.message);
        }
    });

    // Google Neural Link
    document.querySelector(".btn-google-neo")?.addEventListener("click", async () => {
        try {
            await signInWithPopup(auth, googleProvider);
            window.location.href = "home.html";
        } catch (err) {
            console.error(err);
        }
    });

    // --- 6. NEBULA MOUSE TRACKING (Out-of-this-world UX) ---
    document.addEventListener("mousemove", (e) => {
        const moveX = (e.clientX - window.innerWidth / 2) * 0.01;
        const moveY = (e.clientY - window.innerHeight / 2) * 0.01;
        
        // The nebula background shifts slightly with mouse movement
        const nebula = document.getElementById('nebula');
        if (nebula) {
            nebula.style.transform = `translate(${moveX}px, ${moveY}px) scale(1.1)`;
        }
    });
});