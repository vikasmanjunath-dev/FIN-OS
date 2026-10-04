// Parity: the mobile ports of the tax core, Prepay-vs-Invest and Job Offer Comparer must match the website's real
// modules (js/finos-taxcore.js, finos-prepay-invest.js, finos-offer-compare.js) on random inputs, plus known golden values.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as tax from '../lib/taxcore.ts';
import * as prepay from '../lib/prepayInvest.ts';
import * as offers from '../lib/offerCompare.ts';

const req = createRequire(import.meta.url);
const webTax = req('../../js/finos-taxcore.js');
const webPrepay = req('../../js/finos-prepay-invest.js');
const webOffers = req('../../js/finos-offer-compare.js');

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
const R = rng(20261005);
const pick = <T,>(a: readonly T[]) => a[Math.floor(R() * a.length)];
const range = (lo: number, hi: number) => lo + R() * (hi - lo);
const int = (lo: number, hi: number) => Math.floor(range(lo, hi + 1));

test('tax core: new/old regime and best() match for 3000 incomes incl. rebate edges', () => {
  const edges = [0, 1, 250000, 400000, 500000, 500001, 1199999, 1200000, 1200001, 1262400, 1275000, 1275001, 2400000, 5e7, -5, NaN, Infinity];
  const incomes = [...edges, ...Array.from({ length: 3000 }, () => Math.round(range(0, 6e6)))];
  for (const x of incomes) {
    assert.equal(tax.taxNew(x), webTax.taxNew(x), `taxNew ${x}`);
    assert.equal(tax.taxOld(x), webTax.taxOld(x), `taxOld ${x}`);
    const y = Math.round(range(0, 6e6));
    assert.deepEqual(tax.best(x, y), webTax.best(x, y), `best ${x} ${y}`);
  }
  // 87A: nil to ₹12L, marginal relief just above it (never more than the income over ₹12L, plus cess)
  assert.equal(tax.taxNew(1_200_000), 0);
  assert.equal(tax.taxNew(1_200_001), Math.round(1 * 1.04));
});

function randPrepay() {
  return {
    loan: pick([0, 500000, 2500000, 5000000, 12000000, Math.round(range(1e5, 5e7))]),
    rate: pick([0, 6.5, 8.5, 9.25, Math.round(range(5, 16) * 20) / 20, 55]),
    years: pick([1, 5, 12, 20, 30, 41, 0, int(1, 30)]),
    monthly: pick([0, 5000, 20000, 150000, int(0, 300000)]),
    lump: pick([0, 0, 100000, 2500000, 9e7, int(0, 5e6)]),
    ret: pick([0, 3, 7, 12, 18, 70, Math.round(range(3, 20) * 2) / 2]),
    invType: pick(['equity', 'debt', 'weird'] as const),
    slab: pick([0, 5, 10, 20, 30, 60]),
    claim24b: pick([true, false]),
  } as any;
}

test('prepay vs invest: simulate and breakEven match for 400 random scenarios', () => {
  for (let i = 0; i < 400; i++) {
    const p = randPrepay();
    assert.deepEqual(prepay.simulate(p), webPrepay.simulate(p), JSON.stringify(p));
    if (i % 4 === 0) assert.equal(prepay.breakEven(p), webPrepay.breakEven(p), `breakEven ${JSON.stringify(p)}`);
  }
  assert.equal(prepay.emi(5e6, 8.5, 240), webPrepay.emi(5e6, 8.5, 240));
  assert.equal(prepay.emi(1e6, 0, 120), webPrepay.emi(1e6, 0, 120));
});

test('prepay vs invest: golden values from an independent Python implementation', () => {
  const r = prepay.simulate({ loan: 5_000_000, rate: 8.5, years: 20, monthly: 20_000, lump: 0, ret: 12, invType: 'equity', slab: 0, claim24b: false });
  assert.ok(r.valid);
  if (!r.valid) return;
  assert.equal(Math.round(r.finalA), 14_697_823);
  assert.equal(Math.round(r.finalB), 18_025_424);
  assert.equal(r.closeMonthA, 116);
  assert.equal(r.winner, 'invest');
  // invalid inputs are reported, not thrown
  assert.deepEqual(prepay.simulate({ loan: 0, monthly: 1000 }), { valid: false, reason: 'loan' });
  assert.deepEqual(prepay.simulate({ loan: 1e6, monthly: 0, lump: 0 }), { valid: false, reason: 'surplus' });
});

function randOffer(i: number) {
  const ctc = pick([0, 600000, 1800000, 2000000, 4500000, 9000000, Math.round(range(2e5, 1.5e7))]);
  return {
    name: pick(['Acme', 'Globex', '', '  ', 'Initech']) + (i % 2 ? ' ' + i : ''),
    ctc,
    variable: pick([0, 0, 300000, ctc * 0.2, ctc * 2]),
    payout: pick([0, 50, 80, 100, 150, 400]),
    basicPct: pick([0, 25, 40, 50, 100, 300]),
    pfBasis: pick(['actual', 'ceiling', 'x']),
    npsPct: pick([0, 5, 10, 14, 30]),
    joiningBonus: pick([0, 100000, 500000]),
    hike: pick([0, 8, 12, 80]),
  } as any;
}

test('job offer comparer: evaluate and compare match for 300 random offers / 150 random comparisons', () => {
  for (let i = 0; i < 300; i++) {
    const o = randOffer(i);
    const opts = pick([undefined, { years: 3 }, { years: 10, oldDeductions: 300000 }, { years: 99, oldDeductions: -5, profTax: 0 }] as const);
    assert.deepEqual(offers.evaluate(o, opts as any), webOffers.evaluate(o, opts), JSON.stringify(o));
  }
  for (let n = 0; n < 150; n++) {
    const list = Array.from({ length: int(0, 4) }, (_, i) => randOffer(i));
    const opts = pick([undefined, { years: 4, oldDeductions: 200000 }] as const);
    assert.deepEqual(offers.compare(list, opts as any), webOffers.compare(list, opts), `compare ${n}`);
  }
});

test('job offer comparer: a variable-heavy offer can win total value but lose monthly cash', () => {
  const a = { name: 'Fixed', ctc: 1_800_000, variable: 0, hike: 8 };
  const b = { name: 'Variable', ctc: 2_000_000, variable: 300_000, payout: 80, pfBasis: 'ceiling', joiningBonus: 100_000, hike: 8 };
  const c = offers.compare([a, b]);
  assert.equal(c.results.length, 2);
  assert.ok(c.gapMonthly >= 0 && c.gapTotal >= 0);
  assert.deepEqual(c, webOffers.compare([a, b]));
  // zero-CTC offers are dropped, not scored
  assert.equal(offers.compare([{ name: 'empty', ctc: 0 }]).results.length, 0);
});
