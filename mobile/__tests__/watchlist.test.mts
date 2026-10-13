import { test } from 'node:test';
import assert from 'node:assert/strict';
import { add, applyPrices, cleanSymbol, normalise, remove, view, itemId, MAX_ITEMS, type WatchItem } from '../lib/watchlist.ts';

const NOW = new Date('2026-10-14T10:00:00Z');
const ok = (r: ReturnType<typeof add>): WatchItem[] => { assert.ok(r.ok); return (r as any).items; };

test('symbols: NSE tickers and numeric scheme codes only', () => {
  assert.equal(cleanSymbol('Stock', ' infy '), 'INFY');
  assert.equal(cleanSymbol('Stock', 'NSE:HDFCBANK'), 'HDFCBANK');
  assert.equal(cleanSymbol('Stock', 'M&M'), 'M&M');
  assert.equal(cleanSymbol('Stock', 'bad symbol!'), null);
  assert.equal(cleanSymbol('Stock', ''), null);
  assert.equal(cleanSymbol('MF', '120503'), '120503');
  assert.equal(cleanSymbol('MF', 'abc'), null);
});

test('adding keeps the price at the time, rejects duplicates and bad symbols, and caps the list', () => {
  const a = ok(add([], 'Stock', 'infy', 'Infosys', 1500.456, NOW));
  assert.equal(a[0].refPrice, 1500.46);
  assert.equal(a[0].id, 'Stock:INFY');
  const dup = add(a, 'Stock', 'INFY', 'Infosys', 1600, NOW);
  assert.equal(dup.ok, false);
  assert.equal(add(a, 'Stock', '!!', 'x', 1, NOW).ok, false);
  const offline = ok(add(a, 'Stock', 'TCS', 'TCS', null, NOW));
  assert.equal(offline[0].refPrice, null);                     // no price known: nothing invented
  let many: WatchItem[] = [];
  for (let i = 0; i < MAX_ITEMS; i++) many = ok(add(many, 'Stock', 'S' + i, 'S' + i, 10, NOW));
  assert.equal(add(many, 'Stock', 'EXTRA', 'x', 1, NOW).ok, false);
});

test('prices refresh only the items that came back, and the first price becomes the reference when there was none', () => {
  const items = ok(add(ok(add([], 'Stock', 'INFY', 'Infosys', 1500, NOW)), 'Stock', 'TCS', 'TCS', null, NOW));
  const next = applyPrices(items, { 'Stock:TCS': 4000, 'Stock:NOPE': 5 }, '2026-10-15');
  const tcs = next.find(i => i.symbol === 'TCS')!, infy = next.find(i => i.symbol === 'INFY')!;
  assert.equal(tcs.lastPrice, 4000);
  assert.equal(tcs.refPrice, 4000);
  assert.equal(infy.lastPrice, 1500);
  assert.equal(infy.priceDate, '2026-10-14');
});

test('view: change since added, and stale after a week', () => {
  const items = applyPrices(ok(add([], 'Stock', 'INFY', 'Infosys', 1500, NOW)), { 'Stock:INFY': 1650 }, '2026-10-14');
  const v = view(items, '2026-10-14')[0];
  assert.equal(Math.round(v.changePct! * 10) / 10, 10);
  assert.equal(v.stale, false);
  assert.equal(view(items, '2026-10-30')[0].stale, true);
  const none = view(ok(add([], 'Stock', 'TCS', 'TCS', null, NOW)), '2026-10-14')[0];
  assert.equal(none.changePct, null);
  assert.equal(none.stale, true);
});

test('remove and normalise tolerate junk and duplicates', () => {
  const items = ok(add([], 'Stock', 'INFY', 'Infosys', 1500, NOW));
  assert.deepEqual(remove(items, 'Stock:INFY'), []);
  const n = normalise([{ type: 'Stock', symbol: 'infy', name: 'Infosys', refPrice: '1500' }, { type: 'Stock', symbol: 'INFY' }, { type: 'Bond', symbol: 'X' }, null, { type: 'MF', symbol: 'zz' }]);
  assert.equal(n.length, 1);
  assert.equal(n[0].refPrice, 1500);
  assert.deepEqual(normalise('nope'), []);
  assert.equal(itemId('MF', '120503'), 'MF:120503');
});
