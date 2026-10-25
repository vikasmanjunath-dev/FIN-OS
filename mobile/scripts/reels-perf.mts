// What a Money Reel costs to play, counted from the data alone (no phone needed): scenes, animated pieces per scene, the worst scene, how many SVG
// nodes the picture holds, and how much of that the player redraws every frame. The numbers a phone adds (milliseconds per frame) are not here:
// see "Performance" in docs/REELS.md for how those were measured in the web preview and what still needs a real mid-range phone.
//   npm run reels:perf                 the library summary, the ten heaviest reels, then the 'before' and 'after' redraw model
//   npm run reels:perf -- <reel-id>    one reel, scene by scene
//   npm run reels:perf -- --all        every reel, one line each
//   add --drafts for the 50 draft reels instead of the live library
import fs from 'node:fs';
import path from 'node:path';
import { LIBRARY } from '../lib/reels/library.ts';
import { DRAFT_REELS } from '../lib/reels/drafts.ts';
import { sceneCost, propCost, reelCost, beatCost } from '../lib/reels/qa.ts';
import { totalMs } from '../lib/reels/engine.ts';
import { FRAME_MS, FPS, settleAt, sceneryNodes } from '../lib/reels/frame.ts';
import type { Mood, Prop, Reel } from '../lib/reels/types.ts';

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const reels: Reel[] = flag('--drafts') ? DRAFT_REELS : LIBRARY;
const root = path.join(import.meta.dirname, '..');

/** The old design: one setInterval of 40 ms whose callback set the clock state, so the whole player rendered on every tick. */
const OLD_TICK_MS = 40;

// ── Mitra, node by node (counted from components/reels/Mitra.tsx) ───────────────────────────────────────────────────────────────────────────────
// Whole picture: Svg, Defs + gradient + 2 stops, shadow, bob group, 2 feet, 2 wings (group + ellipse each), 2 ears, body, belly, feather marks, coin and
// its ₹, two eyes (group, white, pupil and glint: 4 each, 2 when the eyes are closed in a blink) or two happy arcs, two brows, beak; then the mood's extras.
const MITRA_ALL: Record<Mood, number> = { happy: 31, think: 32, worry: 32, surprised: 32, cheer: 26 };
// What the player redraws each frame now: the Svg, the bob group, the eyes (or the happy arcs) and the mood's moving extras (cheer: wings and 3 sparkles).
// Everything else (shadow, feet, ears, body, belly, coin, brows, beak, gradient) is built once per mood and React skips it.
const MITRA_MOVING: Record<Mood, number> = { happy: 10, think: 11, worry: 11, surprised: 10, cheer: 11 };

const tagCount = (file: string): number => (fs.readFileSync(path.join(root, file), 'utf8').match(/<(?:G|Path|Circle|Ellipse|Rect|Polygon|Polyline|SvgText|Text|Stop|Defs|LinearGradient)[\s>]/g) ?? []).length;

interface SceneRow { i: number; prop: string; cost: number; sceneryNodes: number; ms: number; figure: number; oldNodeRenders: number; newNodeRenders: number; oldTicks: number; newFrames: number }

function sceneRows(r: Reel): SceneRow[] {
  return r.scenes.map((s, i) => {
    const figure = s.who ? 0 : MITRA_ALL[s.mood];                     // a cast member (who) is counted below: its drawing code is not modelled node by node
    const moving = s.who ? 0 : MITRA_MOVING[s.mood];
    const scenery = sceneryNodes(s.prop, 'en');
    const oldTicks = Math.ceil(s.ms / OLD_TICK_MS), newFrames = Math.ceil(s.ms / FRAME_MS);
    const animFrames = s.prop ? (s.prop.kind === 'shield' ? newFrames : Math.min(newFrames, Math.ceil((s.ms * settleAt(s.prop)) / FRAME_MS))) : 0;
    return {
      i, prop: s.prop?.kind ?? (s.who ? `who:${s.who}` : '-'), cost: sceneCost(s), sceneryNodes: scenery, ms: s.ms, figure,
      oldNodeRenders: (figure + scenery) * oldTicks,
      newNodeRenders: moving * newFrames + scenery * animFrames,
      oldTicks, newFrames,
    };
  });
}

interface ReelRow { id: string; scenes: number; ms: number; worstIdx: number; worstCost: number; total: number; beat: number; oldTicks: number; newFrames: number; oldNodeRenders: number; newNodeRenders: number; kinds: string }
function reelRow(r: Reel): ReelRow {
  const rows = sceneRows(r), c = reelCost(r);
  const worstIdx = c.scenes.indexOf(c.heaviest);
  return {
    id: r.id, scenes: r.scenes.length, ms: totalMs(r), worstIdx, worstCost: c.heaviest, total: c.total, beat: r.poke ? beatCost(r.poke.beat) : 0,
    oldTicks: rows.reduce((a, x) => a + x.oldTicks, 0), newFrames: rows.reduce((a, x) => a + x.newFrames, 0),
    oldNodeRenders: rows.reduce((a, x) => a + x.oldNodeRenders, 0), newNodeRenders: rows.reduce((a, x) => a + x.newNodeRenders, 0),
    kinds: [...new Set(r.scenes.map(s => s.prop?.kind).filter(Boolean))].join('+') || 'none',
  };
}

const pad = (s: string | number, n: number) => String(s).padEnd(n);
const num = (n: number) => Math.round(n).toLocaleString('en-US');
const pct = (a: number, b: number) => (b ? `${((1 - a / b) * 100).toFixed(0)}% fewer` : 'n/a');

function oneReel(r: Reel) {
  console.log(`${r.id}: ${r.scenes.length} scenes, ${(totalMs(r) / 1000).toFixed(1)} s${r.poke ? `, beat '${r.poke.beat.kind}' after scene ${r.poke.after + 1} (${beatCost(r.poke.beat)} pieces)` : ''}\n`);
  console.log(`${pad('scene', 6)}${pad('picture', 10)}${pad('ms', 7)}${pad('animated', 10)}${pad('svg nodes', 11)}${pad('settles at', 12)}`);
  const rows = sceneRows(r);
  r.scenes.forEach((s, i) => console.log(`${pad(i + 1, 6)}${pad(rows[i].prop, 10)}${pad(s.ms, 7)}${pad(rows[i].cost, 10)}${pad(rows[i].sceneryNodes, 11)}${pad(s.prop ? (s.prop.kind === 'shield' ? 'never (breathes)' : `${(settleAt(s.prop) * 100).toFixed(0)}% of scene`) : '-', 12)}`));
  const row = reelRow(r);
  console.log(`\nredraws while it plays: before ${row.oldTicks} whole-player renders (${(1000 / OLD_TICK_MS).toFixed(0)}/s), after at most ${row.newFrames} picture renders (${FPS}/s) and no player renders`);
  console.log(`svg node renders: before ${num(row.oldNodeRenders)}, after ${num(row.newNodeRenders)} (${pct(row.newNodeRenders, row.oldNodeRenders)})`);
}

if (args.find(a => !a.startsWith('--'))) {
  const id = args.find(a => !a.startsWith('--')) as string;
  const r = [...LIBRARY, ...DRAFT_REELS].find(x => x.id === id);
  if (!r) { console.error(`no reel '${id}'`); process.exit(1); }
  oneReel(r);
  process.exit(0);
}

const rows = reels.map(reelRow);
if (flag('--all')) {
  console.log(`${pad('reel', 34)}${pad('scn', 5)}${pad('sec', 6)}${pad('worst', 12)}${pad('pieces', 8)}${pad('old nodes', 11)}${pad('new nodes', 11)}pictures`);
  for (const x of rows) console.log(`${pad(x.id, 34)}${pad(x.scenes, 5)}${pad((x.ms / 1000).toFixed(0), 6)}${pad(`#${x.worstIdx + 1} ${x.worstCost}/30`, 12)}${pad(x.total, 8)}${pad(num(x.oldNodeRenders), 11)}${pad(num(x.newNodeRenders), 11)}${x.kinds}`);
  console.log('');
}

const sum = (f: (x: ReelRow) => number) => rows.reduce((a, x) => a + f(x), 0);
const scenesAll = sum(x => x.scenes), kinds = new Map<string, { n: number; cost: number; nodes: number; settle: string }>();
for (const r of reels) for (const s of r.scenes) if (s.prop) {
  const k = kinds.get(s.prop.kind) ?? { n: 0, cost: 0, nodes: 0, settle: s.prop.kind === 'shield' ? 'never' : '' };
  k.n++; k.cost += propCost(s.prop); k.nodes += sceneryNodes(s.prop, 'en'); kinds.set(s.prop.kind, k);
}
const maxNodes = (kind: Prop['kind']) => Math.max(0, ...reels.flatMap(r => r.scenes.filter(s => s.prop?.kind === kind).map(s => sceneryNodes(s.prop, 'en'))));
const heavy = [...rows].sort((a, b) => b.worstCost - a.worstCost || b.oldNodeRenders - a.oldNodeRenders).slice(0, 10);

console.log(`Money reels, rendering cost counted from the data (${flag('--drafts') ? 'drafts' : 'live library'}): ${reels.length} reels, ${scenesAll} scenes, ${(sum(x => x.ms) / 60000).toFixed(0)} minutes of animation\n`);
console.log(`Animated pieces per scene (qa.ts sceneCost, budget 30): mean ${(sum(x => x.total) / scenesAll).toFixed(1)}, worst ${Math.max(...rows.map(x => x.worstCost))} (${heavy[0].id}, scene ${heavy[0].worstIdx + 1}); scenes with no picture: ${reels.reduce((a, r) => a + r.scenes.filter(s => !s.prop).length, 0)}`);
console.log(`Beat screens: ${rows.filter(x => x.beat).length} reels, worst ${Math.max(...rows.map(x => x.beat))} pieces\n`);
console.log(`${pad('picture', 9)}${pad('scenes', 8)}${pad('mean pieces', 13)}${pad('mean svg nodes', 16)}${pad('largest', 9)}settles at`);
for (const [k, v] of [...kinds].sort((a, b) => b[1].n - a[1].n)) {
  const sample = reels.flatMap(r => r.scenes).find(s => s.prop?.kind === k)?.prop as Prop;
  console.log(`${pad(k, 9)}${pad(v.n, 8)}${pad((v.cost / v.n).toFixed(1), 13)}${pad((v.nodes / v.n).toFixed(1), 16)}${pad(maxNodes(k as Prop['kind']), 9)}${k === 'shield' ? 'never: it breathes' : `${(settleAt(sample) * 100).toFixed(0)}% of the scene${k === 'coins' || k === 'steps' ? ' (when the last item has appeared; shown for the sample scene)' : ''}`}`);
}
console.log(`\nMitra: ${Object.entries(MITRA_ALL).map(([m, n]) => `${m} ${n}`).join(', ')} svg nodes (source holds ${tagCount('components/reels/Mitra.tsx')} drawing tags); moving each frame: ${Object.entries(MITRA_MOVING).map(([m, n]) => `${m} ${n}`).join(', ')}`);
console.log(`Cast members (scene.who): ${tagCount('components/reels/Cast.tsx')} drawing tags in the source, all redrawn each frame (not changed here)\n`);

console.log('The ten heaviest reels (worst scene, then total node renders):');
for (const x of heavy) console.log(`  ${pad(x.id, 34)} scene ${x.worstIdx + 1}: ${x.worstCost}/30 pieces, ${x.kinds}`);

console.log(`\nRedraw model, per second of playing (a reel has one picture on screen at a time)`);
console.log(`  before: ${(1000 / OLD_TICK_MS).toFixed(0)} whole-player renders a second (setInterval ${OLD_TICK_MS} ms -> setT): header, title, segments, big words, stage, caption, pill row, hint, toast, steer modal, trust and ask sheets, every time`);
console.log(`  after:  at most ${FPS} a second, and only the segment bar, the stage picture and (while a caption fades in or out) the caption; the player itself renders when the scene, the pause or the beat changes`);
console.log(`  whole library, svg node renders playing every reel once: before ${num(sum(x => x.oldNodeRenders))}, after ${num(sum(x => x.newNodeRenders))} (${pct(sum(x => x.newNodeRenders), sum(x => x.oldNodeRenders))})`);
console.log(`  whole-player renders playing every reel once: before ${num(sum(x => x.oldTicks))}, after ${num(rows.reduce((a, x) => a + x.scenes + 2, 0))} (one per scene change, plus the start and the question screen)`);
console.log(`  mean per reel: ${(sum(x => x.oldTicks) / rows.length).toFixed(0)} ticks before, ${(sum(x => x.newFrames) / rows.length).toFixed(0)} picture frames after`);
console.log('\nNot counted here (needs a phone): milliseconds per frame, dropped frames while swiping, memory. See "Performance" in docs/REELS.md.');
