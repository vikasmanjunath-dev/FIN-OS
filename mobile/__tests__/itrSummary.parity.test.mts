// The phone's ITR summary must equal the website's js/finos-itr-summary.js _compute() for the same stored figures and the same day.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compute } from '../lib/itrSummary.ts';
import { taxNew, taxOld } from '../lib/taxcore.ts';

const SRC = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../js/finos-itr-summary.js'), 'utf8');
const NOW = new Date(2026, 9, 12).getTime();
const store: Record<string, string> = {};
function loadWeb(): any {
  const win: any = {};
  const ls = { getItem: (k: string) => (k in store ? store[k] : null), setItem: (k: string, v: unknown) => { store[k] = String(v); } };
  class FakeDate extends Date { constructor(...a: any[]) { if (a.length === 0) super(NOW); else super(...(a as [any])); } static now() { return NOW; } }
  const sandbox: any = { window: win, Math, JSON, Number, parseFloat, parseInt, String, Object, Array, console, Date: FakeDate, localStorage: ls, document: { getElementById: () => null } };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return win.FinosITRSummary;
}
const web = loadWeb();
const j = (x: unknown) => JSON.parse(JSON.stringify(x));
function rng(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const R = rng(20261012);
const KEYS = ['finos_salary_basic', 'finos_salary_hra_received', 'finos_salary_lta', 'finos_salary_special', 'finos_gross_salary', 'finos_salary_ctc', 'finos_hra_received', 'finos_rent_paid',
  'finos_passive_rental_annual', 'finos_fd_interest_annual', 'finos_passive_dividend_annual', 'finos_other_income_annual', 'finos_epf_employee_annual', 'finos_ppf_80c', 'finos_elss_invested',
  'finos_lic_premium_annual', 'finos_nps_employee_annual', 'finos_nps_emp_monthly', 'finos_home_loan_principal_annual', 'finos_ssy_annual', 'finos_school_fees_annual', 'finos_nps_employer_annual',
  'finos_nps_er_monthly', 'finos_salary_nps_er', 'finos_health_ins_premium', 'finos_health_ins_parent_premium', 'finos_home_loan_interest_annual', 'finos_edu_loan_interest_annual',
  'finos_savings_interest_annual', 'finos_tds_salary_annual', 'finos_tds_bank_annual', 'finos_salary_hra_exempt'];

test('every figure equals the website on 800 random sets of stored values', () => {
  for (let n = 0; n < 800; n++) {
    Object.keys(store).forEach(k => delete store[k]);
    const basic = R() < 0.15 ? 0 : Math.round(R() * 2.5e6 / 1000) * 1000;
    for (const k of KEYS) {
      if (R() < 0.5) continue;
      let v = Math.round(R() * 3e5 / 100) * 100;
      if (k === 'finos_salary_basic') v = basic;
      if (k === 'finos_salary_special') v = Math.round(R() * 2e6 / 1000) * 1000;
      if (k === 'finos_gross_salary' || k === 'finos_salary_ctc') v = Math.round(R() * 5e6 / 1000) * 1000;
      store[k] = String(v);
    }
    if (R() < 0.3) store.finos_parent_senior = '1';
    if (R() < 0.2) store.finos_city_metro = 'no';
    const read = (k: string) => (k in store ? store[k] : null);
    assert.deepEqual(j(compute(read, new Date(NOW))), j(web._compute()), JSON.stringify(store));
  }
});

test('with salary components only, taxable income and tax follow the shared core in both regimes', () => {
  Object.keys(store).forEach(k => delete store[k]);
  store.finos_salary_basic = '600000'; store.finos_salary_special = '900000';          // ₹15L gross
  const c = compute(k => (k in store ? store[k] : null), new Date(NOW));
  assert.equal(c.grossSalary, 1500000);
  assert.equal(c.taxableNew, 1500000 - 75000 - c.npsEmployerNew);
  assert.equal(c.taxNew, taxNew(c.taxableNew));
  assert.equal(c.taxOld, taxOld(c.taxableOld));
  assert.equal(c.fy, 'Tax Year 2026-27');
});

test('TDS paid is netted off: a positive balance is tax to pay, a negative one a refund', () => {
  Object.keys(store).forEach(k => delete store[k]);
  store.finos_salary_basic = '600000'; store.finos_salary_special = '900000'; store.finos_tds_salary_annual = '500000';
  const c = compute(k => (k in store ? store[k] : null), new Date(NOW));
  assert.equal(c.totalTDS, 500000);
  assert.equal(c.balanceTax, c.liabilityFinal - 500000);
  assert.ok(c.balanceTax < 0);
});

test('a figure that is only a CTC is labelled as a proxy, never presented as salary', () => {
  Object.keys(store).forEach(k => delete store[k]);
  store.finos_salary_ctc = '1800000';
  const c = compute(k => (k in store ? store[k] : null), new Date(NOW));
  assert.match(c.salaryBasis, /CTC proxy/);
});
