// Trade journal core: reading records, profit and loss of a trade, totals, drawdown, groups, psychology comparisons, the form, tags.
// Expected numbers are worked out by hand in the comments.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as tj from '../lib/tradeJournal.ts';

const T = (o: Record<string, unknown>): tj.Trade => tj.readTrade({ id: String(o.id ?? Math.random()), date: '2026-10-05', symbol: 'NIFTY', ...o })!;
const rng = (seed: number) => { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };

// ── reading a stored record ──────────────────────────────────────────────────────────────────────────────────────────────────
test('a record needs an id, a real date and an instrument; anything else is left alone, not repaired', () => {
  assert.equal(tj.readTrade(null), null);
  assert.equal(tj.readTrade([]), null);
  assert.equal(tj.readTrade({ date: '2026-10-05', symbol: 'X' }), null);                       // no id
  assert.equal(tj.readTrade({ id: 'a', date: '2026-02-30', symbol: 'X' }), null);              // not a real day
  assert.equal(tj.readTrade({ id: 'a', date: 'yesterday', symbol: 'X' }), null);
  assert.equal(tj.readTrade({ id: 'a', date: '2026-10-05', symbol: '   ' }), null);
  assert.equal(tj.readTrade({ id: '__proto__', date: '2026-10-05', symbol: 'X' }), null);
  assert.equal(tj.readTrade({ id: 'a', date: '2026-10-05T10:00:00Z', symbol: 'x' })?.date, '2026-10-05');
  assert.equal(tj.readTrade({ id: 7, date: '2026-10-05', symbol: 'x' })?.id, '7');
});

test('numbers are checked one by one: an exit of 0 is kept, an entry of 0 and negative charges are not', () => {
  const t = tj.readTrade({ id: 'a', date: '2026-10-05', symbol: 'nifty', direction: 'sell', entry: 0, exit: 0, qty: -5, lotSize: 'x', brokerage: -3, stt: '12.5', gross: '-100', confidence: 11, stress: 4.5 })!;
  assert.equal(t.symbol, 'NIFTY');
  assert.equal(t.direction, 'Short');
  assert.equal(t.entry, undefined);
  assert.equal(t.exit, 0);
  assert.equal(t.qty, undefined);
  assert.equal(t.lotSize, undefined);
  assert.equal(t.brokerage, undefined);
  assert.equal(t.stt, 12.5);
  assert.equal(t.gross, -100);
  assert.equal(t.confidence, undefined);
  assert.equal(t.stress, undefined);
});

test('yes / no / not recorded stays three-way, and text is cut to length', () => {
  const t = tj.readTrade({ id: 'a', date: '2026-10-05', symbol: 'X', isRevenge: 'true', isImpulsive: false, notes: 'n'.repeat(5000), emotion: '  FOMO ', tags: ['a', 'a', 7, 'b'] })!;
  assert.deepEqual([t.isRevenge, t.isImpulsive], [true, false]);
  assert.equal(tj.readTrade({ id: 'b', date: '2026-10-05', symbol: 'X' })!.isRevenge, undefined);
  assert.equal(t.notes!.length, 2000);
  assert.equal(t.emotion, 'FOMO');
  assert.deepEqual(t.tags, ['a', 'b']);
});

test('readAll lists usable records with their place in the stored list and skips repeats of an id', () => {
  const raw = [{ id: 'a', date: '2026-10-05', symbol: 'X' }, 'junk', { id: 'a', date: '2026-10-06', symbol: 'Y' }, { id: 'c', date: '2026-10-07', symbol: 'Z' }];
  assert.deepEqual(tj.readAll(raw).map(g => [g.trade.id, g.i]), [['a', 0], ['c', 3]]);
});

// ── profit and loss of one trade ─────────────────────────────────────────────────────────────────────────────────────────────
test('profit from the prices: long, short, lot size, and the paise are kept', () => {
  assert.equal(tj.grossOf(T({ direction: 'Long', entry: 100, exit: 110, qty: 10 })), 100);
  assert.equal(tj.grossOf(T({ direction: 'Short', entry: 100, exit: 110, qty: 10 })), -100);
  assert.equal(tj.grossOf(T({ direction: 'Short', entry: 22450.5, exit: 22400.25, qty: 2, lotSize: 25 })), 2512.5);   // 50.25 × 2 × 25
  assert.equal(tj.grossOf(T({ direction: 'Long', entry: 80, exit: 0, qty: 50 })), -4000);                            // expired worthless
});

test('with anything missing the profit is not worked out: it is not rated, not guessed', () => {
  assert.equal(tj.grossOf(T({ direction: 'Long', entry: 100, exit: 110 })), null);          // no quantity
  assert.equal(tj.grossOf(T({ entry: 100, exit: 110, qty: 5 })), null);                     // no side
  assert.equal(tj.grossOf(T({ direction: 'Long', entry: 100, qty: 5 })), null);             // still open
  assert.equal(tj.netOf(T({ direction: 'Long', entry: 100, qty: 5 })), null);
});

test('a typed gross profit is used as given; charges come off it', () => {
  const t = T({ direction: 'Long', entry: 100, exit: 110, qty: 10, gross: 90, brokerage: 20, stt: 5.5, gst: 3.6 });
  assert.equal(tj.grossOf(t), 90);
  assert.equal(tj.chargesOf(t), 29.1);
  assert.equal(tj.netOf(t), 60.9);
  assert.equal(tj.hasCharges(t), true);
});

test('charges that were not recorded stay unknown: the trade says so', () => {
  const t = T({ direction: 'Long', entry: 100, exit: 110, qty: 10 });
  assert.equal(tj.hasCharges(t), false);
  assert.equal(tj.chargesOf(t), 0);
  assert.equal(tj.netOf(t), 100);
  assert.equal(tj.summarize([t]).noCharges, 1);
  assert.equal(tj.summarize([T({ gross: 10, brokerage: 0 })]).noCharges, 0);                 // a recorded 0 is a record
});

test('a total charge is used only when no single charge is recorded', () => {
  assert.equal(tj.chargesOf(T({ gross: 100, chargesTotal: 40 })), 40);
  assert.equal(tj.chargesOf(T({ gross: 100, chargesTotal: 40, brokerage: 10 })), 10);
});

// ── totals ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// 05 Oct +500, 06 Oct -200, 07 Oct +300, 08 Oct 0, 09 Oct -100 (all after charges)
const SET = [
  T({ id: '1', date: '2026-10-05', gross: 520, brokerage: 20 }), T({ id: '2', date: '2026-10-06', gross: -190, brokerage: 10 }), T({ id: '3', date: '2026-10-07', gross: 300 }),
  T({ id: '4', date: '2026-10-08', gross: 0 }), T({ id: '5', date: '2026-10-09', gross: -100 }),
];
test('totals worked out by hand', () => {
  const s = tj.summarize(SET);
  assert.equal(s.count, 5);
  assert.deepEqual([s.wins, s.losses, s.breakeven], [2, 2, 1]);
  assert.equal(s.winRate, 0.4);
  assert.equal(s.net, 500);                           // 500 - 200 + 300 + 0 - 100
  assert.equal(s.charges, 30);
  assert.equal(s.gross, 530);
  assert.equal(s.avgWin, 400);                        // (500 + 300) / 2
  assert.equal(s.avgLoss, 150);                       // (200 + 100) / 2
  assert.ok(Math.abs((s.payoff as number) - 400 / 150) < 1e-12);
  assert.ok(Math.abs((s.profitFactor as number) - 800 / 300) < 1e-12);     // total won / total lost
  assert.equal(s.expectancy, 100);                    // 500 / 5, breakeven included
  assert.deepEqual([s.best, s.worst], [500, -200]);
  assert.deepEqual([s.from, s.to, s.tradingDays], ['2026-10-05', '2026-10-09', 5]);
});

test('max drawdown is the biggest fall from a peak, with the days it started and ended', () => {
  // equity: 500, 300, 600, 600, 500  -> peak 500 then 300 (dd 200); peak 600 then 500 (dd 100)
  const s = tj.summarize(SET);
  assert.equal(s.maxDrawdown, 200);
  assert.deepEqual([s.drawdownFrom, s.drawdownTo], ['2026-10-05', '2026-10-06']);
  const curve = tj.equityCurve(tj.rate(SET).rated);
  assert.deepEqual(curve.map(p => p.equity), [500, 300, 600, 600, 500]);
  assert.deepEqual(curve.map(p => p.drawdown), [0, 200, 0, 0, 100]);
});

test('the curve starts at zero, so a first loss is already a drawdown', () => {
  const s = tj.summarize([T({ id: 'a', date: '2026-10-05', gross: -300 }), T({ id: 'b', date: '2026-10-06', gross: 100 })]);
  assert.equal(s.maxDrawdown, 300);
  assert.equal(s.drawdownTo, '2026-10-05');
});

test('trades are taken oldest first whatever order they were stored in; same-day order follows entry time, then the order logged', () => {
  const a = T({ id: 'a', date: '2026-10-06', gross: -100, entryTime: '10:00' }), b = T({ id: 'b', date: '2026-10-06', gross: 400, entryTime: '09:20' }), c = T({ id: 'c', date: '2026-10-05', gross: 50 });
  assert.deepEqual(tj.chrono(tj.rate([a, b, c]).rated).map(r => r.t.id), ['c', 'b', 'a']);
  // 50, then +400 = 450, then -100 = 350: peak 450 -> trough 350
  assert.equal(tj.summarize([a, b, c]).maxDrawdown, 100);
  assert.deepEqual(tj.chrono(tj.rate([T({ id: 'x', gross: 1 }), T({ id: 'y', gross: 2 })]).rated).map(r => r.t.id), ['x', 'y']);
});

test('streaks: a breakeven trade ends both kinds', () => {
  const mk = (...g: number[]) => g.map((x, i) => T({ id: 's' + i, date: `2026-10-${String(1 + i).padStart(2, '0')}`, gross: x }));
  const s = tj.summarize(mk(5, 5, 5, 0, 5, -1, -1, -1, -1, 5, -1));
  assert.equal(s.streaks.maxWin, 3);
  assert.equal(s.streaks.maxLoss, 4);
  assert.deepEqual(s.streaks.current, { kind: 'loss', length: 1 });
});

test('no losses: the profit factor is null (the screen says "no losing trades"), never Infinity', () => {
  const s = tj.summarize([T({ gross: 100 }), T({ id: 'b', gross: 50 })]);
  assert.equal(s.profitFactor, null);
  assert.equal(s.grossLoss, 0);
  assert.equal(s.payoff, null);
  assert.equal(s.maxDrawdown, 0);
});

test('an empty journal, and one with only unrated trades, give no numbers and no NaN', () => {
  for (const list of [[], [T({ direction: 'Long', entry: 10, qty: 1 })]]) {
    const s = tj.summarize(list);
    assert.equal(s.count, 0);
    assert.deepEqual([s.winRate, s.avgWin, s.avgLoss, s.expectancy, s.profitFactor, s.payoff, s.best, s.worst, s.from], [null, null, null, null, null, null, null, null, null]);
    assert.equal(s.net, 0);
    assert.equal(s.maxDrawdown, 0);
    assert.ok(!JSON.stringify(s).includes('null,"NaN'));
  }
  assert.equal(tj.summarize([T({ direction: 'Long', entry: 10, qty: 1 })]).unrated, 1);
});

test('floating-point dust does not leak into totals', () => {
  const list = Array.from({ length: 50 }, (_, i) => T({ id: 'f' + i, date: '2026-10-05', gross: 0.1 }));
  assert.equal(tj.summarize(list).net, 5);
  assert.equal(tj.summarize(list).avgWin, 0.1);
});

// ── groups ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test('groups by weekday, month, setup and tag; a trade with two tags counts under both; a deleted tag is skipped', () => {
  const tags: tj.Tag[] = [{ id: 'g1', name: 'Gap up', type: 'setup', color: '#00ff88' }, { id: 'g2', name: 'Expiry', type: 'custom', color: '#00d4ff' }];
  const list = [
    T({ id: '1', date: '2026-10-05', gross: 100, strategy: 'ORB', tags: ['g1', 'g2'] }),     // Monday
    T({ id: '2', date: '2026-10-12', gross: -40, strategy: 'ORB', tags: ['g1', 'gone'] }),   // Monday
    T({ id: '3', date: '2026-10-14', gross: 30 }),                                           // Wednesday
    T({ id: '4', date: '2026-11-02', gross: 10, strategy: 'Scalp' }),                        // Monday, next month
  ];
  const rated = tj.rate(list).rated;
  assert.deepEqual(tj.byWeekday(rated).map(g => [g.label, g.count, g.net]), [['Mon', 3, 70], ['Wed', 1, 30]]);
  assert.deepEqual(tj.byMonth(rated).map(g => [g.label, g.net]), [['Oct 2026', 90], ['Nov 2026', 10]]);
  assert.deepEqual(tj.bySetup(rated).map(g => [g.label, g.count, g.net]), [['ORB', 2, 60], ['Scalp', 1, 10], ['Not recorded', 1, 30]].sort((a, b) => (b[2] as number) - (a[2] as number)));
  const bt = tj.byTag(rated, tags);
  assert.deepEqual(bt.map(g => [g.label, g.count, g.net]), [['Expiry', 1, 100], ['Gap up', 2, 60]]);
  assert.equal(bt.find(g => g.label === 'Gap up')!.winRate, 0.5);
});

test('weekdays do not depend on the phone\'s time zone', () => {
  assert.equal(tj.weekdayOf('2026-10-05'), 1);
  assert.equal(tj.weekdayOf('2026-10-11'), 0);
  assert.equal(tj.weekdayOf('2024-02-29'), 4);
});

test('property: every trade is in exactly one weekday group and one month group, so the groups add up to the total', () => {
  const R = rng(4242);
  for (let n = 0; n < 60; n++) {
    const list = Array.from({ length: 1 + Math.floor(R() * 80) }, (_, i) => T({ id: 'p' + i, date: `2026-${String(1 + Math.floor(R() * 12)).padStart(2, '0')}-${String(1 + Math.floor(R() * 28)).padStart(2, '0')}`, gross: Math.round((R() - 0.45) * 100000) / 100 }));
    const { rated } = tj.rate(list);
    const total = tj.summarize(list).net;
    for (const groups of [tj.byWeekday(rated), tj.byMonth(rated), tj.bySetup(rated), tj.bySymbol(rated)]) {
      assert.ok(Math.abs(groups.reduce((s, g) => s + g.net, 0) - total) < 0.011);
      assert.equal(groups.reduce((s, g) => s + g.count, 0), rated.length);
    }
  }
});

test('periods: the Indian financial year starts on 1 April; the day windows include today', () => {
  assert.equal(tj.fyStart('2026-03-31'), '2025-04-01');
  assert.equal(tj.fyStart('2026-04-01'), '2026-04-01');
  assert.equal(tj.fyStart('2026-12-31'), '2026-04-01');
  const list = ['2026-03-31', '2026-04-01', '2026-09-17', '2026-09-18', '2026-10-16', '2026-10-17'].map((d, i) => T({ id: 'd' + i, date: d, gross: 1 }));
  const ids = (p: tj.Period) => tj.inPeriod(list, p, '2026-10-16').map(t => t.date);
  assert.deepEqual(ids('fy'), ['2026-04-01', '2026-09-17', '2026-09-18', '2026-10-16']);
  assert.deepEqual(ids('30d'), ['2026-09-17', '2026-09-18', '2026-10-16']);                   // 30 days including today: 17 Sep is day 30
  assert.ok(!ids('30d').includes('2026-10-17'));
  assert.deepEqual(ids('90d'), ['2026-09-17', '2026-09-18', '2026-10-16']);
  assert.equal(ids('all').length, 6);
});

// ── psychology ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
const PSY = [
  T({ id: 'p1', date: '2026-10-05', gross: -500, emotion: 'FOMO', preEmotion: 'Anxious', isRevenge: false, discipline: 'broken', entryTime: '09:20', exitTime: '09:50' }),
  T({ id: 'p2', date: '2026-10-05', gross: -300, emotion: 'FOMO', isRevenge: true, discipline: 'broken', planAdherence: 'deviated', entryTime: '10:00', exitTime: '12:00' }),
  T({ id: 'p3', date: '2026-10-05', gross: 200, emotion: 'Calm', isRevenge: false, discipline: 'followed', entryTime: '13:00', exitTime: '13:30' }),
  T({ id: 'p4', date: '2026-10-06', gross: 400, emotion: 'Calm', discipline: 'followed', planAdherence: 'fully', confidence: 8, stress: 2 }),
  T({ id: 'p5', date: '2026-10-06', gross: -100, discipline: 'partial', confidence: 3, stress: 9 }),
];
test('emotion table and the "FOMO against not FOMO" comparison are plain counts', () => {
  const rated = tj.rate(PSY).rated;
  const table = tj.tableBy(rated, r => r.t.emotion);
  assert.deepEqual(table.map(r => [r.value, r.cohort.count, r.cohort.net]), [['Calm', 2, 600], ['FOMO', 2, -800]]);
  const c = tj.compare(rated, 'x', 'FOMO', '', ['FOMO', 'Other emotions'], r => (r.t.emotion ? r.t.emotion === 'FOMO' : null));
  assert.deepEqual([c.a.cohort.count, c.a.cohort.net, c.a.cohort.avg, c.a.cohort.winRate], [2, -800, -400, 0]);
  assert.deepEqual([c.b.cohort.count, c.b.cohort.net, c.b.cohort.avg, c.b.cohort.winRate], [2, 600, 300, 1]);      // the trade with no emotion is in neither
});

test('flags: not answered is left out of both sides', () => {
  const rated = tj.rate(PSY).rated;
  const rev = tj.psychologyComparisons(rated).find(c => c.id === 'revenge')!;
  assert.deepEqual([rev.a.cohort.count, rev.a.cohort.net, rev.b.cohort.count, rev.b.cohort.net], [1, -300, 2, -300]);
  const rules = tj.psychologyComparisons(rated).find(c => c.id === 'rules')!;
  assert.deepEqual([rules.a.cohort.count, rules.a.cohort.net, rules.b.cohort.count, rules.b.cohort.net], [2, -800, 3, 500]);
});

test('after a loss the same day: the trade just before it, on that day, lost', () => {
  const c = tj.afterSameDayLoss(tj.rate(PSY).rated);
  // p2 follows p1 (loss); p3 follows p2 (loss); p4 is the first of its day; p5 follows p4 (win)
  assert.deepEqual([c.a.cohort.count, c.a.cohort.net], [2, -100]);
  assert.deepEqual([c.b.cohort.count, c.b.cohort.net], [3, -200]);
});

test('after a win and after a loss, in logged order; the first trade and trades after a breakeven are left out', () => {
  const list = [T({ id: 'a', date: '2026-10-01', gross: 100 }), T({ id: 'b', date: '2026-10-02', gross: -50 }), T({ id: 'c', date: '2026-10-03', gross: 70 }), T({ id: 'd', date: '2026-10-04', gross: 0 }), T({ id: 'e', date: '2026-10-05', gross: 10 })];
  const c = tj.afterOutcome(tj.rate(list).rated);
  assert.deepEqual([c.a.cohort.count, c.a.cohort.net], [2, -50]);     // b came after a win, d (breakeven) after c
  assert.deepEqual([c.b.cohort.count, c.b.cohort.net], [1, 70]);      // c came after a loss; d after a win -> counted in a? see below
});
test('after a win: b (after a:+100) and d (after c:+70) are both "after a win"', () => {
  const list = [T({ id: 'a', date: '2026-10-01', gross: 100 }), T({ id: 'b', date: '2026-10-02', gross: -50 }), T({ id: 'c', date: '2026-10-03', gross: 70 }), T({ id: 'd', date: '2026-10-04', gross: 0 })];
  const c = tj.afterOutcome(tj.rate(list).rated);
  assert.deepEqual([c.a.cohort.count, c.a.cohort.net], [2, -50]);
  assert.deepEqual([c.b.cohort.count, c.b.cohort.net], [1, 70]);
});

test('confidence and stress bands only use trades where they were recorded', () => {
  const rated = tj.rate(PSY).rated;
  assert.deepEqual(tj.byBand(rated, 'confidence').map(b => [b.band, b.cohort.count, b.cohort.net]), [['1 to 3', 1, -100], ['7 to 10', 1, 400]]);
  assert.deepEqual(tj.byBand(rated, 'stress').map(b => [b.band, b.cohort.net]), [['1 to 3', 400], ['7 to 10', -100]]);
});

test('time in a trade: minutes between the two times; none when a time is missing or the exit is not later', () => {
  assert.equal(tj.holdMinutes({ entryTime: '09:20', exitTime: '09:50' }), 30);
  assert.equal(tj.holdMinutes({ entryTime: '15:00', exitTime: '09:50' }), null);
  assert.equal(tj.holdMinutes({ entryTime: '09:20' }), null);
  const h = tj.holdTimes(tj.rate(PSY).rated);
  assert.deepEqual([h.winners.count, h.winners.avgMinutes, h.losers.count, h.losers.avgMinutes], [1, 30, 2, 75]);     // losers: 30 and 120 min
});

test('a very small sample is flagged in the words', () => {
  const rated = tj.rate(PSY).rated;
  assert.match(tj.cohortLine('FOMO', tj.cohort(rated.filter(r => r.t.emotion === 'FOMO'))), /FOMO: 2 trades, net −₹800, average −₹400 a trade, 0% won \(only 2: too few to say much\)\./);
  assert.equal(tj.cohortLine('Nothing', tj.cohort([])), 'Nothing: no trades.');
});

test('the psychology wording is never advice', () => {
  const advice = /\b(should|avoid|consider|try|stop|must|need to|you ought|recommend|better to|don't|do not|cut|quit|take a break|improve)\b/i;
  const R = rng(9);
  for (let n = 0; n < 20; n++) {
    const list = Array.from({ length: 8 + Math.floor(R() * 40) }, (_, i) => T({
      id: 'w' + i, date: `2026-10-${String(1 + Math.floor(R() * 20)).padStart(2, '0')}`, gross: Math.round((R() - 0.5) * 20000) / 100,
      emotion: tj.EMOTIONS[Math.floor(R() * 8)], isRevenge: R() < 0.3, discipline: tj.DISCIPLINE[Math.floor(R() * 3)].id, entryTime: '09:30', exitTime: '10:00',
    }));
    const rated = tj.rate(list).rated;
    for (const c of tj.psychologyComparisons(rated)) {
      for (const text of [c.title, c.basis, c.a.label, c.b.label, tj.cohortLine(c.a.label, c.a.cohort), tj.cohortLine(c.b.label, c.b.cohort)]) assert.ok(!advice.test(text), `advice-like words in: ${text}`);
    }
  }
});

// ── words and money ────────────────────────────────────────────────────────────────────────────────────────────────────────
test('rupee text: Indian grouping, a real minus sign, lakh / crore for big totals, a dash for no value', () => {
  assert.equal(tj.pnlText(1250.5), '₹1,250.50');
  assert.equal(tj.pnlText(-600), '−₹600');
  assert.equal(tj.pnlText(600, { sign: true }), '+₹600');
  assert.equal(tj.pnlText(99999), '₹99,999');
  assert.equal(tj.pnlText(123456), '₹1.23 L');
  assert.equal(tj.pnlText(-25000000), '−₹2.50 Cr');
  assert.equal(tj.pnlText(1234567.89, { full: true }), '₹12,34,567.89');
  assert.equal(tj.pnlText(0.001), '₹0');
  assert.equal(tj.pnlText(-0.001), '₹0');
  for (const bad of [null, undefined, NaN, Infinity]) assert.equal(tj.pnlText(bad as any), '—');
  assert.equal(tj.pctText(0.4), '40%');
  assert.equal(tj.pctText(null), '—');
});

// ── the form ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const NOW = new Date('2026-10-16T10:00:00Z');
const form = (o: Partial<tj.TradeForm> = {}): tj.TradeForm => ({ ...tj.emptyForm('2026-10-14'), symbol: 'nifty', direction: 'Long', entry: '100', exit: '110', qty: '10', ...o });
const build = (f: tj.TradeForm, base?: tj.Trade) => tj.buildTrade(f, { id: 'new1', today: '2026-10-16', now: NOW, base });

test('a good form makes a trade; the profit is stored', () => {
  const r = build(form({ brokerage: '20', stt: '5', strategy: ' ORB ', emotion: 'Calm', isRevenge: 'no', confidence: '7', tags: ['g1', 'g1'] }));
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual([r.trade.symbol, r.trade.gross, tj.netOf(r.trade), r.trade.strategy, r.trade.isRevenge, r.trade.isImpulsive, r.trade.confidence, r.trade.tags], ['NIFTY', 100, 75, 'ORB', false, undefined, 7, ['g1']]);
  assert.equal(r.trade.savedAt, NOW.toISOString());
});

test('the form refuses what cannot be a trade, and says which box', () => {
  const bad = (o: Partial<tj.TradeForm>, field: string) => { const r = build(form(o)); assert.equal(r.ok, false); if (!r.ok) assert.equal(r.field, field, JSON.stringify(o)); };
  bad({ date: '14/10/2026' }, 'date');
  bad({ date: '2026-10-17' }, 'date');                 // tomorrow
  bad({ date: '2026-02-30' }, 'date');
  bad({ symbol: '  ' }, 'symbol');
  bad({ entry: 'abc' }, 'entry');
  bad({ entry: '0' }, 'entry');
  bad({ exit: '-5' }, 'exit');
  bad({ qty: '0' }, 'qty');
  bad({ qty: '-3' }, 'qty');
  bad({ lotSize: '0' }, 'lotSize');
  bad({ entry: '', exit: '110' }, 'entry');
  bad({ brokerage: '-1' }, 'brokerage');
  bad({ gst: 'x' }, 'gst');
  bad({ grossOverride: '12abc' }, 'grossOverride');
  bad({ entryTime: '9:5' }, 'entryTime');
  bad({ confidence: '11' }, 'confidence');
  bad({ stress: '2.5' }, 'stress');
});

test('an open trade can be saved: it has no profit yet and is not rated', () => {
  const r = build(form({ exit: '' }));
  assert.ok(r.ok);
  if (r.ok) { assert.equal(r.trade.gross, undefined); assert.equal(tj.netOf(r.trade), null); }
});

test('a typed gross profit is kept, and shows up again as an override when the trade is edited; prices-only does not', () => {
  const typed = build(form({ grossOverride: '-2,500', exit: '' }));
  assert.ok(typed.ok);
  if (!typed.ok) return;
  assert.equal(typed.trade.gross, -2500);
  assert.equal(tj.formFromTrade(typed.trade).grossOverride, '-2500');
  const auto = build(form());
  if (auto.ok) assert.equal(tj.formFromTrade(auto.trade).grossOverride, '');
});

test('editing keeps the import marks, drops what was cleared, and the form round-trips', () => {
  const base = T({ id: 'old', date: '2026-10-01', direction: 'Long', entry: 100, exit: 110, qty: 10, notes: 'x', src: 'import', batch: 'b1', preEmotion: 'FOMO', chargesTotal: 30 });
  const f = tj.formFromTrade(base);
  assert.equal(f.chargesTotal, '30');
  const same = tj.buildTrade(f, { id: base.id, today: '2026-10-16', now: NOW, base });
  assert.ok(same.ok);
  if (!same.ok) return;
  assert.deepEqual([same.trade.src, same.trade.batch, same.trade.preEmotion, tj.netOf(same.trade)], ['import', 'b1', 'FOMO', 70]);
  const cleared = tj.buildTrade({ ...f, notes: '', preEmotion: '' }, { id: base.id, today: '2026-10-16', now: NOW, base });
  assert.ok(cleared.ok);
  if (cleared.ok) assert.deepEqual([cleared.trade.notes, cleared.trade.preEmotion], [undefined, undefined]);
});

test('the live preview is the same maths as the saved trade, and says when charges are unknown', () => {
  const v = tj.previewForm(form({ brokerage: '20', stt: '5' }));
  assert.deepEqual([v.gross, v.charges, v.net, v.chargesKnown, v.grossSource], [100, 25, 75, true, 'prices']);
  const w = tj.previewForm(form());
  assert.deepEqual([w.net, w.chargesKnown], [100, false]);
  const open = tj.previewForm(form({ exit: '' }));
  assert.deepEqual([open.gross, open.net, open.grossSource], [null, null, 'none']);
  const junk = tj.previewForm(form({ entry: 'x', brokerage: '-4' }));
  assert.equal(junk.net, null);
});

test('amounts typed the Indian way are read', () => {
  assert.equal(tj.parseAmount('1,23,456.50'), 123456.5);
  assert.equal(tj.parseAmount(' ₹ 50 '), 50);
  assert.equal(tj.parseAmount(''), undefined);
  assert.ok(Number.isNaN(tj.parseAmount('5 lakh') as number));
  assert.ok(Number.isNaN(tj.parseAmount('1e5') as number));
});

// ── tags ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test('tags: a name is needed, kept short, and unique ignoring case', () => {
  const t1 = tj.buildTag({ name: '  Gap   up ', type: 'setup', color: '#ff4d6d' }, [], 'a');
  assert.ok(t1.ok);
  if (t1.ok) assert.deepEqual(t1.tag, { id: 'a', name: 'Gap up', type: 'setup', color: '#ff4d6d' });
  assert.equal(tj.buildTag({ name: 'gap UP' }, [{ id: 'a', name: 'Gap up', type: 'custom', color: '#00ff88' }], 'b').ok, false);
  assert.equal(tj.buildTag({ name: '' }, [], 'b').ok, false);
  assert.equal(tj.buildTag({ name: 'x'.repeat(31) }, [], 'b').ok, false);
  const odd = tj.buildTag({ name: 'ok', type: 'weird', color: 'red' }, [], 'c');
  if (odd.ok) assert.deepEqual([odd.tag.type, odd.tag.color], ['custom', '#00ff88']);
  assert.equal(tj.readTag({ id: 'a', name: 'x', color: '<script>' })!.color, '#00ff88');
});
