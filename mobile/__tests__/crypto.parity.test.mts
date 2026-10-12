// The phone's crypto maths must equal the website's js/finos-crypto-tracker.js (summarize) on the same holdings and prices.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as app from '../lib/crypto.ts';
import { addHolding, loadCrypto, removeHolding, setPrice } from '@/lib/cryptoStorage';

const SRC = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../js/finos-crypto-tracker.js'), 'utf8');
function loadWeb(): any {
  const win: any = { addEventListener() {} };
  const sandbox: any = { window: win, Math, JSON, Number, parseFloat, Date, console, setTimeout, requestAnimationFrame() {},
    localStorage: { getItem: () => null, setItem() {} }, document: { getElementById: () => null, createElement: () => ({ style: {} }), body: { appendChild() {} } } };
  win.document = sandbox.document;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return win.FinosCryptoTracker;
}
const web = loadWeb();
const j = (x: unknown) => JSON.parse(JSON.stringify(x));
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
const R = rng(20261012);
const SYMS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'PEPE'];

beforeEach(async () => { await AsyncStorage.clear(); });

test('summarize matches the website on 800 random portfolios, with and without prices', () => {
  assert.equal(app.TAX_RATE, web.TAX_RATE);
  for (let n = 0; n < 800; n++) {
    const holdings = SYMS.filter(() => R() < 0.6).map((symbol, i) => ({
      id: `h${n}_${i}`, symbol, quantity: Math.round(R() * 50 * 1e4) / 1e4, avgBuyPrice: Math.round(R() * 5e6),
      ...(R() < 0.15 ? { currentPrice: Math.round(R() * 5e6) } : {}),
    }));
    const prices: app.Prices = {};
    holdings.forEach(h => { if (R() < 0.7) prices[h.symbol] = Math.round(R() * 6e6); });
    assert.deepEqual(j(app.summarize(holdings, prices)), j(web._summarize(holdings, prices)), `portfolio ${n}`);
  }
});

test('a loss does not shelter a gain, and an unpriced coin is not a loss', () => {
  const s = app.summarize([{ id: 'a', symbol: 'BTC', quantity: 1, avgBuyPrice: 100000 }, { id: 'b', symbol: 'ETH', quantity: 10, avgBuyPrice: 20000 }, { id: 'c', symbol: 'SOL', quantity: 5, avgBuyPrice: 9000 }],
    { BTC: 200000, ETH: 10000 });
  assert.equal(s.totalGain, 0);
  assert.equal(s.tax, Math.round(100000 * 0.312));
  assert.deepEqual(s.unpriced, ['SOL']);
  assert.equal(s.pricedCost, 300000);
});

test('buildHolding validates the coin and amounts', () => {
  assert.equal(app.buildHolding({ symbol: '', quantity: 1, avgBuyPrice: 1 }, 'x').ok, false);
  assert.equal(app.buildHolding({ symbol: 'BT C', quantity: 1, avgBuyPrice: 1 }, 'x').ok, false);
  assert.equal(app.buildHolding({ symbol: 'btc', quantity: 0, avgBuyPrice: 1 }, 'x').ok, false);
  assert.equal(app.buildHolding({ symbol: 'btc', quantity: 1, avgBuyPrice: 0 }, 'x').ok, false);
  const ok = app.buildHolding({ symbol: ' eth ', quantity: 2, avgBuyPrice: 150000 }, 'x');
  assert.ok(ok.ok && ok.holding.symbol === 'ETH' && ok.holding.name === 'Ethereum');
});

test('storage keeps finos_crypto_value in step and ignores a zero price and corrupt data', async () => {
  await addHolding({ id: 'a', symbol: 'BTC', quantity: 0.5, avgBuyPrice: 3000000 }, 4000000);
  assert.equal(Number(await AsyncStorage.getItem('finos_crypto_value')), 2000000);
  await addHolding({ id: 'b', symbol: 'SOL', quantity: 10, avgBuyPrice: 8000 });
  assert.equal(Number(await AsyncStorage.getItem('finos_crypto_value')), 2000000);        // SOL has no price yet
  await setPrice('SOL', 0);
  assert.equal((await loadCrypto()).prices.SOL, undefined);
  await setPrice('SOL', 12000);
  assert.equal(Number(await AsyncStorage.getItem('finos_crypto_value')), 2000000 + 120000);
  await removeHolding('a');
  assert.equal(Number(await AsyncStorage.getItem('finos_crypto_value')), 120000);
  await AsyncStorage.setItem('finos_crypto_prices', '[1,2');
  assert.deepEqual((await loadCrypto()).prices, {});
});
