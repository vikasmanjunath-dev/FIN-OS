// The one bundle of "what the phone knows about this person today" that PULSE, Arya's local tools, the life-event rules and the
// "what Arya will be told" preview all read. Pure: it is built from values already worked out by the app's own cores
// (lib/trackers.ts computeAll, lib/alerts.ts, lib/nudges.ts, lib/subscriptions.ts, lib/calendar.ts ...), so a number here is the
// number the screen shows. Nothing is defaulted: an unknown figure is 0 / null and every consumer says "not recorded".
import { EMPTY_TRACKER_DATA, computeAll, type TrackerData } from '@/lib/trackers';
import type { Alert } from '@/lib/alerts';
import type { Nudge } from '@/lib/nudges';
import type { Summary } from '@/lib/subscriptions';
import type { CalEvent } from '@/lib/calendar';
import { best as bestRegime, STD_NEW, STD_OLD } from '@/lib/taxcore';

export interface MoneyScoreLite {
  score: number;
  band: string;
  weakestLabel: string | null;
  weakestScore: number | null;
  topTitle: string | null;
  topHref: string | null;
  /** ISO time the score was worked out */
  at: string | null;
}

export interface NwPoint { date: string; value: number }
export interface LoanFact { key: string; label: string; balance: number; rate: number; emi: number }
export interface TaxInputsFact { income: string; used80c: string; usedHealth: string; usedNps: string }

export interface ArFacts {
  now: Date;
  data: TrackerData;
  computed: ReturnType<typeof computeAll>;
  /** people who depend on your income, from Profile; null = not recorded */
  dependents: number | null;
  moneyScore: MoneyScoreLite | null;
  scoreHistory: { date: string; score: number }[];
  subs: Summary | null;
  /** every dated item the calendar knows, soonest first (collectEvents) */
  events: CalEvent[];
  taxInputs: TaxInputsFact;
  loans: LoanFact[];
  alerts: Alert[];
  nudges: Nudge[];
  nwHistory: NwPoint[];
  /** the retirement planner's own stored inputs (lib/retirementPlan RETIRE_KEYS) */
  retirementStore: Record<string, string>;
}

/** Facts from partial pieces. The loader and the tests both go through this, so they cannot disagree about derived values. */
export function makeFacts(over: Partial<Omit<ArFacts, 'data' | 'computed'>> & { data?: Partial<TrackerData>; now?: Date } = {}): ArFacts {
  const now = over.now ?? new Date();
  const data: TrackerData = { ...EMPTY_TRACKER_DATA, ...(over.data || {}) };
  return {
    now, data, computed: computeAll(data, now),
    dependents: over.dependents ?? null,
    moneyScore: over.moneyScore ?? null,
    scoreHistory: over.scoreHistory ?? [],
    subs: over.subs ?? null,
    events: over.events ?? [],
    taxInputs: over.taxInputs ?? { income: '', used80c: '', usedHealth: '', usedNps: '' },
    loans: over.loans ?? [],
    alerts: over.alerts ?? [],
    nudges: over.nudges ?? [],
    nwHistory: over.nwHistory ?? [],
    retirementStore: over.retirementStore ?? {},
  };
}

const num = (s: unknown) => { const n = Number(String(s ?? '').replace(/[,₹\s]/g, '')); return Number.isFinite(n) && n > 0 ? n : 0; };

/** Recorded monthly income, or 0 when it is not recorded. */
export const incomeMonthly = (f: ArFacts) => f.computed.budget.income;
/** Recorded monthly spending, or 0. */
export const expenseMonthly = (f: ArFacts) => f.computed.budget.expense;
/** Age in whole years: the profile age, else the date of birth held by the NPS tracker, else 0 (not recorded; the tracker's "30" is a default, not a fact). */
export function ageOf(f: ArFacts): number {
  if (f.data.age > 0) return f.data.age;
  const t = Date.parse(f.data.npsDob);
  if (!Number.isFinite(t)) return 0;
  const b = new Date(t), n = f.now;
  const a = n.getFullYear() - b.getFullYear() - (n < new Date(n.getFullYear(), b.getMonth(), b.getDate()) ? 1 : 0);
  return a >= 18 && a <= 100 ? a : 0;
}
/** Annual income the person gave the tax screen (before tax), or null. Monthly take-home x 12 is NOT used: it would understate it. */
export const taxAnnualIncome = (f: ArFacts): number | null => { const n = num(f.taxInputs.income); return n >= 100000 ? n : null; };
/** 80C already used: what the tax screen holds, else what the tracker holds; null when neither is recorded. */
export function used80c(f: ArFacts): number | null {
  const a = num(f.taxInputs.used80c);
  if (a > 0) return Math.min(150000, a);
  return f.data.used80c > 0 ? Math.min(150000, f.data.used80c) : null;
}
/** Net worth is "known" once any asset or liability is recorded; otherwise 0 means "nothing entered", not "worth nothing". */
export const netWorthKnown = (f: ArFacts) => f.computed.netWorth.totalAssets > 0 || f.computed.netWorth.totalLiabilities > 0;
export const holdingsValue = (f: ArFacts) => f.data.portfolio + f.data.mfImport + f.data.sipValue;

export const inr = (n: number) => '₹' + Math.round(Math.abs(n)).toLocaleString('en-IN');
export const inrSigned = (n: number) => (n < 0 ? '−' : '') + inr(n);
/** ₹1.25 Cr / ₹4.5 L / ₹12,345. */
export function inrShort(n: number): string {
  const a = Math.abs(n), s = n < 0 ? '−' : '';
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(2)} L`;
  return `${s}₹${Math.round(a).toLocaleString('en-IN')}`;
}
export const pct1 = (n: number) => `${(Math.round(n * 10) / 10).toString()}%`;

/** Income tax estimate from the annual income given to the tax screen (salary only, standard deduction, and the 80C that is recorded). */
export interface TaxEstimate { income: number; taxNew: number; taxOld: number; best: 'new' | 'old'; tax: number; used80c: number | null }
export function taxEstimate(f: ArFacts): TaxEstimate | null {
  const income = taxAnnualIncome(f);
  if (income === null) return null;
  const u = used80c(f);
  const b = bestRegime(Math.max(0, income - STD_NEW), Math.max(0, income - STD_OLD - (u ?? 0)));
  return { income, taxNew: b.taxNew, taxOld: b.taxOld, best: b.regime, tax: b.tax, used80c: u };
}
