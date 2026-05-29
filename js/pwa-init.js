/**
 * FIN•OS PWA Init — Phase 1
 * Registers the service worker from html/ pages (one level deep).
 */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

    // In local development we want fresh HTML/JS immediately after edits.
    // Unregister any existing service workers so stale cached pages cannot mask fixes.
    // GUARD: only run once per browser session — the unregister can fire a
    // controllerchange event which some browsers interpret as a page reload trigger,
    // causing an infinite reload loop if pwa-init.js runs every time.
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
          console.log('FIN•OS dev mode: service workers disabled and caches cleared for localhost');
        })
        .catch(function (err) {
          console.log('FIN•OS dev SW cleanup failed', err);
        });
      return;
    }

    navigator.serviceWorker.register('../sw.js', { scope: '../' })
      .then(function (reg) {
        console.log('FIN•OS SW registered', reg.scope);
      })
      .catch(function (err) {
        console.log('SW registration failed', err);
      });
  });
}
