// js/profile.js — No login required. Works fully in guest mode.
// Data is saved to localStorage first; Supabase sync is optional & silent.

document.addEventListener("DOMContentLoaded", async () => {
    console.log("Profile Engine Starting...");

    // ── 1. SUPABASE (Optional) ────────────────────────────────────────────────
    const SUPA_URL = 'https://oeapcyucnduhwpgxfknb.supabase.co';
    const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lYXBjeXVjbmR1aHdwZ3hma25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNjE1NjgsImV4cCI6MjA4MzgzNzU2OH0.kyuz385hM4X3j8CMBFfI83ZerorvlXrUDOipAHKDC7Q';

    let client = null;
    let user   = null;

    try {
        if (window.supabase) {
            client = window.supabase.createClient(SUPA_URL, SUPA_KEY);
            const { data: { session } } = await client.auth.getSession();
            if (session) user = session.user;
        }
    } catch (e) {
        console.debug('[Profile] Supabase optional — guest mode:', e.message);
    }

    // ── 2. LOAD SAVED DATA ────────────────────────────────────────────────────
    // Priority: Supabase DB → localStorage cache
    let dbProfile = null;

    if (client && user) {
        try {
            const { data } = await client.from('profiles').select('*').eq('id', user.id).single();
            dbProfile = data;
        } catch (_) {}
    }

    // Merge: DB wins over localStorage
    const lsName    = localStorage.getItem('finos_display_name') || '';
    const lsPhone   = localStorage.getItem('finos_phone')        || '';
    const lsEmail   = user?.email || localStorage.getItem('finos_email') || '';
    const lsStage   = localStorage.getItem('finos_stage')        || '';
    const lsIncome  = localStorage.getItem('finos_income')       || '';
    const lsQuery   = localStorage.getItem('finos_query')        || '';
    const lsMindset = localStorage.getItem('finos_mindset')      || '';
    const lsInterests = (() => {
        try { return JSON.parse(localStorage.getItem('finos_interests') || '[]'); } catch { return []; }
    })();

    const name      = dbProfile?.full_name    || lsName;
    const phone     = dbProfile?.phone        || lsPhone;
    const stage     = dbProfile?.life_stage   || lsStage;
    const income    = dbProfile?.income_range || lsIncome;
    const query     = dbProfile?.curiosity_query || lsQuery;
    const mindset   = dbProfile?.mindset      || lsMindset;
    const interests = dbProfile?.interests    || lsInterests;

    // ── 3. POPULATE FORM ──────────────────────────────────────────────────────
    if (document.getElementById('profName'))  document.getElementById('profName').value  = name;
    if (document.getElementById('profPhone')) document.getElementById('profPhone').value = phone;
    if (document.getElementById('profEmail')) document.getElementById('profEmail').value = lsEmail;
    if (document.getElementById('profQuery')) document.getElementById('profQuery').value = query;

    const stageEl = document.getElementById('profStage');
    if (stageEl && stage) stageEl.value = stage;

    const incomeEl = document.getElementById('profIncome');
    if (incomeEl && income) incomeEl.value = income;

    if (mindset) {
        const radio = document.querySelector(`input[name="mindset"][value="${mindset}"]`);
        if (radio) {
            radio.checked = true;
            radio.parentElement.style.borderColor = "#C7F000";
            radio.parentElement.style.boxShadow   = "0 0 15px rgba(199,240,0,0.2)";
        }
    }

    if (Array.isArray(interests) && interests.length) {
        document.querySelectorAll('.chip').forEach(chip => {
            const val = chip.getAttribute('data-val');
            chip.classList.toggle('active', interests.includes(val));
        });
    }

    // ── 4. CHIP & RADIO UI ───────────────────────────────────────────────────
    document.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', () => chip.classList.toggle('active'));
    });

    document.querySelectorAll('input[name="mindset"]').forEach(r => {
        r.addEventListener('change', (e) => {
            document.querySelectorAll('.glow-radio').forEach(l => {
                l.style.borderColor = "rgba(255,255,255,0.1)";
                l.style.boxShadow   = "none";
            });
            e.target.parentElement.style.borderColor = "#C7F000";
            e.target.parentElement.style.boxShadow   = "0 0 15px rgba(199,240,0,0.2)";
        });
    });

    // ── 5. RADAR CHART ───────────────────────────────────────────────────────
    const ctx = document.getElementById('mindsetChart');
    if (ctx) {
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
                        pointLabels: { color: '#fff', font: { size: 10 } }
                    }
                },
                plugins: { legend: { display: false } }
            }
        });
    }

    // ── 6. SAVE BUTTON ───────────────────────────────────────────────────────
    const saveBtn = document.getElementById('saveProfileBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            saveBtn.innerText = "SAVING...";

            const nameVal    = document.getElementById('profName')?.value  || '';
            const phoneVal   = document.getElementById('profPhone')?.value || '';
            const stageVal   = document.getElementById('profStage')?.value || '';
            const incomeVal  = document.getElementById('profIncome')?.value|| '';
            const queryVal   = document.getElementById('profQuery')?.value || '';
            const mindsetVal = document.querySelector('input[name="mindset"]:checked')?.value || '';
            const selectedChips = Array.from(document.querySelectorAll('.chip.active'))
                                       .map(c => c.getAttribute('data-val'));
            const dnaTag = mindsetVal === 'freedom' ? 'Investor'
                         : mindsetVal === 'security' ? 'Safety-First Builder'
                         : mindsetVal === 'stress'   ? 'Rebuilder'
                         : 'Explorer';

            // ── Always save to localStorage ──────────────────────────────────
            localStorage.setItem('finos_display_name',   nameVal);
            localStorage.setItem('finos_phone',          phoneVal);
            localStorage.setItem('finos_stage',          stageVal);
            localStorage.setItem('finos_income',         incomeVal);
            localStorage.setItem('finos_query',          queryVal);
            localStorage.setItem('finos_mindset',        mindsetVal);
            localStorage.setItem('finos_interests',      JSON.stringify(selectedChips));
            localStorage.setItem('finos_financial_dna',  dnaTag);

            // ── Silently sync to Supabase if logged in ───────────────────────
            if (client && user) {
                try {
                    await client.from('profiles').update({
                        full_name:        nameVal,
                        phone:            phoneVal,
                        life_stage:       stageVal,
                        income_range:     incomeVal,
                        interests:        selectedChips,
                        mindset:          mindsetVal,
                        curiosity_query:  queryVal,
                        financial_dna:    dnaTag,
                    }).eq('id', user.id);
                } catch (e) {
                    console.debug('[Profile] Supabase save skipped:', e.message);
                }
            }

            saveBtn.innerText = "✓ SAVED!";
            saveBtn.style.background = 'linear-gradient(135deg, #00c853, #00bfa5)';

            // Don't redirect — let the AI DNA analysis play out on this page
            setTimeout(() => {
                saveBtn.innerText = "BUILD MY FINANCIAL DNA";
                saveBtn.style.background = '';
            }, 3000);
        });
    }
});
