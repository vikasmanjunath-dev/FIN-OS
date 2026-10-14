// Fund records, plan / option reading, freshness, search ranking, comparison, and the person's SIP consistency.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as f from '../lib/funds.ts';

const NOW = new Date('2026-10-14T10:00:00');
const rec = (o: Partial<f.FundRecord> = {}): f.FundRecord => ({ code: '122639', name: 'Parag Parikh Flexi Cap Fund', house: 'PPFAS Mutual Fund', nav: 89.5841, date: '2026-10-13', plan: 'Direct Plan', option: 'Growth', ...o });
const raw = (o: Record<string, unknown> = {}) => ({ scheme_code: '122639', scheme_name: 'Parag Parikh Flexi Cap Fund', nav: 89.5841, date: '13-Oct-2026', fund_house: 'PPFAS Mutual Fund', plan: 'Direct Plan', option: 'Growth', ...o });

test('the feed date is read, impossible dates are refused', () => {
  assert.equal(f.parseNavDate('13-Oct-2026'), '2026-10-13');
  assert.equal(f.parseNavDate('01-jan-2020'), '2020-01-01');
  assert.equal(f.parseNavDate('2026-10-13'), '2026-10-13');
  assert.equal(f.parseNavDate('13-10-2026'), '2026-10-13');
  assert.equal(f.parseNavDate('31-Feb-2026'), '');
  assert.equal(f.parseNavDate('29-Feb-2025'), '');
  assert.equal(f.parseNavDate('29-Feb-2024'), '2024-02-29');
  assert.equal(f.parseNavDate(''), '');
  assert.equal(f.parseNavDate(null), '');
  assert.equal(f.parseNavDate('N.A.'), '');
});

test('normaliseFund: needs a code and a name; NAV that is not a positive number becomes null, never 0', () => {
  assert.deepEqual(f.normaliseFund(raw()), rec());
  assert.equal(f.normaliseFund({ error: 'not found' }), null);
  assert.equal(f.normaliseFund(raw({ scheme_code: 'abc' })), null);
  assert.equal(f.normaliseFund(raw({ scheme_name: '' })), null);
  assert.equal(f.normaliseFund(null), null);
  assert.equal(f.normaliseFund(raw({ nav: 'N.A.' }))!.nav, null);
  assert.equal(f.normaliseFund(raw({ nav: 0 }))!.nav, null);
  assert.equal(f.normaliseFund(raw({ nav: '12.5' }))!.nav, 12.5);
  assert.equal(f.normaliseFund(raw({ plan: undefined, option: undefined }))!.plan, '');
});

test('plan: the feed field decides; a blank one falls back to the option text, then the name; otherwise unknown', () => {
  assert.equal(f.planKind(rec({ plan: 'Direct Plan' })), 'direct');
  assert.equal(f.planKind(rec({ plan: 'Regular Plan' })), 'regular');
  assert.equal(f.planKind(rec({ plan: '', option: 'Direct IDCW' })), 'direct');
  assert.equal(f.planKind(rec({ plan: '', option: '', name: 'Foo Fund - Regular Plan' })), 'regular');
  assert.equal(f.planKind(rec({ plan: '', option: '', name: 'Kotak FMP Series 261' })), 'unknown');
  assert.equal(f.planKind(rec({ plan: '', option: 'Direct and Regular', name: 'X' })), 'unknown');
  assert.equal(f.planKind(rec({ plan: 'Regular Plan', option: 'Payout of Income Distribution cum capital withdrawal option- Direct' })), 'regular');
});

test('plan conflicts in the feed are flagged, a "Regular IDCW" option under a Direct plan is not a conflict about the plan name', () => {
  assert.equal(f.planConflict({ plan: 'Regular Plan', option: 'Direct' }), true);
  assert.equal(f.planConflict({ plan: 'Regular Plan', option: 'Payout of Income Distribution cum capital withdrawal option- Direct' }), true);
  assert.equal(f.planConflict({ plan: 'Direct Plan', option: 'Growth' }), false);
  assert.equal(f.planConflict({ plan: '', option: 'Direct' }), false);
  // the feed really contains "Direct Plan" + "Regular IDCW Option"; that is flagged too, so the person is told to check rather than trusting either label
  assert.equal(f.planConflict({ plan: 'Direct Plan', option: 'Regular IDCW Option' }), true);
});

test('option: growth, IDCW (every wording the feed uses), bonus; mixed or odd wording is shown as it is', () => {
  const k = (option: string) => f.optionKind({ option });
  for (const g of ['Growth', 'GROWTH', 'Growth Option', 'Cumulative']) assert.equal(k(g), 'growth', g);
  for (const i of ['IDCW', 'IDCW Payout', 'Monthly IDCW', 'Weekly IDCW Option', 'Income Distribution cum capital withdrawal', 'Quarterly Dividend Option', 'IDCW Reinvestment Option', 'Payout of Income Distribution cum capital withdrawal option- Direct']) assert.equal(k(i), 'idcw', i);
  assert.equal(k('Bonus Option'), 'bonus');
  assert.equal(k(''), 'unknown');
  assert.equal(k('Unclaimed Dividend-Growth Option'), 'other');
  assert.equal(k('Defined Maturity Date Option'), 'other');
  assert.equal(f.variantLabel(rec()), 'Direct · Growth');
  assert.equal(f.variantLabel(rec({ plan: '', option: '' })), 'Plan not stated · Option not stated');
  assert.equal(f.variantLabel(rec({ option: 'Quarterly Option' })), 'Direct · Quarterly Option');
});

test('NAV freshness: a few days is normal, over a week is flagged, a missing NAV or date is unknown', () => {
  assert.deepEqual(f.navStatus(rec({ date: '2026-10-14' }), NOW), { state: 'current', days: 0 });
  assert.deepEqual(f.navStatus(rec({ date: '2026-10-11' }), NOW), { state: 'current', days: 3 });
  assert.deepEqual(f.navStatus(rec({ date: '2026-10-07' }), NOW), { state: 'current', days: 7 });
  assert.deepEqual(f.navStatus(rec({ date: '2026-10-06' }), NOW), { state: 'old', days: 8 });
  assert.deepEqual(f.navStatus(rec({ date: '2022-04-11' }), NOW).state, 'old');
  assert.deepEqual(f.navStatus(rec({ date: '2026-10-20' }), NOW), { state: 'current', days: 0 });  // a clock that is behind never gives a negative age
  assert.deepEqual(f.navStatus(rec({ nav: null }), NOW), { state: 'unknown', days: null });
  assert.deepEqual(f.navStatus(rec({ date: '' }), NOW), { state: 'unknown', days: null });
});

test('the type hint comes from clear words in the name only', () => {
  assert.equal(f.typeHint('Parag Parikh Flexi Cap Fund'), 'Flexi cap');
  assert.equal(f.typeHint('SBI Small Cap Fund'), 'Small cap');
  assert.equal(f.typeHint('Kotak Emerging Equity Fund'), 'Equity');
  assert.equal(f.typeHint('Edelweiss Liquid Fund'), 'Liquid');
  assert.equal(f.typeHint('UTI Nifty 50 Index Fund'), 'Index fund');
  assert.equal(f.typeHint('Mirae Asset Nifty Metal ETF FOF'), 'Fund of funds / international');
  assert.equal(f.typeHint('Kotak FMP Series 261'), 'Fixed-maturity / closed-ended');
  assert.equal(f.typeHint('Axis Long Term Equity Fund'), 'Equity');
  assert.equal(f.typeHint('Axis ELSS Tax Saver Fund'), 'ELSS (tax saver)');
  assert.equal(f.typeHint('Zzz Plan'), null);
});

test('search: the backend gets the most selective word, the phone keeps results that hold every word and orders them', () => {
  assert.equal(f.backendQuery('parag flexi'), 'parag');
  assert.equal(f.backendQuery('hdfc'), 'hdfc');
  assert.equal(f.backendQuery('ab'), null);
  assert.equal(f.backendQuery('  '), null);
  const pool = [
    rec({ code: '1', name: 'HDFC Flexi Cap Fund', house: 'HDFC Mutual Fund', plan: 'Regular Plan' }),
    rec({ code: '2', name: 'HDFC Flexi Cap Fund', house: 'HDFC Mutual Fund', plan: 'Direct Plan', option: 'IDCW' }),
    rec({ code: '3', name: 'HDFC Flexi Cap Fund', house: 'HDFC Mutual Fund', plan: 'Direct Plan', option: 'Growth' }),
    rec({ code: '4', name: 'Axis Flexi Cap Fund', house: 'Axis Mutual Fund' }),
    rec({ code: '5', name: 'Parag Parikh Flexi Cap Fund', house: 'PPFAS Mutual Fund' }),
    rec({ code: '6', name: 'HDFC Liquid Fund', house: 'HDFC Mutual Fund' }),
  ];
  assert.deepEqual(f.rankResults(pool, 'hdfc flexi').map(r => r.code), ['3', '2', '1']);
  assert.deepEqual(f.rankResults(pool, 'flexi cap').map(r => r.code), ['4', '3', '2', '1', '5']);
  assert.deepEqual(f.rankResults(pool, 'ppfas').map(r => r.code), ['5']);      // fund house counts
  assert.deepEqual(f.rankResults(pool, 'nothing like it'), []);
  assert.deepEqual(f.rankResults(pool, ''), []);
  const groups = f.groupSchemes(f.rankResults(pool, 'hdfc flexi'));
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].variants.map(v => v.code), ['3', '2', '1']);
});

test('comparison: facts only, with warnings for mixed plans / options, old NAVs and conflicting labels', () => {
  const d = rec({ code: '1' });
  const r = rec({ code: '2', plan: 'Regular Plan', nav: 81.5696 });
  const c = f.compareFunds([d, r], NOW, { '2': { units: 10.5, avgPrice: 70, sipMonthly: null } });
  assert.deepEqual(c.rows.find(x => x.key === 'plan')!.cells, ['Direct', 'Regular']);
  assert.deepEqual(c.rows.find(x => x.key === 'nav')!.cells, ['₹89.5841', '₹81.5696']);
  assert.deepEqual(c.rows.find(x => x.key === 'held')!.cells, ['Not recorded', '10.5 units']);
  assert.deepEqual(c.rows.find(x => x.key === 'status')!.cells, ['1 day old', '1 day old']);
  assert.ok(c.warnings.some(w => /Direct plan and one a Regular plan/.test(w)));
  assert.ok(c.warnings.some(w => /NAV numbers/.test(w)));
  const mixed = f.compareFunds([rec({ option: 'IDCW' }), rec({ code: '9' }), rec({ code: '8', date: '2022-04-11', plan: '' })], NOW);
  assert.ok(mixed.warnings.some(w => /Growth option and an IDCW option/.test(w)));
  assert.ok(mixed.warnings.some(w => /more than a week old/.test(w)));
  assert.ok(mixed.warnings.some(w => /does not say the plan/.test(w)));
  assert.ok(f.compareFunds([rec({ plan: 'Regular Plan', option: 'Direct' }), rec({ code: '3' })], NOW).warnings.some(w => /labels that disagree/.test(w)));
  assert.equal(f.compareFunds([d, d, d, d], NOW).rows[0].cells.length, 3);
  assert.ok(f.compareFunds([rec({ nav: null })], NOW).rows.find(x => x.key === 'nav')!.cells[0] === 'Not available');
  // never a verdict
  assert.deepEqual(f.compareFunds([d, r], NOW).rows.filter(x => /best|better|rank|score|winner/i.test(x.label)), []);
});

test('expense impact: hand-worked value, zero rate, and the gap is never negative when Direct costs less', () => {
  // 10,000 a month for 1 year at 12% a year: r = 1%, n = 12: 10000 * ((1.01^12 - 1) / 0.01) * 1.01 = 128,093.3...
  assert.ok(Math.abs(f.sipFutureValue(10000, 12, 1) - 128093.3) < 1);
  assert.equal(f.sipFutureValue(5000, 0, 10), 600000);
  const i = f.expenseImpact({ monthlySip: 10000, years: 20, regularEr: 1.8, directEr: 0.6, grossReturn: 12 });
  assert.ok(i.directCorpus > i.regularCorpus && i.difference > 0);
  assert.equal(i.invested, 2400000);
  assert.ok(Math.abs(i.differencePctOfInvested - (i.difference / i.invested) * 100) < 1e-9);
  assert.equal(f.expenseImpact({ monthlySip: 0, years: 20, regularEr: 1.8, directEr: 0.6, grossReturn: 12 }).differencePctOfInvested, 0);
});

test('SIP consistency: months, percent, and the two streaks', () => {
  const months = f.last12Months(new Date('2026-03-31T10:00:00'));
  assert.equal(months.length, 12);
  assert.equal(months[0], '2025-04');                   // 31 March minus a month is not "March 3rd": calendar months, not 30-day steps
  assert.equal(months[11], '2026-03');
  assert.deepEqual(f.last12Months(new Date('2026-01-15T10:00:00')).slice(0, 2), ['2025-02', '2025-03']);

  const all = f.last12Months(NOW);
  const full = f.sipConsistency(all, NOW);
  assert.deepEqual([full.paidCount, full.consistency, full.streak, full.streakThroughLastMonth], [12, 100, 12, 12]);
  const noCurrent = f.sipConsistency(all.slice(0, 11), NOW);          // this month not logged yet
  assert.deepEqual([noCurrent.paidCount, noCurrent.consistency, noCurrent.streak, noCurrent.streakThroughLastMonth], [11, 92, 0, 11]);
  const gap = f.sipConsistency(all.filter((_, i) => i !== 8), NOW);
  assert.deepEqual([gap.paidCount, gap.streak], [11, 3]);
  const none = f.sipConsistency([], NOW);
  assert.deepEqual([none.paidCount, none.consistency, none.streak, none.streakThroughLastMonth], [0, 0, 0, 0]);
  assert.equal(f.sipConsistency(['2019-01'], NOW).paidCount, 0);       // outside the window
});

test('SIP months come only from entries that mention sip / investment / mf / mutual fund', () => {
  const months = f.sipMonthsFromTransactions([
    { date: '2026-09-05', category: 'Savings & Investments', amount: 5000 },
    { date: '2026-08-05', type: 'SIP' },
    { date: '2026-07-05', category: 'Food & Dining' },
    { date: '2026-06-05', category: 'Mutual Fund' },
    { date: '2026-05-05', type: 'mf' },
    { date: '', category: 'sip' },
    null, 7, 'x',
  ]);
  assert.deepEqual(months.sort(), ['2026-05', '2026-06', '2026-08', '2026-09']);
  assert.deepEqual(f.sipMonthsFromTransactions('nope'), []);
});

test('recent funds: newest first, one per code, capped; the compare tray holds three', () => {
  let list: f.RecentFund[] = [];
  for (let i = 0; i < 25; i++) list = f.pushRecent(list, rec({ code: String(100000 + i) }), NOW);
  assert.equal(list.length, f.MAX_RECENT);
  assert.equal(list[0].rec.code, '100024');
  list = f.pushRecent(list, rec({ code: '100010' }), NOW);
  assert.equal(list[0].rec.code, '100010');
  assert.equal(list.filter(x => x.rec.code === '100010').length, 1);
  assert.deepEqual(f.normaliseRecent([{ rec: { code: 'bad' } }, ...list.slice(0, 2)]).map(x => x.rec.code), ['100010', '100024']);

  let t = f.toggleTray([], 'a1');
  assert.deepEqual(t, { codes: ['a1'], full: false });
  t = f.toggleTray(['1', '2', '3'], '4');
  assert.deepEqual(t, { codes: ['1', '2', '3'], full: true });
  assert.deepEqual(f.toggleTray(['1', '2', '3'], '2'), { codes: ['1', '3'], full: false });
});
