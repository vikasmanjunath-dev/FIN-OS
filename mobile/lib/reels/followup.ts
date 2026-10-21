// Follow-up on "I'll do this": which pledged reels are due a single, gentle "Still on your list" in an episode, and the sentence that goes with
// it. Pure functions of the reels profile, tested with known answers. The wording says where things stand and never how long it has been: no
// guilt, no urgency, no "you forgot".
import type { MovesState } from '@/lib/reels/moves';
import type { ReelsProfile } from '@/lib/reels/reelsProfile';
import type { L } from '@/lib/reels/types';

/** A pledge is first brought back after this many days, and again no sooner than this many days after each time it was. */
export const RESURFACE_AFTER_DAYS = 5;
/** A pledge is brought back at most this many times in all; after that it stays on My moves and nothing more is said. */
export const MAX_RESURFACES = 2;
const DAY = 86_400_000;

export interface DuePledge { id: string; /** how many times it has already been brought back */ times: number }

/** The reels whose tool the person has tapped (a move is open, or already settled into a receipt). A pledge on one of these is under way. */
export function startedReelIds(moves: MovesState): string[] {
  return Array.from(new Set([...moves.open.map(m => m.id), ...moves.receipts.map(r => r.id)]));
}

/**
 * The pledges due a "Still on your list" today, oldest pledge first. A pledge is due when it is at least RESURFACE_AFTER_DAYS old, its tool has
 * not been started, it was not brought back within the last RESURFACE_AFTER_DAYS days, and it has been brought back fewer than MAX_RESURFACES
 * times. Nothing is due for a person under money strain. `eligible` (optional) limits the answer to reels that exist and are worth showing.
 */
export function duePledges(profile: ReelsProfile, o: { now: Date; started?: Iterable<string>; strain?: boolean; eligible?: (id: string) => boolean }): DuePledge[] {
  if (o.strain) return [];
  const started = new Set(o.started ?? []);
  const out: { id: string; times: number; at: number }[] = [];
  for (const p of profile.pledges ?? []) {
    if (started.has(p.id) || profile.known.includes(p.id) || (o.eligible && !o.eligible(p.id))) continue;
    const times = p.rn ?? 0, made = new Date(p.at).getTime(), last = p.rs ? new Date(p.rs).getTime() : NaN;
    if (!Number.isFinite(made) || times >= MAX_RESURFACES) continue;
    if (o.now.getTime() - made < RESURFACE_AFTER_DAYS * DAY) continue;
    if (Number.isFinite(last) && o.now.getTime() - last < RESURFACE_AFTER_DAYS * DAY) continue;
    out.push({ id: p.id, times, at: made });
  }
  return out.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map(({ id, times }) => ({ id, times }));
}

const FIRST: L = { en: 'Still on your list, whenever you are ready.', hi: 'अब भी आपकी सूची में है, जब आप तैयार हों।' };
const AGAIN: L = { en: 'A small step you kept on your list. No rush.', hi: 'आपकी सूची में रखा एक छोटा क़दम। कोई हड़बड़ी नहीं।' };

/** The one-line reason shown with a resurfaced reel, in both languages. */
export const resurfaceReason = (times: number = 0): L => (times > 0 ? AGAIN : FIRST);
