'use strict';
// js/arya-sidebar-panel.js read the commodity key "GOLD (10g MCX)" (no longer returned by arya-ai) and called FX
// rates an "RBI reference".  The formatting helpers are extracted between their @pure markers and run on the real
// response shapes of arya-ai/server.py.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'arya-sidebar-panel.js'), 'utf8');
const m = src.match(/@pure-start market-format[\s\S]*?\*\/([\s\S]*?)\/\* @pure-end market-format/);
assert.ok(m, 'market-format block missing');
const ctx = vm.createContext({});
vm.runInContext(m[1], ctx);
const H = (n) => vm.runInContext(n, ctx);

// real shape, taken from arya-ai/data/market.py get_commodities()
const live = {
  commodities: {
    'GOLD (10g, global equiv.)': { price: 118450, unit: '₹/10g', change_pct: -0.4, note: 'global futures price converted to INR, not MCX\'s actual quote', price_usd: 4021.5, usd_unit: 'USD/oz', usd_inr: 88.1, price_date: '2026-10-14' },
    'SILVER (1kg, global equiv.)': { price: 150000, unit: '₹/kg', change_pct: null, price_usd: 48.2, usd_unit: 'USD/oz' },
    'CRUDE OIL (bbl)': { price: 61.2, unit: 'USD/bbl', change_pct: 1.2 },
  },
  unavailable: {}, as_of: 1760000000,
};

test('gold is found under its current label, not the retired MCX key', () => {
  const g = H('_commodityEntry')(live, 'GOLD');
  assert.equal(g.price, 118450);
  assert.equal(H('_commodityEntry')({ commodities: { 'GOLD (10g MCX)': { price: 1 } } }, 'GOLD').price, 1, 'prefix match tolerates label changes');
  assert.equal(H('_commodityEntry')({}, 'GOLD'), null);
  assert.equal(H('_commodityEntry')(null, 'GOLD'), null);
});

test('an unknown change is left out, not printed as 0.00%', () => {
  const lines = H('_commodityLines')(live);
  const silver = lines.find((l) => l.includes('SILVER'));
  assert.ok(silver && !/0\.00|▲|▼/.test(silver), silver);
  assert.match(lines.find((l) => l.includes('GOLD')), /▼0\.40%/);
});

test('without a USD/INR rate gold is shown as a world dollar price, not as a rupee price', () => {
  const d = { commodities: {}, unavailable: { 'GOLD (10g, global equiv.)': { reason: 'x', price_usd: 4021.5, usd_unit: 'USD/oz' } } };
  const lines = H('_commodityLines')(d);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /not available/);
  assert.match(lines[0], /4,021\.5 USD\/oz/);
  assert.ok(!/₹/.test(lines[0]));
  assert.equal(H('_commodityUnavailable')(d, 'GOLD').price_usd, 4021.5);
});

test('labels say converted world price and not RBI', () => {
  assert.match(H('_COMMODITY_NOTE'), /not MCX/);
  assert.match(H('_FX_LABEL'), /not the RBI reference/);
  assert.ok(!/RBI reference\)/.test(src.replace(/not the RBI reference/g, '')), 'a bare "RBI reference" label is back');
  assert.ok(!/GOLD \(10g MCX\)/.test(src.replace(/Retired[^\n]*/g, '')), 'retired MCX key referenced again');
});

test('fx lines keep numeric rates only', () => {
  assert.deepEqual([...H('_fxLines')({ USD_INR: 88.1, error: 'x', EUR_INR: 'n/a', GBP_INR: null })], ['• USD/INR: 88.1']);
  assert.deepEqual([...H('_fxLines')({ error: 'FX rates unavailable' })], []);
});
