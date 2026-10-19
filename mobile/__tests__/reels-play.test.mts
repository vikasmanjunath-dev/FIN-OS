// Phase 1 of the reels blueprint: interactive beats (guess first, what-if slider, myth or fact), the trust ribbon and today's episode.
// Everything the screen decides is a pure function, so it is checked here with known answers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PLAY_REELS } from '../lib/reels/content-play.ts';
import { ACT_ALL, LIBRARY, PLAY_ACT, libraryById } from '../lib/reels/library.ts';
import { AUTO_CONTINUE_MS, IDLE_MS, evalModel, niceRound, pokeStart, posToValue, scoreGuess, scoreMyth, sliderLine, validateBeat, valueToPos } from '../lib/reels/beats.ts';
import { TRUST, trustFor } from '../lib/reels/trust.ts';
import { EPISODE_SIZE, composeEpisode, finishedToday } from '../lib/reels/episode.ts';
import { ACT, rankReels, type Ranked } from '../lib/reels/journey.ts';
import { emi, inflatedValue, money, sipFutureValue } from '../lib/reels/figures.ts';
import { sceneStarts, totalMs } from '../lib/reels/engine.ts';
import { textsOf, validateReel } from '../lib/reels/validate.ts';
import { byId } from '../lib/calcs/index.ts';
import type { Beat, Reel } from '../lib/reels/types.ts';

const root = path.join(import.meta.dirname, '..');
const near = (a: number, b: number, tol = 0.001) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${a} is not within ${tol * 100}% of ${b}`);
const play = (id: string): Reel => PLAY_REELS.find(r => r.id === id)!;

// ── the playable reels follow every rule the other reels follow ─────────────────────────────────────────────────

test('playable reels: every script passes the validator, and there is one of each kind', () => {
  assert.ok(PLAY_REELS.length >= 6);
  for (const r of PLAY_REELS) assert.deepEqual(validateReel(r), [], r.id);
  const kinds = new Set(PLAY_REELS.map(r => r.poke!.beat.kind));
  assert.deepEqual([...kinds].sort(), ['guess', 'myth', 'order', 'path', 'slider', 'sort', 'spot']);
  for (const r of PLAY_REELS) assert.ok(r.poke, `${r.id} has no beat`);
});

test('the library is the main reels plus the playable ones, with unique ids and real Learn lessons', () => {
  assert.equal(new Set(LIBRARY.map(r => r.id)).size, LIBRARY.length);
  assert.equal(libraryById('guess-sip')?.id, 'guess-sip');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'content/learn/manifest.json'), 'utf8')) as { lessons: { id: string }[] };
  const ids = new Set(manifest.lessons.map(l => l.id));
  for (const r of PLAY_REELS) if (r.lesson) assert.ok(ids.has(r.lesson), `${r.id}: missing lesson ${r.lesson}`);
});

test('every playable reel has a tool to open that exists, except scam reels, which point at none', () => {
  for (const r of PLAY_REELS) {
    const a = ACT_ALL[r.id];
    if (r.topic === 'safety') { assert.equal(a, undefined, `${r.id}: a scam reel points at no tool`); continue; }
    assert.ok(a, `${r.id} has no tool link`);
    assert.ok(a.label.en.length > 8 && /[ऀ-ॿ]/.test(a.label.hi), `${r.id} label`);
    const calc = a.href.match(/^\/tools\/calc\/([a-z0-9]+)$/);
    if (calc) assert.ok(byId(calc[1]), `${r.id}: no calculator ${calc[1]}`);
    else { const base = path.join(root, 'app', a.href.replace(/^\//, '')); assert.ok(fs.existsSync(base + '.tsx') || fs.existsSync(path.join(base, 'index.tsx')), `${r.id}: no screen for ${a.href}`); }
  }
  for (const k of Object.keys(PLAY_ACT)) assert.equal(ACT[k], undefined, `${k} is in both ACT maps`);
});

test('the beat pauses the clock in the middle of the reel, between two scenes', () => {
  for (const r of PLAY_REELS) {
    const p = pokeStart(r)!;
    assert.ok(p > 0 && p < totalMs(r), r.id);
    const starts = sceneStarts(r), i = r.poke!.after;
    assert.equal(p, starts[i] + r.scenes[i].ms - 1);
  }
  assert.equal(pokeStart({ ...play('guess-sip'), poke: undefined }), null);
  assert.equal(pokeStart({ ...play('guess-sip'), poke: { ...play('guess-sip').poke!, after: 99 } }), null);
});

// ── guess first ──────────────────────────────────────────────────────────────────────────────────────────────

test('guess scale: log positions round-trip and land on numbers a person would say', () => {
  assert.equal(niceRound(1_786_431), 1_800_000);
  assert.equal(niceRound(0), 0); assert.equal(niceRound(NaN), 0); assert.equal(niceRound(-5), 0);
  assert.equal(posToValue(0, 500_000, 100_000_000), 500_000);
  assert.equal(posToValue(1, 500_000, 100_000_000), 100_000_000);
  assert.equal(posToValue(-3, 1000, 10_000), 1000); assert.equal(posToValue(9, 1000, 10_000), 10_000); assert.equal(posToValue(NaN, 1000, 10_000), 1000);
  for (const p of [0.1, 0.37, 0.5, 0.8]) near(valueToPos(posToValue(p, 100_000, 10_000_000), 100_000, 10_000_000), p, 0.03);
  assert.equal(valueToPos(0, 10, 1000), 0); assert.equal(valueToPos(1e9, 10, 1000), 1);
});

test('guess scoring: within 15% is spot on, within 60% is close, otherwise far; never a failure', () => {
  assert.deepEqual(scoreGuess(100, 100), { verdict: 'spot', times: 1, side: 'exact' });
  assert.equal(scoreGuess(110, 100).verdict, 'spot');
  assert.equal(scoreGuess(150, 100).verdict, 'close');
  assert.equal(scoreGuess(50, 100).verdict, 'far');
  assert.deepEqual([scoreGuess(25, 100).side, scoreGuess(25, 100).times], ['low', 4]);
  assert.equal(scoreGuess(400, 100).side, 'high');
  assert.equal(scoreGuess(0, 100).verdict, 'far');
  assert.equal(scoreGuess(100, NaN).verdict, 'far');
});

test('guess reels: the revealed answer is the maths, not a typed number', () => {
  const sip = play('guess-sip').poke!.beat as Extract<Beat, { kind: 'guess' }>;
  near(sip.answer, sipFutureValue(5000, 12, 30), 0.0001);                    // about ₹1.75 crore
  assert.ok(sip.reveal.en.includes(money(sipFutureValue(5000, 12, 30)).en));
  const loan = play('guess-emi').poke!.beat as Extract<Beat, { kind: 'guess' }>;
  near(loan.answer, emi(1_000_000, 9, 20) * 240 - 1_000_000, 0.0001);        // about ₹11.6 lakh of interest
  assert.ok(loan.answer > 1_000_000, 'the interest is more than the loan');
  for (const b of [sip, loan]) { assert.ok(b.min < b.answer && b.answer < b.max); const pos = valueToPos(b.answer, b.min, b.max); assert.ok(pos > 0.15 && pos < 0.85, 'the answer is not at the edge of the scale'); }
});

// ── what-if slider ───────────────────────────────────────────────────────────────────────────────────────────

test('slider models call the tested functions: waiting, years invested and inflation', () => {
  const wait = { kind: 'sip-delay', monthly: 10_000, rate: 12, horizon: 30 } as const;
  const f0 = evalModel(wait, 0), f10 = evalModel(wait, 10);
  near(f0.value, sipFutureValue(10_000, 12, 30)); assert.equal(f0.lost, 0);
  near(f10.value, sipFutureValue(10_000, 12, 20)); near(f10.lost, f0.value - f10.value);
  assert.equal(f10.put, 10_000 * 12 * 20);
  assert.ok(f10.lost > 10_000 * 12 * 10, 'the cost of waiting is far more than the deposits skipped');
  const yrs = evalModel({ kind: 'sip-years', monthly: 5000, rate: 12 }, 30);
  near(yrs.value, 17_474_816, 0.0005); assert.equal(yrs.put, 1_800_000);
  const infl = evalModel({ kind: 'inflation-years', amount: 100_000, rate: 6 }, 20);
  near(infl.value, inflatedValue(100_000, 6, 20)); near(infl.lost, 100_000 - infl.value); assert.equal(infl.base, 100_000);
  assert.equal(evalModel(wait, 99).value, 0);                                 // never negative years
});

test('slider takeaway: the sentence at each position is filled from the figures, in both languages', () => {
  const b = play('inflation-slide').poke!.beat as Extract<Beat, { kind: 'slider' }>;
  const line = sliderLine(b, 20);
  const v = money(inflatedValue(100_000, 6, 20));
  assert.ok(line.en.includes(v.en) && line.hi.includes(v.hi) && line.en.includes('20 years'));
  assert.ok(!/\{\w+\}|NaN|undefined/.test(line.en + line.hi));
  const d = play('delay-cost').poke!.beat as Extract<Beat, { kind: 'slider' }>;
  for (let x = d.min; x <= d.max; x += d.step) { const s = sliderLine(d, x); assert.ok(!/\{\w+\}|NaN|undefined|Infinity/.test(s.en + s.hi), `x=${x}`); }
  assert.ok(sliderLine(d, 10).en.includes(money(sipFutureValue(10_000, 12, 30) - sipFutureValue(10_000, 12, 20)).en));
});

// ── myth or fact ─────────────────────────────────────────────────────────────────────────────────────────────

test('myth cards: scoring counts only answered cards', () => {
  const cards = [{ fact: true }, { fact: false }, { fact: false }, { fact: true }];
  assert.deepEqual(scoreMyth(cards, [true, false, true, true]), { right: 3, answered: 4, total: 4 });
  assert.deepEqual(scoreMyth(cards, [true, null, null, null]), { right: 1, answered: 1, total: 4 });
  assert.deepEqual(scoreMyth(cards, []), { right: 0, answered: 0, total: 4 });
});

test('myth decks: a mix of myths and facts, and the scam deck keeps its safety claims in line with the lesson', () => {
  for (const id of ['myths-money', 'myths-scams']) {
    const b = play(id).poke!.beat as Extract<Beat, { kind: 'myth' }>;
    assert.ok(b.cards.length >= 3 && b.cards.length <= 5);
    assert.ok(b.cards.some(c => c.fact) && b.cards.some(c => !c.fact));
  }
  const s = play('myths-scams').poke!.beat as Extract<Beat, { kind: 'myth' }>;
  const otp = s.cards.find(c => /OTP or PIN/.test(c.s.en))!; assert.equal(otp.fact, true);
  const arrest = s.cards.find(c => /digital arrest/i.test(c.s.en))!; assert.equal(arrest.fact, false);
  const kyc = s.cards.find(c => /KYC/.test(c.s.en))!; assert.equal(kyc.fact, false);
});

// ── the rules for beats ──────────────────────────────────────────────────────────────────────────────────────

test('validateBeat rejects broken beats', () => {
  const q = { en: 'Q?', hi: 'प्रश्न?' };
  const good = play('guess-sip').poke!.beat as Extract<Beat, { kind: 'guess' }>;
  assert.deepEqual(validateBeat(good), []);
  assert.ok(validateBeat({ ...good, answer: good.max * 2 }).some(m => /min < answer < max/.test(m)));
  assert.deepEqual(validateBeat({ ...good, min: 10, max: 100_000, answer: 50_000 }), []);
  assert.ok(validateBeat({ ...good, min: 1, max: 1e9, answer: 1000 }).some(m => /wider/.test(m)));
  const sl = play('delay-cost').poke!.beat as Extract<Beat, { kind: 'slider' }>;
  assert.deepEqual(validateBeat(sl), []);
  assert.ok(validateBeat({ ...sl, start: 99 }).some(m => /start is outside/.test(m)));
  assert.ok(validateBeat({ ...sl, step: 0 }).some(m => /steps/.test(m)));
  assert.ok(validateBeat({ ...sl, takeaway: { en: 'Costs {nope}', hi: 'क़ीमत {nope}' } }).some(m => /unknown/.test(m)));
  assert.ok(validateBeat({ ...sl, max: 40 }).some(m => /horizon/.test(m)));
  const my = play('myths-money').poke!.beat as Extract<Beat, { kind: 'myth' }>;
  assert.deepEqual(validateBeat(my), []);
  assert.ok(validateBeat({ ...my, cards: my.cards.slice(0, 2) }).some(m => /3 to 5/.test(m)));
  assert.ok(validateBeat({ ...my, cards: my.cards.map(c => ({ ...c, fact: true })) }).some(m => /at least one myth/.test(m)));
  assert.ok(validateBeat({ kind: 'myth', q, cards: [my.cards[0], my.cards[0], my.cards[1]] }).some(m => /repeat/.test(m)));
});

test('validateReel checks the beat position and the beat texts', () => {
  const r = play('guess-sip');
  assert.ok(validateReel({ ...r, poke: { ...r.poke!, after: 0 } }).some(m => /middle/.test(m)));
  assert.ok(validateReel({ ...r, poke: { ...r.poke!, after: r.scenes.length - 1 } }).some(m => /middle/.test(m)));
  const bad = { ...r, poke: { ...r.poke!, beat: { ...(r.poke!.beat as Extract<Beat, { kind: 'guess' }>), reveal: { en: 'You should buy this fund. Guaranteed returns of 12%.', hi: 'यह फ़ंड ख़रीदें। 12% पक्का रिटर्न।' } } } } as Reel;
  assert.ok(validateReel(bad).some(m => /promise or advice/.test(m)), 'beat texts are held to the wording rules');
  assert.ok(textsOf(r).length > textsOf({ ...r, poke: undefined }).length);
  assert.ok(IDLE_MS >= 6000 && IDLE_MS <= 12_000 && AUTO_CONTINUE_MS >= 3000);
});

// ── the trust ribbon ─────────────────────────────────────────────────────────────────────────────────────────

test('trust ribbon: every note belongs to a real reel and reads cleanly in both languages', () => {
  for (const [id, t] of Object.entries(TRUST)) {
    assert.ok(libraryById(id), `${id} is not a reel`);
    assert.match(t.asOf, /^\d{4}-\d{2}-\d{2}$/);
    for (const x of [t.formula, t.assumes]) {
      assert.ok(x.en.length > 20 && /[ऀ-ॿ]/.test(x.hi), `${id}: both languages`);
      assert.ok(!/\{\w+\}|NaN|undefined/.test(x.en + x.hi));
    }
  }
  assert.equal(trustFor('nope'), null);
});

test('trust ribbon: every playable reel that quotes a figure explains it, and percentages are labelled assumptions', () => {
  for (const id of ['guess-sip', 'guess-emi', 'delay-cost', 'inflation-slide']) assert.ok(trustFor(id), id);
  for (const id of ['start-early', 'guess-sip', 'delay-cost', 'inflation', 'inflation-slide', 'emi-trap', 'guess-emi', 'rbi-and-emi', 'direct-vs-regular']) {
    const t = trustFor(id)!;
    if (/%/.test(t.assumes.en)) assert.match(t.assumes.en, /assum|example|rough|illustrat|fixed rate|compar/i, id);
  }
  // the note quotes the same assumptions the script uses
  assert.match(trustFor('guess-sip')!.assumes.en, /₹5,000 a month for 30 years at an assumed 12%/);
  assert.match(trustFor('emi-trap')!.assumes.en, /₹10 lakh at 9% a year for 20 years/);
  assert.match(trustFor('delay-cost')!.assumes.en, /₹10,000 a month over a 30-year horizon at an assumed 12%/);
});

// ── today's episode ──────────────────────────────────────────────────────────────────────────────────────────

const NOW = new Date('2026-10-19T09:00:00');
const rankedAll = (watched = {}): Ranked[] => rankReels(LIBRARY, { watched, weakest: null, now: NOW });

test('episode: three different reels, an anchor first, and something to touch', () => {
  const e = composeEpisode(rankedAll());
  assert.equal(e.picks.length, EPISODE_SIZE);
  assert.equal(new Set(e.picks.map(p => p.reel.id)).size, EPISODE_SIZE);
  assert.equal(e.picks[0].reel.id, rankedAll()[0].reel.id, 'the anchor is the best-ranked reel');
  assert.ok(e.picks.some(p => p.reel.poke), 'at least one reel in the episode is playable');
  assert.ok(e.tomorrow && !e.picks.some(p => p.reel.id === e.tomorrow!.id), 'tomorrow is a reel left out');
});

test('episode: if the anchor is already playable the rest follow the ranking, preferring new topics', () => {
  const ranked = rankedAll();
  const first = ranked.find(r => r.reel.poke)!;
  const reordered = [first, ...ranked.filter(r => r !== first)];
  const e = composeEpisode(reordered);
  assert.equal(e.picks[0].reel.id, first.reel.id);
  const topics = e.picks.map(p => p.reel.topic);
  assert.ok(new Set(topics).size >= 2, `topics: ${topics}`);
});

test('episode: reels already finished are not offered again, and sizes behave at the edges', () => {
  const ranked = rankedAll();
  const watched = Object.fromEntries(ranked.slice(0, 5).map(r => [r.reel.id, { at: '2026-10-19T08:00:00', correct: true }]));
  const e = composeEpisode(rankedAll(watched));
  for (const p of e.picks) assert.ok(!watched[p.reel.id as keyof typeof watched], `${p.reel.id} was already finished`);
  assert.equal(composeEpisode(ranked, 1).picks.length, 1);
  assert.equal(composeEpisode(ranked, 0).picks.length, 0);
  assert.equal(composeEpisode([], 3).picks.length, 0);
  assert.equal(composeEpisode(ranked.slice(0, 2), 5).picks.length, 2);
  assert.equal(composeEpisode(ranked.slice(0, 1), 3).tomorrow, null);
  const everything = Object.fromEntries(LIBRARY.map(r => [r.id, { at: '2026-10-01T08:00:00', correct: true }]));
  assert.equal(composeEpisode(rankedAll(everything)).picks.length, EPISODE_SIZE, 'a person who has seen it all still gets a refresher episode');
});

test('episode: how many reels were finished today, by local calendar day', () => {
  const w = { a: { at: new Date(2026, 9, 19, 7, 30).toISOString(), correct: true }, b: { at: new Date(2026, 9, 19, 23, 59).toISOString(), correct: false }, c: { at: new Date(2026, 9, 18, 23, 59).toISOString(), correct: true }, d: { at: 'garbage', correct: true } };
  assert.equal(finishedToday(w, NOW), 2);
  assert.equal(finishedToday({}, NOW), 0);
});
