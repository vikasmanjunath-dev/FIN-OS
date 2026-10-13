/**
 * FIN-OS Monte Carlo retirement engine.   (v1.0)
 *
 * Replaces "assume a flat 10% forever" with a distribution of outcomes: returns vary
 * by asset class every year, inflation varies, and withdrawals start at retirement.
 * The headline number is the probability the money lasts to `endAge`.
 *
 *   const r = FinosMC.simulate({
 *     startAge: 32, retireAge: 60, endAge: 90,
 *     assets: [ {name:'equity', value:2500000, mean:.12, vol:.18, beta:1},
 *               {name:'debt',   value:1500000, mean:.075, vol:.04, beta:.15},
 *               {name:'gold',   value:300000,  mean:.08, vol:.14, beta:.1} ],
 *     monthlyContribution: 30000, stepUp: .08,          // nominal, grows 8%/yr until retirement
 *     monthlyExpenseToday: 60000,                       // in today's rupees; inflated to retirement
 *     inflation: .06, inflationVol: .015,
 *     pensionMonthlyAtRetire: 15000, pensionIndexation: 0,  // EPS/annuity: nominal, 0 = not indexed
 *     runs: 5000, seed: 42,
 *   });
 *   r.successRate         → 0.0 … 1.0
 *   r.bands               → [{age, p10, p25, p50, p75, p90}] nominal portfolio value
 *   r.realBands           → same, in today's rupees
 *   r.depletion           → {p10Age, medianAge} among failed runs (null if none failed)
 *
 * Model (annual steps)
 *   • Per-asset annual return is lognormal with the given arithmetic mean/vol (never < -100%).
 *   • Assets share one market factor: z_i = beta_i·Z + sqrt(1-beta_i²)·e_i  (beta = correlation to market).
 *   • Accumulation: contribution is added at the start of each year, split by current weights.
 *   • Retirement: expense (inflated by the simulated path) minus pension is withdrawn at the start of
 *     each year, pro-rata across assets, then the portfolio is rebalanced to retirement-date weights.
 *   • A run "fails" the first year the portfolio cannot cover that year's withdrawal.
 *
 * Pure & deterministic for a given seed. No DOM, no storage.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FinosMC = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /** Fast, good-quality seeded PRNG (mulberry32). */
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Standard normal via Box–Muller (caches the spare). */
  function normalGen(rand) {
    let spare = null;
    return function () {
      if (spare !== null) { const s = spare; spare = null; return s; }
      let u = 0, v = 0;
      while (u === 0) u = rand();
      v = rand();
      const m = Math.sqrt(-2 * Math.log(u));
      spare = m * Math.sin(2 * Math.PI * v);
      return m * Math.cos(2 * Math.PI * v);
    };
  }

  /** Lognormal parameters from an arithmetic mean and standard deviation of simple returns. */
  function logParams(mean, vol) {
    const m = Math.max(mean, -0.99);
    const s2 = Math.log(1 + (vol * vol) / ((1 + m) * (1 + m)));
    return { mu: Math.log(1 + m) - s2 / 2, sigma: Math.sqrt(s2) };
  }

  function percentile(sorted, p) {
    if (!sorted.length) return 0;
    const i = (sorted.length - 1) * p;
    const lo = Math.floor(i), hi = Math.ceil(i);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
  }

  function simulate(cfg) {
    const c = Object.assign({
      startAge: 30, retireAge: 60, endAge: 90,
      assets: [], monthlyContribution: 0, stepUp: 0,
      monthlyExpenseToday: 0, inflation: 0.06, inflationVol: 0.015,
      pensionMonthlyAtRetire: 0, pensionIndexation: 0,
      runs: 5000, seed: 1,
    }, cfg);

    if (!(c.endAge > c.startAge)) throw new Error('endAge must be greater than startAge');
    if (!c.assets.length) throw new Error('At least one asset is required');
    c.retireAge = Math.min(Math.max(c.retireAge, c.startAge), c.endAge);
    const runs = Math.max(100, Math.floor(c.runs));
    const years = c.endAge - c.startAge;
    const n = c.assets.length;

    const params = c.assets.map((a) => logParams(a.mean, a.vol));
    const betas = c.assets.map((a) => Math.min(Math.max(a.beta === undefined ? 0.5 : a.beta, 0), 1));
    const rand = rng(c.seed);
    const norm = normalGen(rand);

    // Everything that doesn't depend on the run is computed once. The RNG is still consumed in exactly the same
    // order (inflation, market factor, then one idiosyncratic draw per asset), so results are unchanged.
    const idio = betas.map((b) => Math.sqrt(1 - b * b));
    const contribByYear = Array.from({ length: years }, (_, y) => c.monthlyContribution * 12 * Math.pow(1 + c.stepUp, y));
    const start = c.assets.map((a) => Math.max(0, a.value));
    const v = new Float64Array(n);            // reused across runs and years — no per-year allocation
    const ret = new Float64Array(n);
    const weights = new Float64Array(n);
    const sum = () => { let t = 0; for (let i = 0; i < n; i++) t += v[i]; return t; };

    // terminal values per age index (0 = start, years = end), nominal and real
    // (skipped when only the success rate is wanted — the solver's ~15 trials never read them)
    const keep = !c.successOnly;
    const nominal = keep ? Array.from({ length: years + 1 }, () => new Float64Array(runs)) : null;
    const real = keep ? Array.from({ length: years + 1 }, () => new Float64Array(runs)) : null;
    const failAges = [];
    let successes = 0;

    for (let r = 0; r < runs; r++) {
      for (let i = 0; i < n; i++) v[i] = start[i];
      let cumInfl = 1;
      let expense = 0;                // nominal annual expense once retired
      let pension = c.pensionMonthlyAtRetire * 12;
      let haveWeights = false;
      let failed = false;

      if (keep) { nominal[0][r] = sum(); real[0][r] = nominal[0][r]; }

      for (let y = 0; y < years; y++) {
        const age = c.startAge + y;
        const infl = Math.max(-0.02, c.inflation + c.inflationVol * norm());
        // Returns for this year
        const mkt = norm();
        for (let i = 0; i < n; i++) {
          const p = params[i];
          ret[i] = Math.exp(p.mu + p.sigma * (betas[i] * mkt + idio[i] * norm())) - 1;
        }

        if (age < c.retireAge) {
          // contribution first (start of year), allocated by current weights
          const contrib = contribByYear[y];
          const total = sum();
          for (let i = 0; i < n; i++) {
            const w = total > 0 ? v[i] / total : 1 / n;
            v[i] += contrib * w;
          }
        } else if (!failed) {
          if (!haveWeights) {
            const total = sum();
            for (let i = 0; i < n; i++) weights[i] = total > 0 ? v[i] / total : 1 / n;
            haveWeights = true;
            expense = c.monthlyExpenseToday * 12 * cumInfl;      // inflated to retirement date
          } else {
            expense *= 1 + infl;
            pension *= 1 + infl * c.pensionIndexation;
          }
          const need = Math.max(0, expense - pension);
          const total = sum();
          if (total < need) {
            failed = true;
            failAges.push(age);
            for (let i = 0; i < n; i++) v[i] = 0;
          } else {
            const remaining = total - need;
            for (let i = 0; i < n; i++) v[i] = remaining * weights[i];   // withdraw + rebalance
          }
        }

        if (!failed) for (let i = 0; i < n; i++) v[i] *= 1 + ret[i];
        cumInfl *= 1 + infl;
        if (keep) {
          const t = sum();
          nominal[y + 1][r] = t;
          real[y + 1][r] = t / cumInfl;
        }
      }
      if (!failed) successes++;
    }

    // The solver only needs the success rate; sorting 2×(years+1) arrays per trial was most of its cost.
    // Each grid row is ours alone, so sort it in place instead of copying it first.
    const band = (grid) => grid.map((arr, i) => {
      arr.sort();
      return { age: c.startAge + i, p10: percentile(arr, 0.1), p25: percentile(arr, 0.25), p50: percentile(arr, 0.5), p75: percentile(arr, 0.75), p90: percentile(arr, 0.9) };
    });

    failAges.sort((a, b) => a - b);
    return {
      runs,
      successRate: successes / runs,
      bands: keep ? band(nominal) : null,
      realBands: keep ? band(real) : null,
      depletion: failAges.length ? { p10Age: percentile(failAges, 0.1), medianAge: percentile(failAges, 0.5), count: failAges.length } : null,
      config: c,
    };
  }

  /** Default capital-market assumptions for India (nominal, annual). Editable by the caller. */
  const DEFAULT_ASSUMPTIONS = {
    equity: { mean: 0.12, vol: 0.18, beta: 1.0 },
    debt:   { mean: 0.075, vol: 0.035, beta: 0.15 },
    gold:   { mean: 0.08, vol: 0.14, beta: 0.1 },
  };

  /** Solve for the monthly contribution that reaches `target` success probability (binary search). */
  function solveContribution(cfg, target, opts) {
    const goal = target === undefined ? 0.85 : target;
    let lo = 0, hi = Math.max(1000, (cfg.monthlyContribution || 0) * 10, (cfg.monthlyExpenseToday || 0) * 5);
    const quick = Object.assign({}, cfg, { runs: (opts && opts.runs) || 1500, successOnly: true });
    if (simulate(Object.assign({}, quick, { monthlyContribution: hi })).successRate < goal) return null;   // unreachable in range
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (simulate(Object.assign({}, quick, { monthlyContribution: mid })).successRate >= goal) hi = mid; else lo = mid;
    }
    return Math.ceil(hi / 500) * 500;                  // round up to the nearest ₹500
  }

  return { simulate, solveContribution, DEFAULT_ASSUMPTIONS, _rng: rng, _logParams: logParams };
});
