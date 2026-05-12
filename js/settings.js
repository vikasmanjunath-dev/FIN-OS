document.addEventListener('DOMContentLoaded', () => {


    
    // 1. Load existing system settings from LocalStorage
    const savedSettings = JSON.parse(localStorage.getItem('FINOS_SYS_SETTINGS')) || {
        theme: 'dark',
        accent: '#4F7CFF',
        format: 'in',
        reduceMotion: false
    };

    // 2. Initialize UI states based on saved settings
    initSettingsUI(savedSettings);

    // 3. THEME TOGGLE LOGIC
    /**
 * SETTINGS PAGE SPECIFIC LOGIC
 */
window.updateTheme = function(value) {
    const html = document.documentElement;
    let finalTheme = value;

    if (value === 'system') {
        finalTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    html.setAttribute('data-theme', finalTheme);

    const btn = document.getElementById('themeToggle');
    if (btn) btn.textContent = finalTheme === 'dark' ? '🌙' : '☀️';

    const settings = JSON.parse(localStorage.getItem('FINOS_SYS_SETTINGS')) || {};
    settings.theme = value;
    localStorage.setItem('FINOS_SYS_SETTINGS', JSON.stringify(settings));
    localStorage.setItem('finos-theme', finalTheme);
    localStorage.setItem('theme', finalTheme);
};

    // 4. ACCENT COLOR LOGIC
    const colorBtns = document.querySelectorAll('.color-btn');
    colorBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const color = btn.style.backgroundColor;
            // Update CSS Variable globally
            document.documentElement.style.setProperty('--accent', color);
            
            // UI Feedback
            colorBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            saveSetting('accent', color);
        });
    });

    // 5. HELPER: Persist to Storage
    function saveSetting(key, value) {
        const settings = JSON.parse(localStorage.getItem('FINOS_SYS_SETTINGS')) || {};
        settings[key] = value;
        localStorage.setItem('FINOS_SYS_SETTINGS', JSON.stringify(settings));
        console.log(`> SYSTEM: Setting [${key}] updated to [${value}]`);
    }

    function initSettingsUI(config) {
        var currentTheme = document.documentElement.getAttribute('data-theme') || config.theme || 'dark';
        if (currentTheme === 'system') {
            currentTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        document.getElementById('themeSelect').value = currentTheme;
        document.documentElement.setAttribute('data-theme', currentTheme);
        var btn = document.getElementById('themeToggle');
        if (btn) btn.textContent = currentTheme === 'dark' ? '🌙' : '☀️';
        document.documentElement.style.setProperty('--accent', config.accent);
    }
});



/**
 * FIN•OS ACCOUNT & SYSTEM LOGIC
 */

// 1. UPDATE EMAIL
window.updateEmail = function() {
    const newEmail = prompt("Enter new email address:", "user@fin-os.com");
    if (newEmail) {
        document.getElementById('currentEmail').textContent = newEmail;
        console.log(`> SYSTEM: Email updated to ${newEmail}`);
    }
};

// 2. CHANGE PASSWORD
window.changePassword = function() {
    const confirmPass = confirm("Trigger password reset email?");
    if (confirmPass) {
        alert("Security protocol initiated. Check your inbox.");
    }
};

// 3. SIGN OUT
window.signOut = function() {
    const confirmOut = confirm("Are you sure you want to terminate the session?");
    if (confirmOut) {
        console.log("> SYSTEM: Terminating session...");
        // Clear session specific data (but keep global settings)
        window.location.href = 'home.html'; 
    }
};

// 4. THEME & ACCENT LOGIC (Previously Defined)
window.toggleAppTheme = function() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(newTheme);
    saveSetting('theme', newTheme);
};

function applyTheme(theme) {
    const html = document.documentElement;
    html.setAttribute('data-theme', theme);
    const btn = document.getElementById('themeToggle');
    if (btn) btn.textContent = theme === 'dark' ? '🌙' : '☀️';
    const sel = document.getElementById('themeSelect');
    if (sel) sel.value = theme;
    localStorage.setItem('finos-theme', theme);
    localStorage.setItem('theme', theme);
}

function saveSetting(key, value) {
    const settings = JSON.parse(localStorage.getItem('FINOS_SYS_SETTINGS')) || {};
    settings[key] = value;
    localStorage.setItem('FINOS_SYS_SETTINGS', JSON.stringify(settings));
}

// INITIALIZE ON LOAD
document.addEventListener('DOMContentLoaded', () => {
    const config = JSON.parse(localStorage.getItem('FINOS_SYS_SETTINGS')) || { theme: 'dark' };
    applyTheme(config.theme);
});


