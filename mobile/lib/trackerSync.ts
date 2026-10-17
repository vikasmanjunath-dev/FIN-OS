// Three-way merge for cross-device tracker sync — TypeScript twin of js/finos-tracker-sync.js (the website).
// Both sides store every finos_* tracker key as one JSONB blob per user in `tracker_snapshot`
// ({ finos_key: "raw string" }) and remember the value each key had at the last sync (the "base"):
//
//   local == remote                  → nothing to do
//   only local changed since base    → push local
//   only remote changed since base   → pull remote
//   present on one side only         → copy it across (a missing key is NEVER treated as a deletion)
//   both changed                     → arrays of records merged by id (deletes included); anything else:
//                                      the cloud value wins and the displaced local value is logged
//
// Pure — no React Native / Supabase imports, so Node runs it and __tests__ compares it with the website's file.

export type KV = Record<string, string>;

export interface Conflict { key: string; kind: 'merged' | 'cloud-won'; lost?: string }
export interface Plan { setLocal: KV; setRemote: KV; nextBase: KV; conflicts: Conflict[] }

export const META_KEY = 'finos_tracker_sync_meta';

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
  // phone-only settings and records that must stay on the device they were made on (a reminder switch that said "on" on a phone
  // that never granted notifications, a theme, the first-run state, the crash notes)
  'finos_theme_mobile', 'finos_reminders_mobile', 'finos_onboarding_mobile', 'finos_diag_crashes', 'finos_persona_mobile',
]);
const NEVER_PREFIX = /^finos_(sessions?_|session$|sessions$|sync_|reminders_seen|reminders_system|applock)/;

/** Tracker data that travels between devices (device-private keys such as the encrypted vault never do). */
export function isSyncKey(k: unknown): k is string {
  return typeof k === 'string' && KEY_PATTERN.test(k) && !NEVER_EXACT.has(k) && !NEVER_PREFIX.test(k);
}

/** Stable JSON (sorted keys) so equal records compare equal regardless of key order. */
export function canon(v: any): string {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v);
}

function parseArray(s: unknown): any[] | null {
  if (typeof s !== 'string') return null;
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : null; } catch { return null; }
}
const isRecord = (e: any) => e !== null && typeof e === 'object' && !Array.isArray(e);
const hasId = (e: any) => isRecord(e) && (typeof e.id === 'string' || typeof e.id === 'number') && String(e.id) !== '';
const allUniqueIds = (arr: any[]) => arr.every(hasId) && new Set(arr.map(e => String(e.id))).size === arr.length;

/**
 * Merge two diverged arrays of records, given the array both sides last agreed on (base, may be undefined).
 * Returns a JSON string, or null when the values aren't both arrays (caller falls back to "cloud wins").
 */
export function mergeArrays(baseStr: string | undefined, localStr: string, remoteStr: string): string | null {
  const L = parseArray(localStr), R = parseArray(remoteStr);
  if (!L || !R) return null;
  const B = parseArray(baseStr) || [];

  // Records with unique ids on both sides: proper three-way merge by id (so deletions propagate)
  if (allUniqueIds(L) && allUniqueIds(R) && (B.length === 0 || allUniqueIds(B))) {
    const idx = (arr: any[]) => { const m = new Map<string, { el: any; s: string }>(); arr.forEach(e => m.set(String(e.id), { el: e, s: canon(e) })); return m; };
    const l = idx(L), r = idx(R), b = idx(B);
    const order: string[] = [];
    const seen = new Set<string>();
    [L, R].forEach(arr => arr.forEach(e => { const id = String(e.id); if (!seen.has(id)) { seen.add(id); order.push(id); } }));
    const out: any[] = [];
    order.forEach(id => {
      const le = l.get(id), re = r.get(id), be = b.get(id);
      if (le && re) {
        if (le.s === re.s) out.push(le.el);
        else if (be && le.s === be.s) out.push(re.el);   // only remote edited
        else if (be && re.s === be.s) out.push(le.el);   // only local edited
        else out.push(re.el);                            // both edited: cloud wins
      } else if (le) {
        if (be && le.s === be.s) return;                 // remote deleted it, local never touched it → gone
        out.push(le.el);                                 // new locally, or edited locally after a remote delete
      } else if (re) {
        if (be && re.s === be.s) return;                 // local deleted it, remote never touched it → gone
        out.push(re.el);
      }
    });
    return JSON.stringify(out);
  }

  // Records without ids (older website shapes): union, never delete
  const out: any[] = [];
  const seen = new Set<string>();
  L.concat(R).forEach(e => { const s = canon(e); if (!seen.has(s)) { seen.add(s); out.push(e); } });
  return JSON.stringify(out);
}

export function planSync(base: KV | null | undefined, local: KV | null | undefined, remote: KV | null | undefined): Plan {
  const b = base || {}, l = local || {}, r = remote || {};
  const keys = new Set<string>();
  Object.keys(l).forEach(k => { if (isSyncKey(k) && typeof l[k] === 'string') keys.add(k); });
  Object.keys(r).forEach(k => { if (isSyncKey(k) && typeof r[k] === 'string') keys.add(k); });

  const setLocal: KV = {}, setRemote: KV = {}, nextBase: KV = {}, conflicts: Conflict[] = [];
  Array.from(keys).sort().forEach(k => {
    const lv = typeof l[k] === 'string' ? l[k] : undefined;
    const rv = typeof r[k] === 'string' ? r[k] : undefined;
    const bv = typeof b[k] === 'string' ? b[k] : undefined;

    if (lv === rv) { nextBase[k] = lv as string; return; }
    if (rv === undefined) { setRemote[k] = lv as string; nextBase[k] = lv as string; return; }   // never delete: re-add to cloud
    if (lv === undefined) { setLocal[k] = rv; nextBase[k] = rv; return; }                         // never delete: restore locally

    if (bv !== undefined && lv === bv) { setLocal[k] = rv; nextBase[k] = rv; return; }            // only remote changed
    if (bv !== undefined && rv === bv) { setRemote[k] = lv; nextBase[k] = lv; return; }           // only local changed

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
