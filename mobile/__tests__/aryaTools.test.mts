// Arya's local tools: the intent matcher, and that every number comes from the same core as the screen that shows it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchIntent, runLocal, answerLocally, parseAmount, backendCallFor, formatBackend, knownFigures, knownFigureSet, withSource, HELP_EXAMPLES } from '../lib/aryaTools.ts';
import { makeFacts, taxEstimate } from '../lib/aryaFacts.ts';
import { byId } from '../lib/calcs/index.ts';
import { best, STD_NEW, STD_OLD } from '../lib/taxcore.ts';
import { computeNetWorth, computeEmergency } from '../lib/trackers.ts';
import { simulatePayoff } from '../lib/debt.ts';

const NOW = new Date(2026, 9, 14, 10, 0);
const facts = (data: any = {}, over: any = {}) => makeFacts({ now: NOW, data, ...over });
const FULL = () => facts({
  income: 100000, expense: 60000, emergencyFund: 150000, emergencyTarget: 6, monthlySip: 15000, cash: 200000, portfolio: 500000, homeLoan: 300000, used80c: 90000,
  goals: [{ id: 'g', name: 'House', target: 2000000, current: 400000, target_date: '2028-10-01' }],
  policies: [{ id: 'p', type: 'health', provider: 'X', sum_assured: 500000, annual_premium: 9000, renewal_date: '', policy_number: '', notes: '', added_at: '' }],
  transactions: [{ id: 't', i: 0, date: '2026-10-03', amount: 12000, kind: 'expense', category: 'Food & Dining', label: 'x' }],
}, {
  taxInputs: { income: '1800000', used80c: '', usedHealth: '', usedNps: '' },
  loans: [{ key: 'home', label: 'Home loan', balance: 300000, rate: 8.5, emi: 22000 }],
  events: [{ date: '2026-10-20', title: 'SIP debit', sub: '', type: 'sip', amount: 15000 }],
  moneyScore: { score: 62, band: 'ontrack', weakestLabel: 'Wealth', weakestScore: 30, topTitle: 'Add term cover', topHref: '/tracker/insurance', at: '2026-10-10T09:00:00.000Z' },
});

/* ── amounts ──────────────────────────────────────────────────────────────────────────────────────────── */
test('parseAmount understands rupees, k, lakh and crore', () => {
  const cases: [string, number | null][] = [['5000', 5000], ['₹5,000', 5000], ['5k', 5000], ['50 lakh', 5e6], ['50L', 5e6], ['1.5 cr', 15e6], ['2 crore', 2e7], ['Rs. 10,000', 10000], ['abc', null], ['', null]];
  cases.forEach(([s, v]) => assert.equal(parseAmount(s), v, s));
});

/* ── matcher ──────────────────────────────────────────────────────────────────────────────────────────── */
const YES: [string, string][] = [
  ['What is my net worth?', 'net_worth'], ['net worth', 'net_worth'], ["what's my net worth right now", 'net_worth'], ['how much am i worth', 'net_worth'],
  ['what is my savings rate', 'savings_rate'], ['how much am I saving', 'savings_rate'], ['am i saving enough', 'savings_rate'],
  ['how many months does my emergency fund cover', 'emergency'], ['my emergency fund', 'emergency'], ['emergency fund', 'emergency'],
  ['how are my goals doing', 'goals'], ['my goals', 'goals'],
  ["what's due this month", 'dues'], ['my upcoming renewals', 'dues'], ['what is due', 'dues'],
  ['how much did I spend this month', 'spend'], ['my spending this month', 'spend'],
  ['what is my money score', 'score'], ['money score', 'score'],
  ['do I have enough insurance', 'insurance'], ['my insurance cover', 'insurance'],
  ['what do I owe', 'debt'], ['what are my emis', 'debt'], ['my loans', 'debt'],
  ['how much tax do I pay', 'tax'], ['my tax', 'tax'], ['tax on 12 lakh income', 'tax'],
  ['SIP of 10000 at 12% for 15 years', 'sip'], ['what will a sip of 5k become in 10 years at 12%', 'sip'],
  ['EMI on 50 lakh at 8.5% for 20 years', 'emi'], ['emi for a loan of 25 lakh at 9 percent for 15 yrs', 'emi'],
  ['help', 'help'], ['what can you do', 'help'],
];
test('the matcher picks the right tool for personal and calculator questions', () => {
  YES.forEach(([q, intent]) => assert.equal(matchIntent(q)?.intent, intent, q));
});

const NO = [
  'what is a SIP?', 'explain net worth', 'what is an emergency fund', 'define inflation', 'how does ELSS work', 'Should I buy gold now?', 'is it good to invest in crypto',
  'difference between old and new tax regime', 'tell me about PPF', 'which is better, FD or debt fund', 'hello', '', 'how to start investing in mutual funds',
  'why did the market fall today', 'what is a good savings rate',
];
test('general or advice questions are left to the model: no local tool claims them', () => {
  NO.forEach(q => assert.equal(matchIntent(q), null, q));
});

test('amounts, rate and years are read from the question', () => {
  assert.deepEqual(matchIntent('SIP of 10000 at 12% for 15 years')?.params, { amount: 10000, rate: 12, years: 15 });
  assert.deepEqual(matchIntent('EMI on 50 lakh at 8.5% for 20 years')?.params, { amount: 5000000, rate: 8.5, years: 20 });
  assert.deepEqual(matchIntent('emi on 5 lakh at 10% for 36 months')?.params, { amount: 500000, rate: 10, years: 3 });
});

/* ── answers come from the cores ──────────────────────────────────────────────────────────────────────── */
test('net worth, emergency and savings rate equal the tracker cores', () => {
  const f = FULL();
  const nw = computeNetWorth(f.data);
  const r = runLocal({ intent: 'net_worth', params: {} }, f);
  assert.ok(r.complete);
  assert.match(r.text, /₹4\.00 L/);   // 200000 + 500000 of assets less 300000 owed
  assert.equal(Math.round(nw.netWorth), 400000);
  const em = computeEmergency(f.data);
  const e = runLocal({ intent: 'emergency', params: {} }, f);
  assert.ok(e.text.includes(`${em.covered.toFixed(1)} months`));
  assert.ok(e.text.includes('₹1,50,000'));
  const s = runLocal({ intent: 'savings_rate', params: {} }, f);
  assert.match(s.text, /saving 40%/);
});

test('SIP and EMI answers contain exactly the lines of the calculator screens', () => {
  const f = FULL();
  const sip = runLocal({ intent: 'sip', params: { amount: 10000, rate: 12, years: 15 } }, f);
  const rows = byId('sip')!.run({ monthly: 10000, rate: 12, time: 15 });
  rows.forEach(r => assert.ok(sip.text.includes(r.text), `${r.text} not in ${sip.text}`));
  const emi = runLocal({ intent: 'emi', params: { amount: 5000000, rate: 8.5, years: 20 } }, f);
  byId('emi')!.run({ loan: 5000000, rate: 8.5, time: 20 }).forEach(r => assert.ok(emi.text.includes(r.text), `${r.text} not in ${emi.text}`));
  assert.match(sip.text, /scenario, not a forecast/);
});

test('tax: the answer is the shared tax core on the income asked about, or on the Tax planner income', () => {
  const f = FULL();
  const asked = runLocal({ intent: 'tax', params: { amount: 1200000 } }, f);
  const b = best(1200000 - STD_NEW, 1200000 - STD_OLD - 90000);
  assert.ok(asked.text.includes(Math.round(b.taxNew).toLocaleString('en-IN')));
  assert.ok(asked.text.includes(Math.round(b.taxOld).toLocaleString('en-IN')));
  const own = runLocal({ intent: 'tax', params: {} }, f);
  const t = taxEstimate(f)!;
  assert.ok(own.text.includes(Math.round(t.taxNew).toLocaleString('en-IN')));
  assert.match(own.text, /not tax advice/);
});

test('debt: payoff time equals the debt optimizer\'s simulation, and only appears when every loan is complete', () => {
  const f = FULL();
  const r = runLocal({ intent: 'debt', params: {} }, f);
  const sim = simulatePayoff(f.loans.map(l => ({ ...l })), 0, 'avalanche');
  assert.ok(r.text.includes(`${Math.floor(sim.months / 12)} years ${sim.months % 12} months`));
  const part = facts({ homeLoan: 300000 }, { loans: [{ key: 'home', label: 'Home loan', balance: 300000, rate: 0, emi: 0 }] });
  assert.ok(!/debt-free/.test(runLocal({ intent: 'debt', params: {} }, part).text));
});

test('unrecorded figures are named, never defaulted', () => {
  const e = facts();
  const cases: [string, RegExp][] = [
    ['net_worth', /No assets or loans are recorded/], ['savings_rate', /not recorded/], ['emergency', /spending is not recorded/], ['goals', /No goals are recorded/],
    ['spend', /No spending is logged/], ['score', /not taken your Money Score/], ['insurance', /No insurance policy is recorded/], ['debt', /No loans or card dues are recorded/],
    ['tax', /need your annual income/],
  ];
  for (const [intent, re] of cases) {
    const r = runLocal({ intent: intent as any, params: {} }, e);
    assert.equal(r.complete, false, intent);
    assert.match(r.text, re, intent);
    assert.ok(r.route, intent);
  }
  assert.match(runLocal({ intent: 'sip', params: { amount: 5000 } }, e).text, /need the expected return, how many years/);
  assert.match(runLocal({ intent: 'emi', params: { amount: 5000000 } }, e).text, /need the interest rate, the tenure/);
});

test('answerLocally is matcher plus tool, and every reply names its source', () => {
  const f = FULL();
  for (const [q] of YES) {
    const r = answerLocally(q, f);
    assert.ok(r, q);
    assert.ok(withSource(r!).includes('From: '), q);
    assert.ok(!/NaN|undefined|Infinity/.test(r!.text), `${q}: ${r!.text}`);
  }
  assert.equal(answerLocally('what is a SIP?', f), null);
});

test('the help list only offers questions the matcher really handles', () => {
  HELP_EXAMPLES.forEach(q => assert.ok(matchIntent(q), q));
});

/* ── backend tools ────────────────────────────────────────────────────────────────────────────────────── */
test('market questions map to the public tool gateway; personal and advice questions never do', () => {
  assert.deepEqual(backendCallFor('price of RELIANCE')?.args, { symbol: 'RELIANCE', exchange: 'NSE' });
  assert.deepEqual(backendCallFor('TCS share price')?.args, { symbol: 'TCS', exchange: 'NSE' });
  assert.equal(backendCallFor('quote infy')?.name, 'get_quote');
  assert.equal(backendCallFor('how is the nifty today')?.name, 'get_market');
  assert.equal(backendCallFor('bitcoin price')?.name, 'get_crypto');
  assert.equal(backendCallFor('what is the dollar rate in rupees')?.name, 'get_fx');
  ['should I buy reliance share price', 'my net worth', 'what is a SIP', 'price of my house', 'hello', 'will nifty go up'].forEach(q => assert.equal(backendCallFor(q), null, q));
  // the call carries a public symbol only, never anything about the person
  assert.deepEqual(Object.keys(backendCallFor('price of HDFCBANK')!.args).sort(), ['exchange', 'symbol']);
});

test('tool results are worded deterministically, and an unexpected shape gives null (never a guess)', () => {
  assert.equal(formatBackend('get_quote', { symbol: 'TCS', name: 'Tata Consultancy', price: 3912.5, change: -12.3, change_pct: -0.31 }), 'TCS (Tata Consultancy) last traded at ₹3,912.50 (-12.30, -0.31%).');
  assert.match(formatBackend('get_market', { indices: { 'NIFTY 50': { price: 24500.1, change: 50, change_pct: 0.2 } } })!, /NIFTY 50: 24,500.1 \(\+50.00, \+0.20%\)/);
  assert.match(formatBackend('get_crypto', { crypto: { bitcoin: { name: 'Bitcoin', price_inr: 5400000, change_24h: 1.234 } } })!, /Bitcoin: ₹54,00,000 \(\+1.2% in 24h\)/);
  assert.match(formatBackend('get_fx', { USD_INR: 83.1234 })!, /USD to INR: 83.12/);
  [null, {}, { error: 'x' }, { price: 'abc', symbol: 'A' }, 'text', 5].forEach(r => assert.equal(formatBackend('get_quote', r as any), null));
});

/* ── known figures ────────────────────────────────────────────────────────────────────────────────────── */
test('knownFigures holds the recorded amounts and their sums, and nothing else', () => {
  const k = knownFigures(FULL());
  [100000, 60000, 150000, 400000, 2000000, 400000, 22000, 500000, 9000, 15000].forEach(n => assert.ok(k.includes(n), String(n)));
  assert.ok(!k.includes(123456));
  assert.deepEqual(knownFigures(facts()).filter(n => n > 10), []);
});

test('only monthly amounts are marked as annualisable', () => {
  const s = knownFigureSet(FULL());
  [100000, 60000, 15000, 22000].forEach(n => assert.ok(s.monthly.includes(n), String(n)));
  assert.ok(!s.monthly.includes(400000));          // net worth is not a per-month amount
  assert.ok(s.figures.includes(400000));
});
