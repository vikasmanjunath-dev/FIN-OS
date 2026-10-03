// FinosOfferCompare — numbers verified against an independent reference implementation.
const test = require('node:test');
const assert = require('node:assert');
const O = require('../js/finos-offer-compare.js');

const near = (a, b, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('plain ₹18L CTC, no variable: year-1 numbers', () => {
  const r = O.evaluate({ name: 'A', ctc: 1800000 });
  const y1 = r.years[0];
  assert.strictEqual(y1.erPF, 86400);                       // 12% of basic 7.2L
  assert.strictEqual(Math.round(y1.gratuity), 34632);       // 4.81% of basic
  assert.strictEqual(Math.round(y1.gross), 1678968);        // CTC − employer PF − gratuity
  assert.strictEqual(y1.regime, 'new');
  assert.strictEqual(y1.tax, 125625);
  assert.strictEqual(Math.round(y1.takeHome), 1464543);
  near(r.monthlyInHand, 122045.25, 0.5);
  near(r.totals.takeHome, 8387235.96, 2);                   // 5 years with an 8% hike
  near(r.totals.totalValue, 9604156.73, 2);
  assert.strictEqual(r.years.length, 5);
});

test('variable pay, joining bonus, employer NPS and the ₹15,000 PF ceiling', () => {
  const r = O.evaluate({ name: 'B', ctc: 1800000, variable: 300000, payout: 80, joiningBonus: 200000, npsPct: 10, pfBasis: 'ceiling' });
  const y1 = r.years[0];
  assert.strictEqual(y1.erPF, 21600);                       // 12% × (15,000 × 12) — not 12% of the actual basic
  assert.strictEqual(y1.erNPS, 60000);                      // 10% of basic 6L
  assert.strictEqual(Math.round(y1.gross), 1829540);        // fixed cash + 80% of variable + bonus
  assert.strictEqual(Math.round(y1.takeHome), 1661076);
  near(r.monthlyInHand, 124766, 0.5);                       // joining bonus excluded from the recurring figure
  near(r.totals.totalValue, 9549613.67, 2);
});

test('low income: new-regime rebate wipes out tax entirely', () => {
  const r = O.evaluate({ ctc: 900000, hike: 10 });
  assert.strictEqual(r.years[0].tax, 0);
  near(r.monthlyInHand, 66157, 0.5);
});

test('compare(): winner on monthly in-hand can differ from winner on total value', () => {
  const c = O.compare([{ name: 'A', ctc: 1800000 }, { name: 'B', ctc: 1800000, variable: 300000, payout: 80, joiningBonus: 200000, npsPct: 10, pfBasis: 'ceiling' }]);
  assert.strictEqual(c.winnerMonthly, 1);                   // B puts more cash in hand (smaller PF)…
  assert.strictEqual(c.winnerTotal, 0);                     // …but A builds more locked-in value over 5 years
  near(c.gapMonthly, 124766 - 122045.25, 1);
  assert.ok(c.gapTotal > 0);
});

test('inputs are sanitised: junk, negatives, >3 offers, zero CTC', () => {
  const n = O.normalize({ ctc: -5, variable: 'x', payout: 999, basicPct: 0, hike: -3, npsPct: 50 });
  assert.strictEqual(n.ctc, 0);
  assert.strictEqual(n.variable, 0);
  assert.strictEqual(n.payout, 200);
  assert.strictEqual(n.basicPct, 1);
  assert.strictEqual(n.hike, 0);
  assert.strictEqual(n.npsPct, 14);
  const c = O.compare([{ ctc: 0 }, { ctc: 1 }, { ctc: 2 }, { ctc: 3 }, { ctc: 4 }]);
  assert.strictEqual(c.results.length, 3);                  // zero-CTC dropped, capped at 3
  assert.strictEqual(O.compare([]).winnerTotal, -1);
});

test('variable can never exceed CTC and cash is never negative', () => {
  const r = O.evaluate({ ctc: 100000, variable: 900000, basicPct: 100, npsPct: 14 });
  assert.ok(r.years.every((y) => y.gross >= 0 && Number.isFinite(y.takeHome)));
});
