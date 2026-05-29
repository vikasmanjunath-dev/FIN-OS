/* ═══════════════════════════════════════════════════════════════════
   FIN•OS SETTINGS ENGINE v3.1
   Single source of truth for all user preferences.
   Propagates: theme · accent · font-scale · AI prefs · a11y flags
   to every page via the IIFE in ui.js.
═══════════════════════════════════════════════════════════════════ */

/* ─── DEFAULTS ─────────────────────────────────────────────────── */
const SETTINGS_KEY = 'FINOS_SYS_SETTINGS';
const DEFAULTS = {
  theme:           'dark',
  accent:          '#4F7CFF',
  fontSize:        'normal',
  aiLang:          'hinglish',
  aiPersona:       'bhai',
  aiVoiceSpeed:    1.0,
  aiMemory:        true,
  numberFormat:    'indian',
  currency:        'inr',
  dateFormat:      'dmy',
  reduceMotion:    false,
  highContrast:    false,
  compactUI:       false,
  notifDailyBrief: true,
  notifMarket:     true,
  notifGoal:       true,
};

/* ─── STATE ─────────────────────────────────────────────────────── */
/* Fix [H1]: JSON.parse at module scope crashes every function if storage
   is corrupted. Catch the error and reset to defaults instead. */
let S;
try {
  S = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
} catch {
  localStorage.removeItem(SETTINGS_KEY);
  S = { ...DEFAULTS };
}
let supaClient = null;
let currentUser = null;

/* ─── GLOBAL FORMAT UTILITY ─────────────────────────────────────
   Available on every page as:
     FINOS.fmt(12345678)           → "₹1,23,45,678"  (indian)
     FINOS.fmt(12345678)           → "₹12,345,678"   (international)
     FINOS.fmt(12345678, 'usd')    → "$12,345,678"
   Reads FINOS_SYS_SETTINGS from localStorage so it works on ALL
   pages, not just the settings page.
──────────────────────────────────────────────────────────────── */
window.FINOS = window.FINOS || {};
window.FINOS.fmt = function (amount, currencyOverride) {
  let cfg;
  try { cfg = JSON.parse(localStorage.getItem('FINOS_SYS_SETTINGS') || '{}'); } catch { cfg = {}; }
  const numFmt  = cfg.numberFormat || 'indian';
  const curr    = currencyOverride || cfg.currency || 'inr';
  const SYMBOLS = { inr: '₹', usd: '$', eur: '€', gbp: '£' };
  const sym     = SYMBOLS[curr] || '₹';
  const n       = Number(amount);
  if (isNaN(n)) return sym + '—';
  if (numFmt === 'indian') {
    const abs = Math.abs(Math.round(n));
    const str = String(abs);
    let result = '';
    if (str.length <= 3) {
      result = str;
    } else {
      result = str.slice(-3);
      let rem = str.slice(0, -3);
      while (rem.length > 2) { result = rem.slice(-2) + ',' + result; rem = rem.slice(0, -2); }
      if (rem.length) result = rem + ',' + result;
    }
    return sym + (n < 0 ? '-' : '') + result;
  }
  /* Fix [M3]: Western branch used "₹1,00,000 (-)" while Indian used "₹-1,00,000".
     Standardise: both branches now prefix a minus sign for negatives. */
  return sym + (n < 0 ? '-' : '') + Math.abs(Math.round(n)).toLocaleString('en-US');
};

/* Shorthand for crore/lakh labels */
/* Fix [M2]: Previously always returned Indian labels (Cr/L) regardless of
   the numberFormat setting. Now reads the setting and switches to B/M/K
   for Western format — consistent with FINOS.fmt behaviour. */
window.FINOS.fmtShort = function (amount) {
  const n = Number(amount);
  if (isNaN(n)) return '—';
  let cfg;
  try { cfg = JSON.parse(localStorage.getItem('FINOS_SYS_SETTINGS') || '{}'); } catch { cfg = {}; }
  const numFmt = cfg.numberFormat || 'indian';
  const abs = Math.abs(n);
  if (numFmt === 'indian') {
    if (abs >= 1e7) return (n / 1e7).toFixed(2) + ' Cr';
    if (abs >= 1e5) return (n / 1e5).toFixed(2) + ' L';
    if (abs >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  } else {
    if (abs >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  }
  return String(Math.round(n));
};

/* ─── PERSIST + BROADCAST ───────────────────────────────────────── */
function save(key, val) {
  S[key] = val;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(S));
  applyOne(key, val);
  window.dispatchEvent(new CustomEvent('finos-settings-updated', { detail: { key, val, settings: S } }));
}

function applyOne(key, val) {
  const root = document.documentElement;
  switch (key) {
    case 'theme': {
      const resolved = val === 'system'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : val;
      root.setAttribute('data-theme', resolved);
      localStorage.setItem('finos-theme', resolved);
      localStorage.setItem('theme', resolved);
      // Update header toggle button
      const btn = document.getElementById('themeToggle');
      if (btn) {
        btn.textContent = resolved === 'dark' ? '🌙' : '☀️';
        btn.setAttribute('aria-label', resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
      }
      const sel = document.getElementById('themeSelect');
      if (sel) sel.value = val;
      break;
    }
    case 'accent':
      root.style.setProperty('--accent', val);
      // Re-derive --accent-dim automatically
      root.style.setProperty('--accent-dim', val + '20');
      break;
    case 'fontSize':
      root.setAttribute('data-font-size', val);
      break;
    case 'reduceMotion':
      root.classList.toggle('reduce-motion', !!val);
      break;
    case 'highContrast':
      root.classList.toggle('high-contrast', !!val);
      break;
    case 'compactUI':
      root.classList.toggle('compact-ui', !!val);
      break;
  }
}

function applyAll() {
  Object.entries(S).forEach(([k, v]) => applyOne(k, v));
}

/* ─── TOAST SYSTEM ──────────────────────────────────────────────── */
function toast(msg, type = 'success', duration = 2800) {
  let container = document.getElementById('finos-toasts');
  if (!container) {
    container = document.createElement('div');
    container.id = 'finos-toasts';
    document.body.appendChild(container);
  }
  const t = document.createElement('div');
  t.className = `finos-toast finos-toast--${type}`;
  const icons = { success: '✓', error: '✕', info: 'ℹ', warn: '⚠' };
  /* Fix [C1]: XSS — msg flowed through innerHTML unsanitised. Email values
     like <img src=x onerror=alert(1)>@x.com would execute. Use textContent. */
  const iconSpan = document.createElement('span');
  iconSpan.className = 'toast-icon';
  iconSpan.textContent = icons[type] || '✓';
  const msgSpan = document.createElement('span');
  msgSpan.className = 'toast-msg';
  msgSpan.textContent = msg;
  t.appendChild(iconSpan);
  t.appendChild(msgSpan);
  container.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 380);
  }, duration);
}

/* ─── MODAL SYSTEM ──────────────────────────────────────────────── */
// Focus trap helpers
let _trapFocusHandler = null;

function _trapFocus(modal) {
  const focusable = modal.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  if (!focusable.length) return;
  const first = focusable[0];
  const last  = focusable[focusable.length - 1];
  // Focus first focusable element
  requestAnimationFrame(() => first.focus());
  // Remove any existing handler
  if (_trapFocusHandler) modal.removeEventListener('keydown', _trapFocusHandler);
  _trapFocusHandler = function (e) {
    if (e.key !== 'Tab') return;
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
    }
  };
  modal.addEventListener('keydown', _trapFocusHandler);
}

// Track previously focused element so we can restore on close
let _prevFocus = null;

window.openModal = function(id) {
  const m = document.getElementById(id);
  if (!m) return;
  _prevFocus = document.activeElement;
  m.style.display = 'flex'; // force visible — belt-and-suspenders over CSS display:none
  void m.offsetHeight;      // reflow so CSS animation starts from hidden state
  m.classList.add('open');
  document.body.classList.add('modal-open');
  _trapFocus(m);
};

window.closeModal = function(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.classList.add('closing');
  setTimeout(() => {
    m.style.display = 'none'; // explicitly hide — matches initial state
    m.classList.remove('open', 'closing');
    document.body.classList.remove('modal-open');
    // Clear inputs in this modal on close
    m.querySelectorAll('input').forEach(inp => { inp.value = ''; });
    // Restore focus to previously focused element
    if (_prevFocus && _prevFocus.focus) { try { _prevFocus.focus(); } catch {} }
  }, 200);
};

/* ─── SUPABASE ──────────────────────────────────────────────────── */
async function initSupabase() {
  // If Supabase SDK didn't load (e.g. offline), fall back immediately
  if (!window.supabase) { renderGuestInfo(); return; }

  const SUPA_URL = 'https://oeapcyucnduhwpgxfknb.supabase.co';
  const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lYXBjeXVjbmR1aHdwZ3hma25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNjE1NjgsImV4cCI6MjA4MzgzNzU2OH0.kyuz385hM4X3j8CMBFfI83ZerorvlXrUDOipAHKDC7Q';

  // Fallback: show "Not signed in" after 3 s if the network hangs
  let settled = false;
  const fallback = setTimeout(() => {
    if (!settled) { settled = true; renderGuestInfo(); }
  }, 3000);

  try {
    supaClient = window.supabase.createClient(SUPA_URL, SUPA_KEY);
    const { data: { session } } = await supaClient.auth.getSession();
    if (!settled) {
      settled = true;
      clearTimeout(fallback);
      if (session) { currentUser = session.user; renderUserInfo(currentUser); }
      else          { renderGuestInfo(); }
    }
  } catch (e) {
    if (!settled) { settled = true; clearTimeout(fallback); renderGuestInfo(); }
  }
}

function renderUserInfo(user) {
  const el = document.getElementById('currentEmail');
  if (el) el.textContent = user.email;
  const av = document.getElementById('userAvatar');
  if (av) av.textContent = (user.email || 'U')[0].toUpperCase();
  document.querySelectorAll('.auth-required').forEach(e => e.style.removeProperty('display'));
  document.querySelectorAll('.guest-only').forEach(e => (e.style.display = 'none'));
}

function renderGuestInfo() {
  const el = document.getElementById('currentEmail');
  if (el) el.textContent = 'Not signed in';
  const av = document.getElementById('userAvatar');
  if (av) av.textContent = '?';
  document.querySelectorAll('.auth-required').forEach(e => (e.style.display = 'none'));
  document.querySelectorAll('.guest-only').forEach(e => e.style.removeProperty('display'));
}

/* ─── AUTH OPS ──────────────────────────────────────────────────── */
window.doUpdateEmail = async function () {
  const val = document.getElementById('newEmailInput')?.value?.trim();
  if (!val || !val.includes('@')) { toast('Enter a valid email address.', 'error'); return; }
  if (!supaClient || !currentUser)  { toast('Not signed in.', 'error'); return; }
  const btn = document.getElementById('confirmEmailBtn');
  const origText = btn ? btn.textContent : 'Confirm';
  if (btn) { btn.textContent = 'Sending…'; btn.disabled = true; }
  const { error } = await supaClient.auth.updateUser({ email: val });
  if (btn) { btn.textContent = origText; btn.disabled = false; }
  if (error) {
    toast(error.message, 'error');
  } else {
    toast('Confirmation link sent to ' + val + '. Check your inbox.', 'info', 4000);
    window.closeModal('emailModal');
  }
};

window.doResetPassword = async function () {
  if (!supaClient || !currentUser) { toast('Not signed in.', 'error'); return; }
  const btn = document.getElementById('resetPassBtn');
  const origText = btn ? btn.textContent : 'Send Reset Link';
  if (btn) { btn.textContent = 'Sending…'; btn.disabled = true; }
  const { error } = await supaClient.auth.resetPasswordForEmail(currentUser.email, {
    redirectTo: window.location.origin + '/html/settings.html',
  });
  if (btn) { btn.textContent = origText; btn.disabled = false; }
  if (error) {
    toast(error.message, 'error');
  } else {
    toast('Password reset link sent to ' + currentUser.email, 'success');
  }
};

window.doSignOut = async function () {
  /* Fix [H2]: No loading state — double-clicking called signOut() twice.
     Disable the button for the duration of the async operation. */
  const btn = document.getElementById('signOutBtn');
  if (btn) { btn.textContent = 'Signing out…'; btn.disabled = true; }
  if (supaClient) await supaClient.auth.signOut().catch(() => {});
  const keep = ['FINOS_SYS_SETTINGS', 'finos-theme', 'theme'];
  Object.keys(localStorage).filter(k => !keep.includes(k)).forEach(k => localStorage.removeItem(k));
  toast('Session terminated. Redirecting…', 'warn');
  setTimeout(() => { window.location.href = '../html/home.html'; }, 1000);
};

window.doDeleteAccount = async function () {
  const confirmVal = document.getElementById('deleteConfirmInput')?.value?.trim();
  if (confirmVal !== 'DELETE') { toast('Type DELETE (in caps) to confirm.', 'error'); return; }
  if (!supaClient || !currentUser) { toast('Not signed in.', 'error'); return; }

  /* Fix [M4]: fragile querySelector('#deleteModal .btn-danger:last-child')
     replaced with stable ID lookup added to the button in settings.html. */
  const btn = document.getElementById('deleteForeverBtn');
  if (btn) { btn.textContent = 'Deleting…'; btn.disabled = true; }

  /* Fix [C2]: The original code only called signOut() — the Supabase user
     record was never deleted (GDPR risk, misleading UI).
     Now attempts a real server-side delete via a Supabase Edge Function.
     Deploy at: supabase/functions/delete-account/index.ts (uses service role key).
     Falls back honestly if the function isn't deployed yet. */
  let serverDeleted = false;
  try {
    const { error: fnError } = await supaClient.functions.invoke('delete-account');
    if (!fnError) serverDeleted = true;
  } catch { /* Edge Function not deployed — proceed to fallback */ }

  await supaClient.auth.signOut().catch(() => {});
  localStorage.clear();

  if (serverDeleted) {
    toast('Account permanently deleted. Goodbye.', 'warn', 2500);
    setTimeout(() => { window.location.href = '../index.html'; }, 2000);
  } else {
    /* Honest fallback: local data is gone but Supabase account still exists */
    toast('Local data cleared. Contact support to fully remove your account.', 'warn', 6000);
    setTimeout(() => { window.location.href = '../index.html'; }, 3500);
  }
};

/* ─── APPEARANCE ────────────────────────────────────────────────── */
window.setTheme = function (val) {
  save('theme', val);
  toast('Theme updated.', 'success');
};

window.setAccent = function (hex) {
  save('accent', hex);
  document.querySelectorAll('.color-swatch[data-color]').forEach(s =>
    s.classList.toggle('active', s.dataset.color === hex)
  );
  const pick = document.getElementById('accentPicker');
  if (pick) pick.value = hex;
  // Update swatch-custom background so it shows selected custom color
  const customSwatch = document.querySelector('.swatch-custom');
  if (customSwatch && !document.querySelector(`.color-swatch[data-color="${hex}"]`)) {
    customSwatch.style.background = hex;
    customSwatch.querySelector('span').style.color = 'transparent';
  } else if (customSwatch) {
    customSwatch.style.background = '';
    customSwatch.querySelector('span').style.color = '';
  }
  updateAccentPreview(hex);
};

function updateAccentPreview(hex) {
  const prev = document.getElementById('accentPreview');
  if (prev) {
    prev.style.background = hex;
    // Also show the hex value
    const label = document.querySelector('.accent-preview-label');
    if (label) label.textContent = hex;
  }
}

window.onAccentPicker = function (val) {
  window.setAccent(val);
};

window.setFontSize = function (val) {
  save('fontSize', val);
  document.querySelectorAll('.font-size-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.size === val)
  );
  toast('Font size updated.', 'success');
};

/* ─── AI PREFS ──────────────────────────────────────────────────── */
window.setAILang = function (val) {
  save('aiLang', val);
  toast('AI language → ' + val, 'success');
};

window.setAIPersona = function (val) {
  save('aiPersona', val);
  document.querySelectorAll('.persona-card').forEach(c =>
    c.classList.toggle('active', c.dataset.persona === val)
  );
  const names = {
    bhai:              'Bhai 🤙',
    ca_sahab:          'CA Sahab 📋',
    trader_bro:        'Trader Bro 📈',
    retirement_uncle:  'Retirement Uncle 🧘',
  };
  toast('AI persona → ' + (names[val] || val), 'success');
};

window.setAIVoiceSpeed = function (val) {
  // Only update the display label — save on 'change' (when drag ends)
  const d = document.getElementById('voiceSpeedVal');
  if (d) d.textContent = parseFloat(val).toFixed(1) + '×';
  /* Fix [L1]: keep aria-valuetext in sync so screen readers announce the
     formatted value (e.g. "1.5×") not just the raw number "1.5". */
  const slider = document.getElementById('voiceSpeedSlider');
  if (slider) slider.setAttribute('aria-valuetext', parseFloat(val).toFixed(1) + '×');
};

window.saveAIVoiceSpeed = function (val) {
  // Called on 'change' event — fires once when drag ends
  save('aiVoiceSpeed', parseFloat(val));
  toast('Voice speed → ' + parseFloat(val).toFixed(1) + '×', 'info');
};

window.setAIMemory = function (val) {
  save('aiMemory', val);
  toast('Conversation memory ' + (val ? 'enabled' : 'disabled') + '.', 'info');
};

/* ─── DISPLAY ───────────────────────────────────────────────────── */
window.setNumberFormat = function (val) { save('numberFormat', val); toast('Number format updated.', 'success'); };
window.setCurrency      = function (val) { save('currency', val);     toast('Currency display updated.', 'success'); };
window.setDateFormat    = function (val) { save('dateFormat', val);   toast('Date format updated.', 'success'); };

/* ─── ACCESSIBILITY ─────────────────────────────────────────────── */
window.toggleReduceMotion = function (v) { save('reduceMotion', v); toast('Reduce Motion ' + (v ? 'on' : 'off') + '.', 'info'); };
window.toggleHighContrast = function (v) { save('highContrast', v); toast('High Contrast ' + (v ? 'on' : 'off') + '.', 'info'); };
window.toggleCompactUI    = function (v) { save('compactUI', v);    toast('Compact UI ' + (v ? 'on' : 'off') + '.', 'info'); };

/* ─── NOTIFICATIONS ─────────────────────────────────────────────── */
window.toggleNotifDailyBrief = function (v) { save('notifDailyBrief', v); toast('Daily Brief ' + (v ? 'on' : 'off') + '.', 'info'); };
window.toggleNotifMarket     = function (v) { save('notifMarket', v);     toast('Market Alerts ' + (v ? 'on' : 'off') + '.', 'info'); };
window.toggleNotifGoal       = function (v) { save('notifGoal', v);       toast('Goal Nudges ' + (v ? 'on' : 'off') + '.', 'info'); };

/* ─── SAVE ALL ──────────────────────────────────────────────────── */
window.saveAllSettings = function () {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(S));
  applyAll();
  syncUIToSettings();
  toast('All settings saved!', 'success');

  // Visual feedback on the save button itself
  const btn = document.getElementById('saveAllBtn');
  if (btn) {
    const orig = btn.textContent;
    btn.textContent = '✓ Saved!';
    btn.disabled = true;
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2000);
  }
};

/* ─── DATA OPS ──────────────────────────────────────────────────── */
// Patterns for sensitive keys to exclude from export
const SENSITIVE_KEY_PATTERNS = [
  /^sb-.*-auth-token$/i,
  /^supabase\./i,
  /token/i,
  /secret/i,
  /password/i,
  /^SUPABASE/,
];
function isSensitiveKey(k) {
  return SENSITIVE_KEY_PATTERNS.some(p => p.test(k));
}

window.exportData = function () {
  const out = {};
  let skipped = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (isSensitiveKey(k)) { skipped++; continue; }
    try { out[k] = JSON.parse(localStorage.getItem(k)); }
    catch { out[k] = localStorage.getItem(k); }
  }
  out._meta = {
    exported_at:  new Date().toISOString(),
    app_version:  '3.1.0',
    keys_skipped: skipped + ' sensitive keys omitted',
  };
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  /* Fix [H3]: a.click() on a detached element is silently ignored in Firefox.
     Append to body, click, then immediately remove and revoke the object URL. */
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'finos-export-' + new Date().toLocaleDateString('en-CA') + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Data exported. ' + skipped + ' sensitive keys omitted.', 'success');
};

window.clearDNA = function () {
  const dnaKeys = [
    'finos-dna', 'FINOS_DNA', 'financial_dna', 'finos_dna',
    'financeXray', 'diagnostics', 'FINOS_DIAGNOSTICS',
    'dna_profile', 'FINOS_PROFILE_DNA', 'finos-mindset',
    'finos-investor-profile', 'finos-financial-being',
  ];
  dnaKeys.forEach(k => localStorage.removeItem(k));
  toast('Financial DNA cleared.', 'warn');
  window.closeModal('clearDNAModal');
};

window.clearAllCache = function () {
  const keep = ['FINOS_SYS_SETTINGS', 'finos-theme', 'theme'];
  let n = 0;
  Object.keys(localStorage).filter(k => !keep.includes(k)).forEach(k => { localStorage.removeItem(k); n++; });
  toast(`Cleared ${n} cached items. Settings preserved.`, 'warn');
  window.closeModal('clearCacheModal');
};

/* ─── UI SYNC ───────────────────────────────────────────────────── */
function syncToggle(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  el.checked = !!val;
  // Note: no .toggle-row class in HTML — just set checked state
}

function syncUIToSettings() {
  // Theme
  const thSel = document.getElementById('themeSelect');
  if (thSel) thSel.value = S.theme;

  // Accent swatches
  document.querySelectorAll('.color-swatch[data-color]').forEach(s =>
    s.classList.toggle('active', s.dataset.color === S.accent)
  );
  const pick = document.getElementById('accentPicker');
  if (pick) pick.value = S.accent;
  updateAccentPreview(S.accent);

  // Font size
  document.querySelectorAll('.font-size-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.size === S.fontSize)
  );

  // AI
  const aiLangSel = document.getElementById('aiLangSelect');
  if (aiLangSel) aiLangSel.value = S.aiLang;

  document.querySelectorAll('.persona-card').forEach(c =>
    c.classList.toggle('active', c.dataset.persona === S.aiPersona)
  );

  const slider = document.getElementById('voiceSpeedSlider');
  if (slider) slider.value = S.aiVoiceSpeed;
  const speedVal = document.getElementById('voiceSpeedVal');
  if (speedVal) speedVal.textContent = parseFloat(S.aiVoiceSpeed).toFixed(1) + '×';

  // Toggles
  syncToggle('aiMemoryToggle',     S.aiMemory);
  syncToggle('reduceMotionToggle', S.reduceMotion);
  syncToggle('highContrastToggle', S.highContrast);
  syncToggle('compactUIToggle',    S.compactUI);
  syncToggle('notifDailyToggle',   S.notifDailyBrief);
  syncToggle('notifMarketToggle',  S.notifMarket);
  syncToggle('notifGoalToggle',    S.notifGoal);

  // Display
  const numFmt = document.getElementById('numberFormatSelect');
  if (numFmt) numFmt.value = S.numberFormat;
  const curr = document.getElementById('currencySelect');
  if (curr) curr.value = S.currency;
  const dateFmt = document.getElementById('dateFormatSelect');
  if (dateFmt) dateFmt.value = S.dateFormat;
}

/* ─── BOOT ──────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  applyAll();
  syncUIToSettings();
  await initSupabase();

  // Header theme toggle button — deduplicate listeners and set correct icon.
  // ui.js runs before settings.js and adds its own click listener; clone+replace
  // strips all existing listeners so only one handler fires per click.
  const rawBtn = document.getElementById('themeToggle');
  if (rawBtn) {
    const btn = rawBtn.cloneNode(true); // preserves attributes/children, drops listeners
    rawBtn.parentNode.replaceChild(btn, rawBtn);

    const resolved = document.documentElement.getAttribute('data-theme') || 'dark';
    btn.textContent = resolved === 'dark' ? '🌙' : '☀️';
    btn.setAttribute('aria-label', resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');

    btn.addEventListener('click', () => {
      const cur  = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = cur === 'dark' ? 'light' : 'dark';
      save('theme', next); // updates FINOS_SYS_SETTINGS, applies to DOM, dispatches event
    });
  }

  // Close modals on backdrop click (Escape key handled in modal HTML via aria)
  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) window.closeModal(m.id); });
  });

  // Close modals on Escape key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const open = document.querySelector('.modal-overlay.open');
      if (open) window.closeModal(open.id);
    }
  });

  // System theme watcher
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (S.theme === 'system') applyOne('theme', 'system');
  });

  // Voice speed slider — split oninput (display) from onchange (save)
  const speedSlider = document.getElementById('voiceSpeedSlider');
  if (speedSlider) {
    speedSlider.addEventListener('input',  () => window.setAIVoiceSpeed(speedSlider.value));
    speedSlider.addEventListener('change', () => window.saveAIVoiceSpeed(speedSlider.value));
  }
});
