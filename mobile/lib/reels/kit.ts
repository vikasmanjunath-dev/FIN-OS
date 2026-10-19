// Small helpers for writing reels, shared by the content files.
import type { L, Mood, Prop, Scene } from '@/lib/reels/types';

export const t = (en: string, hi: string): L => ({ en, hi });

/** How long a caption stays on screen: about 40 ms a character plus a beat, within the 3-6.4 s a scene may last. */
export function readMs(say: L): number {
  const len = Math.max(say.en.length, say.hi.length * 0.85);
  return Math.min(6400, Math.max(3000, Math.round((len * 40 + 1200) / 100) * 100));
}

/** A scene whose length follows its caption. */
export function sc(mood: Mood, say: L, more: { big?: L; prop?: Prop; ms?: number; who?: Scene['who'] } = {}): Scene {
  const { ms, ...rest } = more;
  return { ms: ms ?? readMs(say), mood, say, ...rest };
}
