// "Will my money last?" from what the Retirement planner holds, for Arya's tool and the PULSE card.
//
// The Retirement planner screen fills in a retire age of 60, spending of ₹50,000 and a current age of 30 when you have typed nothing.
// That is fine on that screen (it says so and you can see the fields), but Arya must not announce "an X% chance" built on an age or a
// spending figure the person never gave. So this runs ONLY when the three inputs that decide the answer are really stored:
//   - the age you plan to retire (finos_retire_age),
//   - what you expect to spend a month in retirement, in today's rupees (finos_retire_exp_mo),
//   - your age now (from the date of birth the EPF or NPS tracker holds, or finos_retire_current_age).
// Everything else (inflation, returns) uses the planner's own defaults and the answer says so.
// Pure: the stored values come in, the seeded simulation (lib/montecarlo, parity-tested with the website) runs, the result goes out.
import { computePlan, mcConfig, verdictFor, type Plan } from '@/lib/retirementPlan';
import { simulate, DEFAULT_ASSUMPTIONS } from '@/lib/montecarlo';

export interface RetireOdds {
  ok: true;
  pct: number;
  verdict: { label: string; tone: 'good' | 'warn' | 'bad' };
  plan: Plan;
  runs: number;
  /** every assumption the simulation used that the person did not set, in words */
  assumed: string[];
  /** one sentence naming the returns and inflation the simulation drew from */
  assumptions: string;
  holdings: { equity: number; debt: number; gold: number };
  depletionMedianAge: number | null;
}
export interface RetireMissing { ok: false; missing: string[] }

const has = (store: Record<string, string>, k: string) => String(store[k] ?? '').trim() !== '';
const numOf = (store: Record<string, string>, k: string) => {
  const raw = String(store[k] ?? '').trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(raw)) return 0;
  const n = Number(raw.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const validDob = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const dim = [31, ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return month >= 1 && month <= 12 && day >= 1 && day <= dim;
};

/** Which of the three deciding inputs are not stored (empty list = ready to run). */
export function retirementMissing(store: Record<string, string>, now = new Date()): string[] {
  const missing: string[] = [];
  const retireAge = numOf(store, 'finos_retire_age');
  if (!Number.isInteger(retireAge) || retireAge < 40 || retireAge > 80) missing.push('the age you plan to retire');
  if (!(numOf(store, 'finos_retire_exp_mo') > 0)) missing.push('what you expect to spend a month in retirement');
  const dob = String(store.finos_epf_dob || store.finos_nps_dob || '');
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const dobOk = validDob(dob) && dob <= today;
  const age = numOf(store, 'finos_retire_current_age');
  const ageOk = Number.isInteger(age) && age >= 18 && age <= 100;
  if (!dobOk && !ageOk) missing.push('your age (a valid date of birth in the EPF or NPS tracker, or your age in the planner)');
  return missing;
}

export function retirementOdds(store: Record<string, string>, now: Date, runs = 2000): RetireOdds | RetireMissing {
  const missing = retirementMissing(store, now);
  if (missing.length) return { ok: false, missing };
  const read = (k: string) => store[k];
  const plan = computePlan(read, now);
  const cfg: any = mcConfig(plan, read);
  const [eq, debt, gold] = cfg.assets;
  if (!(eq.value + debt.value + gold.value > 0)) return { ok: false, missing: ['investments to simulate (EPF, PPF, NPS, SIPs, stocks, FDs or gold in the trackers)'] };
  const r: any = simulate({ ...cfg, runs });
  const pct = Math.round(r.successRate * 100);
  const A = DEFAULT_ASSUMPTIONS as Record<string, { mean: number; vol: number }>;
  const assumed: string[] = [];
  if (!has(store, 'finos_retire_inflation')) assumed.push('inflation 6% a year (the planner\'s default)');
  if (!has(store, 'finos_retire_eq_return')) assumed.push('equity return 12% a year (the planner\'s default)');
  if (!has(store, 'finos_retire_stepup') && cfg.monthlyContribution > 0) assumed.push('no yearly step-up in what you invest');
  if (!has(store, 'finos_retire_end_age')) assumed.push('money must last to age 90 (the planner\'s default)');
  const assumptions = `${runs.toLocaleString('en-IN')} simulated futures: equity ${(eq.mean * 100).toFixed(0)}% ± ${(A.equity.vol * 100).toFixed(0)}, debt ${(debt.mean * 100).toFixed(1)}% ± ${(A.debt.vol * 100).toFixed(1)}, gold ${(gold.mean * 100).toFixed(0)}% ± ${(A.gold.vol * 100).toFixed(0)}; inflation ${(cfg.inflation * 100).toFixed(0)}% ± 1.5; money must last to age ${cfg.endAge}.`;
  return {
    ok: true, pct, verdict: verdictFor(pct), plan, runs, assumed, assumptions,
    holdings: { equity: eq.value, debt: debt.value, gold: gold.value },
    depletionMedianAge: r.depletion ? Math.round(r.depletion.medianAge) : null,
  };
}
