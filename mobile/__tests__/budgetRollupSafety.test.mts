import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as budget from '@/lib/budget';

const webBudget = createRequire(import.meta.url)('../../js/finos-budget.js');

test('web and mobile budget rollups ignore contaminated normalized rows and invalid limits', () => {
  const raw = [
    { kind: 'expense', date: '2026-10-01', amount: Number.NaN, category: 'Food & Dining' },
    { kind: 'expense', date: '2026-02-30', amount: 9999, category: 'Food & Dining' },
    { kind: 'expense', date: '2026-10-01', amount: 100, category: '__proto__' },
    { kind: 'expense', date: '2026-10-01', amount: 500, category: 'Groceries' },
  ] as any;
  const limits = { Groceries: '1000', 'Food & Dining': Number.POSITIVE_INFINITY } as any;
  const now = new Date(2026, 9, 12);
  const webResult = webBudget.status(raw, limits, now);
  const appResult = budget.budgetStatus(raw, limits, now);
  assert.deepEqual(appResult, webResult);
  assert.deepEqual(appResult.total, { spent: 500, limit: 0, pct: null });
  assert.deepEqual(appResult.rows.map(r => [r.category, r.spent, r.limit]), [['Groceries', 500, 0], ['Food & Dining', 0, 0]]);
});
