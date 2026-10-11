// Monte Carlo engine and retirement-plan arithmetic must equal the website's, bit for bit (the engine is seeded).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as mc from '@/lib/montecarlo';
import * as plan from '@/lib/retirementPlan';

const require_ = createRequire(import.meta.url);
const webMC = require_('../../js/finos-montecarlo.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
const R = rng(20261014);
const pick = <T,>(a: readonly T[]) => a[Math.floor(R() * a.length)];
const int = (lo: number, hi: number) => lo + Math.floor(R() * (hi - lo + 1));

function randCfg(): any {
  const retireAge = int(40, 65);
  const startAge = int(22, Math.min(60, retireAge));
  return {
    startAge, retireAge, endAge: int(retireAge + 5, 100),
    assets: [
      { name: 'equity', value: pick([0, 200000, 2500000, int(0, 8e6)]), mean: pick([0.1, 0.12, 0.14]), vol: 0.18, beta: 1 },
      { name: 'debt', value: pick([0, 500000, int(0, 4e6)]), mean: 0.075, vol: 0.035, beta: 0.15 },
      { name: 'gold', value: pick([0, 100000, int(0, 1e6)]), mean: 0.08, vol: 0.14, beta: 0.1 },
    ],
    monthlyContribution: pick([0, 10000, 30000, int(0, 90000)]),
    stepUp: pick([0, 0.05, 0.08, 0.1]),
    monthlyExpenseToday: pick([20000, 50000, 60000, int(15000, 150000)]),
    inflation: pick([0.05, 0.06, 0.07]), inflationVol: 0.015,
    pensionMonthlyAtRetire: pick([0, 5000, 15000]), pensionIndexation: pick([0, 0.03]),
    runs: pick([300, 800, 1500]), seed: int(1, 99999),
  };
}

test('Monte Carlo: identical output for 40 random configurations (same seed, same numbers)', () => {
  for (let i = 0; i < 40; i++) {
    const cfg = randCfg();
    assert.deepEqual(mc.simulate(cfg), webMC.simulate(cfg), `cfg ${i}`);
  }
  assert.deepEqual(mc.DEFAULT_ASSUMPTIONS, webMC.DEFAULT_ASSUMPTIONS);
});

test('solveContribution: same answer, including "not reachable"', () => {
  for (let i = 0; i < 8; i++) {
    const cfg = { ...randCfg(), runs: 600 };
    assert.equal(mc.solveContribution(cfg, 0.85), webMC.solveContribution(cfg, 0.85), `solve ${i}`);
  }
  const hopeless = { ...randCfg(), assets: [{ name: 'equity', value: 0, mean: 0.12, vol: 0.18, beta: 1 }], monthlyExpenseToday: 1e7, monthlyContribution: 0, runs: 300 };
  assert.equal(mc.solveContribution(hopeless, 0.85), webMC.solveContribution(hopeless, 0.85));
});

test('behaves as a retirement model should: more saved means better odds; failure runs report an age', () => {
  const base = { ...randCfg(), startAge: 30, retireAge: 60, endAge: 90, monthlyExpenseToday: 60000, runs: 1500, seed: 7, stepUp: 0.05, pensionMonthlyAtRetire: 0 };
  const poor = mc.simulate({ ...base, assets: [{ name: 'equity', value: 100000, mean: 0.12, vol: 0.18, beta: 1 }], monthlyContribution: 5000 });
  const rich = mc.simulate({ ...base, assets: [{ name: 'equity', value: 100000, mean: 0.12, vol: 0.18, beta: 1 }], monthlyContribution: 60000 });
  assert.ok(rich.successRate > poor.successRate);
  assert.ok(poor.successRate >= 0 && rich.successRate <= 1);
  if (poor.depletion) assert.ok(poor.depletion.medianAge >= 60 && poor.depletion.medianAge <= 90);
});

// Load the website's planner (a browser IIFE that reads localStorage) in a sandbox, so its real code is the reference.
function webPlanner(store: Record<string, string>) {
  const ls = { getItem: (k: string) => (k in store ? store[k] : null), setItem: (k: string, v: any) => { store[k] = String(v); } };
  const sandbox: any = { window: { FinosMC: webMC }, localStorage: ls, console };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(path.join(root, 'js/finos-retirement-planner.js'), 'utf8'), sandbox);
  return sandbox.window.FinosRetirementPlanner;
}

function randStore(): Record<string, string> {
  const s: Record<string, string> = {};
  const maybe = (k: string, v: any) => { if (R() < 0.75) s[k] = String(v); };
  maybe('finos_retire_age', pick([55, 58, 60, 65, 'abc']));
  maybe('finos_retire_exp_mo', pick([30000, 50000, 80000, int(10000, 200000)]));
  maybe('finos_retire_inflation', pick([5, 6, 7]));
  maybe('finos_retire_return', pick([8, 10, 12]));
  maybe('finos_epf_dob', pick(['1990-05-17', '1985-12-01', '2001-01-01', 'garbage', '2999-01-01']));
  maybe('finos_retire_current_age', pick([28, 35, 45]));
  maybe('finos_epf_projected', pick([0, 3000000, int(0, 9e6)]));
  maybe('finos_epf_value', pick([0, 400000, int(0, 3e6)]));
  maybe('finos_epf_pension', pick([0, 3000, 7500]));
  maybe('finos_nps_projected', pick([0, 2000000, int(0, 6e6)]));
  maybe('finos_nps_tier1', pick([0, 300000, int(0, 2e6)]));
  maybe('finos_nps_value', pick([0, 250000]));
  maybe('finos_nps_tier2', pick([0, 100000]));
  maybe('finos_nps_annuity_pct', pick([0, 20, 40, 80, 55]));
  maybe('finos_nps_equity_pct', pick([0, 25, 50, 75, 100, 150]));
  maybe('finos_ppf_value', pick([0, 500000, int(0, 3e6)]));
  maybe('finos_sip_value', pick([0, 200000, int(0, 4e6)]));
  maybe('finos_portfolio_value', pick([0, 600000, int(0, 5e6)]));
  maybe('finos_mf_import_value', pick([0, 150000]));
  maybe('finos_fd_value', pick([0, 300000, int(0, 2e6)]));
  maybe('finos_gold_value', pick([0, 100000, int(0, 1e6)]));
  maybe('finos_retire_manual_corpus', pick([0, 500000]));
  maybe('finos_retire_monthly_invest', pick([0, 10000, int(0, 80000)]));
  maybe('finos_retire_stepup', pick([0, 5, 8, 12]));
  maybe('finos_retire_end_age', pick([85, 90, 95, 50]));
  maybe('finos_retire_eq_return', pick([8, 12, 15]));
  return s;
}

test('retirement plan + Monte Carlo configuration equal the website\'s on 400 random stored profiles', () => {
  for (let i = 0; i < 400; i++) {
    const store = randStore();
    const web = webPlanner({ ...store });
    const read = (k: string) => (k in store ? store[k] : null);
    const now = new Date();   // both sides use the real "today" for age
    const a = plan.computePlan(read, now);
    const w = JSON.parse(JSON.stringify(web._compute()));            // JSON round-trip: objects built in the sandbox have another realm's prototype
    assert.deepEqual(JSON.parse(JSON.stringify(a)), w, `plan ${i} ${JSON.stringify(store)}`);
    assert.deepEqual(JSON.parse(JSON.stringify(plan.mcConfig(a, read))), JSON.parse(JSON.stringify(web._mcConfig(w))), `mcConfig ${i}`);
  }
});

test('a worked example, derived by hand', () => {
  // Age 30 (set directly), retire 60, ₹50,000/month today, inflation 6%, nothing saved except ₹1L EPF balance.
  const store: Record<string, string> = { finos_retire_current_age: '30', finos_epf_value: '100000' };
  const p = plan.computePlan(k => store[k] ?? null, new Date(2026, 9, 12));
  assert.equal(p.yearsLeft, 30);
  assert.equal(p.inflatedMonthlyExp, Math.round(50000 * Math.pow(1.06, 30)));            // 287,175
  assert.equal(p.requiredCorpus, p.inflatedMonthlyExp * 12 * 25);                         // the 25× / 4% rule
  assert.equal(p.epfProjected, Math.round(100000 * Math.pow(1.0825, 30)));
  assert.equal(p.totalCorpus, p.epfProjected);
  assert.equal(p.corpusGap, p.requiredCorpus - p.totalCorpus);
  assert.equal(plan.verdictFor(90).tone, 'good');
  assert.equal(plan.verdictFor(70).tone, 'warn');
  assert.equal(plan.verdictFor(20).tone, 'bad');
});
