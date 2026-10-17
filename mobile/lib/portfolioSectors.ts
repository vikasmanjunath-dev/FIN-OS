// Portfolio by sector. A sector is only ever one the data source named (Yahoo Finance company info, via the Arya backend's
// /api/fundamentals/{symbol}): a stock the source did not name is "Unmapped", never guessed from its ticker. (The website guesses
// from keywords in the ticker; that is exactly what this does not do. It even files INDIGO under paints.) Mutual funds have no
// sector from this source, so they sit together as "Mutual funds" and are not split by sector.
//
// computeHHI / effectiveN are ports of the website's functions of the same name (Herfindahl index on the percentage weights and its
// reciprocal); the parity test runs the website's text against these.
import type { HoldingView } from '@/lib/holdings';
import { holdingKey } from '@/lib/holdings';
import type { TreeGroup } from '@/lib/portfolioTreemap';

export const UNMAPPED = 'Unmapped';
export const FUNDS = 'Mutual funds';

export type SectorKind = 'sector' | 'unmapped' | 'funds';

export interface SectorCell {
  key: string; symbol: string; name: string; type: HoldingView['type'];
  current: number; invested: number;
  /** gain on cost in percent; null when the holding has no saved market price (it is valued at cost, which says nothing about gain) */
  gainPct: number | null; priced: boolean;
  /** share of the whole portfolio's current value, percent */
  weightPct: number;
  sector: string;
}
export interface SectorGroup {
  sector: string; kind: SectorKind;
  current: number; invested: number; weightPct: number;
  /** gain on cost of the priced holdings only, percent; null when none is priced */
  gainPct: number | null; pricedCount: number; count: number;
  cells: SectorCell[];
}
export interface SectorSplit {
  total: number; groups: SectorGroup[];
  unpriced: number;           // holdings valued at cost because they have no saved market price
  mappedStocks: number; unmappedStocks: number; fundCount: number;
}

const clean = (s: unknown) => (typeof s === 'string' ? s.trim() : '');

/**
 * Groups holdings by sector. `sectorOf` maps an upper-case stock ticker to the sector the data source gave it (missing = unknown).
 * Holdings with zero or negative value are left out of the shares (nothing to draw), not hidden from the count of unpriced ones.
 */
export function splitBySector(views: HoldingView[], sectorOf: Record<string, string | null | undefined>): SectorSplit {
  const rows = views.filter(v => Number.isFinite(v.current) && v.current > 0);
  const total = rows.reduce((s, v) => s + v.current, 0);
  const byName = new Map<string, SectorGroup>();
  let mapped = 0, unmapped = 0, funds = 0;
  for (const v of rows) {
    let sector: string, kind: SectorKind;
    if (v.type === 'Stock') {
      const s = clean(sectorOf[v.symbol.toUpperCase()]);
      if (s) { sector = s; kind = 'sector'; mapped++; } else { sector = UNMAPPED; kind = 'unmapped'; unmapped++; }
    } else { sector = FUNDS; kind = 'funds'; funds++; }
    let g = byName.get(sector);
    if (!g) { g = { sector, kind, current: 0, invested: 0, weightPct: 0, gainPct: null, pricedCount: 0, count: 0, cells: [] }; byName.set(sector, g); }
    const cell: SectorCell = {
      key: holdingKey(v), symbol: v.symbol, name: v.name, type: v.type, current: v.current, invested: v.invested,
      gainPct: v.priced && v.invested > 0 ? (v.gain / v.invested) * 100 : null, priced: v.priced,
      weightPct: total > 0 ? (v.current / total) * 100 : 0, sector,
    };
    g.cells.push(cell);
    g.current += v.current; g.count++;
    if (v.priced) { g.pricedCount++; g.invested += v.invested; }
  }
  const groups = [...byName.values()].map(g => {
    const pricedCurrent = g.cells.filter(c => c.priced).reduce((s, c) => s + c.current, 0);
    return {
      ...g, weightPct: total > 0 ? (g.current / total) * 100 : 0,
      gainPct: g.pricedCount > 0 && g.invested > 0 ? ((pricedCurrent - g.invested) / g.invested) * 100 : null,
      cells: g.cells.sort((a, b) => b.current - a.current),
    };
  });
  // largest first, but the two "no sector" buckets always after the named sectors so they read as what they are
  const rank = (g: SectorGroup) => (g.kind === 'sector' ? 0 : g.kind === 'funds' ? 1 : 2);
  groups.sort((a, b) => rank(a) - rank(b) || b.current - a.current || a.sector.localeCompare(b.sector));
  return { total, groups, unpriced: views.filter(v => !v.priced).length, mappedStocks: mapped, unmappedStocks: unmapped, fundCount: funds };
}

/** Treemap input for a split. Colour is the gain on cost (null = grey: no saved market price). */
export function toTreeGroups(split: SectorSplit): TreeGroup[] {
  return split.groups.map(g => ({
    id: g.sector, label: g.sector,
    leaves: g.cells.map(c => ({ id: c.key, label: c.symbol.length > 14 ? c.name.slice(0, 14) : c.symbol, value: c.current, colorValue: c.gainPct, meta: c })),
  }));
}

// ── concentration (ports) ────────────────────────────────────────────────────

/** Herfindahl-Hirschman index of a {name: {inv}} map over `base`: sum of squared percentage weights, 0..10000. */
export function computeHHI(map: Record<string, { inv: number }>, base: number): number {
  if (!base) return 0;
  return Object.values(map).reduce((s, v) => { const p = (v.inv / base) * 100; return s + p * p; }, 0);
}
/** 1 / sum(w^2): how many equal-sized buckets the portfolio is as spread out as. Rounded to 1 decimal like the website. */
export function effectiveN(map: Record<string, { inv: number }>, base: number): number {
  if (!base) return 0;
  const sumSq = Object.values(map).reduce((s, v) => s + (v.inv / base) ** 2, 0);
  return sumSq > 0 ? +(1 / sumSq).toFixed(1) : 0;
}

export type Concentration = 'spread out' | 'moderate' | 'concentrated';
/** The website's bands: under 1000 spread out, 1000 to 2500 moderate, above 2500 concentrated. A reading of one lens, not advice. */
export function concentrationBand(hhi: number): Concentration { return hhi < 1000 ? 'spread out' : hhi <= 2500 ? 'moderate' : 'concentrated'; }

/** HHI and effective N over the *named* sectors only (Unmapped and Mutual funds are not sectors, so they are not buckets here). */
export function sectorConcentration(split: SectorSplit): { hhi: number; effectiveN: number; band: Concentration; named: number; baseValue: number } | null {
  const named = split.groups.filter(g => g.kind === 'sector');
  const base = named.reduce((s, g) => s + g.current, 0);
  if (!named.length || base <= 0) return null;
  const map: Record<string, { inv: number }> = {};
  named.forEach(g => { map[g.sector] = { inv: g.current }; });
  const hhi = computeHHI(map, base);
  return { hhi, effectiveN: effectiveN(map, base), band: concentrationBand(hhi), named: named.length, baseValue: base };
}

/** The largest single holding as a share of the portfolio, percent, with its name. Null for an empty portfolio. */
export function topHolding(split: SectorSplit): { name: string; symbol: string; weightPct: number } | null {
  let best: SectorCell | null = null;
  for (const g of split.groups) for (const c of g.cells) if (!best || c.current > best.current) best = c;
  return best ? { name: best.name, symbol: best.symbol, weightPct: best.weightPct } : null;
}
