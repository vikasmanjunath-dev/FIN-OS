import { useState, useEffect, useCallback } from 'react';
import { ENDPOINTS } from '@/constants/endpoints';
import { normaliseOverview, type IndexRow } from '@/lib/marketData';
import { readCached, writeCached } from '@/lib/marketDataStorage';

export interface IndexQuote {
  symbol: string;
  name: string;
  price: number;
  /** null when the backend did not send a change (never shown as 0) */
  change: number | null;
  changePct: number | null;
  pe: number | null;
  pb: number | null;
  yearHigh: number | null;
  yearLow: number | null;
}

export interface MarketData {
  nifty50:  IndexQuote | null;
  sensex:   IndexQuote | null;
  niftyIT:  IndexQuote | null;
  niftyBank:IndexQuote | null;
  lastUpdated: Date | null;
  /** true when the figures are the last saved answer, not a fresh one */
  stale: boolean;
  error: string | null;
}

// No made-up prices: when the backend can't be reached the screens show the last saved answer with its time, or "offline".
const FALLBACK: MarketData = {
  nifty50: null, sensex: null, niftyIT: null, niftyBank: null,
  lastUpdated: null, stale: false,
  error: "Market data unavailable — can't reach the Arya backend. Start it with arya-ai/start.sh, or set its address in Settings.",
};

const CACHE_KEY = 'overview';

function toData(indices: Record<string, IndexRow>, at: number, stale: boolean, error: string | null): MarketData {
  const q = (key: string, symbol: string): IndexQuote | null => {
    const r = indices[key];
    return r ? { symbol, name: key, price: r.price, change: r.change, changePct: r.changePct, pe: r.pe, pb: r.pb, yearHigh: r.yearHigh, yearLow: r.yearLow } : null;
  };
  return {
    nifty50: q('NIFTY 50', '^NSEI'), sensex: q('SENSEX', '^BSESN'), niftyIT: q('NIFTY IT', '^CNXIT'), niftyBank: q('NIFTY BANK', '^NSEBANK'),
    lastUpdated: new Date(at), stale, error,
  };
}

export function useMarketData(refreshIntervalMs = 30_000) {
  const [data, setData]       = useState<MarketData>(FALLBACK);
  const [loading, setLoading] = useState(true);

  const fetch_ = useCallback(async () => {
    try {
      const res = await Promise.race([
        fetch(`${ENDPOINTS.aryaAI}/api/market/overview`),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
      ]) as Response;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = normaliseOverview(await res.json());
      if (!Object.keys(parsed.indices).length) throw new Error('empty');
      const now = Date.now();
      await writeCached(CACHE_KEY, parsed.indices, now);
      setData(toData(parsed.indices, now, false, null));
    } catch {
      // keep what is on screen; if nothing is, fall back to the last saved answer (marked stale) before saying "offline"
      const saved = await readCached<Record<string, IndexRow>>(CACHE_KEY);
      setData(prev => {
        if (prev.lastUpdated && !prev.stale) return { ...prev, stale: true, error: 'Could not refresh. Showing the last answer.' };
        if (prev.lastUpdated) return prev;
        return saved ? toData(saved.data, saved.savedAt, true, 'Offline. Showing the last saved answer.') : FALLBACK;
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch_();
    const id = setInterval(fetch_, refreshIntervalMs);
    return () => clearInterval(id);
  }, [fetch_, refreshIntervalMs]);

  return { data, loading, refresh: fetch_ };
}
