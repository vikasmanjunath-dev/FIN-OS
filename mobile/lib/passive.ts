// Passive income tracker: monthly streams, how much of monthly spending they cover, and the distance to "financially free".
// Port of the calculation half of js/finos-passive-income.js (_recompute plus the freedom-tab arithmetic); the data is passed in.
// __tests__/passive.parity.test.mts runs the website's own _recompute against the same streams.

export type StreamType = 'dividend' | 'fd' | 'rental' | 'swp' | 'sgb' | 'other';
export interface Stream { id: string; type: StreamType; label: string; monthly: number; taxable: boolean; note: string }

export const STREAM_KEY = 'finos_passive_streams';
export const TYPE_META: Record<StreamType, { icon: string; color: string; label: string }> = {
  dividend: { icon: '📊', color: '#22D3A6', label: 'Dividends' },
  fd: { icon: '🏦', color: '#00D4FF', label: 'FD / debt' },
  rental: { icon: '🏠', color: '#FFB347', label: 'Rental' },
  swp: { icon: '📈', color: '#B28CFF', label: 'SWP' },
  sgb: { icon: '🥇', color: '#F59E0B', label: 'SGB' },
  other: { icon: '💡', color: '#4F7CFF', label: 'Other' },
};
export const TYPES = Object.keys(TYPE_META) as StreamType[];

export const DEFAULT_STREAMS: Stream[] = [
  { id: 's1', type: 'dividend', label: 'Equity dividends', monthly: 0, taxable: true, note: '' },
  { id: 's2', type: 'fd', label: 'FD / debt interest', monthly: 0, taxable: true, note: '' },
  { id: 's3', type: 'rental', label: 'Rental income', monthly: 0, taxable: true, note: '' },
  { id: 's4', type: 'swp', label: 'SWP from mutual funds', monthly: 0, taxable: false, note: '' },
  { id: 's5', type: 'sgb', label: 'SGB coupon (2.5%)', monthly: 0, taxable: true, note: '' },
  { id: 's6', type: 'other', label: 'Other passive income', monthly: 0, taxable: false, note: '' },
];

export interface Summary {
  total: number; monthlyExp: number; coverage: number; taxable: number; taxFree: number; annual: number;
  byType: { type: StreamType; amount: number; pct: number }[]; active: number;
  label: 'Financially free' | 'Almost there' | 'Half way' | 'Building up' | 'Just started';
  gap: number; surplus: number; additionalCorpus: number;
}

/** Same arithmetic as the website's _recompute: coverage is total ÷ monthly spending, capped at 200%, and 0 with no spending. */
export function summarize(streams: Stream[], monthlyExp: number): Summary {
  const amt = (s: Stream) => Number(s.monthly) || 0;
  const total = streams.reduce((t, s) => t + amt(s), 0);
  const exp = monthlyExp > 0 ? monthlyExp : 0;
  const coverage = exp > 0 ? Math.min((total / exp) * 100, 200) : 0;
  const taxable = streams.filter(s => s.taxable).reduce((t, s) => t + amt(s), 0);
  const sums = new Map<StreamType, number>();
  streams.forEach(s => sums.set(s.type, (sums.get(s.type) || 0) + amt(s)));
  const byType = [...sums.entries()].filter(([, v]) => v > 0).map(([type, amount]) => ({ type, amount, pct: total > 0 ? Math.round((amount / total) * 100) : 0 }));
  const deficit = Math.max(0, exp - total);
  return {
    total, monthlyExp: exp, coverage, taxable, taxFree: total - taxable, annual: total * 12, byType, active: streams.filter(s => amt(s) > 0).length,
    label: coverage >= 100 ? 'Financially free' : coverage >= 75 ? 'Almost there' : coverage >= 50 ? 'Half way' : coverage >= 25 ? 'Building up' : 'Just started',
    gap: deficit, surplus: Math.max(0, total - exp),
    additionalCorpus: deficit > 0 ? Math.round((deficit * 12) / 0.04) : 0,        // a 4% withdrawal rate
  };
}

export const MILESTONES = [
  { pct: 25, label: '25% freedom', desc: 'Side income covers dining, travel and subscriptions' },
  { pct: 50, label: '50% lean', desc: 'Half your spending is passive: part-time becomes an option' },
  { pct: 75, label: '75% coast', desc: 'Only essential spending still needs active income' },
  { pct: 100, label: '100% free', desc: 'Full independence: active income is optional' },
];

export function scenarios(total: number, monthlyExp: number) {
  return [500, 1000, 2000, 5000, 10000].map(extra => ({ extra, coverage: monthlyExp > 0 ? ((total + extra) / monthlyExp) * 100 : 0 }));
}

/**
 * First-time streams. The FD line is an estimate (7% a year on the FD value) and the SGB line is the coupon on the bonds in the gold
 * tracker; both are flagged in their note so they are not mistaken for something the person typed.
 */
export function seed(fdValue: number, sgbAnnualCoupon: number): Stream[] {
  const out = DEFAULT_STREAMS.map(s => ({ ...s }));
  if (fdValue > 0) { out[1].monthly = Math.round((fdValue * 0.07) / 12); out[1].note = 'Estimated at 7% a year on your deposits; edit to your real interest'; }
  if (sgbAnnualCoupon > 0) { out[4].monthly = Math.round(sgbAnnualCoupon / 12); out[4].note = 'From the bonds in your Gold tracker'; }
  return out;
}

export function normalise(raw: unknown): Stream[] | null {
  if (!Array.isArray(raw) || !raw.length) return null;
  const list = raw.filter(x => x && typeof x === 'object' && typeof (x as any).id === 'string').map((x: any): Stream => ({
    id: x.id, type: TYPES.includes(x.type) ? x.type : 'other', label: String(x.label ?? ''), monthly: Math.max(0, Number(x.monthly) || 0), taxable: !!x.taxable, note: String(x.note ?? ''),
  }));
  return list.length ? list : null;
}
