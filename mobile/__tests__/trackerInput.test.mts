import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_TRACKER_RUPEES, parseTrackerMoney, parseTrackerNumber } from '@/lib/trackerInput';

test('rupee input accepts blank zero, integer rupees, Indian grouping, and exact paise', () => {
  assert.deepEqual(parseTrackerMoney(''), { ok: true, value: 0 });
  assert.deepEqual(parseTrackerMoney('₹12,34,567.89'), { ok: true, value: 1_234_567.89 });
  assert.deepEqual(parseTrackerMoney('0.10'), { ok: true, value: 0.1 });
});

test('rupee input rejects malformed, negative, excessive precision, and overflow instead of saving zero', () => {
  for (const raw of ['1oops', '1,2', '-1', '1.001', 'Infinity', '1e999']) {
    assert.equal(parseTrackerMoney(raw).ok, false, raw);
  }
  assert.equal(parseTrackerMoney(String(MAX_TRACKER_RUPEES + 100)).ok, false);
});

test('bounded numeric fields reject invalid and out-of-range input instead of clamping it', () => {
  assert.deepEqual(parseTrackerNumber('58', 18, 100), { ok: true, value: 58 });
  assert.equal(parseTrackerNumber('101', 18, 100).ok, false);
  assert.equal(parseTrackerNumber('NaN', 18, 100).ok, false);
});
