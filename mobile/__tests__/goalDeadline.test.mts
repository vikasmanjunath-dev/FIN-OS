import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeGoals, monthsUntil } from '@/lib/trackers';
import * as optimizer from '@/lib/goalOptimizer';

const now = new Date(2026, 9, 17, 12);
const goal = (date: string, extra: Record<string, unknown> = {}) => ({ id: date, name: 'Test goal', target: 100000, current: 50000, target_date: date, ...extra });

test('month-only goals in the current month are still due this month and show a one-month funding amount', () => {
  const result = computeGoals([goal('2026-10-01') as any], now).items[0];
  assert.equal(result.monthsLeft, 0);
  assert.equal(result.monthlyNeeded, 50000);
});

test('goal deadline month counts, overdue exact dates, and invalid Gregorian dates are handled', () => {
  assert.equal(monthsUntil('2026-12-01', now), 2);
  assert.equal(monthsUntil('2026-10-16', now), -1);
  assert.equal(monthsUntil('2026-02-30', now), null);
  assert.equal(monthsUntil('not-a-date', now), null);
  assert.equal(computeGoals([goal('2026-09-01') as any], now).items[0].monthlyNeeded, null);
});

test('goal balances that are non-finite or invalid do not contaminate progress', () => {
  const result = computeGoals([goal('2027-01-01', { target: Number.POSITIVE_INFINITY, current: Number.NaN }) as any], now);
  assert.deepEqual([result.avgProgress, result.items[0].target, result.items[0].current, result.items[0].remaining], [0, 0, 0, 0]);
});

test('goal optimizer treats month-only deadlines as an available contribution month and rejects impossible dates', () => {
  const monthOnly = optimizer.compute([{ name: 'Current month', target: 100000, target_date: '2026-10' }], { income: 100000, savingsRate: 20 }, now).goals[0];
  const nextMonth = optimizer.compute([{ name: 'Next month', target: 100000, target_date: '2026-11-01' }], { income: 100000, savingsRate: 20 }, now).goals[0];
  const invalid = optimizer.compute([{ name: 'Invalid', target: 100000, target_date: '2026-02-30' }], { income: 100000, savingsRate: 20 }, now).goals[0];
  assert.equal(monthOnly.monthsLeft, 1);
  assert.equal(nextMonth.monthsLeft, 2);
  assert.equal(invalid.targetDate, null);
  assert.equal(invalid.monthsLeft, 120); // invalid/missing deadline uses the documented 10-year planning horizon
});
