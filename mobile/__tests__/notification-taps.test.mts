// Tapping a reminder opens its screen: only plain in-app paths, only for a plain tap, each notice once, and the tap that launched the app too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_ACTION, ROUTE, attachTaps, routeOf, startNotificationTaps, type NotificationsLike, type TapResponse } from '../lib/notificationTaps.ts';
import { ACT_ALL } from '../lib/reels/library.ts';
import { message, plan, DEFAULT_PREFS } from '../lib/reminders.ts';
import { planAll } from '../lib/reels/reminders.ts';

const root = path.join(import.meta.dirname, '..');
const tap = (route: unknown, id = 'n1', action: unknown = DEFAULT_ACTION, date = 1): TapResponse => ({ actionIdentifier: action, notification: { date, request: { identifier: id, content: { data: { route } } } } });

test('routeOf: a plain tap on a notice with a safe in-app path opens that path', () => {
  assert.equal(routeOf(tap('/tools/calc/sip')), '/tools/calc/sip');
  assert.equal(routeOf(tap('/learn/reels')), '/learn/reels');
  assert.equal(routeOf(tap('/tools/calendar')), '/tools/calendar');
  assert.equal(routeOf({ notification: { request: { content: { data: { route: '/tools/score' } } } } }), '/tools/score', 'a response with no action name is a plain tap');
});

test('routeOf: nothing else in a notice is ever opened', () => {
  for (const bad of ['https://evil.example', 'http://x', 'javascript:alert(1)', '//evil.example/x', '/../secret', '/a/../b', '/a//b', '/a/', '/tools/calc/sip?x=1', '/tools calc', '/tools/<script>', '', '/', 'tools/calc/sip', '/a/b/c/d/e/f/g/h', '/' + 'a'.repeat(130), 42, null, undefined, { route: '/x' }, ['/x']]) {
    assert.equal(routeOf(tap(bad)), null, JSON.stringify(bad));
  }
  assert.equal(routeOf(tap('/tools/calc/sip', 'n', 'expo.modules.notifications.actions.DISMISSED')), null, 'dismissing is not opening');
  assert.equal(routeOf(tap('/tools/calc/sip', 'n', 'some-action-button')), null);
  for (const bad of [null, undefined, {}, { notification: {} }, { notification: { request: {} } }, { notification: { request: { content: { data: 'x' } } } }, 'text' as never]) assert.equal(routeOf(bad as never), null);
});

test('every route the app schedules is one a tap will open, and a real screen', () => {
  const routes = new Set<string>(Object.values(ACT_ALL).map(a => a.href));
  routes.add('/learn/reels'); routes.add('/tools/calendar');
  assert.ok(routes.size > 40);
  for (const r of routes) {
    assert.match(r, ROUTE, r);
    const calc = r.match(/^\/tools\/calc\/([a-z0-9]+)$/);
    if (calc) continue;                                         // calculators are one dynamic screen, checked by the reels tests
    const base = path.join(root, 'app', r.replace(/^\//, ''));
    assert.ok(fs.existsSync(base + '.tsx') || fs.existsSync(path.join(base, 'index.tsx')), `no screen for ${r}`);
  }
  const now = new Date(2026, 9, 19, 9);
  const calendar = plan([{ type: 'tax', date: '2026-10-25', title: 'Advance tax', sub: '' } as never], now, { ...DEFAULT_PREFS, enabled: true });
  assert.ok(calendar.length > 0 && message({ type: 'tax', title: 't', sub: '' }, 3, false).title);
  const reel = planAll({ enabled: true, hour: 18 }, [{ reelId: 'guess-sip', at: '2026-10-20T09:00', href: '/tools/calc/sip', label: { en: 'x', hi: 'य' } }], now, false, [{ en: 'T', hi: 'ट' }]);
  for (const n of reel) assert.match(n.route, ROUTE, n.id);
});

function fake(opts: { last?: TapResponse | null; asyncLast?: TapResponse | null; throwOnAdd?: boolean } = {}) {
  const listeners: ((r: TapResponse) => void)[] = [];
  const log = { removed: 0, cleared: 0 };
  const N: NotificationsLike = {
    addNotificationResponseReceivedListener: fn => { if (opts.throwOnAdd) throw new Error('native module missing'); listeners.push(fn); return { remove: () => { log.removed++; listeners.splice(listeners.indexOf(fn), 1); } }; },
    ...(opts.asyncLast !== undefined ? { getLastNotificationResponseAsync: async () => opts.asyncLast ?? null } : { getLastNotificationResponse: () => opts.last ?? null }),
    clearLastNotificationResponse: () => { log.cleared++; },
  };
  return { N, listeners, log };
}

test('attachTaps: a tap while the app is open navigates once, even if the OS reports it again', () => {
  const { N, listeners } = fake(); const went: string[] = [];
  attachTaps(N, r => went.push(r));
  listeners[0](tap('/tools/calc/sip', 'a')); listeners[0](tap('/tools/calc/sip', 'a')); listeners[0](tap('/learn/reels', 'b'));
  assert.deepEqual(went, ['/tools/calc/sip', '/learn/reels']);
  listeners[0](tap('/tools/calc/sip', 'a', DEFAULT_ACTION, 2));                 // the same identifier at a later delivery is a new notice
  assert.equal(went.length, 3);
  listeners[0](tap('https://evil.example', 'c')); listeners[0](tap('/tools/x', 'd', 'expo.modules.notifications.actions.DISMISSED'));
  assert.equal(went.length, 3, 'unsafe or dismissed notices open nothing');
});

test('attachTaps: the tap that launched the app is handled once and cleared', async () => {
  const sync = fake({ last: tap('/tools/calendar', 'launch') }); const a: string[] = [];
  attachTaps(sync.N, r => a.push(r));
  assert.deepEqual(a, ['/tools/calendar']); assert.equal(sync.log.cleared, 1);
  sync.listeners[0](tap('/tools/calendar', 'launch'));
  assert.equal(a.length, 1, 'the OS replaying the launch tap does not open it twice');
  const asy = fake({ asyncLast: tap('/learn/reels', 'launch2') }); const b: string[] = [];
  attachTaps(asy.N, r => b.push(r));
  await new Promise(r => setTimeout(r, 5));
  assert.deepEqual(b, ['/learn/reels']); assert.equal(asy.log.cleared, 1);
  const none = fake({ last: null }); const c: string[] = [];
  attachTaps(none.N, r => c.push(r)); assert.deepEqual(c, []);
  const unsafe = fake({ last: tap('javascript:alert(1)') }); const d: string[] = [];
  attachTaps(unsafe.N, r => d.push(r)); assert.deepEqual(d, []);
});

test('attachTaps: stopping removes the listener, and a broken module or a failing screen never crashes', () => {
  const { N, listeners, log } = fake();
  const stop = attachTaps(N, () => {});
  stop(); stop();
  assert.equal(listeners.length, 0); assert.ok(log.removed >= 1);
  assert.doesNotThrow(() => attachTaps(fake({ throwOnAdd: true }).N, () => {})());
  const boom = fake(); const ok: string[] = [];
  attachTaps(boom.N, r => { ok.push(r); throw new Error('navigator not ready'); });
  assert.doesNotThrow(() => boom.listeners[0](tap('/learn/reels', 'z')));
  assert.deepEqual(ok, ['/learn/reels']);
  const throwingLast: NotificationsLike = { addNotificationResponseReceivedListener: () => ({ remove() {} }), getLastNotificationResponse: () => { throw new Error('x'); } };
  assert.doesNotThrow(() => attachTaps(throwingLast, () => {}));
});

test('startNotificationTaps does nothing without the native module (tests, web preview)', () => {
  assert.doesNotThrow(() => startNotificationTaps(() => { throw new Error('should not be called'); })());
});
