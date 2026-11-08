// Recorded voice for a scene: when a clip exists, the clip is the clock. Its length is known exactly (the generator measured it), so the scene is
// built around it (lead, clip, breath) and the lit word follows the recording itself, not an estimate. A scene with no clip keeps the phone's voice
// (speech.ts). Pure functions, tested; the manifest is plain data written by `npm run reels:voiceover`.
import type { Lang } from '@/lib/i18nCore';
import { VOICE_MANIFEST } from '@/lib/reels/voiceManifest';

/** One spoken phrase of the clip: where it ends in the spoken text (cumulative characters) and the milliseconds it occupies in the recording. */
export type Cue = [chars: number, t0: number, t1: number];
export interface ClipInfo { ms: number; cues: Cue[] }

export const clipKey = (reelId: string, lang: Lang, scene: number): string => `${reelId}.${lang}.${scene}`;
export const clipInfo = (reelId: string, lang: Lang, scene: number): ClipInfo | null => (VOICE_MANIFEST as Record<string, ClipInfo | undefined>)[clipKey(reelId, lang, scene)] ?? null;

/** The recorded length of each scene's clip in a reel (null where a scene has none), for building the timeline. */
export const clipDurations = (reelId: string, lang: Lang, scenes: number): (number | null)[] => Array.from({ length: scenes }, (_, i) => clipInfo(reelId, lang, i)?.ms ?? null);

/** How far through the spoken text the recording is at `tMs`: exact at each phrase boundary, linear by characters inside a phrase. 0 to 1. */
export function clipProgress(clip: ClipInfo, tMs: number): number {
  const total = clip.cues.length ? clip.cues[clip.cues.length - 1][0] : 0;
  if (!(total > 0) || !(tMs > 0)) return 0;
  let before = 0;
  for (const [chars, t0, t1] of clip.cues) {
    if (tMs < t0) return Math.min(1, before / total);                          // in the breath between phrases: the lit word waits
    if (tMs <= t1) { const f = t1 > t0 ? (tMs - t0) / (t1 - t0) : 1; return Math.min(1, (before + f * (chars - before)) / total); }
    before = chars;
  }
  return 1;
}

/** The scene's length around its recording: a lead so the caption is up first, the recording, then a breath; never shorter than the scene was written. */
export const LEAD_CLIP_MS = 180;
export const TAIL_CLIP_MS = 320;
export const sceneMsForClip = (clipMs: number, writtenMs: number): number => Math.max(writtenMs, Math.ceil((LEAD_CLIP_MS + clipMs + TAIL_CLIP_MS) / 100) * 100);
