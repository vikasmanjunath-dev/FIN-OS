/**
 * FIN•OS PWA Init — Phase 2
 * Safe SW registration: never reloads the page mid-stream.
 *
 * Key rules:
 *  1. On localhost: unregister SW + clear caches (dev mode — always fresh).
 *  2. On production: register SW; listen for updates.
 *  3. On SW update: wait until the AI is idle before activating the new SW.
 *     This prevents controllerchange from interrupting a streaming response.
 */

// Resolve sibling script URLs from this file's own location (works from html/ and calculators/ pages).
var _finosJsBase = (document.currentScript && document.currentScript.src)
  ? document.currentScript.src.replace(/[^/]*$/, '')
  : null;

// Global flag that QFT / Arya / VoiceAgent set to true while streaming
window._aiStreamActive = false;

if ('serviceWorker' in navigator && !window._pwaInitDone) {
  window._pwaInitDone = true;
  window.addEventListener('load', function () {
    const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

    /* ── DEV MODE: disable SW entirely ──────────────────────────────────── */
    if (isLocalhost) {
      if (sessionStorage.getItem('_pwa_dev_cleaned')) return;
      sessionStorage.setItem('_pwa_dev_cleaned', '1');

      navigator.serviceWorker.getRegistrations()
        .then(function (regs) {
          if (!regs.length) return;
          return Promise.all(regs.map(function (reg) { return reg.unregister(); }));
        })
        .then(function () {
          if (window.caches && typeof window.caches.keys === 'function') {
            return window.caches.keys().then(function (keys) {
              return Promise.all(keys.map(function (key) { return window.caches.delete(key); }));
            });
          }
        })
        .then(function () {
          console.log('[FIN-OS] Dev mode: SW disabled, caches cleared.');
        })
        .catch(function (err) {
          console.warn('[FIN-OS] Dev SW cleanup failed:', err);
        });
      return;
    }

    /* ── PRODUCTION: register SW + safe update handling ─────────────────── */
    navigator.serviceWorker.register('../sw.js', { scope: '../' })
      .then(function (reg) {
        console.log('[FIN-OS] SW registered', reg.scope);

        // When a new SW has installed and is waiting, prompt it to activate
        // ONLY when the AI is not mid-stream.
        function trySkipWaiting(waiting) {
          if (!waiting) return;

          function doSkip() {
            console.log('[FIN-OS] SW update: activating (AI idle).');
            waiting.postMessage({ type: 'SKIP_WAITING' });
          }

          // If AI is streaming, wait for it to finish
          if (window._aiStreamActive) {
            var poll = setInterval(function () {
              if (!window._aiStreamActive) {
                clearInterval(poll);
                setTimeout(doSkip, 500); // small buffer after stream ends
              }
            }, 500);
          } else {
            // Idle — safe to update after a brief delay
            setTimeout(doSkip, 3000);
          }
        }

        // SW waiting already (page was opened after new SW installed)
        if (reg.waiting) {
          trySkipWaiting(reg.waiting);
        }

        // SW installed while page is open
        reg.addEventListener('updatefound', function () {
          var newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', function () {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              trySkipWaiting(newWorker);
            }
          });
        });
      })
      .catch(function (err) {
        console.warn('[FIN-OS] SW registration failed:', err);
      });

    // On controllerchange: reload the page ONLY when not mid-stream
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (window._aiStreamActive) {
        // Wait for stream to finish, then reload
        var poll = setInterval(function () {
          if (!window._aiStreamActive) {
            clearInterval(poll);
            setTimeout(function () { window.location.reload(); }, 300);
          }
        }, 500);
      } else {
        window.location.reload();
      }
    });
  });
}

/* ── Reminders: tell the user about SIP debits, renewals, maturities and tax dates that are close.
      Loaded lazily a couple of seconds after page load so it never competes with first paint. ── */
if (_finosJsBase) {
  var _vaultOn = false;
  try { _vaultOn = !!localStorage.getItem('finos_vault_meta'); } catch (e) { /* private mode */ }
  if (_vaultOn && !window.FinosVault) {                 // lock off (the default) → nothing is downloaded
    var _vault = document.createElement('script');
    _vault.src = _finosJsBase + 'finos-vault.js';
    _vault.onload = function () { try { window.FinosVault.startIdleLock(); } catch (e) { /* best effort */ } };
    document.head.appendChild(_vault);
  }
}

if (_finosJsBase && !window.FinosI18n) {
  var _lang = 'en';
  try { _lang = localStorage.getItem('finos_lang') || 'en'; } catch (e) { /* private mode */ }
  if (_lang !== 'en') {                                   // English users never download the translation engine
    var _i18n = document.createElement('script');
    _i18n.src = _finosJsBase + 'finos-i18n.js';
    _i18n.onload = function () { window.FinosI18n.init(); };
    document.head.appendChild(_i18n);
  }
}

if (_finosJsBase && !window.FinosA11y) {
  var _a11y = document.createElement('script');
  _a11y.src = _finosJsBase + 'finos-a11y.js';
  _a11y.async = true;
  document.head.appendChild(_a11y);
}

if (_finosJsBase && window.top === window.self && !window._finosRemindersBooted) {
  window._finosRemindersBooted = true;
  window.addEventListener('load', function () {
    setTimeout(function () {
      var s = document.createElement('script');
      s.src = _finosJsBase + 'finos-reminders.js';
      s.onload = function () { try { window.FinosReminders.boot(_finosJsBase); } catch (e) { /* reminders are best-effort */ } };
      document.head.appendChild(s);
    }, 2500);
  });
}

/* ── Install + offline awareness ─────────────────────────────────────────────
   window.FinosPWA.canInstall()   true once the browser says the app is installable
   window.FinosPWA.install()      shows the native install prompt → 'accepted' | 'dismissed' | 'unavailable'
   window.FinosPWA.isInstalled()  true when running as an installed app
   Fires 'finos:installable' / 'finos:installed' on window so UI (Settings) can react. */
(function () {
  var deferred = null;
  window.FinosPWA = {
    canInstall: function () { return !!deferred; },
    isInstalled: function () {
      return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
    },
    install: function () {
      if (!deferred) return Promise.resolve('unavailable');
      var d = deferred; deferred = null;
      d.prompt();
      return d.userChoice.then(function (c) { return c.outcome; });
    }
  };
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();                       // we show our own button in Settings instead of the mini-infobar
    deferred = e;
    window.dispatchEvent(new Event('finos:installable'));
  });
  window.addEventListener('appinstalled', function () {
    deferred = null;
    window.dispatchEvent(new Event('finos:installed'));
  });

  function toast(o) { try { window.FiNOS && window.FiNOS.toast && window.FiNOS.toast.show(o); } catch (e) { /* toast is optional */ } }
  window.addEventListener('offline', function () {
    toast({ title: "You're offline", msg: 'Showing saved data. Live prices and Arya need a connection.', type: 'warning', duration: 6000 });
  });
  window.addEventListener('online', function () {
    toast({ title: 'Back online', msg: 'Live data is available again.', type: 'success', duration: 3000 });
  });
})();
