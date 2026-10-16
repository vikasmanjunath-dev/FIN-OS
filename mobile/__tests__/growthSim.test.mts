// The growth projection must agree with the website's Growth Simulator page, and its sources must come from recorded data only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { simulate, scenarios, validateSim, type SimInput } from '../lib/growthSim.ts';
import { summariseSources, loadSimSources, saveSimDraft, DRAFT_KEY } from '../lib/growthSimStorage.ts';
import { money } from '../lib/calcs/fmt.ts';   // the page's own format: amounts under 1 lakh are rounded
import { loadWebCalc } from './helpers/webCalc.mts';

function rng(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const R = rng(20261014);

test('with no step-up it equals the website page: same total invested, interest and final value', () => {
  const page = loadWebCalc('investment & wealth/portfolio.html');
  for (let n = 0; n < 150; n++) {
    const i: SimInput = {
      startCorpus: Math.round(R() * 5e6 / 1000) * 1000, monthlySip: Math.round(R() * 1e5 / 500) * 500, stepUpPct: 0,
      years: 1 + Math.floor(R() * 40), annualReturn: Math.round(R() * 60) / 2,
    };
    page.set('current', i.startCorpus); page.set('monthly', i.monthlySip); page.set('rate', i.annualReturn); page.set('time', i.years);
    const web = page.run();
    const r = simulate(i);
    assert.equal(web.finalVal, 'Portfolio: ' + money(r.final), JSON.stringify(i));
    assert.equal(web.investedVal, money(r.invested), JSON.stringify(i));
    assert.equal(web.interestVal, money(r.gain), JSON.stringify(i));
  }
});

test('closed form and a hand-worked case: 10,000 a month for 12 months at 12% = 1,28,093 (annuity due)', () => {
  const r = simulate({ startCorpus: 0, monthlySip: 10000, stepUpPct: 0, years: 1, annualReturn: 12 });
  assert.ok(Math.abs(r.final - 128093.28) < 0.5);
  assert.equal(r.invested, 120000);
  assert.equal(simulate({ startCorpus: 0, monthlySip: 1000, stepUpPct: 0, years: 2, annualReturn: 0 }).final, 24000);   // 0% is a real rate
  assert.equal(simulate({ startCorpus: 100000, monthlySip: 0, stepUpPct: 0, years: 3, annualReturn: 0 }).final, 100000);
});

test('step-up raises the SIP every 12 months; inflation gives a smaller real value; scenarios are ordered', () => {
  const flat = simulate({ startCorpus: 0, monthlySip: 10000, stepUpPct: 0, years: 10, annualReturn: 10 });
  const up = simulate({ startCorpus: 0, monthlySip: 10000, stepUpPct: 10, years: 10, annualReturn: 10, inflationPct: 6 });
  assert.ok(up.final > flat.final);
  assert.ok(Math.abs(up.lastMonthlySip - 10000 * Math.pow(1.1, 9)) < 1e-6);
  assert.ok(Math.abs(up.invested - 12 * 10000 * ((Math.pow(1.1, 10) - 1) / 0.1)) < 1e-6);
  assert.ok(Math.abs(up.realFinal! - up.final / Math.pow(1.06, 10)) < 1e-6);
  assert.equal(flat.realFinal, null);
  assert.equal(up.points.length, 11);
  const sc = scenarios({ startCorpus: 500000, monthlySip: 5000, stepUpPct: 0, years: 15, annualReturn: 10 });
  assert.ok(sc.low.final < sc.mid.final && sc.mid.final < sc.high.final);
  assert.deepEqual([sc.lowRate, sc.highRate], [8, 12]);
  assert.equal(scenarios({ startCorpus: 1, monthlySip: 0, stepUpPct: 0, years: 5, annualReturn: 1 }).lowRate, 0);       // never below 0%
});

test('validation: missing or silly input is named, never defaulted', () => {
  const ok: SimInput = { startCorpus: 1000, monthlySip: 0, stepUpPct: 0, years: 10, annualReturn: 10 };
  assert.equal(validateSim(ok), null);
  assert.match(validateSim({ ...ok, startCorpus: 0 })!, /invested today or a monthly/);
  assert.match(validateSim({ ...ok, annualReturn: NaN })!, /return/);
  assert.match(validateSim({ ...ok, years: 0 })!, /1 to 60/);
  assert.match(validateSim({ ...ok, years: 61 })!, /1 to 60/);
  assert.match(validateSim({ ...ok, annualReturn: 51 })!, /return/);
  assert.match(validateSim({ ...ok, stepUpPct: -1 })!, /step-up/);
  assert.match(validateSim({ ...ok, startCorpus: -5 })!, /today/);
  assert.match(validateSim({ ...ok, inflationPct: 99 })!, /Inflation/);
  const huge = simulate({ startCorpus: 1e12, monthlySip: 1e8, stepUpPct: 50, years: 60, annualReturn: 50 });
  assert.ok(Number.isFinite(huge.final) || huge.final === Infinity);   // does not throw
});

test('sources: holdings valued at last price (cost when unpriced, flagged), SIPs summed, tracker SIPs kept separate', () => {
  const s = summariseSources(
    JSON.stringify([
      { id: 'a', type: 'MF', symbol: '1', name: 'A', units: 100, avgPrice: 100, lastPrice: 150, sipMonthly: 5000 },
      { id: 'b', type: 'Stock', symbol: 'X', name: 'X', units: 10, avgPrice: 200 },
      { id: 'c', type: 'Stock', symbol: 'Z', name: 'Z', units: 0, avgPrice: 200 },
      'junk', null,
    ]),
    JSON.stringify([{ fundName: 'F', monthlyAmount: 3000 }, { fundName: 'G', amount: 2000 }, { fundName: 'H' }]),
  );
  assert.deepEqual(s, { holdingsCount: 2, holdingsValue: 15000 + 2000, unpriced: 1, holdingsSip: 5000, sipCount: 1, trackerSip: 5000, trackerCount: 2 });
  assert.deepEqual(summariseSources(null, 'not json'), { holdingsCount: 0, holdingsValue: 0, unpriced: 0, holdingsSip: 0, sipCount: 0, trackerSip: 0, trackerCount: 0 });
});

test('storage: nothing is pre-set but the draft the person saved', async () => {
  await AsyncStorage.clear();
  const none = await loadSimSources();
  assert.equal(none.draft, null);
  await saveSimDraft({ corpus: '1000', sip: '500', stepUp: '5', years: '10', ret: '9', infl: '', useTracker: true });
  const got = await loadSimSources();
  assert.deepEqual(got.draft, { corpus: '1000', sip: '500', stepUp: '5', years: '10', ret: '9', infl: '', useTracker: true });
  await AsyncStorage.setItem(DRAFT_KEY, 'oops');
  assert.equal((await loadSimSources()).draft, null);
});
