// Portfolio growth projection: what today's holdings plus the monthly SIPs could grow to at a yearly return the PERSON sets.
// Same arithmetic as the website's Growth Simulator calculator (calculators/investment & wealth/portfolio.html, and the phone's
// "growth" calculator): a lump sum compounded monthly plus a SIP paid at the start of each month. Additions here:
//   - an optional yearly step-up of the SIP,
//   - the figure in today's rupees (inflation-adjusted) when the person gives an inflation rate,
//   - the same projection two points lower and higher, so one assumed number is never shown as the answer,
//   - a year-by-year table.
// It is a projection at an assumed rate, before tax and fund costs, not a forecast. Nothing here knows or guesses a return.

export interface SimInput {
  startCorpus: number;        // rupees invested today
  monthlySip: number;         // rupees added at the start of every month
  stepUpPct: number;          // the SIP rises by this % every 12 months (0 = flat)
  years: number;              // 1..60
  annualReturn: number;       // % a year, 0..50
  inflationPct?: number | null;   // % a year; when given, a real (today's rupees) value is returned too
}
export interface SimPoint { year: number; value: number; invested: number; real: number | null }
export interface SimResult {
  points: SimPoint[]; final: number; invested: number; gain: number; realFinal: number | null;
  lastMonthlySip: number;     // the SIP in the final year (differs from monthlySip with a step-up)
}

export function validateSim(i: SimInput): string | null {
  const fin = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
  if (!fin(i.startCorpus) || i.startCorpus < 0) return 'Enter what you have invested today (0 if nothing).';
  if (!fin(i.monthlySip) || i.monthlySip < 0) return 'Enter the monthly SIP (0 if none).';
  if (i.startCorpus === 0 && i.monthlySip === 0) return 'Enter an amount invested today or a monthly SIP.';
  if (!fin(i.stepUpPct) || i.stepUpPct < 0 || i.stepUpPct > 50) return 'Yearly step-up must be between 0% and 50%.';
  if (!fin(i.years) || i.years < 1 || i.years > 60) return 'Enter a period of 1 to 60 years.';
  if (!fin(i.annualReturn) || i.annualReturn < 0 || i.annualReturn > 50) return 'Enter the yearly return you assume, between 0% and 50%.';
  if (i.inflationPct != null && (!fin(i.inflationPct) || i.inflationPct < 0 || i.inflationPct > 50)) return 'Inflation must be between 0% and 50%.';
  return null;
}

export function simulate(i: SimInput): SimResult {
  const years = Math.round(i.years);
  const r = i.annualReturn / 100 / 12, g = i.stepUpPct / 100;
  const inf = i.inflationPct != null ? i.inflationPct / 100 : null;
  let value = i.startCorpus, invested = i.startCorpus, sip = i.monthlySip;
  const points: SimPoint[] = [{ year: 0, value, invested, real: inf != null ? value : null }];
  for (let m = 1; m <= years * 12; m++) {
    if (m > 1 && (m - 1) % 12 === 0) sip *= 1 + g;
    value = (value + sip) * (1 + r);
    invested += sip;
    if (m % 12 === 0) {
      const y = m / 12;
      points.push({ year: y, value, invested, real: inf != null ? value / Math.pow(1 + inf, y) : null });
    }
  }
  const last = points[points.length - 1];
  return { points, final: last.value, invested: last.invested, gain: last.value - last.invested, realFinal: last.real, lastMonthlySip: sip };
}

/** The same projection at the person's rate minus and plus `delta` points (the lower one never below 0%). */
export function scenarios(i: SimInput, delta = 2): { low: SimResult; mid: SimResult; high: SimResult; lowRate: number; highRate: number } {
  const lowRate = Math.max(0, i.annualReturn - delta), highRate = i.annualReturn + delta;
  return { low: simulate({ ...i, annualReturn: lowRate }), mid: simulate(i), high: simulate({ ...i, annualReturn: highRate }), lowRate, highRate };
}
