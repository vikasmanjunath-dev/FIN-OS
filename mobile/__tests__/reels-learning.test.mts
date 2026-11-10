// Spaced review, the mixed recall session and the weekly money review: pure functions with known answers, plus wiring guards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import nodePath from 'node:path';
import { INTERVAL_DAYS, MAX_STAGE, dueAt, dueReels, isDue, nextStage, stageCounts, stageOf } from '../lib/reels/spaced.ts';
import { buildSession, dueCount } from '../lib/reels/recall.ts';
import { MAX_LEN, MAX_WEEKS, lastWeeksNext, parseWeekly, saveWeek } from '../lib/reels/weeklyReview.ts';
import { parseWatched } from '../lib/reelsStorage.ts';
import { LIBRARY } from '../lib/reels/library.ts';
import { rankReelsV2 } from '../lib/reels/ranker.ts';
import { deriveSignals } from '../lib/reels/signals.ts';
import { EMPTY_PROFILE } from '../lib/reels/reelsProfile.ts';
import { ALL_PART_KEYS } from '../lib/reels/transparency.ts';
import * as privacy from '../lib/privacy.ts';

const D = (n: number) => new Date(2026, 10, n, 9, 0, 0);
const at = (n: number) => D(n).toISOString();
const read = (p: string) => fs.readFileSync(nodePath.join(process.cwd(), p), 'utf8');

test('stages: a right answer steps up to 4, a miss starts again, older data maps sensibly', () => {
  assert.deepEqual([...INTERVAL_DAYS], [1, 3, 7, 21, 60]);
  assert.equal(nextStage(undefined, true), 0); assert.equal(nextStage(undefined, false), 0);
  let w = { at: at(1), correct: true, n: 0 }; const seen: number[] = [];
  for (let i = 0; i < 6; i++) { const n = nextStage(w, true); seen.push(n); w = { ...w, n }; }
  assert.deepEqual(seen, [1, 2, 3, 4, 4, 4]); assert.equal(MAX_STAGE, 4);
  assert.equal(nextStage({ at: at(1), correct: true, n: 3 }, false), 0);
  assert.equal(stageOf({ at: at(1), correct: true }), 2); assert.equal(stageOf({ at: at(1), correct: false }), 0);   // data from before stages
  assert.equal(stageOf({ at: at(1), correct: true, n: 99 }), 2);
});

test('due dates follow the stage; the most overdue come first; ties are stable', () => {
  const w = { a: { at: at(1), correct: true, n: 1 }, b: { at: at(1), correct: false, n: 0 }, c: { at: at(1), correct: true, n: 3 }, d: { at: at(8), correct: true, n: 0 } };
  assert.equal(dueAt(w.a).getTime(), D(4).getTime());                                          // 3 days
  assert.equal(isDue(w.a, D(3)), false); assert.equal(isDue(w.a, D(4)), true);
  assert.equal(isDue(w.c, D(21)), false); assert.equal(isDue(w.c, D(22)), true);                // 21 days
  const list = dueReels(w, D(10));
  assert.deepEqual(list.map(x => x.id), ['b', 'a', 'd']);                                       // b 8 days late, a 6, d 1
  assert.deepEqual(list.map(x => x.overdueDays), [8, 6, 1]);
  assert.deepEqual(stageCounts(w), [2, 1, 0, 1, 0]);
});

test('older stored data is kept and a bad stage is dropped when read back', () => {
  const p = parseWatched(JSON.stringify({ 'guess-sip': { at: at(1), correct: true, n: 3 }, 'delay-cost': { at: at(1), correct: true, n: 9 }, 'emi-trap': { at: at(1), correct: false } }));
  assert.equal(p['guess-sip'].n, 3); assert.equal(p['delay-cost'].n, undefined); assert.equal(p['emi-trap'].n, undefined);
});

test('the ranker offers a refresher only when it is due by stage, and still puts a missed question first', () => {
  const sig = deriveSignals({ now: D(10) });
  const reels = LIBRARY.slice(0, 40), id = reels[3].id;
  const rank = (watched: Record<string, { at: string; correct: boolean; n?: number }>, day: number) => rankReelsV2(reels, { watched, signals: { ...sig, now: D(day) }, profile: EMPTY_PROFILE, now: D(day) }).find(r => r.reel.id === id)!;
  assert.equal(rank({ [id]: { at: at(1), correct: true, n: 3 } }, 10).why, 'done');          // stage 3: due after 21 days
  assert.equal(rank({ [id]: { at: at(1), correct: true, n: 3 } }, 23).why, 'refresh');
  assert.equal(rank({ [id]: { at: at(1), correct: true, n: 1 } }, 5).why, 'refresh');         // stage 1: due after 3 days
  assert.equal(rank({ [id]: { at: at(1), correct: false, n: 0 } }, 3).why, 'review');
});

test('a recall session: due reels only, different topics in turn, bounded, stable, "I know this" left out', () => {
  const topics = [...new Set(LIBRARY.map(r => r.topic))];
  const pick = topics.flatMap(t => LIBRARY.filter(r => r.topic === t).slice(0, 2));          // two reels from every topic
  const watched = Object.fromEntries(pick.map(r => [r.id, { at: at(1), correct: true, n: 0 }]));
  const s = buildSession(watched, LIBRARY, D(10));
  assert.equal(s.length, 5);
  for (let i = 1; i < s.length; i++) assert.notEqual(s[i].topic, s[i - 1].topic, 'no two in a row from one topic');
  assert.deepEqual(buildSession(watched, LIBRARY, D(10)).map(r => r.id), s.map(r => r.id));
  assert.deepEqual(buildSession(watched, LIBRARY, D(1)), [], 'nothing is due yet');
  assert.ok(!buildSession(watched, LIBRARY, D(10), 5, [s[0].id]).some(r => r.id === s[0].id));
  assert.equal(dueCount(watched, LIBRARY, D(10)), pick.length);
  assert.equal(buildSession({ nope: { at: at(1), correct: true } }, LIBRARY, D(10)).length, 0);   // a reel no longer in the library is skipped
});

test('weekly review: parse is safe, one entry a week, last eight kept, empty removes, last week\'s move is found', () => {
  assert.deepEqual(parseWeekly('garbage'), {}); assert.deepEqual(parseWeekly(JSON.stringify({ 'x': { win: 'a' }, '2026-W44': 5 })), {});
  let all = saveWeek({}, D(2), { win: ' a  win ', gap: '', next: 'x'.repeat(500) });
  const k = Object.keys(all)[0];
  assert.match(k, /^\d{4}-W\d{2}$/); assert.equal(all[k].win, 'a win'); assert.equal(all[k].next.length, MAX_LEN);
  assert.equal(Object.keys(saveWeek(all, D(2), { win: '', gap: '', next: '' })).length, 0);
  for (let i = 0; i < 12; i++) all = saveWeek(all, new Date(2026, 0, 5 + 7 * i), { win: `w${i}`, gap: '', next: `n${i}` });
  assert.equal(Object.keys(all).length, MAX_WEEKS);
  const keys = Object.keys(all).sort();
  assert.equal(lastWeeksNext(all, new Date(2026, 0, 5 + 7 * 11)), 'n10');
  assert.equal(lastWeeksNext({}, D(10)), null);
  assert.deepEqual(parseWeekly(JSON.stringify(all)), all); assert.equal(keys.length, MAX_WEEKS);
});

test('wiring: screens exist and are linked, the new key is in the privacy registry and in the transparency screen, Hindi is present', () => {
  for (const f of ['app/learn/review.tsx', 'app/learn/weekly.tsx', 'lib/reelsWeeklyStorage.ts']) assert.ok(fs.existsSync(nodePath.join(process.cwd(), f)), f);
  const idx = read('app/learn/index.tsx'); assert.match(idx, /\/learn\/review/); assert.match(idx, /\/learn\/weekly/);
  assert.ok(ALL_PART_KEYS.includes('finos_session_reels_weekly'));
  assert.ok((privacy as unknown as { REGISTRY?: { key: string }[] }).REGISTRY?.some(e => e.key === 'finos_session_reels_weekly') ?? read('lib/privacy.ts').includes("'finos_session_reels_weekly'"));
  assert.match(read('lib/reelsStorage.ts'), /n: nextStage\(all\[id\], correct\)/);
});

import { homeCard } from '../lib/reels/homecard.ts';
test('the Home card says how many questions are due, in both languages, and nothing when none are', () => {
  const base = { anchor: null, finished: 0, size: 3, streak: 0, resting: false, everDone: true, pledges: 0, celebrate: null, strain: false };
  assert.equal(homeCard(base, D(10)).review, null);
  assert.equal(homeCard({ ...base, due: 0 }, D(10)).review, null);
  assert.deepEqual(homeCard({ ...base, due: 1 }, D(10)).review, { en: '1 question to review', hi: 'दोहराने को 1 सवाल' });
  assert.equal(homeCard({ ...base, due: 4 }, D(10)).review?.en, '4 questions to review');
  assert.match(read('components/ReelsHomeCard.tsx'), /open\('\/learn\/review'\)/);
});

test('Reels health shows how many reels sit at each review stage', () => {
  const h = read('app/learn/health.tsx');
  assert.match(h, /stageCounts\(watched\)/); assert.match(h, /loadWatched\(\)/); assert.match(h, /दोहराव के चरण/);
});

import { DEFAULT_VOICE_PREFS, parseVoicePrefs } from '../lib/reels/voicePrefs.ts';
test('voice source: recorded by default, phone voice only when chosen, junk ignored; the clip player respects it', () => {
  assert.equal(DEFAULT_VOICE_PREFS.source, 'recorded');
  assert.equal(parseVoicePrefs(JSON.stringify({ source: 'phone' })).source, 'phone');
  assert.equal(parseVoicePrefs(JSON.stringify({ source: 'x' })).source, 'recorded');
  assert.equal(parseVoicePrefs('garbage').source, 'recorded');
  assert.equal(parseVoicePrefs(JSON.stringify({ speed: 1.1, style: 'steady', pauses: 'long', voice: { en: 'A' } })).speed, 1.1);   // older saved settings still read
  assert.match(read('lib/reels/clipplayer.ts'), /currentVoicePrefs\(\)\.source !== 'phone'/);
  const v = read('app/learn/voice.tsx'); assert.match(v, /VOICE SOURCE/); assert.match(v, /आवाज़ का स्रोत/);
});

test('Quick review asks for the answer in the person\'s own words before showing the reel\'s reason, and keeps nothing', () => {
  const r = read('app/learn/review.tsx');
  assert.match(r, /IN YOUR OWN WORDS/); assert.match(r, /Skip and see the reason/); assert.match(r, /THE REEL SAYS/);
  assert.ok(!/AsyncStorage|setItem|saveWeekly|record.*mine/.test(r.replace(/recordWatched|recordStat/g, '')), 'the written line is never stored');
  assert.match(r, /\{shown \? <TouchableOpacity/);                            // Next appears only after the reason has been shown
});
