// A watchlist: stocks and funds you follow without owning. Pure rules; fetching lives in watchlistStorage.ts.
// The price when you added an item is kept, so "since you added it" is a real number, not a guess.
export type WatchType = 'Stock' | 'MF';
export interface WatchItem { id: string; type: WatchType; symbol: string; name: string; addedAt: string; refPrice: number | null; lastPrice: number | null; priceDate: string | null }
export const WATCH_KEY = 'finos_watchlist';
export const MAX_ITEMS = 40;

export const itemId = (type: WatchType, symbol: string) => `${type}:${symbol.toUpperCase()}`;

/** A stock ticker as NSE writes it: letters, digits, & and -, up to 20 characters. Funds use the numeric scheme code. */
export function cleanSymbol(type: WatchType, raw: string): string | null {
  const s = raw.trim().toUpperCase().replace(/^NSE:/, '');
  if (type === 'MF') return /^\d{4,8}$/.test(s) ? s : null;
  return /^[A-Z0-9&-]{1,20}$/.test(s) ? s : null;
}

export function normalise(raw: unknown): WatchItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: WatchItem[] = [];
  for (const r of raw as any[]) {
    if (!r || typeof r !== 'object' || (r.type !== 'Stock' && r.type !== 'MF')) continue;
    const symbol = cleanSymbol(r.type, String(r.symbol ?? ''));
    if (!symbol) continue;
    const id = itemId(r.type, symbol);
    if (seen.has(id)) continue;
    seen.add(id);
    const num = (v: unknown) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : null; };
    out.push({ id, type: r.type, symbol, name: String(r.name || symbol).slice(0, 80), addedAt: typeof r.addedAt === 'string' ? r.addedAt : '', refPrice: num(r.refPrice), lastPrice: num(r.lastPrice), priceDate: typeof r.priceDate === 'string' ? r.priceDate : null });
  }
  return out.slice(0, MAX_ITEMS);
}

export type AddResult = { ok: true; items: WatchItem[] } | { ok: false; error: string };

export function add(items: WatchItem[], type: WatchType, rawSymbol: string, name: string, price: number | null, now: Date): AddResult {
  const symbol = cleanSymbol(type, rawSymbol);
  if (!symbol) return { ok: false, error: type === 'MF' ? 'A fund is added from the search results.' : 'Enter an NSE ticker such as INFY or HDFCBANK.' };
  if (items.some(i => i.id === itemId(type, symbol))) return { ok: false, error: `${symbol} is already on your watchlist.` };
  if (items.length >= MAX_ITEMS) return { ok: false, error: `The watchlist holds ${MAX_ITEMS} items. Remove one first.` };
  const p = price !== null && Number.isFinite(price) && price > 0 ? Math.round(price * 100) / 100 : null;
  const item: WatchItem = { id: itemId(type, symbol), type, symbol, name: name.trim().slice(0, 80) || symbol, addedAt: now.toISOString(), refPrice: p, lastPrice: p, priceDate: p !== null ? now.toISOString().slice(0, 10) : null };
  return { ok: true, items: [item, ...items] };
}

export const remove = (items: WatchItem[], id: string): WatchItem[] => items.filter(i => i.id !== id);

/** Applies fresh prices ({ id: price }) and leaves an item untouched when its price did not come back. */
export function applyPrices(items: WatchItem[], prices: Record<string, number>, today: string): WatchItem[] {
  return items.map(i => {
    const p = prices[i.id];
    if (!(typeof p === 'number' && p > 0)) return i;
    const price = Math.round(p * 100) / 100;
    return { ...i, lastPrice: price, priceDate: today, refPrice: i.refPrice ?? price };
  });
}

export interface WatchView extends WatchItem { changePct: number | null; stale: boolean }
/** Change since it was added (null until there are two prices), and whether the last price is older than a week. */
export function view(items: WatchItem[], today: string): WatchView[] {
  const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  return items.map(i => ({
    ...i,
    changePct: i.refPrice && i.lastPrice ? ((i.lastPrice - i.refPrice) / i.refPrice) * 100 : null,
    stale: i.priceDate ? days(i.priceDate, today) > 7 : true,
  }));
}
