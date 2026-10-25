// Small storage and consistency items from the integrity review: the watched/day records are written one at a time (no tick lost), the nudge hour
// follows the planner's 8:00 to 21:00 rule, and the local beat-voice hook in Poke no longer shares a name with hooks/useVoice.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadDays, loadWatched, recordDay, recordWatched, resetWatched } from '../lib/reelsStorage.ts';
import { EARLIEST_HOUR, LATEST_HOUR, NOTIFY_FROM_MIN, NOTIFY_TO_MIN, normaliseNudge, planAll, DEFAULT_NUDGE_HOUR, type PlannedNotice } from '../lib/reels/reminders.ts';
import { pick } from '../lib/reels/hi.ts';
import { dayKey } from '../lib/reels/journey.ts';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// ── no write lost ────────────────────────────────────────────────────────────────────────────────────────────

test('20 reels finished at once: every tick and every day is kept', async () => {
  await resetWatched();
  const ids = Array.from({ length: 20 }, (_, i) => `reel-${i}`);
  const days = Array.from({ length: 20 }, (_, i) => new Date(2026, 9, 1 + i, 10));
  await Promise.all(ids.map((id, i) => recordWatched(id, i % 2 === 0, days[i])));
  const w = await loadWatched();
  assert.deepEqual(Object.keys(w).sort(), [...ids].sort(), 'a reel tick was lost');
  for (let i = 0; i < 20; i++) assert.equal(w[ids[i]].correct, i % 2 === 0, ids[i]);
  assert.deepEqual(await loadDays(), days.map(dayKey).sort(), 'a day was lost');
  await resetWatched();
});

test('20 days recorded at once with recordDay: none is lost', async () => {
  await resetWatched();
  const days = Array.from({ length: 20 }, (_, i) => new Date(2026, 8, 1 + i, 9));
  await Promise.all(days.map(d => recordDay(d)));
  assert.deepEqual(await loadDays(), days.map(dayKey).sort());
  await resetWatched();
});

test('recordWatched and recordDay mixed, and a right answer is not turned wrong by a concurrent second watch', async () => {
  await resetWatched();
  const t = (d: number) => new Date(2026, 9, d, 8);
  const [a, b, c] = await Promise.all([recordWatched('guess-sip', true, t(1)), recordWatched('guess-sip', false, t(2)), recordDay(t(3))]);
  assert.ok(a['guess-sip'] && b['guess-sip'] && Array.isArray(c));
  assert.equal((await loadWatched())['guess-sip'].correct, true);
  assert.deepEqual(await loadDays(), [t(1), t(2), t(3)].map(dayKey).sort());
  await resetWatched();
});

test('a failed write does not jam the queue', async () => {
  await resetWatched();
  const real = AsyncStorage.setItem;
  (AsyncStorage as { setItem: unknown }).setItem = async () => { throw new Error('disk full'); };
  try { await recordWatched('x-one', true, new Date(2026, 9, 5, 9)); } finally { (AsyncStorage as { setItem: unknown }).setItem = real; }
  await recordWatched('x-two', true, new Date(2026, 9, 6, 9));
  assert.deepEqual(Object.keys(await loadWatched()), ['x-two']);
  await resetWatched();
});

test('the storage functions that read then write go through the queue', () => {
  const src = read('lib/reelsStorage.ts');
  for (const name of ['recordWatched', 'recordDay', 'resetWatched']) assert.match(src, new RegExp(`export const ${name} = .*serial\\(`), name);
});

// ── the nudge hour ───────────────────────────────────────────────────────────────────────────────────────────

test('the nudge hour rule is the planner\'s quiet-hours rule: 8:00 to 21:00, clamped on read', () => {
  assert.equal(EARLIEST_HOUR * 60, NOTIFY_FROM_MIN);
  assert.equal(LATEST_HOUR * 60, NOTIFY_TO_MIN);
  const hour = (h: unknown) => normaliseNudge({ enabled: true, hour: h }).hour;
  assert.equal(hour(7), 8, '7 can never be scheduled, so it is not offered back');
  assert.equal(hour(0), 8); assert.equal(hour(3), 8);
  assert.equal(hour(22), 21); assert.equal(hour(23), 21);
  for (const h of [8, 9, 12, 18, 20, 21]) assert.equal(hour(h), h);
  for (const bad of [undefined, null, '', 'abc', 7.5, NaN, true, {}, []]) assert.equal(hour(bad), DEFAULT_NUDGE_HOUR, String(bad));
});

test('every hour a person can have stored is actually scheduled by the planner', () => {
  const now = new Date(2026, 9, 25, 6, 0);
  for (let h = -2; h <= 26; h++) {
    const prefs = normaliseNudge({ enabled: true, hour: h });
    const plan = planAll(prefs, [], now, false, [{ en: 'Rule of 72', hi: '72 का नियम' }]) as PlannedNotice[];
    assert.ok(plan.length > 0, `hour ${h} was normalised to ${prefs.hour} and then never scheduled`);
    assert.equal(plan[0].at.getHours(), prefs.hour);
  }
});

// ── one voice hook, one Hindi helper ─────────────────────────────────────────────────────────────────────────

test('no two files in components/reels define a function named useVoice, and none shares the name with hooks/useVoice.ts', () => {
  const dir = path.join(ROOT, 'components/reels');
  const defs: Record<string, string[]> = {};
  for (const f of fs.readdirSync(dir).filter(n => /\.tsx?$/.test(n))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    if (/\bfunction\s+useVoice\b|\b(?:const|let)\s+useVoice\s*=/.test(src)) (defs.useVoice ??= []).push(f);
  }
  assert.deepEqual(defs.useVoice ?? [], [], 'rename the local hook (hooks/useVoice.ts owns the name)');
  assert.match(read('hooks/useVoice.ts'), /export function useVoice\(/);
  assert.match(read('components/reels/Poke.tsx'), /function useBeatVoice\(/);
});

test('Poke picks its Hindi wording through lib/reels/hi.ts only', () => {
  assert.equal(pick('en', 'Continue', 'आगे बढ़ें'), 'Continue');
  assert.equal(pick('hi', 'Continue', 'आगे बढ़ें'), 'आगे बढ़ें');
  const poke = read('components/reels/Poke.tsx');
  assert.match(poke, /import \{ pick \} from '@\/lib\/reels\/hi'/);
  assert.doesNotMatch(poke, /const hi = /);
  assert.doesNotMatch(poke, /\bhi\(lang,/);
  assert.doesNotMatch(poke, /lang === 'hi'/);
});
