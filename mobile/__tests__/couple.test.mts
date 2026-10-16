// Couple finance: arithmetic, the rules carried over from the server, and that a partner's figures can never be synced to the cloud.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as c from '../lib/couple.ts';
import { loadCouple, saveCouple, COUPLE_KEY } from '../lib/coupleStorage.ts';
import { isSyncKey } from '../lib/trackerSync.ts';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const A = { name: 'A', income: 120000, expense: 50000 }, B = { name: 'B', income: 80000, expense: 30000 };

test('the rules taken from the server are still the server\'s rules (a change there must be looked at here)', () => {
  const py = fs.readFileSync(path.join(ROOT, 'alerts/alert-engine.py'), 'utf8');
  assert.match(py, /if pct > 15:/);                                         // a category over 15% of joint income
  assert.match(py, /savings_rate = \(\(joint_inc - exp_a - exp_b\) \/ joint_inc\)/);   // joint savings rate
  assert.equal(c.LARGE_ITEM_SHARE, 0.15);
});

test('overview: joint totals, savings rate and each person\'s share of income', () => {
  const o = c.overview(A, B);
  assert.deepEqual([o.jointIncome, o.jointExpense, o.jointSavings], [200000, 80000, 120000]);
  assert.equal(o.savingsRate, 0.6);
  assert.equal(o.shareA, 0.6); assert.equal(o.shareB, 0.4);
  assert.deepEqual([o.savingsA, o.savingsB], [70000, 50000]);
});

test('unknown stays unknown: a missing figure is null in every total, never 0', () => {
  const o = c.overview({ ...A, expense: null }, B);
  assert.equal(o.jointExpense, null); assert.equal(o.jointSavings, null); assert.equal(o.savingsRate, null); assert.equal(o.savingsA, null);
  assert.equal(o.jointIncome, 200000); assert.equal(o.shareA, 0.6);
  const none = c.overview(c.EMPTY_COUPLE.a, c.EMPTY_COUPLE.b);
  Object.values(none).forEach(v => assert.equal(v, null));
  const zero = c.overview({ name: '', income: 0, expense: 0 }, { name: '', income: 0, expense: 0 });
  assert.equal(zero.savingsRate, null); assert.equal(zero.shareA, null);          // no division by zero
  assert.equal(c.overview({ name: '', income: -5 as any, expense: NaN as any }, B).incomeA, null);
});

test('a deficit is a negative saving, not clamped', () => {
  const o = c.overview({ name: '', income: 50000, expense: 70000 }, B);
  assert.equal(o.savingsA, -20000);
  assert.ok(o.savingsRate! < 0.6);
});

test('shared bills: fair share is proportional to income, and the settlement evens out what each paid', () => {
  const shared: c.SharedExpense[] = [
    { id: '1', label: 'Rent', amount: 40000, paidBy: 'a' }, { id: '2', label: 'Groceries', amount: 10000, paidBy: 'b' },
    { id: '3', label: 'Wifi', amount: 1000, paidBy: 'joint' }, { id: '4', label: 'Bad', amount: -5, paidBy: 'a' },
  ];
  const s = c.splitShared(shared, A, B);
  assert.equal(s.total, 50000); assert.equal(s.jointAccount, 1000);
  assert.equal(s.fairA, 30000); assert.equal(s.fairB, 20000);
  assert.deepEqual([s.paidA, s.paidB], [40000, 10000]);
  assert.equal(s.settle, 10000);             // B should have paid 20,000 and paid 10,000: B sends A 10,000
  assert.equal(s.settleEqual, 15000);        // a 50:50 split would be 15,000
  assert.equal((s.fairA as number) + (s.fairB as number), s.total);
  assert.deepEqual(s.largeItems.map(x => x.id), ['1']);       // 40,000 is 20% of 2,00,000; 10,000 is 5%
  const unknown = c.splitShared(shared, { ...A, income: null }, B);
  assert.equal(unknown.settle, null); assert.equal(unknown.fairA, null); assert.equal(unknown.settleEqual, 15000);
  assert.deepEqual(c.splitShared([], A, B).largeItems, []);
});

test('settlement always sums to zero: what A is owed, B owes', () => {
  let seed = 7; const r = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
  for (let n = 0; n < 300; n++) {
    const a = { name: '', income: Math.round(r() * 3e5) + 1, expense: 0 }, b = { name: '', income: Math.round(r() * 3e5) + 1, expense: 0 };
    const shared = Array.from({ length: 1 + Math.floor(r() * 6) }, (_, i) => ({ id: String(i), label: 'x', amount: Math.round(r() * 5e4) + 1, paidBy: (['a', 'b', 'joint'] as const)[Math.floor(r() * 3)] }));
    const s = c.splitShared(shared, a, b);
    const bOwesA = s.settle as number;
    const aOwesB = (s.fairA as number) - s.paidA;
    assert.ok(Math.abs(bOwesA + aOwesB) < 1e-6, JSON.stringify({ a, b, shared }));
  }
});

test('goals: contributions add up with no interest; status, required monthly and the income-share split', () => {
  const now = new Date(2026, 9, 14);
  const mk = (p: Partial<c.JointGoal>): c.JointGoal => ({ id: 'g', title: 'Home', target: 1200000, current: 200000, targetDate: '2027-10-14', contribA: 50000, contribB: 40000, ...p });
  const g = c.goalView(mk({}), A, B, now);
  assert.equal(g.pct, 17); assert.equal(g.remaining, 1000000); assert.equal(g.monthly, 90000);
  assert.equal(g.monthsToFinish, 12);                  // ceil(1,000,000 / 90,000)
  assert.equal(g.monthsLeft, 12);
  assert.ok(Math.abs((g.requiredMonthly as number) - 1000000 / 12) < 1e-9);
  assert.equal(g.status, 'on-track');                   // 83,333 needed a month, 90,000 contributed
  assert.ok((g.gap as number) < 0);
  assert.ok(Math.abs((g.suggestedA as number) - (1000000 / 12) * 0.6) < 1e-9);
  assert.ok(Math.abs((g.suggestedA as number) + (g.suggestedB as number) - (g.requiredMonthly as number)) < 1e-9);
  const short = c.goalView(mk({ contribA: 20000, contribB: 10000 }), A, B, now);
  assert.equal(short.status, 'short');
  assert.ok(Math.abs((short.gap as number) - (1000000 / 12 - 30000)) < 1e-9);
  assert.equal(short.monthsToFinish, 34);
  assert.equal(c.goalView(mk({ contribA: 0, contribB: 0 }), A, B, now).status, 'no-contribution');
  assert.equal(c.goalView(mk({ contribA: 0, contribB: 0 }), A, B, now).monthsToFinish, null);
  assert.equal(c.goalView(mk({ targetDate: null }), A, B, now).status, 'no-date');
  assert.equal(c.goalView(mk({ targetDate: '2026-01-01' }), A, B, now).status, 'past-date');
  assert.equal(c.goalView(mk({ current: 1200000 }), A, B, now).status, 'done');
  assert.equal(c.goalView(mk({ current: 5e6 }), A, B, now).pct, 100);
  const unknownIncome = c.goalView(mk({}), { ...A, income: null }, B, now);
  assert.equal(unknownIncome.suggestedA, null);         // no split is invented without both incomes
  assert.equal(c.goalView(mk({ target: 0 }), A, B, now).pct, 0);
});

test('stored state is cleaned: junk rows dropped, unknown stays null, text capped', () => {
  const s = c.normaliseState({
    a: { name: 'x'.repeat(90), income: 5, expense: 'oops' }, b: { income: -3 },
    shared: [{ id: 'k', label: 'Rent', amount: 100, paidBy: 'z' }, { amount: 0 }, null, { label: 'n', amount: 'NaN' }],
    goals: [{ title: 'T', target: 100, current: -4, targetDate: '2027-13-99x', contribA: 'x', contribB: 5 }, { target: 0 }],
  });
  assert.equal(s.a.name.length, 40); assert.equal(s.a.income, 5); assert.equal(s.a.expense, null); assert.equal(s.b.income, null);
  assert.deepEqual(s.shared, [{ id: 'k', label: 'Rent', amount: 100, paidBy: 'joint' }]);
  assert.deepEqual(s.goals, [{ id: 'g0', title: 'T', target: 100, current: 0, targetDate: null, contribA: 0, contribB: 5 }]);
  assert.deepEqual(c.normaliseState('garbage'), c.EMPTY_COUPLE);
});

test('storage: the partner\'s figures are kept under a key the cloud sync excludes, and recorded figures are only offered', async () => {
  await AsyncStorage.clear();
  assert.equal(isSyncKey(COUPLE_KEY), false);
  assert.equal(isSyncKey('finos_couple_v1'), true);      // proves the exclusion comes from the key name, not from the test
  const empty = await loadCouple();
  assert.equal(empty.saved, false); assert.deepEqual(empty.recorded, { income: null, expense: null });
  await AsyncStorage.multiSet([['finos_monthly_income', '90000'], ['finos_monthly_expense', '0']]);
  const rec = await loadCouple();
  assert.deepEqual(rec.recorded, { income: 90000, expense: null });
  assert.equal(rec.state.a.income, null);                // offered, never silently put in the state
  await saveCouple({ ...c.EMPTY_COUPLE, b: { name: 'P', income: 70000, expense: null } });
  const back = await loadCouple();
  assert.equal(back.saved, true); assert.equal(back.state.b.income, 70000);
  await AsyncStorage.setItem(COUPLE_KEY, '{nope');
  assert.deepEqual((await loadCouple()).state, c.EMPTY_COUPLE);
});
