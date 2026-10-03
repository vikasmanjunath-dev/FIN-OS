const test = require('node:test');
const assert = require('node:assert');
const R = require('../js/finos-reminders.js');

const ev = (type, date, title = type + '-x') => ({ type, date, title, sub: '' });
const TODAY = '2026-10-01';

test('lead times differ by type', () => {
  const picks = R.select([
    ev('sip', '2026-10-02'),          // 1 day → yes
    ev('sip', '2026-10-04'),          // 3 days → too early for a SIP
    ev('tax', '2026-10-08'),          // 7 days → yes
    ev('tax', '2026-10-09'),          // 8 days → no
    ev('goal', '2026-10-15'),         // 14 days → yes
    ev('fd', '2026-10-05'),           // 4 days → no (3-day lead)
  ], TODAY, {}, { max: 10 });
  assert.deepStrictEqual(picks.map((p) => p.type + ':' + p.daysAway).sort(), ['goal:14', 'sip:1', 'tax:7']);
});

test('past events and already-seen events are skipped', () => {
  const e = ev('tax', '2026-10-03');
  assert.strictEqual(R.select([ev('tax', '2026-09-30')], TODAY, {}).length, 0);
  assert.strictEqual(R.select([e], TODAY, {}).length, 1);
  assert.strictEqual(R.select([e], TODAY, { [`tax|2026-10-03|tax-x`]: TODAY }).length, 0);
  assert.strictEqual(R.select([e], TODAY, { [`tax|2026-10-03|tax-x`]: '2026-09-30' }).length, 1);   // seen yesterday → remind again today
});

test('sorted soonest-first, capped at 3 per run', () => {
  const events = [ev('goal', '2026-10-10', 'g'), ev('tax', '2026-10-03', 't'), ev('insurance', '2026-10-03', 'i'), ev('sip', '2026-10-02', 's'), ev('tax', '2026-10-05', 't2')];
  const picks = R.select(events, TODAY, {});
  assert.strictEqual(picks.length, 3);
  assert.deepStrictEqual(picks.map((p) => p.title), ['s', 't', 'i']);                                // 1 day, then 2-day tax before insurance
});

test('message wording and the verify caveat is trimmed from notifications', () => {
  const m = R.message({ type: 'tax', title: 'Advance Tax Q3', daysAway: 0, sub: 'Cumulative 75% due. Statutory default — verify on incometax.gov.in.' });
  assert.strictEqual(m.title, 'Tax: Advance Tax Q3 — today');
  assert.strictEqual(m.body, 'Cumulative 75% due.');
  assert.match(R.message({ type: 'sip', title: 'X', daysAway: 1 }).title, /tomorrow/);
  assert.match(R.message({ type: 'goal', title: 'X', daysAway: 9 }).title, /in 9 days/);
});

test('no calendar loaded → upcoming() and run() are harmless', () => {
  assert.deepStrictEqual(R.upcoming(7), []);
  assert.deepStrictEqual(R.run(), []);
});

test('mirror(): writes the 45-day horizon and merges what the service worker already announced', async () => {
  const db = {};
  const mem = {};
  globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } };
  globalThis.FinosStore = {
    get: (k, fb) => (k in mem ? JSON.parse(mem[k]) : fb),
    set: (k, v) => { mem[k] = JSON.stringify(v); return true; },
    idb: {
      get: async (c, id) => db[c + '/' + id],
      put: async (c, o) => { db[c + '/' + o.id] = o; return o; },
    },
  };
  const today = new Date(); const iso = (n) => { const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  db['snapshots/upcoming-reminders'] = { id: 'upcoming-reminders', seen: { 'tax|x|a': '2099-01-02', 'sip|y|b': '2000-01-01' } };
  await R.mirror([ev('tax', iso(3)), ev('goal', iso(60)), ev('sip', iso(-2))], { 'sip|y|b': '2000-01-05' });
  const snap = db['snapshots/upcoming-reminders'];
  assert.strictEqual(snap.events.length, 1);                              // only the one inside 0..45 days
  assert.strictEqual(snap.seen['tax|x|a'], '2099-01-02');                 // worker's entry kept
  assert.strictEqual(snap.seen['sip|y|b'], '2000-01-05');                 // page's later date wins
  assert.deepStrictEqual(JSON.parse(mem.finos_reminders_seen), snap.seen);// page picks up the worker's entries
  delete globalThis.FinosStore; delete globalThis.localStorage;
});

test('mirror(): no IndexedDB → resolves quietly', async () => {
  await R.mirror([ev('tax', '2099-01-01')], {});
});

test('budget events: lead 0, once-per-key (never repeats the same level in the month), message has no "today" suffix', () => {
  const e = { type: 'budget', date: TODAY, title: 'Food & Dining budget 92% used', sub: '₹9,200 of ₹10,000 used.', once: true, key: 'budget|2026-10|Food & Dining|warn-90' };
  assert.strictEqual(R.select([e], TODAY, {}).length, 1);
  assert.strictEqual(R.select([e], TODAY, { [e.key]: '2026-10-03' }).length, 0);                // told on the 3rd → not again on the 12th
  assert.strictEqual(R.select([{ ...e, key: 'budget|2026-10|Food & Dining|over' }], TODAY, { [e.key]: '2026-10-03' }).length, 1);   // a NEW level does alert
  assert.strictEqual(R.select([{ ...e, date: '2026-10-02' }], TODAY, {}).length, 0);            // yesterday's budget event is stale
  const m = R.message({ ...e, daysAway: 0 });
  assert.strictEqual(m.title, 'Budget: Food & Dining budget 92% used');
});
