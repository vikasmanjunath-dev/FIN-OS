// The phone's rebalancer must equal the website's js/finos-rebalancer.js for the same holdings and target.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as app from '../lib/rebalancer.ts';

const SRC = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../js/finos-rebalancer.js'), 'utf8');
const store: Record<string, string> = {};
function loadWeb(): any {
  const win: any = {};
  const ls = { getItem: (k: string) => (k in store ? store[k] : null), setItem: (k: string, v: unknown) => { store[k] = String(v); } };
  const sandbox: any = { window: win, Math, JSON, Number, parseFloat, parseInt, String, Object, Array, console, Date, localStorage: ls, document: { getElementById: () => null } };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return win.FinosRebalancer;
}
const web = loadWeb();
const j = (x: unknown) => JSON.parse(JSON.stringify(x));
function rng(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const R = rng(20261012);
const money = () => (R() < 0.25 ? 0 : Math.round(R() * 5e6 / 1000) * 1000);

test('every class row, the normalised target and the drift flag equal the website on 1,000 portfolios', () => {
  for (let n = 0; n < 1000; n++) {
    const v: app.Alloc = { equity: money(), debt: money(), gold: money(), realestate: money(), crypto: money(), govt: money() };
    const target: any = R() < 0.2 ? null : Object.fromEntries(app.CLASSES.map(k => [k, Math.round(R() * 70)]));
    Object.keys(store).forEach(k => delete store[k]);
    store.finos_portfolio_value = String(v.equity); store.finos_fd_value = String(v.debt); store.finos_gold_value = String(v.gold);
    store.finos_property_value = String(v.realestate); store.finos_crypto_value = String(v.crypto); store.finos_epf_value = String(v.govt);
    if (target) store.finos_target_alloc = JSON.stringify(target);
    const theirs = j(web._compute());
    const mine = j(app.compute(v, target));
    assert.equal(mine.totalPortfolio, theirs.totalPortfolio);
    assert.deepEqual(mine.target, theirs.target);
    if (mine.totalPortfolio > 0) assert.equal(mine.rebalanceNeeded, theirs.rebalanceNeeded);   // only an empty portfolio differs (see lib)
    for (const k of app.CLASSES) assert.deepEqual(mine.classes[k], theirs.classes[k], k + JSON.stringify([v, target]));
  }
});

test('hand-computed: 70% equity against a 50% target is 20 points over and says trim ₹2L of a ₹10L portfolio', () => {
  const r = app.compute({ equity: 700000, debt: 200000, gold: 100000, realestate: 0, crypto: 0, govt: 0 }, { equity: 50, debt: 30, gold: 20, realestate: 0, crypto: 0, govt: 0 });
  assert.equal(r.classes.equity.action, 'sell');
  assert.equal(r.classes.equity.actionAmount, 200000);
  assert.equal(r.classes.debt.action, 'buy');
  assert.equal(r.rebalanceNeeded, true);
});

test('an empty portfolio has no actions and no drift', () => {
  const r = app.compute({ equity: 0, debt: 0, gold: 0, realestate: 0, crypto: 0, govt: 0 }, null);
  assert.equal(r.totalPortfolio, 0);
  assert.equal(r.rebalanceNeeded, false);
  assert.ok(app.CLASSES.every(k => r.classes[k].actionAmount === 0));
});

test('new money goes only to classes below target, in proportion to their shortfall, never more than the shortfall', () => {
  const r = app.compute({ equity: 700000, debt: 200000, gold: 100000, realestate: 0, crypto: 0, govt: 0 }, { equity: 50, debt: 30, gold: 20, realestate: 0, crypto: 0, govt: 0 });
  const split = app.splitNewMoney(r, 100000);
  assert.ok(split.every(s => r.classes[s.cls].action === 'buy'));
  assert.ok(split.reduce((s, x) => s + x.amount, 0) <= 100000);
  assert.deepEqual(app.splitNewMoney(r, 0), []);
  const huge = app.splitNewMoney(r, 5e7);
  assert.ok(huge.every(s => s.amount <= r.classes[s.cls].actionAmount + 1));
});

test('presets each sum to 100', () => {
  for (const p of app.PRESETS) assert.equal(app.CLASSES.reduce((s, k) => s + p.vals[k], 0), 100, p.name);
});
