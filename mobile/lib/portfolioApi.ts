// Fetches the price history the portfolio analytics need, one holding at a time, each with the last-good-answer cache.
// A holding whose history cannot be fetched comes back with no points (and is listed as excluded by the maths), never with made-up prices.
import { loadPriceSeries, loadFundSeries } from '@/lib/marketDataApi';
import type { HoldingView } from '@/lib/holdings';
import { holdingKey } from '@/lib/holdings';
import { cleanTicker, yahooSymbol } from '@/lib/marketData';
import type { HoldingSeries, PricePoint } from '@/lib/portfolioHistory';

export interface HistoryLoad {
  series: HoldingSeries[];
  bench: PricePoint[] | null;
  benchError: string | null;
  /** oldest time any of the answers was fetched (ms), or null if nothing was fetched */
  oldestAt: number | null;
  /** true if any answer is a saved copy because the backend could not be reached */
  anyFromCache: boolean;
  failed: number;
}

export const BENCH_SYMBOL = '^NSEI';

export async function loadPortfolioHistory(views: HoldingView[], onProgress?: (done: number, total: number) => void): Promise<HistoryLoad> {
  const jobs: { key: string; label: string; value: number; run: () => ReturnType<typeof loadPriceSeries> }[] = [];
  for (const v of views) {
    if (!(v.current > 0)) continue;
    const base = { key: holdingKey(v), label: v.type === 'Stock' ? v.symbol : v.name, value: v.current };
    if (v.type === 'Stock') {
      const t = cleanTicker(v.symbol);
      jobs.push({ ...base, run: () => (t ? loadPriceSeries(yahooSymbol(t)) : Promise.resolve({ data: null, savedAt: null, fromCache: false, error: 'Not an NSE ticker' })) });
    } else jobs.push({ ...base, run: () => loadFundSeries(v.symbol) });
  }
  const total = jobs.length + 1;
  let done = 0;
  const out: HoldingSeries[] = [];
  let oldest: number | null = null, anyCache = false, failed = 0;
  const note = (savedAt: number | null, fromCache: boolean) => {
    if (savedAt !== null) oldest = oldest === null ? savedAt : Math.min(oldest, savedAt);
    if (fromCache) anyCache = true;
  };
  const queue = [...jobs];
  const worker = async () => {
    for (;;) {
      const j = queue.shift();
      if (!j) return;
      let pts: PricePoint[] = [];
      try { const r = await j.run(); if (r.data) pts = r.data; else failed++; note(r.savedAt, r.fromCache); } catch { failed++; }
      out.push({ key: j.key, label: j.label, value: j.value, points: pts });
      onProgress?.(++done, total);
    }
  };
  const benchP = (async () => {
    try { const r = await loadPriceSeries(BENCH_SYMBOL); note(r.savedAt, r.fromCache); return r; } catch { return null; }
  })();
  await Promise.all([...Array.from({ length: 4 }, worker), benchP]);
  onProgress?.(total, total);
  const b = await benchP;
  return {
    series: out, bench: b?.data ?? null, benchError: b?.data ? null : b?.error ?? 'Could not load the Nifty 50 history.',
    oldestAt: oldest, anyFromCache: anyCache, failed,
  };
}
