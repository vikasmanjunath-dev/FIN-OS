// js/finos-tracker-sync.js — pure merge rules + the cycle against an in-memory localStorage and cloud row.
// (mobile/__tests__/trackerSync.test.mts checks this file against the mobile twin on random inputs.)
const test = require('node:test');
const assert = require('node:assert/strict');
const Sync = require('../js/finos-tracker-sync.js');

test('device-private and derived keys are never synced', () => {
  ['finos_vault', 'finos_vault_meta', 'finos_unlocked', 'finos_consents', 'finos_feedback_log', 'finos_usage', 'finos_lang',
    'finos_streak', 'finos_tracker_sync_meta', 'finos_host_ip', 'finos_net_worth', 'finos_health_score', 'finos_nps_value',
    'finos-theme', 'sb-token', ''].forEach((k) => assert.equal(Sync.isSyncKey(k), false, k));
  ['finos_goals', 'finos_transactions', 'finos_subscriptions', 'finos_monthly_income', 'finos_emergency_fund']
    .forEach((k) => assert.equal(Sync.isSyncKey(k), true, k));
});

test('one-sided changes travel, a missing key is never a deletion, conflicts: cloud wins and is reported', () => {
  const p = Sync.planSync(
    { finos_a: '1', finos_b: '1', finos_c: '1', finos_gone: 'x' },
    { finos_a: '2', finos_b: '1', finos_c: '9', finos_gone: 'x' },
    { finos_a: '1', finos_b: '2', finos_c: '8', finos_d: 'new' });
  assert.deepEqual(p.setRemote, { finos_a: '2', finos_gone: 'x' });          // local edit pushed; key the cloud lacks is re-added
  assert.deepEqual(p.setLocal, { finos_b: '2', finos_c: '8', finos_d: 'new' });
  assert.deepEqual(p.conflicts, [{ key: 'finos_c', kind: 'cloud-won', lost: '9' }]);
});

test('arrays of records merge by id, including deletes; id-less arrays union', () => {
  const base = JSON.stringify([{ id: 'a', n: 1 }, { id: 'b', n: 1 }]);
  const local = JSON.stringify([{ id: 'a', n: 2 }, { id: 'b', n: 1 }, { id: 'l', n: 1 }]);
  const remote = JSON.stringify([{ id: 'a', n: 1 }, { id: 'r', n: 1 }]);          // remote deleted b, added r
  const out = JSON.parse(Sync.mergeArrays(base, local, remote)).map((e) => e.id + ':' + e.n).sort();
  assert.deepEqual(out, ['a:2', 'l:1', 'r:1']);
  const u = JSON.parse(Sync.mergeArrays(undefined, '[{"x":1}]', '[{"x":2},{"x":1}]'));
  assert.equal(u.length, 2);
  assert.equal(Sync.mergeArrays('1', '2', '3'), null);
});

function fakeLS(init) {
  const m = new Map(Object.entries(init || {}));
  return { m, get length() { return m.size; }, key: (i) => Array.from(m.keys())[i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
function fakeClient(state) {
  return { from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.row ? JSON.parse(JSON.stringify(state.row)) : null, error: null }) }) }),
    update: (obj) => ({ eq: () => ({ eq: (_c, v) => ({ select: async () => {
      if (!state.row || state.row.updated_at !== v) return { data: [], error: null };
      state.row = { data: obj.data, updated_at: 'u' + (++state.n) }; return { data: [{ user_id: 'x' }], error: null };
    } }) }) }),
    insert: async (obj) => { if (state.row) return { error: { code: '23505', message: 'duplicate' } }; state.row = { data: obj.data, updated_at: 'u' + (++state.n) }; return { error: null }; },
  }) };
}

test('syncOnce: seeds the cloud, picks up another device\'s edit, and leaves private keys alone', async () => {
  const state = { row: null, n: 0 };
  const client = fakeClient(state);
  const ls = fakeLS({ finos_monthly_income: '60000', finos_vault: 'ciphertext', finos_net_worth: '5' });
  globalThis.localStorage = ls;
  try {
    const first = await Sync.syncOnce(client, 'u1');
    assert.equal(first.ok, true);
    assert.deepEqual(Object.keys(state.row.data), ['finos_monthly_income']);       // vault + derived stayed home

    // another device edits an existing key in the cloud…
    state.row = { data: { ...state.row.data, finos_monthly_income: '75000' }, updated_at: 'other-device' };
    const second = await Sync.syncOnce(client, 'u1');
    assert.equal(second.ok, true);
    assert.equal(ls.getItem('finos_monthly_income'), '75000');                       // …and this browser now sees it (v1 never did)
    assert.equal(ls.getItem('finos_vault'), 'ciphertext');
  } finally { delete globalThis.localStorage; }
});
