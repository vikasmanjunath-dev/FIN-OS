// The phone's windfall allocation and bonus-tax figures must equal the website's js/finos-windfall.js for the same facts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as app from '../lib/windfall.ts';

const SRC = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../js/finos-windfall.js'), 'utf8');
// The page reads window.FinosTaxCore (one tax core for every page), so the sandbox loads that file first, as the HTML does.
const TAXCORE = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../js/finos-taxcore.js'), 'utf8');
const store: Record<string, string> = {};
function loadWeb(): any {
  const win: any = {};
  const ls = { getItem: (k: string) => (k in store ? store[k] : null), setItem: (k: string, v: unknown) => { store[k] = String(v); } };
  const sandbox: any = { window: win, Math, JSON, Number, parseFloat, parseInt, String, console, Date, localStorage: ls, document: { getElementById: () => null } };
  vm.createContext(sandbox);
  vm.runInContext(TAXCORE, sandbox);
  vm.runInContext(SRC, sandbox);
  return win.FinosWindfall;
}
const web = loadWeb();
function rng(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const R = rng(20261012);
const maybe = (p: number, max: number) => (R() < p ? 0 : Math.round(R() * max / 100) * 100);

function seed(c: app.WindfallContext) {
  Object.keys(store).forEach(k => delete store[k]);
  const put = (k: string, v: number) => { if (v) store[k] = String(v); };
  put('finos_monthly_expense', c.monthlyExpense); put('finos_emergency_fund', c.efCurrent); put('finos_80c_gap', c.c80cGap);
  put('finos_credit_card_debt', c.creditDebt); put('finos_personal_loan', c.personalLoan); put('finos_home_loan_outstanding', c.homeLoanOut);
  put('finos_goals_total_sip', c.goalsSip); put('finos_home_loan_emi', c.homeEmi);
}

test('the waterfall equals the website on 1,000 random households', () => {
  for (let n = 0; n < 1000; n++) {
    const ctx: app.WindfallContext = {
      monthlyExpense: maybe(0.2, 150000), efCurrent: maybe(0.3, 900000), c80cGap: maybe(0.4, 150000), creditDebt: maybe(0.6, 300000),
      personalLoan: maybe(0.6, 800000), homeLoanOut: maybe(0.5, 9000000), goalsSip: maybe(0.7, 40000), homeEmi: maybe(0.5, 90000),
    };
    const amount = Math.round((10000 + R() * 5e6) / 1000) * 1000;
    seed(ctx);
    const theirs = web._allocate(amount);
    const mine = app.allocate(amount, ctx);
    assert.deepEqual(mine.allocated.map(s => [s.id, s.allocated, s.remaining]), JSON.parse(JSON.stringify(theirs.allocated.map((s: any) => [s.id, s.allocated, s.remaining]))), JSON.stringify([amount, ctx]));
    assert.equal(mine.totalAllocated, theirs.totalAllocated);
    assert.equal(mine.remaining, theirs.remaining);
    assert.equal(store.finos_windfall_allocated, String(theirs.totalAllocated));
  }
});

test('everything entered is placed: allocated equals the amount', () => {
  const ctx = { monthlyExpense: 60000, efCurrent: 100000, c80cGap: 150000, creditDebt: 40000, personalLoan: 0, homeLoanOut: 4000000, goalsSip: 0, homeEmi: 30000 };
  const a = app.allocate(800000, ctx);
  assert.equal(a.totalAllocated + a.remaining, 800000);
  assert.equal(a.allocated[0].id, 'ef');
  assert.equal(a.allocated[0].allocated, 260000);              // 6 × 60,000 − 100,000
});

test('an unknown monthly expense is flagged as assumed (the website silently used ₹50,000)', () => {
  const a = app.allocate(100000, { monthlyExpense: 0, efCurrent: 0, c80cGap: 0, creditDebt: 0, personalLoan: 0, homeLoanOut: 0, goalsSip: 0, homeEmi: 0 });
  assert.equal(a.assumedExpense, true);
  assert.equal(a.efTarget, 300000);
});

test('bonus tax impact equals new-regime tax before and after, and non-salary windfalls add none', () => {
  const t = app.taxImpact('bonus', 500000, 1500000, 0, 600000);
  assert.equal(t.taxableIncome, 1425000);
  assert.equal(t.before, 1425000 > 1200000 ? Math.round(Math.min(0.05 * 400000 + 0.10 * 400000 + 0.15 * 225000 - 0, 1425000 - 1200000) * 1.04) : 0);
  assert.ok(t.onWindfall > 0 && t.after > t.before);
  assert.equal(app.taxImpact('inheritance', 500000, 1500000, 0, 600000).onWindfall, 0);
});

test('the bonus tax figures equal what the website prints', () => {
  for (const [salary, bonus, type] of [[1500000, 500000, 'bonus'], [900000, 300000, 'rsu'], [2600000, 1000000, 'bonus'], [1100000, 200000, 'inheritance']] as const) {
    Object.keys(store).forEach(k => delete store[k]);
    store.finos_salary_basic = String(salary); store.finos_windfall_amount = String(bonus); store.finos_windfall_type = type;
    const box: any = { innerHTML: '' };
    web.renderTax(box);
    const nums = [...box.innerHTML.matchAll(/font-size:18px;font-weight:900;color:[^"]*">₹([\d,]+)<\/div>/g)].map(m => parseInt(m[1].replace(/,/g, ''), 10));
    const t = app.taxImpact(type, bonus, salary, 0, salary);
    if (type === 'bonus' || type === 'rsu') assert.deepEqual(nums, [t.before, t.after, t.onWindfall], type + salary);
  }
});
