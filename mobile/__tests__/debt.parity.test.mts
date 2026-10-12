// The phone's debt optimizer must equal the website's js/finos-debt-optimizer.js on the same loans.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as app from '../lib/debt.ts';

const SRC = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../js/finos-debt-optimizer.js'), 'utf8');
function loadWeb(): any {
  const win: any = {};
  const sandbox: any = { window: win, Math, JSON, Number, parseFloat, parseInt, console, Date, localStorage: { getItem: () => null, setItem() {} }, document: { getElementById: () => null, querySelector: () => null } };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return win.FinosDebtOptimizer;
}
const web = loadWeb();

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
const R = rng(20261012);
const j = (x: unknown) => JSON.parse(JSON.stringify(x));          // copied: the website's objects come from another realm
const randLoans = () => Array.from({ length: 1 + Math.floor(R() * 4) }, (_, i) => {
  const balance = Math.round(20000 + R() * 6e6), rate = Math.round((6 + R() * 32) * 10) / 10;
  const emi = R() < 0.1 ? Math.round(balance * rate / 1200 * 0.8) : Math.round(app.calcEMI(balance, rate, 12 + Math.floor(R() * 240)) * (0.9 + R() * 0.5));
  return { key: ['home', 'car', 'personal', 'cc'][i], label: 'L' + i, icon: 'x', balance, rate, emi };
});

test('calcEMI and calcRemainingMonths match, including zero and invalid inputs', () => {
  for (let i = 0; i < 1500; i++) {
    const p = R() < 0.05 ? [0, -5, NaN][i % 3] : Math.round(R() * 1e7), r = R() < 0.1 ? 0 : R() * 40, t = R() < 0.05 ? 0 : 1 + Math.floor(R() * 360);
    assert.equal(app.calcEMI(p, r, t), web._calcEMI(p, r, t), `emi ${p} ${r} ${t}`);
    const emi = Math.round(R() * 100000);
    assert.equal(app.calcRemainingMonths(p, emi, r), web._calcRemainingMonths(p, emi, r), `months ${p} ${emi} ${r}`);
  }
});

test('simulatePayoff matches for both strategies on 600 random loan sets', () => {
  for (let n = 0; n < 600; n++) {
    const loans = randLoans(), extra = R() < 0.3 ? 0 : Math.round(R() * 30000);
    for (const strat of ['avalanche', 'snowball'] as const) {
      assert.deepEqual(j(app.simulatePayoff(loans, extra, strat)), j(web._simulatePayoff(loans, extra, strat)), `${n} ${strat}`);
    }
  }
});

test('calcPrepayment matches on 800 random home loans, including balances that cannot amortise', () => {
  for (let n = 0; n < 800; n++) {
    const b = Math.round(R() * 8e6), r = R() * 14, emi = Math.round(R() * 90000), x = R() < 0.3 ? 0 : Math.round(R() * 40000);
    assert.deepEqual(j(app.calcPrepayment(b, r, emi, x)), j(web._calcPrepayment(b, r, emi, x)), `${b} ${r} ${emi} ${x}`);
  }
});

test('plan() reproduces the website\'s strategy comparison and home-loan impact', () => {
  for (let n = 0; n < 200; n++) {
    const loans = randLoans(), extra = R() < 0.3 ? 0 : Math.round(R() * 30000);
    const p = app.plan(loans, extra);
    const minOnly = web._simulatePayoff(loans, 0, 'avalanche'), av = web._simulatePayoff(loans, extra, 'avalanche'), sw = web._simulatePayoff(loans, extra, 'snowball');
    assert.equal(p.avSaved, minOnly.paidOff && av.paidOff ? minOnly.totalInterest - av.totalInterest : 0);
    assert.equal(p.swSaved, minOnly.paidOff && sw.paidOff ? minOnly.totalInterest - sw.totalInterest : 0);
    assert.equal(p.avWins, av.totalInterest <= sw.totalInterest);
    const home = loans.find(l => l.key === 'home');
    if (home && extra > 0) {
      const std = web._calcPrepayment(home.balance, home.rate, home.emi, 0), prep = web._calcPrepayment(home.balance, home.rate, home.emi, extra);
      assert.equal(p.homePrepay!.interestSaved, std.paidOff && prep.paidOff ? std.interest - prep.interest : 0);
    } else assert.equal(p.homePrepay, null);
  }
});

test('hand-computed: ₹1L at 12% with a ₹10,000 EMI is cleared in 11 months, with ₹5,898 interest', () => {
  // balance * 1.01 - 10000 each month (worked out independently in Python): 11 months, ₹5,898.49 of interest.
  const r = app.simulatePayoff([{ balance: 100000, rate: 12, emi: 10000 }], 0, 'avalanche');
  assert.equal(r.months, 11);
  assert.equal(r.paidOff, true);
  assert.equal(r.totalInterest, 5898);
});

test('an EMI below the monthly interest never pays off and is reported, not hung', () => {
  const r = app.simulatePayoff([{ balance: 100000, rate: 24, emi: 1000 }], 0, 'avalanche');
  assert.equal(r.paidOff, false);
  assert.equal(r.months, 600);
  assert.equal(app.calcRemainingMonths(100000, 1000, 24), 999);
});
