// Moments that make a reel timely: the calendar, a life event the person declared, or a state of their own figures. A reel lists the
// triggers it answers in meta.ts; the ranker lifts it while one is active and shows the note as the reason. Pure and tested.
import { DEFS } from '@/lib/lifeEvents';
import { seasonOf, type SeasonId } from '@/lib/reels/seasons';
import type { Signals } from '@/lib/reels/signals';
import type { L, Reel } from '@/lib/reels/types';
import type { Meta } from '@/lib/reels/meta';

const l = (en: string, hi: string): L => ({ en, hi });

/** Advance-tax instalments fall on the 15th of these months (month 1 = January). */
const ADVANCE_TAX_MONTHS = [3, 6, 9, 12];
const ADVANCE_TAX_LEAD_DAYS = 10;

export const TRIGGER_NOTES: Record<string, L> = {
  'cal:tax-season': l('It is tax-saving season.', 'यह टैक्स बचाने का मौसम है।'),
  'cal:regime-choice': l('A new financial year has begun: time to think about your tax regime.', 'नया वित्त वर्ष शुरू हुआ है: टैक्स रिजीम पर सोचने का समय।'),
  'cal:filing-season': l('Return-filing season is on.', 'रिटर्न भरने का मौसम चल रहा है।'),
  'cal:advance-tax': l('An advance tax date is close.', 'एडवांस टैक्स की तारीख़ पास है।'),
  'state:has-loan': l('You have a loan in the app.', 'आपके ऐप में एक लोन दर्ज है।'),
  'state:fund-low': l('Your emergency fund is under 3 months of spending.', 'आपका इमरजेंसी फ़ंड 3 महीने के ख़र्च से कम है।'),
};
const eventNote = (type: string): L => l(`You noted a life event: ${DEFS[type as keyof typeof DEFS]?.label.toLowerCase() ?? type}.`, 'आपने एक जीवन-घटना दर्ज की है, इसलिए यह रील।');

/** Whether `now` is within the lead days before an advance-tax date, or on it. */
export function nearAdvanceTax(now: Date): boolean {
  const m = now.getMonth() + 1, d = now.getDate();
  if (!ADVANCE_TAX_MONTHS.includes(m)) return false;
  return d <= 15 && 15 - d <= ADVANCE_TAX_LEAD_DAYS;
}

/** The triggers active for this person today, each with the sentence that explains it. */
export function activeTriggers(s: Signals): Map<string, L> {
  const out = new Map<string, L>();
  const month = s.now.getMonth() + 1;
  if (month >= 1 && month <= 3) out.set('cal:tax-season', TRIGGER_NOTES['cal:tax-season']);
  if (month === 4 || month === 5) out.set('cal:regime-choice', TRIGGER_NOTES['cal:regime-choice']);
  if (month === 6 || month === 7) out.set('cal:filing-season', TRIGGER_NOTES['cal:filing-season']);
  if (nearAdvanceTax(s.now)) out.set('cal:advance-tax', TRIGGER_NOTES['cal:advance-tax']);
  if (s.hasLoan) out.set('state:has-loan', TRIGGER_NOTES['state:has-loan']);
  if (s.fundMonths !== undefined && s.fundMonths < 3) out.set('state:fund-low', TRIGGER_NOTES['state:fund-low']);
  for (const e of s.events) out.set(`event:${e}`, eventNote(e));
  return out;
}

/** Every trigger name a reel may list in meta.ts. A test holds meta.ts to this list. */
export const KNOWN_TRIGGERS: string[] = [
  ...Object.keys(TRIGGER_NOTES),
  ...Object.keys(DEFS).map(k => `event:${k}`),
];

// ── seasons ──────────────────────────────────────────────────────────────────────────────────────────────────
// Diwali week, Budget week and March year-end (seasons.ts) give a small lift to the reels people look for then. It is a nudge, smaller than a
// real trigger, and it works only on reels the ranker already offers: the distress guard removes "put in more" reels before any lift is counted.

/** Reels about festive spending, budgets and scam messages, which Diwali week lifts (besides every reel on the scams topic). */
export const DIWALI_REELS: string[] = [
  'sort-needs-wants', 'needs-wants-wealth', 'cash-flow', 'pay-yourself-first', 'lifestyle-creep', 'myths-saving', 'path-first-raise', 'sinking-funds',
  'card-interest-trap', 'bnpl-late-fees', 'no-cost-emi', 'slide-card-wait', 'guess-card-dues', 'path-card-bill', 'credit-utilisation',
];

export const SEASON_NOTES: Record<SeasonId, L> = {
  diwali: l('Diwali week often means bigger spends and more scam messages.', 'दिवाली के हफ़्ते में अक्सर ख़र्च बढ़ता है और ठगी के संदेश भी।'),
  budget: l('It is Budget week: tax rules are in the news.', 'यह बजट का हफ़्ता है: टैक्स के नियम चर्चा में हैं।'),
  yearend: l('The financial year ends this month: tax-saving dates are close.', 'इस महीने वित्त वर्ष ख़त्म होता है: टैक्स बचाने की तारीख़ें पास हैं।'),
};

/** How much a season adds to the weighted sum of a reel's score (that sum is out of 1, so 0.12 is about seven points). */
export const SEASON_LIFT = 0.12;

/** The season (if any) that makes this reel more worth seeing today, with the sentence that explains it. Pure; `now` decides the season. */
export function seasonLiftFor(reel: Reel, meta: Meta, now: Date): { lift: number; note: L } | null {
  const season = seasonOf(now);
  if (!season) return null;
  const tags = meta.triggers ?? [];
  const hit = season.id === 'diwali' ? reel.topic === 'safety' || DIWALI_REELS.includes(reel.id)
    : season.id === 'budget' ? reel.topic === 'tax'
    : tags.includes('cal:tax-season');
  return hit ? { lift: SEASON_LIFT, note: SEASON_NOTES[season.id] } : null;
}
