import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBackup, restoreBackup, summarise, isBackupKey, type KV } from '../lib/backup.ts';

const mem = (init: Record<string, string>): KV & { m: Map<string, string> } => {
  const m = new Map(Object.entries(init));
  return { m, getAllKeys: async () => [...m.keys()], multiGet: async ks => ks.map(k => [k, m.get(k) ?? null] as const), multiSet: async p => { p.forEach(([k, v]) => m.set(k, v)); } };
};

test('a backup holds the app keys, parsed, and never the lock, host, theme or other apps\' keys', async () => {
  const s = mem({ finos_goals: '[{"id":"g"}]', finos_age: '34', finos_applock_meta: '{"enabled":true}', finos_host_ip: '10.0.0.4', finos_theme_mobile: 'light', other_app: 'x', FINOS_CORE_DNA: '{"scores":[1,2,3,4,5]}' });
  const b = await buildBackup(s, new Date('2026-10-14T00:00:00Z'));
  assert.deepEqual(Object.keys(b.data).sort(), ['FINOS_CORE_DNA', 'finos_age', 'finos_goals']);
  assert.deepEqual(b.data.finos_goals, [{ id: 'g' }]);
  assert.equal(b.data.finos_age, 34);                         // JSON-parsed like the website's store does
  assert.equal(b.app, 'FIN-OS');
  assert.ok(!isBackupKey('finos_applock_verifier'));
});

test('restore fills only what is missing by default and overwrites on request', async () => {
  const plain = { app: 'FIN-OS', schema: 1, exportedAt: 'x', data: { finos_age: 40, finos_goals: [{ id: 'a' }], finos_name_note: 'hi', not_ours: 1, finos_applock_meta: 'evil' } };
  const s = mem({ finos_age: '30' });
  const merged = await restoreBackup(plain, s);
  assert.deepEqual(merged, { imported: 2, skipped: 3 });
  assert.equal(s.m.get('finos_age'), '30');
  assert.equal(s.m.get('finos_goals'), '[{"id":"a"}]');
  assert.equal(s.m.has('finos_applock_meta'), false);
  const s2 = mem({ finos_age: '30' });
  await restoreBackup(plain, s2, { replace: true });
  assert.equal(s2.m.get('finos_age'), '40');
});

test('a website backup is read, offline records are counted not imported, and bad files are refused', async () => {
  const web = { app: 'FIN-OS', schema: 1, exportedAt: '2026-10-01', data: { finos_age: 33 }, indexedDB: { transactions: [{ id: 1 }, { id: 2 }], journal: [{ id: 3 }] } };
  const sum = summarise(web)!;
  assert.deepEqual([sum.keys, sum.offlineRecords, sum.source], [1, 3, 'the website']);
  assert.equal(summarise({ nope: 1 }), null);
  await assert.rejects(restoreBackup({ app: 'FIN-OS', schema: 99, data: {} }, mem({}), { replace: false }), /newer version/);
  await assert.rejects(restoreBackup({ hello: 1 }, mem({}), { replace: false }), /not a FIN/);
});
