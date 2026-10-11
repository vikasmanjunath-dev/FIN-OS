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

/* ── prefill from data FIN-OS already holds ─────────────────────────────────────────────────────────────────── */
const L = require('../js/finos-leak.js');
const NOW = new Date(2026, 9, 3);
const dayISO = (off) => { const d = new Date(2026, 9, 3 + off); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const tx = (category, amount, off, kind = 'expense') => ({ kind, category, amount, date: dayISO(off) });
const thirtyDays = (category, amount) => Array.from({ length: 30 }, (_, i) => tx(category, amount, -i));

const FULL = {
  income: 100000, age: 30, dependents: 2, termCover: 5000000, emergencyFund: 200000, sipMonthly: 15000, now: NOW,
  values: { portfolio: 100000, mfImport: 300000, sip: 250000, epf: 400000, ppf: 50000, nps: 0, gold: 20000 },
  txns: [...thirtyDays('Food & Dining', 1000), tx('EMI & Loans', 10000, -3), tx('Income', 100000, -4, 'income'), tx('Savings & Investments', 5000, -5, 'saving')],
};

test('deriveInputs: fills every answer FIN-OS can work out, and says where each came from', () => {
  const d = M.deriveInputs(FULL);
  assert.deepStrictEqual(d.values, {
    monthlyIncome: 100000, age: 30, dependents: 2, termCover: 5000000, liquidSavings: 200000, monthlyInvesting: 15000,
    investedTotal: 870000,          // 100,000 + max(300,000 import, 250,000 SIP) + 400,000 EPF + 50,000 PPF + 0 NPS + 20,000 gold
    monthlyExpenses: 30000,         // ₹1,000 × 30 days of food; the EMI, the income and the SIP are not spending
    monthlyEmi: 10000,              // one ₹10,000 payment in 30 days
  });
  assert.deepStrictEqual(Object.keys(d.sources).sort(), Object.keys(d.values).sort());
  Object.values(d.sources).forEach((s) => assert.ok(typeof s === 'string' && s.length > 3));
  assert.match(d.sources.monthlyExpenses, /30 days/);
});

test('deriveInputs: the SIP tracker and a CAS import are never added together', () => {
  const only = (values) => M.deriveInputs({ values }).values.investedTotal;
  assert.strictEqual(only({ sip: 250000 }), 250000);
  assert.strictEqual(only({ mfImport: 300000 }), 300000);
  assert.strictEqual(only({ mfImport: 300000, sip: 250000 }), 300000);
  assert.strictEqual(only({ epf: 1, ppf: 2, nps: 3, gold: 4, portfolio: 5 }), 15);
});

test('deriveInputs: nothing known means nothing guessed', () => {
  for (const empty of [undefined, null, {}, { txns: [] }, { values: {} }]) {
    assert.deepStrictEqual(M.deriveInputs(empty), { values: {}, sources: {} });
  }
});

test('deriveInputs: under 14 days of logged spending is not scaled up into a monthly figure', () => {
  const thin = M.deriveInputs({ txns: Array.from({ length: 13 }, (_, i) => tx('Food & Dining', 1000, -i)), now: NOW });
  assert.ok(!('monthlyExpenses' in thin.values) && !('monthlyEmi' in thin.values));
  const ok = M.deriveInputs({ txns: Array.from({ length: 14 }, (_, i) => tx('Food & Dining', 1000, -i)), now: NOW });
  assert.strictEqual(ok.values.monthlyExpenses, 30000);                 // 14 days × ₹1,000, scaled to a 30-day month
});

test('deriveInputs: junk and out-of-range values are dropped, dependents are capped at 3', () => {
  const d = M.deriveInputs({ income: -5, age: 17, dependents: 7, termCover: 'abc', emergencyFund: NaN, sipMonthly: 0, values: { gold: -1, epf: 'x' } });
  assert.deepStrictEqual(d.values, { dependents: 3 });
  assert.strictEqual(M.deriveInputs({ age: 81 }).values.age, undefined);
  assert.strictEqual(M.deriveInputs({ age: 18 }).values.age, 18);
});

test('deriveInputs: its spending matches what Future Loss computes from the same transactions', () => {
  const txns = [...thirtyDays('Food & Dining', 500), tx('Shopping', 3000, -20), tx('Groceries', 6000, -10), tx('EMI & Loans', 8000, -2)];
  const leak = L.compute({ txns, now: NOW, include: ['Food & Dining', 'Shopping', 'Groceries', 'EMI & Loans'] });
  const d = M.deriveInputs({ txns, now: NOW });
  const spendWithoutEmi = leak.categories.filter((c) => c.category !== 'EMI & Loans').reduce((s, c) => s + c.monthly, 0);
  assert.strictEqual(d.values.monthlyExpenses, spendWithoutEmi);
  assert.strictEqual(d.values.monthlyEmi, leak.categories.find((c) => c.category === 'EMI & Loans').monthly);
});

test('derived answers plus an age and income produce a valid score end to end', () => {
  const d = M.deriveInputs(FULL);
  const r = M.compute(d.values);
  assert.strictEqual(r.ok, true);
  assert.ok(r.score >= 0 && r.score <= 100 && JSON.stringify(r).indexOf('NaN') === -1);
});

/* ── the savings move points at the user's measured leak when there is one ────────────────────────────────── */
// Keeps 15% (target 20%). Cash is raised so 6 months of the higher spending is still covered: only the savings pillar is short.
const SAVER = { ...PERFECT, monthlyExpenses: 85000, monthlyEmi: 0, liquidSavings: 600000 };

test('savings move: without a measured leak it points at the subscription tracker, as before', () => {
  const a = M.compute(SAVER).actions[0];
  assert.strictEqual(a.id, 'savings');
  assert.strictEqual(a.href, '../html/subscription-tracker.html');
  assert.strictEqual(a.cta, 'Find the leaks');
});

test('savings move: with a measured leak it quotes the figure and points at the leak panel', () => {
  const a = M.compute(SAVER, { leakMonthly: 5400 }).actions[0];
  assert.strictEqual(a.id, 'savings');
  assert.match(a.detail, /₹5,400 a month in discretionary leaks/);
  assert.strictEqual(a.href, '../html/system-leak.html#radar-module');
  assert.strictEqual(a.cta, 'See your leak');
  assert.ok(fs.existsSync(path.resolve(__dirname, '..', 'html', a.href.split('#')[0])));
  assert.strictEqual(a.amount, M.compute(SAVER).actions[0].amount);        // the target does not change, only the advice
});

test('savings move: a missing, zero, negative or junk leak is ignored', () => {
  for (const ctx of [undefined, null, {}, { leakMonthly: 0 }, { leakMonthly: -50 }, { leakMonthly: NaN }, { leakMonthly: 'lots' }]) {
    assert.strictEqual(M.compute(SAVER, ctx).actions[0].href, '../html/subscription-tracker.html', JSON.stringify(ctx));
  }
});

test('the leak context never changes the score itself', () => {
  assert.strictEqual(M.compute(THIN, { leakMonthly: 99999 }).score, M.compute(THIN).score);
});

/* ── what-if ────────────────────────────────────────────────────────────────────────────────────────────────── */
test('leverRanges: each slider spans the person\'s own gap, in whole steps', () => {
  const r = M.leverRanges(M.compute(THIN).inputs);
  assert.deepStrictEqual(r, {
    spendLess:  { step: 500,    max: 35000 },      // half of the ₹70,000 they spend
    investMore: { step: 500,    max: 20000 },      // 20% of ₹1,00,000 income
    emiLess:    { step: 500,    max: 20000 },      // the whole EMI
    cashAdd:    { step: 10000,  max: 440000 },     // 6 × ₹90,000 outgo = ₹5.4L, has ₹1L
    termAdd:    { step: 500000, max: 12000000 },   // 10 × ₹12L annual income, has nothing
    healthAdd:  { step: 50000,  max: 750000 },     // ₹5L + ₹2.5L for one dependent
  });
  Object.values(r).forEach((x) => assert.strictEqual(x.max % x.step, 0));
});

test('leverRanges: levers that do not apply to this person have a max of 0', () => {
  const r = M.leverRanges(M.compute(PERFECT).inputs);                         // full cushion, full cover, 10% EMI
  assert.strictEqual(r.cashAdd.max, 0);
  assert.strictEqual(r.termAdd.max, 0);
  assert.strictEqual(r.healthAdd.max, 0);
  assert.strictEqual(M.leverRanges(M.compute({ ...PERFECT, monthlyEmi: 0 }).inputs).emiLess.max, 0);
  assert.strictEqual(M.leverRanges(M.compute({ ...THIN, dependents: 0 }).inputs).termAdd.max, 0);    // no dependents, no term need
});

test('whatIf golden: a full emergency cushion lifts 35 to 51, and every lever together reaches 95', () => {
  const one = M.whatIf(THIN, { cashAdd: 440000 });
  assert.deepStrictEqual([one.before, one.after, one.delta], [35, 51, 16]);       // 34.95 + 20 × (1 − 0.185) = 51.25
  assert.deepStrictEqual([one.surplusBefore, one.surplusAfter], [5000, 5000]);    // saving cash it already has changes no monthly flow
  const all = M.whatIf(THIN, { spendLess: 35000, investMore: 20000, emiLess: 20000, cashAdd: 440000, termAdd: 12000000, healthAdd: 750000 });
  assert.strictEqual(all.after, 95);                                              // 34.95 + 10 + 16.3 + 20 + 3.75 + 10
  assert.strictEqual(all.bandAfter.id, 'strong');
  const byId = Object.fromEntries(all.pillars.map((p) => [p.id, [p.before, p.after]]));
  assert.deepStrictEqual(byId.wealth, [50, 50]);                                  // investing monthly does not change what you hold today
  assert.deepStrictEqual(byId.insurance, [0, 100]);
  assert.deepStrictEqual([all.surplusBefore, all.surplusAfter], [5000, 40000]);   // 1,00,000 − 35,000 − 0 − 25,000
});

test('whatIf: no levers (or junk) changes nothing', () => {
  const base = M.compute(THIN);
  for (const lv of [undefined, null, {}, { cashAdd: 'abc', spendLess: NaN, investMore: -5, termAdd: undefined }]) {
    const w = M.whatIf(THIN, lv);
    assert.deepStrictEqual([w.before, w.after, w.delta], [base.score, base.score, 0], JSON.stringify(lv));
    assert.ok(w.pillars.every((p) => p.before === p.after));
  }
});

test('whatIf: values past the range are clamped, and spending never reaches zero', () => {
  assert.strictEqual(M.whatIf(THIN, { cashAdd: 1e12 }).after, M.whatIf(THIN, { cashAdd: 440000 }).after);
  assert.strictEqual(M.whatIf(THIN, { cashAdd: -1000 }).delta, 0);
  const cut = M.applyWhatIf(M.compute(THIN).inputs, { spendLess: 1e9 });
  assert.strictEqual(cut.monthlyExpenses, 35000);                                 // never more than half of what they spend
  assert.ok(M.applyWhatIf(M.compute({ ...THIN, monthlyExpenses: 1 }).inputs, { spendLess: 1e9 }).monthlyExpenses >= 1);
});

test('whatIf: it does not mutate the inputs it was given', () => {
  const inputs = M.compute(THIN).inputs, snapshot = JSON.stringify(inputs);
  M.applyWhatIf(inputs, { spendLess: 10000, cashAdd: 100000 });
  assert.strictEqual(JSON.stringify(inputs), snapshot);
});

test('whatIf: an overspending plan shows a negative monthly surplus so the page can warn about it', () => {
  const w = M.whatIf(THIN, { investMore: 20000 });                                // invest ₹20,000 more without cutting anything
  assert.deepStrictEqual([w.surplusBefore, w.surplusAfter], [5000, -15000]);
});

test('whatIf: no lever ever lowers the score, for any profile', () => {
  let seed = 11;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let n = 0; n < 200; n++) {
    const p = { age: 20 + Math.floor(rnd() * 55), monthlyIncome: 20000 + Math.floor(rnd() * 400000), dependents: Math.floor(rnd() * 4), highInterestDebt: rnd() < 0.3 };
    p.monthlyExpenses = 1000 + Math.floor(rnd() * p.monthlyIncome * 1.0); p.monthlyEmi = Math.floor(rnd() * p.monthlyIncome * 0.5);
    p.liquidSavings = Math.floor(rnd() * 2e6); p.monthlyInvesting = Math.floor(rnd() * p.monthlyIncome * 0.2);
    p.investedTotal = Math.floor(rnd() * 3e7); p.termCover = Math.floor(rnd() * 3e7); p.healthCover = Math.floor(rnd() * 1.5e6);
    const ranges = M.leverRanges(M.compute(p).inputs);
    const base = M.compute(p).score;
    for (const k of Object.keys(ranges)) {
      assert.ok(M.whatIf(p, { [k]: ranges[k].max }).after >= base, k + ' at its max must not lower the score: ' + JSON.stringify(p));
    }
    const everything = Object.fromEntries(Object.entries(ranges).map(([k, v]) => [k, v.max]));
    assert.ok(M.whatIf(p, everything).after >= base);
  }
});

test('whatIf: invalid answers are reported, not scored', () => {
  assert.strictEqual(M.whatIf({}, { cashAdd: 1 }).ok, false);
  assert.strictEqual(M.whatIf(null).ok, false);
});
