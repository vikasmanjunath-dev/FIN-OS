import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRANSACTION_PAGE_SIZE, visibleTransactions } from '../lib/transactionPage.ts';

test('transaction history renders a bounded first page and makes older rows available in stable order', () => {
  const rows = Array.from({ length: 2500 }, (_, i) => ({ id: i }));
  const first = visibleTransactions(rows, TRANSACTION_PAGE_SIZE);
  const second = visibleTransactions(rows, TRANSACTION_PAGE_SIZE * 2);
  assert.equal(first.length, 50);
  assert.deepEqual(first.map(r => r.id), rows.slice(0, 50).map(r => r.id));
  assert.equal(second.length, 100);
  assert.deepEqual(second.slice(50).map(r => r.id), rows.slice(50, 100).map(r => r.id));
  assert.equal(visibleTransactions(rows, -1).length, 0);
  assert.equal(visibleTransactions(rows, Number.NaN).length, 0);
});
