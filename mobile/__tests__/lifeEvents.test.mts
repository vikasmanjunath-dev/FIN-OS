// Life events: declared by the person, rules fire only from recorded facts, windows decide what is active.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as le from '../lib/lifeEvents.ts';
import * as store from '../lib/lifeEventsStorage.ts';
import { makeFacts } from '../lib/aryaFacts.ts';

const NOW = new Date(2026, 9, 14, 10, 0);
const T = NOW.getTime();
const ev = (type: le.LifeEventType, date: string): le.DeclaredEvent => ({ id: type + date, type, date, createdAt: T });
const policy = (type: string, sum: number) => ({ id: type, type, provider: 'X', sum_assured: sum, annual_premium: 9000, renewal_date: '', policy_number: '', notes: '', added_at: '' }) as any;
const facts = (data: any = {}, over: any = {}) => makeFacts({ now: NOW, data, ...over });

beforeEach(async () => { await AsyncStorage.clear(); });

test('dates must be real calendar dates between 1990 and 2100; a month alone means the 1st', () => {
  assert.equal(le.cleanDate('2026-03-15'), '2026-03-15');
  assert.equal(le.cleanDate('2026-03'), '2026-03-01');
  ['2026-02-30', '2026-13-01', '1980-01-01', '2101-01-01', '15/03/2026', 'tomorrow', '', null, 5].forEach(d => assert.equal(le.cleanDate(d as any), null, String(d)));
});

test('adding validates the type and date, refuses repeats, and caps the list', () => {
  const a = le.addEvent([], 'marriage', '2027-02-14', T);
  assert.ok(a.event);
  assert.equal(le.addEvent(a.list, 'nonsense', '2027-02-14', T).error, 'Pick what happened.');
  assert.match(le.addEvent(a.list, 'child', '14-02-2027', T).error!, /YYYY-MM-DD/);
  assert.match(le.addEvent(a.list, 'marriage', '2027-02-14', T).error!, /already there/);
  let list = a.list;
  for (let i = 0; i < le.MAX_EVENTS; i++) list = le.addEvent(list, 'windfall', `2027-${String((i % 12) + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`, T).list;
  assert.equal(list.length, le.MAX_EVENTS);
  assert.match(le.addEvent(list, 'child', '2030-01-01', T).error!, /up to 20/);
  assert.equal(le.removeEvent(a.list, a.event!.id).length, 0);
});

test('normalising stored events drops junk and repairs ids', () => {
  const raw = JSON.stringify([null, { type: 'child', date: '2027-01-05' }, { type: 'bogus', date: '2027-01-05' }, { type: 'home', date: 'x' }, { id: 'a', type: 'home', date: '2028-04' }, { id: 'a', type: 'job_loss', date: '2026-09-01' }]);
  const out = le.normaliseEvents(raw, T);
  assert.deepEqual(out.map(e => e.type), ['child', 'home', 'job_loss']);
  assert.equal(new Set(out.map(e => e.id)).size, 3);
  assert.deepEqual(le.normaliseEvents('{bad', T), []);
});

test('phases: later before the lead time, active inside the window, past after it', () => {
  const m = ev('marriage', '2027-02-14');           // lead 6 months, window 24
  assert.equal(le.phaseOf(m, new Date(2026, 6, 1)), 'later');
  assert.equal(le.phaseOf(m, new Date(2026, 9, 14)), 'active');
  assert.equal(le.phaseOf(m, new Date(2029, 5, 1)), 'past');
  assert.equal(le.phaseOf(ev('job_loss', '2026-10-14'), NOW), 'active');
  assert.equal(le.phaseOf(ev('job_loss', '2026-10-15'), NOW), 'later');    // lead 0: tomorrow's date has not started
});

test('nothing is raised for a later or past event', () => {
  const f = facts({ income: 90000 });
  assert.deepEqual(le.suggestionsFor([ev('marriage', '2029-01-01'), ev('child', '2020-01-01')], f), []);
});

test('rules fire from recorded facts and say what they rest on', () => {
  const f = facts({ income: 100000, expense: 60000, emergencyFund: 90000, emergencyTarget: 6, goals: [], policies: [] });
  const s = le.suggestionsFor([ev('child', '2027-01-10')], f, NOW, 10);
  const ids = s.map(x => x.id);
  assert.ok(ids.includes('child:health-missing'));
  assert.ok(ids.includes('child:term-missing'));
  assert.ok(ids.includes('child:goal'));
  const em = s.find(x => x.id === 'child:emergency')!;
  assert.match(em.title, /1\.5 months/);
  assert.ok(em.because.some(b => b.includes('₹90,000')));
  assert.ok(em.because.some(b => b.includes('₹60,000')));
  s.forEach(x => assert.ok(!/NaN|undefined/.test(JSON.stringify(x))));
});

test('with cover recorded, the same event raises the "add the baby" and cover-versus-guide prompts instead', () => {
  const f = facts({ income: 100000, policies: [policy('health', 500000), policy('life_term', 5000000)], goals: [{ id: 'g', name: 'Child education', target: 2000000, current: 100000, target_date: '2040-01-01' }] });
  const ids = le.suggestionsFor([ev('child', '2027-01-10')], f, NOW, 10).map(x => x.id);
  assert.ok(ids.includes('child:health-add'));
  assert.ok(ids.includes('child:term-low'));        // 50 lakh against 15 x 12 lakh = 1.8 Cr guide
  assert.ok(!ids.includes('child:goal'));
});

test('a rule that needs a figure that is not recorded says what to record instead of guessing', () => {
  const f = facts({});
  const s = le.suggestionsFor([ev('job_loss', '2026-10-01')], f, NOW, 10);
  assert.ok(s.some(x => x.id === 'job_loss:emergency-unknown'));
  assert.ok(!s.some(x => x.id === 'job_loss:runway'));
});

test('home: EMI load uses recorded EMIs and income only; term cover is compared with the recorded loan', () => {
  const f = facts({ income: 100000, homeLoan: 3000000, policies: [policy('life_term', 2000000)] }, { loans: [{ key: 'home', label: 'Home loan', balance: 3000000, rate: 8.5, emi: 25000 }] });
  const s = le.suggestionsFor([ev('home', '2027-03-01')], f, NOW, 10);
  assert.match(s.find(x => x.id === 'home:emi-load')!.title, /25%/);
  assert.ok(s.some(x => x.id === 'home:term-vs-loan'));
  const noIncome = le.suggestionsFor([ev('home', '2027-03-01')], facts({ homeLoan: 3000000 }, { loans: [{ key: 'home', label: 'Home loan', balance: 3000000, rate: 8.5, emi: 25000 }] }), NOW, 10);
  assert.ok(!noIncome.some(x => x.id === 'home:emi-load'));
});

test('at most three prompts per event by default, most important first', () => {
  const f = facts({ income: 100000, expense: 60000 });
  const s = le.suggestionsFor([ev('child', '2027-01-10')], f);
  assert.equal(s.length, 3);
  assert.ok(s[0].kind === 'insurance');
});

test('the context line carries the type and month only, never the day', () => {
  const line = le.contextLine([ev('child', '2027-01-10'), ev('marriage', '2020-02-02')], NOW);
  assert.equal(line, 'a child (2027-01)');
  assert.ok(!/10/.test(line));
});

test('storage: declare, list, delete, clear, corrupt value', async () => {
  const r = await store.declareLifeEvent('home', '2027-06', T);
  assert.ok(r.event);
  assert.equal((await store.loadLifeEvents(T)).length, 1);
  assert.equal((await store.declareLifeEvent('home', '2027-06', T)).error, 'That event is already there.');
  assert.equal((await store.deleteLifeEvent(r.event!.id, T)).length, 0);
  await AsyncStorage.setItem(store.LIFE_KEY, 'nope');
  assert.deepEqual(await store.loadLifeEvents(T), []);
  await store.declareLifeEvent('child', '2027-01-01', T);
  await store.clearLifeEvents();
  assert.equal(await AsyncStorage.getItem(store.LIFE_KEY), null);
});
