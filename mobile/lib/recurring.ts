// Recurring entries (rent, SIP, subscriptions, salary…): pure scheduling logic.
import { Kind, ymd } from '@/lib/budget';

export interface Recurring {
  id: string;
  kind: Kind;
  amount: number;
  category: string;
  label: string;
  /** day of the month it happens, 1–31 (clamped to the month's last day, so "31" becomes the 28th/29th/30th when needed) */
  day: number;
  /** YYYY-MM-DD it was created — we never back-fill before this */
  startDate: string;
  /** last YYYY-MM already handled; null = nothing yet */
  lastRun: string | null;
  active: boolean;
}

export interface DueEntry { id: string; date: string; month: string; item: Recurring }

const pad = (n: number) => String(n).padStart(2, '0');
const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const addMonth = (m: string, by: number) => { const d = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1 + by, 1); return monthKey(d); };
const dim = (m: string) => new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate();

/** Deterministic id: the same item+month can only ever produce one transaction. */
export const recurringTxnId = (itemId: string, month: string) => `rec_${itemId}_${month}`;

export const dueDateIn = (item: Pick<Recurring, 'day'>, month: string) => `${month}-${pad(Math.min(Math.max(1, item.day), dim(month)))}`;

const MAX_CATCHUP_MONTHS = 24;

/**
 * Entries that have come due and not yet been created. Walks month by month from where we left off:
 *   - a month whose due date is still in the future stops the walk (and isn't marked done)
 *   - a due date before the item existed is skipped, never back-filled
 * `lastRun` in the result is where to resume next time.
 */
export function dueEntries(item: Recurring, now: Date, existingIds: ReadonlySet<string> = new Set()): { entries: DueEntry[]; lastRun: string | null } {
  if (!item.active) return { entries: [], lastRun: item.lastRun };
  const today = ymd(now);
  const current = monthKey(now);
  const startMonth = item.startDate.slice(0, 7);
  let m = item.lastRun ? addMonth(item.lastRun, 1) : startMonth;
  if (m < startMonth) m = startMonth;

  const entries: DueEntry[] = [];
  let lastRun = item.lastRun;
  for (let n = 0; m <= current && n < MAX_CATCHUP_MONTHS; n++, m = addMonth(m, 1)) {
    const date = dueDateIn(item, m);
    if (date > today) break;
    const id = recurringTxnId(item.id, m);
    if (date >= item.startDate && !existingIds.has(id)) entries.push({ id, date, month: m, item });
    lastRun = m;
  }
  return { entries, lastRun };
}

/** lastRun to use when (re)activating, so resuming never dumps a pile of missed entries or an unexpected one today. */
export function resumeLastRun(item: Pick<Recurring, 'day'>, now: Date): string {
  const current = monthKey(now);
  return dueDateIn(item, current) <= ymd(now) ? current : addMonth(current, -1);
}

/** 1 → "1st", 2 → "2nd", 11 → "11th", 22 → "22nd" */
export function ordinal(d: number) {
  const suffix = d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th';
  return `${d}${suffix}`;
}

export function describeSchedule(item: Pick<Recurring, 'day'>) {
  return `Every month on the ${ordinal(item.day)}${item.day > 28 ? ' (or the last day)' : ''}`;
}

/** The next date this item will create an entry (for display). */
export function nextDueDate(item: Recurring, now: Date): string | null {
  if (!item.active) return null;
  const today = ymd(now);
  const floor = item.startDate > today ? item.startDate : today;
  let m = item.lastRun ? addMonth(item.lastRun, 1) : item.startDate.slice(0, 7);
  for (let n = 0; n < 26; n++, m = addMonth(m, 1)) {
    const d = dueDateIn(item, m);
    if (d >= floor && !(d === today && item.lastRun === m)) return d;
  }
  return null;
}
