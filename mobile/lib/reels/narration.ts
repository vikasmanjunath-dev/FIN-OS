// What the phone's voice says when sound is on, beyond the scene captions: the question a beat asks, what it reveals, and the quiz. Pure text
// builders (so they are tested for both languages and for anything unspeakable), used by components/reels/Poke.tsx and ReelPlayer.tsx.
// Written for the ear: short sentences, numbered options, no symbols a voice would spell out.
import { spotMessage, sliderLine } from '@/lib/reels/beats';
import type { Beat, Reel } from '@/lib/reels/types';

type Lang = 'en' | 'hi';
const w = (lang: Lang, en: string, hi: string) => (lang === 'hi' ? hi : en);
const join = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(' ');
/** A voice reads "₹" and "⚑" badly: an amount becomes "18 lakh rupees" ("18 लाख रुपये" in Hindi) and the flag mark is dropped. */
export function speakable(s: string): string {
  const hindi = /[ऀ-ॿ]/.test(s);
  return s.replace(/⚑\s*/g, '').replace(/₹\s*(\d[\d,.]*)(\s*(?:lakh|crore|लाख|करोड़))?/g, (_, n: string, u?: string) => `${n}${u ?? ''} ${hindi ? 'रुपये' : 'rupees'}`).replace(/₹/g, '').replace(/\s+/g, ' ').trim();
}
const num = (lang: Lang, i: number) => w(lang, `Option ${i + 1}.`, `विकल्प ${i + 1}।`);

/** What is said when a beat first appears. For myth cards and sort cards only the first card is read here; the next ones are read by `cardText`. */
export function askText(b: Beat, lang: Lang): string {
  switch (b.kind) {
    case 'guess': return speakable(b.q[lang]);
    case 'slider': return speakable(join(b.q[lang], b.label[lang]));
    case 'myth': return speakable(join(b.q[lang], cardText(b, 0, lang)));
    case 'spot': return speakable(join(b.q[lang], b.from[lang] + '.', spotMessage(b.parts, lang)));
    case 'path': return speakable(join(b.q[lang], b.setup[lang], ...b.options.map((o, i) => `${num(lang, i)} ${o.label[lang]}.`)));
    case 'sort': return speakable(join(b.q[lang], cardText(b, 0, lang), w(lang, 'Is it ' + b.bins.map(x => x.en).join(', or ') + '?', 'यह ' + b.bins.map(x => x.hi).join(' या ') + ' में से क्या है?')));
    case 'order': return speakable(join(b.q[lang], w(lang, 'Tap them in order, first to last.', 'पहले से आख़िरी तक, क्रम से छुएँ।')));
  }
}

/** The card the viewer is looking at (myth statement or sort card). */
export function cardText(b: Beat, i: number, lang: Lang): string {
  if (b.kind === 'myth') return speakable(b.cards[i]?.s[lang] ?? '');
  if (b.kind === 'sort') return speakable(b.cards[i]?.t[lang] ?? '');
  return '';
}

/** What is said when a beat reveals itself. `picked` is the viewer's choice where there is one (a path index; a myth or sort answer). */
export function revealText(b: Beat, lang: Lang, o: { x?: number; picked?: number | boolean | null; card?: number } = {}): string {
  switch (b.kind) {
    case 'guess': return speakable(b.reveal[lang]);
    case 'slider': return speakable(sliderLine(b, o.x ?? b.start)[lang]);
    case 'spot': return speakable(join(b.parts.filter(p => p.flag).map(p => p.flag![lang]).join(' '), b.todo[lang]));
    case 'path': { const i = typeof o.picked === 'number' ? o.picked : null; return speakable(join(i !== null ? b.options[i]?.result[lang] : b.options.map(x => `${x.label[lang]}. ${x.result[lang]}`).join(' '), b.verdict[lang])); }
    case 'myth': { const c = b.cards[o.card ?? 0]; if (!c) return ''; const said = o.picked; const verdict = typeof said === 'boolean' ? (said === c.fact ? w(lang, 'Right.', 'सही।') : w(lang, 'Not quite.', 'लगभग।')) : ''; return speakable(join(verdict, c.fact ? w(lang, 'It is a fact.', 'यह सच है।') : w(lang, 'It is a myth.', 'यह मिथक है।'), c.why[lang])); }
    case 'sort': { const c = b.cards[o.card ?? 0]; if (!c) return ''; const said = o.picked; const verdict = typeof said === 'number' ? (said === c.bin ? w(lang, 'Right.', 'सही।') : w(lang, 'Not quite.', 'लगभग।')) : ''; return speakable(join(verdict, w(lang, 'It belongs in ' + b.bins[c.bin].en + '.', 'यह ' + b.bins[c.bin].hi + ' में आता है।'), c.why[lang])); }
    case 'order': return speakable(join(w(lang, 'The order is:', 'क्रम यह है:'), ...b.items.map((it, i) => `${i + 1}. ${it.t[lang]}.`)));
  }
}

/** The quiz: the question, then the options by number. */
export function quizText(r: Reel, lang: Lang): string {
  return speakable(join(r.quiz.q[lang], ...r.quiz.options.map((o, i) => `${num(lang, i)} ${o[lang]}.`)));
}

/** After the viewer answers: right or not, then why. */
export function quizVerdictText(r: Reel, picked: number, lang: Lang): string {
  return speakable(join(picked === r.quiz.answer ? w(lang, 'Right!', 'सही!') : w(lang, 'Not quite.', 'लगभग!'), r.quiz.why[lang]));
}
