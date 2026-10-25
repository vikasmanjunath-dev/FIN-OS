// Small pure pieces of the feed's calm moments: the quiet cue that more buttons wait below the fold, the one suggested challenge, the loading
// words, and the room the feed's top bar takes. Pure, so each is tested without a screen. Nothing is read or written here.
import { challengeById, type Suggestion } from '@/lib/reels/challenges';
import type { L } from '@/lib/reels/types';
import type { Lang } from '@/lib/i18nCore';

/** Whether more of a scrolling page waits below what is in view. `slack` px of rounding or overscroll is not "more". */
export function moreBelow(contentH: number, layoutH: number, scrollY: number, slack = 8): boolean {
  if (![contentH, layoutH, scrollY].every(Number.isFinite) || layoutH <= 0) return false;
  return contentH - layoutH - Math.max(0, scrollY) > slack;
}

/** The words of the quiet cue under a calm stop that needs a scroll. */
export const MORE_BELOW: L = { en: '↓ More below', hi: '↓ नीचे और है' };

/** The calm stop's one suggested challenge as a quiet line, or null when `suggestChallenge` offered none (including under money strain). */
export function challengeLine(sug: Pick<Suggestion, 'id'> | null, lang: Lang): { text: string; label: string } | null {
  const c = sug ? challengeById(sug.id) : undefined;
  if (!c) return null;
  const title = c.title[lang];
  return lang === 'hi'
    ? { text: `आज़माएँ: ${title}`, label: `आज़माएँ: ${title}। 7 दिन की चुनौतियाँ खुलेंगी` }
    : { text: `Try: ${title}`, label: `Try: ${title}. Opens the 7-day challenges` };
}

/** What the feed says (with Mitra) until the first reel is ready. */
export const FEED_LOADING: L = { en: 'Getting today’s reels', hi: 'आज की रीलें ला रही हूँ' };

/** The room the feed's top bar and topic chips take: what was measured, or a sensible figure before the first layout. */
export function headInset(measured: number, fallback: number): number {
  return Number.isFinite(measured) && measured > 0 ? Math.ceil(measured) : fallback;
}
