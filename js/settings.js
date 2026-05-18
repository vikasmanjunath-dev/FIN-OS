/* ═══════════════════════════════════════════════════════════════════
   FIN•OS SETTINGS ENGINE v3.0
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
let S = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
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
    // Indian numbering: 12,34,56,789
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
  // International
  return sym + Math.abs(Math.round(n)).toLocaleString('en-US') + (n < 0 ? ' (-)' : '');
};

/* Shorthand for crore/lakh labels */
window.FINOS.fmtShort = function (amount) {
  const n = Number(amount);
  if (isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e7)  return (n / 1e7).toFixed(2)  + ' Cr';
  if (abs >= 1e5)  return (n / 1e5).toFixed(2)  + ' L';
  if (abs >= 1e3)  return (n / 1e3).toFixed(1)  + 'K';
  return String(Math.round(n));
};

/* ─── PERSIST + BROADCAST ───────────────────────────────────────── */
function save(key, val) {
  S[key] = val;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(S));
  applyOne(key, val);
  // Notify any QFT/widget instances running in the same tab
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
      const btn = document.getElementById('themeToggle');
      if (btn) btn.textContent = resolved === 'dark' ? '🌙' : '☀️';
      const sel = document.getElementById('themeSelect');
      if (sel) sel.value = val;
      break;
    }
    case 'accent':
      root.style.setProperty('--accent', val);
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
  t.innerHTML = `<span class="toast-icon">${icons[type] || '✓'}</span><span class="toast-msg">${msg}</span>`;
  container.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 380);
  }, duration);
}

/* ─── MODAL SYSTEM ──────────────────────────────────────────────── */
window.openModal = function(id) {
  const m = document.getElementById(id);
  if (m) { m.classList.add('open'); document.body.classList.add('modal-open'); }
};
window.closeModal = function(id) {
  const m = document.getElementById(id);
  if (m) { m.classList.remove('open'); document.body.classList.remove('modal-open'); }
};

/* ─── SUPABASE ──────────────────────────────────────────────────── */
async function initSupabase() {
  if (!window.supabase) return;
  const URL = 'https://oeapcyucnduhwpgxfknb.supabase.co';
  const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lYXBjeXVjbmR1aHdwZ3hma25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNjE1NjgsImV4cCI6MjA4MzgzNzU2OH0.kyuz385hM4X3j8CMBFfI83ZerorvlXrUDOipAHKDC7Q';
  try {
    supaClient = window.supabase.createClient(URL, KEY);
    const { data: { session } } = await supaClient.auth.getSession();
    if (session) {
      currentUser = session.user;
      renderUserInfo(currentUser);
    } else {
      renderGuestInfo();
    }
  } catch (e) {
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
  const val = document.getElementById('newEmailInput')?.value?.trim();
  if (!val || !val.includes('@')) { toast('Enter a valid email.', 'error'); return; }
  if (!supaClient || !currentUser) { toast('Not signed in.', 'error'); return; }
  const btn = document.getElementById('confirmEmailBtn');
  if (btn) { btn.textContent = 'SENDING…'; btn.disabled = true; }
  const { error } = await supaClient.auth.updateUser({ email: val });
  if (btn) { btn.textContent = 'CONFIRM'; btn.disabled = false; }
  if (error) { toast(error.message, 'error'); }
  else {
    toast('Confirmation sent to ' + val + '. Check your inbox.', 'info', 4000);
    window.closeModal('emailModal');
  }
};

window.doResetPassword = async function () {
  if (!supaClient || !currentUser) { toast('Not signed in.', 'error'); return; }
  const btn = document.getElementById('resetPassBtn');
  if (btn) { btn.textContent = 'SENDING…'; btn.disabled = true; }
  const { error } = await supaClient.auth.resetPasswordForEmail(currentUser.email, {
    redirectTo: window.location.origin + '/html/settings.html',
  });
  if (btn) { btn.textContent = 'SEND RESET LINK'; btn.disabled = false; }
  if (error) { toast(error.message, 'error'); }
  else { toast('Password reset link sent to ' + currentUser.email, 'success'); }
};

window.doSignOut = async function () {
  if (supaClient) await supaClient.auth.signOut();
  const keep = ['FINOS_SYS_SETTINGS', 'finos-theme', 'theme'];
  Object.keys(localStorage).filter(k => !keep.includes(k)).forEach(k => localStorage.removeItem(k));
  toast('Session terminated.', 'warn');
  setTimeout(() => { window.location.href = '../login.html'; }, 900);
};

window.doDeleteAccount = async function () {
  const confirmVal = document.getElementById('deleteConfirmInput')?.value;
  if (confirmVal !== 'DELETE') { toast('Type DELETE to confirm.', 'error'); return; }
  if (!supaClient || !currentUser) { toast('Not signed in.', 'error'); return; }
  await supaClient.auth.signOut();
  localStorage.clear();
  toast('Account data wiped. Goodbye.', 'warn');
  setTimeout(() => { window.location.href = '../index.html'; }, 1200);
};

/* ─── APPEARANCE ────────────────────────────────────────────────── */
window.setTheme = function (val) {
  save('theme', val);
  toast('Theme updated.', 'success');
};

window.setAccent = function (hex) {
  save('accent', hex);
  document.querySelectorAll('.color-swatch').forEach(s =>
    s.classList.toggle('active', s.dataset.color === hex)
  );
  const pick = document.getElementById('accentPicker');
  if (pick) pick.value = hex;
  updateAccentPreview(hex);
};

function updateAccentPreview(hex) {
  const prev = document.getElementById('accentPreview');
  if (prev) prev.style.background = hex;
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
  const names = { bhai: 'Bhai', ca_sahab: 'CA Sahab', trader_bro: 'Trader Bro', retirement_uncle: 'Retirement Uncle' };
  toast('AI persona → ' + (names[val] || val), 'success');
};

window.setAIVoiceSpeed = function (val) {
  save('aiVoiceSpeed', parseFloat(val));
  const d = document.getElementById('voiceSpeedVal');
  if (d) d.textContent = parseFloat(val).toFixed(1) + '×';
};

window.setAIMemory = function (val) {
  save('aiMemory', val);
  toast('Memory ' + (val ? 'enabled' : 'disabled') + '.', 'info');
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

/* ─── DATA OPS ──────────────────────────────────────────────────── */
window.exportData = function () {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    try { out[k] = JSON.parse(localStorage.getItem(k)); }
    catch { out[k] = localStorage.getItem(k); }
  }
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: 'finos-export-' + new Date().toISOString().slice(0, 10) + '.json',
  });
  a.click();
  toast('All data exported as JSON.', 'success');
};

window.clearDNA = function () {
  ['finos-dna', 'FINOS_DNA', 'financial_dna', 'financeXray', 'diagnostics', 'FINOS_DIAGNOSTICS']
    .forEach(k => localStorage.removeItem(k));
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
  const wrap = el.closest('.toggle-row');
  if (wrap) wrap.classList.toggle('on', !!val);
}

function syncUIToSettings() {
  const thSel = document.getElementById('themeSelect');
  if (thSel) thSel.value = S.theme;

  document.querySelectorAll('.color-swatch').forEach(s =>
    s.classList.toggle('active', s.dataset.color === S.accent)
  );
  const pick = document.getElementById('accentPicker');
  if (pick) pick.value = S.accent;
  updateAccentPreview(S.accent);

  document.querySelectorAll('.font-size-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.size === S.fontSize)
  );

  const aiLangSel = document.getElementById('aiLangSelect');
  if (aiLangSel) aiLangSel.value = S.aiLang;

  document.querySelectorAll('.persona-card').forEach(c =>
    c.classList.toggle('active', c.dataset.persona === S.aiPersona)
  );

  const slider = document.getElementById('voiceSpeedSlider');
  if (slider) slider.value = S.aiVoiceSpeed;
  const speedVal = document.getElementById('voiceSpeedVal');
  if (speedVal) speedVal.textContent = parseFloat(S.aiVoiceSpeed).toFixed(1) + '×';

  syncToggle('aiMemoryToggle',     S.aiMemory);
  syncToggle('reduceMotionToggle', S.reduceMotion);
  syncToggle('highContrastToggle', S.highContrast);
  syncToggle('compactUIToggle',    S.compactUI);
  syncToggle('notifDailyToggle',   S.notifDailyBrief);
  syncToggle('notifMarketToggle',  S.notifMarket);
  syncToggle('notifGoalToggle',    S.notifGoal);

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

  // Header theme toggle button
  const btn = document.getElementById('themeToggle');
  if (btn) {
    btn.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = cur === 'dark' ? 'light' : 'dark';
      save('theme', next);
    });
  }

  // Close modals on backdrop click
  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) window.closeModal(m.id); });
  });

  // System theme watcher
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (S.theme === 'system') applyOne('theme', 'system');
  });
});
