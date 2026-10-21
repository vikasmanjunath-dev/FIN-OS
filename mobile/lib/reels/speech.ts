// Read-aloud for reels, using the phone's own text-to-speech (works offline). What changed from a plain "speak this sentence":
//   - the best installed voice for the language is chosen (enhanced or neural over compact), once;
//   - text is made speakable (rupees, percent, acronyms, 1930 digit by digit) and cut into phrases with breaths between them;
//   - pace and pitch follow the scene's mood, and the pace is fitted so the voice ends a breath before the scene does;
//   - progress is reported while it speaks, from the voice's own word boundaries where the phone gives them, or from a clock where it does not,
//     so the caption can light up the word being said and the player can hold a scene until the sentence is finished;
//   - the real speed of the voice is measured and remembered, so the next scene is fitted more exactly.
// Loaded on demand so the web preview and the node tests never need the native module, and every call is safe if it is missing.
import type { Lang } from '@/lib/i18nCore';
import type { Mood } from '@/lib/reels/types';
import { DEFAULT_CPS, pickVoice, plan, rankVoices, setTuning, type VoiceInfo } from '@/lib/reels/voice';
import { DEFAULT_VOICE_PREFS, PAUSE_SCALE, type VoicePrefs } from '@/lib/reels/voicePrefs';
import { loadVoicePrefs } from '@/lib/reels/voicePrefsStorage';

type SpeakOpts = Record<string, unknown>;
type SpeechMod = { speak: (t: string, o: SpeakOpts) => void; stop: () => void | Promise<void>; getAvailableVoicesAsync?: () => Promise<VoiceInfo[]> };
let mod: SpeechMod | null | undefined;
function speech(): SpeechMod | null {
  if (mod !== undefined) return mod;
  try { mod = require('expo-speech') as SpeechMod; } catch { mod = null; }
  return mod;
}

// ── voice choice and measured speed ───────────────────────────────────────────────────────────────────────────────

let allVoices: Promise<VoiceInfo[]> | null = null;
let prefs: VoicePrefs = { ...DEFAULT_VOICE_PREFS, voice: {} };
/** Applies the person's voice settings (speed, style, breaths, chosen voice) to everything spoken from now on. */
export function applyVoicePrefs(p: VoicePrefs): void { prefs = p; }
export const currentVoicePrefs = (): VoicePrefs => prefs;
setTuning(lang => ({ cps: speedFor(lang), speed: prefs.speed, style: prefs.style, pauseScale: PAUSE_SCALE[prefs.pauses] }));
const prefsReady: Promise<void> = (async () => { try { applyVoicePrefs(await loadVoicePrefs()); } catch { /* the defaults are fine */ } })();

async function installed(): Promise<VoiceInfo[]> {
  const s = speech();
  allVoices ??= s?.getAvailableVoicesAsync ? s.getAvailableVoicesAsync().catch(() => []) : Promise.resolve([]);
  return allVoices;
}
/** The installed voices for a language, best first, for the voice picker. */
export async function listVoices(lang: Lang): Promise<(VoiceInfo & { score: number; enhanced: boolean; recommended: boolean })[]> {
  const ranked = rankVoices(await installed(), lang);
  return ranked.map((v, i) => ({ ...v, recommended: i === 0 }));
}
async function voiceFor(lang: Lang): Promise<VoiceInfo | null> {
  await prefsReady;
  try {
    const all = await installed(), wanted = prefs.voice[lang];
    return (wanted && all.find(v => v.identifier === wanted)) || pickVoice(all, lang);
  } catch { return null; }
}

const measuredCps: Partial<Record<Lang, number>> = {};
/** Folds one measurement (characters spoken over the time it took, at the rate used) into a running average of this phone's voice. */
export function learnSpeed(lang: Lang, chars: number, ms: number, rate: number): void {
  if (!(chars > 12) || !(ms > 600) || !(rate > 0)) return;
  const cps = (chars / (ms / 1000)) / rate;
  if (cps < 5 || cps > 40) return;                                                   // a bad reading (a stalled voice, a cancelled one)
  const prev = measuredCps[lang] ?? DEFAULT_CPS[lang];
  measuredCps[lang] = prev * 0.6 + cps * 0.4;
}
export const speedFor = (lang: Lang): number => measuredCps[lang] ?? DEFAULT_CPS[lang];

// ── speaking a scene ──────────────────────────────────────────────────────────────────────────────────────────────

export interface SceneSpeech {
  text: string; big?: string; mood: Mood; lang: Lang;
  /** How long the scene lasts, so the pace can be fitted to it. */
  budgetMs: number;
  onStart?: () => void;
  /** 0 to 1 through the spoken text. */
  onProgress?: (frac: number) => void;
  onDone?: () => void;
}
export interface Spoken { cancel: () => void; /** how long the scene must be held for the voice to finish, from the plan */ overrunMs: number }

let current = 0;                                                                     // a newer call cancels an older one, whichever callbacks arrive late

export function speakScene(o: SceneSpeech): Spoken {
  const s = speech(), id = ++current;
  try { void s?.stop(); } catch { /* nothing was speaking */ }                           // whatever was still being said stops before this scene begins
  const p = plan({ text: o.text, big: o.big, mood: o.mood, lang: o.lang, budgetMs: o.budgetMs, cps: speedFor(o.lang) });
  if (!s) { return { cancel: () => {}, overrunMs: 0 }; }
  const timers: ReturnType<typeof setTimeout>[] = [];
  const alive = () => id === current;
  let spokenChars = 0, startedAt = 0, sawBoundary = false, finished = false, ticker: ReturnType<typeof setInterval> | null = null;
  let lastFrac = 0;
  const report = (frac: number) => { if (!alive()) return; const f = Math.min(1, Math.max(0, frac)); if (f < lastFrac) return; lastFrac = f; o.onProgress?.(f); };   // the lit word only ever moves forward
  const finish = () => { if (finished) return; finished = true; if (ticker) clearInterval(ticker); if (alive()) { report(1); o.onDone?.(); } };

  const runChunk = async (i: number): Promise<void> => {
    if (!alive()) return;
    if (i >= p.chunks.length) { learnSpeed(o.lang, p.totalChars, Date.now() - startedAt - p.chunks.reduce((n, c) => n + c.pauseAfterMs, 0), p.chunks.reduce((n, c) => n + c.rate, 0) / p.chunks.length); finish(); return; }
    const c = p.chunks[i], v = await voiceFor(o.lang);
    if (!alive()) return;
    const base = spokenChars;
    try {
      s.speak(c.text, {
        language: o.lang === 'hi' ? 'hi-IN' : 'en-IN', ...(v ? { voice: v.identifier } : {}), rate: c.rate, pitch: c.pitch,
        onStart: () => { if (i === 0 && alive()) { startedAt = Date.now(); o.onStart?.(); } },
        onBoundary: (e: { charIndex?: number }) => { if (alive() && typeof e?.charIndex === 'number') { sawBoundary = true; report((base + e.charIndex) / p.totalChars); } },
        onDone: () => { spokenChars += c.text.length; report(spokenChars / p.totalChars); timers.push(setTimeout(() => { void runChunk(i + 1); }, c.pauseAfterMs)); },
        onStopped: () => {}, onError: () => { spokenChars += c.text.length; timers.push(setTimeout(() => { void runChunk(i + 1); }, 60)); },
      });
    } catch { finish(); }
  };

  // A short lead so the caption is on screen before the voice speaks; a clock keeps the progress moving on phones that give no word boundaries.
  timers.push(setTimeout(() => {
    if (!alive()) return;
    startedAt = Date.now();
    void runChunk(0);
    ticker = setInterval(() => { if (alive() && !finished && !sawBoundary && startedAt && Date.now() - startedAt > 700) report(Math.min(0.97, (Date.now() - startedAt) / Math.max(1, p.estMs))); }, 90);
  }, p.leadMs));

  return { overrunMs: p.overrunMs, cancel: () => { if (current === id) current++; timers.forEach(clearTimeout); if (ticker) clearInterval(ticker); finished = true; try { void s.stop(); } catch { /* nothing to stop */ } } };
}

// ── the simple calls the rest of the app still uses ──────────────────────────────────────────────────────────────

/** Speaks one piece of text with the same voice and care (quiz questions, beats). */
export function speak(text: string, lang: Lang, mood: Mood = 'happy'): void {
  speakScene({ text, mood, lang, budgetMs: Math.max(3000, text.length * 75) });
}
export function stopSpeaking(): void { current++; try { void speech()?.stop(); } catch { /* nothing to stop */ } }
