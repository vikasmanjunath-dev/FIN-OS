// Guardrail extension (phone only): a model reply that states an amount about the person that is nowhere in their records gets a note.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFigures, apply, FIGURE_NOTE } from '../lib/aryaGuardrails.ts';

const KNOWN = [4500000, 100000, 60000, 1200000, 15000];

test('an invented figure about the person is flagged and named', () => {
  const r = applyFigures('what is my net worth', 'Your net worth is ₹45 lakh, which is healthy.', [1800000, 100000]);
  assert.deepEqual(r.flags, ['unverified_figures']);
  assert.deepEqual(r.unverified, ['₹45 lakh']);
  assert.ok(r.text.startsWith('Your net worth is ₹45 lakh, which is healthy.'));
  assert.ok(r.text.includes(FIGURE_NOTE));
  assert.ok(r.text.includes('₹45 lakh'));
});

test('a figure that matches the records is not flagged (any display form)', () => {
  [
    'Your net worth is ₹45 lakh.', 'You have ₹45,00,000 in assets.', 'Your net worth is Rs. 4500000.', 'You earn ₹1 lakh a month.',
    'You spend about ₹60,000 every month.', 'Your SIP of ₹15,000 is on track.', 'Your income is ₹12 lakh a year.', 'Your salary is ₹1,00,000 monthly.',
    'You hold 45 lakh in total.',
  ].forEach(t => assert.deepEqual(applyFigures('q', t, KNOWN).flags, [], t));
});

test('a small rounding difference is accepted, a real difference is not', () => {
  assert.deepEqual(applyFigures('q', 'Your net worth is ₹44.9 lakh.', KNOWN).flags, []);   // within 1.5%
  assert.deepEqual(applyFigures('q', 'Your net worth is ₹40 lakh.', KNOWN).flags, ['unverified_figures']);
});

test('only sentences about "you" are checked: general examples and hypotheticals are left alone', () => {
  const t = 'A SIP of ₹5,000 for 10 years at 12% becomes about ₹11.6 lakh. If you invest ₹25,000 a month it could reach ₹50 lakh. The 80C limit is ₹1.5 lakh. Aim for 6 months, around ₹3,60,000, as a guide.';
  assert.deepEqual(applyFigures('q', t, []).flags, []);
});

test('advice and ranges are not claims: a real model reply with a suggested range raises no note', () => {
  const real = `Asha, with a monthly income of ₹120,000 and expenses of ₹60,000, you have a good amount of savings. Here's a simple festive season planning tip:

1. Budget for Festive Spending: Set aside ₹10,000–₹15,000 from your monthly savings for festive expenses like gifts, travel, and food. This keeps you in control and avoids dipping into your emergency fund.

2. Continue SIPs: Keep your SIPs running.`;
  const r = applyFigures('how should I plan for the festive season?', real, [120000, 60000, 2100000, 600000]);
  assert.deepEqual(r.flags, []);
  assert.equal(r.text, real);
  assert.deepEqual(applyFigures('q', 'Your savings could be anywhere between ₹2 lakh and ₹3 lakh.', []).flags, []);
});

test('"about" allows rounding (8%), a plain statement allows 1.5%', () => {
  assert.deepEqual(applyFigures('q', 'Your net worth is about ₹42 lakh.', [4500000]).flags, []);        // 6.7% under
  assert.deepEqual(applyFigures('q', 'Your net worth is ₹42 lakh.', [4500000]).flags, ['unverified_figures']);
  assert.deepEqual(applyFigures('q', 'Your net worth is about ₹30 lakh.', [4500000]).flags, ['unverified_figures']);
});

test('amounts the person typed in the question count as known', () => {
  assert.deepEqual(applyFigures('my rent is ₹32,000, is that high?', 'Your rent of ₹32,000 is about a third of ₹1 lakh income.', [100000]).flags, []);
  assert.deepEqual(applyFigures('is my rent high?', 'Your rent of ₹32,000 is high.', [100000]).flags, ['unverified_figures']);
});

test('with nothing recorded, any amount stated about the person is unverified', () => {
  assert.deepEqual(applyFigures('q', 'You have ₹5 lakh in savings.', []).flags, ['unverified_figures']);
  assert.deepEqual(applyFigures('q', 'You have ₹5 lakh in savings.', undefined as any).flags, ['unverified_figures']);
});

test('small amounts and bare numbers are not treated as money claims', () => {
  assert.deepEqual(applyFigures('q', 'You have 3 goals and your score is 62. Your fee is ₹500.', []).flags, []);
});

test('it only appends, and applying twice adds nothing more', () => {
  const reply = 'Your net worth is ₹45 lakh. You earn ₹3 lakh a month.';
  const once = applyFigures('q', reply, [100000]);
  assert.ok(once.text.startsWith(reply));
  assert.equal(applyFigures('q', once.text, [100000]).text, once.text);
  assert.deepEqual(once.unverified, ['₹45 lakh', '₹3 lakh']);
  assert.equal(applyFigures('q', '', []).text, '');
});

test('it works after the website guardrail and leaves that guardrail\'s own note intact', () => {
  const reply = 'You should buy HDFCBANK. Your net worth is ₹45 lakh.';
  const g = apply('q', reply);
  const f = applyFigures('q', g.text, [100000]);
  assert.ok(f.text.startsWith(g.text));
  assert.ok(f.flags.includes('unverified_figures'));
  assert.equal(apply('q', f.text).text, f.text);
});

test('only per-month amounts may be quoted per year: the app passes { figures, monthly }', () => {
  const known = { figures: [100000, 9600000], monthly: [100000] };
  assert.deepEqual(applyFigures('q', 'You earn ₹12 lakh a year.', known).flags, []);                 // 100000 x 12
  assert.deepEqual(applyFigures('q', 'Your net worth is ₹1.15 crore.', known).flags, ['unverified_figures']);   // 9600000 x 12 is not a recorded figure
  assert.deepEqual(applyFigures('q', 'Your net worth is ₹96 lakh.', known).flags, []);
});
