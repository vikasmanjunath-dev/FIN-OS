const test = require('node:test');
const assert = require('node:assert');
const E = require('../../../js/sml/categoriser-export.js');

const T = (o) => Object.assign({ amount: 450, date: '2026-10-01', type: 'debit', category: 'Food & Dining', description: 'SWIGGY ORDER 88123' }, o);

test('buckets never reveal the exact amount', () => {
  assert.deepStrictEqual([50, 99.9, 100, 499, 500, 1999, 2000, 9999, 10000, 250000].map(E.bucket), ['<100', '<100', '100-500', '100-500', '500-2000', '500-2000', '2000-10000', '2000-10000', '10000+', '10000+']);
  assert.strictEqual(E.bucket(0), null); assert.strictEqual(E.bucket('x'), null); assert.strictEqual(E.bucket(-300), '100-500');
});
test('only rows with the person\'s own category (one of the 13 names) become rows; the rest are counted, not exported', () => {
  const r = E.buildRows([T(), T({ category: 'need_food' }), T({ category: 'Salary', type: 'credit' }), T({ type: 'transfer' }), T({ amount: 0 }), T({ description: '' }), null, 7, T({ category: 'Transport', description: 'Uber trip' })]);
  assert.strictEqual(r.rows.length, 2); assert.deepStrictEqual(r.rows.map((x) => x.category), ['Food & Dining', 'Transport']);
  assert.deepStrictEqual(r.skipped, { category_not_one_of_the_13: 1, not_an_expense: 2, bad_amount: 1, no_usable_description: 1, not_an_object: 2 });
});
test('rows carry no date, id, exact amount or personal strings', () => {
  const r = E.buildRows([T({ description: 'UPI to ravi.k@okhdfc 9876543210 ref 1234567', amount: 1234.56, id: 'abc', date: '2026-10-05' })]);
  const j = JSON.stringify(r.rows[0]);
  assert.deepStrictEqual(Object.keys(r.rows[0]).sort(), ['amount_bucket', 'category', 'channel', 'description', 'direction', 'source']);
  assert.ok(!/ravi|okhdfc|9876543210|1234567|1234\.56|abc|2026-10/.test(j), j);
  assert.strictEqual(r.rows[0].amount_bucket, '500-2000');
  assert.match(r.rows[0].description, /UPI to \[UPI\].*\[NUM\]/);
});
test('order numbers inside merchant text become [NUM] (5+ digits) or # (3-4 digits), channel is read from known tokens only', () => {
  const r = E.buildRows([T({ description: 'SWIGGY ORDER 88123', channel: 'UPI-collect' }), T({ description: 'POS 123 MART', method: 'Debit Card' }), T({ description: 'X', mode: 'weird' })]);
  assert.strictEqual(r.rows[0].description, 'SWIGGY ORDER [NUM]'); assert.strictEqual(r.rows[1].description, 'POS # MART'); assert.strictEqual(r.rows[0].channel, 'upi');
  assert.strictEqual(r.rows[1].channel, 'card'); assert.strictEqual(r.rows[2].channel, 'other');
});
test('source label is validated; default founder', () => {
  assert.strictEqual(E.buildRows([T()], { source: 'p2' }).rows[0].source, 'p2');
  assert.strictEqual(E.buildRows([T()], { source: 'Ravi Kumar, 9876543210' }).rows[0].source, 'founder');
});
test('off by default; no network code in the source', () => {
  assert.strictEqual(E.enabled({ getItem: () => null }), false); assert.strictEqual(E.enabled({ getItem: () => '1' }), true);
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', '..', '..', 'js', 'sml', 'categoriser-export.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/\b(fetch|XMLHttpRequest|sendBeacon|WebSocket|navigator\.)\b/.test(src));
});
