// FinosMoneyScore — pure scoring core. Expected numbers in the golden cases are worked out by hand in the comments.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../js/finos-money-score.js');

// Everything right: 30y, ₹1L/month, 50% saved, 6 months cash, 10% EMI, 15% invested, 1× income by 30, full cover.
const PERFECT = { age: 30, monthlyIncome: 100000, monthlyExpenses: 40000, monthlyEmi: 10000, liquidSavings: 300000,
  monthlyInvesting: 15000, investedTotal: 1200000, termCover: 12000000, healthCover: 750000, dependents: 1 };

// Thin cushion, no insurance:
//   savings   outgo 90k → keeps 10% → 10/20 → 50  → 10.00 pts
//   emergency 100k / 90k = 1.11 mo → 18.5         →  3.70
//   insurance term 0, health 0                    →  0
//   debt      EMI 20% → (0.5-0.2)/0.4 = 75        → 11.25
//   investing 5% / 15% = 33.3                     →  5.00
//   wealth    age 30 → 1× = ₹12L target, has ₹6L → 50 → 5.00        total 34.95 → 35
const THIN = { age: 30, monthlyIncome: 100000, monthlyExpenses: 70000, monthlyEmi: 20000, liquidSavings: 100000,
  monthlyInvesting: 5000, investedTotal: 600000, termCover: 0, healthCover: 0, dependents: 1 };

const score = (o) => M.compute({ ...PERFECT, ...o }).score;

test('weights add up to 100 and the pillars cover every weight', () => {
  assert.strictEqual(Object.values(M.WEIGHTS).reduce((a, b) => a + b, 0), 100);
  const r = M.compute(PERFECT);
  assert.deepStrictEqual(r.pillars.map((p) => p.id).sort(), Object.keys(M.WEIGHTS).sort());
});

test('a textbook-healthy profile scores 100 and every pillar is full', () => {
  const r = M.compute(PERFECT);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.score, 100);
  assert.strictEqual(r.band.id, 'strong');
  r.pillars.forEach((p) => assert.strictEqual(p.score, 100, p.id));
  assert.deepStrictEqual(r.actions, []);
});

test('golden case: thin cushion scores 35 with the hand-computed pillar scores', () => {
  const r = M.compute(THIN);
  assert.strictEqual(r.score, 35);
  assert.strictEqual(r.band.id, 'attention');
  const by = Object.fromEntries(r.pillars.map((p) => [p.id, p]));
  assert.strictEqual(by.savings.score, 50);
  assert.strictEqual(by.emergency.score, 19);
  assert.strictEqual(by.insurance.score, 0);
  assert.strictEqual(by.debt.score, 75);
  assert.strictEqual(by.investing.score, 33);
  assert.strictEqual(by.wealth.score, 50);
  assert.strictEqual(by.savings.points, 10);
  assert.ok(Math.abs(by.debt.points - 11.25) <= 0.1);   // 15 × 75% (float rounding may show 11.2)
});

test('actions: a near-empty emergency fund is urgent, then ranked by points gained; amounts match the gap', () => {
  const r = M.compute(THIN);
  assert.deepStrictEqual(r.actions.map((a) => a.id), ['emergency', 'insurance', 'debt']);
  assert.strictEqual(r.actions[0].amount, 440000);          // 6 × ₹90k = ₹5.4L, has ₹1L → ₹4.4L
  assert.strictEqual(r.actions[1].amount, 12750000);        // term ₹1.2Cr + health ₹7.5L
  r.actions.forEach((a) => { assert.ok(a.gain >= 1, a.id); assert.ok(a.title && a.detail && a.href && a.cta, a.id); });
  assert.ok(r.actions[1].gain >= 19 && r.actions[1].gain <= 21, 'insurance is worth about 20 points');
});

test('applying an action really raises the score by about the promised gain', () => {
  const r = M.compute(THIN);
  const fixed = M.compute({ ...THIN, liquidSavings: 540000 });   // the emergency action's fix
  assert.ok(Math.abs((fixed.score - r.score) - r.actions[0].gain) <= 1);
});

test('high-interest debt caps the debt pillar at 40 and becomes the first action', () => {
  const r = M.compute({ ...PERFECT, monthlyEmi: 0, highInterestDebt: true });
  const debt = r.pillars.find((p) => p.id === 'debt');
  assert.strictEqual(debt.score, 40);
  assert.strictEqual(r.actions[0].id, 'debt-high');
  assert.strictEqual(r.actions[0].amount, 0);
  assert.ok(r.actions[0].gain >= 8);                             // 60% of a 15-point pillar ≈ 9
});

test('no dependents: term cover is not required, health cover still is', () => {
  const base = { ...PERFECT, dependents: 0, termCover: 0, healthCover: 500000 };
  assert.strictEqual(M.compute(base).pillars.find((p) => p.id === 'insurance').score, 100);
  assert.strictEqual(M.compute({ ...base, healthCover: 0 }).pillars.find((p) => p.id === 'insurance').score, 50);
});

test('spending more than you earn: savings pillar is 0, nothing is NaN, and there is a plan', () => {
  const r = M.compute({ ...PERFECT, monthlyExpenses: 130000, monthlyEmi: 0 });
  assert.strictEqual(r.pillars.find((p) => p.id === 'savings').score, 0);
  assert.match(r.pillars.find((p) => p.id === 'savings').detail, /more than you earn/);
  assert.ok(Number.isInteger(r.score) && r.score >= 0 && r.score <= 100);
  assert.ok(JSON.stringify(r).indexOf('NaN') === -1);
  const act = M.compute({ ...PERFECT, monthlyExpenses: 130000, monthlyEmi: 0, liquidSavings: 1e9, monthlyInvesting: 1e9 }).actions.find((a) => a.id === 'savings');
  assert.strictEqual(act.amount, 50000);                         // 130k − 80k
});

test('blank or zero spending is rejected, so skipping the field cannot flatter the score', () => {
  for (const v of [0, '', undefined, null, '0']) {
    const r = M.compute({ ...PERFECT, monthlyExpenses: v });
    assert.strictEqual(r.ok, false, String(v));
    assert.match(r.errors.join('|'), /spending/i);
  }
  // the smallest legal spend, with no EMI and no savings, still produces clean numbers
  const r = M.compute({ ...PERFECT, monthlyExpenses: 1, monthlyEmi: 0, liquidSavings: 0 });
  assert.ok(JSON.stringify(r).indexOf('NaN') === -1 && JSON.stringify(r).indexOf('Infinity') === -1);
});

test('input validation: required fields, ranges, junk — and friendly money strings are accepted', () => {
  const bad = (o, re) => { const r = M.compute({ ...PERFECT, ...o }); assert.strictEqual(r.ok, false); assert.match(r.errors.join('|'), re); };
  bad({ monthlyIncome: 0 }, /income/i);
  bad({ monthlyIncome: '' }, /income/i);
  bad({ monthlyIncome: 'lots' }, /income/i);
  bad({ age: 17 }, /age/i);
  bad({ age: 81 }, /age/i);
  bad({ age: '' }, /age/i);
  bad({ monthlyExpenses: -5 }, /spending/i);
  bad({ liquidSavings: 'abc' }, /savings/i);
  bad({ dependents: 11 }, /dependents/i);
  assert.strictEqual(M.compute(null).ok, false);
  assert.strictEqual(M.compute({}).ok, false);
  const r = M.compute({ ...PERFECT, monthlyIncome: '₹1,00,000', liquidSavings: '3,00,000', monthlyExpenses: ' 40000 ' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.inputs.monthlyIncome, 100000);
  assert.strictEqual(r.score, 100);
});

test('optional fields left blank count as zero, not as an error', () => {
  const r = M.compute({ age: 28, monthlyIncome: 60000, monthlyExpenses: 30000 });
  assert.strictEqual(r.ok, true);
  assert.ok(r.score >= 0 && r.score < 60);
});

test('monotonic: more savings/cover/investing never lowers the score; more spending/EMI never raises it', () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let n = 0; n < 300; n++) {
    const base = { age: 20 + Math.floor(rnd() * 55), monthlyIncome: 20000 + Math.floor(rnd() * 400000), dependents: Math.floor(rnd() * 4), highInterestDebt: rnd() < 0.3 };
    base.monthlyExpenses = Math.floor(rnd() * base.monthlyIncome * 1.1);
    base.monthlyEmi = Math.floor(rnd() * base.monthlyIncome * 0.6);
    base.liquidSavings = Math.floor(rnd() * 2e6); base.monthlyInvesting = Math.floor(rnd() * base.monthlyIncome * 0.3);
    base.investedTotal = Math.floor(rnd() * 3e7); base.termCover = Math.floor(rnd() * 5e7); base.healthCover = Math.floor(rnd() * 2e6);
    const s0 = M.compute(base).score;
    assert.ok(s0 >= 0 && s0 <= 100);
    for (const k of ['liquidSavings', 'monthlyInvesting', 'investedTotal', 'termCover', 'healthCover']) {
      assert.ok(M.compute({ ...base, [k]: base[k] * 1.5 + 1000 }).score >= s0, k + ' up must not lower the score: ' + JSON.stringify(base));
    }
    for (const k of ['monthlyExpenses', 'monthlyEmi']) {
      assert.ok(M.compute({ ...base, [k]: base[k] * 1.5 + 1000 }).score <= s0, k + ' up must not raise the score: ' + JSON.stringify(base));
    }
    assert.ok(M.compute({ ...base, highInterestDebt: false }).score >= M.compute({ ...base, highInterestDebt: true }).score);
  }
});

test('every action link points at a page that exists', () => {
  const hrefs = new Set();
  [THIN, { ...THIN, highInterestDebt: true }, { ...THIN, dependents: 0, termCover: 0, healthCover: 0 }, { ...THIN, monthlyEmi: 0, liquidSavings: 1e9, termCover: 1e9, healthCover: 1e9 }]
    .forEach((p) => M.compute(p).actions.forEach((a) => hrefs.add(a.href)));
  // also exercise each candidate by making each pillar the weak one
  [{ monthlyExpenses: 99000, monthlyEmi: 0 }, { monthlyInvesting: 0 }, { investedTotal: 0 }, { termCover: 0 }, { healthCover: 0 }].forEach((o) =>
    M.compute({ ...PERFECT, ...o }).actions.forEach((a) => hrefs.add(a.href)));
  assert.ok(hrefs.size >= 5, 'expected several distinct destinations, got ' + [...hrefs]);
  for (const h of hrefs) {
    const file = path.resolve(__dirname, '..', 'html', decodeURI(h));
    assert.ok(fs.existsSync(file), 'missing page for action link: ' + h);
  }
});

test('benchmarkMultiple interpolates the age milestones', () => {
  assert.strictEqual(M.benchmarkMultiple(18), 0);
  assert.strictEqual(M.benchmarkMultiple(22), 0);
  assert.strictEqual(M.benchmarkMultiple(30), 1);
  assert.strictEqual(M.benchmarkMultiple(35), 2);
  assert.strictEqual(M.benchmarkMultiple(40), 3);
  assert.strictEqual(M.benchmarkMultiple(65), 10);
  assert.strictEqual(M.benchmarkMultiple(80), 10);
});

test('history: one entry per day (latest wins), sorted, capped at 24; trend compares with the previous snapshot', () => {
  let h = [];
  h = M.appendHistory(h, { date: '2026-09-01', score: 40 });
  h = M.appendHistory(h, { date: '2026-10-01', score: 52 });
  h = M.appendHistory(h, { date: '2026-10-01', score: 55 });
  assert.deepStrictEqual(h, [{ date: '2026-09-01', score: 40 }, { date: '2026-10-01', score: 55 }]);
  assert.deepStrictEqual(M.trend(h), { delta: 15, since: '2026-09-01' });
  assert.strictEqual(M.trend([{ date: '2026-10-01', score: 55 }]), null);
  assert.strictEqual(M.trend(null), null);
  let big = [];
  for (let d = 1; d <= 30; d++) big = M.appendHistory(big, { date: '2026-09-' + String(d).padStart(2, '0'), score: d });
  assert.strictEqual(big.length, 24);
  assert.strictEqual(big[0].date, '2026-09-07');
  assert.deepStrictEqual(M.appendHistory(undefined, { date: '2026-10-01', score: 1 }), [{ date: '2026-10-01', score: 1 }]);
});

test('result never contains the money the user typed in the share-safe pillar summary', () => {
  const r = M.compute(THIN);
  // The share card uses only band + pillar label/score; make sure those fields hold no rupee amounts.
  const shareable = JSON.stringify({ score: r.score, band: r.band.label, pillars: r.pillars.map((p) => [p.label, p.score]) });
  assert.doesNotMatch(shareable, /₹|\d{5,}/);
});
