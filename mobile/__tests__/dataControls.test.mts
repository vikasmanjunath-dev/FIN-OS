import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as dc from '@/lib/dataControls';

beforeEach(async () => { await AsyncStorage.clear(); });

test('export contains the app\'s data with real structure, and never a sign-in token', async () => {
  await AsyncStorage.multiSet([
    ['finos_transactions', JSON.stringify([{ id: 't1', amount: 10 }])],
    ['finos_user_name', 'Asha'],
    ['sb-abcdefgh-auth-token', JSON.stringify({ access_token: 'SECRET', refresh_token: 'SECRET2' })],
    ['some_other_lib_key', 'x'],
  ]);
  const { json, keys } = await dc.exportAllData(AsyncStorage as any, new Date('2026-10-12T10:00:00Z'));
  const doc = JSON.parse(json);
  assert.equal(keys, 2);
  assert.deepEqual(doc.data.finos_transactions, [{ id: 't1', amount: 10 }]);
  assert.equal(doc.data.finos_user_name, 'Asha');
  assert.ok(!json.includes('SECRET'), 'no token in the export');
  assert.equal(doc.exportedAt, '2026-10-12T10:00:00.000Z');
});

test('erase removes everything, including the session', async () => {
  await AsyncStorage.multiSet([['finos_goals', '[]'], ['sb-x-auth-token', 'tok']]);
  await dc.eraseLocalData(AsyncStorage as any);
  assert.deepEqual(await AsyncStorage.getAllKeys(), []);
});

function fakeClient(opts: { user?: { id: string } | null; failTable?: string; rpcError?: string } = {}) {
  const calls: string[] = [];
  const client: any = {
    auth: {
      async getUser() { return { data: { user: opts.user === undefined ? { id: 'u1' } : opts.user } }; },
      async signOut() { calls.push('signOut'); },
    },
    from(table: string) {
      return { delete() { return { eq: async (col: string, v: string) => { calls.push(`delete ${table} where ${col}=${v}`); return { error: opts.failTable === table ? { message: 'boom' } : null }; } }; } };
    },
    async rpc(fn: string) { calls.push(`rpc ${fn}`); return { error: opts.rpcError ? { message: opts.rpcError } : null }; },
  };
  return { client, calls };
}

test('delete cloud copy removes only the signed-in person\'s rows from both tables', async () => {
  const { client, calls } = fakeClient();
  const r = await dc.deleteCloudData(client);
  assert.equal(r.ok, true);
  assert.deepEqual(calls, ['delete tracker_snapshot where user_id=u1', 'delete holdings where user_id=u1']);
});

test('delete cloud copy: not signed in, no client, or a failing table is reported, not swallowed', async () => {
  assert.equal((await dc.deleteCloudData(null)).ok, false);
  assert.match((await dc.deleteCloudData(fakeClient({ user: null }).client)).error!, /not signed in/i);
  const bad = await dc.deleteCloudData(fakeClient({ failTable: 'holdings' }).client);
  assert.equal(bad.ok, false);
  assert.match(bad.error!, /holdings: boom/);
});

test('delete account calls the server function, signs out on success, and explains a missing function', async () => {
  const ok = fakeClient();
  assert.equal((await dc.deleteAccount(ok.client)).ok, true);
  assert.deepEqual(ok.calls, ['rpc delete_my_account', 'signOut']);

  const missing = fakeClient({ rpcError: 'Could not find the function public.delete_my_account in the schema cache' });
  const r = await dc.deleteAccount(missing.client);
  assert.equal(r.ok, false);
  assert.match(r.error!, /delete_account\.sql/);
  assert.deepEqual(missing.calls, ['rpc delete_my_account'], 'must not sign out when nothing was deleted');
});
