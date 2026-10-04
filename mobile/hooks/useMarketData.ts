import { useState, useEffect, useCallback } from 'react';
import { ENDPOINTS } from '@/constants/endpoints';

export interface IndexQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
}

export interface MarketData {
  nifty50:  IndexQuote | null;
  sensex:   IndexQuote | null;
  niftyIT:  IndexQuote | null;
  niftyBank:IndexQuote | null;
  lastUpdated: Date | null;
  error: string | null;
}

const FALLBACK: MarketData = {
  nifty50:   { symbol: '^NSEI',  name: 'NIFTY 50',    price: 24850.50, change: 112.30,  changePct: 0.45 },
  sensex:    { symbol: '^BSESN', name: 'SENSEX',       price: 81420.80, change: 380.50,  changePct: 0.47 },
  niftyIT:   { symbol: '^CNXIT', name: 'NIFTY IT',     price: 38200.00, change: -145.20, changePct: -0.38 },
  niftyBank: { symbol: '^NSEBANK', name: 'NIFTY BANK', price: 52800.00, change: 320.10,  changePct: 0.61 },
  lastUpdated: null,
  error: 'Using demo data — backend not reachable',
};

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
      const json = (await res.json()).indices ?? {};

      const toQuote = (key: string, symbol: string, name: string): IndexQuote | null => {
        const q = json[key];
        if (!q || q.price == null) return null;
        return { symbol, name, price: q.price, change: q.change ?? 0, changePct: q.change_pct ?? 0 };
      };

      setData({
        nifty50:   toQuote('NIFTY 50', '^NSEI', 'NIFTY 50'),
        sensex:    toQuote('SENSEX', '^BSESN', 'SENSEX'),
        niftyIT:   toQuote('NIFTY IT', '^CNXIT', 'NIFTY IT'),
        niftyBank: toQuote('NIFTY BANK', '^NSEBANK', 'NIFTY BANK'),
        lastUpdated: new Date(),
        error: null,
      });
    } catch {
      // keep stale data / fallback; don't surface error if data already loaded
      setData(prev => ({ ...prev, error: prev.lastUpdated ? null : FALLBACK.error }));
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
