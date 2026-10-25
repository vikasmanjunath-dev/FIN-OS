// The cold start: the welcome's answers and how they are stored, the first-week nudge that decays to nothing, and the first episode (two reels,
// a playable myth then a concept) for each thing a new person can say they are here for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY } from '../lib/reels/library.ts';
import { metaOf } from '../lib/reels/meta.ts';
import { rankReelsV2 } from '../lib/reels/ranker.ts';
import { deriveSignals, type Signals } from '../lib/reels/signals.ts';
import { isBeatUsable } from '../lib/reels/beats.ts';
import { EMPTY_PROFILE, parseReelsProfile, type ReelsProfile, type StartAnswers } from '../lib/reels/reelsProfile.ts';
import {
  BIAS_DAYS, COPY, FIRST_EPISODE_SIZE, GOAL_OPTIONS, LANG_OPTIONS, LEVEL_OPTIONS, applyBias, buildStart, changeLabel, firstEpisode, firstEpisodeBias, goalIdOf, isFirstDay,
  langWasChosen, needsWelcome, skippedStart, stepCount, stepText, welcomeSteps, type GoalId,
} from '../lib/reels/coldstart.ts';
import type { Ranked, Watched } from '../lib/reels/journey.ts';
import type { DeclaredEvent } from '../lib/lifeEvents.ts';

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 24, 9, 0, 0);
const sig = (o: Partial<Parameters<typeof deriveSignals>[0]> = {}): Signals => deriveSignals({ now: NOW, ...o });
const loss: DeclaredEvent = { id: 'e-job_loss', type: 'job_loss', date: '2026-10-01', createdAt: 0 };
const rank = (s: Signals = sig(), profile: ReelsProfile = EMPTY_PROFILE, watched: Watched = {}) => rankReelsV2(LIBRARY, { watched, signals: s, profile, now: NOW });
const playableMyth = (r: Ranked) => metaOf(r.reel.id).level === 'myth' && !!r.reel.poke && isBeatUsable(r.reel);
const DEVANAGARI = /[ऀ-ॿ]/;
const goalIds = GOAL_OPTIONS.map(g => g.id);

// ── storage: parsed safely ───────────────────────────────────────────────────────────────────────────────────

test('start: a stored answer is parsed into topics, a level and a date, and nothing else', () => {
  const start = buildStart('save', 'new', NOW);
  const back = parseReelsProfile(JSON.stringify({ v: 1, known: [], less: {}, start }));
  assert.deepEqual(back.start, start);
  assert.deepEqual(back.start?.goals, ['invest', 'basics', 'goals']);
  assert.equal(back.start?.skipped, undefined);
});

test('start: bad input is dropped or repaired and never throws', () => {
  const p = (start: unknown) => parseReelsProfile(JSON.stringify({ v: 1, known: [], less: {}, start })).start;
  const at = NOW.toISOString();
  assert.equal(p(undefined), undefined);
  for (const bad of [null, 7, 'x', [], true, {}, { goals: ['tax'], level: 'new' }, { goals: ['tax'], level: 'new', at: 'not a date' }, { goals: ['tax'], level: 'new', at: 12 }, { goals: [], level: 'new', at: 'x'.repeat(100) }]) assert.equal(p(bad), undefined, JSON.stringify(bad));
  assert.deepEqual(p({ goals: ['tax', 'nonsense', 'tax', 7, null, '__proto__'], level: 'new', at })?.goals, ['tax'], 'unknown and repeated topics go');
  assert.equal(p({ goals: ['tax'], level: 'expert', at })?.level, 'some', 'an unknown level becomes the neutral one');
  assert.equal(p({ goals: 'tax', level: 'new', at })?.goals.length, 0);
  assert.equal(p({ goals: ['invest', 'loans', 'tax', 'safety', 'goals'], level: 'new', at })?.goals.length, 3, 'at most three topics');
  assert.equal(p({ goals: [], level: 'some', at, skipped: 'yes' })?.skipped, undefined, 'skipped is only true when it is exactly true');
  assert.equal(p({ goals: [], level: 'some', at, skipped: true })?.skipped, true);
  assert.deepEqual(Object.keys(p({ goals: [], level: 'some', at, extra: 'x', skipped: true }) ?? {}).sort(), ['at', 'goals', 'level', 'skipped']);
  assert.doesNotThrow(() => parseReelsProfile('{"start":{"goals":{"length":9},"level":{},"at":{}}}'));
  assert.equal(parseReelsProfile('{"known":["a-b"],"start":{"goals":["tax"],"level":"new","at":"bad"}}').known.length, 1, 'a bad answer does not spoil the rest of the profile');
});

test('start: a profile without it is exactly as before', () => {
  const old = parseReelsProfile(JSON.stringify({ v: 1, known: ['inflation'], less: { tax: 2 }, tips: 1 }));
  assert.equal('start' in old, false);
  assert.deepEqual(parseReelsProfile(null), { v: 1, known: [], less: {} });
});

// ── the welcome ──────────────────────────────────────────────────────────────────────────────────────────────

test('welcome: shown once to a new person, never after an answer or a skip, never after a reel was finished', () => {
  assert.equal(needsWelcome(EMPTY_PROFILE, {}), true);
  assert.equal(needsWelcome({ ...EMPTY_PROFILE, start: buildStart('tax', 'some', NOW) }, {}), false);
  assert.equal(needsWelcome({ ...EMPTY_PROFILE, start: skippedStart(NOW) }, {}), false, 'skip is remembered');
  assert.equal(needsWelcome(EMPTY_PROFILE, { inflation: { at: NOW.toISOString(), correct: true } }), false, 'someone who has finished a reel is not a new person');
  const stored = JSON.stringify({ ...EMPTY_PROFILE, start: skippedStart(NOW) });
  assert.equal(needsWelcome(parseReelsProfile(stored), {}), false, 'and it survives a save and a load');
});

test('welcome: a skip records nothing about the person and nudges nothing', () => {
  const sk = skippedStart(NOW);
  assert.equal(sk.skipped, true); assert.deepEqual(sk.goals, []); assert.equal(sk.level, 'some');
  const b = firstEpisodeBias(sk, NOW);
  assert.deepEqual(b, { factor: 0, topics: {}, levels: {} });
});

test('welcome: language is asked first, and only when the app has none; the others follow in order', () => {
  assert.deepEqual(welcomeSteps(true), ['lang', 'goal', 'level']);
  assert.deepEqual(welcomeSteps(false), ['goal', 'level']);
  assert.equal(langWasChosen(null), false); assert.equal(langWasChosen(''), false); assert.equal(langWasChosen('fr'), false);
  assert.equal(langWasChosen('hi'), true); assert.equal(langWasChosen('"en"'), true);
});

test('welcome: every option maps to known topics, and an earlier answer can be shown again', () => {
  assert.deepEqual(goalIds, ['save', 'loan', 'scams', 'tax', 'curious']);
  assert.deepEqual(GOAL_OPTIONS.find(g => g.id === 'curious')?.topics, []);
  for (const g of GOAL_OPTIONS) { assert.ok(g.topics.length <= 3); for (const t of g.topics) assert.ok(LIBRARY.some(r => r.topic === t), `${g.id}: no reels on ${t}`); }
  for (const g of goalIds) assert.equal(goalIdOf(buildStart(g, 'some', NOW)), g, g);
  assert.equal(goalIdOf(skippedStart(NOW)), null); assert.equal(goalIdOf(undefined), null);
  assert.deepEqual(LEVEL_OPTIONS.map(o => o.id), ['new', 'some', 'comfortable']);
});

test('welcome: every string has Hindi, in Devanagari, different from the English', () => {
  const pairs: [string, { en: string; hi: string }][] = [];
  for (const [k, v] of Object.entries(COPY)) pairs.push([`COPY.${k}`, v]);
  for (const g of GOAL_OPTIONS) pairs.push([`goal.${g.id}`, g.label]);
  for (const o of LEVEL_OPTIONS) { pairs.push([`level.${o.id}`, o.label]); pairs.push([`level.${o.id}.hint`, o.hint]); }
  for (const st of ['lang', 'goal', 'level'] as const) pairs.push([`step.${st}`, stepText(st)]);
  pairs.push(['count', stepCount(2, 3)], ['change', changeLabel(buildStart('tax', 'new', NOW))], ['changeSkipped', changeLabel(skippedStart(NOW))], ['changeNone', changeLabel(undefined)]);
  for (const [name, v] of pairs) {
    assert.ok(v.en.trim().length > 0, `${name}: no English`);
    assert.ok(DEVANAGARI.test(v.hi), `${name}: Hindi is missing or not Devanagari`);
    assert.notEqual(v.hi, v.en, name);
  }
  assert.deepEqual(LANG_OPTIONS.map(o => o.label), ['English', 'हिन्दी']);
});

test('welcome: it says the answers stay on the phone and can be changed, and gives no advice', () => {
  assert.match(COPY.privacy.en, /stay on this phone/i); assert.match(COPY.privacy.en, /change them/i);
  assert.match(COPY.disclaimer.en, /not advice/i);
  for (const v of [COPY.title, COPY.hello, COPY.privacy, ...GOAL_OPTIONS.map(g => g.label)]) assert.doesNotMatch(v.en, /guaranteed|you should (buy|invest)|risk-free/i);
});

// ── the first-week nudge ─────────────────────────────────────────────────────────────────────────────────────

test('bias: full strength on the day of the answers, falling evenly, and exactly nothing from day seven', () => {
  const start = buildStart('loan', 'new', NOW);
  const at = (d: number) => new Date(NOW.getTime() + d * DAY);
  const b0 = firstEpisodeBias(start, at(0));
  assert.equal(b0.factor, 1); assert.deepEqual(Object.keys(b0.topics).sort(), ['credit', 'loans']);
  const half = firstEpisodeBias(start, at(BIAS_DAYS / 2));
  assert.equal(half.factor, 0.5); assert.equal(half.topics.loans, b0.topics.loans! / 2); assert.equal(half.levels.myth, b0.levels.myth! / 2);
  let last = 2;
  for (let d = 0; d <= BIAS_DAYS + 3; d += 0.5) { const f = firstEpisodeBias(start, at(d)).factor; assert.ok(f <= last, `day ${d}`); last = f; }
  for (const d of [BIAS_DAYS, BIAS_DAYS + 0.001, 8, 30, 400]) assert.deepEqual(firstEpisodeBias(start, at(d)), { factor: 0, topics: {}, levels: {} }, `day ${d}`);
  assert.ok(firstEpisodeBias(start, at(BIAS_DAYS - 0.01)).factor > 0, 'still a trace just before');
  assert.equal(firstEpisodeBias(start, at(-3)).factor, 1, 'a clock that ran backwards never gives more than full strength');
});

test('bias: nothing from nothing, and an unreadable date is no nudge', () => {
  for (const s of [undefined, null, skippedStart(NOW), { goals: ['tax'], level: 'new', at: 'garbage' } as StartAnswers]) assert.equal(firstEpisodeBias(s, NOW).factor, 0);
  assert.deepEqual(firstEpisodeBias(buildStart('curious', 'some', NOW), NOW).topics, {});
  assert.deepEqual(firstEpisodeBias(buildStart('curious', 'some', NOW), NOW).levels, {});
});

test('bias: after seven days the ranker\'s own order is untouched; on day one a chosen topic moves up', () => {
  const ranked = rank();
  const start = buildStart('tax', 'new', NOW);
  const day = (d: number) => new Date(NOW.getTime() + d * DAY);
  const same = applyBias(ranked, firstEpisodeBias(start, day(BIAS_DAYS)), false);
  assert.deepEqual(same.map(r => r.reel.id), ranked.map(r => r.reel.id));
  const day1 = applyBias(ranked, firstEpisodeBias(start, day(0)), false);
  assert.equal(day1.length, ranked.length); assert.deepEqual([...day1.map(r => r.reel.id)].sort(), [...ranked.map(r => r.reel.id)].sort(), 'it reorders, it never adds or drops');
  const top = (list: Ranked[], n: number) => list.slice(0, n).filter(r => r.reel.topic === 'tax').length;
  assert.ok(top(day1, 10) > top(ranked, 10), 'tax reels come earlier');
  const half = applyBias(ranked, firstEpisodeBias(start, day(3.5)), false);
  assert.ok(top(half, 10) >= top(ranked, 10) && top(half, 10) <= top(day1, 10), 'and the lift shrinks by the day');
});

test('bias: a missed question, a refresher and a pledge keep their place', () => {
  const watched: Watched = { 'emi-trap': { at: new Date(NOW.getTime() - 3 * DAY).toISOString(), correct: false } };
  const ranked = rank(sig(), EMPTY_PROFILE, watched);
  assert.equal(ranked[0].why, 'review');
  const moved = applyBias(ranked, firstEpisodeBias(buildStart('tax', 'comfortable', NOW), NOW), false);
  assert.equal(moved[0].reel.id, ranked[0].reel.id, 'the missed question still comes first');
  const review = ranked.filter(r => r.why === 'review').map(r => r.reel.id);
  assert.deepEqual(moved.filter(r => r.why === 'review').map(r => r.reel.id), review);
});

test('bias: ladder level tilts the order (new: myths and concepts earlier; comfortable: decisions earlier)', () => {
  const ranked = rank();
  const rungAvg = (list: Ranked[], lv: string) => { const ix = list.map((r, i) => (metaOf(r.reel.id).level === lv ? i : -1)).filter(i => i >= 0); return ix.reduce((a, b) => a + b, 0) / ix.length; };
  const nw = applyBias(ranked, firstEpisodeBias(buildStart('curious', 'new', NOW), NOW), false);
  const co = applyBias(ranked, firstEpisodeBias(buildStart('curious', 'comfortable', NOW), NOW), false);
  assert.ok(rungAvg(nw, 'myth') < rungAvg(ranked, 'myth')); assert.ok(rungAvg(nw, 'action') > rungAvg(ranked, 'action'));
  assert.ok(rungAvg(co, 'decision') < rungAvg(ranked, 'decision')); assert.ok(rungAvg(co, 'myth') > rungAvg(ranked, 'myth'));
  const some = applyBias(ranked, firstEpisodeBias(buildStart('curious', 'some', NOW), NOW), false);
  assert.deepEqual(some.map(r => r.reel.id), ranked.map(r => r.reel.id), 'the middle answer changes nothing');
});

// ── the first episode ────────────────────────────────────────────────────────────────────────────────────────

for (const goal of goalIds) {
  for (const level of ['new', 'some', 'comfortable'] as const) {
    test(`first episode (${goal}, ${level}): two reels, a playable myth first, then a concept`, () => {
      const start = buildStart(goal as GoalId, level, NOW);
      const ep = firstEpisode(rank(), start, { now: NOW });
      assert.equal(ep.picks.length, FIRST_EPISODE_SIZE);
      const [a, b] = ep.picks;
      assert.notEqual(a.reel.id, b.reel.id);
      assert.equal(metaOf(a.reel.id).level, 'myth', `${a.reel.id} is not a myth`);
      assert.ok(a.reel.poke && isBeatUsable(a.reel), `${a.reel.id} has no usable beat`);
      assert.equal(metaOf(b.reel.id).level, 'concept', `${b.reel.id} is not a concept`);
      const topics = GOAL_OPTIONS.find(g => g.id === goal)!.topics;
      if (topics.length) { assert.ok(topics.includes(a.reel.topic), `${a.reel.id} (${a.reel.topic}) is not on ${goal}`); assert.equal(b.reel.topic, a.reel.topic, 'the concept is on the same topic as the myth'); }
      assert.ok(ep.tomorrow && ep.tomorrow.id !== a.reel.id && ep.tomorrow.id !== b.reel.id, 'a tomorrow teaser that is neither of today\'s');
      assert.equal(ep.blind, false); assert.equal(ep.resurfaced, null);
      assert.ok(!ep.picks.some(p => p.why === 'done' || p.why === 'review'), 'no repeat and no quiz-first start');
    });
  }
}

test('first episode: with nothing chosen (Just curious, or Skip) it follows the ranker, still two reels, myth first', () => {
  for (const start of [buildStart('curious', 'some', NOW), skippedStart(NOW), undefined]) {
    const ep = firstEpisode(rank(), start, { now: NOW });
    assert.equal(ep.picks.length, 2); assert.ok(playableMyth(ep.picks[0]));
    assert.equal(metaOf(ep.picks[1].reel.id).level, 'concept');
  }
  const a = firstEpisode(rank(), undefined, { now: NOW }), b = firstEpisode(rank(), undefined, { now: NOW });
  assert.deepEqual(a.picks.map(p => p.reel.id), b.picks.map(p => p.reel.id), 'the same inputs give the same episode');
});

test('first episode: the choice is used even when the nudge has worn off', () => {
  const start = buildStart('scams', 'new', new Date(NOW.getTime() - 20 * DAY));
  assert.equal(firstEpisodeBias(start, NOW).factor, 0);
  const ep = firstEpisode(rank(), start, { now: NOW });
  assert.equal(ep.picks[0].reel.topic, 'safety');
});

test('first episode: falls back gracefully when the library has nothing for the topic', () => {
  const without = (pred: (r: Ranked) => boolean) => rank().filter(r => !pred(r));
  // no playable myth on the topic → a playable reel on the topic, concept first
  const noMyth = without(r => r.reel.topic === 'tax' && metaOf(r.reel.id).level === 'myth');
  const a = firstEpisode(noMyth, buildStart('tax', 'new', NOW), { now: NOW });
  assert.equal(a.picks.length, 2); assert.equal(a.picks[0].reel.topic, 'tax'); assert.ok(a.picks[0].reel.poke, 'still something to touch');
  // no playable reel at all on the topic → a playable myth from elsewhere
  const noTax = without(r => r.reel.topic === 'tax' && !!r.reel.poke);
  const b = firstEpisode(noTax, buildStart('tax', 'new', NOW), { now: NOW });
  assert.equal(b.picks.length, 2); assert.ok(playableMyth(b.picks[0]), 'a playable myth from another topic'); assert.notEqual(b.picks[0].reel.topic, 'tax');
  // no topic at all → whatever the ranker has
  const noTopic = without(r => r.reel.topic === 'tax');
  const c = firstEpisode(noTopic, buildStart('tax', 'new', NOW), { now: NOW });
  assert.equal(c.picks.length, 2); assert.ok(c.picks.every(p => p.reel.topic !== 'tax'));
  // nothing playable anywhere → the top two, never a crash
  const flat = rank().filter(r => !r.reel.poke);
  const d = firstEpisode(flat, buildStart('save', 'new', NOW), { now: NOW });
  assert.equal(d.picks.length, 2); assert.notEqual(d.picks[0].reel.id, d.picks[1].reel.id);
  // tiny and empty rankings
  assert.equal(firstEpisode(rank().slice(0, 1), buildStart('save', 'new', NOW), { now: NOW }).picks.length, 1);
  const empty = firstEpisode([], buildStart('save', 'new', NOW), { now: NOW });
  assert.deepEqual(empty.picks, []); assert.equal(empty.tomorrow, null);
});

test('first episode: a person under strain gets no "put in more" reel, even when they chose investing', () => {
  const strained = sig({ events: [loss] });
  assert.equal(strained.strain, true);
  for (const goal of goalIds) for (const level of ['new', 'some', 'comfortable'] as const) {
    const start = buildStart(goal, level, NOW);
    const guarded = firstEpisode(rank(strained), start, { now: NOW, strain: true });          // the ranker already removed them
    assert.ok(guarded.picks.length >= 1, goal);
    for (const p of guarded.picks) assert.ok(!metaOf(p.reel.id).growth, `${goal}/${level}: ${p.reel.id} is a growth reel`);
    const unguarded = firstEpisode(rank(sig()), start, { now: NOW, strain: true });           // a list that did not go through the guard
    for (const p of unguarded.picks) assert.ok(!metaOf(p.reel.id).growth, `${goal}/${level}: ${p.reel.id} slipped past`);
    assert.ok(!unguarded.tomorrow || !metaOf(unguarded.tomorrow.id).growth, 'and neither does the teaser');
  }
  // the same reels are offered to a person who is not strained, so the test is not vacuous
  const growthIds = new Set(LIBRARY.filter(r => metaOf(r.id).growth).map(r => r.id));
  const free = applyBias(rank(sig()), firstEpisodeBias(buildStart('save', 'new', NOW), NOW), false).slice(0, 40);
  assert.ok(free.some(r => growthIds.has(r.reel.id)), 'growth reels do rank high for someone choosing investing');
  const held = applyBias(rank(sig()), firstEpisodeBias(buildStart('save', 'new', NOW), NOW), true);
  assert.ok(!held.some(r => growthIds.has(r.reel.id)));
});

test('first episode: the nudge cannot bring back a reel the ranker removed', () => {
  const strained = rank(sig({ events: [loss] }));
  const ids = new Set(strained.map(r => r.reel.id));
  for (const goal of goalIds) {
    const ep = firstEpisode(strained, buildStart(goal, 'comfortable', NOW), { now: NOW, strain: true });
    for (const p of [...ep.picks, ...(ep.tomorrow ? [{ reel: ep.tomorrow }] : [])]) assert.ok(ids.has(p.reel.id));
  }
});

test('first episode: a finished reel on day one leaves only what is left of the two', () => {
  const start = buildStart('save', 'new', NOW);
  const full = firstEpisode(rank(), start, { now: NOW });
  const one = firstEpisode(rank(), start, { now: NOW, finished: 1 });
  assert.equal(one.picks.length, 1); assert.equal(one.picks[0].reel.id, full.picks[1].reel.id, 'the concept');
  assert.equal(firstEpisode(rank(), start, { now: NOW, finished: 2 }).picks.length, 0, 'two done: only the calm stop');
  assert.equal(firstEpisode(rank(), start, { now: NOW, finished: 9 }).picks.length, 0);
  assert.equal(firstEpisode(rank(), start, { now: NOW, finished: -4 }).picks.length, 2);
});

test('first day: true until a reel was finished on an earlier day', () => {
  const w = (d: number): Watched => ({ a: { at: new Date(NOW.getTime() - d * DAY).toISOString(), correct: true } });
  assert.equal(isFirstDay({}, NOW), true);
  assert.equal(isFirstDay(w(0), NOW), true);
  assert.equal(isFirstDay(w(1), NOW), false);
  assert.equal(isFirstDay({ ...w(0), b: { at: 'junk', correct: true } }, NOW), false);
});
