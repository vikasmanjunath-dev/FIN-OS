'use strict';
// js/finos-dna-steps.js — the Financial DNA questions and scoring.
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../js/finos-dna-steps.js');

test('nine questions, each with 3 or 4 options and a five-number impact', () => {
  assert.equal(D.STEPS.length, 9);
  D.STEPS.forEach((s) => {
    assert.match(s.lvl, /^LEVEL_0\d$/);
    assert.ok(s.options.length >= 3 && s.options.length <= 4, s.id);
    s.options.forEach((o) => { assert.equal(o.impact.length, 5); assert.ok(o.impact.every(Number.isFinite)); });
  });
  assert.equal(new Set(D.STEPS.map((s) => s.id)).size, 9);
});

test('every age band has an answer: 36-49 exists and sits between 25-35 and 50+ on each dimension', () => {
  const age = D.STEPS[0].options;
  assert.deepEqual(age.map((o) => o.text.split(' ')[0]), ['18-24', '25-35', '36-49', '50+']);
  const [, a, b, c] = age.map((o) => o.impact);
  for (let i = 0; i < 5; i++) {
    const lo = Math.min(a[i], c[i]), hi = Math.max(a[i], c[i]);
    assert.ok(b[i] >= lo - 5 && b[i] <= hi + 5, `dimension ${i}: ${b[i]} not near [${lo}, ${hi}]`);
  }
});

test('apply clamps every score to 0-100 and does not mutate its input', () => {
  const s = [95, 5, 50, 50, 50];
  const r = D.apply(s, [30, -30, 0, 10, -10]);
  assert.deepEqual(r, [100, 0, 50, 60, 40]);
  assert.deepEqual(s, [95, 5, 50, 50, 50]);
});

test('scoresFor replays saved answers, ignores unknown text and order of keys', () => {
  assert.deepEqual(D.scoresFor({}), [50, 50, 50, 50, 50]);
  assert.deepEqual(D.scoresFor({ LEVEL_00: '36-49 (Peak Earning)', LEVEL_05: 'Buy the Dip (Alpha move)' }), [75, 55, 55, 75, 73]);
  assert.deepEqual(D.scoresFor({ LEVEL_05: 'Buy the Dip (Alpha move)', LEVEL_99: 'x', LEVEL_00: 'nope' }), [80, 40, 55, 65, 75]);
  assert.deepEqual(D.scoresFor(null), [50, 50, 50, 50, 50]);
});

test('answering everything stays inside 0-100 for any combination of first and last options', () => {
  for (const pick of [0, -1]) {
    let s = D.START.slice();
    D.STEPS.forEach((st) => { const o = pick === 0 ? st.options[0] : st.options[st.options.length - 1]; s = D.apply(s, o.impact); });
    assert.ok(s.every((v) => v >= 0 && v <= 100));
  }
});
