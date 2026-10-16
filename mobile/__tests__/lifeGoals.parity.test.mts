// The phone's life-goals plan must equal the website's js/finos-life-goals.js, the roadmap must contain only figures worked out from
// the person's own numbers, and the planner must pre-fill only from recorded data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as app from '../lib/lifeGoals.ts';
import { buildPrefill, loadPlanner, savePlanTotals, saveDraft, yearsUntil, BLANK_FORM, DRAFT_KEY, FEAS_KEY } from '../lib/lifeGoalsStorage.ts';

const require = createRequire(import.meta.url);
const web = require(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../js/finos-life-goals.js'));

function rng(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const R = rng(20261014);
const pick = <T,>(a: T[]) => a[Math.floor(R() * a.length)];

function randomInput(): app.PlanInput {
  const income = Math.round(15000 + R() * R() * 900000);
  const surplus = R() < 0.05 ? 0 : Math.round(income * (0.02 + R() * 0.7));
  return {
    age: 18 + Math.floor(R() * 50), income, surplus, savings: R() < 0.2 ? 0 : Math.round(R() * R() * 3e7),
    retireAge: 40 + Math.floor(R() * 30), returnRate: pick([0, 0.04, 0.07, 0.1, 0.12, 0.15, Math.round(R() * 200) / 1000]),
    goals: Array.from({ length: Math.floor(R() * 6) }, (_, i) => ({
      name: pick(['Home', 'Car', 'Retirement', 'Child education', `G${i}`]), amount: Math.round(10000 + R() * R() * 8e7),
      years: pick([1, 2, 3, 5, 7, 10, 15, 20, 30, 0.5, 2.5]), inflation: pick([0, 0.04, 0.06, 0.08, 0.1]),
    })),
  };
}

test('sipFV and findSIP equal the website, including a 0% rate and very large targets', () => {
  for (let n = 0; n < 1500; n++) {
    const monthly = Math.round(R() * 5e5), months = Math.floor(R() * 480), rate = pick([0, 0.05, 0.08, 0.12, 0.2, R() * 0.3]);
    assert.equal(app.sipFV(monthly, months, rate), web.sipFV(monthly, months, rate));
    const target = pick([0, 1, 1000, Math.round(R() * 1e9), Math.round(R() * 1e12)]), years = pick([0, 0.25, 1, 5, 10, 30]);
    assert.equal(app.findSIP(target, years, rate), web.findSIP(target, years, rate), JSON.stringify({ target, years, rate }));
  }
});

test('the whole plan (emergency fund, shared savings, SIPs, feasibility) equals the website on 1,500 random households', () => {
  for (let n = 0; n < 1500; n++) {
    const inp = randomInput();
    const mine = app.plan(inp), theirs = web.plan(inp);
    const label = JSON.stringify(inp);
    for (const k of ['efTarget', 'efDone', 'efGap', 'efAlloc', 'pool', 'poolLeft', 'totalSIPNeeded', 'sipAvail', 'feasPct', 'retireYears', 'returnRate', 'returnAssumed']) {
      assert.equal((mine as any)[k], theirs[k], `${k} ${label}`);
    }
    assert.equal(mine.processed.length, theirs.processed.length, label);
    mine.processed.forEach((g, i) => {
      const t = theirs.processed[i];
      for (const k of ['name', 'amount', 'years', 'inflation', 'inflatedTarget', 'fromSavings', 'netTarget', 'sipNeeded']) assert.equal((g as any)[k], t[k], `${k} ${label}`);
    });
  }
});

test('validation messages equal the website', () => {
  const ok = { age: 30, income: 100000, surplus: 30000, retireAge: 58 };
  const cases = [ok, { ...ok, age: 0 }, { ...ok, age: 90 }, { ...ok, income: 500 }, { ...ok, surplus: 0 }, { ...ok, surplus: 100000 }, { ...ok, retireAge: 30 },
    { ...ok, returnRate: 0 }, { ...ok, returnRate: NaN }, { ...ok, returnRate: 0.6 }, { ...ok, returnRate: 0.12 }];
  for (const c of cases) assert.equal(app.validateProfile(c), web.validateProfile(c), JSON.stringify(c));
});

test('goal rows: nothing is filled in for the person; a blank row is skipped, a half-filled one is an error', () => {
  const row = (name: string, amount: number, years: number, inflation = 0.06) => ({ name, amount, years, inflation });
  assert.equal(app.validateGoals([row('', 0, 0)]).error, 'Add at least one goal with a target amount and a time frame.');
  assert.match(app.validateGoals([row('Car', 0, 5)]).error!, /target amount/);
  assert.match(app.validateGoals([row('Car', 500000, 0)]).error!, /time frame/);
  assert.match(app.validateGoals([row('Car', 500000, 80)]).error!, /time frame/);
  assert.match(app.validateGoals([row('Car', 500000, 5, NaN)]).error!, /inflation/);
  const ok = app.validateGoals([row('', 0, 0), row('Car', 500000, 5, 0), row('', 100000, 2)]);
  assert.equal(ok.error, null);
  assert.deepEqual(ok.goals.map(g => [g.name, g.inflation]), [['Car', 0], ['Goal 3', 0.06]]);     // 0% inflation stays 0%
});

const INPUT: app.PlanInput = { age: 30, income: 100000, surplus: 40000, savings: 500000, retireAge: 58, returnRate: 0.1, goals: [
  { name: 'Home', amount: 5000000, years: 8, inflation: 0.06 }, { name: 'Trip', amount: 200000, years: 2, inflation: 0.05 }, { name: 'Retirement corpus', amount: 30000000, years: 28, inflation: 0.06 }] };

test('the roadmap is derived from the person\'s numbers: every figure in it can be recomputed', () => {
  const p = app.plan(INPUT);
  const ph = app.roadmap(INPUT, p, { dependents: 2, termCover: 5000000 });
  assert.deepEqual(ph.map(x => x.id), ['foundation', 'acceleration', 'goal-0', 'goal-1', 'goal-2', 'milestones', 'retirement']);
  const text = (id: string) => ph.find(x => x.id === id)!.items.map(i => i.text).join('\n');
  // emergency fund: 6 x (income - investable) = 360,000; savings 500,000 cover it, so it is complete
  assert.equal(p.efTarget, 360000);
  assert.match(text('foundation'), /Emergency fund target: ₹3\.60 L/);
  assert.match(text('foundation'), /complete/);
  // goal phases are nearest first and carry the plan's own SIP and inflated target
  assert.deepEqual(ph.filter(x => x.id.startsWith('goal-')).map(x => x.title), ['Trip', 'Home', 'Retirement corpus']);
  const home = p.processed.find(g => g.name === 'Home')!;
  assert.ok(text('goal-1').includes(`₹${Math.round(home.sipNeeded).toLocaleString('en-IN')}`) || home.sipNeeded >= 1e5, text('goal-1'));
  assert.match(text('goal-1'), /at 6% a year of inflation/);
  // the lower-return sensitivity is the SIP recomputed at 3 points less
  const low = app.findSIP(home.netTarget, 8, 0.07);
  assert.ok(text('goal-1').includes('7%'), text('goal-1'));
  assert.ok(low >= home.sipNeeded);
  // a retirement-named goal points to the Retirement planner
  assert.ok(ph.find(x => x.id === 'goal-2')!.items.some(i => i.kind === 'pointer' && i.href === '/tools/retirement'));
  // milestones: monthly compounding from the savings, in order
  const ms = ph.find(x => x.id === 'milestones')!.items;
  assert.equal(ms.length, app.WEALTH_MILESTONES.length);
  assert.equal(app.monthsToReach(1_000_000, 0, 10000, 0), 100);
  assert.equal(app.monthsToReach(100, 500, 10, 0.1), 0);
  assert.equal(app.monthsToReach(1e9, 0, 1, 0, 24), null);
});

test('the roadmap no longer makes the website\'s fixed claims (premium ranges, fund names, allocations, tax at an assumed slab)', () => {
  // words and phrases only: a plain rupee figure such as 8,000 can legitimately be a goal amount
  const BANNED = [/Nifty/i, /FlexiCap/i, /Small Cap/i, /allocation/i, /ELSS/, /80C/, /80CCD/, /floater/i, /\bSWR\b/, /\bSWP\b/, /EMI capacity/i,
    /down payment/i, /100 [−-] age/, /willpower/i, /on track/i, /top 20%/i, /guaranteed/i, /per year \(≈/, /premium/i, /shift equity/i, /rebalanc/i];
  for (let n = 0; n < 200; n++) {
    const inp = randomInput();
    inp.goals = inp.goals.concat([{ name: 'Own Home', amount: 8000000, years: 7, inflation: 0.06 }]);
    const p = app.plan(inp);
    for (const phase of app.roadmap(inp, p, { dependents: pick([0, 1, 3, null]), termCover: pick([0, 1e6, null]) })) {
      const all = [phase.title, phase.when, phase.summary, ...phase.items.map(i => i.text)].join('\n');
      for (const rx of BANNED) assert.ok(!rx.test(all), `${rx} in: ${all}`);
      assert.ok(!/NaN|undefined|Infinity/.test(all), all);
      phase.items.forEach(i => assert.ok(['figure', 'assumption', 'pointer'].includes(i.kind)));
    }
  }
});

test('a fully funded goal and a zero emergency-fund gap read correctly', () => {
  const inp = { ...INPUT, savings: 360000 + 6000000, goals: [{ name: 'Trip', amount: 200000, years: 2, inflation: 0.05 }] };
  const p = app.plan(inp);
  assert.equal(p.totalSIPNeeded, 0);
  const ph = app.roadmap(inp, p, {});
  assert.match(ph.find(x => x.id === 'goal-0')!.items.map(i => i.text).join(' '), /fully fund this goal/);
  const noFund = app.plan({ ...INPUT, savings: 0 });
  assert.ok(noFund.efAlloc > 0);
  assert.match(app.roadmap({ ...INPUT, savings: 0 }, noFund, {})[0].items.map(i => i.text).join(' '), /closes the .* gap in about \d+ months/);
});

test('pre-fill: only what is recorded; the rest stays blank; nothing is guessed', () => {
  const now = new Date(2026, 9, 14);
  const empty = buildPrefill({}, now);
  assert.deepEqual(empty.form, { ...BLANK_FORM, goals: [{ name: '', amount: '', years: '', inflation: '6' }] });
  assert.deepEqual(empty.from, {});
  assert.equal(empty.dependents, null);
  const full = buildPrefill({
    finos_age: '34', finos_monthly_income: '150000', finos_savings_rate: '24', finos_emergency_fund: '300000', finos_cash_value: '50000', finos_fd_value: '200000',
    finos_dependents: '0', finos_term_insurance: '10000000',
    finos_goals: JSON.stringify([{ name: 'House', target: 5000000, current: 100000, target_date: '2031-10-14' }, { name: 'Bad', target: 0 }, { name: 'No date', target: 100000 }, 'x', null]),
  }, now);
  assert.equal(full.form.age, '34'); assert.equal(full.form.income, '150000');
  assert.equal(full.form.surplus, '36000');                  // 24% of 150,000, from the recorded rate
  assert.equal(full.form.efSaved, '300000'); assert.equal(full.form.otherSavings, '250000');
  assert.equal(full.form.retireAge, ''); assert.equal(full.form.returnPct, '');         // never assumed for the person
  assert.deepEqual(full.form.goals.map(g => [g.name, g.amount, g.years]), [['House', '5000000', '5'], ['No date', '100000', '']]);
  assert.equal(full.goalsNote, 1);
  assert.equal(full.dependents, 0); assert.equal(full.termCover, 10000000);
  assert.equal(full.from.surplus, 'your recorded savings rate of 24%');
  // a rate with no income, an out-of-range age, a past goal date: nothing is filled
  const odd = buildPrefill({ finos_savings_rate: '30', finos_age: '12', finos_goals: JSON.stringify([{ name: 'Old', target: 10, target_date: '2020-01-01' }]) }, now);
  assert.equal(odd.form.surplus, ''); assert.equal(odd.form.age, ''); assert.equal(odd.form.goals[0].years, '');
  assert.equal(yearsUntil('not a date', now), ''); assert.equal(yearsUntil(null, now), ''); assert.equal(yearsUntil('2026-10-20', now), '0.1');
});

test('storage: a saved draft wins over the pre-fill; totals go to the website keys and feasibility to its own', async () => {
  await AsyncStorage.clear();
  await AsyncStorage.multiSet([['finos_age', '40'], ['finos_monthly_goals_feasibility', '1'], ['finos_goals_feasibility', '77']]);
  const a = await loadPlanner(new Date(2026, 9, 14));
  assert.equal(a.form.age, '40'); assert.equal(a.draft, null);
  await saveDraft({ ...BLANK_FORM, age: '41', goals: [{ name: 'X', amount: '10', years: '2', inflation: '0' }] });
  const b = await loadPlanner(new Date(2026, 9, 14));
  assert.equal(b.draft!.age, '41'); assert.equal(b.draft!.goals[0].inflation, '0');
  await AsyncStorage.setItem(DRAFT_KEY, '{bad json');
  assert.equal((await loadPlanner()).draft, null);
  const p = app.plan(INPUT);
  await savePlanTotals(p);
  assert.equal(await AsyncStorage.getItem('finos_goals_monthly_sip'), String(Math.round(p.totalSIPNeeded)));
  assert.equal(await AsyncStorage.getItem('finos_goals_count'), '3');
  assert.equal(await AsyncStorage.getItem(FEAS_KEY), String(p.feasPct));
  assert.equal(await AsyncStorage.getItem('finos_goals_feasibility'), '77');           // the Goal optimizer's key is left alone
});

test('the roadmap text is word for word the website module\'s on 400 random households', () => {
  for (let n = 0; n < 400; n++) {
    const inp = randomInput();
    const rec = { dependents: pick([0, 2, null]), termCover: pick([0, 5e6, null]) };
    const mine = app.roadmap(inp, app.plan(inp), rec as any), theirs = web.roadmap(inp, web.plan(inp), rec);
    const strip = (ph: any[]) => ph.map(p => ({ id: p.id, title: p.title, when: p.when, summary: p.summary, items: p.items.map((i: any) => [i.kind, i.text]) }));
    assert.deepEqual(strip(mine), strip(theirs), JSON.stringify(inp));
  }
});
