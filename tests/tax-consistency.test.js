// Three places on the site compute income tax. They must agree with the shared core (js/finos-taxcore.js).
// ITR summary and the salary optimizer are browser IIFEs, so their tax functions are lifted out of the source text.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const T = require('../js/finos-taxcore.js');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');

/** Source of the brace-delimited block that starts at `header`. */
function block(src, header) {
  const i = src.indexOf(header);
  assert.ok(i >= 0, 'not found: ' + header);
  let j = src.indexOf('{', i), depth = 0;
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) break;
  }
  return src.slice(i, j + 1);
}

const itr = read('finos-itr-summary.js');
const itrNew = new Function(block(itr, 'function _taxNew(income)') + '; return _taxNew;')();
const itrOld = new Function(block(itr, 'function _taxOld(income)') + '; return _taxOld;')();
const sal = read('finos-salary-optimizer.js');
const salTax = new Function('return ' + block(sal, 'const _tax = (income, isNew) =>').replace('const _tax = ', ''))();

const GRID = [];
for (let x = 0; x <= 6000000; x += 25000) GRID.push(x);
[399999, 400001, 499999, 500001, 799999, 1199999, 1200000, 1200001, 1210000, 1275000, 1276923, 1276924, 1300000, 2400001].forEach((x) => GRID.push(x));

test('ITR summary: new-regime tax equals the shared core at every income (incl. the ₹12L rebate edge)', () => {
  GRID.forEach((x) => assert.strictEqual(itrNew(x), T.taxNew(x), 'income ' + x));
});

test('ITR summary: old-regime tax equals the shared core', () => {
  GRID.forEach((x) => assert.strictEqual(itrOld(x), T.taxOld(x), 'income ' + x));
});

test('salary optimizer: slab tax (× 1.04 cess) equals the shared core for both regimes', () => {
  GRID.forEach((x) => {
    assert.strictEqual(Math.round(salTax(x, true) * 1.04), T.taxNew(x), 'new regime, income ' + x);
    assert.strictEqual(Math.round(salTax(x, false) * 1.04), T.taxOld(x), 'old regime, income ' + x);
  });
});

test('regression: a ₹10L taxable salary pays no tax under the new regime (the ITR page used to charge ₹60,000+)', () => {
  assert.strictEqual(itrNew(1000000), 0);
  assert.strictEqual(Math.round(salTax(1000000, true) * 1.04), 0);
});

test('no cliff: earning ₹1 more never raises tax by more than ₹2 near the rebate limit', () => {
  for (let x = 1195000; x < 1290000; x += 1000) {
    assert.ok(T.taxNew(x + 1) - T.taxNew(x) <= 2, 'cliff at ' + x);
    assert.ok(itrNew(x + 1) - itrNew(x) <= 2, 'ITR cliff at ' + x);
  }
});

// ── The Tax Planner (js/finos-tax-calc.js, a different module on tax.html) must agree with the core too ──
test('Tax Planner (finos-tax-calc.js): new-regime income tax equals the core for incomes up to ₹50L (no surcharge), incl. the ₹12L edge', () => {
  globalThis.window = globalThis;
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  delete require.cache[require.resolve('../js/finos-tax-calc.js')];
  require('../js/finos-tax-calc.js');
  const planner = globalThis.FinosTaxCalc;                    // note: a different global from the core's FinosTaxCore
  for (let income = 0; income <= 5000000; income += 25000) {
    const r = planner.compute({ income });
    assert.strictEqual(Math.round(r.newRegime.income_tax), T.taxNew(income - T.STD_NEW), 'new regime, income ' + income);
  }
  for (const income of [1275000, 1275001, 1275100, 1280000]) {
    const r = planner.compute({ income });
    assert.strictEqual(Math.round(r.newRegime.income_tax), T.taxNew(income - T.STD_NEW), 'edge ' + income);
  }
  delete globalThis.window; delete globalThis.localStorage; delete globalThis.FinosTaxCalc;
});

test('the core and the Tax Planner use different globals so both can load on tax.html', () => {
  assert.notStrictEqual('FinosTaxCore', 'FinosTaxCalc');
  const src = read('finos-tax-calc.js');
  assert.ok(/global\.FinosTaxCalc\s*=/.test(src));
  assert.ok(!/FinosTaxCalc/.test(read('finos-taxcore.js')));
});
