// Data for the market map screen: sector index moves from /api/market/sectors, and the tiles of the large-company map.
// Pure normalisers and layout helpers; nothing is fetched here.
import { num, pos, type Quote } from '@/lib/marketData';
import type { PricePoint } from '@/lib/portfolioHistory';
import type { TreeLeaf } from '@/lib/portfolioTreemap';

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

export interface SectorIndex { name: string; label: string; price: number | null; changePct: number; source: string }
const SECTOR_ORDER = ['IT', 'BANK', 'FMCG', 'PHARMA', 'AUTO', 'METAL', 'ENERGY', 'REALTY'];

/** /api/market/sectors -> rows. A sector without a numeric change is left out (the backend omits a sector it cannot fetch). */
export function normaliseSectorIndices(raw: unknown): { sectors: SectorIndex[]; asOf: number | null } {
  const src = isObj(raw) && isObj(raw.sectors) ? raw.sectors : {};
  const sectors: SectorIndex[] = [];
  for (const [name, v] of Object.entries<any>(src)) {
    if (!isObj(v)) continue;
    const ch = num(v.change_pct);
    if (ch === null) continue;
    sectors.push({ name, label: typeof v.label === 'string' && v.label.trim() ? v.label.trim() : name, price: pos(v.price), changePct: ch, source: typeof v.source === 'string' ? v.source : '' });
  }
  sectors.sort((a, b) => {
    const x = SECTOR_ORDER.indexOf(a.label), y = SECTOR_ORDER.indexOf(b.label);
    return (x < 0 ? 99 : x) - (y < 0 ? 99 : y) || a.label.localeCompare(b.label);
  });
  return { sectors, asOf: isObj(raw) ? num(raw.as_of) : null };
}

/** Dated closes from two parallel arrays; rows without a YYYY-MM-DD date or a positive close are dropped. */
export function pointsOf(dates: string[], closes: number[]): PricePoint[] {
  const out: PricePoint[] = [];
  const n = Math.min(dates.length, closes.length);
  for (let i = 0; i < n; i++) if (/^\d{4}-\d{2}-\d{2}$/.test(dates[i]) && closes[i] > 0 && Number.isFinite(closes[i])) out.push({ date: dates[i], close: closes[i] });
  return out;
}

/**
 * Leaves for the large-company map: size = market value, colour = the day's change. A share without a market value cannot be sized,
 * so it is returned in `unsized` (and listed on screen), never given a made-up size.
 */
export function mapLeaves(quotes: Quote[]): { leaves: TreeLeaf[]; unsized: string[] } {
  const leaves: TreeLeaf[] = [], unsized: string[] = [];
  for (const q of quotes) {
    if (q.marketCap === null || !(q.marketCap > 0)) { unsized.push(q.symbol); continue; }
    leaves.push({ id: q.symbol, label: q.symbol, value: q.marketCap, colorValue: q.changePct, meta: { price: q.price, changePct: q.changePct, marketCap: q.marketCap } });
  }
  return { leaves, unsized };
}

/** Advancing / declining / unknown counts among sector or index moves. */
export function tally(changes: (number | null)[]): { up: number; down: number; flat: number; unknown: number } {
  let up = 0, down = 0, flat = 0, unknown = 0;
  for (const c of changes) { if (c === null) unknown++; else if (c > 0) up++; else if (c < 0) down++; else flat++; }
  return { up, down, flat, unknown };
}
