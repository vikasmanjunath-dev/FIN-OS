/**
 * FIN-OS Tracker Sync  (v2 — three-way merge)
 *
 * Syncs Command Hub tracker values (finos_* localStorage keys) to Supabase (table: tracker_snapshot, one JSONB blob
 * per user) so a user's data survives a cleared cache and follows them between this website and the mobile app —
 * with zero changes to any individual tracker module, which keep reading/writing localStorage as before.
 *
 * Guest-mode users (no Supabase session) get a total no-op: no network calls, no behaviour change.
 *
 * WHY v2: v1 only filled in keys that were MISSING locally and re-uploaded the whole local snapshot every 20 s, so a
 * change made on another device could never reach a key this browser already had, and a blob written by another
 * device was overwritten by this one. v2 remembers the value each key had at the last sync (the "base") and does a
 * three-way merge per key:
 *
 *     local == remote                       → nothing to do
 *     only local changed since base         → push local
 *     only remote changed since base        → pull remote
 *     present on one side only              → copy it across (a missing key is NEVER treated as a deletion)
 *     both changed                          → arrays of records merged by id (deletes included); anything else:
 *                                             the cloud value wins and the displaced local value is logged
 *
 * The same algorithm is implemented in mobile/lib/trackerSync.ts; mobile/__tests__/ checks the two against each other.
 * Blob format is unchanged (plain { finos_key: "raw string" }), so v1 clients keep working.
 *
 * Device-private keys are NEVER uploaded (see NEVER_* below): the encrypted vault, consent records, feedback log,
 * usage, language/session flags and mobile-only device settings.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.FinosTrackerSync = api;
    if (root.document) api.autoStart();
  }
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const TABLE = 'tracker_snapshot';
  const META_KEY = 'finos_tracker_sync_meta';
  const PUSH_INTERVAL_MS = 20000;
  const MAX_CONFLICT_LOG = 20;

  /* ── which keys travel ─────────────────────────────────────────────────── */
  const KEY_PATTERN = /^finos_/;
  const NEVER_EXACT = new Set([
    META_KEY, 'finos_streak', 'finos_session_meta',
    'finos_vault', 'finos_vault_meta', 'finos_unlocked',
    'finos_consents', 'finos_feedback_log', 'finos_usage', 'finos_usage_v1',
    'finos_lang', 'finos_schema_version', 'finos_auth_method', 'finos_logged_in',
    // totals each device recomputes from the synced inputs — syncing them would only make devices overwrite each other
    'finos_net_worth', 'finos_fire_percent', 'finos_emergency_months_covered',
    'finos_savings_rate', 'finos_health_score', 'finos_health_score_detail',
    'finos_nps_value', 'finos_nps_projected', 'finos_nps_annual_tax',
    'finos_ppf_value', 'finos_ppf_80c', 'finos_epf_projected',
    'finos_epf_pension', 'finos_portfolio_value',
    // mobile-only device settings / separate sync channels
    'finos_host_ip', 'finos_holdings_v1', 'finos_holdings_tombstones_v1', 'finos_holdings_owner',
    'finos_holdings_last_sync', 'finos_recurring_v1', 'finos_prepay_inputs_v1', 'finos_offers_inputs_v1',
  ]);
  const NEVER_PREFIX = /^finos_(sessions?_|session$|sessions$|sync_|reminders_seen|reminders_system)/;

  function isSyncKey(k) {
    return typeof k === 'string' && KEY_PATTERN.test(k) && !NEVER_EXACT.has(k) && !NEVER_PREFIX.test(k);
  }

  /* ── merge helpers (pure) ──────────────────────────────────────────────── */
  function canon(v) {
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
    return JSON.stringify(v);
  }
  function parseArray(s) {
    if (typeof s !== 'string') return null;
    try { const v = JSON.parse(s); return Array.isArray(v) ? v : null; } catch (_) { return null; }
  }
  const isRecord = (e) => e !== null && typeof e === 'object' && !Array.isArray(e);
  const hasId = (e) => isRecord(e) && (typeof e.id === 'string' || typeof e.id === 'number') && String(e.id) !== '';
  function allUniqueIds(arr) {
    if (!arr.every(hasId)) return false;
    return new Set(arr.map((e) => String(e.id))).size === arr.length;
  }

  /**
   * Merge two diverged arrays of records, given the array both sides last agreed on (base, may be null).
   * Returns a JSON string, or null when the values aren't both arrays (caller falls back to "cloud wins").
   */
  function mergeArrays(baseStr, localStr, remoteStr) {
    const L = parseArray(localStr), R = parseArray(remoteStr);
    if (!L || !R) return null;
    const B = parseArray(baseStr) || [];

    // Records with unique ids on both sides: proper three-way merge by id (so deletions propagate)
    if (allUniqueIds(L) && allUniqueIds(R) && (B.length === 0 || allUniqueIds(B))) {
      const idx = (arr) => { const m = new Map(); arr.forEach((e) => m.set(String(e.id), { el: e, s: canon(e) })); return m; };
      const l = idx(L), r = idx(R), b = idx(B);
      const order = [];
      const seen = new Set();
      [L, R].forEach((arr) => arr.forEach((e) => { const id = String(e.id); if (!seen.has(id)) { seen.add(id); order.push(id); } }));
      const out = [];
      order.forEach((id) => {
        const le = l.get(id), re = r.get(id), be = b.get(id);
        if (le && re) {
          if (le.s === re.s) out.push(le.el);
          else if (be && le.s === be.s) out.push(re.el);       // only remote edited
          else if (be && re.s === be.s) out.push(le.el);       // only local edited
          else out.push(re.el);                                 // both edited: cloud wins
        } else if (le) {
          if (be && le.s === be.s) return;                      // remote deleted it, local never touched it → gone
          out.push(le.el);                                      // new locally, or edited locally after remote delete
        } else if (re) {
          if (be && re.s === be.s) return;                      // local deleted it, remote never touched it → gone
          out.push(re.el);
        }
      });
      return JSON.stringify(out);
    }

    // Records without ids (older website shapes): union, never delete
    const out = [];
    const seen = new Set();
    L.concat(R).forEach((e) => { const s = canon(e); if (!seen.has(s)) { seen.add(s); out.push(e); } });
    return JSON.stringify(out);
  }

  /**
   * planSync(base, local, remote) → { setLocal, setRemote, nextBase, conflicts }
   * base / local / remote: plain { key: string } maps (only isSyncKey keys are considered).
   *   setLocal   keys to write into this device's storage
   *   setRemote  keys to write into the cloud blob
   *   nextBase   what to remember as "last agreed" once the plan has been applied
   *   conflicts  [{ key, kind: 'merged'|'cloud-won', lost? }] — what a person might want to know about
   */
  function planSync(base, local, remote) {
    const b = base || {}, l = local || {}, r = remote || {};
    const keys = new Set();
    Object.keys(l).forEach((k) => { if (isSyncKey(k) && typeof l[k] === 'string') keys.add(k); });
    Object.keys(r).forEach((k) => { if (isSyncKey(k) && typeof r[k] === 'string') keys.add(k); });

    const setLocal = {}, setRemote = {}, nextBase = {}, conflicts = [];
    Array.from(keys).sort().forEach((k) => {
      const lv = typeof l[k] === 'string' ? l[k] : undefined;
      const rv = typeof r[k] === 'string' ? r[k] : undefined;
      const bv = typeof b[k] === 'string' ? b[k] : undefined;

      if (lv === rv) { nextBase[k] = lv; return; }
      if (rv === undefined) { setRemote[k] = lv; nextBase[k] = lv; return; }   // never delete: re-add to cloud
      if (lv === undefined) { setLocal[k] = rv; nextBase[k] = rv; return; }    // never delete: restore locally

      if (bv !== undefined && lv === bv) { setLocal[k] = rv; nextBase[k] = rv; return; }    // only remote changed
      if (bv !== undefined && rv === bv) { setRemote[k] = lv; nextBase[k] = lv; return; }   // only local changed

      // both changed (or first sync with differing values)
      const merged = mergeArrays(bv, lv, rv);
      if (merged !== null) {
        if (merged !== lv) setLocal[k] = merged;
        if (merged !== rv) setRemote[k] = merged;
        nextBase[k] = merged;
        conflicts.push({ key: k, kind: 'merged' });
      } else {
        setLocal[k] = rv;
        nextBase[k] = rv;
        conflicts.push({ key: k, kind: 'cloud-won', lost: lv });
      }
    });
    return { setLocal, setRemote, nextBase, conflicts };
  }

  /* ── browser runtime ───────────────────────────────────────────────────── */
  function ls() { try { return root.localStorage; } catch (_) { return null; } }
  function readMeta() { try { return JSON.parse(ls().getItem(META_KEY)) || {}; } catch (_) { return {}; } }
  function writeMeta(m) { try { ls().setItem(META_KEY, JSON.stringify(m)); } catch (_) {} }

  function getClient() {
    if (root.FINOS_SB && typeof root.FINOS_SB.getClient === 'function') return root.FINOS_SB.getClient();
    if (root.supabase && typeof root.supabase.createClient === 'function') {
      const url = (root.FINOS_SB && root.FINOS_SB.url) || 'https://oeapcyucnduhwpgxfknb.supabase.co';
      const key = (root.FINOS_SB && root.FINOS_SB.key) || '';
      if (!key) return null;
      return root.supabase.createClient(url, key);
    }
    return null;
  }

  function collectLocal() {
    const out = {};
    const s = ls();
    if (!s) return out;
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (isSyncKey(k)) out[k] = s.getItem(k);
    }
    return out;
  }

  let running = false;

  /** One full pull → merge → push cycle. Returns { ok, pulled, pushed, conflicts } (never throws). */
  async function syncOnce(client, userId) {
    if (running) return { ok: false, busy: true };
    running = true;
    try {
      const s = ls();
      if (!s) return { ok: false };
      const meta = readMeta();

      const { data: row, error } = await client.from(TABLE).select('data,updated_at').eq('user_id', userId).maybeSingle();
      if (error) return { ok: false, error: error.message };

      const remote = {};
      if (row && row.data && typeof row.data === 'object') {
        Object.keys(row.data).forEach((k) => { if (typeof row.data[k] === 'string') remote[k] = row.data[k]; });
      }

      let base = meta.base || {};
      let local = collectLocal();
      // Another account's data must never merge into this one: adopt this user's cloud copy instead.
      if (meta.owner && meta.owner !== userId) {
        Object.keys(local).forEach((k) => { if (!(k in remote)) { try { s.removeItem(k); } catch (_) {} } });
        local = {};
        base = {};
      }

      const plan = planSync(base, local, remote);
      Object.keys(plan.setLocal).forEach((k) => { try { s.setItem(k, plan.setLocal[k]); } catch (_) {} });

      let pushed = false;
      const needPush = Object.keys(plan.setRemote).length > 0 || (!row && Object.keys(plan.nextBase).length > 0);
      if (needPush) {
        const merged = Object.assign({}, row && row.data && typeof row.data === 'object' ? row.data : {}, plan.setRemote);
        const now = new Date().toISOString();
        let res;
        if (row) {
          res = await client.from(TABLE).update({ data: merged, updated_at: now })
            .eq('user_id', userId).eq('updated_at', row.updated_at).select('user_id');
          if (!res.error && (!res.data || res.data.length === 0)) return { ok: false, retry: true };   // someone wrote in between
        } else {
          res = await client.from(TABLE).insert({ user_id: userId, data: merged, updated_at: now });
          if (res.error && (res.error.code === '23505' || /duplicate/i.test(res.error.message || ''))) return { ok: false, retry: true };
        }
        if (res.error) return { ok: false, error: res.error.message };
        pushed = true;
      }

      const log = (meta.conflicts || []).concat(plan.conflicts.map((c) => Object.assign({ at: Date.now() }, c))).slice(-MAX_CONFLICT_LOG);
      writeMeta(Object.assign({}, meta, {
        owner: userId, base: plan.nextBase, conflicts: log,
        lastSyncAt: Date.now(), lastPulledAt: Date.now(), lastPushedAt: pushed ? Date.now() : meta.lastPushedAt,
      }));
      return { ok: true, pulled: Object.keys(plan.setLocal).length, pushed, conflicts: plan.conflicts.length };
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) };   // non-fatal — matches the codebase-wide silent-fail idiom
    } finally {
      running = false;
    }
  }

  async function start() {
    const client = getClient();
    if (!client) return;                        // Supabase SDK not loaded on this page — no-op

    let session = null;
    try {
      const res = await client.auth.getSession();
      session = res && res.data && res.data.session;
    } catch (_) { return; }
    if (!session) return;                       // guest mode — never syncs

    const userId = session.user.id;
    const first = await syncOnce(client, userId);

    // Fresh device / cleared cache: the tracker page's own script already rendered with empty values before the
    // pull resolved. One reload lets it re-initialise with the hydrated storage (sessionStorage-guarded: once per tab).
    try {
      if (first.ok && first.pulled > 0 && !root.sessionStorage.getItem('finos_sync_reloaded')) {
        root.sessionStorage.setItem('finos_sync_reloaded', '1');
        root.location.reload();
        return;
      }
    } catch (_) {}

    setInterval(() => { if (root.document.visibilityState === 'visible') syncOnce(client, userId); }, PUSH_INTERVAL_MS);
    root.document.addEventListener('visibilitychange', () => {
      if (root.document.visibilityState === 'hidden') syncOnce(client, userId);
    });
  }

  function autoStart() {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start);
    else start();
  }

  return { isSyncKey, planSync, mergeArrays, canon, syncOnce, autoStart, TABLE, META_KEY };
});
