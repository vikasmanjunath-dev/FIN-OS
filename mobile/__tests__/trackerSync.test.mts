// Tracker sync: the mobile engine and the website's js/finos-tracker-sync.js must behave identically, and together
// they must converge. No network: both talk to an in-memory "cloud" that enforces the same optimistic-concurrency rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as mobile from '../lib/trackerSync.ts';
import { runSync, type LocalStore, type Cloud, type CloudRow } from '../lib/trackerSyncEngine.ts';

const web = createRequire(import.meta.url)('../../js/finos-tracker-sync.js');

/* ── fixtures ─────────────────────────────────────────────────────────── */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
const R = rng(20261011);
const pick = <T,>(a: readonly T[]) => a[Math.floor(R() * a.length)];
const int = (lo: number, hi: number) => lo + Math.floor(R() * (hi - lo + 1));

class MemStore implements LocalStore {
  m = new Map<string, string>();
  async readAll() { return Object.fromEntries(this.m); }
  async get(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  async set(e: Record<string, string>) { Object.entries(e).forEach(([k, v]) => this.m.set(k, v)); }
  async remove(keys: string[]) { keys.forEach(k => this.m.delete(k)); }
  // minimal Web Storage surface so the website module can run against the same data
  get length() { return this.m.size; }
  key(i: number) { return Array.from(this.m.keys())[i] ?? null; }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
}

/** One Supabase row per user with the same compare-and-set rule the real adapter uses. */
class FakeCloud {
  row: { data: Record<string, unknown>; updated_at: string } | null = null;
  tick = 0;
  hook: (() => void) | null = null;           // runs between a client's read and its write (simulates a racing writer)
  private bump() { return `2026-10-11T00:00:${String(++this.tick).padStart(2, '0')}.000Z`; }

  // mobile engine interface
  asCloud(): Cloud {
    return {
      fetch: async () => { const r = this.row ? { data: JSON.parse(JSON.stringify(this.row.data)), updatedAt: this.row.updated_at } as CloudRow : null; if (this.hook) { const h = this.hook; this.hook = null; h(); } return r; },
      store: async (_u, data, expected) => {
        if (expected === null ? this.row !== null : this.row?.updated_at !== expected) return 'conflict';
        this.row = { data: JSON.parse(JSON.stringify(data)), updated_at: this.bump() };
        return 'ok';
      },
    };
  }
  // supabase-js-shaped client for the website module
  asClient() {
    const self = this;
    return {
      from() {
        return {
          select() { return { eq() { return { maybeSingle: async () => { const r = self.row; if (self.hook) { const h = self.hook; self.hook = null; h(); } return { data: r ? JSON.parse(JSON.stringify(r)) : null, error: null }; } }; } }; },
          update(obj: any) {
            return { eq() { return { eq(_c: string, v: string) { return { select: async () => {
              if (self.row?.updated_at !== v) return { data: [], error: null };
              self.row = { data: JSON.parse(JSON.stringify(obj.data)), updated_at: self.bump() };
              return { data: [{ user_id: 'u' }], error: null };
            } }; } }; } };
          },
          insert: async (obj: any) => {
            if (self.row) return { error: { code: '23505', message: 'duplicate key' } };
            self.row = { data: JSON.parse(JSON.stringify(obj.data)), updated_at: self.bump() };
            return { error: null };
          },
        };
      },
    };
  }
}

const UID = 'user-1';
const phoneSync = (s: MemStore, c: FakeCloud, uid = UID) => runSync(s, c.asCloud(), uid);
async function websiteSync(s: MemStore, c: FakeCloud, uid = UID) {
  (globalThis as any).localStorage = s;
  try { return await web.syncOnce(c.asClient(), uid); } finally { delete (globalThis as any).localStorage; }
}
const blob = (c: FakeCloud) => (c.row?.data ?? {}) as Record<string, string>;
const metaOf = (s: MemStore) => JSON.parse(s.m.get('finos_tracker_sync_meta') || '{}');

/* ── 1. the two merge implementations agree ───────────────────────────── */
test('isSyncKey: device-private keys never travel, tracker keys do (mobile == website)', () => {
  const keys = ['finos_emergency_fund', 'finos_goals', 'finos_transactions', 'finos_subscriptions', 'finos_user_name',
    'finos_vault', 'finos_vault_meta', 'finos_unlocked', 'finos_consents', 'finos_feedback_log', 'finos_usage', 'finos_usage_v1',
    'finos_lang', 'finos_streak', 'finos_session_meta', 'finos_sessions', 'finos_session_pages_v2', 'finos_tracker_sync_meta',
    'finos_sync_base', 'finos_host_ip', 'finos_holdings_v1', 'finos_recurring_v1', 'finos_reminders_seen', 'finos-theme', 'sb-token', '', 'finos_'];
  keys.forEach(k => assert.equal(mobile.isSyncKey(k), web.isSyncKey(k), k));
  ['finos_vault', 'finos_consents', 'finos_host_ip', 'finos_holdings_v1', 'finos_streak'].forEach(k => assert.equal(mobile.isSyncKey(k), false, k));
  ['finos_transactions', 'finos_subscriptions', 'finos_user_name', 'finos_monthly_income', 'finos_goals'].forEach(k => assert.equal(mobile.isSyncKey(k), true, k));
  // derived totals are recomputed per device, never synced
  ['finos_net_worth', 'finos_health_score', 'finos_savings_rate', 'finos_nps_value', 'finos_portfolio_value'].forEach(k => {
    assert.equal(mobile.isSyncKey(k), false, k);
    assert.equal(web.isSyncKey(k), false, k);
  });
});

function randValue(): string {
  const kind = int(0, 5);
  if (kind === 0) return String(int(0, 100000));
  if (kind === 1) return JSON.stringify({ a: int(0, 9), b: pick(['x', 'y']) });
  if (kind === 2) return JSON.stringify(Array.from({ length: int(0, 5) }, () => ({ id: `r${int(1, 8)}`, amount: int(1, 5) * 100 })).filter((e, i, a) => a.findIndex(x => x.id === e.id) === i));
  if (kind === 3) return JSON.stringify(Array.from({ length: int(0, 4) }, () => ({ name: pick(['A', 'B', 'C']), v: int(1, 3) })));
  if (kind === 4) return 'not json ' + int(0, 4);
  return '[]';
}
function mutate(v: string | undefined): string | undefined {
  const r = R();
  if (v === undefined) return r < 0.5 ? undefined : randValue();
  if (r < 0.45) return v;
  if (r < 0.55) return undefined;
  try {
    const p = JSON.parse(v);
    if (Array.isArray(p) && r < 0.8) {
      const q = p.slice();
      if (q.length && R() < 0.5) q.splice(int(0, q.length - 1), 1);
      else q.push({ id: `r${int(1, 12)}`, amount: int(1, 9) * 10 });
      if (R() < 0.3 && q.length && isRecordLike(q[0])) q[0] = { ...q[0], amount: int(1, 9) };
      return JSON.stringify(q);
    }
  } catch { /* fall through */ }
  return randValue();
}
const isRecordLike = (e: any) => e && typeof e === 'object' && !Array.isArray(e);

test('planSync: mobile and website produce identical plans for 4,000 random base/local/remote triples', () => {
  const pool = ['finos_a', 'finos_b', 'finos_c', 'finos_d', 'finos_e', 'finos_transactions', 'finos_goals', 'finos_vault', 'finos_host_ip', 'finos_streak'];
  for (let i = 0; i < 4000; i++) {
    const base: Record<string, string> = {}, local: Record<string, string> = {}, remote: Record<string, string> = {};
    for (const k of pool) {
      const b = R() < 0.6 ? randValue() : undefined;
      if (b !== undefined) base[k] = b;
      const l = mutate(b), r = mutate(b);
      if (l !== undefined) local[k] = l;
      if (r !== undefined) remote[k] = r;
    }
    assert.deepEqual(mobile.planSync(base, local, remote), web.planSync(base, local, remote), `case ${i}`);
  }
});

/* ── 2. merge semantics ────────────────────────────────────────────────── */
test('three-way rules: one-sided changes, missing keys, and conflicts', () => {
  const p = mobile.planSync({ finos_a: '1', finos_b: '1', finos_c: '1' }, { finos_a: '2', finos_b: '1', finos_c: '9' }, { finos_a: '1', finos_b: '2', finos_c: '8', finos_d: 'new' });
  assert.deepEqual(p.setRemote, { finos_a: '2' });                       // only local changed → push
  assert.deepEqual(p.setLocal, { finos_b: '2', finos_c: '8', finos_d: 'new' }); // only remote changed → pull; conflict → cloud wins; new → fill
  assert.deepEqual(p.conflicts, [{ key: 'finos_c', kind: 'cloud-won', lost: '9' }]);
  // a key missing on one side is copied, never deleted
  const q = mobile.planSync({ finos_x: 'old' }, { finos_x: 'old' }, {});
  assert.deepEqual(q.setRemote, { finos_x: 'old' });
  assert.deepEqual(q.setLocal, {});
});

test('arrays with ids merge three ways, including deletes; id-less arrays union', () => {
  const base = JSON.stringify([{ id: 'a', n: 1 }, { id: 'b', n: 1 }, { id: 'c', n: 1 }]);
  const local = JSON.stringify([{ id: 'a', n: 2 }, { id: 'b', n: 1 }, { id: 'c', n: 1 }, { id: 'l', n: 1 }]);        // edit a, add l
  const remote = JSON.stringify([{ id: 'a', n: 1 }, { id: 'c', n: 5 }, { id: 'r', n: 1 }]);                          // delete b, edit c, add r
  const merged = JSON.parse(mobile.mergeArrays(base, local, remote)!);
  assert.deepEqual(merged.map((e: any) => `${e.id}:${e.n}`).sort(), ['a:2', 'c:5', 'l:1', 'r:1']);
  // edited locally while deleted remotely → the edit survives
  const m2 = JSON.parse(mobile.mergeArrays(JSON.stringify([{ id: 'a', n: 1 }]), JSON.stringify([{ id: 'a', n: 9 }]), '[]')!);
  assert.deepEqual(m2, [{ id: 'a', n: 9 }]);
  // no ids → union, nothing lost
  const u = JSON.parse(mobile.mergeArrays(undefined, '[{"name":"A"},{"name":"B"}]', '[{"name":"B"},{"name":"C"}]')!);
  assert.deepEqual(u.map((e: any) => e.name), ['A', 'B', 'C']);
  assert.equal(mobile.mergeArrays('1', '5', '6'), null);                     // scalars are not mergeable
});

/* ── 3. phone ↔ website through one cloud ─────────────────────────────── */
test('phone ↔ website: a change on either side reaches the other (the thing v1 could not do)', async () => {
  const cloud = new FakeCloud();
  const phone = new MemStore(), site = new MemStore();
  phone.m.set('finos_monthly_income', '60000');
  phone.m.set('finos_transactions', JSON.stringify([{ id: 't1', amount: 100 }, { id: 't2', amount: 200 }]));

  assert.equal((await phoneSync(phone, cloud)).pushed, true);              // phone seeds the cloud
  const w1 = await websiteSync(site, cloud);                               // fresh browser hydrates
  assert.equal(w1.ok, true);
  assert.equal(site.m.get('finos_monthly_income'), '60000');

  phone.m.set('finos_monthly_income', '65000');                            // phone edits an existing key
  await phoneSync(phone, cloud);
  await websiteSync(site, cloud);
  assert.equal(site.m.get('finos_monthly_income'), '65000');               // …and the website sees it

  // website deletes t1; phone (not yet synced) adds t3 → both survive correctly
  site.m.set('finos_transactions', JSON.stringify([{ id: 't2', amount: 200 }]));
  phone.m.set('finos_transactions', JSON.stringify([{ id: 't1', amount: 100 }, { id: 't2', amount: 200 }, { id: 't3', amount: 300 }]));
  await websiteSync(site, cloud);
  await phoneSync(phone, cloud);
  await websiteSync(site, cloud);
  const ids = (s: MemStore) => JSON.parse(s.m.get('finos_transactions')!).map((e: any) => e.id).sort();
  assert.deepEqual(ids(phone), ['t2', 't3']);
  assert.deepEqual(ids(site), ['t2', 't3']);
});

test('private and device-only keys never reach the cloud', async () => {
  const cloud = new FakeCloud();
  const phone = new MemStore(), site = new MemStore();
  const priv = { finos_vault: 'ciphertext', finos_vault_meta: '{"salt":"x"}', finos_consents: '{}', finos_feedback_log: '[]', finos_host_ip: '10.0.0.2', finos_holdings_v1: '[]', finos_recurring_v1: '[]', finos_streak: '5' };
  Object.entries(priv).forEach(([k, v]) => { phone.m.set(k, v); site.m.set(k, v); });
  phone.m.set('finos_emergency_fund', '100');
  site.m.set('finos_goals', '[]');
  await phoneSync(phone, cloud);
  await websiteSync(site, cloud);
  Object.keys(priv).forEach(k => assert.equal(k in blob(cloud), false, `${k} leaked`));
  assert.deepEqual(Object.keys(blob(cloud)).sort(), ['finos_emergency_fund', 'finos_goals']);
});

test('a second run with nothing changed is a no-op; missing keys are restored, never deleted', async () => {
  const cloud = new FakeCloud();
  const phone = new MemStore();
  phone.m.set('finos_emergency_fund', '100');
  await phoneSync(phone, cloud);
  const again = await phoneSync(phone, cloud);
  assert.deepEqual([again.ok, again.pulled, again.pushed, again.conflicts], [true, 0, false, 0]);
  // an old (v1) website client overwrote the blob without our mobile-added key → phone re-adds it, keeps its value
  phone.m.set('finos_subscriptions', '[{"id":"s1","name":"Netflix"}]');
  await phoneSync(phone, cloud);
  cloud.row = { data: { finos_emergency_fund: '100' }, updated_at: 'v1-write' };
  const healed = await phoneSync(phone, cloud);
  assert.equal(healed.pushed, true);
  assert.equal(phone.m.get('finos_subscriptions'), '[{"id":"s1","name":"Netflix"}]');
  assert.ok('finos_subscriptions' in blob(cloud));
});

test('a racing writer is detected (compare-and-set); the next run converges', async () => {
  const cloud = new FakeCloud();
  const phone = new MemStore(), site = new MemStore();
  phone.m.set('finos_emergency_fund', '100');
  await phoneSync(phone, cloud);
  await websiteSync(site, cloud);

  phone.m.set('finos_emergency_fund', '150');
  cloud.hook = () => { cloud.row = { data: { ...blob(cloud), finos_goals: '[{"id":"g1"}]' }, updated_at: 'raced' }; };   // someone writes after our read
  const first = await phoneSync(phone, cloud);
  assert.equal(first.ok, false);
  assert.equal(first.retry, true);
  assert.equal(blob(cloud).finos_emergency_fund, '100');                        // nothing half-written
  const second = await phoneSync(phone, cloud);
  assert.equal(second.ok, true);
  assert.equal(blob(cloud).finos_emergency_fund, '150');
  assert.equal(phone.m.get('finos_goals'), '[{"id":"g1"}]');                // and it picked up the other writer's key
});

test('a different account never merges into this one', async () => {
  const cloud = new FakeCloud();
  const phone = new MemStore();
  phone.m.set('finos_emergency_fund', 'A-private');
  phone.m.set('finos_only_a', 'secret-of-A');
  await phoneSync(phone, cloud, 'user-A');
  // account B signs in on the same phone; B's cloud copy has its own data
  cloud.row = { data: { finos_emergency_fund: 'B-value' }, updated_at: 'b1' };
  await phoneSync(phone, cloud, 'user-B');
  assert.equal(phone.m.get('finos_emergency_fund'), 'B-value');
  assert.equal(phone.m.has('finos_only_a'), false);
  assert.equal('finos_only_a' in blob(cloud), false);
  assert.equal(metaOf(phone).owner, 'user-B');
});

test('unreadable ownership metadata pauses sync without moving local data between accounts', async () => {
  const cloud = new FakeCloud();
  cloud.row = { data: { finos_monthly_income: 'B-only' }, updated_at: 'b1' };
  const phone = new MemStore();
  phone.m.set(mobile.META_KEY, '{broken');
  phone.m.set('finos_monthly_income', 'A-private');
  const before = JSON.stringify(cloud.row);
  const result = await phoneSync(phone, cloud, 'user-B');
  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /ownership metadata is unreadable/);
  assert.equal(phone.m.get('finos_monthly_income'), 'A-private');
  assert.equal(JSON.stringify(cloud.row), before);
});

test('conflicts keep the displaced value in a short log', async () => {
  const cloud = new FakeCloud();
  const phone = new MemStore(), site = new MemStore();
  phone.m.set('finos_monthly_income', '60000');
  await phoneSync(phone, cloud);
  await websiteSync(site, cloud);
  phone.m.set('finos_monthly_income', '70000');
  site.m.set('finos_monthly_income', '80000');
  await websiteSync(site, cloud);                                          // website pushes first
  const r = await phoneSync(phone, cloud);                                 // phone then loses the scalar conflict
  assert.equal(r.conflicts, 1);
  assert.equal(phone.m.get('finos_monthly_income'), '80000');
  const log = metaOf(phone).conflicts;
  assert.equal(log.at(-1).key, 'finos_monthly_income');
  assert.equal(log.at(-1).lost, '70000');
});
