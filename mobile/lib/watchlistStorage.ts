import AsyncStorage from '@react-native-async-storage/async-storage';
import { ENDPOINTS } from '@/constants/endpoints';
import { fetchJSON } from '@/lib/holdingsStore';
import { WATCH_KEY, applyPrices, normalise, type WatchItem } from '@/lib/watchlist';

export async function loadWatchlist(): Promise<WatchItem[]> {
  try { return normalise(JSON.parse((await AsyncStorage.getItem(WATCH_KEY)) ?? '[]')); } catch { return []; }
}
export const saveWatchlist = (items: WatchItem[]) => AsyncStorage.setItem(WATCH_KEY, JSON.stringify(items));

/** Fresh prices for the whole list; an item whose price could not be fetched keeps its last one. Returns the updated list and how many came back. */
export async function refreshWatchlist(items: WatchItem[], today: string): Promise<{ items: WatchItem[]; updated: number }> {
  const prices: Record<string, number> = {};
  const stocks = items.filter(i => i.type === 'Stock').map(i => i.symbol);
  const jobs: Promise<void>[] = [];
  if (stocks.length) jobs.push(fetchJSON(`${ENDPOINTS.aryaAI}/api/quotes?symbols=${stocks.join(',')}`, 20_000).then(j => { for (const q of j.quotes ?? []) if (q?.price != null) prices[`Stock:${String(q.symbol).toUpperCase()}`] = Number(q.price); }));
  items.filter(i => i.type === 'MF').forEach(i => jobs.push(fetchJSON(`${ENDPOINTS.aryaAI}/api/mf/nav/${i.symbol}`, 20_000).then(j => { if (j?.nav != null) prices[i.id] = Number(j.nav); })));
  await Promise.allSettled(jobs);
  const next = applyPrices(items, prices, today);
  return { items: next, updated: Object.keys(prices).length };
}
