// The phone's PULSE ranking must order, explain and diff exactly as the website's js/arya-pulse-rank.js does.
// Both are run on random contexts (including junk: null, '', 'abc', NaN, Infinity, negatives, strings) and on hand-written edge cases.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as app from '../lib/pulseRank.ts';

const require = createRequire(import.meta.url);
const web = require(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../js/arya-pulse-rank.js'));

// small seeded PRNG so a failure can be reproduced
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const JUNK: unknown[] = [null, undefined, '', 'abc', NaN, Infinity, -Infinity, -5, 0, '0', '1e3', ' 42 ', true, false, [], [7], {}, '₹5,000', 1e15];
const FIELDS = ['income', 'expense', 'debt', 'emergencyFund', 'sip', 'goals', 'policies', 'holdings', 'txns', 'netWorth', 'gap80c', 'age', 'moneyScore'];

function randomCtx(r: () => number) {
  const ctx: Record<string, unknown> = {};
  for (const f of FIELDS) {
    const k = r();
    if (k < 0.12) continue;                                              // absent
    if (k < 0.27) ctx[f] = JUNK[Math.floor(r() * JUNK.length)];
    else if (f === 'goals' || f === 'policies' || f === 'txns') ctx[f] = Math.floor(r() * 6);
    else if (f === 'age') ctx[f] = Math.floor(r() * 80);
    else if (f === 'moneyScore') ctx[f] = k < 0.5 ? Math.round(r() * 140 - 20) : r() * 100;
    else ctx[f] = Math.round(r() * (k < 0.5 ? 100000 : 5e7));
  }
  if (r() > 0.1) ctx.month = 1 + Math.floor(r() * 12);
  return ctx;
}

test('rank gives the same order, scores and reasons as the website on 600 random contexts', () => {
  const r = rng(20261014);
  for (let i = 0; i < 600; i++) {
    const ctx = randomCtx(r);
    assert.deepEqual(app.rank(ctx as any), web.rank(ctx), JSON.stringify(ctx, (_, v) => (v === undefined ? 'undefined' : typeof v === 'number' && !Number.isFinite(v) ? String(v) : v)));
  }
});

test('without a month both read the clock the same way', () => {
  mock.timers.enable({ apis: ['Date'], now: new Date(2026, 1, 10).getTime() });      // February: tax season
  try {
    const feb = web.rank({ income: 100000 });
    assert.deepEqual(app.rank({ income: 100000 }), feb);
    assert.ok(feb.find((x: any) => x.id === 'taxDashboard').score >= 84);
  } finally { mock.timers.reset(); }
  mock.timers.enable({ apis: ['Date'], now: new Date(2026, 7, 10).getTime() });      // August
  try { assert.deepEqual(app.rank({ income: 100000 }), web.rank({ income: 100000 })); } finally { mock.timers.reset(); }
});

test('the default order, the pinned widgets and the number of widgets are the same', () => {
  assert.deepEqual([...app.DEFAULT_ORDER], web.DEFAULT_ORDER);
  assert.deepEqual([...app.PINNED], web.PINNED);
  assert.equal(app.rank({}).length, web.DEFAULT_ORDER.length);
});

test('hand-written edge cases: money score bands, heavy debt, tax season, no income', () => {
  const cases = [
    { month: 7 }, { month: 2, income: 100000, expense: 90000, debt: 2000000, policies: 0, goals: 2 },
    { month: 3, income: 50000, moneyScore: 39 }, { month: 3, income: 50000, moneyScore: 40 }, { month: 3, moneyScore: 59.5 }, { month: 6, moneyScore: 60 },
    { month: 6, moneyScore: 79 }, { month: 6, moneyScore: 80 }, { month: 6, moneyScore: 100 }, { month: 6, moneyScore: 101 }, { month: 6, moneyScore: -3 },
    { month: 6, moneyScore: 'junk' }, { month: 6, moneyScore: '' }, { month: 6, moneyScore: null },
    { month: 8, income: 100000, debt: 360000 }, { month: 8, income: 100000, debt: 360001 }, { month: 8, income: 0, debt: 5 },
    { month: 9, income: 100000, emergencyFund: 1200001 }, { month: 9, income: 100000, emergencyFund: 1200000 },
    { month: 10, age: 34, income: 1 }, { month: 10, age: 35 }, { month: 10, age: 39 }, { month: 10, age: 40 },
    { month: 12, gap80c: 1 }, { month: 5, gap80c: 150000 }, { month: 5, income: 100000, expense: 80000 }, { month: 5, income: 100000, expense: 80001 },
    { month: 5, income: 100000, expense: 250000 },
  ];
  for (const c of cases) assert.deepEqual(app.rank(c), web.rank(c), JSON.stringify(c));
});

test('snapshot matches on random contexts and on a fixed clock', () => {
  const r = rng(77);
  for (let i = 0; i < 300; i++) {
    const ctx = randomCtx(r);
    const a = app.snapshot(ctx as any, 1_700_000_000_000);
    mock.timers.enable({ apis: ['Date'], now: 1_700_000_000_000 });
    let w: any;
    try { w = web.snapshot(ctx); } finally { mock.timers.reset(); }
    assert.deepEqual(a, w);
  }
});

test('diff matches on random snapshot pairs, including too-soon pairs and missing snapshots', () => {
  const r = rng(4242);
  const snap = () => ({
    at: 1_700_000_000_000 + Math.floor(r() * 40) * 3600 * 1000, netWorth: Math.round(r() * 5e6), debt: Math.round(r() * 2e6), sip: Math.round(r() * 5e4),
    savingsRate: r() < 0.2 ? null : Math.round(r() * 100 - 20), emergencyMonths: r() < 0.2 ? null : Math.round(r() * 120) / 10,
    policies: Math.floor(r() * 4), goals: Math.floor(r() * 5), moneyScore: r() < 0.3 ? null : Math.round(r() * 100),
  });
  let nonEmpty = 0;
  for (let i = 0; i < 800; i++) {
    const a = snap(), b = { ...snap(), at: a.at + Math.floor(r() * 30) * 3600 * 1000 };
    const got = app.diff(a, b), want = web.diff(a, b);
    assert.deepEqual(got, want);
    if (want.length) nonEmpty++;
  }
  assert.ok(nonEmpty > 100, 'the random pairs must exercise real differences');
  assert.deepEqual(app.diff(null, snap()), web.diff(null, snap()));
  assert.deepEqual(app.diff(snap(), undefined), []);
  const base = snap();
  assert.deepEqual(app.diff(base, { ...base, at: base.at + 6 * 3600 * 1000 - 1, netWorth: base.netWorth + 1e6 }), []);   // under six hours: nothing
});

test('the website file is the one under test (not a stub)', () => {
  assert.equal(typeof web.rank, 'function');
  assert.ok(web.DEFAULT_ORDER.length === 27);
});
