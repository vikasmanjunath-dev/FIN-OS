const test = require('node:test');
const assert = require('node:assert');
const F = require('../js/finos-format.js');

test('Indian grouping', () => {
  assert.strictEqual(F.inr(0), '₹0');
  assert.strictEqual(F.inr(999), '₹999');
  assert.strictEqual(F.inr(1000), '₹1,000');
  assert.strictEqual(F.inr(123456), '₹1,23,456');
  assert.strictEqual(F.inr(1234567), '₹12,34,567');
  assert.strictEqual(F.inr(123456789), '₹12,34,56,789');
  assert.strictEqual(F.inr(1234567.5, { decimals: 2 }), '₹12,34,567.50');
  assert.strictEqual(F.inr(-1234567), '-₹12,34,567');
  assert.strictEqual(F.num(100000), '1,00,000');
});
test('invalid input renders a dash, never NaN', () => {
  for (const v of [NaN, undefined, null, 'abc', Infinity]) assert.strictEqual(F.inr(v), '—');
  assert.strictEqual(F.inr('1,23,456'), '₹1,23,456');            // numeric strings accepted
  assert.strictEqual(F.inr(-0.001), '₹0');                        // no "-₹0"
});
test('compact lakh / crore', () => {
  assert.strictEqual(F.compact(950), '₹950');
  assert.strictEqual(F.compact(12500), '₹12.5 K');
  assert.strictEqual(F.compact(500000), '₹5 L');
  assert.strictEqual(F.compact(12500000), '₹1.25 Cr');
  assert.strictEqual(F.compact(-25000000), '-₹2.5 Cr');
  assert.strictEqual(F.compact(1.5e9), '₹1.5 Ar');
  assert.strictEqual(F.compact(99999), '₹1 L');                   // rounds up into next unit
});
test('percent', () => {
  assert.strictEqual(F.pct(0.1234), '12.3%');
  assert.strictEqual(F.pct(0.12), '12%');
  assert.strictEqual(F.pctRaw(7.5), '7.5%');
  assert.strictEqual(F.pct(NaN), '—');
});
test('parse accepts Indian shorthand', () => {
  assert.strictEqual(F.parse('₹5L'), 500000);
  assert.strictEqual(F.parse('2.5 cr'), 25000000);
  assert.strictEqual(F.parse('50k'), 50000);
  assert.strictEqual(F.parse('1,23,456'), 123456);
  assert.strictEqual(F.parse('1 lakh'), 100000);
  assert.ok(Number.isNaN(F.parse('abc')));
});
test('dates & FY', () => {
  assert.strictEqual(F.date('2026-10-01T12:00:00'), '01 Oct 2026');
  assert.strictEqual(F.monthYear(new Date(2026, 9, 1)), 'Oct 2026');
  assert.strictEqual(F.fy(new Date(2026, 2, 31)), 'FY 2025-26');
  assert.strictEqual(F.fy(new Date(2026, 3, 1)), 'FY 2026-27');
  assert.strictEqual(F.date('nonsense'), '—');
});
