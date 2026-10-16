// The phone's feedback core must make the same decisions as the website's (js/finos-feedback.js): what is kept, what is
// dropped, when a report may be sent. Differences are deliberate and listed: comments use the stricter redact(), pages are
// screen names, and the report carries platform/appVersion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as fb from '../lib/feedback.ts';
import { redact, redactBase } from '../lib/redact.ts';
import { usageAdd, usageTotals, normaliseUsage, cleanScreen, dayOf, USAGE_DAYS } from '../lib/usage.ts';
import { PURPOSES, hasConsent, withConsent, withdrawAll, parseConsents, CONSENT_VERSION } from '../lib/consents.ts';

const web = createRequire(import.meta.url)('../../js/finos-feedback.js');
const NOW = new Date('2026-10-14T10:00:00');

test('constants match the website', () => {
  assert.deepEqual([...fb.TOPICS], web.TOPICS);
  assert.equal(fb.MAX_LOG, web.MAX_LOG);
  assert.equal(fb.MAX_COMMENT, web.MAX_COMMENT);
  assert.equal(USAGE_DAYS, web.USAGE_DAYS);
  assert.equal(fb.LOG_KEY, 'finos_feedback_log');
  assert.equal(web.CONFIG.endpoint, null);
  assert.equal(fb.CONFIG.endpoint, null);
});

test('sanitizeEvent: same keep/drop decision, day, topic and rating as the website; comment goes through redact', () => {
  const inputs: any[] = [
    null, 'x', {}, { rating: 'up' }, { rating: 'meh' }, { comment: '   ' }, { comment: 'call 9876543210 pay a@okaxis' }, { rating: 'down', comment: 'Rs 5 lakh', topic: 'tax' },
    { rating: 'up', topic: 'nonsense' }, { comment: 42 }, { rating: 'up', comment: 'x'.repeat(900), topic: 'arya' },
  ];
  for (const raw of inputs) {
    const w = web.sanitizeEvent(raw, NOW), m = fb.sanitizeEvent(raw, NOW);
    assert.equal(m === null, w === null, JSON.stringify(raw));
    if (!w || !m) continue;
    assert.equal(m.day, w.day); assert.equal(m.topic, w.topic); assert.equal(m.rating, w.rating);
    assert.equal(m.comment, redact(raw.comment));
    assert.equal(w.comment, redactBase(raw.comment));
  }
});

test('report building: only requested sections, re-sanitised, capped at 50', () => {
  const stored = Array.from({ length: 70 }, (_, i) => ({ day: '2026-10-01', page: 'tools/score', topic: 'tax', rating: 'up', comment: `n${i} mail me a.b@c.com` }));
  const r = fb.buildReport({ feedback: stored, usage: { days: { '2026-10-01': { 'tools/score': 3, 'bad page?x=1': 9 } } }, now: NOW, include: { feedback: true, usage: false } });
  assert.equal(r.feedback.length, 50);
  assert.equal(r.usage, null);
  assert.ok(r.feedback.every(e => !/@/.test(e.comment)));
  const r2 = fb.buildReport({ feedback: stored, usage: { days: { '2026-10-01': { 'tools/score': 3, 'bad page?x=1': 9 } } }, now: NOW, include: { feedback: false, usage: true } });
  assert.deepEqual(r2.feedback, []);
  assert.deepEqual(r2.usage, { v: 1, days: { '2026-10-01': { 'tools/score': 3 } } });
  assert.equal(r2.kind, 'feedback-report'); assert.equal(r2.app, 'FIN-OS'); assert.equal(r2.v, 1);
});

test('send: every decision equals the website (no consent, nothing to send, no endpoint, no network, rejected, network error, ok)', async () => {
  const fbk = [{ day: '2026-10-01', page: 'x', topic: 'tax', rating: 'up', comment: 'ok' }];
  const usage = { v: 1, days: { '2026-10-01': { 'tools/score': 1 } } };
  const consent = (...on: string[]) => (id: string) => on.includes(id);
  const okFetch = async () => ({ ok: true }), badFetch = async () => ({ ok: false }), boom = async () => { throw new Error('x'); };
  const cases: any[] = [
    { consent: consent(), fetch: okFetch, endpoint: 'https://e.example/in' },
    { consent: consent('feedback'), fetch: okFetch, endpoint: null },
    { consent: consent('feedback'), fetch: okFetch, endpoint: 'http://insecure.example' },
    { consent: consent('feedback'), fetch: null, endpoint: 'https://e.example/in' },
    { consent: consent('feedback'), fetch: badFetch, endpoint: 'https://e.example/in' },
    { consent: consent('feedback'), fetch: boom, endpoint: 'https://e.example/in' },
    { consent: consent('feedback'), fetch: okFetch, endpoint: 'https://e.example/in' },
    { consent: consent('usage'), fetch: okFetch, endpoint: 'https://e.example/in' },
    { consent: consent('feedback', 'usage'), fetch: okFetch, endpoint: 'https://e.example/in' },
  ];
  for (const c of cases) for (const rep of [{ feedback: fbk, usage }, { feedback: [], usage: null }, null]) {
    const w = await web.send(rep, c), m = await fb.send(rep as any, c);
    assert.deepEqual(m, w, JSON.stringify([Object.keys(c), rep && Object.keys(rep)]));
  }
});

test('send only transmits the sections the person consented to, and never calls fetch without an endpoint', async () => {
  let calls = 0; let body: any = null;
  const f = async (_u: string, init: any) => { calls++; body = JSON.parse(init.body); return { ok: true }; };
  const rep = { feedback: [{ day: '2026-10-01', page: 'tools/score', topic: 'tax', rating: 'up', comment: 'hi' }], usage: { v: 1, days: { '2026-10-01': { 'tools/score': 1 } } } };
  assert.deepEqual(await fb.send(rep, { consent: id => id === 'feedback', fetch: f, endpoint: null }), { ok: false, reason: 'no-endpoint' });
  assert.equal(calls, 0);
  assert.deepEqual(await fb.send(rep, { consent: id => id === 'feedback', fetch: f, endpoint: 'https://e.example/in' }), { ok: true });
  assert.equal(body.usage, null); assert.equal(body.feedback.length, 1);
  assert.equal(fb.configure({ endpoint: 'http://nope' }), null);
  assert.equal(fb.configure({ endpoint: 'https://ok.example' }), 'https://ok.example');
  fb.configure(null);
  assert.equal(fb.CONFIG.endpoint, null);
});

test('usage counting equals the website when given the website\'s page rule; 90 days kept; per-day totals', () => {
  let m: any = null, w: any = null;
  const r = (s: number) => { let x = s; return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296); };
  const R = r(7);
  const pages = ['html/money-score.html', 'html/tax.html', 'calculators/sip.html', 'login.html', 'weird?x=1', '../x.html'];
  for (let i = 0; i < 400; i++) {
    const d = new Date(2026, 0, 1 + Math.floor(i / 2));
    const p = pages[Math.floor(R() * pages.length)];
    m = usageAdd(m, p, d, web.cleanPath); w = web.Usage.add(w, p, d);
  }
  assert.deepEqual(m, w);
  assert.ok(Object.keys(m.days).length <= USAGE_DAYS);
  assert.deepEqual(usageTotals(m), web.Usage.totals(w));
});

test('cleanScreen: route names only, nothing that could carry typed data', () => {
  assert.equal(cleanScreen('/tools/score'), 'tools/score');
  assert.equal(cleanScreen('/(tabs)/dashboard'), 'dashboard');
  assert.equal(cleanScreen('/'), 'index');
  assert.equal(cleanScreen('/tools/calc/sip?amount=500000#x'), 'tools/calc/sip');
  for (const bad of ['/tools/calc/9876543210', '/a/../b', '/Tools/Score Page', 'https://x.y/z', '/tracker/' + 'a'.repeat(40), null, undefined, '/a/b/c/d/e/f']) assert.equal(cleanScreen(bad), 'unknown', String(bad));
});

test('normaliseUsage drops bad days, unknown screens and absurd counts', () => {
  const u = normaliseUsage({ days: { '2026-10-01': { 'tools/score': 5, 'x y': 2, 'tools/tax': -3 }, 'not-a-day': { a: 1 }, '2026-10-02': { 'tools/tax': 9e9 } } });
  assert.deepEqual(u, { v: 1, days: { '2026-10-01': { 'tools/score': 5 }, '2026-10-02': { 'tools/tax': 100000 } } });
  assert.equal(dayOf(new Date(2026, 9, 4)), '2026-10-04');
});

test('consents: default no, a yes needs the current wording version, withdrawal, unknown purposes', () => {
  assert.equal(hasConsent({}, 'usage'), false);
  let m = withConsent({}, 'usage', true, NOW);
  assert.equal(hasConsent(m, 'usage'), true);
  assert.equal(hasConsent(m, 'feedback'), false);
  assert.equal(hasConsent({ usage: { granted: true, at: '', v: CONSENT_VERSION + 1 } }, 'usage'), false);
  assert.equal(hasConsent({ relay: { granted: true, at: '', v: 1 } }, 'relay'), false);
  assert.deepEqual(withConsent(m, 'nope', true), m);
  m = withConsent(m, 'feedback', true, NOW);
  const off = withdrawAll(m, NOW);
  assert.ok(PURPOSES.every(p => !hasConsent(off, p.id)));
  assert.deepEqual(parseConsents('garbage'), {});
  assert.deepEqual(parseConsents('[1]'), {});
  // same on-disk shape as the website's finos_consents
  assert.deepEqual(Object.keys(m.usage).sort(), ['at', 'granted', 'v']);
});
