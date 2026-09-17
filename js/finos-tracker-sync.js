/**
 * FIN-OS Tracker Sync
 * Syncs Command Hub tracker localStorage values (finos_* keys) to Supabase
 * (table: tracker_snapshot) so a user's data survives a cleared cache and
 * follows them to a new device — with zero changes to any of the 23
 * individual tracker modules, which keep reading/writing localStorage
 * exactly as they do today.
 *
 * Guest-mode users (no Supabase session) get a total no-op: no network
 * calls, no behaviour change. This matches the "silently enhance if logged
 * in, never require login" pattern used everywhere else in this codebase
 * (see js/profile.js, js/dna-logic.js).
 */
(function FinosTrackerSync() {
  'use strict';

  const SUPABASE_URL = (window.FINOS_SB && window.FINOS_SB.url)
    ? window.FINOS_SB.url
    : 'https://oeapcyucnduhwpgxfknb.supabase.co';
  const SUPABASE_KEY = (window.FINOS_SB && window.FINOS_SB.key)
    ? window.FINOS_SB.key
    : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lYXBjeXVjbmR1aHdwZ3hma25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNjE1NjgsImV4cCI6MjA4MzgzNzU2OH0.kyuz385hM4X3j8CMBFfI83ZerorvlXrUDOipAHKDC7Q';

  const TABLE = 'tracker_snapshot';
  const META_KEY = 'finos_tracker_sync_meta';
  const PUSH_INTERVAL_MS = 20_000;
  const KEY_PATTERN = /^finos_/;

  // finos_-prefixed keys that are device/session bookkeeping, not tracker
  // data — must never be pulled from or pushed to the cloud.
  const EXCLUDE = new Set([
    META_KEY,
    'finos_streak',
    'finos_session_meta',
  ]);

  function safeMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch (_) { return {}; }
  }
  function saveMeta(m) {
    try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (_) {}
  }

  function getClient() {
    if (window.FINOS_SB && typeof window.FINOS_SB.getClient === 'function') {
      return window.FINOS_SB.getClient();
    }
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      return window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
    return null;
  }

  function collectLocalSnapshot() {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (KEY_PATTERN.test(k) && !EXCLUDE.has(k)) {
        out[k] = localStorage.getItem(k);
      }
    }
    return out;
  }

  async function pull(client, userId) {
    try {
      const { data, error } = await client
        .from(TABLE)
        .select('data')
        .eq('user_id', userId)
        .maybeSingle();
      if (error || !data || !data.data) return;

      const cloud = data.data;
      let wroteAny = false;
      Object.keys(cloud).forEach((k) => {
        if (KEY_PATTERN.test(k) && !EXCLUDE.has(k) && localStorage.getItem(k) === null) {
          try { localStorage.setItem(k, cloud[k]); wroteAny = true; } catch (_) {}
        }
      });

      const meta = safeMeta();
      meta.lastPulledAt = Date.now();
      saveMeta(meta);

      // Fresh device / cleared cache: the tracker page's own script already
      // rendered with empty values before this async pull resolved (it
      // can't wait on a network round-trip without being rewritten). One
      // reload lets it re-initialise with the now-hydrated localStorage.
      // sessionStorage-guarded so this can only fire once per tab, not loop.
      if (wroteAny && !sessionStorage.getItem('finos_sync_reloaded')) {
        sessionStorage.setItem('finos_sync_reloaded', '1');
        location.reload();
      }
    } catch (_) { /* non-fatal — matches the codebase-wide silent-fail idiom */ }
  }

  async function push(client, userId) {
    try {
      const snapshot = collectLocalSnapshot();
      if (!Object.keys(snapshot).length) return;
      const { error } = await client
        .from(TABLE)
        .upsert(
          { user_id: userId, data: snapshot, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        );
      if (!error) {
        const meta = safeMeta();
        meta.lastPushedAt = Date.now();
        saveMeta(meta);
      }
    } catch (_) { /* non-fatal */ }
  }

  async function init() {
    const client = getClient();
    if (!client) return; // Supabase SDK not loaded on this page — no-op

    let session = null;
    try {
      const res = await client.auth.getSession();
      session = res && res.data && res.data.session;
    } catch (_) { return; }

    if (!session) return; // guest mode — never syncs, behaviour unchanged

    const userId = session.user.id;

    await pull(client, userId);

    setInterval(() => {
      if (document.visibilityState === 'visible') push(client, userId);
    }, PUSH_INTERVAL_MS);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') push(client, userId);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
