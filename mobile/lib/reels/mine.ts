// The person's own figures, read from what they already entered in the app. Used only to fill a reel's examples; nothing is written, sent
// or stored here. Anything missing, non-numeric or outside a sane range is left out, and that reel simply keeps its example figures.
import { getMany } from '@/lib/safeStore';
import type { L } from '@/lib/reels/types';

export interface MineLoan { label: L; balance: number; rate: number; emi: number }
export interface Mine { sip?: number; spend?: number; fund?: number; loan?: MineLoan }

export const MINE_KEYS = [
  'finos_sip_total', 'finos_sip_monthly', 'finos_monthly_expense', 'finos_budget_expenses', 'finos_emergency_fund',
  'finos_home_loan', 'finos_home_loan_rate', 'finos_home_loan_emi',
  'finos_car_loan', 'finos_car_loan_rate', 'finos_car_loan_emi',
  'finos_personal_loan', 'finos_personal_loan_rate', 'finos_personal_loan_emi',
] as const;

const LOANS: { bal: string; rate: string; emi: string; label: L }[] = [
  { bal: 'finos_home_loan', rate: 'finos_home_loan_rate', emi: 'finos_home_loan_emi', label: { en: 'home loan', hi: 'होम लोन' } },
  { bal: 'finos_car_loan', rate: 'finos_car_loan_rate', emi: 'finos_car_loan_emi', label: { en: 'car loan', hi: 'कार लोन' } },
  { bal: 'finos_personal_loan', rate: 'finos_personal_loan_rate', emi: 'finos_personal_loan_emi', label: { en: 'personal loan', hi: 'पर्सनल लोन' } },
];

const num = (v: string | null | undefined): number => { const n = Number(String(v ?? '').replace(/[₹,\s]/g, '')); return Number.isFinite(n) ? n : NaN; };
const within = (n: number, lo: number, hi: number): number | undefined => (n >= lo && n <= hi ? Math.round(n) : undefined);

/** Limits keep a typo (or a stray 0) from making a reel say something silly: a SIP of ₹500 to ₹5 lakh, spending of ₹5,000 to ₹10 lakh a month, and so on. */
export function deriveMine(raw: Record<string, string | null | undefined>): Mine {
  const mine: Mine = {};
  const sip = within(num(raw.finos_sip_total) > 0 ? num(raw.finos_sip_total) : num(raw.finos_sip_monthly), 500, 500_000);
  if (sip) mine.sip = sip;
  const spend = within(num(raw.finos_monthly_expense) > 0 ? num(raw.finos_monthly_expense) : num(raw.finos_budget_expenses), 5_000, 1_000_000);
  if (spend) mine.spend = spend;
  const fund = within(num(raw.finos_emergency_fund), 1_000, 100_000_000);
  if (fund) mine.fund = fund;
  let best: MineLoan | undefined;
  for (const l of LOANS) {
    const balance = within(num(raw[l.bal]), 10_000, 500_000_000), emi = within(num(raw[l.emi]), 500, 50_000_000);
    const rate = num(raw[l.rate]);
    if (!balance || !emi || !(rate >= 1 && rate <= 40)) continue;
    if (emi <= (balance * rate) / 1200) continue;                       // an EMI that does not even cover the interest is not a loan this reel can describe
    if (!best || balance > best.balance) best = { label: l.label, balance, rate: Math.round(rate * 100) / 100, emi };
  }
  if (best) mine.loan = best;
  return mine;
}

export async function loadMine(): Promise<Mine> {
  try { return deriveMine(await getMany(MINE_KEYS)); } catch { return {}; }
}
