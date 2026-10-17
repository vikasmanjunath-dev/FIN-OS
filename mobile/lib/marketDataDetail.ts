// Detail screens for crypto, commodities and currencies: which Yahoo Finance symbol the backend's /api/chart should be asked for,
// and a summary of a price history computed from the closes the backend returns. Pure.
//
// The chart is in the units Yahoo quotes (US dollars for coins and commodity futures, rupees per foreign unit for currencies),
// which are not always the units of the list screens (rupees for coins, gold per 10 g). The screens say so.
import { std, simpleReturns, drawdown } from '@/lib/portfolioStats';
import type { Chart } from '@/lib/marketData';

export type DetailKind = 'crypto' | 'commodity' | 'fx';

export interface DetailAsset {
  kind: DetailKind;
  /** the id used in the route: a CoinGecko id, a commodity slug or a currency pair */
  id: string;
  label: string;
  /** Yahoo symbol for /api/chart, or null when this source has no history for it */
  yahoo: string | null;
  /** unit of the chart, e.g. "US dollars per coin" */
  chartUnit: string;
  /** symbol shown in front of chart prices */
  chartPrefix: string;
  /** closes per year, to annualise the day-to-day moves (crypto trades every day) */
  periodsPerYear: number;
  /** why there is no chart, when yahoo is null */
  noChartReason?: string;
}

// ── crypto ───────────────────────────────────────────────────────────────────

/** CoinGecko ids the backend lists by default -> Yahoo symbols. Polygon (matic-network) was renamed and Yahoo returned no data for MATIC-USD or POL-USD when checked. */
const CRYPTO: Record<string, { yahoo: string | null; label: string }> = {
  bitcoin: { yahoo: 'BTC-USD', label: 'Bitcoin' },
  ethereum: { yahoo: 'ETH-USD', label: 'Ethereum' },
  ripple: { yahoo: 'XRP-USD', label: 'XRP' },
  dogecoin: { yahoo: 'DOGE-USD', label: 'Dogecoin' },
  'matic-network': { yahoo: null, label: 'Polygon' },
};
export const cleanCoinId = (raw: string): string | null => (/^[a-z0-9][a-z0-9-]{0,39}$/.test((raw ?? '').trim()) ? raw.trim() : null);

export function cryptoAsset(id: string, nameFromList?: string | null): DetailAsset | null {
  const cid = cleanCoinId(id);
  if (!cid) return null;
  const known = CRYPTO[cid];
  return {
    kind: 'crypto', id: cid, label: nameFromList || known?.label || cid, yahoo: known?.yahoo ?? null,
    chartUnit: 'US dollars per coin', chartPrefix: '$', periodsPerYear: 365,
    noChartReason: known?.yahoo ? undefined : 'The price-history source has no data for this coin, so only today\'s price is shown.',
  };
}

// ── commodities ──────────────────────────────────────────────────────────────

const COMMODITY: Record<string, { yahoo: string; label: string; unit: string; prefix: string }> = {
  gold: { yahoo: 'GC=F', label: 'Gold', unit: 'US dollars per troy ounce (COMEX gold futures)', prefix: '$' },
  silver: { yahoo: 'SI=F', label: 'Silver', unit: 'US dollars per troy ounce (COMEX silver futures)', prefix: '$' },
  crude: { yahoo: 'CL=F', label: 'Crude oil', unit: 'US dollars per barrel (NYMEX WTI futures)', prefix: '$' },
  natgas: { yahoo: 'NG=F', label: 'Natural gas', unit: 'US dollars per MMBtu (NYMEX futures)', prefix: '$' },
};
export const COMMODITY_SLUGS = Object.keys(COMMODITY);

/** The backend's commodity key ("GOLD (10g, global equiv.)", "CRUDE OIL (bbl)") -> route slug, or null. */
export function commoditySlug(backendKey: string): string | null {
  const k = (backendKey ?? '').toUpperCase();
  if (k.includes('GOLD')) return 'gold';
  if (k.includes('SILVER')) return 'silver';
  if (k.includes('CRUDE')) return 'crude';
  if (k.includes('NATURAL') || k.includes('GAS')) return 'natgas';
  return null;
}
export function commodityAsset(slug: string): DetailAsset | null {
  const c = COMMODITY[(slug ?? '').trim()];
  if (!c) return null;
  return { kind: 'commodity', id: slug.trim(), label: c.label, yahoo: c.yahoo, chartUnit: c.unit, chartPrefix: c.prefix, periodsPerYear: 252 };
}

// ── currencies ───────────────────────────────────────────────────────────────

const FX_NAMES: Record<string, string> = { USD: 'US dollar', EUR: 'Euro', GBP: 'British pound', JPY: 'Japanese yen', AED: 'UAE dirham' };
export const FX_PAIRS = Object.keys(FX_NAMES).map(c => `${c}_INR`);
export function fxAsset(pair: string): DetailAsset | null {
  const m = /^([A-Z]{3})_INR$/.exec((pair ?? '').trim());
  if (!m || !FX_NAMES[m[1]]) return null;
  return {
    kind: 'fx', id: pair.trim(), label: `${FX_NAMES[m[1]]} to rupee`, yahoo: `${m[1]}INR=X`, chartUnit: `rupees per ${FX_NAMES[m[1]]}`, chartPrefix: '₹', periodsPerYear: 252,
  };
}
export const fxName = (code: string) => FX_NAMES[code] ?? code;

/** Convert an amount of foreign currency to rupees at a rate, or null for a bad input. This is the market rate, not what a bank or card gives. */
export function convertToInr(amount: number, rate: number): number | null {
  return Number.isFinite(amount) && amount >= 0 && Number.isFinite(rate) && rate > 0 ? amount * rate : null;
}
export function convertFromInr(inr: number, rate: number): number | null {
  return Number.isFinite(inr) && inr >= 0 && Number.isFinite(rate) && rate > 0 ? inr / rate : null;
}

// ── chart ranges ─────────────────────────────────────────────────────────────

export const DETAIL_RANGES = [
  { id: '1M', range: '1mo', interval: '1d', label: '1M' },
  { id: '3M', range: '3mo', interval: '1d', label: '3M' },
  { id: '6M', range: '6mo', interval: '1d', label: '6M' },
  { id: '1Y', range: '1y', interval: '1d', label: '1Y' },
  { id: '5Y', range: '5y', interval: '1wk', label: '5Y' },
] as const;
export type DetailRangeId = (typeof DETAIL_RANGES)[number]['id'];

// ── summary of a history ─────────────────────────────────────────────────────

export interface SeriesSummary {
  points: number; startDate: string; endDate: string;
  first: number; last: number; changePct: number;
  high: number; low: number;
  fromHighPct: number; fromLowPct: number;
  /** annualised standard deviation of the day-to-day (or week-to-week) moves, percent; null with fewer than 10 moves */
  volatilityPct: number | null;
  /** worst fall from a running peak within the range, percent (negative) */
  maxDrawdownPct: number;
  /** the closes are so coarse (rounded by the backend to 2 decimals) that small moves show as steps */
  coarse: boolean;
}

/** Summary from closes only (highs and lows are intraday, so the range extremes here are of closing prices). */
export function summariseSeries(c: Chart, periodsPerYear: number): SeriesSummary | null {
  const n = c.closes.length;
  if (n < 2) return null;
  const first = c.closes[0], last = c.closes[n - 1];
  const high = Math.max(...c.closes), low = Math.min(...c.closes);
  const rets = simpleReturns(c.closes);
  const dd = drawdown(c.closes);
  return {
    points: n, startDate: c.dates[0] ?? '', endDate: c.dates[n - 1] ?? '',
    first, last, changePct: ((last - first) / first) * 100, high, low,
    fromHighPct: ((last - high) / high) * 100, fromLowPct: ((last - low) / low) * 100,
    volatilityPct: rets.length >= 10 ? std(rets) * Math.sqrt(periodsPerYear) * 100 : null,
    maxDrawdownPct: dd ? dd.maxDd * 100 : 0,
    // two decimals on a price under 5 is under 0.2% a step: the line looks like stairs
    coarse: low < 5,
  };
}

/** Periods per year for a range's interval (weekly bars for the 5-year view). */
export const periodsFor = (asset: DetailAsset, interval: string) => (interval === '1wk' ? 52 : asset.periodsPerYear);
