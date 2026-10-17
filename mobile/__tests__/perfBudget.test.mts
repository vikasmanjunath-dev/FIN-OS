// Explicit mobile performance budgets (audit T10). Device-level numbers (cold start, memory, frame rate) need real
// hardware and are listed in docs/audit/release-report.md; these guard what can be measured deterministically in CI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { TRANSACTION_PAGE_SIZE, visibleTransactions } from '../lib/transactionPage.ts';
import { monthTotals, normalizeAll } from '../lib/budget.ts';

const BUDGET = {
  webBundleBytes: 4.5 * 1024 * 1024, // current export is ~3.84 MB; fail on >17% growth
  firstPageRows: 50,
  monthRollup10kMs: 250, // pure rollup over 10,000 transactions on a CI machine
};

test('web export JS bundle stays under its budget (checked when an export exists)', (t) => {
  const dir = path.join(import.meta.dirname, '..', 'dist', '_expo', 'static', 'js', 'web');
  if (!fs.existsSync(dir)) return t.skip('no dist/ export present; run `npx expo export --platform web`');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
  const total = files.reduce((n, f) => n + fs.statSync(path.join(dir, f)).size, 0);
  assert.ok(total <= BUDGET.webBundleBytes, `JS is ${(total / 1048576).toFixed(2)} MB, budget ${(BUDGET.webBundleBytes / 1048576).toFixed(2)} MB`);
});

test('transaction history first page is bounded regardless of history size', () => {
  assert.equal(TRANSACTION_PAGE_SIZE, BUDGET.firstPageRows);
  const rows = Array.from({ length: 100_000 }, (_, i) => ({ id: i }));
  assert.equal(visibleTransactions(rows, TRANSACTION_PAGE_SIZE).length, BUDGET.firstPageRows);
});

test('monthly rollup over 10,000 transactions stays within budget', () => {
  const txns = Array.from({ length: 10_000 }, (_, i) => ({
    id: String(i), kind: i % 7 === 0 ? 'income' : 'expense', amount: 100 + (i % 900),
    category: 'Food', date: `2026-10-${String(1 + (i % 28)).padStart(2, '0')}`,
  }));
  const t0 = performance.now();
  monthTotals(normalizeAll(txns) as any, '2026-10');
  const ms = performance.now() - t0;
  assert.ok(ms <= BUDGET.monthRollup10kMs, `rollup took ${ms.toFixed(1)} ms, budget ${BUDGET.monthRollup10kMs} ms`);
});
