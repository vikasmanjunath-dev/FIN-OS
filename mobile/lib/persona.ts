// Home greeting and status strip, from recorded facts only. The honest subset of the website's js/finos-personalization.js
// (FinosPersona.injectGreeting / injectStatusStrip):
//   kept     time-of-day greeting with the person's first name, the "N-day streak" line, a strip of Savings rate / Net worth / Money Score
//   dropped  the "Investor" name fallback (no name recorded = no name shown), Financial DNA archetype and life stage (the phone has no
//            archetype names), the Health score chip (the Health Score rests on a neutral Financial DNA baseline and a 60,000 income
//            fallback when those are missing, so it is not "only recorded"), FIRE % (an estimate on assumptions), trade-journal win rate
//            (no journal on the phone)
// Pure: no React Native, no storage; "now" is a parameter. __tests__/persona.test.mts covers it.

export const PERSONA_KEY = 'finos_persona_mobile';          // device-only (lib/storageKeys.ts DEVICE_ONLY_KEYS)

export type DayPart = 'night' | 'morning' | 'afternoon' | 'evening';
/** Same cut-offs as the website's greetByTime(): before 5 and from 21 it is night. */
export function dayPart(hour: number): DayPart {
  if (!Number.isFinite(hour)) return 'morning';
  return hour < 5 ? 'night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';
}
export const GREETING: Record<DayPart, string> = {
  night: 'Good night', morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening',
};

/** First word of the recorded name, or null when none is recorded. Never a stand-in such as "Friend" or "Investor". */
export function firstName(full: unknown): string | null {
  const t = (typeof full === 'string' ? full.slice(0, 80) : '').trim();
  if (!t) return null;
  const w = t.split(/\s+/)[0].slice(0, 24);
  return /[\p{L}\p{N}]/u.test(w) ? w : null;
}

/** "🔥 5-day streak" once the app has been opened on two or more days in a row; nothing before that. */
export function streakLine(count: unknown): string | null {
  const n = Math.floor(Number(count));
  return Number.isFinite(n) && n >= 2 ? `🔥 ${n}-day streak` : null;
}

export type StripTone = 'good' | 'warn' | 'info';
export interface StripItem { id: 'savings' | 'networth' | 'score'; label: string; value: string; tone: StripTone; route: string; a11y: string }

export interface StripFacts {
  /** % of income saved; null while income or spending is not both recorded */
  savingsRate: number | null;
  /** rupees; null while nothing is recorded as an asset or a debt */
  netWorth: number | null;
  /** the Money Score the person worked out, if any, with the day it was worked out */
  moneyScore: { score: number; at?: string } | null;
}

const inrShort = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? '−' : '';
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(1)} Cr`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(1)} L`;
  if (a >= 1e3) return `${s}₹${Math.round(a / 1e3)}K`;
  return `${s}₹${Math.round(a)}`;
};

/** Only facts that are recorded become chips; an unknown one is left out, never shown as 0. */
export function buildStrip(f: StripFacts, now: Date = new Date()): StripItem[] {
  const out: StripItem[] = [];
  if (f.savingsRate !== null && Number.isFinite(f.savingsRate)) {
    out.push({ id: 'savings', label: 'Savings rate', value: `${Math.round(f.savingsRate)}%`, tone: f.savingsRate >= 20 ? 'good' : 'warn', route: '/tracker/budget',
      a11y: `Savings rate ${Math.round(f.savingsRate)} percent of income. Open the budget` });
  }
  if (f.netWorth !== null && Number.isFinite(f.netWorth)) {
    out.push({ id: 'networth', label: 'Net worth', value: inrShort(f.netWorth), tone: f.netWorth < 0 ? 'warn' : 'info', route: '/tracker/networth',
      a11y: `Net worth ${inrShort(f.netWorth)}. Open the net worth tracker` });
  }
  if (f.moneyScore && Number.isFinite(f.moneyScore.score)) {
    const sc = Math.round(f.moneyScore.score);
    const when = f.moneyScore.at ? new Date(f.moneyScore.at) : null;
    const day = when && Number.isFinite(when.getTime()) && when <= new Date(now.getTime() + 864e5) ? `, worked out on ${when.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : '';
    out.push({ id: 'score', label: 'Money Score', value: `${sc}/100`, tone: sc >= 70 ? 'good' : sc >= 40 ? 'info' : 'warn', route: '/tools/score',
      a11y: `Money Score ${sc} out of 100${day}. Open the Money Score` });
  }
  return out;
}

export interface PersonaPrefs { stripHidden: boolean }
// Off unless asked for: the strip repeats the savings rate and net worth that the Home hero card shows a moment later. Settings turns it on.
export const DEFAULT_PREFS: PersonaPrefs = { stripHidden: true };
/** Only an explicit `false` (chosen in Settings) shows the strip; a stored value of the wrong shape reads as the default (hidden). */
export function normalisePrefs(raw: unknown): PersonaPrefs {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw) && (raw as any).stripHidden === false ? { stripHidden: false } : { ...DEFAULT_PREFS };
}
