import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EMPTY_TRACKER_DATA, computeBudget, computeNetWorth } from '@/lib/trackers';

type Golden = { name: string; values: Record<string, number>; expected: Record<string, number | string> };
const cases = JSON.parse(readFileSync(new URL('../../tests/fixtures/tracker-networth-golden.json', import.meta.url), 'utf8')) as Golden[];
const fieldByKey = new Map([
  ['finos_cash_value', 'cash'], ['finos_gold_value', 'gold'], ['finos_home_loan', 'homeLoan'],
  ['finos_monthly_income', 'income'], ['finos_monthly_expense', 'expense'], ['finos_aa_expense', 'aaExpense'],
]);

test('mobile net-worth and FIRE calculation follows shared web golden cases', () => {
  for (const item of cases) {
    const data = { ...EMPTY_TRACKER_DATA };
    for (const [key, value] of Object.entries(item.values)) {
      const field = fieldByKey.get(key) as keyof typeof data | undefined;
      if (field) (data as any)[field] = value;
    }
    const actual = computeNetWorth(data);
    for (const key of ['totalAssets', 'totalLiabilities', 'netWorth', 'fireMonthlyExpense', 'fireCorpus', 'firePercent', 'fireSource']) {
      assert.equal((actual as any)[key], item.expected[key], `${item.name}: ${key}`);
    }
  }
});

test('mobile net-worth and cash-flow ignore malformed and non-finite persisted amounts', () => {
  const data = {
    ...EMPTY_TRACKER_DATA,
    cash: Number.POSITIVE_INFINITY,
    gold: Number.NaN,
    property: Number.NEGATIVE_INFINITY,
    homeLoan: -100,
    expense: Number.NaN,
    aaExpense: Number.POSITIVE_INFINITY,
    income: 100_000,
  };
  const worth = computeNetWorth(data);
  assert.equal(worth.totalAssets, 0);
  assert.equal(worth.totalLiabilities, 0);
  assert.equal(worth.netWorth, 0);
  assert.equal(worth.fireMonthlyExpense, 60_000);
  assert.equal(worth.fireSource, 'income-60%');
  const budget = computeBudget(data);
  assert.equal(budget.income, 100_000);
  assert.equal(budget.expense, 0);
  assert.equal(budget.savingsRate, 0);
});
