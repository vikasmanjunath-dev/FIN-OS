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
