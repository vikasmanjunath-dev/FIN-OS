// Custom calendar dates and the .ics export.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as f from '../lib/financialCalendar.ts';
import { loadCustomEvents, addCustomEvent, updateCustomEvent, removeCustomEvent, CUSTOM_EVENTS_KEY } from '../lib/financialCalendarStorage.ts';
import { collectEvents } from '../lib/calendar.ts';

const ev = (p: Partial<f.CustomEvent>): f.CustomEvent => ({ id: 'a', title: 'Fee', date: '2026-11-15', amount: null, repeat: 'none', note: '', ...p });

test('real days only: leap years, month lengths, junk', () => {
  assert.ok(f.isRealDay('2028-02-29')); assert.ok(!f.isRealDay('2027-02-29')); assert.ok(!f.isRealDay('2026-04-31'));
  for (const bad of ['2026-1-1', '', null, 5, '2026-13-01', '1999-01-01', '2026-00-10']) assert.ok(!f.isRealDay(bad), String(bad));
});

test('validation names the problem and never defaults', () => {
  assert.deepEqual(f.validateCustom({ title: ' School fee ', date: '2026-12-01', amount: '₹12,500' }), { ok: true, title: 'School fee', date: '2026-12-01', amount: 12500 });
  assert.deepEqual(f.validateCustom({ title: 'x', date: '2026-12-01', amount: '' }), { ok: true, title: 'x', date: '2026-12-01', amount: null });
  assert.deepEqual(f.validateCustom({ title: 'x', date: '2026-12-01', amount: '0' }), { ok: true, title: 'x', date: '2026-12-01', amount: null });
  assert.match((f.validateCustom({ title: '', date: '2026-12-01', amount: '' }) as any).error, /name/);
  assert.match((f.validateCustom({ title: 'x', date: '2026-02-30', amount: '' }) as any).error, /real date/);
  assert.match((f.validateCustom({ title: 'x', date: '2026-12-01', amount: 'abc' }) as any).error, /number/);
  assert.match((f.validateCustom({ title: 'x', date: '2026-12-01', amount: '-5' }) as any).error, /number/);
  assert.match((f.validateCustom({ title: 'x'.repeat(61), date: '2026-12-01', amount: '' }) as any).error, /under 60/);
});

test('repeats: once, monthly (clamped to short months), yearly (29 Feb falls on 28 Feb), never before the first date', () => {
  assert.deepEqual(f.occurrences(ev({}), '2026-11-01', '2026-11-30'), ['2026-11-15']);
  assert.deepEqual(f.occurrences(ev({}), '2026-11-16', '2027-01-01'), []);
  const m = f.occurrences(ev({ date: '2026-01-31', repeat: 'monthly' }), '2026-01-01', '2026-05-31');
  assert.deepEqual(m, ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
  assert.deepEqual(f.occurrences(ev({ date: '2026-03-10', repeat: 'monthly' }), '2026-01-01', '2026-04-30'), ['2026-03-10', '2026-04-10']);
  assert.deepEqual(f.occurrences(ev({ date: '2024-02-29', repeat: 'yearly' }), '2026-01-01', '2028-12-31'), ['2026-02-28', '2027-02-28', '2028-02-29']);
  assert.deepEqual(f.occurrences(ev({ repeat: 'yearly' }), '2026-11-15', '2026-11-15'), ['2026-11-15']);
  assert.deepEqual(f.occurrences(ev({}), '2027-01-01', '2026-01-01'), []);
  assert.deepEqual(f.occurrences(ev({ date: 'bad' }), '2026-01-01', '2026-12-31'), []);
});

test('stored list is cleaned: bad dates and empty titles dropped, duplicate ids made unique, repeat defaulted to once', () => {
  const l = f.normaliseCustom([
    { id: 'x', title: ' Rent ', date: '2026-12-01', amount: '5000', repeat: 'monthly', note: 'n'.repeat(300) },
    { id: 'x', title: 'Again', date: '2026-12-02', repeat: 'weekly' },
    { id: 'y', title: '', date: '2026-12-02' }, { id: 'z', title: 'Bad', date: '2026-02-31' }, null, 'junk',
  ]);
  assert.equal(l.length, 2);
  assert.equal(l[0].amount, 5000); assert.equal(l[0].note.length, f.MAX_NOTE); assert.equal(l[0].repeat, 'monthly');
  assert.equal(l[1].repeat, 'none'); assert.notEqual(l[0].id, l[1].id);
  assert.deepEqual(f.normaliseCustom('no'), []);
});

test('custom dates become calendar entries sorted by day, with amount and repeat in the subtitle', () => {
  const out = f.customToEvents([ev({ title: 'B', date: '2026-12-05', amount: 2500, repeat: 'yearly', note: 'cheque' }), ev({ id: 'b', title: 'A', date: '2026-11-20' })], '2026-11-01', '2026-12-31');
  assert.deepEqual(out.map(e => [e.date, e.title, e.type]), [['2026-11-20', 'A', 'custom'], ['2026-12-05', 'B', 'custom']]);
  assert.equal(out[1].sub, '₹2,500 · repeats every year · cheque');
});

test('.ics: valid structure, CRLF lines, escaped text, all-day end is the next day, amounts can be left out', () => {
  const now = new Date(Date.UTC(2026, 9, 14, 8, 30, 5));
  const events: f.AnyEvent[] = [
    { date: '2026-12-31', title: 'Tax-saving deadline, FY 26-27; 80C', sub: 'Last date for 80C.\nCheck it.', type: 'tax' },
    { date: '2026-11-01', title: 'Index fund', sub: '₹10K/mo debit', type: 'sip', amount: 10000 },
    { date: '2026-11-01', title: 'Index fund', sub: '₹10K/mo debit', type: 'sip', amount: 10000 },
    { date: '2026-02-30', title: 'Impossible', sub: '', type: 'tax' },
  ];
  const ics = f.toIcs(events, { now, includeAmounts: true });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 3);                       // the impossible date is dropped
  assert.ok(!/[^\r]\n/.test(ics), 'every line ends in CRLF');
  assert.ok(ics.includes('DTSTAMP:20261014T083005Z'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101'));
  assert.ok(ics.includes('SUMMARY:Tax-saving deadline\\, FY 26-27\; 80C'));
  assert.ok(ics.includes('DESCRIPTION:Tax deadline: Last date for 80C.\\nCheck it.'));
  const uids = [...ics.matchAll(/UID:(.*)\r\n/g)].map(m => m[1]);
  assert.equal(new Set(uids).size, 3);                                              // two identical entries still get distinct UIDs
  assert.deepEqual(uids, f.toIcs(events, { now, includeAmounts: true }).match(/UID:(.*)\r\n/g)!.map(s => s.slice(4, -2)));   // stable between exports
  const hidden = f.toIcs(events, { now, includeAmounts: false });
  assert.ok(!hidden.includes('10K'));
  assert.ok(hidden.includes('DESCRIPTION:SIP debit\r\n'));
  assert.ok(hidden.includes('Last date for 80C'));                                  // an entry with no money in it keeps its text
});

test('.ics lines are folded at 75 octets without splitting a character', () => {
  const long = f.toIcs([{ date: '2026-11-01', title: 'दिवाली की खरीदारी और त्योहार का बजट '.repeat(6) + '🪔'.repeat(10), sub: '', type: 'custom' }], { now: new Date(0), includeAmounts: true });
  const enc = new TextEncoder();
  const physical = long.split('\r\n');
  physical.forEach(l => assert.ok(enc.encode(l).length <= 75, `${enc.encode(l).length}: ${l}`));
  assert.ok(physical.some(l => l.startsWith(' ')));
  const unfolded = long.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('🪔'.repeat(10)));
  assert.ok(!unfolded.includes('�'));
});

test('merging with the built-in events keeps each one and the export holds both', () => {
  const now = new Date(2026, 9, 14);
  const builtIn = collectEvents({ goals: [{ name: 'Car', target: 500000, target_date: '2026-12-01' }] }, now, 3);
  const custom = f.customToEvents([ev({ title: 'Own date', date: '2026-11-15' })], '2026-10-01', '2027-01-31');
  const ics = f.toIcs([...builtIn, ...custom], { now, includeAmounts: true });
  assert.ok(ics.includes('SUMMARY:Car'));
  assert.ok(ics.includes('SUMMARY:Own date'));
  assert.ok(ics.includes('SUMMARY:Advance Tax Q3'));
});

test('storage: add, edit, remove, concurrent adds do not lose one', async () => {
  await AsyncStorage.clear();
  assert.deepEqual(await loadCustomEvents(), []);
  const [a, b] = await Promise.all([
    addCustomEvent({ title: 'One', date: '2026-11-01', amount: null, repeat: 'none', note: '' }),
    addCustomEvent({ title: 'Two', date: '2026-11-02', amount: 100, repeat: 'monthly', note: '' }),
  ]);
  assert.ok(a.ok && b.ok);
  assert.equal((await loadCustomEvents()).length, 2);
  assert.equal(await updateCustomEvent(a.id!, { title: 'One!', date: '2026-11-03', amount: null, repeat: 'yearly', note: 'x' }), true);
  assert.equal((await loadCustomEvents()).find(e => e.id === a.id)!.title, 'One!');
  assert.equal(await updateCustomEvent('missing', { title: 'n', date: '2026-11-03', amount: null, repeat: 'none', note: '' }), false);
  assert.equal(await removeCustomEvent(b.id!), true);
  assert.equal(await removeCustomEvent(b.id!), false);
  assert.equal((await loadCustomEvents()).length, 1);
  await AsyncStorage.setItem(CUSTOM_EVENTS_KEY, '{not json');
  assert.deepEqual(await loadCustomEvents(), []);
});
