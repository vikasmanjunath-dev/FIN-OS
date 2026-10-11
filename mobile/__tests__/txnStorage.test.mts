// Transaction storage against an in-memory AsyncStorage: statement import, dedupe, undo, and foreign records left alone.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as txn from '@/lib/txnStorage';

const rows = (n: number, startDay = 1): txn.ImportRow[] =>
  Array.from({ length: n }, (_, i) => ({ date: `2026-09-${String(startDay + i).padStart(2, '0')}`, desc: `Shop ${i}`, type: 'debit' as const, amount: 100 + i }));

beforeEach(async () => { await AsyncStorage.clear(); });

test('import adds rows in the website ledger shape and shows up as normal transactions', async () => {
  const r = await txn.importStatementRows(rows(3), 'b1');
  assert.deepEqual([r.added, r.duplicates, r.batch], [3, 0, 'b1']);
  const raw = JSON.parse((await AsyncStorage.getItem('finos_transactions'))!);
  assert.equal(raw.length, 3);
  assert.deepEqual([raw[0].src, raw[0].batch, raw[0].type], ['import', 'b1', 'debit']);
  const list = await txn.loadTransactions();
  assert.equal(list.length, 3);
  assert.equal(list[0].kind, 'expense');
});

test('importing the same rows again adds nothing; previewImport says so without writing', async () => {
  await txn.importStatementRows(rows(4), 'b1');
  const p = await txn.previewImport(rows(4));
  assert.deepEqual(p, { added: 0, duplicates: 4 });
  const again = await txn.importStatementRows(rows(4), 'b2');
  assert.deepEqual([again.added, again.duplicates], [0, 4]);
  assert.equal((await txn.listImportBatches()).length, 1);
});

test('undo removes exactly one batch and leaves manual and website records alone', async () => {
  await AsyncStorage.setItem('finos_transactions', JSON.stringify([
    { id: 'web1', date: '2026-08-30', amount: 999, type: 'expense', category: 'Food & Dining', label: 'website entry' },
    { weird: 'shape from another feature' },
  ]));
  await txn.addTransaction({ date: '2026-09-02', amount: 55, kind: 'expense', category: 'Transport', label: 'manual' });
  await txn.importStatementRows(rows(3), 'keep');
  await txn.importStatementRows(rows(2, 20), 'drop');
  assert.equal((await txn.listImportBatches()).length, 2);

  assert.equal(await txn.undoImportBatch('drop'), 2);
  assert.equal(await txn.undoImportBatch('drop'), 0);                       // second undo is a no-op
  const raw = JSON.parse((await AsyncStorage.getItem('finos_transactions'))!);
  assert.equal(raw.length, 2 + 1 + 3);
  assert.deepEqual(raw[1], { weird: 'shape from another feature' });         // foreign record untouched
  assert.deepEqual((await txn.listImportBatches()).map(b => [b.batch, b.count]), [['keep', 3]]);
});

test('two quick imports cannot lose each other (serialised read-modify-write)', async () => {
  const [a, b] = await Promise.all([
    txn.importStatementRows(rows(5, 1), 'a'),
    txn.importStatementRows(rows(5, 10), 'b'),
  ]);
  assert.equal(a.added + b.added, 10);
  assert.equal(JSON.parse((await AsyncStorage.getItem('finos_transactions'))!).length, 10);
});
