// Gold holdings on the device: the website's keys and shape (finos_gold_portfolio, finos_gold_price_per_g, finos_gold_value).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GOLD_KEYS, summarize, type Holding } from '@/lib/gold';

let chain: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

const VALID = (h: any): h is Holding => h && typeof h === 'object' && typeof h.id === 'string' && ['physical', 'sgb', 'etf', 'goldmf'].includes(h.type);

export async function loadGold(): Promise<{ holdings: Holding[]; price: number }> {
  const [[, p], [, pr]] = await AsyncStorage.multiGet([GOLD_KEYS.portfolio, GOLD_KEYS.price]);
  let holdings: Holding[] = [];
  try { const l = JSON.parse(p ?? '[]'); holdings = Array.isArray(l) ? l.filter(VALID) : []; } catch { /* corrupt: start empty */ }
  const price = parseFloat(String(pr ?? '').replace(/^"|"$/g, ''));
  return { holdings, price: Number.isFinite(price) && price > 0 ? price : 0 };
}

async function write(holdings: Holding[], price: number) {
  await AsyncStorage.multiSet([[GOLD_KEYS.portfolio, JSON.stringify(holdings)], [GOLD_KEYS.value, String(summarize(holdings, price).total)]]);
}

export const addHolding = (h: Holding) => exclusive(async () => { const { holdings, price } = await loadGold(); const next = [...holdings, h]; await write(next, price); return next; });
export const removeHolding = (id: string) => exclusive(async () => { const { holdings, price } = await loadGold(); const next = holdings.filter(x => x.id !== id); await write(next, price); return next; });
/** A price of 0 or less is ignored, like the website (it cannot be cleared by typing 0). */
export const setPrice = (price: number) => exclusive(async () => {
  if (!(price > 0)) return;
  const { holdings } = await loadGold();
  await AsyncStorage.setItem(GOLD_KEYS.price, String(price));
  await write(holdings, price);
});
