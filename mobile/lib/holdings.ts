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

/** Cloud row → local holding. Returns null for asset types this app doesn't manage (gold, F&O, …). */
export function fromRemote(r: RemoteHolding): Holding | null {
  const a = (r.asset_type ?? '').toLowerCase();
  const type: HoldingType | null =
    a === 'equity' || a === 'stock' ? 'Stock' : a === 'mutual_fund' || a === 'mf' ? 'MF' : a === 'elss' ? 'ELSS' : null;
  const units = num(r.quantity);
  const avgPrice = num(r.avg_price);
  if (!type || !r.symbol || units == null || avgPrice == null) return null;
  return {
    id: `${type}:${r.symbol}`,
    type,
    symbol: r.symbol,
    name: r.name || r.symbol,
    units,
    avgPrice,
    sipMonthly: num(r.sip_monthly),
    lastPrice: num(r.current_price),
    updatedAt: r.updated_at ?? new Date(0).toISOString(),
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
  for (const r of remote) {
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
