// The phone's gold maths must equal the website's js/finos-gold-tracker.js; the price rule (no assumed MCX rate) is tested directly.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as app from '../lib/gold.ts';
import { addHolding, loadGold, removeHolding, setPrice } from '@/lib/goldStorage';

const SRC = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../js/finos-gold-tracker.js'), 'utf8');
function loadWeb(holdings: unknown[], price: number | null) {
  const store: Record<string, string> = { finos_gold_portfolio: JSON.stringify(holdings) };
  if (price !== null) store.finos_gold_price_per_g = String(price);
  const win: any = {};
  const sandbox: any = { window: win, Math, JSON, Number, parseFloat, parseInt, console, Date, setTimeout, document: { getElementById: () => null, querySelectorAll: () => [], createElement: () => ({}) },
    localStorage: { getItem: (k: string) => (k in store ? store[k] : null), setItem: (k: string, v: string) => { store[k] = String(v); } } };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return { api: win.FinosGoldTracker, store };
}
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
const R = rng(20261012);
const randomHolding = (i: number): app.Holding => {
  const type = (['physical', 'sgb', 'etf', 'goldmf'] as const)[Math.floor(R() * 4)];
  if (type === 'physical') return { id: 'h' + i, type, grams: Math.round(R() * 500 * 10) / 10 };
  if (type === 'sgb') return { id: 'h' + i, type, units: 1 + Math.floor(R() * 60), faceValue: Math.round(2900 + R() * 4000), issueDate: '2021-03-01' };
  if (type === 'etf') return { id: 'h' + i, type, units: Math.round(R() * 400 * 1000) / 1000, nav: Math.round(R() * 100 * 100) / 100 };
  return { id: 'h' + i, type, currentValue: Math.round(R() * 400000) };
};

beforeEach(async () => { await AsyncStorage.clear(); });

test('the total matches the website on 400 random portfolios at a typed price', () => {
  for (let n = 0; n < 400; n++) {
    const list = Array.from({ length: 1 + Math.floor(R() * 7) }, (_, i) => randomHolding(n * 10 + i));
    const price = Math.round(5000 + R() * 8000);
    const { api, store } = loadWeb(list, price);
    const webTotal = api._recomputeTotal();
    assert.equal(app.summarize(list, price).total, webTotal, `portfolio ${n}`);
    assert.equal(Number(store.finos_gold_value), webTotal);
  }
});

test('the SGB coupon matches the website', () => {
  const { api } = loadWeb([], 9000);
  for (let i = 0; i < 200; i++) {
    const u = 1 + Math.floor(R() * 100), face = Math.round(2900 + R() * 5000);
    assert.equal(app.calcSGBAnnualCoupon(u, face), api._calcSGBAnnualCoupon(u, face));
  }
});

test('with no price entered, grams are left out of the total and flagged, not valued with an assumed rate', () => {
  const list: app.Holding[] = [{ id: 'a', type: 'physical', grams: 50 }, { id: 'b', type: 'sgb', units: 10, faceValue: 5409 }, { id: 'c', type: 'etf', units: 20, nav: 68.5 }, { id: 'd', type: 'goldmf', currentValue: 12000 }];
  const s = app.summarize(list, 0);
  assert.equal(s.total, Math.round(20 * 68.5) + 12000);
  assert.equal(s.needsPrice, true);
  assert.equal(s.annualCoupon, Math.round(10 * 5409 * 0.025));      // a coupon does not depend on today's price
  assert.equal(app.summarize(list, 7000).needsPrice, false);
  assert.equal(app.summarize([{ id: 'c', type: 'etf', units: 1, nav: 1 }], 0).needsPrice, false);
});

test('buildHolding applies the website\'s checks', () => {
  const base: app.HoldingForm = { type: 'physical', name: '', grams: 0, units: 0, faceValue: 0, nav: 0, currentValue: 0, invested: 0, issueDate: '', purchaseDate: '' };
  assert.equal(app.buildHolding(base, 'x').ok, false);
  const phys = app.buildHolding({ ...base, grams: 10 }, 'x');
  assert.ok(phys.ok && phys.holding.name === 'Physical gold' && phys.holding.grams === 10);
  const sgb = { ...base, type: 'sgb' as const, units: 5, faceValue: 5000, issueDate: '2022-06-01', purchaseDate: '2022-05-01' };
  assert.equal(app.buildHolding(sgb, 'x').ok, false);                                        // bought before it was issued
  assert.equal(app.buildHolding({ ...sgb, purchaseDate: '2022-07-01' }, 'x').ok, true);
  assert.equal(app.buildHolding({ ...sgb, issueDate: '' }, 'x').ok, false);
  assert.equal(app.buildHolding({ ...base, type: 'etf', units: 5 }, 'x').ok, false);          // NAV missing
  assert.equal(app.buildHolding({ ...base, type: 'goldmf', currentValue: 100 }, 'x').ok, true);
  assert.equal(app.addYears('2022-06-01', 8), '2030-06-01');
});

test('storage: adding and removing keep finos_gold_value in step, a price of 0 is ignored, corrupt data is tolerated', async () => {
  await addHolding({ id: 'e', type: 'etf', units: 10, nav: 100 });
  assert.equal(Number(await AsyncStorage.getItem('finos_gold_value')), 1000);
  await addHolding({ id: 'p', type: 'physical', grams: 10 });
  assert.equal(Number(await AsyncStorage.getItem('finos_gold_value')), 1000);        // no price yet: the gram holding adds nothing
  await setPrice(0);
  assert.equal((await loadGold()).price, 0);
  await setPrice(7000);
  assert.equal(Number(await AsyncStorage.getItem('finos_gold_value')), 1000 + 70000);
  await removeHolding('e');
  assert.equal(Number(await AsyncStorage.getItem('finos_gold_value')), 70000);
  await AsyncStorage.setItem('finos_gold_portfolio', '{broken');
  assert.deepEqual((await loadGold()).holdings, []);
});
