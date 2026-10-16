// Last-good-response cache for the market screens. Each answer is saved with the time it was fetched, so when the backend cannot
// be reached the screen shows the last good answer marked "as of <time>" instead of nothing (or, worse, a made-up number).
//
// Keys deliberately do NOT start with "finos_": this is public market data, not the person's own data, so it stays out of the
// data export and the encrypted backup. "Erase all data" (AsyncStorage.clear) and clearMarketCache() remove it.
import AsyncStorage from '@react-native-async-storage/async-storage';

export const CACHE_PREFIX = 'marketcache_v1:';
export const CACHE_INDEX = 'marketcache_v1_index';
export const MAX_ENTRIES = 60;

export interface Cached<T> { data: T; savedAt: number; /** shape signature of `data` when it was saved: an entry whose data no longer has that shape is ignored */ sig?: string }

/** A compact description of the shape of a value (keys and JS types, first element of an array). Pure. */
export function shapeSig(v: unknown, depth = 0): string {
  if (v === null || v === undefined) return 'n';
  if (typeof v === 'number') return 'd';
  if (typeof v === 'string') return 's';
  if (typeof v === 'boolean') return 'b';
  if (depth >= 4) return '*';
  if (Array.isArray(v)) return `[${v.length ? shapeSig(v[0], depth + 1) : ''}]`;
  if (typeof v === 'object') return `{${Object.keys(v as object).sort().slice(0, 60).map(k => `${k}:${shapeSig((v as any)[k], depth + 1)}`).join(',')}}`;
  return '?';
}
export interface Loaded<T> {
  data: T | null;
  /** when the data was fetched from the backend (ms); null if there is no data */
  savedAt: number | null;
  /** true when `data` is the last saved answer because a fresh one could not be fetched */
  fromCache: boolean;
  /** plain-language reason the fresh fetch failed, or null */
  error: string | null;
}

/** Entries to evict, oldest first, so that at most `max` remain. Pure. */
export function pruneIndex(index: Record<string, number>, max: number): string[] {
  const keys = Object.keys(index);
  if (keys.length <= max) return [];
  return keys.sort((a, b) => index[a] - index[b]).slice(0, keys.length - max);
}

/** The words shown to a person for a failed fetch. Pure. */
export function describeFailure(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e ?? '');
  if (/HTTP 404/.test(m)) return 'Your Arya backend is an older version without this feature. Restart it (arya-ai/start.sh).';
  if (/HTTP 4\d\d/.test(m)) return 'The Arya backend could not find that.';
  if (/HTTP 5\d\d/.test(m)) return 'The data provider behind the Arya backend did not answer.';
  if (/abort|timeout|timed out/i.test(m)) return 'The Arya backend took too long to answer.';
  if (/^NO_DATA:/.test(m)) return m.slice(8);
  return "Can't reach the Arya backend. Start it with arya-ai/start.sh, or set its address in Settings.";
}

async function readIndex(): Promise<Record<string, number>> {
  try {
    const v = JSON.parse((await AsyncStorage.getItem(CACHE_INDEX)) ?? '{}');
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    return Object.fromEntries(Object.entries(v).filter(([, t]) => typeof t === 'number' && Number.isFinite(t))) as Record<string, number>;
  } catch { return {}; }
}

export async function readCached<T>(key: string): Promise<Cached<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object' || typeof v.savedAt !== 'number' || !Number.isFinite(v.savedAt) || !('data' in v)) return null;
    if (typeof v.sig === 'string' && v.sig !== shapeSig(v.data)) return null;        // the data was damaged or its shape changed since it was saved
    return v as Cached<T>;
  } catch { return null; }
}

export async function writeCached<T>(key: string, data: T, now = Date.now()): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, savedAt: now, sig: shapeSig(JSON.parse(JSON.stringify(data ?? null))) }));
    const idx = await readIndex();
    idx[key] = now;
    const evict = pruneIndex(idx, MAX_ENTRIES);
    for (const k of evict) delete idx[k];
    await AsyncStorage.setItem(CACHE_INDEX, JSON.stringify(idx));
    if (evict.length) await AsyncStorage.multiRemove(evict.map(k => CACHE_PREFIX + k));
  } catch { /* a full disk must not break a screen */ }
}

export async function clearMarketCache(): Promise<number> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter(k => k.startsWith(CACHE_PREFIX) || k === CACHE_INDEX);
    if (keys.length) await AsyncStorage.multiRemove(keys);
    return keys.length;
  } catch { return 0; }
}

/**
 * Fetch -> normalise -> remember. If the fetch fails, or the answer is unusable (`normalise` returns null), the last saved answer
 * for this key is returned with fromCache: true and the reason in `error`. With nothing saved: data null and the reason.
 * `usable` lets a caller refuse an empty list as "good" (an empty answer should not replace a full one).
 */
export async function loadWithCache<T>(opts: {
  key: string;
  fetcher: () => Promise<unknown>;
  normalise: (raw: unknown) => T | null;
  usable?: (v: T) => boolean;
  now?: number;
}): Promise<Loaded<T>> {
  const now = opts.now ?? Date.now();
  let error: string;
  try {
    const raw = await opts.fetcher();
    const v = opts.normalise(raw);
    if (v !== null && (opts.usable ? opts.usable(v) : true)) {
      await writeCached(opts.key, v, now);
      return { data: v, savedAt: now, fromCache: false, error: null };
    }
    const backendSays = raw && typeof raw === 'object' && typeof (raw as any).error === 'string' ? String((raw as any).error) : null;
    error = backendSays ? `NO_DATA:${backendSays}` : 'NO_DATA:The backend answered with no data.';
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const reason = describeFailure(new Error(error));
  const c = await readCached<T>(opts.key);
  if (c) return { data: c.data, savedAt: c.savedAt, fromCache: true, error: reason };
  return { data: null, savedAt: null, fromCache: false, error: reason };
}
