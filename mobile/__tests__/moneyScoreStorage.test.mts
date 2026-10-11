// Saving a Money Score: same entry shape as the website, one history point per day, and shared keys are seeded only when empty.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { compute } from '@/lib/moneyScore';
import * as store from '@/lib/moneyScoreStorage';

const inputs = { age: 32, dependents: 0, monthlyIncome: 75000, monthlyExpenses: 35000, monthlyEmi: 12000, monthlyInvesting: 10000, liquidSavings: 150000, investedTotal: 600000, termCover: 0, healthCover: 0 };
const NOW = new Date(2026, 9, 12, 10, 0);

beforeEach(async () => { await AsyncStorage.clear(); });

test('a saved score has the website\'s entry shape and is read back', async () => {
  const r = compute(inputs, undefined);
  assert.equal(r.ok, true);
  const { entry } = await store.saveScoreResult(r, NOW);
  assert.deepEqual(Object.keys(entry).sort(), ['at', 'band', 'inputs', 'pillars', 'score', 'top', 'v', 'weakest']);
  assert.equal(entry.score, 71);
  assert.equal(entry.band, 'ontrack');
  assert.equal(entry.weakest?.id, 'wealth');
  assert.equal(entry.top?.id, 'insurance');
  assert.deepEqual(await store.loadSavedScore(), JSON.parse(JSON.stringify(entry)));
});

test('history keeps one point per day and reports the move since the previous day', async () => {
  const day = (d: number) => new Date(2026, 9, d, 9, 0);
  await store.saveScoreResult(compute({ ...inputs, liquidSavings: 50000 }), day(10));
  await store.saveScoreResult(compute(inputs), day(11));
  await store.saveScoreResult(compute({ ...inputs, liquidSavings: 400000 }), day(11));   // same day again replaces, not appends
  const hist = await store.loadScoreHistory();
  assert.deepEqual(hist.map(h => h.date), ['2026-10-10', '2026-10-11']);
  assert.ok(store.trend(hist) && store.trend(hist)!.delta > 0);
});

test('shared keys are seeded only where the person has not entered anything', async () => {
  await AsyncStorage.setItem('finos_monthly_income', '99999');              // already entered: must survive
  await store.saveScoreResult(compute(inputs), NOW);
  assert.equal(await AsyncStorage.getItem('finos_monthly_income'), '99999');
  assert.equal(await AsyncStorage.getItem('finos_monthly_expense'), '35000');
  assert.equal(await AsyncStorage.getItem('finos_emergency_fund'), '150000');
  assert.equal(await AsyncStorage.getItem('finos_sip_monthly'), '10000');
});

test('prefill reads what the app tracks: insurance policies give term and health cover', async () => {
  await AsyncStorage.multiSet([
    ['finos_monthly_income', '80000'], ['finos_age', '34'], ['finos_emergency_fund', '120000'], ['finos_sip_total', '8000'],
    ['finos_insurance_policies', JSON.stringify([
      { id: 'p1', type: 'life_term', provider: 'HDFC Life', sum_assured: 10000000, annual_premium: 12000 },
      { id: 'p3', type: 'life_ulip', provider: 'Some ULIP', sum_assured: 5000000, annual_premium: 50000 },   // an investment plan, not protection
      { id: 'p2', type: 'health', provider: 'Star Health', sum_assured: 500000, annual_premium: 9000 },
    ])],
  ]);
  const g = await store.gatherScoreData();
  assert.equal(g.data.income, 80000);
  assert.equal(g.data.sipMonthly, 8000);                // falls back to the app's own SIP total
  assert.equal(g.data.termCover, 10000000);              // the ULIP is not counted as term cover
  assert.equal(g.healthCover, 500000);
});
