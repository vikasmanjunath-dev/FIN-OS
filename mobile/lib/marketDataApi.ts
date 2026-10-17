// The market endpoints of the Arya backend, each as "fetch -> normalise -> last good answer" (see marketDataStorage.ts).
// All network access goes through fetchJSON (timeouts). Nothing here invents a value when the backend is unreachable.
import { ENDPOINTS } from '@/constants/endpoints';
import { fetchJSON } from '@/lib/holdingsStore';
import { loadWithCache, type Loaded } from '@/lib/marketDataStorage';
import { normaliseSectorIndices, pointsOf, type SectorIndex } from '@/lib/marketDataMap';
import type { PricePoint } from '@/lib/portfolioHistory';
import {
  normaliseQuote, normaliseQuotes, normaliseFundamentals, normaliseNews, normaliseCommodities, normaliseFx, normaliseCrypto,
  normaliseChart, normaliseFundNav, normaliseFundSearch, normaliseFundHistory, normaliseOverview, batches,
  type Quote, type Fundamentals, type NewsFeed, type Chart, type FundNav, type FundHistory, type Coin, type FxRate, type Commodity, type CommodityUnavailable, type IndexRow,
} from '@/lib/marketData';

const base = () => ENDPOINTS.aryaAI;
const get = (path: string, ms = 15_000) => fetchJSON(`${base()}${path}`, ms);

export const loadQuote = (symbol: string): Promise<Loaded<Quote>> =>
  loadWithCache({ key: `quote:${symbol}`, fetcher: () => get(`/api/quote/${encodeURIComponent(symbol)}`), normalise: normaliseQuote });

export const loadFundamentals = (symbol: string): Promise<Loaded<Fundamentals>> =>
  loadWithCache({ key: `fundamentals:${symbol}`, fetcher: () => get(`/api/fundamentals/${encodeURIComponent(symbol)}`, 25_000), normalise: normaliseFundamentals });

export const loadChart = (symbol: string, range: string): Promise<Loaded<Chart>> =>
  loadWithCache({
    key: `chart:${symbol}:${range}`,
    fetcher: () => get(`/api/chart?symbol=${encodeURIComponent(symbol + '.NS')}&interval=1d&range=${range}`, 25_000),
    normalise: normaliseChart,
  });

export const loadNews = (limit = 40): Promise<Loaded<NewsFeed>> =>
  loadWithCache({ key: 'news', fetcher: () => get(`/api/news?limit=${limit}`, 25_000), normalise: normaliseNews, usable: f => f.articles.length > 0 });

export const loadCommodities = (): Promise<Loaded<{ items: Commodity[]; unavailable: CommodityUnavailable[]; asOf: number | null }>> =>
  loadWithCache({ key: 'commodities', fetcher: () => get('/api/commodities', 30_000), normalise: normaliseCommodities, usable: v => v.items.length + v.unavailable.length > 0 });

export const loadFx = (): Promise<Loaded<{ rates: FxRate[]; error: string | null }>> =>
  loadWithCache({ key: 'fx', fetcher: () => get('/api/fx', 30_000), normalise: normaliseFx, usable: v => v.rates.length > 0 });

export const loadCrypto = (): Promise<Loaded<{ coins: Coin[]; error: string | null; asOf: number | null }>> =>
  loadWithCache({ key: 'crypto', fetcher: () => get('/api/crypto', 20_000), normalise: normaliseCrypto, usable: v => v.coins.length > 0 });

export const loadOverview = (): Promise<Loaded<{ indices: Record<string, IndexRow>; asOf: number | null }>> =>
  loadWithCache({ key: 'overview', fetcher: () => get('/api/market/overview', 15_000), normalise: normaliseOverview, usable: v => Object.keys(v.indices).length > 0 });

export const loadFund = (code: string): Promise<Loaded<FundNav>> =>
  loadWithCache({ key: `fund:${code}`, fetcher: () => get(`/api/mf/nav/${encodeURIComponent(code)}`, 25_000), normalise: normaliseFundNav });

export const loadFundHistory = (code: string): Promise<Loaded<FundHistory>> =>
  loadWithCache({ key: `fundhistory:${code}`, fetcher: () => get(`/api/mf/history/${encodeURIComponent(code)}?years=6`, 30_000), normalise: normaliseFundHistory });

/** Fund search is not cached: a search that cannot run says so. */
export async function searchFundsLive(query: string, limit = 30): Promise<FundNav[]> {
  return normaliseFundSearch(await get(`/api/mf/search?q=${encodeURIComponent(query.trim())}&limit=${limit}`, 25_000));
}

/** Bulk quotes in batches of 10, fetched together; the answer is cached per symbol list so the screener works offline. */
export function loadQuotesBatched(symbols: string[], key: string): Promise<Loaded<{ quotes: Quote[]; failed: string[] }>> {
  return loadWithCache({
    key: `quotes:${key}`,
    fetcher: async () => {
      const parts = await Promise.allSettled(batches(symbols, 10).map(b => get(`/api/quotes?symbols=${encodeURIComponent(b.join(','))}`, 40_000)));
      const ok = parts.filter((p): p is PromiseFulfilledResult<any> => p.status === 'fulfilled');
      if (!ok.length) throw new Error('network');
      return { quotes: ok.flatMap(p => (Array.isArray(p.value?.quotes) ? p.value.quotes : [])) };
    },
    normalise: raw => { const r = normaliseQuotes(raw, symbols); return { quotes: r.quotes, failed: r.failed }; },
    usable: v => v.quotes.length > 0,
  });
}

// ── additions for the detail, map, screener and portfolio screens ───────────────────────────────────────────────────────

/** Daily or weekly closes for any Yahoo symbol the backend's /api/chart accepts (BTC-USD, GC=F, USDINR=X, ^NSEI, RELIANCE.NS). */
export const loadYahooChart = (yahoo: string, range: string, interval = '1d'): Promise<Loaded<Chart>> =>
  loadWithCache({
    key: `ychart:${yahoo}:${range}:${interval}`,
    fetcher: () => get(`/api/chart?symbol=${encodeURIComponent(yahoo)}&interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}`, 25_000),
    normalise: normaliseChart,
  });

/** Just the dated closes (a slimmer thing to keep on the phone than a full chart): for the portfolio's one-year history. */
export const loadPriceSeries = (yahoo: string, range = '1y'): Promise<Loaded<PricePoint[]>> =>
  loadWithCache({
    key: `series:${yahoo}:${range}`,
    fetcher: () => get(`/api/chart?symbol=${encodeURIComponent(yahoo)}&interval=1d&range=${encodeURIComponent(range)}`, 25_000),
    normalise: raw => { const c = normaliseChart(raw); return c ? pointsOf(c.dates, c.closes) : null; },
    usable: v => v.length >= 2,
  });

/** A mutual fund's NAV history for about the last two years, as dated points (the fund screen asks for six). */
export const loadFundSeries = (code: string): Promise<Loaded<PricePoint[]>> =>
  loadWithCache({
    key: `fundseries:${code}`,
    fetcher: () => get(`/api/mf/history/${encodeURIComponent(code)}?years=2`, 30_000),
    normalise: raw => { const h = normaliseFundHistory(raw); return h ? h.points.map(p => ({ date: p.date, close: p.nav })) : null; },
    usable: v => v.length >= 2,
  });

export const loadSectorIndices = (): Promise<Loaded<{ sectors: SectorIndex[]; asOf: number | null }>> =>
  loadWithCache({ key: 'sectorindices', fetcher: () => get('/api/market/sectors', 30_000), normalise: normaliseSectorIndices, usable: v => v.sectors.length > 0 });

/**
 * Fundamentals for many symbols, a few at a time (the backend asks Yahoo once per symbol and remembers it for six hours).
 * Each symbol is cached on its own, so a second visit is quick and a failed one can be retried alone. `onProgress` is called after each.
 */
export async function loadFundamentalsMany(
  symbols: string[], opts: { concurrency?: number; onProgress?: (done: number, total: number, symbol: string, r: Loaded<Fundamentals>) => void } = {},
): Promise<Record<string, Loaded<Fundamentals>>> {
  const out: Record<string, Loaded<Fundamentals>> = {};
  const queue = [...new Set(symbols)];
  let done = 0;
  const worker = async () => {
    for (;;) {
      const s = queue.shift();
      if (s === undefined) return;
      let r: Loaded<Fundamentals>;
      try { r = await loadFundamentals(s); } catch { r = { data: null, savedAt: null, fromCache: false, error: 'Could not load.' }; }
      out[s] = r; done++;
      opts.onProgress?.(done, symbols.length, s, r);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(opts.concurrency ?? 4, 8)) }, worker));
  return out;
}
