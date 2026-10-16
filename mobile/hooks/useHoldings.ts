import { useEffect, useSyncExternalStore } from 'react';
import { ENDPOINTS } from '@/constants/endpoints';
import * as store from '@/lib/holdingsStore';

export type { Holding, HoldingView, HoldingType, NewHolding } from '@/lib/holdings';
export { toView } from '@/lib/holdings';

/** Live price for a stock ticker. Throws if the symbol is unknown. */
export async function lookupStock(symbol: string): Promise<{ symbol: string; name: string; price: number }> {
  const sym = symbol.trim().toUpperCase();
  const q = await store.fetchJSON(`${ENDPOINTS.aryaAI}/api/quote/${encodeURIComponent(sym)}`);
  const price = typeof q?.price === 'boolean' ? NaN : Number(q?.price);
  if (!q || typeof q !== 'object' || q.error || q.price == null || !Number.isFinite(price) || price <= 0) throw new Error((typeof q?.error === 'string' && q.error) || `No quote for ${sym}`);
  return { symbol: sym, name: typeof q.name === 'string' && q.name ? q.name.slice(0, 120) : sym, price };  // callers round for display
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
  // only rows that are objects with a scheme code; text fields as text; NAV a positive number or null (never a string that prints as NaN)
  const rows: unknown[] = Array.isArray(j?.results) ? j.results : [];
  const s = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
  return rows.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object' && !Array.isArray(r) && s((r as any).scheme_code) !== '').map(r => {
    const nav = typeof r.nav === 'boolean' ? NaN : Number(r.nav);
    return { scheme_code: s(r.scheme_code), scheme_name: s(r.scheme_name), nav: r.nav != null && Number.isFinite(nav) && nav > 0 ? nav : null,
      date: s(r.date), fund_house: s(r.fund_house), plan: s(r.plan), option: s(r.option) };
  });
}

/** Shared holdings state (local + cloud sync). Same instance for every screen. */
export function useHoldings() {
  const s = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  useEffect(() => { store.init(); }, []);
  return {
    ...s,
    addHolding: store.addHolding,
    removeHolding: store.removeHolding,
    importHoldings: store.importHoldings,
    refreshPrices: store.refreshPrices,
    syncNow: () => store.syncHoldings({ force: true }),
  };
}
