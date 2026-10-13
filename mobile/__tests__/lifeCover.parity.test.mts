// The phone's life-cover need must equal the website's js/finos-life-cover.js for the same inputs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as app from '../lib/lifeCover.ts';

const SRC = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../js/finos-life-cover.js'), 'utf8');
function loadWeb(): any {
  const win: any = {};
  const ls = { getItem: () => null, setItem() {} };
  const sandbox: any = { window: win, Math, JSON, Number, parseFloat, parseInt, String, Object, Array, console, Date, localStorage: ls, document: { getElementById: () => null } };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return win.FinosLifeCover;
}
const web = loadWeb();
function rng(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const R = rng(20261012);

test('compute equals the website on 1,500 random profiles, including equal discount and inflation rates', () => {
  for (let n = 0; n < 1500; n++) {
    const age = 20 + Math.floor(R() * 40);
    const disc = R() < 0.1 ? 6 : Math.round((3 + R() * 9) * 2) / 2;
    const p: app.CoverInputs = {
      annualIncome: Math.round(R() * 5e6 / 1000) * 1000, currentAge: age, retireAge: R() < 0.05 ? age - 3 : age + 5 + Math.floor(R() * 35),
      monthlyNeed: Math.round(R() * 2e5 / 500) * 500, needYears: 5 + Math.floor(R() * 35), existingCover: R() < 0.3 ? 0 : Math.round(R() * 3e7 / 1e5) * 1e5,
      totalLiab: R() < 0.4 ? 0 : Math.round(R() * 1e7 / 1e4) * 1e4, discountRate: disc, inflationRate: R() < 0.1 ? disc : Math.round((3 + R() * 6) * 2) / 2,
    };
    assert.deepEqual(JSON.parse(JSON.stringify(app.compute(p))), JSON.parse(JSON.stringify(web._compute(p))), JSON.stringify(p));
  }
});

test('hand-computed: ₹12L income, 30 years to retire at 0% real return is ₹3.6Cr; ₹60k/mo needs ₹1.8Cr at 4%', () => {
  const c = app.compute({ annualIncome: 1200000, currentAge: 30, retireAge: 60, monthlyNeed: 60000, needYears: 25, existingCover: 5000000, totalLiab: 2000000, discountRate: 6, inflationRate: 6 });
  assert.equal(c.hlv, 36000000);
  assert.equal(c.irCorpus, 18000000);
  assert.equal(c.withLiab, 38000000);
  assert.equal(c.coverGap, 33000000);
  assert.equal(c.coverageRatio, 13);
});

test('status bands and the premium table', () => {
  assert.equal(app.status(95).label, 'Well covered');
  assert.equal(app.status(60).label, 'Partly covered');
  assert.equal(app.status(30).label, 'Under-insured');
  assert.equal(app.status(0).label, 'Critically under-insured');
  const p = app.premiumEstimate(25000000, 33, 1500000);
  assert.deepEqual([p.atAge, p.crores, p.annual, p.monthly], [35, 3, 45000, 3750]);
  assert.equal(p.pctOfIncome, 3);
  assert.equal(app.premiumEstimate(5000000, 30, 0).pctOfIncome, null);
});
