// Financial calendar extras that the website does not have and the phone's calendar (lib/calendar.ts) lacked:
//   - dates the person adds themselves (a loan EMI day, a cheque due, a fee, a tax-saving deadline of their own), once or repeating;
//   - an .ics export of everything on the calendar, so it can be opened in the phone's own calendar app.
// The website's calendar (js/finos-calendar.js) has no custom events and no export, so there is no website key to stay compatible
// with: custom dates are stored under finos_calendar_custom_events as an array of {id, title, date, amount, repeat, note}.
// Pure: the clock and the data are parameters.
import type { CalEvent } from './calendar.ts';

export type Repeat = 'none' | 'monthly' | 'yearly';
export interface CustomEvent { id: string; title: string; date: string; amount: number | null; repeat: Repeat; note: string }
/** A calendar entry of any kind. `type` is a plain string so custom entries can sit beside the built-in types. */
export interface AnyEvent { date: string; title: string; sub: string; type: string; amount?: number }

export const CUSTOM_TYPE = 'custom';
export const MAX_TITLE = 60;
export const MAX_NOTE = 140;
export const MAX_CUSTOM = 200;

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m1: number, d: number) => `${y}-${pad(m1)}-${pad(d)}`;
const daysIn = (y: number, m1: number) => new Date(y, m1, 0).getDate();

/** True for a real calendar day written YYYY-MM-DD (2027-02-30 is not one). */
export function isRealDay(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  return y >= 2000 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= daysIn(y, mo);
}

export function normaliseCustom(raw: unknown): CustomEvent[] {
  const out: CustomEvent[] = [];
  const seen = new Set<string>();
  (Array.isArray(raw) ? raw : []).slice(0, MAX_CUSTOM).forEach((r: any, i: number) => {
    if (!r || typeof r !== 'object' || !isRealDay(r.date)) return;
    const title = typeof r.title === 'string' ? r.title.trim().slice(0, MAX_TITLE) : '';
    if (!title) return;
    let id = typeof r.id === 'string' && r.id ? r.id.slice(0, 40) : `c${i}`;
    if (seen.has(id)) id = `${id}_${i}`;
    seen.add(id);
    const amount = Number(r.amount);
    out.push({
      id, title, date: r.date, amount: Number.isFinite(amount) && amount > 0 ? amount : null,
      repeat: r.repeat === 'monthly' || r.repeat === 'yearly' ? r.repeat : 'none',
      note: typeof r.note === 'string' ? r.note.trim().slice(0, MAX_NOTE) : '',
    });
  });
  return out;
}

export function validateCustom(i: { title: string; date: string; amount: string }): { ok: true; title: string; date: string; amount: number | null } | { ok: false; error: string } {
  const title = i.title.trim();
  if (!title) return { ok: false, error: 'Give the date a name.' };
  if (title.length > MAX_TITLE) return { ok: false, error: `Keep the name under ${MAX_TITLE} characters.` };
  if (!isRealDay(i.date.trim())) return { ok: false, error: 'Enter a real date like 2026-11-15.' };
  const raw = i.amount.replace(/[₹,\s]/g, '');
  let amount: number | null = null;
  if (raw !== '') {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return { ok: false, error: 'The amount must be a number, or left blank.' };
    amount = n > 0 ? n : null;
  }
  return { ok: true, title, date: i.date.trim(), amount };
}

/** Dates this event falls on within [from, to] (inclusive, YYYY-MM-DD). Monthly repeats clamp to the month's last day. */
export function occurrences(e: CustomEvent, from: string, to: string): string[] {
  if (!isRealDay(e.date) || from > to) return [];
  const [y0, m0, d0] = e.date.split('-').map(Number);
  const out: string[] = [];
  if (e.repeat === 'none') return e.date >= from && e.date <= to ? [e.date] : [];
  const [fy, fm] = from.split('-').map(Number), [ty, tm] = to.split('-').map(Number);
  let guard = 0;
  for (let y = fy, m = fm; (y < ty || (y === ty && m <= tm)) && guard < 1300; guard++) {
    if (e.repeat === 'monthly' || m === m0) {
      const d = iso(y, m, Math.min(d0, daysIn(y, m)));
      if (d >= e.date && d >= from && d <= to) out.push(d);
    }
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

const REPEAT_TEXT: Record<Repeat, string> = { none: '', monthly: 'repeats every month', yearly: 'repeats every year' };
const rupees = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

export function customToEvents(list: CustomEvent[], from: string, to: string): AnyEvent[] {
  const out: AnyEvent[] = [];
  list.forEach(e => {
    const sub = [e.amount ? rupees(e.amount) : '', REPEAT_TEXT[e.repeat], e.note].filter(Boolean).join(' · ');
    occurrences(e, from, to).forEach(date => out.push({ date, title: e.title, sub, type: CUSTOM_TYPE, amount: e.amount ?? undefined }));
  });
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

// ── .ics ─────────────────────────────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  sip: 'SIP debit', fd: 'Deposit matures', ppf: 'PPF matures', insurance: 'Insurance renewal', goal: 'Goal deadline', tax: 'Tax deadline', sub: 'Subscription', custom: 'Your date',
};

/** RFC 5545 TEXT escaping. */
export const icsEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');

/** Folds a content line to 75 octets, never splitting a UTF-8 character. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = '', bytes = 0, limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > limit) { parts.push(cur); cur = ''; bytes = 0; limit = 74; }   // continuation lines start with a space
    cur += ch; bytes += b;
  }
  if (cur) parts.push(cur);
  return parts.join('\r\n ');
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, '0');
}

const stamp = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
const compact = (day: string) => day.replace(/-/g, '');
function nextDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}`;
}

export interface IcsOptions { now: Date; includeAmounts: boolean; name?: string }

/** An iCalendar file of all-day events. Without amounts, an entry that carries a rupee figure keeps only its kind and title. */
export function toIcs(events: AnyEvent[], o: IcsOptions): string {
  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FIN-OS//Financial calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(o.name ?? 'FIN-OS financial calendar')}`];
  const seen = new Map<string, number>();
  const sorted = [...events].filter(e => isRealDay(e.date)).sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  sorted.forEach(e => {
    const base = hash(`${e.type}|${e.date}|${e.title}`);
    const n = (seen.get(base) ?? 0) + 1; seen.set(base, n);
    const hasAmount = typeof e.amount === 'number' && e.amount > 0;
    const kind = TYPE_LABEL[e.type] ?? 'Financial date';
    const desc = !o.includeAmounts && (hasAmount || e.type === CUSTOM_TYPE) ? kind : e.sub ? `${kind}: ${e.sub}` : kind;
    lines.push(
      'BEGIN:VEVENT', `UID:${base}-${n}@finos.app`, `DTSTAMP:${stamp(o.now)}`, `DTSTART;VALUE=DATE:${compact(e.date)}`, `DTEND;VALUE=DATE:${nextDay(e.date)}`,
      `SUMMARY:${icsEscape(e.title)}`, `DESCRIPTION:${icsEscape(desc)}`, `CATEGORIES:${icsEscape(kind)}`, 'TRANSP:TRANSPARENT', 'END:VEVENT',
    );
  });
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
