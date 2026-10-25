// Reminders for the reels, planned as pure functions of "now" and the person's choices (lib/reels/reminders-native.ts hands the plan to the OS).
// Two kinds, both local notifications that never leave the phone:
//   1. A move reminder, "when not whether": after a reel the person says WHEN they will do its one thing (tonight, tomorrow morning, the weekend,
//      the start of next month) and gets one reminder then.
//   2. A daily nudge at a time they pick, written as curiosity (a lesson title), never as guilt, and silent on a day they have already done a reel.
//   3. (Notifications v2) A single follow-up on a pledged move ("I'll do this") that was never started, and an opt-in Sunday look-back. `planAll(state, now)`
//      merges everything into one capped, sorted plan: at most one notice a day, only between 8:00 and 21:00, at most six, a 14-day horizon.
// Lock-screen text names only a lesson's public title or the tool to open, never an amount, a loan or a figure of theirs.
import type { L } from '@/lib/reels/types';
import type { Lang } from '@/lib/i18nCore';
import { seasonOf, type SeasonId } from '@/lib/reels/seasons';
import { weekLine, weekOf } from '@/lib/reels/weekly';
import type { StatsState } from '@/lib/reels/stats';

export const NUDGE_HOURS = [8, 9, 12, 18, 20] as const;
export const DEFAULT_NUDGE_HOUR = 18;
/** Nothing is ever scheduled outside these hours (the planner's quiet-hours rule: 8:00 to 21:00, see NOTIFY_FROM_MIN). */
export const EARLIEST_HOUR = 8, LATEST_HOUR = 21;
/** How many days ahead the nudge is scheduled; every app start re-plans, so a day the person has already done is dropped. */
export const NUDGE_DAYS = 3;
export const MAX_MOVE_REMINDERS = 10;
export const ID_PREFIX = 'finosreel-';

export interface NudgePrefs { enabled: boolean; hour: number }
export const DEFAULT_NUDGE: NudgePrefs = { enabled: false, hour: DEFAULT_NUDGE_HOUR };

export function normaliseNudge(raw: unknown): NudgePrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const hour = typeof r.hour === 'number' || (typeof r.hour === 'string' && r.hour.trim() !== '') ? Number(r.hour) : NaN;   // null, '' and true are not hours
  // A stored hour outside quiet hours is pulled to the nearest allowed one, so what the person sees is what the planner will schedule.
  return { enabled: r.enabled === true, hour: Number.isInteger(hour) ? Math.min(LATEST_HOUR, Math.max(EARLIEST_HOUR, hour)) : DEFAULT_NUDGE_HOUR };
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

export type NoticeKind = 'move' | 'nudge' | 'followup' | 'weekly';
export interface PlannedNotice { id: string; at: Date; title: string; body: string; route: string; /** set by the v2 planner; carried in the notice so a tap can be checked against what that kind may open */ kind?: NoticeKind }

/** The daily nudge's headline: the usual one, or a calm variant in Diwali week, Budget week and March year-end. Curiosity only: no deadline, no fear. */
export const NUDGE_TITLE: L = { en: 'A 30-second money lesson', hi: '30 सेकंड का पैसे का पाठ' };
export const SEASON_NUDGE_TITLE: Record<SeasonId, L> = {
  diwali: { en: 'Diwali week: a calm money thought', hi: 'दिवाली का हफ़्ता: पैसे की एक शांत बात' },
  budget: { en: 'Budget week: a 30-second lesson', hi: 'बजट का हफ़्ता: 30 सेकंड का पाठ' },
  yearend: { en: 'March year-end: one small lesson', hi: 'मार्च का वित्त-वर्ष अंत: एक छोटा पाठ' },
};
/** What the nudge says when the lesson's own title would not be fit for a lock screen (an amount, a percentage, or a frightening word, as for a follow-up). */
export const NUDGE_PLAIN_BODY: L = { en: 'A short lesson is ready whenever you are.', hi: 'जब आप चाहें, एक छोटा पाठ तैयार है।' };
export const nudgeTitle = (day: Date, lang: Lang): string => { const s = seasonOf(day); return (s ? SEASON_NUDGE_TITLE[s.id] : NUDGE_TITLE)[lang]; };

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
    out.push({ id: `${ID_PREFIX}nudge-${when.getFullYear()}${pad(when.getMonth() + 1)}${pad(when.getDate())}`, at: when, title: nudgeTitle(when, lang), body: (unfitForLockScreen(title) ? NUDGE_PLAIN_BODY : title)[lang], route: '/learn/reels' });
  }
  return out;
}

export function planMoves(list: MoveReminder[], now: Date, lang: Lang = 'en'): PlannedNotice[] {
  return pendingMoves(list, now).flatMap(m => {
    const d = fromLocalIso(m.at);
    return d ? [{ id: `${ID_PREFIX}move-${m.reelId}`, at: d, title: lang === 'hi' ? 'आपका पैसे वाला काम' : 'Your money move', body: m.label[lang], route: m.href }] : [];
  });
}

/** The first planner (nudges and move reminders only, up to two on one day). Kept as it was; `planAll` still answers to this call shape. */
export function planAllClassic(prefs: NudgePrefs, moves: MoveReminder[], now: Date, doneToday: boolean, titles: L[], lang: Lang = 'en'): PlannedNotice[] {
  return [...planNudges(prefs, now, doneToday, titles, lang), ...planMoves(moves, now, lang)]
    .filter(n => n.at.getHours() >= EARLIEST_HOUR && n.at.getHours() <= LATEST_HOUR)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

// ── Notifications v2: follow-up on a pledge, Sunday look-back, one merged plan ───────────────────────────────

/** Notices only ever fire from 8:00 to 21:00 local, never at night. */
export const NOTIFY_FROM_MIN = 8 * 60, NOTIFY_TO_MIN = 21 * 60;
export const HORIZON_DAYS = 14;
export const MAX_SCHEDULED = 6;
/** A pledge is followed up once, this many days after it was made; one made longer ago than FOLLOWUP_MAX_AGE_DAYS is let go. */
export const FOLLOWUP_AFTER_DAYS = 3, FOLLOWUP_MAX_AGE_DAYS = 14;
/** The Sunday look-back arrives at this hour. */
export const WEEKLY_HOUR = 19;

/** What the person chose beyond the daily nudge. `followups: null` means "not chosen yet": see `followupsOn`. */
export interface NotifyPrefs {
  followups: boolean | null;
  weekly: boolean;
  /** Set once the person has set a daily nudge or a first reminder; it is what turns follow-ups on by default. */
  armed: boolean;
  /** Pledge id -> local date-time its single follow-up is placed at. A time that has passed means it was sent: never again. */
  fu: Record<string, string>;
}
export const DEFAULT_NOTIFY: NotifyPrefs = { followups: null, weekly: false, armed: false, fu: {} };
const MAX_FU = 40;

export function normaliseNotify(raw: unknown): NotifyPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const fu: Record<string, string> = {};
  if (r.fu && typeof r.fu === 'object' && !Array.isArray(r.fu)) {
    for (const [k, v] of Object.entries(r.fu as Record<string, unknown>)) { if (REEL_ID.test(k) && typeof v === 'string' && fromLocalIso(v) && Object.keys(fu).length < MAX_FU) fu[k] = v; }
  }
  return { followups: typeof r.followups === 'boolean' ? r.followups : null, weekly: r.weekly === true, armed: r.armed === true, fu };
}

/** Follow-ups are on by choice; before any choice they are on only once a daily nudge or a first reminder has been set. */
export const followupsOn = (n: NotifyPrefs, nudge: NudgePrefs, moves: readonly unknown[]): boolean => n.followups ?? (n.armed || nudge.enabled || moves.length > 0);

/** A pledge, as the planner needs it: public title of its reel (never a figure of the person's), and the screen to open. */
export interface PledgeInput { id: string; /** ISO time the pledge was made */ at: string; title: L; href: string }

export interface PlanState {
  nudge: NudgePrefs;
  notify: NotifyPrefs;
  moves: MoveReminder[];
  /** Pledges whose tool was not started, with no reminder set, not marked known. The caller filters; the planner only spaces them. */
  pledges: PledgeInput[];
  stats: StatsState;
  /** A reel was already finished today. */
  doneToday: boolean;
  /** Money strain: no follow-ups. */
  strain?: boolean;
  /** Public titles of the lessons the next episode would offer. */
  titles: L[];
  lang?: Lang;
}

const dayId = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const inWindow = (d: Date) => { const m = d.getHours() * 60 + d.getMinutes(); return m >= NOTIFY_FROM_MIN && m <= NOTIFY_TO_MIN; };
const GENERIC_STEP: L = { en: 'that money step', hi: 'उस पैसे वाले क़दम' };
/** Words that would make a lock-screen line read as fear, urgency or loss, even inside a lesson's own title. */
const FEARFUL = /forgot|forget|missed|miss out|behind|last chance|hurry|urgent|running out|expire|deadline|streak|lose|losing|loses|loss|fall(ing)? short|guilt|ashamed|worry|afraid|fear|scam|fraud|panic|danger|trap|ruin|stolen|too late|act now|भूल|छूट|जल्दी|वरना|डर|चिंता|शर्म|धोखा|ठग|नुक़सान|नुकसान/i;
/** A reel title is public, but one that carries an amount, a percentage or a frightening word is not put on a lock screen at all. */
export const unfitForLockScreen = (l: L) => /[₹%]|\d{3,}|\d[,.]\d/.test(l.en + ' ' + l.hi) || FEARFUL.test(l.en + ' ' + l.hi);
const publicStep = (l: L): L => (unfitForLockScreen(l) ? GENERIC_STEP : l);

export const FOLLOW_PREFIX = `${ID_PREFIX}follow-`;

export function followupNotice(p: PledgeInput, at: Date, lang: Lang): PlannedNotice {
  const t = publicStep(p.title);
  const quoted = t === GENERIC_STEP ? t[lang] : `\u201C${t[lang]}\u201D`;
  return {
    id: `${FOLLOW_PREFIX}${p.id}`, at, kind: 'followup', route: p.href,
    title: lang === 'hi' ? 'आपकी सूची का एक छोटा क़दम' : 'A small step on your list',
    body: lang === 'hi' ? `क्या आप अब भी ${quoted} के बारे में सोच रहे हैं? बस 2 मिनट।` : `Still thinking about ${quoted}? 2 minutes.`,
  };
}

export function weeklyNotice(at: Date, lang: Lang): PlannedNotice {
  return {
    id: `${ID_PREFIX}week-${dayId(at)}`, at, kind: 'weekly', route: '/learn/reels',
    title: lang === 'hi' ? 'रीलों में आपका हफ़्ता' : 'Your week in reels',
    body: lang === 'hi' ? 'एक शांत नज़र, लगभग 30 सेकंड।' : 'A quiet look back, about 30 seconds.',
  };
}

/**
 * Everything the reels may ever schedule, as ONE plan. Rules, in order of who wins a day:
 *   1. a reminder the person set ("when will you do it?"), then 2. the follow-up on a pledge, then 3. the Sunday look-back, then 4. the daily nudge.
 * At most one notice on any day; nothing before 8:00 or after 21:00; at most MAX_SCHEDULED, chosen by that order and then sorted by time. The nudge and
 * the look-back look HORIZON_DAYS ahead (the nudge only NUDGE_DAYS); a person's own reminder is kept however far off it is. A reminder or follow-up
 * that loses its day moves to the next free day at the same time; the nudge and look-back just skip it. Silent today if a reel is already finished
 * (follow-up, look-back, nudge; a reminder the person asked for is still kept). Pure: the same state and time give the same plan.
 */
export function planAll(state: PlanState, now: Date): PlannedNotice[];
export function planAll(prefs: NudgePrefs, moves: MoveReminder[], now: Date, doneToday: boolean, titles: L[], lang?: Lang): PlannedNotice[];
export function planAll(a: PlanState | NudgePrefs, b?: Date | MoveReminder[], c?: Date, d?: boolean, e?: L[], f?: Lang): PlannedNotice[] {
  if (b === undefined || Array.isArray(b)) return planAllClassic(a as NudgePrefs, b ?? [], c as Date, d ?? false, e ?? [], f ?? 'en');
  const st = a as PlanState, now = b;
  const lang: Lang = st.lang ?? 'en';
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const horizonEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + HORIZON_DAYS);
  const taken = new Set<string>();
  const chosen: PlannedNotice[] = [];
  const free = (when: Date) => !taken.has(dayId(when));
  const take = (n: PlannedNotice) => { taken.add(dayId(n.at)); chosen.push(n); };
  const ahead = (when: Date) => when.getTime() > now.getTime() && inWindow(when);

  // 1. the person's own reminders, soonest first; a clash moves the later one to the next free day (never dropped for sharing a day)
  const moves = planMoves(st.moves, now, lang).filter(n => inWindow(n.at)).sort((x, y) => x.at.getTime() - y.at.getTime());
  for (const m of moves) {
    for (let k = 0; k < 31; k++) {
      const when = new Date(m.at.getFullYear(), m.at.getMonth(), m.at.getDate() + k, m.at.getHours(), m.at.getMinutes());
      if (free(when)) { take({ ...m, at: when, kind: 'move' }); break; }
    }
  }

  // 2. one follow-up per pledge
  if (followupsOn(st.notify, st.nudge, st.moves) && !st.strain) {
    const hour = st.nudge.hour;
    const pledges = [...st.pledges].sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : x.id < y.id ? -1 : 1));
    for (const p of pledges) {
      const made = new Date(p.at);
      if (!Number.isFinite(made.getTime())) continue;
      const rec = st.notify.fu[p.id] ? fromLocalIso(st.notify.fu[p.id]) : null;
      if (rec && rec.getTime() <= now.getTime()) continue;                                 // already sent: never twice
      if (!rec && (now.getTime() - made.getTime() > FOLLOWUP_MAX_AGE_DAYS * 86_400_000)) continue;
      const due = new Date(made.getFullYear(), made.getMonth(), made.getDate() + FOLLOWUP_AFTER_DAYS);
      const first = rec ? new Date(rec.getFullYear(), rec.getMonth(), rec.getDate()) : due;
      for (let k = 0; k < HORIZON_DAYS; k++) {
        const day = new Date(Math.max(first.getTime(), today.getTime()));
        const when = new Date(day.getFullYear(), day.getMonth(), day.getDate() + k, hour, 0, 0, 0);
        if (when >= horizonEnd) break;
        if (st.doneToday && dayId(when) === dayId(today)) continue;
        if (ahead(when) && free(when)) { take(followupNotice(p, when, lang)); break; }
      }
    }
  }

  // 3. the Sunday look-back, only in a week that had reels, and never worded about what was missed
  if (st.notify.weekly) {
    for (let k = 0; k < HORIZON_DAYS; k++) {
      const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + k);
      if (day.getDay() !== 0) continue;
      const when = new Date(day.getFullYear(), day.getMonth(), day.getDate(), WEEKLY_HOUR, 0, 0, 0);
      if (k === 0 && st.doneToday) continue;
      if (!ahead(when) || !free(when) || weekLine(weekOf(st.stats, day)) === null) continue;
      take(weeklyNotice(when, lang));
    }
  }

  // 4. the daily nudge
  for (const n of planNudges(st.nudge, now, st.doneToday, st.titles, lang)) {
    if (inWindow(n.at) && free(n.at) && n.at < horizonEnd) take({ ...n, kind: 'nudge' });
  }

  const rank: Record<NoticeKind, number> = { move: 0, followup: 1, weekly: 2, nudge: 3 };
  const kept = [...chosen].sort((x, y) => rank[x.kind!] - rank[y.kind!] || x.at.getTime() - y.at.getTime()).slice(0, MAX_SCHEDULED);
  return kept.sort((x, y) => x.at.getTime() - y.at.getTime() || (x.id < y.id ? -1 : 1));
}
