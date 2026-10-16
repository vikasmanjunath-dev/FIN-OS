// Crypto holdings on the device: the website's keys and shape (finos_crypto_portfolio, finos_crypto_prices, finos_crypto_value).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CRYPTO_KEYS, storedTotal, type CryptoHolding, type Prices } from '@/lib/crypto';
import { asList, asRecord, isPlainObject, scalarsOnly, text, finite, keepIfUnreadable } from '@/lib/safeStore';

let chain: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}
/** A stored coin made safe to compute with: id and symbol are text, quantity and cost are finite numbers (never NaN into the total). */
function clean(h: unknown): CryptoHolding | null {
  if (!isPlainObject(h) || typeof h.id !== 'string' || typeof h.symbol !== 'string') return null;
  const out: Record<string, unknown> = { ...scalarsOnly(h), id: h.id, symbol: h.symbol, name: text(h.name, h.symbol), quantity: Math.max(0, finite(h.quantity)), avgBuyPrice: Math.max(0, finite(h.avgBuyPrice)) };
  if ('currentPrice' in out) { const p = finite(h.currentPrice, NaN); if (p > 0) out.currentPrice = p; else delete out.currentPrice; }
  return out as unknown as CryptoHolding;
}

/** Strict read: throws only when storage itself fails, so a write never follows a read that did not happen. */
async function readStrict(): Promise<{ holdings: CryptoHolding[]; prices: Prices }> {
  const got = Object.fromEntries(await AsyncStorage.multiGet([CRYPTO_KEYS.portfolio, CRYPTO_KEYS.prices]));
  const holdings = asList(got[CRYPTO_KEYS.portfolio]).map(clean).filter((h): h is CryptoHolding => h !== null);
  const prices: Prices = {};
  const p = asRecord(got[CRYPTO_KEYS.prices]);
  if (p) Object.keys(p).forEach(k => { const n = finite(p[k], NaN); if (n > 0 && k !== '__proto__') prices[k] = n; });
  return { holdings, prices };
}

export async function loadCrypto(): Promise<{ holdings: CryptoHolding[]; prices: Prices }> {
  try { return await readStrict(); } catch { return { holdings: [], prices: {} }; }
}

async function write(holdings: CryptoHolding[], prices: Prices) {
  await keepIfUnreadable(CRYPTO_KEYS.portfolio, 'array');
  await keepIfUnreadable(CRYPTO_KEYS.prices, 'object');
  await AsyncStorage.multiSet([
    [CRYPTO_KEYS.portfolio, JSON.stringify(holdings)], [CRYPTO_KEYS.prices, JSON.stringify(prices)], [CRYPTO_KEYS.value, String(storedTotal(holdings, prices))],
  ]);
}

export const addHolding = (h: CryptoHolding, price?: number) => exclusive(async () => {
  const { holdings, prices } = await readStrict();
  const next = [...holdings, h];
  const p = price && price > 0 ? { ...prices, [h.symbol]: price } : prices;
  await write(next, p);
  return { holdings: next, prices: p };
});
export const removeHolding = (id: string) => exclusive(async () => {
  const { holdings, prices } = await readStrict();
  const next = holdings.filter(h => h.id !== id);
  await write(next, prices);
  return { holdings: next, prices };
});
/** A price of 0 or less is ignored, like the website. */
export const setPrice = (symbol: string, price: number) => exclusive(async () => {
  const { holdings, prices } = await readStrict();
  if (!(price > 0)) return { holdings, prices };
  const p = { ...prices, [symbol]: price };
  await write(holdings, p);
  return { holdings, prices: p };
});
