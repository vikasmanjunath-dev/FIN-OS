// One pull → merge → push cycle for tracker sync, written against two tiny interfaces (local key-value store and
// the cloud row) so it runs unchanged in the app (AsyncStorage + Supabase) and in Node tests (in-memory fakes).
import { META_KEY, isSyncKey, planSync, type KV, type Conflict } from './trackerSync.ts';

export interface LocalStore {
  /** Every key/value currently stored (the engine filters to sync keys itself). */
  readAll(): Promise<KV>;
  get(key: string): Promise<string | null>;
  set(entries: KV): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

export interface CloudRow { data: Record<string, unknown>; updatedAt: string }
export interface Cloud {
  fetch(userId: string): Promise<CloudRow | null>;
  /**
   * Write the blob. With `expectedUpdatedAt` this must only succeed if the row still has that timestamp
   * (returns 'conflict' otherwise); with null it must insert (returns 'conflict' if a row appeared meanwhile).
   */
  store(userId: string, data: Record<string, unknown>, expectedUpdatedAt: string | null): Promise<'ok' | 'conflict'>;
}

export interface SyncMeta {
  owner?: string;
  base?: KV;
  conflicts?: (Conflict & { at: number })[];
  lastSyncAt?: number;
  lastPushedAt?: number;
}

export interface SyncResult {
  ok: boolean;
  /** local keys written from the cloud (screens should reload when > 0) */
  pulled: number;
  pushed: boolean;
  conflicts: number;
  /** another writer got in between — run again */
  retry?: boolean;
  error?: string;
}

const MAX_CONFLICT_LOG = 20;
const fail = (error: string): SyncResult => ({ ok: false, pulled: 0, pushed: false, conflicts: 0, error });

async function readMeta(store: LocalStore): Promise<SyncMeta> {
  try { return JSON.parse((await store.get(META_KEY)) || '{}') || {}; } catch { return {}; }
}

export async function runSync(store: LocalStore, cloud: Cloud, userId: string, now: () => number = Date.now): Promise<SyncResult> {
  try {
    const meta = await readMeta(store);
    const row = await cloud.fetch(userId);

    const remote: KV = {};
    if (row?.data && typeof row.data === 'object') {
      Object.keys(row.data).forEach(k => { const v = row.data[k]; if (typeof v === 'string') remote[k] = v; });
    }

    const all = await store.readAll();
    let local: KV = {};
    Object.keys(all).forEach(k => { if (isSyncKey(k)) local[k] = all[k]; });
    let base = meta.base || {};

    // Another account's data must never merge into this one: adopt this user's cloud copy instead.
    if (meta.owner && meta.owner !== userId) {
      await store.remove(Object.keys(local).filter(k => !(k in remote)));
      local = {};
      base = {};
    }

    const plan = planSync(base, local, remote);
    if (Object.keys(plan.setLocal).length) await store.set(plan.setLocal);

    let pushed = false;
    const needPush = Object.keys(plan.setRemote).length > 0 || (!row && Object.keys(plan.nextBase).length > 0);
    if (needPush) {
      const merged = { ...(row?.data ?? {}), ...plan.setRemote };
      const res = await cloud.store(userId, merged, row ? row.updatedAt : null);
      if (res === 'conflict') {
        // Somebody wrote between our read and our write. What we pulled is still correct locally, but we
        // don't record a base, so the next run re-plans from the fresh cloud row.
        return { ok: false, pulled: Object.keys(plan.setLocal).length, pushed: false, conflicts: 0, retry: true };
      }
      pushed = true;
    }

    const log = [...(meta.conflicts ?? []), ...plan.conflicts.map(c => ({ ...c, at: now() }))].slice(-MAX_CONFLICT_LOG);
    const next: SyncMeta = { ...meta, owner: userId, base: plan.nextBase, conflicts: log, lastSyncAt: now(), lastPushedAt: pushed ? now() : meta.lastPushedAt };
    await store.set({ [META_KEY]: JSON.stringify(next) });
    return { ok: true, pulled: Object.keys(plan.setLocal).length, pushed, conflicts: plan.conflicts.length };
  } catch (e: any) {
    return fail(String(e?.message ?? e));
  }
}

export async function readSyncMeta(store: LocalStore): Promise<SyncMeta> {
  return readMeta(store);
}
