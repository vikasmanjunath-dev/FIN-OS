// Moves and receipts: a reel ends in one thing to do. When the person taps it we remember the figure it is about (their SIP, emergency fund or
// loan balance) and, if that figure later improves, the next visit shows a receipt: what changed, and what it is worth at an assumed rate.
// Detection is automatic from figures already on the phone, so it is honest: a tap alone never earns a receipt. Pure functions, tested.
import { isPlainObject, parseJSON } from '@/lib/safeStore';
import { money, sipFutureValue } from '@/lib/reels/figures';
import type { Mine } from '@/lib/reels/mine';
import type { L } from '@/lib/reels/types';

export type Metric = 'sip' | 'fund' | 'loan';

/** The figure each reel's tool is about. Reels not listed here have no receipt, because there is no figure to check. */
export const METRIC_OF: Record<string, Metric> = {
  'start-early': 'sip', 'guess-sip': 'sip', 'delay-cost': 'sip', 'goal-step-up': 'sip', 'goal-sip-needed': 'sip',
  'emergency-fund': 'fund',
  'emi-trap': 'loan', 'guess-emi': 'loan', 'rbi-and-emi': 'loan', 'home-loan-prepay': 'loan', 'good-bad-debt': 'loan',
};

export interface StoredMove { id: string; metric: Metric; at: string; before: number }
export interface StoredReceipt { id: string; metric: Metric; at: string; before: number; after: number; seen: boolean }
export interface MovesState { v: 1; open: StoredMove[]; receipts: StoredReceipt[] }
export const EMPTY_MOVES: MovesState = { v: 1, open: [], receipts: [] };

const DAY = 86_400_000;
export const MOVE_EXPIRES_DAYS = 60;
const MAX_OPEN = 10, MAX_RECEIPTS = 20;
const ID = /^[a-z0-9-]{1,40}$/;
const METRICS: Metric[] = ['sip', 'fund', 'loan'];
const RECEIPT_RATE = 12, RECEIPT_YEARS = 20;

export function metricValue(metric: Metric, mine: Mine): number {
  return metric === 'sip' ? mine.sip ?? 0 : metric === 'fund' ? mine.fund ?? 0 : mine.loan?.balance ?? 0;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

/** A stored state made safe: well-formed ids, known metrics, finite figures, bounded lists. */
export function parseMoves(raw: string | null | undefined): MovesState {
  const p = parseJSON(raw ?? null);
  if (!p.ok || !isPlainObject(p.value)) return { v: 1, open: [], receipts: [] };
  const o = p.value as { open?: unknown; receipts?: unknown };
  const arr = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? x.filter(isPlainObject) as Record<string, unknown>[] : []);
  const open: StoredMove[] = [];
  for (const m of arr(o.open)) { const before = num(m.before); if (typeof m.id === 'string' && ID.test(m.id) && METRICS.includes(m.metric as Metric) && typeof m.at === 'string' && m.at.length <= 40 && before !== null) open.push({ id: m.id, metric: m.metric as Metric, at: m.at, before }); }
  const receipts: StoredReceipt[] = [];
  for (const m of arr(o.receipts)) { const before = num(m.before), after = num(m.after); if (typeof m.id === 'string' && ID.test(m.id) && METRICS.includes(m.metric as Metric) && typeof m.at === 'string' && m.at.length <= 40 && before !== null && after !== null) receipts.push({ id: m.id, metric: m.metric as Metric, at: m.at, before, after, seen: m.seen === true }); }
  return { v: 1, open: open.slice(-MAX_OPEN), receipts: receipts.slice(-MAX_RECEIPTS) };
}

/** The person tapped a reel's tool. Remembers the figure as it is now; tapping again restarts the clock for that reel. */
export function startMove(state: MovesState, reelId: string, mine: Mine, now: Date): MovesState {
  const metric = METRIC_OF[reelId];
  if (!metric) return state;
  const open = [...state.open.filter(m => m.id !== reelId), { id: reelId, metric, at: now.toISOString(), before: metricValue(metric, mine) }].slice(-MAX_OPEN);
  return { ...state, open };
}

/** Whether the figure has genuinely improved since the tap (small wobbles do not count). */
export function improved(m: StoredMove, now: number): boolean {
  if (m.metric === 'sip') return now > m.before && now - m.before >= Math.max(100, m.before * 0.05);
  if (m.metric === 'fund') return now > m.before && now - m.before >= Math.max(1000, m.before * 0.05);
  return m.before > 0 && m.before - now >= Math.max(5000, m.before * 0.02);          // loan: the balance fell
}

/** Turns open moves whose figure improved into receipts, drops moves that waited too long, and leaves the rest open. */
export function settleMoves(state: MovesState, mine: Mine, now: Date): MovesState {
  const open: StoredMove[] = [], receipts = [...state.receipts];
  for (const m of state.open) {
    const cur = metricValue(m.metric, mine);
    const since = (now.getTime() - new Date(m.at).getTime()) / DAY;
    if (improved(m, cur)) receipts.push({ id: m.id, metric: m.metric, at: now.toISOString(), before: m.before, after: cur, seen: false });
    else if (Number.isFinite(since) && since <= MOVE_EXPIRES_DAYS) open.push(m);
  }
  return { v: 1, open, receipts: receipts.slice(-MAX_RECEIPTS) };
}

export const unseenReceipts = (s: MovesState): StoredReceipt[] => s.receipts.filter(r => !r.seen);
export const markSeen = (s: MovesState, id: string, at: string): MovesState => ({ ...s, receipts: s.receipts.map(r => (r.id === id && r.at === at ? { ...r, seen: true } : r)) });

/** The sentence a receipt shows, in both languages. Money figures are the person's own; the growth figure is labelled an assumption. */
export function receiptText(r: StoredReceipt, mine: Mine): { title: L; body: L } {
  if (r.metric === 'sip') {
    const extra = r.after - r.before, grown = money(sipFutureValue(extra, RECEIPT_RATE, RECEIPT_YEARS));
    const tail = { en: `At an assumed ${RECEIPT_RATE}% a year, the extra ${money(extra).en} a month grows to about ${grown.en} in ${RECEIPT_YEARS} years. An illustration, not a promise.`, hi: `अनुमानित ${RECEIPT_RATE}% सालाना पर, अतिरिक्त ${money(extra).hi} महीना ${RECEIPT_YEARS} साल में लगभग ${grown.hi} हो जाता है। उदाहरण है, वादा नहीं।` };
    return r.before > 0
      ? { title: { en: 'You raised your SIP', hi: 'आपने अपनी SIP बढ़ाई' }, body: { en: `From ${money(r.before).en} to ${money(r.after).en} a month. ${tail.en}`, hi: `${money(r.before).hi} से ${money(r.after).hi} महीना। ${tail.hi}` } }
      : { title: { en: 'You started a SIP', hi: 'आपने SIP शुरू की' }, body: { en: `${money(r.after).en} a month. ${tail.en}`, hi: `${money(r.after).hi} महीना। ${tail.hi}` } };
  }
  if (r.metric === 'fund') {
    const months = mine.spend && mine.spend > 0 ? r.after / mine.spend : null;
    const m = months !== null ? { en: ` That is about ${Math.round(months * 10) / 10} months of your spending.`, hi: ` यह आपके ख़र्च के लगभग ${Math.round(months * 10) / 10} महीने है।` } : { en: '', hi: '' };
    return { title: { en: 'Your emergency fund grew', hi: 'आपका इमरजेंसी फ़ंड बढ़ा' }, body: { en: `From ${money(r.before).en} to ${money(r.after).en}.${m.en}`, hi: `${money(r.before).hi} से ${money(r.after).hi}।${m.hi}` } };
  }
  return r.after === 0
    ? { title: { en: 'Your loan is cleared', hi: 'आपका लोन चुक गया' }, body: { en: `It was ${money(r.before).en} when you opened the reel.`, hi: `रील खोलते समय यह ${money(r.before).hi} था।` } }
    : { title: { en: 'Your loan balance fell', hi: 'आपके लोन की बकाया रकम घटी' }, body: { en: `From ${money(r.before).en} to ${money(r.after).en}: ${money(r.before - r.after).en} less to pay interest on.`, hi: `${money(r.before).hi} से ${money(r.after).hi}: ${money(r.before - r.after).hi} कम पर ब्याज देना होगा।` } };
}
