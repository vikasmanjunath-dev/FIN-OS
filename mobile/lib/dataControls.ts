// Export and erase: the person's own controls over what the app holds, on the phone and in the cloud.
// Takes the storage / Supabase client as arguments so the logic is testable without React Native.
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface KeyValueStore {
  getAllKeys(): Promise<readonly string[]>;
  multiGet(keys: readonly string[]): Promise<readonly (readonly [string, string | null])[]>;
  clear(): Promise<void>;
}

const isAppKey = (k: string) => /^finos_/.test(k);

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

/** Remove everything the app stores on this phone, including the sign-in session. */
export async function eraseLocalData(store: KeyValueStore = AsyncStorage): Promise<void> {
  await store.clear();
}

export interface CloudClient {
  auth: { getUser(): Promise<{ data: { user: { id: string } | null } }>; signOut(): Promise<unknown> };
  from(table: string): { delete(): { eq(col: string, v: string): PromiseLike<{ error: { message: string } | null }> } };
  rpc(fn: string): PromiseLike<{ error: { message: string } | null }>;
}

const CLOUD_TABLES = ['tracker_snapshot', 'holdings'] as const;

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
export async function deleteAccount(client?: CloudClient | null): Promise<{ ok: boolean; error?: string }> {
  if (client === undefined) client = await appClient();
  if (!client) return { ok: false, error: 'Cloud sync is not set up on this app.' };
  const { error } = await client.rpc('delete_my_account');
  if (error) {
    const missing = /function .*delete_my_account|Could not find the function|PGRST202/i.test(error.message);
    return { ok: false, error: missing ? 'Account deletion is not set up on the server yet (run supabase/delete_account.sql).' : error.message };
  }
  await client.auth.signOut();
  return { ok: true };
}
