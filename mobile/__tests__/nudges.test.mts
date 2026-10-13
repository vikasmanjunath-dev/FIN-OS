import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeNudges, visible, dismiss, normaliseDismissed, type NudgeFacts } from '../lib/nudges.ts';

const base: NudgeFacts = { moneyScore: 72, incomeMonthly: 0, savingsRate: null, topCategory: null, spentThisMonth: 0, subscriptionsMonthly: 0, subscriptionsCount: 0, hasSip: true, remindersEnabled: true, dueIn7: 0, dnaDone: true };
const ids = (f: Partial<NudgeFacts>) => computeNudges({ ...base, ...f }).map(n => n.id);

test('a fully set-up person with nothing wrong gets no nudges', () => {
  assert.deepEqual(ids({}), []);
});

test('nothing is invented from missing data: unknown income raises no savings or category nudge', () => {
  assert.deepEqual(ids({ savingsRate: 2, topCategory: { name: 'Food', spent: 90000 } }), []);       // income 0 = unknown
  assert.deepEqual(ids({ incomeMonthly: 50000, savingsRate: null }), []);                           // rate unknown
});

test('rules fire on recorded facts', () => {
  assert.deepEqual(ids({ incomeMonthly: 50000, savingsRate: 4 }), ['low-savings']);
  assert.deepEqual(ids({ incomeMonthly: 50000, topCategory: { name: 'Rent', spent: 20000 } }), ['top-category']);     // 40% of income
  assert.deepEqual(ids({ incomeMonthly: 50000, topCategory: { name: 'Rent', spent: 17000 } }), []);                   // 34%, under the line
  assert.deepEqual(ids({ subscriptionsMonthly: 2500, subscriptionsCount: 6 }), ['subscriptions']);
  assert.deepEqual(ids({ subscriptionsMonthly: 1900 }), []);
  assert.deepEqual(ids({ remindersEnabled: false, dueIn7: 2 }), ['reminders']);
  assert.deepEqual(ids({ remindersEnabled: false, dueIn7: 0 }), []);
  assert.deepEqual(ids({ moneyScore: 45 }), ['score-low']);
  assert.deepEqual(ids({ moneyScore: null }), ['score-start']);
  assert.deepEqual(ids({ incomeMonthly: 60000, hasSip: false }), ['no-sip']);
  assert.deepEqual(ids({ incomeMonthly: 15000, hasSip: false }), []);
  assert.deepEqual(ids({ dnaDone: false }), ['dna']);
});

test('alerts come first, then warnings, then invitations; at most three show', () => {
  const f: NudgeFacts = { ...base, moneyScore: null, dnaDone: false, incomeMonthly: 50000, savingsRate: 3, topCategory: { name: 'Shopping', spent: 25000 }, subscriptionsMonthly: 3000, subscriptionsCount: 5, hasSip: false };
  const all = computeNudges(f);
  assert.equal(all[0].tone, 'alert');
  const tones = all.map(n => n.tone);
  assert.deepEqual([...tones].sort((a, b) => ['alert', 'warn', 'good'].indexOf(a) - ['alert', 'warn', 'good'].indexOf(b)), tones);
  assert.equal(visible(all, {}, '2026-10-14').length, 3);
});

test('dismissing hides a nudge for a week, then it returns', () => {
  const all = computeNudges({ ...base, subscriptionsMonthly: 3000, subscriptionsCount: 4 });
  const d = dismiss({}, 'subscriptions', '2026-10-14');
  assert.equal(d.subscriptions, '2026-10-21');
  assert.deepEqual(visible(all, d, '2026-10-20').map(n => n.id), []);
  assert.deepEqual(visible(all, d, '2026-10-21').map(n => n.id), ['subscriptions']);
  assert.deepEqual(dismiss({}, 'x', '2026-12-28').x, '2027-01-04');
});

test('every nudge points at a route and has text; stored dismissals are validated', () => {
  const f: NudgeFacts = { ...base, moneyScore: 30, dnaDone: false, incomeMonthly: 50000, savingsRate: 3, topCategory: { name: 'Shopping', spent: 25000 }, subscriptionsMonthly: 3000, subscriptionsCount: 5, hasSip: false, remindersEnabled: false, dueIn7: 1 };
  computeNudges(f).forEach(n => { assert.ok(n.route.startsWith('/') && n.title && n.body && n.action, n.id); });
  assert.deepEqual(normaliseDismissed({ a: '2026-10-21', b: 5, c: 'soon' }), { a: '2026-10-21' });
  assert.deepEqual(normaliseDismissed(null), {});
});
