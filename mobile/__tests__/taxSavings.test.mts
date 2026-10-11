// Tax savings: the mobile savingsPlan must equal the website's FinosTaxCore.savingsPlan, and the screen's wiring (what is already
// claimed, which sections are summed) must match how html/tax.html and arya-sidebar-panel call it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as tax from '../lib/taxcore.ts';
import { computeView, SECTIONS, DEFAULT_INPUTS, verdict } from '../lib/taxSavings.ts';

const web = createRequire(import.meta.url)('../../js/finos-taxcore.js');

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
const R = rng(20261012);
const range = (lo: number, hi: number) => lo + R() * (hi - lo);

test('savingsPlan matches the website on 2,000 random incomes, section sets and claimed amounts', () => {
  for (let i = 0; i < 2000; i++) {
    const income = i < 8 ? [0, 100000, 775000, 1200000, 1275000, 1290000, 2400000, 5e7][i] : Math.round(range(0, 6e6));
    const sections = SECTIONS.map(s => ({ id: s.id, maxDeduction: s.maxDeduction === null ? null : Math.round(range(0, s.maxDeduction * 1.2)), kind: s.kind }));
    const opts = R() < 0.3 ? undefined : { alreadyClaimed80c: R() < 0.5 ? Math.round(range(0, 200000)) : undefined, alreadyClaimedOther: Math.round(range(0, 80000)) };
    assert.deepEqual(tax.savingsPlan(income, sections, opts), web.savingsPlan(income, sections, opts), `income ${income}`);
  }
});

test('the core sections add up exactly to the old-regime saving', () => {
  for (const income of [500000, 800000, 1500000, 2500000, 4000000]) {
    const p = tax.savingsPlan(income, SECTIONS, { alreadyClaimed80c: 0 });
    const sum = p.sections.filter(r => r.kind === 'core').reduce((t, r) => t + (r.taxSaved as number), 0);
    assert.equal(sum, p.oldPotential, String(income));
  }
});

test('a ₹10L salary: the new regime wins even with every deduction, so the saving is ₹0 and the screen says so', () => {
  const v = computeView({ ...DEFAULT_INPUTS, income: '1000000' });
  assert.equal(v.ok, true);
  assert.equal(v.plan!.potential, 0);
  assert.equal(v.plan!.currentRegime, 'new');
  assert.match(v.verdict!.text, /new regime is cheaper|No income tax is payable/);
});

test('a ₹30L income with little claimed has a real saving that is current minus the better regime', () => {
  const v = computeView({ ...DEFAULT_INPUTS, income: '3000000', used80c: '0' });
  const p = v.plan!;
  assert.ok(p.potential >= 0);
  assert.equal(p.potential, p.current - Math.min(p.newTax, p.oldOpt));
  assert.equal(computeView({ ...DEFAULT_INPUTS, income: '3000000', used80c: '0' }).rows.length, SECTIONS.length);
});

test('what is already claimed reduces each section\'s room and is counted in the old-regime baseline', () => {
  const none = computeView({ income: '2000000', used80c: '0', usedHealth: '0', usedNps: '0' });
  const claimed = computeView({ income: '2000000', used80c: '150000', usedHealth: '25000', usedNps: '50000' });
  const room = (v: ReturnType<typeof computeView>, id: string) => v.rows.find(r => r.id === id)!.headroom;
  assert.equal(room(none, 's80c'), 150000);
  assert.equal(room(claimed, 's80c'), 0);
  assert.equal(room(claimed, 's80d'), 0);
  assert.equal(room(claimed, 'nps'), 0);
  assert.ok(claimed.plan!.oldNow < none.plan!.oldNow, 'claiming deductions lowers the old-regime tax now');
  assert.equal(claimed.plan!.oldPotential, 0);
});

test('amounts above the legal cap and junk are clamped, and a low income shows no result', () => {
  const v = computeView({ income: '2,000,000', used80c: '9999999', usedHealth: '-5', usedNps: 'abc' });
  assert.equal(v.ok, true);
  assert.equal(v.rows.find(r => r.id === 's80c')!.headroom, 0);
  assert.equal(v.rows.find(r => r.id === 's80d')!.headroom, 25000);
  assert.equal(computeView({ ...DEFAULT_INPUTS, income: '50000' }).ok, false);
  assert.equal(computeView(DEFAULT_INPUTS).ok, false);
});

test('verdict wording covers the four situations', () => {
  const mk = (over: Partial<tax.SavingsPlan>) => ({ ...tax.savingsPlan(2000000, SECTIONS), ...over }) as tax.SavingsPlan;
  assert.equal(verdict(mk({ newTax: 0, oldNow: 0 })).tone, 'good');
  assert.equal(verdict(mk({ newTax: 1, oldNow: 5, newBeatsOldEvenOptimised: true, oldMinusNew: 1000, breakEvenDeductions: 300000 })).tone, 'good');
  assert.equal(verdict(mk({ newTax: 9, oldNow: 5, newBeatsOldEvenOptimised: false, potential: 20000 })).tone, 'warn');
  assert.equal(verdict(mk({ newTax: 9, oldNow: 5, newBeatsOldEvenOptimised: false, potential: 0 })).tone, 'info');
});
