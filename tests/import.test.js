const test = require('node:test');
const assert = require('node:assert');
const I = require('../js/finos-import.js');

const ZERODHA = `Symbol,ISIN,Sector,Quantity Available,Quantity Discrepant,Quantity Long Term,Quantity Pledged (Margin),Quantity Pledged (Loan),Average Price,Previous Closing Price,Unrealized P&L,Unrealized P&L Pct.
HDFCBANK,INE040A01034,Financials,10,0,10,0,0,1500.50,1620.25,1197.50,7.98
"TATA MOTORS",INE155A01022,Auto,25,0,25,0,0,600,950.4,8760,58.4
NIFTYBEES,INF204KB14I2,ETF,100,0,100,0,0,240,262.5,2250,9.37
`;
const GROWW = `Name,Kuber
Stock Name,ISIN,Quantity,Average buy price,Buy value,Closing price,Closing value,Unrealised P&L
Infosys,INE009A01021,5,"1,400.00","7,000.00","1,500.00","7,500.00",500
Total,,,,"7,000.00",,"7,500.00",500
`;
const MF = `Scheme Name,ISIN,Units,Average NAV,Invested Value,Current NAV,Current Value
Parag Parikh Flexi Cap Fund - Direct Growth,INF879O01027,"1,234.567",55.20,"68,148.00",78.9,"97,407.00"
Axis Bluechip Fund - Direct Plan - Growth,INF846K01DP8,0,40,0,50,0
`;

test('Zerodha holdings CSV: detects format, classifies ETF as equity, computes totals', () => {
  const r = I.parseHoldings(ZERODHA);
  assert.strictEqual(r.format, 'zerodha');
  assert.strictEqual(r.rows.length, 3);
  assert.strictEqual(r.rows[0].value, 16202.5);                       // 10 × 1620.25
  assert.strictEqual(r.rows[0].invested, 15005);
  assert.ok(r.rows.every((x) => x.kind === 'equity'));                // NIFTYBEES is INF… but an ETF
  assert.strictEqual(r.totals.equity, Math.round(16202.5 + 23760 + 26250));
  assert.deepStrictEqual(r.warnings, []);
});

test('Groww CSV: preamble line skipped, total row ignored, quoted thousands parsed', () => {
  const r = I.parseHoldings(GROWW);
  assert.strictEqual(r.format, 'groww');
  assert.strictEqual(r.rows.length, 1);
  assert.strictEqual(r.rows[0].value, 7500);
  assert.strictEqual(r.rows[0].avg, 1400);
});

test('Mutual-fund CSV: INF ISIN → mf, zero-unit rows dropped with a warning', () => {
  const r = I.parseHoldings(MF);
  assert.strictEqual(r.rows.length, 1);
  assert.strictEqual(r.rows[0].kind, 'mf');
  assert.strictEqual(r.totals.mf, 97407);
  assert.strictEqual(r.totals.equity, 0);
  assert.match(r.warnings[0], /1 row/);
});

test('semicolon delimiter, BOM, rupee signs and negative parentheses', () => {
  const r = I.parseHoldings('﻿Instrument;Qty.;Avg. cost;LTP\nRELIANCE;4;₹2,400;₹2,500\nLOSER;10;100;(90)\n');
  assert.strictEqual(r.rows.length, 1);
  assert.strictEqual(r.rows[0].value, 10000);
  assert.strictEqual(r.rows[0].pnl, 400);
  assert.match(r.warnings[0], /1 row/);                                // the negative-price row is rejected, not imported
});

test('garbage and empty input fail soft with a reason', () => {
  assert.match(I.parseHoldings('').warnings[0], /empty/);
  assert.match(I.parseHoldings('foo,bar\n1,2\n').warnings[0], /header/);
  assert.strictEqual(I.parseHoldings('a b c').rows.length, 0);
});

test('apply() writes the keys the rest of FIN-OS reads, and replaces on re-import', () => {
  const mem = {};
  globalThis.FinosStore = { set: (k, v) => { mem[k] = v; } };
  I.apply(I.parseHoldings(ZERODHA));
  assert.strictEqual(mem.finos_portfolio_value, String(Math.round(16202.5 + 23760 + 26250)));
  assert.strictEqual(mem.finos_mf_import_value, '0');
  assert.strictEqual(mem.finos_holdings.length, 3);
  I.apply(I.parseHoldings(GROWW));
  assert.strictEqual(mem.finos_portfolio_value, '7500');               // replaced, not added
  assert.strictEqual(mem.finos_holdings.length, 1);
  assert.throws(() => I.apply({ rows: [] }), /Nothing/);
  delete globalThis.FinosStore;
});

test('CSV parser handles quoted commas, escaped quotes and CRLF', () => {
  const rows = I.parseCSV('a,b\r\n"x, y","he said ""hi"""\r\n');
  assert.deepStrictEqual(rows, [['a', 'b'], ['x, y', 'he said "hi"']]);
});
