// Cross-slice integrity for Money Reels: bugs found in the review of everything the parallel sessions built (docs/REELS-INTEGRITY.md), each with a test that
// fails if it comes back, plus guards for the places where two copies of the same rule can drift apart (day keys, the website's streak, import cycles).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LIBRARY } from '../lib/reels/library.ts';
import { ASK_ARYA_HINT, PREFILL_NOTE_MINE, USE_MY_NUMBERS_HINT } from '../lib/reels/aryaLink.ts';
import { EMPTY_PROFILE } from '../lib/reels/reelsProfile.ts';
import { rankReelsV2 } from '../lib/reels/ranker.ts';
import { deriveSignals } from '../lib/reels/signals.ts';
import { buildStart, firstEpisode, todaysEpisode } from '../lib/reels/coldstart.ts';
import { composeEpisode } from '../lib/reels/episode.ts';
import { NOTIFY_KEY, NUDGE_KEY, loadNotify, loadNudge, syncReelReminders, turnAllReelNoticesOff } from '../lib/reelRemindersStorage.ts';
import { createClock, frameIndex } from '../lib/reels/frame.ts';
import { countAnswer, bump, EMPTY_STATS, healthOf } from '../lib/reels/stats.ts';
import { recordStat, loadStats, clearStats } from '../lib/reelsStatsStorage.ts';
import { ID_PREFIX, NUDGE_PLAIN_BODY, planNudges, unfitForLockScreen } from '../lib/reels/reminders.ts';
import { isGrowthMilestone, MILESTONES } from '../lib/reels/milestones.ts';
import { isGrowthReceipt } from '../lib/reels/moves.ts';
import { personaliseReels } from '../lib/reels/personal.ts';
import { dayKey } from '../lib/reels/journey.ts';
import { forgivingStreak } from '../lib/reels/streak.ts';
import { weekOf } from '../lib/reels/weekly.ts';
import { parseReelsProfile } from '../lib/reels/reelsProfile.ts';
import { parseMoves } from '../lib/reels/moves.ts';
import { parseStats } from '../lib/reels/stats.ts';
import { parseChallenges } from '../lib/reels/challenges.ts';
import { normaliseMoves, normaliseNotify, normaliseNudge } from '../lib/reels/reminders.ts';
import { parseDays, parseWatched } from '../lib/reelsStorage.ts';
import type { L } from '../lib/reels/types.ts';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// ── the player ───────────────────────────────────────────────────────────────────────────────────────────────────

test('the clock tells the player the reel is over even when the last tick stays inside the last frame', () => {
  // The player's loop sets the clock to min(total, t) on every tick. A set that stays in the same frame is silent, so a reel whose length is not a multiple
  // of 100 ms could stop at its end and never show the question. Reaching the end is therefore a "discrete" set, which always notifies.
  for (const total of [1010, 23_507, 31_999]) {
    for (const dt of [16, 17, 33, 34, 40, 120]) {
      const clock = createClock();
      let calls = 0; clock.subscribe(() => { calls++; });
      let t = 0, atEnd = false;
      while (!atEnd) { t += dt; const next = Math.min(total, t); atEnd = t >= total; const before = calls; clock.set(next, t >= total); if (atEnd) assert.ok(calls > before, `total ${total} dt ${dt}: no notice at the end`); }
      assert.equal(clock.get(), total);
    }
  }
  assert.ok(frameIndex(1010 - 3) === frameIndex(1010), 'the case the fix is for: the last tick shares its frame with the end');
  assert.match(read('components/reels/ReelPlayer.tsx'), /clock\.set\(Math\.min\(total, r\.t\), r\.t >= total\)/);
});

test('every reel in the library, silent or with the voice, ends on a whole 100 ms (so the end was never stuck in practice)', () => {
  for (const r of LIBRARY) assert.equal(r.scenes.reduce((n, s) => n + s.ms, 0) % 100, 0, r.id);
});

// ── stats ────────────────────────────────────────────────────────────────────────────────────────────────────────

test('a reel is counted once a visit: "Watch again" and answering again add nothing, and a wrong first answer stays wrong', () => {
  const seen = new Set<string>();
  assert.deepEqual(countAnswer(seen, 'a', false), ['fin']);
  assert.deepEqual(countAnswer(seen, 'a', true), []);                            // the replay
  assert.deepEqual(countAnswer(seen, 'a', true), []);
  assert.deepEqual(countAnswer(seen, 'b', true), ['fin', 'right']);
  assert.deepEqual(countAnswer(seen, 'c', false), ['fin']);
  const s = read('app/learn/reels.tsx');
  assert.match(s, /countAnswer\(answeredIds\.current, rid, correct\)/);
  assert.doesNotMatch(s, /recordStat\('fin'\)/, 'the feed must count finishes through countAnswer');
});

test('the four copies of the day key agree, also across midnight and the new year', async () => {
  const instants = [new Date(2026, 11, 31, 23, 59, 59, 999), new Date(2027, 0, 1, 0, 0, 0, 0), new Date(2026, 2, 29, 0, 0, 0), new Date(2026, 9, 25, 12, 0, 0), new Date(2028, 1, 29, 23, 59)];
  for (const now of instants) {
    const key = dayKey(now);
    await clearStats();
    await recordStat('fin', 1, now);                                             // reelsStatsStorage's own key
    assert.deepEqual(Object.keys((await loadStats()).days), [key], `recordStat at ${now.toISOString()}`);
    const st = bump(EMPTY_STATS, key, 'fin');                                    // read back through weekly.ts and stats.ts, which keep their own copies
    assert.equal(weekOf(st, now).reels, 1, `weekOf at ${now.toISOString()}`);
    assert.equal(healthOf(st, now).finished, 1, `healthOf at ${now.toISOString()}`);
    const next = new Date(now.getTime() + 86_400_000);
    assert.equal(weekOf(st, next).reels, 1, 'still inside the seven days tomorrow');
  }
  await clearStats();
});

// ── lock-screen text ─────────────────────────────────────────────────────────────────────────────────────────────

test('the daily nudge never puts an amount, a percentage or a frightening word on the lock screen, whichever lesson is next', () => {
  const now = new Date(2026, 9, 24, 9, 0);
  let plain = 0;
  for (const lang of ['en', 'hi'] as const) {
    for (const r of LIBRARY) {
      const [n] = planNudges({ enabled: true, hour: 18 }, now, false, [r.title], lang);
      assert.ok(n, r.id);
      assert.ok(!unfitForLockScreen({ en: n.body, hi: n.body }), `${r.id} (${lang}): ${n.body}`);
      if (n.body === NUDGE_PLAIN_BODY[lang]) plain++;
    }
  }
  assert.ok(plain > 0, 'some titles carry an amount, a percentage or a frightening word and use the plain line');
  assert.ok(plain < LIBRARY.length * 2 * 0.5, 'most titles are still shown as they are');
  const fine: L = { en: 'Rule of 72', hi: '72 का नियम' };
  assert.equal(planNudges({ enabled: true, hour: 18 }, now, false, [fine], 'en')[0].body, 'Rule of 72');
  assert.match(NUDGE_PLAIN_BODY.hi, /[ऀ-ॿ]/);
});

// ── distress guard in the new paths ──────────────────────────────────────────────────────────────────────────────

test('a SIP celebration is "growth" in the feed and on Home alike, and both honour it', () => {
  assert.equal(isGrowthMilestone('first-sip'), true);
  for (const m of MILESTONES) if (m.id !== 'first-sip') assert.equal(isGrowthMilestone(m.id), false, m.id);
  assert.equal(isGrowthReceipt({ metric: 'sip' }), true);
  assert.equal(isGrowthReceipt({ metric: 'fund' }), false);
  assert.equal(isGrowthReceipt({ metric: 'loan' }), false);
  const feed = read('app/learn/reels.tsx'), home = read('components/ReelsHomeCard.tsx');
  assert.match(feed, /j\.signals\.strain && isGrowthReceipt\(r\.receipt\)/);
  assert.match(feed, /j\.signals\.strain && isGrowthMilestone\(m\.id\)/);
  assert.doesNotMatch(feed, /j\.receipts\[0\]|j\.milestones\[0\]/, 'the banners must use the filtered pick');
  assert.match(home, /isGrowthReceipt\(r\.receipt\)/);
  assert.match(home, /isGrowthMilestone\(m\.id\)/);
});

test('the journey hook gives the strain context to every personalising call, so start-early keeps its example for a person under strain', () => {
  const hook = read('hooks/useReelsJourney.ts');
  assert.match(hook, /personaliseReels\(LIBRARY, mine, \{ strain, income \}\)/);
  assert.match(hook, /personalisePlay\(personaliseReels\(LIBRARY, mine, \{ strain, income \}\), mine, \{ strain, income \}\)/);
  const mine = { sip: 10_000 };
  const strained = personaliseReels(LIBRARY, mine, { strain: true, income: 40_000 }).find(r => r.id === 'start-early');
  assert.equal(strained, LIBRARY.find(r => r.id === 'start-early'), 'the very same example reel');
  assert.equal(personaliseReels(LIBRARY, mine, { strain: false, income: 40_000 }).find(r => r.id === 'start-early')?.mine, true);
});

// ── notices that depend on the profile ───────────────────────────────────────────────────────────────────────────

test('removing a pledge, marking a reel known or starting a move re-plans the notices now, not at the next app start', () => {
  const hook = read('hooks/useReelsJourney.ts');
  assert.match(hook, /commit\(addKnown\(profRef\.current, id\), true\)/);
  assert.match(hook, /commit\(removePledge\(profRef\.current, id\), true\)/);
  assert.match(hook, /commit\(next, true\); recordStat\('pledges'\)/);
  assert.match(hook, /saveMoves\(next\)\.then\(replan\)/);
  assert.match(hook, /syncReelReminders\(\)\.catch/);
  const t = read('lib/reels/transparencyStorage.ts');
  assert.match(t, /REPLAN_AFTER: PartId\[\] = \['pledges', 'known', 'moves'\]/);
  assert.match(t, /syncReelReminders\(\)\.catch/);
});

test('a reload that began before an edit never writes older data over it', () => {
  const hook = read('hooks/useReelsJourney.ts');
  assert.match(hook, /const edits = useRef\(0\)/);
  assert.match(hook, /edits\.current\+\+/);
  assert.match(hook, /const p = edits\.current === seen \? p0 : profRef\.current/);
});

// ── the website's copy of the streak ─────────────────────────────────────────────────────────────────────────────

test('the website\'s streak (js/reels.js) is the app\'s forgiving streak, on 400 made-up histories', () => {
  const src = fs.readFileSync(path.join(ROOT, '..', 'js', 'reels.js'), 'utf8');
  const grab = (re: RegExp) => { const m = re.exec(src); assert.ok(m, `not found: ${re}`); return m![0]; };
  const code = [
    grab(/const dayNum = [^\n]+/), grab(/function runBack\(active, from\) \{[\s\S]*?\n  \}\n/), grab(/function streakNow\(days, today\) \{[\s\S]*?\n  \}\n/),
  ].join('\n');
  const web = new Function(`${code}; return streakNow;`)() as (days: string[], today: string) => number;
  let seed = 11; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const today = '2026-10-24';
  for (let i = 0; i < 400; i++) {
    const days: string[] = [];
    for (let k = 0; k < 60; k++) if (rnd() < (i % 5 === 0 ? 0.95 : i % 5 === 1 ? 0.5 : 0.8)) days.push(dayKey(new Date(2026, 9, 24 - k)));
    assert.equal(web(days, today), forgivingStreak(days, today).streak, JSON.stringify(days));
  }
  assert.equal(web([], today), 0);
});

// ── stored shapes ────────────────────────────────────────────────────────────────────────────────────────────────

test('every reels parser survives unreadable, odd and hostile stored values without throwing', () => {
  let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const keys = ['v', 'known', 'less', 'saved', 'pledges', 'ms', 'msSeen', 'start', 'goals', 'level', 'at', 'id', 'days', 'runs', 'open', 'receipts', 'fu', 'followups', 'weekly', 'armed', 'fmt', 'shown', 'engaged', 'tips', 'hadLoan', 'blindWeek', 'done', 'hour', 'enabled', 'rs', 'rn', 'metric', 'before', 'after', 'fin'];
  const junk = (d = 0): unknown => {
    const r = rnd();
    if (d > 3) return r; if (r < .1) return null; if (r < .2) return 'x'.repeat(Math.floor(rnd() * 50)); if (r < .3) return Math.floor(rnd() * 1e6) - 5e5; if (r < .35) return NaN; if (r < .4) return Infinity;
    if (r < .45) return true; if (r < .6) return Array.from({ length: Math.floor(rnd() * 4) }, () => junk(d + 1));
    return Object.fromEntries(keys.filter(() => rnd() < .3).map(k => [k, junk(d + 1)]));
  };
  const parsers: [string, (s: string) => unknown][] = [['profile', parseReelsProfile], ['moves', parseMoves], ['stats', parseStats], ['challenges', parseChallenges], ['watched', parseWatched], ['days', parseDays]];
  for (let i = 0; i < 400; i++) {
    const raw = JSON.stringify(junk()) ?? 'null';
    for (const [name, f] of parsers) assert.doesNotThrow(() => f(raw), `${name}: ${raw.slice(0, 120)}`);
    const v = junk();
    assert.doesNotThrow(() => { normaliseNotify(v); normaliseNudge(v); normaliseMoves(v); });
    for (const [name, f] of parsers.slice(0, 1)) { const once = f(raw); assert.deepEqual(f(JSON.stringify(once)), once, `${name} is stable when read twice`); }
  }
  for (const bad of ['', '{', 'null', '[]', '"x"', '12', 'undefined']) for (const [, f] of parsers) assert.doesNotThrow(() => f(bad));
});

// ── packaging ────────────────────────────────────────────────────────────────────────────────────────────────────

test('no import cycle among the app\'s files, and no app file imports a Node module or anything under scripts/', () => {
  const dirs = ['lib', 'components', 'hooks', 'app', 'constants'];
  const files: string[] = [];
  const walk = (d: string) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) { if (f.name !== 'node_modules') walk(p); } else if (/\.(ts|tsx)$/.test(f.name)) files.push(p); } };
  dirs.forEach(d => walk(path.join(ROOT, d)));
  const resolve = (spec: string, from: string): string | null => {
    const base = spec.startsWith('@/') ? path.join(ROOT, spec.slice(2)) : spec.startsWith('.') ? path.resolve(path.dirname(from), spec) : null;
    if (!base) return null;
    for (const e of ['.ts', '.tsx', '/index.ts', '/index.tsx']) if (fs.existsSync(base + e) && fs.statSync(base + e).isFile()) return base + e;
    return null;
  };
  const graph = new Map<string, Set<string>>(), offenders: string[] = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8'), deps = new Set<string>();
    for (const m of src.matchAll(/^\s*(?:import|export)\s+(type\s+)?[^;]*?from\s+['"]([^'"]+)['"]/gm)) { if (m[1]) continue; const r = resolve(m[2], f); if (r) deps.add(r); }
    graph.set(f, deps);
    for (const m of src.matchAll(/(?:from|require\()\s*['"]([^'"]+)['"]/g)) if (/^(node:|fs$|path$|child_process$|zlib$|os$)/.test(m[1]) || /(^|\/)scripts\//.test(m[1])) offenders.push(`${path.relative(ROOT, f)} -> ${m[1]}`);
  }
  assert.deepEqual(offenders, []);
  const state = new Map<string, 1 | 2>(), stack: string[] = [], cycles: string[] = [];
  const visit = (v: string) => {
    state.set(v, 1); stack.push(v);
    for (const w of graph.get(v) ?? []) { if (state.get(w) === 1) cycles.push([...stack.slice(stack.indexOf(w)), w].map(x => path.relative(ROOT, x)).join(' -> ')); else if (!state.has(w)) visit(w); }
    stack.pop(); state.set(v, 2);
  };
  for (const v of graph.keys()) if (!state.has(v)) visit(v);
  assert.deepEqual(cycles, []);
});

// ── erase ────────────────────────────────────────────────────────────────────────────────────────────────────────

test('"Delete everything on this phone" also cancels the reels\' scheduled notices (their ids do not start with the calendar reminders\' prefix)', () => {
  const cal = /const PREFIX = '([^']+)'/.exec(read('lib/remindersNative.ts'))![1];
  assert.equal(ID_PREFIX.startsWith(cal), false, 'the calendar reminders\' cancelAll cannot reach the reels\' notices, so erase must cancel them itself');
  const erase = read('lib/eraseDeps.ts');
  assert.match(erase, /import \{ cancelReelNotices \} from '@\/lib\/reels\/reminders-native'/);
  assert.match(erase, /async function cancelNotifications\(\) \{[\s\S]*?await cancelReelNotices\(\);/);
});

test('the reminders sheet writes only its two switches: the planner\'s follow-up record is read fresh, never overwritten from the sheet\'s older copy', () => {
  const sheet = read('components/reels/ReminderSheets.tsx');
  assert.match(sheet, /const fresh = await loadNotify\(\)\.catch\(\(\) => notify\);/);
  assert.match(sheet, /const merged: NotifyPrefs = \{ \.\.\.fresh, followups: next\.followups, weekly: next\.weekly \};/);
  assert.match(sheet, /saveNotify\(merged\)/);
  assert.doesNotMatch(sheet, /saveNotify\(next\)/);
});

test('"Turn all reminders off" beside a re-plan: the re-plan never writes the older choices back, whichever starts first', async () => {
  for (const order of ['sync-first', 'off-first'] as const) {
    await AsyncStorage.setItem(NUDGE_KEY, JSON.stringify({ enabled: true, hour: 18 }));
    await AsyncStorage.removeItem(NOTIFY_KEY);
    const run = order === 'sync-first' ? [syncReelReminders(), turnAllReelNoticesOff()] : [turnAllReelNoticesOff(), syncReelReminders()];
    await Promise.all(run);
    const nudge = await loadNudge(), notify = await loadNotify();
    assert.equal(nudge.enabled, false, order);
    assert.equal(notify.followups, false, `${order}: follow-ups were turned back on by a stale write`);
    assert.equal(notify.weekly, false, order);
  }
  const src = read('lib/reelRemindersStorage.ts');
  for (const name of ['syncReelReminders', 'turnAllReelNoticesOff', 'resetReelReminders', 'addMoveReminder']) assert.match(src, new RegExp(`export const ${name} = .*serial\\(`), name);
});

test('the feed, the Home card and "why today\'s first reel" name the same first reel: one function decides today\'s episode', () => {
  const now = new Date(2026, 9, 24, 10, 0);
  const signals = deriveSignals({ now });
  const ids = (e: { picks: { reel: { id: string } }[] }) => e.picks.map(p => p.reel.id);
  // a brand-new person with the welcome's answers: the two-reel first episode, not the ranker's top three
  const fresh = rankReelsV2(LIBRARY, { watched: {}, signals, profile: EMPTY_PROFILE, now });
  const start = buildStart('scams', 'new', now);
  assert.deepEqual(ids(todaysEpisode(fresh, {}, now, { start })), ids(firstEpisode(fresh, start, { now, finished: 0 })));
  assert.equal(todaysEpisode(fresh, {}, now, { start }).picks.length, 2);
  // someone who finished a reel yesterday: the ordinary episode
  const watched = { [LIBRARY[0].id]: { at: new Date(2026, 9, 23, 20, 0).toISOString(), correct: true } };
  const ranked = rankReelsV2(LIBRARY, { watched, signals, profile: EMPTY_PROFILE, now });
  assert.deepEqual(ids(todaysEpisode(ranked, watched, now, {})), ids(composeEpisode(ranked, 3, null)));
  // and the places that name "the first reel" use it
  assert.match(read('app/learn/reels.tsx'), /todaysEpisode\(j\.ranked, j\.watched, now,/);
  assert.match(read('components/ReelsHomeCard.tsx'), /todaysEpisode\(j\.ranked, j\.watched, now,/);
  assert.match(read('app/learn/reels-data.tsx'), /todaysEpisode\(ranked, watched, now,/);
  assert.doesNotMatch(read('components/ReelsHomeCard.tsx'), /composeEpisode/);
});

test('the words around "Ask Arya with my numbers" do not promise that nothing is sent: pressing send does share the message, online if Arya is set to answer online', () => {
  for (const l of [ASK_ARYA_HINT, USE_MY_NUMBERS_HINT, PREFILL_NOTE_MINE]) {
    assert.doesNotMatch(l.en, /not sent anywhere|nothing leaves your phone|never leave/i, l.en);
    assert.match(l.en, /\bsend\b/i, l.en);
    assert.match(l.hi, /भेज/, l.hi);
  }
  assert.match(USE_MY_NUMBERS_HINT.en, /online/i);
  assert.match(PREFILL_NOTE_MINE.en, /online/i);
});

test('every reels screen a person can open from Learn can be found by search', () => {
  const search = read('lib/search.ts');
  for (const route of ['/learn/reels', '/learn/voice', '/learn/map', '/learn/series', '/learn/moves', '/learn/challenges', '/learn/reels-data']) assert.ok(search.includes(`e('${route}'`), `${route} is not in the search index`);
});
