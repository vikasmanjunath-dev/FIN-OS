// Control and transparency for the Money Reels: the plain-words summary of what the reels keep (empty and rich), that every stored reels key in
// the privacy registry is shown, that each reset removes exactly its part, Hindi for every string, and the one-sentence reason for every `why`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import nodePath from 'node:path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as privacy from '../lib/privacy.ts';
import { LIBRARY, libraryById } from '../lib/reels/library.ts';
import { EMPTY_PROFILE, forgetStart, forgetHousekeeping, forgetKnown, forgetLess, forgetMilestones, forgetPlay, forgetPledges, forgetSaved, pokeFit, type ReelsProfile } from '../lib/reels/reelsProfile.ts';
import { EMPTY_MOVES, startMove, type MovesState } from '../lib/reels/moves.ts';
import { EMPTY_STATS, bump } from '../lib/reels/stats.ts';
import { EMPTY_CHALLENGES, completeToday, startChallenge } from '../lib/reels/challenges.ts';
import { DEFAULT_NOTIFY, DEFAULT_NUDGE } from '../lib/reels/reminders.ts';
import { DEFAULT_VOICE_PREFS } from '../lib/reels/voicePrefs.ts';
import { PILLARS, deriveSignals } from '../lib/reels/signals.ts';
import { rankReelsV2 } from '../lib/reels/ranker.ts';
import type { Ranked } from '../lib/reels/journey.ts';
import { ALL_PART_KEYS, KEPT_NOTE, MAX_LINES, PART_IDS, PART_KEYS, SYNCED_KEYS, TEXT, WHY_VALUES, figuresUsed, playStyle, summariseReels, whyThisReel, type Part, type ReelsKnowledge } from '../lib/reels/transparency.ts';
import { loadKnowledge, resetAllReels, resetPart } from '../lib/reels/transparencyStorage.ts';
import { REELS_PROFILE_KEY, REELS_MOVES_KEY, saveMoves, saveReelsProfile } from '../lib/reelsProfileStorage.ts';
import { STATS_KEY } from '../lib/reelsStatsStorage.ts';
import { CHALLENGES_KEY, saveChallenges } from '../lib/reelsChallengesStorage.ts';
import { MOVE_REMINDERS_KEY, NOTIFY_KEY, NUDGE_KEY, saveMoveReminders, saveNotify, saveNudge } from '../lib/reelRemindersStorage.ts';
import { REELS_DAYS_KEY, REELS_KEY } from '../lib/reelsStorage.ts';
import { VOICE_PREFS_KEY } from '../lib/reels/voicePrefs.ts';
import { saveVoicePrefs } from '../lib/reels/voicePrefsStorage.ts';

const NOW = new Date(2026, 9, 19, 9, 0, 0);                         // an ordinary Monday: no season
const root = nodePath.resolve(import.meta.dirname, '..');
const DEVANAGARI = /[ऀ-ॿ]/;

const EMPTY: ReelsKnowledge = {
  profile: { ...EMPTY_PROFILE, known: [], less: {} }, moves: EMPTY_MOVES, stats: EMPTY_STATS, challenges: EMPTY_CHALLENGES, watched: {}, days: [],
  nudge: DEFAULT_NUDGE, notify: DEFAULT_NOTIFY, moveReminders: [], voice: DEFAULT_VOICE_PREFS, mine: {},
};

const title = (id: string) => libraryById(id)!.title;
const MINE = { sip: 15_000, spend: 40_000, fund: 120_000 };
function rich(): ReelsKnowledge {
  const profile: ReelsProfile = {
    v: 1, known: ['emergency-fund', 'cash-flow'], less: { loans: 2, tax: 1 }, saved: ['tax-regimes', 'section-80c'],
    pledges: [{ id: 'start-early', at: '2026-10-10T09:00:00.000Z' }, { id: 'emergency-fund', at: '2026-10-11T09:00:00.000Z' }, { id: 'cash-flow', at: '2026-10-12T09:00:00.000Z' }],
    ms: ['first-sip'], msSeen: ['first-sip'], hadLoan: true, start: { goals: ['loans', 'tax'], level: 'some', at: '2026-10-09T09:00:00.000Z' }, fmt: { shown: 10, engaged: 8 }, tips: 2, blindWeek: '2026-W42',
  };
  let moves: MovesState = startMove(EMPTY_MOVES, 'start-early', MINE, new Date(2026, 9, 12));
  moves = { ...moves, receipts: [{ id: 'emergency-fund', metric: 'fund', at: '2026-10-15T09:00:00.000Z', before: 60_000, after: 120_000, seen: false }] };
  let stats = bump(EMPTY_STATS, '2026-10-18', 'fin', 4);
  stats = bump(stats, '2026-10-18', 'ms', 3 * 60_000);
  stats = bump(stats, '2026-10-17', 'fin', 2);
  let challenges = startChallenge(EMPTY_CHALLENGES, 'leak-week', new Date(2026, 9, 14));
  challenges = completeToday(challenges, 'leak-week', new Date(2026, 9, 14));
  challenges = completeToday(challenges, 'leak-week', new Date(2026, 9, 15));
  return {
    profile, moves, stats, challenges,
    watched: { 'emergency-fund': { at: '2026-10-14T09:00:00.000Z', correct: true }, 'cash-flow': { at: '2026-10-15T09:00:00.000Z', correct: false } },
    days: ['2026-10-14', '2026-10-15'],
    nudge: { enabled: true, hour: 18 }, notify: { ...DEFAULT_NOTIFY, weekly: true, followups: true },
    moveReminders: [{ reelId: 'start-early', at: '2026-10-25T20:00', href: '/tools/calc/sip', label: { en: 'Open the SIP calculator', hi: 'SIP कैलकुलेटर खोलें' } }],
    voice: { speed: 0.85, style: 'steady', pauses: 'long', voice: { en: 'en-IN-x-abc' } }, mine: { ...MINE },
  };
}
const byId = (parts: Part[], id: string) => parts.find(p => p.id === id)!;
const en = (p: Part) => [p.summary.en, ...p.lines.map(x => x.en)].join(' | ');

// ── the summary ───────────────────────────────────────────────────────────────────────────────────────────────

test('an empty state: every part is there, empty, says so in plain words, and has nothing to reset', () => {
  const parts = summariseReels(EMPTY, NOW);
  assert.deepEqual(parts.map(p => p.id), PART_IDS);
  for (const p of parts) {
    assert.equal(p.empty, true, p.id);
    assert.equal(p.count, 0, p.id);
    assert.equal(p.lines.length, 0, p.id);
    assert.ok(p.summary.en.length > 10 && p.reset.does.en.length > 30, p.id);
  }
  assert.match(byId(parts, 'known').summary.en, /have not told the reels you know any/);
  assert.match(byId(parts, 'play').summary.en, /Nothing learned yet/);
  assert.match(byId(parts, 'welcome').summary.en, /not answered the welcome/);
  assert.equal(figuresUsed({}).lines.length, 0);
});

test('a rich state: known answers for every part', () => {
  const parts = summariseReels(rich(), NOW);
  const get = (id: string) => byId(parts, id);
  assert.equal(get('known').count, 2);
  assert.deepEqual(get('known').lines.map(x => x.en), [title('emergency-fund').en, title('cash-flow').en]);
  assert.match(get('known').summary.en, /already know 2 of them/);
  assert.equal(get('less').count, 2);
  assert.deepEqual(get('less').lines.map(x => x.en).sort(), ['Loans: 2 notches lower', 'Tax: 1 notch lower']);
  assert.deepEqual(get('saved').lines.map(x => x.en), [title('section-80c').en, title('tax-regimes').en]);       // newest first
  assert.equal(get('pledges').count, 3);
  assert.deepEqual(get('pledges').lines.map(x => x.en), [
    `${title('cash-flow').en} — whenever you are ready`,
    `${title('emergency-fund').en} — your figure improved`,
    `${title('start-early').en} — watching your figure`,
  ]);
  assert.equal(get('milestones').count, 1);
  assert.equal(get('milestones').lines[0].en, 'You have a SIP running');
  assert.match(get('milestones').summary.en, /1 change in your own figures \(1 already shown/);
  assert.deepEqual(get('welcome').lines.map(x => x.en), ['Here for: Loans, Tax', 'With money terms: I know some']);
  assert.match(get('play').summary.en, /You like to try things/);
  assert.match(get('play').lines[0].en, /10 interactive parts shown, you played with 8/);
  assert.equal(get('moves').count, 2);
  assert.match(get('moves').lines.map(x => x.en).join(' '), /watching your SIP/);
  assert.match(get('moves').lines.map(x => x.en).join(' '), /your emergency fund changed from ₹60,000 to ₹1\.2 lakh/);
  assert.match(get('watched').summary.en, /finished 2 reels \(1 answered right\) on 2 days/);
  assert.equal(get('watched').synced, true);
  assert.match(get('stats').summary.en, /6 finished/);
  assert.match(get('challenges').lines[0].en, /Find your leak in 7 days — 2 of 7 done/);
  assert.match(get('reminders').summary.en, /a daily reminder at 18:00; follow-ups on things you said you would do; a Sunday look-back; 1 reminder for a move/);
  assert.equal(get('reminders').lines.length, 1);
  assert.match(get('voice').summary.en, /Speed slower, steady style, long pauses, and a voice you picked/);
  assert.match(get('housekeeping').summary.en, /2 of 3 times.*2026-W42/);
  for (const p of parts.filter(x => x.id !== 'watched')) assert.equal(p.synced, false, p.id);
  for (const p of parts) assert.equal(p.empty, false, p.id);
});

test('a long list is cut with a count of what was left out', () => {
  const ids = LIBRARY.slice(0, MAX_LINES + 5).map(r => r.id);
  const k = { ...EMPTY, profile: { ...EMPTY.profile, known: ids } };
  const p = byId(summariseReels(k, NOW), 'known');
  assert.equal(p.lines.length, MAX_LINES);
  assert.equal(p.more, 5);
  assert.equal(p.count, MAX_LINES + 5);
});

test('how you play is said in plain words and the numbers do not leak jargon', () => {
  assert.match(playStyle(1, 1).en, /Not enough yet/);
  assert.match(playStyle(10, 9).en, /like to try things/);
  assert.match(playStyle(10, 4).en, /try some/);
  assert.match(playStyle(10, 1).en, /read on without playing/);
  for (const [a, b] of [[1, 0], [10, 9], [10, 4], [10, 1]]) assert.doesNotMatch(playStyle(a, b).en, /ranker|fmt|format fit|engage|metric|poke/i);
});

test('figures read from the trackers are listed with a plain note that nothing is sent or copied', () => {
  const f = figuresUsed({ ...MINE, loan: { label: { en: 'home loan', hi: 'होम लोन' }, balance: 2_000_000, rate: 9, emi: 20_000 } });
  assert.equal(f.lines.length, 4);
  assert.match(f.lines[0].en, /Your SIP: ₹15,000 a month/);
  assert.match(f.lines[3].en, /Your home loan/);
  assert.match(f.note.en, /never sent anywhere and never copied/);
  assert.ok(f.keys.includes('finos_sip_total'));
});

// ── the registry ──────────────────────────────────────────────────────────────────────────────────────────────

const REELS_KEY_RE = /^finos_(session_)?reels_/;
test('every stored reels key in the privacy registry appears in what the screen shows (a new key cannot be forgotten)', () => {
  const registry = privacy.DATA_ITEMS.map(d => d.key).filter(k => REELS_KEY_RE.test(k));
  assert.ok(registry.length >= 10);
  const shown = new Set(summariseReels(EMPTY, NOW).flatMap(p => p.keys));
  const missing = registry.filter(k => !shown.has(k));
  assert.deepEqual(missing, [], `these reels keys are in lib/privacy.ts but not in lib/reels/transparency.ts PART_KEYS, so the screen would not show or reset them: ${missing.join(', ')}`);
  const stale = ALL_PART_KEYS.filter(k => !registry.includes(k));
  assert.deepEqual(stale, [], `PART_KEYS names keys that are not in the privacy registry: ${stale.join(', ')}`);
});

test('a reels key written anywhere in the app code is in the registry', () => {
  const found = new Set<string>();
  const walk = (dir: string) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      if (f.name === 'node_modules' || f.name.startsWith('.')) continue;
      const p = nodePath.join(dir, f.name);
      if (f.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(f.name)) for (const m of fs.readFileSync(p, 'utf8').matchAll(/'(finos_(?:session_)?reels_[a-z_]+)'/g)) found.add(m[1]);
    }
  };
  for (const d of ['lib', 'hooks', 'app', 'components']) walk(nodePath.join(root, d));
  const registry = new Set(privacy.DATA_ITEMS.map(d => d.key));
  const missing = [...found].filter(k => !registry.has(k));
  assert.deepEqual(missing, [], `reels storage keys in the code but not in lib/privacy.ts: ${missing.join(', ')}`);
});

test('only the watched list and finishing days sync; every other reels key is a finos_session_ key, and the screen says so', () => {
  const registry = privacy.DATA_ITEMS.map(d => d.key).filter(k => REELS_KEY_RE.test(k));
  assert.deepEqual(registry.filter(k => !k.startsWith('finos_session_')).sort(), [...SYNCED_KEYS].sort());
  for (const k of registry.filter(x => x.startsWith('finos_session_'))) assert.match(privacy.DATA_ITEMS.find(d => d.key === k)!.label, /never synced/, k);
  assert.match(KEPT_NOTE.en, /finos_session_/);
  assert.match(KEPT_NOTE.en, /never uploaded or synced/);
  for (const p of summariseReels(rich(), NOW)) assert.equal(p.synced, PART_KEYS[p.id].some(k => SYNCED_KEYS.includes(k)));
});

test('the screen is built from the summary, the figures, the why sentence and the reset functions', () => {
  const src = fs.readFileSync(nodePath.join(root, 'app/learn/reels-data.tsx'), 'utf8');
  for (const w of ['summariseReels', 'figuresUsed', 'whyThisReel', 'resetPart', 'resetAllReels', 'Alert.alert', 'KEPT_NOTE', 'minHeight: 44']) assert.ok(src.includes(w), w);
  assert.match(fs.readFileSync(nodePath.join(root, 'app/learn/index.tsx'), 'utf8'), /\/learn\/reels-data/);
  assert.match(fs.readFileSync(nodePath.join(root, 'app/diagnostics.tsx'), 'utf8'), /\/learn\/reels-data/);
});

// ── resets ────────────────────────────────────────────────────────────────────────────────────────────────────

async function seed(): Promise<ReelsKnowledge> {
  await AsyncStorage.clear();
  const k = rich();
  await saveReelsProfile(k.profile); await saveMoves(k.moves);
  await AsyncStorage.setItem(STATS_KEY, JSON.stringify(k.stats));
  await saveChallenges(k.challenges);
  await AsyncStorage.setItem(REELS_KEY, JSON.stringify(k.watched)); await AsyncStorage.setItem(REELS_DAYS_KEY, JSON.stringify(k.days));
  await saveNudge(k.nudge); await saveNotify(k.notify); await saveMoveReminders(k.moveReminders);
  await saveVoicePrefs(k.voice);
  // the person's own trackers, which no reset may touch
  await AsyncStorage.setItem('finos_sip_total', '15000'); await AsyncStorage.setItem('finos_monthly_expense', '40000'); await AsyncStorage.setItem('finos_emergency_fund', '120000');
  await AsyncStorage.setItem('finos_goals', '[{"id":"g1"}]'); await AsyncStorage.setItem('finos_transactions', '[{"id":"t1"}]');
  return k;
}
const TRACKERS: [string, string][] = [['finos_sip_total', '15000'], ['finos_monthly_expense', '40000'], ['finos_emergency_fund', '120000'], ['finos_goals', '[{"id":"g1"}]'], ['finos_transactions', '[{"id":"t1"}]']];
const summaryOf = async () => summariseReels(await loadKnowledge(NOW), NOW);

test('seeding round-trips: what is stored is what the screen reads', async () => {
  await seed();
  const parts = await summaryOf();
  assert.deepEqual(parts, summariseReels({ ...rich(), mine: { ...MINE } }, NOW));
  assert.equal((await loadKnowledge(NOW)).mine.sip, 15_000);
});

for (const id of PART_IDS) {
  test(`resetting "${id}" removes exactly that part and leaves the rest`, async () => {
    await seed();
    const before = await summaryOf();
    await resetPart(id);
    const after = await summaryOf();
    assert.equal(byId(after, id).empty, true, `${id} should be empty after its reset`);
    assert.equal(byId(after, id).count, 0, id);
    for (const p of before.filter(x => x.id !== id)) {
      // the one allowed link: a move's status line on the list reads from the watched figures, so after forgetting those it says "not started"
      const same = id === 'moves' && p.id === 'pledges' ? { ...p, lines: byId(after, p.id).lines } : p;
      assert.deepEqual(byId(after, p.id), same, `${p.id} changed when ${id} was reset`);
    }
    if (id === 'moves') assert.deepEqual(byId(after, 'pledges').lines.map(x => x.en), [`${title('cash-flow').en} — whenever you are ready`, `${title('emergency-fund').en} — not started`, `${title('start-early').en} — not started`]);
    for (const [k, v] of TRACKERS) assert.equal(await AsyncStorage.getItem(k), v, `${k} is the person's tracker and must stay`);
    assert.equal((await loadKnowledge(NOW)).mine.sip, 15_000);
  });
}

test('resetting the format fit makes the ranker neutral again', async () => {
  await seed();
  assert.ok(pokeFit(rich().profile) > 1.05);
  await resetPart('play');
  assert.equal(pokeFit((await loadKnowledge(NOW)).profile), 1);
});

test('the per-field forget helpers change only their field and return the same object when there is nothing to forget', () => {
  const p = rich().profile;
  const cases: [string, (x: ReelsProfile) => ReelsProfile, (keyof ReelsProfile)[]][] = [
    ['known', forgetKnown, ['known']], ['less', forgetLess, ['less']], ['saved', forgetSaved, ['saved']], ['pledges', forgetPledges, ['pledges']],
    ['milestones', forgetMilestones, ['ms', 'msSeen', 'hadLoan']], ['welcome', forgetStart, ['start']], ['play', forgetPlay, ['fmt']], ['housekeeping', forgetHousekeeping, ['tips', 'blindWeek']],
  ];
  for (const [name, fn, keys] of cases) {
    const out = fn(p) as unknown as Record<string, unknown>, src = p as unknown as Record<string, unknown>;
    for (const k of Object.keys(src)) {
      if (keys.includes(k as keyof ReelsProfile)) assert.ok(out[k] === undefined || (Array.isArray(out[k]) && (out[k] as unknown[]).length === 0) || (typeof out[k] === 'object' && Object.keys(out[k] as object).length === 0), `${name}: ${k} should be gone`);
      else assert.deepEqual(out[k], src[k], `${name} must not touch ${k}`);
    }
    const once = fn(p);
    assert.equal(fn(once), once, `${name} twice is the same as once`);
    const empty = { ...EMPTY_PROFILE, known: [], less: {} };
    assert.equal(fn(empty), empty, `${name} on an empty profile returns the same object`);
  }
});

test('reset everything removes every reels key and nothing else', async () => {
  await seed();
  await AsyncStorage.setItem('finos_session_arya_memory_v1', '[1]');
  await resetAllReels();
  const left = (await AsyncStorage.getAllKeys()).filter(k => REELS_KEY_RE.test(k));
  assert.deepEqual(left, [], 'reels keys left behind');
  for (const k of [REELS_PROFILE_KEY, REELS_MOVES_KEY, STATS_KEY, CHALLENGES_KEY, REELS_KEY, REELS_DAYS_KEY, NUDGE_KEY, NOTIFY_KEY, MOVE_REMINDERS_KEY, VOICE_PREFS_KEY]) assert.equal(await AsyncStorage.getItem(k), null, k);
  for (const [k, v] of TRACKERS) assert.equal(await AsyncStorage.getItem(k), v, k);
  assert.equal(await AsyncStorage.getItem('finos_session_arya_memory_v1'), '[1]');
  for (const p of await summaryOf()) assert.equal(p.empty, true, p.id);
});

test('resetting when nothing is stored writes nothing', async () => {
  await AsyncStorage.clear();
  for (const id of PART_IDS) await resetPart(id);
  assert.deepEqual(await AsyncStorage.getAllKeys(), []);
});

// ── Hindi ─────────────────────────────────────────────────────────────────────────────────────────────────────

function collectL(x: unknown, path: string, out: { path: string; v: { en: string; hi: string } }[] = []) {
  if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>;
    if (typeof o.en === 'string' && typeof o.hi === 'string') out.push({ path, v: o as { en: string; hi: string } });
    else for (const [k, v] of Object.entries(o)) collectL(v, `${path}.${k}`, out);
  }
  return out;
}

test('every string the screen shows has a Hindi version', () => {
  const all = [
    ...collectL(summariseReels(EMPTY, NOW), 'empty'), ...collectL(summariseReels(rich(), NOW), 'rich'),
    ...collectL(figuresUsed({}), 'figures0'), ...collectL(figuresUsed({ ...MINE, loan: { label: { en: 'home loan', hi: 'होम लोन' }, balance: 2_000_000, rate: 9, emi: 20_000 } }), 'figures'),
    ...collectL(TEXT, 'text'), ...collectL({ KEPT_NOTE }, 'kept'), ...collectL({ more: TEXT.more(3) }, 'more'),
    ...[0, 2, 5, 9, 10].flatMap(n => collectL({ n: playStyle(10, n) }, 'play')),
  ];
  assert.ok(all.length > 150);
  for (const { path, v } of all) {
    assert.ok(v.en.trim().length > 0 && v.hi.trim().length > 0, `${path} is empty in one language`);
    assert.ok(DEVANAGARI.test(v.hi), `${path} has no Hindi: ${v.hi}`);
    assert.notEqual(v.en, v.hi, path);
    assert.doesNotMatch(v.hi, /undefined|\[object|NaN/, path);
    assert.doesNotMatch(v.en, /undefined|\[object|NaN/, path);
  }
});

test('the screen file has no English-only visible text outside the shared strings', () => {
  const src = fs.readFileSync(nodePath.join(root, 'app/learn/reels-data.tsx'), 'utf8');
  for (const m of src.matchAll(/hi \? '([^']+)' : '([^']+)'/g)) assert.ok(DEVANAGARI.test(m[1]) && !DEVANAGARI.test(m[2]), m[0]);
});

// ── why this reel ─────────────────────────────────────────────────────────────────────────────────────────────

const r0 = LIBRARY[0];
const reasonOf = { en: 'Your Savings is your lowest Money Score pillar.', hi: 'आपका बचत आपके Money Score का सबसे कमज़ोर हिस्सा है।' };

test('whyThisReel answers in one plain sentence for every `why` value, in both languages, with and without a reason', () => {
  assert.deepEqual([...WHY_VALUES].sort(), ['blind', 'done', 'gentle', 'new', 'pillar', 'pledge', 'refresh', 'review', 'timely']);
  for (const why of WHY_VALUES) for (const reason of [null, reasonOf]) {
    const w = whyThisReel(r0, [{ reel: r0, why, reason }]);
    assert.ok(w.en.length > 20 && DEVANAGARI.test(w.hi), `${why}: ${w.en}`);
    assert.doesNotMatch(w.en + w.hi, /undefined|null|NaN|\[object/, why);
    assert.doesNotMatch(w.en, /\bscore of \d|ranker|\bwhy\b/i, why);
  }
  assert.match(whyThisReel(r0, [{ reel: r0, why: 'review', reason: null }]).en, /you missed this question/);
  assert.match(whyThisReel(r0, [{ reel: r0, why: 'blind', reason: null }]).en, /weakest Money Score pillar/);
  assert.match(whyThisReel(r0, [{ reel: r0, why: 'pledge', reason: null }]).en, /you said you would do this/);
  assert.match(whyThisReel(r0, [{ reel: r0, why: 'pillar', reason: reasonOf }]).en, /^Because your Savings is your lowest Money Score pillar\.$/);
  assert.match(whyThisReel(r0, [{ reel: r0, why: 'pillar', reason: null }]).en, /weakest Money Score pillar/);
  assert.match(whyThisReel(r0, [{ reel: LIBRARY[1], why: 'new', reason: null }]).en, /Nothing in particular/);
});

const sig = (extra: Partial<Parameters<typeof deriveSignals>[0]> = {}) => deriveSignals({ now: NOW, ...extra });
const rank = (profile: ReelsProfile, signals = sig(), watched = {}, now = NOW) => rankReelsV2(LIBRARY, { watched, signals, profile, now });

test('whyThisReel on the real ranker: missed question, saved, weakest pillar, Diwali week', () => {
  // you missed this question
  const id = 'emergency-fund';
  const missed = rank(EMPTY_PROFILE, sig(), { [id]: { at: new Date(NOW.getTime() - 3 * 86_400_000).toISOString(), correct: false } });
  assert.equal(missed[0].reel.id, id);
  assert.equal(missed[0].why, 'review');
  assert.match(whyThisReel(missed[0].reel, missed).en, /you missed this question/);

  // you saved it (found by asking the ranker, so a change to its wording fails here)
  let sawSaved = false;
  for (const r of LIBRARY.slice(0, 60)) {
    const ranked = rank({ ...EMPTY_PROFILE, known: [], less: {}, saved: [r.id] });
    const hit = ranked.find(x => x.reel.id === r.id)!;
    if (hit.why === 'new' && hit.reason) { assert.equal(whyThisReel(r, ranked).en, 'Because you saved it for later.'); assert.match(whyThisReel(r, ranked).hi, /सेव/); sawSaved = true; break; }
  }
  assert.ok(sawSaved, 'no saved reel came out as "because you saved it": the ranker wording changed');

  // weakest pillar
  const signals = sig({ pillars: PILLARS.map(p => ({ id: p, score: p === 'emergency' ? 10 : 80 })), weakestId: 'emergency' });
  const ranked = rank(EMPTY_PROFILE, signals);
  const pillar = ranked.find(x => x.why === 'pillar' && x.reason?.en.includes('lowest Money Score pillar'));
  assert.ok(pillar, 'expected a reel chosen for the lowest pillar');
  assert.match(whyThisReel(pillar!.reel, ranked).en, /^Because your .* is your lowest Money Score pillar\.$/);

  // Diwali week (8 Nov 2026)
  const diwali = new Date(2026, 10, 5, 9, 0, 0);
  const rk = rank(EMPTY_PROFILE, deriveSignals({ now: diwali }), {}, diwali);
  const fest = rk.find(x => x.why === 'timely' && x.reason?.en.startsWith('Diwali week'));
  assert.ok(fest, 'expected a Diwali-week reel');
  assert.equal(whyThisReel(fest!.reel, rk).en, 'Because it is Diwali week, when spending and scam messages both tend to rise.');
  assert.match(whyThisReel(fest!.reel, rk).hi, /दिवाली/);
});

test('every reason the real ranker gives for 400 varied people turns into a sentence in both languages', () => {
  const seen = new Set<string>();
  const days = [NOW, new Date(2026, 1, 10, 9), new Date(2026, 4, 12, 9), new Date(2026, 6, 10, 9), new Date(2026, 10, 5, 9), new Date(2026, 2, 20, 9)];
  for (let i = 0; i < 400; i++) {
    const now = days[i % days.length];
    const pillars = PILLARS.map((p, j) => ({ id: p, score: ((i * 7 + j * 13) % 10) * 10 }));
    const weakest = pillars.reduce((a, b) => (b.score < a.score ? b : a)).id;
    const profile: ReelsProfile = { ...EMPTY_PROFILE, known: [], less: {}, saved: i % 3 === 0 ? [LIBRARY[i % LIBRARY.length].id] : [] };
    const watched = i % 5 === 0 ? { [LIBRARY[i % LIBRARY.length].id]: { at: new Date(now.getTime() - (i % 9) * 86_400_000).toISOString(), correct: i % 2 === 0 } } : {};
    const ranked: Ranked[] = rank(profile, deriveSignals({ now, pillars, weakestId: weakest, mine: i % 4 === 0 ? { sip: 5000, spend: 40000, fund: 40000 } : {}, income: 50000, age: 30 }), watched, now);
    for (const r of ranked) {
      const w = whyThisReel(r.reel, ranked);
      seen.add(r.why);
      assert.ok(w.en.length > 20 && DEVANAGARI.test(w.hi), `${r.why}: ${JSON.stringify(w)}`);
      assert.doesNotMatch(w.en + w.hi, /undefined|null|NaN|\[object/);
    }
  }
  for (const why of ['review', 'timely', 'pillar', 'new', 'done']) assert.ok(seen.has(why), `the sample never produced "${why}"`);
});
