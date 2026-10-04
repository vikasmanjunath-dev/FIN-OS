// FinosLeak — pure core behind the "Sync Future Loss" button. Golden numbers are worked out by hand in the comments.
const test = require('node:test');
const assert = require('node:assert');
const L = require('../js/finos-leak.js');
const B = require('../js/finos-budget.js');

const NOW = new Date(2026, 9, 3);                       // 3 Oct 2026, local
const iso = (dayOffset) => { const d = new Date(2026, 9, 3 + dayOffset); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const exp = (category, amount, dayOffset) => ({ kind: 'expense', category, amount, date: iso(dayOffset) });
const daily = (category, amount, days) => Array.from({ length: days }, (_, i) => exp(category, amount, -i));   // today and back

test('fv matches the SIP calculator: ₹5,000/month at 12% for 10 years = ₹11,61,695', () => {
  // 5000 × ((1.01^120 − 1) / 0.01) × 1.01 = 5000 × 230.0387 × 1.01
  assert.ok(Math.abs(L.fv(5000, 12, 10) - 1161695.38) < 0.5);
  assert.ok(Math.abs(L.fv(18000, 12, 10) - 4182103.37) < 1);      // linear in the monthly amount
});

test('fv edge cases: zero rate is just the contributions; nothing in, nothing out; no NaN', () => {
  assert.strictEqual(L.fv(1000, 0, 5), 60000);
  assert.strictEqual(L.fv(0, 12, 10), 0);
  assert.strictEqual(L.fv(-5, 12, 10), 0);
  assert.strictEqual(L.fv(1000, 12, 0), 0);
  assert.strictEqual(L.fv(NaN, 12, 10), 0);
});

// 30 days: ₹500 food every day (₹15,000), one ₹3,000 shopping spree, ₹6,000 groceries, plus rows that must never count.
const BASE = [...daily('Food & Dining', 500, 30), exp('Shopping', 3000, -20), exp('Groceries', 6000, -10),
  { kind: 'income', category: 'Income', amount: 100000, date: iso(-15) },
  { kind: 'saving', category: 'Savings & Investments', amount: 20000, date: iso(-5) }];

test('golden: 30 days of data gives each category its monthly average; only discretionary ones count by default', () => {
  const r = L.compute({ txns: BASE, now: NOW });
  assert.strictEqual(r.enoughData, true);
  assert.strictEqual(r.days, 30);
  assert.deepStrictEqual(r.categories.map((c) => [c.category, c.monthly, c.included]),
    [['Food & Dining', 15000, true], ['Groceries', 6000, false], ['Shopping', 3000, true]]);
  assert.strictEqual(r.monthly, 18000);                              // food + shopping; groceries are a need, income/saving ignored
  const ten = r.horizons.find((h) => h.years === 10);
  assert.ok(Math.abs(ten.value - 4182103) <= 1);
  assert.strictEqual(ten.invested, 2160000);                         // 18,000 × 120
  assert.ok(Math.abs(ten.gain - (4182103 - 2160000)) <= 1);
  assert.deepStrictEqual(r.horizons.map((h) => h.years), [10, 20, 30]);
});

test('redirect: a quarter of the leak by default, and it scales exactly', () => {
  const r = L.compute({ txns: BASE, now: NOW });
  assert.strictEqual(r.redirect.pct, 25);
  assert.strictEqual(r.redirect.monthly, 4500);
  const twenty = r.redirect.horizons.find((h) => h.years === 20);
  assert.ok(Math.abs(twenty.value - Math.round(L.fv(4500, 12, 20))) <= 1);
  assert.strictEqual(L.compute({ txns: BASE, now: NOW, redirectPct: 100 }).redirect.monthly, 18000);
  assert.strictEqual(L.compute({ txns: BASE, now: NOW, redirectPct: 0 }).redirect.monthly, 0);
  assert.strictEqual(L.compute({ txns: BASE, now: NOW, redirectPct: 500 }).redirect.pct, 100);   // clamped
});

test('ticking categories in and out changes the leak; unknown names are harmless', () => {
  assert.strictEqual(L.compute({ txns: BASE, now: NOW, include: ['Groceries'] }).monthly, 6000);
  assert.strictEqual(L.compute({ txns: BASE, now: NOW, include: ['Groceries', 'Shopping', 'Food & Dining'] }).monthly, 24000);
  assert.strictEqual(L.compute({ txns: BASE, now: NOW, include: [] }).monthly, 0);
  assert.strictEqual(L.compute({ txns: BASE, now: NOW, include: ['No Such Category'] }).monthly, 0);
});

test('growth rate: clamped to 0–30, falls back to 12 when junk, and 0% means no growth', () => {
  assert.strictEqual(L.compute({ txns: BASE, now: NOW, rate: 99 }).rate, 30);
  assert.strictEqual(L.compute({ txns: BASE, now: NOW, rate: -4 }).rate, 0);
  assert.strictEqual(L.compute({ txns: BASE, now: NOW, rate: 'abc' }).rate, 12);
  const zero = L.compute({ txns: BASE, now: NOW, rate: 0 });
  zero.horizons.forEach((h) => { assert.strictEqual(h.value, h.invested); assert.strictEqual(h.gain, 0); });
});

test('thin history (under 14 days) is not scaled up into a monthly figure', () => {
  const r = L.compute({ txns: daily('Food & Dining', 500, 5), now: NOW });
  assert.strictEqual(r.enoughData, false);
  assert.strictEqual(r.days, 5);
  assert.strictEqual(r.monthly, 0);
  assert.strictEqual(r.hasAnyData, false);
  assert.strictEqual(L.compute({ txns: daily('Food & Dining', 500, 13), now: NOW }).enoughData, false);
  assert.strictEqual(L.compute({ txns: daily('Food & Dining', 500, 14), now: NOW }).enoughData, true);
});

test('history is scaled by the days actually covered: 14 days of ₹1,000/day is ₹30,000 a month, not ₹14,000', () => {
  const r = L.compute({ txns: daily('Entertainment', 1000, 14), now: NOW });
  assert.strictEqual(r.categories[0].monthly, 30000);
});

test('only the last 90 days count; old and future-dated rows are ignored', () => {
  const txns = [...daily('Food & Dining', 100, 30), exp('Shopping', 99999, -120), exp('Shopping', 99999, 5)];
  const r = L.compute({ txns, now: NOW });
  assert.deepStrictEqual(r.categories.map((c) => c.category), ['Food & Dining']);
  assert.strictEqual(r.days, 30);
  // exactly 90 days of history is the longest window: a 100-day-old row never stretches the span
  const long = L.compute({ txns: [...daily('Food & Dining', 100, 90), exp('Food & Dining', 100, -95)], now: NOW });
  assert.strictEqual(long.days, 90);
  assert.strictEqual(long.categories[0].monthly, 3000);               // 90 × 100 ÷ 3 months
});

test('subscriptions: the larger of the tracker and the logged payments, never the sum', () => {
  const logged = daily('Subscriptions', 10, 30);                      // ₹300 a month in logged payments
  assert.strictEqual(L.compute({ txns: logged, subscriptionsMonthly: 800, now: NOW }).categories[0].monthly, 800);
  assert.strictEqual(L.compute({ txns: logged, subscriptionsMonthly: 200, now: NOW }).categories[0].monthly, 300);
  const sub = L.compute({ txns: logged, subscriptionsMonthly: 800, now: NOW });
  assert.strictEqual(sub.monthly, 800);
});

test('the tracker figure alone still gives a firm answer when there is too little logged spending', () => {
  const r = L.compute({ txns: [], subscriptionsMonthly: 1500, now: NOW });
  assert.strictEqual(r.enoughData, false);
  assert.strictEqual(r.hasAnyData, true);
  assert.strictEqual(r.monthly, 1500);
  assert.ok(Math.abs(r.horizons.find((h) => h.years === 20).value - Math.round(L.fv(1500, 12, 20))) <= 1);
});

test('empty, null and garbage input never produce NaN, Infinity or a throw', () => {
  for (const bad of [undefined, null, {}, { txns: null }, { txns: [null, 5, 'x', {}, { kind: 'expense', amount: 'abc', date: 'nope' }] }, { subscriptionsMonthly: 'lots' }]) {
    const r = L.compute(bad);
    assert.strictEqual(r.monthly, 0);
    assert.strictEqual(r.hasAnyData, false);
    assert.ok(JSON.stringify(r).indexOf('NaN') === -1 && JSON.stringify(r).indexOf('Infinity') === -1);
  }
});

test('works end to end on the real transaction shapes through FinosBudget.normalize', () => {
  const raw = [];
  for (let i = 0; i < 20; i++) raw.push({ amount: 500, category: 'need_food', type: 'need_food', label: 'lunch', date: iso(-i) });                 // quick capture
  raw.push({ id: 'a', type: 'debit', category: 'Food & Dining', desc: 'Zomato', amount: 700, date: iso(-3) + 'T10:00:00Z' });                  // account aggregator
  raw.push({ id: 'b', type: 'expense', category: 'shopping', description: 'shirt', amount: 1200, date: iso(-4) });                              // voice journal
  raw.push({ amount: 5000, type: 'saving', category: 'invest', label: 'SIP', date: iso(-5) });                                                 // a SIP is not a leak
  raw.push({ id: 'c', type: 'credit', category: 'Salary', desc: 'Salary', amount: 90000, date: iso(-6) + 'T10:00:00Z' });                      // income is not a leak
  const r = L.compute({ txns: B.normalizeAll(raw), now: NOW });
  const by = Object.fromEntries(r.categories.map((c) => [c.category, c.monthly]));
  assert.strictEqual(r.days, 20);
  assert.strictEqual(by['Food & Dining'], Math.round(((20 * 500 + 700) * 30) / 20));            // 16,050
  assert.strictEqual(by.Shopping, Math.round((1200 * 30) / 20));                                // 1,800
  assert.ok(!('Savings & Investments' in by) && !('Income' in by));
  assert.strictEqual(r.monthly, 16050 + 1800);
});
