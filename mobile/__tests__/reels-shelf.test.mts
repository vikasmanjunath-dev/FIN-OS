// The rest of the blueprint's engine: saved reels and My moves, real milestones, seasons, the daily money fact, Money date on one phone, and
// the gesture wiring in the player. Pure functions checked with known answers; the screens are checked by reading their source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import nodePath from 'node:path';
import { EMPTY_PROFILE, MAX_PLEDGES, MAX_SAVED, TIPS_MAX, addPledge, isEmptyProfile, isPledged, isSaved, noteTip, parseReelsProfile, removePledge, showTip, toggleSaved } from '../lib/reels/reelsProfile.ts';
import { MILESTONES, achievedNow, checkMilestones, markMilestoneSeen, milestoneById, unseenMilestones } from '../lib/reels/milestones.ts';
import { DIWALI, SEASONS, seasonOf } from '../lib/reels/seasons.ts';
import { FACTS, factFor } from '../lib/reels/facts.ts';
import { TIE_RATIO, judgeTogether, togetherBeat } from '../lib/reels/together.ts';
import { LIBRARY } from '../lib/reels/library.ts';
import { isBeatUsable } from '../lib/reels/beats.ts';
import { EMPTY_STATS, bump, healthOf, parseStats } from '../lib/reels/stats.ts';
import { inflatedValue, money, sipFutureValue } from '../lib/reels/figures.ts';
import { weekLine, weekOf } from '../lib/reels/weekly.ts';

const read = (p: string) => fs.readFileSync(nodePath.join(process.cwd(), p), 'utf8');
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12);

// ── saved reels and pledges ───────────────────────────────────────────────────────────────────────────────────

test('saving a reel toggles it, newest last, and is bounded', () => {
  const a = toggleSaved(EMPTY_PROFILE, 'guess-sip');
  assert.equal(a.kept, true); assert.deepEqual(a.profile.saved, ['guess-sip']); assert.equal(isSaved(a.profile, 'guess-sip'), true);
  const b = toggleSaved(a.profile, 'delay-cost');
  assert.deepEqual(b.profile.saved, ['guess-sip', 'delay-cost']);
  const c = toggleSaved(b.profile, 'guess-sip');
  assert.equal(c.kept, false); assert.deepEqual(c.profile.saved, ['delay-cost']);
  let p = EMPTY_PROFILE;
  for (let i = 0; i < MAX_SAVED + 10; i++) p = toggleSaved(p, `reel-${i}`).profile;
  assert.equal(p.saved?.length, MAX_SAVED); assert.equal(p.saved?.[MAX_SAVED - 1], `reel-${MAX_SAVED + 9}`);
  assert.equal(toggleSaved(EMPTY_PROFILE, 'Bad Id!').kept, false);       // a malformed id is never kept
});

test('"I\'ll do this" puts a move on the list once, and removing forgets it', () => {
  const now = new Date('2026-10-20T10:00:00Z');
  const a = addPledge(EMPTY_PROFILE, 'emergency-fund', now);
  assert.equal(isPledged(a, 'emergency-fund'), true); assert.equal(a.pledges?.length, 1);
  assert.equal(addPledge(a, 'emergency-fund', now), a);                   // the same reel again changes nothing
  assert.equal(removePledge(a, 'emergency-fund').pledges?.length, 0);
  assert.equal(removePledge(a, 'unknown'), a);
  let p = EMPTY_PROFILE;
  for (let i = 0; i < MAX_PLEDGES + 5; i++) p = addPledge(p, `m-${i}`, now);
  assert.equal(p.pledges?.length, MAX_PLEDGES);
  assert.equal(isEmptyProfile(a), false); assert.equal(isEmptyProfile(EMPTY_PROFILE), true);
});

test('a stored profile with saved, pledges and milestones is made safe', () => {
  const raw = JSON.stringify({ v: 1, known: ['a'], less: {}, saved: ['ok-one', 'Bad Id', 5, 'ok-one'], pledges: [{ id: 'p-one', at: '2026-10-20T00:00:00Z' }, { id: 'p-one', at: 'x' }, { id: 'BAD', at: 'x' }, 'str'], ms: ['first-sip', 'Nope!'], msSeen: ['first-sip'], hadLoan: true, tips: 2 });
  const p = parseReelsProfile(raw);
  assert.deepEqual(p.saved, ['ok-one']); assert.deepEqual(p.pledges, [{ id: 'p-one', at: '2026-10-20T00:00:00Z' }]);
  assert.deepEqual(p.ms, ['first-sip']); assert.deepEqual(p.msSeen, ['first-sip']); assert.equal(p.hadLoan, true); assert.equal(p.tips, 2);
  const bare = parseReelsProfile(JSON.stringify({ v: 1, known: [], less: {} }));
  assert.equal(bare.saved, undefined); assert.equal(bare.ms, undefined); assert.equal(bare.hadLoan, undefined);   // old profiles stay as they were
  assert.deepEqual(parseReelsProfile('not json'), { v: 1, known: [], less: {} });
});

test('the gesture tips stop after a few visits', () => {
  let p = EMPTY_PROFILE;
  for (let i = 0; i < TIPS_MAX; i++) { assert.equal(showTip(p), true); p = noteTip(p); }
  assert.equal(showTip(p), false);
});

// ── milestones ────────────────────────────────────────────────────────────────────────────────────────────────

test('milestones: the first check is a silent baseline, later ones are told once', () => {
  const had = { sip: 5000, spend: 40000, fund: 130000 };               // 3.25 months of spending
  const base = checkMilestones(EMPTY_PROFILE, had);
  assert.deepEqual(base.ms, ['first-sip', 'fund-3']); assert.deepEqual(unseenMilestones(base), []);   // what was already true is not celebrated
  assert.equal(checkMilestones(base, had), base);                         // nothing new, nothing written
  const later = checkMilestones(base, { ...had, fund: 250000 });          // 6.25 months
  assert.deepEqual(unseenMilestones(later).map(m => m.id), ['fund-6']);
  const seen = markMilestoneSeen(later, 'fund-6');
  assert.deepEqual(unseenMilestones(seen), []); assert.equal(markMilestoneSeen(seen, 'fund-6'), seen);
});

test('milestones: thresholds, and a cleared loan needs a loan that was seen', () => {
  assert.deepEqual(achievedNow({}, false), []);
  assert.deepEqual(achievedNow({ sip: 500 }, false), ['first-sip']);
  assert.deepEqual(achievedNow({ spend: 30000, fund: 89999 }, false), []);
  assert.deepEqual(achievedNow({ spend: 30000, fund: 90000 }, false), ['fund-3']);
  assert.deepEqual(achievedNow({ spend: 30000, fund: 180000 }, false), ['fund-3', 'fund-6']);
  assert.deepEqual(achievedNow({ fund: 500000 }, false), []);             // no spending figure, no months
  assert.deepEqual(achievedNow({}, false), []);                           // never had a loan: nothing cleared
  const loan = { label: { en: 'car loan', hi: 'कार लोन' }, balance: 400000, rate: 9, emi: 10000 };
  const seenLoan = checkMilestones(checkMilestones(EMPTY_PROFILE, {}), { loan });
  assert.equal(seenLoan.hadLoan, true);
  const cleared = checkMilestones(seenLoan, {});
  assert.deepEqual(unseenMilestones(cleared).map(m => m.id), ['loan-clear']);
});

test('every milestone has both languages and a unique id', () => {
  assert.equal(new Set(MILESTONES.map(m => m.id)).size, MILESTONES.length);
  for (const m of MILESTONES) { assert.ok(m.title.en && m.title.hi && m.body.en && m.body.hi); assert.equal(milestoneById(m.id), m); }
  assert.equal(milestoneById('nope'), undefined);
});

// ── seasons ───────────────────────────────────────────────────────────────────────────────────────────────────

test('seasons: Diwali week, Budget week and March year-end', () => {
  assert.deepEqual(DIWALI[2026], [11, 8]);
  assert.equal(seasonOf(at(2026, 11, 3)), SEASONS.diwali);                 // five days before
  assert.equal(seasonOf(at(2026, 11, 2)), null);
  assert.equal(seasonOf(at(2026, 11, 10)), SEASONS.diwali);                // two days after
  assert.equal(seasonOf(at(2026, 11, 11)), null);
  assert.equal(seasonOf(at(2027, 10, 29)), SEASONS.diwali);
  assert.equal(seasonOf(at(2027, 1, 29)), SEASONS.budget); assert.equal(seasonOf(at(2027, 2, 4)), SEASONS.budget);
  assert.equal(seasonOf(at(2027, 1, 28)), null); assert.equal(seasonOf(at(2027, 2, 5)), null);
  assert.equal(seasonOf(at(2027, 3, 14)), null); assert.equal(seasonOf(at(2027, 3, 15)), SEASONS.yearend); assert.equal(seasonOf(at(2027, 3, 31)), SEASONS.yearend);
  assert.equal(seasonOf(at(2026, 6, 10)), null);
  assert.equal(seasonOf(at(2035, 11, 8)), null);                           // beyond the listed Diwali dates the season just does not show
  for (const s of Object.values(SEASONS)) { assert.ok(s.label.en && s.label.hi && s.badge); assert.match(s.tint[0], /^#[0-9A-F]{6}$/i); assert.match(s.tint[1], /^#[0-9A-F]{6}$/i); }
});

// ── the money fact ────────────────────────────────────────────────────────────────────────────────────────────

test('money facts: both languages, no left-over gaps, no promise wording, and figures that match the maths', () => {
  assert.ok(FACTS.length >= 20);
  assert.equal(new Set(FACTS.map(f => f.id)).size, FACTS.length);
  const bad = /\b(risk[- ]free|sure[- ]?shot|can'?t lose|get rich|guaranteed (returns?|profit|income)|you (will|'ll) earn|you should (buy|invest in|sell)|buy this)\b/i;
  for (const f of FACTS) {
    assert.ok(f.text.en.length > 40 && f.text.en.length <= 300, f.id); assert.ok(f.text.hi.length > 40 && f.text.hi.length <= 360, f.id);
    assert.ok(!/[{}]/.test(f.text.en + f.text.hi), `${f.id} has an unfilled gap`);
    assert.ok(!bad.test(f.text.en) && !bad.test(f.text.hi), `${f.id} uses promise or advice wording`);
    assert.ok(/[ऀ-ॿ]/.test(f.text.hi), `${f.id} Hindi has no Devanagari`);
  }
  const by = (id: string) => FACTS.find(f => f.id === id)!;
  assert.ok(by('hundred-a-day').text.en.includes('₹36,500'));
  assert.ok(by('inflation-ten').text.en.includes(`₹${Math.round(inflatedValue(100, 6, 10))} would`)); assert.equal(Math.round(inflatedValue(100, 6, 10)), 56);
  const fv = money(sipFutureValue(5000, 12, 20)).en;
  assert.ok(by('sip-twenty').text.en.includes(fv) && by('sip-twenty').text.en.includes('₹12 lakh'), fv);
  for (const id of ['inflation-ten', 'sip-twenty']) assert.match(by(id).text.en, /assumed/);   // a projection always says it is assumed
});

test('the fact of the day is stable within a day and moves on the next', () => {
  assert.equal(factFor(at(2026, 10, 20)).id, factFor(new Date(2026, 9, 20, 23, 59)).id);
  assert.notEqual(factFor(at(2026, 10, 20)).id, factFor(at(2026, 10, 21)).id);
  const seen = new Set<string>(); for (let d = 0; d < FACTS.length; d++) seen.add(factFor(at(2026, 11, 1 + d)).id);
  assert.equal(seen.size, FACTS.length);                                   // it cycles through every fact
});

// ── Money date ────────────────────────────────────────────────────────────────────────────────────────────────

test('Money date: the closer guess wins, near-equal guesses tie', () => {
  const a = judgeTogether(110, 200, 100);
  assert.equal(a.closer, 0); assert.equal(a.first.verdict, 'spot'); assert.equal(a.second.verdict, 'far');
  assert.equal(judgeTogether(200, 110, 100).closer, 1);
  assert.equal(judgeTogether(95, 105, 100).closer, null);                  // 5% off each way is a tie
  assert.equal(judgeTogether(100, 100, 100).closer, null);
  assert.equal(judgeTogether(50, 150, 100).closer, 1);                     // 2x too low vs 1.5x too high: the higher guess is closer
  assert.ok(TIE_RATIO > 1 && TIE_RATIO < 1.2);
  assert.equal(judgeTogether(0, 120, 100).closer, null);                   // a missing guess never crowns anyone
});

test('Money date uses a reel\'s example figures and only reels whose guess beat is usable', () => {
  const withGuess = LIBRARY.filter(r => r.poke?.beat.kind === 'guess' && isBeatUsable(r));
  assert.ok(withGuess.length >= 2);
  for (const r of withGuess) { const t = togetherBeat(r.id); assert.ok(t, r.id); assert.equal(t!.reel, r); assert.equal(t!.reel.mine, undefined); }
  assert.equal(togetherBeat('myths-money'), null);                          // not a guess
  assert.equal(togetherBeat('no-such-reel'), null);
});

// ── counters ──────────────────────────────────────────────────────────────────────────────────────────────────

test('new counters: saves, pledges and together are counted and shown per 100 reels', () => {
  let st = EMPTY_STATS;
  for (let i = 0; i < 10; i++) st = bump(st, '2026-10-20', 'fin');
  st = bump(bump(bump(st, '2026-10-20', 'pledges'), '2026-10-20', 'pledges'), '2026-10-20', 'saves');
  st = bump(st, '2026-10-20', 'together');
  const h = healthOf(parseStats(JSON.stringify(st)), at(2026, 10, 21));
  assert.equal(h.pledgesPer100, 20);
  assert.equal(st.days['2026-10-20'].saves, 1); assert.equal(st.days['2026-10-20'].together, 1);
  assert.equal(healthOf(EMPTY_STATS, at(2026, 10, 21)).pledgesPer100, null);
});

// ── the screens are wired ─────────────────────────────────────────────────────────────────────────────────────

test('the player has the gestures and their accessible alternatives', () => {
  const p = read('components/reels/ReelPlayer.tsx');
  assert.match(p, /PanResponder\.create/); assert.match(p, /onLongPress/); assert.match(p, /doPledge/); assert.match(p, /doSave/);
  assert.match(p, /accessibilityActions=\{shelf \?/); for (const n of ["'save'", "'pledge'", "'steer'"]) assert.ok(p.includes(`name: ${n}`), n);
  assert.match(p, /onMoveShouldSetPanResponderCapture/);                   // only clearly sideways moves, so the feed still scrolls
  const r = read('app/learn/reels.tsx');
  assert.match(r, /key: 'saved'/); assert.match(r, /TogetherSheet/); assert.match(r, /j\.milestones\.find\(/); assert.match(r, /factFor/); assert.match(r, /seasonOf/);
  assert.ok(fs.existsSync(nodePath.join(process.cwd(), 'app/learn/moves.tsx')));
  assert.match(read('app/learn/index.tsx'), /\/learn\/moves/);
});

// ── the week, said gently ─────────────────────────────────────────────────────────────────────────────────────

test('the weekly recap adds up the last seven days only, and counts a day only when a reel was finished', () => {
  let st = EMPTY_STATS;
  const bumpN = (day: string, f: Parameters<typeof bump>[2], n: number) => { for (let i = 0; i < n; i++) st = bump(st, day, f); };
  bumpN('2026-10-20', 'fin', 3); bumpN('2026-10-20', 'pledges', 1);
  bumpN('2026-10-16', 'fin', 2); bumpN('2026-10-16', 'moves', 1); bumpN('2026-10-16', 'receipts', 1);
  bumpN('2026-10-13', 'fin', 4);                                            // seven days ago: outside the window (the seven days are 14 to 20 October)
  bumpN('2026-10-14', 'fin', 1);                                            // the first day of the window: inside
  bumpN('2026-10-18', 'saves', 2);                                          // saved but finished nothing: not an active day
  const w = weekOf(st, at(2026, 10, 20));
  assert.deepEqual(w, { days: 3, reels: 6, pledges: 1, moves: 1, receipts: 1, together: 0, saves: 2 });
  assert.equal(weekOf(st, at(2026, 10, 21)).reels, 5);                      // a day later the 14th drops out and the 16th and 20th stay in
  assert.equal(weekOf(EMPTY_STATS, at(2026, 10, 20)).reels, 0);
});

test('the weekly sentence: silent in a quiet week, plain counts otherwise, in both languages, never about what was missed', () => {
  assert.equal(weekLine({ days: 0, reels: 0, pledges: 2, moves: 1, receipts: 0, together: 0, saves: 0 }), null);
  const one = weekLine({ days: 1, reels: 1, pledges: 0, moves: 0, receipts: 0, together: 0, saves: 0 })!;
  assert.equal(one.en, 'This week: 1 reel on 1 day.');
  const many = weekLine({ days: 4, reels: 9, pledges: 2, moves: 1, receipts: 3, together: 1, saves: 0 })!;
  assert.equal(many.en, 'This week: 9 reels on 4 days, 2 moves on your list, 1 move started, 3 real changes noticed, 1 round played together.');
  assert.ok(/[\u0900-\u097F]/.test(many.hi) && many.hi.startsWith('इस हफ़्ते:') && many.hi.endsWith('।'));
  for (const t of [one, many]) assert.ok(!/\b(missed|lost|behind|only|fell|failed|streak)\b/i.test(t.en), t.en);
});

test('the reminder logic is shared: the feed and My moves both use the hook, and neither keeps its own copy', () => {
  const hook = read('hooks/useMoveReminder.ts');
  assert.match(hook, /addMoveReminder/); assert.match(hook, /requestPermission/);
  assert.match(read('app/learn/moves.tsx'), /useMoveReminder/);
  const feed = read('app/learn/reels.tsx');
  assert.match(feed, /useMoveReminder/); assert.ok(!/addMoveReminder/.test(feed));
  assert.match(read('app/learn/reels.tsx'), /weekLine/);
});

test('voice settings are reachable from the reel and a line can be heard again', () => {
  const feed = read('app/learn/reels.tsx');
  assert.match(feed, /onLongPress=\{\(\) => \{ stopSpeaking\(\); router\.push\('\/learn\/voice'/);
  assert.match(feed, /name: 'settings'/);                                  // the same door for a screen-reader user
  assert.ok(fs.existsSync(nodePath.join(process.cwd(), 'app/learn/voice.tsx')));
  const player = read('components/reels/ReelPlayer.tsx');
  assert.match(player, /onReplay=\{sound && playing \? voice\.replay : null\}/); assert.match(player, /Hear this line again/);
});

test('the feed marks a brought-back pledge, and personalisation knows about strain and income', () => {
  const feed = read('app/learn/reels.tsx');
  assert.match(feed, /pk\.why === 'pledge'\) markResurfaced\(pk\.reel\.id\)/);
  const hook = read('hooks/useReelsJourney.ts');
  assert.match(hook, /personalisePlay\(personaliseReels\(LIBRARY, mine, \{ strain, income \}\), mine, \{ strain, income \}\)/);
  assert.match(hook, /started: startedReelIds\(moves\)/);
});

// ── quiz order ────────────────────────────────────────────────────────────────────────────────────────────────

import { permutation, withScrambledQuiz } from '../lib/reels/quizorder.ts';

test('quiz order: deterministic, keeps every option, moves the answer with its option, spreads the right answer around the positions', () => {
  assert.deepEqual(permutation(4, 'abc'), permutation(4, 'abc'));
  assert.deepEqual([...permutation(5, 'x')].sort(), [0, 1, 2, 3, 4]);
  const pos = [0, 0, 0, 0];
  let moved = 0, kept = 0;
  for (const r of LIBRARY) {
    const s = withScrambledQuiz(r);
    assert.equal(s.quiz.options.length, r.quiz.options.length);
    assert.equal(s.quiz.options[s.quiz.answer].en, r.quiz.options[r.quiz.answer].en, `${r.id}: the answer follows its option`);
    assert.equal(s.quiz.options[s.quiz.answer].hi, r.quiz.options[r.quiz.answer].hi, r.id);
    assert.deepEqual(withScrambledQuiz(r).quiz, s.quiz, `${r.id}: same order every time`);
    assert.deepEqual(s.scenes, r.scenes); assert.equal(s.quiz.q, r.quiz.q); assert.equal(s.quiz.why, r.quiz.why);
    if (s === r) kept++; else { moved++; pos[s.quiz.answer]++; }
  }
  assert.ok(moved > LIBRARY.length * 0.9, `${kept} reels were left as written`);
  const share = pos[0] / moved;
  assert.ok(share < 0.5, `the right answer is still first in ${Math.round(share * 100)}% of reels`);
  assert.ok(pos[1] > 0 && pos[2] > 0);
});

test('quiz order: "all of these" stays where the author put it, and the feed applies the scramble once', () => {
  const r = LIBRARY[0];
  const odd = { ...r, quiz: { ...r.quiz, options: [{ en: 'A', hi: 'अ' }, { en: 'B', hi: 'ब' }, { en: 'All of the above', hi: 'ऊपर के सभी' }], answer: 2 } };
  assert.equal(withScrambledQuiz(odd), odd);
  const one = { ...r, quiz: { ...r.quiz, options: [{ en: 'A', hi: 'अ' }], answer: 0 } };
  assert.equal(withScrambledQuiz(one), one);
  assert.match(read('hooks/useReelsJourney.ts'), /\.map\(withScrambledQuiz\)/);
});

import { CAST_IDS } from '../lib/reels/cast.ts';
test('the web page writes every cast name in Hindi too (no Latin name left in Hindi mode)', () => {
  const js = fs.readFileSync(nodePath.join(process.cwd(), '..', 'js', 'reels.js'), 'utf8');
  const block = /const CAST_HI = \{([^}]+)\}/.exec(js);
  assert.ok(block, 'CAST_HI exists');
  for (const id of CAST_IDS) assert.match(block![1], new RegExp(`\\b${id}: '[\\u0900-\\u097F]+'`), `${id} has a Devanagari name`);
});
