// Small helpers for reading JSON the app stored (or received) without trusting its shape, and for never writing over a value that
// could not be read. Used by the storage wrappers and the backup / sync receive paths. Pure apart from the two async functions.
//
// Rules this file exists for:
//   1. A value of the wrong shape is "nothing there": the reader returns its documented fallback and does not throw.
//   2. A reader never writes its fallback back (that would replace the person's unreadable data with an empty list).
//   3. A WRITER that is about to replace a stored value it could not read first keeps a copy of that text under a
//      `finos_sync_never_corrupt_*` key (device-only: the sync prefix `finos_sync_` is never uploaded; erase clears it), so a
//      damaged ledger is not silently destroyed by the next "add".
import AsyncStorage from '@react-native-async-storage/async-storage';

export const QUARANTINE_PREFIX = 'finos_sync_never_corrupt_';
/** Longest text kept aside. Anything larger is not copied (a hostile file must not fill the phone). */
export const MAX_KEEP_CHARS = 4_000_000;

export type Expect = 'array' | 'object' | 'any';

export const isPlainObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** A finite number, else `fallback`. Strings that hold a number count ("12.5"); ""/null/NaN/Infinity do not. */
export function finite(v: unknown, fallback = 0): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : fallback;
  if (typeof v === 'string' && v.trim() !== '') { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
  return fallback;
}
/** A finite number above zero, else `fallback`. */
export const positive = (v: unknown, fallback = 0): number => { const n = finite(v, NaN); return n > 0 ? n : fallback; };
/** A string, else `fallback` (numbers are converted: a record id of 5 is "5"; objects and arrays are not). */
export function text(v: unknown, fallback = '', max = 500): string {
  if (typeof v === 'string') return v.length > max ? v.slice(0, max) : v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return fallback;
}

/** A copy of a record keeping only plain values (string, boolean, null, finite number): objects, arrays and Infinity are dropped. */
export function scalarsOnly(o: Record<string, unknown>): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const k of Object.keys(o)) {
    if (k === '__proto__') continue;
    const v = o[k];
    if (typeof v === 'string' || typeof v === 'boolean' || v === null || (typeof v === 'number' && Number.isFinite(v))) out[k] = v;
  }
  return out;
}

/** Field names that hold text / numbers in the records other trackers keep (fixed income, SIPs, policies, goals, subscriptions). */
export const TEXT_FIELDS = ['id', 'name', 'fundName', 'label', 'type', 'startDate', 'nextDate', 'renewal_date', 'target_date', 'maturityDate', 'purchaseDate', 'issueDate', 'provider', 'status',
  'cycle', 'category', 'note', 'notes', 'pay', 'nominee', 'bank', 'policy_number', 'added_at', 'addedAt', 'title', 'date'] as const;
export const NUMBER_FIELDS = ['amount', 'monthlyAmount', 'annualAmount', 'sipDate', 'sipMonthly', 'principal', 'rate', 'termMonths', 'sum_assured', 'annual_premium', 'premium', 'target',
  'target_amount', 'current', 'split', 'usefulness', 'maturityValue', 'units', 'grams', 'quantity'] as const;

/** A flat record for a read-only consumer: plain values only, the usual text fields as text, the usual number fields as finite numbers
 *  (a number field that is not a number is left out, never guessed). Other fields pass through untouched. */
export function flatRecord(o: unknown): Record<string, string | number | boolean | null> | null {
  if (!isPlainObject(o)) return null;
  const out: Record<string, string | number | boolean | null> = scalarsOnly(o);
  for (const k of TEXT_FIELDS) if (k in o) { const t = text(o[k], '\u0000'); if (t === '\u0000') delete out[k]; else out[k] = t; }
  for (const k of NUMBER_FIELDS) if (k in o) { const n = finite(o[k], NaN); if (Number.isFinite(n)) out[k] = n; else delete out[k]; }
  return out;
}

/** true when the text nests brackets deeper than any real record (a hostile file; also what overflows recursive code). Quote-aware. */
export function tooDeep(raw: string, limit = 64): boolean {
  let depth = 0, inStr = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (inStr) { if (c === 92) i++; else if (c === 34) inStr = false; continue; }
    if (c === 34) inStr = true;
    else if (c === 91 || c === 123) { if (++depth > limit) return true; }
    else if (c === 93 || c === 125) depth--;
  }
  return false;
}

/** Parses JSON text. Never throws; `ok:false` means "absent, empty or not JSON". Numbers that overflow (1e999) count as not JSON. */
export function parseJSON(raw: string | null | undefined): { ok: true; value: unknown } | { ok: false } {
  if (typeof raw !== 'string' || raw.trim() === '') return { ok: false };
  if (tooDeep(raw)) return { ok: false };
  try {
    const value = JSON.parse(raw);
    // only a text that has a huge exponent literal can hold Infinity: check the (rare) candidates properly
    if (/\d[eE]\+?\d{3,}/.test(raw)) {
      let overflow = false;
      JSON.parse(raw, (_k, v) => { if (typeof v === 'number' && !Number.isFinite(v)) overflow = true; return v; });
      if (overflow) return { ok: false };
    }
    return { ok: true, value };
  } catch { return { ok: false }; }
}

/** The stored list: the array, or [] for anything else. */
export function asList(raw: string | null | undefined): unknown[] {
  const p = parseJSON(raw);
  return p.ok && Array.isArray(p.value) ? p.value : [];
}
/** The stored object, or null for anything else (arrays and scalars included). */
export function asRecord(raw: string | null | undefined): Record<string, unknown> | null {
  const p = parseJSON(raw);
  return p.ok && isPlainObject(p.value) ? p.value : null;
}

/** true when `raw` is JSON of the expected top-level kind (or there is no value at all). */
export function wellFormed(raw: string | null | undefined, expect: Expect = 'any'): boolean {
  if (raw == null || raw.trim() === '') return true;
  const p = parseJSON(raw);
  if (!p.ok) return false;
  if (expect === 'array') return Array.isArray(p.value);
  if (expect === 'object') return isPlainObject(p.value);
  return true;
}

export const quarantineKey = (key: string) => QUARANTINE_PREFIX + key.replace(/^finos_/i, '').slice(0, 80);

/**
 * Call right before writing `key`. When the value stored there cannot be read as the expected shape, its text is kept under a
 * `finos_sync_never_corrupt_*` key first. Never throws and never blocks the write. Returns true when a copy was kept.
 */
export async function keepIfUnreadable(key: string, expect: Expect = 'any'): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw == null || raw.trim() === '' || wellFormed(raw, expect)) return false;
    if (raw.length > MAX_KEEP_CHARS) return false;
    const qk = quarantineKey(key);
    if ((await AsyncStorage.getItem(qk)) === raw) return true;
    await AsyncStorage.setItem(qk, raw);
    return true;
  } catch { return false; }
}

/** The stored text, or null when absent OR when storage itself failed (a display reader treats both as "nothing"). */
export async function getText(key: string): Promise<string | null> {
  try { return await AsyncStorage.getItem(key); } catch { return null; }
}

/** Several keys at once; a storage failure gives an empty map (every value then reads as absent) instead of throwing. */
export async function getMany(keys: readonly string[]): Promise<Record<string, string | null>> {
  try {
    const out: Record<string, string | null> = {};
    for (const [k, v] of await AsyncStorage.multiGet([...keys])) out[k] = typeof v === 'string' ? v : null;
    return out;
  } catch { return {}; }
}
