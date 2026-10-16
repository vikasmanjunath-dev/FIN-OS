// The phone's financial calendar must list the same events as the website's js/finos-calendar.js for the same data and the same day.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as app from '../lib/calendar.ts';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../js');
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');

function loadWeb(frozen: number, data: Record<string, unknown>) {
  const win: any = {};
  const store: Record<string, string> = {};
  Object.entries(data).forEach(([k, v]) => { store[k] = JSON.stringify(v); });
  const ls = { getItem: (k: string) => (k in store ? store[k] : null), setItem: (k: string, v: unknown) => { store[k] = String(v); } };
  class FakeDate extends Date {
    constructor(...a: any[]) { if (a.length === 0) super(frozen); else super(...(a as [any])); }
    static now() { return frozen; }
  }
  win.localStorage = ls;
  const sandbox: any = { window: win, globalThis: win, Math, JSON, Number, parseFloat, parseInt, String, Array, Object, console, Date: FakeDate, localStorage: ls, document: { getElementById: () => null } };
  vm.createContext(sandbox);
  vm.runInContext(read('finos-taxdates.js'), sandbox);
  vm.runInContext(read('finos-subscriptions.js'), sandbox);
  vm.runInContext(read('finos-calendar.js'), sandbox);
  return win.FinosCalendar;
}

function rng(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const R = rng(20261012);
const pick = <T,>(a: T[]) => a[Math.floor(R() * a.length)];
const day = (offsetDays: number, base: number) => new Date(base + offsetDays * 86400000).toISOString().slice(0, 10);

const NOW = new Date(2026, 9, 12, 10, 30).getTime();      // 12 Oct 2026, local time

function randomData(base: number) {
  const sip = Array.from({ length: Math.floor(R() * 4) }, (_, i) => ({
    fundName: pick(['Axis Bluechip', 'Parag Parikh Flexi Cap Fund Direct Growth', 'SBI Small Cap']), monthlyAmount: Math.round(500 + R() * 50000),
    startDate: day(-Math.floor(R() * 900), base), debitDay: R() < 0.5 ? undefined : 1 + Math.floor(R() * 31),
  }));
  const insurance = Array.from({ length: Math.floor(R() * 3) }, () => ({
    name: R() < 0.7 ? pick(['Star Health', 'LIC Term', 'HDFC Ergo']) : undefined, type: 'health', premium: R() < 0.8 ? Math.round(R() * 90000) : 0,
    renewal_date: R() < 0.1 ? '' : day(-5 + Math.floor(R() * 400), base) + (R() < 0.3 ? 'T00:00:00.000Z' : ''),
  }));
  const goals = Array.from({ length: Math.floor(R() * 3) }, () => ({
    name: pick(['Car', 'House', 'Trip']), target: Math.round(R() * 5e6), [R() < 0.5 ? 'deadline' : 'target_date']: day(Math.floor(R() * 1200), base),
  }));
  const subs = Array.from({ length: Math.floor(R() * 4) }, (_, i) => ({
    id: 's' + i, name: pick(['Netflix', 'Spotify', 'iCloud', 'Gym']), amount: Math.round(50 + R() * 1500), cycle: pick(['monthly', 'yearly', 'quarterly', 'weekly']),
    startDate: day(-Math.floor(R() * 600), base), status: pick(['active', 'trial', 'paused', 'cancelled', 'active']), split: pick([1, 1, 2]),
    category: 'ott', pay: 'upi',
  }));
  return { sip, insurance, goals, subs };
}

test('SIP, insurance, goal, subscription and tax events match the website on 150 random households', () => {
  for (let n = 0; n < 150; n++) {
    const d = randomData(NOW);
    const web = loadWeb(NOW, { finos_sip_portfolio: d.sip, finos_insurance_policies: d.insurance, finos_goals: d.goals, finos_subscriptions: d.subs });
    const theirs = JSON.parse(JSON.stringify(web.collectEvents(12)));
    const mine = app.collectEvents({ sip: d.sip, insurance: d.insurance, goals: d.goals, subscriptions: d.subs }, new Date(NOW), 12);
    const strip = (e: any) => ({ date: e.date, title: e.title, sub: e.sub, type: e.type, amount: e.amount ?? 0 });
    // the website's sort is stable on date only; compare as multisets keyed by every field
    const key = (e: any) => JSON.stringify(strip(e));
    assert.deepEqual(mine.map(key).sort(), theirs.map(key).sort(), 'household ' + n + ' ' + JSON.stringify(d).slice(0, 300));
    assert.deepEqual(mine.map(e => e.date), theirs.map((e: any) => e.date), 'order by date ' + n);
  }
});

test('FD, RD, PPF and NSC maturity dates agree with the website where it knows the term', () => {
  const entries = [
    { id: 'a', type: 'fd', bank: 'HDFC', principal: 200000, rate: 7, startDate: '2025-11-15', termMonths: 18 },
    { id: 'b', type: 'rd', bank: 'SBI', monthlyAmount: 5000, rate: 6.8, startDate: '2026-03-01', termMonths: 24 },
    { id: 'c', type: 'ppf', annualAmount: 150000, rate: 7.1, startDate: '2012-04-10' },
    { id: 'd', type: 'nsc', principal: 100000, rate: 7.7, startDate: '2024-09-01' },
  ];
  const web = loadWeb(NOW, { finos_fd_portfolio: entries });
  const theirs = JSON.parse(JSON.stringify(web.collectEvents(12))).filter((e: any) => e.type === 'fd' || e.type === 'ppf');
  const mine = app.collectEvents({ fd: entries as any }, new Date(NOW), 12).filter(e => e.type === 'fd' || e.type === 'ppf');
  assert.deepEqual(mine.map(e => [e.date, e.title, e.type]), theirs.map((e: any) => [e.date, e.title, e.type]));
});

test('a Sukanya account and a post-office deposit use their real term, not the website\'s 12-month guess', () => {
  const entries = [
    { id: 'e', type: 'sukanya', annualAmount: 100000, rate: 8.2, startDate: '2020-01-15' },
    { id: 'f', type: 'post_td', principal: 50000, rate: 7.0, startDate: '2026-01-10', termMonths: 36 },
  ];
  const ev = app.collectEvents({ fd: entries as any }, new Date(NOW), 12);
  const suk = ev.find(e => e.title.startsWith('Sukanya'));
  assert.ok(suk, 'sukanya matures in the list');
  assert.equal(suk!.date.slice(0, 4), '2041');                 // opened 2020, matures 21 years later
  const td = ev.find(e => e.title.toLowerCase().includes('post'));
  assert.ok(td, 'post-office deposit is listed');
  assert.equal(td!.date, '2029-01-10');                        // 36 months from 10 Jan 2026
});

test('tax dates equal the website\'s FinosTaxDates for several ranges', () => {
  const win: any = {};
  const sandbox: any = { window: win, globalThis: win, Date, Math, String, JSON };
  vm.createContext(sandbox);
  vm.runInContext(read('finos-taxdates.js'), sandbox);
  for (const [a, b] of [['2026-10-01', '2027-12-31'], ['2025-01-01', '2025-12-31'], ['2024-04-01', '2030-03-31'], ['2026-03-31', '2026-04-01']]) {
    assert.deepEqual(JSON.parse(JSON.stringify(win.FinosTaxDates.events(a, b))), app.taxDates(a, b), `${a}..${b}`);
  }
});

test('upcoming groups by distance and marks urgency', () => {
  const now = new Date(2026, 9, 12, 9, 0);
  const ev = [
    { date: '2026-10-12', title: 'a', sub: '', type: 'sip' }, { date: '2026-10-13', title: 'b', sub: '', type: 'sip' }, { date: '2026-10-17', title: 'c', sub: '', type: 'sip' },
    { date: '2026-10-24', title: 'd', sub: '', type: 'sip' }, { date: '2026-11-08', title: 'e', sub: '', type: 'sip' }, { date: '2026-11-30', title: 'f', sub: '', type: 'sip' },
    { date: '2026-10-11', title: 'past', sub: '', type: 'sip' },
  ] as app.CalEvent[];
  const u = app.upcoming(ev, now, 60);
  assert.deepEqual(u.map(x => x.bucket), ['Today', 'Tomorrow', 'This week', 'Next week', 'This month', 'Later']);
  assert.deepEqual(u.map(x => x.urgency), ['urgent', 'urgent', 'urgent', 'soon', '', '']);
});

test('monthCells is Monday-first and covers whole weeks', () => {
  const cells = app.monthCells(2026, 9);                       // Oct 2026 starts on a Thursday
  assert.equal(cells.length % 7, 0);
  assert.deepEqual(cells.slice(0, 4), [null, null, null, { day: 1, date: '2026-10-01' }]);
  assert.equal(cells.filter(Boolean).length, 31);
});

test('monthSummary totals this month\'s SIPs and insurance and finds the next tax date', () => {
  const now = new Date(2026, 9, 12);
  const ev = app.collectEvents({ sip: [{ fundName: 'X', monthlyAmount: 5000, startDate: '2026-01-01' }], insurance: [{ name: 'Y', premium: 12000, renewal_date: '2026-10-28' }] }, now, 3);
  const s = app.monthSummary(ev, now, { home: 40000, car: 10000 });
  assert.equal(s.emiTotal, 50000);
  assert.equal(s.insuranceDue, 12000);
  assert.equal(s.nextTax?.date, '2026-12-15');
  assert.equal(s.sipTotal, 0);                                  // the 1st of October has passed and is filtered out of the list
});

// ── The person's own dates (lib/financialCalendar.ts, screen plan/mydates) ride along as type 'custom'. The website has no such
// ── event, so nothing here is compared with it; the tests above prove that leaving `custom` out changes no website-parity output.
const own = (o: Partial<{ id: string; title: string; date: string; amount: number | null; repeat: 'none' | 'monthly' | 'yearly'; note: string }>) =>
  ({ id: 'c1', title: 'School fee', date: '2026-11-15', amount: null, repeat: 'none' as const, note: '', ...o });

test('custom dates: with none given the output is exactly what it was, and nothing of type custom appears', () => {
  const now = new Date(2026, 9, 12);
  const base = { goals: [{ name: 'Car', target: 500000, target_date: '2026-12-01' }] };
  assert.deepEqual(app.collectEvents({ ...base, custom: [] }, now, 3), app.collectEvents(base, now, 3));
  assert.ok(app.collectEvents(base, now, 3).every(e => e.type !== 'custom'));
});

test('custom dates: a one-off, a monthly and a yearly date land on the grid on the right days, with their own type and meta', () => {
  const now = new Date(2026, 9, 12);
  const ev = app.collectEvents({ custom: [
    own({ id: 'a', title: 'Cheque', date: '2026-11-15', amount: 25000 }),
    own({ id: 'b', title: 'Society dues', date: '2026-09-31'.replace('31', '30'), repeat: 'monthly' }),
    own({ id: 'c', title: 'Club fee', date: '2025-12-20', repeat: 'yearly', note: 'renew' }),
  ] }, now, 3).filter(e => e.type === 'custom');
  const by = app.byDate(ev);
  assert.deepEqual((by['2026-11-15'] || []).map(e => e.title), ['Cheque']);
  assert.equal(by['2026-11-15'][0].sub, '₹25,000');
  assert.equal(by['2026-11-15'][0].amount, 25000);
  assert.deepEqual(['2026-10-30', '2026-11-30', '2026-12-30'].filter(d => by[d]?.some(e => e.title === 'Society dues')), ['2026-10-30', '2026-11-30', '2026-12-30']);
  assert.deepEqual((by['2026-12-20'] || []).map(e => e.title), ['Club fee']);
  assert.match(by['2026-12-20'][0].sub, /repeats every year · renew/);
  assert.equal(app.EVENT_META.custom.label, 'Your date');
  assert.ok(app.EVENT_META.custom.icon && /^#[0-9A-Fa-f]{6}$/.test(app.EVENT_META.custom.color));
});

test('custom dates: a past one-off is dropped like any past event, a repeat never starts before its first date, and junk is tolerated', () => {
  const now = new Date(2026, 9, 12);
  const ev = app.collectEvents({ custom: [
    own({ id: 'p', title: 'Old', date: '2026-08-01' }),
    own({ id: 'm', title: 'Starts later', date: '2027-01-10', repeat: 'monthly' }),
    null as any, { title: 'no date' } as any, own({ id: 'x', title: 'Bad', date: '2026-02-30' }),
  ] }, now, 12).filter(e => e.type === 'custom');
  assert.deepEqual(ev.map(e => e.title).filter(t => t === 'Old' || t === 'Bad'), []);
  assert.ok(ev.filter(e => e.title === 'Starts later').every(e => e.date >= '2027-01-10'));
  assert.equal(ev.filter(e => e.title === 'Starts later')[0]?.date, '2027-01-10');
});

test('custom dates appear in upcoming() and in the nudge-style count, with the same urgency rule as the rest', () => {
  const now = new Date(2026, 9, 12);
  const ev = app.collectEvents({ custom: [own({ title: 'Car service', date: '2026-10-15' })] }, now, 2);
  const up = app.upcoming(ev, now, 45).find(e => e.type === 'custom');
  assert.equal(up?.diff, 3);
  assert.equal(up?.urgency, 'urgent');
  assert.equal(up?.bucket, 'This week');
});
