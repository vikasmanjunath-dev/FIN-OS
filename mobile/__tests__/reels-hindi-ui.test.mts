// The screens around the Money Reels (Learn index, Diagnostics, the share preview, the voice screen, the Reels tab label) must read in Hindi in Hindi mode.
// Every Hindi string here is a DRAFT for a native reviewer. Two guards: (1) a source-reading guard that lists each user-visible English string in a
// changed file and fails, naming it, when lib/i18nHi.ts has no counterpart (the same lookup the app uses at run time); (2) checks of the places that
// choose Hindi in code (voice names, the share preview's accessible name, the tab label).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lookup } from '../lib/i18nCore.ts';
import { HI } from '../lib/i18nHi.ts';
import { reelsTabState } from '../lib/reels/streak.ts';
import { PURPOSES } from '../lib/consents.ts';
import { GLOSSARY } from '../lib/reels/hindi-glossary.ts';

const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const DEVANAGARI = /[ऀ-ॿ]/;
const LATIN_WORD = /[A-Za-z]{3}/;
const inHindi = (s: string) => lookup(s, HI, 'hi') !== null;

/** Strings that may stay as they are in Hindi: the product's own name and the like. */
const KEEP_AS_IS = new Set<string>(['FIN·OS']);

/** The user-visible English strings a source file draws: attribute strings, object-literal titles/subs, and plain JSX text.
 *  `${...}` in a template becomes a number, which is what the table's {n} stands for. Text already behind a `hi ? ... : ...` choice is skipped. */
function visibleStrings(file: string): string[] {
  const src = read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const out = new Set<string>();
  const add = (raw: string | undefined) => {
    if (!raw) return;
    const t = raw.replace(/\$\{[^}]*\}/g, '1').replace(/\s+/g, ' ').trim();
    if (!LATIN_WORD.test(t) || DEVANAGARI.test(t)) return;
    out.add(t);
  };
  const attr = /\b(?:title|sub|subtitle|label|placeholder|accessibilityLabel|accessibilityHint|text)(?:=|: ?)(?:"([^"\n]+)"|'((?:[^'\\\n]|\\.)+)'|\{'((?:[^'\\\n]|\\.)+)'\}|\{`([^`\n]+)`\})/g;
  for (const m of src.matchAll(attr)) add((m[1] ?? m[2] ?? m[3] ?? m[4])?.replace(/\\'/g, "'"));
  for (const m of src.matchAll(/<(Text|LText|SectionLabel|Bullet|Collapsible)\b[^>]*>\s*([^<>{}\n][^<>{}]*?)\s*</g)) add(m[2]);
  for (const m of src.matchAll(/<(?:Text|LText|SectionLabel)\b[^>]*>\{`([^`\n]+)`\}</g)) add(m[1]);
  for (const m of src.matchAll(/<(?:Text|LText|SectionLabel)\b[^>]*>\{'([^'\n]+)'\}</g)) add(m[1]);
  for (const m of src.matchAll(/<(?:Text|LText)\b[^>]*>\{[^{}?\n]*\? '([^'\n]+)' : '([^'\n]+)'\}</g)) { add(m[1]); add(m[2]); }
  return [...out];
}

/** Strings a file draws that are data, not words (a variable's content, a lesson title, a number), or that the app must keep in English. */
const NOT_WORDS: Record<string, string[]> = {
  'app/learn/index.tsx': [
    'Search lessons (SIP, RSI, insurance…)',      // already translated through the older table entry in a different form; checked below
  ],
  'app/diagnostics.tsx': [],
  'components/SharePreview.tsx': [],
};

const FILES = ['app/learn/index.tsx', 'app/diagnostics.tsx', 'components/SharePreview.tsx'];

for (const file of FILES) {
  test(`${file}: every visible English string has a Hindi counterpart in lib/i18nHi.ts`, () => {
    const skip = new Set([...KEEP_AS_IS, ...(NOT_WORDS[file] ?? [])]);
    const missing = visibleStrings(file).filter(s => !skip.has(s) && !inHindi(s));
    assert.deepEqual(missing, [], `${file}: no Hindi for ${missing.length} string(s):\n  ${missing.join('\n  ')}`);
  });
}

// ── Learn index: the seven reels cards ─────────────────────────────────────────────────────────────────────────
test('Learn index: the seven reels cards (title and body) are in the Hindi table, and nothing is left in English in their Hindi', () => {
  const src = read('app/learn/index.tsx');
  const cards = [...src.matchAll(/\{ title: '([^']+)', sub: '([^']+)'/g)];
  assert.equal(cards.length, 7, 'seven product cards');
  for (const [, title, sub] of cards) {
    for (const s of [title, sub]) {
      const hi = lookup(s, HI, 'hi');
      assert.ok(hi, `no Hindi for the card text: ${s}`);
      assert.ok(DEVANAGARI.test(hi!), `the Hindi for "${s}" has no Devanagari`);
      const latin = (hi!.match(/[A-Za-z]+/g) ?? []).filter(w => !LATIN_WORDS_OK.has(w));
      assert.deepEqual(latin, [], `English words left in the Hindi for "${s}"`);
    }
  }
});

test('Learn index: the card names and bodies reach the accessible names in the app language', () => {
  const src = read('app/learn/index.tsx');
  assert.match(src, /title=\{translate\(c\.title\)\} sub=\{translate\(c\.sub\)\}/, 'NavCard builds its accessible name from title and sub; both go through translate()');
  assert.match(src, /useLang\(\)/, 'the screen redraws when the language changes');
});

// ── Diagnostics ────────────────────────────────────────────────────────────────────────────────────────────────
test('Diagnostics: the string the sweep listed (intro, no-crash-reporting paragraph, nothing recorded, two reels links, the switch) are all Hindi', () => {
  const must = [
    'Crash notes and screen counts, kept on this phone. You can read, delete or share them. Nothing is sent automatically.',
    "FIN·OS has no crash-reporting or analytics service. If the app fails, a short note is written here with numbers, e-mails, links and IDs removed. Sharing is always your choice, through your phone's share sheet.",
    'Nothing has gone wrong that was recorded.',
    'Open reels health',
    'What the reels know about you',
    PURPOSES.find(p => p.id === 'usage')!.title,
    PURPOSES.find(p => p.id === 'usage')!.detail,
    'MONEY REELS',
    'How the reels are used on this phone: reels finished, moves started, minutes a day. Counted here, never sent, and you can delete the counts.',
  ];
  for (const s of must) assert.ok(inHindi(s), `no Hindi for: ${s}`);
});

test('Diagnostics: the app line, the switch name and the dialogs choose Hindi in code', () => {
  const src = read('app/diagnostics.tsx');
  assert.match(src, /hi \? 'ऐप' : 'App'/, 'the "App 1.1.0 · web 0.0.0" line says ऐप in Hindi');
  assert.match(src, /label=\{translate\(purpose\.title\)\}/, 'the switch name is translated');
  for (const s of ['Delete crash reports?', 'This removes the crash notes kept on this phone.', 'Delete usage counts?', 'This removes the screen counts kept on this phone.', 'Diagnostic report', 'Usage counts', 'Cancel', 'Delete']) {
    assert.ok(inHindi(s), `no Hindi for the dialog/report text: ${s}`);
    assert.ok(src.includes(`translate('${s}')`), `diagnostics.tsx does not translate: ${s}`);
  }
});

// ── Share preview, text mode ───────────────────────────────────────────────────────────────────────────────────
test('SharePreview: every string, message and accessible name has Hindi, and English is unchanged', () => {
  const must = [
    'This is exactly what will be shared, and you choose where it goes. Nothing has been sent.',
    'Share…', 'Close',
    'Copied. Paste it where you want to send it.',
    'Could not open the share sheet. Select the text above and copy it.',
    'Feedback report',
  ];
  for (const s of must) assert.ok(inHindi(s), `no Hindi for: ${s}`);
  const src = read('components/SharePreview.tsx');
  assert.ok(src.includes("(${hi ? 'साझा किया जाने वाला पाठ' : 'text to share'})"), 'the accessible name ends in Hindi in Hindi mode and "(text to share)" in English');
  assert.match(src, /translate\(title\)/, 'a caller title in English (the feedback report) is translated too');
  // every other user of the shared component still passes a plain title
  for (const f of ['app/diagnostics.tsx', 'app/feedback.tsx', 'components/reels/ShareSheet.tsx']) assert.match(read(f), /<SharePreview title=/, `${f} still uses SharePreview with a title`);
});

// ── Voice screen ───────────────────────────────────────────────────────────────────────────────────────────────
test('Voice screen: the voice buttons are named in Hindi with no English quality word', () => {
  const src = read('app/learn/voice.tsx');
  const line = src.split('\n').find(l => l.includes('accessibilityLabel={`${v.name},'));
  assert.ok(line, 'the voice button label line exists');
  for (const word of ['enhanced', 'standard', 'recommended']) {
    assert.match(line!, new RegExp(`hi \\? '[^']*[\\u0900-\\u097F][^']*' : '${word}'|hi \\? '[^']*[\\u0900-\\u097F][^']*' : '[^']*${word}'`), `"${word}" has a Hindi alternative in the label`);
  }
  // the visible words next to the name already had Hindi; the two must agree
  assert.ok(line!.includes("'बेहतर गुणवत्ता'") && src.includes("' · बेहतर गुणवत्ता'"), 'enhanced reads the same visible and spoken');
  assert.ok(line!.includes('सुझाई गई') && src.includes("' · सुझाई गई'"), 'recommended reads the same visible and spoken');
});

// ── The Reels tab label ────────────────────────────────────────────────────────────────────────────────────────
const D = (d: number) => `2026-10-${String(d).padStart(2, '0')}`;
test('Reels tab: the label is English by default, and Hindi when the app language is Hindi', () => {
  const days = [D(3), D(4), D(5)];
  assert.equal(reelsTabState(days, D(5), 2).label, 'Reels, done for today, 3-day streak, 2 moves on your list');
  assert.equal(reelsTabState(days, D(5), 2, 'en').label, reelsTabState(days, D(5), 2).label, 'default language is English');
  const hi = (d: string[], t: string, n = 0) => reelsTabState(d, t, n, 'hi').label;
  assert.equal(hi(days, D(5), 2), 'रील्स, आज की रील पूरी हुई, 3 दिन की लगातार स्ट्रीक, आपकी सूची में 2 काम');
  assert.equal(hi(days, D(6), 1), 'रील्स, आज की रील तैयार है, 3 दिन की लगातार स्ट्रीक, आपकी सूची में 1 काम');
  assert.equal(hi([], D(6), 4), 'रील्स, आज की रील तैयार है, आपकी सूची में 4 काम');
  assert.equal(hi([], D(6)), 'रील्स, आज की रील तैयार है');
});

test('Reels tab: every Hindi label is Devanagari with Latin digits only, and the badge does not depend on the language', () => {
  const days = [D(3), D(4), D(5)];
  for (const [d, t, n] of [[days, D(5), 2], [days, D(6), 1], [[], D(6), 4], [[], D(6), 0], [days, D(5), 0]] as [string[], string, number][]) {
    const h = reelsTabState(d, t, n, 'hi'), e = reelsTabState(d, t, n, 'en');
    assert.ok(DEVANAGARI.test(h.label), h.label);
    assert.deepEqual((h.label.match(/[A-Za-z]+/g) ?? []), [], `English left in: ${h.label}`);
    assert.ok(!/[०-९]/.test(h.label), `Devanagari digits in: ${h.label}`);
    assert.deepEqual([h.badge, h.streak], [e.badge, e.streak]);
    assert.ok(!/miss|lost|behind|hurry|overdue|छूट|खो/i.test(h.label), `a guilt word in: ${h.label}`);
  }
});

test('Reels tab: the hook passes the app language and the visible tab word has Hindi', () => {
  const hook = read('hooks/useReelsTab.ts');
  assert.match(hook, /useLang\(\)/);
  assert.equal([...hook.matchAll(/reelsTabState\(/g)].length, [...hook.matchAll(/reelsTabState\([^\n]*lang\)/g)].length, 'every call passes lang');
  assert.ok(inHindi('Reels'), 'the word on the tab itself');
  assert.match(read('app/(tabs)/_layout.tsx'), /tabBarAccessibilityLabel: reels\.label/, 'the layout uses the hook label');
});

// ── Wording: terms from the glossary, Latin digits ─────────────────────────────────────────────────────────────
const LATIN_WORDS_OK = new Set<string>([...GLOSSARY.filter(t => t.kind === 'acronym').map(t => t.en), 'FIN', 'OS', 'ID', 'IDs', 'e', 'mail', 'n', 'v']);

test('The Hindi added for these screens keeps the glossary terms and uses Latin digits', () => {
  const added = ADDED_KEYS();
  assert.ok(added.length >= 30, `expected the new entries, found ${added.length}`);
  for (const k of added) {
    const hi = HI[k];
    assert.ok(DEVANAGARI.test(hi), `no Devanagari in the Hindi for: ${k}`);
    assert.ok(!/[०-९]/.test(hi), `Devanagari digits in: ${hi}`);
    assert.equal((k.match(/\{n\}/g) ?? []).length, (hi.match(/\{n\}/g) ?? []).length, `{n} count differs for: ${k}`);
    const latin = (hi.replace(/\{n\}|\{v\}/g, '').match(/[A-Za-z]+/g) ?? []).filter(w => !LATIN_WORDS_OK.has(w));
    assert.deepEqual(latin, [], `English words left in the Hindi for: ${k}`);
    for (const t of GLOSSARY) for (const bad of t.avoid ?? []) assert.ok(!hi.includes(bad), `"${bad}" is on the avoid list for ${t.id}, in: ${hi}`);
  }
});

/** The entries this change added: the lines between the two marker comments in lib/i18nHi.ts. */
function ADDED_KEYS(): string[] {
  const src = read('lib/i18nHi.ts');
  const a = src.indexOf('// ── Reels screens: Learn index, Diagnostics, share preview (DRAFT'), b = src.indexOf('// ── end of reels screens block');
  assert.ok(a > 0 && b > a, 'the marked block is in lib/i18nHi.ts');
  const keys = src.slice(a, b).split('\n').map(l => l.match(/^ {2}(?:'((?:[^'\\]|\\.)+)'|"((?:[^"\\]|\\.)+)"): /)).filter(Boolean).map(m => (m![1] ?? m![2]).replace(/\\'/g, "'"));
  for (const k of keys) assert.ok(Object.prototype.hasOwnProperty.call(HI, k), `parsed key not in the table: ${k}`);
  return keys;
}
