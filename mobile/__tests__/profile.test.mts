import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate, completeness, EMPTY_PROFILE, PROFILE_KEYS, USED_FOR } from '../lib/profile.ts';

test('blank is valid and stores nothing; filled values are cleaned', () => {
  assert.deepEqual(validate(EMPTY_PROFILE), { ok: true, errors: {}, clean: EMPTY_PROFILE });
  const v = validate({ name: '  Asha   Rao ', age: ' 34 ', income: '₹ 1,25,000', dependents: '2' });
  assert.ok(v.ok);
  assert.deepEqual(v.clean, { name: 'Asha Rao', age: '34', income: '125000', dependents: '2' });
});

test('out-of-range and non-numeric answers are rejected with a plain message, not silently changed', () => {
  assert.ok(validate({ ...EMPTY_PROFILE, age: '12' }).errors.age);
  assert.ok(validate({ ...EMPTY_PROFILE, age: '101' }).errors.age);
  assert.ok(validate({ ...EMPTY_PROFILE, age: '34.5' }).errors.age);
  assert.ok(validate({ ...EMPTY_PROFILE, age: 'abc' }).errors.age);
  assert.ok(validate({ ...EMPTY_PROFILE, income: '-5' }).errors.income);
  assert.ok(validate({ ...EMPTY_PROFILE, dependents: '16' }).errors.dependents);
  assert.ok(validate({ ...EMPTY_PROFILE, dependents: '1.5' }).errors.dependents);
  assert.equal(validate({ ...EMPTY_PROFILE, age: '12' }).ok, false);
  assert.equal(validate({ ...EMPTY_PROFILE, dependents: '0' }).ok, true);                 // 0 dependents is an answer
  assert.equal(validate({ ...EMPTY_PROFILE, dependents: '0' }).clean.dependents, '0');
});

test('the name is capped and the keys match the website', () => {
  assert.equal(validate({ ...EMPTY_PROFILE, name: 'x'.repeat(200) }).clean.name.length, 60);
  assert.deepEqual(PROFILE_KEYS, { name: 'finos_user_name', age: 'finos_age', income: 'finos_monthly_income', dependents: 'finos_dependents' });
});

test('completeness counts answered fields, and every field says what it is used for', () => {
  assert.equal(completeness(EMPTY_PROFILE), 0);
  assert.equal(completeness({ name: 'A', age: '30', income: '', dependents: '0' }), 3);
  (Object.keys(EMPTY_PROFILE) as (keyof typeof EMPTY_PROFILE)[]).forEach(k => assert.ok(USED_FOR[k].length > 20, k));
});
