// The phone's Tax Planner must give the website's figures (js/finos-tax-calc.js) for the same inputs, and agree with the shared tax core.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as app from '../lib/taxPlanner.ts';
import { taxNew, taxOld } from '../lib/taxcore.ts';

const SRC = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../js/finos-tax-calc.js'), 'utf8');
function loadWeb(): any {
  const win: any = { localStorage: { getItem: () => null, setItem() {} } };
  const sandbox: any = { window: win, Math, JSON, Number, parseFloat, parseInt, console, Date, localStorage: win.localStorage, document: { getElementById: () => null } };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return win.FinosTaxCalc;
}
const web = loadWeb();
const j = (x: unknown) => JSON.parse(JSON.stringify(x));
function rng(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const R = rng(20261012);
const pick = <T,>(a: T[]) => a[Math.floor(R() * a.length)];
const maybe = (p: number, max: number) => (R() < p ? 0 : Math.round(R() * max / 100) * 100);

const rand = () => {
  const income = Math.round((R() < 0.25 ? 3e5 + R() * 6e5 : R() < 0.2 ? 5e6 + R() * 6e7 : 6e5 + R() * 4.4e6) / 1000) * 1000;
  return {
    income, basic_pct: pick([40, 50, 50, 35]), hra_received: maybe(0.3, income * 0.25), monthly_rent: maybe(0.4, 80000), city: pick(['metro', 'non_metro']),
    inv_80c: maybe(0.3, 200000), health_self: maybe(0.4, 40000), health_parent: maybe(0.5, 70000), parents_senior: R() < 0.4,
    nps_self: maybe(0.5, 80000), employer_nps: maybe(0.6, income * 0.12), home_loan_int: maybe(0.6, 300000), home_loan_pri: maybe(0.7, 100000),
    ltcg: maybe(0.6, 600000), stcg: maybe(0.7, 300000), other_ded: maybe(0.7, 60000),
  };
};

test('compute equals the website on 1,500 random taxpayers, including surcharge bands and capital gains', () => {
  let high = 0;
  for (let n = 0; n < 1500; n++) {
    const p = rand();
    if (p.income > 5e6) high++;
    assert.deepEqual(j(app.compute(p)), j(web.compute(p)), JSON.stringify(p));
  }
  assert.ok(high > 100, 'covered ' + high + ' incomes above ₹50L');
});

test('missing fields take the website defaults', () => {
  assert.deepEqual(j(app.compute({ income: 1500000 })), j(web.compute({ income: 1500000 })));
  assert.deepEqual(j(app.compute({})), j(web.compute({})));
});

test('up to ₹50L (no surcharge) the new regime equals the shared tax core on salary alone', () => {
  for (const income of [600000, 1000000, 1275000, 1400000, 2500000, 4000000]) {
    const r = app.compute({ income });
    assert.equal(Math.round(r.newRegime.income_tax), taxNew(income - 75000), 'new ' + income);
  }
});

test('old regime without deductions beyond the standard one equals the core', () => {
  for (const income of [400000, 800000, 1500000, 3000000]) {
    const r = app.compute({ income, basic_pct: 50 });
    assert.equal(Math.round(r.oldRegime.income_tax), taxOld(income - 50000), 'old ' + income);
  }
});

test('surcharge follows taxable income and the new regime tops out at 25% above ₹2Cr', () => {
  const r = app.compute({ income: 30000000 });             // ₹3Cr salary: taxable ₹2.99Cr
  assert.equal(r.newRegime.surcharge, r.newRegime.base_tax * 0.25);
  const lowTaxable = app.compute({ income: 5200000, inv_80c: 150000, home_loan_int: 200000, nps_self: 50000, health_self: 25000, other_ded: 400000 });
  assert.equal(lowTaxable.oldRegime.surcharge, 0);          // gross > ₹50L but taxable below it
});

test('the action list: 80C and NPS gaps are suggested only when the old regime is the better one', () => {
  const r = app.compute({ income: 1800000, inv_80c: 20000, hra_received: 400000, monthly_rent: 40000, home_loan_int: 200000, health_self: 25000, nps_self: 50000 });
  if (r.best === 'old') assert.ok(r.actions.some(a => a.category === '80C'));
  const poor = app.compute({ income: 900000 });
  assert.equal(poor.best, 'new');
  assert.ok(!poor.actions.some(a => a.category === '80C'));
});
