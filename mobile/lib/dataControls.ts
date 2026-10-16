// Export and erase: the person's own controls over what the app holds, on the phone and in the cloud.
// Takes the storage / Supabase client as arguments so the logic is testable without React Native.
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface KeyValueStore {
  getAllKeys(): Promise<readonly string[]>;
  multiGet(keys: readonly string[]): Promise<readonly (readonly [string, string | null])[]>;
  clear(): Promise<void>;
}

import { NEVER_EXPORT } from '@/lib/storageKeys';

const isAppKey = (k: string) => /^finos_/.test(k) && !NEVER_EXPORT.test(k);   // the lock's verifier and the session key are secrets, not records

/** Everything the app keeps on this phone, as one JSON document the person can save. Sign-in tokens are never included. */
export async function exportAllData(store: KeyValueStore = AsyncStorage, now = new Date()): Promise<{ json: string; keys: number }> {
  const keys = (await store.getAllKeys()).filter(isAppKey).sort();
  const pairs = await store.multiGet(keys);
  const data: Record<string, unknown> = {};
  for (const [k, v] of pairs) {
    if (v == null) continue;
    try { data[k] = JSON.parse(v); } catch { data[k] = v; }       // keep real structure where the value is JSON
  }
  const doc = { app: 'FIN·OS mobile', exportedAt: now.toISOString(), note: 'Your own data, exported from this phone. Sign-in tokens are not included.', data };
  return { json: JSON.stringify(doc, null, 2), keys: Object.keys(data).length };
}

/** Remove everything in AsyncStorage, including the sign-in session. (Use eraseEverything for the whole flow.) */
export async function eraseLocalData(store: KeyValueStore = AsyncStorage): Promise<void> {
  await store.clear();
}

// ── the whole erase flow ──────────────────────────────────────────────────────────────────────────────────────────────────────
export interface EraseDeps {
  /** End the cloud session on this phone only. Must happen first, so nothing syncs the data back while it is being removed. */
  signOutLocal(): Promise<void>;
  /** Forget what modules hold in memory (holdings, sync state, theme, language) so it cannot be written back. */
  resetMemory(): Promise<void> | void;
  /** Scheduled reminders and notifications already delivered (they can name a policy and an amount). */
  cancelNotifications(): Promise<void>;
  /** Backup files and document-picker copies in the cache. */
  clearFiles(): Promise<void>;
  /** The app lock, and the key that encrypts the session (Keychain / Keystore). */
  clearSecure(): Promise<void>;
  store: { getAllKeys(): Promise<readonly string[]>; clear(): Promise<void>; multiRemove(keys: readonly string[]): Promise<void> };
  /** Rebuild every screen from empty storage. */
  finish(): void;
  wait?(ms: number): Promise<void>;
}

export interface EraseResult { ok: boolean; failed: string[]; leftover: string[] }

/**
 * Erase everything this app keeps on this phone, in the order that cannot bring it back:
 * sign out (so sync stops) -> forget memory -> notifications -> files -> secure storage -> AsyncStorage, then check.
 * A write that was already in flight when the clear ran is caught by the check, which removes whatever came back.
 * A step that fails is reported by name; the others still run, so one broken module never leaves the rest in place.
 */
export async function eraseEverything(d: EraseDeps): Promise<EraseResult> {
  const failed: string[] = [];
  const step = async (name: string, fn: () => Promise<void> | void) => { try { await fn(); } catch { failed.push(name); } };
  await step('sign-out', d.signOutLocal);
  await step('memory', d.resetMemory);
  await step('notifications', d.cancelNotifications);
  await step('files', d.clearFiles);
  await step('secure-storage', d.clearSecure);
  await step('storage', () => d.store.clear());
  let leftover: string[] = [];
  for (let i = 0; i < 3; i++) {
    try { leftover = [...(await d.store.getAllKeys())]; } catch { failed.push('storage-check'); break; }
    if (leftover.length === 0) break;
    await (d.wait ?? (ms => new Promise<void>(r => setTimeout(r, ms))))(60);
    await step('storage', () => d.store.multiRemove(leftover));
    try { leftover = [...(await d.store.getAllKeys())]; } catch { break; }
    if (leftover.length === 0) break;
  }
  await step('screens', d.finish);
  return { ok: failed.length === 0 && leftover.length === 0, failed, leftover };
}

export interface CloudClient {
  auth: { getUser(): Promise<{ data: { user: { id: string } | null } }>; signOut(opts?: { scope: 'local' | 'global' | 'others' }): Promise<unknown> };
  from(table: string): { delete(): { eq(col: string, v: string): PromiseLike<{ error: { message: string } | null }> } };
  rpc(fn: string): PromiseLike<{ error: { message: string } | null }>;
}

/**
 * The tables THIS APP writes. The website can also have written profile, transactions, goals, budgets and others for the same
 * account: those are removed by "Delete my account" (supabase/delete_account.sql), not by "Delete my cloud copy".
 */
export const CLOUD_TABLES = ['tracker_snapshot', 'holdings'] as const;

/** Keys that link this phone's data to one account. Removed when that account is deleted. */
export const ACCOUNT_LINK_KEYS = ['finos_holdings_owner', 'finos_holdings_last_sync', 'finos_holdings_tombstones_v1', 'finos_tracker_sync_meta'] as const;

// Loaded on demand so the pure logic above can run (and be tested) without the React Native Supabase setup.
async function appClient(): Promise<CloudClient | null> {
  const { supabase } = await import('@/lib/supabase');
  return supabase as unknown as CloudClient | null;
}

/** Delete this person's rows in the cloud (row-level security means only their own can be touched). */
export async function deleteCloudData(client?: CloudClient | null): Promise<{ ok: boolean; error?: string }> {
  if (client === undefined) client = await appClient();
  if (!client) return { ok: false, error: 'Cloud sync is not set up on this app.' };
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { ok: false, error: 'You are not signed in.' };
  for (const table of CLOUD_TABLES) {
    const { error } = await client.from(table).delete().eq('user_id', user.id);
    if (error) return { ok: false, error: `${table}: ${error.message}` };
  }
  return { ok: true };
}

/**
 * Delete the sign-in account itself (and, through foreign-key cascades, every row it owns).
 * Needs supabase/delete_account.sql to have been run; without it the call fails and nothing is changed.
 */
export async function deleteAccount(client?: CloudClient | null, after?: () => Promise<void> | void): Promise<{ ok: boolean; error?: string }> {
  if (client === undefined) client = await appClient();
  if (!client) return { ok: false, error: 'Cloud sync is not set up on this app.' };
  const { error } = await client.rpc('delete_my_account');
  if (error) {
    const missing = /function .*delete_my_account|Could not find the function|PGRST202/i.test(error.message);
    return { ok: false, error: missing ? 'Account deletion is not set up on the server yet (run supabase/delete_account.sql).' : error.message };
  }
  try { await (client.auth as any).signOut({ scope: 'local' }); } catch { /* the account is gone; the session ends with it */ }
  // The local copy no longer belongs to any account: forget the links, so the next sign-in merges it instead of replacing it.
  try { await after?.(); } catch { /* best effort */ }
  return { ok: true };
}
