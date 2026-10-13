// Annualised return from dated cash flows (the same definition as the spreadsheet XIRR: days / 365).
// Pure. A holding only counts when the person entered when they bought it: there is no assumed date.

export interface Flow { date: string; amount: number }

const DAY = 86400000;
const t = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };

/** Net present value of the flows at an annual rate, relative to the first flow's date. */
function npv(flows: Flow[], rate: number, t0: number): number {
  return flows.reduce((s, f) => s + f.amount / Math.pow(1 + rate, (t(f.date) - t0) / DAY / 365), 0);
}

/** The annual rate that makes the flows sum to zero, or null if there is none (needs a deposit and a return, on different days). */
export function xirr(flows: Flow[]): number | null {
  const fl = flows.filter(f => /^\d{4}-\d{2}-\d{2}$/.test(f.date) && Number.isFinite(f.amount) && f.amount !== 0);
  if (fl.length < 2) return null;
  if (!fl.some(f => f.amount < 0) || !fl.some(f => f.amount > 0)) return null;
  const t0 = Math.min(...fl.map(f => t(f.date)));
  if (Math.max(...fl.map(f => t(f.date))) === t0) return null;
  // bisection on (-99.99%, +1,000,000%): npv is monotone in the rate when there is one sign change
  let lo = -0.9999, hi = 10000;
  let fLo = npv(fl, lo, t0), fHi = npv(fl, hi, t0);
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi) || fLo * fHi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2, fm = npv(fl, mid, t0);
    if (Math.abs(fm) < 1e-9 || (hi - lo) < 1e-12) return mid;
    if (fLo * fm < 0) { hi = mid; fHi = fm; } else { lo = mid; fLo = fm; }
  }
  return (lo + hi) / 2;
}

export interface DatedHolding { key: string; invested: number; current: number; boughtOn: string }

/** Per holding and overall. Holdings without a valid date are not in either. */
export function portfolioXirr(rows: DatedHolding[], today: string): { overall: number | null; perHolding: Record<string, number | null>; counted: number; invested: number; current: number } {
  const per: Record<string, number | null> = {};
  const flows: Flow[] = [];
  let invested = 0, current = 0, counted = 0;
  for (const r of rows) {
    if (!(r.invested > 0) || !(r.current >= 0) || !/^\d{4}-\d{2}-\d{2}$/.test(r.boughtOn) || r.boughtOn >= today) { per[r.key] = null; continue; }
    per[r.key] = xirr([{ date: r.boughtOn, amount: -r.invested }, { date: today, amount: r.current }]);
    flows.push({ date: r.boughtOn, amount: -r.invested });
    invested += r.invested; current += r.current; counted++;
  }
  if (counted) flows.push({ date: today, amount: current });
  return { overall: counted ? xirr(flows) : null, perHolding: per, counted, invested, current };
}

/** A date the person typed: YYYY-MM-DD, a real calendar day, between 1990 and today. */
export function parseBoughtOn(raw: string, today: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null;
  const iso = raw.trim();
  return iso >= '1990-01-01' && iso <= today ? iso : null;
}
