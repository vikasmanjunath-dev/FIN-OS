// Fixed-income entries on the device: same key and shape as the website, derived totals kept in step, foreign/odd records tolerated.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addFD, loadFD, removeFD } from '@/lib/fixedIncomeStorage';
import { buildEntry, totals } from '@/lib/fixedIncome';

const NOW = new Date(Date.UTC(2026, 9, 11, 8));
const entry = (id: string, amount = 100000) => {
  const r = buildEntry({ type: 'fd', label: id, bank: '', amount, rate: 7, startDate: '2026-04-11', termMonths: 12, nominee: '' }, new Date(NOW.getTime() + Number(id.slice(-1))));
  if (!r.ok) throw new Error(r.error);
  return { ...r.entry, id };
};

beforeEach(async () => { await AsyncStorage.clear(); });

test('adding writes the list under the website key and the two derived totals', async () => {
  await addFD(entry('fd_1'), NOW);
  const raw = JSON.parse((await AsyncStorage.getItem('finos_fd_portfolio'))!);
  assert.equal(raw.length, 1);
  assert.equal(raw[0].principal, 100000);
  const t = totals(raw, NOW);
  assert.equal(Number(await AsyncStorage.getItem('finos_fd_value')), t.currentValue);
  assert.equal(Number(await AsyncStorage.getItem('finos_fd_principal')), 100000);
});

test('removing one leaves the others and updates the totals', async () => {
  await addFD(entry('fd_1'), NOW);
  await addFD(entry('fd_2', 50000), NOW);
  const left = await removeFD('fd_1', NOW);
  assert.deepEqual(left.map(e => e.id), ['fd_2']);
  assert.equal(Number(await AsyncStorage.getItem('finos_fd_principal')), 50000);
  await removeFD('fd_2', NOW);
  assert.equal(Number(await AsyncStorage.getItem('finos_fd_value')), 0);
});

test('two quick adds cannot lose each other', async () => {
  await Promise.all([addFD(entry('fd_1'), NOW), addFD(entry('fd_2'), NOW), addFD(entry('fd_3'), NOW)]);
  assert.equal((await loadFD()).length, 3);
});

test('corrupt or foreign data is ignored, never thrown', async () => {
  await AsyncStorage.setItem('finos_fd_portfolio', '{not json');
  assert.deepEqual(await loadFD(), []);
  await AsyncStorage.setItem('finos_fd_portfolio', JSON.stringify([null, 5, { id: 'x' }, { id: 'ok', type: 'fd', startDate: '2026-01-01', principal: 1, termMonths: 6, rate: 5 }]));
  assert.deepEqual((await loadFD()).map(e => e.id), ['ok']);
});
