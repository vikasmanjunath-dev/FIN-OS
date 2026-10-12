// Credit score tracker maths: band, health, the home-loan rate it implies, and which improvement tips apply.
// The same rules as js/finos-credit-score.js (the wording is generated from it, see creditScoreData.ts) with the one difference that
// nothing is assumed: a score that was not entered produces no result, and an unknown utilisation / late count / inquiry count is 0,
// so no tip is raised from a number nobody typed. __tests__/creditScore.parity.test.mts compares the outputs.
import { BANDS, TIPS, type Band, type Tip } from '@/lib/creditScoreData';

export const KEYS = {
  score: 'finos_cibil_score', util: 'finos_credit_util_pct', health: 'finos_credit_health', late: 'finos_credit_late', inquiries: 'finos_credit_inquiries',
} as const;

export interface CreditInputs { score: number; utilization: number; latePayments: number; recentInquiries: number; oldestAgeYears?: number; securedAccounts?: number; unsecuredAccounts?: number }
export interface ActiveTip extends Tip { category: string }
export interface CreditResult { band: Band; health: 'good' | 'fair' | 'poor'; rateSpread: string; extraInterestCost: number; activeTips: ActiveTip[]; scoreProjection: number }

export const validScore = (n: number) => Number.isInteger(n) && n >= 300 && n <= 900;
export const bandOf = (score: number): Band => BANDS.find(b => score >= b.min && score <= b.max) || BANDS[BANDS.length - 1];

export function compute(p: CreditInputs): CreditResult {
  const band = bandOf(p.score);
  const health = p.score >= 750 ? 'good' : p.score >= 650 ? 'fair' : 'poor';
  const baseRate = 8.5;
  const rateSpread = band.hlRate > 0 ? (band.hlRate - baseRate).toFixed(2) : 'N/A';

  // Extra interest from the rate spread on a ₹50L, 20-year home loan
  let extraInterestCost = 0;
  if (band.hlRate > 0 && rateSpread !== 'N/A' && parseFloat(rateSpread) > 0) {
    const P = 5_000_000, n = 20 * 12;
    const rB = baseRate / 100 / 12, rC = band.hlRate / 100 / 12;
    const emiB = (P * rB * Math.pow(1 + rB, n)) / (Math.pow(1 + rB, n) - 1);
    const emiC = (P * rC * Math.pow(1 + rC, n)) / (Math.pow(1 + rC, n) - 1);
    extraInterestCost = Math.round((emiC - emiB) * n);
  }

  const age = p.oldestAgeYears ?? 3, secured = p.securedAccounts ?? 1, unsecured = p.unsecuredAccounts ?? 1;
  const tips: ActiveTip[] = [];
  if (p.utilization > 30) tips.push({ ...TIPS.utilization[0], category: 'Utilization' });
  else if (p.utilization > 10) tips.push({ ...TIPS.utilization[1], category: 'Utilization' });
  tips.push({ ...TIPS.payments[0], category: 'Payments' });
  if (p.latePayments > 0) tips.push({ ...TIPS.payments[1], category: 'Payments' });
  if (age < 5) tips.push({ ...TIPS.age[0], category: 'Credit Age' });
  if (p.recentInquiries >= 2) tips.push({ ...TIPS.inquiries[0], category: 'Inquiries' });
  if (secured === 0 || unsecured === 0) tips.push({ ...TIPS.mix[0], category: 'Credit Mix' });

  const scoreProjection = Math.min(850, p.score + (p.utilization > 30 ? 40 : p.utilization > 10 ? 20 : 0) + (p.latePayments > 0 ? 60 : 0) + (p.recentInquiries >= 2 ? 15 : 0));
  return { band, health, rateSpread, extraInterestCost, activeTips: tips, scoreProjection };
}

/** Typed fields -> inputs, or null when there is no valid score yet. A blank other field is unknown (0), never a default. */
export function fromFields(f: { score: string; util: string; late: string; inquiries: string }): { inputs: CreditInputs; known: { util: boolean; late: boolean; inquiries: boolean } } | null {
  const score = f.score.trim() === '' ? NaN : Number(f.score);
  if (!validScore(score)) return null;
  const n = (v: string) => { const x = v.trim() === '' ? NaN : Number(v); return Number.isFinite(x) && x >= 0 ? x : 0; };
  return {
    inputs: { score, utilization: Math.min(100, n(f.util)), latePayments: Math.floor(n(f.late)), recentInquiries: Math.floor(n(f.inquiries)) },
    known: { util: f.util.trim() !== '', late: f.late.trim() !== '', inquiries: f.inquiries.trim() !== '' },
  };
}
