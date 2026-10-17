import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeEpf } from '@/lib/retirement';

const input = { balance: 100_000, basic: 50_000, doj: '2000-01-01', retireAge: 58 };
const now = new Date(2026, 9, 17, 12);

test('EPF never projects using an assumed joining age and marks invalid age inputs incomplete', () => {
  for (const dob of ['', '1980-02-30', '2999-01-01', '2001-01-01']) {
    const result = computeEpf({ ...input, dob }, now);
    assert.equal(result.complete, false, `DOB ${dob} must not be accepted`);
    assert.equal(result.projected, 0);
    assert.equal(result.pension, 0);
  }
});

test('EPF derives its retirement horizon from recorded DOB, including leap-day birthdays', () => {
  const result = computeEpf({ ...input, dob: '1980-02-29' }, now);
  const retirementDate = new Date(2038, 1, 28);
  const today = new Date(2026, 9, 17);
  const expectedMonths = Math.max(0, Math.round((retirementDate.getTime() - today.getTime()) / (30.44 * 86400000)));
  assert.equal(result.complete, true);
  assert.equal(result.monthsToRetire, expectedMonths);
  assert.ok(result.projected > input.balance);
  assert.ok(result.pension > 0);
});

test('EPF rejects poisoned/out-of-range amounts and invalid retirement ages', () => {
  for (const balance of [Infinity, Number.MAX_SAFE_INTEGER, -1]) {
    const result = computeEpf({ ...input, dob: '1980-02-29', balance }, now);
    assert.equal(result.complete, false);
    assert.equal(result.projected, 0);
  }
  for (const retireAge of [49, 66, 58.5]) {
    const result = computeEpf({ ...input, dob: '1980-02-29', retireAge }, now);
    assert.equal(result.complete, false);
    assert.equal(result.projected, 0);
  }
});
