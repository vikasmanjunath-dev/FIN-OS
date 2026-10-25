// The one way a reels component picks between its English and Hindi wording for a short inline string. (Longer text lives in an `L` and is read as `x[lang]`.)
import type { Lang } from '@/lib/i18nCore';

export const pick = (lang: Lang, en: string, hi: string): string => (lang === 'hi' ? hi : en);
