// The reel clock: which scene is on screen at a given moment and how far through it we are. Pure, so it is tested without a screen.
import type { Reel, Scene } from '@/lib/reels/types';

export const totalMs = (r: Reel): number => r.scenes.reduce((s, x) => s + x.ms, 0);

export interface Moment { index: number; scene: Scene; /** 0..1 through this scene */ p: number; /** 0..1 through the whole reel */ overall: number; done: boolean }

/** The scene at `t` ms from the start. Before 0 it is the first scene at p = 0; after the end it is the last scene at p = 1 and `done` is true. */
export function momentAt(r: Reel, t: number): Moment {
  const total = totalMs(r);
  if (!r.scenes.length || total <= 0) throw new Error(`reel ${r.id} has no scenes`);
  const clamped = Math.min(Math.max(Number.isFinite(t) ? t : 0, 0), total);
  let start = 0;
  for (let i = 0; i < r.scenes.length; i++) {
    const end = start + r.scenes[i].ms;
    if (clamped < end || i === r.scenes.length - 1) {
      const p = Math.min(1, Math.max(0, (clamped - start) / r.scenes[i].ms));
      return { index: i, scene: r.scenes[i], p, overall: clamped / total, done: clamped >= total };
    }
    start = end;
  }
  throw new Error('unreachable');
}

/** Start time of each scene, for jumping to a scene when a progress segment is tapped. */
export function sceneStarts(r: Reel): number[] {
  const out: number[] = []; let t = 0;
  for (const s of r.scenes) { out.push(t); t += s.ms; }
  return out;
}

/** Breaks text into lines of at most `max` characters at spaces. The pictures use it, and the script checker uses it to be sure every label fits. */
export function wrap(text: string, max: number): string[] {
  const out: string[] = []; let cur = '';
  for (const w of text.split(/\s+/)) {
    if (cur && (cur + ' ' + w).length > max) { out.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) out.push(cur);
  return out;
}

/** Ease-out, so things settle instead of stopping dead. */
export const ease = (p: number): number => 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 3);

/** The animation inside a scene finishes a little before the scene does, so the picture is still for the last moment of reading. */
export const settle = (p: number, at = 0.7): number => ease(Math.min(1, p / at));
