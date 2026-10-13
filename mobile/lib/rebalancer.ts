// Portfolio rebalancer: where your money is across six asset classes, the target you set, how far each class has drifted and what
// moving it back would take. Port of _compute and the presets in js/finos-rebalancer.js; the values are passed in.
// __tests__/rebalancer.parity.test.mts compares it with the website's own module.

export type AssetClass = 'equity' | 'debt' | 'gold' | 'realestate' | 'crypto' | 'govt';
export const CLASSES: AssetClass[] = ['equity', 'debt', 'gold', 'realestate', 'crypto', 'govt'];
export const CLASS_META: Record<AssetClass, { label: string; icon: string; color: string; desc: string; locked: boolean }> = {
  equity: { label: 'Equity', icon: '📈', color: '#4F7CFF', desc: 'Stocks and equity mutual funds', locked: false },
  debt: { label: 'Debt', icon: '🏦', color: '#00D4FF', desc: 'FDs, deposits, bonds', locked: false },
  gold: { label: 'Gold', icon: '🥇', color: '#FFB347', desc: 'Physical gold, SGB, gold ETF', locked: false },
  realestate: { label: 'Real estate', icon: '🏠', color: '#34D399', desc: 'Property value', locked: true },
  crypto: { label: 'Crypto', icon: '🪙', color: '#B28CFF', desc: 'Bitcoin and other coins', locked: false },
  govt: { label: 'Govt savings', icon: '🏛️', color: '#22D3A6', desc: 'EPF, NPS, PPF', locked: true },
};
export type Alloc = Record<AssetClass, number>;
export const DEFAULT_TARGET: Alloc = { equity: 50, debt: 20, gold: 10, realestate: 10, crypto: 5, govt: 5 };
export const DRIFT_THRESHOLD = 5;      // percentage points: rebalance when any class is further than this from its target
export const PRESETS: { name: string; vals: Alloc }[] = [
  { name: 'Aggressive', vals: { equity: 60, debt: 20, gold: 10, realestate: 0, crypto: 5, govt: 5 } },
  { name: 'Moderate', vals: { equity: 50, debt: 20, gold: 10, realestate: 10, crypto: 5, govt: 5 } },
  { name: 'Conservative', vals: { equity: 30, debt: 40, gold: 15, realestate: 10, crypto: 0, govt: 5 } },
  { name: 'Income', vals: { equity: 20, debt: 50, gold: 10, realestate: 10, crypto: 0, govt: 10 } },
];

export interface ClassRow {
  currentValue: number; currentPct: number; targetPct: number; targetValue: number; drift: number; driftAbs: number;
  action: 'hold' | 'buy' | 'sell'; actionAmount: number;
}
export interface Rebalance { totalPortfolio: number; classes: Record<AssetClass, ClassRow>; target: Alloc; rebalanceNeeded: boolean }

export function compute(values: Alloc, targetIn: Partial<Alloc> | null | undefined): Rebalance {
  const totalPortfolio = CLASSES.reduce((s, k) => s + (values[k] || 0), 0);
  const target = { ...DEFAULT_TARGET, ...(targetIn || {}) } as Alloc;
  const targetSum = CLASSES.reduce((s, k) => s + (Number(target[k]) || 0), 0);
  const norm = {} as Alloc;
  CLASSES.forEach(k => { norm[k] = targetSum > 0 ? ((Number(target[k]) || 0) / targetSum) * 100 : DEFAULT_TARGET[k]; });

  const classes = {} as Record<AssetClass, ClassRow>;
  let rebalanceNeeded = false;
  CLASSES.forEach(k => {
    const cur = totalPortfolio > 0 ? ((values[k] || 0) / totalPortfolio) * 100 : 0;
    const tgt = norm[k] || 0;
    const drift = cur - tgt;
    const targetValue = (tgt / 100) * totalPortfolio;
    const action = Math.abs(drift) < 0.5 ? 'hold' : drift > 0 ? 'sell' : 'buy';
    if (Math.abs(drift) > DRIFT_THRESHOLD) rebalanceNeeded = true;
    classes[k] = { currentValue: values[k] || 0, currentPct: cur, targetPct: tgt, targetValue, drift, driftAbs: Math.abs(drift), action, actionAmount: Math.abs(targetValue - (values[k] || 0)) };
  });
  // The website flags an empty portfolio as needing a rebalance (every class is "50 points under"); there is nothing to rebalance yet.
  return { totalPortfolio, classes, target: norm, rebalanceNeeded: totalPortfolio > 0 && rebalanceNeeded };
}

/**
 * Putting only NEW money into the classes that are below target avoids selling anything (no capital-gains tax, no exit load).
 * Returns how a fresh amount would be split, in proportion to each underweight class's shortfall, and how close that gets to target.
 */
export function splitNewMoney(r: Rebalance, amount: number): { cls: AssetClass; amount: number }[] {
  const short = CLASSES.map(k => ({ cls: k, need: r.classes[k].action === 'buy' ? r.classes[k].actionAmount : 0 })).filter(x => x.need > 0);
  const total = short.reduce((s, x) => s + x.need, 0);
  if (!(amount > 0) || total <= 0) return [];
  return short.map(x => ({ cls: x.cls, amount: Math.round(Math.min(x.need, (x.need / total) * amount)) })).filter(x => x.amount > 0);
}
