// The market endpoints of the Arya backend, each as "fetch -> normalise -> last good answer" (see marketDataStorage.ts).
// All network access goes through fetchJSON (timeouts). Nothing here invents a value when the backend is unreachable.
import { ENDPOINTS } from '@/constants/endpoints';
import { fetchJSON } from '@/lib/holdingsStore';
import { loadWithCache, type Loaded } from '@/lib/marketDataStorage';
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
