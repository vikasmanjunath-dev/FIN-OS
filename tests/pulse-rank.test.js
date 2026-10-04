const test = require('node:test');
const assert = require('node:assert');
const P = require('../js/arya-pulse-rank.js');

const ids = (ctx) => P.rank(ctx).map((r) => r.id);
const pos = (ctx, id) => ids(ctx).indexOf(id);
const NEW_USER = { month: 7, income: 0 };

test('every widget appears exactly once; pinned ones are always first', () => {
  for (const ctx of [NEW_USER, { month: 2, income: 100000, debt: 900000, holdings: 500000, goals: 3 }]) {
    const r = ids(ctx);
    assert.strictEqual(r.length, P.DEFAULT_ORDER.length);
    assert.strictEqual(new Set(r).size, r.length);
    assert.deepStrictEqual(r.slice(0, 2), ['crossPageHUD', 'smartInsightCards']);
  }
});

test('tax widgets climb in Jan–Mar and sit mid-pack otherwise', () => {
  const base = { income: 100000, expense: 60000, policies: 1, goals: 1 };
  assert.ok(pos({ ...base, month: 2 }, 'taxDashboard') < pos({ ...base, month: 8 }, 'taxDashboard'));
  assert.ok(pos({ ...base, month: 3 }, 'taxOptimizer') <= 5);
});

test('heavy debt surfaces the payoff planner; no debt pushes it to the bottom', () => {
  const heavy = { month: 8, income: 100000, expense: 60000, debt: 2000000, policies: 1 };
  const none = { ...heavy, debt: 0 };
  assert.ok(pos(heavy, 'debtFreedomPlanner') <= 4);
  assert.ok(pos(none, 'debtFreedomPlanner') >= P.DEFAULT_ORDER.length - 6);
});

test('no policies → insurance gap rises; holdings gate the stress test', () => {
  assert.ok(pos({ month: 8, income: 80000, policies: 0 }, 'insuranceGap') <= 4);
  assert.ok(pos({ month: 8, income: 80000, policies: 2 }, 'insuranceGap') > 8);
  assert.ok(pos({ month: 8, income: 80000, holdings: 800000 }, 'portfolioStressTest') < pos({ month: 8, income: 80000, holdings: 0 }, 'portfolioStressTest'));
});

test('ties keep the historical order, so unranked widgets never jump around', () => {
  const r = P.rank({ month: 7 });                                   // brand-new user, off-season
  const byScore = {};
  r.filter((x) => !P.PINNED.includes(x.id)).forEach((x) => (byScore[x.score] = (byScore[x.score] || []).concat(x.id)));
  Object.values(byScore).forEach((group) => {
    const expected = P.DEFAULT_ORDER.filter((id) => group.includes(id));
    assert.deepStrictEqual(group, expected);
  });
  assert.ok(Object.values(byScore).some((g) => g.length > 3), 'expected a sizeable tied group at the neutral score');
});

test('reasons are plain sentences about the user and only on boosted widgets', () => {
  const r = P.rank({ month: 2, income: 100000, expense: 90000, debt: 2000000, policies: 0, goals: 2 });
  const top = r.filter((x) => x.reason).slice(0, 3);
  assert.ok(top.length >= 3);
  top.forEach((x) => assert.match(x.reason, /^[A-Z].*[.]$/));
  assert.ok(r.filter((x) => P.PINNED.includes(x.id)).every((x) => x.reason === null));
  assert.ok(r.find((x) => x.id === 'newsWidget').reason === null);
});

test('ranking is deterministic and tolerates junk input', () => {
  const ctx = { month: 5, income: 'abc', debt: null, goals: undefined, holdings: NaN };
  assert.deepStrictEqual(P.rank(ctx), P.rank(ctx));
  assert.strictEqual(P.rank({}).length, P.DEFAULT_ORDER.length);
});

/* ── diff ── */
const T0 = 1_700_000_000_000;
const snap = (o) => ({ at: T0, netWorth: 1000000, debt: 500000, savingsRate: 20, emergencyMonths: 3, policies: 1, goals: 1, ...o });

test('diff: reports meaningful moves only, with tone', () => {
  const d = P.diff(snap({}), snap({ at: T0 + 86400000, netWorth: 1100000, debt: 450000, savingsRate: 26, emergencyMonths: 4.5 }));
  assert.strictEqual(d.length, 4);
  assert.match(d[0].text, /Net worth up ₹1,00,000 \(10\.0%\)/);
  assert.ok(d.every((x) => x.tone === 'good'));
  const bad = P.diff(snap({}), snap({ at: T0 + 86400000, netWorth: 900000, debt: 560000 }));
  assert.ok(bad.every((x) => x.tone === 'bad'));
});

test('diff: ignores noise, too-recent snapshots and missing history', () => {
  assert.deepStrictEqual(P.diff(snap({}), snap({ at: T0 + 86400000, netWorth: 1000400 })), []);          // 0.04% move
  assert.deepStrictEqual(P.diff(snap({}), snap({ at: T0 + 3600000, netWorth: 2000000 })), []);           // 1 hour later
  assert.deepStrictEqual(P.diff(null, snap({})), []);
});

test('snapshot derives rate and months from raw numbers', () => {
  const s = P.snapshot({ income: 100000, expense: 70000, emergencyFund: 210000, netWorth: 5, debt: 1, policies: 2, goals: 3 });
  assert.strictEqual(s.savingsRate, 30);
  assert.strictEqual(s.emergencyMonths, 3);
  assert.strictEqual(P.snapshot({}).savingsRate, null);
});

/* ── Money Score card ── */
const withScore = (moneyScore) => ({ month: 7, income: 80000, expense: 50000, policies: 1, goals: 1, moneyScore });
const reasonOf = (ctx, id) => P.rank(ctx).find((r) => r.id === id).reason;

test('moneyScore: the card is a PULSE widget and sits right under the two pinned ones for a new user', () => {
  assert.ok(P.DEFAULT_ORDER.includes('moneyScore'));
  assert.strictEqual(pos(NEW_USER, 'moneyScore'), 2);                       // 50 + 26, nothing else is boosted for an empty profile
  assert.match(reasonOf(NEW_USER, 'moneyScore'), /^You have not checked your Money Score yet\./);
});

test('moneyScore: the lower the score, the higher the card; a strong score steps out of the way', () => {
  const p = (s) => pos(withScore(s), 'moneyScore');
  assert.ok(p(30) <= p(50) && p(50) <= p(70) && p(70) < p(90), [p(30), p(50), p(70), p(90)].join(','));
  assert.ok(p(90) > pos(withScore(90), 'scenarioLab'));                      // 44 sits below the neutral 50 group
  assert.match(reasonOf(withScore(30), 'moneyScore'), /^Your Money Score is 30 out of 100\. See the three moves/);
  assert.match(reasonOf(withScore(55), 'moneyScore'), /^Your Money Score is 55 out of 100\./);
  assert.strictEqual(reasonOf(withScore(70), 'moneyScore'), null);          // mid-high: nudged up a little, no "recommended" tag
  assert.strictEqual(reasonOf(withScore(90), 'moneyScore'), null);
});

test('moneyScore: junk, blanks and null mean no score; out-of-range values are clamped; decimals round', () => {
  const none = P.rank(withScore(undefined));
  for (const junk of [null, '', 'abc', NaN, {}, []]) assert.deepStrictEqual(P.rank(withScore(junk)), none, String(junk));
  assert.deepStrictEqual(P.rank(withScore(150)), P.rank(withScore(100)));
  assert.deepStrictEqual(P.rank(withScore(-5)), P.rank(withScore(0)));
  assert.deepStrictEqual(P.rank(withScore('42.6')), P.rank(withScore(43)));
  assert.match(reasonOf(withScore(42.6), 'moneyScore'), /is 43 out of 100/);
  assert.notDeepStrictEqual(P.rank(withScore(0)), none);                    // a real zero is a score, not "absent"
});

test('moneyScore: every widget still appears once with the new card, for any score', () => {
  for (const s of [undefined, 0, 39, 40, 59, 60, 79, 80, 100]) {
    const r = ids(withScore(s));
    assert.strictEqual(r.length, P.DEFAULT_ORDER.length);
    assert.strictEqual(new Set(r).size, r.length);
    assert.deepStrictEqual(r.slice(0, 2), ['crossPageHUD', 'smartInsightCards']);
  }
});

test('moneyScore in snapshot and diff: reports a real move, ignores small ones and missing history', () => {
  assert.strictEqual(P.snapshot({ moneyScore: 35 }).moneyScore, 35);
  assert.strictEqual(P.snapshot({ moneyScore: 'abc' }).moneyScore, null);
  assert.strictEqual(P.snapshot({}).moneyScore, null);
  const up = P.diff(snap({ moneyScore: 35 }), snap({ at: T0 + 86400000, moneyScore: 48 }));
  assert.deepStrictEqual(up.map((x) => [x.tone, x.text]), [['good', 'Money Score 35 → 48']]);
  const down = P.diff(snap({ moneyScore: 60 }), snap({ at: T0 + 86400000, moneyScore: 52 }));
  assert.deepStrictEqual(down.map((x) => [x.tone, x.text]), [['bad', 'Money Score 60 → 52']]);
  assert.deepStrictEqual(P.diff(snap({ moneyScore: 50 }), snap({ at: T0 + 86400000, moneyScore: 52 })), []);              // under 3 points
  assert.deepStrictEqual(P.diff(snap({}), snap({ at: T0 + 86400000, moneyScore: 52 })), []);                              // no earlier score
  assert.deepStrictEqual(P.diff(snap({ moneyScore: 52 }), snap({ at: T0 + 86400000 })), []);                              // score removed
});
