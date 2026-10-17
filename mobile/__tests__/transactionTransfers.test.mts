import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { normalize, monthSpend, monthTotals, toRaw, type Txn } from '@/lib/budget';

const web = createRequire(import.meta.url)('../../js/finos-budget.js');
const NOW = new Date(2026, 9, 15, 12);

test('explicit internal transfers are excluded from web and mobile expense budgets', () => {
  const rows = [
    { id: 'move-out', type: 'transfer', category: 'own account transfer', amount: 75000, date: '2026-10-05', description: 'Move to savings account' },
    { id: 'groceries', type: 'debit', category: 'Groceries', amount: 2500, date: '2026-10-06', desc: 'Market' },
  ];
  const mobile = rows.map(normalize);
  const website = rows.map(web.normalize);
  assert.equal(mobile[0]?.kind, 'transfer');
  assert.equal(website[0]?.kind, 'transfer');
  assert.deepEqual(monthSpend(mobile as Txn[], '2026-10'), web.monthSpend(website, '2026-10'));
  assert.equal(monthSpend(mobile as Txn[], '2026-10').total, 2500);
  assert.equal(web.status(website, { Groceries: 5000 }, NOW).total.spent, 2500);
});

test('transfer-looking memo alone does not reclassify a normal purchase', () => {
  const raw = { type: 'debit', category: 'Shopping', amount: 1200, date: '2026-10-07', desc: 'Transfer print to vendor' };
  assert.equal(normalize(raw)?.kind, 'expense');
  assert.equal(web.normalize(raw)?.kind, 'expense');
});

test('mobile transfer round-trips through storage and does not become income or savings', () => {
  const transfer = normalize({ id: 'move', type: 'transfer', category: 'Transfer', amount: 900, date: '2026-10-10' })!;
  const restored = normalize(toRaw({ ...transfer, source: 'import' }));
  assert.equal(restored?.kind, 'transfer');
  assert.deepEqual(monthTotals([restored!], '2026-10'), { spent: 0, income: 0, saved: 0, count: 1 });
});
