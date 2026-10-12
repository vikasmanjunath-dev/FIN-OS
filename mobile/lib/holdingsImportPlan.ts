// Turns the rows read from a broker CSV into the phone's Portfolio holdings, and works out what an import would change.
// Pure (no storage): the parser is lib/holdingsImport.ts, the writer is holdingsStore.importHoldings.
//
// A broker file is the full current position, so an import REPLACES the units and average cost of a holding with the same
// type + symbol and leaves other holdings alone. Importing the same file twice therefore changes nothing (adding would double it).
import type { Holding, NewHolding } from './holdings.ts';

export interface ParsedRow {
  name: string; isin?: string; kind: 'equity' | 'mf'; qty: number; avg?: number; price?: number; invested?: number; value: number; pnl?: number;
}

const SUFFIX = /-(BE|BZ|E|SM|ST|X|XT|T|Z|N\d)$/;               // exchange series suffixes some broker exports append to a symbol
const TICKER = /^[A-Z0-9&]{1,20}(-[A-Z0-9]{1,4})?$/;           // looks like an NSE symbol, not a company name

/** An NSE ticker if the name is one, otherwise null (Groww lists company names, not tickers). */
export function tickerFrom(name: string): string | null {
  const t = String(name || '').trim().toUpperCase().replace(SUFFIX, '');
  return TICKER.test(t) ? t : null;
}

export interface Mapped { holdings: NewHolding[]; unpriced: number }

export function toHoldings(rows: ParsedRow[], todayISO: string): Mapped {
  const byKey = new Map<string, NewHolding>();
  let unpriced = 0;
  for (const r of rows) {
    if (!(r.qty > 0)) continue;
    const type: NewHolding['type'] = r.kind === 'mf' ? 'MF' : 'Stock';
    const ticker = r.kind === 'equity' ? tickerFrom(r.name) : null;
    // No ticker or AMFI code to look prices up with: keep the broker's price and use the ISIN (or the name) as the identifier.
    const symbol = ticker ?? ((r.isin && r.isin.trim()) || r.name.trim().toUpperCase().slice(0, 40));
    const live = r.kind === 'equity' && ticker !== null;
    const price = r.price && r.price > 0 ? r.price : r.value / r.qty;
    const avg = r.avg && r.avg > 0 ? r.avg : r.invested && r.invested > 0 ? r.invested / r.qty : price;
    const h: NewHolding = { type, symbol, name: r.name.trim(), units: r.qty, avgPrice: round(avg, 4), lastPrice: round(price, 4), priceDate: todayISO };
    const k = type + ':' + symbol;
    const prev = byKey.get(k);
    if (prev) {                                                 // the same instrument listed twice (e.g. pledged / free): add the units
      const units = prev.units + h.units;
      prev.avgPrice = round((prev.units * prev.avgPrice + h.units * h.avgPrice) / units, 4);
      prev.units = units;
    } else {
      byKey.set(k, h);
      if (!live) unpriced++;
    }
  }
  return { holdings: [...byKey.values()], unpriced };
}

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

export interface ImportPlan {
  add: NewHolding[];
  update: { id: string; patch: Pick<Holding, 'units' | 'avgPrice' | 'lastPrice' | 'priceDate' | 'name'> }[];
  unchanged: number;
}

export function planImport(existing: Holding[], incoming: NewHolding[]): ImportPlan {
  const plan: ImportPlan = { add: [], update: [], unchanged: 0 };
  for (const h of incoming) {
    const cur = existing.find(x => x.type === h.type && x.symbol === h.symbol);
    if (!cur) { plan.add.push(h); continue; }
    const same = Math.abs(cur.units - h.units) < 1e-6 && Math.abs(cur.avgPrice - h.avgPrice) < 0.005;
    if (same) { plan.unchanged++; continue; }
    plan.update.push({ id: cur.id, patch: { units: h.units, avgPrice: h.avgPrice, lastPrice: h.lastPrice ?? cur.lastPrice, priceDate: h.priceDate ?? cur.priceDate, name: cur.name || h.name } });
  }
  return plan;
}
