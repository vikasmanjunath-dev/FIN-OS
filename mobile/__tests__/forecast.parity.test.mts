// The phone's spending forecast must equal the website's js/finos-forecast.js for the same transactions, window, events and day.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as app from '../lib/forecast.ts';
import { normalizeAll } from '../lib/budget.ts';
import { saveForecastTotal, loadForecastInputs, parseLimits, FORECAST_KEY } from '../lib/forecastStorage.ts';

const require = createRequire(import.meta.url);
const web = require(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../js/finos-forecast.js'));

function rng(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const R = rng(20261014);
const pick = <T,>(a: T[]) => a[Math.floor(R() * a.length)];
const pad = (n: number) => String(n).padStart(2, '0');

const CATS = ['Food & Dining', 'Groceries', 'Transport', 'Shopping', 'Bills & Utilities', 'Housing', 'EMI & Loans', 'Subscriptions', 'Health', 'Entertainment', 'Education', 'Travel', 'Other', 'Gifts', 'Insurance', 'Healthcare', 'Investment'];
const KINDS = ['expense', 'expense', 'expense', 'income', 'saving'] as const;

function randomTxns(now: Date) {
  const n = Math.floor(R() * 120);
  const startBack = 1 + Math.floor(R() * 14);                  // first month with any data, months back
  return Array.from({ length: n }, (_, i) => {
    const back = Math.floor(R() * (startBack + 1)) - (R() < 0.1 ? 1 : 0);     // some rows in the current/future month: outside the window
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1 + Math.floor(R() * 28));
    return {
      id: 't' + i, date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      amount: R() < 0.02 ? 0 : Math.round(50 + R() * R() * 60000), kind: pick([...KINDS]), category: pick(CATS), label: '',
    };
  });
}
const ALL_EVENTS = Object.keys(web.EVENT_MULTIPLIERS);
const nums = (s: string) => (s.match(/₹([\d,]+)/g) || []).map(x => Number(x.replace(/[₹,]/g, '')));

test('event rules are exactly the website\'s table', () => {
  assert.deepEqual(app.EVENT_MULTIPLIERS, web.EVENT_MULTIPLIERS);
  assert.deepEqual(app.EVENT_IDS, ALL_EVENTS);
  for (const id of ALL_EVENTS) assert.ok(app.EVENT_LABELS[id], id);
});

test('month keys, Holt smoothing and event factors equal the website on random inputs', () => {
  for (let n = 0; n < 300; n++) {
    const now = new Date(2024 + Math.floor(R() * 4), Math.floor(R() * 12), 1 + Math.floor(R() * 28));
    const back = 1 + Math.floor(R() * 14);
    assert.deepEqual(app.monthKeys(back, now), web.monthKeys(back, now));
    const series = Array.from({ length: Math.floor(R() * 12) }, () => (R() < 0.15 ? 0 : Math.round(R() * 90000)));
    assert.equal(app.holt(series), web.holt(series));
    const evs = ALL_EVENTS.filter(() => R() < 0.3);
    const cat = pick(CATS);
    assert.equal(app.eventFactor(cat, evs), web.eventFactor(cat, evs));
  }
});

test('the full forecast equals the website on 600 random ledgers, windows, events and days', () => {
  for (let n = 0; n < 600; n++) {
    const now = new Date(2025 + Math.floor(R() * 3), Math.floor(R() * 12), 1 + Math.floor(R() * 28));
    const txns = randomTxns(now);
    const opts = { monthsBack: pick([3, 6, 12]), events: ALL_EVENTS.filter(() => R() < 0.25), now };
    const mine = app.compute(txns, opts), theirs = web.compute(txns, opts);
    const label = JSON.stringify({ n, opts: { ...opts, now: now.toISOString() } });
    assert.equal(mine.total, theirs.total, label);
    assert.deepEqual(mine.byCategory, theirs.byCategory, label);
    assert.deepEqual(mine.trends, theirs.trends, label);
    assert.deepEqual(mine.riskCats, theirs.riskCats, label);
    assert.deepEqual(mine.catMonthly, theirs.catMonthly, label);
    assert.deepEqual(mine.months, theirs.months, label);
    assert.equal(mine.monthsWithData, theirs.monthsWithData, label);
    assert.equal(mine.confidence, theirs.confidence, label);
    // the website words these as sentences; the phone keeps the plain amounts
    if (theirs.total > 0) {
      if (opts.events.length && theirs.riskCats.length) {
        assert.equal(nums(theirs.saveMsg)[0], mine.topRiskLock!.amount, label);
        assert.equal(mine.buffer20, Math.round(theirs.total * 0.2 / 100) * 100);
      } else {
        assert.equal(nums(theirs.saveMsg)[0], mine.buffer20, label);
        assert.equal(mine.topRiskLock, null);
      }
    }
  }
});

test('with no events the base equals the forecast; with events only the matched categories move, by the table\'s factor', () => {
  const now = new Date(2026, 9, 14);
  const t = [] as any[];
  for (const m of ['2026-07', '2026-08', '2026-09']) {
    t.push({ id: m + 's', date: m + '-10', amount: 4000, kind: 'expense', category: 'Shopping', label: '' });
    t.push({ id: m + 't', date: m + '-11', amount: 1000, kind: 'expense', category: 'Transport', label: '' });
  }
  const none = app.compute(t, { monthsBack: 6, now });
  assert.deepEqual(none.base, none.byCategory);
  assert.deepEqual(none.eventNotes, []);
  const d = app.compute(t, { monthsBack: 6, events: ['diwali'], now });
  assert.equal(d.byCategory.Shopping, 7200);
  assert.equal(d.base.Shopping, 4000);
  assert.equal(d.byCategory.Transport, 1000);
  assert.deepEqual(d.eventNotes, [{ event: 'diwali', category: 'Shopping', factor: 1.8 }]);
  assert.equal(d.lastMonth.Shopping, 4000);
});

test('edge cases: nothing, only income, zero rows, a non-expense kind, one huge month, an empty category name', () => {
  const now = new Date(2026, 0, 5);                                       // January: the window crosses the year
  assert.deepEqual(app.monthKeys(3, now), ['2025-10', '2025-11', '2025-12']);
  for (const input of [null, undefined, [], [{ id: 'x', date: '2025-12-01', amount: 5000, kind: 'income', category: 'Income', label: '' }]]) {
    const r = app.compute(input as any, { now });
    assert.equal(r.total, 0); assert.equal(r.monthsWithData, 0); assert.equal(r.confidence, 'low');
    assert.deepEqual(r.byCategory, {}); assert.equal(r.buffer20, 0); assert.equal(r.topRiskLock, null);
  }
  const huge = app.compute([{ id: 'h', date: '2025-12-02', amount: 1e12, kind: 'expense', category: 'Shopping', label: '' }] as any, { now, monthsBack: 3 });
  assert.equal(huge.total, 1e12);
  assert.ok(Number.isFinite(huge.buffer20));
  // an empty category matched every event rule on the website; here it never does
  assert.equal(app.eventFactor('', ['diwali']), 1);
  const noCat = app.compute([{ id: 'e', date: '2025-12-02', amount: 100, kind: 'expense', category: '', label: '' }] as any, { now, monthsBack: 3, events: ['diwali'] });
  assert.equal(noCat.total, 100);
  // a month with 0 spend in the middle of a logged window is a real zero, an earlier month is not
  const gap = app.compute([
    { id: 'a', date: '2025-10-03', amount: 3000, kind: 'expense', category: 'Food & Dining', label: '' },
    { id: 'b', date: '2025-12-03', amount: 3000, kind: 'expense', category: 'Food & Dining', label: '' },
  ] as any, { now, monthsBack: 6 });
  assert.equal(gap.monthsWithData, 3);
  assert.equal(gap.confidence, 'ok');
});

test('normalised phone records (not just hand-made rows) go through unchanged: income and saving rows are never forecast', () => {
  const raw = [
    { type: 'credit', category: 'Salary', amount: 100000, date: '2026-09-01T09:00:00Z' },
    { type: 'debit', category: 'Food & Dining', amount: 4000, date: '2026-09-10' },
    { category: 'save_sip', type: 'save_sip', amount: 10000, date: '2026-09-05' },
    { id: 'p', type: 'expense', category: 'Transport', cat: 'Transport', amount: 900, date: '2026-08-12' },
  ];
  const txns = normalizeAll(raw);
  const r = app.compute(txns, { monthsBack: 3, now: new Date(2026, 9, 13) });
  assert.deepEqual(Object.keys(r.byCategory).sort(), ['Food & Dining', 'Transport']);
  assert.deepEqual(app.compute(txns, { monthsBack: 3, now: new Date(2026, 9, 13) }), r);
  assert.deepEqual(web.compute(txns, { monthsBack: 3, now: new Date(2026, 9, 13) }).byCategory, r.byCategory);
});

test('forecast vs budget limits: only budgeted categories are compared, states and totals are plain arithmetic', () => {
  const c = app.compareToBudget({ A: 5000, B: 1900, C: 800, D: 700 }, { A: 4000, B: 2000, C: 1000, Z: 3000, D: 0 });
  const by = Object.fromEntries(c.rows.map(r => [r.category, r]));
  assert.equal(by.A.state, 'over'); assert.equal(by.A.diff, 1000); assert.equal(by.A.pct, 125);
  assert.equal(by.B.state, 'close');                     // 95% of the limit
  assert.equal(by.C.state, 'within');
  assert.equal(by.Z.predicted, 0); assert.equal(by.Z.state, 'within');   // a limit with nothing forecast is within it, not an error
  assert.deepEqual(c.noLimit, ['D']);                    // D has a zero limit: treated as no limit
  assert.equal(c.totalPredicted, 5000 + 1900 + 800);
  assert.equal(c.totalLimit, 4000 + 2000 + 1000 + 3000);
  assert.deepEqual(c.over.map(r => r.category), ['A']);
  assert.deepEqual(app.compareToBudget({}, null), { rows: [], over: [], noLimit: [], totalPredicted: 0, totalLimit: 0 });
});

test('storage: the forecast writes only its own key and never a recorded expense, savings rate or income', async () => {
  await AsyncStorage.clear();
  await AsyncStorage.multiSet([['finos_monthly_expense', '42000'], ['finos_savings_rate', '31'], ['finos_monthly_income', '90000']]);
  await saveForecastTotal(5234.6);
  assert.equal(await AsyncStorage.getItem(FORECAST_KEY), '5235');
  assert.equal(await AsyncStorage.getItem('finos_monthly_expense'), '42000');
  assert.equal(await AsyncStorage.getItem('finos_savings_rate'), '31');
  assert.equal(await AsyncStorage.getItem('finos_monthly_income'), '90000');
  await saveForecastTotal(0); await saveForecastTotal(NaN);              // an unknown forecast is not stored
  assert.equal(await AsyncStorage.getItem(FORECAST_KEY), '5235');
  assert.equal(await AsyncStorage.getItem('finos_forecast_next_month'), '5235');
});

test('storage: inputs are read from the phone\'s own transactions and the Budget tracker\'s limits; unknown income is 0', async () => {
  await AsyncStorage.clear();
  const none = await loadForecastInputs();
  assert.deepEqual([none.txns.length, none.income, Object.keys(none.limits).length], [0, 0, 0]);
  await AsyncStorage.multiSet([
    ['finos_transactions', JSON.stringify([{ id: '1', date: '2026-09-10', amount: 500, type: 'expense', category: 'Transport', cat: 'Transport' }, { garbage: true }])],
    ['finos_budgets', JSON.stringify({ limits: { Transport: 2000, Food: 'x', Bad: -5 } })],
    ['finos_monthly_income', '95000'],
  ]);
  const got = await loadForecastInputs();
  assert.equal(got.txns.length, 1);
  assert.deepEqual(got.limits, { Transport: 2000 });
  assert.equal(got.income, 95000);
  assert.deepEqual(parseLimits('not json'), {});
  assert.deepEqual(parseLimits(null), {});
});
