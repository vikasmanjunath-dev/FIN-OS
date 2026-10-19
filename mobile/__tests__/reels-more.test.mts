// The remaining reels pieces: the forgiving streak, the blind-spot slot and format fit in the ranker, the Spot the scam and Choose your path
// beats, the Reels health counters and the seven-day challenges. Pure functions, checked with known answers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forgivingStreak } from '../lib/reels/streak.ts';
import { streakOf } from '../lib/reels/journey.ts';
import { LIBRARY } from '../lib/reels/library.ts';
import { metaOf } from '../lib/reels/meta.ts';
import { blindSpot, rankReelsV2 } from '../lib/reels/ranker.ts';
import { composeEpisode } from '../lib/reels/episode.ts';
import { deriveSignals } from '../lib/reels/signals.ts';
import { PLAY_REELS } from '../lib/reels/content-play.ts';
import { EMPTY_STATS, FIELDS, HYPOTHESES, KEEP_DAYS, bump, healthOf, parseStats } from '../lib/reels/stats.ts';
import * as privacy from '../lib/privacy.ts';
import fs from 'node:fs';
import nodePath from 'node:path';
import { CHALLENGES, EMPTY_CHALLENGES, STALE_DAYS, challengeById, completeToday, isFinished, parseChallenges, pruneStale, runOf, startChallenge, todayOf } from '../lib/reels/challenges.ts';
import { FOREVER_YEARS, evalModel, orderDeck, scoreOrder, scoreSort, scoreSpot, sliderBars, sliderLine, spotMessage, validateBeat, xText } from '../lib/reels/beats.ts';
import { CAST_IDS } from '../lib/reels/cast.ts';
import type { SliderModel } from '../lib/reels/types.ts';
import { monthsToDeplete, sipFutureValue as sipFV, sipNeeded, stepUpSipFutureValue, unpaidBalance } from '../lib/reels/figures.ts';
import { STD_NEW, STD_OLD, taxNew, taxOld } from '../lib/taxcore.ts';
import { lumpSumFuture, monthsLeft, prepaySaving } from '../lib/reels/figures-play.ts';
import { emi, money } from '../lib/reels/figures.ts';
import { validateReel } from '../lib/reels/validate.ts';
import type { Beat } from '../lib/reels/types.ts';
import { EMPTY_PROFILE, noteBlind, notePoke, parseReelsProfile, pokeFit, weekKey } from '../lib/reels/reelsProfile.ts';

const D = (n: number) => `2026-10-${String(n).padStart(2, '0')}`;
const days = (...ns: number[]) => ns.map(D);

// ── streak ───────────────────────────────────────────────────────────────────────────────────────────────────

test('streak: consecutive days count, today pending does not break yesterday\'s run', () => {
  assert.deepEqual(forgivingStreak(days(1, 2, 3, 4, 5), D(5)), { streak: 5, doneToday: true, best: 5, resting: false });
  const pending = forgivingStreak(days(1, 2, 3, 4, 5), D(6));
  assert.deepEqual([pending.streak, pending.doneToday, pending.resting], [5, false, false]);
  assert.deepEqual(forgivingStreak([], D(6)), { streak: 0, doneToday: false, best: 0, resting: false });
});

test('streak: one rest day in a week is bridged, not counted, and never breaks the run', () => {
  assert.equal(forgivingStreak(days(1, 2, 3, 5, 6), D(6)).streak, 5, 'day 4 was a rest day');
  const yesterdayOff = forgivingStreak(days(1, 2, 3, 4, 6), D(7));          // 5 was missed, today (7) not done yet
  assert.equal(yesterdayOff.streak, 5);
  const resting = forgivingStreak(days(1, 2, 3, 4), D(6));                  // 5 missed, 6 pending: still alive
  assert.deepEqual([resting.streak, resting.resting], [4, true]);
});

test('streak: a second rest day within a week, or two missed days together, ends the run', () => {
  assert.equal(forgivingStreak(days(1, 2, 4, 6, 7), D(7)).streak, 3, 'rests on 3 and 5 are too close: only 7, 6, 4 count');
  assert.equal(forgivingStreak(days(1, 2, 5, 6), D(6)).streak, 2, 'days 3 and 4 both missed');
  assert.equal(forgivingStreak(days(1, 2, 3, 4), D(7)).streak, 0, 'days 5 and 6 missed, today 7 not done');
  assert.equal(forgivingStreak(days(1, 2, 3, 4), D(8)).streak, 0);
});

test('streak: rest days a full week apart are each forgiven', () => {
  assert.equal(forgivingStreak(days(1, 2, 3, 5, 6, 7, 8, 9, 10, 12), D(12)).streak, 10, 'rests on 4 and 11, seven days apart');
  assert.equal(forgivingStreak(days(1, 2, 3, 5, 6, 7, 8, 9, 11, 12), D(12)).streak, 7, 'rests on 4 and 10 are only six apart: the run stops at the second');
});

test('streak: best is the longest run by the same rule, future dates and duplicates are ignored, and the strict version is unchanged', () => {
  const h = days(1, 2, 3, 4, 5, 6, 7, 20);
  const s = forgivingStreak(h, D(21));
  assert.equal(s.best, 7); assert.equal(s.streak, 1);
  assert.equal(forgivingStreak([D(1), D(1), D(2), D(25)], D(3)).streak, 2);
  assert.equal(streakOf(days(1, 2, 4, 5), D(5)).streak, 2, 'the strict streakOf still resets after one missed day');
});

// ── blind spot and format fit ────────────────────────────────────────────────────────────────────────────────

test('week key: ISO weeks, Monday to Sunday, across a year boundary', () => {
  assert.equal(weekKey(new Date(2026, 9, 19)), '2026-W43');       // Monday
  assert.equal(weekKey(new Date(2026, 9, 25)), '2026-W43');       // Sunday
  assert.equal(weekKey(new Date(2026, 9, 26)), '2026-W44');
  assert.equal(weekKey(new Date(2026, 0, 1)), '2026-W01');
  assert.equal(weekKey(new Date(2027, 0, 1)), '2026-W53');        // a Friday that still belongs to the last week of 2026
  assert.equal(weekKey(new Date(2024, 11, 30)), '2025-W01');
});

const NOW = new Date(2026, 9, 21, 9);
const weakInsurance = deriveSignals({ now: NOW, pillars: [{ id: 'insurance', score: 5 }, { id: 'savings', score: 70 }, { id: 'investing', score: 60 }], weakestId: 'insurance' });

test('blind spot: once a week, the best unseen reel on the weakest pillar, even from a topic the person asked for less of', () => {
  const profile = { ...EMPTY_PROFILE, less: { protect: 3 as const } };
  const ranked = rankReelsV2(LIBRARY, { watched: {}, signals: weakInsurance, profile, now: NOW });
  const b = blindSpot(ranked, weakInsurance, profile, NOW)!;
  assert.ok(b, 'a blind-spot reel is found'); assert.equal(b.why, 'blind');
  assert.ok((metaOf(b.reel.id).needs.insurance ?? 0) >= 0.6);
  assert.match(b.reason!.en, /weekly look at your weakest area: insurance cover/); assert.ok(/[ऀ-ॿ]/.test(b.reason!.hi));
  assert.equal(blindSpot(ranked, weakInsurance, noteBlind(profile, weekKey(NOW)), NOW), null, 'only once this week');
  assert.ok(blindSpot(ranked, weakInsurance, noteBlind(profile, weekKey(NOW)), new Date(2026, 9, 27, 9)), 'a new week offers it again');
  assert.equal(blindSpot(ranked, deriveSignals({ now: NOW }), profile, NOW), null, 'no Money Score, no blind spot');
  assert.equal(noteBlind(profile, 'whenever'), profile);
});

test('blind spot: it takes the last place in the episode, keeps the anchor and the playable pick, and never shows a reel hidden for strain', () => {
  const ranked = rankReelsV2(LIBRARY, { watched: {}, signals: weakInsurance, profile: EMPTY_PROFILE, now: NOW });
  const b = blindSpot(ranked, weakInsurance, EMPTY_PROFILE, NOW)!;
  const plain = composeEpisode(ranked, 3), withBlind = composeEpisode(ranked, 3, b);
  assert.equal(withBlind.picks.length, 3); assert.equal(withBlind.blind, true); assert.equal(plain.blind, false);
  assert.equal(withBlind.picks[0].reel.id, plain.picks[0].reel.id);
  assert.ok(withBlind.picks.some(p => p.reel.id === b.reel.id));
  assert.equal(new Set(withBlind.picks.map(p => p.reel.id)).size, 3);
  assert.ok(withBlind.picks.some(p => p.reel.poke) || plain.picks[0].reel.poke);
  assert.equal(composeEpisode(ranked, 2, b).blind, false, 'a two-reel episode has no room for it');
  const strained = deriveSignals({ now: NOW, pillars: [{ id: 'investing', score: 5 }], weakestId: 'investing', mine: { loan: { label: { en: 'loan', hi: 'लोन' }, balance: 1e6, rate: 9, emi: 70_000 } }, income: 100_000 });
  const r2 = rankReelsV2(LIBRARY, { watched: {}, signals: strained, profile: EMPTY_PROFILE, now: NOW });
  const b2 = blindSpot(r2, strained, EMPTY_PROFILE, NOW);
  if (b2) assert.ok(!metaOf(b2.reel.id).growth, 'a strained person\'s blind spot is never a growth reel');
});

test('profile: the blind week and the format counts survive parsing, and bad values are dropped', () => {
  const p = parseReelsProfile(JSON.stringify({ blindWeek: '2026-W43', fmt: { shown: 10, engaged: 4 } }));
  assert.equal(p.blindWeek, '2026-W43'); assert.deepEqual(p.fmt, { shown: 10, engaged: 4 });
  assert.equal(parseReelsProfile(JSON.stringify({ blindWeek: 'monday' })).blindWeek, undefined);
  assert.equal(parseReelsProfile(JSON.stringify({ fmt: { shown: 3, engaged: 9 } })).fmt, undefined);
  assert.equal(parseReelsProfile(JSON.stringify({ fmt: { shown: -1, engaged: 0 } })).fmt, undefined);
  assert.equal(parseReelsProfile(JSON.stringify({ fmt: { shown: 1e6, engaged: 0 } })).fmt, undefined);
  assert.deepEqual(parseReelsProfile(null), { v: 1, known: [], less: {} });
});

test('format fit: people who play with interactive reels see more of them, people who skip see fewer, and the counts keep adapting', () => {
  assert.equal(pokeFit(EMPTY_PROFILE), 1);
  let plays = EMPTY_PROFILE, skips = EMPTY_PROFILE;
  for (let i = 0; i < 12; i++) { plays = notePoke(plays, true); skips = notePoke(skips, false); }
  assert.ok(pokeFit(plays) > 1.1 && pokeFit(plays) <= 1.15, String(pokeFit(plays)));
  assert.ok(pokeFit(skips) < 0.92 && pokeFit(skips) >= 0.85, String(pokeFit(skips)));
  const sig = deriveSignals({ now: NOW });
  const posOf = (profile: typeof plays, id: string) => rankReelsV2(LIBRARY, { watched: {}, signals: sig, profile, now: NOW }).findIndex(r => r.reel.id === id);
  assert.ok(posOf(plays, 'guess-sip') < posOf(skips, 'guess-sip'), 'an interactive reel ranks higher for the player than for the skipper');
  let many = EMPTY_PROFILE; for (let i = 0; i < 500; i++) many = notePoke(many, i % 2 === 0);
  assert.ok(many.fmt!.shown <= 40 && many.fmt!.engaged <= many.fmt!.shown, 'counts stay bounded');
  for (let i = 0; i < 100; i++) many = notePoke(many, false);
  assert.ok(pokeFit(many) < 0.95, 'after a run of skips the fit follows');
});

// ── Spot the scam and Choose your path ───────────────────────────────────────────────────────────────────────

const play = (id: string) => PLAY_REELS.find(r => r.id === id)!;
const spot = (id: string) => play(id).poke!.beat as Extract<Beat, { kind: 'spot' }>;
const path = (id: string) => play(id).poke!.beat as Extract<Beat, { kind: 'path' }>;

test('spot the scam: scoring finds caught flags, missed flags and wrong taps', () => {
  const parts = [{}, { flag: 'a' }, { flag: 'b' }, { flag: 'c' }, {}];
  assert.deepEqual(scoreSpot(parts, [false, true, true, true, false]), { found: 3, flags: 3, missed: [], wrong: [] });
  assert.deepEqual(scoreSpot(parts, [true, true, false, false, true]), { found: 1, flags: 3, missed: [2, 3], wrong: [0, 4] });
  assert.deepEqual(scoreSpot(parts, []), { found: 0, flags: 3, missed: [1, 2, 3], wrong: [] });
  assert.deepEqual(scoreSpot(parts, [true, true, true, true, true]), { found: 3, flags: 3, missed: [], wrong: [0, 4] }, 'tapping everything is not a perfect score: the wrong taps show');
});

test('spot the scam reels: the message reads as a whole in both languages and the red flags are the ones the lesson teaches', () => {
  const k = spot('spot-kyc-sms');
  assert.match(spotMessage(k.parts, 'en'), /^Dear customer, your KYC needs an update\. Do it right now/);
  assert.ok(/[ऀ-ॿ]/.test(spotMessage(k.parts, 'hi')));
  const flags = k.parts.filter(p => p.flag).map(p => p.t.en);
  assert.deepEqual(flags.map(f => /right now|\.co\/|OTP/.test(f)), [true, true, true]);
  assert.equal(k.parts.filter(p => !p.flag).length, 2, 'two normal pieces, so tapping everything does not win');
  const g = spot('spot-invest-group');
  assert.equal(g.parts.filter(p => p.flag).length, 4);
  assert.ok(g.parts.some(p => /no risk/.test(p.t.en) && p.flag), 'a promise of no risk is flagged');
  assert.ok(!g.parts.some(p => /Welcome|Hi!/.test(p.t.en) && p.flag), 'greetings are not flagged');
  for (const b of [k, g]) { assert.match(b.todo.en, /1930/); assert.ok(b.todo.hi.includes('1930')); }
});

test('choose your path: every figure in the bonus story is worked out, and no path is called the best or the wrong one', () => {
  const b = path('choose-bonus');
  assert.equal(b.options.length, 4); assert.notEqual(b.clear, true);
  const e = emi(400_000, 9, 3), save = prepaySaving(400_000, 9, e, 200_000);
  assert.ok(save.monthsSaved > 12 && save.monthsSaved < 24, String(save.monthsSaved));
  assert.ok(b.options[0].result.en.includes(money(save.interestSaved).en), 'the prepay result quotes the computed saving');
  assert.ok(b.options[1].result.en.includes(money(lumpSumFuture(200_000, 12, 10)).en));
  assert.match(b.options[1].result.en, /assumed 12%/); assert.match(b.options[1].result.en, /fall short/);
  assert.match(b.options[2].result.en, /2 to about 5\.3 months|from 2 to about 5\.3/);
  assert.match(b.verdict.en, /no single winner/);
  assert.ok(validateBeat({ ...b, verdict: { en: 'The best choice is to prepay.', hi: 'सबसे अच्छा है लोन चुकाना।' } }).some(m => /best, worst/.test(m)), 'calling a path the best is refused unless the beat is marked clear');
  assert.deepEqual(validateBeat({ ...b, clear: true, verdict: { en: 'Keeping a safety net is the best first step for nearly everyone.', hi: 'सुरक्षा-निधि बनाना लगभग सबके लिए सबसे अच्छा पहला क़दम है।' } }), []);
});

test('figures for the playable reels: months left, a lump sum, and the saving from prepaying (known answers)', () => {
  near(monthsLeft(1_000_000, 9, emi(1_000_000, 9, 20)), 240);
  near(lumpSumFuture(200_000, 12, 10), 621_170);
  assert.equal(lumpSumFuture(100, 0, 5), 100);
  const e = emi(400_000, 9, 3);                                      // 12,719 a month
  const full = prepaySaving(400_000, 9, e, 400_000);
  near(full.interestSaved, e * 36 - 400_000); near(full.monthsSaved, 36);
  assert.deepEqual(prepaySaving(400_000, 9, e, 0), { monthsSaved: 0, interestSaved: 0 });
  assert.deepEqual(prepaySaving(400_000, 9, 100, 50_000), { monthsSaved: 0, interestSaved: 0 }, 'an EMI that never clears the loan saves nothing');
  const half = prepaySaving(400_000, 9, e, 200_000);
  assert.ok(half.interestSaved > 0 && half.interestSaved < full.interestSaved);
});
function near(a: number, b: number, tol = 0.005) { assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${a} vs ${b}`); }

test('validateBeat rejects broken spot and path beats', () => {
  const k = spot('spot-kyc-sms');
  assert.deepEqual(validateBeat(k), []);
  assert.ok(validateBeat({ ...k, parts: k.parts.slice(0, 3) }).some(m => /4 to 9 pieces/.test(m)));
  assert.ok(validateBeat({ ...k, parts: k.parts.map(p => ({ t: p.t, flag: p.t })) }).some(m => /red flags/.test(m) || /normal/.test(m)));
  assert.ok(validateBeat({ ...k, parts: k.parts.map((p, i) => (i === 1 ? p : { t: p.t })) }).some(m => /2 to 4 red flags/.test(m)), 'one flag is too few');
  assert.ok(validateBeat({ ...k, parts: [...k.parts, { t: k.parts[0].t, flag: k.parts[1].flag }, { t: k.parts[0].t, flag: k.parts[1].flag }] }).some(m => /2 to 4 red flags/.test(m)), 'five flags are too many');
  const c = path('choose-bonus');
  assert.deepEqual(validateBeat(c), []);
  assert.ok(validateBeat({ ...c, options: c.options.slice(0, 1) }).some(m => /2 to 4 options/.test(m)));
  assert.ok(validateBeat({ ...c, options: [c.options[0], c.options[0]] }).some(m => /repeat/.test(m)));
  assert.ok(validateBeat({ ...c, options: [{ ...c.options[0], result: { en: 'This is always right.', hi: 'यह हमेशा सही है।' } }, c.options[1]] }).some(m => /best, worst/.test(m)));
});

test('all the playable reels, new ones included, pass the script rules', () => {
  assert.ok(PLAY_REELS.length >= 9);
  for (const r of PLAY_REELS) assert.deepEqual(validateReel(r), [], r.id);
  assert.ok(LIBRARY.some(r => r.id === 'spot-kyc-sms'));
});

// ── Reels health ─────────────────────────────────────────────────────────────────────────────────────────────

const dk = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

test('health counters: bumping adds, bounds, ignores bad input and never lets a part exceed its whole', () => {
  let s = EMPTY_STATS;
  s = bump(s, '2026-10-19', 'fin'); s = bump(s, '2026-10-19', 'fin'); s = bump(s, '2026-10-19', 'right', 5);
  assert.equal(s.days['2026-10-19'].fin, 2); assert.equal(s.days['2026-10-19'].right, 2, 'right cannot exceed finished');
  s = bump(s, '2026-10-19', 'poke'); s = bump(s, '2026-10-19', 'engaged', 3);
  assert.equal(s.days['2026-10-19'].engaged, 1);
  assert.equal(bump(s, 'today', 'fin'), s); assert.equal(bump(s, '2026-10-19', 'fin', -1), s); assert.equal(bump(s, '2026-10-19', 'nope' as never), s); assert.equal(bump(s, '2026-10-19', 'fin', NaN), s);
  assert.equal(bump(EMPTY_STATS, '2026-10-19', 'ms', 1e12).days['2026-10-19'].ms, 24 * 3_600_000, 'a day cannot hold more than 24 hours');
  let many = EMPTY_STATS; for (let i = 0; i < KEEP_DAYS + 30; i++) many = bump(many, dk(2026, 1 + Math.floor(i / 28), 1 + (i % 28)), 'fin');
  assert.equal(Object.keys(many.days).length, KEEP_DAYS, 'only the last 90 days are kept');
  assert.ok(FIELDS.length === 10);
});

test('health counters: stored values are cleaned on the way in', () => {
  assert.deepEqual(parseStats('garbage'), EMPTY_STATS); assert.deepEqual(parseStats(null), EMPTY_STATS);
  const p = parseStats(JSON.stringify({ days: { '2026-10-19': { fin: 3, right: 9, poke: 2, engaged: 1, ms: -5, asks: 'x', extra: 1 }, bad: { fin: 1 }, '2026-10-20': 'no' } }));
  assert.deepEqual(Object.keys(p.days), ['2026-10-19']);
  assert.deepEqual(p.days['2026-10-19'], { fin: 3, right: 3, poke: 2, engaged: 1, know: 0, less: 0, moves: 0, receipts: 0, asks: 0, ms: 0 });
});

test('health: the 28-day figures, with known answers, and null where nothing was counted', () => {
  const empty = healthOf(EMPTY_STATS, new Date(2026, 9, 19));
  assert.deepEqual([empty.activeDays, empty.finished, empty.rightRate, empty.pokeRate, empty.movesPer100, empty.steeringPer100, empty.medianMinutes], [0, 0, null, null, null, null, null]);
  let s = EMPTY_STATS;
  const add = (d: string, f: Parameters<typeof bump>[2], n: number) => { s = bump(s, d, f, n); };
  add('2026-10-19', 'fin', 4); add('2026-10-19', 'right', 3); add('2026-10-19', 'poke', 2); add('2026-10-19', 'engaged', 1); add('2026-10-19', 'ms', 120_000);
  add('2026-10-18', 'fin', 6); add('2026-10-18', 'right', 3); add('2026-10-18', 'moves', 2); add('2026-10-18', 'know', 1); add('2026-10-18', 'less', 1); add('2026-10-18', 'ms', 240_000); add('2026-10-18', 'receipts', 1); add('2026-10-18', 'asks', 3);
  add('2026-10-17', 'ms', 600_000);
  add('2026-08-01', 'fin', 50);                                       // outside the 28-day window
  const h = healthOf(s, new Date(2026, 9, 19));
  assert.equal(h.activeDays, 2); assert.equal(h.finished, 10);
  assert.equal(h.rightRate, 0.6); assert.equal(h.pokeRate, 0.5);
  assert.equal(h.movesPer100, 20); assert.equal(h.steeringPer100, 20); assert.equal(h.receipts, 1); assert.equal(h.asks, 3);
  assert.equal(h.medianMinutes, 4, 'median of 2, 4 and 10 minutes');
  assert.equal(healthOf(s, new Date(2026, 9, 19), 90).finished, 60, 'a longer window includes older days');
});

test('health: the starting hypotheses say which side of the line a value is on', () => {
  assert.equal(HYPOTHESES.activeDays.ok(8), true); assert.equal(HYPOTHESES.activeDays.ok(7), false);
  assert.equal(HYPOTHESES.movesPer100.ok(15), true); assert.equal(HYPOTHESES.movesPer100.ok(14.9), false);
  assert.equal(HYPOTHESES.steeringPer100.ok(7.9), true); assert.equal(HYPOTHESES.steeringPer100.ok(8), false);
  assert.equal(HYPOTHESES.medianMinutes.ok(2.9), true); assert.equal(HYPOTHESES.medianMinutes.ok(3), false);
  for (const h of Object.values(HYPOTHESES)) assert.ok(h.en.length > 5 && /[ऀ-ॿ]/.test(h.hi));
});

test('the health counters hold no reel name or figure, and their key is in the privacy inventory as never synced', () => {
  const d = privacy.DATA_ITEMS.find(x => x.key === 'finos_session_reels_stats'); assert.ok(d); assert.match(d!.label, /never synced/); assert.match(d!.label, /No reel names or amounts/);
  const keys = new Set(FIELDS as string[]);
  assert.ok(!keys.has('reel') && !keys.has('id') && !keys.has('amount'));
});

// ── seven-day challenges ─────────────────────────────────────────────────────────────────────────────────────

const noon = (d: number, m = 10) => new Date(2026, m - 1, d, 12);

test('challenges: each has seven tasks in both languages, safe wording, and screens that exist', () => {
  assert.ok(CHALLENGES.length >= 2); assert.equal(new Set(CHALLENGES.map(c => c.id)).size, CHALLENGES.length);
  const root = nodePath.join(import.meta.dirname, '..');
  for (const c of CHALLENGES) {
    assert.equal(c.days.length, 7, c.id);
    for (const l of [c.title, c.blurb, c.end, ...c.days.flatMap(d => [d.title, d.body, ...(d.hrefLabel ? [d.hrefLabel] : [])])]) { assert.ok(l.en.length > 5 && /[ऀ-ॿ]/.test(l.hi), `${c.id}: ${l.en}`); assert.ok(!/you should (buy|invest|sell)|guaranteed|risk-free/i.test(l.en)); }
    for (const d of c.days) {
      assert.ok(d.title.en.length <= 40 && d.body.en.length <= 170, d.title.en);
      if (d.href) { const base = nodePath.join(root, 'app', d.href.replace(/^\//, '')); assert.ok(fs.existsSync(base + '.tsx') || fs.existsSync(nodePath.join(base, 'index.tsx')), `${c.id}: no screen for ${d.href}`); assert.ok(d.hrefLabel, `${c.id}: a link needs a label`); }
    }
  }
  assert.ok(challengeById('scam-proof-week')!.days.some(d => /1930/.test(d.body.en) && d.body.hi.includes('1930')));
});

test('challenges: one task a day, a missed day costs nothing, and finishing takes seven tasks', () => {
  let s = startChallenge(EMPTY_CHALLENGES, 'leak-week', noon(1));
  assert.deepEqual(runOf(s, 'leak-week'), { id: 'leak-week', start: '2026-10-01', done: [] });
  assert.deepEqual(todayOf(runOf(s, 'leak-week')!, noon(1)), { index: 0, available: true, finished: false });
  s = completeToday(s, 'leak-week', noon(1));
  assert.deepEqual(todayOf(runOf(s, 'leak-week')!, noon(1)), { index: 1, available: false, finished: false }, 'task 2 waits for tomorrow');
  assert.equal(completeToday(s, 'leak-week', noon(1)), s, 'a second tick on the same day changes nothing');
  s = completeToday(s, 'leak-week', noon(5));                              // three days passed: nothing was lost
  assert.equal(runOf(s, 'leak-week')!.done.length, 2);
  for (let d = 6; d <= 10; d++) s = completeToday(s, 'leak-week', noon(d));
  const run = runOf(s, 'leak-week')!;
  assert.equal(run.done.length, 7); assert.ok(isFinished(run));
  assert.deepEqual(todayOf(run, noon(11)), { index: 6, available: false, finished: true });
  assert.equal(completeToday(s, 'leak-week', noon(11)), s, 'nothing past the seventh task');
  assert.equal(completeToday(EMPTY_CHALLENGES, 'leak-week', noon(1)), EMPTY_CHALLENGES, 'cannot tick a challenge that was not started');
  assert.equal(startChallenge(EMPTY_CHALLENGES, 'nope', noon(1)), EMPTY_CHALLENGES);
});

test('challenges: starting again does not erase a run in progress, but a finished or stale one restarts', () => {
  let s = completeToday(startChallenge(EMPTY_CHALLENGES, 'scam-proof-week', noon(1)), 'scam-proof-week', noon(1));
  assert.equal(startChallenge(s, 'scam-proof-week', noon(2)), s, 'a run in progress is kept');
  const stale = new Date(2026, 10, 1 + STALE_DAYS, 12);
  assert.equal(pruneStale(s, noon(2)), s, 'a recent run stays');
  assert.deepEqual(pruneStale(s, stale).runs, [], 'a run untouched for a month is dropped');
  const again = startChallenge(s, 'scam-proof-week', stale);
  assert.deepEqual(runOf(again, 'scam-proof-week')!.done, []); assert.equal(runOf(again, 'scam-proof-week')!.start, '2026-12-01');
  for (let d = 2; d <= 7; d++) s = completeToday(s, 'scam-proof-week', noon(d));
  assert.ok(isFinished(runOf(s, 'scam-proof-week')!));
  const redo = startChallenge(s, 'scam-proof-week', noon(20));
  assert.deepEqual(runOf(redo, 'scam-proof-week')!.done, [], 'a finished challenge can be done again');
  assert.equal(redo.runs.length, 1);
});

test('challenges: stored progress is cleaned on the way in', () => {
  assert.deepEqual(parseChallenges('garbage'), EMPTY_CHALLENGES); assert.deepEqual(parseChallenges(null), EMPTY_CHALLENGES);
  const p = parseChallenges(JSON.stringify({ runs: [
    { id: 'leak-week', start: '2026-10-01', done: ['2026-10-01', '2026-10-01', '2026-09-01', 'x', '2026-10-03'] },
    { id: 'leak-week', start: '2026-10-09', done: [] },
    { id: 'unknown', start: '2026-10-01', done: [] }, { id: 'scam-proof-week', start: 'soon', done: [] }, { id: 'scam-proof-week', start: '2026-10-02', done: 'x' }, 5,
  ] }));
  assert.equal(p.runs.length, 1);
  assert.deepEqual(p.runs[0].done, ['2026-10-01', '2026-10-03'], 'dates must be real and in order, once each');
  const many = parseChallenges(JSON.stringify({ runs: [{ id: 'leak-week', start: '2026-10-01', done: Array.from({ length: 12 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`) }] }));
  assert.equal(many.runs[0].done.length, 7, 'never more than seven tasks');
});

test('challenges: the key is in the privacy inventory as never synced', () => {
  const d = privacy.DATA_ITEMS.find(x => x.key === 'finos_session_reels_challenges'); assert.ok(d); assert.match(d!.label, /never synced/);
});

// ── sort, order, more slider models, and cast members ────────────────────────────────────────────────────────

test('sort: scoring counts only answered cards, and a bin that no card belongs to is refused', () => {
  const cards = [{ bin: 0 }, { bin: 1 }, { bin: 2 }, { bin: 0 }];
  assert.deepEqual(scoreSort(cards, [0, 1, 0, 0]), { right: 3, answered: 4, total: 4 });
  assert.deepEqual(scoreSort(cards, [0, null, null]), { right: 1, answered: 1, total: 4 });
  const b = play('sort-needs-wants').poke!.beat as Extract<Beat, { kind: 'sort' }>;
  assert.deepEqual(validateBeat(b), []);
  assert.ok(validateBeat({ ...b, bins: [b.bins[0]] }).some(m => /2 or 3 bins/.test(m)));
  assert.ok(validateBeat({ ...b, cards: b.cards.map(c => ({ ...c, bin: 0 })) }).some(m => /would have no card/.test(m)));
  assert.ok(validateBeat({ ...b, cards: b.cards.map((c, i) => (i === 0 ? { ...c, bin: 9 } : c)) }).some(m => /does not exist/.test(m)));
  assert.ok(validateBeat({ ...b, cards: b.cards.slice(0, 2) }).some(m => /3 to 6 cards/.test(m)));
});

test('order: the shuffled deck is never already in order, every item appears once, and scoring counts items in their place', () => {
  for (let n = 3; n <= 6; n++) {
    const d = orderDeck(n);
    assert.deepEqual([...d].sort(), Array.from({ length: n }, (_, i) => i).sort(), `n=${n}`);
    assert.notDeepEqual(d, Array.from({ length: n }, (_, i) => i), `n=${n} is not already in order`);
  }
  assert.deepEqual(orderDeck(2), [0, 1]);
  assert.deepEqual(scoreOrder([0, 1, 2, 3, 4], 5), { right: 5, total: 5 });
  assert.deepEqual(scoreOrder([1, 0, 2, 4, 3], 5), { right: 1, total: 5 });
  assert.deepEqual(scoreOrder([], 5), { right: 0, total: 5 });
  const b = play('order-first-salary').poke!.beat as Extract<Beat, { kind: 'order' }>;
  assert.deepEqual(validateBeat(b), []);
  assert.ok(validateBeat({ ...b, items: b.items.slice(0, 2) }).some(m => /3 to 6 items/.test(m)));
});

test('slider models: every new kind gives the figure the tested functions give', () => {
  const emiRate: SliderModel = { kind: 'emi-rate', principal: 3_000_000, years: 20, rate0: 8.5 };
  const a = evalModel(emiRate, 10);
  assert.ok(Math.abs(a.value - 28_950) < 60, `EMI at 10% was ${a.value}`);                       // 30 lakh, 20 years, 10%
  assert.ok(Math.abs(a.base - 26_035) < 40); assert.equal(a.diff, Math.abs(a.value - a.base)); assert.ok(a.lost < 0, 'a higher rate costs more, so "lost" is negative');
  const tenure = evalModel({ kind: 'emi-tenure', principal: 1_000_000, rate: 9 }, 20);
  assert.ok(Math.abs(tenure.value - 8997) < 2); assert.ok(Math.abs(tenure.lost - 1_159_342) < 400, 'lost is the interest over the tenure');
  const goal = evalModel({ kind: 'goal-sip', target: 1_000_000, rate: 12 }, 10);
  assert.equal(goal.value, sipNeeded(1_000_000, 12, 10)); assert.ok(Math.abs(sipFV(goal.value, 12, 10) - 1_000_000) < 5, 'the SIP it asks for does reach the goal');
  assert.ok(Math.abs(goal.lost - (1_000_000 - goal.put)) < 1);
  const step = evalModel({ kind: 'step-up', monthly: 10_000, rate: 12, years: 20 }, 10);
  assert.equal(step.value, stepUpSipFutureValue(10_000, 10, 12, 20)); assert.equal(step.base, stepUpSipFutureValue(10_000, 0, 12, 20)); assert.ok(step.value > step.base && step.put > 2_400_000);
  const tax = evalModel({ kind: 'tax-income', deduction: 200_000 }, 1_500_000);
  assert.equal(tax.value, taxNew(1_500_000 - STD_NEW)); assert.equal(tax.base, taxOld(1_500_000 - STD_OLD - 200_000));
  const low = evalModel({ kind: 'tax-income', deduction: 0 }, 100_000);
  assert.equal(low.value, 0, 'no tax on a small income');
  const corpus = evalModel({ kind: 'corpus-spend', corpus: 10_000_000, rate: 7 }, 70_000);
  assert.equal(corpus.years, true); assert.ok(Math.abs(corpus.value - monthsToDeplete(10_000_000, 7, 70_000) / 12) < 1e-9);
  assert.equal(evalModel({ kind: 'corpus-spend', corpus: 10_000_000, rate: 7 }, 40_000).value, FOREVER_YEARS, 'a withdrawal the growth covers never runs out: capped, not infinite');
  const card = evalModel({ kind: 'card-interest', balance: 50_000, monthlyPct: 3.5 }, 12);
  assert.equal(card.value, unpaidBalance(50_000, 3.5, 12)); assert.ok(card.lost < 0 || card.diff > 0);
});

test('slider text: values, years and rupees are written the way a person reads them, in both languages, and the bars tell the same story', () => {
  const corpus = play('corpus-spend-slide').poke!.beat as Extract<Beat, { kind: 'slider' }>;
  const line = sliderLine(corpus, 70_000);
  assert.match(line.en, /Taking ₹70,000 a month, the corpus lasts about \d+(\.\d)? years/); assert.match(line.hi, /साल/);
  assert.match(sliderLine(corpus, 40_000).en, /60\+ years/);
  assert.equal(xText(corpus, 70_000, 'en'), '₹70,000');
  const rate = play('emi-rate-slide').poke!.beat as Extract<Beat, { kind: 'slider' }>;
  assert.equal(xText(rate, 9.5, 'en'), '9.5%');
  assert.match(sliderLine(rate, 9.5).en, /At 9\.5% a year the EMI is about ₹\d/);
  for (const id of ['emi-rate-slide', 'goal-sip-slide', 'corpus-spend-slide', 'delay-cost', 'inflation-slide']) {
    const b = play(id).poke!.beat as Extract<Beat, { kind: 'slider' }>;
    for (let x = b.min; x <= b.max + 1e-9; x += b.step) {
      const bars = sliderBars(b, x);
      assert.equal(bars.length, 2); assert.ok(bars.every(r => r.frac >= 0 && r.frac <= 1 && Number.isFinite(r.frac) && r.text.en && /\S/.test(r.text.hi)), `${id} at ${x}`);
      assert.ok(Math.max(...bars.map(r => r.frac)) === 1, 'the longer bar fills the track');
      const l = sliderLine(b, x); assert.ok(!/NaN|undefined|Infinity|\{/.test(l.en + l.hi), `${id} at ${x}: ${l.en}`);
    }
  }
});

test('slider models: broken parameters are refused', () => {
  const b = play('emi-rate-slide').poke!.beat as Extract<Beat, { kind: 'slider' }>;
  assert.deepEqual(validateBeat(b), []);
  assert.ok(validateBeat({ ...b, model: { kind: 'emi-rate', principal: 0, years: 20, rate0: 8 } }).some(m => /emi-rate needs/.test(m)));
  const g = play('goal-sip-slide').poke!.beat as Extract<Beat, { kind: 'slider' }>;
  assert.ok(validateBeat({ ...g, min: 0, model: g.model }).some(m => /goal-sip needs/.test(m)), 'a goal at zero years is refused');
  const c = play('corpus-spend-slide').poke!.beat as Extract<Beat, { kind: 'slider' }>;
  assert.ok(validateBeat({ ...c, min: -5 }).length > 0);
  assert.ok(validateBeat({ ...b, takeaway: { en: 'The gap is {nope}.', hi: 'फ़र्क़ {nope}।' } }).some(m => /unknown/.test(m)));
});

test('cast members: a scene may name one, the player knows the six, and the new reels use them', () => {
  assert.ok(CAST_IDS.length >= 11); assert.equal(new Set(CAST_IDS).size, CAST_IDS.length);
  const castFile = fs.readFileSync(nodePath.join(import.meta.dirname, '..', 'components/reels/Cast.tsx'), 'utf8');
  for (const id of CAST_IDS) assert.ok(castFile.includes(`${id}:`) || castFile.includes(`'${id}'`), `Cast.tsx does not draw ${id}`);
  const r = play('sort-needs-wants');
  assert.ok(r.scenes.some(sc => sc.who === 'aarav')); assert.deepEqual(validateReel(r), []);
  const bad = { ...r, scenes: r.scenes.map((sc, i) => (i === 0 ? { ...sc, who: 'nobody' as never } : sc)) };
  assert.ok(validateReel(bad).some(m => /cast member/.test(m)));
});
