import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as d from '../lib/diagnostics.ts';
import { recordCrash, loadCrashes, clearCrashes, setCurrentScreen, currentDiagnosticReport } from '../lib/diagnosticsStorage.ts';
import { setConsentFor, countScreen, loadUsage, saveFeedback, loadFeedback, currentReport, sendLatest, loadConsents } from '../lib/feedbackStorage.ts';

const ENV = { appVersion: '1.0.0', os: 'android', osVersion: '34' };
const NOW = new Date(2026, 9, 14, 11, 0);

beforeEach(async () => { await AsyncStorage.clear(); await loadConsents(); setCurrentScreen('unknown'); });

test('an error becomes a redacted record: no numbers, handles, names in quotes, hosts or paths', () => {
  const err: any = new Error(`Failed for asha.rao@gmail.com paying ₹1,50,000 to 9876543210 ref ABCDE1234F, Unexpected token 'A', "Asha Rao" is not valid JSON, Cannot read property 'amount' of undefined`);
  err.name = 'TypeError';
  err.stack = [
    'TypeError: x', '    at parseRow (http://192.168.1.4:8081/node_modules/app/lib/statement.js?platform=android&dev=true:120:15)',
    '    at async Object.run (/data/user/0/com.finos.mobile/files/bundle.js:3:44)', 'render@index.android.bundle:1:234567', 'not a frame',
  ].join('\n');
  const r = d.makeRecord(err, { kind: 'js-error', screen: '/tools/score?income=95000', env: ENV, now: NOW });
  const flat = JSON.stringify(r);
  for (const leak of ['asha', 'gmail', '1,50,000', '9876543210', 'ABCDE1234F', 'Asha Rao', '192.168', 'node_modules', '/data/user', 'income=', '95000']) assert.ok(!flat.includes(leak), `${leak} in ${flat}`);
  assert.equal(r.name, 'TypeError');
  assert.match(r.message, /'amount'/);               // a code-like property name after "property" is kept: it is what makes the note useful
  assert.deepEqual(r.stack, ['parseRow (statement.js:120:15)', 'Object.run (bundle.js:3:44)', 'render (index.android.bundle:1:234567)']);
  assert.equal(r.screen, 'tools/score');
  assert.equal(r.day, '2026-10-14');
  assert.ok(r.message.length <= d.MAX_MESSAGE);
});

test('odd inputs: strings, null, objects without message, a hostile name', () => {
  for (const e of [null, undefined, 'boom 9876543210', { message: 5 }, { name: '<script>', message: 'x' }, 42]) {
    const r = d.makeRecord(e, { kind: 'unhandled-rejection', env: ENV, now: NOW });
    assert.match(r.name, /^[A-Za-z][A-Za-z0-9_]*$/);
    assert.ok(!/9876543210/.test(r.message));
    assert.equal(r.screen, 'unknown');
  }
});

test('ring buffer: capped at 20, a repeated crash raises the count instead of pushing others out', () => {
  let list: d.CrashRecord[] = [];
  for (let i = 0; i < 30; i++) list = d.addCrash(list, d.makeRecord(Object.assign(new Error(`failure kind ${i}`), { name: 'E' }), { kind: 'js-error', env: ENV, now: NOW }));
  assert.equal(list.length, d.MAX_CRASHES);
  assert.match(list[0].message, /kind 10/);
  const before = list.length;
  for (let i = 0; i < 100; i++) list = d.addCrash(list, d.makeRecord(new Error('loop crash'), { kind: 'render', env: ENV, now: NOW }));
  assert.equal(list.length, before);
  assert.equal(list[list.length - 1].count, 100);
  assert.equal(list.filter(r => r.message === 'loop crash').length, 1);
});

test('stored data is cleaned again on read (tampered or old values cannot leak)', () => {
  const raw = JSON.stringify([
    { day: '2026-10-01', kind: 'js-error', name: 'Error', message: 'pay 9876543210 to a@ybl', stack: ['/home/me/x.js:1:2', 'f (/Users/me/secret/file.js:3:4)'], screen: '/tools/9876543210', count: 'many', appVersion: '1.0 <b>', os: 'x'.repeat(40) },
    { nonsense: true }, null, { day: 'yesterday' },
  ]);
  const out = d.parseCrashes(raw);
  assert.equal(out.length, 1);
  const flat = JSON.stringify(out);
  assert.ok(!/9876543210|ybl|\/Users|\/home/.test(flat), flat);
  assert.equal(out[0].screen, 'unknown'); assert.equal(out[0].count, 1); assert.equal(out[0].appVersion, 'unknown');
  assert.deepEqual(d.parseCrashes('{{{'), []);
});

test('storage: records, caps, never throws on a failing store, never records while recording', async () => {
  setCurrentScreen('/tracker/budget');
  const fail = () => new Error('one');
  await recordCrash(fail(), { kind: 'render' });
  await recordCrash(fail(), { kind: 'render' });
  const l = await loadCrashes();
  assert.equal(l.length, 1); assert.equal(l[0].count, 2); assert.equal(l[0].screen, 'tracker/budget');
  await clearCrashes();
  assert.deepEqual(await loadCrashes(), []);
  const orig = AsyncStorage.setItem;
  (AsyncStorage as any).setItem = async () => { throw new Error('disk full'); };
  await assert.doesNotReject(recordCrash(new Error('x'), { kind: 'js-error' }));
  (AsyncStorage as any).setItem = orig;
});

test('the report holds crashes always, usage only when asked for AND the usage consent is on', async () => {
  await recordCrash(new Error('boom'), { kind: 'js-error' });
  await setConsentFor('usage', true);
  countScreen('/tools/score', NOW);
  await new Promise(r => setTimeout(r, 20));
  let rep = await currentDiagnosticReport({ includeUsage: true });
  assert.equal(rep.crashes.length, 1);
  assert.deepEqual(rep.usage?.days['2026-10-14'], { 'tools/score': 1 });
  rep = await currentDiagnosticReport({ includeUsage: false });
  assert.equal(rep.usage, null);
  await setConsentFor('usage', false);
  rep = await currentDiagnosticReport({ includeUsage: true });
  assert.equal(rep.usage, null);
  assert.match(d.formatReport(rep), /"kind": "diagnostic-report"/);
});

test('usage is counted only while consent is on (default off), and stops when withdrawn', async () => {
  countScreen('/tools/score', NOW);
  await new Promise(r => setTimeout(r, 20));
  assert.deepEqual((await loadUsage()).days, {});
  await setConsentFor('usage', true);
  countScreen('/tools/score', NOW); countScreen('/tools/score', NOW); countScreen('/tools/calc/sip?x=9999', NOW);
  await new Promise(r => setTimeout(r, 30));
  assert.deepEqual((await loadUsage()).days['2026-10-14'], { 'tools/score': 2, 'tools/calc/sip': 1 });
  await setConsentFor('usage', false);
  countScreen('/tools/score', NOW);
  await new Promise(r => setTimeout(r, 20));
  assert.equal((await loadUsage()).days['2026-10-14']['tools/score'], 2);
});

test('feedback storage: redacted before it is stored, shared report contains no identifiers, nothing sent without an endpoint', async () => {
  const saved = await saveFeedback({ rating: 'down', comment: 'my pan abcde1234f and upi me@okaxis, income 95000', topic: 'tax', page: '/tools/tax' });
  assert.ok(saved);
  const rawStored = await AsyncStorage.getItem('finos_feedback_log');
  assert.ok(!/abcde|okaxis|95000/i.test(rawStored!), rawStored!);
  assert.equal((await loadFeedback()).length, 1);
  assert.equal(await saveFeedback({ comment: '   ' }), null);
  const rep = await currentReport();
  assert.equal(rep.usage, null);
  assert.equal(rep.feedback[0].page, 'tools/tax');
  await setConsentFor('feedback', true);
  assert.deepEqual(await sendLatest(), { ok: false, reason: 'no-endpoint' });
});
