// The phone's credit score maths must give what the website's js/finos-credit-score.js gives for the same entered numbers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as app from '../lib/creditScore.ts';
import { BANDS } from '../lib/creditScoreData.ts';

const SRC = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../js/finos-credit-score.js'), 'utf8');
function loadWeb(): any {
  const store: Record<string, string> = {};
  const win: any = {};
  const sandbox: any = { window: win, Math, JSON, Number, parseFloat, parseInt, console, document: { getElementById: () => null },
    localStorage: { getItem: (k: string) => (k in store ? store[k] : null), setItem: (k: string, v: string) => { store[k] = String(v); } } };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return win.FinosCreditScore;
}
const web = loadWeb();
const j = (x: unknown) => JSON.parse(JSON.stringify(x));

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
const R = rng(20261012);

test('compute matches the website on 2,000 random profiles, edges of every band included', () => {
  const edges = [300, 599, 600, 649, 650, 699, 700, 749, 750, 799, 800, 900];
  for (let i = 0; i < 2000; i++) {
    const score = i < edges.length ? edges[i] : 300 + Math.floor(R() * 601);
    const inputs = { score, utilization: Math.round(R() * 100), latePayments: Math.floor(R() * 5), recentInquiries: Math.floor(R() * 6),
      oldestAgeYears: Math.round(R() * 15 * 10) / 10, securedAccounts: Math.floor(R() * 3), unsecuredAccounts: Math.floor(R() * 3) };
    const a = app.compute(inputs), { b: band, ...rest } = j(web._compute({ ...inputs, entered: true }));      // the website calls the band `b`
    assert.deepEqual(j(a), { ...rest, band }, JSON.stringify(inputs));
  }
});

test('the bands tile 300–900 with no gap and no overlap, and every band has a wording', () => {
  const sorted = BANDS.slice().sort((x, y) => x.min - y.min);
  assert.equal(sorted[0].min, 300);
  assert.equal(sorted[sorted.length - 1].max, 900);
  for (let i = 1; i < sorted.length; i++) assert.equal(sorted[i].min, sorted[i - 1].max + 1);
  assert.ok(BANDS.every(b => b.desc.length > 20 && b.label));
});

test('fromFields: nothing is produced until a valid score is typed, and blanks stay unknown rather than becoming defaults', () => {
  assert.equal(app.fromFields({ score: '', util: '40', late: '1', inquiries: '3' }), null);
  assert.equal(app.fromFields({ score: '299', util: '', late: '', inquiries: '' }), null);
  assert.equal(app.fromFields({ score: '901', util: '', late: '', inquiries: '' }), null);
  assert.equal(app.fromFields({ score: '75', util: '', late: '', inquiries: '' }), null);
  const p = app.fromFields({ score: '742', util: '', late: '', inquiries: '0' })!;
  assert.deepEqual(p.inputs, { score: 742, utilization: 0, latePayments: 0, recentInquiries: 0 });
  assert.deepEqual(p.known, { util: false, late: false, inquiries: true });
  assert.equal(app.fromFields({ score: '700', util: '250', late: '', inquiries: '' })!.inputs.utilization, 100);        // clamped
});

test('no tip comes from a number nobody typed: only the always-on payment tip and the generic age tip', () => {
  const r = app.compute(app.fromFields({ score: '760', util: '', late: '', inquiries: '' })!.inputs);
  assert.deepEqual(r.activeTips.map(t => t.category), ['Payments', 'Credit Age']);
  assert.ok(!r.activeTips.some(t => t.tip.includes('delinquencies')));
});
