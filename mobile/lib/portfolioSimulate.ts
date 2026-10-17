// Monte Carlo "cone" for the portfolio's value: many random paths, shown as a range, never a single forecast.
//
// The path rule is the website's (runMonteCarlo in Porfolio Analyser/portfolio-analyser-v10.html): each step the value is multiplied
// by (1 + mu + sigma * z) with z a standard normal drawn by Box-Muller's cosine branch, percentiles are read by the index rule
// sorted[floor(p/100 * paths)]. Differences, on purpose:
//   - the random numbers come from a SEEDED generator (mulberry32), so the same inputs and seed always give the same answer;
//   - mu and sigma come from annual figures the person sets, not from the portfolio's own weekly history;
//   - optional monthly contributions (added at the start of each month; 0 gives exactly the website's rule);
//   - the website's bull/bear/crash "scenarios" (arbitrary shifts of mu and sigma) are not carried over.
// __tests__/portfolioSimulate.test.mts checks the path loop against the website's own code with Math.random replaced by the same stream.
import { percentileFloor } from '@/lib/portfolioStats';

/** mulberry32: 32-bit seed -> uniform [0, 1). Same generator the retirement planner uses. */
export function mulberry32(seed: number): () => number {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The website's randn: Box-Muller cosine branch, redrawing u and v while they are 0. `rand` must return [0, 1). */
export function randn(rand: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface PathOptions { start: number; mu: number; sigma: number; steps: number; paths: number; rand: () => number; contribution?: number; /** steps at which to record every path's value (0 = the start) */ recordAt?: number[] }
export interface PathResult { finals: number[]; /** step -> the value of every path at that step, in path order */ columns: Record<number, number[]> }

/** Runs `paths` paths of `steps` steps. Values never go below 0 (a shock below -100% ruins the path, it does not make it negative). */
export function simulatePaths(o: PathOptions): PathResult {
  const finals: number[] = [], columns: Record<number, number[]> = {};
  const c = o.contribution ?? 0;
  const rec = new Set(o.recordAt ?? []);
  rec.forEach(m => { columns[m] = []; });
  for (let p = 0; p < o.paths; p++) {
    let val = o.start;
    if (rec.has(0)) columns[0].push(val);
    for (let t = 0; t < o.steps; t++) {
      const shock = o.mu + o.sigma * randn(o.rand);
      val = Math.max(0, (val + c) * (1 + shock));
      if (rec.has(t + 1)) columns[t + 1].push(val);
    }
    finals.push(val);
  }
  return { finals, columns };
}

export interface ConeAssumptions {
  startValue: number;
  /** expected return per year, percent (arithmetic, before inflation and tax) */
  annualReturnPct: number;
  /** volatility per year, percent */
  annualVolPct: number;
  years: number;
  monthlyContribution: number;
  paths: number;
  seed: number;
}
export interface ConePoint { month: number; p5: number; p25: number; p50: number; p75: number; p95: number }
export interface Cone {
  assumptions: ConeAssumptions;
  points: ConePoint[];                 // month 0 and then every 3 months, and the last month
  final: { p5: number; p25: number; p50: number; p75: number; p95: number };
  putIn: number;                       // start value plus every contribution
  probBelowPutInPct: number;           // share of paths ending below the money put in (nominal, before inflation)
  probBelowStartPct: number;
  monthlyMu: number; monthlySigma: number;
}

export const LIMITS = { years: [1, 40], paths: [200, 5000], annualReturnPct: [-20, 40], annualVolPct: [1, 80], monthlyContribution: [0, 10_000_000] } as const;

/** Why the inputs cannot be simulated, or null when they can. */
export function validateCone(a: ConeAssumptions): string | null {
  const inR = (v: number, [lo, hi]: readonly [number, number]) => Number.isFinite(v) && v >= lo && v <= hi;
  if (!(Number.isFinite(a.startValue) && a.startValue > 0)) return 'There is no portfolio value to start from.';
  if (!inR(a.annualReturnPct, LIMITS.annualReturnPct)) return `Expected return must be between ${LIMITS.annualReturnPct[0]}% and ${LIMITS.annualReturnPct[1]}% a year.`;
  if (!inR(a.annualVolPct, LIMITS.annualVolPct)) return `Volatility must be between ${LIMITS.annualVolPct[0]}% and ${LIMITS.annualVolPct[1]}% a year.`;
  if (!inR(a.years, LIMITS.years) || !Number.isInteger(a.years)) return `Years must be a whole number from ${LIMITS.years[0]} to ${LIMITS.years[1]}.`;
  if (!inR(a.monthlyContribution, LIMITS.monthlyContribution)) return 'Monthly amount must be 0 or more.';
  if (!inR(a.paths, LIMITS.paths) || !Number.isInteger(a.paths)) return `Number of paths must be a whole number from ${LIMITS.paths[0]} to ${LIMITS.paths[1]}.`;
  if (!Number.isInteger(a.seed) || a.seed < 1 || a.seed > 2_147_483_647) return 'Seed must be a whole number from 1 to 2147483647.';
  return null;
}

/** Monthly steps: mu = (1+R)^(1/12) - 1, sigma = vol / sqrt(12). Reproducible: same assumptions, same cone. */
export function simulateCone(a: ConeAssumptions): Cone | null {
  if (validateCone(a)) return null;
  const steps = a.years * 12;
  const mu = Math.pow(1 + a.annualReturnPct / 100, 1 / 12) - 1;
  const sigma = a.annualVolPct / 100 / Math.sqrt(12);
  const months = new Set<number>([0, steps]);
  for (let m = 3; m < steps; m += 3) months.add(m);
  const { finals, columns } = simulatePaths({ start: a.startValue, mu, sigma, steps, paths: a.paths, rand: mulberry32(a.seed), contribution: a.monthlyContribution, recordAt: [...months] });
  const sortedFinals = [...finals].sort((x, y) => x - y);
  const pts: ConePoint[] = [];
  for (const m of [...months].sort((x, y) => x - y)) {
    const col = [...columns[m]].sort((x, y) => x - y);
    pts.push({ month: m, p5: percentileFloor(col, 5), p25: percentileFloor(col, 25), p50: percentileFloor(col, 50), p75: percentileFloor(col, 75), p95: percentileFloor(col, 95) });
  }
  const putIn = a.startValue + a.monthlyContribution * steps;
  return {
    assumptions: a, points: pts,
    final: { p5: percentileFloor(sortedFinals, 5), p25: percentileFloor(sortedFinals, 25), p50: percentileFloor(sortedFinals, 50), p75: percentileFloor(sortedFinals, 75), p95: percentileFloor(sortedFinals, 95) },
    putIn,
    probBelowPutInPct: (finals.filter(v => v < putIn).length / finals.length) * 100,
    probBelowStartPct: (finals.filter(v => v < a.startValue).length / finals.length) * 100,
    monthlyMu: mu, monthlySigma: sigma,
  };
}
