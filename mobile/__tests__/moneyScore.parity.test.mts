// The app's Money Score (lib/moneyScore.ts) must agree with the website's js/finos-money-score.js on every input:
// same score, same pillars, same ranked next moves, same what-if, same prefill.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as app from '@/lib/moneyScore';

const web = createRequire(import.meta.url)('../../js/finos-money-score.js');

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
const R = rng(20261013);
const pick = <T,>(a: readonly T[]) => a[Math.floor(R() * a.length)];
const int = (lo: number, hi: number) => lo + Math.floor(R() * (hi - lo + 1));

function randRaw(): any {
  const income = R() < 0.1 ? pick([0, -5, 'abc']) : pick([25000, 45000, 75000, 120000, 300000, int(15000, 400000)]);
  return {
    age: R() < 0.1 ? pick([17, 90, '']) : pick([22, 28, 35, 45, 58, 70, '34']),
    dependents: pick([0, 0, 1, 2, 3, 5, 12, '', '2']),
    monthlyIncome: income,
    monthlyExpenses: R() < 0.1 ? pick([0, '']) : pick([8000, 20000, 35000, 60000, int(5000, 250000)]),
    monthlyEmi: pick([0, 0, 5000, 18000, 40000, '', -1, int(0, 80000)]),
    monthlyInvesting: pick([0, 2000, 10000, 25000, '', int(0, 60000)]),
    liquidSavings: pick([0, 20000, 150000, 600000, int(0, 2e6)]),
    investedTotal: pick([0, 100000, 500000, 2e6, 8e6, int(0, 3e7)]),
    termCover: pick([0, 0, 5e6, 1e7, 3e7, int(0, 5e7)]),
    healthCover: pick([0, 3e5, 5e5, 1e6, 2.5e6]),
    highInterestDebt: pick([true, false, false, 'yes', '0', 1]),
  };
}

test('normalize and compute: identical score, band, pillars and ranked moves on 1,500 random inputs', () => {
  let ok = 0, rejected = 0;
  for (let i = 0; i < 1500; i++) {
    const raw = randRaw();
    const ctx = pick([undefined, { leakMonthly: 0 }, { leakMonthly: int(500, 20000) }]);
    assert.deepEqual(app.normalize(raw), web.normalize(raw), `normalize ${i}`);
    const a = app.compute(raw, ctx), w = web.compute(raw, ctx);
    assert.deepEqual(a, w, `compute ${i} ${JSON.stringify(raw)}`);
    a.ok ? ok++ : rejected++;
  }
  assert.ok(ok > 800 && rejected > 50, `a useful mix of valid (${ok}) and rejected (${rejected}) inputs`);
});

test('whatIf, leverRanges, benchmark, history and trend match', () => {
  for (let i = 0; i < 300; i++) {
    const raw = randRaw();
    const n = web.normalize(raw);
    if (n.errors.length) continue;
    assert.deepEqual(app.leverRanges(n.inputs), web.leverRanges(n.inputs));
    const levers = Object.fromEntries(['spendLess', 'investMore', 'emiLess', 'cashAdd', 'termAdd', 'healthAdd'].map(k => [k, pick([0, 500, 2500, 10000, 500000])]));
    assert.deepEqual(app.whatIf(raw, levers), web.whatIf(raw, levers), `whatIf ${i}`);
  }
  for (const age of [15, 22, 25, 30, 37, 44, 50, 61, 65, 80]) assert.equal(app.benchmarkMultiple(age), web.benchmarkMultiple(age));
  let ha: any[] = [], hw: any[] = [];
  for (let d = 1; d <= 30; d++) {
    const e = { date: `2026-09-${String(Math.min(d, 28)).padStart(2, '0')}`, score: int(20, 90) };
    ha = app.appendHistory(ha, e); hw = web.appendHistory(hw, e);
  }
  assert.deepEqual(ha, hw);
  assert.deepEqual(app.trend(ha), web.trend(hw));
});

test('deriveInputs: prefill from tracked data matches, and never invents numbers', () => {
  const now = new Date(2026, 9, 12, 12);
  for (let i = 0; i < 200; i++) {
    const cats = ['Food & Dining', 'Transport', 'Housing', 'EMI & Loans', 'Shopping', 'Bills & Utilities'];
    const txns = Array.from({ length: int(0, 60) }, (_, k) => ({
      id: `t${k}`, kind: pick(['expense', 'expense', 'income', 'saving']), amount: int(50, 30000), category: pick(cats),
      date: `2026-${pick(['08', '09', '10'])}-${String(int(1, 28)).padStart(2, '0')}`,
    }));
    const data = {
      income: pick([0, 60000, 90000]), age: pick([0, 17, 33, 52]), dependents: pick([0, 1, 4]), termCover: pick([0, 5e6]),
      emergencyFund: pick([0, 200000]), sipMonthly: pick([0, 15000]), txns, now,
      values: { portfolio: pick([0, 1e5]), mfImport: pick([0, 3e5]), sip: pick([0, 2e5]), epf: pick([0, 4e5]), ppf: pick([0, 1e5]), nps: pick([0, 5e4]), gold: pick([0, 3e4]) },
    };
    assert.deepEqual(app.deriveInputs(data), web.deriveInputs(data), `derive ${i}`);
  }
  // under 14 days of history is not scaled up into a monthly figure
  const few = app.deriveInputs({ txns: [{ kind: 'expense', amount: 9000, category: 'Food & Dining', date: '2026-10-11' }], now: new Date(2026, 9, 12) });
  assert.equal(few.values.monthlyExpenses, undefined);
});

test('worked example: keeping nothing scores 0 on savings, six months of cover scores 100 on emergency', () => {
  // ₹60k income, ₹60k spend → keeps nothing; ₹3.6L liquid = 6 months of spending; no dependents.
  const r = app.compute({ age: 30, monthlyIncome: 60000, monthlyExpenses: 60000, monthlyEmi: 0, liquidSavings: 360000, monthlyInvesting: 0, investedTotal: 0, termCover: 0, healthCover: 0, dependents: 0 });
  assert.equal(r.ok, true);
  const by = Object.fromEntries(r.pillars.map((p: any) => [p.id, p.score]));
  assert.equal(by.savings, 0);
  assert.equal(by.emergency, 100);
  assert.ok(r.score >= 0 && r.score <= 100);
  assert.equal(app.compute({ age: 30, monthlyIncome: 60000, monthlyExpenses: 0 }).ok, false);   // blank spending must not flatter the score
});
