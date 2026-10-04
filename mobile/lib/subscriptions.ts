// Pure port of js/finos-subscriptions.js (the website's Subscription Tracker core).
// No React / storage imports on purpose, so Node can run it directly and
// __tests__/subscriptions.parity.test.ts can check it against the web module with random inputs.
// Dates are plain YYYY-MM-DD strings handled in UTC, so IST never shifts a renewal by a day.

export type Cycle = 'weekly' | 'monthly' | 'quarterly' | 'halfyearly' | 'yearly';
export type Status = 'active' | 'trial' | 'paused' | 'cancelled';
export type Pay = 'upi' | 'card' | 'netbanking' | 'other' | '';

export interface Subscription {
  id: string;
  name: string;
  category: string;
  amount: number;
  cycle: Cycle;
  nextDate: string;
  split: number;
  status: Status;
  usefulness: number | null;
  pay: Pay;
  note: string;
}

export const SUBSCRIPTIONS_KEY = 'finos_subscriptions';

export const CYCLES: Record<Cycle, { label: string; perYear: number; months: number }> = {
  weekly:     { label: 'Weekly',      perYear: 52, months: 0 },
  monthly:    { label: 'Monthly',     perYear: 12, months: 1 },
  quarterly:  { label: 'Quarterly',   perYear: 4,  months: 3 },
  halfyearly: { label: 'Half-yearly', perYear: 2,  months: 6 },
  yearly:     { label: 'Yearly',      perYear: 1,  months: 12 },
};
export const CYCLE_IDS = Object.keys(CYCLES) as Cycle[];

export const CATEGORIES = [
  { id: 'ott',      label: 'Streaming / OTT',     icon: '🎬', overlap: true },
  { id: 'music',    label: 'Music & audio',       icon: '🎧', overlap: true },
  { id: 'software', label: 'Apps & software',     icon: '💻', overlap: false },
  { id: 'cloud',    label: 'Cloud storage',       icon: '☁️', overlap: true },
  { id: 'news',     label: 'News & reading',      icon: '📰', overlap: true },
  { id: 'fitness',  label: 'Fitness & wellness',  icon: '🏋️', overlap: true },
  { id: 'learning', label: 'Learning',            icon: '🎓', overlap: false },
  { id: 'telecom',  label: 'Phone & broadband',   icon: '📶', overlap: false },
  { id: 'shopping', label: 'Shopping & delivery', icon: '🛍️', overlap: false },
  { id: 'gaming',   label: 'Gaming',              icon: '🎮', overlap: false },
  { id: 'other',    label: 'Other',               icon: '📦', overlap: false },
] as const;
const CAT: Record<string, (typeof CATEGORIES)[number]> = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

export const STATUSES: Status[] = ['active', 'trial', 'paused', 'cancelled'];
export const PAY_METHODS: Exclude<Pay, ''>[] = ['upi', 'card', 'netbanking', 'other'];

/* ── dates ─────────────────────────────────────────────────────────────── */
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export function parseISO(s: unknown): { y: number; m: number; d: number } | null {
  const m = ISO_RE.exec(String(s ?? ''));
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? { y, m: mo, d } : null;
}
const pad = (n: number) => String(n).padStart(2, '0');
const fmtISO = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const dayNum = (iso: string) => { const p = parseISO(iso); return p ? Date.UTC(p.y, p.m - 1, p.d) / 86400000 : NaN; };
export const daysBetween = (fromISO: string, toISO: string) => Math.round(dayNum(toISO) - dayNum(fromISO));
function addDays(iso: string, n: number) {
  const p = parseISO(iso)!;
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
  return fmtISO(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}
/** anchor + n months, keeping the anchor's day-of-month where it exists (31 Jan → 28/29 Feb → 31 Mar). */
function addMonths(iso: string, n: number) {
  const p = parseISO(iso)!;
  const total = p.y * 12 + (p.m - 1) + n;
  const y = Math.floor(total / 12), m = (total % 12) + 1;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return fmtISO(y, m, Math.min(p.d, dim));
}
export function localToday(now = new Date()) {
  return fmtISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/* ── normalisation ─────────────────────────────────────────────────────── */
const clampInt = (v: unknown, lo: number, hi: number, d: number | null) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
};
let seq = 0;
export const newSubscriptionId = () => 's' + Date.now().toString(36) + (++seq).toString(36) + Math.random().toString(36).slice(2, 5);

export function normalize(raw: any): Subscription | null {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name == null ? '' : raw.name).trim().slice(0, 60);
  const amount = Number(raw.amount);
  if (!name || !Number.isFinite(amount) || amount <= 0 || amount > 1e7) return null;
  const cycle = (CYCLES as any)[raw.cycle] ? (raw.cycle as Cycle) : null;
  if (!cycle) return null;
  if (!parseISO(raw.nextDate)) return null;
  const use = raw.usefulness === '' || raw.usefulness == null ? null : clampInt(raw.usefulness, 1, 5, null);
  return {
    id: raw.id ? String(raw.id) : newSubscriptionId(),
    name,
    category: CAT[raw.category] ? raw.category : 'other',
    amount: Math.round(amount * 100) / 100,
    cycle,
    nextDate: raw.nextDate,
    split: clampInt(raw.split, 1, 20, 1) as number,
    status: STATUSES.includes(raw.status) ? raw.status : 'active',
    usefulness: use,
    pay: (PAY_METHODS as string[]).includes(raw.pay) ? raw.pay : '',
    note: String(raw.note == null ? '' : raw.note).trim().slice(0, 120),
  };
}
export const normalizeAll = (list: unknown): Subscription[] =>
  (Array.isArray(list) ? list : []).map(normalize).filter((s): s is Subscription => !!s);

/* ── money (your share, after splitting a family plan) ─────────────────── */
export const annualCost = (s: Subscription) => (s.amount / s.split) * CYCLES[s.cycle].perYear;
export const monthlyCost = (s: Subscription) => annualCost(s) / 12;
export const yourShare = (s: Subscription) => s.amount / s.split;

/* ── renewals ──────────────────────────────────────────────────────────── */
export const isLive = (s: Subscription) => s.status === 'active' || s.status === 'trial';

/** Smallest k ≥ 0 such that anchor + k·cycle falls on/after today (month-based cycles only). */
function firstIndex(sub: Subscription, todayISO: string) {
  const c = CYCLES[sub.cycle];
  if (sub.nextDate >= todayISO) return 0;
  const a = parseISO(sub.nextDate)!, t = parseISO(todayISO)!;
  const gap = (t.y - a.y) * 12 + (t.m - a.m);
  let k = Math.max(0, Math.floor(gap / c.months));
  while (addMonths(sub.nextDate, k * c.months) < todayISO) k++;
  return k;
}

export function nextRenewal(sub: Subscription | null | undefined, todayISO: string): string | null {
  if (!sub || !isLive(sub) || !parseISO(todayISO)) return null;
  const c = CYCLES[sub.cycle];
  if (sub.nextDate >= todayISO) return sub.nextDate;
  if (c.months === 0) return addDays(sub.nextDate, Math.ceil(daysBetween(sub.nextDate, todayISO) / 7) * 7);
  return addMonths(sub.nextDate, firstIndex(sub, todayISO) * c.months);
}

/** Up to `max` renewals in [fromISO, toISO], always counted from the original anchor (31 Jan → 28 Feb → 31 Mar). */
export function occurrences(sub: Subscription | null | undefined, fromISO: string, toISO: string, max?: number): string[] {
  const out: string[] = [];
  if (!sub || !isLive(sub) || !parseISO(fromISO) || !parseISO(toISO)) return out;
  const c = CYCLES[sub.cycle];
  const lim = max || 3;
  if (c.months === 0) {
    for (let d = nextRenewal(sub, fromISO)!; d <= toISO && out.length < lim; d = addDays(d, 7)) out.push(d);
    return out;
  }
  for (let k = firstIndex(sub, fromISO); out.length < lim; k++) {
    const d = addMonths(sub.nextDate, k * c.months);
    if (d > toISO) break;
    out.push(d);
  }
  return out;
}

/* ── summary ───────────────────────────────────────────────────────────── */
export interface Upcoming { id: string; name: string; date: string; daysAway: number; cost: number; trial: boolean }
export interface ReviewItem { id: string; name: string; reason: 'low-value' | 'overlap'; annual: number; detail: string }
export interface CategoryTotal { id: string; label: string; icon: string; monthly: number; annual: number; count: number; share: number }
export interface Summary {
  today: string;
  activeCount: number; trialCount: number; pausedCount: number;
  monthly: number; annual: number; pctOfIncome: number | null;
  categories: CategoryTotal[]; upcoming: Upcoming[];
  review: ReviewItem[]; reviewSavings: number;
  trialsEnding: { id: string; name: string; date: string | null; annual: number; daysAway: number }[];
  dueIn7: number;
  biggest: { id: string; name: string; annual: number }[];
}

export function summarize(subsIn: unknown, todayISO?: string, opts?: { income?: number }): Summary {
  const subs = normalizeAll(subsIn);
  const today = parseISO(todayISO) ? (todayISO as string) : localToday();
  const income = Number(opts?.income) || 0;
  const active = subs.filter(s => s.status === 'active');
  const trials = subs.filter(s => s.status === 'trial');

  const monthly = active.reduce((a, s) => a + monthlyCost(s), 0);
  const annual = monthly * 12;

  const byCat: Record<string, CategoryTotal> = {};
  active.forEach(s => {
    const b = (byCat[s.category] = byCat[s.category] || { id: s.category, label: CAT[s.category].label, icon: CAT[s.category].icon, monthly: 0, annual: 0, count: 0, share: 0 });
    b.monthly += monthlyCost(s); b.annual += annualCost(s); b.count++;
  });
  const categories = Object.values(byCat).sort((a, b) => b.annual - a.annual).map(b => Object.assign(b, { share: annual > 0 ? b.annual / annual : 0 }));

  const upcoming: Upcoming[] = [];
  subs.filter(isLive).forEach(s => {
    const d = nextRenewal(s, today);
    if (!d) return;
    const daysAway = daysBetween(today, d);
    if (daysAway <= 30) upcoming.push({ id: s.id, name: s.name, date: d, daysAway, cost: s.amount / s.split, trial: s.status === 'trial' });
  });
  upcoming.sort((a, b) => a.daysAway - b.daysAway || a.name.localeCompare(b.name));

  // review candidates: low value first, then overlapping services in the same category
  const review: ReviewItem[] = [];
  const flagged = new Set<string>();
  active.forEach(s => {
    if (s.usefulness !== null && s.usefulness <= 2) {
      review.push({ id: s.id, name: s.name, reason: 'low-value', annual: annualCost(s), detail: `You rated it ${s.usefulness}/5` });
      flagged.add(s.id);
    }
  });
  CATEGORIES.filter(c => c.overlap).forEach(c => {
    const group = active.filter(s => s.category === c.id);
    if (group.length < 2) return;
    const score = (s: Subscription) => (s.usefulness === null ? 3 : s.usefulness);
    // keep the best-rated one (ties: keep the cheapest, so the saving is the biggest)
    const keep = group.slice().sort((a, b) => score(b) - score(a) || annualCost(a) - annualCost(b))[0];
    group.forEach(s => {
      if (s.id === keep.id || flagged.has(s.id)) return;
      review.push({ id: s.id, name: s.name, reason: 'overlap', annual: annualCost(s), detail: `${group.length} services in ${c.label} — you also keep ${keep.name}` });
      flagged.add(s.id);
    });
  });
  review.sort((a, b) => b.annual - a.annual);
  const reviewSavings = review.reduce((a, r) => a + r.annual, 0);

  const trialsEnding = trials
    .map(s => ({ id: s.id, name: s.name, date: nextRenewal(s, today), annual: annualCost(s) }))
    .filter(t => t.date)
    .map(t => Object.assign(t, { daysAway: daysBetween(today, t.date as string) }))
    .sort((a, b) => a.daysAway - b.daysAway);

  return {
    today,
    activeCount: active.length, trialCount: trials.length, pausedCount: subs.filter(s => s.status === 'paused').length,
    monthly, annual,
    pctOfIncome: income > 0 ? monthly / income : null,
    categories, upcoming, review, reviewSavings, trialsEnding,
    dueIn7: upcoming.filter(u => u.daysAway <= 7 && !u.trial).reduce((a, u) => a + u.cost, 0),
    biggest: active.slice().sort((a, b) => annualCost(b) - annualCost(a)).slice(0, 3).map(s => ({ id: s.id, name: s.name, annual: annualCost(s) })),
  };
}
