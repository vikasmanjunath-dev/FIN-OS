// Future Loss on the phone must give exactly the website's numbers (js/finos-leak.js) for the same transactions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as app from '../lib/leak.ts';

const web = createRequire(import.meta.url)('../../js/finos-leak.js');

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
const R = rng(20261012);
const pick = <T,>(a: readonly T[]) => a[Math.floor(R() * a.length)];
const CATS = ['Food & Dining', 'Groceries', 'Transport', 'Shopping', 'Bills & Utilities', 'Housing', 'EMI & Loans', 'Subscriptions', 'Health', 'Entertainment', 'Other'];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

test('fv matches the website for rates including 0 and tiny and large horizons', () => {
  for (const m of [0, 1, 500, 12345, 1e6]) for (const r of [0, 0.5, 8, 12, 30]) for (const y of [0, 1, 10, 20, 30, 40]) {
    assert.equal(app.fv(m, r, y), web.fv(m, r, y), `${m} ${r} ${y}`);
  }
});

test('compute matches the website on 800 random ledgers, subscription figures, ticks, rates and redirect shares', () => {
  const now = new Date(2026, 9, 11, 14, 30);
  for (let n = 0; n < 800; n++) {
    const count = Math.floor(R() * 120);
    const txns = Array.from({ length: count }, () => {
      const back = Math.floor(R() * 140);
      const d = new Date(now); d.setDate(d.getDate() - back);
      return { kind: pick(['expense', 'expense', 'expense', 'income', 'saving']) as string, amount: R() < 0.03 ? 0 : Math.round(R() * 8000), date: iso(d), category: pick(CATS) };
    });
    const opts: any = { txns, now, subscriptionsMonthly: R() < 0.5 ? Math.round(R() * 3000) : 0 };
    if (R() < 0.5) opts.include = CATS.filter(() => R() < 0.4);
    if (R() < 0.5) opts.rate = Math.round(R() * 40 - 3);
    if (R() < 0.5) opts.redirectPct = Math.round(R() * 130 - 10);
    assert.deepEqual(app.compute(opts), web.compute(opts), `case ${n}`);
  }
});

test('under 14 days of history only the tracked subscription figure is used', () => {
  const now = new Date(2026, 9, 11);
  const txns = [{ kind: 'expense', amount: 5000, date: '2026-10-08', category: 'Food & Dining' }];
  const r = app.compute({ txns, now, subscriptionsMonthly: 799 });
  assert.equal(r.enoughData, false);
  assert.equal(r.monthly, 799);
  assert.deepEqual(r.categories.map(c => c.category), ['Subscriptions']);
});

test('a logged subscription and a tracked one are not added together', () => {
  const now = new Date(2026, 9, 11);
  const txns = Array.from({ length: 30 }, (_, i) => ({ kind: 'expense', amount: 10, date: iso(new Date(2026, 9, 11 - i)), category: 'Subscriptions' }));   // 300 logged over 30 days
  const r = app.compute({ txns, now, subscriptionsMonthly: 250 });
  assert.equal(r.categories.find(c => c.category === 'Subscriptions')!.monthly, 300);
});
