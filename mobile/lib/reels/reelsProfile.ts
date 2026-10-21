// What the person has told the reels about themselves: reels they already know, and topics they want less of. Small, on the phone only,
// resettable. The ranker reads it; nothing here is sent anywhere.
import { isPlainObject, parseJSON } from '@/lib/safeStore';
import type { Topic } from '@/lib/reels/types';

export const TOPIC_LIST: Topic[] = ['basics', 'invest', 'loans', 'protect', 'tax', 'retire', 'credit', 'safety', 'goals'];
export const MAX_KNOWN = 200;
export const MAX_LESS = 3;
export const MAX_SAVED = 60;
export const MAX_PLEDGES = 20;

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
  /** Reels kept to watch later (swipe right, or the Save button), newest last. */
  saved?: string[];
  /** Reels whose move the person said "I'll do this" about (double tap, or the button), with when. They are the My moves list. */
  pledges?: { id: string; at: string; /** when the 'Still on your list' reminder last came up in an episode, and how many times it has */ rs?: string; rn?: number }[];
  /** Real-life milestones noticed so far (see milestones.ts), and the ones the person has already been shown. Absent until the first check. */
  ms?: string[];
  msSeen?: string[];
  /** Whether a loan has ever been seen in the person's figures, so a cleared loan can be told from never having had one. */
  hadLoan?: boolean;
  /** How many times the gesture tips have been shown (they stop after a few). */
  tips?: number;
}
export const EMPTY_PROFILE: ReelsProfile = { v: 1, known: [], less: {} };

const ID = /^[a-z0-9-]{1,40}$/;

/** A stored profile made safe: only well-formed ids and known topics, bounded counts, and nothing taken on trust. */
export function parseReelsProfile(raw: string | null | undefined): ReelsProfile {
  const p = parseJSON(raw ?? null);
  if (!p.ok || !isPlainObject(p.value)) return { v: 1, known: [], less: {} };
  const o = p.value as { known?: unknown; less?: unknown; blindWeek?: unknown; fmt?: unknown; saved?: unknown; pledges?: unknown; ms?: unknown; msSeen?: unknown; hadLoan?: unknown; tips?: unknown };
  const known = Array.isArray(o.known) ? Array.from(new Set(o.known.filter((x): x is string => typeof x === 'string' && ID.test(x)))).slice(-MAX_KNOWN) : [];
  const less: ReelsProfile['less'] = {};
  if (isPlainObject(o.less)) for (const t of TOPIC_LIST) { const n = (o.less as Record<string, unknown>)[t]; if (typeof n === 'number' && Number.isFinite(n) && n > 0) less[t] = Math.min(MAX_LESS, Math.floor(n)); }
  const out: ReelsProfile = { v: 1, known, less };
  if (typeof o.blindWeek === 'string' && WEEK.test(o.blindWeek)) out.blindWeek = o.blindWeek;
  if (isPlainObject(o.fmt)) {
    const f = o.fmt as Record<string, unknown>;
    if (Number.isInteger(f.shown) && Number.isInteger(f.engaged) && (f.shown as number) >= 0 && (f.shown as number) <= FMT_CAP && (f.engaged as number) >= 0 && (f.engaged as number) <= (f.shown as number)) out.fmt = { shown: f.shown as number, engaged: f.engaged as number };
  }
  const ids = (x: unknown, cap: number): string[] => (Array.isArray(x) ? Array.from(new Set(x.filter((v): v is string => typeof v === 'string' && ID.test(v)))).slice(-cap) : []);
  if (Array.isArray(o.saved)) out.saved = ids(o.saved, MAX_SAVED);
  if (Array.isArray(o.pledges)) {
    const seen = new Set<string>(), pl: NonNullable<ReelsProfile['pledges']> = [];
    for (const x of o.pledges) { if (isPlainObject(x)) { const r = x as Record<string, unknown>; if (typeof r.id === 'string' && ID.test(r.id) && typeof r.at === 'string' && r.at.length <= 40 && !seen.has(r.id)) { seen.add(r.id); const rn = typeof r.rn === 'number' && Number.isInteger(r.rn) && r.rn > 0 ? Math.min(r.rn, 9) : 0; pl.push({ id: r.id, at: r.at, ...(rn && typeof r.rs === 'string' && r.rs.length <= 40 ? { rs: r.rs, rn } : {}) }); } } }
    out.pledges = pl.slice(-MAX_PLEDGES);
  }
  if (Array.isArray(o.ms)) out.ms = ids(o.ms, 20);
  if (Array.isArray(o.msSeen)) out.msSeen = ids(o.msSeen, 20);
  if (o.hadLoan === true) out.hadLoan = true;
  if (typeof o.tips === 'number' && Number.isInteger(o.tips) && o.tips > 0) out.tips = Math.min(o.tips, 99);
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
export const isEmptyProfile = (p: ReelsProfile): boolean => p.known.length === 0 && Object.keys(p.less).length === 0 && !(p.saved?.length) && !(p.pledges?.length);

/** Keeps a reel to watch later, or lets it go if it was kept. `kept` says which happened. */
export function toggleSaved(p: ReelsProfile, id: string): { profile: ReelsProfile; kept: boolean } {
  if (!ID.test(id)) return { profile: p, kept: false };
  const cur = p.saved ?? [];
  if (cur.includes(id)) return { profile: { ...p, saved: cur.filter(x => x !== id) }, kept: false };
  return { profile: { ...p, saved: [...cur, id].slice(-MAX_SAVED) }, kept: true };
}
export const isSaved = (p: ReelsProfile, id: string): boolean => !!p.saved?.includes(id);

/** "I'll do this": the reel's move goes on the My moves list (once; doing it again only refreshes nothing). */
export function addPledge(p: ReelsProfile, id: string, now: Date): ReelsProfile {
  if (!ID.test(id) || p.pledges?.some(x => x.id === id)) return p;
  return { ...p, pledges: [...(p.pledges ?? []), { id, at: now.toISOString() }].slice(-MAX_PLEDGES) };
}
export const removePledge = (p: ReelsProfile, id: string): ReelsProfile => (p.pledges?.some(x => x.id === id) ? { ...p, pledges: p.pledges.filter(x => x.id !== id) } : p);
/** The 'Still on your list' reminder for a pledged reel was shown in an episode: remember when, so it is never shown again within the gap. */
export function noteResurfaced(p: ReelsProfile, id: string, now: Date): ReelsProfile {
  if (!p.pledges?.some(x => x.id === id)) return p;
  return { ...p, pledges: p.pledges.map(x => (x.id === id ? { ...x, rs: now.toISOString(), rn: Math.min(9, (x.rn ?? 0) + 1) } : x)) };
}
export const isPledged = (p: ReelsProfile, id: string): boolean => !!p.pledges?.some(x => x.id === id);

/** The gesture tips show on the first few visits only. */
export const TIPS_MAX = 3;
export const noteTip = (p: ReelsProfile): ReelsProfile => ({ ...p, tips: (p.tips ?? 0) + 1 });
export const showTip = (p: ReelsProfile): boolean => (p.tips ?? 0) < TIPS_MAX;
