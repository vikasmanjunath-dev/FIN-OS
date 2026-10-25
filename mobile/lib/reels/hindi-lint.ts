// First-pass checks on the Hindi of Money Reels, so a native reader spends their time on judgement (is this how a person would say it?) and not on
// hunting for double spaces and missing ।. Pure: text in, flags out. It never edits anything and never decides a word is wrong; a flag means "look here".
// Run on the whole library by scripts/hindi-sheet.mts (`npm run reels:hindi`). The terminology it checks against is lib/reels/hindi-glossary.ts.
//
// Every rule is listed in LINT_INFO with why it exists. The rules that guess at machine translation are kept to four, each one a pattern that is
// wrong or stiff in nearly every use, so a flag is worth reading.
import { GLOSSARY, LATIN_OK, type Term } from '@/lib/reels/hindi-glossary';

export type LintCode =
  | 'mixed-term' | 'term-variant' | 'term-other' | 'spelling-variant' | 'english-leftover' | 'acronym-unlisted' | 'untranslated'
  | 'digits' | 'figure-mismatch' | 'punctuation' | 'spacing' | 'length-ratio' | 'ending' | 'placeholder' | 'mt-tell';

export type Severity = 'likely' | 'check';

export interface LintInfo { label: string; severity: Severity; why: string }

export const LINT_INFO: Record<LintCode, LintInfo> = {
  'mixed-term': { label: 'English term inside a Hindi sentence', severity: 'likely', why: 'The glossary has a Hindi word for this term; a bare English word in the middle of a Devanagari sentence reads as unfinished.' },
  'term-variant': { label: 'Term written a different way than elsewhere', severity: 'check', why: 'The same term appears in more than one form across the library. The sheet shows how many reels use each form.' },
  'term-other': { label: 'English term with no listed Hindi', severity: 'check', why: 'The English text has a glossary term but the Hindi uses none of its listed forms. Fine if a better phrase was used; confirm it.' },
  'spelling-variant': { label: 'Spelling differs from the rest of the library', severity: 'check', why: 'The same word is spelled two ways (nukta or chandrabindu, as in महँगाई / महंगाई). One spelling across the library reads as careful.' },
  'english-leftover': { label: 'English word left in Hindi text', severity: 'check', why: 'A Latin-letter word that is not a listed acronym. Right for a quoted message or a brand; otherwise it was probably not translated.' },
  'acronym-unlisted': { label: 'Acronym not in the glossary', severity: 'check', why: 'Capital letters the glossary does not know. Add it there if it is fine to keep in Latin letters.' },
  'untranslated': { label: 'Hindi is missing or the same as English', severity: 'likely', why: 'The Hindi text has no Devanagari, or equals the English.' },
  'digits': { label: 'Devanagari digits', severity: 'likely', why: 'The app prints Latin digits everywhere (₹1,50,000). A Devanagari digit here would look different from every other figure.' },
  'figure-mismatch': { label: 'Figures differ from the English', severity: 'likely', why: 'The numbers, %, ₹ or lakh/crore/thousand in the Hindi are not the ones in the English. A wrong figure is the worst translation error.' },
  'punctuation': { label: 'Unbalanced brackets or quotes', severity: 'likely', why: 'An opening bracket or quote with no closing one (or the reverse).' },
  'spacing': { label: 'Spacing', severity: 'likely', why: 'Double space, space at the ends, a space before । , ? or !, or no space after a comma.' },
  'length-ratio': { label: 'Hindi much longer than English', severity: 'check', why: 'The Hindi is more than 1.6 times the English length: it may not fit the caption box or the reading time. Shorter wording may exist.' },
  'ending': { label: 'Sentence ending', severity: 'check', why: 'English ends a sentence with a full stop or question mark and the Hindi does not end with । or ?.' },
  'placeholder': { label: 'Placeholder problem', severity: 'likely', why: 'A {gap} was left in the text, or the Hindi template has different gaps from the English one.' },
  'mt-tell': { label: 'Reads like machine translation', severity: 'check', why: 'A pattern that is stiff or wrong in nearly every use (see the message).' },
};

export const LINT_CODES = Object.keys(LINT_INFO) as LintCode[];

/** `key` groups flags that are the same issue (every use of the same variant term), for a "most common issues" count. */
export interface Flag { code: LintCode; severity: Severity; msg: string; key: string }

/** One text to lint. `id` is the reel (or `fact:<id>`); `where` says where on screen it appears. `tpl` is a slider takeaway's template pair. */
export interface LintEntry { id: string; where: string; en: string; hi: string; tpl?: { en: string; hi: string } }

// ── helpers ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Unicode NFC: the one-character nukta letters (U+0958-095F) become letter + nukta, so spelling is compared by what is written. */
export const nfc = (s: string): string => s.normalize('NFC');

const DEV_WORD = '[\\u0900-\\u0963\\u0971-\\u097F]';
const NOT_DEV_BEFORE = `(?<!${DEV_WORD})`;
const HAS_DEV = /[ऀ-ॿ]/;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Regex that finds one written form, bounded so that a short form does not match inside a longer word. */
function formRe(form: string): RegExp {
  const f = nfc(form);
  if (/[A-Za-z]/.test(f)) return new RegExp(`(?<![A-Za-z0-9])${esc(f)}(?![A-Za-z0-9])`, 'g');
  const short = [...f].length <= 4;
  return new RegExp(`${NOT_DEV_BEFORE}${esc(f)}${short ? `(?!${DEV_WORD})` : ''}`, 'g');
}

type FormKind = 'hi' | 'allowed' | 'avoid';
interface FormRef { term: Term; form: string; kind: FormKind; re: RegExp }

const FORMS: FormRef[] = (() => {
  const out: FormRef[] = [];
  for (const t of GLOSSARY) {
    out.push({ term: t, form: nfc(t.hi), kind: 'hi', re: formRe(t.hi) });
    for (const a of t.allowed ?? []) out.push({ term: t, form: nfc(a), kind: 'allowed', re: formRe(a) });
    for (const a of t.avoid ?? []) out.push({ term: t, form: nfc(a), kind: 'avoid', re: formRe(a) });
  }
  // Longest first, so "म्यूचुअल फ़ंड" is read as a mutual fund before "फ़ंड" is read as a fund.
  return out.sort((a, b) => b.form.length - a.form.length || a.form.localeCompare(b.form));
})();

export interface FormUse { term: Term; form: string; kind: FormKind }

/** Which glossary forms a Hindi text uses. Each stretch of text counts for one form only (the longest). */
export function formsIn(hi: string): FormUse[] {
  let s = nfc(hi);
  const out: FormUse[] = [];
  for (const f of FORMS) {
    s = s.replace(f.re, () => { out.push({ term: f.term, form: f.form, kind: f.kind }); return ' '.repeat(f.form.length); });
  }
  return out;
}

const wordsOf = (s: string): string[] => nfc(s).match(new RegExp(`${DEV_WORD}+`, 'g')) ?? [];
/** Spelling key: ignores the nukta and the chandrabindu/anusvara difference, so जरूरी and ज़रूरी, महँगाई and महंगाई share a key. */
export const spellingKey = (w: string): string => nfc(w).replace(/\u093C/g, '').replace(/\u0901/g, '\u0902').replace(/[\u200C\u200D]/g, '');

// ── library statistics ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface VariantRow {
  term: Term;
  forms: { form: string; kind: FormKind; count: number; reels: number; ui: number }[];
  /** More than one form is in use, or an `avoid` form is. */
  mixed: boolean;
}
export interface SpellingRow { key: string; forms: { form: string; count: number }[] }

export interface LibraryStats {
  usage: Map<string, Map<string, number>>;   // term id -> form -> texts using it
  words: Map<string, Map<string, number>>;   // spelling key -> surface form -> uses
  variants: VariantRow[];
  spelling: SpellingRow[];
}

/**
 * Count, over every Hindi text, which written forms of each glossary term are used and which spellings of each word. `ui` is optional Hindi
 * from elsewhere in the app (the interface strings), counted per form so the report can show a clash between the reels and the screens.
 */
export function buildStats(entries: { id: string; hi: string }[], ui: string[] = []): LibraryStats {
  const usage = new Map<string, Map<string, number>>();
  const reelsPer = new Map<string, Set<string>>();
  const words = new Map<string, Map<string, number>>();
  for (const e of entries) {
    for (const u of formsIn(e.hi)) {
      const m = usage.get(u.term.id) ?? new Map<string, number>(); usage.set(u.term.id, m);
      m.set(u.form, (m.get(u.form) ?? 0) + 1);
      const key = `${u.term.id}\u0000${u.form}`; const r = reelsPer.get(key) ?? new Set<string>(); r.add(e.id.replace(/^fact:.*/, 'facts')); reelsPer.set(key, r);
    }
    for (const w of wordsOf(e.hi)) {
      if ([...w].length < 3) continue;
      const k = spellingKey(w); const m = words.get(k) ?? new Map<string, number>(); words.set(k, m);
      m.set(nfc(w), (m.get(nfc(w)) ?? 0) + 1);
    }
  }
  const uiUse = new Map<string, number>();
  for (const s of ui) for (const u of formsIn(s)) uiUse.set(`${u.term.id}\u0000${u.form}`, (uiUse.get(`${u.term.id}\u0000${u.form}`) ?? 0) + 1);
  const variants: VariantRow[] = [];
  for (const t of GLOSSARY) {
    const refs = FORMS.filter(f => f.term === t);
    const forms = refs.map(f => ({ form: f.form, kind: f.kind, count: usage.get(t.id)?.get(f.form) ?? 0, reels: reelsPer.get(`${t.id}\u0000${f.form}`)?.size ?? 0, ui: uiUse.get(`${t.id}\u0000${f.form}`) ?? 0 }))
      .filter(f => f.count > 0 || f.ui > 0 || f.kind === 'hi');
    const used = forms.filter(f => f.count > 0);
    variants.push({ term: t, forms: forms.sort((a, b) => b.count - a.count || a.form.localeCompare(b.form)), mixed: used.length > 1 || used.some(f => f.kind === 'avoid') });
  }
  const spelling: SpellingRow[] = [];
  for (const [key, m] of [...words].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (m.size < 2) continue;
    spelling.push({ key, forms: [...m].map(([form, count]) => ({ form, count })).sort((a, b) => b.count - a.count || a.form.localeCompare(b.form)) });
  }
  return { usage, words, variants, spelling };
}

// ── the rules ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const flag = (code: LintCode, msg: string, severity: Severity = LINT_INFO[code].severity, key: string = code): Flag => ({ code, severity, msg, key });

const LATIN_RUN = /[A-Za-z][A-Za-z'’-]*(?: [A-Za-z][A-Za-z'’-]*)*/g;
const URLISH = /\S*(?:\.(?:in|com|co|org|net|apk|gov)\b|\/|@)\S*/gi;
/** Terms whose Hindi should come out the same every time, so a missing rendering is worth a look. Everyday words (loan, tax, interest) are left out: they are often rephrased on purpose. */
const EXPECT = new Set(['mutual-fund', 'emergency-fund', 'credit-score', 'inflation', 'premium', 'term-plan', 'nominee', 'refund', 'compound-interest', 'life-insurance', 'health-insurance', 'capital-gains', 'down-payment', 'diversification', 'helpline']);

const nums = (s: string): string[] => (s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map(x => x.replace(/,/g, '').replace(/\.$/, '')).sort();
const MAGNITUDES: [RegExp, RegExp, string][] = [[/\blakhs?\b/i, /लाख/, 'lakh'], [/\bcrores?\b/i, /करोड़/, 'crore'], [/\bthousands?\b/i, /हज़ार/, 'thousand']];

/** Small numbers written as words, so "ten years" against "10 साल" is not a mismatch. */
const NUM_EN: Record<string, string> = { '1': 'one', '2': 'two', '3': 'three', '4': 'four', '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine', '10': 'ten', '11': 'eleven', '12': 'twelve', '15': 'fifteen', '20': 'twenty', '30': 'thirty', '50': 'fifty', '100': 'hundred' };
const NUM_HI: Record<string, string> = { '1': 'एक', '2': 'दो', '3': 'तीन', '4': 'चार', '5': 'पाँच', '6': 'छह', '7': 'सात', '8': 'आठ', '9': 'नौ', '10': 'दस', '11': 'ग्यारह', '12': 'बारह', '15': 'पंद्रह', '20': 'बीस', '30': 'तीस', '50': 'पचास', '100': 'सौ' };

const braces = (s: string): string[] => (s.match(/\{[^{}]*\}|\{\{|\}\}|%s|%d|\$\{/g) ?? []);

/** Lint one text. `stats` (from buildStats over the whole library) switches on the checks that compare one text with the rest. */
export function lintEntry(e: LintEntry, stats?: LibraryStats): Flag[] {
  const en = nfc(e.en), hi = nfc(e.hi), out: Flag[] = [];
  const hasLetters = /[A-Za-z]/.test(en);
  const sentenceLike = hasLetters && en.length >= 15;

  // untranslated
  if (hasLetters && en.replace(/\W/g, '').length >= 12 && !HAS_DEV.test(hi)) out.push(flag('untranslated', 'The Hindi has no Devanagari at all.'));
  else if (hasLetters && en.length > 6 && en.trim() === hi.trim()) out.push(flag('untranslated', 'The Hindi is identical to the English.'));

  // digits
  if (/[०-९٠-٩]/.test(hi)) out.push(flag('digits', `Non-Latin digits: "${hi.match(/\S*[०-९٠-٩]\S*/)?.[0] ?? ''}". The app uses 0-9.`));

  // figures
  const ne = nums(en), nh = nums(hi);
  const lost = ne.filter(x => !nh.includes(x) && !(NUM_HI[x] && new RegExp(`(?<!${DEV_WORD})${NUM_HI[x]}(?!${DEV_WORD})`).test(hi)));
  const extra = nh.filter(x => !ne.includes(x) && !(NUM_EN[x] && new RegExp(`\\b${NUM_EN[x]}\\b`, 'i').test(en)));
  if (lost.length || extra.length) {
    out.push(flag('figure-mismatch', `Numbers differ. English: ${ne.join(', ') || 'none'}; Hindi: ${nh.join(', ') || 'none'}${lost.length ? `. Not in Hindi: ${lost.join(', ')}` : ''}${extra.length ? `. Only in Hindi: ${extra.join(', ')}` : ''}.`));
  }
  const sym = (s: string, c: string) => s.split(c).length - 1;
  for (const c of ['%', '₹']) if (sym(en, c) !== sym(hi, c)) out.push(flag('figure-mismatch', `"${c}" appears ${sym(en, c)} time(s) in English and ${sym(hi, c)} in Hindi.`));
  for (const [reE, reH, name] of MAGNITUDES) if (reE.test(en) !== reH.test(hi)) out.push(flag('figure-mismatch', `"${name}" is ${reE.test(en) ? 'in the English but not the Hindi' : 'in the Hindi but not the English'}.`));

  // punctuation
  const pairs: [string, string, string][] = [['(', ')', 'brackets ( )'], ['[', ']', 'brackets [ ]'], ['“', '”', 'curly double quotes “ ”'], ['‘', '’', 'curly single quotes ‘ ’']];
  for (const [o, c, name] of pairs) if (sym(hi, o) !== sym(hi, c)) { if (name.includes('single') && /[a-z]’s\b/.test(hi)) continue; out.push(flag('punctuation', `Unbalanced ${name}: ${sym(hi, o)} opening, ${sym(hi, c)} closing.`)); }
  if (sym(hi, '"') % 2) out.push(flag('punctuation', 'An odd number of straight double quotes (").'));

  // spacing
  const sp: string[] = [];
  if (/ {2,}/.test(hi)) sp.push('double space');
  if (hi !== hi.trim()) sp.push('space at the start or end');
  if (/ [।,?!;]/.test(hi)) sp.push('space before । , ? ! or ;');
  if (/,(?=[A-Za-zऀ-ॿ])/.test(hi)) sp.push('no space after a comma');
  if (/।(?=[\u0900-\u097FA-Za-z])/.test(hi)) sp.push('no space after ।');
  if (/\t|\u00A0/.test(hi)) sp.push('tab or non-breaking space');
  if (sp.length) out.push(flag('spacing', sp.join('; ') + '.'));

  // length
  if (sentenceLike && hi.length / en.length > 1.6) out.push(flag('length-ratio', `Hindi is ${hi.length} characters against ${en.length} in English (${(hi.length / en.length).toFixed(1)}×).`));

  // sentence endings
  if (hasLetters) {
    const enT = en.trim(), hiT = hi.trim();
    const enStop = /\.["”’)]*$/.test(enT) && !/\b(vs|e\.g|i\.e|etc|approx|Rs|No)\.$/i.test(enT);
    const enQ = /\?["”’)]*$/.test(enT);
    const hiStop = /।["”’)]*$/.test(hiT);
    const hiQ = /\?["”’)]*$/.test(hiT);
    if (enStop && !hiStop) out.push(flag('ending', /\.["”’)]*$/.test(hiT) ? 'English ends with "." and the Hindi ends with "." instead of "।".' : 'English ends with "." and the Hindi does not end with "।".'));
    else if (enQ && !hiQ) out.push(flag('ending', 'English ends with "?" and the Hindi does not.'));
    else if (!enStop && !enQ && hiStop && /[a-z]/.test(enT) && enT.length > 20) out.push(flag('ending', 'The Hindi ends with "।" but the English has no full stop.'));
    const enSentences = (enT.match(/[a-z”)%][.](?=\s+[A-Z“"‘'₹\d])/g) ?? []).length + (enStop ? 1 : 0);
    const hiSentences = (hiT.match(/।/g) ?? []).length;
    if (enSentences >= 2 && hiSentences < enSentences) out.push(flag('ending', `English has ${enSentences} sentences ending in "."; the Hindi has ${hiSentences} "।".`));
    if (/\.(?=\s+[ऀ-ॿ])/.test(hiT)) out.push(flag('ending', 'A sentence inside the Hindi ends with "." instead of "।".'));
  }

  // placeholders
  const be = braces(en), bh = braces(hi);
  if (be.length || bh.length) out.push(flag('placeholder', `A gap is left in the text: ${[...be, ...bh].join(' ')}`));
  if (e.tpl) {
    const te = braces(e.tpl.en).sort(), th = braces(e.tpl.hi).sort();
    if (te.join('|') !== th.join('|')) out.push(flag('placeholder', `The takeaway template has different gaps: English ${te.join(' ') || 'none'}, Hindi ${th.join(' ') || 'none'}.`));
  }

  // terminology + English left in the Hindi
  // Anything in quotes is a name or a quoted message (a sender ID, a brand) and is judged by the reader, not scanned.
  const enPlain = en.replace(/\u201C[^\u201D]*\u201D|"[^"]*"/g, ' ').replace(URLISH, ' ');
  const hiPlain = hi.replace(/\u201C[^\u201D]*\u201D|"[^"]*"/g, ' ').replace(URLISH, ' ');
  if (HAS_DEV.test(hi)) {
    const seenRun = new Set<string>();
    for (const m of hiPlain.matchAll(LATIN_RUN)) {
      const run = m[0]; if (seenRun.has(run)) continue; seenRun.add(run);
      const words = run.split(' ');
      const hit = GLOSSARY.find(t => t.kind === 'word' && new RegExp(`^(?:${t.match})$`, 'i').test(run));
      if (hit) { out.push(flag('mixed-term', `"${run}" is English inside a Hindi sentence. Glossary: ${hit.hi}.`)); continue; }
      for (const w of words) {
        if (w.length < 2 || LATIN_OK.has(w) || /^[A-Z][a-z]+[A-Z]/.test(w)) continue;   // CamelCase is a brand: FASTag, QuickCash
        if (/^[A-Z]{2,}[a-z]?$/.test(w) || /^[A-Z0-9]{2,}$/.test(w)) { out.push(flag('acronym-unlisted', `"${w}" is not in the glossary.`)); continue; }
        const wh = GLOSSARY.find(t => t.kind === 'word' && new RegExp(`^(?:${t.match})$`, 'i').test(w));
        if (wh) { out.push(flag('mixed-term', `"${w}" is English inside a Hindi sentence. Glossary: ${wh.hi}.`)); continue; }
        if (w.length >= 3) out.push(flag('english-leftover', `"${w}" is left in English.`));
      }
    }
    // English has the term, Hindi uses none of its forms
    const used = new Set(formsIn(hi).map(u => u.term.id));
    for (const t of GLOSSARY) {
      if (t.kind !== 'word' || !EXPECT.has(t.id) || used.has(t.id)) continue;
      if (new RegExp(t.match, 'i').test(enPlain) && !new RegExp(t.match, 'i').test(hiPlain.replace(/[ऀ-ॿ]/g, ' '))) {
        const longer = GLOSSARY.some(x => x !== t && x.kind === 'word' && x.id !== t.id && used.has(x.id) && new RegExp(x.match, 'i').test(enPlain) && new RegExp(x.match, 'i').exec(enPlain)![0].toLowerCase().includes(t.en.toLowerCase()));
        if (!longer) out.push(flag('term-other', `English has "${t.en}"; the Hindi uses none of: ${[t.hi, ...(t.allowed ?? [])].join(' / ')}.`));
      }
    }
  }

  // term variants and spellings, against the rest of the library
  if (stats) {
    const seen = new Set<string>();
    for (const u of formsIn(hi)) {
      const k = `${u.term.id}\u0000${u.form}`; if (seen.has(k)) continue; seen.add(k);
      if (u.kind === 'hi') continue;
      const m = stats.usage.get(u.term.id) ?? new Map<string, number>();
      const mine = m.get(u.form) ?? 0, pref = m.get(nfc(u.term.hi)) ?? 0;
      const others = [...m].filter(([f]) => f !== u.form).reduce((a, [, c]) => a + c, 0);
      if (u.kind === 'avoid') out.push(flag('term-variant', `"${u.form}" (${mine} texts); the glossary proposes "${u.term.hi}" (${pref} texts).`, 'likely', `term-variant:${u.term.id}`));
      else if (others > 0) out.push(flag('term-variant', `"${u.form}" (${mine} texts) is an alternative to "${u.term.hi}" (${pref} texts) for "${u.term.en}".`, undefined, `term-variant:${u.term.id}`));
    }
    const sk = new Set<string>();
    for (const w of wordsOf(hi)) {
      if ([...w].length < 3) continue;
      const key = spellingKey(w), forms = stats.words.get(key); if (!forms || forms.size < 2 || sk.has(key)) continue;
      const top = Math.max(...forms.values()), mine = forms.get(w) ?? 0;
      if (mine < top || [...forms.values()].filter(c => c === top).length > 1) {
        sk.add(key);
        out.push(flag('spelling-variant', `"${w}" (${mine}) is also written ${[...forms].filter(([f]) => f !== w).map(([f, c]) => `"${f}" (${c})`).join(', ')}.`, undefined, `spelling-variant:${key}`));
      }
    }
  }

  // machine-translation tells: four, each stiff or wrong in almost every use
  if (/अपने आप ?को|अपनेआपको/.test(hi)) out.push(flag('mt-tell', '"अपने आप को" is the literal English "yourself". "ख़ुद को" or dropping it is natural.'));
  for (const sentence of hi.split(/।|\?|!/)) {
    if (/द्वारा/.test(sentence) && /(जाता|जाती|जाते|जाएगा|जाएगी|जाएँगे|गया|गई|गए)(?![\u0900-\u097F])/.test(sentence)) { out.push(flag('mt-tell', '"… द्वारा … जाता है" is the English passive ("is done by"). An active sentence is usually the natural Hindi.')); break; }
  }
  const rep = hi.match(new RegExp(`(?<!${DEV_WORD})(का|की|के|में|से|को|है|हैं|और|पर|कि|ने|भी|तो) \\1(?!${DEV_WORD})`));
  if (rep) out.push(flag('mt-tell', `The word "${rep[1]}" is repeated: "${rep[0]}".`));
  const aap = (hi.match(new RegExp(`${NOT_DEV_BEFORE}आप(?:ने)?(?!${DEV_WORD})`, 'g')) ?? []).length;
  if (aap >= 3) out.push(flag('mt-tell', `The subject "आप" appears ${aap} times. Hindi drops the subject where English repeats "you".`));

  return out;
}

// ── the whole library ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface LintedEntry { entry: LintEntry; flags: Flag[] }
export interface LibraryLint {
  /** Reel id (in the order the reels were given) -> its texts, each with its flags. */
  byReel: Map<string, LintedEntry[]>;
  stats: LibraryStats;
  /** Flags per rule, and how many reels have at least one. */
  perCode: Record<LintCode, { flags: number; reels: number; likely: number }>;
  /** Most common individual messages, e.g. "Hindi is identical to the English." */
  textsChecked: number;
  textsFlagged: number;
}

export function lintLibrary(entries: LintEntry[], opts: { ui?: string[] } = {}): LibraryLint {
  const stats = buildStats(entries, opts.ui ?? []);
  const byReel = new Map<string, LintedEntry[]>();
  const perCode = Object.fromEntries(LINT_CODES.map(c => [c, { flags: 0, reels: 0, likely: 0 }])) as LibraryLint['perCode'];
  const reelSeen = new Map<LintCode, Set<string>>(LINT_CODES.map(c => [c, new Set<string>()]));
  let flagged = 0;
  for (const e of entries) {
    const flags = lintEntry(e, stats);
    const list = byReel.get(e.id) ?? []; list.push({ entry: e, flags }); byReel.set(e.id, list);
    if (flags.length) flagged++;
    for (const f of flags) { perCode[f.code].flags++; if (f.severity === 'likely') perCode[f.code].likely++; reelSeen.get(f.code)!.add(e.id); }
  }
  for (const c of LINT_CODES) perCode[c].reels = reelSeen.get(c)!.size;
  return { byReel, stats, perCode, textsChecked: entries.length, textsFlagged: flagged };
}

/** The flags of one reel, flattened. */
export const flagsOf = (rows: LintedEntry[]): Flag[] => rows.flatMap(r => r.flags);
