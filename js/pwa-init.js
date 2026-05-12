/**
 * FIN•OS PWA Init — Phase 1
 * Registers the service worker from html/ pages (one level deep).
 */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('../sw.js', { scope: '../' })
      .then(function (reg) {
        console.log('FIN•OS SW registered', reg.scope);
      })
      .catch(function (err) {
        console.log('SW registration failed', err);
      });
  });
}
