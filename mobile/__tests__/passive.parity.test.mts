// The phone's passive-income arithmetic must equal the website's js/finos-passive-income.js _recompute for the same streams.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as app from '../lib/passive.ts';

const SRC = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../js/finos-passive-income.js'), 'utf8');
const store: Record<string, string> = {};
function loadWeb(): any {
  const win: any = {};
  const ls = { getItem: (k: string) => (k in store ? store[k] : null), setItem: (k: string, v: unknown) => { store[k] = String(v); } };
  const sandbox: any = { window: win, Math, JSON, Number, parseFloat, parseInt, String, Object, Array, console, Date, localStorage: ls, document: { getElementById: () => null } };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return win.FinosPassiveIncome;
}
const web = loadWeb();
function rng(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const R = rng(20261012);

test('total and coverage equal the website on 800 random stream lists, including no expenses and over-coverage', () => {
  for (let n = 0; n < 800; n++) {
    const streams: app.Stream[] = Array.from({ length: 1 + Math.floor(R() * 8) }, (_, i) => ({
      id: 's' + i, type: app.TYPES[Math.floor(R() * app.TYPES.length)], label: 'x', monthly: R() < 0.3 ? 0 : Math.round(R() * 80000), taxable: R() < 0.5, note: '',
    }));
    const exp = R() < 0.15 ? 0 : Math.round(10000 + R() * 150000);
    Object.keys(store).forEach(k => delete store[k]);
    store.finos_passive_streams = JSON.stringify(streams);
    if (exp) store.finos_monthly_expense = String(exp);
    web._recompute();
    const s = app.summarize(streams, exp);
    assert.equal(String(s.total), store.finos_passive_total_mo);
    assert.equal(s.coverage.toFixed(1), store.finos_passive_coverage);
  }
});

test('hand-computed: ₹12,000 of ₹40,000 spending is 30% covered, building up, and needs ₹8.4L more corpus at 4%', () => {
  const s = app.summarize([{ id: 'a', type: 'dividend', label: '', monthly: 8000, taxable: true, note: '' }, { id: 'b', type: 'swp', label: '', monthly: 4000, taxable: false, note: '' }], 40000);
  assert.equal(s.total, 12000);
  assert.equal(s.coverage, 30);
  assert.equal(s.label, 'Building up');
  assert.equal(s.taxable, 8000);
  assert.equal(s.taxFree, 4000);
  assert.equal(s.gap, 28000);
  assert.equal(s.additionalCorpus, 8400000);               // 28,000 × 12 ÷ 0.04
});

test('coverage is capped at 200% and is 0 when no spending is known', () => {
  assert.equal(app.summarize([{ id: 'a', type: 'fd', label: '', monthly: 500000, taxable: true, note: '' }], 10000).coverage, 200);
  assert.equal(app.summarize([{ id: 'a', type: 'fd', label: '', monthly: 5000, taxable: true, note: '' }], 0).coverage, 0);
});

test('seed estimates FD interest at 7% and the SGB coupon from the bonds, and labels both', () => {
  const s = app.seed(600000, 12000);
  assert.equal(s[1].monthly, 3500);
  assert.match(s[1].note, /Estimated/);
  assert.equal(s[4].monthly, 1000);
  assert.equal(app.seed(0, 0).every(x => x.monthly === 0), true);
});

test('normalise drops junk and keeps valid streams', () => {
  assert.equal(app.normalise(null), null);
  assert.equal(app.normalise([]), null);
  const n = app.normalise([{ id: 'a', type: 'weird', monthly: '-5', taxable: 1 }, { nope: true }]);
  assert.equal(n!.length, 1);
  assert.deepEqual([n![0].type, n![0].monthly, n![0].taxable], ['other', 0, true]);
});

test('milestones and what-if rows follow the coverage', () => {
  assert.deepEqual(app.MILESTONES.map(m => m.pct), [25, 50, 75, 100]);
  const sc = app.scenarios(10000, 40000);
  assert.equal(sc[0].coverage, 26.25);
  assert.equal(sc[4].coverage, 50);
});
