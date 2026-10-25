// The Home screen's "Today's reel" card (lib/reels/homecard.ts), the Reels tab label's pledge hint, and the wiring that keeps both on-phone and calm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import nodePath from 'node:path';
import { HOME_EPISODE_SIZE, homeCard, type HomeState } from '../lib/reels/homecard.ts';
import { EPISODE_SIZE } from '../lib/reels/episode.ts';
import { reelsTabState } from '../lib/reels/streak.ts';

const root = nodePath.join(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(nodePath.join(root, p), 'utf8');
const ORDINARY = new Date(2026, 5, 10, 9);            // 10 June 2026: no season
const DIWALI = new Date(2026, 10, 6, 9);              // two days before Lakshmi Puja 2026

const anchor = { title: { en: 'Why a rupee today beats a rupee later', hi: 'आज का एक रुपया कल से भारी क्यों' }, reason: { en: 'Your emergency fund is your lowest pillar.', hi: 'आपका इमरजेंसी फ़ंड सबसे कमज़ोर हिस्सा है।' } };
const base: HomeState = { anchor, finished: 0, streak: 0, resting: false, everDone: false, pledges: 0, celebrate: null, strain: false };
const card = (o: Partial<HomeState> = {}, now: Date = ORDINARY) => homeCard({ ...base, ...o }, now);

test('the episode size used by the card matches the episode', () => { assert.equal(HOME_EPISODE_SIZE, EPISODE_SIZE); });

test('a new person: a plain welcome, a Start button, no progress, no streak', () => {
  const c = card();
  assert.equal(c.kind, 'new'); assert.equal(c.ctaState, 'start');
  assert.equal(c.heading.en, 'Today’s reel'); assert.equal(c.heading.hi, 'आज की रील');
  assert.equal(c.title?.en, anchor.title.en);
  assert.equal(c.reason.en, anchor.reason.en);
  assert.equal(c.progress, null); assert.equal(c.streak, null); assert.equal(c.moves, null); assert.equal(c.celebrate, null); assert.equal(c.season, null);
  assert.equal(c.cta.en, 'Start'); assert.equal(c.cta.hi, 'शुरू करें');
  const none = card({ anchor: null });
  assert.equal(none.title, null); assert.equal(none.reason.en, 'Short lessons with Mitra the owl, about 30 seconds each.');
});

test('mid-episode: the count, the streak in kind words, Continue, and the pledge line', () => {
  const c = card({ finished: 1, streak: 4, everDone: true, pledges: 2 });
  assert.equal(c.kind, 'mid'); assert.equal(c.ctaState, 'continue');
  assert.equal(c.progress?.en, '1 of 3 today'); assert.equal(c.progress?.hi, 'आज 3 में से 1');
  assert.equal(c.streak?.en, '4-day streak'); assert.equal(c.streak?.hi, '4 दिन की लय');
  assert.equal(c.cta.en, 'Continue'); assert.equal(c.cta.hi, 'जारी रखें');
  assert.equal(c.moves?.en, '2 moves on your list'); assert.equal(c.moves?.hi, 'आपकी सूची में 2 काम');
  assert.equal(card({ pledges: 1 }).moves?.en, '1 move on your list');
  assert.equal(card({ pledges: 0 }).moves, null);
  const back = card({ everDone: true });                          // came back after a gap: ready, not a warning
  assert.equal(back.kind, 'mid'); assert.equal(back.ctaState, 'start'); assert.equal(back.progress?.en, '0 of 3 today'); assert.equal(back.streak, null);
});

test('done for today: no reel to push, a calm sign-off, the finished count capped at the episode size', () => {
  const c = card({ finished: 3, streak: 5, everDone: true });
  assert.equal(c.kind, 'done'); assert.equal(c.ctaState, 'done'); assert.equal(c.title, null);
  assert.equal(c.heading.en, 'Money reels'); assert.equal(c.cta.en, 'Done for today'); assert.equal(c.cta.hi, 'आज के लिए पूरा');
  assert.equal(c.progress?.en, '3 of 3 today'); assert.equal(c.reason.en, 'That is today’s set. Come back tomorrow for the next.');
  assert.equal(card({ finished: 9, everDone: true }).progress?.en, '3 of 3 today');
});

test('a rest day is bridged without a word about what was missed', () => {
  const c = card({ streak: 4, resting: true, everDone: true });
  assert.equal(c.kind, 'rest'); assert.equal(c.ctaState, 'start');
  assert.equal(c.reason.en, 'A rest day is built in, so your streak is safe. Pick up whenever you like.');
  assert.equal(c.streak?.en, '4-day streak');
  assert.equal(card({ streak: 4, resting: true, everDone: true, finished: 1 }).kind, 'mid', 'once a reel is watched it is simply mid-episode');
});

test('a strained person gets no growth wording and no growth celebration, but still sees the streak (a habit count, not a growth cue)', () => {
  const growthy = { title: { en: 'Start a SIP and let it grow', hi: 'SIP शुरू करें और निवेश बढ़ाएं' }, reason: { en: 'Your investing is your lowest pillar.', hi: 'आपका निवेश कमज़ोर है।' } };
  const c = card({ strain: true, anchor: growthy, streak: 6, everDone: true, finished: 1, celebrate: { title: { en: 'You started a SIP', hi: 'आपने SIP शुरू की' }, growth: true } });
  assert.equal(c.streak?.en, '6-day streak'); assert.equal(c.celebrate, null);
  assert.equal(c.title?.en, 'A calm minute for your money');
  assert.equal(c.reason.en, 'Calm and practical, picked for you today.');
  const text = [c.heading, c.title, c.reason, c.progress, c.streak, c.cta, c.moves, c.celebrate, c.a11y].map(t => (t ? `${t.en} ${t.hi}` : '')).join(' ');
  assert.ok(!/SIP|invest|grow|निवेश|बढ़/i.test(text), text);
  // a calm title passes through, and a non-growth celebration (a cleared loan) is kept
  const ok = card({ strain: true, anchor: { title: { en: 'What to do when an EMI feels heavy', hi: 'जब EMI भारी लगे' }, reason: null }, celebrate: { title: { en: 'A loan cleared', hi: 'एक लोन चुक गया' }, growth: false } });
  assert.equal(ok.title?.en, 'What to do when an EMI feels heavy'); assert.equal(ok.celebrate?.en, '🎉 A loan cleared');
});

test('a fresh milestone or receipt becomes one celebratory line, in both languages', () => {
  const c = card({ celebrate: { title: { en: 'Three months of cover', hi: 'तीन महीने का सहारा' }, growth: false }, everDone: true });
  assert.equal(c.celebrate?.en, '🎉 Three months of cover'); assert.equal(c.celebrate?.hi, '🎉 तीन महीने का सहारा');
  assert.equal(card({ everDone: true }).celebrate, null);
});

test('a season day carries its badge and name; an ordinary day carries none', () => {
  const c = card({}, DIWALI);
  assert.equal(c.season?.badge, '🪔'); assert.equal(c.season?.label.en, 'Diwali week'); assert.equal(c.season?.label.hi, 'दिवाली का हफ़्ता');
  assert.match(c.a11y.en, /Diwali week/); assert.equal(card().season, null);
});

test('the spoken label says the heading, title, count and the button in both languages', () => {
  const c = card({ finished: 2, streak: 3, everDone: true });
  assert.equal(c.a11y.en, `Today’s reel. ${anchor.title.en}. ${anchor.reason.en.replace(/\.$/, '')}. 2 of 3 today. 3-day streak. Continue`);
  assert.equal(c.a11y.hi, `आज की रील. ${anchor.title.hi}. ${anchor.reason.hi.replace(/।$/, '')}. आज 3 में से 2. 3 दिन की लय. जारी रखें`);
});

test('wording is never guilt, loss or FOMO, in any state or language', () => {
  const GUILT = /miss|lost|lose|behind|broke|broken|fail|late|hurry|don'?t (lose|break)|only .* left|last chance|catch up|falling|slip|worry|should have|छूट|खो|पीछे|टूट|जल्दी|आख़िरी मौका|देर/i;
  const states: HomeState[] = [
    base, { ...base, finished: 1, streak: 4, everDone: true, pledges: 3 }, { ...base, finished: 3, streak: 5, everDone: true },
    { ...base, streak: 4, resting: true, everDone: true }, { ...base, everDone: true }, { ...base, strain: true, finished: 1, streak: 3, everDone: true, pledges: 1 },
    { ...base, anchor: null }, { ...base, everDone: true, celebrate: { title: { en: 'You raised your SIP', hi: 'आपने अपनी SIP बढ़ाई' }, growth: true } },
  ];
  for (const st of states) for (const now of [ORDINARY, DIWALI]) {
    const c = homeCard(st, now);
    // the reel's own title and reason come from the library and are checked there; scan only what this module writes
    const mine = [c.heading, c.progress, c.streak, c.cta, c.moves, c.season?.label, ...(c.kind === 'new' || c.kind === 'done' || c.kind === 'rest' || st.strain || !st.anchor ? [c.reason] : [])];
    for (const t of mine) if (t) for (const lang of ['en', 'hi'] as const) assert.ok(!GUILT.test(t[lang]), `${c.kind}/${lang}: ${t[lang]}`);
  }
});

test('the Reels tab label gains the pledge hint and nothing else: no number on the icon, existing labels unchanged', () => {
  const D = (n: number) => `2026-10-${String(n).padStart(2, '0')}`;
  const days = [D(3), D(4), D(5)];
  assert.equal(reelsTabState(days, D(5)).label, 'Reels, done for today, 3-day streak');
  assert.equal(reelsTabState(days, D(5), 0).label, 'Reels, done for today, 3-day streak');
  assert.equal(reelsTabState(days, D(5), 2).label, 'Reels, done for today, 3-day streak, 2 moves on your list');
  assert.equal(reelsTabState(days, D(6), 1).label, "Reels, today's reel is ready, 3-day streak, 1 move on your list");
  assert.equal(reelsTabState([], D(6), 4).label, "Reels, today's reel is ready, 4 moves on your list");
  for (const n of [0, 1, 7]) { const a = reelsTabState(days, D(6)), b = reelsTabState(days, D(6), n); assert.deepEqual([b.badge, b.streak], [a.badge, a.streak], 'the badge never changes with pledges'); }
  for (const bad of [NaN, -3, Infinity]) assert.equal(reelsTabState([], D(6), bad).label, "Reels, today's reel is ready");
  assert.ok(!/miss|lost|behind|hurry|overdue/i.test(reelsTabState(days, D(6), 5).label));
  // the layout draws the badge from badge + streak only
  const layout = read('app/(tabs)/_layout.tsx');
  assert.match(layout, /badge=\{reels\.badge\} streak=\{reels\.streak\}/); assert.doesNotMatch(layout, /pledge/i);
  assert.match(layout, /tabBarAccessibilityLabel: reels\.label/);
});

test('Home imports the card and it still opens the reels feed and My moves', () => {
  const dash = read('app/(tabs)/dashboard.tsx');
  assert.match(dash, /import \{ ReelsHomeCard \} from '@\/components\/ReelsHomeCard'/);
  assert.match(dash, /<ReelsHomeCard j=\{rj\}/);
  assert.doesNotMatch(dash, /Today's reel/, 'the old plain row text lives only in the card');
  const comp = read('components/ReelsHomeCard.tsx');
  assert.match(comp, /open\('\/learn\/reels'\)/); assert.match(comp, /open\('\/learn\/moves'\)/);
  assert.match(comp, /!j\.loaded/, 'the plain row shows until the state has loaded');
  assert.match(comp, /minHeight: REELS_CARD_MIN_HEIGHT/);
  assert.ok(fs.existsSync(nodePath.join(root, 'app/learn/moves.tsx')) && fs.existsSync(nodePath.join(root, 'app/learn/reels.tsx')));
});

test('the card adds no storage key, no network and no writes', () => {
  for (const f of ['lib/reels/homecard.ts', 'components/ReelsHomeCard.tsx', 'hooks/useReelsTab.ts']) {
    const src = read(f);
    assert.doesNotMatch(src, /finos_[a-z_]+/, `${f} names a storage key`);
    assert.doesNotMatch(src, /AsyncStorage|setItem|fetch\(|XMLHttpRequest|saveReelsProfile|saveMoves|recordDay|recordWatched/, `${f} writes or calls out`);
  }
  assert.match(read('hooks/useReelsTab.ts'), /loadDays\(\), loadReelsProfile\(\)/, 'the tab reads the two existing stores');
});
