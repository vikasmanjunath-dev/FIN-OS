// LAYER_03: HUMAN_SYSTEM ENGINE
function openModule(moduleType) {
    const btn = event.currentTarget.querySelector('.compute-btn');
    const originalText = btn.innerText;

    // 1. Visual Feedback: Simulate Scanning
    btn.innerText = "INITIALIZING_NEURAL_SCAN...";
    btn.style.background = "#4F7CFF"; // Switch to Electric Blue during scan
    btn.style.color = "#fff";

    setTimeout(() => {
        if (moduleType === 'mindset') {
            alert("PROTOCOL_11: Money Mindset Module Initialized. Analyzing early-life conditioning...");
            // In a full build, this would navigate to a detailed questionnaire page
            // window.location.href = 'mindset-deep-dive.html'; 
        }
        
        // Reset button state
        btn.innerText = originalText;
        btn.style.background = "#C7F000";
        btn.style.color = "#000";
    }, 1500);
}

// 2. DNA Radar Map (Existing Logic)
const dnaCtx = document.getElementById('dnaRadar').getContext('2d');
new Chart(dnaCtx, {
    type: 'radar',
    data: {
        labels: ['Risk', 'Status', 'Patience', 'Discipline', 'Growth'],
        datasets: [{
            data: [65, 40, 90, 75, 60],
            backgroundColor: 'rgba(199, 240, 0, 0.2)',
            borderColor: '#C7F000',
            pointBackgroundColor: '#C7F000'
        }]
    },
    options: {
        scales: {
            r: {
                grid: { color: 'rgba(255,255,255,0.1)' },
                pointLabels: { color: '#9AA0B4', font: { family: 'JetBrains Mono' } },
                ticks: { display: false }
            }
        },
        plugins: { legend: { display: false } }
    }
});


/**
 * LAYER_03: HUMAN_SYSTEM ENGINE
 * Functional fix for Module Scanning
 */
window.openModule = function(moduleType, element) {
    // Find the button within the clicked card
    const btn = element.querySelector('.compute-btn');
    if (!btn) return;

    const originalText = btn.innerText;

    // 1. Visual Feedback: High-Intensity Terminal Scan
    btn.innerText = "INITIALIZING_SCAN...";
    btn.style.pointerEvents = "none"; // Disable clicks during scan
    btn.style.opacity = "0.7";

    setTimeout(() => {
        if (moduleType === 'mindset') {
            btn.innerText = "SCAN_COMPLETE";
            btn.style.background = "#4F7CFF"; // Blue for success
            
            // Logical Insight Injection
            const insightBox = element.querySelector('.desi-insight-box');
            insightBox.innerHTML = `<strong>SCAN RESULT:</strong> Status Loop detected. You are overcompensating for childhood scarcity. <br><br><em>Recommendation:</em> Enable 'Friction' on lifestyle spending for 30 days.`;
        }
        
        // Return to interactive state after 2 seconds
        setTimeout(() => {
            btn.innerText = originalText;
            btn.style.background = "#C7F000";
            btn.style.pointerEvents = "auto";
            btn.style.opacity = "1";
        }, 2000);
        
    }, 1500);
};