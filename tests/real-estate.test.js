'use strict';
// js/finos-real-estate.js — buy vs rent, true cost, rental yield.
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/finos-real-estate.js');

const ZERO = { loanRate: 0, investRet: 0, appreciation: 0, rentInc: 0, maintInc: 0, buyCostPct: 0, sellCostPct: 0, saleTaxPct: 0, maintenance: 0 };

test('EMI: no loan is zero, a 0% loan is principal / months, otherwise the standard formula', () => {
  assert.equal(R.emiOf(0, 8.5, 240), 0);
  assert.equal(R.emiOf(1200000, 0, 240), 5000);
  assert.ok(Math.abs(R.emiOf(6400000, 8.5, 240) - 55541.4) < 1);          // ₹64 L at 8.5% for 20 years
});

test('buy vs rent, hand-worked: a 0% loan, no growth, no costs, rent equal to the EMI: the buyer ends owning the home', () => {
  const r = R.buyVsRent({ ...ZERO, price: 1200000, downPct: 0, tenure: 20, rent: 5000, years: 20 });
  assert.equal(r.emi, 5000);
  assert.equal(r.loanBalance < 1e-6, true);
  assert.equal(Math.round(r.buyNetWorth), 1200000);            // property, no loan, no corpus
  assert.equal(Math.round(r.rentCorpus), 0);                   // paid the same cash as rent, saved nothing
  assert.equal(r.buyWins, true);
  assert.equal(r.breakEven > 0, true);
});

test('whoever pays less invests the difference: cheaper rent builds the renter\'s corpus, dearer rent builds the buyer\'s', () => {
  const cheapRent = R.buyVsRent({ ...ZERO, price: 1200000, downPct: 0, tenure: 20, rent: 3000, years: 20 });
  assert.equal(Math.round(cheapRent.rentCorpus), 2000 * 240);                       // 2,000 a month for 240 months, 0% return
  const dearRent = R.buyVsRent({ ...ZERO, price: 1200000, downPct: 0, tenure: 20, rent: 8000, years: 20 });
  assert.equal(Math.round(dearRent.buyNetWorth), 1200000 + 3000 * 240);             // the buyer saves 3,000 a month
  assert.equal(Math.round(dearRent.rentCorpus), 0);
});

test('after the loan is repaid the buyer\'s outflow falls to upkeep, and the saving is the buyer\'s', () => {
  // 10-year loan inside a 20-year horizon: months 121-240 the buyer pays only maintenance.
  const r = R.buyVsRent({ ...ZERO, price: 1200000, downPct: 0, tenure: 10, rent: 10000, maintenance: 1000, years: 20 });
  // EMI = 10,000. Years 1-10: buyer pays 11,000 vs rent 10,000 -> renter invests 1,000 x 120.
  // Years 11-20: buyer pays 1,000 vs rent 10,000 -> buyer invests 9,000 x 120.
  assert.equal(Math.round(r.rentCorpus), 1000 * 120);
  assert.equal(Math.round(r.buyNetWorth), 1200000 + 9000 * 120);
});

test('upfront costs: the renter invests what the buyer spends on stamp duty and registration', () => {
  const r = R.buyVsRent({ ...ZERO, price: 1000000, downPct: 20, buyCostPct: 7, tenure: 20, years: 1, rent: 0, maintenance: 0 });
  assert.equal(Math.round(r.upfront), 270000);                  // 20% down + 7% costs
  assert.ok(r.rentCorpus >= 270000);
});

test('selling cost and capital-gains tax come off the property value at the end', () => {
  const base = { ...ZERO, price: 1000000, downPct: 100, appreciation: 10, years: 2, rent: 0, maintenance: 0 };
  const plain = R.buyVsRent(base);
  assert.equal(Math.round(plain.buyNetWorth), 1210000);
  const costly = R.buyVsRent({ ...base, sellCostPct: 2, saleTaxPct: 12.5 });
  const net = 1210000 * 0.98;
  assert.equal(Math.round(costly.buyNetWorth), Math.round(net - (net - 1000000) * 0.125));
});

test('break-even is the first year from which buying stays ahead, consistent with the yearly series', () => {
  for (const app of [4, 6, 9]) {
    const r = R.buyVsRent({ appreciation: app });
    if (r.breakEven > 0) {
      for (let k = r.breakEven - 1; k < r.years; k++) assert.ok(r.buyByYear[k] >= r.rentByYear[k]);
      if (r.breakEven > 1) assert.ok(r.buyByYear[r.breakEven - 2] < r.rentByYear[r.breakEven - 2]);
    } else {
      assert.ok(r.buyByYear[r.years - 1] < r.rentByYear[r.years - 1]);
    }
    assert.equal(r.buyWins, r.buyByYear[r.years - 1] > r.rentByYear[r.years - 1]);
  }
});

test('tax benefit is tax saved (deduction x bracket x 1.04), only when claimed, and capped at 2 L interest + 1.5 L principal', () => {
  assert.ok(Math.abs(R.taxSaved(300000, 200000, 30) - (200000 + 150000) * 0.30 * 1.04) < 1e-6);
  assert.equal(R.taxSaved(0, 0, 30), 0);
  const without = R.buyVsRent({});
  const withTax = R.buyVsRent({ claimTax: true, bracketPct: 30 });
  assert.equal(without.taxBenefits, 0);
  assert.ok(withTax.taxBenefits > 0 && withTax.buyNetWorth > without.buyNetWorth);
  assert.equal(R.buyVsRent({ claimTax: true, downPct: 100 }).taxBenefits, 0);          // no loan, no deduction
});

test('true cost adds stamp duty, registration, GST, processing and furnishing to the price', () => {
  const t = R.trueCost({ price: 8000000, stampPct: 6, regPct: 1, gstPct: 5, loan: 6400000, procPct: 0.5, furnish: 500000, maintYear: 60000, years: 20 });
  assert.equal(t.stamp, 480000);
  assert.equal(t.reg, 80000);
  assert.equal(t.gst, 400000);
  assert.equal(t.proc, 32000);
  assert.equal(t.total, 8000000 + 480000 + 80000 + 400000 + 32000 + 500000);
  assert.equal(t.totalWithMaintenance, t.total + 1200000);
  assert.ok(Math.abs(t.premiumPct - (t.total / 8000000 - 1) * 100) < 1e-9);
});

test('rental yield: gross, net, cash flow, and property (value + net rent) against equity', () => {
  const y = R.rentalYield({ price: 5000000, rent: 18000, costsYear: 40000, emi: 0, appreciation: 6, years: 10, equity: 13 });
  assert.ok(Math.abs(y.grossYield - 4.32) < 1e-9);
  assert.ok(Math.abs(y.netYield - 3.52) < 1e-9);
  assert.ok(Math.abs(y.cashflow - (18000 - 40000 / 12)) < 1e-9);
  assert.equal(y.netRent, (18000 * 12 - 40000) * 10);
  assert.ok(Math.abs(y.propertyTotal - (5000000 * Math.pow(1.06, 10) + y.netRent)) < 1e-6);
  assert.equal(y.propertyWins, y.propertyTotal > y.equityValue);
  const z = R.rentalYield({ price: 0 });
  assert.equal(z.grossYield, 0);
});

test('bad input does not produce NaN', () => {
  const r = R.buyVsRent({ price: 'abc', rent: null });
  for (const k of ['emi', 'buyNetWorth', 'rentCorpus', 'propertyValue']) assert.ok(Number.isFinite(r[k]), k);
});
