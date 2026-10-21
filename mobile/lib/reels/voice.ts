// How a reel is spoken, as pure functions so every rule is testable without a phone: what text the voice is given (numbers, rupees, acronyms and symbols
// made speakable in English and Hindi), how it is cut into phrases with breaths between them, how the mood changes pace and pitch, how the whole
// thing is fitted into the scene's time, how far through the caption the voice is, and how the caption moves in and out.
import type { Lang } from '@/lib/i18nCore';
import type { Mood } from '@/lib/reels/types';

// ── Making the text speakable ─────────────────────────────────────────────────────────────────────────────────────

const LETTERS_HI: Record<string, string> = { A: 'ए', B: 'बी', C: 'सी', D: 'डी', E: 'ई', F: 'एफ', G: 'जी', H: 'एच', I: 'आई', J: 'जे', K: 'के', L: 'एल', M: 'एम', N: 'एन', O: 'ओ', P: 'पी', Q: 'क्यू', R: 'आर', S: 'एस', T: 'टी', U: 'यू', V: 'वी', W: 'डब्ल्यू', X: 'एक्स', Y: 'वाई', Z: 'ज़ेड' };
/** Acronyms said as a word, not letter by letter. */
const AS_WORD: Record<string, { en: string; hi: string }> = { SEBI: { en: 'Sebi', hi: 'सेबी' }, NAV: { en: 'nav', hi: 'नैव' }, UPI: { en: 'U P I', hi: 'यू पी आई' }, FASTag: { en: 'fast tag', hi: 'फ़ास्टैग' }, KYC: { en: 'K Y C', hi: 'के वाई सी' }, Mitra: { en: 'Mitra', hi: 'मित्रा' } };

function spellOut(token: string, lang: Lang): string {
  const w = AS_WORD[token]; if (w) return w[lang];
  const letters = token.split('');
  return lang === 'hi' ? letters.map(c => LETTERS_HI[c] ?? c).join(' ') : letters.join(' ');
}

/** Text made ready for a text-to-speech voice. The caption on screen is not changed; only what is spoken. */
export function speechText(raw: string, lang: Lang): string {
  let s = raw;
  s = s.replace(/[🦉✓✕✨↺↑↗🔥💞🍼🎓🛟🛡️🧾🏠🏖️🎬📖🗺️✅]/gu, ' ');
  s = s.replace(/[“”"]/g, '');
  const rupees = lang === 'hi' ? 'रुपये' : 'rupees';
  // Rupee amounts: "₹1,20,000" -> "120000 rupees", "₹3.49 crore" -> "3.49 crore rupees"
  s = s.replace(/₹\s?([\d,]+(?:\.\d+)?)(\s?(?:lakh|crore|लाख|करोड़))?/g, (_m, n: string, unit?: string) => `${n.replace(/,/g, '')}${unit ? unit.startsWith(' ') ? unit : ' ' + unit : ''} ${rupees}`);
  s = s.replace(/(\d),(?=\d{2,3}\b)/g, '$1');                                         // 1,20,000 -> 120000 (Indian grouping confuses a voice)
  s = s.replace(/(\d(?:\.\d+)?)\s?%/g, `$1 ${lang === 'hi' ? 'प्रतिशत' : 'percent'}`);
  s = s.replace(/(\d)\+/g, `$1 ${lang === 'hi' ? 'से ज़्यादा' : 'plus'}`);
  s = s.replace(/\s÷\s/g, lang === 'hi' ? ' भाग ' : ' divided by ').replace(/\s×\s/g, lang === 'hi' ? ' गुणा ' : ' times ').replace(/\s=\s/g, lang === 'hi' ? ' बराबर ' : ' equals ');
  s = s.replace(/≠/g, lang === 'hi' ? ' बराबर नहीं ' : ' is not ').replace(/→/g, ', ').replace(/&/g, lang === 'hi' ? ' और ' : ' and ');
  s = s.replace(/(\d)\s?[–−-]\s?(\d)/g, lang === 'hi' ? '$1 से $2' : '$1 to $2');                   // 3-6, 2025-26
  s = s.replace(/(\d)\/(\d)/g, '$1 $2');                                              // 50/30/20
  s = s.replace(/\bFY\b/g, lang === 'hi' ? 'एफ वाई' : 'F Y');
  s = s.replace(/\b1930\b/g, '1 9 3 0');                                              // the helpline is said digit by digit
  s = s.replace(/\b([A-Z][A-Za-z]{1,7}|[A-Z]{2,7})\b/g, (m: string) => (AS_WORD[m] || (/^[A-Z]{2,7}$/.test(m) && !/^(OK|AM|PM)$/.test(m)) ? spellOut(m, lang) : m));
  s = s.replace(/\s*\.{3}|…/g, ', ').replace(/\s+/g, ' ').trim();
  return s;
}

// ── Phrases, pauses and mood ──────────────────────────────────────────────────────────────────────────────────────

export interface Chunk { text: string; pauseAfterMs: number; rateAdj: number; pitchAdj: number }

const PAUSE: Record<string, number> = { '.': 340, '।': 340, '?': 400, '!': 320, ':': 280, ';': 240, ',': 150 };

/** Cuts speakable text into phrases at sentence ends and colons, so the voice breathes where a reader would. Questions rise, big payoffs slow down. */
export function chunks(spoken: string): Chunk[] {
  const parts = spoken.split(/(?<=[.!?।:;])\s+/).map(p => p.trim()).filter(Boolean);
  return parts.map((text, i) => {
    const end = text.slice(-1), last = i === parts.length - 1;
    const payoff = /\d/.test(text) && /(about|near|becomes|ends|only|total|लगभग|करीब|बनता|कुल|सिर्फ़)/i.test(text);
    return {
      text,
      pauseAfterMs: last ? 0 : (PAUSE[end] ?? 200),
      rateAdj: payoff ? -0.06 : end === '!' ? 0.04 : 0,
      pitchAdj: end === '?' ? 0.08 : payoff ? 0.04 : end === '!' ? 0.05 : 0,
    };
  });
}

/** Pace and pitch by mood: bright and quick when pleased, slower and lower when worried, a lift when surprised. */
export const MOOD_VOICE: Record<Mood, { rate: number; pitch: number }> = {
  happy: { rate: 1.0, pitch: 1.06 }, think: { rate: 0.95, pitch: 1.0 }, worry: { rate: 0.92, pitch: 0.94 }, surprised: { rate: 1.04, pitch: 1.14 }, cheer: { rate: 1.06, pitch: 1.18 },
};
const BASE_RATE: Record<Lang, number> = { en: 0.98, hi: 0.94 };
/** Typical speech speed at a rate of 1.0, in characters a second. Measured values replace these as the phone speaks (see speech.ts). */
export const DEFAULT_CPS: Record<Lang, number> = { en: 14.5, hi: 12.5 };

export interface PlannedChunk extends Chunk { rate: number; pitch: number }
export interface VoicePlan { chunks: PlannedChunk[]; totalChars: number; estMs: number; leadMs: number; fitted: boolean; overrunMs: number }

/** What the person's voice settings and the phone's measured voice change about the plan. speech.ts registers the real values; the defaults are for tests. */
export interface Tuning { cps?: number; speed?: number; style?: 'expressive' | 'steady'; pauseScale?: number }
let tuning: (lang: Lang) => Tuning = () => ({});
export const setTuning = (fn: (lang: Lang) => Tuning): void => { tuning = fn; };

export const LEAD_MS = 180;            // the caption appears first, then the voice
export const TAIL_MS = 300;            // a breath before the next scene starts
const MIN_FIT = 0.96, MAX_FIT = 1.12;      // the pace is only nudged: a voice that is hurried stops sounding like a person

/**
 * Fits the speech into the scene. The pace is nudged (never below 0.96x or above 1.12x of the mood's pace) so the voice finishes a breath before the scene
 * ends; if even the fastest comfortable pace does not fit, `overrunMs` says how much longer the scene must be for the voice to finish. The reels were
 * written to be read silently, which is quicker than speech, so with the voice on most scenes need a little more time (see withVoiceTiming).
 */
export function plan(opts: { text: string; big?: string; mood: Mood; lang: Lang; budgetMs: number; cps?: number; speed?: number; style?: 'expressive' | 'steady'; pauseScale?: number }): VoicePlan {
  const { mood, lang } = opts, t = tuning(lang), cps = opts.cps ?? t.cps ?? DEFAULT_CPS[lang], speed = opts.speed ?? t.speed ?? 1, style = opts.style ?? t.style ?? 'expressive', pauseScale = opts.pauseScale ?? t.pauseScale ?? 1;
  const amp = style === 'steady' ? 0.35 : 1, m0 = MOOD_VOICE[mood], m = { rate: 1 + (m0.rate - 1) * amp, pitch: 1 + (m0.pitch - 1) * amp };
  const caption = chunks(speechText(opts.text, lang));
  const big = opts.big && opts.big.trim().split(/\s+/).length <= 3 && !caption[0]?.text.toLowerCase().startsWith(opts.big.toLowerCase().slice(0, 6))
    ? [{ text: speechText(opts.big, lang) + '.', pauseAfterMs: 320, rateAdj: -0.08, pitchAdj: 0.08 } as Chunk] : [];
  const all = [...big, ...caption].map(c => ({ ...c, pauseAfterMs: Math.round(c.pauseAfterMs * pauseScale), rateAdj: c.rateAdj * amp, pitchAdj: c.pitchAdj * (style === 'steady' ? 0.35 : 1.25) }));
  const pauses = all.reduce((n, c) => n + c.pauseAfterMs, 0);
  const totalChars = all.reduce((n, c) => n + c.text.length, 0);
  const baseRate = BASE_RATE[lang] * m.rate * speed;
  const speechAtBase = (totalChars / (cps * baseRate)) * 1000;
  const room = Math.max(1, opts.budgetMs - LEAD_MS - TAIL_MS - pauses);
  const fit = Math.min(MAX_FIT, Math.max(MIN_FIT, speechAtBase / room));
  const planned = all.map(c => ({ ...c, rate: Math.round((baseRate * fit + c.rateAdj) * 100) / 100, pitch: Math.round((m.pitch + c.pitchAdj) * 100) / 100 }));
  const estMs = (totalChars / (cps * baseRate * fit)) * 1000 + pauses;
  return { chunks: planned, totalChars, estMs, leadMs: LEAD_MS, fitted: speechAtBase / fit <= room + 1, overrunMs: Math.max(0, Math.round(LEAD_MS + estMs + TAIL_MS - opts.budgetMs)) };
}

// ── Choosing the best voice on the phone ──────────────────────────────────────────────────────────────────────────

export interface VoiceInfo { identifier: string; name: string; language: string; quality?: string }

/** The installed voices for a language, best first: the right country, then enhanced or neural quality, then a natural-sounding name. */
export function rankVoices(voices: VoiceInfo[], lang: Lang): (VoiceInfo & { score: number; enhanced: boolean })[] {
  const want = lang === 'hi' ? ['hi-IN', 'hi'] : ['en-IN', 'en-GB', 'en-US', 'en'];
  const norm = (l: string) => l.replace('_', '-');
  const out: (VoiceInfo & { score: number; enhanced: boolean })[] = [];
  for (const v of voices) {
    const l = norm(v.language), rank = want.findIndex(w => l === w || l.startsWith(w + '-') || (w.length === 2 && l.startsWith(w)));
    if (rank < 0) continue;
    const q = `${v.name} ${v.identifier} ${v.quality ?? ''}`.toLowerCase();
    const enhanced = /premium|enhanced|neural|natural|wavenet|studio/.test(q);
    out.push({ ...v, enhanced, score: (want.length - rank) * 100 + (enhanced ? 60 : 0) + (/compact|espeak|robot/.test(q) ? -40 : 0) + (/network|online/.test(q) ? 10 : 0) });
  }
  return out.sort((a, b) => b.score - a.score);
}
/** The best installed voice for a language, or null. */
export const pickVoice = (voices: VoiceInfo[], lang: Lang): VoiceInfo | null => rankVoices(voices, lang)[0] ?? null;

// ── Keeping caption and voice together ────────────────────────────────────────────────────────────────────────────

/** Which word of the caption the voice is on, from how far through the spoken text it is (0 to 1). Words are weighted by their length. */
export function wordAt(words: string[], progress: number): number {
  if (!words.length) return -1;
  const total = words.reduce((n, w) => n + w.length + 1, 0);
  const target = Math.min(1, Math.max(0, progress)) * total;
  let acc = 0;
  for (let i = 0; i < words.length; i++) { acc += words[i].length + 1; if (target < acc) return i; }
  return words.length - 1;
}

/** How a caption enters and leaves: a short rise and fade in at the start of its scene, a fade out at the end. A pure function of the scene's own clock. */
export function captionMotion(elapsedMs: number, sceneMs: number): { opacity: number; translateY: number } {
  const inP = Math.min(1, Math.max(0, elapsedMs / 340)), outP = Math.min(1, Math.max(0, (sceneMs - elapsedMs) / 220));
  const ease = 1 - Math.pow(1 - inP, 3);
  return { opacity: Math.min(ease, outP), translateY: (1 - ease) * 14 };
}

/**
 * The reel's clock while a voice is speaking: it will not cross into the next scene until the voice has finished its sentence (and the scene's own
 * length has passed), for at most `maxHoldMs`, so the voice is never cut off and the next text never arrives over the old one.
 */
export function holdAtSceneEnd(t: number, dt: number, sceneEnd: number, voiceBusy: boolean, heldMs: number, maxHoldMs = 1600): { t: number; heldMs: number } {
  if (voiceBusy && t + dt >= sceneEnd && heldMs < maxHoldMs) return { t: Math.min(t + dt, sceneEnd - 1), heldMs: heldMs + dt };
  return { t: t + dt, heldMs: t + dt >= sceneEnd ? 0 : heldMs };
}

/**
 * The reel as it plays with the voice on: every scene lasts as long as the voice needs (its own length, or the spoken length plus a breath at each end,
 * whichever is more). The reel's clock, scene starts, pauses for a beat and progress segments all follow from these lengths, so the caption, the picture and
 * the voice change scene together and the voice is never cut off.
 */
export function withVoiceTiming<R extends { scenes: { ms: number; say: Record<Lang, string>; big?: Record<Lang, string>; mood: Mood }[] }>(reel: R, lang: Lang, cps?: number): R {
  return { ...reel, scenes: reel.scenes.map(sc => { const p = plan({ text: sc.say[lang], big: sc.big?.[lang], mood: sc.mood, lang, budgetMs: sc.ms, cps }); return p.overrunMs > 0 ? { ...sc, ms: sc.ms + Math.ceil(p.overrunMs / 100) * 100 } : sc; }) };
}
