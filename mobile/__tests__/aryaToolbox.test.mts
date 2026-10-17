// The phone tools: numbers come from the same cores as the screens; a missing figure is named, never defaulted; every reply has a source and time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runDeviceTool, TOOL_SPECS, HELP_EXAMPLES, withSource, stamp } from '../lib/aryaToolbox.ts';
import { matchIntent } from '../lib/aryaIntent.ts';
import { makeFacts, taxEstimate } from '../lib/aryaFacts.ts';
import { byId } from '../lib/calcs/index.ts';
import { best, STD_NEW, STD_OLD } from '../lib/taxcore.ts';
import { computeNetWorth, computeEmergency } from '../lib/trackers.ts';
import { simulatePayoff } from '../lib/debt.ts';
import { SCREENS } from '../lib/search.ts';

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
  nwHistory: [{ date: '2026-09-01', value: 300000 }, { date: '2026-10-01', value: 400000 }],
});
const run = (t: any, a: any = {}, f = FULL()) => runDeviceTool(t, a, { facts: f });

test('net worth, emergency fund and savings rate equal the tracker cores', () => {
  const f = FULL();
  assert.match(run('net_worth').text, /₹4\.00 L/);
  assert.equal(Math.round(computeNetWorth(f.data).netWorth), 400000);
  const em = computeEmergency(f.data);
  assert.ok(run('emergency_fund').text.includes(`${em.covered.toFixed(1)} months`));
  assert.match(run('savings_rate').text, /saving 40%/);
});

test('SIP and EMI answers contain exactly the lines of the calculator screens', () => {
  const sip = run('sip_calc', { amount: 10000, rate: 12, years: 15 });
  byId('sip')!.run({ monthly: 10000, rate: 12, time: 15 }).forEach(r => assert.ok(sip.text.includes(r.text), r.text));
  const emi = run('emi_calc', { amount: 5000000, rate: 8.5, years: 20 });
  byId('emi')!.run({ loan: 5000000, rate: 8.5, time: 20 }).forEach(r => assert.ok(emi.text.includes(r.text), r.text));
  byId('fd')!.run({ deposit: 100000, rate: 7, time: 5 }).forEach(r => assert.ok(run('fd_calc', { amount: 100000, rate: 7, years: 5 }).text.includes(r.text)));
  byId('lumpsum')!.run({ amount: 100000, rate: 10, time: 8 }).forEach(r => assert.ok(run('lumpsum_calc', { amount: 100000, rate: 10, years: 8 }).text.includes(r.text)));
  assert.match(sip.text, /scenario, not a forecast/);
});

test('tax: the shared tax core on the income asked about, or on the Tax planner income; never a regime assumed', () => {
  const asked = run('tax_estimate', { income: 1200000 });
  const b = best(1200000 - STD_NEW, 1200000 - STD_OLD - 90000);
  assert.ok(asked.text.includes(b.taxNew.toLocaleString('en-IN')) && asked.text.includes(b.taxOld.toLocaleString('en-IN')));
  assert.match(asked.text, /I do not know which regime you file under/);
  const t = taxEstimate(FULL())!;
  assert.ok(run('tax_estimate').text.includes(t.taxNew.toLocaleString('en-IN')));
  assert.match(run('tax_80c').text, /₹60,000 is unused/);
});

test('debt payoff equals the debt optimizer, and appears only when every loan is complete', () => {
  const f = FULL();
  const sim = simulatePayoff(f.loans.map(l => ({ ...l })), 0, 'avalanche');
  assert.ok(run('debt').text.includes(`${Math.floor(sim.months / 12)} years ${sim.months % 12} months`));
  const part = facts({ homeLoan: 300000 }, { loans: [{ key: 'home', label: 'Home loan', balance: 300000, rate: 0, emi: 0 }] });
  assert.ok(!/debt-free/.test(run('debt', {}, part).text));
});

test('unrecorded figures are named, never defaulted', () => {
  const e = facts();
  const cases: [string, RegExp][] = [['net_worth', /No assets or loans/], ['savings_rate', /not recorded/], ['emergency_fund', /spending is not recorded/], ['goals', /No goals/], ['spending_month', /No spending is logged/],
    ['money_score', /not taken your Money Score/], ['insurance', /No insurance policy/], ['debt', /No loans/], ['tax_estimate', /need your annual income/], ['tax_80c', /do not know how much 80C/],
    ['fire', /not recorded/], ['retirement_odds', /I need/], ['trend', /recorded/], ['subscriptions', /No subscriptions/], ['life_plan', /No life events/], ['assets', /No assets/], ['goal_sip', /No goals/]];
  for (const [t, re] of cases) { const r = run(t, {}, e); assert.equal(r.complete, false, t); assert.match(r.text, re, t); }
  assert.match(run('sip_calc', { amount: 5000 }, e).text, /need the expected return, how many years/);
  assert.match(run('inflation_calc', { amount: 100000, years: 10 }, e).text, /I will not assume a rate/);
  assert.match(run('lumpsum_calc', { amount: 100000, years: 10 }, e).text, /will not assume a return/);
});

test('retirement odds run only when retire age, spending and age are really stored', () => {
  const store = { finos_retire_age: '58', finos_retire_exp_mo: '60000', finos_retire_current_age: '40', finos_sip_value: '1500000', finos_retire_monthly_invest: '30000' };
  const f = facts({}, { retirementStore: store });
  const r = run('retirement_odds', {}, f);
  assert.equal(r.complete, true);
  assert.match(r.text, /of 2,000 simulated futures/);
  assert.match(r.text, /You have not set: inflation 6%/);
  for (const k of ['finos_retire_age', 'finos_retire_exp_mo', 'finos_retire_current_age']) {
    const s2: any = { ...store }; delete s2[k];
    assert.equal(run('retirement_odds', {}, facts({}, { retirementStore: s2 })).complete, false, k);
  }
});

test('trend: from recorded points only; a span under two weeks gives no monthly rate', () => {
  assert.match(run('trend').text, /went from ₹3\.00 L on 2026-09-01 to ₹4\.00 L on 2026-10-01/);
  const short = facts({ cash: 1 }, { nwHistory: [{ date: '2026-10-10', value: 1 }, { date: '2026-10-12', value: 5 }] });
  assert.match(run('trend', {}, short).text, /no monthly rate/);
});

test('every phone reply names its source and has a time; no NaN anywhere', () => {
  const f = FULL();
  for (const s of TOOL_SPECS.filter(x => x.where === 'phone')) {
    const m = matchIntent(s.example);
    if (m.kind !== 'tool') continue;
    const r = runDeviceTool(m.tool, m.args, { facts: f, events: [], memory: [] });
    assert.ok(r.source.length > 5 && r.asOf === NOW.getTime(), s.id);
    assert.ok(withSource(r).includes('As of 14 Oct, 10:00'), s.id);
    assert.ok(!/NaN|undefined|Infinity/.test(r.text), `${s.id}: ${r.text}`);
  }
  assert.equal(stamp(NOW.getTime()), '14 Oct, 10:00');
});

test('the help list only offers questions the matcher handles; phone tools send nothing', () => {
  HELP_EXAMPLES.forEach(q => assert.equal(matchIntent(q).kind, 'tool', q));
  TOOL_SPECS.filter(t => t.where === 'phone').forEach(t => assert.match(t.sends, /Nothing leaves the phone/));
  TOOL_SPECS.filter(t => t.where === 'server').forEach(t => assert.ok(!/income|net worth|savings|goal/i.test(t.sends), t.id));
});

const ARYA_ROUTES = new Set(['/arya/map', '/arya/agent', '/arya/plan', '/arya/life', '/arya/cal', '/arya/india']);   // new screens, listed in the notes for lib/search.ts
test('every route a tool points at is a real screen', () => {
  const known = new Set(SCREENS.map(s => s.route));
  const f = FULL();
  for (const s of TOOL_SPECS.filter(x => x.where === 'phone')) {
    const m = matchIntent(s.example); if (m.kind !== 'tool') continue;
    const r = runDeviceTool(m.tool, m.args, { facts: f });
    if (r.route && !/^\/tools\/calc\//.test(r.route) && !ARYA_ROUTES.has(r.route)) assert.ok(known.has(r.route) || ['/pulse', '/pulse/life', '/pulse/memory', '/alerts', '/dashboard', '/profile'].includes(r.route), `${s.id} -> ${r.route}`);
  }
});

test('no tool recommends buying or selling', () => {
  const f = FULL();
  for (const s of TOOL_SPECS.filter(x => x.where === 'phone')) { const m = matchIntent(s.example); if (m.kind === 'tool') assert.ok(!/\b(you should (buy|sell)|buy now|sell now)\b/i.test(runDeviceTool(m.tool, m.args, { facts: f }).text), s.id); }
});
