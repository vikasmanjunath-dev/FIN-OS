// Today's episode: a short, finished set of reels for the day instead of an endless feed. Pure functions of the ranked list and the watched
// record, so the rules are tested without a screen.
import { dayKey, type Ranked, type Watched } from '@/lib/reels/journey';
import type { Reel } from '@/lib/reels/types';

/** How many reels make a day's episode. */
export const EPISODE_SIZE = 3;

/** How many reels the person has already finished today (local calendar day). */
export function finishedToday(watched: Watched, now: Date): number {
  const today = dayKey(now);
  return Object.values(watched).filter(w => { const d = new Date(w.at); return Number.isFinite(d.getTime()) && dayKey(d) === today; }).length;
}

export interface Episode {
  /** What to play, in order: the anchor (the best-ranked reel for this person), then a reel with something to do, then the next best. */
  picks: Ranked[];
  /** The best-ranked reel that was left out, for a "tomorrow" teaser. */
  tomorrow: Reel | null;
  /** True when the weekly blind-spot reel is one of the picks (the caller then records the week). */
  blind: boolean;
}

/**
 * Picks up to `count` reels. The anchor is the top reel the person has not finished (or the top reel if they have finished everything).
 * The second pick is the best-ranked reel with a guess, slider or myth cards, so every episode has something to touch. The rest follow the
 * ranking, preferring topics not yet in the episode when one is close by. Never returns the same reel twice.
 */
export function composeEpisode(ranked: Ranked[], count: number = EPISODE_SIZE, blind: Ranked | null = null): Episode {
  const n = Math.max(0, Math.floor(count));
  if (n === 0 || ranked.length === 0) return { picks: [], tomorrow: ranked.find(r => r.why !== 'done')?.reel ?? null, blind: false };
  const fresh = ranked.filter(r => r.why !== 'done');
  const pool = fresh.length ? fresh : ranked;
  const picks: Ranked[] = [pool[0]];
  const has = (r: Ranked) => picks.some(p => p.reel.id === r.reel.id);
  if (n > 1 && !pool[0].reel.poke) {
    const play = pool.find(r => !has(r) && r.reel.poke);
    if (play) picks.push(play);
  }
  while (picks.length < n) {
    const rest = pool.filter(r => !has(r));
    if (!rest.length) break;
    const topics = new Set(picks.map(p => p.reel.topic));
    picks.push(rest.slice(0, 6).find(r => !topics.has(r.reel.topic)) ?? rest[0]);
  }
  // Once a week the last pick is the blind-spot reel (the anchor and the playable pick stay).
  let hasBlind = false;
  if (blind && n >= 3 && picks.length >= 3) {
    const at = picks.findIndex(p => p.reel.id === blind.reel.id);
    if (at >= 0) { picks[at] = blind; hasBlind = true; }
    else { picks[picks.length - 1] = blind; hasBlind = true; }
  }
  const left = pool.find(r => !has(r));
  return { picks, tomorrow: left ? left.reel : null, blind: hasBlind };
}
