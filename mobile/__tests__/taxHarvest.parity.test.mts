// The phone's harvesting arithmetic must equal the website's js/finos-tax-harvest.js (_analysePositions) for the same
// holdings, booked gains and day. The website reads the clock, so the sandbox gets a fixed "today".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as app from '../lib/taxHarvest.ts';

const SRC = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../js/finos-tax-harvest.js'), 'utf8');

function loadWeb(today: Date): any {
  const fixed = today.getTime();
  class FixedDate extends Date {
    constructor(...a: any[]) { if (a.length === 0) super(fixed); else super(...(a as [any])); }
    static now() { return fixed; }
  }
  const store: Record<string, string> = {};
  const win: any = {};
  const ls = { getItem: (k: string) => (k in store ? store[k] : null), setItem: (k: string, v: unknown) => { store[k] = String(v); } };
  const sandbox: any = { window: win, Math, JSON, Number, parseFloat, parseInt, String, Object, Array, console, Date: FixedDate, localStorage: ls, document: { getElementById: () => null } };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return { web: win.FinosTaxHarvest, store };
}
const plain = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

function rng(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const R = rng(20261013);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const TODAYS = [new Date(2026, 9, 13), new Date(2027, 2, 31), new Date(2026, 3, 1), new Date(2026, 0, 31)];

test('analysis equals the website on 1,200 random portfolios, across four different "today" dates', () => {
  for (const today of TODAYS) {
    const { web, store } = loadWeb(today);
    for (let t = 0; t < 300; t++) {
      const positions: app.Position[] = Array.from({ length: Math.floor(R() * 8) }, (_, i) => {
        const buy = Math.round((10 + R() * 4000) * 100) / 100;
        const cmp = Math.round(buy * (0.5 + R() * 1.1) * 100) / 100;
        const bought = new Date(today.getTime() - Math.floor(R() * 900) * 86400000);
        const p: app.Position = { id: 'p' + i, name: 'H' + i, type: 'equity', qty: Math.round((1 + R() * 500) * 1000) / 1000, buyPrice: buy, cmp };
        if (R() < 0.8) p.purchaseDate = iso(bought); else p.holdMonths = Math.floor(R() * 40);
        return p;
      });
      const ltcg = R() < 0.25 ? 0 : Math.round(R() * 400000), stcg = R() < 0.35 ? 0 : Math.round(R() * 300000);
      const w = plain(web._analysePositions(plain(positions), ltcg, stcg));
      const a = plain(app.analyse(positions, ltcg, stcg, today));
      assert.deepEqual(a.enriched.map(e => [e.id, e.holdMonths, e.isLong, e.gainType, e.gain, e.gainPct, e.costBasis, e.currentVal]),
        w.enriched.map((e: any) => [e.id, e.holdMonths, e.isLong, e.gainType, e.gain, e.gainPct, e.costBasis, e.currentVal]));
      assert.deepEqual(a.gainHarvestCandidates.map(c => [c.id, c.canHarvest, c.harvestQty]), w.gainHarvestCandidates.map((c: any) => [c.id, c.canHarvest, c.harvestQty]));
      for (const k of ['totalLTCGLoss', 'totalSTCGLoss', 'netLTCG', 'netSTCG', 'usedLTCG', 'headroom', 'taxSaved', 'gainHarvestAmount',
        'ltcgTaxBefore', 'ltcgTaxAfter', 'stcgTaxBefore', 'stcgTaxAfter'] as const) assert.equal(a[k], w[k], k);
      // the two numbers the website saves for other pages
      assert.equal(String(a.taxSaved), store.finos_harvest_tax_saved);
      assert.equal(String(a.netLTCG), store.finos_harvest_ltcg_net);
    }
  }
});

test('hand-computed: a ₹60,000 long-term loss and a ₹30,000 short-term loss against ₹2L LTCG and ₹50k STCG', () => {
  const today = new Date(2026, 9, 13);
  const ps: app.Position[] = [
    { id: 'a', name: 'LongLoser', type: 'equity', qty: 100, buyPrice: 1000, cmp: 400, purchaseDate: '2025-01-10' },   // -60,000, 21 months
    { id: 'b', name: 'ShortLoser', type: 'equity', qty: 50, buyPrice: 1000, cmp: 400, purchaseDate: '2026-08-01' },   // -30,000, 2 months
  ];
  const a = app.analyse(ps, 200000, 50000, today);
  assert.equal(a.totalLTCGLoss, 60000);
  assert.equal(a.totalSTCGLoss, 30000);
  assert.equal(a.netSTCG, 20000);
  assert.equal(a.netLTCG, 140000);
  // before: LTCG (200,000-125,000)=75,000 x 12.5% x 1.04 = 9,750 ; STCG 50,000 x 20% x 1.04 = 10,400
  assert.equal(a.ltcgTaxBefore, 9750);
  assert.equal(a.stcgTaxBefore, 10400);
  // after: LTCG (140,000-125,000)=15,000 x 13% = 1,950 ; STCG 20,000 x 20.8% = 4,160
  assert.equal(a.ltcgTaxAfter, 1950);
  assert.equal(a.stcgTaxAfter, 4160);
  assert.equal(a.taxSaved, (9750 - 1950) + (10400 - 4160));
});

test('a short-term loss left over after short-term gains offsets long-term gains; a long-term loss never offsets short-term gains', () => {
  const today = new Date(2026, 9, 13);
  const stl: app.Position = { id: 's', name: 's', type: 'equity', qty: 100, buyPrice: 1000, cmp: 500, purchaseDate: '2026-09-01' };   // -50,000 STCL
  const ltl: app.Position = { id: 'l', name: 'l', type: 'equity', qty: 100, buyPrice: 1000, cmp: 500, purchaseDate: '2024-01-01' };   // -50,000 LTCL
  const a = app.analyse([stl], 300000, 20000, today);
  assert.equal(a.netSTCG, 0);
  assert.equal(a.netLTCG, 300000 - 30000);                 // 50,000 loss - 20,000 STCG absorbed = 30,000 spills onto LTCG
  const b = app.analyse([ltl], 0, 80000, today);
  assert.equal(b.netSTCG, 80000);                           // LTCL cannot touch STCG
  assert.equal(b.taxSaved, 0);
});

test('gain harvesting only uses what is left of the ₹1.25 L exemption, biggest gain first', () => {
  const today = new Date(2026, 9, 13);
  const ps: app.Position[] = [
    { id: 'big', name: 'big', type: 'equity', qty: 100, buyPrice: 1000, cmp: 1800, purchaseDate: '2023-01-01' },   // +80,000
    { id: 'small', name: 'small', type: 'equity', qty: 100, buyPrice: 1000, cmp: 1400, purchaseDate: '2023-01-01' }, // +40,000
    { id: 'young', name: 'young', type: 'equity', qty: 100, buyPrice: 1000, cmp: 2000, purchaseDate: '2026-06-01' }, // short-term: never harvested
  ];
  const a = app.analyse(ps, 25000, 0, today);              // headroom = 100,000
  assert.equal(a.headroom, 100000);
  assert.deepEqual(a.gainHarvestCandidates.map(c => [c.id, c.canHarvest]), [['big', 80000], ['small', 20000]]);
  assert.equal(a.gainHarvestAmount, 100000);
  assert.equal(a.gainHarvestCandidates[0].harvestQty, 100);
  assert.equal(app.analyse(ps, 125000, 0, today).gainHarvestCandidates.length, 0);   // exemption already used
});

test('holding period: 12 months counts only once the day of the month has come round', () => {
  const today = new Date(2026, 9, 13);
  assert.equal(app.monthsHeld({ purchaseDate: '2025-10-13' }, today), 12);
  assert.equal(app.monthsHeld({ purchaseDate: '2025-10-14' }, today), 11);
  assert.equal(app.monthsHeld({ purchaseDate: '2027-01-01' }, today), 0);        // future date never goes negative
  assert.equal(app.monthsHeld({ holdMonths: 18 }, today), 18);
});

test('tax year suffix flips on 1 April', () => {
  assert.equal(app.taxYearSuffix(new Date(2026, 2, 31)), '2025_26');
  assert.equal(app.taxYearSuffix(new Date(2026, 3, 1)), '2026_27');
  assert.deepEqual(app.bookedKeys(new Date(2026, 9, 13)), { ltcg: 'finos_th_ltcg_2026_27', stcg: 'finos_th_stcg_2026_27' });
});

test('normalise drops junk, zero and negative holdings, and keeps good ones', () => {
  assert.deepEqual(app.normalisePositions(null), []);
  const n = app.normalisePositions([
    { id: 'ok', name: ' Infy ', qty: '10', buyPrice: 100, cmp: 120, purchaseDate: '2024-01-01' },
    { name: '', qty: 1, buyPrice: 1, cmp: 1 }, { name: 'x', qty: 0, buyPrice: 1, cmp: 1 }, { name: 'y', qty: 1, buyPrice: -1, cmp: 1 },
    { name: 'z', qty: 'abc', buyPrice: 1, cmp: 1 }, 'nope', null,
  ]);
  assert.equal(n.length, 1);
  assert.equal(n[0].qty, 10);
});

test('add-holding form: rejects blanks, non-positive numbers, impossible and future dates', () => {
  const now = new Date(2026, 9, 13);
  const ok = { name: 'HDFC Bank', qty: '10', buy: '1500', cmp: '1600', date: '2025-01-15' };
  assert.ok('position' in app.parseNewPosition(ok, now));
  for (const bad of [{ ...ok, name: ' ' }, { ...ok, qty: '0' }, { ...ok, buy: '-5' }, { ...ok, cmp: '' }, { ...ok, date: '2026-02-30' }, { ...ok, date: '2027-01-01' }, { ...ok, date: '15/01/2025' }]) {
    assert.ok('error' in app.parseNewPosition(bad, now), JSON.stringify(bad));
  }
});
