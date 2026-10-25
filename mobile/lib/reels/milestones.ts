// Real milestones: things that happened in the person's own money, noticed from figures already on the phone (never from using the app).
// The first check only records where they already are, silently, so nothing is celebrated that was true before the reels began. After that
// each new milestone is told once. Pure functions over the reels profile, tested with known answers.
import type { Mine } from '@/lib/reels/mine';
import type { ReelsProfile } from '@/lib/reels/reelsProfile';
import type { L } from '@/lib/reels/types';

export type MilestoneId = 'first-sip' | 'fund-3' | 'fund-6' | 'loan-clear';
export interface Milestone { id: MilestoneId; title: L; body: L }

export const MILESTONES: Milestone[] = [
  { id: 'first-sip', title: { en: 'You have a SIP running', hi: 'आपकी SIP चल रही है' }, body: { en: 'Money that moves to investments before you can spend it is the habit that matters most. Mitra noticed.', hi: 'ख़र्च से पहले निवेश में चला जाने वाला पैसा सबसे ज़रूरी आदत है। मित्रा ने देखा।' } },
  { id: 'fund-3', title: { en: 'Three months of cover', hi: 'तीन महीने का सहारा' }, body: { en: 'Your emergency fund now covers about three months of your spending. A lost job or a hospital bill no longer forces a loan.', hi: 'आपका इमरजेंसी फ़ंड अब आपके लगभग तीन महीने के ख़र्च जितना है। नौकरी छूटने या अस्पताल के बिल पर अब लोन लेना मजबूरी नहीं।' } },
  { id: 'fund-6', title: { en: 'Six months of cover', hi: 'छह महीने का सहारा' }, body: { en: 'Your emergency fund now covers about six months of your spending, the upper end of the usual rule of thumb. Well done.', hi: 'आपका इमरजेंसी फ़ंड अब आपके लगभग छह महीने के ख़र्च जितना है, यानी आम नियम की ऊपरी सीमा। शाबाश।' } },
  { id: 'loan-clear', title: { en: 'A loan cleared', hi: 'एक लोन चुक गया' }, body: { en: 'The loan you had is no longer on your figures. Its EMI is yours again.', hi: 'जो लोन आपके आँकड़ों में था, वह अब नहीं है। उसकी EMI अब आपकी है।' } },
];

const BY_ID = Object.fromEntries(MILESTONES.map(m => [m.id, m])) as Record<MilestoneId, Milestone>;
export const milestoneById = (id: string): Milestone | undefined => (BY_ID as Record<string, Milestone | undefined>)[id];

/** Which milestones the figures show right now. A cleared loan needs `hadLoan`: having no loan is not an achievement. */
export function achievedNow(mine: Mine, hadLoan: boolean): MilestoneId[] {
  const out: MilestoneId[] = [];
  if ((mine.sip ?? 0) > 0) out.push('first-sip');
  const months = mine.fund && mine.spend && mine.spend > 0 ? mine.fund / mine.spend : 0;
  if (months >= 3) out.push('fund-3');
  if (months >= 6) out.push('fund-6');
  if (hadLoan && !mine.loan) out.push('loan-clear');
  return out;
}

/** Notes new milestones in the profile. The very first call is the baseline: it records what is already true and marks it seen. */
export function checkMilestones(p: ReelsProfile, mine: Mine): ReelsProfile {
  const hadLoan = !!p.hadLoan || !!mine.loan;
  const now = achievedNow(mine, !!p.hadLoan);
  const out: ReelsProfile = { ...p, ...(hadLoan ? { hadLoan: true } : {}) };
  if (p.ms === undefined) return { ...out, ms: now, msSeen: now };
  const ms = Array.from(new Set([...p.ms, ...now]));
  return ms.length === p.ms.length && out.hadLoan === p.hadLoan ? p : { ...out, ms };
}

/** A SIP milestone reads as "put in more": it is not shown to a person under money strain. A cleared loan and months of cover are calm and always shown. */
export const isGrowthMilestone = (id: string): boolean => id === 'first-sip';

/** Milestones noticed but not yet shown, oldest first. */
export function unseenMilestones(p: ReelsProfile): Milestone[] {
  const seen = new Set(p.msSeen ?? []);
  return (p.ms ?? []).filter(id => !seen.has(id)).map(id => milestoneById(id)).filter((m): m is Milestone => !!m);
}

export const markMilestoneSeen = (p: ReelsProfile, id: string): ReelsProfile => (p.msSeen?.includes(id) ? p : { ...p, msSeen: [...(p.msSeen ?? []), id] });
