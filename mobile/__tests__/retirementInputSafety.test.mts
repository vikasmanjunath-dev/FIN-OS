import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computePlan, mcConfig } from '@/lib/retirementPlan';
import { retirementMissing } from '@/lib/aryaRetirement';

const require_ = createRequire(import.meta.url);
const webMC = require_('../../js/finos-montecarlo.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const webPlanner = (store: Record<string, string>) => {
  const ls = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: unknown) => { store[k] = String(v); } };
  const sandbox: any = { window: { FinosMC: webMC }, localStorage: ls, console };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(path.join(root, 'js/finos-retirement-planner.js'), 'utf8'), sandbox);
  return sandbox.window.FinosRetirementPlanner;
};

test('web and mobile retirement projections ignore malformed, infinite, negative and impossible stored inputs', () => {
  const store = {
    finos_retire_age: '60years', finos_retire_current_age: '42abc', finos_epf_dob: '1984-02-30',
    finos_epf_value: 'Infinity', finos_nps_tier1: '25000oops', finos_ppf_value: '-500000',
    finos_sip_value: '1e309', finos_portfolio_value: '1,2,00', finos_fd_value: '250000',
    finos_retire_exp_mo: '50000', finos_retire_inflation: 'NaN', finos_retire_return: '12abc',
  };
  const read = (key: string) => store[key as keyof typeof store] ?? null;
  const now = new Date(2026, 9, 12);
  const app = computePlan(read, now);
  const web = webPlanner({ ...store })._compute();
  const plain = JSON.parse(JSON.stringify(app));
  assert.deepEqual(plain, JSON.parse(JSON.stringify(web)));
  assert.ok(Object.values(app).every(value => typeof value === 'number' && Number.isFinite(value)));
  assert.equal(app.retireAge, 60);
  assert.equal(app.ageNow, 30); // legacy no-age fallback remains explicit follow-up work
  assert.equal(app.epfProjected, 0);
  assert.equal(app.npsLumpSum, 0);
  assert.equal(app.ppfProjected, 0);
  assert.equal(app.sipProjected, 0);
  assert.ok(Number.isFinite(mcConfig(app, read).assets.reduce((sum, asset) => sum + asset.value, 0)));
});

test('retirement odds require fully valid ages, dates and finite stored inputs', () => {
  const now = new Date(2026, 9, 12);
  const invalid = { finos_retire_age: '60years', finos_retire_exp_mo: 'Infinity', finos_retire_current_age: '42abc', finos_epf_dob: '1984-02-30' };
  const missing = retirementMissing(invalid, now);
  assert.equal(missing.length, 3);
  const valid = { finos_retire_age: '60', finos_retire_exp_mo: '50000', finos_retire_current_age: '42' };
  assert.deepEqual(retirementMissing(valid, now), []);
  const validDob = { finos_retire_age: '60', finos_retire_exp_mo: '50000', finos_epf_dob: '1984-02-29' };
  assert.deepEqual(retirementMissing(validDob, now), []);
});
