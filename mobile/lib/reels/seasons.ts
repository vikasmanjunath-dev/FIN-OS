// Seasons: the reels' stage takes a different tint and a small badge in the weeks people think about money in a particular way (Diwali
// spending, Budget week, March year-end). The lessons do not change; only the look. Dates are plain calendar arithmetic, tested.
import type { L } from '@/lib/reels/types';

export type SeasonId = 'diwali' | 'budget' | 'yearend';
export interface Season { id: SeasonId; badge: string; label: L; /** two stage gradient colours */ tint: [string, string] }

export const SEASONS: Record<SeasonId, Season> = {
  diwali: { id: 'diwali', badge: '🪔', label: { en: 'Diwali week', hi: 'दिवाली का हफ़्ता' }, tint: ['#2A1405', '#4A2208'] },
  budget: { id: 'budget', badge: '📜', label: { en: 'Budget week', hi: 'बजट का हफ़्ता' }, tint: ['#0B1F33', '#12304A'] },
  yearend: { id: 'yearend', badge: '🗓️', label: { en: 'Year-end in March', hi: 'मार्च का वित्त-वर्ष अंत' }, tint: ['#1F1A0A', '#3A2F0B'] },
};

/** The day of Lakshmi Puja (Diwali) by year, as [month, day] with January = 1. Dates after 2030 are not listed, and the season then simply does not show. */
export const DIWALI: Record<number, [number, number]> = { 2026: [11, 8], 2027: [10, 29], 2028: [10, 17], 2029: [11, 5], 2030: [10, 26] };
const DIWALI_BEFORE = 5, DIWALI_AFTER = 2;
const DAY = 86_400_000;

const utcDay = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);

/** The season a date falls in, or null in an ordinary week. Diwali: five days before to two after. Budget: 29 January to 4 February. Year-end: 15 to 31 March. */
export function seasonOf(date: Date): Season | null {
  const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
  const t = utcDay(y, m, d);
  const dv = DIWALI[y];
  if (dv) { const gap = (t - utcDay(y, dv[0], dv[1])) / DAY; if (gap >= -DIWALI_BEFORE && gap <= DIWALI_AFTER) return SEASONS.diwali; }
  if ((m === 1 && d >= 29) || (m === 2 && d <= 4)) return SEASONS.budget;
  if (m === 3 && d >= 15) return SEASONS.yearend;
  return null;
}
