// Plan, Map, Life, Cal, India cores + the net-worth history: figures come from records, nothing is assumed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFacts } from '../lib/aryaFacts.ts';
import { planSteps, nextStep, goalsWithReturn } from '../lib/aryaPlan.ts';
import { allocation, branches } from '../lib/aryaMap.ts';
import { lifeTimeline, AFFECTS } from '../lib/aryaLife.ts';
import { upcomingWindows, heatmap } from '../lib/aryaCal.ts';
import { RULES, taxFromTable, staleness, bothRegimes, currentDates, NEW_SLABS, OLD_SLABS } from '../lib/aryaIndia.ts';
import { taxNew, taxOld } from '../lib/taxcore.ts';
import { SECTIONS as TAXSEC } from '../lib/taxSavings.ts';
import { LTCG_EXEMPT, LTCG_RATE, STCG_RATE } from '../lib/taxHarvest.ts';
import { suggestionsFor, EVENT_TYPES, type DeclaredEvent } from '../lib/lifeEvents.ts';
import { record, trend, normaliseHistory, toMap } from '../lib/pulseHistory.ts';
import { buildFeed, SECTIONS } from '../lib/pulseCards.ts';
import { findSIP } from '../lib/lifeGoals.ts';

const NOW = new Date(2026, 9, 14, 10, 0);
const facts = (data: any = {}, over: any = {}) => makeFacts({ now: NOW, data, ...over });
const EMPTY = facts();
const FULL = () => facts({ income: 100000, expense: 60000, emergencyFund: 150000, cash: 200000, portfolio: 500000, homeLoan: 300000, monthlySip: 15000, used80c: 90000,
  goals: [{ id: 'g', name: 'House', target: 2000000, current: 400000, target_date: '2028-10-01' }],
  policies: [{ id: 'p', type: 'health', provider: 'X', sum_assured: 500000, annual_premium: 9000, renewal_date: '', policy_number: '', notes: '', added_at: '' }],
  transactions: [{ id: 't1', i: 0, date: '2026-10-03', amount: 12000, kind: 'expense', category: 'Food', label: 'x' }, { id: 't2', i: 1, date: '2026-10-04', amount: 1000, kind: 'expense', category: 'Food', label: 'y' }] },
  { loans: [{ key: 'home', label: 'Home loan', balance: 300000, rate: 8.5, emi: 22000 }], taxInputs: { income: '1800000', used80c: '', usedHealth: '', usedNps: '' },
    events: [{ date: '2026-10-20', title: 'SIP debit', sub: '', type: 'sip', amount: 15000 }, { date: '2026-11-15', title: 'Policy renewal', sub: '', type: 'insurance', amount: 9000 }, { date: '2026-11-16', title: 'FD matures', sub: '', type: 'fd', amount: 50000 }] });

test('Plan: an empty phone gives "needs a figure" steps, not invented ones', () => {
  const steps = planSteps(EMPTY);
  const by = Object.fromEntries(steps.map(s => [s.id, s]));
  assert.equal(by.emergency.status, 'unknown'); assert.equal(by.tax.status, 'unknown'); assert.equal(by.saving.status, 'unknown'); assert.equal(by.goals.status, 'unknown'); assert.equal(by.independence.status, 'unknown');
  assert.equal(by.debt.status, 'done'); assert.match(by.debt.stat, /No loans or card dues recorded/);
  assert.equal(nextStep(steps)!.id, 'emergency');
});

test('Plan: statuses follow the records, and the dependants record is respected', () => {
  const by = Object.fromEntries(planSteps(FULL()).map(s => [s.id, s]));
  assert.equal(by.emergency.status, 'progress'); assert.match(by.emergency.stat, /2\.5 of 6 months/);
  assert.equal(by.health.status, 'progress'); assert.equal(by.term.status, 'todo');
  assert.equal(by.saving.status, 'done'); assert.equal(by.tax.progress, 60);
  assert.equal(planSteps(facts({}, { dependents: 0 })).find(s => s.id === 'term')!.status, 'na');
});

test('Plan: goals with a return use lib/lifeGoals.findSIP, only when the person enters a return', () => {
  const f = FULL();
  assert.deepEqual(goalsWithReturn(f, null, null), []);
  const [g] = goalsWithReturn(f, 10, null);
  const years = g.monthsLeft / 12;
  assert.equal(g.withReturn, findSIP(Math.max(0, 2000000 - 400000 * Math.pow(1.1, years)), years, 0.10));
  assert.ok(g.withReturn < g.noReturn);
  assert.ok(goalsWithReturn(f, 10, 6)[0].withReturn > g.withReturn);
});

test('Map: allocation adds up to the recorded assets; branches say "Not recorded" for what is missing', () => {
  const a = allocation(FULL());
  assert.equal(a.reduce((s, x) => s + x.value, 0), 700000);
  assert.ok(Math.abs(a.reduce((s, x) => s + x.pct, 0) - 100) < 1e-9);
  assert.deepEqual(allocation(EMPTY), []);
  const e = branches(EMPTY);
  assert.equal(e.length, 8);
  assert.ok(e.find(b => b.id === 'income')!.rows.every(r => r.value === 'Not recorded'));
  assert.ok(!JSON.stringify(e).includes('₹50,000'));
});

test('Life: declared events and goal dates, ordered; "what it changes" matches the rules', () => {
  const ev: DeclaredEvent[] = [{ id: 'e1', type: 'child', date: '2026-12-01', createdAt: 0 }];
  const t = lifeTimeline(FULL(), ev);
  assert.deepEqual(t.map(x => x.kind), ['now', 'event', 'goal']);
  assert.equal(t[0].sub, 'Age not recorded');
  assert.ok(t.every((x, i) => i === 0 || t[i - 1].date <= x.date));
  // AFFECTS equals the kinds suggestionsFor can raise for each event type, over a phone set up to trigger every rule
  const rich = makeFacts({ now: NOW, data: { income: 100000, expense: 60000, emergencyFund: 10000, monthlySip: 5000, epf: 100000, creditCard: 50000, homeLoan: 100000,
    policies: [{ id: 'p', type: 'life_term', provider: 'X', sum_assured: 100000, annual_premium: 1, renewal_date: '', policy_number: '', notes: '', added_at: '' }], goals: [] },
    loans: [{ key: 'home', label: 'Home loan', balance: 1, rate: 1, emi: 40000 }], subs: { activeCount: 2, monthly: 500 } as any,
    events: [{ date: '2026-11-01', title: 'Renewal', sub: '', type: 'insurance', amount: 1 }] });
  for (const type of EVENT_TYPES) {
    const kinds = new Set(suggestionsFor([{ id: 'x', type, date: '2026-10-14', createdAt: 0 }], rich, NOW, 99).map(s => s.kind));
    for (const k of kinds) assert.ok(AFFECTS[type].includes(k), `${type} raises ${k} but AFFECTS lacks it`);
  }
});

test('Cal: windows hold the right days and total only money going out; the heatmap says what it compares with', () => {
  const w = Object.fromEntries(upcomingWindows(FULL()).map(x => [x.id, x]));
  assert.equal(w.week.items.length, 1); assert.equal(w.quarter.outflow, 9000);       // the FD maturity is not an outflow
  const h = heatmap(FULL());
  assert.equal(h.basis, 'recorded'); assert.equal(h.reference, 2000);
  assert.equal(h.daysTracked, 2); assert.equal(h.total, 13000);
  assert.equal(h.weeks.length, 26); assert.ok(h.weeks.every(c => c.length === 7));
  const own = heatmap(facts({ transactions: [{ id: 't', i: 0, date: '2026-10-03', amount: 500, kind: 'expense', category: 'x', label: 'x' }] }));
  assert.equal(own.basis, 'own-average');
  assert.equal(heatmap(EMPTY).basis, 'none');
  assert.ok(!JSON.stringify(heatmap(EMPTY)).includes('50000'));
});

test('India: the rules table rebuilds the app\'s tax exactly, and its limits equal the tax code', () => {
  let s = 1;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 400; i++) { const x = Math.round(rnd() * 6e6 / 100) * 100; assert.equal(taxFromTable(x, 'new'), taxNew(x), String(x)); assert.equal(taxFromTable(x, 'old'), taxOld(x), String(x)); }
  [1200000, 1200100, 1275000, 500000, 500001, 0].forEach(x => { assert.equal(taxFromTable(x, 'new'), taxNew(x)); assert.equal(taxFromTable(x, 'old'), taxOld(x)); });
  const lim = Object.fromEntries(TAXSEC.map(x => [x.id, x.maxDeduction]));
  assert.match(RULES.find(r => r.id === '80c')!.statement, new RegExp(String(lim.s80c).replace(/(\d)(?=(\d\d)+\d$)/g, '$1,')));
  assert.match(RULES.find(r => r.id === '80ccd1b')!.statement, /₹50,000/); assert.equal(lim.nps, 50000); assert.equal(lim.s80d, 25000); assert.equal(lim.s24b, 200000);
  assert.match(RULES.find(r => r.id === 'ltcg')!.statement, new RegExp(`${LTCG_EXEMPT.toLocaleString('en-IN')}.*${LTCG_RATE * 100}%`));
  assert.match(RULES.find(r => r.id === 'stcg')!.statement, new RegExp(`${STCG_RATE * 100}%`));
  assert.ok(NEW_SLABS.length === 7 && OLD_SLABS.length === 4);
  RULES.forEach(r => { assert.ok(r.source.length > 10 && r.asOf.includes('2025-26'), r.id); });
});

test('India: a later financial year is flagged; both regimes are shown and no regime or slab is assumed', () => {
  assert.match(staleness(new Date(2026, 9, 14))!, /FY 2026-27.*FY 2025-26/);
  assert.equal(staleness(new Date(2026, 1, 1)), null);
  const r = bothRegimes(1800000);
  assert.equal(r.taxNew, taxNew(1800000 - 75000)); assert.equal(r.taxOld, taxOld(1800000 - 50000));
  assert.ok(currentDates(NOW).every(d => d.date >= '2026-10-14'));
});

test('no tab prints an assumed income, age, slab or regime as the person\'s own', async () => {
  const { readFileSync } = await import('node:fs');
  const src = ['lib/aryaPlan.ts', 'lib/aryaMap.ts', 'lib/aryaLife.ts', 'lib/aryaCal.ts', 'lib/aryaIndia.ts', 'lib/aryaToolbox.ts', 'lib/aryaRetirement.ts'].map(f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')).join('\n');
  assert.ok(!/(ageOf\([^)]*\)|\bage)\s*(\|\||\?\?)\s*(30|25|35)\b/.test(src));
  assert.ok(!/(income|expense)\w*\s*(\|\||\?\?)\s*\d{4,}/.test(src), 'a default income or spending');
  // empty phone: nothing printed by any tab contains a rupee figure the person never gave
  const text = JSON.stringify([planSteps(EMPTY), branches(EMPTY), lifeTimeline(EMPTY, []), upcomingWindows(EMPTY)]);
  assert.ok(!/(?<![\d,])50,000|(?<![\d,])50000|75,000 a month|age 30/.test(text), text.slice(0, 300));
  // a tax estimate appears only with an income, and never names a slab or regime as the person's
  const india = JSON.stringify(RULES);
  assert.ok(!/\byour (slab|regime)\b/i.test(india));
});

test('net-worth history: one point a day, newest 90, website shape; trend needs two points and gives no rate under two weeks', () => {
  let p = record([], '2026-10-01', 100).points;
  p = record(p, '2026-10-01', 150).points;
  assert.deepEqual(toMap(p), { '2026-10-01': 150 });
  assert.equal(record(p, '2026-10-02', null).changed, false);
  assert.equal(record([], '2026-10-02', -5000).points[0].value, -5000);
  assert.equal(trend(p), null);
  let q = p; for (let d = 2; d <= 28; d++) q = record(q, `2026-10-${String(d).padStart(2, '0')}`, 150 + d * 10).points;
  const t = trend(q)!; assert.equal(t.spanDays, 27); assert.ok(t.perMonth !== null);
  assert.equal(trend(record(p, '2026-10-05', 200).points)!.perMonth, null);
  let big: any[] = []; for (let i = 0; i < 120; i++) big = record(big, new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), i).points;
  assert.equal(big.length, 90);
  assert.deepEqual(normaliseHistory('junk'), []); assert.deepEqual(normaliseHistory({ '2026-10-01': 'x', nope: 5 }), []);
});

test('PULSE: the new cards exist only with real inputs, and the section table agrees', () => {
  const none = buildFeed(EMPTY, null);
  assert.ok(!none.cards.some(c => ['netWorthTimeline', 'wealthVelocity', 'monteCarlo'].includes(c.id)));
  assert.ok(none.waiting.some(w => w.id === 'monteCarlo'));
  const f = facts({ cash: 400000 }, { nwHistory: [{ date: '2026-09-01', value: 300000 }, { date: '2026-10-01', value: 400000 }], retirementStore: { finos_retire_age: '58', finos_retire_exp_mo: '60000', finos_retire_current_age: '40', finos_fd_value: '2000000' } });
  const feed = buildFeed(f, null);
  const ids = feed.cards.map(c => c.id);
  ['netWorthTimeline', 'wealthVelocity', 'monteCarlo'].forEach(i => assert.ok(ids.includes(i), i));
  assert.match(feed.cards.find(c => c.id === 'wealthVelocity')!.headline, /\+₹\d/);
  for (const c of feed.cards) assert.ok(c.source.length > 5, c.id);
  const ported = SECTIONS.filter(s => s.status === 'ported').map(s => s.id).sort();
  assert.deepEqual(ported, ['behavioralDNA', 'crossPageHUD', 'debtFreedomPlanner', 'goalCards', 'indiaFinCalendar', 'insuranceGap', 'moneyScore', 'monteCarlo', 'netWorthTimeline', 'portfolioStressTest', 'savingsRateMeter', 'smartInsightCards', 'taxDashboard', 'taxOptimizer', 'transactionAnalyzer', 'wealthVelocity', 'wealthXRay'].sort());
});
