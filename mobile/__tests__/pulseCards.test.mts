// The PULSE feed: every website section is accounted for, every card's numbers come from the app's own cores, and nothing is invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SECTIONS, PORTED_IDS, buildFeed, pulseCtx } from '../lib/pulseCards.ts';
import { DEFAULT_ORDER, rank } from '../lib/pulseRank.ts';
import { makeFacts, taxEstimate } from '../lib/aryaFacts.ts';
import { computeNetWorth } from '../lib/trackers.ts';
import { best, STD_NEW, STD_OLD } from '../lib/taxcore.ts';
import { simulatePayoff } from '../lib/debt.ts';

const NOW = new Date(2026, 9, 14, 10, 0);   // 14 Oct 2026
const txn = (i: number, date: string, amount: number, category: string, kind: 'expense' | 'income' = 'expense') => ({ id: `t${i}`, i, date, amount, kind, category, label: category });
const policy = (type: string, sum: number, prem = 12000) => ({ id: type + sum, type, provider: 'X', sum_assured: sum, annual_premium: prem, renewal_date: '', policy_number: '', notes: '', added_at: '' }) as any;

const FULL = () => makeFacts({
  now: NOW,
  dependents: 2,
  data: {
    name: 'Asha', income: 100000, expense: 60000, emergencyFund: 150000, emergencyTarget: 6, monthlySip: 15000, portfolio: 500000, mfImport: 100000, sipValue: 50000,
    cash: 200000, gold: 100000, homeLoan: 300000, creditCard: 30000, used80c: 90000, age: 34,
    goals: [{ id: 'g1', name: 'Home down payment', target: 2000000, current: 400000, target_date: '2028-10-01' }],
    policies: [policy('health', 500000), policy('life_term', 5000000)],
    transactions: [txn(0, '2026-10-02', 12000, 'Food & Dining'), txn(1, '2026-10-05', 5000, 'Transport'), txn(2, '2026-10-06', 90000, 'Income', 'income')] as any,
    dna: [70, 60, 40, 55, 65],
  },
  moneyScore: { score: 58, band: 'ontrack', weakestLabel: 'Wealth', weakestScore: 30, topTitle: 'Add term cover', topHref: '/tracker/insurance', at: '2026-10-10T09:00:00.000Z' },
  taxInputs: { income: '1800000', used80c: '', usedHealth: '', usedNps: '' },
  loans: [{ key: 'home', label: 'Home loan', balance: 300000, rate: 8.5, emi: 22000 }, { key: 'cc', label: 'Credit card', balance: 30000, rate: 36, emi: 3000 }],
  events: [{ date: '2026-10-20', title: 'SIP debit', sub: '', type: 'sip', amount: 15000 }, { date: '2026-12-01', title: 'Far away', sub: '', type: 'tax' }],
});

test('every ranked website section is in the table, once, and ported ones have a builder', () => {
  assert.deepEqual(SECTIONS.map(s => s.id).sort(), [...DEFAULT_ORDER].sort());
  assert.equal(new Set(SECTIONS.map(s => s.id)).size, SECTIONS.length);
  const ported = SECTIONS.filter(s => s.status === 'ported').map(s => s.id).sort();
  assert.deepEqual(ported, [...PORTED_IDS].sort());
  SECTIONS.filter(s => s.status === 'not-ported').forEach(s => assert.ok(s.why.length > 20, s.id));
});

test('an empty phone shows an invitation for the Money Score and nothing invented', () => {
  const f = makeFacts({ now: NOW });
  const feed = buildFeed(f, null);
  assert.deepEqual(feed.cards.map(c => c.id), ['moneyScore']);
  assert.match(feed.cards[0].headline, /Not taken yet/);
  // what is missing is named, never defaulted
  assert.ok(feed.waiting.every(w => w.needs.length > 10 && w.route.startsWith('/')));
  assert.deepEqual(feed.since, []);
});

test('the context handed to the ranker holds only recorded figures; unknown stays zero or null', () => {
  const c = pulseCtx(makeFacts({ now: NOW }));
  assert.equal(c.income, 0); assert.equal(c.netWorth, 0); assert.equal(c.age, 0); assert.equal(c.moneyScore, null); assert.equal(c.gap80c, 0);
  const full = pulseCtx(FULL());
  assert.equal(full.gap80c, 60000);
  assert.equal(full.policies, 2);
  assert.equal(full.holdings, 650000);
  assert.equal(full.month, 10);
  assert.equal(full.moneyScore, 58);
});

test('the ranking on the phone is the website\'s ranking of that context', () => {
  const f = FULL();
  const feed = buildFeed(f, null);
  assert.deepEqual(feed.ranked, rank(pulseCtx(f), NOW));
  // cards follow the ranked order
  const order = feed.ranked.map(r => r.id).filter(id => feed.cards.some(c => c.id === id));
  assert.deepEqual(feed.cards.map(c => c.id), order);
});

test('card numbers equal the cores they are drawn from', () => {
  const f = FULL();
  const feed = buildFeed(f, null);
  const card = (id: string) => feed.cards.find(c => c.id === id)!;
  assert.ok(card('crossPageHUD').rows.some(r => r.label === 'Net worth'));
  const nw = computeNetWorth(f.data);
  const biggest = nw.assets.slice().sort((a, b) => b.value - a.value)[0];
  assert.equal(card('wealthXRay').rows[0].label, biggest.label);
  assert.match(card('wealthXRay').headline, /9\.5.*L|9,50,000/);   // 950000 of recorded assets
  // savings rate: 40% from 100000 income and 60000 spending
  assert.equal(card('savingsRateMeter').headline, '40% of income');
  // tax: the shared tax core on the income on the tax screen, standard deductions only (no 80C counted: used80c from the tracker is 90000)
  const b = best(1800000 - STD_NEW, 1800000 - STD_OLD - 90000);
  assert.match(card('taxDashboard').headline, new RegExp(Math.round(b.tax).toLocaleString('en-IN').replace(/,/g, ',')));
  const t = taxEstimate(f)!;
  assert.equal(t.tax, b.tax);
  // 80C room
  assert.match(card('taxOptimizer').headline, /60,000/);
  // stress test: plain percentages of the recorded holdings (650000)
  const st = card('portfolioStressTest');
  assert.match(st.rows[0].value, /₹1\.3.*L lower|₹1,30,000 lower/);
  assert.equal(st.rows.length, 3);
});

test('every card says where its numbers come from, and prints no NaN or undefined', () => {
  const feed = buildFeed(FULL(), null);
  assert.ok(feed.cards.length >= 12, `only ${feed.cards.length} cards`);
  for (const c of feed.cards) {
    assert.ok(c.source.length > 10, c.id);
    const all = JSON.stringify(c);
    assert.ok(!/NaN|undefined|Infinity|\[object/.test(all), `${c.id}: ${all}`);
  }
});

test('debt: payoff time only when every loan has balance, rate and EMI; otherwise the card says what is missing', () => {
  const f = FULL();
  const debt = buildFeed(f, null).cards.find(c => c.id === 'debtFreedomPlanner')!;
  const r = simulatePayoff(f.loans.map(l => ({ ...l })), 0, 'avalanche');
  assert.ok(r.paidOff);
  assert.ok(debt.rows.some(x => x.label === 'Debt-free in' && x.value.startsWith(`${Math.floor(r.months / 12)} years ${r.months % 12} months`)));
  const partial = makeFacts({ now: NOW, data: { homeLoan: 2000000 }, loans: [{ key: 'home', label: 'Home loan', balance: 2000000, rate: 0, emi: 0 }] });
  const d2 = buildFeed(partial, null).cards.find(c => c.id === 'debtFreedomPlanner')!;
  assert.ok(!d2.rows.some(x => x.label === 'Debt-free in'));
  assert.match(d2.note ?? '', /rate and EMI/);
});

test('tax and 80C cards wait for the figure they need instead of assuming one', () => {
  const f = makeFacts({ now: NOW, data: { income: 80000 } });
  const feed = buildFeed(f, null);
  assert.ok(feed.waiting.some(w => w.id === 'taxDashboard'));
  assert.ok(feed.waiting.some(w => w.id === 'taxOptimizer'));
  assert.ok(!feed.cards.some(c => c.id === 'taxDashboard' || c.id === 'taxOptimizer'));
});

test('insurance: no policy and no income gives no card; no policy with income says none is recorded', () => {
  assert.ok(!buildFeed(makeFacts({ now: NOW }), null).cards.some(c => c.id === 'insuranceGap'));
  const c = buildFeed(makeFacts({ now: NOW, data: { income: 50000 } }), null).cards.find(x => x.id === 'insuranceGap')!;
  assert.equal(c.headline, 'No policy is recorded');
  assert.match(c.note ?? '', /none is recorded here/);
});

test('"since your last visit" uses the stored snapshot and the website\'s thresholds', () => {
  const f = FULL();
  const first = buildFeed(f, null);
  assert.deepEqual(first.since, []);
  const later = makeFacts({ ...{ now: new Date(NOW.getTime() + 24 * 3600 * 1000) }, data: { ...f.data, cash: f.data.cash + 100000 }, moneyScore: f.moneyScore });
  const feed = buildFeed(later, first.snapshot);
  assert.ok(feed.since.some(l => /Net worth up/.test(l.text)), JSON.stringify(feed.since));
  // too soon (under 6 hours): nothing
  const soon = buildFeed(makeFacts({ now: new Date(NOW.getTime() + 3600 * 1000), data: { ...f.data, cash: 9e6 } }), first.snapshot);
  assert.deepEqual(soon.since, []);
});

test('a savings rate is never invented from income alone in the snapshot', () => {
  const f = makeFacts({ now: NOW, data: { income: 100000 } });
  assert.equal(buildFeed(f, null).snapshot.savingsRate, null);
});

test('at most three reasons are shown, and only on cards that are on screen', () => {
  const feed = buildFeed(FULL(), null);
  const withReason = feed.cards.filter(c => c.reason);
  assert.ok(withReason.length <= 3);
  withReason.forEach(c => assert.ok(typeof c.reason === 'string' && c.reason.length > 10));
});
