// Crypto tracker maths with India's tax rules. A typed port of summarize() in js/finos-crypto-tracker.js;
// __tests__/crypto.parity.test.mts compares them. The rules that matter:
//  - A coin with no price is not valued at zero (that would read as a 100% loss): it is left out and listed.
//  - Tax is 30% + 4% cess = 31.2% on each coin's GAIN only. A loss in one coin never reduces the tax on another, and is not carried forward.
//  - TDS is the 1% an exchange would deduct if the holding were sold, so it is a "what if", not something already paid.

export const CRYPTO_KEYS = { portfolio: 'finos_crypto_portfolio', prices: 'finos_crypto_prices', value: 'finos_crypto_value' } as const;
export const TAX_RATE = 0.30 * 1.04;
export const TDS_THRESHOLD = 50_000;

export const COINS = [
  { symbol: 'BTC', name: 'Bitcoin' }, { symbol: 'ETH', name: 'Ethereum' }, { symbol: 'USDT', name: 'Tether' }, { symbol: 'BNB', name: 'BNB' },
  { symbol: 'SOL', name: 'Solana' }, { symbol: 'XRP', name: 'XRP' }, { symbol: 'ADA', name: 'Cardano' }, { symbol: 'DOGE', name: 'Dogecoin' },
  { symbol: 'MATIC', name: 'Polygon' }, { symbol: 'DOT', name: 'Polkadot' }, { symbol: 'AVAX', name: 'Avalanche' }, { symbol: 'SHIB', name: 'Shiba Inu' },
  { symbol: 'LTC', name: 'Litecoin' }, { symbol: 'TRX', name: 'TRON' }, { symbol: 'LINK', name: 'Chainlink' },
];

export interface CryptoHolding { id: string; symbol: string; name?: string; quantity: number; avgBuyPrice: number; currentPrice?: number }
export type Prices = Record<string, number>;
export interface Row extends CryptoHolding { px: number; cost: number; val: number; gain: number; gainPct: number; tax: number; tds: number; priced: boolean }
export interface CryptoSummary { rows: Row[]; unpriced: string[]; totalCost: number; pricedCost: number; totalValue: number; totalGain: number; tax: number; tds: number; pnlPct: number }

export function summarize(holdings: CryptoHolding[], prices: Prices = {}): CryptoSummary {
  let pricedCost = 0, totalValue = 0, totalGain = 0, tax = 0, tds = 0;
  const unpriced: string[] = [];
  const rows: Row[] = (holdings || []).map(h => {
    const px = prices[h.symbol] ?? h.currentPrice ?? 0;
    const cost = (h.quantity || 0) * (h.avgBuyPrice || 0);
    if (!(px > 0)) { unpriced.push(h.symbol); return { ...h, px: 0, cost, val: 0, gain: 0, gainPct: 0, tax: 0, tds: 0, priced: false }; }
    const val = Math.round((h.quantity || 0) * px);
    const gain = val - cost;
    const rowTax = gain > 0 ? Math.round(gain * TAX_RATE) : 0;
    const rowTds = val >= TDS_THRESHOLD ? Math.round(val * 0.01) : 0;
    pricedCost += cost; totalValue += val; totalGain += gain; tax += rowTax; tds += rowTds;
    return { ...h, px, cost, val, gain, gainPct: cost > 0 ? (gain / cost) * 100 : 0, tax: rowTax, tds: rowTds, priced: true };
  });
  return { rows, unpriced, totalCost: rows.reduce((t, r) => t + r.cost, 0), pricedCost, totalValue, totalGain, tax, tds, pnlPct: pricedCost > 0 ? ((totalValue - pricedCost) / pricedCost) * 100 : 0 };
}

/** The stored total: quantity x price for the coins that have a price (the website's _recompute). */
export function storedTotal(holdings: CryptoHolding[], prices: Prices): number {
  let t = 0;
  holdings.forEach(h => { const px = prices?.[h.symbol] ?? h.currentPrice ?? 0; t += (h.quantity || 0) * px; });
  return Math.round(t);
}

export function buildHolding(f: { symbol: string; quantity: number; avgBuyPrice: number }, id: string): { ok: true; holding: CryptoHolding } | { ok: false; error: string } {
  const symbol = f.symbol.trim().toUpperCase();
  if (!symbol) return { ok: false, error: 'Choose or type a coin.' };
  if (!/^[A-Z0-9]{1,12}$/.test(symbol)) return { ok: false, error: 'A coin symbol is letters and digits only, up to 12 characters.' };
  if (!(f.quantity > 0)) return { ok: false, error: 'Enter the quantity.' };
  if (!(f.avgBuyPrice > 0)) return { ok: false, error: 'Enter your average buy price.' };
  const info = COINS.find(c => c.symbol === symbol);
  return { ok: true, holding: { id, symbol, name: info?.name || symbol, quantity: f.quantity, avgBuyPrice: f.avgBuyPrice } };
}
