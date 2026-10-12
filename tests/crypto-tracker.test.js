// Crypto tracker maths (js/finos-crypto-tracker.js), run in a sandbox: tax per coin on gains only, unpriced coins left out, 31.2%.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'finos-crypto-tracker.js'), 'utf8');
function load() {
  const win = { addEventListener() {} };
  const sandbox = { window: win, Math, JSON, Number, parseFloat, Date, console, setTimeout, requestAnimationFrame() {},
    localStorage: { getItem: () => null, setItem() {} }, document: { getElementById: () => null, createElement: () => ({ style: {} }), body: { appendChild() {} } } };
  win.document = sandbox.document;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return win.FinosCryptoTracker;
}
const C = load();

test('the rate is 30% plus 4% cess', () => {
  assert.ok(Math.abs(C.TAX_RATE - 0.312) < 1e-12);
});

test('a loss in one coin does not reduce the tax on another', () => {
  const holdings = [{ symbol: 'BTC', quantity: 1, avgBuyPrice: 100000 }, { symbol: 'ETH', quantity: 10, avgBuyPrice: 20000 }];
  const s = C._summarize(holdings, { BTC: 200000, ETH: 10000 });          // BTC +100000, ETH -100000
  assert.strictEqual(s.totalGain, 0);                                      // the net is zero...
  assert.strictEqual(s.tax, Math.round(100000 * 0.312));                   // ...but tax is still due on the BTC gain
  assert.strictEqual(s.rows.find((r) => r.symbol === 'ETH').tax, 0);
});

test('a coin with no price is left out and listed, not counted as a total loss', () => {
  const holdings = [{ symbol: 'BTC', quantity: 0.5, avgBuyPrice: 3000000 }, { symbol: 'SOL', quantity: 100, avgBuyPrice: 8000 }];
  const s = C._summarize(holdings, { BTC: 4000000 });
  assert.deepStrictEqual([...s.unpriced], ['SOL']);       // copied: the sandbox's arrays come from another realm
  assert.strictEqual(s.totalValue, 2000000);
  assert.strictEqual(s.totalGain, 500000);                                 // not 500000 - 800000
  assert.strictEqual(s.pricedCost, 1500000);
  assert.strictEqual(s.totalCost, 1500000 + 800000);                      // what you put in overall is still shown
  assert.strictEqual(s.rows.find((r) => r.symbol === 'SOL').priced, false);
});

test('TDS is 1% of a holding\'s value only when it is at least ₹50,000', () => {
  const s = C._summarize([{ symbol: 'A', quantity: 1, avgBuyPrice: 10 }, { symbol: 'B', quantity: 1, avgBuyPrice: 10 }], { A: 49999, B: 50000 });
  assert.strictEqual(s.rows[0].tds, 0);
  assert.strictEqual(s.rows[1].tds, 500);
  assert.strictEqual(s.tds, 500);
});
