/**
 * finos-webauthn.js — FIN·OS Biometric Authentication  v1.0
 * ───────────────────────────────────────────────────────────
 * WebAuthn (Face ID / Touch ID / Fingerprint) for FIN-OS.
 * Works on iOS Safari, Android Chrome, macOS Safari, Windows Hello.
 *
 * Flow:
 *   1. Registration: user enables biometrics in Settings
 *   2. Authentication: on app open, prompt biometric before showing data
 *   3. Fallback: PIN or password if biometric fails
 *
 * Storage: credentialId in localStorage (non-sensitive — server-side
 *   verification would require a backend; this client-only version
 *   uses the credential as a session unlock mechanism)
 */
(function (global) {
  'use strict';

  const CRED_KEY   = 'finos_webauthn_cred_v1';
  const LOCK_KEY   = 'finos_biometric_locked';
  const TIMEOUT_MS = 60000;

  const isSupported = () => !!(window.PublicKeyCredential && navigator.credentials);

  /* ── RP (Relying Party) config ─────────────────────────────────── */
  const RP = {
    name: 'FIN·OS',
    id:   window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname,
  };

  /* ── Utils ─────────────────────────────────────────────────────── */
  function b64url(buffer) {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  function b64urlDecode(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    return Uint8Array.from(atob(str), c => c.charCodeAt(0));
  }

  function randomBytes(n) {
    const arr = new Uint8Array(n);
    crypto.getRandomValues(arr);
    return arr;
  }

  /* ── Registration ──────────────────────────────────────────────── */
  async function register(displayName = 'FIN·OS User') {
    if (!isSupported()) throw new Error('WebAuthn not supported on this device/browser.');

    const userId = randomBytes(32);
    const challenge = randomBytes(32);

    const options = {
      challenge,
      rp: RP,
      user: {
        id:          userId,
        name:        localStorage.getItem('finos_user_email') || 'user@finos.app',
        displayName: displayName,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7  },  // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',  // device biometric only
        requireResidentKey:      false,
        userVerification:        'required',
      },
      timeout: TIMEOUT_MS,
      attestation: 'none',
    };

    const cred = await navigator.credentials.create({ publicKey: options });

    const credData = {
      id:        cred.id,
      rawId:     b64url(cred.rawId),
      type:      cred.type,
      transport: cred.response?.getTransports?.() || [],
      userId:    b64url(userId),
      registered: new Date().toISOString(),
      displayName,
    };

    localStorage.setItem(CRED_KEY, JSON.stringify(credData));
    localStorage.setItem(LOCK_KEY, '0'); // unlocked after registration

    return credData;
  }

  /* ── Authentication ────────────────────────────────────────────── */
  async function authenticate() {
    if (!isSupported()) throw new Error('WebAuthn not supported.');

    const saved = JSON.parse(localStorage.getItem(CRED_KEY) || 'null');
    if (!saved) throw new Error('No biometric registered. Please set up biometrics first.');

    const challenge = randomBytes(32);

    const options = {
      challenge,
      rpId:            RP.id,
      userVerification: 'required',
      timeout:          TIMEOUT_MS,
      allowCredentials: [{
        id:        b64urlDecode(saved.rawId),
        type:      'public-key',
        transports: saved.transport || [],
      }],
    };

    const assertion = await navigator.credentials.get({ publicKey: options });

    // Mark as authenticated for this session
    sessionStorage.setItem('finos_biometric_auth', '1');
    sessionStorage.setItem('finos_biometric_ts',   Date.now().toString());
    localStorage.setItem(LOCK_KEY, '0');

    return { success: true, credentialId: assertion.id };
  }

  /* ── Lock / Unlock ─────────────────────────────────────────────── */
  function isRegistered() {
    return !!localStorage.getItem(CRED_KEY);
  }

  function isAuthenticated() {
    const auth = sessionStorage.getItem('finos_biometric_auth');
    const ts   = Number(sessionStorage.getItem('finos_biometric_ts') || 0);
    const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
    return auth === '1' && (Date.now() - ts) < SESSION_TIMEOUT;
  }

  function lock() {
    sessionStorage.removeItem('finos_biometric_auth');
    sessionStorage.removeItem('finos_biometric_ts');
    localStorage.setItem(LOCK_KEY, '1');
  }

  function deregister() {
    localStorage.removeItem(CRED_KEY);
    localStorage.removeItem(LOCK_KEY);
    sessionStorage.removeItem('finos_biometric_auth');
    sessionStorage.removeItem('finos_biometric_ts');
  }

  /* ── Lock Screen UI ────────────────────────────────────────────── */
  function showLockScreen(onSuccess, onCancel) {
    const existing = document.getElementById('finos-lock-screen');
    if (existing) return;

    const screen = document.createElement('div');
    screen.id = 'finos-lock-screen';
    screen.innerHTML = `
      <style>
        #finos-lock-screen {
          position:fixed;inset:0;z-index:999999;
          background:linear-gradient(160deg,#0a0c14,#0d1117);
          display:flex;flex-direction:column;align-items:center;justify-content:center;
          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
          animation:_lockIn .3s ease;
        }
        @keyframes _lockIn { from{opacity:0;transform:scale(.97)} to{opacity:1;transform:none} }
        .lock-logo { font-size:40px;margin-bottom:8px; }
        .lock-brand { font-size:22px;font-weight:900;color:#fff;letter-spacing:.04em;margin-bottom:6px; }
        .lock-sub { font-size:13px;color:#8892a4;margin-bottom:48px; }
        .lock-icon-wrap {
          width:88px;height:88px;border-radius:50%;
          background:linear-gradient(135deg,rgba(123,47,247,.2),rgba(0,212,255,.2));
          border:2px solid rgba(0,212,255,.3);
          display:flex;align-items:center;justify-content:center;
          font-size:40px;cursor:pointer;margin-bottom:24px;
          transition:transform .15s,box-shadow .15s;
        }
        .lock-icon-wrap:hover { transform:scale(1.06);box-shadow:0 0 30px rgba(0,212,255,.3); }
        .lock-icon-wrap:active { transform:scale(.96); }
        .lock-msg { font-size:15px;color:#F5F7FA;font-weight:600;margin-bottom:8px; }
        .lock-hint { font-size:12px;color:#8892a4;margin-bottom:40px; }
        .lock-cancel { font-size:13px;color:#8892a4;text-decoration:underline;cursor:pointer;background:none;border:none;margin-top:8px; }
        .lock-error { color:#ff4444;font-size:13px;margin-bottom:16px;min-height:20px;text-align:center; }
        .lock-btn {
          padding:14px 40px;border-radius:14px;font-size:15px;font-weight:700;cursor:pointer;
          background:linear-gradient(135deg,#7b2ff7,#00d4ff);border:none;color:#fff;
          margin-bottom:12px;width:240px;
        }
      </style>

      <div class="lock-logo">🔐</div>
      <div class="lock-brand">FIN·OS</div>
      <div class="lock-sub">Unlock to access your finances</div>

      <div class="lock-icon-wrap" id="lock-bio-btn" title="Use biometrics">
        ${_getBiometricIcon()}
      </div>
      <div class="lock-msg">Use biometric to unlock</div>
      <div class="lock-error" id="lock-error-msg"></div>
      <button class="lock-btn" id="lock-retry-btn">🔒 Authenticate</button>
      <button class="lock-cancel" id="lock-cancel-btn">Cancel</button>
    `;

    document.body.appendChild(screen);

    async function tryAuth() {
      const errEl = document.getElementById('lock-error-msg');
      errEl.textContent = '';
      try {
        await authenticate();
        screen.style.animation = '_lockIn .3s ease reverse';
        setTimeout(() => {
          screen.remove();
          onSuccess?.();
        }, 280);
      } catch (e) {
        errEl.textContent = e.name === 'NotAllowedError'
          ? 'Authentication cancelled. Try again.'
          : 'Biometric failed. Check your device settings.';
      }
    }

    document.getElementById('lock-bio-btn')?.addEventListener('click', tryAuth);
    document.getElementById('lock-retry-btn')?.addEventListener('click', tryAuth);
    document.getElementById('lock-cancel-btn')?.addEventListener('click', () => {
      screen.remove();
      onCancel?.();
    });

    /* Auto-trigger on open */
    setTimeout(tryAuth, 400);
  }

  function _getBiometricIcon() {
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua)) return '👁️'; // Face ID
    if (/Mac/.test(ua)) return '🫰'; // Touch ID
    if (/Android/.test(ua)) return '🫆'; // Fingerprint
    return '🔑';
  }

  /* ── Settings Panel HTML (inject into settings page) ─────────── */
  function getSettingsHTML() {
    const reg = isRegistered();
    const saved = reg ? JSON.parse(localStorage.getItem(CRED_KEY) || '{}') : null;

    return `
      <div id="finos-biometric-settings" style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:20px;font-family:-apple-system,sans-serif;">
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;">
          <div style="font-size:28px;">${_getBiometricIcon()}</div>
          <div>
            <div style="font-size:15px;font-weight:700;color:#F5F7FA;">Biometric Login</div>
            <div style="font-size:12px;color:#8892a4;">Face ID / Touch ID / Fingerprint</div>
          </div>
          <div style="margin-left:auto;">
            ${reg
              ? `<span style="background:rgba(34,211,166,.15);color:#22d3a6;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;">✓ ENABLED</span>`
              : `<span style="background:rgba(255,255,255,.06);color:#8892a4;padding:4px 12px;border-radius:20px;font-size:11px;">OFF</span>`}
          </div>
        </div>

        ${!isSupported()
          ? `<div style="font-size:13px;color:#f0a500;">⚠ Biometric authentication not supported on this browser/device.</div>`
          : reg
            ? `
              <div style="font-size:12px;color:#8892a4;margin-bottom:16px;">Registered: ${new Date(saved.registered).toLocaleDateString('en-IN')} · ${saved.displayName || 'Device biometric'}</div>
              <div style="display:flex;gap:10px;">
                <button onclick="window.FinosWebAuthn.disable()" style="padding:9px 18px;border-radius:10px;background:rgba(255,68,68,.1);border:1px solid rgba(255,68,68,.3);color:#ff4444;font-size:12px;font-weight:700;cursor:pointer;">
                  🗑 Remove Biometric
                </button>
                <button onclick="window.FinosWebAuthn.testAuth()" style="padding:9px 18px;border-radius:10px;background:rgba(0,212,255,.1);border:1px solid rgba(0,212,255,.3);color:#00d4ff;font-size:12px;font-weight:700;cursor:pointer;">
                  🧪 Test Login
                </button>
              </div>`
            : `
              <div style="font-size:13px;color:#a0aec0;margin-bottom:16px;line-height:1.6;">
                Secure your financial data with biometric login. App will require Face ID or fingerprint on each session.
              </div>
              <button onclick="window.FinosWebAuthn.enable()" style="padding:12px 24px;border-radius:12px;background:linear-gradient(135deg,#7b2ff7,#00d4ff);border:none;color:#fff;font-size:14px;font-weight:700;cursor:pointer;width:100%;">
                Enable Biometric Login
              </button>`}
      </div>
    `;
  }

  /* ── Public API ─────────────────────────────────────────────────── */
  const FinosWebAuthn = {
    isSupported,
    isRegistered,
    isAuthenticated,
    lock,

    async enable() {
      if (!isSupported()) {
        alert('WebAuthn / biometric not supported on this device or browser.');
        return;
      }
      try {
        const name = localStorage.getItem('finos_display_name') || 'FIN·OS User';
        await register(name);
        // Refresh settings section
        const el = document.getElementById('finos-biometric-settings');
        if (el) el.outerHTML = getSettingsHTML();
        window.FinosToast?.show?.('✅ Biometric login enabled! Your finances are now secured.', 'success');
      } catch (e) {
        if (e.name === 'NotAllowedError') {
          window.FinosToast?.show?.('Biometric setup cancelled.', 'warning');
        } else {
          window.FinosToast?.show?.(`Setup failed: ${e.message}`, 'error');
        }
      }
    },

    async disable() {
      if (confirm('Remove biometric login? You can re-enable it anytime in Settings.')) {
        deregister();
        const el = document.getElementById('finos-biometric-settings');
        if (el) el.outerHTML = getSettingsHTML();
        window.FinosToast?.show?.('Biometric login disabled.', 'info');
      }
    },

    async testAuth() {
      try {
        await authenticate();
        window.FinosToast?.show?.('✅ Biometric test successful!', 'success');
      } catch (e) {
        window.FinosToast?.show?.(`Test failed: ${e.message}`, 'error');
      }
    },

    getSettingsHTML,

    /* Call this on app open to protect sensitive pages */
    async guardPage(onSuccess) {
      if (!isRegistered()) { onSuccess?.(); return; }
      if (isAuthenticated()) { onSuccess?.(); return; }
      showLockScreen(onSuccess, () => window.history.back());
    },

    renderSettings(containerId) {
      const el = document.getElementById(containerId);
      if (el) el.innerHTML = getSettingsHTML();
    }
  };

  global.FinosWebAuthn = FinosWebAuthn;

  /* ── Auto-guard on sensitive pages ─────────────────────────────── */
  const GUARDED_PAGES = ['dashboard', 'portfolio', 'track-finances', 'finances', 'tax', 'profile', 'settings'];
  const currentPage = window.location.pathname.split('/').pop().replace('.html', '');

  if (GUARDED_PAGES.includes(currentPage) && isRegistered() && !isAuthenticated()) {
    document.addEventListener('DOMContentLoaded', () => {
      showLockScreen(
        () => console.debug('[WebAuthn] Page unlocked'),
        () => window.location.href = 'home.html'
      );
    });
  }

}(window));
