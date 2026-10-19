// Reminders for the reels, planned as pure functions of "now" and the person's choices (lib/reels/reminders-native.ts hands the plan to the OS).
// Two kinds, both local notifications that never leave the phone:
//   1. A move reminder, "when not whether": after a reel the person says WHEN they will do its one thing (tonight, tomorrow morning, the weekend,
//      the start of next month) and gets one reminder then.
//   2. A daily nudge at a time they pick, written as curiosity (a lesson title), never as guilt, and silent on a day they have already done a reel.
// Lock-screen text names only a lesson's public title or the tool to open, never an amount, a loan or a figure of theirs.
import type { L } from '@/lib/reels/types';
import type { Lang } from '@/lib/i18nCore';

export const NUDGE_HOURS = [8, 9, 12, 18, 20] as const;
export const DEFAULT_NUDGE_HOUR = 18;
/** Nothing is ever scheduled outside these hours. */
export const EARLIEST_HOUR = 7, LATEST_HOUR = 21;
/** How many days ahead the nudge is scheduled; every app start re-plans, so a day the person has already done is dropped. */
export const NUDGE_DAYS = 3;
export const MAX_MOVE_REMINDERS = 10;
export const ID_PREFIX = 'finosreel-';

export interface NudgePrefs { enabled: boolean; hour: number }
export const DEFAULT_NUDGE: NudgePrefs = { enabled: false, hour: DEFAULT_NUDGE_HOUR };

export function normaliseNudge(raw: unknown): NudgePrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const hour = Number(r.hour);
  return { enabled: r.enabled === true, hour: Number.isInteger(hour) && hour >= EARLIEST_HOUR && hour <= LATEST_HOUR ? hour : DEFAULT_NUDGE_HOUR };
}

// ── when ─────────────────────────────────────────────────────────────────────────────────────────────────────

export type WhenId = 'tonight' | 'tomorrow' | 'weekend' | 'month';
export interface WhenOption { id: WhenId; at: Date; label: L }

const at = (d: Date, hour: number, add = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + add, hour, 0, 0, 0);

/** The moments offered after a reel. "Tonight" is offered only while 8 pm is still ahead; the weekend is the coming Saturday at 10 am. */
export function whenOptions(now: Date): WhenOption[] {
  const out: WhenOption[] = [];
  const tonight = at(now, 20);
  if (tonight.getTime() > now.getTime() + 30 * 60_000) out.push({ id: 'tonight', at: tonight, label: { en: 'Tonight, 8 pm', hi: 'आज रात, 8 बजे' } });
  out.push({ id: 'tomorrow', at: at(now, 9, 1), label: { en: 'Tomorrow morning, 9 am', hi: 'कल सुबह, 9 बजे' } });
  const daysToSat = ((6 - now.getDay()) + 7) % 7 || 7;
  out.push({ id: 'weekend', at: at(now, 10, daysToSat), label: { en: 'This weekend, Saturday 10 am', hi: 'इस सप्ताहांत, शनिवार सुबह 10 बजे' } });
  out.push({ id: 'month', at: new Date(now.getFullYear(), now.getMonth() + 1, 1, 9, 0, 0, 0), label: { en: 'Start of next month, 9 am', hi: 'अगले महीने की शुरुआत, सुबह 9 बजे' } });
  return out;
}

// ── move reminders ───────────────────────────────────────────────────────────────────────────────────────────

export interface MoveReminder {
  /** One per reel: asking again for the same reel replaces the earlier reminder. */
  reelId: string;
  /** Local date-time, YYYY-MM-DDTHH:MM. */
  at: string;
  /** The screen to open, and its name as shown on the answer screen, in both languages (the notice follows the app's language). */
  href: string;
  label: L;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const toLocalIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
export function fromLocalIso(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), 0, 0);
  return Number.isFinite(d.getTime()) && d.getMonth() === Number(m[2]) - 1 ? d : null;
}

const REEL_ID = /^[a-z0-9-]{1,40}$/;
const ROUTE = /^\/[A-Za-z0-9/_-]{1,60}$/;

/** A stored list made safe: well-formed ids, routes and times, one per reel, bounded. */
export function normaliseMoves(raw: unknown): MoveReminder[] {
  if (!Array.isArray(raw)) return [];
  const by = new Map<string, MoveReminder>();
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const r = x as Record<string, unknown>;
    if (typeof r.reelId !== 'string' || !REEL_ID.test(r.reelId) || typeof r.at !== 'string' || !fromLocalIso(r.at) || typeof r.href !== 'string' || !ROUTE.test(r.href) || !r.label || typeof r.label !== 'object') continue;
    const lab = r.label as Record<string, unknown>;
    if (typeof lab.en !== 'string' || typeof lab.hi !== 'string') continue;
    by.set(r.reelId, { reelId: r.reelId, at: r.at, href: r.href, label: { en: lab.en.slice(0, 80), hi: lab.hi.slice(0, 120) } });
  }
  return [...by.values()].slice(-MAX_MOVE_REMINDERS);
}

export function addMove(list: MoveReminder[], m: MoveReminder): MoveReminder[] {
  return normaliseMoves([...list.filter(x => x.reelId !== m.reelId), m]);
}

/** Only reminders still ahead, soonest first. */
export const pendingMoves = (list: MoveReminder[], now: Date): MoveReminder[] =>
  list.filter(m => { const d = fromLocalIso(m.at); return !!d && d.getTime() > now.getTime(); }).sort((a, b) => a.at.localeCompare(b.at));

// ── what the OS is told ──────────────────────────────────────────────────────────────────────────────────────

export interface PlannedNotice { id: string; at: Date; title: string; body: string; route: string }

/**
 * The daily nudge for the next few days, one per day at the chosen hour. A day on which a reel was already finished gets none, and so does a
 * moment that has passed. `titles[i]` is the public title of the lesson ready on the i-th upcoming day (the day after the last one reuses it).
 */
export function planNudges(prefs: NudgePrefs, now: Date, doneToday: boolean, titles: L[], lang: Lang = 'en'): PlannedNotice[] {
  if (!prefs.enabled || !titles.length) return [];
  const out: PlannedNotice[] = [];
  for (let i = 0; i < NUDGE_DAYS; i++) {
    if (i === 0 && doneToday) continue;
    const when = at(now, prefs.hour, i);
    if (when.getTime() <= now.getTime()) continue;
    const title = titles[Math.min(i, titles.length - 1)];
    out.push({ id: `${ID_PREFIX}nudge-${when.getFullYear()}${pad(when.getMonth() + 1)}${pad(when.getDate())}`, at: when, title: lang === 'hi' ? '30 सेकंड का पैसे का पाठ' : 'A 30-second money lesson', body: title[lang], route: '/learn/reels' });
  }
  return out;
}

export function planMoves(list: MoveReminder[], now: Date, lang: Lang = 'en'): PlannedNotice[] {
  return pendingMoves(list, now).flatMap(m => {
    const d = fromLocalIso(m.at);
    return d ? [{ id: `${ID_PREFIX}move-${m.reelId}`, at: d, title: lang === 'hi' ? 'आपका पैसे वाला काम' : 'Your money move', body: m.label[lang], route: m.href }] : [];
  });
}

/** Everything to schedule, soonest first, and never in the quiet hours. */
export function planAll(prefs: NudgePrefs, moves: MoveReminder[], now: Date, doneToday: boolean, titles: L[], lang: Lang = 'en'): PlannedNotice[] {
  return [...planNudges(prefs, now, doneToday, titles, lang), ...planMoves(moves, now, lang)]
    .filter(n => n.at.getHours() >= EARLIEST_HOUR && n.at.getHours() <= LATEST_HOUR)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}
