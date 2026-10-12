// The phone's home-loan maths must equal the website's js/finos-home-loan.js on the same loan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as app from '../lib/homeLoan.ts';

const SRC = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../js/finos-home-loan.js'), 'utf8');
const store: Record<string, string> = {};
function loadWeb(): any {
  const win: any = {};
  const ls = { getItem: (k: string) => (k in store ? store[k] : null), setItem: (k: string, v: unknown) => { store[k] = String(v); } };
  const sandbox: any = { window: win, Math, JSON, Number, parseFloat, parseInt, console, Date, localStorage: ls, document: { getElementById: () => null } };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return win.FinosHomeLoan;
}
const web = loadWeb();
const j = (x: unknown) => JSON.parse(JSON.stringify(x));
function rng(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const R = rng(20261012);

const rand = (): app.HomeLoanParams => {
  const loanAmount = Math.round((1e5 + R() * 1.5e7) / 1000) * 1000;
  const monthlyIncome = R() < 0.1 ? 0 : Math.round(20000 + R() * 600000);
  return {
    loanAmount, interestRate: R() < 0.08 ? 0 : Math.round((5 + R() * 14) * 100) / 100, tenureYears: 1 + Math.floor(R() * 30),
    prepayAmount: Math.round(R() * 2e6 / 1000) * 1000, prepayYear: 1 + Math.floor(R() * 32),
    grossIncome: monthlyIncome * 12, monthlyIncome,
  };
};

test('compute matches the website on 1,200 random loans (EMI, schedule, affordability, deductions, prepayment)', () => {
  for (let n = 0; n < 1200; n++) {
    const p = rand();
    const w = j(web._compute(p));
    const a = j(app.compute(p));
    assert.deepEqual(a.sched, w.sched, 'schedule ' + JSON.stringify(p));
    for (const k of ['emi', 'affordable', 'maxAffordEMI', 'maxAffordLoan', 'sec24bDeduct', 'sec80cDeduct', 'totalTaxDeduct', 'yr1Int', 'yr1Prin', 'prepay', 'totalCost']) {
      assert.deepEqual(a[k], w[k], `${k} ${JSON.stringify(p)}`);
    }
    // the website keeps emiPct as a one-decimal string, "—" when there is no income
    assert.equal(a.emiPct, w.emiPct === '—' ? null : parseFloat(w.emiPct), 'emiPct ' + JSON.stringify(p));
  }
});

test('prepayImpact and the four scenario rows match', () => {
  for (let n = 0; n < 300; n++) {
    const p = rand();
    assert.deepEqual(j(app.prepayImpact(p.loanAmount, p.interestRate, p.tenureYears, p.prepayAmount, p.prepayYear)),
      j(web._prepayImpact(p.loanAmount, p.interestRate, p.tenureYears, p.prepayAmount, p.prepayYear)));
    const rows = app.prepayScenarios(p);
    rows.forEach(r => assert.deepEqual(j({ newTenureMonths: r.newTenureMonths, savedMonths: r.savedMonths, savedInterest: r.savedInterest, newTotalInt: r.newTotalInt }),
      j(web._prepayImpact(p.loanAmount, p.interestRate, p.tenureYears, r.amount, 3))));
  }
});

test('the figures the website saves for other pages are the same numbers', () => {
  const p: app.HomeLoanParams = { loanAmount: 4500000, interestRate: 8.5, tenureYears: 25, prepayAmount: 100000, prepayYear: 5, grossIncome: 1800000, monthlyIncome: 150000 };
  Object.keys(store).forEach(k => delete store[k]);
  web._compute(p);
  const c = app.compute(p);
  assert.equal(store.finos_home_loan_emi, String(c.emi));
  assert.equal(store.finos_home_loan_total_interest, String(c.sched.totalInterest));
});

test('hand-computed: ₹10L at 12% for 1 year is an EMI of ₹88,849 and ₹66,188 interest over 12 payments', () => {
  const s = app.amortise(1000000, 12, 1);
  assert.equal(s.emi, 88849);
  assert.ok(Math.abs(s.totalInterest - 66188) <= 12);      // the EMI is rounded to the rupee, so the total can differ by a few rupees
  assert.equal(s.yearly.length, 1);
  assert.equal(s.yearly[0].balance, 0);
});

test('a 0% loan is principal / months with no interest', () => {
  const s = app.amortise(1200000, 0, 10);
  assert.equal(s.emi, 10000);
  assert.equal(s.totalInterest, 0);
});

test('affordability: EMI above 40% of income is flagged, no income gives no percentage', () => {
  const base = { loanAmount: 5000000, interestRate: 8.75, tenureYears: 20, prepayAmount: 0, prepayYear: 3 };
  const tight = app.compute({ ...base, grossIncome: 1200000, monthlyIncome: 100000 });
  assert.equal(tight.affordable, false);
  assert.equal(tight.emiPct, 44.2);
  const none = app.compute({ ...base, grossIncome: 0, monthlyIncome: 0 });
  assert.equal(none.emiPct, null);
  assert.equal(none.affordable, false);
});

test('sanitise keeps values in range and falls back for blanks', () => {
  assert.deepEqual(app.sanitise({}), app.HL_DEFAULTS);
  const s = app.sanitise({ loanAmount: 5, interestRate: 99, tenureYears: 99, prepayYear: 99, prepayAmount: -5 });
  assert.equal(s.loanAmount, 10000);
  assert.equal(s.interestRate, 30);
  assert.equal(s.tenureYears, 40);
  assert.equal(s.prepayYear, 39);
  assert.equal(s.prepayAmount, 0);
});
