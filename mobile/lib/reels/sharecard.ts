// The words on a shared lesson card (the PNG a person sends on WhatsApp). Built from the library's own example reel, never from a
// personalised one and never from anything the person entered: this file imports no storage and no personal data, and takes only a reel id.
// The picture (components/reels/ShareCard.tsx) draws exactly these strings, so what is tested here is what is shared.
import { LIBRARY } from '@/lib/reels/library';
import type { Lang } from '@/lib/i18nCore';
import type { L, Topic } from '@/lib/reels/types';

/** The card is 1080 x 1350 (4:5, the shape WhatsApp and Instagram show without cropping). It is drawn small and scaled up when captured. */
export const CARD = { w: 1080, h: 1350, drawW: 360, drawH: 450 } as const;

/** The most characters each line may have, so the text never runs off the card. Every library reel fits (a test checks it). */
export const CARD_MAX = { title: 60, takeaway: 160, topic: 24 } as const;

export const TOPIC_LABEL: Record<Topic, L> = {
  basics: { en: 'Basics', hi: 'बुनियादी' }, invest: { en: 'Investing', hi: 'निवेश' }, loans: { en: 'Loans', hi: 'लोन' }, protect: { en: 'Protection', hi: 'सुरक्षा' },
  tax: { en: 'Tax', hi: 'टैक्स' }, retire: { en: 'Retirement', hi: 'रिटायरमेंट' }, credit: { en: 'Credit', hi: 'क्रेडिट' }, safety: { en: 'Scams', hi: 'धोखाधड़ी' }, goals: { en: 'Goals', hi: 'लक्ष्य' },
};

const FOOTER: L = { en: 'Money reels by FIN·OS', hi: 'FIN·OS मनी रील्स' };
const NOT_ADVICE: L = { en: 'For education, not advice.', hi: 'शिक्षा के लिए, सलाह नहीं।' };

export interface CardText { title: string; takeaway: string; topic: string; footer: string; notAdvice: string; /** one sentence for a screen reader */ alt: string }

/** Cuts a line to `max` characters at a sentence end if there is one, else at a word end with an ellipsis. Text that already fits is returned as it is. */
export function fitLine(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('। '));
  if (stop >= max * 0.5) return cut.slice(0, stop + 1);
  const sp = cut.lastIndexOf(' ');
  return `${cut.slice(0, sp > max * 0.5 ? sp : max - 1).replace(/[,;:\s]+$/, '')}…`;
}

/** The card's words for a reel, in the app's language, or null for an id that is not in the library. */
export function cardText(reelId: string, lang: Lang): CardText | null {
  const r = LIBRARY.find(x => x.id === reelId);
  if (!r) return null;
  const title = fitLine(r.title[lang], CARD_MAX.title);
  const takeaway = fitLine(r.quiz.why[lang], CARD_MAX.takeaway);
  const topic = TOPIC_LABEL[r.topic]?.[lang] ?? '';
  return { title, takeaway, topic, footer: FOOTER[lang], notAdvice: NOT_ADVICE[lang], alt: `${FOOTER[lang]}. ${title}. ${takeaway}` };
}
