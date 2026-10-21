// Share as an image: the words on the card are pure, come only from the library's example reel, fit the card, and exist for every reel in
// both languages; and the share flow files are wired to the card.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { LIBRARY } from '../lib/reels/library.ts';
import { CARD, CARD_MAX, TOPIC_LABEL, cardText, fitLine } from '../lib/reels/sharecard.ts';
import { personaliseReels } from '../lib/reels/personal.ts';
import { personalisePlay } from '../lib/reels/personal-play.ts';
import { shareText } from '../lib/reels/share.ts';
import type { Mine } from '../lib/reels/mine.ts';

const root = path.join(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const LANGS = ['en', 'hi'] as const;

test('share card: every library reel has a takeaway, a title and a topic chip in both languages', () => {
  assert.ok(LIBRARY.length >= 100);
  for (const r of LIBRARY) for (const lang of LANGS) {
    const c = cardText(r.id, lang);
    assert.ok(c, `${r.id} has no card`);
    assert.ok(c.takeaway.length > 10, `${r.id}/${lang}: takeaway is missing`);
    assert.ok(c.title.length > 2, `${r.id}/${lang}: title is missing`);
    assert.equal(c.topic, TOPIC_LABEL[r.topic][lang], `${r.id}/${lang}: topic chip`);
    assert.ok(c.topic.length > 0 && c.topic.length <= CARD_MAX.topic);
  }
  assert.equal(cardText('nope', 'en'), null);
});

test('share card: nothing overflows the card, and nothing in it is a link or a brand it should not name', () => {
  for (const r of LIBRARY) for (const lang of LANGS) {
    const c = cardText(r.id, lang)!;
    assert.ok(c.title.length <= CARD_MAX.title, `${r.id}/${lang}: title is ${c.title.length} characters`);
    assert.ok(c.takeaway.length <= CARD_MAX.takeaway, `${r.id}/${lang}: takeaway is ${c.takeaway.length} characters`);
    const all = Object.values(c).join(' ');
    assert.ok(!/http|www\.|\.com|@/i.test(all), `${r.id}/${lang}: card carries a link`);
    assert.ok(!/claude|anthropic|co-authored/i.test(all), `${r.id}/${lang}: names a tool it should not`);
    assert.ok(!all.includes('undefined') && !all.includes('NaN') && !all.includes('{'), `${r.id}/${lang}: unfilled text`);
    assert.ok(c.notAdvice.length > 0 && c.footer.includes('FIN·OS'));
    if (lang === 'hi') assert.match(c.takeaway, /[ऀ-ॿ]/, `${r.id}: Hindi card has no Hindi`);
  }
  assert.equal(cardText(LIBRARY[0].id, 'en')!.footer, 'Money reels by FIN·OS');
  assert.match(cardText(LIBRARY[0].id, 'en')!.notAdvice, /not advice/);
  assert.match(cardText(LIBRARY[0].id, 'hi')!.notAdvice, /सलाह नहीं/);
});

test('share card: it is the reel\'s example version, whatever the person has entered', () => {
  // Odd figures that no library reel contains, in every field the personalised reels read.
  const mine: Mine = { sip: 13579, spend: 24680, fund: 97531, loan: { label: { en: 'Home loan', hi: 'होम लोन' }, balance: 7654321, rate: 8.37, emi: 61357 } };
  const personal = personalisePlay(personaliseReels(LIBRARY, mine), mine);
  const changed = personal.filter(p => p.mine);
  assert.ok(changed.length >= 3, 'the fixture should personalise at least three reels');
  const needles = ['13579', '13,579', '24680', '24,680', '97531', '97,531', '7654321', '76,54,321', '61357', '61,357', '8.37'];
  for (const p of changed) for (const lang of LANGS) {
    const c = cardText(p.id, lang)!;
    const base = LIBRARY.find(r => r.id === p.id)!;
    assert.equal(c.takeaway, cardText(base.id, lang)!.takeaway);
    const all = Object.values(c).join(' ');
    for (const n of needles) assert.ok(!all.includes(n), `${p.id}/${lang}: card contains the person's figure ${n}`);
  }
  // The builder takes an id and a language only; it cannot be handed a reel, so it cannot be handed a personalised one.
  const src = read('lib/reels/sharecard.ts');
  assert.ok(!/reelsStorage|AsyncStorage|loadMine|from '@\/lib\/reels\/(mine|personal)/.test(src), 'sharecard.ts must not read personal data');
  assert.equal(cardText.length, 2);
});

test('share card: the digits on the card all come from the example reel', () => {
  for (const r of LIBRARY) for (const lang of LANGS) {
    const c = cardText(r.id, lang)!;
    const digits = (s: string) => (s.match(/\d+/g) ?? []);
    const fromReel = new Set([...digits(r.title[lang]), ...digits(r.quiz.why[lang])]);
    for (const d of [...digits(c.title), ...digits(c.takeaway)]) assert.ok(fromReel.has(d) || [...fromReel].some(x => x.includes(d)), `${r.id}/${lang}: ${d} is not from the example`);
    assert.deepEqual(digits(c.footer.replace('FIN·OS', '')), [], 'the footer has no figures');
  }
});

test('fitLine: keeps short text, cuts long text at a sentence or a word, never mid-word', () => {
  assert.equal(fitLine('  Short   one. ', 40), 'Short one.');
  const long = 'First sentence is here. Second sentence goes on and on for a long time without any stop at all.';
  assert.equal(fitLine(long, 40), 'First sentence is here.');
  const noStop = 'word '.repeat(40).trim();
  const cut = fitLine(noStop, 30);
  assert.ok(cut.length <= 30 && cut.endsWith('…') && !/wor…$/.test(cut), cut);
  assert.ok(fitLine('x'.repeat(100), 30).length <= 30);
  assert.equal(CARD.w / CARD.h, CARD.drawW / CARD.drawH);
  assert.equal(CARD.w / CARD.h, 0.8);
});

test('share flow: the sheet offers image and text, the screen opens it, and the capture goes through share.ts', () => {
  const sheet = read('components/reels/ShareSheet.tsx');
  assert.match(sheet, /import \{ ShareCard \}/);
  assert.match(sheet, /Share as image/);
  assert.match(sheet, /Share as text/);
  assert.match(sheet, /shareCardImage/);
  assert.match(sheet, /SharePreview/, 'text share keeps its preview');
  assert.match(sheet, /catch[\s\S]*setMode\('text'\)/, 'a failed capture falls back to the text share');
  assert.match(read('app/learn/reels.tsx'), /<ShareSheet /);
  const card = read('components/reels/ShareCard.tsx');
  assert.match(card, /<Mitra /);
  assert.ok(!/AsyncStorage|loadMine|reelsStorage/.test(card + sheet), 'the card and sheet read no personal data');
  const share = read('lib/reels/share.ts');
  assert.match(share, /react-native-view-shot/);
  assert.match(share, /deleteTempFile/);
  assert.match(share, /expo-sharing/);
  assert.match(share, /image\/png/);
  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.dependencies['react-native-view-shot'], 'react-native-view-shot is a dependency');
});

test('share as text still works and is unchanged', () => {
  for (const lang of LANGS) assert.ok(shareText(LIBRARY[0].id, lang).includes(LIBRARY[0].quiz.why[lang]));
});
