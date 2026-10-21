// A quiet look back at the last seven days of reels, shown at the calm stop: what happened, never what was missed. It is built from the
// on-phone health counters only (no reel names, no figures) and says nothing at all in a week with no reels, so it can never read as a scolding.
import type { DayStats, StatsState } from '@/lib/reels/stats';
import type { L } from '@/lib/reels/types';

export interface Week { days: number; reels: number; pledges: number; moves: number; receipts: number; together: number; saves: number }

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The seven days ending today (today included), added up. `days` counts days on which at least one reel was finished. */
export function weekOf(state: StatsState, now: Date): Week {
  const w: Week = { days: 0, reels: 0, pledges: 0, moves: 0, receipts: 0, together: 0, saves: 0 };
  for (let i = 0; i < 7; i++) {
    const r: DayStats | undefined = state.days[dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i))];
    if (!r) continue;
    if (r.fin > 0) w.days += 1;
    w.reels += r.fin; w.pledges += r.pledges; w.moves += r.moves; w.receipts += r.receipts; w.together += r.together; w.saves += r.saves;
  }
  return w;
}

const n = (k: number, en1: string, enN: string, hi: string): L => ({ en: `${k} ${k === 1 ? en1 : enN}`, hi: `${k} ${hi}` });

/** One sentence about the week, in both languages, or null when there were no reels (nothing is said about a quiet week). */
export function weekLine(w: Week): L | null {
  if (w.reels <= 0) return null;
  const parts: L[] = [
    { en: `${w.reels} ${w.reels === 1 ? 'reel' : 'reels'} on ${w.days} ${w.days === 1 ? 'day' : 'days'}`, hi: `${w.days} दिन में ${w.reels} रीलें` },
  ];
  if (w.pledges > 0) parts.push(n(w.pledges, 'move on your list', 'moves on your list', 'काम आपकी सूची में'));
  if (w.moves > 0) parts.push(n(w.moves, 'move started', 'moves started', 'काम शुरू किए'));
  if (w.receipts > 0) parts.push(n(w.receipts, 'real change noticed', 'real changes noticed', 'असली बदलाव दिखे'));
  if (w.together > 0) parts.push(n(w.together, 'round played together', 'rounds played together', 'बार साथ खेले'));
  return { en: `This week: ${parts.map(p => p.en).join(', ')}.`, hi: `इस हफ़्ते: ${parts.map(p => p.hi).join(', ')}।` };
}
