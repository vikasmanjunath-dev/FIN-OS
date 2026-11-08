// Plays a scene's recorded clip and reports the lit-word progress from the recording's own position. Loaded on demand so the node tests and a build with no
// audio module are safe; every call returns null when there is nothing to play, and the caller then uses the phone's voice (speech.ts).
import type { Lang } from '@/lib/i18nCore';
import { LEAD_CLIP_MS, clipInfo, clipKey, clipProgress } from '@/lib/reels/clips';
import { VOICE_ASSETS } from '@/lib/reels/voiceAssets';

interface PlayerLike { play: () => void; pause: () => void; remove: () => void; currentTime: number; addListener: (ev: string, cb: (s: { didJustFinish?: boolean }) => void) => { remove: () => void } }
type AudioMod = { createAudioPlayer: (src: number) => PlayerLike };
let mod: AudioMod | null | undefined;
function audio(): AudioMod | null {
  if (mod !== undefined) return mod;
  try { mod = require('expo-audio') as AudioMod; } catch { mod = null; }
  return mod;
}

export const hasClip = (reelId: string, lang: Lang, scene: number): boolean => !!clipInfo(reelId, lang, scene) && VOICE_ASSETS[clipKey(reelId, lang, scene)] !== undefined && !!audio();

export interface ClipRun { reelId: string; lang: Lang; scene: number; onProgress?: (frac: number) => void; onDone?: () => void }

/** Starts the clip after the lead (the caption is on screen first). Returns a handle to stop it, or null when the scene has no playable clip. */
export function playClip(o: ClipRun): { cancel: () => void } | null {
  const info = clipInfo(o.reelId, o.lang, o.scene), src = VOICE_ASSETS[clipKey(o.reelId, o.lang, o.scene)], a = audio();
  if (!info || src === undefined || !a) return null;
  let player: PlayerLike | null = null, sub: { remove: () => void } | null = null, ticker: ReturnType<typeof setInterval> | null = null, finished = false, cancelled = false;
  const cleanup = () => { if (ticker) clearInterval(ticker); ticker = null; try { sub?.remove(); } catch { /* already gone */ } try { player?.pause(); player?.remove(); } catch { /* already gone */ } player = null; };
  const finish = () => { if (finished || cancelled) return; finished = true; cleanup(); o.onProgress?.(1); o.onDone?.(); };
  const lead = setTimeout(() => {
    if (cancelled) return;
    try {
      const p = a.createAudioPlayer(src); player = p;
      sub = p.addListener('playbackStatusUpdate', s => { if (s.didJustFinish) finish(); });
      const began = Date.now();
      ticker = setInterval(() => {
        if (cancelled || finished || !player) return;
        const t = Math.max(player.currentTime * 1000 || 0, 0);
        o.onProgress?.(clipProgress(info, t));
        if (Date.now() - began > info.ms + 1500) finish();                       // the recording never said it was done: stop waiting
      }, 50);
      p.play();
    } catch { finish(); }
  }, LEAD_CLIP_MS);
  return { cancel: () => { cancelled = true; clearTimeout(lead); cleanup(); } };
}
