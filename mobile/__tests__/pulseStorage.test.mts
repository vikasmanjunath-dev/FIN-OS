// The PULSE snapshot (same key as the website) and the offline / local-only reply.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SNAPSHOT_KEY, normaliseSnapshot, shouldSave, loadSnapshot, saveSnapshot, SNAPSHOT_MIN_GAP_MS } from '../lib/pulseStorage.ts';
import { localOnlyReply } from '../lib/aryaTools.ts';
import { runDeviceTool, HELP_EXAMPLES } from '../lib/aryaToolbox.ts';
import { matchIntent } from '../lib/aryaIntent.ts';
import { OFFLINE_ACTIONS } from '../lib/aryaOffline.ts';
import { makeFacts } from '../lib/aryaFacts.ts';
import { SCREENS } from '../lib/search.ts';

beforeEach(async () => { await AsyncStorage.clear(); });

const snap = (at: number) => ({ at, netWorth: 1, debt: 0, sip: 0, savingsRate: null, emergencyMonths: null, policies: 0, goals: 0, moneyScore: null });

test('the snapshot key is the website\'s, and a bad value is "no snapshot"', async () => {
  assert.equal(SNAPSHOT_KEY, 'finos_pulse_snapshot');
  assert.equal(await loadSnapshot(), null);
  await AsyncStorage.setItem(SNAPSHOT_KEY, 'junk');
  assert.equal(await loadSnapshot(), null);
  assert.equal(normaliseSnapshot({ at: 'x' }), null);
  assert.equal(normaliseSnapshot(null), null);
  await saveSnapshot(snap(5));
  assert.deepEqual(await loadSnapshot(), snap(5));
  // the website's field set, repaired on read
  assert.deepEqual(normaliseSnapshot({ at: 7, netWorth: 'x', savingsRate: 12 }), { ...snap(7), netWorth: 0, savingsRate: 12 });
});

test('saved only when there is none or the last is six hours old, as on the website', () => {
  assert.equal(shouldSave(null, snap(100)), true);
  assert.equal(shouldSave(snap(0), snap(SNAPSHOT_MIN_GAP_MS - 1)), false);
  assert.equal(shouldSave(snap(0), snap(SNAPSHOT_MIN_GAP_MS)), true);
});

test('offline: a question the phone can answer is answered; otherwise plain language and a list of what still works', () => {
  const f = makeFacts({ data: { income: 100000, expense: 60000 } });
  const local = runDeviceTool('savings_rate', {}, { facts: f });
  const t1 = localOnlyReply(local, null);
  assert.match(t1, /your own records answer this/);
  assert.match(t1, /saving 40%/);
  assert.match(t1, /From: Income and spending/);

  const t2 = localOnlyReply(null, null, false);
  assert.ok(!/7475|arya-ai|\bserver\b|\bport\b|backend|localhost/i.test(t2), t2);
  OFFLINE_ACTIONS.forEach(a => assert.ok(t2.includes(a.label)));
  HELP_EXAMPLES.slice(0, 6).forEach(e => assert.ok(t2.includes(e), e));
  assert.ok(t2.indexOf('Questions I can answer') < t2.indexOf('Try again'), 'the reply ends with "try again", after the list');
  assert.match(localOnlyReply(null, null, true), /Developer note/);

  const off = localOnlyReply(null, 'Arya is set to stay on this phone, so I did not send this question anywhere.');
  assert.match(off, /^Arya is set to stay on this phone/);
  assert.ok(!/Developer note/.test(off));
});

test('every route the local tools point at is a real screen', () => {
  const known = new Set(SCREENS.map(s => s.route));
  const f = makeFacts({ now: new Date(2026, 9, 14), data: { income: 100000, expense: 60000, emergencyFund: 1000, goals: [{ id: 'g', name: 'x', target: 10, current: 1 }] } });
  const routes = new Set<string>();
  for (const q of HELP_EXAMPLES) { const m = matchIntent(q); if (m.kind === 'tool') { const r = runDeviceTool(m.tool, m.args, { facts: f }); if (r.route) routes.add(r.route); } }
  ['/tracker/networth', '/tracker/budget', '/tracker/emergency', '/tracker/goals', '/tools/calendar', '/tools/score', '/tracker/insurance', '/tools/debt', '/tools/taxplanner', '/tracker/transactions'].forEach(r => routes.add(r));
  for (const r of routes) {
    // calculator pages are dynamic: /tools/calc/<id>
    if (/^\/tools\/calc\//.test(r)) continue;
    assert.ok(known.has(r), `${r} is not in the search index`);
  }
  assert.equal(matchIntent('help').kind, 'tool');
});
