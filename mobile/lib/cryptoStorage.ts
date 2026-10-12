// Crypto holdings on the device: the website's keys and shape (finos_crypto_portfolio, finos_crypto_prices, finos_crypto_value).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CRYPTO_KEYS, storedTotal, type CryptoHolding, type Prices } from '@/lib/crypto';

let chain: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}
const VALID = (h: any): h is CryptoHolding => h && typeof h === 'object' && typeof h.id === 'string' && typeof h.symbol === 'string';

export async function loadCrypto(): Promise<{ holdings: CryptoHolding[]; prices: Prices }> {
  const got = Object.fromEntries(await AsyncStorage.multiGet([CRYPTO_KEYS.portfolio, CRYPTO_KEYS.prices]));
  let holdings: CryptoHolding[] = [];
  let prices: Prices = {};
  try { const l = JSON.parse(got[CRYPTO_KEYS.portfolio] ?? '[]'); holdings = Array.isArray(l) ? l.filter(VALID) : []; } catch { /* corrupt: empty */ }
  try {
    const p = JSON.parse(got[CRYPTO_KEYS.prices] ?? '{}');
    if (p && typeof p === 'object' && !Array.isArray(p)) Object.keys(p).forEach(k => { const n = Number(p[k]); if (n > 0) prices[k] = n; });
  } catch { /* corrupt: none */ }
  return { holdings, prices };
}

async function write(holdings: CryptoHolding[], prices: Prices) {
  await AsyncStorage.multiSet([
    [CRYPTO_KEYS.portfolio, JSON.stringify(holdings)], [CRYPTO_KEYS.prices, JSON.stringify(prices)], [CRYPTO_KEYS.value, String(storedTotal(holdings, prices))],
  ]);
}

export const addHolding = (h: CryptoHolding, price?: number) => exclusive(async () => {
  const { holdings, prices } = await loadCrypto();
  const next = [...holdings, h];
  const p = price && price > 0 ? { ...prices, [h.symbol]: price } : prices;
  await write(next, p);
  return { holdings: next, prices: p };
});
export const removeHolding = (id: string) => exclusive(async () => {
  const { holdings, prices } = await loadCrypto();
  const next = holdings.filter(h => h.id !== id);
  await write(next, prices);
  return { holdings: next, prices };
});
/** A price of 0 or less is ignored, like the website. */
export const setPrice = (symbol: string, price: number) => exclusive(async () => {
  const { holdings, prices } = await loadCrypto();
  if (!(price > 0)) return { holdings, prices };
  const p = { ...prices, [symbol]: price };
  await write(holdings, p);
  return { holdings, prices: p };
});
