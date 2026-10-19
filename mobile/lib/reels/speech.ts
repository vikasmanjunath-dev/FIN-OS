// Optional read-aloud for reels, using the phone's own text-to-speech (works offline; sounds like a phone's voice, not an actor).
// Loaded on demand so the web preview and the node tests never need the native module, and every call is safe if it is missing.
import type { Lang } from '@/lib/i18nCore';

type SpeechMod = { speak: (t: string, o: Record<string, unknown>) => void; stop: () => void };
let mod: SpeechMod | null | undefined;
function speech(): SpeechMod | null {
  if (mod !== undefined) return mod;
  try { mod = require('expo-speech') as SpeechMod; } catch { mod = null; }
  return mod;
}

export function speak(text: string, lang: Lang): void {
  const s = speech(); if (!s) return;
  try { s.stop(); s.speak(text, { language: lang === 'hi' ? 'hi-IN' : 'en-IN', rate: 0.98, pitch: 1.05 }); } catch { /* no voice on this phone */ }
}
export function stopSpeaking(): void { try { speech()?.stop(); } catch { /* nothing to stop */ } }
