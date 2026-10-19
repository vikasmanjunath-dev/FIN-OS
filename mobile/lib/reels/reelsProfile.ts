// What the person has told the reels about themselves: reels they already know, and topics they want less of. Small, on the phone only,
// resettable. The ranker reads it; nothing here is sent anywhere.
import { isPlainObject, parseJSON } from '@/lib/safeStore';
import type { Topic } from '@/lib/reels/types';

export const TOPIC_LIST: Topic[] = ['basics', 'invest', 'loans', 'protect', 'tax', 'retire', 'credit', 'safety', 'goals'];
export const MAX_KNOWN = 200;
export const MAX_LESS = 3;

export interface ReelsProfile {
  v: 1;
  /** Reels the person said "I know this" about. They stop coming up in the episode. */
  known: string[];
  /** How many times they asked for less of a topic (each one lowers it a notch, up to MAX_LESS). */
  less: Partial<Record<Topic, number>>;
  /** The week (see `weekKey`) in which the weekly blind-spot reel was last offered, so it comes once a week. */
  blindWeek?: string;
  /** How often the person engaged with a reel's interactive beat rather than skipping it, for the ranker's format fit. */
  fmt?: { shown: number; engaged: number };
}
export const EMPTY_PROFILE: ReelsProfile = { v: 1, known: [], less: {} };

const ID = /^[a-z0-9-]{1,40}$/;

/** A stored profile made safe: only well-formed ids and known topics, bounded counts, and nothing taken on trust. */
export function parseReelsProfile(raw: string | null | undefined): ReelsProfile {
  const p = parseJSON(raw ?? null);
  if (!p.ok || !isPlainObject(p.value)) return { v: 1, known: [], less: {} };
  const o = p.value as { known?: unknown; less?: unknown; blindWeek?: unknown; fmt?: unknown };
  const known = Array.isArray(o.known) ? Array.from(new Set(o.known.filter((x): x is string => typeof x === 'string' && ID.test(x)))).slice(-MAX_KNOWN) : [];
  const less: ReelsProfile['less'] = {};
  if (isPlainObject(o.less)) for (const t of TOPIC_LIST) { const n = (o.less as Record<string, unknown>)[t]; if (typeof n === 'number' && Number.isFinite(n) && n > 0) less[t] = Math.min(MAX_LESS, Math.floor(n)); }
  const out: ReelsProfile = { v: 1, known, less };
  if (typeof o.blindWeek === 'string' && WEEK.test(o.blindWeek)) out.blindWeek = o.blindWeek;
  if (isPlainObject(o.fmt)) {
    const f = o.fmt as Record<string, unknown>;
    if (Number.isInteger(f.shown) && Number.isInteger(f.engaged) && (f.shown as number) >= 0 && (f.shown as number) <= FMT_CAP && (f.engaged as number) >= 0 && (f.engaged as number) <= (f.shown as number)) out.fmt = { shown: f.shown as number, engaged: f.engaged as number };
  }
  return out;
}

const WEEK = /^\d{4}-W\d{2}$/;
const FMT_CAP = 40;

/** The calendar week a date falls in, as "YYYY-Www" (ISO 8601: weeks start on Monday, week 1 holds the first Thursday). */
export function weekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86_400_000 + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}
export const noteBlind = (p: ReelsProfile, week: string): ReelsProfile => (WEEK.test(week) ? { ...p, blindWeek: week } : p);

/** Records that an interactive beat was shown and whether the person did something with it. Counts are halved at the cap so the fit keeps adapting. */
export function notePoke(p: ReelsProfile, engaged: boolean): ReelsProfile {
  let shown = (p.fmt?.shown ?? 0) + 1, eng = (p.fmt?.engaged ?? 0) + (engaged ? 1 : 0);
  if (shown > FMT_CAP) { shown = Math.floor(shown / 2); eng = Math.floor(eng / 2); }
  return { ...p, fmt: { shown, engaged: Math.min(eng, shown) } };
}

/** How well interactive reels suit this person, as a multiplier from 0.85 (they skip them) to 1.15 (they always play), 1 when nothing is known. */
export function pokeFit(p: ReelsProfile): number {
  const rate = ((p.fmt?.engaged ?? 0) + 1) / ((p.fmt?.shown ?? 0) + 2);
  return 0.85 + 0.3 * rate;
}

export const addKnown = (p: ReelsProfile, id: string): ReelsProfile => (ID.test(id) && !p.known.includes(id) ? { ...p, known: [...p.known, id].slice(-MAX_KNOWN) } : p);
export const addLess = (p: ReelsProfile, topic: Topic): ReelsProfile => ({ ...p, less: { ...p.less, [topic]: Math.min(MAX_LESS, (p.less[topic] ?? 0) + 1) } });
export const isEmptyProfile = (p: ReelsProfile): boolean => p.known.length === 0 && Object.keys(p.less).length === 0;
