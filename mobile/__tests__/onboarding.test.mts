import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as o from '../lib/onboarding.ts';
import { decideLaunch, loadOnboarding, saveProfileAnswers, reopenOnboarding } from '../lib/onboardingStorage.ts';
import { enableRemindersFlow, copyIsComplete, NOTIFICATIONS_COPY, BIOMETRIC_COPY } from '../lib/permissions.ts';

const NOW = new Date(2026, 9, 14);
beforeEach(async () => { await AsyncStorage.clear(); });

test('state machine: first launch opens it, a skip or finish ends it for good', () => {
  let s = o.NEW_STATE;
  assert.equal(o.shouldAutoOpen(s), true);
  s = o.autoOpened(s, NOW);
  assert.equal(s.status, 'in_progress'); assert.equal(s.autoShown, 1);
  assert.equal(o.shouldAutoOpen(s), true);                                  // left unfinished: resumes once
  s = o.next(o.next(s));
  assert.equal(s.step, 'dna'); assert.equal(o.resumeStep(s), 'dna');
  assert.equal(o.shouldAutoOpen(o.skipAll(s, NOW)), false);
  assert.equal(o.shouldAutoOpen(o.finish(s, NOW)), false);
  const second = o.autoOpened(s, NOW);
  assert.equal(o.shouldAutoOpen(second), false);                            // opened twice: never again unprompted
});

test('steps are bounded and back never goes before the welcome', () => {
  let s = o.NEW_STATE;
  assert.equal(o.back(s).step, 'welcome');
  for (let i = 0; i < 20; i++) s = o.next(s);
  assert.equal(s.step, 'done');
  assert.equal(o.resumeStep(s), 'welcome');
});

test('re-opening from Settings starts again, and that run never auto-opens later', () => {
  const done = o.finish(o.NEW_STATE, NOW);
  const r = o.reopen(done, NOW);
  assert.equal(r.status, 'in_progress'); assert.equal(r.step, 'welcome'); assert.equal(r.manual, true);
  assert.equal(o.shouldAutoOpen(r), false);
});

test('a phone that already has the person\'s data does not get the welcome unprompted; a pristine one does', () => {
  assert.equal(o.isEstablished(['finos_streak', 'finos_theme_mobile', 'finos_lang', 'finos_host_ip']), false);
  assert.equal(o.isEstablished(['finos_streak', 'finos_goals']), true);
  assert.equal(o.isEstablished(['finos_user_name']), true);
  assert.equal(o.isEstablished(['something_else']), false);
});

test('normalise: garbage and unknown versions fall back to a new state; fields are validated', () => {
  assert.deepEqual(o.normalise('x'), o.NEW_STATE);
  assert.deepEqual(o.normalise({ v: 2, status: 'done' }), o.NEW_STATE);
  const n = o.normalise({ v: 1, status: 'in_progress', step: 'bogus', autoShown: -4, did: ['profile', 'profile', 'zzz'], day: 'today' });
  assert.equal(n.step, 'welcome'); assert.equal(n.autoShown, 0); assert.deepEqual(n.did, ['profile']); assert.equal(n.day, null);
});

test('launch decision: opens on a pristine phone, once resumed once, then home; storage failure never traps', async () => {
  assert.equal(await decideLaunch(NOW), 'onboarding');
  assert.equal((await loadOnboarding()).autoShown, 1);
  assert.equal(await decideLaunch(NOW), 'onboarding');
  assert.equal(await decideLaunch(NOW), 'home');
  await AsyncStorage.clear();
  await AsyncStorage.setItem('finos_transactions', '[]');
  assert.equal(await decideLaunch(NOW), 'home');
  assert.equal((await loadOnboarding()).via, 'existing-data');
  const orig = AsyncStorage.getItem;
  (AsyncStorage as any).getItem = async () => { throw new Error('locked'); };
  assert.equal(await decideLaunch(NOW), 'home');
  (AsyncStorage as any).getItem = orig;
});

test('skipping answers writes nothing; filled valid answers are written; empty ones never delete what is there', async () => {
  await AsyncStorage.multiSet([['finos_user_name', 'Asha'], ['finos_age', '34']]);
  const r = await saveProfileAnswers({ name: '', age: '', income: '90000', dependents: '' });
  assert.equal(r.saved, 1);
  assert.equal(await AsyncStorage.getItem('finos_user_name'), 'Asha');      // blank name did not erase it
  assert.equal(await AsyncStorage.getItem('finos_age'), '34');
  assert.equal(await AsyncStorage.getItem('finos_monthly_income'), '90000');
  assert.equal(await AsyncStorage.getItem('finos_dependents'), null);        // not defaulted to 0
  const bad = await saveProfileAnswers({ name: '', age: '7', income: '', dependents: '' });
  assert.equal(bad.saved, 0); assert.ok(bad.errors.age);
  assert.equal(await AsyncStorage.getItem('finos_age'), '34');
  const none = await saveProfileAnswers({ name: '', age: '', income: '', dependents: '' });
  assert.equal(none.saved, 0);
});

test('a re-opened flow persists as manual', async () => {
  await decideLaunch(NOW);
  const s = await reopenOnboarding(NOW);
  assert.equal(s.manual, true);
  assert.equal((await loadOnboarding()).manual, true);
  assert.equal(await decideLaunch(NOW), 'home');
});

test('the summary lists only what the person did', () => {
  const s = o.NEW_STATE;
  assert.deepEqual(o.summaryLines(s, { profileFields: 0, lockOn: false, remindersOn: false, dnaDone: false }), []);
  assert.deepEqual(o.summaryLines({ ...s, did: ['look'] }, { profileFields: 2, lockOn: true, remindersOn: false, dnaDone: false }),
    ['Profile: 2 of 4 details saved', 'App lock is on', 'Language and appearance chosen']);
});

test('permission copy explains before asking and says what "no" does; the OS prompt follows a confirmed tap only', async () => {
  assert.ok(copyIsComplete(NOTIFICATIONS_COPY)); assert.ok(copyIsComplete(BIOMETRIC_COPY));
  assert.match(NOTIFICATIONS_COPY.whatHappens, /nothing is sent/i);
  assert.match(BIOMETRIC_COPY.whatHappens, /never sees your fingerprint/i);
  const calls: string[] = [];
  const deps = (confirmed: boolean, cur: any, req: any) => ({ confirmed, current: async () => { calls.push('current'); return cur; }, request: async () => { calls.push('request'); return req; }, enable: async () => { calls.push('enable'); } });
  assert.equal(await enableRemindersFlow(deps(false, 'undetermined', 'granted')), 'cancelled');
  assert.deepEqual(calls, []);                                               // not confirmed: no prompt, no write
  assert.equal(await enableRemindersFlow(deps(true, 'undetermined', 'denied')), 'denied');
  assert.deepEqual(calls, ['current', 'request']);                            // denied: preference NOT written
  calls.length = 0;
  assert.equal(await enableRemindersFlow(deps(true, 'granted', 'granted')), 'enabled');
  assert.deepEqual(calls, ['current', 'enable']);                             // already allowed: no second prompt
  calls.length = 0;
  assert.equal(await enableRemindersFlow(deps(true, 'undetermined', 'unsupported')), 'unsupported');
  assert.ok(!calls.includes('enable'));
});
