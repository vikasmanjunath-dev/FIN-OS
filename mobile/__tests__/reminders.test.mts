// Which notifications get scheduled: lead times, "now" handling, caps, privacy of the text, and stable ids.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../lib/reminders.ts';
import { collectEvents } from '../lib/calendar.ts';

const on = { ...R.DEFAULT_PREFS, enabled: true };
const ev = (type: any, date: string, title = 'Thing', sub = '₹50,000 · due') => ({ type, date, title, sub });
const NOW = new Date(2026, 9, 13, 7, 0);                     // 13 Oct 2026, 07:00 (before the 9:00 notice)

test('nothing is planned when reminders are off', () => {
  assert.deepEqual(R.plan([ev('tax', '2026-10-20')], NOW, R.DEFAULT_PREFS), []);
});

test('a tax date gets a notice 7 days ahead and one on the day, at the chosen hour', () => {
  const p = R.plan([ev('tax', '2026-10-25', 'ITR')], NOW, on);
  assert.deepEqual(p.map(x => x.at), ['2026-10-18T09:00', '2026-10-25T09:00']);
  assert.deepEqual(p.map(x => x.daysBefore), [7, 0]);
});

test('a SIP debit (lead 1) gets a single notice the day before', () => {
  const p = R.plan([ev('sip', '2026-11-01', 'SIP')], NOW, on);
  assert.deepEqual(p.map(x => x.at), ['2026-10-31T09:00']);
});

test('when the lead window has already opened the first notice is today if the hour is still ahead, else tomorrow', () => {
  const early = R.plan([ev('insurance', '2026-10-16')], NOW, on);                         // due in 3 days, lead 7
  assert.equal(early[0].at, '2026-10-13T09:00');
  assert.match(early[0].title, /in 3 days/);
  const late = R.plan([ev('insurance', '2026-10-16')], new Date(2026, 9, 13, 10, 0), on);
  assert.equal(late[0].at, '2026-10-14T09:00');
  assert.match(late[0].title, /in 2 days/);
});

test('an event due today whose notice time has gone produces nothing; past events produce nothing', () => {
  assert.deepEqual(R.plan([ev('sub', '2026-10-13')], new Date(2026, 9, 13, 10, 0), on), []);
  assert.deepEqual(R.plan([ev('tax', '2026-10-01')], NOW, on), []);
});

test('an event due tomorrow with a long lead gets a heads-up today and one on the day; if today\'s slot has gone the two collapse into one', () => {
  const p = R.plan([ev('goal', '2026-10-14')], NOW, on);
  assert.deepEqual(p.map(x => x.at), ['2026-10-13T09:00', '2026-10-14T09:00']);
  const late = R.plan([ev('goal', '2026-10-14')], new Date(2026, 9, 13, 10, 0), on);
  assert.deepEqual(late.map(x => x.at), ['2026-10-14T09:00']);
});

test('by default the notice never contains the event name or an amount; details are opt-in', () => {
  const hidden = R.plan([ev('insurance', '2026-10-30', 'LIC Jeevan', '₹48,000 premium')], NOW, on)[0];
  assert.ok(!/LIC|48,000/.test(hidden.title + hidden.body));
  assert.match(hidden.title, /Insurance reminder/);
  const shown = R.plan([ev('insurance', '2026-10-30', 'LIC Jeevan', '₹48,000 premium')], NOW, { ...on, details: true })[0];
  assert.match(shown.title, /LIC Jeevan/);
  assert.match(shown.body, /48,000/);
});

test('per-type switches, the cap and ordering', () => {
  const many = Array.from({ length: 60 }, (_, i) => ev('sub', `2026-${i < 20 ? '11' : '12'}-${String((i % 28) + 1).padStart(2, '0')}`, 'S' + i));
  const p = R.plan(many, NOW, on);
  assert.ok(p.length <= R.MAX_PENDING);
  assert.deepEqual([...p].map(x => x.at), [...p].map(x => x.at).sort());
  assert.deepEqual(R.plan([ev('tax', '2026-10-25')], NOW, { ...on, types: { tax: false } }), []);
});

test('ids are stable across runs and unique per event and offset', () => {
  const a = R.plan([ev('tax', '2026-10-25', 'ITR')], NOW, on);
  const b = R.plan([ev('tax', '2026-10-25', 'ITR')], new Date(2026, 9, 13, 8, 0), on);
  assert.deepEqual(a.map(x => x.id), b.map(x => x.id));
  assert.equal(new Set(a.map(x => x.id)).size, a.length);
  assert.ok(a.every(x => x.id.startsWith('finos-')));
});

test('junk events and junk preferences are tolerated', () => {
  assert.deepEqual(R.plan([null as any, { type: 'x', date: '2026-10-20' } as any, { type: 'tax', date: 'soon' } as any], NOW, on), []);
  assert.deepEqual(R.normalisePrefs(null), R.DEFAULT_PREFS);
  assert.equal(R.normalisePrefs({ enabled: 'yes', hour: 99, details: 1 }).enabled, false);
  assert.equal(R.normalisePrefs({ enabled: true, hour: 99 }).hour, R.DEFAULT_HOUR);
  assert.equal(R.normalisePrefs({ enabled: true, hour: 18 }).hour, 18);
});

test('works on real calendar output: subscriptions and tax dates become notifications', () => {
  const events = collectEvents({ sip: [], fd: [], insurance: [], goals: [], subscriptions: [
    { id: 'a', name: 'Netflix', category: 'ott', amount: 649, cycle: 'monthly', nextDate: '2026-10-20' }] } as any, NOW, 3);
  const p = R.plan(events, NOW, on);
  assert.ok(p.some(x => x.type === 'sub' && x.date === '2026-10-20'));
  assert.ok(p.some(x => x.type === 'tax'));
  assert.ok(p.every(x => x.at >= '2026-10-13T09:00'));
});
