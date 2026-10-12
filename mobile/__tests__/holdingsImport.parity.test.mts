// The phone must read a broker file exactly as the website's js/finos-import.js does, and map it onto holdings without double counting.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as app from '../lib/holdingsImport.ts';
import { toHoldings, planImport, tickerFrom } from '../lib/holdingsImportPlan.ts';

const require = createRequire(import.meta.url);
const web = require(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../js/finos-import.js'));

function rng(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const R = rng(20261012);
const pick = <T,>(a: T[]) => a[Math.floor(R() * a.length)];

const ZERODHA_OLD = (rows: string[][]) => ['Symbol,ISIN,Sector,Quantity Available,Quantity Discrepant,Quantity Long Term,Quantity Pledged (Margin),Quantity Pledged (Loan),Average Price,Previous Closing Price,Unrealized P&L,Unrealized P&L Pct.', ...rows.map(r => r.join(','))].join('\n');
const ZERODHA_NEW = (rows: string[][]) => ['Instrument,Qty.,Avg. cost,LTP,Invested,Cur. val,P&L,Net chg.,Day chg.', ...rows.map(r => r.join(','))].join('\n');
const GROWW = (rows: string[][]) => ['Name,Holdings statement for 1234567890', 'Stock Name,ISIN,Quantity,Average buy price,Buy value,Closing price,Closing value,Unrealised P&L', ...rows.map(r => r.join(','))].join('\n');

function randomFile(): string {
  const n = 1 + Math.floor(R() * 8);
  const kind = pick(['zn', 'zo', 'gr', 'junk', 'semi']);
  const num = () => (R() < 0.05 ? '' : R() < 0.1 ? `"${(Math.round(R() * 5e5) / 100).toLocaleString('en-US')}"` : String(Math.round(R() * 5e5) / 100));
  const rows = Array.from({ length: n }, () => {
    const qty = R() < 0.07 ? '0' : String(1 + Math.floor(R() * 500));
    const nm = pick(['RELIANCE', 'TCS', 'GOLDBEES', 'HDFCBANK-BE', 'Axis Bluechip Fund Direct Growth', 'Reliance Industries Ltd', 'Total']);
    const isin = pick(['INE002A01018', 'INF204KB17I5', '', 'IN9155A01020']);
    if (kind === 'zn') return [nm, qty, num(), num(), num(), num(), num(), '1.2%', '0.4%'];
    if (kind === 'zo') return [nm, isin, 'IT', qty, '0', '0', '0', '0', num(), num(), num(), '5%'];
    if (kind === 'gr') return [nm, isin, qty, num(), num(), num(), num(), num()];
    return [nm, qty, num()];
  });
  if (kind === 'zn') return ZERODHA_NEW(rows);
  if (kind === 'zo') return ZERODHA_OLD(rows);
  if (kind === 'gr') return GROWW(rows);
  if (kind === 'semi') return ['Scheme Name;Units;NAV;Current Value', ...rows.map(r => `${r[0]};${r[1]};${r[2]};${r[3]}`)].join('\n');
  return ['Foo,Bar', 'a,b'].join('\n');
}

test('parseHoldings equals the website on 700 random broker files (Zerodha old/new, Groww, semicolon, junk)', () => {
  let parsedRows = 0;
  for (let n = 0; n < 700; n++) {
    const text = randomFile();
    const theirs = JSON.parse(JSON.stringify(web.parseHoldings(text)));
    const mine = JSON.parse(JSON.stringify(app.parseHoldings(text)));
    assert.deepEqual(mine, theirs, text.slice(0, 200));
    parsedRows += mine.rows.length;
  }
  assert.ok(parsedRows > 500, 'compared ' + parsedRows + ' rows');
});

test('a real-shaped Zerodha Console file is read: names, quantity, average cost, value', () => {
  const t = ZERODHA_NEW([['RELIANCE', '10', '2450.5', '2890.0', '24505', '28900', '4395', '17.9%', '0.4%'], ['GOLDBEES', '100', '55.2', '68.5', '5520', '6850', '1330', '24%', '0.1%']]);
  const r = app.parseHoldings(t);
  assert.equal(r.format, 'generic');                         // the new Console header has no "Quantity Available" column
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0].qty, 10);
  assert.equal(r.rows[0].avg, 2450.5);
  assert.equal(r.rows[0].value, 28900);
  assert.equal(r.totals.invested, 30025);
});

test('tickerFrom accepts NSE symbols (with series suffixes) and rejects company names', () => {
  assert.equal(tickerFrom('RELIANCE'), 'RELIANCE');
  assert.equal(tickerFrom('hdfcbank-be'), 'HDFCBANK');
  assert.equal(tickerFrom('M&M'), 'M&M');
  assert.equal(tickerFrom('Reliance Industries Ltd'), null);
  assert.equal(tickerFrom(''), null);
});

test('toHoldings maps equity to Stock with a ticker, funds to MF by ISIN, and counts what cannot be priced live', () => {
  const rows = [
    { name: 'RELIANCE', isin: 'INE002A01018', kind: 'equity', qty: 10, avg: 2450, price: 2890, invested: 24500, value: 28900 },
    { name: 'Reliance Industries Ltd', isin: 'INE002A01018', kind: 'equity', qty: 5, avg: 2000, price: 2890, invested: 10000, value: 14450 },
    { name: 'Axis Bluechip Fund Direct Growth', isin: 'INF846K01DP8', kind: 'mf', qty: 120.5, avg: 40, price: 52, invested: 4820, value: 6266 },
  ] as any;
  const m = toHoldings(rows, '2026-10-12');
  assert.equal(m.holdings.length, 3);
  assert.deepEqual(m.holdings.map(h => [h.type, h.symbol]), [['Stock', 'RELIANCE'], ['Stock', 'INE002A01018'], ['MF', 'INF846K01DP8']]);
  assert.equal(m.unpriced, 2);
});

test('the same instrument listed twice is summed with a weighted average cost', () => {
  const rows = [
    { name: 'TCS', kind: 'equity', qty: 10, avg: 3000, price: 3500, value: 35000 },
    { name: 'TCS', kind: 'equity', qty: 30, avg: 4000, price: 3500, value: 105000 },
  ] as any;
  const h = toHoldings(rows, '2026-10-12').holdings;
  assert.equal(h.length, 1);
  assert.equal(h[0].units, 40);
  assert.equal(h[0].avgPrice, 3750);
});

test('planImport replaces a position, adds new ones, and importing the same file again changes nothing', () => {
  const file = toHoldings([
    { name: 'TCS', kind: 'equity', qty: 10, avg: 3000, price: 3500, value: 35000 },
    { name: 'INFY', kind: 'equity', qty: 20, avg: 1500, price: 1600, value: 32000 },
  ] as any, '2026-10-12').holdings;
  const existing = [{ id: 'a', type: 'Stock', symbol: 'TCS', name: 'TCS', units: 4, avgPrice: 2800 }, { id: 'b', type: 'Stock', symbol: 'ITC', name: 'ITC', units: 50, avgPrice: 400 }] as any;
  const p = planImport(existing, file);
  assert.deepEqual(p.add.map(h => h.symbol), ['INFY']);
  assert.equal(p.update.length, 1);
  assert.equal(p.update[0].patch.units, 10);                   // replaced, not 4 + 10
  assert.equal(p.unchanged, 0);
  // apply, then plan again against the result
  const applied = [{ ...existing[0], ...p.update[0].patch }, existing[1], { ...p.add[0], id: 'c' }] as any;
  const again = planImport(applied, file);
  assert.equal(again.add.length + again.update.length, 0);
  assert.equal(again.unchanged, 2);
});
