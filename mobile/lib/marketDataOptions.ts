// Options arithmetic for the phone: Black-Scholes price and Greeks, and the profit/loss at expiry of simple strategies.
// Pure maths on numbers the person types: nothing here knows a market price, and nothing is fetched.
//
// normalCDF / greeks are ports of _normalCDF / _calcGreeks in html/options-intelligence.html (same Abramowitz-Stegun approximation,
// same formulas for delta, gamma, vega per 1% IV and theta per calendar day, same 6.5% default risk-free rate);
// __tests__/marketDataOptions.test.mts runs the website's own code against these. Two deliberate differences: bad inputs give null
// (the website silently swaps in 22000 / 15% / 7 days), and the website's simulated option chain and random "IV rank" are not ported.
//
// Model limits to say on screen: European exercise, no dividends, constant volatility, the rate you give. A textbook model.

export type OptionType = 'call' | 'put';
export const DEFAULT_RISK_FREE = 0.065;

export function normalCDF(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}

export interface GreeksInput { spot: number; strike: number; days: number; ivPct: number; type: OptionType; riskFree?: number }
export interface Greeks {
  price: number; delta: number; gamma: number; theta: number; vega: number;
  moneyness: 'ITM' | 'ATM' | 'OTM'; d1: number; d2: number;
}

/** Null unless spot, strike, days and IV are all positive finite numbers (days up to 3650, IV up to 500%). */
export function greeks(i: GreeksInput): Greeks | null {
  const { spot: S, strike: K, days, ivPct, type } = i;
  const r = i.riskFree ?? DEFAULT_RISK_FREE;
  if (![S, K, days, ivPct, r].every(Number.isFinite) || S <= 0 || K <= 0 || days <= 0 || days > 3650 || ivPct <= 0 || ivPct > 500) return null;
  const T = days / 365, IV = ivPct / 100;
  const d1 = (Math.log(S / K) + (r + (IV * IV) / 2) * T) / (IV * Math.sqrt(T));
  const d2 = d1 - IV * Math.sqrt(T);
  const phi = Math.exp((-d1 * d1) / 2) / Math.sqrt(2 * Math.PI);
  const delta = type === 'call' ? normalCDF(d1) : normalCDF(d1) - 1;
  const gamma = phi / (S * IV * Math.sqrt(T));
  const vega = (S * phi * Math.sqrt(T)) / 100;
  const theta = (type === 'call'
    ? (-S * phi * IV) / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * normalCDF(d2)
    : (-S * phi * IV) / (2 * Math.sqrt(T)) + r * K * Math.exp(-r * T) * normalCDF(-d2)) / 365;
  const price = type === 'call'
    ? S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2)
    : K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1);
  const moneyness = S > K ? (type === 'call' ? 'ITM' : 'OTM') : S < K ? (type === 'call' ? 'OTM' : 'ITM') : 'ATM';
  return { price, delta, gamma, theta, vega, moneyness, d1, d2 };
}

// ── strategies at expiry ─────────────────────────────────────────────────────

export type LegKind = 'call' | 'put' | 'shares';
export interface Leg {
  kind: LegKind;
  /** +1 bought / long, -1 sold / short */
  side: 1 | -1;
  /** strike for an option; the price paid per share for `shares` */
  strike: number;
  /** premium per unit for an option (always a positive number: what is paid for a long, received for a short); ignored for shares */
  premium: number;
  /** units (shares or contracts' worth of the underlying): the person's own number, no lot size is assumed */
  qty: number;
}

/** Profit (+) or loss (-) in rupees at expiry if the underlying finishes at S. Ignores charges, taxes and anything before expiry. */
export function payoffAt(legs: Leg[], S: number): number {
  let total = 0;
  for (const l of legs) {
    const intrinsic = l.kind === 'call' ? Math.max(S - l.strike, 0) : l.kind === 'put' ? Math.max(l.strike - S, 0) : S - l.strike;
    const prem = l.kind === 'shares' ? 0 : l.premium;
    total += l.side * l.qty * (intrinsic - prem);
  }
  return total;
}

export interface PayoffSummary {
  /** best case in rupees, or null when it has no upper limit */
  maxProfit: number | null;
  /** worst case as a negative number, or null when the loss has no limit */
  maxLoss: number | null;
  breakevens: number[];
  /** money paid (+) or received (-) up front for the options */
  netPremium: number;
}

export function validateLegs(legs: Leg[]): string | null {
  if (!legs.length) return 'No legs.';
  for (const l of legs) {
    if (!Number.isFinite(l.strike) || l.strike <= 0) return 'Every strike (or share price) must be a positive number.';
    if (!Number.isFinite(l.qty) || l.qty <= 0) return 'Quantity must be a positive number.';
    if (l.kind !== 'shares' && (!Number.isFinite(l.premium) || l.premium < 0)) return 'Every premium must be 0 or more.';
  }
  return null;
}

/** Exact for these payoffs: they are straight lines between strikes, so the extremes sit at 0, at a strike, or run to infinity. */
export function summarisePayoff(legs: Leg[]): PayoffSummary | null {
  if (validateLegs(legs)) return null;
  const pts = [0, ...[...new Set(legs.map(l => l.strike))].sort((a, b) => a - b)];
  const vals = pts.map(p => payoffAt(legs, p));
  const slopeInf = legs.reduce((s, l) => s + (l.kind === 'put' ? 0 : l.side * l.qty), 0);   // calls and shares gain 1 per rupee above the top strike; puts gain nothing there
  const hi = Math.max(...vals), lo = Math.min(...vals);
  const eps = 1e-9;
  const be: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = vals[i], b = vals[i + 1];
    if (Math.abs(a) < eps) be.push(pts[i]);
    else if (a * b < 0) be.push(pts[i] + ((0 - a) * (pts[i + 1] - pts[i])) / (b - a));
  }
  const last = vals[vals.length - 1];
  if (Math.abs(last) < eps) be.push(pts[pts.length - 1]);
  else if (slopeInf !== 0 && last * slopeInf < 0) be.push(pts[pts.length - 1] + -last / slopeInf);
  const uniq = [...new Set(be.map(x => +x.toFixed(6)))].sort((a, b) => a - b).filter(x => x > 0);
  return {
    maxProfit: slopeInf > 0 ? null : hi,
    maxLoss: slopeInf < 0 ? null : lo,
    breakevens: uniq,
    netPremium: legs.reduce((s, l) => (l.kind === 'shares' ? s : s + l.side * l.qty * l.premium), 0),
  };
}

/** Points for a chart: n+1 evenly spaced prices from `from` to `to` with the profit at each. */
export function payoffCurve(legs: Leg[], from: number, to: number, n = 60): { s: number; pl: number }[] {
  const out: { s: number; pl: number }[] = [];
  for (let i = 0; i <= n; i++) { const s = from + ((to - from) * i) / n; out.push({ s, pl: payoffAt(legs, s) }); }
  return out;
}

// ── templates (the four the website describes, plus the two single options) ───

export type StrategyId = 'long_call' | 'long_put' | 'covered_call' | 'bull_call_spread' | 'iron_condor' | 'long_straddle';
export interface StrategyField { id: string; label: string; kind: 'strike' | 'premium' | 'price' | 'qty' }
export interface StrategyDef {
  id: StrategyId; name: string; summary: string; risk: string;
  fields: StrategyField[];
  build: (v: Record<string, number>) => Leg[];
}
const f = (id: string, label: string, kind: StrategyField['kind']): StrategyField => ({ id, label, kind });

export const STRATEGIES: StrategyDef[] = [
  {
    id: 'long_call', name: 'Buy a call', summary: 'Pay a premium for the right to buy at the strike. You can lose the whole premium; gains grow as the price rises.',
    risk: 'Most you can lose: the premium. Options expire; a call that finishes below its strike is worth nothing.',
    fields: [f('k', 'Strike', 'strike'), f('p', 'Premium paid per unit', 'premium'), f('q', 'Units', 'qty')],
    build: v => [{ kind: 'call', side: 1, strike: v.k, premium: v.p, qty: v.q }],
  },
  {
    id: 'long_put', name: 'Buy a put', summary: 'Pay a premium for the right to sell at the strike. Gains if the price falls below the strike by more than the premium.',
    risk: 'Most you can lose: the premium.',
    fields: [f('k', 'Strike', 'strike'), f('p', 'Premium paid per unit', 'premium'), f('q', 'Units', 'qty')],
    build: v => [{ kind: 'put', side: 1, strike: v.k, premium: v.p, qty: v.q }],
  },
  {
    id: 'covered_call', name: 'Covered call', summary: 'Own shares and sell a call against them. You collect the premium and give up gains above the strike.',
    risk: 'You still carry the full fall in the shares, less the premium received. Your upside is capped at the strike.',
    fields: [f('s', 'Price you paid per share', 'price'), f('k', 'Call strike', 'strike'), f('p', 'Premium received per share', 'premium'), f('q', 'Shares', 'qty')],
    build: v => [{ kind: 'shares', side: 1, strike: v.s, premium: 0, qty: v.q }, { kind: 'call', side: -1, strike: v.k, premium: v.p, qty: v.q }],
  },
  {
    id: 'bull_call_spread', name: 'Bull call spread', summary: 'Buy a lower-strike call and sell a higher-strike call. A smaller cost than a plain call, and a capped gain.',
    risk: 'Most you can lose: the net premium paid. Most you can gain: the gap between strikes minus the net premium.',
    fields: [f('k1', 'Lower strike (bought)', 'strike'), f('p1', 'Premium paid per unit', 'premium'), f('k2', 'Higher strike (sold)', 'strike'), f('p2', 'Premium received per unit', 'premium'), f('q', 'Units', 'qty')],
    build: v => [{ kind: 'call', side: 1, strike: v.k1, premium: v.p1, qty: v.q }, { kind: 'call', side: -1, strike: v.k2, premium: v.p2, qty: v.q }],
  },
  {
    id: 'iron_condor', name: 'Iron condor', summary: 'Sell a put and a call, and buy a further-out put and call as a cap. Earns the net premium if the price stays between the sold strikes.',
    risk: 'Most you can lose: the gap between the bought and sold strikes on one side, minus the net premium received.',
    fields: [f('kp1', 'Bought put strike (lowest)', 'strike'), f('pp1', 'Premium paid', 'premium'), f('kp2', 'Sold put strike', 'strike'), f('pp2', 'Premium received', 'premium'),
      f('kc1', 'Sold call strike', 'strike'), f('pc1', 'Premium received', 'premium'), f('kc2', 'Bought call strike (highest)', 'strike'), f('pc2', 'Premium paid', 'premium'), f('q', 'Units', 'qty')],
    build: v => [
      { kind: 'put', side: 1, strike: v.kp1, premium: v.pp1, qty: v.q }, { kind: 'put', side: -1, strike: v.kp2, premium: v.pp2, qty: v.q },
      { kind: 'call', side: -1, strike: v.kc1, premium: v.pc1, qty: v.q }, { kind: 'call', side: 1, strike: v.kc2, premium: v.pc2, qty: v.q },
    ],
  },
  {
    id: 'long_straddle', name: 'Long straddle', summary: 'Buy a call and a put at the same strike. Gains from a large move either way, loses if the price barely moves.',
    risk: 'Most you can lose: both premiums, if the price finishes at the strike.',
    fields: [f('k', 'Strike', 'strike'), f('pc', 'Call premium paid', 'premium'), f('pp', 'Put premium paid', 'premium'), f('q', 'Units', 'qty')],
    build: v => [{ kind: 'call', side: 1, strike: v.k, premium: v.pc, qty: v.q }, { kind: 'put', side: 1, strike: v.k, premium: v.pp, qty: v.q }],
  },
];
