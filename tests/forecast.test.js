'use strict';
// js/finos-forecast.js — next-month spending forecast.
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../js/finos-forecast.js');
const B = require('../js/finos-budget.js');

const NOW = new Date(2026, 9, 13);                      // 13 Oct 2026: the window is the complete months before it
const exp = (date, amount, category = 'Food & Dining') => ({ id: date + amount + category, date, amount, kind: 'expense', category, label: '' });

test('month keys are the complete months before today, oldest first', () => {
  assert.deepEqual(F.monthKeys(3, NOW), ['2026-07', '2026-08', '2026-09']);
  assert.deepEqual(F.monthKeys(2, new Date(2026, 0, 5)), ['2025-11', '2025-12']);
});

test('Holt smoothing: flat series predicts itself, a rising series predicts above the last value, never below zero', () => {
  assert.ok(Math.abs(F.holt([100, 100, 100, 100]) - 100) < 1e-9);
  const up = F.holt([100, 120, 140, 160]);
  assert.ok(up > 160 && up < 200, String(up));
  assert.equal(F.holt([]), 0);
  assert.equal(F.holt([500]), 500);
  assert.equal(F.holt([100, 50, 10, 0]), 0);
});

test('income and investing rows are never forecast as spending (normalised through FinosBudget)', () => {
  const raw = [
    { type: 'credit', category: 'Salary', amount: 100000, date: '2026-09-01T09:00:00Z' },
    { type: 'debit', category: 'Food & Dining', amount: 4000, date: '2026-09-10' },
    { category: 'save_sip', type: 'save_sip', amount: 10000, date: '2026-09-05' },
    { category: 'need_food', type: 'need_food', amount: 2000, date: '2026-08-12' },
  ];
  const r = F.compute(B.normalizeAll(raw), { monthsBack: 3, now: NOW });
  assert.deepEqual(Object.keys(r.byCategory), ['Food & Dining']);
  assert.ok(r.total < 10000, `salary or SIP leaked into the forecast: ${r.total}`);
});

test('months before the first logged expense are not treated as ₹0', () => {
  // Only the last month has data. Zero-padding a 6-month window used to invent a rising trend from ₹0.
  const r = F.compute([exp('2026-09-10', 6000)], { monthsBack: 6, now: NOW });
  assert.equal(r.byCategory['Food & Dining'], 6000);
  assert.equal(r.monthsWithData, 1);
  assert.equal(r.confidence, 'low');
  assert.deepEqual(r.riskCats, []);
  assert.equal(r.trends['Food & Dining'], 'stable');
});

test('three months of steady spending is a solid forecast with a stable trend', () => {
  const t = [exp('2026-07-10', 5000), exp('2026-08-10', 5000), exp('2026-09-10', 5000)];
  const r = F.compute(t, { monthsBack: 6, now: NOW });
  assert.equal(r.byCategory['Food & Dining'], 5000);
  assert.equal(r.confidence, 'ok');
  assert.equal(r.trends['Food & Dining'], 'stable');
  assert.equal(r.total, 5000);
});

test('event multipliers apply by fuzzy category match and flag a risk category', () => {
  const t = [exp('2026-07-10', 4000, 'Shopping'), exp('2026-08-10', 4000, 'Shopping'), exp('2026-09-10', 4000, 'Shopping'), exp('2026-09-11', 1000, 'Transport')];
  const base = F.compute(t, { monthsBack: 3, now: NOW });
  const diwali = F.compute(t, { monthsBack: 3, events: ['diwali'], now: NOW });
  assert.equal(base.byCategory.Shopping, 4000);
  assert.equal(diwali.byCategory.Shopping, 7200);              // x1.8
  assert.equal(diwali.byCategory.Transport, base.byCategory.Transport);
  assert.deepEqual(diwali.riskCats, ['Shopping']);
  assert.match(diwali.saveMsg, /Diwali/);
});

test('rows outside the window and non-expense rows are ignored; empty input gives a zero forecast', () => {
  const r = F.compute([exp('2026-01-10', 9999), exp('2026-10-05', 9999), { ...exp('2026-09-10', 5000), kind: 'income' }], { monthsBack: 3, now: NOW });
  assert.equal(r.total, 0);
  assert.equal(r.monthsWithData, 0);
  assert.equal(F.compute(null, { now: NOW }).total, 0);
});

test('an empty category name matches no event rule, and the save message states what the amount is a share of', () => {
  assert.equal(F.eventFactor('', ['diwali']), 1);
  const t = [exp('2026-07-10', 4000, 'Shopping'), exp('2026-08-10', 4000, 'Shopping'), exp('2026-09-10', 4000, 'Shopping')];
  assert.match(F.compute(t, { monthsBack: 3, now: NOW }).saveMsg, /20% of the predicted/);
  assert.match(F.compute(t, { monthsBack: 3, events: ['diwali'], now: NOW }).saveMsg, /30% of the Shopping forecast/);
});
