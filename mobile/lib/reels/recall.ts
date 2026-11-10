// A mixed recall session: a few questions from reels the person has already answered and that are due for review (spaced.ts), taken from different
// topics in turn (interleaving) so each one has to be recalled, not just continued from the one before. Pure, tested.
import { dueReels } from '@/lib/reels/spaced';
import type { Watched } from '@/lib/reels/journey';
import type { Reel } from '@/lib/reels/types';

export const SESSION_SIZE = 5;

/** The reels for a session: due ones, most overdue first inside each topic, taken round the topics so no two in a row share one when avoidable. */
export function buildSession(watched: Watched, library: Reel[], now: Date, size = SESSION_SIZE, known: string[] = []): Reel[] {
  const byId = new Map(library.map(r => [r.id, r]));
  const due = dueReels(watched, now, id => byId.has(id) && !known.includes(id));
  const queues = new Map<string, Reel[]>();
  for (const d of due) { const r = byId.get(d.id)!; queues.set(r.topic, [...(queues.get(r.topic) ?? []), r]); }
  const order = [...queues.keys()].sort((a, b) => (queues.get(b)!.length - queues.get(a)!.length) || a.localeCompare(b));
  const out: Reel[] = [];
  let last = '';
  while (out.length < size && [...queues.values()].some(q => q.length)) {
    const pick = order.filter(t => queues.get(t)!.length && t !== last)[0] ?? order.find(t => queues.get(t)!.length)!;
    out.push(queues.get(pick)!.shift()!); last = pick;
  }
  return out;
}

export const dueCount = (watched: Watched, library: Reel[], now: Date, known: string[] = []): number => { const ids = new Set(library.map(r => r.id)); return dueReels(watched, now, id => ids.has(id) && !known.includes(id)).length; };
