import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAlerts, unreadCount, visibleAlerts, pruneState, normaliseState, type AlertFacts } from '../lib/alerts.ts';
import { EMPTY_TRACKER_DATA, computeAll, type TrackerData } from '../lib/trackers.ts';

const NOW = new Date(2026, 9, 14);                       // 14 Oct 2026
const facts = (patch: Partial<TrackerData>, extra: Partial<AlertFacts> = {}): AlertFacts => {
  const data = { ...EMPTY_TRACKER_DATA, ...patch };
  return { data, computed: computeAll(data, NOW), prevNetWorth: null, subscriptions: [], taxDates: [], ...extra };
};
const rules = (f: AlertFacts) => computeAlerts(f, NOW).map(a => a.rule);

test('nothing recorded, nothing raised', () => {
  assert.deepEqual(computeAlerts(facts({}), NOW), []);
});

test('emergency fund: only with both a fund and spending recorded, and only under three months', () => {
  assert.deepEqual(rules(facts({ emergencyFund: 90000, expense: 50000 })), ['EMERGENCY_FUND_LOW']);
  assert.deepEqual(rules(facts({ emergencyFund: 150000, expense: 50000 })), []);
  assert.deepEqual(rules(facts({ emergencyFund: 0, expense: 50000 })), []);           // not recorded is not "empty"
  const a = computeAlerts(facts({ emergencyFund: 90000, expense: 50000 }), NOW)[0];
  assert.match(a.message, /1\.8 months/);
  assert.match(a.message, /₹60,000/);
});

test('goals: behind only when there is a date and the monthly amount is under 80% of what is needed', () => {
  const g = (sip: number) => ({ id: 'g1', name: 'House', target: 1200000, current: 0, target_date: '2027-10-14', monthly_sip: sip } as any);
  assert.deepEqual(rules(facts({ goals: [g(0)] })), []);                                // no amount recorded: not known to be behind
  assert.deepEqual(rules(facts({ goals: [g(60000)] })), ['GOAL_BEHIND']);             // needs ~100,000 a month, 60,000 is under 80%
  assert.deepEqual(rules(facts({ goals: [g(90000)] })), []);
  assert.deepEqual(rules(facts({ goals: [{ ...g(0), target_date: '' }] })), []);       // no date, no judgement
});

test('insurance renewals within 30 days; sooner is critical; later or undated are quiet', () => {
  const p = (date: string) => ({ id: 'p', type: 'health', provider: 'Star', sum_assured: 500000, annual_premium: 14000, renewal_date: date, policy_number: '', notes: '', added_at: '' } as any);
  const near = computeAlerts(facts({ policies: [p('2026-10-18')] }), NOW);
  assert.equal(near[0].priority, 'critical');
  assert.equal(computeAlerts(facts({ policies: [p('2026-11-05')] }), NOW)[0].priority, 'warning');
  assert.deepEqual(rules(facts({ policies: [p('2027-03-01')] })), []);
  assert.deepEqual(rules(facts({ policies: [p('')] })), []);
});

test('tax dates inside 14 days, 80C only when recorded and only October to March', () => {
  assert.deepEqual(rules(facts({}, { taxDates: [{ date: '2026-10-20', title: 'Something' }, { date: '2026-12-15', title: 'Later' }] })), ['TAX_SEASON']);
  assert.deepEqual(rules(facts({ used80c: 60000 })), ['TAX_SAVE_80C']);
  assert.deepEqual(rules(facts({ used80c: 0 })), []);                                  // unknown is not "nothing invested"
  assert.deepEqual(rules(facts({ used80c: 150000 })), []);
  assert.deepEqual(computeAlerts(facts({ used80c: 60000 }), new Date(2026, 5, 10)).map(a => a.rule), []);   // June
});

test('subscriptions: trials and renewals within three days', () => {
  const subs = [{ name: 'Netflix', date: '2026-10-16', daysAway: 2, cost: 649, trial: false }, { name: 'Gym', date: '2026-10-25', daysAway: 11, cost: 6000, trial: false },
    { name: 'Spotify', date: '2026-10-15', daysAway: 1, cost: 119, trial: true }];
  const a = computeAlerts(facts({}, { subscriptions: subs }), NOW);
  assert.deepEqual(a.map(x => x.title), ['Spotify trial ends in 1 day', 'Netflix renews in 2 days']);
});

test('net worth milestone fires only when crossed since the last look', () => {
  const f = (prev: number | null, nw: number) => facts({ portfolio: nw }, { prevNetWorth: prev });
  assert.deepEqual(rules(f(null, 600000)), []);
  assert.deepEqual(rules(f(450000, 600000)), ['NETWORTH_MILESTONE']);
  assert.deepEqual(rules(f(550000, 600000)), []);
  const big = computeAlerts(f(90000, 1200000), NOW)[0];
  assert.match(big.title, /₹10 lakh/);                          // the highest milestone crossed
});

test('an unusual month needs three earlier months of data; budget alerts follow the tracker state', () => {
  const t = (date: string, amount: number, category = 'Food & Dining') => ({ id: date + amount, date, amount, kind: 'expense', category, label: '' } as any);
  const hist = [t('2026-07-10', 4000), t('2026-08-10', 4000), t('2026-09-10', 4000)];
  assert.deepEqual(rules(facts({ transactions: [...hist, t('2026-10-05', 12000)] })), ['ANOMALY_SPEND']);
  assert.deepEqual(rules(facts({ transactions: [...hist, t('2026-10-05', 5000)] })), []);
  assert.deepEqual(rules(facts({ transactions: [hist[2], t('2026-10-05', 12000)] })), []);        // only one earlier month
});

test('ids are unique, ordering is critical then warning, and state helpers behave', () => {
  const f = facts({ emergencyFund: 90000, expense: 50000, used80c: 60000, goals: [{ id: 'g', name: 'Car', target: 600000, current: 0, target_date: '2027-04-14', monthly_sip: 20000 } as any] });
  const a = computeAlerts(f, NOW);
  assert.equal(new Set(a.map(x => x.id)).size, a.length);
  assert.deepEqual(a.map(x => x.priority), ['critical', 'warning', 'info']);
  const st = { [a[0].id]: 'read' as const, [a[1].id]: 'dismissed' as const, gone: 'read' as const };
  assert.equal(unreadCount(a, st), 1);
  assert.equal(visibleAlerts(a, st).length, 2);
  assert.deepEqual(Object.keys(pruneState(st, a)).sort(), [a[0].id, a[1].id].sort());
  assert.deepEqual(normaliseState({ a: 'read', b: 'x', c: 1 }), { a: 'read' });
});
