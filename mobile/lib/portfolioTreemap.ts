// Treemap layout: squarify is a port of the squarified-treemap routine inside buildOverviewTreemap() of
// Porfolio Analyser/portfolio-analyser-v10.html (same rows, same worst-aspect rule); the parity test runs the website's own text.
// Pure geometry: items with an `area` in, rectangles out. Colours are the phone's own (see tileFill).

export interface AreaItem { area: number }
export type Placed<T> = T & { rx: number; ry: number; rw: number; rh: number };

export function squarify<T extends AreaItem>(items: T[], x: number, y: number, w: number, h: number): Placed<T>[] {
  if (!items.length) return [];
  const rects: Placed<T>[] = [];
  const worst = (row: T[], len: number) => {
    const s = row.reduce((a, d) => a + d.area, 0);
    const mn = Math.min(...row.map(d => d.area));
    const mx = Math.max(...row.map(d => d.area));
    return Math.max((len * len * mx) / (s * s), (s * s) / (len * len * mn));
  };
  const layoutRow = (row: T[], x0: number, y0: number, w0: number, h0: number, horiz: boolean) => {
    const rs = row.reduce((s, d) => s + d.area, 0);
    let pos = horiz ? x0 : y0;
    row.forEach(d => {
      const frac = d.area / rs;
      const rw = horiz ? w0 * frac : w0, rh = horiz ? h0 : h0 * frac;
      rects.push({ ...d, rx: horiz ? pos : x0, ry: horiz ? y0 : pos, rw, rh });
      pos += horiz ? rw : rh;
    });
  };
  const sq = (its: T[], x1: number, y1: number, w1: number, h1: number) => {
    if (!its.length) return;
    const horiz = w1 >= h1, len = horiz ? h1 : w1;
    let row: T[] = [], i = 0;
    while (i < its.length) {
      const nr = [...row, its[i]];
      if (!row.length || worst(nr, len) <= worst(row, len)) { row = nr; i++; } else break;
    }
    const rs = row.reduce((s, d) => s + d.area, 0), dim = rs / len;
    layoutRow(row, x1, y1, horiz ? dim : w1, horiz ? h1 : dim, !horiz);
    const rem = its.slice(row.length);
    if (rem.length) { if (horiz) sq(rem, x1 + dim, y1, w1 - dim, h1); else sq(rem, x1, y1 + dim, w1, h1 - dim); }
  };
  sq(items, x, y, w, h);
  return rects;
}

/** Lays out `values` (positive numbers) in a w by h box, largest first. A value that is not a positive finite number is left out. */
export function layoutValues<T extends { value: number }>(items: T[], w: number, h: number): Placed<T & AreaItem>[] {
  const ok = items.filter(i => Number.isFinite(i.value) && i.value > 0).sort((a, b) => b.value - a.value);
  const total = ok.reduce((s, i) => s + i.value, 0);
  if (!ok.length || !(w > 0) || !(h > 0) || total <= 0) return [];
  return squarify(ok.map(i => ({ ...i, area: (i.value / total) * w * h })), 0, 0, w, h);
}

export interface TreeLeaf { id: string; label: string; value: number; colorValue: number | null; meta?: any }
export interface TreeGroup { id: string; label: string; leaves: TreeLeaf[] }
export interface PlacedLeaf extends TreeLeaf { x: number; y: number; w: number; h: number }
export interface PlacedGroup { id: string; label: string; value: number; x: number; y: number; w: number; h: number; headerH: number; leaves: PlacedLeaf[] }

/**
 * Two-level treemap: groups (sectors) laid out by their total value, then each group's leaves inside it, below a label strip when
 * the group is tall enough to carry one. Leaves with no positive value are left out.
 */
export function layoutTwoLevel(groups: TreeGroup[], w: number, h: number, headerH = 16, gap = 1): PlacedGroup[] {
  const gs = groups.map(g => ({ ...g, leaves: g.leaves.filter(l => Number.isFinite(l.value) && l.value > 0) }))
    .map(g => ({ ...g, value: g.leaves.reduce((s, l) => s + l.value, 0) }))
    .filter(g => g.value > 0);
  const placed = layoutValues(gs, w, h);
  return placed.map(g => {
    const head = g.rh >= 46 && g.rw >= 56 ? headerH : 0;
    const inner = layoutValues(g.leaves, Math.max(0, g.rw - 2 * gap), Math.max(0, g.rh - head - 2 * gap));
    return {
      id: g.id, label: g.label, value: g.value, x: g.rx, y: g.ry, w: g.rw, h: g.rh, headerH: head,
      leaves: inner.map(l => ({ id: l.id, label: l.label, value: l.value, colorValue: l.colorValue, meta: l.meta, x: g.rx + gap + l.rx, y: g.ry + head + gap + l.ry, w: l.rw, h: l.rh })),
    };
  });
}

// ── colour ───────────────────────────────────────────────────────────────────

const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
const NEUTRAL: [number, number, number] = [55, 65, 81];       // slate
const UP: [number, number, number] = [4, 120, 87];            // emerald
const DOWN: [number, number, number] = [185, 28, 28];         // red
const UNKNOWN = '#4b5563';

/**
 * Tile colour for a percentage change: slate at 0, full green / red at +/- `fullAt` percent (default 30% for gain on cost; use ~3 for a day's move).
 * Every colour keeps white text above 4.5:1. A null value (no figure) is a flat grey, never read as flat-at-zero.
 */
export function tileFill(pct: number | null, fullAt = 30): string {
  if (pct === null || !Number.isFinite(pct)) return UNKNOWN;
  const t = Math.min(1, Math.abs(pct) / fullAt);
  const to = pct >= 0 ? UP : DOWN;
  return `rgb(${lerp(NEUTRAL[0], to[0], t)},${lerp(NEUTRAL[1], to[1], t)},${lerp(NEUTRAL[2], to[2], t)})`;
}
