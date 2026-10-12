// The phone's SIP step-up maths must equal the website's js/finos-sip-stepup.js on the same inputs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as app from '../lib/sipStepup.ts';

const SRC = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../js/finos-sip-stepup.js'), 'utf8');
const store: Record<string, string> = {};
function loadWeb(): any {
  const win: any = {};
  const ls = { getItem: (k: string) => (k in store ? store[k] : null), setItem: (k: string, v: unknown) => { store[k] = String(v); } };
  const sandbox: any = { window: win, Math, JSON, Number, parseFloat, parseInt, console, Date, localStorage: ls, document: { getElementById: () => null } };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return win.FinosSIPStepup;
}
const web = loadWeb();
const j = (x: unknown) => JSON.parse(JSON.stringify(x));
function rng(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const R = rng(20261012);

const rand = () => ({
  baseSIP: R() < 0.1 ? [0, 100, 1e6, -5][Math.floor(R() * 4)] : Math.round((500 + R() * 150000) / 500) * 500,
  stepUpPct: R() < 0.1 ? [-3, 75, 0][Math.floor(R() * 3)] : Math.round(R() * 30 * 2) / 2,
  years: R() < 0.1 ? [0, 60, 1, 40][Math.floor(R() * 4)] : 1 + Math.floor(R() * 40),
  returnPct: R() < 0.1 ? [0, 150, 18][Math.floor(R() * 3)] : Math.round(R() * 20 * 2) / 2,
});

test('compute matches the website on 1,500 random inputs, including out-of-range values and zero return', () => {
  for (let n = 0; n < 1500; n++) {
    const p = rand();
    assert.deepEqual(j(app.compute(p)), j(web._compute(p, false)), JSON.stringify(p));
  }
});

test('missing, blank and junk fields fall back to the same defaults as the website', () => {
  for (const p of [{}, null, { baseSIP: '' }, { baseSIP: 'abc', stepUpPct: null, years: undefined, returnPct: NaN }, { baseSIP: '25000', years: '15' }]) {
    assert.deepEqual(j(app.compute(p as any)), j(web._compute(p, false)), JSON.stringify(p));
  }
});

test('the website\'s saved results are the same three numbers', () => {
  const p = { baseSIP: 15000, stepUpPct: 8, years: 18, returnPct: 11 };
  Object.keys(store).forEach(k => delete store[k]);
  web._compute(p, true);
  const c = app.compute(p);
  assert.equal(store.finos_sip_stepup_corpus, String(c.finalStep));
  assert.equal(store.finos_sip_flat_corpus, String(c.finalFlat));
  assert.equal(store.finos_sip_stepup_gain, String(c.advantage));
});

test('hand-computed: ₹10,000 a month at 0% for 2 years, 10% step-up, invests 1,20,000 + 1,32,000', () => {
  const c = app.compute({ baseSIP: 10000, stepUpPct: 10, years: 2, returnPct: 0 });
  assert.equal(c.finalFlat, 240000);
  assert.equal(c.finalStep, 252000);
  assert.equal(c.advantage, 12000);
  assert.equal(c.totalStepSIP, 11000);
  assert.equal(app.advantagePct(c), 5);
});

test('with no step-up the two corpora are identical and the advantage is zero', () => {
  const c = app.compute({ baseSIP: 20000, stepUpPct: 0, years: 10, returnPct: 12 });
  assert.equal(c.advantage, 0);
  assert.equal(c.finalFlat, c.finalStep);
});

test('normalise reports what was actually used', () => {
  assert.deepEqual(app.normalise({ baseSIP: 100, stepUpPct: 80, years: 0, returnPct: 150 }), { baseSIP: 500, stepUpPct: 50, years: 1, returnPct: 100 });
});

test('scenarios cover 5/10/15/20 and mark the selected one; milestones appear once, in the year a level is first crossed', () => {
  const p = app.normalise({ baseSIP: 10000, stepUpPct: 10, years: 20, returnPct: 12 });
  const sc = app.scenarios(p);
  assert.deepEqual(sc.map(s => s.pct), [5, 10, 15, 20]);
  assert.deepEqual(sc.map(s => s.selected), [false, true, false, false]);
  assert.ok(sc[3].finalStep > sc[0].finalStep);
  const ms = app.milestones(app.compute(p).yearlyData);
  assert.ok(ms.length >= 1);
  assert.equal(new Set(ms.map(m => m.year)).size, ms.length);
  const years = app.compute(p).yearlyData;
  ms.forEach(m => assert.ok(years[m.year - 1].stepCorpus > years[m.year - 2].stepCorpus));
});
