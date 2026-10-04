import { useEffect, useSyncExternalStore } from 'react';
import { ENDPOINTS } from '@/constants/endpoints';
import * as store from '@/lib/holdingsStore';

export type { Holding, HoldingView, HoldingType, NewHolding } from '@/lib/holdings';
export { toView } from '@/lib/holdings';

/** Live price for a stock ticker. Throws if the symbol is unknown. */
export async function lookupStock(symbol: string): Promise<{ symbol: string; name: string; price: number }> {
  const sym = symbol.trim().toUpperCase();
  const q = await store.fetchJSON(`${ENDPOINTS.aryaAI}/api/quote/${encodeURIComponent(sym)}`);
  if (!q || q.error || q.price == null) throw new Error(q?.error || `No quote for ${sym}`);
  return { symbol: sym, name: q.name || sym, price: q.price };  // callers round for display
}

export interface FundResult {
  scheme_code: string;
  scheme_name: string;
  nav: number | null;
  date: string;
  fund_house: string;
  plan: string;
  option: string;
}

export async function searchFunds(query: string): Promise<FundResult[]> {
  const j = await store.fetchJSON(`${ENDPOINTS.aryaAI}/api/mf/search?q=${encodeURIComponent(query.trim())}&limit=40`, 20_000);
  return j.results ?? [];
}

/** Shared holdings state (local + cloud sync). Same instance for every screen. */
export function useHoldings() {
  const s = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  useEffect(() => { store.init(); }, []);
  return {
    ...s,
    addHolding: store.addHolding,
    removeHolding: store.removeHolding,
    refreshPrices: store.refreshPrices,
    syncNow: () => store.syncHoldings({ force: true }),
  };
}
