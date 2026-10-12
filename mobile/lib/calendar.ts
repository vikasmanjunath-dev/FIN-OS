// Financial calendar: every dated obligation the trackers know about, in one list.
// Port of js/finos-calendar.js (collectors, month grid, "coming up" grouping, summary) and js/finos-taxdates.js (rule-based tax dates).
// The data is passed in instead of read from localStorage, and "now" is a parameter, so both can be tested.
// __tests__/calendar.parity.test.mts runs the website's real files against the same data and a frozen clock.
// Deliberate differences from the website: FD / RD / PPF / NSC maturities come from lib/fixedIncome.ts (the same date the Deposits
// tracker shows; the website's calendar guessed 12 months for Sukanya, bonds and post-office deposits), and insurance titles fall back
// to the provider name the phone's policy form saves.
import { normalizeAll, isLive, occurrences, CYCLES } from './subscriptions.ts';
import { calcEntry, INSTRUMENTS, type FDEntry } from './fixedIncome.ts';

export type EventType = 'sip' | 'fd' | 'ppf' | 'insurance' | 'goal' | 'tax' | 'sub';
export interface CalEvent { date: string; title: string; sub: string; type: EventType; amount?: number }

export const EVENT_META: Record<EventType, { icon: string; color: string; label: string }> = {
  sip: { icon: '📈', color: '#00D4FF', label: 'SIP debit' },
  fd: { icon: '💰', color: '#22D3A6', label: 'FD / RD matures' },
  ppf: { icon: '📜', color: '#7B2FF7', label: 'PPF matures' },
  insurance: { icon: '🛡️', color: '#F97316', label: 'Insurance renewal' },
  goal: { icon: '🎯', color: '#C7F000', label: 'Goal deadline' },
  tax: { icon: '🧾', color: '#EF4444', label: 'Tax deadline' },
  sub: { icon: '🔁', color: '#A78BFA', label: 'Subscription' },
};

const pad = (n: number) => String(n).padStart(2, '0');
/** Local calendar date (toISOString would turn local-midnight 1 Oct into 30 Sep in IST). */
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The website's compact rupee text used in event subtitles. */
export function short(n: unknown): string {
  const v = Number(n) || 0;
  if (v >= 1e7) return '₹' + (v / 1e7).toFixed(1) + ' Cr';
  if (v >= 1e5) return '₹' + (v / 1e5).toFixed(1) + ' L';
  if (v >= 1e3) return '₹' + Math.round(v / 1e3) + 'K';
  return '₹' + Math.round(v);
}

/* ── Indian tax dates (from js/finos-taxdates.js; statutory defaults, never tied to one year) ───────────── */
const NOTE = ' Statutory default — verify on incometax.gov.in (deadlines are sometimes extended).';
export const fyOf = (dateStr: string) => { const d = new Date(dateStr); return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; };
export const fyLabel = (y: number) => `FY ${y}-${pad((y + 1) % 100)}`;
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

export function taxDatesForFY(y: number): CalEvent[] {
  const L = fyLabel(y);
  return ([
    { date: iso(y, 6, 15), title: `Advance Tax Q1 (${L})`, sub: '15% of estimated annual tax due if your liability exceeds ₹10,000.' + NOTE },
    { date: iso(y, 9, 15), title: `Advance Tax Q2 (${L})`, sub: 'Cumulative 45% of annual tax liability due.' + NOTE },
    { date: iso(y, 12, 15), title: `Advance Tax Q3 (${L})`, sub: 'Cumulative 75% of annual tax liability due.' + NOTE },
    { date: iso(y + 1, 3, 15), title: `Advance Tax Q4 (${L})`, sub: 'Cumulative 100% of annual tax liability due.' + NOTE },
    { date: iso(y + 1, 3, 31), title: `Tax-saving deadline (${L})`, sub: 'Last date for 80C (ELSS, PPF, EPF top-up), NPS and 80D investments to count for this year.' },
    { date: iso(y + 1, 6, 15), title: `Form 16 due from employer (${L})`, sub: 'Employers must issue Form 16 by this date. Needed to file your return.' },
    { date: iso(y + 1, 7, 31), title: `ITR filing deadline (${L})`, sub: 'Due date for individuals not requiring an audit. File before this to avoid late fees.' + NOTE },
    { date: iso(y + 1, 12, 31), title: `Belated / revised ITR closes (${L})`, sub: 'Last chance to file a late or revised return for this year (late fee applies).' + NOTE },
  ] as Omit<CalEvent, 'type'>[]).map(e => ({ ...e, type: 'tax' as const }));
}

export function taxDates(from: string, to: string): CalEvent[] {
  const out: CalEvent[] = [];
  for (let y = fyOf(from) - 1; y <= fyOf(to); y++) out.push(...taxDatesForFY(y));
  return out.filter(e => e.date >= from && e.date <= to).sort((x, y) => x.date.localeCompare(y.date));
}

/* ── Collectors ──────────────────────────────────────────────────────────────────────────────────────── */
export interface Sources {
  sip?: any[]; fd?: FDEntry[]; insurance?: any[]; goals?: any[]; subscriptions?: unknown;
}

function addYearsFrac(startDate: string, years: number) {
  const d = new Date(startDate);
  d.setFullYear(d.getFullYear() + Math.floor(years));
  d.setMonth(d.getMonth() + Math.round((years % 1) * 12));
  return d;
}

function sipEvents(portfolio: any[], from: Date, to: Date): CalEvent[] {
  const events: CalEvent[] = [];
  (portfolio || []).forEach(sip => {
    const amount = Number(sip.monthlyAmount || sip.amount) || 0;
    if (!amount || !sip.startDate) return;
    const sipStart = new Date(sip.startDate);
    const label = String(sip.fundName || sip.fund || sip.name || 'SIP').slice(0, 28);
    const day = Math.min(Math.max(parseInt(sip.debitDay, 10) || 1, 1), 28);
    const cur = new Date(Math.max(sipStart.getTime(), from.getTime()));
    cur.setDate(1);
    while (cur <= to) {
      const debit = new Date(cur.getFullYear(), cur.getMonth(), day);
      if (debit >= from && debit >= sipStart) events.push({ date: isoDate(debit), title: label, sub: short(amount) + '/mo debit', type: 'sip', amount });
      cur.setMonth(cur.getMonth() + 1);
    }
  });
  return events;
}

function fdEvents(portfolio: FDEntry[], now: Date): CalEvent[] {
  const events: CalEvent[] = [];
  (portfolio || []).forEach(entry => {
    if (!entry || !entry.startDate) return;
    let mat: Date;
    try { mat = calcEntry(entry, now).maturityDate; } catch { mat = addYearsFrac(entry.startDate, (entry.termMonths || 12) / 12); }
    if (!(mat instanceof Date) || Number.isNaN(mat.getTime())) return;
    const type = String(entry.type || 'fd');
    const plain = ['fd', 'rd', 'ppf', 'nsc', 'scss'].includes(type);       // the website's wording; the others get their full name
    const label = entry.bank || (entry as any).institution || (plain ? type.toUpperCase() : (INSTRUMENTS as any)[type]?.label || type.toUpperCase());
    const principal = Number(entry.principal || entry.annualAmount || (entry.monthlyAmount || 0) * 12) || 0;
    events.push({ date: isoDate(mat), title: label + ' Matures', sub: principal > 0 ? short(principal) + ' principal' : '', type: entry.type === 'ppf' ? 'ppf' : 'fd', amount: principal });
  });
  return events;
}

function insuranceEvents(policies: any[]): CalEvent[] {
  const events: CalEvent[] = [];
  (policies || []).forEach(p => {
    if (!p || !p.renewal_date) return;
    const premium = p.premium || p.annual_premium || 0;
    events.push({ date: String(p.renewal_date).slice(0, 10), title: (p.name || p.provider || p.type || 'Insurance') + ' Renewal', sub: premium ? 'Premium: ' + short(premium) : '', type: 'insurance', amount: premium });
  });
  return events;
}

function goalEvents(goals: any[]): CalEvent[] {
  const events: CalEvent[] = [];
  (goals || []).forEach(g => {
    const deadline = g && (g.deadline || g.target_date);
    if (!deadline) return;
    events.push({ date: String(deadline).slice(0, 10), title: g.name || 'Financial Goal', sub: g.target ? 'Target: ' + short(g.target) : '', type: 'goal', amount: g.target || 0 });
  });
  return events;
}

/** Subscription renewals and trial endings (the same rule as FinosSubscriptions.calendarEvents). */
export function subscriptionEvents(subs: unknown, fromISO: string, toISO: string): CalEvent[] {
  const out: CalEvent[] = [];
  normalizeAll(subs).filter(isLive).forEach(s => {
    const cost = Math.round((s.amount / s.split) * 100) / 100;
    occurrences(s, fromISO, toISO, 3).forEach(date => {
      out.push({
        date,
        title: s.status === 'trial' ? `${s.name} trial ends — first charge` : `${s.name} renews`,
        sub: `₹${Math.round(cost).toLocaleString('en-IN')} · ${CYCLES[s.cycle].label.toLowerCase()}${s.status === 'trial' ? ' · cancel before this date to avoid the charge' : ''}`,
        type: 'sub', amount: cost,
      });
    });
  });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Everything from a week ago to `monthsAhead` months out, soonest first. */
export function collectEvents(src: Sources, now: Date, monthsAhead = 12): CalEvent[] {
  const from = new Date(now); from.setDate(1);
  const to = new Date(from); to.setMonth(to.getMonth() + monthsAhead);
  const taxFrom = new Date(now); taxFrom.setFullYear(taxFrom.getFullYear() - 1);
  const taxTo = new Date(now); taxTo.setFullYear(taxTo.getFullYear() + 3);
  const floor = isoDate(new Date(now.getTime() - 7 * 86400000));
  const all = [
    ...sipEvents(src.sip || [], from, to),
    ...fdEvents(src.fd || [], now),
    ...insuranceEvents(src.insurance || []),
    ...goalEvents(src.goals || []),
    ...subscriptionEvents(src.subscriptions, isoDate(from), isoDate(to)),
    ...taxDates(isoDate(taxFrom), isoDate(taxTo)),
  ].filter(e => e.date >= floor);
  all.sort((a, b) => a.date.localeCompare(b.date));
  return all;
}

/* ── Views ───────────────────────────────────────────────────────────────────────────────────────────── */
export function byDate(events: CalEvent[]): Record<string, CalEvent[]> {
  const map: Record<string, CalEvent[]> = {};
  events.forEach(e => { (map[e.date] ||= []).push(e); });
  return map;
}

export interface Cell { day: number; date: string }
/** Monday-first month grid: null for the padding cells. */
export function monthCells(year: number, month: number): (Cell | null)[] {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const startDow = (first.getDay() + 6) % 7;
  const total = Math.ceil((startDow + days) / 7) * 7;
  return Array.from({ length: total }, (_, i) => {
    const day = i - startDow + 1;
    return day < 1 || day > days ? null : { day, date: `${year}-${pad(month + 1)}-${pad(day)}` };
  });
}

export type Bucket = 'Today' | 'Tomorrow' | 'This week' | 'Next week' | 'This month' | 'Later';
export interface UpcomingItem extends CalEvent { diff: number; bucket: Bucket; urgency: 'urgent' | 'soon' | '' }
export function upcoming(events: CalEvent[], now: Date, days = 45): UpcomingItem[] {
  const todayStr = isoDate(now);
  const cutoff = isoDate(new Date(now.getTime() + days * 86400000));
  return events.filter(e => e.date >= todayStr && e.date <= cutoff).map(e => {
    const diff = Math.ceil((new Date(e.date).getTime() - new Date(todayStr).getTime()) / 86400000);
    const bucket: Bucket = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff <= 7 ? 'This week' : diff <= 14 ? 'Next week' : diff <= 30 ? 'This month' : 'Later';
    return { ...e, diff, bucket, urgency: diff <= 7 ? 'urgent' : diff <= 14 ? 'soon' : '' };
  });
}

export interface MonthSummary { sipTotal: number; emiTotal: number; insuranceDue: number; nextTax: CalEvent | null }
export function monthSummary(events: CalEvent[], now: Date, emis: { home?: number; car?: number; personal?: number }): MonthSummary {
  const thisMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const sum = (t: EventType) => events.filter(e => e.type === t && e.date.startsWith(thisMonth)).reduce((s, e) => s + (e.amount || 0), 0);
  const todayStr = isoDate(now);
  return {
    sipTotal: sum('sip'),
    emiTotal: (emis.home || 0) + (emis.car || 0) + (emis.personal || 0),
    insuranceDue: sum('insurance'),
    nextTax: events.find(e => e.type === 'tax' && e.date >= todayStr) || null,
  };
}
