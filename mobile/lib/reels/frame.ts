// How often the reel picture is redrawn, and which redraws can be skipped. Pure, so it is tested without a screen.
//
// A reel's picture is a function of the clock `t` (Mitra's bob and blink, the bars growing, the counter counting). The clock itself still runs on real
// time (see holdAtSceneEnd in voice.ts, which this file does not touch); what is capped here is only how many times a second the picture is drawn.
import { wrap } from '@/lib/reels/engine';
import type { Prop } from '@/lib/reels/types';
import type { Lang } from '@/lib/i18nCore';

/** The picture is drawn at most this many times a second. */
export const FPS = 30;
export const FRAME_MS = 1000 / FPS;

/** The frame a moment on the clock falls in (frame 0 is 0 to 33.3 ms). Negative or non-finite times are frame 0. */
export const frameIndex = (t: number, frameMs: number = FRAME_MS): number => (Number.isFinite(t) && t > 0 ? Math.floor(t / frameMs + 1e-9) : 0);
/** The clock snapped down to its frame. */
export const quantiseT = (t: number, frameMs: number = FRAME_MS): number => frameIndex(t, frameMs) * frameMs;

export interface FrameBudget { frameMs: number; /** a frame is run once this long has passed since the last one; a little under frameMs so vsync jitter does not skip a frame */ minGapMs: number }
/** The time one frame may take at `fps`, and the gap that lets the next one run. */
export function frameBudget(fps: number = FPS): FrameBudget {
  const f = Number.isFinite(fps) && fps > 0 ? Math.min(fps, 120) : FPS;
  const frameMs = 1000 / f;
  return { frameMs, minGapMs: frameMs * 0.85 };
}
/** Whether the frame loop should run a frame now (a screen refresh at 60 or 90 Hz comes more often than the picture needs). */
export const shouldRunFrame = (lastRun: number, now: number, minGapMs: number): boolean => !(now - lastRun < minGapMs);

type Raf = (cb: () => void) => unknown;
type Caf = (id: unknown) => void;
/** Calls `onFrame` at most `fps` times a second, aligned to the screen's refresh (requestAnimationFrame) instead of a timer that can queue calls up
 *  behind a slow render. A slow frame is simply late: the next one waits its gap from when that one ran, so frames never pile up. Where the screen does
 *  not refresh (a web page in a background tab), `timer` takes over at the frame rate, as the old setInterval did. Returns the stop function. */
export function startFrameLoop(onFrame: (now: number) => void, o: { fps?: number; raf: Raf; caf: Caf; now: () => number; timer?: { set: (cb: () => void, ms: number) => unknown; clear: (id: unknown) => void } }): () => void {
  const { frameMs, minGapMs } = frameBudget(o.fps);
  let last = o.now(), rafId: unknown = null, timerId: unknown = null, live = true;
  const disarm = () => { if (rafId !== null) o.caf(rafId); if (timerId !== null && o.timer) o.timer.clear(timerId); rafId = timerId = null; };
  const arm = () => { rafId = o.raf(tick); if (o.timer) timerId = o.timer.set(tick, frameMs); };
  function tick() {
    if (!live) return;
    disarm();
    arm();
    const now = o.now();
    if (!shouldRunFrame(last, now, minGapMs)) return;
    last = now;
    onFrame(now);
  }
  arm();
  return () => { live = false; disarm(); };
}

/** The reel's clock outside React. Components subscribe to `stamp`, which changes when the picture should be redrawn: when the clock moves into a new
 *  frame, or when it is set on purpose (a jump, a restart, the end of a beat), never more than once per frame while it only ticks. */
export interface Clock { get(): number; set(t: number, discrete?: boolean): void; stamp(): number; subscribe(fn: () => void): () => void }
export function createClock(frameMs: number = FRAME_MS, start = 0): Clock {
  let t = start, frame = frameIndex(start, frameMs), stamp = 0;
  const subs = new Set<() => void>();
  return {
    get: () => t,
    stamp: () => stamp,
    set(next, discrete = false) {
      const f = frameIndex(next, frameMs);
      const moved = next !== t;
      t = next;
      if (!discrete && f === frame) return;
      if (!discrete && !moved) return;
      frame = f; stamp++;
      subs.forEach(fn => fn());
    },
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
  };
}

/** What the player must know about the clock without watching every tick: which scene, whether the reel is over, and where the clock stands against the
 *  beat's stopping point. It changes a few times a reel, so the player re-renders then and not on every frame. */
export interface Phase { idx: number; done: boolean; atPoke: boolean; pastPoke: boolean }
export function phaseOf(starts: number[], ms: number[], total: number, t: number, pokeAt: number | null): Phase {
  const c = Math.min(Math.max(Number.isFinite(t) ? t : 0, 0), total);
  let idx = ms.length - 1;
  for (let i = 0; i < ms.length; i++) { if (c < starts[i] + ms[i]) { idx = i; break; } }
  return { idx, done: c >= total, atPoke: pokeAt !== null && t >= pokeAt, pastPoke: pokeAt !== null && t > pokeAt };
}
/** A phase as one number, so a store can compare it with Object.is. */
export const phaseCode = (p: Phase): number => p.idx * 8 + (p.done ? 4 : 0) + (p.atPoke ? 2 : 0) + (p.pastPoke ? 1 : 0);
export const phaseFromCode = (c: number): Phase => ({ idx: Math.floor(c / 8), done: (c & 4) !== 0, atPoke: (c & 2) !== 0, pastPoke: (c & 1) !== 0 });

/** How far through its scene a picture's drawing stops changing. From here on the shapes are the same for any p, so they need not be redrawn.
 *  (A shield also breathes with the clock, so it is never still: see `isStill`.) Each value is where the drawing code in Scenery.tsx finishes: the
 *  counter, bars, line, donut and shield settle at their `settle(p, at)`; the coins and steps when their last item has appeared. */
export function settleAt(prop: Prop): number {
  switch (prop.kind) {
    case 'counter': return 0.75;
    case 'bars': return 0.65;
    case 'line': return 0.8;
    case 'donut': return 0.7;
    case 'shield': return 0.5;
    case 'coins': { const n = Math.min(prop.count, 8); return (n + 0.2) / (n + 2); }
    case 'steps': { const n = prop.items.length; return (n - 0.1) / (n + 0.6); }
  }
}
const EPS = 1e-9;
/** `p` with everything after the settle point folded into it: the same picture, so a memoised picture is not redrawn once it has finished moving. */
export const pictureP = (prop: Prop, p: number): number => Math.min(p, settleAt(prop) + EPS);
/** True when the picture for this scene is the same at every moment from `p` on. */
export const isStill = (prop: Prop | undefined, p: number): boolean => !prop || (prop.kind !== 'shield' && p >= settleAt(prop) + EPS);

/** Whether the centre piece (Mitra or a cast member) changes with the clock: always, as it bobs and glances. Listed so the cost script says so. */
export const FIGURE_ALWAYS_MOVES = true;

// ── What a picture is made of, counted from the data (used by scripts/reels-perf.mts and its tests) ───────────────────────────────────────────────
// These mirror the drawing code in Scenery.tsx and Mitra.tsx element for element. When the drawing changes, change the counts: the known-answer
// tests in __tests__/reels-perf.test.mts name the figures they expect.
const lines = (text: string | undefined, max: number): number => (text ? Math.min(4, wrap(text, max).length) : 0);

/** SVG elements one scene's picture draws once it has finished moving (a G is counted, as it is a node the renderer keeps). */
export function sceneryNodes(prop: Prop | undefined, lang: Lang): number {
  if (!prop) return 0;
  switch (prop.kind) {
    case 'counter': return 2 + (prop.format === 'plain' && prop.unit ? 1 : 0) + lines(prop.label?.[lang], 22);
    case 'bars': return 2 + prop.items.reduce((n, it) => n + 3 + lines(it.label[lang], 11), 0);
    case 'line': return 5 + lines(prop.label?.[lang], 26);
    case 'donut': return 2 + prop.parts.length * 3 + lines(prop.centre?.[lang], 9) + prop.parts.length;     // G, ring, one arc and one legend G (dot, text) per part
    case 'coins': return 1 + Math.min(prop.count, 8) * 3 + lines(prop.label?.[lang], 24);
    case 'shield': return 2 + lines(prop.text[lang], 11) + lines(prop.sub?.[lang], 14);
    case 'steps': return 1 + prop.items.reduce((n, it) => n + 4 + lines(it[lang], 19), 0);
  }
}

// ── What the player needs from a frame ──────────────────────────────────────────────────────────────────────────────────────────────────────────
/** The clock a picture is drawn with. Only a shield breathes with it once its scene is under way; every other picture is a function of `p` alone, so it
 *  is given 0 and a finished one compares equal from frame to frame. */
export const pictureT = (prop: Prop, t: number): number => (prop.kind === 'shield' ? t : 0);

/** The caption slides in over its first 340 ms and out over its last 220 ms (captionMotion in voice.ts); in between it is still. For that stretch the
 *  elapsed time is reported as 340, which draws the same caption, so a still caption is not drawn again every frame. */
export function captionElapsed(elapsedMs: number, sceneMs: number): number {
  return sceneMs >= 560 && elapsedMs >= 340 && elapsedMs <= sceneMs - 220 ? 340 : elapsedMs;
}
