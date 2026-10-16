// "Delete everything on this phone", end to end with a fake for every place the app keeps something.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eraseEverything, deleteAccount, type EraseDeps } from '../lib/dataControls.ts';
import { SECURE_KEYS } from '../lib/storageKeys.ts';

function world() {
  const log: string[] = [];
  const w = {
    log,
    async: new Map<string, string>([['finos_transactions', '[1]'], ['finos_goals', '[2]'], ['sb-abc-auth-token', 'enc1:xyz'], ['finos_onboarding_mobile', '{}'], ['finos_theme_mobile', 'light']]),
    secure: new Map<string, string>(SECURE_KEYS.map(k => [k, 'v'])),
    scheduled: ['finos-a', 'finos-b'], delivered: ['n1'],
    files: ['finos-backup-2026-10-14.finos-backup.json', 'DocumentPicker', 'unrelated.txt'],
    memory: { holdings: ['INFY'], trackerSyncAt: 123, theme: 'light', lang: 'hi' } as any,
    session: true, epoch: 0, writeBack: null as null | (() => void),
  };
  const deps: EraseDeps = {
    signOutLocal: async () => { log.push('signOut'); w.session = false; },
    resetMemory: async () => { log.push('memory'); w.memory = { holdings: [], trackerSyncAt: null, theme: 'dark', lang: 'en' }; },
    cancelNotifications: async () => { log.push('notifications'); w.scheduled = []; w.delivered = []; },
    clearFiles: async () => { log.push('files'); w.files = w.files.filter(f => !/^finos-backup-|^DocumentPicker$/.test(f)); },
    clearSecure: async () => { log.push('secure'); w.secure.clear(); },
    store: {
      getAllKeys: async () => [...w.async.keys()],
      clear: async () => { log.push('clear'); w.async.clear(); w.writeBack?.(); w.writeBack = null; },
      multiRemove: async (ks: readonly string[]) => { log.push(`remove ${ks.join(',')}`); ks.forEach(k => w.async.delete(k)); },
    },
    finish: () => { log.push('finish'); w.epoch++; },
    wait: async () => {},
  };
  return { w, deps };
}

test('every storage is empty afterwards, the session is gone, and the order cannot bring data back', async () => {
  const { w, deps } = world();
  const r = await eraseEverything(deps);
  assert.deepEqual(r, { ok: true, failed: [], leftover: [] });
  assert.equal(w.async.size, 0);
  assert.equal(w.secure.size, 0);
  assert.deepEqual(w.scheduled, []); assert.deepEqual(w.delivered, []);
  assert.deepEqual(w.files, ['unrelated.txt']);
  assert.equal(w.session, false);
  assert.deepEqual(w.memory, { holdings: [], trackerSyncAt: null, theme: 'dark', lang: 'en' });
  assert.equal(w.epoch, 1);
  assert.deepEqual(w.log.slice(0, 2), ['signOut', 'memory']);                       // signed out and forgotten BEFORE storage is cleared
  assert.ok(w.log.indexOf('clear') > w.log.indexOf('secure'));
  assert.equal(w.log.at(-1), 'finish');
});

test('a write that was already in flight when the clear ran is caught and removed', async () => {
  const { w, deps } = world();
  w.writeBack = () => { w.async.set('finos_holdings_v1', '[{"symbol":"INFY"}]'); };
  const r = await eraseEverything(deps);
  assert.equal(r.ok, true);
  assert.equal(w.async.size, 0);
  assert.ok(w.log.some(l => l.startsWith('remove finos_holdings_v1')));
});

test('a step that fails is reported by name and the others still run', async () => {
  const { w, deps } = world();
  deps.clearSecure = async () => { throw new Error('keychain locked'); };
  deps.cancelNotifications = async () => { throw new Error('no module'); };
  const r = await eraseEverything(deps);
  assert.equal(r.ok, false);
  assert.deepEqual(r.failed.sort(), ['notifications', 'secure-storage']);
  assert.equal(w.async.size, 0);
  assert.equal(w.epoch, 1);
});

test('storage that keeps refusing to empty is reported as leftover, not hidden', async () => {
  const { deps } = world();
  deps.store.clear = async () => {};
  deps.store.multiRemove = async () => {};
  const r = await eraseEverything(deps);
  assert.equal(r.ok, false);
  assert.ok(r.leftover.includes('finos_goals'));
});

test('the secure items erased are exactly the ones the app stores', () => {
  assert.deepEqual([...SECURE_KEYS].sort(), ['finos_applock_fail', 'finos_applock_meta', 'finos_applock_verifier', 'finos_session_key']);
});

test('account deletion: server call first, local session ended, account links forgotten; nothing signed out when the server refused', async () => {
  const calls: string[] = [];
  const client: any = {
    auth: { getUser: async () => ({ data: { user: { id: 'u' } } }), signOut: async (o: any) => { calls.push(`signOut ${o?.scope}`); } },
    from: () => ({}), rpc: async () => ({ error: null }),
  };
  const r = await deleteAccount(client, async () => { calls.push('detach'); });
  assert.equal(r.ok, true);
  assert.deepEqual(calls, ['signOut local', 'detach']);
  const refused: any = { ...client, rpc: async () => ({ error: { message: 'boom' } }) };
  calls.length = 0;
  const bad = await deleteAccount(refused, async () => { calls.push('detach'); });
  assert.equal(bad.ok, false); assert.deepEqual(calls, []);
});
