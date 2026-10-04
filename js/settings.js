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
};

const SETTING_ENUMS = {
  theme: ['dark', 'light', 'system'],
  fontSize: ['small', 'normal', 'large'],
  aiLang: ['hinglish', 'english', 'hindi'],
  aiPersona: ['bhai', 'ca_sahab', 'trader_bro', 'retirement_uncle'],
  numberFormat: ['indian', 'western'],
  currency: ['inr', 'usd'],
  dateFormat: ['dmy', 'mdy', 'ymd'],
};
const BOOLEAN_SETTINGS = new Set(['aiMemory', 'reduceMotion', 'highContrast', 'compactUI']);

function normalizeSetting(key, value) {
  if (SETTING_ENUMS[key]) return SETTING_ENUMS[key].includes(value) ? value : undefined;
  if (BOOLEAN_SETTINGS.has(key)) return typeof value === 'boolean' ? value : undefined;
  if (key === 'accent') return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value.toUpperCase() : undefined;
  if (key === 'aiVoiceSpeed') {
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(Math.min(2, Math.max(0.6, n)) * 10) / 10 : undefined;
  }
  return Object.prototype.hasOwnProperty.call(DEFAULTS, key) ? value : undefined;
}

function normalizeSettings(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  // Keep unrelated/forward-compatible settings fields: other app surfaces may
  // own keys that this page does not render. Validate only controls we own.
  const clean = { ...source, ...DEFAULTS };
  Object.keys(DEFAULTS).forEach(key => {
    const valid = normalizeSetting(key, source[key]);
    if (valid !== undefined) clean[key] = valid;
  });
  return clean;
}

/* ─── STATE ─────────────────────────────────────────────────────── */
/* Fix [H1]: JSON.parse at module scope crashes every function if storage
   is corrupted. Catch the error and reset to defaults instead. */
let S;
try {
  S = normalizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
} catch {
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
  if (amount === null || amount === undefined || (typeof amount === 'string' && !amount.trim()) || !Number.isFinite(n)) return sym + '—';
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
  if (amount === null || amount === undefined || (typeof amount === 'string' && !amount.trim()) || !Number.isFinite(n)) return '—';
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
  const clean = normalizeSetting(key, val);
  if (clean === undefined) return false;
  S[key] = clean;
  let persisted = false;
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(S)); persisted = true; } catch (_) { /* apply for this tab; report that it was not saved */ }
  applyOne(key, clean);
  try { window.dispatchEvent(new CustomEvent('finos-settings-updated', { detail: { key, val: clean, settings: { ...S } } })); } catch (_) {}
  return persisted;
}

function reportSetting(msg, type, persisted) {
  toast(persisted ? msg : 'Applied for this session only; browser storage is unavailable.', persisted ? type : 'warn');
}

function applyOne(key, val) {
  const root = document.documentElement;
  switch (key) {
    case 'theme': {
      const resolved = val === 'system'
        ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : val;
      root.setAttribute('data-theme', resolved);
      root.classList.toggle('dark', resolved === 'dark');
      try { localStorage.setItem('finos-theme', resolved); localStorage.setItem('theme', resolved); } catch (_) {}
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
    case 'numberFormat':
    case 'currency':
    case 'dateFormat':
      root.setAttribute('data-' + key.replace(/[A-Z]/g, m => '-' + m.toLowerCase()), val);
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
  t.setAttribute('role', type === 'error' || type === 'warn' ? 'alert' : 'status');
  t.setAttribute('aria-live', type === 'error' || type === 'warn' ? 'assertive' : 'polite');
  t.setAttribute('aria-atomic', 'true');
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
// Focus trap state is tracked per modal so closing one dialog never detaches
// another dialog's keyboard trap or steals focus from the wrong opener.
const _modalTrapHandlers = new WeakMap();
const _modalTimers = new WeakMap();
const _modalReturnFocus = new WeakMap();

function _trapFocus(modal) {
  const focusable = modal.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  if (!focusable.length) return;
  const first = focusable[0];
  const last  = focusable[focusable.length - 1];
  // Focus first focusable element
  requestAnimationFrame(() => first.focus());
  const previous = _modalTrapHandlers.get(modal);
  if (previous) modal.removeEventListener('keydown', previous);
  const handler = function (e) {
    if (e.key !== 'Tab') return;
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
    }
  };
  modal.addEventListener('keydown', handler);
  _modalTrapHandlers.set(modal, handler);
}

window.openModal = function(id) {
  const m = document.getElementById(id);
  if (!m) return;
  const pending = _modalTimers.get(m);
  if (pending) { clearTimeout(pending); _modalTimers.delete(m); }
  _modalReturnFocus.set(m, document.activeElement);
  m.style.display = 'flex'; // force visible — belt-and-suspenders over CSS display:none
  void m.offsetHeight;      // reflow so CSS animation starts from hidden state
  m.classList.add('open');
  document.body.classList.add('modal-open');
  _trapFocus(m);
};

window.closeModal = function(id) {
  const m = document.getElementById(id);
  if (!m) return;
  const pending = _modalTimers.get(m);
  if (pending) clearTimeout(pending);
  m.classList.add('closing');
  const timer = setTimeout(() => {
    _modalTimers.delete(m);
    m.style.display = 'none'; // explicitly hide — matches initial state
    m.classList.remove('open', 'closing');
    if (!document.querySelector('.modal-overlay.open')) document.body.classList.remove('modal-open');
    const handler = _modalTrapHandlers.get(m);
    if (handler) { m.removeEventListener('keydown', handler); _modalTrapHandlers.delete(m); }
    // Clear inputs in this modal on close
    m.querySelectorAll('input').forEach(inp => { inp.value = ''; });
    // Restore focus to previously focused element
    const previousFocus = _modalReturnFocus.get(m);
    _modalReturnFocus.delete(m);
    if (previousFocus?.isConnected && previousFocus.focus) { try { previousFocus.focus(); } catch {} }
  }, 200);
  _modalTimers.set(m, timer);
};

/* ─── SUPABASE ──────────────────────────────────────────────────── */
async function initSupabase() {
  // If Supabase SDK didn't load (e.g. offline), fall back immediately
  if (!window.supabase) { renderGuestInfo(); return; }

  // Single source of truth for the project URL/anon key is supabase-config.js (window.FINOS_SB).
  // Using its shared client also avoids a second GoTrueClient fighting over the same auth storage.

  // Fallback: show "Not signed in" after 3 s if the network hangs
  let settled = false;
  const fallback = setTimeout(() => {
    if (!settled) renderGuestInfo();
  }, 3000);

  try {
    const shared = window.FINOS_SB;
    supaClient = (shared && typeof shared.getClient === 'function' && shared.getClient())
      || (shared && shared.url && shared.key ? window.supabase.createClient(shared.url, shared.key) : null);
    if (!supaClient) throw new Error('Supabase is not configured');
    const { data: { session } } = await supaClient.auth.getSession();
    settled = true;
    clearTimeout(fallback);
    if (session) { currentUser = session.user; renderUserInfo(currentUser); }
    else { currentUser = null; renderGuestInfo(); }
  } catch (e) {
    settled = true;
    clearTimeout(fallback);
    currentUser = null;
    renderGuestInfo();
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
  const input = document.getElementById('newEmailInput');
  const val = input?.value?.trim();
  if (!val || !input.checkValidity()) { toast('Enter a valid email address.', 'error'); input?.focus(); return; }
  if (!supaClient || !currentUser)  { toast('Not signed in.', 'error'); return; }
  if (String(currentUser.email || '').toLowerCase() === val.toLowerCase()) { toast('That is already your email address.', 'info'); input.focus(); return; }
  const btn = document.getElementById('confirmEmailBtn');
  const origText = btn ? btn.textContent : 'Confirm';
  if (btn) { btn.textContent = 'Sending…'; btn.disabled = true; }
  try {
    const { error } = await supaClient.auth.updateUser({ email: val });
    if (error) throw error;
    toast('Confirmation link sent to ' + val + '. Check your inbox.', 'info', 4000);
    window.closeModal('emailModal');
  } catch (e) { toast(e.message || 'Could not request the email change. Try again.', 'error'); }
  finally { if (btn) { btn.textContent = origText; btn.disabled = false; } }
};

window.doResetPassword = async function () {
  if (!supaClient || !currentUser) { toast('Not signed in.', 'error'); return; }
  const btn = document.getElementById('resetPassBtn');
  const origText = btn ? btn.textContent : 'Send Reset Link';
  if (btn) { btn.textContent = 'Sending…'; btn.disabled = true; }
  try {
    const redirectTo = new URL('settings.html', window.location.href).href;
    const { error } = await supaClient.auth.resetPasswordForEmail(currentUser.email, { redirectTo });
    if (error) throw error;
    toast('Password reset link sent to ' + currentUser.email, 'success');
  } catch (e) { toast(e.message || 'Could not send the reset link. Try again.', 'error'); }
  finally { if (btn) { btn.textContent = origText; btn.disabled = false; } }
};

window.doSignOut = async function () {
  if (!supaClient || !currentUser) { toast('Not signed in.', 'error'); return; }
  const btn = document.getElementById('signOutBtn');
  if (btn) { btn.textContent = 'Signing out…'; btn.disabled = true; }
  try {
    const { error } = await supaClient.auth.signOut();
    if (error) throw error;
    currentUser = null;
    toast('Signed out. Your FIN•OS data remains on this device.', 'info', 2500);
    setTimeout(() => { window.location.href = 'home.html'; }, 1000);
  } catch (e) {
    toast(e.message || 'Could not sign out. Your data was not changed.', 'error');
    if (btn) { btn.textContent = 'Sign Out'; btn.disabled = false; }
  }
};

window.doDeleteAccount = async function () {
  const confirmVal = document.getElementById('deleteConfirmInput')?.value?.trim();
  if (confirmVal !== 'DELETE') { toast('Type DELETE (in caps) to confirm.', 'error'); return; }
  if (!supaClient || !currentUser) { toast('Not signed in.', 'error'); return; }

  const btn = document.getElementById('deleteForeverBtn');
  if (btn) { btn.textContent = 'Deleting…'; btn.disabled = true; }
  let serverConfirmed = false;
  try {
    if (!supaClient.functions || typeof supaClient.functions.invoke !== 'function') throw new Error('Account deletion is not available on this server. Nothing was deleted.');
    const { data, error } = await supaClient.functions.invoke('delete-account');
    if (error) throw error;
    if (!data || !(data.deleted === true || data.success === true)) throw new Error(data?.error || 'The server did not explicitly confirm account deletion. Nothing on this device was erased.');
    serverConfirmed = true;
    try { await supaClient.auth.signOut(); } catch (_) {}
    await clearLocalAppData({ preservePreferences: false, preserveVault: false, preserveAuth: false });
    toast('Account deleted and local FIN•OS data cleared.', 'warn', 3000);
    setTimeout(() => { window.location.href = '../index.html'; }, 2200);
  } catch (e) {
    toast(serverConfirmed
      ? 'The account was deleted, but this browser could not clear all local data. Use Clear Local Data after resolving the storage error.'
      : (e.message || 'Account deletion failed; no local data was erased.'), 'error', 7000);
    if (btn) { btn.textContent = serverConfirmed ? 'Account Deleted' : 'Delete Forever'; btn.disabled = serverConfirmed; }
  }
};

/* ─── APPEARANCE ────────────────────────────────────────────────── */
window.setTheme = function (val) {
  reportSetting('Theme updated.', 'success', save('theme', val));
};

window.setAccent = function (hex) {
  const persisted = save('accent', hex);
  if (normalizeSetting('accent', hex) === undefined) return;
  hex = normalizeSetting('accent', hex);
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
  reportSetting('Accent color updated.', 'success', persisted);
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
  const persisted = save('fontSize', val);
  if (normalizeSetting('fontSize', val) === undefined) return;
  document.querySelectorAll('.font-size-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.size === val)
  );
  reportSetting('Font size updated.', 'success', persisted);
};

/* ─── AI PREFS ──────────────────────────────────────────────────── */
window.setAILang = function (val) {
  reportSetting('AI language updated.', 'success', save('aiLang', val));
};

window.setAIPersona = function (val) {
  const persisted = save('aiPersona', val);
  if (normalizeSetting('aiPersona', val) === undefined) return;
  document.querySelectorAll('.persona-card').forEach(c =>
    c.classList.toggle('active', c.dataset.persona === val)
  );
  const names = {
    bhai:              'Bhai 🤙',
    ca_sahab:          'CA Sahab 📋',
    trader_bro:        'Trader Bro 📈',
    retirement_uncle:  'Retirement Uncle 🧘',
  };
  reportSetting('AI persona → ' + (names[val] || val), 'success', persisted);
};

window.setAIVoiceSpeed = function (val) {
  // Only update the display label — save on 'change' (when drag ends)
  const numeric = Number(val);
  if (!Number.isFinite(numeric)) return;
  const displayValue = (Math.round(Math.min(2, Math.max(0.6, numeric)) * 10) / 10).toFixed(1) + '×';
  const d = document.getElementById('voiceSpeedVal');
  if (d) d.textContent = displayValue;
  /* Fix [L1]: keep aria-valuetext in sync so screen readers announce the
     formatted value (e.g. "1.5×") not just the raw number "1.5". */
  const slider = document.getElementById('voiceSpeedSlider');
  if (slider) slider.setAttribute('aria-valuetext', displayValue);
};

window.saveAIVoiceSpeed = function (val) {
  // Called on 'change' event — fires once when drag ends
  const speed = normalizeSetting('aiVoiceSpeed', val);
  if (speed === undefined) return;
  reportSetting('Voice speed → ' + speed.toFixed(1) + '×', 'info', save('aiVoiceSpeed', speed));
};

window.setAIMemory = function (val) {
  const persisted = save('aiMemory', val);
  if (val === false) {
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        // chat transcripts + Arya's long-term memory (episodes, learned facts, mood notes)
        if (key && /^(?:finos_chat_|finos_arya_memory_v2)/i.test(key)) keys.push(key);
      }
      keys.forEach(key => localStorage.removeItem(key));
    } catch (_) {}
    try { window.AryaMemory && window.AryaMemory.clearLocal && window.AryaMemory.clearLocal(); } catch (_) {}
  }
  reportSetting('Arya chat history ' + (val ? 'enabled' : 'disabled') + (val ? '.' : '; saved transcripts and Arya\'s memory cleared.'), 'info', persisted);
};

/* ─── DISPLAY ───────────────────────────────────────────────────── */
window.setNumberFormat = function (val) { reportSetting('Number format updated.', 'success', save('numberFormat', val)); };
window.setCurrency      = function (val) { reportSetting('Currency display updated.', 'success', save('currency', val)); };
window.setDateFormat    = function (val) { reportSetting('Date format updated.', 'success', save('dateFormat', val)); };

/* ─── ACCESSIBILITY ─────────────────────────────────────────────── */
window.toggleReduceMotion = function (v) { reportSetting('Reduce Motion ' + (v ? 'on' : 'off') + '.', 'info', save('reduceMotion', v)); };
window.toggleHighContrast = function (v) { reportSetting('High Contrast ' + (v ? 'on' : 'off') + '.', 'info', save('highContrast', v)); };
window.toggleCompactUI    = function (v) { reportSetting('Compact UI ' + (v ? 'on' : 'off') + '.', 'info', save('compactUI', v)); };

/* ─── SAVE ALL ──────────────────────────────────────────────────── */
window.saveAllSettings = function () {
  let persisted = false;
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(S)); persisted = true; } catch (_) {}
  applyAll();
  syncUIToSettings();
  toast(persisted ? 'All settings saved.' : 'Settings are applied for this session, but storage is unavailable.', persisted ? 'success' : 'warn');

  // Visual feedback on the save button itself
  const btn = document.getElementById('saveAllBtn');
  if (btn) {
    const orig = btn.textContent;
    btn.textContent = persisted ? '✓ Saved!' : 'Not saved';
    btn.disabled = true;
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2000);
  }
};

/* ─── DATA OPS ──────────────────────────────────────────────────── */
const LOCAL_FINOS_DATA_KEY = /^(?:finos[_-]|FINOS_|trady_|tradebook_|trading_|theme$|qs_watchlist$|supabase_user_id$|financial_dna$|financeXray$|diagnostics$|dna_profile$)/i;
const PREFERENCE_KEYS = new Set([SETTINGS_KEY, 'finos-theme', 'theme', 'finos_lang', 'supabase_user_id']);
const LOCAL_DB_COLLECTIONS = ['transactions', 'journal', 'documents', 'snapshots'];
const MAX_BACKUP_BYTES = 50 * 1024 * 1024;

async function clearLocalAppData(options = {}) {
  const preservePreferences = options.preservePreferences !== false;
  const preserveVault = options.preserveVault !== false;
  const preserveAuth = options.preserveAuth !== false;
  if (window.indexedDB && window.FinosStore?.idb?.clear) {
    for (const collection of LOCAL_DB_COLLECTIONS) await window.FinosStore.idb.clear(collection);
    if (window.FinosStore.clearAryaMemory) await window.FinosStore.clearAryaMemory();
  }

  const ls = window.localStorage;
  const remove = [];
  for (let i = 0; i < ls.length; i++) {
    const key = ls.key(i);
    if (!key) continue;
    const authToken = /^sb-.*-auth-token$/i.test(key);
    if (!LOCAL_FINOS_DATA_KEY.test(key) && (preserveAuth || !authToken)) continue;
    if (preservePreferences && PREFERENCE_KEYS.has(key)) continue;
    if (preserveVault && /^finos_vault(?:_|$)/i.test(key)) continue;
    if (preserveAuth && authToken) continue;
    remove.push(key);
  }
  remove.forEach(key => ls.removeItem(key));
  return remove.length;
}

window.exportData = async function () {
  let out;
  try {
    if (!window.FinosStore?.exportComplete) throw new Error('FIN•OS export service is unavailable.');
    out = await window.FinosStore.exportComplete();
  } catch (e) { toast(e.message || 'Could not prepare your export.', 'error'); return; }
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  if (blob.size > MAX_BACKUP_BYTES) { toast('Backup exceeds the 50 MB restore limit. Remove older offline attachments and export again.', 'warn', 6000); return; }
  /* Fix [H3]: a.click() on a detached element is silently ignored in Firefox.
     Append to body, click, then immediately remove and revoke the object URL. */
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'finos-export-' + new Date().toLocaleDateString('en-CA') + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('FIN•OS data and offline records exported. Sensitive credentials are excluded.', 'success');
};

/* ── Due-date reminders + install (PWA) ─────────────────────────────── */
window.toggleReminders = async function (on) {
  const box = document.getElementById('notifRemindersToggle');
  const hint = document.getElementById('remindersHint');
  if (!window.FinosReminders) { toast('Reminders are unavailable on this page.', 'warn'); if (box) box.checked = false; return; }
  try {
    if (!on) {
      await window.FinosReminders.disableSystem();
      if (hint) hint.textContent = '';
      toast('Reminders off. You will still see in-app alerts.', 'info');
      return;
    }
    const r = await window.FinosReminders.enableSystem();
    if (!r?.ok) {
      if (box) box.checked = false;
      toast(r?.reason === 'denied' ? 'Notifications are blocked in your browser settings for this site.' : 'This browser does not support notifications.', 'warn');
      return;
    }
    const bg = await window.FinosReminders.enableBackground();
    if (hint) hint.textContent = bg?.ok ? '(also when the app is closed)' : '(while FIN•OS is open — install the app for background reminders)';
    toast('Reminders on.', 'success');
  } catch (e) {
    if (box) { try { box.checked = !!window.FinosReminders.systemEnabled(); } catch (_) { box.checked = false; } }
    toast(e.message || 'Could not update reminders.', 'error');
  }
};
window.installApp = async function () {
  const out = window.FinosPWA ? await window.FinosPWA.install() : 'unavailable';
  if (out === 'accepted') toast('Installing FIN•OS…', 'success');
};
document.addEventListener('DOMContentLoaded', function () {
  const box = document.getElementById('notifRemindersToggle');
  if (box && window.FinosReminders) box.checked = window.FinosReminders.systemEnabled();
  const row = document.getElementById('installRow');
  const show = () => { if (row && window.FinosPWA && window.FinosPWA.canInstall() && !window.FinosPWA.isInstalled()) row.style.display = ''; };
  window.addEventListener('finos:installable', show);
  window.addEventListener('finos:installed', () => { if (row) row.style.display = 'none'; });
  show();
});

window.setUILang = async function (code) {
  if (!['en', 'hi'].includes(code)) { toast('That language is not supported.', 'warn'); return; }
  if (!window.FinosI18n) return;
  try {
    await window.FinosI18n.setLang(code);
    toast(code === 'en' ? 'Language: English' : 'भाषा: हिन्दी', 'success');
  } catch (e) { toast(e.message || 'Could not change language.', 'error'); }
};
document.addEventListener('DOMContentLoaded', function () {
  const sel = document.getElementById('uiLangSelect');
  if (sel) { try { sel.value = localStorage.getItem('finos_lang') || 'en'; } catch (e) { /* private mode */ } }
});

/* ── Passcode lock + encrypted backups ──────────────────────────────── */
function vaultDialog(opts) {
  return new Promise((resolve) => {
    const returnFocus = document.activeElement;
    const wrap = document.createElement('div');
    wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-label', opts.title);
    wrap.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:16px;';
    const field = (f) => `<label style="display:block;font-size:12px;opacity:.7;margin:12px 0 4px;" for="vd-${f.id}">${f.label}</label>
      <input id="vd-${f.id}" type="password" autocomplete="${f.autocomplete || 'new-password'}" style="width:100%;box-sizing:border-box;padding:11px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.05);color:inherit;font-size:15px;">`;
    wrap.innerHTML = `<form style="background:var(--bg-surface,#14182a);color:var(--text-primary,#f0f2f8);border:1px solid var(--border-soft,rgba(255,255,255,.12));border-radius:18px;max-width:420px;width:100%;padding:22px;">
      <h3 style="margin:0 0 6px;font-size:18px;">${opts.title}</h3>
      <p style="margin:0;font-size:13px;opacity:.7;line-height:1.55;">${opts.body || ''}</p>
      ${(opts.fields || []).map(field).join('')}
      ${opts.confirmText ? `<label style="display:flex;gap:8px;align-items:flex-start;font-size:12.5px;line-height:1.5;margin-top:14px;"><input type="checkbox" id="vd-ack" style="margin-top:3px;"><span>${opts.confirmText}</span></label>` : ''}
      <div id="vd-err" role="alert" style="min-height:18px;color:#ff6b6b;font-size:13px;margin-top:10px;"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:6px;">
        <button type="button" id="vd-cancel" class="btn-outline">Cancel</button>
        <button type="submit" class="btn-outline" style="border-color:#4f7cff;color:#4f7cff;">${opts.submit || 'OK'}</button>
      </div></form>`;
    document.body.appendChild(wrap);
    const first = wrap.querySelector('input'); if (first) first.focus();
    let finished = false;
    const done = (v) => {
      if (finished) return;
      finished = true;
      wrap.remove();
      if (returnFocus?.isConnected && returnFocus.focus) { try { returnFocus.focus(); } catch (_) {} }
      resolve(v);
    };
    wrap.querySelector('#vd-cancel').onclick = () => done(null);
    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); done(null); return; }
      if (e.key !== 'Tab') return;
      const focusable = [...wrap.querySelectorAll('button:not([disabled]), input:not([disabled])')];
      if (!focusable.length) return;
      if (e.shiftKey && document.activeElement === focusable[0]) { e.preventDefault(); focusable.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === focusable.at(-1)) { e.preventDefault(); focusable[0].focus(); }
    });
    wrap.querySelector('form').onsubmit = async (e) => {
      e.preventDefault();
      const vals = {}; (opts.fields || []).forEach((f) => { vals[f.id] = wrap.querySelector('#vd-' + f.id).value; });
      const err = wrap.querySelector('#vd-err'); err.textContent = '';
      if (opts.confirmText && !wrap.querySelector('#vd-ack').checked) { err.textContent = 'Please tick the box to continue.'; return; }
      if (opts.validate) { const m = opts.validate(vals); if (m) { err.textContent = m; return; } }
      done(vals);
    };
  });
}
function vaultRefresh() {
  const V = window.FinosVault; if (!V) return;
  const on = V.isEnabled();
  const t = document.getElementById('vaultToggleBtn'), l = document.getElementById('vaultLockBtn'), m = document.getElementById('vaultMore'), idle = document.getElementById('vaultIdle');
  if (t) t.textContent = on ? 'Turn off' : 'Set up';
  if (l) l.hidden = !on;
  if (m) m.hidden = !on;
  if (idle && on) idle.value = String(V.idleMinutes());
}
window.vaultToggle = async function () {
  const V = window.FinosVault; if (!V) return;
  const same = (v) => (v.p1 !== v.p2 ? 'The two passcodes don\'t match.' : (v.p1.length < 6 ? 'Use at least 6 characters.' : ''));
  if (!V.isEnabled()) {
    const v = await vaultDialog({
      title: 'Set a passcode', submit: 'Turn on',
      body: 'Choose something you will remember. FIN•OS cannot reset it — there is no recovery.',
      fields: [{ id: 'p1', label: 'Passcode (6+ characters)' }, { id: 'p2', label: 'Repeat passcode' }],
      confirmText: 'I understand: if I forget this passcode my data on this device is gone. I have exported a backup or accept the risk.', validate: same,
    });
    if (!v) return;
    try { await V.enable(v.p1); } catch (e) { toast(e.message, 'warn'); return; }
    V.startIdleLock();
    toast('Passcode lock is on. Use "Lock now" — or wait for auto-lock — to encrypt.', 'success');
    vaultRefresh();
  } else {
    const v = await vaultDialog({ title: 'Turn off passcode lock', submit: 'Turn off', body: 'Enter your passcode. Your data will stay on this device unencrypted, as before.', fields: [{ id: 'p', label: 'Passcode', autocomplete: 'current-password' }] });
    if (!v) return;
    const ok = await V.disable(v.p);
    toast(ok ? 'Passcode lock is off.' : 'Wrong passcode.', ok ? 'success' : 'warn');
    vaultRefresh();
  }
};
window.vaultLockNow = async function () {
  try { await window.FinosVault.lock(); location.reload(); } catch (e) { toast(e.message, 'warn'); }
};
window.vaultSetIdle = function (n) { window.FinosVault.setIdleMinutes(n); toast('Auto-lock: ' + n + ' min', 'success'); };
window.vaultChange = async function () {
  const V = window.FinosVault;
  const v = await vaultDialog({
    title: 'Change passcode', submit: 'Change',
    fields: [{ id: 'old', label: 'Current passcode', autocomplete: 'current-password' }, { id: 'p1', label: 'New passcode (6+ characters)' }, { id: 'p2', label: 'Repeat new passcode' }],
    validate: (x) => (x.p1 !== x.p2 ? 'The two new passcodes don\'t match.' : (x.p1.length < 6 ? 'Use at least 6 characters.' : '')),
  });
  if (!v) return;
  try { const ok = await V.changePasscode(v.old, v.p1); toast(ok ? 'Passcode changed.' : 'Current passcode is wrong.', ok ? 'success' : 'warn'); }
  catch (e) { toast(e.message, 'warn'); }
};
window.exportEncryptedBackup = async function () {
  const V = window.FinosVault; if (!V) return;
  if (V.isEnabled() && !V.isUnlocked()) { toast('Unlock first.', 'warn'); return; }
  const v = await vaultDialog({
    title: 'Encrypted backup', submit: 'Download', body: 'Pick a passphrase for this file. You will need it to restore — FIN•OS cannot recover it.',
    fields: [{ id: 'p1', label: 'Passphrase (6+ characters)' }, { id: 'p2', label: 'Repeat passphrase' }],
    validate: (x) => (x.p1 !== x.p2 ? 'The two passphrases don\'t match.' : (x.p1.length < 6 ? 'Use at least 6 characters.' : '')),
  });
  if (!v) return;
  try {
    const complete = await window.FinosStore.exportComplete();
    const file = await V.exportEncrypted(v.p1, complete);
    const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
    if (blob.size > MAX_BACKUP_BYTES) { toast('Encrypted backup exceeds the 50 MB restore limit.', 'warn', 6000); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'finos-encrypted-backup-' + new Date().toLocaleDateString('en-CA') + '.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Encrypted backup downloaded.', 'success');
  } catch (e) { toast(e.message, 'warn'); }
};
window.importEncryptedBackup = function (input) {
  const file = input.files && input.files[0]; input.value = '';
  if (!file) return;
  if (file.size > 50 * 1024 * 1024) { toast('Backup is larger than 50 MB.', 'warn'); return; }
  const reader = new FileReader();
  reader.onload = async () => {
    let parsed; try { parsed = JSON.parse(reader.result); } catch (e) { toast('That is not a backup file.', 'warn'); return; }
    if (!parsed.encrypted) { toast('This file is not encrypted — use "Restore From Backup" instead.', 'warn'); return; }
    const v = await vaultDialog({ title: 'Restore encrypted backup', submit: 'Restore', body: 'Existing values are kept; only missing data is added.', fields: [{ id: 'p', label: 'Passphrase', autocomplete: 'current-password' }] });
    if (!v) return;
    try { const r = await window.FinosVault.importEncrypted(parsed, v.p); toast('Restored ' + r.imported + ' items (' + r.skipped + ' skipped).', 'success'); }
    catch (e) { toast(e.message, 'warn'); }
  };
  reader.onerror = () => toast('Could not read the selected backup file.', 'warn');
  reader.readAsText(file);
};
document.addEventListener('DOMContentLoaded', vaultRefresh);

window.importData = function (input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  if (file.size > 50 * 1024 * 1024) { toast('Backup is larger than 50 MB.', 'warn'); return; }
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (parsed && parsed.encrypted) { toast('This backup is encrypted — use "Encrypted Backup → Restore".', 'warn'); return; }
      const res = await window.FinosStore.importComplete(parsed);
      toast('Restored ' + res.imported + ' items (' + res.skipped + ' skipped).', 'success');
      if (res.imported) setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      toast(e.message || 'Could not read that file.', 'warn');
    }
  };
  reader.onerror = () => toast('Could not read the selected backup file.', 'warn');
  reader.readAsText(file);
};

window.clearDNA = function () {
  const dnaKeys = [
    'finos-dna', 'FINOS_DNA', 'financial_dna', 'finos_dna',
    'financeXray', 'diagnostics', 'FINOS_DIAGNOSTICS',
    'dna_profile', 'FINOS_PROFILE_DNA', 'finos-mindset',
    'finos-investor-profile', 'finos-financial-being',
  ];
  try {
    dnaKeys.forEach(k => localStorage.removeItem(k));
    toast('Financial DNA cleared.', 'warn');
    window.closeModal('clearDNAModal');
  } catch (e) { toast(e.message || 'Could not clear Financial DNA. Some local data may remain.', 'error'); }
};

window.clearAllCache = async function () {
  const btn = document.querySelector('#clearCacheModal .btn-danger');
  if (btn) { btn.disabled = true; btn.textContent = 'Clearing…'; }
  const vault = window.FinosVault;
  if (vault?.isEnabled?.() && !vault.isUnlocked()) {
    toast('Unlock the passcode vault before clearing local data. Nothing was changed.', 'warn');
    if (btn) { btn.disabled = false; btn.textContent = 'Yes, Clear FIN•OS Data'; }
    return;
  }
  try {
    const count = await clearLocalAppData({ preservePreferences: true, preserveVault: true });
    if (vault?.isEnabled?.()) {
      await vault.lock();
      toast(`Cleared ${count} local data keys and offline records. The vault is locked.`, 'success', 5000);
      setTimeout(() => window.location.reload(), 900);
      return;
    }
    toast(`Cleared ${count} local data keys and offline records. Account and appearance settings were preserved.`, 'success', 5000);
    window.closeModal('clearCacheModal');
  } catch (e) {
    toast(e.message || 'Could not clear all local data. Some data may remain on this device.', 'error', 6000);
    if (btn) { btn.disabled = false; btn.textContent = 'Yes, Clear FIN•OS Data'; }
  }
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
    { const active = s.dataset.color === S.accent; s.classList.toggle('active', active); s.setAttribute('aria-pressed', String(active)); }
  );
  const pick = document.getElementById('accentPicker');
  if (pick) pick.value = S.accent;
  updateAccentPreview(S.accent);

  // Font size
  document.querySelectorAll('.font-size-btn').forEach(b =>
    { const active = b.dataset.size === S.fontSize; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); }
  );

  // AI
  const aiLangSel = document.getElementById('aiLangSelect');
  if (aiLangSel) aiLangSel.value = S.aiLang;

  document.querySelectorAll('.persona-card').forEach(c =>
    { const active = c.dataset.persona === S.aiPersona; c.classList.toggle('active', active); c.setAttribute('aria-pressed', String(active)); }
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
  // Display
  const numFmt = document.getElementById('numberFormatSelect');
  if (numFmt) numFmt.value = S.numberFormat;
  const curr = document.getElementById('currencySelect');
  if (curr) curr.value = S.currency;
  const dateFmt = document.getElementById('dateFormatSelect');
  if (dateFmt) dateFmt.value = S.dateFormat;
}

function labelSettingsControls() {
  document.querySelectorAll('.setting-row').forEach(row => {
    const label = row.querySelector(':scope > .label-group > label');
    const control = row.querySelector('select:not([hidden]), input:not([type="file"]), .font-size-group, .persona-grid');
    if (!label || !control) return;
    if (control.classList.contains('font-size-group') || control.classList.contains('persona-grid')) {
      control.setAttribute('role', 'group');
      control.setAttribute('aria-label', label.textContent.trim());
      return;
    }
    if (!control.id) control.id = 'settings-control-' + Math.random().toString(36).slice(2, 9);
    label.htmlFor = control.id;
  });
}

/* ─── BOOT ──────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  window.addEventListener('finos-settings-updated', event => {
    const detail = event.detail || {};
    if (detail.settings && typeof detail.settings === 'object') S = normalizeSettings(detail.settings);
    else if (Object.prototype.hasOwnProperty.call(DEFAULTS, detail.key)) {
      const valid = normalizeSetting(detail.key, detail.val);
      if (valid !== undefined) S[detail.key] = valid;
    }
    syncUIToSettings();
  });
  window.addEventListener('storage', event => {
    if (event.key !== SETTINGS_KEY) return;
    try {
      S = normalizeSettings(JSON.parse(event.newValue || '{}'));
      applyAll();
      syncUIToSettings();
    } catch (_) { /* Keep the current in-memory preferences if another tab wrote malformed data. */ }
  });
  applyAll();
  syncUIToSettings();
  labelSettingsControls();
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
  const media = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
  if (media?.addEventListener) media.addEventListener('change', () => {
    if (S.theme === 'system') applyOne('theme', 'system');
  });
  else if (media?.addListener) media.addListener(() => { if (S.theme === 'system') applyOne('theme', 'system'); });

  // Voice speed slider — split oninput (display) from onchange (save)
  const speedSlider = document.getElementById('voiceSpeedSlider');
  if (speedSlider) {
    speedSlider.addEventListener('input',  () => window.setAIVoiceSpeed(speedSlider.value));
    speedSlider.addEventListener('change', () => window.saveAIVoiceSpeed(speedSlider.value));
  }
});
