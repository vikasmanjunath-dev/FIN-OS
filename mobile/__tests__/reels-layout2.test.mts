// Layout pass for the Money Reels screens the end-to-end sweep flagged (D2, D4, D9, D12, D13), the challenge suggestion on the calm stop, and the Home streak.
// Pure helpers are tested directly; the layout rules are held as source checks, the way a11y.test.mts and reels-a11y2.test.mts do. The pixel numbers
// (before / after, 1x, 1.35x and 2x text, English and Hindi) are in the report of the session that made this change.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import nodePath from 'node:path';
import { MORE_BELOW, FEED_LOADING, challengeLine, headInset, moreBelow } from '../lib/reels/calmstop.ts';
import { CHALLENGES, EMPTY_CHALLENGES, suggestChallenge } from '../lib/reels/challenges.ts';
import { homeCard, type HomeState } from '../lib/reels/homecard.ts';
import { EMPTY_PROFILE } from '../lib/reels/reelsProfile.ts';

const root = nodePath.join(import.meta.dirname, '..');
const read = (f: string) => fs.readFileSync(nodePath.join(root, f), 'utf8');
const DEV = /[ऀ-ॿ]/;

// ── pure helpers ───────────────────────────────────────────────────────────────────────────────

test('moreBelow: true only while more than a few pixels wait below the fold', () => {
  assert.equal(moreBelow(900, 600, 0), true);
  assert.equal(moreBelow(900, 600, 200), true);
  assert.equal(moreBelow(900, 600, 292), false, 'within the slack of the end');
  assert.equal(moreBelow(900, 600, 300), false, 'at the end');
  assert.equal(moreBelow(900, 600, 340), false, 'overscroll past the end');
  assert.equal(moreBelow(500, 600, 0), false, 'everything fits: no cue');
  assert.equal(moreBelow(900, 600, -40), true, 'a pull-down bounce is not scrolled');
  assert.equal(moreBelow(900, 0, 0), false, 'not measured yet');
  assert.equal(moreBelow(NaN, 600, 0), false); assert.equal(moreBelow(900, 600, NaN), false);
});

test('the cue and loading words come in both languages, the Hindi in Devanagari', () => {
  for (const t of [MORE_BELOW, FEED_LOADING]) { assert.ok(t.en.length > 5); assert.ok(DEV.test(t.hi)); }
  assert.equal(FEED_LOADING.en, 'Getting today’s reels');
  assert.match(MORE_BELOW.en, /more below/i);
});

test('challengeLine: "Try: <title>" in both languages, null for no suggestion or an unknown id', () => {
  const c = CHALLENGES[2];
  const en = challengeLine({ id: c.id }, 'en'), hi = challengeLine({ id: c.id }, 'hi');
  assert.equal(en?.text, `Try: ${c.title.en}`); assert.match(en!.label, /Opens the 7-day challenges/);
  assert.equal(hi?.text, `आज़माएँ: ${c.title.hi}`); assert.ok(DEV.test(hi!.label));
  assert.equal(challengeLine(null, 'en'), null);
  assert.equal(challengeLine({ id: 'no-such-challenge' }, 'hi'), null);
});

test('the suggestion keeps its strain rule: a strained person is never shown a growth challenge on the calm stop', () => {
  const sig = (strain: boolean) => ({ now: new Date(2026, 9, 25, 12), pillars: { savings: 20, investing: 10, wealth: 15 }, weakest: 'investing' as const, strain });
  const growthIds = new Set(CHALLENGES.filter(c => c.growth).map(c => c.id));
  assert.ok(growthIds.size > 0, 'there is at least one growth challenge to guard');
  const calm = suggestChallenge(EMPTY_PROFILE, sig(true), EMPTY_CHALLENGES);
  if (calm) assert.ok(!growthIds.has(calm.id), calm.id);
  const line = challengeLine(calm, 'en');
  if (line) for (const id of growthIds) assert.ok(!line.text.includes(CHALLENGES.find(c => c.id === id)!.title.en));
});

test('headInset: what was measured, rounded up, else the fallback', () => {
  assert.equal(headInset(0, 108), 108); assert.equal(headInset(-3, 108), 108); assert.equal(headInset(NaN, 108), 108);
  assert.equal(headInset(108, 108), 108); assert.equal(headInset(148.2, 108), 149);
});

// ── D7: the streak is shown to everyone ───────────────────────────────────────────────────────────────────────────────────────────────────────

const base: HomeState = { anchor: { title: { en: 'A reel', hi: 'एक रील' }, reason: null }, finished: 1, streak: 5, resting: false, everDone: true, pledges: 0, celebrate: null, strain: false };

test('Home shows the streak to a strained person too, as the feed, the question and the tab badge do', () => {
  for (const strain of [false, true]) {
    const c = homeCard({ ...base, strain }, new Date(2026, 9, 25, 12));
    assert.equal(c.streak?.en, '5-day streak', `strain=${strain}`); assert.match(c.a11y.en, /5-day streak/);
  }
  assert.equal(homeCard({ ...base, streak: 0, strain: true }, new Date(2026, 9, 25, 12)).streak, null);
  assert.doesNotMatch(read('lib/reels/homecard.ts'), /const streak = s\.strain/);
});

// ── D2: Ask Mitra chip ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

test('D2: an Ask Mitra suggestion wraps inside the sheet instead of running off the right edge', () => {
  const s = read('components/reels/AskSheet.tsx');
  assert.match(s, /chip: \{[^}]*maxWidth: '100%'/); assert.match(s, /chipTxt: \{[^}]*flexShrink: 1/);
  assert.match(s, /chip: \{[^}]*minHeight: 44/, 'the 44 px target stays');
  assert.match(s, /input: \{[^}]*minWidth: 0/); assert.match(s, /send: \{[^}]*flexShrink: 0/);
});

// ── D4: Home card ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

test('D4: the Home card never cuts its words, and the button drops under them when the row is too narrow', () => {
  const s = read('components/ReelsHomeCard.tsx');
  assert.doesNotMatch(s, /numberOfLines/, 'heading, title, reason, celebration and moves lines wrap fully');
  assert.match(s, /main: \{[^}]*flexWrap: 'wrap'/); assert.match(s, /info: \{[^}]*flexShrink: 1[^}]*minWidth: 0/);
  const m = /REELS_CARD_MIN_HEIGHT = (\d+)/.exec(s);
  assert.ok(m && Number(m[1]) >= 148, 'the box holds the tallest card at normal text, so the Home list does not jump when it loads');
  assert.match(s, /accessibilityRole="button"/);
});

// ── D9: feed top bar and the player ──────────────────────────────────────────────────────────────────────────────────────────────────────────

test('D9: the top bar and the chips are one measured block in normal flow, and the reels start below it', () => {
  const s = read('app/learn/reels.tsx');
  assert.match(s, /style=\{s\.head\} pointerEvents="box-none" onLayout=\{e => setHeadH\(e\.nativeEvent\.layout\.height\)\}/);
  assert.match(s, /head: \{ position: 'absolute', top: 0,/); assert.match(s, /chips: \{ height: CHIPS_H, marginTop: Spacing\.sm \}/);
  assert.doesNotMatch(s, /chips: \{ position: 'absolute'/, 'the chips are no longer pinned at a fixed top');
  assert.equal((s.match(/topInset=\{head\}/g) ?? []).length, 2, 'the player and the calm stop both start below the real bar');
  assert.doesNotMatch(s, /topInset=\{64 \+ CHIPS_H\}/);
  assert.match(s, /titles: \{[^}]*minWidth: 0/, 'the title block can narrow and wrap');
});

test('D9: when the picture is squeezed to its smallest the hint gives way and nothing is clipped; the clock is untouched', () => {
  const s = read('components/reels/ReelPlayer.tsx');
  assert.match(s, /setTightHint\(true\)/); assert.match(s, /shelf\?\.tip && idx === 0 && !tightHint/);
  assert.match(s, /const floorStage = tightHint \? Math\.round\(minStage \/ 2\) : minStage/);
  assert.match(s, /Math\.max\(floorStage,/); assert.match(s, /minHeight: floorStage/);
  assert.match(s, /pauseVeilTight/); assert.match(s, /fontSize: Math\.max\(12, Math\.min\(54, Math\.floor\(stageH \* 0\.3\)\)\)/);
  // the low-render clock: still one frame loop, still a Clock outside React state, nothing new that ticks
  assert.equal((s.match(/startFrameLoop\(/g) ?? []).length, 1);
  assert.match(s, /createClock\(\)/); assert.match(s, /useSyncExternalStore\(clock\.subscribe/);
  assert.doesNotMatch(s, /setInterval\(/);
  assert.doesNotMatch(s, /useState\(0\)\s*;?\s*\/\/[^\n]*(frame|tick|clock)/i);
});

// ── D12: calm stop ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

test('D12: the calm stop shows a quiet "more below" cue while its buttons need a scroll, and Done stays first and reachable', () => {
  const s = read('components/reels/EpisodeEnd.tsx');
  assert.match(s, /moreBelow\(size\.current\.content, size\.current\.layout, size\.current\.y\)/);
  assert.match(s, /onLayout=\{e => measure\(/); assert.match(s, /onContentSizeChange=/); assert.match(s, /onScroll=\{e => measure\(/);
  assert.match(s, /\{more \? <Text style=\{s\.cueTxt\}[^>]*>\{MORE_BELOW\[lang\]\}<\/Text> : null\}/, 'the cue goes once the end is in view');
  assert.match(s, /style=\{s\.cue\} pointerEvents="none" accessibilityElementsHidden/, 'the cue takes no touch and is not read out');
  assert.match(s, /cue: \{ minHeight: 22,/, 'its strip is always there, so nothing moves when it appears or goes');
  assert.ok(s.indexOf('onPress={onClose}') < s.indexOf('onPress={onMoves}'), 'Done comes before the other buttons');
  assert.ok(s.indexOf('onPress={onClose}') > 0 && s.indexOf('</ScrollView>') > s.indexOf('onPress={onClose}'), 'Done is inside the scroll, never under the cue');
});

// ── the suggestion on the calm stop ─────────────────────────────────────────────────────────────────────────────────────────────────────────

test('the calm stop shows suggestChallenge’s one line as a link to the challenges, and the feed passes it through', () => {
  const f = read('app/learn/reels.tsx'), e = read('components/reels/EpisodeEnd.tsx');
  assert.match(f, /suggestChallenge\(j\.profile, j\.signals, chal\)/, 'called with the profile, the signals and the saved challenge state, unchanged');
  assert.match(f, /loadChallenges\(\)/); assert.match(f, /useFocusEffect\(/, 'reloaded when the person comes back from the challenges');
  assert.match(f, /suggestion=\{suggestion\}/); assert.match(f, /challengeLine\(/);
  assert.match(e, /suggestion && onChallenges \? <TouchableOpacity accessibilityRole="button" accessibilityLabel=\{suggestion\.label\} style=\{s\.suggest\} onPress=\{onChallenges\}>/);
  assert.match(e, /suggest: \{ minHeight: 44,/); assert.doesNotMatch(e, /Colors\.purple\b/);
  assert.ok(e.indexOf('suggestion &&') < e.indexOf('onPress={onClose}'), 'one quiet line above the buttons, not a fifth button');
});

// ── D13: loading ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

test('D13: until the first reel is ready the feed says so, with Mitra, and respects reduced motion', () => {
  const s = read('app/learn/reels.tsx');
  assert.match(s, /\{!order && !welcomePending \? <View style=\{\[s\.loadingBox, \{ top: head \}\]\} pointerEvents="none"><FeedLoading lang=\{lang\} \/><\/View> : null\}/);
  assert.match(s, /function FeedLoading/); assert.match(s, /FEED_LOADING\[lang\]/);
  assert.match(s, /isReduceMotionEnabled\(\)/); assert.match(s, /reduceMotionChanged/);
  assert.match(s, /useState\(true\)/, 'the owl is still until the phone has said motion is fine');
  assert.match(s, /announce\(FEED_LOADING\[lang\]\)/, 'a screen reader is told once'); assert.doesNotMatch(s, /accessibilityLiveRegion/, 'the feed keeps no live regions');
  assert.match(s, /<Mitra mood="think" t=\{calm \? 0 : t\}/);
});
