// "Worth a look": a few specific, dismissible prompts on the home screen, drawn from what the person has actually recorded.
// Pure (facts and "today" go in, nudges come out). The rules follow the website's computeNudges() where the phone has the data.
// A nudge is only ever raised from a recorded fact. Missing data produces an invitation to record it, never a guess.

export interface NudgeFacts {
  moneyScore: number | null;           // null: not taken
  incomeMonthly: number;               // 0: unknown
  savingsRate: number | null;          // null: unknown
  topCategory: { name: string; spent: number } | null;   // this month's biggest spending category
  spentThisMonth: number;
  subscriptionsMonthly: number;
  subscriptionsCount: number;
  hasSip: boolean;
  remindersEnabled: boolean;
  dueIn7: number;                      // calendar items due within a week
  dnaDone: boolean;
}

export type NudgeTone = 'alert' | 'warn' | 'good';
export interface Nudge { id: string; tone: NudgeTone; icon: string; title: string; body: string; action: string; route: string }

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const k = (n: number) => '₹' + (n / 1000).toFixed(0) + 'K';

export function computeNudges(f: NudgeFacts): Nudge[] {
  const out: Nudge[] = [];

  if (f.incomeMonthly > 0 && f.topCategory && f.topCategory.spent > 0) {
    const pct = Math.round((f.topCategory.spent / f.incomeMonthly) * 100);
    if (pct > 35) out.push({ id: 'top-category', tone: 'alert', icon: '🚨', title: `${f.topCategory.name} is ${pct}% of your income`, body: `You have spent ${inr(f.topCategory.spent)} on ${f.topCategory.name} this month.`, action: 'Review spending', route: '/tracker/budget' });
  }
  if (f.incomeMonthly > 0 && f.savingsRate !== null && f.savingsRate < 10) {
    out.push({ id: 'low-savings', tone: 'warn', icon: '⚠️', title: 'Savings rate below 10%', body: `You are keeping ${Math.max(0, Math.round(f.savingsRate))}% of ${k(f.incomeMonthly)} a month. 20% or more is a healthier target.`, action: 'Open budget', route: '/tracker/budget' });
  }
  if (f.subscriptionsMonthly > 2000) {
    out.push({ id: 'subscriptions', tone: 'warn', icon: '📱', title: `${inr(f.subscriptionsMonthly)} a month in subscriptions`, body: `${f.subscriptionsCount} active. Small renewals add up to a lot over a year.`, action: 'Review them', route: '/tracker/subscriptions' });
  }
  if (!f.remindersEnabled && f.dueIn7 > 0) {
    out.push({ id: 'reminders', tone: 'warn', icon: '🔔', title: `${f.dueIn7} thing${f.dueIn7 === 1 ? '' : 's'} due this week`, body: 'Turn on reminders and the phone will tell you before the next one.', action: 'Turn on reminders', route: '/settings' });
  }
  if (f.moneyScore !== null && f.moneyScore < 60) {
    out.push({ id: 'score-low', tone: 'warn', icon: '🧭', title: `Your Money Score is ${f.moneyScore}/100`, body: 'Open your plan to see the three moves that would lift it most.', action: 'See my plan', route: '/tools/score' });
  }
  if (f.incomeMonthly > 20000 && !f.hasSip) {
    out.push({ id: 'no-sip', tone: 'warn', icon: '📈', title: 'No SIP recorded', body: 'A small monthly SIP, started now, does more than a large one started later.', action: 'Plan a SIP', route: '/tools/calc/sip' });
  }
  if (f.moneyScore === null) {
    out.push({ id: 'score-start', tone: 'good', icon: '🧭', title: 'Get your Money Score in 60 seconds', body: 'One number for your money picture and the three moves that would lift it. It stays on this phone.', action: 'Get my score', route: '/tools/score' });
  }
  if (!f.dnaDone) {
    out.push({ id: 'dna', tone: 'good', icon: '🧬', title: 'Take the Financial DNA quiz', body: 'Nine questions. It feeds the Behaviour part of your Health Score.', action: 'Start the quiz', route: '/tools/dna' });
  }

  const rank: Record<NudgeTone, number> = { alert: 0, warn: 1, good: 2 };
  return out.sort((a, b) => rank[a.tone] - rank[b.tone]);
}

export type Dismissed = Record<string, string>;      // nudge id -> ISO day it comes back
const addDays = (iso: string, n: number) => { const [y, m, d] = iso.split('-').map(Number); const t = new Date(y, m - 1, d + n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };

/** Drops what was dismissed and has not yet come back, keeps at most `max`. */
export function visible(nudges: Nudge[], dismissed: Dismissed, today: string, max = 3): Nudge[] {
  return nudges.filter(n => !(dismissed[n.id] && dismissed[n.id] > today)).slice(0, max);
}
export const dismiss = (dismissed: Dismissed, id: string, today: string, days = 7): Dismissed => ({ ...dismissed, [id]: addDays(today, days) });
export function normaliseDismissed(raw: unknown): Dismissed {
  const out: Dismissed = {};
  if (raw && typeof raw === 'object') Object.entries(raw as Record<string, unknown>).forEach(([id, v]) => { if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) out[id] = v; });
  return out;
}
