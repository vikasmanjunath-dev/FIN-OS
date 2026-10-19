// Interactive beats inside a reel (guess first, what-if slider, myth or fact). Everything the screen needs to decide is here as pure functions:
// where on the clock the reel pauses, how a guess is judged, what a slider shows, how myth cards are scored, and the rules every beat must keep.
// The slider never holds a formula of its own: it calls the tested functions in figures.ts.
import { sceneStarts } from '@/lib/reels/engine';
import { emi, inflatedValue, money, monthsToDeplete, sipFutureValue, sipNeeded, stepUpSipFutureValue, unpaidBalance } from '@/lib/reels/figures';
import { STD_NEW, STD_OLD, taxNew, taxOld } from '@/lib/taxcore';
import type { Beat, L, Reel, SliderModel } from '@/lib/reels/types';

/** Without a touch for this long the beat reveals its answer on its own, so a viewer who does nothing (or cannot touch) loses nothing. */
export const IDLE_MS = 8000;
/** After an automatic reveal the reel plays on by itself once this much reading time has passed. */
export const AUTO_CONTINUE_MS = 6000;

/** Whether a reel's beat is sound enough to show: it passes the same rules the tests hold every beat to. A reel whose beat fails them simply plays without it. */
export function isBeatUsable(r: Reel): boolean {
  if (!r.poke) return false;
  try { return pokeStart(r) !== null && validateBeat(r.poke.beat).length === 0; } catch { return false; }
}

/** The moment on the reel's clock at which the beat takes over, just before the next scene begins; null for a reel with no beat. */
export function pokeStart(r: Reel): number | null {
  if (!r.poke) return null;
  const starts = sceneStarts(r);
  const i = r.poke.after;
  if (!Number.isInteger(i) || i < 0 || i >= r.scenes.length - 1) return null;
  return starts[i] + r.scenes[i].ms - 1;
}

// ── guess first ────────────────────────────────────────────────────────────────────────────────────────────────────

/** Rounds to two significant figures, so a dragged guess reads as a number a person would say ("₹18 lakh", not "₹17,86,431"). */
export function niceRound(v: number): number {
  if (!(v > 0) || !Number.isFinite(v)) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(v)) - 1);
  return Math.round(v / mag) * mag;
}

/** The guess scale is logarithmic: money outcomes span orders of magnitude and the thumb needs the same feel at ₹1 lakh and ₹1 crore. */
export function posToValue(pos: number, min: number, max: number): number {
  const p = Math.min(1, Math.max(0, Number.isFinite(pos) ? pos : 0));
  return niceRound(min * Math.pow(max / min, p));
}
export function valueToPos(v: number, min: number, max: number): number {
  if (!(v > 0)) return 0;
  return Math.min(1, Math.max(0, Math.log(v / min) / Math.log(max / min)));
}

export type GuessVerdict = 'spot' | 'close' | 'far';
export interface GuessResult { verdict: GuessVerdict; /** how many times too low or too high, always at least 1 */ times: number; side: 'low' | 'high' | 'exact' }

/** Within 15% is spot on, within 60% (either way) is close, anything else is far. A guess is never a failure: the screen only shows the gap. */
export function scoreGuess(guess: number, answer: number): GuessResult {
  if (!(guess > 0) || !(answer > 0)) return { verdict: 'far', times: Infinity, side: 'low' };
  const times = Math.max(guess / answer, answer / guess);
  const side = guess === answer ? 'exact' : guess < answer ? 'low' : 'high';
  return { verdict: times <= 1.15 ? 'spot' : times <= 1.6 ? 'close' : 'far', times, side };
}

// ── what-if slider ─────────────────────────────────────────────────────────────────────────────────────────────────

export interface SliderFigures {
  /** The headline figure at this position. */ value: number;
  /** Money put in, or the amount the figure starts from. */ put: number;
  /** The figure with nothing changed (the reference). */ base: number;
  /** The reference minus the value (what waiting, or the change, costs); negative when the change helps. For tenure and goal models: the interest, or the growth. */ lost: number;
  /** The size of the gap between value and reference, never negative. */ diff: number;
  /** True when `value` and `base` are years, not rupees (how long a corpus lasts). */ years?: boolean;
}

/** A corpus that never runs out is shown as this many years. */
export const FOREVER_YEARS = 60;

/** What the slider shows at `x`. */
export function evalModel(m: SliderModel, x: number): SliderFigures {
  const fig = (value: number, put: number, base: number, lost: number, years?: boolean): SliderFigures => ({ value, put, base, lost, diff: Math.abs(value - base), ...(years ? { years: true } : {}) });
  switch (m.kind) {
    case 'sip-years': { const value = sipFutureValue(m.monthly, m.rate, x); return fig(value, m.monthly * 12 * x, value, 0); }
    case 'sip-delay': {
      const years = Math.max(0, m.horizon - x);
      const value = sipFutureValue(m.monthly, m.rate, years), base = sipFutureValue(m.monthly, m.rate, m.horizon);
      return fig(value, m.monthly * 12 * years, base, base - value);
    }
    case 'inflation-years': { const value = inflatedValue(m.amount, m.rate, x); return fig(value, m.amount, m.amount, m.amount - value); }
    case 'emi-rate': { const value = emi(m.principal, x, m.years), base = emi(m.principal, m.rate0, m.years); return fig(value, m.principal, base, base - value); }
    case 'emi-tenure': { const value = emi(m.principal, m.rate, x), paid = value * x * 12; return fig(value, paid, m.principal, paid - m.principal); }
    case 'goal-sip': { const value = sipNeeded(m.target, m.rate, x), paid = value * 12 * x; return fig(value, paid, m.target, m.target - paid); }
    case 'step-up': {
      const value = stepUpSipFutureValue(m.monthly, x, m.rate, m.years), base = stepUpSipFutureValue(m.monthly, 0, m.rate, m.years);
      let paid = 0, sip = m.monthly; for (let y = 0; y < m.years; y++) { paid += sip * 12; sip *= 1 + x / 100; }
      return fig(value, paid, base, base - value);
    }
    case 'tax-income': { const value = taxNew(Math.max(0, x - STD_NEW)), base = taxOld(Math.max(0, x - STD_OLD - m.deduction)); return fig(value, x, base, base - value); }
    case 'corpus-spend': {
      const months = monthsToDeplete(m.corpus, m.rate, x), years = Number.isFinite(months) ? Math.min(FOREVER_YEARS, months / 12) : months === Infinity ? FOREVER_YEARS : NaN;
      return fig(years, m.corpus, 0, 0, true);
    }
    case 'card-interest': { const value = unpaidBalance(m.balance, m.monthlyPct, x); return fig(value, m.balance, m.balance, m.balance - value); }
  }
}

/** The slider's own value as the viewer reads it. */
export function xText(b: Extract<Beat, { kind: 'slider' }>, x: number, lang: 'en' | 'hi'): string {
  if (b.xFormat === 'inr') return money(x)[lang];
  const u = b.unit[lang];
  return `${x}${u.startsWith('%') ? '' : ' '}${u}`.trim();
}

const yearsText = (n: number, lang: 'en' | 'hi'): string => { const v = n >= FOREVER_YEARS ? `${FOREVER_YEARS}+` : String(Math.round(n * 10) / 10); return lang === 'en' ? `${v} years` : `${v} साल`; };

/** The takeaway sentence for the slider's current position, with the figures dropped in. Rounded to the same rupee the screen shows. */
export function sliderLine(b: Extract<Beat, { kind: 'slider' }>, x: number): L {
  const f = evalModel(b.model, x);
  const fmt = (n: number): L => (f.years ? { en: yearsText(n, 'en'), hi: yearsText(n, 'hi') } : money(n));
  const xs = (lang: 'en' | 'hi'): string => (b.xFormat === 'inr' ? money(x)[lang] : b.unit[lang].startsWith('%') ? `${x}%` : String(x));      // a plain number, so a template can write "{x} years late"; rupees and percentages carry their sign
  const vals: Record<string, L> = { x: { en: xs('en'), hi: xs('hi') }, xu: { en: xText(b, x, 'en'), hi: xText(b, x, 'hi') }, value: fmt(f.value), put: money(f.put), base: fmt(f.base), lost: money(Math.abs(f.lost)), diff: fmt(f.diff) };
  const run = (s: string, lang: 'en' | 'hi') => s.replace(/\{(\w+)\}/g, (_, k) => vals[k]?.[lang] ?? '');
  return { en: run(b.takeaway.en, 'en'), hi: run(b.takeaway.hi, 'hi') };
}

export interface SliderBar { label: L; /** 0 to 1 of the longest bar */ frac: number; text: L; tone: 'a' | 'b' }

/** The two bars drawn under the slider: the reference against the value (or what was put in against what it becomes). */
export function sliderBars(b: Extract<Beat, { kind: 'slider' }>, x: number): SliderBar[] {
  const m = b.model, f = evalModel(m, x);
  const l = (en: string, hi: string): L => ({ en, hi });
  const rupee = (n: number): L => money(n);
  const years = (n: number): L => ({ en: yearsText(n, 'en'), hi: yearsText(n, 'hi') });
  const pair = (a: { label: L; v: number; text: L }, c: { label: L; v: number; text: L }): SliderBar[] => { const top = Math.max(a.v, c.v, 1); return [{ label: a.label, frac: a.v / top, text: a.text, tone: 'a' }, { label: c.label, frac: c.v / top, text: c.text, tone: 'b' }]; };
  switch (m.kind) {
    case 'sip-years': return pair({ label: l('You put in', 'आपने लगाया'), v: f.put, text: rupee(f.put) }, { label: l('It becomes', 'बनता है'), v: f.value, text: rupee(f.value) });
    case 'sip-delay': return pair({ label: l('Start today', 'आज शुरू करें'), v: f.base, text: rupee(f.base) }, { label: l('With your wait', 'आपके इंतज़ार के साथ'), v: f.value, text: rupee(f.value) });
    case 'inflation-years': return pair({ label: l('Today', 'आज'), v: f.base, text: rupee(f.base) }, { label: l('Buying power', 'खरीदने की ताक़त'), v: f.value, text: rupee(f.value) });
    case 'emi-rate': return pair({ label: l('EMI at the start rate', 'शुरुआती दर पर EMI'), v: f.base, text: rupee(f.base) }, { label: l('EMI at this rate', 'इस दर पर EMI'), v: f.value, text: rupee(f.value) });
    case 'emi-tenure': return pair({ label: l('Loan', 'लोन'), v: m.principal, text: rupee(m.principal) }, { label: l('Total you pay', 'कुल आप चुकाते हैं'), v: f.put, text: rupee(f.put) });
    case 'goal-sip': return pair({ label: l('You put in', 'आप लगाते हैं'), v: f.put, text: rupee(f.put) }, { label: l('The goal', 'लक्ष्य'), v: m.target, text: rupee(m.target) });
    case 'step-up': return pair({ label: l('No step-up', 'कोई बढ़ोतरी नहीं'), v: f.base, text: rupee(f.base) }, { label: l('With step-up', 'बढ़ोतरी के साथ'), v: f.value, text: rupee(f.value) });
    case 'tax-income': return pair({ label: l('New regime', 'नया रिजीम'), v: f.value, text: rupee(f.value) }, { label: l('Old regime', 'पुराना रिजीम'), v: f.base, text: rupee(f.base) });
    case 'corpus-spend': return pair({ label: l('Lasts', 'चलेगा'), v: f.value, text: years(f.value) }, { label: l('Longest shown', 'सबसे लंबा'), v: FOREVER_YEARS, text: years(FOREVER_YEARS) });
    case 'card-interest': return pair({ label: l('You owe now', 'अभी बकाया'), v: f.base, text: rupee(f.base) }, { label: l('After the wait', 'इंतज़ार के बाद'), v: f.value, text: rupee(f.value) });
  }
}

// ── myth or fact ───────────────────────────────────────────────────────────────────────────────────────────────────

/** `answers[i]` is true if the viewer said "fact", false for "myth", null if not answered (skipped or timed out). */
export function scoreMyth(cards: { fact: boolean }[], answers: (boolean | null)[]): { right: number; answered: number; total: number } {
  let right = 0, answered = 0;
  cards.forEach((c, i) => { const a = answers[i]; if (a === null || a === undefined) return; answered++; if (a === c.fact) right++; });
  return { right, answered, total: cards.length };
}

// ── spot the scam ──────────────────────────────────────────────────────────────────────────────────────────────

/** `picked[i]` is true if the viewer tapped piece i. Missed flags and wrong taps are both listed so the screen can show each. */
export function scoreSpot(parts: { flag?: unknown }[], picked: boolean[]): { found: number; flags: number; missed: number[]; wrong: number[] } {
  let found = 0, flags = 0; const missed: number[] = [], wrong: number[] = [];
  parts.forEach((p, i) => {
    const isFlag = !!p.flag, tapped = picked[i] === true;
    if (isFlag) { flags++; if (tapped) found++; else missed.push(i); } else if (tapped) wrong.push(i);
  });
  return { found, flags, missed, wrong };
}

/** The whole message as the viewer reads it, in one language. */
export const spotMessage = (parts: { t: L }[], lang: 'en' | 'hi'): string => parts.map(p => p.t[lang]).join(' ');

// ── sort and order ────────────────────────────────────────────────────────────────────────────────────────────

/** `answers[i]` is the bin the viewer chose for card i, or null if not answered. */
export function scoreSort(cards: { bin: number }[], answers: (number | null)[]): { right: number; answered: number; total: number } {
  let right = 0, answered = 0;
  cards.forEach((c, i) => { const a = answers[i]; if (a === null || a === undefined) return; answered++; if (a === c.bin) right++; });
  return { right, answered, total: cards.length };
}

/** The order the items are shown in: a fixed shuffle (never the correct order for 3 or more items), so a screen reader and a test see the same thing. */
export function orderDeck(n: number): number[] {
  const out = Array.from({ length: n }, (_, i) => i);
  if (n < 3) return out;
  const shift = Math.ceil(n / 2);
  return out.map(i => (i + shift) % n);
}

/** `chosen` lists item indices in the order the viewer tapped them. Returns how many sit in their correct place. */
export function scoreOrder(chosen: number[], total: number): { right: number; total: number } {
  let right = 0;
  chosen.slice(0, total).forEach((idx, pos) => { if (idx === pos) right++; });
  return { right, total };
}

// ── rules ──────────────────────────────────────────────────────────────────────────────────────────────────────────

const SLIDER_KEYS = new Set(['x', 'xu', 'value', 'put', 'base', 'lost', 'diff']);

/** Every text in a beat, for the same language, wording and fit checks the scenes get. */
export function beatTexts(b: Beat): L[] {
  if (b.kind === 'guess') return [b.q, b.reveal];
  if (b.kind === 'slider') return [b.q, b.label, b.unit, sliderLine(b, b.start)];   // the takeaway as the viewer first sees it, with the figures in
  if (b.kind === 'spot') return [b.q, b.from, b.todo, ...b.parts.flatMap(p => (p.flag ? [p.t, p.flag] : [p.t]))];
  if (b.kind === 'path') return [b.q, b.setup, b.verdict, ...b.options.flatMap(o => [o.label, o.result])];
  if (b.kind === 'sort') return [b.q, ...b.bins, ...b.cards.flatMap(c => [c.t, c.why])];
  if (b.kind === 'order') return [b.q, ...b.items.flatMap(i => [i.t, i.why])];
  return [b.q, ...b.cards.flatMap(c => [c.s, c.why])];
}

/** Problems with a beat (empty means fine). validateReel adds the reel's id. */
export function validateBeat(b: Beat): string[] {
  const bad: string[] = [];
  const long = (what: string, l: L, en: number, hi: number) => { if (l.en.length > en) bad.push(`${what} English is ${l.en.length} characters (max ${en})`); if (l.hi.length > hi) bad.push(`${what} Hindi is ${l.hi.length} characters (max ${hi})`); };
  long('beat question', b.q, 95, 120);
  if (b.kind === 'guess') {
    if (!(b.min > 0 && b.answer > b.min && b.max > b.answer && Number.isFinite(b.max))) bad.push('guess needs 0 < min < answer < max');
    else if (b.max / b.min > 10_000) bad.push('guess range is wider than 10,000 times');
    long('guess reveal', b.reveal, 170, 220);
  } else if (b.kind === 'slider') {
    if (!(b.max > b.min) || !(b.step > 0) || (b.max - b.min) / b.step > 200) bad.push('slider needs min < max and at most 200 steps');
    if (!(b.start >= b.min && b.start <= b.max)) bad.push('slider start is outside its range');
    long('slider label', b.label, 40, 55); long('slider unit', b.unit, 10, 14); long('slider takeaway', b.takeaway, 150, 200);
    for (const lang of ['en', 'hi'] as const) for (const m of b.takeaway[lang].matchAll(/\{(\w+)\}/g)) if (!SLIDER_KEYS.has(m[1])) bad.push(`slider takeaway uses unknown {${m[1]}}`);
    const m = b.model;
    const pos = (n: number) => Number.isFinite(n) && n > 0, nonneg = (n: number) => Number.isFinite(n) && n >= 0;
    const table: Record<string, [boolean, string]> = {
      'sip-years': [m.kind === 'sip-years' && pos(m.monthly) && nonneg(m.rate), 'a positive monthly amount and a rate'],
      'sip-delay': [m.kind === 'sip-delay' && pos(m.monthly) && nonneg(m.rate) && m.horizon > b.max, 'a positive monthly amount, a rate and a horizon longer than the slider maximum'],
      'inflation-years': [m.kind === 'inflation-years' && pos(m.amount) && nonneg(m.rate), 'a positive amount and a rate'],
      'emi-rate': [m.kind === 'emi-rate' && pos(m.principal) && pos(m.years) && pos(m.rate0), 'a loan, tenure and reference rate'],
      'emi-tenure': [m.kind === 'emi-tenure' && pos(m.principal) && pos(m.rate), 'a loan and a rate'],
      'goal-sip': [m.kind === 'goal-sip' && pos(m.target) && nonneg(m.rate) && b.min > 0, 'a target, a rate and a slider that starts above zero years'],
      'step-up': [m.kind === 'step-up' && pos(m.monthly) && nonneg(m.rate) && pos(m.years), 'a monthly amount, a rate and years'],
      'tax-income': [m.kind === 'tax-income' && nonneg(m.deduction), 'a deduction amount'],
      'corpus-spend': [m.kind === 'corpus-spend' && pos(m.corpus) && nonneg(m.rate) && b.min > 0, 'a corpus, a rate and a withdrawal that starts above zero'],
      'card-interest': [m.kind === 'card-interest' && pos(m.balance) && pos(m.monthlyPct), 'a balance and a monthly rate'],
    };
    const params = [table[m.kind]];
    for (const [good, what] of params) if (!good) bad.push(`slider model ${m.kind} needs ${what}`);
    if (b.xFormat === 'inr' && !(b.min >= 0)) bad.push('a rupee slider cannot start below zero');
    for (const x of [b.min, b.start, b.max]) { const f = evalModel(m, x); if (![f.value, f.put, f.base, f.lost, f.diff].every(Number.isFinite)) bad.push(`slider model gives a broken figure at ${x}`); }
  } else if (b.kind === 'spot') {
    const flags = b.parts.filter(p => p.flag).length;
    if (b.parts.length < 4 || b.parts.length > 9) bad.push('spot the scam: use 4 to 9 pieces');
    if (flags < 2 || flags > 4) bad.push('spot the scam: use 2 to 4 red flags');
    if (b.parts.length - flags < 1) bad.push('spot the scam: at least one piece must be normal, or tapping everything wins');
    long('message sender', b.from, 40, 50); long('what to do', b.todo, 190, 240);
    b.parts.forEach((p, i) => { long(`piece ${i + 1}`, p.t, 90, 120); if (p.flag) long(`piece ${i + 1} flag`, p.flag, 120, 160); });
  } else if (b.kind === 'path') {
    if (b.options.length < 2 || b.options.length > 4) bad.push('choose your path: use 2 to 4 options');
    long('setup', b.setup, 230, 290); long('verdict', b.verdict, 190, 240);
    b.options.forEach((o, i) => { long(`option ${i + 1}`, o.label, 40, 55); long(`option ${i + 1} result`, o.result, 190, 240); });
    // Without a clear winner no path may be called the best or the wrong one: the story shows the trade-off and the person's own numbers decide.
    if (!b.clear && /\b(best|worst|right choice|wrong choice|obviously|always|never)\b/i.test([b.verdict.en, ...b.options.flatMap(o => [o.label.en, o.result.en])].join(' '))) bad.push('choose your path: no path may be called best, worst, right or wrong unless the beat is marked clear');
    if (new Set(b.options.map(o => o.label.en)).size !== b.options.length) bad.push('choose your path: options repeat');
  } else if (b.kind === 'sort') {
    if (b.bins.length < 2 || b.bins.length > 3) bad.push('sort: use 2 or 3 bins');
    if (b.cards.length < 3 || b.cards.length > 6) bad.push('sort: use 3 to 6 cards');
    b.bins.forEach((x, i) => long(`bin ${i + 1}`, x, 18, 24));
    if (new Set(b.bins.map(x => x.en)).size !== b.bins.length) bad.push('sort: bins repeat');
    b.cards.forEach((c, i) => { if (!Number.isInteger(c.bin) || c.bin < 0 || c.bin >= b.bins.length) bad.push(`sort: card ${i + 1} names a bin that does not exist`); long(`card ${i + 1}`, c.t, 60, 80); long(`card ${i + 1} reason`, c.why, 120, 160); });
    for (let i = 0; i < b.bins.length; i++) if (!b.cards.some(c => c.bin === i)) bad.push(`sort: bin ${i + 1} would have no card, so it could never be right`);
    if (new Set(b.cards.map(c => c.t.en)).size !== b.cards.length) bad.push('sort: cards repeat');
  } else if (b.kind === 'order') {
    if (b.items.length < 3 || b.items.length > 6) bad.push('order: use 3 to 6 items');
    b.items.forEach((x, i) => { long(`item ${i + 1}`, x.t, 60, 80); long(`item ${i + 1} reason`, x.why, 120, 160); });
    if (new Set(b.items.map(x => x.t.en)).size !== b.items.length) bad.push('order: items repeat');
  } else {
    if (b.cards.length < 3 || b.cards.length > 5) bad.push('myth cards: use 3 to 5');
    if (!b.cards.some(c => c.fact) || !b.cards.some(c => !c.fact)) bad.push('myth cards need at least one myth and one fact');
    if (new Set(b.cards.map(c => c.s.en)).size !== b.cards.length) bad.push('myth cards repeat');
    b.cards.forEach((c, i) => { long(`card ${i + 1}`, c.s, 90, 120); long(`card ${i + 1} reason`, c.why, 130, 170); });
  }
  return bad;
}
