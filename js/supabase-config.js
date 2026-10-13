/**
 * FIN-OS Supabase Configuration — Single source of truth.
 * Intercepts window.supabase.createClient to enforce a single instance
 * and eliminate "Multiple GoTrueClient instances" warnings.
 *
 * Note: The anon key is intentionally public (RLS enforces data isolation).
 */
(function () {
  'use strict';

  if (window.FINOS_SB) return;

  var SUPABASE_URL = 'https://oeapcyucnduhwpgxfknb.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lYXBjeXVjbmR1aHdwZ3hma25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNjE1NjgsImV4cCI6MjA4MzgzNzU2OH0.kyuz385hM4X3j8CMBFfI83ZerorvlXrUDOipAHKDC7Q';

  var _client = null;

  function getClient() {
    if (_client) return _client;
    if (!window.supabase || !window.supabase._originalCreateClient) {
      if (!window.supabase) return null;
    }
    var createFn = window.supabase._originalCreateClient || window.supabase.createClient;
    _client = createFn(SUPABASE_URL, SUPABASE_ANON_KEY);
    return _client;
  }

  // Intercept createClient so any downstream code that calls
  // window.supabase.createClient(URL, KEY) gets the same singleton back.
  function patchSupabase() {
    if (!window.supabase || window.supabase._patched) return;
    window.supabase._originalCreateClient = window.supabase.createClient;
    window.supabase._patched = true;
    window.supabase.createClient = function (url, key) {
      // Only intercept calls with our URL — allow other projects to create their own clients
      if (url === SUPABASE_URL) return getClient();
      return window.supabase._originalCreateClient(url, key);
    };
  }

  // Patch immediately if the SDK is already loaded. Otherwise check again when the document finishes parsing
  // and loading, and only poll if an SDK <script> tag is actually present but still loading — most pages never
  // load the SDK, and polling every 150ms for 3s on all of them was pure overhead.
  function sdkTagPresent() {
    return !!document.querySelector('script[src*="supabase-js"], script[src*="@supabase"]');
  }
  function tryPatch() {
    try { if (window.supabase) { patchSupabase(); return true; } } catch (e) { return true; }
    return false;
  }
  if (!tryPatch()) {
    // An SDK tag that already precedes us in the DOM: patch the moment it finishes executing
    Array.prototype.forEach.call(
      document.querySelectorAll('script[src*="supabase-js"], script[src*="@supabase"]'),
      function (tag) { tag.addEventListener('load', tryPatch, { once: true }); });
    var onReady = function () {
      if (tryPatch() || !sdkTagPresent()) return;
      var _attempts = 0;
      var _interval = setInterval(function () {
        if (tryPatch() || ++_attempts > 20) clearInterval(_interval);
      }, 150);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady, { once: true });
    else onReady();
    window.addEventListener('load', tryPatch, { once: true });
  }

  window.FINOS_SB = {
    url:       SUPABASE_URL,
    key:       SUPABASE_ANON_KEY,
    getClient: getClient,
  };
})();
