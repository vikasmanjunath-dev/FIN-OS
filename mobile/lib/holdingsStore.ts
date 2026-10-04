// Single shared store for the user's holdings: local persistence (AsyncStorage), live prices,
// and optional cloud sync to Supabase. A module-level store (not per-component state) so the
// Portfolio screen, Settings and the auth listener all see and mutate the same data.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ENDPOINTS } from '@/constants/endpoints';
import { supabase } from '@/lib/supabase';
import {
  Holding, NewHolding, Tombstone, RemoteHolding, SYNCED_ASSET_TYPES,
  toView, toRemote, planSync, holdingKey, assetTypeOf,
} from '@/lib/holdings';

const KEY = 'finos_holdings_v1';
const TOMBS_KEY = 'finos_holdings_tombstones_v1';
const OWNER_KEY = 'finos_holdings_owner';       // user id the local copy was last synced with
const LAST_SYNC_KEY = 'finos_holdings_last_sync';
// Keys other screens/Arya already read (see useFinosContext)
const PORTFOLIO_VALUE_KEY = 'finos_portfolio_value';
const SIP_TOTAL_KEY = 'finos_sip_total';

export interface StoreState {
  holdings: Holding[];
  loaded: boolean;
  pricing: boolean;
  priceError: string | null;
  syncing: boolean;
  syncError: string | null;
  lastSyncedAt: string | null;
}

let state: StoreState = {
  holdings: [], loaded: false, pricing: false, priceError: null,
  syncing: false, syncError: null, lastSyncedAt: null,
};
let tombstones: Tombstone[] = [];
let editVersion = 0;           // bumps on every user edit; lets a running sync detect it went stale
let initPromise: Promise<void> | null = null;
let syncQueued = false;
let lastSyncDone = { at: 0, version: -1 };   // lets automatic triggers skip a sync that would just repeat the last one
let syncRunning = false;       // synchronous guard — `state.syncing` is only set after the first await
let syncTimer: ReturnType<typeof setTimeout> | null = null;

const listeners = new Set<() => void>();
const set = (patch: Partial<StoreState>) => { state = { ...state, ...patch }; listeners.forEach(l => l()); };
export const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const getState = () => state;

async function persist(next: Holding[]) {
  set({ holdings: next });
  const value = next.reduce((s, h) => s + toView(h).current, 0);
  const sip = next.reduce((s, h) => s + (h.sipMonthly || 0), 0);
  try {
    await AsyncStorage.multiSet([
      [KEY, JSON.stringify(next)],
      [PORTFOLIO_VALUE_KEY, String(Math.round(value))],
      [SIP_TOTAL_KEY, String(Math.round(sip))],
    ]);
  } catch { /* storage unavailable — in-memory state still updated */ }
}

const saveTombstones = () => AsyncStorage.setItem(TOMBS_KEY, JSON.stringify(tombstones)).catch(() => {});

export function init(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const [raw, tombs, last] = await Promise.all([
          AsyncStorage.getItem(KEY), AsyncStorage.getItem(TOMBS_KEY), AsyncStorage.getItem(LAST_SYNC_KEY),
        ]);
        tombstones = tombs ? JSON.parse(tombs) : [];
        set({ holdings: raw ? JSON.parse(raw) : [], lastSyncedAt: last });
      } catch { /* corrupt/blocked storage → start empty */ }
      set({ loaded: true });
      refreshPrices();
      syncHoldings();
    })();
  }
  return initPromise;
}

// ── Prices ───────────────────────────────────────────────────────────────────

async function fetchJSON(url: string, timeoutMs = 10_000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}
export { fetchJSON };

export async function refreshPrices() {
  const current = state.holdings;
  if (!current.length) return;
  set({ pricing: true, priceError: null });
  try {
    const stocks = [...new Set(current.filter(h => h.type === 'Stock').map(h => h.symbol))];
    const prices = new Map<string, number>();

    const jobs: Promise<void>[] = [];
    if (stocks.length) {
      jobs.push(
        fetchJSON(`${ENDPOINTS.aryaAI}/api/quotes?symbols=${stocks.join(',')}`, 20_000).then(j => {
          for (const q of j.quotes ?? []) if (q?.price != null) prices.set(`Stock:${q.symbol}`, Math.round(q.price * 100) / 100);
        }),
      );
    }
    for (const code of new Set(current.filter(h => h.type !== 'Stock').map(h => h.symbol))) {
      jobs.push(
        fetchJSON(`${ENDPOINTS.aryaAI}/api/mf/nav/${code}`, 20_000).then(j => {
          if (j?.nav != null) prices.set(`MF:${code}`, j.nav);
        }),
      );
    }
    const results = await Promise.allSettled(jobs);
    if (results.every(r => r.status === 'rejected')) throw new Error('backend unreachable');

    const today = new Date().toISOString().slice(0, 10);
    // Read state again: the user may have added/removed holdings while prices were loading.
    // Price refreshes deliberately do NOT touch updatedAt, so they never win a sync conflict.
    await persist(state.holdings.map(h => {
      const p = prices.get(h.type === 'Stock' ? `Stock:${h.symbol}` : `MF:${h.symbol}`);
      return p != null ? { ...h, lastPrice: p, priceDate: today } : h;
    }));
  } catch (e: any) {
    set({
      priceError: e?.message === 'backend unreachable'
        ? 'Could not reach the backend — showing last known prices.'
        : 'Some prices could not be refreshed.',
    });
  } finally {
    set({ pricing: false });
  }
}

// ── Edits ────────────────────────────────────────────────────────────────────

export async function addHolding(h: NewHolding) {
  await init();
  editVersion++;
  const now = new Date().toISOString();
  const list = state.holdings;
  const existing = list.find(x => x.type === h.type && x.symbol === h.symbol);
  if (existing) {
    // Merge into the existing position with a weighted-average cost
    const units = existing.units + h.units;
    const avgPrice = (existing.units * existing.avgPrice + h.units * h.avgPrice) / units;
    await persist(list.map(x => x.id === existing.id
      ? { ...x, units, avgPrice, sipMonthly: h.sipMonthly ?? x.sipMonthly, lastPrice: h.lastPrice ?? x.lastPrice, priceDate: h.priceDate ?? x.priceDate, updatedAt: now }
      : x));
  } else {
    await persist([...list, { ...h, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, updatedAt: now }]);
  }
  tombstones = tombstones.filter(t => t.key !== holdingKey(h)); // re-adding cancels a pending delete
  saveTombstones();
  scheduleSync();
}

export async function removeHolding(id: string) {
  await init();
  const target = state.holdings.find(h => h.id === id);
  if (!target) return;
  editVersion++;
  tombstones = [...tombstones.filter(t => t.key !== holdingKey(target)), { key: holdingKey(target), at: new Date().toISOString() }];
  saveTombstones();
  await persist(state.holdings.filter(h => h.id !== id));
  scheduleSync();
}

// ── Cloud sync ───────────────────────────────────────────────────────────────

export function scheduleSync(delayMs = 1500) {
  if (!supabase) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { syncTimer = null; syncHoldings(); }, delayMs);
}

/** Reconcile local holdings with the signed-in user's cloud copy. No-op when signed out. */
export async function syncHoldings(opts: { force?: boolean } = {}): Promise<void> {
  if (!supabase) return;
  if (syncRunning) { syncQueued = true; return; }
  if (!opts.force && Date.now() - lastSyncDone.at < 5000 && lastSyncDone.version === editVersion) return;
  syncRunning = true;

  let session;
  try {
    ({ data: { session } } = await supabase.auth.getSession());
  } catch { session = null; }
  if (!session) { syncRunning = false; return; }

  await init();
  set({ syncing: true, syncError: null });
  const startVersion = editVersion;
  try {
    const uid = session.user.id;

    // A different account's data must never leak into this one: if the local copy belongs to
    // someone else, replace it with this user's cloud data instead of merging.
    const owner = await AsyncStorage.getItem(OWNER_KEY);
    if (owner && owner !== uid) {
      tombstones = [];
      await saveTombstones();
      await persist([]);
    }

    const { data: rows, error } = await supabase
      .from('holdings')
      .select('symbol,asset_type,quantity,avg_price,current_price,name,sip_monthly,updated_at')
      .eq('user_id', uid)
      .in('asset_type', [...SYNCED_ASSET_TYPES]);
    if (error) throw error;

    const now = new Date().toISOString();
    const plan = planSync(state.holdings, (rows ?? []) as RemoteHolding[], tombstones, now);

    if (plan.upserts.length) {
      const { error: e } = await supabase
        .from('holdings')
        .upsert(plan.upserts.map(h => toRemote(h, uid)), { onConflict: 'user_id,asset_type,symbol' });
      if (e) throw e;
    }
    for (const h of plan.deletes) {
      const { error: e } = await supabase.from('holdings').delete()
        .eq('user_id', uid).eq('asset_type', assetTypeOf(h)).eq('symbol', h.symbol);
      if (e) throw e;
    }

    if (editVersion !== startVersion) {
      // The user edited while we were talking to the cloud; our plan is stale. Cloud writes above are
      // idempotent, so just run again against the fresh state instead of overwriting their edit.
      syncQueued = true;
    } else {
      await persist(plan.next);
      tombstones = [];
      await saveTombstones();
      const stamp = new Date().toISOString();
      await AsyncStorage.multiSet([[OWNER_KEY, uid], [LAST_SYNC_KEY, stamp]]);
      set({ lastSyncedAt: stamp });
      lastSyncDone = { at: Date.now(), version: editVersion };
    }
  } catch (e: any) {
    set({ syncError: /network|fetch|timeout/i.test(e?.message ?? '')
      ? "Couldn't reach the cloud — your holdings are safe on this device and will sync later."
      : `Sync failed: ${e?.message ?? e}` });
  } finally {
    syncRunning = false;
    set({ syncing: false });
    if (syncQueued) { syncQueued = false; scheduleSync(300); }
  }
}
