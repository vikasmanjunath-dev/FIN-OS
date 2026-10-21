// Ranker v3: saved reels, "Still on your list" for pledges, milestones, seasons, and the determinism and fairness of the whole ranker, with
// known answers and made-up people. The distress guard, the blind spot and the review and refresh scores keep their own tests (reels-personal,
// reels-more); a few checks here make sure the new rules do not disturb them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY, libraryById } from '../lib/reels/library.ts';
import { metaOf } from '../lib/reels/meta.ts';
import { PILLARS, deriveSignals, type Signals } from '../lib/reels/signals.ts';
import { DIWALI_REELS, SEASON_LIFT, SEASON_NOTES, seasonLiftFor } from '../lib/reels/triggers.ts';
import { FRESH_MAX, MILESTONE_SHIFT, MS_LIFT, MS_LOWER, W_SAVED, blindSpot, rankReelsV2 } from '../lib/reels/ranker.ts';
import { composeEpisode } from '../lib/reels/episode.ts';
import { MAX_RESURFACES, RESURFACE_AFTER_DAYS, duePledges, resurfaceReason, startedReelIds } from '../lib/reels/followup.ts';
import { EMPTY_PROFILE, addPledge, noteResurfaced, parseReelsProfile, type ReelsProfile } from '../lib/reels/reelsProfile.ts';
import { MILESTONES } from '../lib/reels/milestones.ts';
import { EMPTY_MOVES, startMove } from '../lib/reels/moves.ts';
import { DEFS, type DeclaredEvent } from '../lib/lifeEvents.ts';
import { emi } from '../lib/reels/figures.ts';
import type { Mine } from '../lib/reels/mine.ts';
import type { Watched } from '../lib/reels/journey.ts';

const DAY = 86_400_000;
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 9, 0, 0);
const NOW = at(2026, 10, 19);                                             // an ordinary week: no season, no calendar trigger
const sig = (o: Parameters<typeof deriveSignals>[0]): Signals => deriveSignals(o);
const rank = (s: Signals, watched: Watched = {}, profile: ReelsProfile = EMPTY_PROFILE, extra: { started?: string[] } = {}) => rankReelsV2(LIBRARY, { watched, signals: s, profile, now: s.now, ...extra });
const ids = (r: { reel: { id: string } }[], n = r.length) => r.slice(0, n).map(x => x.reel.id);
const pos = (r: { reel: { id: string } }[], id: string) => r.findIndex(x => x.reel.id === id);
const homeLoan = { label: { en: 'home loan', hi: 'होम लोन' }, balance: 1_000_000, rate: 9, emi: emi(1_000_000, 9, 20) };
const ago = (days: number, now: Date = NOW) => new Date(now.getTime() - days * DAY).toISOString();
const seenAt = (id: string, days: number, correct: boolean, now: Date): Watched => ({ [id]: { at: ago(days, now), correct } });
const seen = (id: string, days: number, correct = true): Watched => seenAt(id, days, correct, NOW);
const withPledges = (list: { id: string; days: number; rs?: number; rn?: number }[]): ReelsProfile => ({
  ...EMPTY_PROFILE, pledges: list.map(p => ({ id: p.id, at: ago(p.days), ...(p.rs !== undefined ? { rs: ago(p.rs), rn: p.rn ?? 1 } : {}) })),
});
const weak = (id: (typeof PILLARS)[number], extra: Partial<Parameters<typeof deriveSignals>[0]> = {}) => sig({ now: NOW, pillars: PILLARS.map(p => ({ id: p, score: p === id ? 10 : 70 })), weakestId: id, ...extra });

// ── the files the rules rely on still match the library ─────────────────────────────────────────────────────

test('every reel the new rules name is a real reel', () => {
  const named = [...DIWALI_REELS, ...Object.values(MILESTONE_SHIFT).flatMap(m => [...m.lower, ...m.lift])];
  for (const id of named) assert.ok(libraryById(id), `${id} is named by a ranker rule but is not in the library`);
  for (const id of Object.keys(MILESTONE_SHIFT)) assert.ok(MILESTONES.some(m => m.id === id), `${id} is not a milestone`);
});

// ── saved reels ──────────────────────────────────────────────────────────────────────────────────────────────

test('saved: a saved reel not yet watched moves up a little, with its own reason, and never above a missed question', () => {
  const s = sig({ now: NOW });
  const base = rank(s), p = { ...EMPTY_PROFILE, saved: ['spot-electricity-sms'] };
  const saved = rank(s, {}, p);
  assert.ok(pos(saved, 'spot-electricity-sms') < pos(base, 'spot-electricity-sms'), 'saving lifts the reel');
  assert.equal(saved[pos(saved, 'spot-electricity-sms')].reason?.en, 'You saved this one for later.');
  assert.ok(saved[pos(saved, 'spot-electricity-sms')].reason?.hi);
  assert.deepEqual(ids(saved.filter(r => r.reel.id !== 'spot-electricity-sms')), ids(base.filter(r => r.reel.id !== 'spot-electricity-sms')), 'nothing else changes order');
  const missed = rank(s, seen('cash-flow', 3, false), p);
  assert.equal(missed[0].reel.id, 'cash-flow'); assert.equal(missed[0].why, 'review');
});

test('saved: the boost is modest (about five points) and capped, so a strongly needed reel still beats a saved one', () => {
  assert.ok(W_SAVED * 60 <= 6 && W_SAVED > 0);
  const s = weak('insurance');
  const top = rank(s)[0].reel.id;
  assert.ok(['insurance-basics', 'life-cover', 'myths-insurance', 'term-vs-ulip', 'health-cover-gotchas', 'insurance-claim-steps', 'super-top-up', 'parents-health-cover', 'order-claim-steps'].includes(top), top);
  const r = rank(s, {}, { ...EMPTY_PROFILE, saved: ['spot-electricity-sms'] });
  assert.equal(r[0].reel.id, top, 'a saved low-need reel does not jump the queue');
  // Saving everything cannot push any fresh reel past a missed question (110).
  const all = { ...EMPTY_PROFILE, saved: LIBRARY.slice(0, 60).map(x => x.id) };
  const r2 = rank(weak('investing'), seen('cash-flow', 2, false), all);
  assert.equal(r2[0].reel.id, 'cash-flow'); assert.ok(FRESH_MAX < 110);
});

test('saved: a reel already watched gets no boost, and a reel marked known stays last', () => {
  const s = sig({ now: NOW });
  const w = seen('inflation', 2, true);
  const a = rank(s, w), b = rank(s, w, { ...EMPTY_PROFILE, saved: ['inflation'] });
  assert.deepEqual(ids(a), ids(b));
  const k = rank(s, {}, { ...EMPTY_PROFILE, known: ['cash-flow'], saved: ['cash-flow'] });
  assert.equal(k[k.length - 1].reel.id, 'cash-flow');
});

// ── "Still on your list": which pledges are due, and the words ──────────────────────────────────────────────

test('followup: a pledge is due after five days, not before, and the oldest comes first', () => {
  assert.equal(RESURFACE_AFTER_DAYS, 5);
  const p = withPledges([{ id: 'emergency-fund', days: 4.9 }, { id: 'start-early', days: 5 }, { id: 'cash-flow', days: 9 }]);
  assert.deepEqual(duePledges(p, { now: NOW }), [{ id: 'cash-flow', times: 0 }, { id: 'start-early', times: 0 }]);
  assert.deepEqual(duePledges(withPledges([{ id: 'cash-flow', days: 4 }]), { now: NOW }), []);
  assert.deepEqual(duePledges(EMPTY_PROFILE, { now: NOW }), []);
});

test('followup: a started tool, a reel marked known, or a person under strain means nothing is due', () => {
  const p = { ...withPledges([{ id: 'emergency-fund', days: 10 }, { id: 'start-early', days: 10 }]), known: ['start-early'] };
  assert.deepEqual(duePledges(p, { now: NOW }).map(x => x.id), ['emergency-fund']);
  assert.deepEqual(duePledges(p, { now: NOW, started: ['emergency-fund'] }), []);
  assert.deepEqual(duePledges(p, { now: NOW, strain: true }), []);
  const mv = startMove(EMPTY_MOVES, 'emergency-fund', { fund: 10_000 }, NOW);
  assert.deepEqual(startedReelIds(mv), ['emergency-fund']);
  assert.deepEqual(duePledges(p, { now: NOW, started: startedReelIds(mv) }), []);
});

test('followup: brought back at most once in five days and at most MAX_RESURFACES times in all', () => {
  assert.equal(MAX_RESURFACES, 2);
  const once = withPledges([{ id: 'cash-flow', days: 20, rs: 2, rn: 1 }]);
  assert.deepEqual(duePledges(once, { now: NOW }), [], 'brought back two days ago');
  assert.deepEqual(duePledges(once, { now: new Date(NOW.getTime() + 3 * DAY) }), [{ id: 'cash-flow', times: 1 }], 'five days after it was brought back');
  const twice = withPledges([{ id: 'cash-flow', days: 40, rs: 20, rn: 2 }]);
  assert.deepEqual(duePledges(twice, { now: NOW }), [], 'two times is the limit');
});

test('followup: the sentence is in both languages, calm, and never about what was missed', () => {
  for (const times of [0, 1, 2]) {
    const t = resurfaceReason(times);
    assert.ok(t.en.length > 20 && t.en.length < 90 && t.hi.length > 15 && t.hi.length < 110, JSON.stringify(t));
    assert.ok(/still on your list|on your list/i.test(t.en));
    assert.ok(!/forgot|forgotten|overdue|late\b|missed|haven'?t|hurry|must|should|don'?t miss|last chance|\d+ days|!/i.test(t.en), t.en);
    assert.ok(!/भूल|देर|तुरंत|अभी करें|आख़िरी|दिन से|!/.test(t.hi), t.hi);
  }
  assert.notEqual(resurfaceReason(0).en, resurfaceReason(1).en);
});

test('profile: noteResurfaced records when and how often, survives a save and load, and is dropped with the pledge', () => {
  let p = addPledge(EMPTY_PROFILE, 'cash-flow', new Date(NOW.getTime() - 6 * DAY));
  p = noteResurfaced(p, 'cash-flow', NOW);
  assert.equal(p.pledges![0].rn, 1); assert.equal(p.pledges![0].rs, NOW.toISOString());
  assert.deepEqual(parseReelsProfile(JSON.stringify(p)).pledges, p.pledges);
  assert.equal(noteResurfaced(p, 'not-pledged', NOW), p);
  const junk = parseReelsProfile(JSON.stringify({ ...p, pledges: [{ id: 'cash-flow', at: 'x', rs: 5, rn: -3 }, { id: 'a', at: 'x', rn: 99, rs: 'y' }] }));
  assert.deepEqual(junk.pledges, [{ id: 'cash-flow', at: 'x' }, { id: 'a', at: 'x', rs: 'y', rn: 9 }]);
  assert.equal(noteResurfaced(addPledge(p, 'a', NOW), 'cash-flow', NOW).pledges![0].rn, 2);
});

// ── "Still on your list" in the ranking and the episode ──────────────────────────────────────────────────────

test('pledge: a due pledge is ranked as "pledge" with the bilingual reason, and only one at a time', () => {
  const p = withPledges([{ id: 'inflation', days: 8 }, { id: 'cash-flow', days: 12 }, { id: 'myths-money', days: 9 }]);
  const w: Watched = { ...seen('inflation', 8), ...seen('cash-flow', 12), ...seen('myths-money', 9) };
  const r = rank(sig({ now: NOW }), w, p);
  const pl = r.filter(x => x.why === 'pledge');
  assert.equal(pl.length, 1);
  assert.equal(pl[0].reel.id, 'cash-flow', 'the oldest pledge');
  assert.deepEqual(pl[0].reason, resurfaceReason(0));
  assert.ok(r.findIndex(x => x.why === 'pledge') < r.findIndex(x => x.reel.id === 'inflation'), 'above finished reels');
});

test('pledge: not before five days, not when the tool was started, not for an unwatched reel, not for a reel marked known', () => {
  const w = seen('cash-flow', 12);
  const due = withPledges([{ id: 'cash-flow', days: 12 }]);
  const has = (r: { why: string }[]) => r.some(x => x.why === 'pledge');
  assert.equal(has(rank(sig({ now: NOW }), w, due)), true);
  assert.equal(has(rank(sig({ now: NOW }), w, withPledges([{ id: 'cash-flow', days: 4 }]))), false);
  assert.equal(has(rank(sig({ now: NOW }), w, due, { started: ['cash-flow'] })), false);
  assert.equal(has(rank(sig({ now: NOW }), {}, due)), false, 'an unwatched reel is just a fresh reel');
  assert.equal(has(rank(sig({ now: NOW }), w, { ...due, known: ['cash-flow'] })), false);
  assert.equal(has(rank(sig({ now: NOW }), seen('cash-flow', 12, false), due)), false, 'a missed question keeps its own place');
});

test('pledge: never for a person under strain, and a pledged growth reel stays hidden', () => {
  const strained = sig({ now: NOW, mine: { loan: { ...homeLoan, emi: 62_000 } }, income: 100_000 });
  assert.equal(strained.strain, true);
  const p = withPledges([{ id: 'cash-flow', days: 12 }, { id: 'start-early', days: 12 }]);
  const r = rank(strained, { ...seen('cash-flow', 12), ...seen('start-early', 12) }, p);
  assert.ok(r.every(x => x.why !== 'pledge'));
  assert.ok(!ids(r).includes('start-early'));
  assert.ok(composeEpisode(r).picks.every(x => x.why !== 'pledge') && composeEpisode(r).resurfaced === null);
});

test('pledge: an episode holds at most one, in the third place (or after an interactive anchor), and says which it was', () => {
  const s = weak('insurance');
  const w: Watched = { ...seen('inflation', 8), ...seen('cash-flow', 12), ...seen('myths-money', 9) };
  const p = withPledges([{ id: 'inflation', days: 8 }, { id: 'cash-flow', days: 12 }, { id: 'myths-money', days: 9 }]);
  const r = rank(s, w, p);
  const ep = composeEpisode(r, 3);
  assert.equal(ep.picks.length, 3);
  assert.equal(ep.picks.filter(x => x.why === 'pledge').length, 1);
  assert.equal(ep.resurfaced, 'cash-flow');
  const at = ep.picks.findIndex(x => x.why === 'pledge');
  assert.equal(at, ep.picks[0].reel.poke ? 1 : 2);
  assert.notEqual(ep.picks[0].why, 'pledge', 'the anchor is never the pledge');
  assert.equal(new Set(ep.picks.map(x => x.reel.id)).size, 3);
  assert.ok(ep.picks.some(x => x.reel.poke) || r.every(x => !x.reel.poke || x.why === 'done'), 'something to touch is still there');
  assert.equal(composeEpisode(r, 2).resurfaced, null, 'a short episode has no room');
  assert.equal(composeEpisode(r, 1).resurfaced, null);
  assert.notEqual(ep.tomorrow?.id, 'cash-flow');
});

test('pledge: the weekly blind spot keeps its place; the pledged reel waits for another day', () => {
  const s = weak('insurance');
  const w = seen('cash-flow', 12);
  const p = withPledges([{ id: 'cash-flow', days: 12 }]);
  const r = rank(s, w, p);
  const b = blindSpot(r, s, p, NOW);
  assert.ok(b && b.why === 'blind' && b.reel.id !== 'cash-flow');
  const ep = composeEpisode(r, 3, b);
  assert.equal(ep.blind, true);
  assert.ok(ep.picks.some(x => x.reel.id === b.reel.id));
  const kept = ep.picks.some(x => x.why === 'pledge');
  assert.equal(ep.resurfaced !== null, kept, 'resurfaced is reported only if the reel is really in the episode');
  assert.equal(ep.picks.length, 3);
});

test('pledge: over 40 days a pledge comes back on day five, then not for five days, then at most once more', () => {
  let p = addPledge(EMPTY_PROFILE, 'cash-flow', NOW);
  const s0 = sig({ now: NOW });
  const days: number[] = [];
  for (let d = 0; d < 40; d++) {
    const now = new Date(NOW.getTime() + d * DAY);
    const r = rankReelsV2(LIBRARY, { watched: { 'cash-flow': { at: NOW.toISOString(), correct: true } }, signals: { ...s0, now }, profile: p, now });
    const ep = composeEpisode(r, 3);
    if (ep.resurfaced) { days.push(d); p = noteResurfaced(p, ep.resurfaced, now); }
  }
  assert.deepEqual(days, [5, 10]);
});

// ── milestones ───────────────────────────────────────────────────────────────────────────────────────────────

test('milestone first-sip: "start a SIP" reels rank lower, the next step higher, and nothing is hidden', () => {
  const s = weak('investing');
  const before = rank(s), after = rank(s, {}, { ...EMPTY_PROFILE, ms: ['first-sip'] });
  assert.equal(after.length, before.length);
  for (const id of MILESTONE_SHIFT['first-sip'].lower) assert.ok(pos(after, id) >= pos(before, id), `${id} should not rise`);
  assert.ok(pos(after, 'first-sip-habit') > pos(before, 'first-sip-habit'), 'the start reel falls');
  assert.ok(MILESTONE_SHIFT['first-sip'].lift.some(id => pos(after, id) < pos(before, id)), 'a next-step reel rises');
  const lifted = after.find(x => x.reel.id === 'goal-step-up' || x.reel.id === 'guess-step-up' || x.reel.id === 'slide-step-up-rate')!;
  assert.ok(lifted.reason === null || lifted.reason.en.length > 0);
  assert.ok(MS_LOWER > 0 && MS_LOWER < 1 && MS_LIFT > 0 && MS_LIFT <= 0.15);
});

test('milestone fund-3: basic emergency-fund reels rank lower and the next rung higher, but not while the fund is low again', () => {
  const ms = { ...EMPTY_PROFILE, ms: ['first-sip', 'fund-3'] };
  const covered = weak('emergency', { mine: { fund: 160_000, spend: 40_000 } });
  assert.equal(covered.fundMonths, 4);
  const before = rank(covered), after = rank(covered, {}, ms);
  for (const id of MILESTONE_SHIFT['fund-3'].lower) assert.ok(pos(after, id) > pos(before, id), `${id} should fall`);
  for (const id of ['where-keep-fund', 'fd-ladder']) assert.ok(pos(after, id) < pos(before, id), `${id} should rise`);
  const lowAgain = weak('emergency', { mine: { fund: 40_000, spend: 40_000 } });
  assert.equal(lowAgain.fundMonths, 1);
  const lowBefore = rank(lowAgain), lowAfter = rank(lowAgain, {}, ms);
  for (const id of MILESTONE_SHIFT['fund-3'].lower) assert.equal(pos(lowAfter, id), pos(lowBefore, id) - 0, `${id}: a low fund makes the basics timely again, so they are not lowered`);
});

test('milestones: only the milestones in the profile count, and the baseline alone changes nothing without ms', () => {
  const s = weak('investing');
  assert.deepEqual(ids(rank(s)), ids(rank(s, {}, { ...EMPTY_PROFILE, ms: [] })));
  assert.deepEqual(ids(rank(s)), ids(rank(s, {}, { ...EMPTY_PROFILE, ms: ['loan-clear', 'fund-6'] })), 'milestones without a rule leave the order alone');
});

// ── seasons ──────────────────────────────────────────────────────────────────────────────────────────────────

test('seasons: the lift is known per reel and per season, and is zero in an ordinary week', () => {
  const reel = (id: string) => libraryById(id)!;
  const scam = LIBRARY.find(r => r.topic === 'safety')!;
  const diwali = at(2026, 11, 6), budget = at(2026, 2, 1), yearend = at(2026, 3, 20), plain = at(2026, 10, 19);
  assert.equal(seasonLiftFor(scam, metaOf(scam.id), diwali)?.lift, SEASON_LIFT);
  assert.deepEqual(seasonLiftFor(reel('sort-needs-wants'), metaOf('sort-needs-wants'), diwali)?.note, SEASON_NOTES.diwali);
  assert.equal(seasonLiftFor(reel('inflation'), metaOf('inflation'), diwali), null, 'a reel about something else is not lifted');
  assert.equal(seasonLiftFor(reel('tax-regimes'), metaOf('tax-regimes'), budget)?.note.en, SEASON_NOTES.budget.en);
  assert.equal(seasonLiftFor(reel('sort-needs-wants'), metaOf('sort-needs-wants'), budget), null);
  assert.equal(seasonLiftFor(reel('section-80c'), metaOf('section-80c'), yearend)?.note.en, SEASON_NOTES.yearend.en);
  assert.equal(seasonLiftFor(reel('itr-filing-steps'), metaOf('itr-filing-steps'), yearend), null, 'a filing reel is not a tax-saving reel');
  for (const r of LIBRARY) assert.equal(seasonLiftFor(r, metaOf(r.id), plain), null);
  for (const n of Object.values(SEASON_NOTES)) { assert.ok(n.en && n.hi); assert.ok(!/should|must|best time|hurry|guarantee/i.test(n.en)); }
});

test('seasons: Diwali week lifts spending and scam reels in the ranking', () => {
  const norm = at(2026, 10, 19), fest = at(2026, 11, 6);
  const a = rank(sig({ now: norm })), b = rank(sig({ now: fest }));
  const lifted = [...DIWALI_REELS, ...LIBRARY.filter(r => r.topic === 'safety').map(r => r.id)].filter(id => !a.find(x => x.reel.id === id && x.why === 'done'));
  const better = lifted.filter(id => pos(b, id) < pos(a, id)).length;
  assert.ok(better >= lifted.length * 0.8, `${better} of ${lifted.length} rose`);
  assert.ok(lifted.every(id => pos(b, id) <= pos(a, id)));
  assert.equal(b.find(x => x.reel.id === 'cash-flow')!.reason?.en, SEASON_NOTES.diwali.en);
});

test('seasons: Budget week lifts tax reels, and March year-end lifts tax-saving reels', () => {
  const tax = LIBRARY.filter(r => r.topic === 'tax').map(r => r.id);
  const wk = rank(sig({ now: at(2026, 2, 1) })), after = rank(sig({ now: at(2026, 2, 10) }));
  assert.ok(tax.every(id => pos(wk, id) <= pos(after, id)));
  assert.ok(tax.some(id => pos(wk, id) < pos(after, id)));
  const saving = LIBRARY.filter(r => (metaOf(r.id).triggers ?? []).includes('cal:tax-season')).map(r => r.id);
  const ye = rank(sig({ now: at(2026, 3, 20) })), early = rank(sig({ now: at(2026, 3, 10) }));
  assert.ok(saving.length >= 5);
  assert.ok(saving.every(id => pos(ye, id) <= pos(early, id)), 'these are already timely from January, so they may only hold their place or rise');
});

test('seasons never override the distress guard: 300 made-up people on season days see no growth reel and keep gentle picks first', () => {
  let seed = 31; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const days = [at(2026, 11, 6), at(2026, 11, 8), at(2026, 2, 1), at(2026, 1, 30), at(2026, 3, 20), at(2026, 3, 31)];
  let strained = 0, gentleFirst = 0;
  for (let i = 0; i < 300; i++) {
    const income = 20_000 + Math.round(rnd() * 180_000);
    const mine: Mine = rnd() > 0.2 ? { loan: { ...homeLoan, emi: Math.round(income * (0.1 + rnd() * 0.8)) } } : {};
    const events: DeclaredEvent[] = rnd() > 0.85 ? [{ id: 'e', type: 'job_loss', date: '2026-01-01', createdAt: 0 }] : [];
    const now = days[Math.floor(rnd() * days.length)];
    const s = sig({ now, mine, income, events, pillars: PILLARS.map(id => ({ id, score: Math.round(rnd() * 100) })), weakestId: PILLARS[Math.floor(rnd() * 6)] });
    if (!s.strain) continue;
    strained++;
    const profile: ReelsProfile = { ...EMPTY_PROFILE, saved: LIBRARY.slice(0, 80).map(x => x.id), ms: ['first-sip', 'fund-3'], pledges: LIBRARY.slice(0, 5).map(x => ({ id: x.id, at: ago(20, now) })) };
    const w: Watched = Object.fromEntries(LIBRARY.slice(0, 5).map(x => [x.id, { at: ago(20, now), correct: true }]));
    const r = rankReelsV2(LIBRARY, { watched: w, signals: s, profile, now });
    assert.ok(r.every(x => !metaOf(x.reel.id).growth && x.why !== 'pledge'), `person ${i}`);
    const ep = composeEpisode(r);
    assert.ok(ep.picks.every(x => !metaOf(x.reel.id).growth), `person ${i}`);
    const top = r.find(x => x.why !== 'done')!;
    if (top.why === 'gentle' || top.why === 'timely' || top.why === 'review') gentleFirst++;
  }
  assert.ok(strained > 20, `only ${strained} strained people`);
  assert.ok(gentleFirst >= strained * 0.5, `${gentleFirst} of ${strained}`);
});

// ── the old guarantees still hold with everything switched on ────────────────────────────────────────────────

test('v3 keeps the review, refresh and known scores in their old order, whatever else is on', () => {
  const s = sig({ now: at(2026, 11, 6) }), seen = (id: string, days: number, correct = true) => seenAt(id, days, correct, s.now);
  const p: ReelsProfile = { ...withPledges([{ id: 'cash-flow', days: 9 }]), known: ['sort-needs-wants'], saved: ['inflation', 'myths-money'], ms: ['first-sip', 'fund-3'] };
  const w: Watched = { ...seen('myths-saving', 3, false), ...seen('cash-flow', 9), ...seen('lifestyle-creep', 10), ...seen('pay-yourself-first', 2) };
  const r = rank(s, w, p);
  assert.equal(r[0].reel.id, 'myths-saving'); assert.equal(r[0].why, 'review');
  assert.equal(r.find(x => x.reel.id === 'lifestyle-creep')!.why, 'refresh');
  assert.equal(r.find(x => x.reel.id === 'pay-yourself-first')!.why, 'done');
  const sorted = r.map(x => x.why);
  assert.ok(sorted.lastIndexOf('pledge') < sorted.indexOf('done') && sorted.lastIndexOf('pledge') < sorted.indexOf('refresh'));
  assert.equal(r[r.length - 1].reel.id, 'sort-needs-wants', 'known goes last');
});

// ── determinism and fairness ─────────────────────────────────────────────────────────────────────────────────

function population(count: number, seed0: number) {
  let seed = seed0; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const types = Object.keys(DEFS) as DeclaredEvent['type'][];
  return Array.from({ length: count }, (_, i) => {
    const now = new Date(2026, Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 27), 9);
    const income = 20_000 + Math.round(rnd() * 180_000);
    const mine: Mine = {};
    if (rnd() > 0.5) mine.sip = 1000 + Math.round(rnd() * 20_000);
    if (rnd() > 0.4) { mine.spend = 20_000 + Math.round(rnd() * 40_000); mine.fund = Math.round(mine.spend * rnd() * 8); }
    if (rnd() > 0.5) mine.loan = { ...homeLoan, balance: 500_000 + Math.round(rnd() * 3_000_000), emi: Math.round(income * (0.1 + rnd() * 0.5)) };
    const events: DeclaredEvent[] = rnd() > 0.6 ? [{ id: `e${i}`, type: types[Math.floor(rnd() * types.length)], date: new Date(now.getTime() - 5 * DAY).toISOString().slice(0, 10), createdAt: 0 }] : [];
    const scored = rnd() > 0.2;
    const s = sig({ now, mine, income, age: 20 + Math.floor(rnd() * 40), events, pillars: scored ? PILLARS.map(id => ({ id, score: Math.round(rnd() * 100) })) : null, weakestId: scored ? PILLARS[Math.floor(rnd() * 6)] : null });
    // The person has already watched some of the library, as someone who has used the reels for a while would have.
    const share = rnd() * 0.7, watched: Watched = {};
    for (const r of LIBRARY) if (rnd() < share) watched[r.id] = { at: ago(1 + Math.floor(rnd() * 3), now), correct: rnd() > 0.25 };
    const profile: ReelsProfile = { ...EMPTY_PROFILE, saved: rnd() > 0.5 ? LIBRARY.filter(() => rnd() > 0.95).map(r => r.id) : [], ms: rnd() > 0.7 ? ['first-sip'] : [] };
    return { s, watched, profile };
  });
}

test('determinism: the same inputs always give the same order, reasons and episode, whatever order the maps were built in', () => {
  for (const { s, watched, profile } of population(40, 5)) {
    const a = rankReelsV2(LIBRARY, { watched, signals: s, profile, now: s.now });
    const b = rankReelsV2(LIBRARY, { watched: Object.fromEntries(Object.entries(watched).reverse()), signals: s, profile: { ...profile, saved: [...(profile.saved ?? [])].reverse() }, now: new Date(s.now.getTime()) });
    assert.deepEqual(a.map(x => [x.reel.id, x.why, x.reason]), b.map(x => [x.reel.id, x.why, x.reason]));
    assert.deepEqual(composeEpisode(a).picks.map(x => x.reel.id), composeEpisode(b).picks.map(x => x.reel.id));
    assert.equal(new Set(ids(a)).size, a.length, 'no reel appears twice');
    assert.equal(a.length, s.strain ? LIBRARY.filter(r => !metaOf(r.id).growth).length : LIBRARY.length, 'only the distress guard removes a reel');
  }
});

test('fairness: every reel in the library reaches the top 30 for some plausible person', () => {
  const N = 30, reached = new Set<string>();
  for (const { s, watched, profile } of population(500, 11)) for (const r of rankReelsV2(LIBRARY, { watched, signals: s, profile, now: s.now }).slice(0, N)) reached.add(r.reel.id);
  const never = LIBRARY.filter(r => !reached.has(r.id)).map(r => r.id);
  assert.deepEqual(never, [], `never in anyone's top ${N}: ${never.join(', ')}`);
});

test('fairness: no topic is starved of episode places', () => {
  const slots: Record<string, number> = {}; let total = 0;
  for (const { s, watched, profile } of population(500, 23)) for (const p of composeEpisode(rankReelsV2(LIBRARY, { watched, signals: s, profile, now: s.now })).picks) { slots[p.reel.topic] = (slots[p.reel.topic] ?? 0) + 1; total++; }
  const inLibrary: Record<string, number> = {};
  for (const r of LIBRARY) inLibrary[r.topic] = (inLibrary[r.topic] ?? 0) + 1;
  for (const [topic, n] of Object.entries(inLibrary)) {
    const share = (slots[topic] ?? 0) / total, fair = n / LIBRARY.length;
    assert.ok(share >= 0.25 * fair && share >= 0.02, `${topic} gets ${(share * 100).toFixed(1)}% of places against ${(fair * 100).toFixed(1)}% of the library`);
    assert.ok(share <= 3 * fair, `${topic} takes ${(share * 100).toFixed(1)}% of places against ${(fair * 100).toFixed(1)}% of the library`);
  }
});

test('fairness: over a month of daily episodes a person sees several topics, and a pledge never blocks the rest', () => {
  for (const { s, profile } of population(12, 77)) {
    const topics = new Set<string>(); let watched: Watched = {};
    const pr: ReelsProfile = { ...profile, pledges: [{ id: LIBRARY[0].id, at: ago(30, s.now) }] };
    for (let d = 0; d < 30; d++) {
      const now = new Date(s.now.getTime() + d * DAY);
      const ep = composeEpisode(rankReelsV2(LIBRARY, { watched, signals: { ...s, now }, profile: pr, now }), 3);
      assert.ok(ep.picks.length >= 1 && ep.picks.filter(x => x.why === 'pledge').length <= 1);
      for (const p of ep.picks) { topics.add(p.reel.topic); watched = { ...watched, [p.reel.id]: { at: now.toISOString(), correct: true } }; }
    }
    assert.ok(topics.size >= 4, `only ${topics.size} topics in a month`);
  }
});
