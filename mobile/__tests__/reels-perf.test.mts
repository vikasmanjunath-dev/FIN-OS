// Money Reels on a mid-range Android: the picture is drawn at most 30 times a second, the player itself does not re-render on a tick, a finished picture
// is not drawn again, and a reel that is not on screen runs nothing. Known-answer tests for lib/reels/frame.ts, and source checks on the components
// (the way a11y.test.mts holds rules that need a screen). The "why" and the measurements are in docs/REELS.md ("Performance").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { LIBRARY } from '../lib/reels/library.ts';
import { DRAFT_REELS } from '../lib/reels/drafts.ts';
import { ease, momentAt, sceneStarts, settle, totalMs } from '../lib/reels/engine.ts';
import { captionMotion, holdAtSceneEnd } from '../lib/reels/voice.ts';
import { FPS, FRAME_MS, captionElapsed, createClock, frameBudget, frameIndex, isStill, phaseCode, phaseFromCode, phaseOf, pictureP, pictureT, quantiseT, sceneryNodes, settleAt, shouldRunFrame, startFrameLoop } from '../lib/reels/frame.ts';
import type { Prop, Reel } from '../lib/reels/types.ts';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} is not ${b}`);
const L = (s: string) => ({ en: s, hi: s });

// ── the frame grid ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

test('frameIndex and quantiseT: 30 frames a second, floor, and anything that is not a time is frame 0', () => {
  assert.equal(FPS, 30);
  near(FRAME_MS, 33.3333333);
  for (const [t, f] of [[0, 0], [1, 0], [33, 0], [33.34, 1], [66.6, 1], [66.67, 2], [100, 3], [1000, 30], [28000, 840]] as const) assert.equal(frameIndex(t), f, `t=${t}`);
  for (const bad of [-5, NaN, Infinity * 0, -Infinity]) assert.equal(frameIndex(bad), 0);
  near(quantiseT(100), 100); near(quantiseT(50), 33.3333333); assert.equal(quantiseT(10), 0); near(quantiseT(1010), 1000);
  assert.equal(frameIndex(100, 40), 2);                                          // another grid: the old 40 ms tick
});

test('frameBudget: the time a frame may take, and the gap that lets the next one run', () => {
  const b = frameBudget(30); near(b.frameMs, 33.3333333); near(b.minGapMs, 28.3333333);
  const c = frameBudget(60); near(c.frameMs, 16.6666667);
  assert.equal(frameBudget(0).frameMs, frameBudget(30).frameMs); assert.equal(frameBudget(NaN).frameMs, frameBudget(30).frameMs);
  near(frameBudget(1000).frameMs, 1000 / 120);                                   // never faster than 120 a second
});

test('shouldRunFrame: runs once the gap has passed, not before', () => {
  assert.equal(shouldRunFrame(0, 16, 28), false); assert.equal(shouldRunFrame(0, 28, 28), true); assert.equal(shouldRunFrame(0, 33, 28), true); assert.equal(shouldRunFrame(100, 100, 28), false);
});

// ── the frame loop (a fake screen, so the test is exact) ────────────────────────────────────────────────────────────────────────────────────────

/** A pretend screen and timer: `refresh` is how often the screen refreshes (ms), 0 for a screen that never does (a background tab). */
function fakeWorld(refresh: number) {
  let now = 0, id = 0;
  const q = new Map<number, { at: number; cb: () => void }>();
  const add = (at: number, cb: () => void) => { q.set(++id, { at, cb }); return id; };
  const world = {
    now: () => now,
    raf: (cb: () => void) => (refresh > 0 ? add(Math.ceil((now + 0.001) / refresh) * refresh, cb) : null),
    caf: (i: unknown) => { if (i !== null) q.delete(i as number); },
    timer: { set: (cb: () => void, ms: number) => add(now + ms, cb), clear: (i: unknown) => { q.delete(i as number); } },
    run(ms: number) {
      const end = now + ms;
      for (;;) {
        let best: [number, { at: number; cb: () => void }] | null = null;
        for (const e of q) if (e[1].at <= end && (!best || e[1].at < best[1].at)) best = e;
        if (!best) break;
        q.delete(best[0]); now = best[1].at; best[1].cb();
      }
      now = end;
    },
    pending: () => q.size,
  };
  return world;
}
const framesIn = (refresh: number, ms: number, withTimer = true) => {
  const w = fakeWorld(refresh); const at: number[] = [];
  const stop = startFrameLoop(n => at.push(n), { raf: w.raf, caf: w.caf, now: w.now, timer: withTimer ? w.timer : undefined });
  w.run(ms); stop();
  return { at, left: w.pending() };
};

test('startFrameLoop: 30 frames a second whatever the screen refreshes at, never two inside a frame', () => {
  for (const hz of [60, 90, 120, 144]) {
    const { at } = framesIn(1000 / hz, 2000);
    assert.ok(at.length >= 55 && at.length <= 62, `${hz} Hz gave ${at.length} frames in 2 s`);   // 144 Hz lands on every fifth refresh: 28.8 a second
    for (let i = 1; i < at.length; i++) assert.ok(at[i] - at[i - 1] >= frameBudget().minGapMs - 1e-9, `${hz} Hz: frames ${at[i] - at[i - 1]} ms apart`);
  }
});

test('startFrameLoop: a slow screen is just slow, one frame per refresh, never a burst to catch up', () => {
  const { at } = framesIn(100, 2000, false);
  assert.equal(at.length, 20);
  for (let i = 1; i < at.length; i++) assert.equal(at[i] - at[i - 1], 100);
  const withTimer = framesIn(100, 2000).at;                                       // with the timer behind it the reel still runs at the frame rate, never faster
  assert.ok(withTimer.length >= 58 && withTimer.length <= 61, `${withTimer.length}`);
});

test('startFrameLoop: where the screen does not refresh (a background tab) the timer keeps the reel going at the frame rate', () => {
  const { at } = framesIn(0, 2000);
  assert.ok(at.length >= 58 && at.length <= 61, `${at.length} frames`);
  assert.equal(framesIn(0, 2000, false).at.length, 0);                          // without the fallback there is nothing to drive it
});

test('startFrameLoop: stopping leaves no screen callback and no timer behind', () => {
  const w = fakeWorld(16.667); let n = 0;
  const stop = startFrameLoop(() => { n++; }, { raf: w.raf, caf: w.caf, now: w.now, timer: w.timer });
  w.run(500); const before = n; stop();
  assert.equal(w.pending(), 0); w.run(500); assert.equal(n, before);
  stop();                                                                      // stopping twice is harmless
  const w2 = fakeWorld(16.667); let m = 0;
  const stop2 = startFrameLoop(() => { m++; stop2(); }, { raf: w2.raf, caf: w2.caf, now: w2.now, timer: w2.timer });   // a frame that stops its own loop
  w2.run(500); assert.equal(m, 1); assert.equal(w2.pending(), 0);
});

// ── the clock ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

test('createClock: ticks inside one frame do not notify; a new frame does; setting on purpose always does', () => {
  const c = createClock(); let n = 0; const off = c.subscribe(() => { n++; });
  const s0 = c.stamp();
  c.set(10); c.set(20); c.set(33);                                              // all still frame 0
  assert.equal(n, 0); assert.equal(c.get(), 33); assert.equal(c.stamp(), s0);
  c.set(34); assert.equal(n, 1); assert.equal(c.stamp(), s0 + 1);
  c.set(34); assert.equal(n, 1);                                                // held at the end of a scene for the voice: the same value is not a change
  c.set(34, true); assert.equal(n, 2);                                          // a jump to the same place still redraws
  c.set(0, true); assert.equal(n, 3); assert.equal(c.get(), 0);
  off(); c.set(500); assert.equal(n, 3);
});

test('createClock: a second of 16 ms ticks makes 30 notifications, and 40 ms ticks make one each', () => {
  const a = createClock(); let na = 0; a.subscribe(() => { na++; });
  for (let t = 0; t <= 1000; t += 16) a.set(t);
  assert.ok(na >= 29 && na <= 31, `${na}`);
  const b = createClock(); let nb = 0; b.subscribe(() => { nb++; });
  for (let t = 40; t <= 1000; t += 40) b.set(t);
  assert.equal(nb, 25);
});

// ── the player's view of the clock ─────────────────────────────────────────────────────────────────────────────────────────────────────────

test('phaseOf: scene, done, and the beat stop, with the same edges as momentAt', () => {
  const reel = { id: 'x', scenes: [{ ms: 1000 }, { ms: 2000 }, { ms: 1500 }] } as unknown as Reel;
  const starts = sceneStarts(reel), ms = reel.scenes.map(x => x.ms), total = totalMs(reel);
  assert.deepEqual(starts, [0, 1000, 3000]);
  const at = (t: number, poke: number | null = null) => phaseOf(starts, ms, total, t, poke);
  assert.deepEqual(at(0), { idx: 0, done: false, atPoke: false, pastPoke: false });
  assert.equal(at(999).idx, 0); assert.equal(at(1000).idx, 1); assert.equal(at(2999).idx, 1); assert.equal(at(3000).idx, 2);
  assert.deepEqual(at(4499), { idx: 2, done: false, atPoke: false, pastPoke: false }); assert.deepEqual(at(4500), { idx: 2, done: true, atPoke: false, pastPoke: false });
  assert.deepEqual(at(99999), { idx: 2, done: true, atPoke: false, pastPoke: false }); assert.equal(at(-5).idx, 0); assert.equal(at(NaN).idx, 0);
  // the beat stops at the end of scene 2 (3000 - 1): reaching it is "at", going past it is "past"
  assert.deepEqual(at(2998, 2999), { idx: 1, done: false, atPoke: false, pastPoke: false });
  assert.deepEqual(at(2999, 2999), { idx: 1, done: false, atPoke: true, pastPoke: false });
  assert.deepEqual(at(3000, 2999), { idx: 2, done: false, atPoke: true, pastPoke: true });
  for (const t of [0, 1, 999, 1000, 2999, 3000, 4499, 4500, 6000]) { const m = momentAt(reel, t); assert.equal(at(t).idx, m.index); assert.equal(at(t).done, m.done); }
});

test('phaseCode: one number per phase, and back', () => {
  const seen = new Set<number>();
  for (let idx = 0; idx < 12; idx++) for (const done of [false, true]) for (const atPoke of [false, true]) for (const pastPoke of [false, true]) {
    const p = { idx, done, atPoke, pastPoke }; const c = phaseCode(p); assert.deepEqual(phaseFromCode(c), p); seen.add(c);
  }
  assert.equal(seen.size, 12 * 8);
});

// ── a picture that has stopped moving is not drawn again ───────────────────────────────────────────────────────────────────────────────────────

/** The numbers Scenery.tsx draws from, for each kind, written out the same way as the drawing code (settle and ease from the engine). */
function drawing(prop: Prop, p: number): number[] {
  switch (prop.kind) {
    case 'counter': return [settle(p, 0.75)];
    case 'bars': return [settle(p, 0.65), p > 0.45 ? 1 : 0];
    case 'line': return [settle(p, 0.8)];
    case 'donut': return [settle(p, 0.7)];
    case 'shield': return [settle(p, 0.5)];
    case 'coins': { const shown = Math.min(prop.count, 8); return Array.from({ length: shown }, (_, i) => ease((p * (shown + 2) - i) / 1.2)); }
    case 'steps': { const n = prop.items.length; return prop.items.map((_, i) => ease((p * (n + 0.6) - i) / 0.9)); }
  }
}
const PROPS: Prop[] = [
  { kind: 'counter', from: 0, to: 5000, format: 'inr' }, { kind: 'bars', items: [{ label: L('a'), value: 3, text: L('3'), tone: 'cyan' }, { label: L('b'), value: 9, text: L('9'), tone: 'red' }] },
  { kind: 'line', points: [1, 3, 2, 8] }, { kind: 'donut', parts: [{ value: 1, label: L('a'), tone: 'cyan' }, { value: 2, label: L('b'), tone: 'gold' }] },
  { kind: 'shield', text: L('Safe') }, { kind: 'coins', count: 3 }, { kind: 'coins', count: 20 }, { kind: 'steps', items: [L('a'), L('b'), L('c')] }, { kind: 'steps', items: [L('a')] },
];

test('settleAt and pictureP: from the settle point on the drawing is exactly the same, and just before it is not', () => {
  for (const prop of PROPS) {
    const at = settleAt(prop), final = drawing(prop, 1);
    assert.ok(at > 0 && at < 1, `${prop.kind}: ${at}`);
    for (let p = at + 1e-6; p <= 1; p += 0.01) assert.deepEqual(drawing(prop, pictureP(prop, p)), final, `${prop.kind} p=${p}`);
    for (const p of [0, 0.1, at / 2]) assert.equal(pictureP(prop, p), p);       // before the settle point p is left alone
    assert.notDeepEqual(drawing(prop, at - 0.03), final, `${prop.kind}: settleAt is later than it needs to be`);
    assert.equal(pictureP(prop, 1), pictureP(prop, at + 0.2));                    // everything after folds to one value, so a memo compares equal
  }
});

test('settleAt: known answers', () => {
  assert.equal(settleAt({ kind: 'counter', from: 0, to: 1, format: 'plain' }), 0.75); assert.equal(settleAt(PROPS[1]), 0.65); assert.equal(settleAt(PROPS[2]), 0.8); assert.equal(settleAt(PROPS[3]), 0.7); assert.equal(settleAt(PROPS[4]), 0.5);
  near(settleAt({ kind: 'coins', count: 3 }), 3.2 / 5); near(settleAt({ kind: 'coins', count: 30 }), 8.2 / 10);   // capped at 8 coins
  near(settleAt({ kind: 'steps', items: [L('a'), L('b'), L('c')] }), 2.9 / 3.6); near(settleAt({ kind: 'steps', items: [L('a')] }), 0.9 / 1.6);
});

test('isStill and pictureT: only a shield keeps moving after it settles, and only a shield needs the clock', () => {
  assert.equal(isStill(undefined, 0), true);
  assert.equal(isStill(PROPS[0], 0.5), false); assert.equal(isStill(PROPS[0], 0.8), true);
  assert.equal(isStill(PROPS[4], 0.9), false);                                                    // the shield breathes
  assert.equal(pictureT(PROPS[0], 1234), 0); assert.equal(pictureT(PROPS[4], 1234), 1234);
  for (const r of [...LIBRARY, ...DRAFT_REELS]) for (const s of r.scenes) if (s.prop && s.prop.kind !== 'shield') assert.equal(isStill(s.prop, 1), true, r.id);
});

test('the shield is the only picture whose drawing reads the clock', () => {
  const src = read('components/reels/Scenery.tsx');
  const draw = src.slice(src.indexOf('function SceneryDraw'), src.indexOf('export const Scenery'));
  const cases = draw.split(/\n    case '/).slice(1);
  assert.equal(cases.length, 7);
  for (const c of cases) { const kind = c.slice(0, c.indexOf("'")); const reads = /\bt \/|\bt\)|\(t\b|\bt \*/.test(c); assert.equal(reads, kind === 'shield', `${kind} ${reads ? 'reads' : 'does not read'} t`); }
});

test('captionElapsed: a still caption reports one value, and the caption it draws is identical to the exact one', () => {
  assert.equal(captionElapsed(100, 3000), 100); assert.equal(captionElapsed(340, 3000), 340); assert.equal(captionElapsed(1500, 3000), 340); assert.equal(captionElapsed(2780, 3000), 340);
  assert.equal(captionElapsed(2781, 3000), 2781); assert.equal(captionElapsed(2999, 3000), 2999);
  assert.equal(captionElapsed(300, 500), 300);                                                    // a scene too short to have a still part is left alone
  for (const sceneMs of [300, 560, 561, 1000, 3000, 6000]) for (let e = -50; e <= sceneMs + 50; e += 3) assert.deepEqual(captionMotion(captionElapsed(e, sceneMs), sceneMs), captionMotion(e, sceneMs), `${e}/${sceneMs}`);
});

// ── the cost model the script prints ───────────────────────────────────────────────────────────────────────────────────────────────────────

test('sceneryNodes: known answers (the SVG nodes a finished picture holds)', () => {
  assert.equal(sceneryNodes(undefined, 'en'), 0);
  assert.equal(sceneryNodes({ kind: 'counter', from: 0, to: 1, format: 'plain', unit: L('years'), label: L('short') }, 'en'), 2 + 1 + 1);
  assert.equal(sceneryNodes({ kind: 'counter', from: 0, to: 1, format: 'inr' }, 'en'), 2);
  assert.equal(sceneryNodes(PROPS[1], 'en'), 2 + 2 * (3 + 1));                                    // G and axis, then per bar: group, bar, value, one label line
  assert.equal(sceneryNodes(PROPS[2], 'en'), 5);
  assert.equal(sceneryNodes(PROPS[3], 'en'), 2 + 4 * 2);                                          // G, ring, then per part: arc, legend group, dot, text
  assert.equal(sceneryNodes({ kind: 'coins', count: 20 }, 'en'), 1 + 8 * 3);
  assert.equal(sceneryNodes(PROPS[4], 'en'), 2 + 1);
  assert.equal(sceneryNodes(PROPS[7], 'en'), 1 + 3 * (4 + 1));
  assert.equal(sceneryNodes({ kind: 'steps', items: [L('word '.repeat(30).trim())] }, 'en'), 1 + 4 + 4);   // a long label stops at four lines
});

// ── the clock still follows real time, scene by scene, exactly as the voice needs ─────────────────────────────────────────────────────────────

test('the frame loop with holdAtSceneEnd: the reel moves at real speed, visits every scene in order, and a busy voice still holds a scene end', () => {
  const reel = LIBRARY.find(r => r.id === 'start-early') as Reel;
  const run = (voiceBusyUntil: number) => {
    const w = fakeWorld(1000 / 60), clock = createClock(); let last = w.now(), held = 0; const seen: number[] = [];
    const ends = sceneStarts(reel).map((s, i) => s + reel.scenes[i].ms);
    const stop = startFrameLoop(() => {
      const now = w.now(), dt = Math.min(120, now - last); last = now;
      const idx = momentAt(reel, clock.get()).index;
      const r = holdAtSceneEnd(clock.get(), dt, ends[idx], now < voiceBusyUntil, held);
      held = r.heldMs; clock.set(Math.min(totalMs(reel), r.t));
      const i = momentAt(reel, clock.get()).index; if (seen[seen.length - 1] !== i) seen.push(i);
    }, { raf: w.raf, caf: w.caf, now: w.now, timer: w.timer });
    w.run(totalMs(reel) + 3000); stop();
    return { t: clock.get(), seen };
  };
  const free = run(0);
  assert.equal(free.t, totalMs(reel)); assert.deepEqual(free.seen, reel.scenes.map((_, i) => i));
  // played for exactly the length of the reel: 30 frames of ~33 ms land within a frame of real time
  const w = fakeWorld(1000 / 60), clock = createClock(); let last = w.now();
  const stop = startFrameLoop(() => { const now = w.now(); clock.set(clock.get() + Math.min(120, now - last)); last = now; }, { raf: w.raf, caf: w.caf, now: w.now, timer: w.timer });
  w.run(5000); stop();
  assert.ok(Math.abs(clock.get() - 5000) <= 40, `${clock.get()}`);
  // a voice that is busy through the first scene's end holds the clock inside that scene for at most 1.6 s, then lets it go
  const held = run(reel.scenes[0].ms + 1000);
  assert.equal(held.t, totalMs(reel)); assert.deepEqual(held.seen, reel.scenes.map((_, i) => i));
});

// ── source checks on the components ────────────────────────────────────────────────────────────────────────────────────────────────────────

const player = read('components/reels/ReelPlayer.tsx');
const body = player.slice(player.indexOf('export function ReelPlayer'), player.indexOf('/** One progress segment'));

test('the player has no timer of its own and keeps no tick in React state', () => {
  assert.ok(!/setInterval/.test(player), 'a 40 ms setInterval was the old design');
  assert.ok(!/const \[t, setT\] = useState/.test(player), 'the clock is not React state: it would re-render the whole player on every tick');
  assert.ok(!/useState\(0\)\)?;?\s*\n?\s*const \[playing/.test(player));
  assert.match(player, /createClock\(\)/); assert.match(player, /startFrameLoop\(/);
  assert.ok(!/momentAt\(played, t\b/.test(body), 'the player body must not read a ticking t');
  assert.ok(!/elapsedMs=\{t\b/.test(player), 'the caption gets its time from LiveCaption, not from the player');
});

test('the player no longer passes t to anything that does not animate', () => {
  const art = player.slice(player.indexOf('const Art = memo'), player.indexOf('/** The caption, redrawn only'));
  const outsideArt = player.replace(art, '');
  assert.ok(!/\bt=\{/.test(outsideArt), `t={…} outside Art: ${(/.*\bt=\{.*/.exec(outsideArt) ?? [''])[0].slice(0, 120)}`);
  const inArt = [...art.matchAll(/<(\w+)[^>]*\bt=\{/g)].map(m => m[1]);
  assert.deepEqual(inArt.sort(), ['Cast', 'Mitra', 'SceneryLayer']);                                // the three pieces that move
  // only three components watch the clock
  const withClock = [...player.matchAll(/<(\w+)[^>]*\bclock=\{clock\}/g)].map(m => m[1]).sort();
  assert.deepEqual(withClock, ['Art', 'LiveCaption', 'SegmentFills']);
  for (const name of ['PillRow', 'TrustSheetM', 'AskSheetM']) assert.ok(!new RegExp(`<${name}[^>]*(clock|\\bt)=`).test(player), name);
});

test('the pieces that do not move are memoised and given stable handlers', () => {
  for (const c of ['PillRow', 'Seg', 'SegmentFills', 'Art']) assert.match(player, new RegExp(`const ${c} = memo\\(function ${c}`), c);
  assert.match(player, /const TrustSheetM = memo\(TrustSheet\)/); assert.match(player, /const AskSheetM = memo\(AskSheet\)/); assert.match(player, /const CaptionM = memo\(Caption\)/);
  assert.ok(!/<TrustSheet |<AskSheet |<Caption /.test(player.replace(/<TrustSheetM|<AskSheetM|<CaptionM/g, '')), 'use the memoised wrappers');
  for (const h of ['openTrust', 'closeTrust', 'openAsk', 'closeAsk', 'replay']) assert.match(player, new RegExp(`const ${h} = useCallback\\(`), h);
  assert.match(player, /onReplay=\{sound && playing \? voice\.replay : null\}/); assert.match(player, /const voice = \{ \.\.\.heard, replay \}/);
  assert.ok(!/onTrust=\{trust \? \(\) =>|onAsk=\{\(\) =>|onClose=\{\(\) => set(Trust|Ask)Open/.test(player), 'no handler is made afresh in the JSX of the sheets and pills');
});

test('a reel that is not on screen runs no loop: the frame loop starts only for the active, playing, unpaused reel', () => {
  const at = player.indexOf('startFrameLoop(', player.indexOf('useEffect(() => {\n    if (!active'));
  assert.ok(at > 0);
  const effect = player.slice(player.lastIndexOf('useEffect(', at), at);
  assert.match(effect, /if \(!active \|\| !playing \|\| done \|\| poking \|\| sheetOpen\) return;/);
  assert.match(player, /\[active, playing, done, total, poking, sheetOpen, clock\]/);
  assert.ok(!/setInterval|setTimeout\([^)]*tick/i.test(effect));
  // the voice stays off for it too
  assert.match(player, /enabled: active && sound && playing/);
  assert.match(player, /else stopSpeaking\(\); \}, \[active, setT\]\)/);
  // with reduced motion nothing watches the clock
  assert.match(player, /calm \? noSub : clock\.subscribe/);
});

test('the keep-the-same behaviours are still there: the clock rules, the beat stop, jumps, double tap, swipes, hold', () => {
  assert.match(player, /holdAtSceneEnd\(clock\.get\(\), dt, endRef\.current, busyRef\.current, heldRef\.current\)/);
  assert.match(player, /Math\.min\(120, now - last\.current\)/);
  assert.match(player, /phase\.atPoke && !\(voiceBusy && !phase\.pastPoke\)/);
  assert.match(player, /withVoiceTiming\(reel, lang\)/);
  assert.match(player, /PanResponder\.create/); assert.match(player, /delayLongPress=\{450\}/); assert.match(player, /dbl/);
  assert.match(player, /onAccessibilityAction=\{e => jump\(/);
  assert.match(player, /setT\(0\); setPlaying\(true\)/);
});

test('Mitra builds its still parts once; Scenery is memoised, wraps each label once, and keeps per-picture numbers', () => {
  const m = read('components/reels/Mitra.tsx');
  for (const c of ['DEFS', 'SHADOW', 'FEET', 'WINGS_STILL', 'BODY_PARTS', 'FACE_STILL']) assert.match(m, new RegExp(`^const ${c}\\b`, 'm'), `${c} is built at module level, once`);
  const fn = m.slice(m.indexOf('export function Mitra'));
  assert.ok(!/<Defs>|<Stop /.test(fn) && !/fill=\{BODY\}/.test(fn), 'the body is not rebuilt in the component');
  const sc = read('components/reels/Scenery.tsx');
  assert.match(sc, /export const Scenery = memo\(SceneryDraw\)/); assert.match(sc, /export const SceneryLayer = memo\(function SceneryLayer/);
  assert.match(sc, /const WRAPPED = new Map/); assert.match(sc, /const once = /);
  assert.ok(!/Math\.max\(\.\.\.prop\.items\.map\(i => i\.value\)\);\n/.test(sc.replace(/once\(prop, 'max', \(\) => Math\.max\(\.\.\.prop\.items\.map\(i => i\.value\)\)\)/, '')), 'the largest bar is found once per picture');
});

test('the cost script runs and prints the redraw model', () => {
  const out = execFileSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--import', './__tests__/register-aliases.mjs', 'scripts/reels-perf.mts'], { cwd: ROOT, encoding: 'utf8' });
  assert.match(out, /Redraw model/); assert.match(out, /before: 25 whole-player renders a second/); assert.match(out, /after:  at most 30 a second/);
  const one = execFileSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--import', './__tests__/register-aliases.mjs', 'scripts/reels-perf.mts', 'start-early'], { cwd: ROOT, encoding: 'utf8' });
  assert.match(one, /start-early: 7 scenes/); assert.match(one, /svg node renders: before [\d,]+, after [\d,]+/);
  assert.match(read('package.json'), /"reels:perf": "node [^"]*scripts\/reels-perf\.mts"/);
});
