// Benchmark: only rules of thumb, each labelled; unknown stays unknown; no peer percentile anywhere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { benchmark, tally, NO_PEER_DATA, type BenchInput } from '../lib/benchmark.ts';
import { loadBenchInput } from '../lib/benchmarkStorage.ts';
import { TARGETS, compute } from '../lib/moneyScore.ts';

const BLANK: BenchInput = { age: null, monthlyIncome: null, monthlyExpenses: null, monthlyEmi: null, liquidSavings: null, monthlyInvesting: null, investedTotal: null, termCover: null, dependents: null };
const FULL: BenchInput = { age: 35, monthlyIncome: 100000, monthlyExpenses: 50000, monthlyEmi: 10000, liquidSavings: 600000, monthlyInvesting: 16000, investedTotal: 2_400_000, termCover: 12_000_000, dependents: 2 };
const by = (rows: ReturnType<typeof benchmark>) => Object.fromEntries(rows.map(r => [r.id, r]));

test('with nothing recorded every row is "unknown", never a default', () => {
  const rows = benchmark(BLANK);
  assert.equal(rows.length, 6);
  rows.forEach(r => { assert.equal(r.value, null, r.id); assert.ok(['unknown', 'na'].includes(r.status), r.id); });
  assert.deepEqual(tally(rows), { meets: 0, close: 0, below: 0, unknown: 6, na: 0 });
});

test('the targets are the Money Score\'s own, and the figures are plain ratios of the recorded numbers', () => {
  const r = by(benchmark(FULL));
  assert.equal(r.savings.target, TARGETS.savingsRate);
  assert.ok(Math.abs(r.savings.value! - 0.4) < 1e-12);       // (100,000 - 50,000 - 10,000) / 100,000
  assert.equal(r.savings.status, 'meets');
  assert.equal(r.investing.value, 0.16); assert.equal(r.investing.status, 'meets');
  assert.equal(r.debt.value, 0.1); assert.equal(r.debt.status, 'meets');
  assert.equal(r.emergency.value, 10); assert.equal(r.emergency.status, 'meets');       // 600,000 / 60,000
  assert.equal(r.term.value, 10); assert.equal(r.term.status, 'meets');
  assert.ok(Math.abs(r.wealth.value! - 2) < 1e-12);
  assert.equal(r.wealth.target, 2);                             // 35 is halfway between the 30 (1x) and 40 (3x) milestones
  assert.equal(r.wealth.status, 'meets');
});

test('statuses: close is within 75% of the target; lower-is-better debt has its own bands', () => {
  const r = by(benchmark({ ...FULL, monthlyIncome: 100000, monthlyExpenses: 70000, monthlyEmi: 12000, monthlyInvesting: 9000, liquidSavings: 300000, termCover: 4_000_000 }));
  assert.equal(r.savings.status, 'close');       // 18% against 20%
  assert.equal(r.investing.status, 'below');     // 9% against 15% is 60% of the target: under the 75% line
  assert.equal(r.debt.status, 'close');          // 12%: above the comfortable 10%, below the stretched 40%
  assert.equal(benchmark({ ...FULL, monthlyEmi: 45000 }).find(x => x.id === 'debt')!.status, 'below');
  assert.equal(r.term.status, 'below');
  assert.equal(r.emergency.value, 300000 / 82000);
});

test('term cover is not applicable with no dependents, and unknown dependents are not assumed', () => {
  assert.equal(by(benchmark({ ...FULL, dependents: 0, termCover: 0 })).term.status, 'na');
  assert.equal(by(benchmark({ ...FULL, dependents: null, termCover: 100000 })).term.status, 'unknown');
  assert.equal(by(benchmark({ ...FULL, dependents: null, termCover: 5e7 })).term.status, 'meets');
});

test('zero or negative income and spending do not divide by zero or invent a rating', () => {
  const rows = benchmark({ ...FULL, monthlyIncome: 0, monthlyExpenses: 0 });
  rows.forEach(r => assert.ok(r.value === null || Number.isFinite(r.value), r.id));
  assert.equal(by(rows).savings.status, 'unknown');
  const neg = by(benchmark({ ...FULL, monthlyExpenses: 90000, monthlyEmi: 30000 }));
  assert.ok(neg.savings.value! < 0); assert.equal(neg.savings.status, 'below');
  assert.ok(benchmark({ ...FULL, age: 200 }).find(x => x.id === 'wealth')!.status === 'unknown');
});

test('rows agree with the Money Score pillars on the same inputs (same targets, same direction)', () => {
  const s: any = compute({ age: 35, monthlyIncome: 100000, monthlyExpenses: 50000, monthlyEmi: 10000, liquidSavings: 600000, monthlyInvesting: 16000, investedTotal: 2_400_000, termCover: 12_000_000, healthCover: 1_000_000, dependents: 2 }, {});
  assert.equal(s.ok, true);
  const p = Object.fromEntries(s.pillars.map((x: any) => [x.id, x.score]));
  const r = by(benchmark(FULL));
  assert.equal(p.savings, 100); assert.equal(r.savings.status, 'meets');
  assert.equal(p.emergency, 100); assert.equal(r.emergency.status, 'meets');
  assert.equal(p.debt, 100); assert.equal(r.debt.status, 'meets');
  assert.equal(p.investing, 100); assert.equal(r.investing.status, 'meets');
});

test('no peer, percentile or "average Indian" wording anywhere in what the module can say', () => {
  const rows = benchmark(FULL);
  const all = rows.map(r => `${r.label} ${r.targetText} ${r.basis} ${r.note}`).join('\n');
  for (const rx of [/\bpeers?\b/i, /percentile/i, /top 10/i, /average indian/i, /SEBI|AMFI|RBI|NPS Trust/, /survey/i]) assert.ok(!rx.test(all), `${rx}`);
  rows.forEach(r => assert.match(r.basis, /rule of thumb|lenders|Rule of thumb/i, r.id));
  assert.match(NO_PEER_DATA, /does not compare you with other people/);
  const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../lib/benchmark.ts'), 'utf8');
  assert.ok(!/\bavg\b|top10/.test(src.replace(/\/\/.*$/gm, '')), 'no peer table in the code');
});

test('storage: dependents 0 and "not recorded" are different answers; nothing else is invented', async () => {
  await AsyncStorage.clear();
  const none = await loadBenchInput();
  assert.deepEqual(none.input, BLANK);
  await AsyncStorage.multiSet([['finos_monthly_income', '100000'], ['finos_dependents', '0'], ['finos_age', '35'], ['finos_monthly_expense', '40000']]);
  const got = await loadBenchInput();
  assert.equal(got.input.dependents, 0);
  assert.equal(got.input.monthlyIncome, 100000);
  assert.equal(got.input.monthlyExpenses, 40000);
  assert.equal(got.sources.monthlyExpenses, 'your budget');
  assert.equal(got.input.termCover, null === got.input.termCover ? null : got.input.termCover);
  assert.equal(got.input.monthlyEmi, null);
});
