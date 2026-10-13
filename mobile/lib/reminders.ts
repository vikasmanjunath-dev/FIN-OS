// Reminder planning: which phone notifications to schedule for the dated obligations the calendar already knows about.
// Pure (data and "now" are parameters) so it can be tested; lib/remindersNative.ts hands the result to the OS.
// Same lead times as the website's js/finos-reminders.js (tax and insurance 7 days, goals 14, maturities and subscriptions 3,
// SIP debits 1). The website tells you once a day while you have the site open; a phone must be told in advance, so each event
// gets a first notice at its lead time and a last one on the day when the lead is more than one day.
import type { CalEvent, EventType } from './calendar.ts';

export const LEAD: Record<EventType, number> = { tax: 7, insurance: 7, fd: 3, ppf: 3, sip: 1, goal: 14, sub: 3 };
/** iOS keeps at most 64 pending local notifications; stay well under it. */
export const MAX_PENDING = 40;
export const HOURS = [8, 9, 10, 12, 18, 20] as const;
export const DEFAULT_HOUR = 9;

export interface ReminderPrefs {
  enabled: boolean;
  hour: number;          // local hour of day the notice arrives
  details: boolean;      // include the event text and amount on the lock screen (off by default: it is a financial app)
  types: Partial<Record<EventType, boolean>>;
}
export const DEFAULT_PREFS: ReminderPrefs = { enabled: false, hour: DEFAULT_HOUR, details: false, types: {} };

export interface PlannedReminder { id: string; at: string; /* ISO local date-time */ date: string; type: EventType; title: string; body: string; daysBefore: number }

const pad = (n: number) => String(n).padStart(2, '0');
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (iso: string, n: number) => { const [y, m, d] = iso.split('-').map(Number); return localDay(new Date(y, m - 1, d + n)); };
const dayDiff = (a: string, b: string) => { const A = a.split('-').map(Number), B = b.split('-').map(Number); return Math.round((Date.UTC(B[0], B[1] - 1, B[2]) - Date.UTC(A[0], A[1] - 1, A[2])) / 86400000); };
const at = (iso: string, hour: number) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d, hour, 0, 0, 0); };

export function normalisePrefs(raw: unknown): ReminderPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const hour = Number(r.hour);
  const types: ReminderPrefs['types'] = {};
  if (r.types && typeof r.types === 'object') (Object.keys(LEAD) as EventType[]).forEach(t => { if (typeof r.types[t] === 'boolean') types[t] = r.types[t]; });
  return { enabled: r.enabled === true, hour: Number.isInteger(hour) && hour >= 6 && hour <= 22 ? hour : DEFAULT_HOUR, details: r.details === true, types };
}

const LABEL: Record<EventType, string> = { tax: 'Tax', insurance: 'Insurance', sip: 'SIP', fd: 'Maturity', ppf: 'Maturity', goal: 'Goal', sub: 'Subscription' };
const when = (n: number) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);

/** Notification text. Without `details` it names the kind of event and when, never the amount or the provider. */
export function message(e: Pick<CalEvent, 'type' | 'title' | 'sub'>, daysBefore: number, details: boolean): { title: string; body: string } {
  if (!details) return { title: `${LABEL[e.type]} reminder — ${when(daysBefore)}`, body: 'Open FIN·OS to see what is due.' };
  return { title: `${LABEL[e.type]}: ${e.title} — ${when(daysBefore)}`, body: (e.sub || '').replace(/\s*Statutory default.*$/, '').slice(0, 140) };
}

/** Stable id so rescheduling replaces rather than duplicates. */
export function reminderId(e: Pick<CalEvent, 'type' | 'date' | 'title'>, daysBefore: number): string {
  let h = 5381;
  const s = `${e.type}|${e.date}|${e.title}|${daysBefore}`;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return `finos-${e.type}-${e.date}-${daysBefore}-${h.toString(36)}`;
}

/**
 * The notifications to schedule from `now`. Soonest first, capped at MAX_PENDING, nothing in the past, one per
 * (event, daysBefore). If an event's lead time has already begun, the first notice is today at the chosen hour when that hour
 * is still ahead, else tomorrow (when the event is still ahead then).
 */
export function plan(events: CalEvent[], now: Date, prefs: ReminderPrefs = DEFAULT_PREFS): PlannedReminder[] {
  if (!prefs.enabled) return [];
  const today = localDay(now);
  const out = new Map<string, PlannedReminder>();
  (events || []).forEach(e => {
    if (!e || typeof e.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.date) || !(e.type in LEAD)) return;
    if (prefs.types[e.type] === false) return;
    const lead = LEAD[e.type];
    const diff = dayDiff(today, e.date);
    if (diff < 0) return;
    const offsets = lead > 1 ? [lead, 0] : [lead];
    offsets.forEach(daysBefore => {
      let day = addDays(e.date, -daysBefore);
      if (day < today) day = today;                              // lead window already open: tell them now-ish
      let when_ = at(day, prefs.hour);
      if (when_.getTime() <= now.getTime()) {
        const next = addDays(day, 1);
        if (next > e.date) return;                               // today's slot has gone and the event is today: nothing left to say
        day = next; when_ = at(day, prefs.hour);
      }
      const left = dayDiff(day, e.date);
      const id = reminderId(e, daysBefore);
      if (out.has(id)) return;
      const m = message(e, left, prefs.details);
      out.set(id, { id, at: `${day}T${pad(prefs.hour)}:00`, date: e.date, type: e.type, title: m.title, body: m.body, daysBefore });
    });
  });
  // Two offsets can collapse onto the same moment (e.g. a goal due tomorrow): keep one notice per event per day.
  const seen = new Set<string>();
  const list = [...out.values()].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)).filter(r => {
    const k = `${r.type}|${r.date}|${r.at.slice(0, 10)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return list.slice(0, MAX_PENDING);
}

/** Dates as Date objects for the OS scheduler. */
export const fireDate = (r: Pick<PlannedReminder, 'at'>): Date => { const [d, t] = r.at.split('T'); const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd, Number(t.slice(0, 2)), 0, 0, 0); };
