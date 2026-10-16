// Cross-device tracker sync (app side): AsyncStorage + the signed-in user's `tracker_snapshot` row.
// Merge rules live in trackerSync.ts / trackerSyncEngine.ts (shared algorithm with the website, tested against it);
// this file only adapts them to the device and decides WHEN to run.
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { META_KEY, isSyncKey } from '@/lib/trackerSync';
import { runSync, readSyncMeta, type LocalStore, type Cloud, type SyncMeta } from '@/lib/trackerSyncEngine';
import { makeSupabaseCloud } from '@/lib/trackerSyncCloud';
import { refreshSubscriptionTotals } from '@/lib/subscriptionsStorage';

const INTERVAL_MS = 30_000;
const MIN_GAP_MS = 8_000;          // automatic triggers closer together than this are skipped

export interface TrackerSyncState {
  syncing: boolean;
  /** Last successful run (ms epoch), from the persisted meta */
  lastSyncAt: number | null;
  error: string | null;
  /** Values that differed on two devices and where the cloud copy won, most recent last */
  conflicts: NonNullable<SyncMeta['conflicts']>;
}

let state: TrackerSyncState = { syncing: false, lastSyncAt: null, error: null, conflicts: [] };
const listeners = new Set<() => void>();
const changedListeners = new Set<() => void>();
const set = (p: Partial<TrackerSyncState>) => { state = { ...state, ...p }; listeners.forEach(l => l()); };
export const subscribeTrackerSync = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const getTrackerSyncState = () => state;
/** Fires after a sync wrote values pulled from the cloud — screens use it to reload. */
export const onTrackersPulled = (l: () => void) => { changedListeners.add(l); return () => { changedListeners.delete(l); }; };

const localStore: LocalStore = {
  async readAll() {
    const keys = (await AsyncStorage.getAllKeys()).filter(k => isSyncKey(k) || k === META_KEY);
    const pairs = await AsyncStorage.multiGet(keys);
    const out: Record<string, string> = {};
    pairs.forEach(([k, v]) => { if (v !== null) out[k] = v; });
    return out;
  },
  get: k => AsyncStorage.getItem(k),
  async set(entries) { await AsyncStorage.multiSet(Object.entries(entries)); },
  async remove(keys) { if (keys.length) await AsyncStorage.multiRemove(keys); },
};

const cloud: Cloud = makeSupabaseCloud(supabase as any);

function friendly(msg: string): string {
  if (/PGRST205|could not find the table|schema cache|relation .* does not exist/i.test(msg)) {
    return "Cloud storage for trackers isn't set up yet — run supabase/tracker_snapshot.sql in your Supabase project.";
  }
  if (/network|fetch|timeout|failed to fetch/i.test(msg)) return "Couldn't reach the cloud — your trackers are safe on this device and will sync later.";
  if (/jwt|not authenticated|permission denied|row-level security/i.test(msg)) return 'Not allowed to sync — try signing out and in again.';
  return `Sync failed: ${msg}`;
}

let running = false;
let lastStart = 0;
let again = false;

/** Reconcile this device's tracker data with the signed-in user's cloud copy. No-op when signed out. */
export async function syncTrackersNow(opts: { force?: boolean } = {}): Promise<void> {
  if (!supabase) return;
  if (running) { again = true; return; }
  if (!opts.force && Date.now() - lastStart < MIN_GAP_MS) return;
  running = true;
  lastStart = Date.now();
  try {
    let session = null;
    try { ({ data: { session } } = await supabase.auth.getSession()); } catch { /* treated as signed out */ }
    if (!session) return;

    set({ syncing: true, error: null });
    let res = await runSync(localStore, cloud, session.user.id);
    if (res.retry) res = await runSync(localStore, cloud, session.user.id);   // one immediate retry after a racing writer
    const meta = await readSyncMeta(localStore);
    set({
      lastSyncAt: meta.lastSyncAt ?? state.lastSyncAt,
      conflicts: meta.conflicts ?? [],
      error: res.ok ? null : res.retry ? null : friendly(res.error ?? 'unknown error'),
    });
    if (res.pulled > 0) {
      await refreshSubscriptionTotals().catch(() => {});   // derived totals follow the list that was just pulled
      changedListeners.forEach(l => l());
    }
  } finally {
    running = false;
    set({ syncing: false });
    if (again) { again = false; setTimeout(() => syncTrackersNow(), 500); }
  }
}

/** After "erase everything": forget the last sync time and conflict list held in memory. (Added by the trust-platform work.) */
export function resetForErase() {
  lastStart = 0;
  again = false;
  set({ syncing: false, lastSyncAt: null, error: null, conflicts: [] });
}

let started = false;
/** Call once at app start: keeps trackers in step while the app is open and when it goes to the background. */
export function startTrackerSync() {
  if (started || !supabase) return;
  started = true;
  readSyncMeta(localStore).then(m => set({ lastSyncAt: m.lastSyncAt ?? null, conflicts: m.conflicts ?? [] })).catch(() => {});
  let timer: ReturnType<typeof setInterval> | null = null;
  const arm = () => { if (!timer) timer = setInterval(() => syncTrackersNow(), INTERVAL_MS); };
  const disarm = () => { if (timer) { clearInterval(timer); timer = null; } };
  AppState.addEventListener('change', s => {
    if (s === 'active') { arm(); syncTrackersNow(); }
    else { disarm(); syncTrackersNow({ force: true }); }   // push what changed just before the app is backgrounded
  });
  if (AppState.currentState === 'active') arm();
  syncTrackersNow();
}
