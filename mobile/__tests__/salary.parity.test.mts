// The phone's salary maths and tips must equal the website's js/finos-salary-optimizer.js on the same inputs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as app from '../lib/salary.ts';

const SRC = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../js/finos-salary-optimizer.js'), 'utf8');
const store: Record<string, string> = {};
function loadWeb(): any {
  const win: any = {};
  const ls = { getItem: (k: string) => (k in store ? store[k] : null), setItem: (k: string, v: unknown) => { store[k] = String(v); } };
  const sandbox: any = { window: win, Math, JSON, Number, parseFloat, parseInt, console, Date, localStorage: ls, document: { getElementById: () => null }, setTimeout, clearTimeout };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return win.FinosSalaryOptimizer;
}
const web = loadWeb();
const j = (x: unknown) => JSON.parse(JSON.stringify(x));
function rng(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const R = rng(20261012);

function randInputs(): app.SalaryInputs {
  const ctc = Math.round((R() < 0.15 ? R() * 3e5 : 3e5 + R() * 6e6) / 1000) * 1000;
  const basic = Math.round(ctc * (0.3 + R() * 0.3) / 100) * 100;
  const pick = (p: number, max: number) => (R() < p ? 0 : Math.round(R() * max / 100) * 100);
  return {
    ctc, basic, hraRcvd: pick(0.2, basic * 0.6), lta: pick(0.4, 80000), special: pick(0.1, ctc * 0.4),
    npsEr: pick(0.5, basic * 0.2), rentPaid: pick(0.35, basic * 0.9),
    isMetro: R() < 0.55, regime: R() < 0.5 ? 'new' : 'old',
  };
}
function runWeb(i: app.SalaryInputs) {
  Object.keys(store).forEach(k => delete store[k]);
  store.finos_salary_ctc = String(i.ctc); store.finos_salary_basic = String(i.basic); store.finos_salary_hra_received = String(i.hraRcvd);
  store.finos_salary_lta = String(i.lta); store.finos_salary_special = String(i.special); store.finos_salary_nps_er = String(i.npsEr);
  store.finos_salary_rent_paid = String(i.rentPaid); store.finos_salary_city = i.isMetro ? 'metro' : 'non-metro'; store.finos_salary_regime = i.regime;
  return j(web._compute());
}

test('compute matches the website on 1,500 random salaries in both regimes', () => {
  for (let n = 0; n < 1500; n++) {
    const i = randInputs();
    assert.deepEqual(j(app.compute(i)), runWeb(i), 'salary ' + JSON.stringify(i));
  }
});

test('the take-home and PF the website saves are the same numbers', () => {
  const i = randInputs();
  const w = runWeb(i), c = app.compute(i);
  assert.equal(String(c.takeHomeMo), store.finos_salary_take_home);
  assert.equal(String(c.pfEmp), store.finos_salary_pf);
  assert.equal(w.takeHomeMo, c.takeHomeMo);
});

test('hraExempt matches the website helper-by-result, including zero rent and rent below 10% of basic', () => {
  const cases: [number, number, number, boolean][] = [[480000, 240000, 0, true], [480000, 240000, 40000, true], [480000, 240000, 300000, false], [100000, 50000, 120000, true], [0, 0, 5000, true]];
  for (const [basic, hra, rent, metro] of cases) {
    const i: app.SalaryInputs = { ctc: basic * 2, basic, hraRcvd: hra, lta: 0, special: 0, npsEr: 0, rentPaid: rent, isMetro: metro, regime: 'old' };
    assert.equal(app.hraExempt(basic, hra, rent, metro), runWeb(i).hraExempt);
  }
});

test('the restructuring tips are the same set, in the same order, with the same savings (the website\'s "₹₹" aside)', () => {
  // The website renders tips inline in a template; rebuild its list by calling renderOptimize on a fake container and parsing the cards.
  let compared = 0;
  for (let n = 0; n < 300; n++) {
    const i = randInputs();
    runWeb(i);
    const box: any = { innerHTML: '' };
    web.renderOptimize(box);
    const html: string = box.innerHTML;
    const webTips = [...html.matchAll(/<div style="font-size:14px;font-weight:800;color:#F5F7FA;">(.*?) (.*?)<\/div>\s*<div[^>]*>Save ~(₹[\d,]+)\/yr<\/div>\s*<\/div>\s*<div[^>]*>([\s\S]*?)<\/div>/g)]
      .map(m => ({ title: m[2], saving: m[3], action: m[4].replace(/₹₹/g, '₹') }));
    const mine = app.tips(app.compute(i)).map(t => ({ title: t.title, saving: '₹' + t.saving.toLocaleString('en-IN'), action: t.action }));
    assert.deepEqual(mine, webTips, 'tips ' + JSON.stringify(i));
    compared += webTips.length;
  }
  assert.ok(compared > 600, 'compared ' + compared + ' tips');
});

test('hraBreakdown marks the binding leg and never flags a zero leg', () => {
  const c = app.compute({ ctc: 1200000, basic: 480000, hraRcvd: 240000, lta: 0, special: 0, npsEr: 0, rentPaid: 300000, isMetro: true, regime: 'old' });
  const h = app.hraBreakdown(c);
  assert.equal(h.exempt, 240000);                       // min(240000, 300000−48000=252000, 240000)
  assert.deepEqual(h.legs.map(l => l.isMin), [true, false, true]);
  const none = app.hraBreakdown(app.compute({ ctc: 1e6, basic: 400000, hraRcvd: 100000, lta: 0, special: 0, npsEr: 0, rentPaid: 0, isMetro: true, regime: 'old' }));
  assert.equal(none.exempt, 0);
  assert.ok(none.legs.every(l => !l.isMin));
});

test('hand-computed: ₹12L CTC, ₹5L basic, ₹2L HRA, no rent: new-regime tax is nil under the ₹12L rebate', () => {
  const c = app.compute({ ctc: 1200000, basic: 500000, hraRcvd: 200000, lta: 0, special: 500000, npsEr: 0, rentPaid: 0, isMetro: true, regime: 'new' });
  assert.equal(c.grossSalary, 1200000);
  assert.equal(c.taxableNewNet, 1125000);               // 12,00,000 − 75,000
  assert.equal(c.taxNew, 0);
  assert.equal(c.pfEmp, 60000);
  assert.equal(c.takeHomeAnn, 1200000 - 60000 - 2400);
});
