// SIP step-up planner: a SIP raised by a fixed % every year against the same SIP kept flat.
// A typed port of the calculation half of js/finos-sip-stepup.js; __tests__/sipStepup.parity.test.mts compares them on random inputs.
// Deposits are month-end instalments, exactly as on the website.

export interface StepupParams { baseSIP: number; stepUpPct: number; years: number; returnPct: number }
export interface YearRow {
  year: number; sipFlat: number; sipStep: number; flatCorpus: number; stepCorpus: number; flatInvested: number; stepInvested: number; advantage: number;
}
export interface StepupResult {
  finalFlat: number; finalStep: number; advantage: number; flatInvested: number; stepInvested: number; yearlyData: YearRow[]; totalStepSIP: number;
}

export const STEPUP_DEFAULTS: StepupParams = { baseSIP: 10000, stepUpPct: 10, years: 20, returnPct: 12 };
export const LIMITS = { baseSIP: [500, 200000], stepUpPct: [0, 50], years: [1, 40], returnPct: [0, 100] } as const;

// Same as the website: undefined / junk → the default, but null and '' read as 0 and are then pulled up to the lower limit.
const finiteOr = (value: unknown, fallback: number) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

/** The values the maths actually uses: anything missing falls back to the default, anything out of range is pulled to the limit. */
export function normalise(raw: Partial<Record<keyof StepupParams, unknown>> | null | undefined): StepupParams {
  const r = raw || {};
  return {
    baseSIP: Math.min(200000, Math.max(500, finiteOr(r.baseSIP, 10000))),
    stepUpPct: Math.min(50, Math.max(0, finiteOr(r.stepUpPct, 10))),
    years: Math.round(Math.min(40, Math.max(1, finiteOr(r.years, 20)))),
    returnPct: Math.min(100, Math.max(0, finiteOr(r.returnPct, 12))),
  };
}

export function compute(params: Partial<Record<keyof StepupParams, unknown>> | null | undefined): StepupResult {
  const { baseSIP, stepUpPct, years, returnPct } = normalise(params);
  const r = returnPct / 100 / 12;
  let flatCorpus = 0, stepCorpus = 0, flatInvested = 0, stepInvested = 0;
  const yearlyData: YearRow[] = [];
  for (let y = 0; y < years; y++) {
    const monthlyFlat = Math.round(baseSIP);
    const monthlyStep = Math.round(baseSIP * Math.pow(1 + stepUpPct / 100, y));
    for (let m = 0; m < 12; m++) {
      flatCorpus = flatCorpus * (1 + r) + monthlyFlat;
      stepCorpus = stepCorpus * (1 + r) + monthlyStep;
      flatInvested += monthlyFlat;
      stepInvested += monthlyStep;
    }
    yearlyData.push({
      year: y + 1, sipFlat: monthlyFlat, sipStep: monthlyStep,
      flatCorpus: Math.round(flatCorpus), stepCorpus: Math.round(stepCorpus),
      flatInvested: Math.round(flatInvested), stepInvested: Math.round(stepInvested),
      advantage: Math.round(stepCorpus - flatCorpus),
    });
  }
  const finalFlat = Math.round(flatCorpus), finalStep = Math.round(stepCorpus);
  return { finalFlat, finalStep, advantage: finalStep - finalFlat, flatInvested, stepInvested, yearlyData, totalStepSIP: yearlyData[yearlyData.length - 1].sipStep };
}

export const SCENARIO_PCTS = [5, 10, 15, 20] as const;

/** The four "what if I step up by…" cards. */
export function scenarios(p: StepupParams) {
  return SCENARIO_PCTS.map(pct => ({ pct, selected: pct === p.stepUpPct, ...compute({ ...p, stepUpPct: pct }) }));
}

/** How much more wealth the step-up gives, as a whole percentage of the flat corpus. */
export const advantagePct = (r: StepupResult) => (r.finalFlat > 0 ? Math.round((r.advantage / r.finalFlat) * 100) : 0);

/** The year the step-up corpus first crosses ₹25 L, ₹50 L and ₹1 Cr (the website marks only the highest one reached in a year). */
export function milestones(rows: YearRow[]): { year: number; label: string }[] {
  const out: { year: number; label: string }[] = [];
  rows.forEach((d, i) => {
    const prev = i > 0 ? rows[i - 1].stepCorpus : undefined;
    const crossed = (lim: number) => d.stepCorpus >= lim && prev !== undefined && prev < lim;
    const label = crossed(1e7) ? '🎯 1 Cr' : crossed(5e6) ? '✨ 50 L' : crossed(2.5e6) ? '🌱 25 L' : '';
    if (label) out.push({ year: d.year, label });
  });
  return out;
}
