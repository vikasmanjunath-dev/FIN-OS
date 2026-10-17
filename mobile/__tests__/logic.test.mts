// Pure app logic that used to be checked only by throwaway scripts: budget maths (parity with the website),
// holdings sync, recurring schedule, and the retirement / health formulas (hand-derived values).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as budget from '@/lib/budget';
import * as holdings from '@/lib/holdings';
import * as recurring from '@/lib/recurring';
import * as retirement from '@/lib/retirement';
import * as trackers from '@/lib/trackers';

const webBudget = createRequire(import.meta.url)('../../js/finos-budget.js');

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
const R = rng(20261011);
const pick = <T,>(a: readonly T[]) => a[Math.floor(R() * a.length)];
const int = (lo: number, hi: number) => lo + Math.floor(R() * (hi - lo + 1));

/* ── budget: the app's port must match js/finos-budget.js ─────────────── */
const labels = ['Swiggy dinner', 'Rent', 'SIP Nifty index', 'Salary credited', 'Uber ride', 'Netflix', 'Zerodha', 'electricity bill', 'PhonePe to Ravi', 'LIC premium', 'Amazon order', 'Dividend received', ''];
const cats = ['Food & Dining', 'need_food', 'invest_sip', 'salary', 'rent', 'save_emergency', 'want_fun', 'Transport', 'income', '', undefined];
const types = ['expense', 'income', 'credit', 'debit', 'saving', 'save_goal', 'invest', undefined];
function randTxn(i: number): any {
  const day = `2026-${String(int(8, 10)).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`;
  return {
    id: R() < 0.7 ? `t${i}` : undefined,
    date: pick([day, `${day}T10:00:00+05:30`, 'not a date', undefined]),
    amount: pick([int(10, 90000), -int(10, 5000), 0, 'abc', '1,200']),
    type: pick(types), category: pick(cats), label: pick(labels), description: pick([undefined, 'groceries', 'fuel']),
  };
}

test('budget: normalize / normalizeAll match the website on 3,000 random raw records', () => {
  for (let i = 0; i < 3000; i++) {
    const raw = randTxn(i);
    assert.deepEqual(budget.normalize(raw), webBudget.normalize(raw), JSON.stringify(raw));
  }
  const batch = Array.from({ length: 200 }, (_, i) => randTxn(i));
  const strip = (l: any[]) => l.map(({ i, ...t }) => t);
  assert.deepEqual(strip(budget.normalizeAll(batch)), webBudget.normalizeAll(batch));
});

test('budget: category suggestion, status and suggested limits match the website', () => {
  for (const l of labels) assert.equal(budget.canonicalCategory(l), webBudget.canonicalCategory(l), l);
  const now = new Date(2026, 9, 18, 12);
  for (let n = 0; n < 150; n++) {
    const raw = Array.from({ length: int(0, 40) }, (_, i) => randTxn(i));
    const mobileTx = budget.normalizeAll(raw);
    const webTx = webBudget.normalizeAll(raw);
    const limits = Object.fromEntries(['Food & Dining', 'Transport', 'Bills & Utilities', 'Shopping'].filter(() => R() < 0.6).map(c => [c, int(500, 20000)]));
    assert.deepEqual(budget.budgetStatus(mobileTx, limits, now), webBudget.status(webTx, limits, now), `status ${n}`);
    const income = pick([0, 40000, 120000]);
    assert.deepEqual(budget.suggestLimits(mobileTx, income, now), webBudget.suggest(webTx, income, now), `suggest ${n}`);
  }
});

test('budget: an app-written category sticks; savings and income never count as spending', () => {
  const t = budget.normalize({ id: 'x', date: '2026-10-05', amount: 500, type: 'expense', category: 'Food & Dining', label: 'Uber', cat: 'Transport' });
  assert.equal(t?.category, 'Transport');
  const txns = budget.normalizeAll([
    { id: '1', date: '2026-10-02', amount: 90000, type: 'income', category: 'salary', label: 'Salary' },
    { id: '2', date: '2026-10-03', amount: 10000, type: 'saving', category: 'invest_sip', label: 'SIP' },
    { id: '3', date: '2026-10-04', amount: 800, type: 'expense', category: 'Food & Dining', label: 'Dinner' },
  ]);
  assert.equal(budget.monthSpend(txns, '2026-10').total, 800);
});

/* ── holdings sync: last-write-wins with tombstones ───────────────────── */
const H = (symbol: string, over: Partial<holdings.Holding> = {}): holdings.Holding => ({
  id: `Stock:${symbol}`, type: 'Stock', symbol, name: symbol, units: 10, avgPrice: 100, ...over,
});
const remoteRow = (symbol: string, over: Partial<holdings.RemoteHolding> = {}): holdings.RemoteHolding => ({
  symbol, asset_type: 'equity', quantity: 10, avg_price: 100, current_price: null, name: symbol, sip_monthly: null, updated_at: '2026-10-01T00:00:00Z', ...over,
});
const NOW = '2026-10-11T00:00:00Z';

test('holdings sync: new on either side is copied, newer edit wins, deletes propagate', () => {
  // remote-only → added locally; local-only never synced → pushed
  let p = holdings.planSync([H('INFY')], [remoteRow('TCS')], [], NOW);
  assert.deepEqual(p.next.map(h => h.symbol).sort(), ['INFY', 'TCS']);
  assert.deepEqual(p.upserts.map(h => h.symbol), ['INFY']);

  // both: newer updatedAt wins
  p = holdings.planSync([H('TCS', { units: 99, updatedAt: '2026-10-05T00:00:00Z', syncedAt: '2026-10-01T00:00:00Z' })], [remoteRow('TCS', { quantity: 10 })], [], NOW);
  assert.equal(p.next[0].units, 99);
  assert.equal(p.upserts.length, 1);
  p = holdings.planSync([H('TCS', { units: 99, updatedAt: '2026-09-01T00:00:00Z', syncedAt: '2026-09-01T00:00:00Z' })], [remoteRow('TCS', { quantity: 10 })], [], NOW);
  assert.equal(p.next[0].units, 10);

  // synced before + now gone from the cloud → deleted elsewhere → dropped locally
  p = holdings.planSync([H('WIPRO', { syncedAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' })], [], [], NOW);
  assert.equal(p.next.length, 0);

  // local delete (tombstone) newer than the cloud row → delete remotely
  p = holdings.planSync([], [remoteRow('HDFCBANK')], [{ key: 'Stock:HDFCBANK', at: '2026-10-09T00:00:00Z' }], NOW);
  assert.deepEqual(p.deletes.map(h => h.symbol), ['HDFCBANK']);
  assert.equal(p.next.length, 0);
});

test('holdings: asset types the app does not manage (gold, F&O) are ignored, not corrupted', () => {
  assert.equal(holdings.fromRemote(remoteRow('GOLDBEES', { asset_type: 'gold' })), null);
  assert.equal(holdings.fromRemote(remoteRow('NIFTY25000CE', { asset_type: 'options' })), null);
  assert.equal(holdings.fromRemote(remoteRow('X', { quantity: null })), null);
  assert.equal(holdings.fromRemote(remoteRow('0P0000XVHG', { asset_type: 'mutual_fund' }))?.type, 'MF');
});

/* ── recurring entries ────────────────────────────────────────────────── */
const item = (over: Partial<recurring.Recurring> = {}): recurring.Recurring => ({
  id: 'r1', kind: 'expense', amount: 25000, category: 'Rent', label: 'Rent', day: 5, startDate: '2026-07-20', lastRun: null, active: true, ...over,
});

test('recurring: never back-fills before the start date, walks month by month, ids are deterministic', () => {
  const r = recurring.dueEntries(item(), new Date(2026, 9, 11));          // 11 Oct 2026
  assert.deepEqual(r.entries.map(e => e.date), ['2026-08-05', '2026-09-05', '2026-10-05']);   // 5 Jul is before 20 Jul start → skipped
  assert.equal(r.entries[0].id, 'rec_r1_2026-08');
  assert.equal(r.lastRun, '2026-10');
  // already created ids are not duplicated
  const again = recurring.dueEntries(item({ lastRun: '2026-08' }), new Date(2026, 9, 11), new Set(['rec_r1_2026-09']));
  assert.deepEqual(again.entries.map(e => e.date), ['2026-10-05']);
});

test('recurring: month-end clamp, future dates wait, paused items produce nothing, catch-up is capped', () => {
  assert.equal(recurring.dueDateIn({ day: 31 }, '2026-02'), '2026-02-28');
  assert.equal(recurring.dueDateIn({ day: 31 }, '2028-02'), '2028-02-29');
  assert.deepEqual(recurring.dueEntries(item({ day: 25, startDate: '2026-10-01' }), new Date(2026, 9, 11)).entries, []);   // due 25 Oct, today 11 Oct
  assert.deepEqual(recurring.dueEntries(item({ active: false }), new Date(2026, 9, 11)).entries, []);
  const long = recurring.dueEntries(item({ startDate: '2020-01-01' }), new Date(2026, 9, 11));
  assert.ok(long.entries.length <= 24, `capped, got ${long.entries.length}`);
});

/* ── retirement formulas (values derived by hand from the published rules) ── */
test('EPF: employee 12% of basic; employer 3.67% to EPF; EPS is 8.33% of wage capped at ₹15,000', () => {
  // rules as published in js/finos-epf-tracker.js's header — derived by hand, not read back from the code
  const c = retirement.epfContributions(50000);
  assert.equal(c.empEPF, 6000);        // 12% × 50,000
  assert.equal(c.emprEPF, 1835);       // 3.67% × 50,000
  assert.equal(c.eps, 1250);           // 8.33% × min(50,000, 15,000) = 1,249.5 → 1,250
  assert.equal(c.totalEPF, 7835);      // what lands in the EPF account
  assert.equal(c.total, 9085);
  const low = retirement.epfContributions(10000);   // under the cap: EPS follows the real wage
  assert.equal(low.eps, 833);
});

test('NPS: tax saved is 0 at 0% slab and scales with slab; weighted return follows the allocation', () => {
  assert.equal(retirement.npsTaxSaved(150000, 0, 0), 0);
  assert.ok(retirement.npsTaxSaved(150000, 0, 30) > retirement.npsTaxSaved(150000, 0, 10));
  const allEquity = retirement.npsWeightedReturn(100, 0, 0);
  const allG = retirement.npsWeightedReturn(0, 0, 100);
  assert.ok(allEquity > allG);
});

test('insurance: 2× health, 15× life, 5× critical illness of annual income', () => {
  const cov = retirement.computeCoverage([], 100000, 35);       // ₹1L/month = ₹12L/yr
  assert.equal(cov.recHealth, 2_400_000);
  assert.equal(cov.recLife, 18_000_000);
  assert.equal(cov.recCritical, 6_000_000);
  assert.ok(cov.gaps.length > 0, 'no policies → gaps reported');
});

test('health score: 7 pillars, 0–100, and a person with nothing recorded scores lower than a well-set-up one', () => {
  const empty = trackers.computeAll(trackers.EMPTY_TRACKER_DATA).health;
  assert.ok(empty.total >= 0 && empty.total <= 100);
  const good = trackers.computeAll({
    ...trackers.EMPTY_TRACKER_DATA, income: 100000, expense: 50000, emergencyFund: 400000, emergencyTarget: 6, used80c: 150000, monthlySip: 20000,
  }).health;
  assert.ok(good.total > empty.total, `${good.total} should beat ${empty.total}`);
});
test('budget: web and mobile reject partially numeric imported amounts consistently', () => {
  for (const amount of ['1200oops', '1,2,00', '₹1,20,00', '1.2.3', '--200', '1e3']) {
    const raw = { amount, date: '2026-10-05', category: 'transport' };
    assert.equal(budget.normalize(raw), null, `mobile accepted ${amount}`);
    assert.equal(webBudget.normalize(raw), null, `web accepted ${amount}`);
  }
  for (const amount of ['1,200.50', '-1,200', '  ₹ 1,200  ']) {
    const raw = { amount, date: '2026-10-05', category: 'transport' };
    assert.deepEqual(budget.normalize(raw), webBudget.normalize(raw), `valid parse diverged for ${amount}`);
  }
});

test('budget: web and mobile reject impossible calendar days and accept leap days', () => {
  for (const date of ['2026-02-30', '2026-13-01', '2026-04-31', '2025-02-29']) {
    const raw = { amount: 500, date, category: 'transport' };
    assert.equal(budget.normalize(raw), null, `mobile accepted ${date}`);
    assert.equal(webBudget.normalize(raw), null, `web accepted ${date}`);
  }
  const leap = { amount: 500, date: '2024-02-29', category: 'transport' };
  assert.equal(budget.normalize(leap)?.date, leap.date);
  assert.deepEqual(budget.normalize(leap), webBudget.normalize(leap));
