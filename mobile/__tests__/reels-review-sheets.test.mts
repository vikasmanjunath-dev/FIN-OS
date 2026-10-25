// The tooling behind the two human release gates for Money Reels (a native Hindi reader and a compliance reader): the Hindi glossary and lint, the claim
// extractor, and the sheets built from them. These tests hold the tools, not the content: a lint must fire on a crafted bad example and stay quiet on a good
// one, a planted claim must be found, the sheets must be the same bytes every time, and the whole library must run through without a crash.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLOSSARY, LATIN_OK } from '../lib/reels/hindi-glossary.ts';
import { LINT_CODES, LINT_INFO, buildStats, lintEntry, lintLibrary, nfc, spellingKey, formsIn, type LintCode, type LintEntry } from '../lib/reels/hindi-lint.ts';
import { CLAIM_CATEGORIES, TAXCORE_FY, detect, extractClaims, rupees, sentences, type ClaimInput } from '../lib/reels/claims.ts';
import { reelTexts } from '../lib/reels/review-texts.ts';
import { csvCell, gateState, reviewCorpus, toCsv, type CorpusItem } from '../lib/reels/review-corpus.ts';
import { buildHindiSheets, TOPIC_FILES } from '../lib/reels/hindi-sheets.ts';
import { buildComplianceSheets, parseFigureFindings } from '../lib/reels/compliance-sheets.ts';
import { LIBRARY } from '../lib/reels/library.ts';
import { DRAFT_REELS } from '../lib/reels/drafts.ts';
import { textsOf } from '../lib/reels/validate.ts';
import { REVIEWED } from '../lib/reels/review.ts';
import { STD_NEW } from '../lib/taxcore.ts';

const e = (en: string, hi: string, extra: Partial<LintEntry> = {}): LintEntry => ({ id: 't', where: 'Scene 1', en, hi, ...extra });
const codes = (x: LintEntry, others: LintEntry[] = []): LintCode[] => {
  const lib = lintLibrary([x, ...others]);
  return lib.byReel.get(x.id)![0].flags.map(f => f.code);
};

// ── the glossary ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

test('glossary: every term has an English form and a Hindi form, and the forms are well formed', () => {
  assert.ok(GLOSSARY.length >= 50);
  const ids = new Set<string>();
  for (const t of GLOSSARY) {
    assert.ok(!ids.has(t.id), `duplicate term id ${t.id}`); ids.add(t.id);
    assert.ok(t.en.trim() && t.hi.trim(), `${t.id} needs both an English and a Hindi form`);
    assert.doesNotThrow(() => new RegExp(t.match, 'i'), `${t.id}: match is not a valid regex`);
    if (t.kind === 'acronym') {
      assert.equal(t.hi, t.en, `${t.id}: an acronym is printed in Latin letters, as the app does`);
      assert.ok(t.full, `${t.id}: an acronym should say what it stands for`);
      for (const a of t.avoid ?? []) assert.match(a, /[ऀ-ॿ]/, `${t.id}: a replace-me form of an acronym is its Devanagari spelling`);
    } else {
      assert.match(t.hi, /[ऀ-ॿ]/, `${t.id}: the proposed Hindi must be in Devanagari`);
      assert.match(t.en, /[A-Za-z]/);
    }
    const all = [t.hi, ...(t.allowed ?? []), ...(t.avoid ?? [])].map(nfc);
    assert.equal(new Set(all).size, all.length, `${t.id}: a form is listed twice`);
  }
});

test('glossary: the terms the brief names are all there', () => {
  const have = new Set(GLOSSARY.map(t => t.id));
  for (const id of ['sip', 'emi', 'nav', 'mutual-fund', 'emergency-fund', 'credit-score', 'inflation', 'interest', 'premium', 'term-plan', 'kyc', 'upi', 'otp', 'fd', 'ppf', 'epf', 'nps', 'elss', 'section', 'tds', 'itr', 'gst']) assert.ok(have.has(id), id);
});

test('glossary: the English finds the term in English text and the Hindi finds it in Hindi text', () => {
  const emergency = GLOSSARY.find(t => t.id === 'emergency-fund')!;
  assert.match('Build an emergency fund first.', new RegExp(emergency.match, 'i'));
  assert.deepEqual(formsIn('पहले आपातकालीन निधि बनाएँ।').map(u => u.form), [nfc('आपातकालीन निधि')]);
  assert.deepEqual(formsIn('पहले इमरजेंसी फ़ंड बनाएँ।').map(u => u.kind), ['avoid']);
  // the longest form wins: a mutual fund is not also counted as a fund
  assert.deepEqual(formsIn('म्यूचुअल फ़ंड').map(u => u.term.id), ['mutual-fund']);
  assert.ok(LATIN_OK.has('SIP') && LATIN_OK.has('KYC'));
});

test('hindi: a nukta written as one character or two is the same spelling', () => {
  assert.equal(nfc('फ़'), nfc('फ़'));
  assert.equal(spellingKey('ज़रूरी'), spellingKey('जरूरी'));
  assert.equal(spellingKey('महँगाई'), spellingKey('महंगाई'));
  assert.notEqual(spellingKey('जरूरी'), spellingKey('ज़रा'));
});

// ── each lint fires on a bad example and is quiet on a good one ─────────────────────────────────────────────────────────────────────────

test('lint: every rule is documented', () => {
  for (const c of LINT_CODES) assert.ok(LINT_INFO[c].label && LINT_INFO[c].why, c);
});

const CASES: { code: LintCode; bad: LintEntry; good: LintEntry; others?: LintEntry[] }[] = [
  { code: 'mixed-term', bad: e('Keep an emergency fund.', 'अपना emergency fund रखें।'), good: e('Keep an emergency fund.', 'अपनी आपातकालीन निधि रखें।') },
  { code: 'term-other', bad: e('Check your credit score today.', 'आज अपना स्कोर देखें।'), good: e('Check your credit score today.', 'आज अपना क्रेडिट स्कोर देखें।') },
  { code: 'english-leftover', bad: e('It is sustainable.', 'यह बहुत sustainable है।'), good: e('It is a SIP.', 'यह SIP है।') },
  { code: 'acronym-unlisted', bad: e('It is a XYZQ.', 'यह XYZQ है।'), good: e('It is a SIP.', 'यह SIP है।') },
  { code: 'untranslated', bad: e('Pay on time every month', 'Pay on time every month'), good: e('Pay on time every month', 'हर महीने समय पर चुकाएँ') },
  { code: 'digits', bad: e('Save ₹50,000.', '₹५०,००० बचाएँ।'), good: e('Save ₹50,000.', '₹50,000 बचाएँ।') },
  { code: 'figure-mismatch', bad: e('Save ₹5,000 a month.', 'हर महीने ₹6,000 बचाएँ।'), good: e('Save ₹5,000 a month.', 'हर महीने ₹5,000 बचाएँ।') },
  { code: 'punctuation', bad: e('Save a little (every month).', 'थोड़ा (हर महीने बचाएँ।'), good: e('Save a little (every month).', 'थोड़ा (हर महीने) बचाएँ।') },
  { code: 'spacing', bad: e('Save a little.', 'थोड़ा  बचाएँ ।'), good: e('Save a little.', 'थोड़ा बचाएँ।') },
  { code: 'length-ratio', bad: e('Pay your bill on time.', 'अपने बिल का भुगतान हर बार तय की गई आख़िरी तारीख़ से पहले ज़रूर कर दें।'), good: e('Pay your bill on time.', 'अपना बिल समय पर चुकाएँ।') },
  { code: 'ending', bad: e('Pay your bill on time.', 'अपना बिल समय पर चुकाएँ'), good: e('Pay your bill on time.', 'अपना बिल समय पर चुकाएँ।') },
  { code: 'placeholder', bad: e('You save {x}.', 'आप {x} बचाते हैं'), good: e('You save ₹5,000.', 'आप ₹5,000 बचाते हैं।') },
  { code: 'mt-tell', bad: e('Look after yourself.', 'अपने आप को सँभालें।'), good: e('Look after yourself.', 'ख़ुद को सँभालें।') },
];

for (const c of CASES) {
  test(`lint ${c.code}: fires on a bad example, quiet on a good one`, () => {
    assert.ok(codes(c.bad, c.others).includes(c.code), `${c.code} should fire on: ${c.bad.hi}`);
    assert.ok(!codes(c.good, c.others).includes(c.code), `${c.code} should be quiet on: ${c.good.hi}`);
  });
}

test('lint term-variant: an avoid form is a likely problem, an alternative is only worth a look, the proposed form is quiet', () => {
  const lib = lintLibrary([
    e('Build an emergency fund.', 'इमरजेंसी फ़ंड बनाएँ।', { id: 'a' }),
    e('Build an emergency fund.', 'आपातकालीन निधि बनाएँ।', { id: 'b' }),
    e('Build an emergency fund.', 'आपातकालीन फ़ंड बनाएँ।', { id: 'c' }),
  ]);
  const flag = (id: string) => lib.byReel.get(id)![0].flags.find(f => f.code === 'term-variant');
  assert.equal(flag('a')?.severity, 'likely');
  assert.equal(flag('c')?.severity, 'check');
  assert.equal(flag('b'), undefined);
  assert.equal(flag('a')?.key, 'term-variant:emergency-fund');
  const row = lib.stats.variants.find(v => v.term.id === 'emergency-fund')!;
  assert.deepEqual(row.forms.filter(f => f.count > 0).map(f => [f.form, f.count]).sort(), [[nfc('आपातकालीन निधि'), 1], [nfc('आपातकालीन फ़ंड'), 1], [nfc('इमरजेंसी फ़ंड'), 1]].sort());
  assert.ok(row.mixed);
});

test('lint spelling-variant: the minority spelling is flagged, the majority is not', () => {
  const entries = [...Array(3).keys()].map(i => e('It is important.', 'यह ज़रूरी है।', { id: `m${i}` })).concat(e('It is important.', 'यह जरूरी है।', { id: 'odd' }));
  const lib = lintLibrary(entries);
  assert.ok(lib.byReel.get('odd')![0].flags.some(f => f.code === 'spelling-variant'));
  assert.ok(!lib.byReel.get('m0')![0].flags.some(f => f.code === 'spelling-variant'));
  assert.equal(lib.stats.spelling.length, 1);
});

test('lint placeholder: a slider template whose Hindi uses different gaps is caught', () => {
  const bad = e('You reach ₹5 lakh.', 'आप ₹5 लाख तक पहुँचते हैं।', { tpl: { en: 'You reach {value}.', hi: 'आप {रकम} तक पहुँचते हैं।' } });
  const good = e('You reach ₹5 lakh.', 'आप ₹5 लाख तक पहुँचते हैं।', { tpl: { en: 'You reach {value}.', hi: 'आप {value} तक पहुँचते हैं।' } });
  assert.ok(codes(bad).includes('placeholder'));
  assert.ok(!codes(good).includes('placeholder'));
});

test('lint figure-mismatch: number words, lakh/crore and thousands', () => {
  assert.deepEqual(codes(e('Ten more years.', '10 साल और।')), []);
  assert.deepEqual(codes(e('Three months of expenses.', '3 महीने का ख़र्च।')), []);
  assert.ok(codes(e('Save ₹5 lakh.', 'आप ₹5 करोड़ बचाएँ।')).includes('figure-mismatch'));
  assert.ok(codes(e('Saves 12% a year.', 'हर साल 12 बचाएँ।')).includes('figure-mismatch'));
});

test('lint: quoted names and web addresses are not English leftovers; a good Hindi sentence has no flags at all', () => {
  assert.deepEqual(codes(e('A message from “BANK-ALERT”.', '“BANK-ALERT” का संदेश।')), []);
  assert.deepEqual(codes(e('Open pan-update.in', 'pan-update.in खोलें')), []);
  assert.deepEqual(codes(e('Your EMI is due on the 5th.', 'आपकी EMI 5 तारीख़ को देय है।')), []);
});

test('lint: the machine-translation list is short and does not fire on a plain passive or reduplication', () => {
  assert.deepEqual(codes(e('Go slowly, step by step.', 'धीरे धीरे, क़दम-क़दम चलें।')), []);
  assert.ok(codes(e('The form is filled by you.', 'फ़ॉर्म आपके द्वारा भरा जाता है।')).includes('mt-tell'));
  assert.ok(codes(e('It is in the bank.', 'यह बैंक में में है।')).includes('mt-tell'));
});

test('lint: runs the same with or without library statistics, and never throws on odd input', () => {
  for (const s of ['', ' ', '।', '{}', '“', 'A'.repeat(500), 'अ'.repeat(500), '₹'.repeat(10), '\u0000']) assert.doesNotThrow(() => lintEntry(e(s, s)));
  const x = e('Pay the bill.', 'बिल चुकाएँ।');
  assert.deepEqual(lintEntry(x), lintEntry(x, buildStats([x])));
});

// ── claims ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const claim = (en: string, topic = 'tax', where = 'Scene 1'): ClaimInput => ({ id: 'planted', topic, origin: 'reel', where, en, hi: '' });
const cats = (en: string, topic?: string) => extractClaims([claim(en, topic)]).map(k => k.category);

test('claims: planted regulatory and factual claims are found, each with an id, reel, exact text, category and figure', () => {
  const found = extractClaims([
    claim('SEBI regulates mutual funds.'),
    claim('Section 80C lets you deduct up to ₹1.5 lakh a year.'),
    claim('Bank deposits are insured up to ₹5 lakh per depositor (DICGC).'),
    claim('PPF pays 7.1% a year.'),
    claim('Report fraud on 1930.'),
    claim('You should invest in this fund for guaranteed returns.'),
    claim('Example, FY 2025-26: pay ₹15 lakh.'),
    claim('Listed equity held more than 12 months is long term.'),
  ]);
  const has = (cat: string, fig: string) => found.some(k => k.category === cat && k.figure.includes(fig));
  assert.ok(has('regulator', 'SEBI'));
  assert.ok(has('tax-section', 'Section 80C'));
  assert.ok(has('tax-limit', '₹1.5 lakh'));
  assert.ok(has('deposit-insurance', '₹5 lakh'));
  assert.ok(has('regulator', 'DICGC'));
  assert.ok(has('scheme', 'PPF'));
  assert.ok(has('rate-fact', '7.1%'));
  assert.ok(has('helpline', '1930'));
  assert.ok(has('advice-wording', 'guaranteed'));
  assert.ok(has('advice-wording', 'should invest'));
  assert.ok(has('tax-year', 'FY 2025-26'));
  assert.ok(has('rule', 'more than 12 months'));
  for (const k of found) {
    assert.match(k.id, /^planted\.\d\d$/);
    assert.equal(k.reel, 'planted'); assert.ok(k.text && k.figure && CLAIM_CATEGORIES.includes(k.category));
    assert.equal(k.source, '', 'the source is for the compliance reader to fill');
  }
  assert.equal(new Set(found.map(k => k.id)).size, found.length, 'claim ids are unique');
});

test('claims: a rate called an assumption is not a claim, a rate given as fact is', () => {
  assert.ok(!cats('Assume 8% a year for this example.').includes('rate-fact'));
  assert.ok(!cats('At an assumed 12% a year, ₹5,000 a month grows.').includes('rate-fact'));
  const k = extractClaims([claim('The FD rate is 7% a year.')]).find(x => x.category === 'rate-fact')!;
  assert.equal(k.framing, 'stated as fact');
  const els = extractClaims([claim('Imagine rates are low.'), claim('The FD rate is 7% a year.')]).find(x => x.category === 'rate-fact')!;
  assert.equal(els.framing, 'assumed elsewhere in the reel');
  // the "assumes" half of a trust note is assumptions by definition, unless it cites a rule
  assert.ok(!extractClaims([claim('₹10 lakh at 9% a year for 20 years.', 'loans', 'How this is worked out: assumes')]).some(x => x.category === 'rate-fact'));
  assert.ok(extractClaims([claim('The 12% employee share is the usual EPF rule.', 'retire', 'How this is worked out: assumes')]).some(x => x.category === 'rate-fact'));
});

test('claims: disclaimers are not advice, and a scam-safety reel may say "safe"', () => {
  assert.ok(!cats('Returns are not guaranteed.').includes('advice-wording'));
  assert.ok(!cats('There is no guarantee of returns.').includes('advice-wording'));
  assert.ok(cats('Guaranteed returns of 12%.').includes('advice-wording'));
  assert.ok(cats('This is the safest option.', 'invest').includes('advice-wording'));
  assert.ok(!cats('Keep your card safe and never share the OTP.', 'safety').includes('advice-wording'));
  assert.ok(cats('Guaranteed profit in a week.', 'safety').includes('advice-wording'));
});

test('claims: a claim a reel shows as a wrong option or inside a scam message is labelled so', () => {
  const m = (where: string, topic: string) => extractClaims([claim('Guaranteed returns of 12%.', topic, where)])[0].meant;
  assert.equal(m('Quiz option 2', 'invest'), 'wrong answer option');
  assert.equal(m('Quiz option 2 (right answer)', 'invest'), 'asserted');
  assert.equal(m('Interaction: card 3 (myth)', 'invest'), 'wrong answer option');
  assert.equal(m('Interaction: message piece 2 (red flag)', 'safety'), 'scam example');
  assert.equal(m('Scene 1', 'invest'), 'asserted');
});

test('claims cross-check: amounts and rates are compared with the constants the app has, and a planted wrong one is a mismatch', () => {
  const one = (en: string, cat: string) => extractClaims([claim(en)]).find(k => k.category === cat)!;
  assert.equal(STD_NEW, 75_000);
  const std = one('The standard deduction is ₹75,000 in the new regime.', 'tax-limit');
  assert.equal(std.check.status, 'matches'); assert.match(std.check.note, /STD_NEW/);
  assert.equal(one('Section 80C lets you deduct up to ₹1.5 lakh a year.', 'tax-limit').check.status, 'matches');
  assert.equal(one('Section 80C lets you deduct up to ₹2 lakh a year.', 'tax-limit').check.status, 'mismatch');
  assert.equal(one('The standard deduction is ₹60,000 in the new regime.', 'tax-limit').check.status, 'mismatch');
  assert.equal(one('Tax is nil up to ₹12 lakh under Section 87A.', 'tax-limit').check.status, 'matches');
  assert.equal(one('Bank deposits are insured up to ₹5 lakh per depositor.', 'deposit-insurance').check.status, 'matches-literal');
  assert.equal(one('Bank deposits are insured up to ₹3 lakh per depositor.', 'deposit-insurance').check.status, 'mismatch');
  assert.equal(one('The 30% slab starts above ₹24 lakh.', 'tax-rate').check.status, 'matches');
  assert.equal(one('The 33% slab applies to high incomes.', 'tax-rate').check.status, 'mismatch');
  assert.equal(one('Tax saved includes 4% cess.', 'tax-rate').check.status, 'matches');
  assert.equal(one('Tax saved includes 5% cess.', 'tax-rate').check.status, 'mismatch');
  assert.equal(one('Example, FY 2026-27: pay ₹15 lakh.', 'tax-year').check.status, 'matches');
  assert.equal(one('Example, FY 2024-25: pay ₹15 lakh.', 'tax-year').check.status, 'mismatch');
  assert.equal(TAXCORE_FY, '2026-27');
  assert.equal(one('Report fraud on 1930.', 'helpline').check.status, 'known');
  // an income given as an input is not compared with the standard deduction
  assert.notEqual(extractClaims([claim('Pay ₹15 lakh, deductions on top of the standard deduction, tax is about ₹97,500.')]).find(k => k.category === 'tax-example' || k.category === 'tax-limit')?.check.status, 'mismatch');
});

test('claims: amounts and sentences are read correctly', () => {
  assert.deepEqual(rupees('₹1,50,000 or ₹1.5 lakh or Rs 50k or ₹2 crore').map(a => a.value), [150000, 150000, 50000, 20000000]);
  assert.equal(sentences('Pay ₹1.5 lakh. Then wait.').length, 2);
  assert.deepEqual(detect('Nothing to see here.', 'basics', false), []);
});

test('claims: the figure findings file is read by section letter', () => {
  const md = '# T\n## A. hidden\n- one-reel | says x | really y\n## B. rounding\n- one-reel | z | w\n- two-reel | p | q\n';
  assert.deepEqual(parseFigureFindings(md), { 'one-reel': ['[A] says x | really y', '[B] z | w'], 'two-reel': ['[B] p | q'] });
});

// ── the texts of a reel ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

test('review texts: every text the validator reads is also on the sheet, each with a label', () => {
  for (const r of [...LIBRARY, ...DRAFT_REELS]) {
    const mine = reelTexts(r);
    const have = new Map<string, number>();
    for (const t of mine) { assert.ok(t.where.trim(), r.id); const k = `${t.en}\u0000${t.hi}`; have.set(k, (have.get(k) ?? 0) + 1); }
    for (const t of textsOf(r)) {
      const k = `${t.en}\u0000${t.hi}`, n = have.get(k) ?? 0;
      assert.ok(n > 0, `${r.id}: "${t.en}" is read by the validator but missing from the review texts`);
      have.set(k, n - 1);
    }
  }
});

// ── the sheets ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Minimal CSV reader for the tests (handles quotes, doubled quotes and line breaks inside cells). */
function parseCsv(s: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = '', q = false;
  const text = s.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const corpus = reviewCorpus();

test('csv: cells with commas, quotes and line breaks survive; the file starts with a byte-order mark for Excel', () => {
  const rows = [['a', 'b,c', 'd "q"', 'e\nf'], ['हिंदी', '', '1', '2']];
  const out = toCsv(rows);
  assert.ok(out.startsWith('﻿'));
  assert.deepEqual(parseCsv(out), rows);
  assert.equal(csvCell('plain'), 'plain');
});

test('corpus: every live reel, every draft reel and every money fact is in it, once', () => {
  const ids = corpus.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const r of LIBRARY) assert.ok(ids.includes(r.id), r.id);
  for (const r of DRAFT_REELS) assert.ok(ids.includes(r.id), r.id);
  assert.ok(corpus.some(c => c.release === 'fact'));
  assert.ok(corpus.every(c => c.texts.length > 0));
  for (const c of corpus) assert.equal(c.signOff, REVIEWED[c.id] ?? null, 'sign-offs are read from review.ts, never set here');
});

test('hindi sheets: deterministic, complete, rectangular, with the empty columns for the reviewer', () => {
  const a = buildHindiSheets(corpus), b = buildHindiSheets(corpus);
  assert.deepEqual(a.files, b.files);
  assert.ok(a.files['README.md'] && a.files['glossary.csv'] && a.files['variants.csv'] && a.files['spelling.csv'] && a.files['reels-index.csv']);
  for (const t of TOPIC_FILES) if (corpus.some(c => c.topic === t)) assert.ok(a.files[`topic-${t}.csv`], t);
  let rowsSeen = 0; const reelsSeen = new Set<string>();
  for (const [name, body] of Object.entries(a.files)) {
    if (!name.endsWith('.csv')) continue;
    const rows = parseCsv(body), w = rows[0].length;
    assert.ok(rows.every(r => r.length === w), `${name}: every row has ${w} cells`);
    if (name.startsWith('topic-')) {
      assert.deepEqual(rows[0].slice(0, 6), ['Reel ID', 'Release', 'Gate', 'Where', 'English', 'Hindi']);
      assert.deepEqual(rows[0].slice(-2), ['Reviewer fix', 'OK']);
      for (const r of rows.slice(1)) { assert.equal(r[w - 1], ''); assert.equal(r[w - 2], ''); reelsSeen.add(r[0]); rowsSeen++; }
    }
  }
  assert.equal(rowsSeen, corpus.reduce((n, c) => n + c.texts.length, 0), 'every text is on a sheet');
  for (const c of corpus) assert.ok(reelsSeen.has(c.id), c.id);
});

test('compliance sheets: deterministic, one row per claim, the source column empty, the sign-off state listed for every reel', () => {
  const a = buildComplianceSheets(corpus), b = buildComplianceSheets(corpus);
  assert.deepEqual(a.files, b.files);
  const claims = parseCsv(a.files['claims.csv']);
  assert.equal(claims.length - 1, a.claims.length);
  const head = claims[0], src = head.findIndex(h => h.startsWith('Source')), verdict = head.findIndex(h => h.startsWith('Verdict'));
  assert.ok(src > 0 && verdict > 0);
  assert.ok(claims.slice(1).every(r => r[src] === '' && r[verdict] === ''));
  const idx = parseCsv(a.files['reels-index.csv']);
  assert.equal(idx.length - 1, corpus.length);
  const ci = idx[0].findIndex(h => h.startsWith('Compliance sign-off'));
  assert.ok(idx.slice(1).every(r => r[ci] === 'none' || r[ci].length > 0));
  assert.match(a.files['README.md'], /What a sign-off means/);
  assert.equal(parseCsv(a.files['summary-by-category.csv']).length - 1, CLAIM_CATEGORIES.length);
});

test('sheets list which reels have sign-offs, reading the review.ts record format', () => {
  const base = corpus.find(c => c.release === 'live')!;
  const signed: CorpusItem = { ...base, signOff: { hindi: 'A. Reader', compliance: 'B. Reader', on: '2026-11-01' } };
  const half: CorpusItem = { ...corpus.find(c => c.release === 'draft')!, signOff: { hindi: 'A. Reader', compliance: '', on: '2026-11-01' } };
  assert.equal(gateState(signed).signed, true);
  assert.equal(gateState(half).signed, false, 'both names are needed');
  const pair = [signed, half, ...corpus.filter(c => c !== base && c.id !== half.id)];
  const h = parseCsv(buildHindiSheets(pair).files['reels-index.csv']), c = parseCsv(buildComplianceSheets(pair).files['reels-index.csv']);
  const row = (rows: string[][], id: string) => rows.find(r => r[0] === id)!;
  assert.deepEqual(row(h, base.id).slice(4, 7), ['A. Reader', 'B. Reader', '2026-11-01']);
  assert.deepEqual(row(c, base.id).slice(4, 7), ['B. Reader', 'A. Reader', '2026-11-01']);
  assert.equal(row(h, half.id)[5], 'none');
  const topic = parseCsv(buildHindiSheets(pair).files[`topic-${base.topic}.csv`]);
  assert.equal(topic.find(r => r[0] === base.id)![2], 'signed off');
  assert.equal(topic.find(r => r[0] !== base.id && r[0] !== half.id && corpus.find(x => x.id === r[0])?.topic === base.topic)![2], 'not signed off');
});

test('library-wide run: the live library, the drafts and the facts go through both tools without a crash', () => {
  const hi = buildHindiSheets(corpus, ['महँगाई', 'आपातकालीन निधि']);
  assert.ok(hi.counts.reels >= 227 && hi.counts.texts > 3000);
  assert.equal(hi.lint.textsChecked, hi.counts.texts);
  assert.ok(hi.issues.length >= 1);
  for (const c of LINT_CODES) assert.ok(hi.lint.perCode[c].flags >= hi.lint.perCode[c].likely);
  const co = buildComplianceSheets(corpus);
  assert.ok(co.claims.length > 100);
  for (const cat of CLAIM_CATEGORIES) assert.ok(co.byCategory.find(r => r.category === cat), cat);
  assert.equal(co.counts.reels, hi.counts.reels);
  assert.equal(hi.counts.signed, corpus.filter(c => c.release !== 'fact' && c.signOff?.hindi && c.signOff?.compliance).length);
});
