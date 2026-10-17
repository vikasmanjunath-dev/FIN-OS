// Building a backup of what is on the phone, and putting one back. Pure: the store is passed in.
// The plain shape is the website's ({app:'FIN-OS', schema, exportedAt, data, indexedDB}), so a file from either side is read by the other.
import { NEVER_BACKUP } from '@/lib/storageKeys';
import { shapeProblem } from '@/lib/keyShapes';

export interface KV {
  getAllKeys(): Promise<readonly string[]>;
  multiGet(keys: readonly string[]): Promise<readonly (readonly [string, string | null])[]>;
  multiSet(pairs: [string, string][]): Promise<void>;
  /** Optional: lets a failed restore put back keys that did not exist before. Without it such keys are left (the old values are still restored). */
  multiRemove?(keys: string[]): Promise<void>;
}

export const SCHEMA = 1;
/** Keys that belong to this phone only (secrets, consents, device choices, the link to an account): never exported, never overwritten by a restore. */
const OWNED = /^(finos[_-]|FINOS_)/;
export const isBackupKey = (k: string) => OWNED.test(k) && !NEVER_BACKUP.test(k);

export interface PlainBackup { app: 'FIN-OS'; schema: number; source?: string; exportedAt: string; data: Record<string, unknown>; indexedDB?: Record<string, unknown[]> }

export async function buildBackup(store: KV, now = new Date()): Promise<PlainBackup> {
  const keys = (await store.getAllKeys()).filter(isBackupKey).sort();
  const data: Record<string, unknown> = {};
  for (const [k, v] of await store.multiGet(keys)) {
    if (v == null) continue;
    try { data[k] = JSON.parse(v); } catch { data[k] = v; }
  }
  return { app: 'FIN-OS', schema: SCHEMA, source: 'mobile', exportedAt: now.toISOString(), data, indexedDB: {} };
}

export interface Summary { keys: number; exportedAt: string; source: string; offlineRecords: number; newerThanApp: boolean }
export function summarise(plain: any): Summary | null {
  if (!plain || plain.app !== 'FIN-OS' || typeof plain.data !== 'object' || plain.data === null || Array.isArray(plain.data)) return null;
  const idb = plain.indexedDB && typeof plain.indexedDB === 'object' ? plain.indexedDB : {};
  return {
    keys: Object.keys(plain.data).filter(isBackupKey).length,
    exportedAt: typeof plain.exportedAt === 'string' ? plain.exportedAt : '',
    source: plain.source === 'mobile' ? 'this app' : 'the website',
    offlineRecords: Object.values(idb).reduce((s: number, a: any) => s + (Array.isArray(a) ? a.length : 0), 0),
    newerThanApp: Number(plain.schema) > SCHEMA,
  };
}

export interface RestoreResult { imported: number; skipped: number }

/** Limits on a backup being restored. Real backups are a few hundred kilobytes; these only stop a hostile or runaway file. */
export const MAX_RESTORE_KEYS = 3000;
export const MAX_RESTORE_CHARS = 40_000_000;
const KEY_OK = /^[A-Za-z0-9_.:-]{1,200}$/;

/**
 * `replace: false` only fills what is missing; `true` overwrites keys the backup also holds.
 * All-or-nothing: the whole file is checked first (shape of every structured key, sizes, key names) and a file with anything wrong
 * in it is refused with a message and changes nothing. If storage fails part-way, what was there is put back.
 */
export async function restoreBackup(plain: any, store: KV, opts: { replace: boolean } = { replace: false }): Promise<RestoreResult> {
  const sum = summarise(plain);
  if (!sum) throw new Error('This is not a FIN·OS backup.');
  if (sum.newerThanApp) throw new Error('This backup was made by a newer version of FIN·OS. Update the app and try again.');
  const entries = Object.entries(plain.data as Record<string, unknown>);
  if (entries.length > MAX_RESTORE_KEYS) throw new Error('This backup file is not valid (it holds far more items than the app ever writes). Nothing was changed.');

  const wanted: [string, string][] = [];
  const problems: string[] = [];
  let total = 0, skipped = 0;
  for (const [k, v] of entries) {
    if (!isBackupKey(k) || v === undefined || v === null) { skipped++; continue; }
    if (!KEY_OK.test(k) || k === '__proto__') { problems.push(`an item has an unusable name`); continue; }
    let text: string;
    try { text = typeof v === 'string' ? v : JSON.stringify(v); } catch { problems.push(`${k} is not readable data`); continue; }
    if (typeof text !== 'string') { problems.push(`${k} is not readable data`); continue; }
    const bad = shapeProblem(k, text);
    if (bad) { problems.push(bad); continue; }
    total += text.length;
    wanted.push([k, text]);
  }
  if (!problems.length && total > MAX_RESTORE_CHARS) problems.push('the file is larger than the app can restore');
  if (problems.length) {
    const first = [...new Set(problems)].slice(0, 3).join('; ');
    throw new Error(`This backup could not be restored safely: ${first}${problems.length > 3 ? ' and more' : ''}. Nothing was changed.`);
  }

  const existing = new Set(await store.getAllKeys());
  const pairs: [string, string][] = [];
  for (const [k, text] of wanted) {
    if (!opts.replace && existing.has(k)) { skipped++; continue; }
    pairs.push([k, text]);
  }
  if (!pairs.length) return { imported: 0, skipped };

  // keep what is there now, so a storage failure half-way can be undone
  const before = new Map<string, string | null>();
  try { for (const [k, v] of await store.multiGet(pairs.map(p => p[0]))) before.set(k, v); } catch { /* cannot snapshot: still try, and report honestly below */ }
  try {
    await store.multiSet(pairs);
  } catch {
    try {
      const put = [...before].filter(([, v]) => v !== null) as [string, string][];
      const gone = [...before].filter(([, v]) => v === null).map(([k]) => k);
      if (put.length) await store.multiSet(put);
      if (gone.length && store.multiRemove) await store.multiRemove(gone);
    } catch { /* nothing more can be done */ }
    throw new Error('The phone could not save the restored data, so the restore was undone. Free some space and try again.');
  }
  return { imported: pairs.length, skipped };
}
