import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, toText } from '../lib/report.ts';
import { EMPTY_TRACKER_DATA, computeAll, type TrackerData } from '../lib/trackers.ts';

const NOW = new Date(2026, 9, 14);
const mk = (patch: Partial<TrackerData>) => { const data = { ...EMPTY_TRACKER_DATA, ...patch }; return { data, computed: computeAll(data, NOW) }; };
const input = (patch: Partial<TrackerData>, extra: Record<string, unknown> = {}) => ({ name: 'Asha', now: NOW, moneyScore: null, due: [], includeAmounts: true, ...mk(patch), ...extra }) as any;

test('an empty phone produces a report that says "Not recorded", with no NaN, undefined or invented figures', () => {
  const t = toText(buildReport(input({})));
  assert.ok(!/NaN|undefined|Infinity/.test(t), t);
  assert.match(t, /Net worth: Not recorded/);
  assert.match(t, /Monthly income: Not recorded/);
  assert.match(t, /Monthly spending: Not recorded/);
  assert.match(t, /Money Score: not taken/);
  assert.match(t, /No goals recorded/);
  assert.ok(!/Financial-independence/.test(t), 'a default spend must not produce a FIRE line');
});

test('recorded figures appear, with a savings rate only when income and spending are both known', () => {
  const t = toText(buildReport(input({ portfolio: 500000, fd: 200000, homeLoan: 300000, income: 100000, expense: 60000, emergencyFund: 180000, epf: 400000 })));
  assert.match(t, /Net worth: ₹8\.00 L/);                          // 5 L funds + 2 L deposits + 4 L EPF - 3 L loan
  assert.match(t, /Assets: ₹11\.00 L {3}Liabilities: ₹3\.00 L/);
  assert.match(t, /Saving: ₹40,000 a month \(40% of income\)/);
  assert.match(t, /Emergency fund: ₹1\.80 L = 3 months of spending/);
  assert.match(t, /EPF: ₹4\.00 L/);
  assert.match(t, /Financial-independence progress: \d+% \(25 times yearly spending, based on your recorded spending\)/);
  const noSpend = toText(buildReport(input({ income: 100000, portfolio: 500000 })));
  assert.ok(!/Saving: /.test(noSpend));
  assert.match(noSpend, /based on an assumed 60% of your income/);
});

test('with amounts left out no rupee figure appears, but percentages and months do', () => {
  const t = toText(buildReport(input({ portfolio: 500000, income: 100000, expense: 60000, emergencyFund: 180000 }, { includeAmounts: false })));
  assert.ok(!/₹\s?\d/.test(t), t);
  assert.match(t, /••••/);
  assert.match(t, /40% of income/);
  assert.match(t, /3 months of spending/);
  assert.match(t, /Amounts left out\./);
});

test('goals, scores, due items and the name are included', () => {
  const t = toText(buildReport(input({ goals: [{ id: 'g', name: 'House', target: 1000000, current: 250000, target_date: '2028-10-14', monthly_sip: 0 } as any] },
    { moneyScore: { score: 62, band: 'On track' }, due: [{ date: '2026-10-20', title: 'Netflix renews' }] })));
  assert.match(t, /Financial summary: Asha/);
  assert.match(t, /House: 25% funded \(₹2\.50 L of ₹10\.00 L\), 24 months left/);
  assert.match(t, /Money Score: 62\/100 \(On track\)/);
  assert.match(t, /2026-10-20 {2}Netflix renews/);
  assert.match(t, /As of 14 October 2026/);
});

test('insurance: no policies is stated, and gap lines note an assumed income when income is unknown', () => {
  const t = toText(buildReport(input({})));
  assert.match(t, /Insurance: no policies recorded/);
  assert.match(t, /Gap: No health insurance/);
  assert.match(t, /cover targets use an assumed income/);
  const known = toText(buildReport(input({ income: 100000 })));
  assert.ok(!/assumed income/.test(known));
});

test('a name with only spaces gives the plain title', () => {
  assert.equal(buildReport(input({}, { name: '   ' })).title, 'Financial summary');
});
