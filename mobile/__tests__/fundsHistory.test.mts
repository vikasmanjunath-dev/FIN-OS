// Returns from a NAV history: a return is only produced when the history really covers the window it names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as h from '../lib/fundsHistory.ts';
import { makeFundsApi } from '../lib/fundsClient.ts';

const hist = (pts: [string, number][]): h.History => ({ points: pts.map(([date, nav]) => ({ date, nav })), asOf: null, source: null });
const close = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

/** One NAV every calendar day between two dates, growing at a fixed daily rate from 100. */
function daily(from: string, to: string, dailyRate: number): h.History {
  const pts: [string, number][] = [];
  let i = 0;
  for (let d = Date.parse(from); d <= Date.parse(to); d += 86400000, i++) pts.push([new Date(d).toISOString().slice(0, 10), 100 * Math.pow(1 + dailyRate, i)]);
  return hist(pts);
}

test('monthsBefore keeps the day of month and clamps to a short month', () => {
  assert.equal(h.monthsBefore('2026-10-13', 12), '2025-10-13');
  assert.equal(h.monthsBefore('2026-03-31', 1), '2026-02-28');
  assert.equal(h.monthsBefore('2028-03-31', 1), '2028-02-29');
  assert.equal(h.monthsBefore('2026-01-15', 3), '2025-10-15');
});

test('parseHistory: bad rows dropped, duplicate dates keep the last, result ascending, nothing usable gives null', () => {
  const r = h.parseHistory({
    as_of: '13-Oct-2026', source: 'AMFI',
    points: [{ date: '2026-10-13', nav: 12 }, { date: '10-Oct-2026', nav: '10.5' }, { date: '2026-10-13', nav: 12.5 }, { date: 'nonsense', nav: 5 }, { date: '2026-10-01', nav: 0 }, { date: '2026-10-02', nav: null }],
  });
  assert.deepEqual(r?.points, [{ date: '2026-10-10', nav: 10.5 }, { date: '2026-10-13', nav: 12.5 }]);
  assert.equal(r?.asOf, '2026-10-13');
  assert.equal(h.parseHistory({ points: [] }), null);
  assert.equal(h.parseHistory({}), null);
  assert.equal(h.parseHistory(null), null);
  assert.equal(h.parseHistory({ points: [{ date: 'x', nav: 1 }] }), null);
});

test('nearest NAV lookups', () => {
  const pts = hist([['2026-01-02', 10], ['2026-01-05', 11], ['2026-01-09', 12]]).points;
  assert.deepEqual(h.navOnOrBefore(pts, '2026-01-07'), { point: pts[1], gapDays: 2 });
  assert.equal(h.navOnOrBefore(pts, '2026-01-01'), null);
  assert.deepEqual(h.navOnOrAfter(pts, '2026-01-06'), { point: pts[2], gapDays: 3 });
  assert.equal(h.navOnOrAfter(pts, '2026-01-10'), null);
});

test('3 year return is annualised over the real number of days (hand-worked)', () => {
  // 100 -> 133.1 over 2023-10-13 .. 2026-10-13 = 1096 days; (1.331)^(365/1096) - 1 = 9.9905 %
  const r = h.periodReturn(hist([['2023-10-13', 100], ['2026-10-13', 133.1]]), 36);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.days, 1096);
    assert.equal(r.kind, 'annualised');
    close(r.absolutePct, 33.1, 1e-9);
    close(r.annualisedPct!, 9.9905, 0.001);
  }
});

test('under a year is the absolute change, and says so', () => {
  const r = h.periodReturn(hist([['2026-07-13', 200], ['2026-10-13', 210]]), 3);
  assert.ok(r.ok);
  if (r.ok) { assert.equal(r.kind, 'absolute'); assert.equal(r.annualisedPct, null); close(r.absolutePct, 5, 1e-9); }
});

test('a window the history does not cover is refused, with the reason, and never shortened', () => {
  const short = h.periodReturn(hist([['2025-10-13', 100], ['2026-10-13', 120]]), 36);
  assert.equal(short.ok, false);
  assert.match((short as any).reason, /starts 2025-10-13/);
  const oneYear = h.periodReturn(hist([['2025-10-13', 100], ['2026-10-13', 120]]), 12);
  assert.equal(oneYear.ok, true);

  const gap = h.periodReturn(hist([['2023-09-20', 100], ['2023-10-13', 101], ['2026-10-13', 120]]).points.length ? hist([['2023-09-20', 100], ['2026-10-13', 120]]) : hist([]), 36);
  assert.equal(gap.ok, false);                                       // nearest NAV is 23 days before 2023-10-13
  assert.match((gap as any).reason, /within 7 days/);
  const okWeekend = h.periodReturn(hist([['2023-10-10', 100], ['2026-10-13', 120]]), 36);
  assert.equal(okWeekend.ok, true);                                  // 3 days before is fine

  for (const pts of [[], [['2026-10-13', 100]]] as [string, number][][]) assert.equal(h.periodReturn(hist(pts), 12).ok, false);
});

test('rolling returns need at least 12 month-end observations and report min / median / max', () => {
  const grow = daily('2023-01-01', '2026-10-13', 0.0003);
  const r = h.rollingReturns(grow, 12);
  assert.ok(r.ok);
  if (r.ok) {
    assert.ok(r.observations >= 12);
    // constant daily growth: every annualised rolling return is the same (1.0003^365 - 1), to within day-count rounding
    const expected = (Math.pow(1.0003, 365) - 1) * 100;
    close(r.minPct, expected, 0.05); close(r.maxPct, expected, 0.05); close(r.medianPct, expected, 0.05);
    assert.equal(r.positiveShare, 1);
  }
  const few = h.rollingReturns(daily('2025-06-01', '2026-10-13', 0.0003), 12);   // only ~5 month-ends have a NAV a year back
  assert.equal(few.ok, false);
  assert.match((few as any).reason, /at least 12/);
});

test('rolling positiveShare counts a falling market', () => {
  const r = h.rollingReturns(daily('2023-01-01', '2026-10-13', -0.0002), 3);
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.positiveShare, 0);
});

test('SIP: flat NAV returns exactly what was put in; XIRR is about zero', () => {
  const r = h.sipReturn(daily('2024-01-01', '2026-10-13', 0), 5000, 24, 5);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.instalments, 24);
    assert.equal(r.invested, 120000);
    close(r.value, 120000, 1e-6);
    close(r.gainPct, 0, 1e-9);
    close(r.xirrPct ?? 0, 0, 0.01);
  }
});

test('SIP: a doubling NAV gives a value between invested and 2x, and a positive XIRR', () => {
  const r = h.sipReturn(daily('2024-01-01', '2026-10-13', Math.pow(2, 1 / 1017) - 1), 1000, 24, 1);
  assert.ok(r.ok);
  if (r.ok) { assert.ok(r.value > r.invested && r.value < 2 * r.invested); assert.ok((r.xirrPct ?? 0) > 0); }
});

test('SIP is refused when the history does not cover every instalment, when too few instalments, or without an amount', () => {
  const covers = daily('2025-06-01', '2026-10-13', 0.0002);
  const late = h.sipReturn(covers, 5000, 24, 1);
  assert.equal(late.ok, false);
  assert.match((late as any).reason, /within 7 days after 2024-11-01/);
  assert.equal(h.sipReturn(covers, 5000, 6, 1).ok, false);
  assert.equal(h.sipReturn(covers, 0, 12, 1).ok, false);
  // 12 months asked, but the 28th of the latest month is after the latest NAV (13th): only 11 instalments exist, so no 12-instalment answer
  const eleven = h.sipReturn(daily('2024-01-01', '2026-10-13', 0.0002), 1000, 12, 28);
  assert.equal(eleven.ok, false);
  assert.match((eleven as any).reason, /Only 11 instalments/);
  assert.equal(h.sipReturn(hist([['2026-10-13', 10]]), 5000, 12, 1).ok, false);
  // a hole bigger than a week where an instalment falls
  const holey = daily('2024-01-01', '2026-10-13', 0.0002);
  holey.points = holey.points.filter(p => !(p.date >= '2025-03-01' && p.date <= '2025-03-20'));
  const hole = h.sipReturn(holey, 1000, 24, 5);
  assert.equal(hole.ok, false);
  assert.match((hole as any).reason, /within 7 days after/);
});

// ── the client: a missing history endpoint is an outcome, not an error ─────────────────────────

test('history outcome: ok, empty, endpoint not provided (HTTP 404), offline', async () => {
  const mk = (fn: (u: string) => Promise<any>) => makeFundsApi({ fetchJSON: fn, base: () => 'http://x' });
  const okApi = mk(async () => ({ points: [{ date: '2026-10-12', nav: 10 }, { date: '2026-10-13', nav: 11 }] }));
  const ok = await okApi.history('122639');
  assert.equal(ok.status, 'ok');
  assert.equal((await mk(async () => ({ points: [] })).history('122639')).status, 'unavailable');
  const nf = await mk(async () => { throw new Error('HTTP 404'); }).history('122639');
  assert.deepEqual(nf, { status: 'unavailable', reason: 'not-provided' });
  const off = await mk(async () => { throw new Error('Network request failed'); }).history('122639');
  assert.deepEqual(off, { status: 'unavailable', reason: 'offline' });
  assert.deepEqual(await okApi.history('abc'), { status: 'unavailable', reason: 'empty' });
});
