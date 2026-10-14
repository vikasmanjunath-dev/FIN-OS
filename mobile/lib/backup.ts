// Building a backup of what is on the phone, and putting one back. Pure: the store is passed in.
// The plain shape is the website's ({app:'FIN-OS', schema, exportedAt, data, indexedDB}), so a file from either side is read by the other.
import { NEVER_BACKUP } from '@/lib/storageKeys';

export interface KV {
  getAllKeys(): Promise<readonly string[]>;
  multiGet(keys: readonly string[]): Promise<readonly (readonly [string, string | null])[]>;
  multiSet(pairs: [string, string][]): Promise<void>;
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
/** `replace: false` only fills what is missing; `true` overwrites keys the backup also holds. */
export async function restoreBackup(plain: any, store: KV, opts: { replace: boolean } = { replace: false }): Promise<RestoreResult> {
  const sum = summarise(plain);
  if (!sum) throw new Error('This is not a FIN·OS backup.');
  if (sum.newerThanApp) throw new Error('This backup was made by a newer version of FIN·OS. Update the app and try again.');
  const existing = new Set(await store.getAllKeys());
  const pairs: [string, string][] = [];
  let skipped = 0;
  for (const [k, v] of Object.entries(plain.data as Record<string, unknown>)) {
    if (!isBackupKey(k) || v === undefined || v === null) { skipped++; continue; }
    if (!opts.replace && existing.has(k)) { skipped++; continue; }
    pairs.push([k, typeof v === 'string' ? v : JSON.stringify(v)]);
  }
  if (pairs.length) await store.multiSet(pairs);
  return { imported: pairs.length, skipped };
}
