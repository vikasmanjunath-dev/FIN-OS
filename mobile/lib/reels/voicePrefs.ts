// What the person chooses about the reel voice: how fast, how expressive, how long the breaths are, and which installed voice to use for each
// language. Kept on the phone only (the key starts with `finos_session_`, so sync never uploads it).
import { isPlainObject, parseJSON } from '@/lib/safeStore';

export const VOICE_PREFS_KEY = 'finos_session_reels_voice';
export interface VoicePrefs { speed: number; style: 'expressive' | 'steady'; pauses: 'short' | 'normal' | 'long'; voice: { en?: string; hi?: string } }
export const DEFAULT_VOICE_PREFS: VoicePrefs = { speed: 1, style: 'expressive', pauses: 'normal', voice: {} };
export const SPEEDS: { label: string; hi: string; value: number }[] = [{ label: 'Slower', hi: 'धीमी', value: 0.85 }, { label: 'Normal', hi: 'सामान्य', value: 1 }, { label: 'Faster', hi: 'तेज़', value: 1.15 }];
export const PAUSE_SCALE: Record<VoicePrefs['pauses'], number> = { short: 0.7, normal: 1, long: 1.4 };

/** A saved value made safe: only known fields, in range, a voice id only if it is a short plain identifier. */
export function parseVoicePrefs(raw: string | null | undefined): VoicePrefs {
  const p = parseJSON(raw ?? null);
  if (!p.ok || !isPlainObject(p.value)) return { ...DEFAULT_VOICE_PREFS, voice: {} };
  const v = p.value as Record<string, unknown>;
  const speed = typeof v.speed === 'number' && Number.isFinite(v.speed) ? Math.min(1.3, Math.max(0.7, Math.round(v.speed * 100) / 100)) : 1;
  const id = (x: unknown) => (typeof x === 'string' && /^[\w.\-:@ ()]{1,120}$/.test(x) ? x : undefined);
  const voice = isPlainObject(v.voice) ? { ...(id((v.voice as Record<string, unknown>).en) ? { en: id((v.voice as Record<string, unknown>).en) } : {}), ...(id((v.voice as Record<string, unknown>).hi) ? { hi: id((v.voice as Record<string, unknown>).hi) } : {}) } : {};
  return { speed, style: v.style === 'steady' ? 'steady' : 'expressive', pauses: v.pauses === 'short' || v.pauses === 'long' ? v.pauses : 'normal', voice };
}
