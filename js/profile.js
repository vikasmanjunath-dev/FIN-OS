// js/profile.js

document.addEventListener("DOMContentLoaded", async () => {
    console.log("Profile Engine Starting...");

    // ==========================================
    // 1. CONFIGURATION
    // ==========================================
    const supabaseUrl = 'https://oeapcyucnduhwpgxfknb.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lYXBjeXVjbmR1aHdwZ3hma25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNjE1NjgsImV4cCI6MjA4MzgzNzU2OH0.kyuz385hM4X3j8CMBFfI83ZerorvlXrUDOipAHKDC7Q';

    const client = window.supabase.createClient(supabaseUrl, supabaseKey);

    // ==========================================
    // 2. CHECK USER SESSION
    // ==========================================
    const { data: { session } } = await client.auth.getSession();
    
    if (!session) {
        window.location.href = 'login.html';
        return;
    }

    const user = session.user;

    // ==========================================
    // 3. LOAD SAVED DATA (The "Memory" Logic)
    // ==========================================
    // We select '*' to get ALL columns (mindset, interests, phone, etc.)
    const { data: dbProfile } = await client
        .from('profiles')
        .select('*') 
        .eq('id', user.id)
        .single();

    if (dbProfile) {
        console.log("Loaded Profile:", dbProfile);

        // A. Fill Text Inputs
        if(document.getElementById('profName')) 
            document.getElementById('profName').value = dbProfile.full_name || user.user_metadata.full_name || "";
        
        if(document.getElementById('profPhone')) 
            document.getElementById('profPhone').value = dbProfile.phone || "";
        
        if(document.getElementById('profEmail')) 
            document.getElementById('profEmail').value = user.email;

        if(document.getElementById('profQuery'))
            document.getElementById('profQuery').value = dbProfile.curiosity_query || "";

        // B. Select Dropdowns (Life Stage & Income)
        if (dbProfile.life_stage) {
            const stageSelect = document.getElementById('profStage');
            if(stageSelect) stageSelect.value = dbProfile.life_stage;
        }

        if (dbProfile.income_range) {
            const incomeSelect = document.getElementById('profIncome');
            if(incomeSelect) incomeSelect.value = dbProfile.income_range;
        }

        // C. Select Radio Button (Mindset)
        if (dbProfile.mindset) {
            const radio = document.querySelector(`input[name="mindset"][value="${dbProfile.mindset}"]`);
            if (radio) {
                radio.checked = true;
                // Highlight the parent box for visual effect
                radio.parentElement.style.borderColor = "#C7F000";
                radio.parentElement.style.boxShadow = "0 0 15px rgba(199,240,0,0.2)";
            }
        }

        // D. Highlight Chips (Interests)
        // dbProfile.interests is an array like ['stocks', 'crypto']
        if (dbProfile.interests && Array.isArray(dbProfile.interests)) {
            const chips = document.querySelectorAll('.chip');
            chips.forEach(chip => {
                const val = chip.getAttribute('data-val');
                if (dbProfile.interests.includes(val)) {
                    chip.classList.add('active'); // Turn it ON
                } else {
                    chip.classList.remove('active'); // Ensure others are OFF
                }
            });
        }
    }

    // ==========================================
    // 4. CHART & UI INTERACTION
    // ==========================================
    
    // Chips Click Logic
    const chips = document.querySelectorAll('.chip');
    chips.forEach(chip => {
        chip.addEventListener('click', () => chip.classList.toggle('active'));
    });

    // Radio Highlight Logic
    const radios = document.querySelectorAll('input[name="mindset"]');
    radios.forEach(r => {
        r.addEventListener('change', (e) => {
            // Reset all borders
            document.querySelectorAll('.glow-radio').forEach(l => {
                l.style.borderColor = "rgba(255,255,255,0.1)"; 
                l.style.boxShadow = "none";
            });
            // Highlight selected
            e.target.parentElement.style.borderColor = "#C7F000";
            e.target.parentElement.style.boxShadow = "0 0 15px rgba(199,240,0,0.2)";
        });
    });

    // Chart Setup
    const ctx = document.getElementById('mindsetChart');
    if(ctx) {
        new Chart(ctx.getContext('2d'), {
            type: 'radar',
            data: {
                labels: ['Risk', 'Stability', 'Growth', 'Freedom', 'Control'],
                datasets: [{
                    label: 'Financial Psyche',
                    data: [65, 59, 90, 81, 56],
                    fill: true,
                    backgroundColor: 'rgba(199, 240, 0, 0.2)',
                    borderColor: '#C7F000',
                    pointBackgroundColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { 
                    r: { 
                        grid: { color: 'rgba(255,255,255,0.1)' }, 
                        ticks: { display: false }, 
                        pointLabels: { color: '#fff', font: {size: 10} } 
                    } 
                },
                plugins: { legend: { display: false } }
            }
        });
    }

    // ==========================================
    // 5. SAVE BUTTON LOGIC (Updates Everything)
    // ==========================================
    const saveBtn = document.getElementById('saveProfileBtn');
    
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            saveBtn.innerText = "SAVING...";
            
            // Gather Values
            const nameVal = document.getElementById('profName').value;
            const phoneVal = document.getElementById('profPhone').value;
            
            const stageEl = document.getElementById('profStage');
            const incomeEl = document.getElementById('profIncome');
            const queryEl = document.getElementById('profQuery');
            
            const stageVal = stageEl ? stageEl.value : null;
            const incomeVal = incomeEl ? incomeEl.value : null;
            const queryVal = queryEl ? queryEl.value : null;

            // Get Chips
            const selectedChips = Array.from(document.querySelectorAll('.chip.active'))
                                   .map(c => c.getAttribute('data-val'));

            // Get Radio
            const mindsetEl = document.querySelector('input[name="mindset"]:checked');
            const mindsetVal = mindsetEl ? mindsetEl.value : null;

            // UPDATE DATABASE
            const { error } = await client
                .from('profiles')
                .update({ 
                    full_name: nameVal,
                    phone: phoneVal,
                    life_stage: stageVal,
                    income_range: incomeVal,
                    interests: selectedChips,     // Saves Array
                    mindset: mindsetVal,
                    curiosity_query: queryVal,    // Saves Textarea
                    financial_dna: mindsetVal === 'freedom' ? 'Investor' : 'Saver'
                })
                .eq('id', user.id);

            if (error) {
                alert("Save Failed: " + error.message);
                saveBtn.innerText = "TRY AGAIN";
            } else {
                saveBtn.innerText = "SAVED!";
                setTimeout(() => {
                    window.location.href = 'dna.html';
                }, 800);
            }
        });
    }
});


