/**
 * Arya sidebar — lazy loader.   (v1.0)
 *
 * arya-sidebar-panel.js is ~470 KB (about half of all JavaScript on most pages) and used to block every page
 * load. Nothing on the page needs it for first paint, so this 2 KB stub replaces it in the HTML and loads the real
 * panel when the browser is idle, or the moment the user touches anything — whichever comes first.
 *
 * Until the real panel arrives, window.AryaSidebar is a stub whose methods load the panel and then forward the
 * call, and a click on any sidebar "Arya AI" row loads it and opens it. The real script replaces window.AryaSidebar
 * when it finishes, so callers never notice the swap.
 *
 * The panel URL is derived from this script's own URL (…/arya-lazy.js → …/arya-sidebar-panel.js).
 */
(function () {
  'use strict';
  if (window.AryaSidebar || window._aryaLazy) return;
  var me = document.currentScript;
  var src = me && me.src ? me.src.replace(/arya-lazy\.js(\?.*)?$/, 'arya-sidebar-panel.js') : '../js/arya-sidebar-panel.js';
  var loading = null;
  var IDLE_MS = 2500;

  function load() {
    if (loading) return loading;
    removeTriggers();
    loading = new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(window.AryaSidebar); };
      s.onerror = function () { loading = null; resolve(null); };      // allow a retry on the next trigger
      document.head.appendChild(s);
    });
    return loading;
  }

  function forward(name) {
    return function () {
      var args = arguments;
      return load().then(function (real) { if (real && real.ask !== stub.ask && typeof real[name] === 'function') return real[name].apply(real, args); });
    };
  }
  var stub = {};
  ['open', 'close', 'showChart', 'closeChart', 'ask', 'runAgent', 'clearHistory'].forEach(function (m) { stub[m] = forward(m); });
  window.AryaSidebar = stub;
  window._aryaLazy = { load: load, isLoaded: function () { return window.AryaSidebar !== stub; } };

  /* Triggers: first interaction or idle time. */
  var EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel'];
  var timer = null;
  function removeTriggers() {
    EVENTS.forEach(function (e) { window.removeEventListener(e, load, true); });
    if (timer) { clearTimeout(timer); timer = null; }
  }
  EVENTS.forEach(function (e) { window.addEventListener(e, load, { capture: true, passive: true, once: true }); });
  function schedule() {
    if ('requestIdleCallback' in window) window.requestIdleCallback(load, { timeout: IDLE_MS });
    else timer = setTimeout(load, 1200);
  }
  if (document.readyState === 'complete') schedule(); else window.addEventListener('load', schedule);

  /* A click on the sidebar's "Arya AI" row before the panel exists: load it, then open it. */
  document.addEventListener('click', function (e) {
    if (window._aryaLazy.isLoaded()) return;
    var t = e.target && e.target.closest && e.target.closest('#sb-arya-btn, .sb-arya-row, .finos-fab');
    if (!t) return;
    e.preventDefault();
    load().then(function (real) { if (real && real.open) real.open(); });
  }, true);
})();
