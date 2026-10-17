// What is left in lib/aryaTools.ts: the figures the app holds (for the guardrail) and the reply when the model cannot be asked.
// The tools themselves are tested in aryaToolbox / aryaServerTools / aryaAgent / aryaIntent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { knownFigures, knownFigureSet, localOnlyReply } from '../lib/aryaTools.ts';
import { makeFacts } from '../lib/aryaFacts.ts';
import { runDeviceTool, HELP_EXAMPLES } from '../lib/aryaToolbox.ts';

const NOW = new Date(2026, 9, 14, 10, 0);
const facts = (data: any = {}, over: any = {}) => makeFacts({ now: NOW, data, ...over });
const FULL = () => facts({
  income: 100000, expense: 60000, emergencyFund: 150000, emergencyTarget: 6, monthlySip: 15000, cash: 200000, portfolio: 500000, homeLoan: 300000, used80c: 90000,
  goals: [{ id: 'g', name: 'House', target: 2000000, current: 400000, target_date: '2028-10-01' }],
  policies: [{ id: 'p', type: 'health', provider: 'X', sum_assured: 500000, annual_premium: 9000, renewal_date: '', policy_number: '', notes: '', added_at: '' }],
}, {
  taxInputs: { income: '1800000', used80c: '', usedHealth: '', usedNps: '' },
  loans: [{ key: 'home', label: 'Home loan', balance: 300000, rate: 8.5, emi: 22000 }],
  events: [{ date: '2026-10-20', title: 'SIP debit', sub: '', type: 'sip', amount: 15000 }],
});

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

test('offline: a phone answer comes with its source and time; otherwise plain words and what still works', () => {
  const local = runDeviceTool('savings_rate', {}, { facts: FULL() });
  const t1 = localOnlyReply(local, null);
  assert.match(t1, /your own records answer this/);
  assert.match(t1, /saving 40%/);
  assert.match(t1, /From: Income and spending/);
  assert.match(t1, /As of 14 Oct, 10:00/);

  const t2 = localOnlyReply(null, null);
  assert.ok(!/7475|arya-ai|\bport\b|backend|localhost/i.test(t2), t2);
  HELP_EXAMPLES.slice(0, 6).forEach(e => assert.ok(t2.includes(e), e));
  assert.match(localOnlyReply(null, null, true), /Developer note/);
});

test('with tools switched off the offline reply says so instead of offering questions that will not be answered', () => {
  const t = localOnlyReply(null, null, false, true);
  assert.match(t, /Tools are switched off/);
  assert.ok(!/Questions I can answer on this phone/.test(t));
});
