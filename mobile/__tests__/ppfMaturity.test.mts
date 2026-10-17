import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountProjection, type SavingsAccount } from '@/lib/retirement';

const now = new Date(2026, 9, 17, 12);
const account = (openDate: string): SavingsAccount => ({ id: 'ppf', type: 'PPF', nickname: 'PPF', currentBalance: 100_000, annualDeposit: 5_000, openDate });

test('PPF maturity follows the financial-year opening boundary used on the website', () => {
  const beforeApril = accountProjection(account('2020-03-31'), now);
  assert.equal(beforeApril.maturityYear, 2035);
  assert.equal(beforeApril.yearsLeft, 8);
  const fromApril = accountProjection(account('2020-04-01'), now);
  assert.equal(fromApril.maturityYear, 2036);
  assert.equal(fromApril.yearsLeft, 9);
});

test('invalid dates do not create a fresh-account PPF projection; missing date is an explicit from-now estimate', () => {
  const invalid = accountProjection(account('2020-02-30'), now);
  assert.equal(invalid.maturityYear, null);
  assert.equal(invalid.yearsLeft, 0);
  assert.equal(invalid.projected, 100_000);
  const missing = accountProjection(account(''), now);
  assert.equal(missing.maturityYear, 2042);
  assert.equal(missing.yearsLeft, 15);
});
