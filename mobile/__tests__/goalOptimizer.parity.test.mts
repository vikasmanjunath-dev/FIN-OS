// The phone's goal optimizer must equal the website's js/finos-goal-optimizer.js (as corrected) for the same goals, income and day.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as app from '../lib/goalOptimizer.ts';

const SRC = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../js/finos-goal-optimizer.js'), 'utf8');
const NOW = new Date(2026, 9, 12).getTime();
const store: Record<string, string> = {};
function loadWeb(): any {
  const win: any = {};
  const ls = { getItem: (k: string) => (k in store ? store[k] : null), setItem: (k: string, v: unknown) => { store[k] = String(v); } };
  class FakeDate extends Date { constructor(...a: any[]) { if (a.length === 0) super(NOW); else super(...(a as [any])); } static now() { return NOW; } }
  const sandbox: any = { window: win, Math, JSON, Number, parseFloat, parseInt, String, Object, Array, console, Date: FakeDate, localStorage: ls, document: { getElementById: () => null } };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return win.FinosGoalOptimizer;
}
const web = loadWeb();
const j = (x: unknown) => JSON.parse(JSON.stringify(x));
function rng(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const R = rng(20261012);
const pick = <T,>(a: T[]) => a[Math.floor(R() * a.length)];

function randGoals(): app.GoalIn[] {
  return Array.from({ length: 1 + Math.floor(R() * 5) }, (_, i) => {
    const y = 2026 + Math.floor(R() * 25), m = 1 + Math.floor(R() * 12);
    const target = Math.round((50000 + R() * 2e7) / 1000) * 1000;
    const g: app.GoalIn = { id: R() < 0.7 ? 'g' + i : undefined, name: pick(['House down payment', 'Car', 'Child education', 'Europe trip', 'Wedding', 'Retirement', 'Emergency buffer', 'Gadget']), target, current: R() < 0.4 ? 0 : Math.round(R() * target * 0.8 / 1000) * 1000 };
    if (R() < 0.85) g.target_date = `${y}-${String(m).padStart(2, '0')}`;
    if (R() < 0.15) g.progress = Math.round(R() * 100);
    return g;
  });
}

test('every goal field, the totals, feasibility and conflicts equal the website on 800 random goal sets', () => {
  for (let n = 0; n < 800; n++) {
    const goals = randGoals();
    const income = Math.round(20000 + R() * 400000), rate = Math.round(5 + R() * 50);
    Object.keys(store).forEach(k => delete store[k]);
    store.finos_goals = JSON.stringify(goals); store.finos_monthly_income = String(income); store.finos_savings_rate = String(rate);
    const theirs = j(web._compute());
    const mine = j(app.compute(goals, { income, savingsRate: rate }, new Date(NOW)));
    assert.deepEqual(mine.goals, theirs.goals, JSON.stringify(goals));
    for (const k of ['income', 'savingsRate', 'availableSIP', 'totalSIPNeeded', 'feasibility']) assert.equal(mine[k], theirs[k], k);
    assert.deepEqual(mine.conflicts, theirs.conflicts);
    assert.equal(store.finos_goals_total_sip, String(mine.totalSIPNeeded));
  }
});

test('money already saved compounds as today\'s rupees: ₹5L saved toward ₹10L in 5 years at 10% needs a small SIP, not the inflated-percentage one', () => {
  const r = app.compute([{ id: 'a', name: 'Car fund', target: 1000000, current: 500000, target_date: '2031-10' }], { income: 100000, savingsRate: 30 }, new Date(NOW));
  const g = r.goals[0];
  assert.equal(g.fundedAmt, 500000);
  assert.equal(g.targetInflated, Math.round(1000000 * Math.pow(1.06, g.monthsLeft / 12)));
  const direct = app.sip(g.targetInflated, 0.07, g.monthsLeft, 500000);       // "car" earns 7%
  assert.equal(g.sipNeeded, direct);
});

test('a goal already fully funded needs no SIP and feasibility is 100', () => {
  const r = app.compute([{ id: 'a', name: 'Trip', target: 100000, current: 200000, target_date: '2028-10' }], { income: 50000, savingsRate: 20 }, new Date(NOW));
  assert.equal(r.goals[0].sipNeeded, 0);
  assert.equal(r.feasibility, 100);
});

test('return rates follow the goal wording and priority bands are as the website labels them', () => {
  assert.equal(app.goalReturn({ name: 'Home loan margin' }), 0.08);
  assert.equal(app.goalReturn({ name: 'Child education' }), 0.10);
  assert.equal(app.goalReturn({ name: 'Emergency fund' }), 0.065);
  assert.equal(app.goalReturn({ name: 'Something else' }), 0.10);
  assert.deepEqual([80, 60, 30, 10].map(p => app.badge(p).label), ['Urgent', 'High', 'Medium', 'Low']);
});
