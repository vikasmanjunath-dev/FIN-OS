// Author tooling and library-wide quality checks for Money Reels, as pure functions. scripts/reel-check.mts prints them for an author;
// __tests__/reels-library-qa.test.mts holds the whole library to them. Nothing here is imported by the app.
//
// It adds to validate.ts, never repeats it: validateReel stays the one place that knows the script rules (length, fit, banned wording, quiz range),
// and `check*` below call it and then look at what a person writing or reviewing a reel also needs: is the Hindi signed off, are the ladder entry, tool
// link and trust note there, does the voice fit, is the quiz a fair question, is the reel too heavy to draw, is any scene or file over budget.
import { ACT_ALL, LIBRARY } from '@/lib/reels/library';
import { META, LEVELS, type Level, type Meta } from '@/lib/reels/meta';
import { SERIES, DRAFT_SERIES, type Series } from '@/lib/reels/series';
import { TRUST, type Trust } from '@/lib/reels/trust';
import { DRAFT_IDS, DRAFT_REELS } from '@/lib/reels/drafts';
import { DRAFT_META } from '@/lib/reels/drafts-meta';
import { DRAFT_ACT } from '@/lib/reels/drafts-act';
import { evalModel, isBeatUsable, validateBeat } from '@/lib/reels/beats';
import { CAST_IDS } from '@/lib/reels/cast';
import { totalMs } from '@/lib/reels/engine';
import { money } from '@/lib/reels/figures';
import { QA_ALLOWLIST } from '@/lib/reels/qa-allowlist';
import { TOPIC_ORDER } from '@/lib/reels/map';
import { REVIEWED, type SignOff } from '@/lib/reels/review';
import { textsOf, validateReel } from '@/lib/reels/validate';
import { withVoiceTiming } from '@/lib/reels/voice';
import type { Act } from '@/lib/reels/journey';
import type { Beat, L, Prop, Reel, Scene, SliderModel } from '@/lib/reels/types';

// ── Budgets (documented in docs/REELS-AUTHORS.md; the test file holds the library to them) ───────────────────────────────────────

export const BUDGET = {
  /** One reel, serialised as JSON. Reels are data; the whole library should stay small enough to ship in the app bundle without thought. */
  reelBytes: 30 * 1024,
  /** A scene's length in milliseconds. validateReel's 2.5-6.5 s is the authoring rule; this is the outer bound that still plays well. */
  sceneMs: [1500, 12_000] as const,
  /** A reel's length in milliseconds, silent and with the voice's own timing. */
  reelMs: [20_000, 60_000] as const,
  /** Animated primitives (see sceneCost) in one scene's picture, and in one beat. */
  sceneCost: 30,
  beatCost: 30,
  /** Characters a second a reader can take in (the validator's hard stop is 28; above `captionWarn` is a warning). */
  captionWarnCps: 22,
  /** How much longer the voice makes a reel before the reel feels slow, as a share of its silent length. The library's median is +34% in English and +50% in
   * Hindi (scripts are written for silent reading), so only the slowest tail is flagged. */
  voiceStretchWarn: 0.75,
};

/** Every finding code the checks can raise, for the allowlist's own test and for the guide. */
export const QA_CODES = [
  'validator', 'hindi-proportion', 'meta-missing', 'meta-level', 'meta-needs', 'act-on-scam', 'act-missing', 'act-label', 'trust-missing', 'trust-orphan',
  'beat-unusable', 'beat-rule', 'beat-figure', 'guess-answer', 'beat-cost', 'reel-length', 'scene-length', 'reel-length-voice', 'scene-length-voice',
  'voice-stretch', 'caption-speed', 'quiz-answer', 'quiz-options', 'quiz-why', 'quiz-question', 'quiz-tell', 'quiz-vague', 'advice-wording', 'http-link',
  'link-in-text', 'personal-data', 'email-in-text', 'dup-title', 'dup-hook', 'topic-orphan', 'cast-missing', 'lesson-missing', 'no-tags', 'unreachable',
  'share-mine', 'share-unsafe', 'reel-size', 'scene-cost', 'dup-id', 'meta-stray', 'act-stray', 'trust-stray', 'review-stray', 'review-incomplete',
  'series-episode', 'series-repeat', 'answer-skew',
];

// ── Findings, checklist ──────────────────────────────────────────────────────────────────────────────────────────────

export type Severity = 'error' | 'warn';
export interface Finding { code: string; severity: Severity; message: string; /** what to do about it */ fix?: string }
/** `known` is a failure the allowlist excuses (qa-allowlist.ts); `todo` is a human step still owed (review). */
export type ItemStatus = 'ok' | 'todo' | 'known' | 'warn' | 'fail';
export interface CheckItem { key: string; label: string; status: ItemStatus; /** one line a person can read: what passed, or what is wrong */ detail: string; findings: Finding[] }
export interface ReelReport { id: string; title: string; topic: string; items: CheckItem[]; findings: Finding[]; blocking: Finding[]; warnings: Finding[]; known: (Finding & { reason: string })[] }

/** Everything a check needs to know about the library around a reel. `liveContext()` builds it from the real modules; tests build small ones. */
export interface QaContext {
  reels: Reel[];
  meta: Record<string, Meta>;
  act: Record<string, Act>;
  trust: Record<string, Trust>;
  series: Series[];
  reviewed: Record<string, SignOff>;
  /** Ids of reels that go through the review gate (lib/reels/drafts.ts). */
  draftIds: Set<string>;
  /** Learn lesson ids a reel may point at, when known. */
  lessons?: Set<string>;
  /** The reels titles and opening lines must be new against (default: `reels`). For the drafts this is the live library plus the drafts. */
  against?: Reel[];
}

const f = (severity: Severity, code: string, message: string, fix?: string): Finding => ({ code, severity, message, ...(fix ? { fix } : {}) });
const err = (code: string, message: string, fix?: string) => f('error', code, message, fix);
const warn = (code: string, message: string, fix?: string) => f('warn', code, message, fix);
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

// ── Reading a reel as text ───────────────────────────────────────────────────────────────────────────────────────────

const FIGURE = /₹\s?\d|\d\s?%/;
/** True when the reel quotes a rupee amount or a percentage anywhere a viewer can read it. */
export const quotesFigures = (r: Reel): boolean => textsOf(r).some(x => FIGURE.test(x.en));
const allText = (r: Reel): string[] => textsOf(r).flatMap(x => [x.en, x.hi]);
const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9ऀ-ॿ]+/g, ' ').trim();

// ── Rendering cost ──────────────────────────────────────────────────────────────────────────────────────────────────

/** What a scene's picture costs to draw, in animated primitives (a shape, a bar, a label that moves with the scene clock). Counted from the data alone,
 * with the same limits Scenery.tsx applies (coins are capped at 8). The character, the caption and the big words are the fixed part of every scene. */
export const STAGE_COST = 8;
export function propCost(p: Prop | undefined): number {
  if (!p) return 0;
  switch (p.kind) {
    case 'counter': return 4;                                    // frame, number, unit, label
    case 'bars': return p.items.length * 3;                      // bar, label, value text
    case 'line': return 5 + Math.ceil(p.points.length / 10);     // axis, area, polyline, end dot, label; a long path costs a little more to redraw
    case 'donut': return p.parts.length * 2 + 2;                 // arc and label per part, centre text and ring
    case 'coins': return Math.min(p.count, 8) * 2 + 1;           // coin and shine, and the label
    case 'shield': return 3;
    case 'steps': return p.items.length * 3;                     // tick, row, text
  }
}
export const sceneCost = (s: Scene): number => STAGE_COST + propCost(s.prop);
/** What a beat's screen costs to draw: its pieces (cards, message parts, options, bars). */
export function beatCost(b: Beat): number {
  switch (b.kind) {
    case 'guess': return 6;
    case 'slider': return 8;
    case 'myth': return 3 * b.cards.length;
    case 'spot': return 2 * b.parts.length + 2;
    case 'path': return 3 * b.options.length + 2;
    case 'sort': return 2 * b.cards.length + 2 * b.bins.length;
    case 'order': return 2 * b.items.length;
  }
}
export interface CostReport { scenes: number[]; heaviest: number; beat: number; total: number }
export function reelCost(r: Reel): CostReport {
  const scenes = r.scenes.map(sceneCost);
  return { scenes, heaviest: Math.max(0, ...scenes), beat: r.poke ? beatCost(r.poke.beat) : 0, total: scenes.reduce((a, b) => a + b, 0) };
}

// ── Independent re-derivation of a slider's figure (a month-by-month ledger, not figures.ts) ────────────────────────────

/** The slider's headline figure worked out by plain loops and bisection instead of the closed forms in figures.ts, so a wrong formula there cannot
 * hide behind itself. Returns null for a model with no independent method here (the tax model reads lib/taxcore.ts). */
export function deriveSlider(m: SliderModel, x: number): number | null {
  const monthly = (rate: number) => rate / 100 / 12;
  const ledger = (p: number, rate: number, months: number) => { let b = 0; for (let k = 0; k < months; k++) b = b * (1 + monthly(rate)) + p; return b; };
  const loanAfter = (principal: number, rate: number, months: number, pay: number) => { let b = principal; for (let k = 0; k < months; k++) b = b * (1 + monthly(rate)) - pay; return b; };
  const bisect = (hi: number, ok: (v: number) => boolean) => { let lo = 0; for (let k = 0; k < 200; k++) { const mid = (lo + hi) / 2; if (ok(mid)) lo = mid; else hi = mid; } return (lo + hi) / 2; };
  switch (m.kind) {
    case 'sip-years': return ledger(m.monthly, m.rate, Math.round(x * 12));
    case 'sip-delay': return ledger(m.monthly, m.rate, Math.round(Math.max(0, m.horizon - x) * 12));
    case 'inflation-years': return m.amount * Math.exp(-x * Math.log(1 + m.rate / 100));
    case 'emi-rate': { const n = Math.round(m.years * 12); return bisect(m.principal, pay => loanAfter(m.principal, x, n, pay) > 0); }
    case 'emi-tenure': { const n = Math.round(x * 12); return bisect(m.principal, pay => loanAfter(m.principal, m.rate, n, pay) > 0); }
    case 'goal-sip': { const n = Math.round(x * 12); return bisect(m.target, p => ledger(p, m.rate, n) < m.target); }
    case 'step-up': { let b = 0, sip = m.monthly; for (let y = 0; y < m.years; y++) { for (let k = 0; k < 12; k++) b = b * (1 + monthly(m.rate)) + sip; sip *= 1 + x / 100; } return b; }
    case 'card-interest': { let b = m.balance; for (let k = 0; k < x; k++) b *= 1 + m.monthlyPct / 100; return b; }
    case 'corpus-spend': {
      let b = m.corpus, months = 0;
      while (b > 0 && months < 720) { b = b * (1 + monthly(m.rate)) - x; months++; }
      return b > 0 ? 60 : months / 12;
    }
    case 'tax-income': return null;
  }
}

/** Problems with the numbers in a slider or guess beat, found by working them out again. */
export function checkBeatFigures(r: Reel): Finding[] {
  const out: Finding[] = [];
  const b = r.poke?.beat;
  if (!b) return out;
  if (b.kind === 'slider') {
    for (const x of [b.min, b.start, b.max, (b.min + b.max) / 2]) {
      const shown = evalModel(b.model, x).value, own = deriveSlider(b.model, x);
      if (!Number.isFinite(shown)) { out.push(err('beat-figure', `the ${b.model.kind} slider shows a broken figure at ${x}`)); continue; }
      if (own === null) continue;
      // The month-by-month corpus ledger moves in whole months, so it may be one month off; every other model must agree to 0.5%.
      const tol = b.model.kind === 'corpus-spend' ? 1 / 12 + 1e-9 : Math.abs(own) * 0.005 + 0.01;
      if (Math.abs(shown - own) > tol) out.push(err('beat-figure', `the ${b.model.kind} slider shows ${shown.toFixed(2)} at ${x} but working it out step by step gives ${own.toFixed(2)}`, 'fix the model parameters or the formula in figures.ts'));
    }
  } else if (b.kind === 'guess') {
    // The answer the viewer is shown must be a figure the reel itself states, rounded the way the reel writes it.
    const said = money(b.answer);
    const seen = [b.reveal, ...r.scenes.map(s => s.say)].some(l => l.en.includes(said.en));
    if (!seen) out.push(warn('guess-answer', `the guess answer ${said.en} is not stated in the reveal or any caption`, 'state the answer in the reveal as money(answer) so the screen and the maths agree'));
  }
  return out;
}

// ── Wording ───────────────────────────────────────────────────────────────────────────────────────────────────────────

const NEGATED = /\b(not|no|never|n['’]t|without|cannot|can['’]t)\b[^.;:]{0,18}\b(guarantee[sd]?|assured)\b|\b(guarantee[sd]?|assured)\b[^.;:]{0,8}\b(nothing|no one|nobody)\b|गारंटी\s*(नहीं|नही|कोई नहीं)|बिना गारंटी|वादा नहीं/gi;
/** Wording that sounds like a promise or a push even though validate.ts's list does not ban it. Warnings, because context can make them fine. */
const SOFT_ADVICE_EN = /\b(guarantee[sd]?|assured returns?|sure returns?|will make you|never lose|zero risk|100% safe|you should|you need to (buy|invest|sell)|you must (buy|invest in|sell)|best (investment|plan|scheme|option|fund|stock)|top (pick|stock|fund)|beat the market|hot tip|multibagger)\b/i;
const SOFT_ADVICE_HI = /(गारंटी|पक्का मुनाफ़ा|पक्का रिटर्न|जोखिम[- ]?मुक्त|आपको (ख़रीदना|खरीदना|निवेश करना) चाहिए|सबसे अच्छा (निवेश|फ़ंड|स्टॉक))/;

/** What the reel says in its own voice: captions, big words, labels, the question and what the beat reveals. Not the statements a viewer is asked to judge
 * (myth cards, the scam message, the cards to sort, the path labels, the quiz's wrong options): those are meant to sound wrong, or tempting. */
export function teachingTexts(r: Reel): L[] {
  const b = r.poke?.beat;
  const judged = new Set<L>();
  if (b?.kind === 'myth') b.cards.forEach(c => judged.add(c.s));
  if (b?.kind === 'spot') { judged.add(b.from); b.parts.forEach(p => judged.add(p.t)); }
  if (b?.kind === 'sort') b.cards.forEach(c => judged.add(c.t));
  if (b?.kind === 'path') b.options.forEach(o => judged.add(o.label));
  r.quiz.options.forEach((o, i) => { if (i !== r.quiz.answer) judged.add(o); });
  return textsOf(r).filter(x => !judged.has(x) && !x.en.trim().endsWith('?'));
}

export function adviceFindings(r: Reel): Finding[] {
  const out: Finding[] = [];
  for (const x of teachingTexts(r)) {
    const en = x.en.replace(NEGATED, ' '), hi = x.hi.replace(NEGATED, ' ');
    const m = en.match(SOFT_ADVICE_EN) ?? hi.match(SOFT_ADVICE_HI);
    if (m) out.push(warn('advice-wording', `reads like a promise or advice ("${m[0]}"): "${x.en.slice(0, 80)}"`, 'say "assumed", "about", "for example"; describe, never tell the viewer what to buy, sell or expect'));
  }
  return out;
}

const URLISH = /\bhttps?:\/\/|\bwww\.[a-z]/i;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;
const PERSONAL = /\b[A-Z]{5}\d{4}[A-Z]\b|\b\d{4}\s\d{4}\s\d{4}\b|\b\d{9,}\b/;       // PAN, Aadhaar, long digit runs (phone, account, card)
export function linkFindings(r: Reel): Finding[] {
  const out: Finding[] = [];
  for (const t of allText(r)) {
    if (/http:\/\//i.test(t)) out.push(err('http-link', `an "http://" link in the text: "${t.slice(0, 60)}"`, 'a reel never shows a link; if one is unavoidable it must be https and named in the review sheet'));
    else if (URLISH.test(t)) out.push(warn('link-in-text', `a web link in the text: "${t.slice(0, 60)}"`, 'scam reels must not show a real or look-alike link; name the official site only (cybercrime.gov.in)'));
  }
  return out;
}

// ── The checks, one per line of the checklist ───────────────────────────────────────────────────────────────────────────────

interface CheckOut { findings: Finding[]; detail?: string; status?: ItemStatus }
interface Check { key: string; label: string; run: (r: Reel, ctx: QaContext) => CheckOut }

const worst = (fs: Finding[]): ItemStatus => (fs.some(x => x.severity === 'error') ? 'fail' : fs.length ? 'warn' : 'ok');
const statusWith = (id: string, fs: Finding[]): ItemStatus => {
  const open = fs.filter(x => isKnown(id, x.code) === null);
  return open.length === 0 && fs.length > 0 ? 'known' : worst(open);
};

const hookOf = (r: Reel): string => norm(r.scenes[0]?.say.en ?? '');
const others = (r: Reel, ctx: QaContext) => (ctx.against ?? ctx.reels).filter(x => x.id !== r.id);

/** Voiced length: each scene as long as the phone's voice needs (the same function the player uses). */
export function voicedMs(r: Reel, lang: 'en' | 'hi'): number { return totalMs(withVoiceTiming(r, lang)); }

export const CHECKS: Check[] = [
  {
    key: 'script', label: 'Script rules (validate.ts)',
    run: r => {
      const msgs = validateReel(r).map(m => m.replace(`${r.id}: `, ''));
      return { findings: msgs.map(m => err('validator', m, 'fix the line named; see docs/REELS-AUTHORS.md "What the validator bans"')), detail: msgs.length ? `${msgs.length} problem${msgs.length > 1 ? 's' : ''}` : 'passes every rule in both languages' };
    },
  },
  {
    key: 'languages', label: 'English and Hindi both present and in proportion',
    run: r => {
      const out: Finding[] = [];
      const pairs: [string, L][] = [['title', r.title], ...r.scenes.map((s, i): [string, L] => [`scene ${i + 1}`, s.say])];
      for (const [where, l] of pairs) {
        if (l.en.length >= 30 && (l.hi.length < l.en.length * 0.55 || l.hi.length > l.en.length * 2)) out.push(warn('hindi-proportion', `${where}: Hindi is ${l.hi.length} characters against ${l.en.length} in English (a cut-down or padded translation?)`, 'ask the Hindi reader to check this line says the same thing'));
      }
      return { findings: out, detail: out.length ? `${out.length} line${out.length > 1 ? 's' : ''} look uneven` : 'every caption has both, similar length' };
    },
  },
  {
    key: 'review', label: 'Hindi and compliance review (review.ts)',
    run: (r, ctx) => {
      const so = ctx.reviewed[r.id], draft = ctx.draftIds.has(r.id);
      if (so) return { findings: [], status: 'ok', detail: `signed off: Hindi ${so.hindi}, compliance ${so.compliance}, ${so.on}` };
      return { findings: [], status: 'todo', detail: draft ? 'draft: waiting for a native Hindi reader and a compliance reader (scripts/review-sheet.mts makes the sheet)' : 'built before the review gate, not tracked in review.ts: a native Hindi read is still owed' };
    },
  },
  {
    key: 'entries', label: 'Ladder entry, tool link and trust note',
    run: (r, ctx) => {
      const out: Finding[] = [];
      const m = ctx.meta[r.id], a = ctx.act[r.id], tr = ctx.trust[r.id], beatKind = r.poke?.beat.kind;
      if (!m) out.push(err('meta-missing', 'no ladder entry in meta.ts (the ranker and the Money Map would treat it as a plain concept)', 'add a line to META (or DRAFT_META for a draft)'));
      else {
        if (!LEVELS.includes(m.level)) out.push(err('meta-level', `ladder level "${m.level}" is not one of ${LEVELS.join(', ')}`));
        const ws = Object.values(m.needs);
        if (ws.length === 0) out.push(warn('meta-needs', 'no Money Score pillar is named in needs, so the ranker never picks it for a weak pillar', 'name at least one pillar with a weight from 0 to 1'));
        if (ws.some(w => !(w! > 0 && w! <= 1))) out.push(err('meta-needs', 'a pillar weight is outside 0 to 1'));
      }
      if (r.topic === 'safety') { if (a) out.push(warn('act-on-scam', 'a scam reel points at a tool; the lesson is what to refuse, not a calculator to open', 'remove the tool link')); }
      else if (!a) out.push(err('act-missing', 'no tool link (journey.ts ACT, act-more.ts or PLAY_ACT)', 'add the screen or calculator this lesson leads to'));
      else if (a.label.en.length < 8 || !/[ऀ-ॿ]/.test(a.label.hi)) out.push(err('act-label', 'the tool link label is too short or has no Hindi'));
      if (quotesFigures(r) && !tr && r.topic !== 'safety') {      // a scam message's amounts are bait, not computed figures
        const asks = beatKind === 'slider' || beatKind === 'guess';
        out.push(asks ? err('trust-missing', `quotes figures and asks the viewer to ${beatKind === 'slider' ? 'move a slider' : 'guess a figure'}, but has no trust note (trust.ts: formula, assumptions, date)`, 'add a TRUST entry so "How this is worked out" can show the formula')
          : warn('trust-missing', 'quotes rupee amounts or percentages but has no trust note (trust.ts)', 'add a TRUST entry (formula, assumptions, date) if the figures are computed'));
      }
      if (tr && !quotesFigures(r)) out.push(warn('trust-orphan', 'has a trust note but quotes no figure', 'remove the note or the reel is missing its figures'));
      const bits = [m ? `ladder ${m.level}` : 'no ladder entry', r.topic === 'safety' ? 'no tool (scam reel)' : a ? 'tool link' : 'no tool link', tr ? 'trust note' : quotesFigures(r) ? 'no trust note' : 'no figures to trust'];
      return { findings: out, detail: bits.join(', ') };
    },
  },
  {
    key: 'beat', label: 'Beat usable and its numbers re-derive',
    run: r => {
      if (!r.poke) return { findings: [], detail: 'no beat (plain explainer)' };
      const out: Finding[] = [];
      if (!isBeatUsable(r)) out.push(err('beat-unusable', 'the beat fails isBeatUsable, so the reel would play without it', 'fix what validateBeat names'));
      for (const m of validateBeat(r.poke.beat)) out.push(err('beat-rule', m));
      out.push(...checkBeatFigures(r));
      const c = beatCost(r.poke.beat);
      if (c > BUDGET.beatCost) out.push(warn('beat-cost', `the beat has ${c} animated pieces; budget is ${BUDGET.beatCost}`, 'fewer cards, parts or options'));
      return { findings: out, detail: `${r.poke.beat.kind} after scene ${r.poke.after + 1}${out.length ? '' : ', usable'}` };
    },
  },
  {
    key: 'timing', label: 'Duration, reading time and the voice',
    run: r => {
      const out: Finding[] = [];
      const silent = totalMs(r);
      const [lo, hi] = BUDGET.reelMs, [sl, sh] = BUDGET.sceneMs;
      if (silent < lo || silent > hi) out.push(err('reel-length', `runs ${secs(silent)} silent; budget ${lo / 1000}-${hi / 1000} s`));
      r.scenes.forEach((s, i) => { if (s.ms < sl || s.ms > sh) out.push(err('scene-length', `scene ${i + 1} lasts ${secs(s.ms)}; budget ${sl / 1000}-${sh / 1000} s`)); });
      const voiced = { en: voicedMs(r, 'en'), hi: voicedMs(r, 'hi') };
      for (const lang of ['en', 'hi'] as const) {
        const v = withVoiceTiming(r, lang);
        if (voiced[lang] < lo || voiced[lang] > hi) out.push(err('reel-length-voice', `runs ${secs(voiced[lang])} with the ${lang === 'en' ? 'English' : 'Hindi'} voice; budget ${lo / 1000}-${hi / 1000} s`, 'shorten the captions'));
        v.scenes.forEach((s, i) => { if (s.ms > sh) out.push(err('scene-length-voice', `scene ${i + 1} needs ${secs(s.ms)} for the ${lang === 'en' ? 'English' : 'Hindi'} voice; budget ${sh / 1000} s`, 'shorten that caption')); });
        const stretch = voiced[lang] / silent - 1;
        if (stretch > BUDGET.voiceStretchWarn) out.push(warn('voice-stretch', `the ${lang === 'en' ? 'English' : 'Hindi'} voice makes the reel ${Math.round(stretch * 100)}% longer than written (${secs(silent)} to ${secs(voiced[lang])})`, 'the captions are long for speech; cut words or give the scenes more time'));
      }
      r.scenes.forEach((s, i) => {
        const cps = { en: s.say.en.length / (s.ms / 1000), hi: (s.say.hi.length * 0.85) / (s.ms / 1000) };
        const top = Math.max(cps.en, cps.hi);
        if (top > BUDGET.captionWarnCps) out.push(warn('caption-speed', `scene ${i + 1} is ${top.toFixed(0)} characters a second (${cps.en >= cps.hi ? 'English' : 'Hindi'}); comfortable is up to ${BUDGET.captionWarnCps}`, 'lengthen the scene or shorten the caption'));
      });
      return { findings: out, detail: `${secs(silent)} silent, ${secs(voiced.en)} with English voice, ${secs(voiced.hi)} with Hindi voice` };
    },
  },
  {
    key: 'quiz', label: 'Quiz is a fair question',
    run: r => {
      const q = r.quiz, out: Finding[] = [];
      if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) out.push(err('quiz-answer', 'the answer index is outside the options'));
      if (new Set(q.options.map(o => norm(o.en))).size !== q.options.length) out.push(err('quiz-options', 'two options are the same in English'));
      if (new Set(q.options.map(o => norm(o.hi))).size !== q.options.length) out.push(err('quiz-options', 'two options are the same in Hindi'));
      if (q.why.en.trim().length < 15 || q.why.hi.trim().length < 10) out.push(err('quiz-why', 'the explanation ("why") is missing or too short to teach anything', 'say why the right answer is right'));
      if (q.q.en.trim().length < 12) out.push(err('quiz-question', 'the question is too short'));
      if (q.options.length >= 3 && q.options[q.answer]) {
        const lens = q.options.map(o => o.en.length), right = lens[q.answer], rest = lens.filter((_, i) => i !== q.answer);
        if (right > 40 && right > Math.max(...rest) * 2.5) out.push(warn('quiz-tell', 'the right option is much longer than the others, which gives it away', 'make the wrong options as specific as the right one'));
      }
      if (q.options.some(o => /^(all|none) of the above$/i.test(o.en.trim()))) out.push(warn('quiz-vague', '"all/none of the above" teaches little', 'use concrete options'));
      return { findings: out, detail: `${q.options.length} options, answer ${q.answer + 1}, explanation ${q.why.en.length} characters` };
    },
  },
  {
    key: 'wording', label: 'No advice or promise wording, no links',
    run: r => {
      const out = [...adviceFindings(r), ...linkFindings(r)];
      for (const t of allText(r)) {
        if (PERSONAL.test(t.replace(EMAIL, ' '))) out.push(err('personal-data', `looks like an identifier (PAN, Aadhaar, or a phone, account or card number): "${t.slice(0, 60)}"`, 'use an obviously fake example, or none'));
        else if (EMAIL.test(t)) out.push(warn('email-in-text', `an e-mail address in the text: "${t.slice(0, 60)}"`, 'a look-alike sender must not be a domain someone could own; the review sheet should name it'));
      }
      return { findings: out, detail: out.length ? `${out.length} thing${out.length > 1 ? 's' : ''} to look at` : 'clean' };
    },
  },
  {
    key: 'unique', label: 'Title and hook are not repeated',
    run: (r, ctx) => {
      const out: Finding[] = [];
      for (const o of others(r, ctx)) {
        if (norm(o.title.en) === norm(r.title.en)) out.push(err('dup-title', `same English title as "${o.id}"`, 'retitle one'));
        else if (norm(o.title.hi) === norm(r.title.hi)) out.push(err('dup-title', `same Hindi title as "${o.id}"`, 'retitle one'));
        if (hookOf(r) && hookOf(o) === hookOf(r)) out.push(warn('dup-hook', `opens with the same line as "${o.id}"`, 'a new first line gives the feed more variety'));
      }
      return { findings: out, detail: out.length ? out.map(x => x.message).join('; ') : 'title and first line are new' };
    },
  },
  {
    key: 'places', label: 'Topic, cast, lesson and place in the library',
    run: (r, ctx) => {
      const out: Finding[] = [];
      if (!(TOPIC_ORDER as string[]).includes(r.topic)) out.push(err('topic-orphan', `the topic "${r.topic}" has no chip or Money Map row`, 'use one of: ' + TOPIC_ORDER.join(', ')));
      r.scenes.forEach((s, i) => { if (s.who !== undefined && !(CAST_IDS as readonly string[]).includes(s.who)) out.push(err('cast-missing', `scene ${i + 1} names the cast member "${s.who}", who does not exist`)); });
      if (r.lesson && ctx.lessons && !ctx.lessons.has(r.lesson)) out.push(err('lesson-missing', `points at the Learn lesson "${r.lesson}", which does not exist`));
      if (!r.tags.length) out.push(warn('no-tags', 'no tags, so search cannot find it by topic words', 'add two or three'));
      const inSeries = ctx.series.some(s => s.episodes.some(e => e.reel === r.id));
      const onMap = Boolean(ctx.meta[r.id]) && (TOPIC_ORDER as string[]).includes(r.topic);
      if (!inSeries && !onMap) out.push(warn('unreachable', 'is in no series and has no ladder entry, so neither the series screen nor the Money Map can lead to it', 'add a META entry or an episode'));
      return { findings: out, detail: `${r.topic}${inSeries ? ', in a series' : ''}${onMap ? ', on the Money Map' : ''}${r.lesson ? `, lesson ${r.lesson}` : ''}` };
    },
  },
  {
    key: 'share', label: 'Safe to share',
    run: r => {
      const out: Finding[] = [];
      if (r.mine) out.push(err('share-mine', 'is marked as built from the person\'s own figures; a library reel must not be', 'the library holds the example version only'));
      for (const l of [r.title, r.quiz.why]) for (const t of [l.en, l.hi]) if (PERSONAL.test(t) || EMAIL.test(t) || URLISH.test(t)) out.push(err('share-unsafe', `the text that is shared holds an identifier or a link: "${t.slice(0, 60)}"`));
      return { findings: out, detail: out.length ? 'the shared text is not safe' : 'shared text is the title and the quiz explanation only' };
    },
  },
  {
    key: 'weight', label: 'File size and drawing cost',
    run: r => {
      const out: Finding[] = [];
      const bytes = JSON.stringify(r).length;
      if (bytes > BUDGET.reelBytes) out.push(err('reel-size', `${(bytes / 1024).toFixed(1)} KB serialised; budget ${BUDGET.reelBytes / 1024} KB`));
      const c = reelCost(r);
      r.scenes.forEach((s, i) => { if (c.scenes[i] > BUDGET.sceneCost) out.push(warn('scene-cost', `scene ${i + 1} draws ${c.scenes[i]} animated pieces (${s.prop?.kind}); budget ${BUDGET.sceneCost}`, 'fewer bars, points or rows in that picture')); });
      return { findings: out, detail: `${(bytes / 1024).toFixed(1)} KB, heaviest scene ${c.heaviest}/${BUDGET.sceneCost} pieces${r.poke ? `, beat ${c.beat}/${BUDGET.beatCost}` : ''}` };
    },
  },
];

// ── Allowlist ──────────────────────────────────────────────────────────────────────────────────────────────────────

export const isKnown = (id: string, code: string): string | null => QA_ALLOWLIST.find(e => e.id === id && e.code === code)?.reason ?? null;

/** Splits findings into the ones that block, the warnings, and the errors the allowlist names (with its reason). Warnings are never hidden. */
export function sortFindings(id: string, fs: Finding[]): { blocking: Finding[]; warnings: Finding[]; known: (Finding & { reason: string })[] } {
  const blocking: Finding[] = [], warnings: Finding[] = [], known: (Finding & { reason: string })[] = [];
  for (const x of fs) {
    const reason = isKnown(id, x.code);
    if (reason !== null) known.push({ ...x, reason });
    else if (x.severity === 'error') blocking.push(x);
    else warnings.push(x);
  }
  return { blocking, warnings, known };
}

export function checkReel(r: Reel, ctx: QaContext): ReelReport {
  const items: CheckItem[] = CHECKS.map(c => {
    const o = c.run(r, ctx);
    return { key: c.key, label: c.label, status: o.status ?? statusWith(r.id, o.findings), detail: o.detail ?? '', findings: o.findings };
  });
  const findings = items.flatMap(i => i.findings);
  return { id: r.id, title: r.title.en, topic: r.topic, items, findings, ...sortFindings(r.id, findings) };
}

// ── Whole-library checks ─────────────────────────────────────────────────────────────────────────────────────────────

export interface LibraryFinding extends Finding { id: string }

/** Problems that belong to no single reel: repeated ids, entries with no reel, reviews of reels that are not drafts, series that point nowhere. */
export function checkLibrary(ctx: QaContext): LibraryFinding[] {
  const out: LibraryFinding[] = [];
  const at = (id: string, x: Finding) => out.push({ id, ...x });
  const seen = new Map<string, number>();
  const everyone = ctx.against ?? ctx.reels;
  for (const r of everyone) seen.set(r.id, (seen.get(r.id) ?? 0) + 1);
  for (const [id, n] of seen) if (n > 1) at(id, err('dup-id', `the id appears ${n} times`));
  const ids = new Set(everyone.map(r => r.id));
  for (const id of Object.keys(ctx.meta)) if (!ids.has(id)) at(id, err('meta-stray', 'has a ladder entry (meta.ts) but there is no such reel'));
  for (const id of Object.keys(ctx.act)) if (!ids.has(id)) at(id, err('act-stray', 'has a tool link but there is no such reel'));
  for (const id of Object.keys(ctx.trust)) if (!ids.has(id)) at(id, err('trust-stray', 'has a trust note (trust.ts) but there is no such reel'));
  for (const [id, so] of Object.entries(ctx.reviewed)) {
    if (!ctx.draftIds.has(id)) at(id, err('review-stray', 'is signed off in review.ts but is not a draft reel'));
    if (!so.hindi.trim() || !so.compliance.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(so.on)) at(id, err('review-incomplete', 'a sign-off needs both reviewers\' names and a YYYY-MM-DD date'));
  }
  for (const s of ctx.series) {
    s.episodes.forEach((e, i) => { if (!ids.has(e.reel)) at(`series:${s.id}`, err('series-episode', `episode ${i + 1} names the reel "${e.reel}", which does not exist`)); });
    if (new Set(s.episodes.map(e => e.reel)).size !== s.episodes.length) at(`series:${s.id}`, err('series-repeat', 'the same reel appears twice'));
  }
  const skew = answerSkew(coverage(ctx));
  if (ctx.reels.length >= 30 && skew.share > 0.6) at('library', err('answer-skew', `${Math.round(skew.share * 100)}% of the quiz answers are option ${skew.position + 1}; viewers learn to pick it without reading`, 'move the right answer around: a library should put each position near an even share'));
  return out;
}

// ── Coverage (the --summary view) ───────────────────────────────────────────────────────────────────────────────────

export type Format = 'explainer' | Beat['kind'];
export const formatOf = (r: Reel): Format => r.poke?.beat.kind ?? 'explainer';

export interface Coverage {
  count: number;
  byTopic: Record<string, number>;
  byLevel: Record<Level, number>;
  byFormat: Record<string, number>;
  byPillar: Record<string, { reels: number; weight: number }>;
  /** topic x level counts for the Money Map */
  grid: Record<string, Record<Level, number>>;
  gaps: { topic: string; level: Level }[];
  noAct: string[];
  noScamToolExempt: string[];
  unreachable: string[];
  noTrustButFigures: string[];
  answerPositions: number[];
  totalBytes: number;
  largest: { id: string; bytes: number };
  /** reels by review state */
  review: { signed: number; draftWaiting: number; preGate: number };
}

export function coverage(ctx: QaContext): Coverage {
  const reels = ctx.reels;
  const topics = [...TOPIC_ORDER];
  const byTopic: Record<string, number> = {}, byFormat: Record<string, number> = {}, byPillar: Record<string, { reels: number; weight: number }> = {};
  const byLevel = Object.fromEntries(LEVELS.map(l => [l, 0])) as Record<Level, number>;
  const grid: Record<string, Record<Level, number>> = Object.fromEntries(topics.map(t => [t, Object.fromEntries(LEVELS.map(l => [l, 0])) as Record<Level, number>]));
  const answerPositions: number[] = [];
  let totalBytes = 0, largest = { id: '', bytes: 0 };
  const review = { signed: 0, draftWaiting: 0, preGate: 0 };
  for (const r of reels) {
    byTopic[r.topic] = (byTopic[r.topic] ?? 0) + 1;
    const fm = formatOf(r); byFormat[fm] = (byFormat[fm] ?? 0) + 1;
    const m = ctx.meta[r.id];
    if (m) {
      byLevel[m.level] = (byLevel[m.level] ?? 0) + 1;
      if (grid[r.topic]) grid[r.topic][m.level]++;
      for (const [p, w] of Object.entries(m.needs)) { const e = byPillar[p] ?? { reels: 0, weight: 0 }; e.reels++; e.weight += w ?? 0; byPillar[p] = e; }
    }
    answerPositions[r.quiz.answer] = (answerPositions[r.quiz.answer] ?? 0) + 1;
    const bytes = JSON.stringify(r).length; totalBytes += bytes; if (bytes > largest.bytes) largest = { id: r.id, bytes };
    if (ctx.reviewed[r.id]) review.signed++; else if (ctx.draftIds.has(r.id)) review.draftWaiting++; else review.preGate++;
  }
  const gaps: { topic: string; level: Level }[] = [];
  for (const t of topics) for (const l of LEVELS) if (grid[t][l] === 0) gaps.push({ topic: t, level: l });
  return {
    count: reels.length, byTopic, byLevel, byFormat, byPillar, grid, gaps,
    noAct: reels.filter(r => r.topic !== 'safety' && !ctx.act[r.id]).map(r => r.id),
    noScamToolExempt: reels.filter(r => r.topic === 'safety' && ctx.act[r.id]).map(r => r.id),
    unreachable: reels.filter(r => !ctx.series.some(s => s.episodes.some(e => e.reel === r.id)) && !(ctx.meta[r.id] && (TOPIC_ORDER as string[]).includes(r.topic))).map(r => r.id),
    noTrustButFigures: reels.filter(r => quotesFigures(r) && !ctx.trust[r.id]).map(r => r.id),
    answerPositions, totalBytes, largest, review,
  };
}

/** Reels that no series places. They are still on the Money Map (every reel with a ladder entry is), but no story leads to them. */
export const notInAnySeries = (ctx: QaContext): string[] => ctx.reels.filter(r => !ctx.series.some(s => s.episodes.some(e => e.reel === r.id))).map(r => r.id);

/** Share of reels whose answer sits at the most common position, and that position; a library where "b" is nearly always right teaches guessing. */
export function answerSkew(c: Coverage): { share: number; position: number } {
  const total = c.answerPositions.reduce((a, b) => a + (b ?? 0), 0) || 1;
  let best = 0, pos = 0;
  c.answerPositions.forEach((n, i) => { if ((n ?? 0) > best) { best = n ?? 0; pos = i; } });
  return { share: best / total, position: pos };
}

// ── The real library ───────────────────────────────────────────────────────────────────────────────────────────────


/** The reels the app plays today (drafts only when they are signed off or the build includes them). */
export const liveContext = (lessons?: Set<string>): QaContext => ({ reels: LIBRARY, meta: META, act: ACT_ALL, trust: TRUST, series: SERIES, reviewed: REVIEWED, draftIds: DRAFT_IDS, lessons });

/** The 50 draft reels, checked as they would stand once released, against the live library around them (for titles, hooks and series). */
export const draftContext = (lessons?: Set<string>): QaContext => ({
  reels: DRAFT_REELS, meta: { ...META, ...DRAFT_META }, act: { ...ACT_ALL, ...DRAFT_ACT }, trust: TRUST,
  series: [...SERIES, ...DRAFT_SERIES.filter(s => !SERIES.some(x => x.id === s.id))], reviewed: REVIEWED, draftIds: DRAFT_IDS, lessons,
  against: [...LIBRARY, ...DRAFT_REELS.filter(d => !LIBRARY.some(x => x.id === d.id))],
});
