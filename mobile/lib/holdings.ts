// Holdings model + cloud-sync planning. Pure functions only (no React, no network) so the
// merge rules can be unit-tested in isolation.

export type HoldingType = 'Stock' | 'MF' | 'ELSS';

export interface Holding {
  id: string;
  type: HoldingType;
  /** NSE ticker for stocks, AMFI scheme code for mutual funds */
  symbol: string;
  name: string;
  units: number;
  /** Average cost per unit (₹) */
  avgPrice: number;
  /** Monthly SIP amount (₹), mutual funds only */
  sipMonthly?: number;
  /** Last fetched price / NAV (₹) */
  lastPrice?: number;
  priceDate?: string;
  /** ISO time of the last *user* edit (price refreshes do not change it). Drives last-write-wins. */
  updatedAt?: string;
  /** ISO time this row was last reconciled with the cloud. Unset = never synced. */
  syncedAt?: string;
}

export type NewHolding = Omit<Holding, 'id' | 'updatedAt' | 'syncedAt'>;

export interface HoldingView extends Holding {
  invested: number;
  current: number;
  gain: number;
  gainPct: number;
  /** false when we have never fetched a live price and are valuing at cost */
  priced: boolean;
}

export function toView(h: Holding): HoldingView {
  const priced = h.lastPrice != null;
  const price = h.lastPrice ?? h.avgPrice;
  const invested = h.units * h.avgPrice;
  const current = h.units * price;
  const gain = current - invested;
  return { ...h, invested, current, gain, gainPct: invested > 0 ? (gain / invested) * 100 : 0, priced };
}

export const holdingKey = (h: Pick<Holding, 'type' | 'symbol'>) => `${h.type}:${h.symbol}`;

// ── Cloud row mapping ────────────────────────────────────────────────────────
// Same `holdings` table the website and the Arya backend already read
// (user_id, symbol, quantity, avg_price, current_price, asset_type) plus additive columns.

export const SYNCED_ASSET_TYPES = ['equity', 'mutual_fund', 'elss'] as const;
const TYPE_TO_ASSET: Record<HoldingType, string> = { Stock: 'equity', MF: 'mutual_fund', ELSS: 'elss' };

export interface RemoteHolding {
  symbol: string;
  asset_type: string | null;
  quantity: number | string | null;
  avg_price: number | string | null;
  current_price: number | string | null;
  name: string | null;
  sip_monthly: number | string | null;
  updated_at: string | null;
}

const num = (v: unknown): number | undefined => {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/** A date-time string, or undefined when it is not one. */
const isoOrUndef = (v: unknown): string | undefined => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : undefined);
const plainText = (v: unknown, max = 200): string | undefined => (typeof v === 'string' ? v.slice(0, max) : typeof v === 'number' && Number.isFinite(v) ? String(v) : undefined);
const isRec = (v: unknown): v is Record<string, any> => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * One stored holding made safe to compute with. Returns null for anything that is not a holding (so it is left out, not guessed):
 * a known type, a symbol, finite non-negative units and cost. Prices that are not positive finite numbers are dropped.
 */
export function normaliseHolding(raw: unknown): Holding | null {
  if (!isRec(raw)) return null;
  const type = raw.type === 'Stock' || raw.type === 'MF' || raw.type === 'ELSS' ? raw.type : null;
  const symbol = plainText(raw.symbol, 40);
  const units = num(raw.units), avgPrice = num(raw.avgPrice);
  if (!type || !symbol || units === undefined || avgPrice === undefined || units < 0 || avgPrice < 0) return null;
  const sip = num(raw.sipMonthly), last = num(raw.lastPrice);
  if (!Number.isFinite(units * avgPrice) || (last !== undefined && last > 0 && !Number.isFinite(units * last))) return null;
  const out: Holding = {
    id: plainText(raw.id, 80) || `${type}:${symbol}`, type, symbol, name: plainText(raw.name, 120) || symbol, units, avgPrice,
  };
  if (sip !== undefined && sip > 0) out.sipMonthly = sip;
  if (last !== undefined && last > 0) out.lastPrice = last;
  const pd = plainText(raw.priceDate, 40); if (pd) out.priceDate = pd;
  const ua = isoOrUndef(raw.updatedAt); if (ua) out.updatedAt = ua;
  const sa = isoOrUndef(raw.syncedAt); if (sa) out.syncedAt = sa;
  return out;
}

/** The stored holdings list: only real holdings, one per (type, symbol). Anything else (not a list, junk entries) gives fewer or none. */
export function normaliseHoldings(raw: unknown): Holding[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Holding[] = [];
  for (const x of raw) {
    const h = normaliseHolding(x);
    if (!h || seen.has(holdingKey(h))) continue;
    seen.add(holdingKey(h));
    out.push(h);
  }
  return out;
}

export function normaliseTombstones(raw: unknown): Tombstone[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRec).filter(t => typeof t.key === 'string' && t.key !== '').map(t => ({ key: t.key as string, at: isoOrUndef(t.at) ?? new Date(0).toISOString() }));
}

/** Cloud row → local holding. Returns null for asset types this app doesn't manage (gold, F&O, …) and for rows that are not rows. */
export function fromRemote(r: RemoteHolding): Holding | null {
  if (!isRec(r)) return null;
  if (typeof r.symbol !== 'string' && typeof r.symbol !== 'number') return null;
  const a = (typeof r.asset_type === 'string' ? r.asset_type : '').toLowerCase();
  const type: HoldingType | null =
    a === 'equity' || a === 'stock' ? 'Stock' : a === 'mutual_fund' || a === 'mf' ? 'MF' : a === 'elss' ? 'ELSS' : null;
  const units = num(r.quantity);
  const avgPrice = num(r.avg_price);
  const symbol = String(r.symbol).slice(0, 40);
  if (!type || !symbol || units == null || avgPrice == null || units < 0 || avgPrice < 0) return null;
  const sip = num(r.sip_monthly), last = num(r.current_price);
  if (!Number.isFinite(units * avgPrice) || (last !== undefined && last > 0 && !Number.isFinite(units * last))) return null;
  return {
    id: `${type}:${symbol}`,
    type,
    symbol,
    name: (typeof r.name === 'string' && r.name ? r.name : symbol).slice(0, 120),
    units,
    avgPrice,
    sipMonthly: sip !== undefined && sip > 0 ? sip : undefined,
    lastPrice: last !== undefined && last > 0 ? last : undefined,
    updatedAt: isoOrUndef(r.updated_at) ?? new Date(0).toISOString(),
  };
}

export function toRemote(h: Holding, userId: string) {
  return {
    user_id: userId,
    symbol: h.symbol,
    asset_type: TYPE_TO_ASSET[h.type],
    name: h.name,
    quantity: h.units,
    avg_price: h.avgPrice,
    current_price: h.lastPrice ?? null,
    sip_monthly: h.sipMonthly ?? null,
    updated_at: h.updatedAt ?? new Date().toISOString(),
  };
}

export const assetTypeOf = (h: Pick<Holding, 'type'>) => TYPE_TO_ASSET[h.type];

// ── Merge ────────────────────────────────────────────────────────────────────

export interface Tombstone { key: string; at: string }

export interface SyncPlan {
  /** What local storage should hold after the sync */
  next: Holding[];
  /** Local rows the cloud is missing or has older copies of */
  upserts: Holding[];
  /** Cloud rows to delete because the user removed them here after the cloud's last edit */
  deletes: Holding[];
}

const t = (iso?: string) => (iso ? Date.parse(iso) || 0 : 0);

/**
 * Last-write-wins per holding, keyed by (type, symbol).
 *  - remote only, no newer local delete  → add locally
 *  - remote only, local delete is newer  → delete remotely
 *  - both                                → newer `updatedAt` wins
 *  - local only, never synced            → push to cloud
 *  - local only, already synced before   → it was deleted elsewhere → drop locally
 */
export function planSync(local: Holding[], remote: RemoteHolding[], tombstones: Tombstone[], now: string): SyncPlan {
  const remoteMap = new Map<string, Holding>();
  for (const r of Array.isArray(remote) ? remote : []) {
    const h = fromRemote(r);
    if (h) remoteMap.set(holdingKey(h), h);
  }
  const localMap = new Map(local.map(h => [holdingKey(h), h] as const));
  const tombMap = new Map(tombstones.map(x => [x.key, x] as const));

  const next: Holding[] = [];
  const upserts: Holding[] = [];
  const deletes: Holding[] = [];

  for (const [key, r] of remoteMap) {
    const l = localMap.get(key);
    const tomb = tombMap.get(key);

    if (tomb && t(tomb.at) >= t(r.updatedAt)) { deletes.push(r); continue; }
    if (!l) { next.push({ ...r, syncedAt: now }); continue; }

    if (t(r.updatedAt) > t(l.updatedAt)) {
      next.push({ ...r, lastPrice: r.lastPrice ?? l.lastPrice, priceDate: l.priceDate, syncedAt: now });
    } else if (t(l.updatedAt) > t(r.updatedAt)) {
      next.push({ ...l, syncedAt: now });
      upserts.push(l);
    } else {
      next.push({ ...l, syncedAt: now });
    }
  }

  for (const [key, l] of localMap) {
    if (remoteMap.has(key)) continue;
    if (l.syncedAt) continue; // synced before, now gone from the cloud → deleted on another device
    const stamped = { ...l, updatedAt: l.updatedAt ?? now };
    next.push({ ...stamped, syncedAt: now });
    upserts.push(stamped);
  }

  return { next, upserts, deletes };
}
