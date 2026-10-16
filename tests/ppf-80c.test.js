'use strict';
// PPF tracker "Tax" tab: 80C room left = 1.5L - (other 80C) - (this tracker's deposits).  It used to subtract the tax planner's
// whole finos_80c_used as well, and that figure already contains the planner's "PPF / NSC / 5yr FD" box, i.e. the same PPF money.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function load(store) {
  const sb = {
    console,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    document: { getElementById: () => null, addEventListener() {} },
  };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(read('js/finos-ppf-tracker.js'), sb);
  return sb.FinosPPFTracker;
}
const PPF_ACCT = (dep) => JSON.stringify([{ id: 1, type: 'PPF', nickname: 'Mine', currentBalance: 500000, annualDeposit: dep, openDate: '2015-04-01' }]);

function remainingShown(store) {
  const T = load(store);
  const c = { innerHTML: '' };
  T.renderTax(c);
  const m = c.innerHTML.match(/80C Remaining Capacity<\/div>\s*<div[^>]*>₹([\d,]+)</);
  assert.ok(m, 'remaining figure not found');
  return Number(m[1].replace(/,/g, ''));
}

test('planner total that already includes the PPF deposit is not subtracted twice', () => {
  // planner: PPF 1,00,000 entered in its PPF/NSC/FD box + ELSS 20,000 -> finos_80c_used 1,20,000
  const left = remainingShown({
    finos_ppf_portfolio: PPF_ACCT(100000), finos_80c_used: '120000', finos_80c_ppf_nsc_fd: '100000',
  });
  assert.equal(left, 30000);                      // 1.5L - 20,000 ELSS - 1,00,000 PPF
});

test('80C from the planner that is not PPF is still counted next to the tracker deposits', () => {
  const left = remainingShown({
    finos_ppf_portfolio: PPF_ACCT(50000), finos_80c_used: '70000', finos_80c_ppf_nsc_fd: '0',
  });
  assert.equal(left, 30000);                      // 1.5L - 70,000 planner (ELSS/LIC) - 50,000 PPF
});

test('older saved data without the breakdown uses the larger figure, never the sum', () => {
  const left = remainingShown({ finos_ppf_portfolio: PPF_ACCT(100000), finos_80c_used: '120000' });
  assert.equal(left, 30000);                      // max(1,20,000 ; 1,00,000)
  const none = remainingShown({ finos_ppf_portfolio: PPF_ACCT(100000) });
  assert.equal(none, 50000);                      // planner never used: only the deposits count
});

test('_remaining80c edge cases', () => {
  const T = load({});
  const r = T._remaining80c;
  assert.equal(r(0, null, 0).remaining, 150000);
  assert.equal(r(150000, '150000', 150000).remaining, 0);
  assert.equal(r('abc', 'x', 'y').remaining, 150000);
  assert.equal(r(-5, null, -9).remaining, 150000);
  assert.equal(r(200000, '0', 40000).remaining, 0);            // planner already at the cap, PPF extra: nothing left, never negative
  assert.equal(r(80000, '90000', 60000).overlap, 60000);        // overlap can never exceed the tracker deposits or the planner total
});

test('the tax planner stores its PPF/NSC/FD box separately', () => {
  const src = read('js/finos-tax-calc.js');
  assert.match(src, /finos_80c_ppf_nsc_fd/);
  assert.match(src, /inv_80c_ppf_nsc_fd:\s*parseFloat\(document\.getElementById\('tc-ppf'\)/);
});
