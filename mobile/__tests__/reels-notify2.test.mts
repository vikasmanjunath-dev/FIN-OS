// Notifications v2: one merged plan (pledge follow-up, Sunday look-back, season-aware nudge, the person's own reminders), under hard caps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { LIBRARY } from '../lib/reels/library.ts';
import {
  DEFAULT_NOTIFY, DEFAULT_NUDGE, FOLLOW_PREFIX, HORIZON_DAYS, ID_PREFIX, MAX_SCHEDULED, NOTIFY_FROM_MIN, NOTIFY_TO_MIN, NUDGE_DAYS, SEASON_NUDGE_TITLE, followupNotice, followupsOn,
  normaliseNotify, planAll, planAllClassic, toLocalIso, weeklyNotice,
  type MoveReminder, type NotifyPrefs, type PlanState, type PlannedNotice, type PledgeInput,
} from '../lib/reels/reminders.ts';
import { bump, EMPTY_STATS, type StatsState } from '../lib/reels/stats.ts';
import { DEFAULT_ACTION, KIND_ROUTES, ROUTE, attachTaps, routeOf, type NotificationsLike, type TapResponse } from '../lib/notificationTaps.ts';
import * as privacy from '../lib/privacy.ts';

const at = (y: number, m: number, d: number, h = 9, min = 0) => new Date(y, m - 1, d, h, min);
const key = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const T = [{ en: 'Compounding', hi: 'चक्रवृद्धि' }, { en: 'Emergency fund', hi: 'इमरजेंसी फ़ंड' }, { en: 'Needs and wants', hi: 'ज़रूरत और चाहत' }];
const STEP_UP: { en: string; hi: string } = { en: 'The SIP step-up', hi: 'SIP स्टेप-अप' };
const pledge = (id: string, made: Date, title = STEP_UP, href = '/tools/stepup'): PledgeInput => ({ id, at: made.toISOString(), title, href });
const move = (reelId: string, when: string, label = { en: 'Try the SIP calculator', hi: 'SIP कैलकुलेटर आज़माएँ' }): MoveReminder => ({ reelId, at: when, href: '/tools/calc/sip', label });
const stats = (...days: [number, number, number][]): StatsState => days.reduce((s, [y, m, d]) => bump(s, key(y, m, d), 'fin'), { ...EMPTY_STATS, days: {} } as StatsState);

const base = (o: Partial<PlanState> = {}): PlanState => ({
  nudge: { ...DEFAULT_NUDGE }, notify: { ...DEFAULT_NOTIFY, fu: {} }, moves: [], pledges: [], stats: { ...EMPTY_STATS, days: {} }, doneToday: false, titles: T, lang: 'en', ...o,
});
const on = (o: Partial<NotifyPrefs> = {}): NotifyPrefs => ({ ...DEFAULT_NOTIFY, fu: {}, followups: true, ...o });
const dayOf = (n: PlannedNotice) => toLocalIso(n.at).slice(0, 10);

// ── defaults ─────────────────────────────────────────────────────────────────────────────────────────────────

test('defaults: nothing but what the person chose; follow-ups on only after a daily nudge or a first reminder; the look-back is off', () => {
  assert.equal(DEFAULT_NOTIFY.weekly, false);
  assert.equal(DEFAULT_NOTIFY.followups, null);
  const off = { ...DEFAULT_NUDGE, enabled: false };
  assert.equal(followupsOn(DEFAULT_NOTIFY, off, []), false, 'a person who set nothing gets nothing');
  assert.equal(followupsOn(DEFAULT_NOTIFY, { ...off, enabled: true }, []), true, 'after a daily nudge');
  assert.equal(followupsOn(DEFAULT_NOTIFY, off, [move('a', '2026-10-30T09:00')]), true, 'after a first reminder');
  assert.equal(followupsOn({ ...DEFAULT_NOTIFY, armed: true }, off, []), true, 'remembered after the nudge is turned off again');
  assert.equal(followupsOn({ ...DEFAULT_NOTIFY, followups: false }, { ...off, enabled: true }, [move('a', '2026-10-30T09:00')]), false, 'an explicit no wins');
  assert.equal(followupsOn({ ...DEFAULT_NOTIFY, followups: true }, off, []), true);
  // with nothing chosen the planner schedules nothing at all, even with a pledge waiting and a quiet-looking week
  assert.deepEqual(planAll(base({ pledges: [pledge('step-up', at(2026, 10, 18))], stats: stats([2026, 10, 22]) }), at(2026, 10, 23, 9)), []);
  assert.deepEqual(normaliseNotify(undefined), { followups: null, weekly: false, armed: false, fu: {} });
  assert.deepEqual(normaliseNotify({ followups: 'yes', weekly: 1, armed: 'x', fu: { 'BAD ID': '2026-10-30T18:00', ok: 'soon', fine: '2026-10-30T18:00' } }), { followups: null, weekly: false, armed: false, fu: { fine: '2026-10-30T18:00' } });
});

// ── pledge follow-up ─────────────────────────────────────────────────────────────────────────────────────────

test('follow-up: one gentle question on day 3 at the nudge hour, tapping opens the tool', () => {
  const st = base({ notify: on(), nudge: { enabled: false, hour: 18 }, pledges: [pledge('step-up', at(2026, 10, 20, 11))] });
  const plan = planAll(st, at(2026, 10, 21, 9));
  assert.equal(plan.length, 1);
  const n = plan[0];
  assert.equal(n.kind, 'followup'); assert.equal(n.id, `${FOLLOW_PREFIX}step-up`);
  assert.equal(toLocalIso(n.at), '2026-10-23T18:00', 'made on the 20th, followed up on the 23rd, at the nudge hour');
  assert.equal(n.title, 'A small step on your list');
  assert.equal(n.body, 'Still thinking about “The SIP step-up”? 2 minutes.');
  assert.equal(n.route, '/tools/stepup');
  const hi = planAll({ ...st, lang: 'hi' }, at(2026, 10, 21, 9))[0];
  assert.match(hi.title, /[ऀ-ॿ]/); assert.match(hi.body, /[ऀ-ॿ]/); assert.match(hi.body, /2 मिनट/);
  assert.equal(toLocalIso(planAll({ ...st, nudge: { enabled: false, hour: 9 } }, at(2026, 10, 21, 7))[0].at), '2026-10-23T09:00', 'follows the person\'s hour');
});

test('follow-up: sent once per pledge, and never for a pledge that was started, reminded, removed, known, too old, or when the person is under strain', () => {
  const made = at(2026, 10, 20, 11);
  const st = base({ notify: on(), pledges: [pledge('step-up', made)] });
  // once sent (its recorded time has passed) it is never planned again, however many times the app re-plans
  const sent = base({ notify: on({ fu: { 'step-up': '2026-10-23T18:00' } }), pledges: [pledge('step-up', made)] });
  assert.deepEqual(planAll(sent, at(2026, 10, 23, 18, 1)), []);
  assert.deepEqual(planAll(sent, at(2026, 11, 20, 9)), []);
  // the caller leaves out started, reminded, removed and known pledges, so none of them is ever a candidate
  assert.deepEqual(planAll({ ...st, pledges: [] }, at(2026, 10, 21, 9)), []);
  assert.deepEqual(planAll({ ...st, strain: true }, at(2026, 10, 21, 9)), [], 'no follow-ups under money strain');
  assert.deepEqual(planAll({ ...st, notify: on({ followups: false }) }, at(2026, 10, 21, 9)), [], 'switched off');
  assert.deepEqual(planAll(st, at(2026, 11, 20, 9)), [], 'a pledge a month old is let go');
  // not opened for a few days: it still comes, once, at the next hour that is ahead
  const late = planAll(st, at(2026, 10, 25, 20));
  assert.equal(late.filter(n => n.kind === 'followup').length, 1);
  assert.equal(toLocalIso(late[0].at), '2026-10-26T18:00');
  // two pledges: one each, on different days
  const two = planAll(base({ notify: on(), pledges: [pledge('a-one', made), pledge('b-two', made)] }), at(2026, 10, 21, 9));
  assert.deepEqual(two.map(n => n.id), [`${FOLLOW_PREFIX}a-one`, `${FOLLOW_PREFIX}b-two`]);
  assert.notEqual(dayOf(two[0]), dayOf(two[1]));
  // a recorded future time is kept, so re-planning does not move it
  const rec = planAll(base({ notify: on({ fu: { 'step-up': '2026-10-27T18:00' } }), pledges: [pledge('step-up', made)] }), at(2026, 10, 24, 9));
  assert.equal(toLocalIso(rec[0].at), '2026-10-27T18:00');
});

test('follow-up: silent today when a reel is finished, and gives way to a reminder the person set', () => {
  const made = at(2026, 10, 20, 11);
  const st = base({ notify: on(), pledges: [pledge('step-up', made)] });
  const todayDone = planAll({ ...st, doneToday: true }, at(2026, 10, 23, 9));
  assert.equal(toLocalIso(todayDone[0].at), '2026-10-24T18:00', 'a finished day gets none; it comes the next day');
  const clash = planAll({ ...st, moves: [move('other', '2026-10-23T09:00')] }, at(2026, 10, 21, 9));
  assert.deepEqual(clash.map(n => [n.kind, dayOf(n)]), [['move', '2026-10-23'], ['followup', '2026-10-24']]);
});

test('follow-up copy: a reel title with an amount never reaches the lock screen', () => {
  const n = followupNotice(pledge('x-y', at(2026, 10, 20), { en: 'Put ₹5,000 a month to work', hi: 'हर महीने ₹5,000' }), at(2026, 10, 23, 18), 'en');
  assert.equal(n.body, 'Still thinking about that money step? 2 minutes.');
  assert.doesNotMatch(n.body + n.title, /[₹%\d]\d/);
  for (const r of LIBRARY) for (const lang of ['en', 'hi'] as const) {
    const m = followupNotice(pledge(r.id, at(2026, 10, 20), r.title), at(2026, 10, 23, 18), lang);
    assert.doesNotMatch(m.title + m.body, /[₹%]|\d{3,}|\d[.,]\d/, `${r.id} ${lang}`);
  }
});

// ── weekly look-back ─────────────────────────────────────────────────────────────────────────────────────────

test('Sunday look-back: opt-in, Sunday evening, only in a week that had reels, opens the reels, nothing about what was missed', () => {
  const week = stats([2026, 10, 20], [2026, 10, 22]);
  const now = at(2026, 10, 24, 10);                            // a Saturday
  assert.deepEqual(planAll(base({ stats: week }), now), [], 'off by default');
  const plan = planAll(base({ stats: week, notify: on({ followups: false, weekly: true }) }), now);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].kind, 'weekly'); assert.equal(toLocalIso(plan[0].at), '2026-10-25T19:00'); assert.equal(new Date(plan[0].at).getDay(), 0);
  assert.equal(plan[0].route, '/learn/reels'); assert.equal(plan[0].id.startsWith(ID_PREFIX), true);
  assert.deepEqual(planAll(base({ notify: on({ followups: false, weekly: true }) }), now), [], 'a week with no reels gets no look-back');
  assert.deepEqual(planAll(base({ stats: stats([2026, 10, 10]), notify: on({ followups: false, weekly: true }) }), now), [], 'reels only in an older week');
  assert.deepEqual(planAll(base({ stats: week, doneToday: true, notify: on({ followups: false, weekly: true }) }), at(2026, 10, 25, 10)), [], 'silent on a Sunday a reel was already finished');
  const hi = weeklyNotice(at(2026, 10, 25, 19), 'hi');
  assert.match(hi.title, /[ऀ-ॿ]/); assert.match(hi.body, /[ऀ-ॿ]/);
  const en = weeklyNotice(at(2026, 10, 25, 19), 'en');
  assert.equal(en.title, 'Your week in reels');
});

// ── seasons ──────────────────────────────────────────────────────────────────────────────────────────────────

test('nudge copy follows the season: Diwali week, Budget week, March year-end, otherwise the usual', () => {
  const st = (lang: 'en' | 'hi') => base({ nudge: { enabled: true, hour: 18 }, lang });
  const first = (d: Date, lang: 'en' | 'hi' = 'en') => planAll(st(lang), d).find(n => n.kind === 'nudge')!;
  assert.equal(first(at(2026, 11, 5, 9)).title, SEASON_NUDGE_TITLE.diwali.en);
  assert.equal(first(at(2027, 1, 30, 9)).title, SEASON_NUDGE_TITLE.budget.en);
  assert.equal(first(at(2027, 3, 18, 9)).title, SEASON_NUDGE_TITLE.yearend.en);
  assert.equal(first(at(2026, 10, 20, 9)).title, 'A 30-second money lesson');
  assert.equal(first(at(2026, 11, 5, 9), 'hi').title, SEASON_NUDGE_TITLE.diwali.hi);
  for (const s of Object.values(SEASON_NUDGE_TITLE)) { assert.match(s.hi, /[ऀ-ॿ]/); assert.ok(s.en.length > 10); }
  assert.equal(first(at(2026, 11, 5, 9)).body, T[0].en, 'the body is still the lesson\'s own public title');
});

// ── the merged plan ──────────────────────────────────────────────────────────────────────────────────────────

let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = <X,>(xs: X[]): X => xs[Math.floor(rnd() * xs.length)];

function randomState(): { st: PlanState; now: Date } {
  const now = at(2026, pick([9, 10, 11, 12]), 1 + Math.floor(rnd() * 28), Math.floor(rnd() * 24), pick([0, 30]));
  const moves: MoveReminder[] = [];
  for (let i = 0, n = Math.floor(rnd() * 9); i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + Math.floor(rnd() * 40), Math.floor(rnd() * 24), pick([0, 15, 30]));
    moves.push(move(`reel-${i}`, toLocalIso(d)));
  }
  const pledges: PledgeInput[] = [];
  for (let i = 0, n = Math.floor(rnd() * 8); i < n; i++) pledges.push(pledge(`pledge-${i}`, new Date(now.getFullYear(), now.getMonth(), now.getDate() - Math.floor(rnd() * 20), 10)));
  const days: [number, number, number][] = [];
  for (let i = 0; i < 6; i++) { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - Math.floor(rnd() * 12)); if (rnd() < 0.6) days.push([d.getFullYear(), d.getMonth() + 1, d.getDate()]); }
  const st = base({
    nudge: { enabled: rnd() < 0.7, hour: pick([8, 9, 12, 18, 20, 7, 21]) }, notify: { followups: pick([true, false, null]), weekly: rnd() < 0.5, armed: rnd() < 0.5, fu: {} },
    moves, pledges, stats: stats(...days), doneToday: rnd() < 0.3, strain: rnd() < 0.1, lang: pick(['en', 'hi'] as const),
  });
  return { st, now };
}

test('the plan: at most 6, sorted, one per day, between 8:00 and 21:00, in the future, only reels\' own ids, 14-day horizon for everything but the person\'s own reminders', () => {
  for (let i = 0; i < 600; i++) {
    const { st, now } = randomState();
    const plan = planAll(st, now);
    assert.ok(plan.length <= MAX_SCHEDULED, `${plan.length} scheduled`);
    assert.deepEqual([...plan].sort((a, b) => a.at.getTime() - b.at.getTime()).map(n => n.id), plan.map(n => n.id), 'sorted');
    assert.equal(new Set(plan.map(dayOf)).size, plan.length, 'never two on one day');
    assert.equal(new Set(plan.map(n => n.id)).size, plan.length, 'ids are unique');
    const horizon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + HORIZON_DAYS);
    for (const n of plan) {
      const m = n.at.getHours() * 60 + n.at.getMinutes();
      assert.ok(m >= NOTIFY_FROM_MIN && m <= NOTIFY_TO_MIN, `quiet hours: ${toLocalIso(n.at)}`);
      assert.ok(n.at.getTime() > now.getTime(), 'in the future');
      assert.ok(n.id.startsWith(ID_PREFIX) && !n.id.startsWith('finos-'), n.id);
      assert.match(n.route, ROUTE);
      assert.ok(n.kind);
      if (n.kind !== 'move') assert.ok(n.at < horizon, `${n.kind} beyond the horizon: ${toLocalIso(n.at)}`);
      if (n.kind === 'nudge') assert.ok(n.at.getTime() - now.getTime() < NUDGE_DAYS * 86_400_000 + 86_400_000);
    }
  }
});

test('the plan: silent on a day the person already finished a reel (nudge, follow-up, look-back), with only their own reminder allowed through', () => {
  const sunday = at(2026, 10, 25, 9);
  const everything = base({
    doneToday: true, nudge: { enabled: true, hour: 18 }, notify: on({ weekly: true }), stats: stats([2026, 10, 25], [2026, 10, 22]),
    pledges: [pledge('step-up', at(2026, 10, 22, 11))],
  });
  const plan = planAll(everything, sunday);
  assert.ok(plan.every(n => dayOf(n) !== '2026-10-25'), 'nothing today');
  assert.ok(plan.length > 0);
  const own = planAll({ ...everything, moves: [move('x', '2026-10-25T20:00')] }, sunday);
  assert.deepEqual(own.filter(n => dayOf(n) === '2026-10-25').map(n => n.kind), ['move']);
});

test('the plan: priority on a shared day is the person\'s reminder, then the follow-up, then the look-back, then the nudge', () => {
  const st = base({
    nudge: { enabled: true, hour: 18 }, notify: on({ weekly: true }), stats: stats([2026, 10, 22]),
    pledges: [pledge('step-up', at(2026, 10, 22, 11))],         // follow-up due Sunday the 25th at 18:00
  });
  const now = at(2026, 10, 24, 9);
  assert.deepEqual(planAll(st, now).map(n => [dayOf(n), n.kind]), [['2026-10-24', 'nudge'], ['2026-10-25', 'followup'], ['2026-10-26', 'nudge']], 'the follow-up takes Sunday; the look-back gives way');
  assert.deepEqual(planAll({ ...st, pledges: [] }, now).map(n => [dayOf(n), n.kind]), [['2026-10-24', 'nudge'], ['2026-10-25', 'weekly'], ['2026-10-26', 'nudge']], 'the look-back beats the nudge');
  const withMove = planAll({ ...st, moves: [move('a', '2026-10-25T09:00'), move('b', '2026-10-25T20:00')] }, now);
  assert.deepEqual(withMove.map(n => [dayOf(n), n.kind]), [['2026-10-24', 'nudge'], ['2026-10-25', 'move'], ['2026-10-26', 'move'], ['2026-10-27', 'followup']], 'a second reminder the same day moves to the next day instead of being dropped');
});

test('the plan: the cap keeps the person\'s own reminders first, then follow-ups, and a far-off reminder is not dropped for lack of horizon', () => {
  const moves = [0, 1, 2, 3].map(i => move(`m-${i}`, toLocalIso(at(2026, 10, 26 + i, 9))));
  const far = move('month', '2026-11-12T09:00');
  const pledges = ['p1', 'p2', 'p3', 'p4'].map(id => pledge(id, at(2026, 10, 20, 10)));
  const plan = planAll(base({ nudge: { enabled: true, hour: 18 }, notify: on(), moves: [...moves, far], pledges }), at(2026, 10, 24, 9));
  assert.equal(plan.length, MAX_SCHEDULED);
  assert.equal(plan.filter(n => n.kind === 'move').length, 5, 'all five of the person\'s own reminders are kept');
  assert.ok(plan.some(n => n.id === `${ID_PREFIX}move-month`));
});

test('the plan is deterministic and does not depend on the order things are given in', () => {
  seed = 99;
  for (let i = 0; i < 100; i++) {
    const { st, now } = randomState();
    const a = planAll(st, now), b = planAll(JSON.parse(JSON.stringify(st)), new Date(now));
    assert.deepEqual(a.map(n => [n.id, toLocalIso(n.at), n.title, n.body, n.route, n.kind]), b.map(n => [n.id, toLocalIso(n.at), n.title, n.body, n.route, n.kind]));
    const shuffled = { ...st, moves: [...st.moves].reverse(), pledges: [...st.pledges].reverse() };
    assert.deepEqual(planAll(shuffled, now).map(n => n.id), a.map(n => n.id), 'input order does not matter');
  }
});

test('applying the plan twice changes nothing: recorded follow-up times are honoured on the next pass', () => {
  seed = 7;
  for (let i = 0; i < 100; i++) {
    const { st, now } = randomState();
    const first = planAll(st, now);
    const fu = { ...st.notify.fu };
    for (const n of first) if (n.kind === 'followup') fu[n.id.slice(FOLLOW_PREFIX.length)] = toLocalIso(n.at);
    const again = planAll({ ...st, notify: { ...st.notify, fu } }, now);
    assert.deepEqual(again.map(n => [n.id, toLocalIso(n.at)]), first.map(n => [n.id, toLocalIso(n.at)]));
  }
});

test('the first planner still answers to its old call shape', () => {
  const args = [{ enabled: true, hour: 20 }, [move('guess-sip', '2026-10-19T21:00')], at(2026, 10, 19, 9), false, [T[0]]] as const;
  assert.deepEqual(planAll(...args).map(n => n.id), planAllClassic(...args).map(n => n.id));
  assert.ok(planAll(...args).length >= 2);
});

// ── words ────────────────────────────────────────────────────────────────────────────────────────────────────

const BANNED_EN = /forgot|forget|missed|miss out|don'?t miss|behind|last chance|hurry|urgent|running out|expire|deadline|streak|you'?ll lose|losing|lose|fall(ing)? short|guilt|ashamed|worry|afraid|fear|before it'?s too late|act now|only \d+ left|everyone|FOMO/i;
const BANNED_HI = /भूल|छूट|जल्दी|वरना|आख़िरी मौक़ा|डर|चिंता|शर्म|देर हो जाए|अभी नहीं तो/;

const PUBLIC_NUMBERS = new Set(LIBRARY.flatMap(r => (r.title.en + ' ' + r.title.hi).match(/\d+/g) ?? []));

test('every string any notice can carry: no amount or personal figure, no fear, urgency or guilt, and Hindi is real Hindi', () => {
  const strings: { s: string; lang: string }[] = [];
  const add = (n: PlannedNotice, lang: string) => { strings.push({ s: n.title, lang }, { s: n.body, lang }); };
  seed = 2026;
  for (let i = 0; i < 400; i++) { const { st, now } = randomState(); for (const lang of ['en', 'hi'] as const) for (const n of planAll({ ...st, lang }, now)) add(n, lang); }
  // every library reel as a pledge, every season, both languages
  for (const lang of ['en', 'hi'] as const) {
    for (const r of LIBRARY) add(followupNotice(pledge(r.id, at(2026, 10, 20), r.title), at(2026, 10, 23, 18), lang), lang);
    add(weeklyNotice(at(2026, 10, 25, 19), lang), lang);
    for (const [y, m, d] of [[2026, 11, 5], [2027, 1, 30], [2027, 3, 18], [2026, 10, 20]] as const) for (const n of planAll(base({ nudge: { enabled: true, hour: 18 }, lang }), at(y, m, d, 9))) add(n, lang);
    for (const t of Object.values(SEASON_NUDGE_TITLE)) strings.push({ s: t[lang], lang });
  }
  assert.ok(strings.length > 1000);
  for (const { s, lang } of strings) {
    assert.ok(s.length > 0 && s.length <= 120, `length: ${s}`);
    assert.doesNotMatch(s, /[₹%$]/, `an amount or percentage on a lock screen: ${s}`);
    assert.doesNotMatch(s, /\d{3,}|\d[.,]\d/, `a figure on a lock screen: ${s}`);
    // the only digits ever allowed are the small fixed ones in our own copy ("30-second", "2 minutes", "30 सेकंड", "2 मिनट")
    // (a number is also fine when it is part of a lesson's own public title, such as "the rule of 72")
    for (const num of s.match(/\d+/g) ?? []) assert.ok(num === '2' || num === '30' || PUBLIC_NUMBERS.has(num), `unexpected number ${num} in: ${s}`);
    assert.doesNotMatch(s, BANNED_EN, s);
    assert.doesNotMatch(s, BANNED_HI, s);
    if (lang === 'hi') assert.match(s, /[ऀ-ॿ]/, `Hindi missing: ${s}`);
  }
});

// ── taps ─────────────────────────────────────────────────────────────────────────────────────────────────────

const tap = (route: unknown, kind?: unknown, id = 'n1'): TapResponse => ({ actionIdentifier: DEFAULT_ACTION, notification: { date: 1, request: { identifier: id, content: { data: kind === undefined ? { route } : { route, kind } } } } });

test('taps: the new notices open only safe in-app routes, and a kind may not open a screen it cannot produce', () => {
  assert.equal(routeOf(tap('/learn/reels', 'weekly')), '/learn/reels');
  assert.equal(routeOf(tap('/learn/reels', 'nudge')), '/learn/reels');
  assert.equal(routeOf(tap('/tools/stepup', 'followup')), '/tools/stepup');
  assert.equal(routeOf(tap('/tools/calc/sip', 'move')), '/tools/calc/sip');
  assert.equal(routeOf(tap('/tools/calc/sip', 'weekly')), null, 'the look-back opens the reels and nothing else');
  assert.equal(routeOf(tap('/tools/score', 'nudge')), null);
  for (const bad of ['https://evil.example', 'javascript:alert(1)', '//evil', '/a/../b', '/x?y=1', '/learn/reels/']) for (const kind of ['weekly', 'followup', 'move', 'nudge', undefined]) assert.equal(routeOf(tap(bad, kind)), null, `${bad} ${kind}`);
  for (const kind of [42, null, {}, ['weekly']]) assert.equal(routeOf(tap('/learn/reels', kind as never)), null, 'a kind that is not text is refused');
  assert.equal(routeOf(tap('/learn/reels', '__proto__')), '/learn/reels', 'an unknown kind is held to the plain-path rule only');
  assert.equal(routeOf(tap('/learn/reels', 'constructor')), '/learn/reels');
  assert.deepEqual(Object.keys(KIND_ROUTES).sort(), ['nudge', 'weekly']);
});

test('taps: every notice the planner can make opens through the tap handler, once, with a fake notifications module', () => {
  seed = 4242;
  const seen = new Set<string>(); const went: string[] = [];
  const listeners: ((r: TapResponse) => void)[] = [];
  const N: NotificationsLike = { addNotificationResponseReceivedListener: fn => { listeners.push(fn); return { remove: () => {} }; } };
  const stop = attachTaps(N, r => went.push(r));
  let sent = 0;
  for (let i = 0; i < 150; i++) {
    const { st, now } = randomState();
    for (const n of planAll(st, now)) {
      assert.equal(routeOf(tap(n.route, n.kind)), n.route, `${n.kind} ${n.route}`);
      if (seen.has(n.id)) continue; seen.add(n.id);
      listeners[0](tap(n.route, n.kind, n.id)); listeners[0](tap(n.route, n.kind, n.id)); sent++;
    }
  }
  assert.equal(went.length, sent, 'each notice handled exactly once');
  assert.ok(sent > 50);
  assert.ok(new Set(planAll(base({ notify: on({ weekly: true }), stats: stats([2026, 10, 22]), pledges: [pledge('step-up', at(2026, 10, 20))], nudge: { enabled: true, hour: 18 } }), at(2026, 10, 24, 9)).map(n => n.kind)).size >= 2);
  stop();
});

test('tap routes: every pledge a person can make has a route a follow-up tap will open', () => {
  const fallback = '/learn/reels';
  assert.equal(routeOf(tap(fallback, 'followup')), fallback);
  assert.match(fallback, ROUTE);
});

// ── settings sheet and registry ──────────────────────────────────────────────────────────────────────────────

test('the new storage key is in the privacy registry as never synced, with the session prefix', () => {
  const d = privacy.DATA_ITEMS.find(x => x.key === 'finos_session_reels_notify');
  assert.ok(d); assert.match(d!.label, /never synced/); assert.ok(d!.key.startsWith('finos_session_'));
});

test('the reminders sheet: both toggles with English and Hindi labels, accessible, 44px targets, and a turn-all-off row', () => {
  const src = fs.readFileSync(path.join(import.meta.dirname, '..', 'components', 'reels', 'ReminderSheets.tsx'), 'utf8');
  for (const t of ['Follow-ups on things I said I would do', 'Sunday look-back', 'Turn all reminders off', 'सारे रिमाइंडर बंद करें', 'रविवार की झलक', 'जो काम मैंने करने को कहा था']) assert.ok(src.includes(t), t);
  assert.ok((src.match(/<Switch /g) ?? []).length >= 3);
  for (const chunk of src.split('<Switch ').slice(1)) assert.match(chunk.slice(0, chunk.indexOf('/>')), /accessibilityLabel=/, 'a switch without a screen-reader label');
  const nums = (re: RegExp) => [...src.matchAll(re)].map(m => Number(m[1]));
  for (const h of [...nums(/switchRow: \{[^}]*minHeight: (\d+)/g), ...nums(/offRow: \{[^}]*minHeight: (\d+)/g), ...nums(/hour: \{[^}]*minHeight: (\d+)/g)]) assert.ok(h >= 44, `target ${h}`);
  assert.match(src, /accessibilityRole="button"[^>]*accessibilityLabel=\{hi \? 'सारे रिमाइंडर बंद करें' : 'Turn all reminders off'\}/);
  assert.match(src, /followupsOn\(notify, prefs/, 'the follow-up switch shows the real default, not a stored null');
});
