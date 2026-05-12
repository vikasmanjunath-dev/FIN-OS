document.addEventListener("DOMContentLoaded", () => {
    // 1. SYSTEM INITIALIZATION
    const rawData = localStorage.getItem('FINOS_CORE_DNA');
    const focusTitle = document.querySelector('.home-hero h3');
    const focusText = document.querySelector('.home-hero p');
    const focusPill = document.querySelector('.home-hero .pill');

    if (!rawData) {
        focusTitle.innerText = "INITIALIZE_SYSTEM";
        focusText.innerText = "Complete DNA Scan Protocol to activate Daily Focus Directives.";
        focusPill.innerText = "STATUS: WAITING_FOR_INPUT";
        return;
    }

    const dnaData = JSON.parse(rawData);

    // 2. AGE PROTOCOL DECODER
    // Map the text response from Level_00 to our library keys
    const ageResponse = dnaData.responses["LEVEL_00"] || "25-35";
    let protocol = "grinder"; 
    if (ageResponse.includes("18-24")) protocol = "rookie";
    if (ageResponse.includes("50+") || ageResponse.includes("46")) protocol = "monk";

    // 3. DNA PARAMETER DECODER
    const traits = ['Risk', 'Security', 'Status', 'Discipline', 'Growth'];
    const maxScore = Math.max(...dnaData.scores);
    const traitIndex = dnaData.scores.indexOf(maxScore);
    const dominantTrait = traits[traitIndex];

    // 4. DAILY ROTATION LOGIC (Day-of-Year % 10)
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = (now - start) + ((start.getTimezoneOffset() - now.getTimezoneOffset()) * 60 * 1000);
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);
    
    // Cycle through 10 cards for each trait
    const rotationIndex = dayOfYear % 10;

    // 5. DATA INJECTION & UI STYLING
    try {
        const todayFocus = focusLibrary[protocol][dominantTrait][rotationIndex];
        
        // Dynamic UI Updates
        focusTitle.classList.add('fade-in');
        focusTitle.innerText = todayFocus.t;
        focusText.innerText = todayFocus.p;
        focusPill.innerText = `DNA: ${dominantTrait.toUpperCase()} | PROTOCOL: ${protocol.toUpperCase()}`;
        
        // Add a terminal-style log to the console if it exists
        const consoleLogs = document.getElementById('console-logs');
        if (consoleLogs) {
            const log = document.createElement('p');
            log.innerHTML = `> Focus Directive Loaded: ${todayFocus.t}... [OK]`;
            consoleLogs.appendChild(log);
        }
    } catch (e) {
        console.error("Focus Engine Error:", e);
        focusTitle.innerText = "PROTOCOL_ERROR";
        focusText.innerText = "Unable to fetch daily focus. Check DNA integrity.";
    }
}); 