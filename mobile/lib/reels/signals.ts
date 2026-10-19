// Everything the reels ranker knows about the person today, gathered from data already on the phone. `deriveSignals` is pure (so the rules are
// tested with made-up people); `loadSignals` only reads what the app already stores. Nothing is written, sent or kept here.
import { loadProfile } from '@/lib/profileStorage';
import { loadLifeEvents } from '@/lib/lifeEventsStorage';
import { loadSavedScore } from '@/lib/moneyScoreStorage';
import { phaseOf, type DeclaredEvent, type LifeEventType } from '@/lib/lifeEvents';
import { loadMine, type Mine } from '@/lib/reels/mine';
import type { PillarId } from '@/lib/reels/journey';

export const PILLARS: PillarId[] = ['savings', 'emergency', 'insurance', 'debt', 'investing', 'wealth'];

/** Loan payments above this share of monthly income count as strain. A placeholder: a finance professional should set the real line before release. */
export const STRAIN_RATIO = 0.5;

export interface Signals {
  now: Date;
  /** Money Score pillar scores (0 to 100) when a score has been saved; empty otherwise. */
  pillars: Partial<Record<PillarId, number>>;
  weakest: PillarId | null;
  mine: Mine;
  /** Declared life events that are active today (their lead time has begun and their window has not ended). */
  events: LifeEventType[];
  income?: number;
  age?: number;
  /** Money strain: the biggest loan's EMI is over STRAIN_RATIO of income, or the person has declared a loss of income. */
  strain: boolean;
  /** Emergency fund as months of spending, when both are known. */
  fundMonths?: number;
  hasLoan: boolean;
}

export interface SignalInput {
  now: Date;
  pillars?: { id: string; score: number }[] | null;
  weakestId?: string | null;
  mine?: Mine;
  events?: DeclaredEvent[];
  income?: string | number | null;
  age?: string | number | null;
}

const isPillar = (x: unknown): x is PillarId => PILLARS.includes(x as PillarId);
const pos = (v: unknown): number | undefined => { const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[₹,\s]/g, '')); return Number.isFinite(n) && n > 0 ? n : undefined; };

export function deriveSignals(i: SignalInput): Signals {
  const mine = i.mine ?? {};
  const pillars: Signals['pillars'] = {};
  for (const p of i.pillars ?? []) if (isPillar(p.id) && Number.isFinite(p.score)) pillars[p.id] = Math.min(100, Math.max(0, p.score));
  const events = (i.events ?? []).filter(e => phaseOf(e, i.now) === 'active').map(e => e.type);
  const income = pos(i.income), age = pos(i.age);
  const lossOfIncome = events.includes('job_loss');
  const loanStrain = !!(mine.loan && income && mine.loan.emi / income >= STRAIN_RATIO);
  return {
    now: i.now, pillars, weakest: isPillar(i.weakestId) ? i.weakestId : null, mine, events: Array.from(new Set(events)),
    ...(income ? { income } : {}), ...(age ? { age } : {}),
    strain: lossOfIncome || loanStrain,
    ...(mine.fund && mine.spend ? { fundMonths: mine.fund / mine.spend } : {}),
    hasLoan: !!mine.loan,
  };
}

/** Reads the person's data from the phone. Anything missing or unreadable is simply left out. */
export async function loadSignals(now: Date = new Date()): Promise<Signals> {
  const [score, mine, events, profile] = await Promise.all([loadSavedScore().catch(() => null), loadMine(), loadLifeEvents(now.getTime()).catch(() => []), loadProfile().catch(() => null)]);
  return deriveSignals({ now, pillars: score?.pillars ?? null, weakestId: score?.weakest?.id ?? null, mine, events, income: profile?.income ?? null, age: profile?.age ?? null });
}
