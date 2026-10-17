// Screener additions: sector, P/E and P/B for the shares in the screener, from the backend's /api/fundamentals/{symbol}
// (Yahoo Finance company info, cross-checked P/E). Only fields that endpoint returns are used; the website's screener also filters
// on ROE, debt/equity, dividend yield and revenue growth from a hard-coded table, which the backend does not provide, so those
// filters are not here. A share whose figure is missing is left out of any filter on that figure (never treated as 0).
//
// DEEP_VALUE copies the website's "Deep Value" rule (P/E <= 15 and P/B <= 2); the parity test runs the website's own preset.
import type { ScreenRow, Fundamentals } from '@/lib/marketData';

export interface ValRow extends ScreenRow {
  sector: string | null; industry: string | null; pe: number | null; pb: number | null; marketCap: number | null;
  /** true when fundamentals were loaded for this share (a null figure then means "the source has none", not "not asked") */
  loaded: boolean;
}

export function joinValuation(rows: ScreenRow[], funds: Record<string, Fundamentals | null | undefined>): ValRow[] {
  return rows.map(r => {
    const f = funds[r.symbol];
    return { ...r, sector: f?.sector ?? null, industry: f?.industry ?? null, pe: f?.peRatio ?? null, pb: f?.priceToBook ?? null, marketCap: f?.marketCap ?? null, loaded: !!f };
  });
}

export interface ValFilter { sector: string | null; peMax: number | null; pbMax: number | null; preset: 'none' | 'deep_value' }

/** Website rule "Deep Value": P/E at most 15 and P/B at most 2, both known. A rule of thumb, not a signal. */
export const DEEP_VALUE = { peMax: 15, pbMax: 2 } as const;
export const deepValue = (r: { pe: number | null; pb: number | null }) => r.pe !== null && r.pe <= DEEP_VALUE.peMax && r.pb !== null && r.pb <= DEEP_VALUE.pbMax;

export function applyValuation(rows: ValRow[], f: ValFilter): ValRow[] {
  return rows.filter(r => {
    if (f.sector !== null && r.sector !== f.sector) return false;
    if (f.peMax !== null && (r.pe === null || r.pe > f.peMax)) return false;
    if (f.pbMax !== null && (r.pb === null || r.pb > f.pbMax)) return false;
    if (f.preset === 'deep_value' && !deepValue(r)) return false;
    return true;
  });
}

export function sectorCounts(rows: ValRow[]): { sector: string; count: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) if (r.sector) m.set(r.sector, (m.get(r.sector) ?? 0) + 1);
  return [...m.entries()].map(([sector, count]) => ({ sector, count })).sort((a, b) => b.count - a.count || a.sector.localeCompare(b.sector));
}

export type ValSort = 'pe' | 'pb' | 'marketCap';
/** Sorts by a valuation figure; rows without it go last in either direction. */
export function sortValuation(rows: ValRow[], key: ValSort, desc: boolean): ValRow[] {
  const dir = desc ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = a[key], y = b[key];
    if (x === null && y === null) return a.symbol.localeCompare(b.symbol);
    if (x === null) return 1;
    if (y === null) return -1;
    return x === y ? a.symbol.localeCompare(b.symbol) : dir * (x - y);
  });
}

/** Parses a typed number such as "15" or "2.5"; empty or not a positive number gives null (no filter). */
export function parseLimit(raw: string): number | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Peers: other shares from `universe` that the data source puts in the same industry (or, failing that, sector) as `me`.
 * This is the source's own classification, not an analyst's peer group. Null when the share's own sector is unknown.
 */
export type PeerRow = Pick<ValRow, 'symbol' | 'sector' | 'industry' | 'pe' | 'pb' | 'marketCap'>;
export function sameGroup<T extends PeerRow>(me: { symbol: string; industry: string | null; sector: string | null }, universe: T[]): { by: 'industry' | 'sector'; peers: T[] } | null {
  if (!me.industry && !me.sector) return null;
  if (me.industry) {
    const ind = universe.filter(r => r.symbol !== me.symbol && r.industry === me.industry);
    if (ind.length) return { by: 'industry', peers: ind };
  }
  if (me.sector) return { by: 'sector', peers: universe.filter(r => r.symbol !== me.symbol && r.sector === me.sector) };
  return { by: 'industry', peers: [] };
}
