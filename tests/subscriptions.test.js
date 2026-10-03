// FinosSubscriptions — pure logic (renewal rolling, costs, review candidates, storage, CSV).
// Run with the user's timezone: TZ=Asia/Kolkata node --test tests/subscriptions.test.js
const test = require('node:test');
const assert = require('node:assert');
const S = require('../js/finos-subscriptions.js');

const sub = (o) => S.normalize(Object.assign({ name: 'X', amount: 100, cycle: 'monthly', nextDate: '2026-10-05' }, o));

test('normalize: accepts a valid row, trims/clamps, and keeps a stable id', () => {
  const s = S.normalize({ id: 'abc', name: '  Netflix  ', amount: '649.456', cycle: 'monthly', nextDate: '2026-10-05', category: 'ott', split: 99, usefulness: '9', status: 'weird' });
  assert.strictEqual(s.id, 'abc');
  assert.strictEqual(s.name, 'Netflix');
  assert.strictEqual(s.amount, 649.46);
  assert.strictEqual(s.split, 20);
  assert.strictEqual(s.usefulness, 5);
  assert.strictEqual(s.status, 'active');
  assert.strictEqual(S.normalize({ name: 'a', amount: 1, cycle: 'monthly', nextDate: '2026-10-05' }).id.length > 3, true);
});

test('normalize: rejects bad rows instead of guessing', () => {
  for (const bad of [null, 5, {}, { name: '', amount: 1, cycle: 'monthly', nextDate: '2026-10-05' },
    { name: 'a', amount: 0, cycle: 'monthly', nextDate: '2026-10-05' }, { name: 'a', amount: -3, cycle: 'monthly', nextDate: '2026-10-05' },
    { name: 'a', amount: 'x', cycle: 'monthly', nextDate: '2026-10-05' }, { name: 'a', amount: 1, cycle: 'daily', nextDate: '2026-10-05' },
    { name: 'a', amount: 1, cycle: 'monthly', nextDate: '2026-02-30' }, { name: 'a', amount: 1, cycle: 'monthly', nextDate: 'tomorrow' }]) {
    assert.strictEqual(S.normalize(bad), null, JSON.stringify(bad));
  }
  assert.strictEqual(S.normalizeAll('nope').length, 0);
});

test('costs: per cycle, and your share of a split family plan', () => {
  assert.strictEqual(S.annualCost(sub({ amount: 649 })), 7788);
  assert.strictEqual(S.annualCost(sub({ amount: 1499, cycle: 'yearly' })), 1499);
  assert.strictEqual(S.annualCost(sub({ amount: 1500, cycle: 'quarterly', split: 3 })), 2000);
  assert.strictEqual(S.annualCost(sub({ amount: 100, cycle: 'weekly' })), 5200);
  assert.ok(Math.abs(S.monthlyCost(sub({ amount: 1499, cycle: 'yearly' })) - 124.9166667) < 1e-6);
});

test('nextRenewal: future date is returned as-is; past dates roll forward on the original cycle', () => {
  assert.strictEqual(S.nextRenewal(sub({ nextDate: '2026-10-05' }), '2026-10-01'), '2026-10-05');
  assert.strictEqual(S.nextRenewal(sub({ nextDate: '2026-10-05' }), '2026-10-05'), '2026-10-05');   // due today still counts
  assert.strictEqual(S.nextRenewal(sub({ nextDate: '2025-01-15' }), '2026-10-01'), '2026-10-15');
  assert.strictEqual(S.nextRenewal(sub({ nextDate: '2025-01-15', cycle: 'quarterly' }), '2026-10-01'), '2026-10-15');
  assert.strictEqual(S.nextRenewal(sub({ nextDate: '2023-03-09', cycle: 'yearly' }), '2026-10-01'), '2027-03-09');
  assert.strictEqual(S.nextRenewal(sub({ nextDate: '2026-09-01', cycle: 'weekly' }), '2026-10-01'), '2026-10-06');   // Tue 1 Sep + 5 weeks
});

test('nextRenewal: month-end anchors keep their day (31 Jan → 28 Feb → 31 Mar) and leap days survive', () => {
  assert.strictEqual(S.nextRenewal(sub({ nextDate: '2026-01-31' }), '2026-02-10'), '2026-02-28');
  assert.strictEqual(S.nextRenewal(sub({ nextDate: '2026-01-31' }), '2026-03-01'), '2026-03-31');
  assert.strictEqual(S.nextRenewal(sub({ nextDate: '2024-02-29', cycle: 'yearly' }), '2026-01-01'), '2026-02-28');
  assert.strictEqual(S.nextRenewal(sub({ nextDate: '2024-02-29', cycle: 'yearly' }), '2027-03-01'), '2028-02-29');
});

test('nextRenewal: paused / cancelled have none; trials do', () => {
  assert.strictEqual(S.nextRenewal(sub({ status: 'paused' }), '2026-10-01'), null);
  assert.strictEqual(S.nextRenewal(sub({ status: 'cancelled' }), '2026-10-01'), null);
  assert.strictEqual(S.nextRenewal(sub({ status: 'trial', nextDate: '2026-10-08' }), '2026-10-01'), '2026-10-08');
});

test('occurrences: anchored to the original date, capped, windowed', () => {
  const m = sub({ nextDate: '2026-01-31' });
  assert.deepStrictEqual(S.occurrences(m, '2026-02-01', '2026-06-30', 5), ['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30']);
  assert.deepStrictEqual(S.occurrences(m, '2026-02-01', '2026-06-30', 2), ['2026-02-28', '2026-03-31']);
  assert.deepStrictEqual(S.occurrences(sub({ cycle: 'yearly', nextDate: '2026-11-01' }), '2026-10-01', '2028-12-31', 5), ['2026-11-01', '2027-11-01', '2028-11-01']);
  assert.deepStrictEqual(S.occurrences(sub({ cycle: 'weekly', nextDate: '2026-10-01' }), '2026-10-01', '2026-10-20', 9), ['2026-10-01', '2026-10-08', '2026-10-15']);
  assert.deepStrictEqual(S.occurrences(sub({ status: 'paused' }), '2026-10-01', '2027-10-01'), []);
});

const FIXTURE = [
  { id: 'n', name: 'Netflix', category: 'ott', amount: 649, cycle: 'monthly', nextDate: '2026-10-04', usefulness: 4 },
  { id: 'p', name: 'Prime', category: 'ott', amount: 1499, cycle: 'yearly', nextDate: '2027-02-10', usefulness: 3 },
  { id: 'h', name: 'Hotstar', category: 'ott', amount: 899, cycle: 'yearly', nextDate: '2026-12-01', usefulness: 1 },
  { id: 's', name: 'Spotify', category: 'music', amount: 119, cycle: 'monthly', nextDate: '2026-10-20', split: 1 },
  { id: 'g', name: 'Gym', category: 'fitness', amount: 4500, cycle: 'quarterly', nextDate: '2026-10-05', status: 'trial' },
  { id: 'x', name: 'Old', category: 'other', amount: 999, cycle: 'monthly', nextDate: '2026-10-05', status: 'paused' },
];

test('summarize: totals count only active subscriptions', () => {
  const r = S.summarize(FIXTURE, '2026-10-01', { income: 100000 });
  assert.strictEqual(r.activeCount, 4);
  assert.strictEqual(r.trialCount, 1);
  assert.strictEqual(r.pausedCount, 1);
  assert.ok(Math.abs(r.monthly - (649 + 1499 / 12 + 899 / 12 + 119)) < 1e-9);
  assert.ok(Math.abs(r.annual - (649 * 12 + 1499 + 899 + 119 * 12)) < 1e-9);          // 11,614
  assert.ok(Math.abs(r.pctOfIncome - r.monthly / 100000) < 1e-12);
  assert.strictEqual(S.summarize(FIXTURE, '2026-10-01').pctOfIncome, null);
});

test('summarize: categories sorted by yearly cost with shares that add to 100%', () => {
  const r = S.summarize(FIXTURE, '2026-10-01');
  assert.deepStrictEqual(r.categories.map((c) => c.id), ['ott', 'music']);
  assert.strictEqual(r.categories[0].count, 3);
  assert.ok(Math.abs(r.categories.reduce((a, c) => a + c.share, 0) - 1) < 1e-9);
});

test('summarize: review = low-rated first, then overlap (keeping the best-rated service); no double counting', () => {
  const r = S.summarize(FIXTURE, '2026-10-01');
  assert.deepStrictEqual(r.review.map((x) => [x.name, x.reason]).sort(), [['Hotstar', 'low-value'], ['Prime', 'overlap']]);
  assert.strictEqual(r.reviewSavings, 899 + 1499);                                   // Netflix (rated 4) is kept
  assert.ok(!r.review.some((x) => x.name === 'Netflix'));
});

test('summarize: ties on rating keep the cheapest so the saving is the biggest', () => {
  const r = S.summarize([
    { name: 'A', category: 'music', amount: 100, cycle: 'monthly', nextDate: '2026-10-05' },
    { name: 'B', category: 'music', amount: 200, cycle: 'monthly', nextDate: '2026-10-05' },
  ], '2026-10-01');
  assert.deepStrictEqual(r.review.map((x) => x.name), ['B']);
  assert.strictEqual(r.reviewSavings, 2400);
});

test('summarize: upcoming (30 days) includes trials; due-in-7 excludes them; trial alerts are sorted', () => {
  const r = S.summarize(FIXTURE, '2026-10-01');
  assert.deepStrictEqual(r.upcoming.map((u) => u.name), ['Netflix', 'Gym', 'Spotify']);
  assert.strictEqual(r.upcoming[1].trial, true);
  assert.strictEqual(r.dueIn7, 649);                                                // Netflix on the 4th; the Gym trial isn't a charge yet
  assert.strictEqual(r.trialsEnding[0].name, 'Gym');
  assert.strictEqual(r.trialsEnding[0].daysAway, 4);
  assert.strictEqual(r.trialsEnding[0].annual, 18000);
});

test('summarize: empty / junk input is safe', () => {
  const r = S.summarize(null, 'garbage');
  assert.strictEqual(r.monthly, 0);
  assert.deepStrictEqual(r.review, []);
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(r.today));
});

test('calendarEvents: typed "sub", cost is your share, trials say so, paused are skipped', () => {
  const ev = S.calendarEvents(FIXTURE.concat([{ name: 'Fam', category: 'ott', amount: 900, cycle: 'monthly', nextDate: '2026-10-09', split: 3 }]), '2026-10-01', '2026-12-31');
  assert.ok(ev.every((e) => e.type === 'sub'));
  assert.ok(ev.every((e, i) => i === 0 || ev[i - 1].date <= e.date));
  assert.ok(!ev.some((e) => e.title.startsWith('Old')));
  const fam = ev.filter((e) => e.title.startsWith('Fam'));
  assert.strictEqual(fam.length, 3);
  assert.strictEqual(fam[0].amount, 300);
  const gym = ev.find((e) => e.title.startsWith('Gym'));
  assert.ok(/trial ends/.test(gym.title) && /cancel before/.test(gym.sub));
  assert.strictEqual(ev.filter((e) => e.title.startsWith('Netflix')).length, 3);   // capped at 3 per subscription
});

test('storage: save() writes the list plus rounded monthly/annual summary keys; load() round-trips', () => {
  const store = {};
  globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  S.save(FIXTURE);
  assert.strictEqual(JSON.parse(store.finos_subscriptions).length, 6);
  assert.strictEqual(JSON.parse(store.finos_subscriptions_annual), 11614);
  assert.strictEqual(JSON.parse(store.finos_subscriptions_monthly), 968);
  assert.strictEqual(S.load().length, 6);
  store.finos_subscriptions = '{not json';
  assert.deepStrictEqual(S.load(), []);                                             // corrupt storage never throws
  store.finos_subscriptions = JSON.stringify([{ name: 'ok', amount: 5, cycle: 'monthly', nextDate: '2026-10-05' }, { name: '' }, 'junk']);
  assert.strictEqual(S.load().length, 1);                                           // invalid rows are dropped, valid ones kept
  delete globalThis.localStorage;
});

test('toCSV: quotes, escapes, and neutralises spreadsheet formulas', () => {
  const csv = S.toCSV([{ name: '=HYPERLINK("http://x")', amount: 10, cycle: 'monthly', nextDate: '2026-10-05', note: 'say "hi", ok' }]);
  const [head, row] = csv.split('\r\n');
  assert.ok(head.startsWith('"Name","Category"'));
  assert.ok(row.startsWith(`"'=HYPERLINK(""http://x"")"`), row);
  assert.ok(row.includes('"say ""hi"", ok"'));
});

test('reminders: a renewal 2 days away is announced with the "Subscription" label; 5 days away is not', () => {
  const R = require('../js/finos-reminders.js');
  const ev = S.calendarEvents([{ name: 'Netflix', category: 'ott', amount: 649, cycle: 'monthly', nextDate: '2026-10-03' }], '2026-10-01', '2026-10-31');
  const picks = R.select(ev, '2026-10-01', {});
  assert.strictEqual(picks.length, 1);
  assert.strictEqual(picks[0].daysAway, 2);
  assert.strictEqual(R.message(picks[0]).title, 'Subscription: Netflix renews — in 2 days');
  assert.strictEqual(R.select(ev, '2026-09-28', {}).length, 0);
});
