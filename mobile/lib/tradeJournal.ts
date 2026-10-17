// Trade journal: the pure core (no React, no storage; "now" is always a parameter).
// Port of the standalone website app in TradeJournal/ (TradeBook Pro): the trade fields, the psychology tags and the analytics, with the
// website's defects corrected on purpose (they are listed in docs/agent-notes/trade-journal.md and pinned by
// __tests__/tradeJournal.parity.test.mts, which runs the website's own app.js against this file).
//
// Rules this file keeps:
//   * A figure the person did not record is absent, never defaulted. A trade whose profit is not known (no exit yet, or no gross
//     profit) is "not rated": it is listed, counted, and left out of every profit statistic.
//   * Charges that were not recorded are not guessed. The screens say how many trades have none.
//   * Psychology output is counts and comparisons of the person's own log, in plain words. Never advice, never a score or a grade.
//   * Not investment advice and not tax: nothing here computes tax.
import { moneyIN } from '@/lib/calcs/fmt';
import { finite, isPlainObject, text } from '@/lib/safeStore';

// ── the website's lists (TradeJournal/index.html), kept verbatim so a trade means the same on both sides ───────────────────────
export const SIDES = ['Long', 'Short'] as const;
export type Side = (typeof SIDES)[number];

export const INSTRUMENT_TYPES = [
  { id: 'Equity', label: 'Equity / cash' }, { id: 'Futures', label: 'Futures' }, { id: 'CE', label: 'Options CE (call)' }, { id: 'PE', label: 'Options PE (put)' },
  { id: 'Currency', label: 'Currency' }, { id: 'Commodity', label: 'Commodity' }, { id: 'ETF', label: 'ETF / MF' }, { id: 'Crypto', label: 'Crypto' },
] as const;
/** During-the-trade emotions (the website's emotion buttons). */
export const EMOTIONS = ['Calm', 'Confident', 'Anxious', 'Greedy', 'FOMO', 'Disciplined', 'Scared', 'Revenge'] as const;
/** Before-the-trade emotions (the website's pre-trade chips). */
export const PRE_EMOTIONS = ['Calm', 'Confident', 'Anxious', 'Greedy', 'FOMO', 'Focused', 'Frustrated', 'Tired', 'Overconfident'] as const;
export const DISCIPLINE = [{ id: 'followed', label: 'Followed all my rules' }, { id: 'partial', label: 'Partly followed' }, { id: 'broken', label: 'Broke my rules' }] as const;
export const PLAN_ADHERENCE = [
  { id: 'fully', label: 'Fully followed the plan' }, { id: 'mostly', label: 'Mostly followed' }, { id: 'modified', label: 'Changed it mid-trade' },
  { id: 'deviated', label: 'Left the plan' }, { id: 'no-plan', label: 'Had no plan' },
] as const;
export const SETUP_GRADES = [
  { id: 'A+', label: 'A+ perfect' }, { id: 'A', label: 'A strong' }, { id: 'B', label: 'B good' }, { id: 'C', label: 'C mediocre' }, { id: 'D', label: 'D forced / FOMO' },
] as const;
export const REGIMES = ['Trending Up', 'Trending Down', 'Range Bound', 'High Volatility', 'Low Volatility', 'Breakout', 'Pre-Expiry', 'Event Day'] as const;
export const ENERGY = ['🔋 100% — Fresh', '🔋 75% — Good', '🔋 50% — Average', '🔋 25% — Tired', '💀 Exhausted'] as const;
export const TAG_TYPES = [
  { id: 'market_regime', label: 'Market regime' }, { id: 'setup', label: 'Setup type' }, { id: 'condition', label: 'Market condition' }, { id: 'custom', label: 'Custom' },
] as const;
export const TAG_COLORS = ['#00ff88', '#00d4ff', '#f7b731', '#ff4d6d', '#a29bfe', '#ff9f43', '#ff6b9d', '#26de81'] as const;
/** The website's example setups, offered as suggestions only (the person can type anything). */
export const SETUP_SUGGESTIONS = [
  'Momentum Long', 'Momentum Short', 'ORB (Opening Range Breakout)', 'BB Breakout', 'RSI Reversal', 'Trend Follow', 'Scalp', 'Gap & Go', 'VWAP Bounce', 'EMA Crossover',
  'Support Bounce', 'Resistance Rejection', 'Breakout Retest', 'Inside Bar', 'Flag Pattern', 'News Play', 'Earnings Play',
] as const;

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** Below this many trades a comparison is shown with a "very few trades" note. A count, not a statistical test. */
export const FEW_TRADES = 5;
export const MAX_TRADES = 50_000;

// ── the record ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const CHARGE_FIELDS = ['brokerage', 'stt', 'exchange', 'sebi', 'gst', 'slippage', 'other'] as const;
export type ChargeField = (typeof CHARGE_FIELDS)[number];
export const CHARGE_LABELS: Record<ChargeField, string> = {
  brokerage: 'Brokerage', stt: 'STT / CTT', exchange: 'Exchange charges', sebi: 'SEBI fee', gst: 'GST', slippage: 'Slippage', other: 'Other (stamp duty, DP charges…)',
};

export interface Trade {
  id: string;
  /** YYYY-MM-DD, a real calendar date. */
  date: string;
  symbol: string;
  direction?: Side;
  instrumentType?: string;
  /** Prices per unit. `exit` may be 0 (an option that expired worthless); absent means "not recorded". */
  entry?: number;
  exit?: number;
  /** Units (shares / contracts × lot size is `qty × lotSize`). */
  qty?: number;
  lotSize?: number;
  /** Profit before charges, in ₹. Absent: worked out from the prices when they are all there, else the trade is "not rated". */
  gross?: number;
  brokerage?: number; stt?: number; exchange?: number; sebi?: number; gst?: number; slippage?: number; other?: number;
  /** The total, for a person who only knows the total (the website's `tax` field). Used only when no single charge is recorded. */
  chargesTotal?: number;
  strategy?: string;
  setupGrade?: string;
  regime?: string;
  preEmotion?: string;
  emotion?: string;
  /** Three states on purpose: true, false, or not recorded (the website saves `false` for a box nobody touched). */
  isRevenge?: boolean;
  isImpulsive?: boolean;
  discipline?: string;
  planAdherence?: string;
  confidence?: number;
  stress?: number;
  energy?: string;
  tags?: string[];
  entryTime?: string;
  exitTime?: string;
  reason?: string;
  mistakes?: string;
  lesson?: string;
  notes?: string;
  /** Set by an import, so the whole import can be undone. */
  src?: string;
  batch?: string;
  savedAt?: string;
}

export interface Tag { id: string; name: string; type: string; color: string }

const KNOWN = new Set<string>([
  'id', 'date', 'symbol', 'direction', 'instrumentType', 'entry', 'exit', 'qty', 'lotSize', 'gross', ...CHARGE_FIELDS, 'chargesTotal', 'strategy', 'setupGrade', 'regime',
  'preEmotion', 'emotion', 'isRevenge', 'isImpulsive', 'discipline', 'planAdherence', 'confidence', 'stress', 'energy', 'tags', 'entryTime', 'exitTime',
  'reason', 'mistakes', 'lesson', 'notes', 'src', 'batch', 'savedAt',
]);

// ── small helpers ────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Money to the paisa, the way the website rounds (toFixed(2)); never -0. */
export const r2 = (n: number): number => Number(n.toFixed(2)) + 0;

export function validDate(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y < 1990 || y > 2100) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}
/** Local calendar date as YYYY-MM-DD (not the UTC date: before 5:30 am in India that would still be yesterday). */
export const todayISO = (now: Date): string => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
/** 0 = Sunday … 6 = Saturday, for a YYYY-MM-DD date, independent of the phone's time zone. */
export const weekdayOf = (date: string): number => new Date(`${date}T12:00:00Z`).getUTCDay();
const validTime = (s: unknown): s is string => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const optNum = (v: unknown, min = 0): number | undefined => { const n = finite(v, NaN); return Number.isFinite(n) && n >= min ? n : undefined; };
const optText = (v: unknown, max: number): string | undefined => { const t = text(v, '', max).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim(); return t === '' ? undefined : t; };
const optBool = (v: unknown): boolean | undefined => (v === true || v === 'true' ? true : v === false || v === 'false' ? false : undefined);
const optInt10 = (v: unknown): number | undefined => { const n = finite(v, NaN); return Number.isInteger(n) && n >= 1 && n <= 10 ? n : undefined; };

// ── reading a stored record ──────────────────────────────────────────────────────────────────────────────────────────────────
/** A stored value as a Trade, or null when it is not a usable record (no id, no real date, no symbol). Never throws; never guesses a missing figure. */
export function readTrade(raw: unknown): Trade | null {
  if (!isPlainObject(raw)) return null;
  const id = text(raw.id, '', 80).trim();
  if (!id || id === '__proto__') return null;
  const date = typeof raw.date === 'string' ? raw.date.slice(0, 10) : '';
  if (!validDate(date)) return null;
  const symbol = text(raw.symbol, '', 40).trim().toUpperCase();
  if (!symbol) return null;
  const t: Trade = { id, date, symbol };
  const dirRaw = typeof raw.direction === 'string' ? raw.direction.trim().toLowerCase() : '';
  if (dirRaw === 'long' || dirRaw === 'buy') t.direction = 'Long'; else if (dirRaw === 'short' || dirRaw === 'sell') t.direction = 'Short';
  const set = <K extends keyof Trade>(k: K, v: Trade[K] | undefined) => { if (v !== undefined) t[k] = v; };
  set('instrumentType', optText(raw.instrumentType, 20));
  const entry = optNum(raw.entry), exit = optNum(raw.exit);
  set('entry', entry !== undefined && entry > 0 ? entry : undefined);
  set('exit', exit);
  set('qty', (() => { const q = optNum(raw.qty); return q !== undefined && q > 0 ? q : undefined; })());
  set('lotSize', (() => { const q = optNum(raw.lotSize); return q !== undefined && q > 0 ? q : undefined; })());
  const g = finite(raw.gross, NaN); if (Number.isFinite(g)) t.gross = g;
  for (const f of CHARGE_FIELDS) set(f, optNum(raw[f]));
  set('chargesTotal', optNum(raw.chargesTotal));
  set('strategy', optText(raw.strategy, 60)); set('setupGrade', optText(raw.setupGrade, 4)); set('regime', optText(raw.regime, 40));
  set('preEmotion', optText(raw.preEmotion, 30)); set('emotion', optText(raw.emotion, 30));
  set('isRevenge', optBool(raw.isRevenge)); set('isImpulsive', optBool(raw.isImpulsive));
  set('discipline', optText(raw.discipline, 12)); set('planAdherence', optText(raw.planAdherence, 12));
  set('confidence', optInt10(raw.confidence)); set('stress', optInt10(raw.stress)); set('energy', optText(raw.energy, 30));
  if (Array.isArray(raw.tags)) { const tags = raw.tags.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 80).slice(0, 30); if (tags.length) t.tags = [...new Set(tags)]; }
  if (validTime(raw.entryTime)) t.entryTime = raw.entryTime;
  if (validTime(raw.exitTime)) t.exitTime = raw.exitTime;
  set('reason', optText(raw.reason, 2000)); set('mistakes', optText(raw.mistakes, 2000)); set('lesson', optText(raw.lesson, 2000)); set('notes', optText(raw.notes, 2000));
  set('src', optText(raw.src, 20)); set('batch', optText(raw.batch, 60)); set('savedAt', optText(raw.savedAt, 40));
  return t;
}

/** Usable trades from a raw stored list, each with its index in that list (writers edit the raw list by index and never rewrite a record they could not read). */
export function readAll(raw: unknown[]): { trade: Trade; i: number }[] {
  const out: { trade: Trade; i: number }[] = [];
  const seen = new Set<string>();
  raw.forEach((r, i) => { const t = readTrade(r); if (t && !seen.has(t.id)) { seen.add(t.id); out.push({ trade: t, i }); } });
  return out;
}

export function readTag(raw: unknown): Tag | null {
  if (!isPlainObject(raw)) return null;
  const id = text(raw.id, '', 80).trim(), name = text(raw.name, '', 40).trim();
  if (!id || !name || id === '__proto__') return null;
  const type = TAG_TYPES.some(x => x.id === raw.type) ? String(raw.type) : 'custom';
  const color = typeof raw.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.color) ? raw.color : TAG_COLORS[0];
  return { id, name, type, color };
}

/** Fields of a stored record this version does not know, carried over unchanged when the record is edited. */
export function unknownFields(raw: unknown): Record<string, unknown> {
  if (!isPlainObject(raw)) return {};
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(raw)) if (!KNOWN.has(k) && k !== '__proto__') out[k] = raw[k];
  return out;
}

// ── profit and loss of one trade ─────────────────────────────────────────────────────────────────────────────────────────────
/** Profit from the prices, before charges: (exit − entry) × side × qty × lot size. null unless every one of them is recorded (an exit of 0 counts). */
export function priceGross(t: Pick<Trade, 'entry' | 'exit' | 'qty' | 'lotSize' | 'direction'>): number | null {
  if (t.direction !== 'Long' && t.direction !== 'Short') return null;
  if (!(typeof t.entry === 'number' && t.entry > 0) || typeof t.exit !== 'number' || !(typeof t.qty === 'number' && t.qty > 0)) return null;
  const sign = t.direction === 'Short' ? -1 : 1;
  const g = (t.exit - t.entry) * sign * t.qty * (t.lotSize && t.lotSize > 0 ? t.lotSize : 1);
  return Number.isFinite(g) ? r2(g) : null;
}
/** Profit before charges: the figure the person typed or imported, else the one the prices give, else null (not rated). */
export const grossOf = (t: Trade): number | null => (typeof t.gross === 'number' && Number.isFinite(t.gross) ? t.gross : priceGross(t));
/** true when the person recorded at least one charge. */
export const hasCharges = (t: Trade): boolean => CHARGE_FIELDS.some(f => typeof t[f] === 'number') || typeof t.chargesTotal === 'number';
/** All charges: the single charges added up, or the recorded total when no single charge is given, else 0. */
export function chargesOf(t: Trade): number {
  if (CHARGE_FIELDS.some(f => typeof t[f] === 'number')) return r2(CHARGE_FIELDS.reduce((s, f) => s + (t[f] ?? 0), 0));
  return typeof t.chargesTotal === 'number' ? r2(t.chargesTotal) : 0;
}
/** Profit after charges, or null when the profit is not known. */
export function netOf(t: Trade): number | null {
  const g = grossOf(t);
  return g === null ? null : r2(g - chargesOf(t));
}

export interface Rated { t: Trade; gross: number; charges: number; net: number; chargesKnown: boolean; seq: number }
/** Splits a list into trades with a known profit (in the order given, `seq` remembers it) and the rest. */
export function rate(trades: readonly Trade[]): { rated: Rated[]; unrated: Trade[] } {
  const rated: Rated[] = [], unrated: Trade[] = [];
  trades.forEach((t, seq) => {
    const g = grossOf(t);
    if (g === null) unrated.push(t);
    else { const c = chargesOf(t); rated.push({ t, gross: g, charges: c, net: r2(g - c), chargesKnown: hasCharges(t), seq }); }
  });
  return { rated, unrated };
}

/** Oldest first: by date, then entry time when both have one, then the order they were logged. */
export function chrono(rated: readonly Rated[]): Rated[] {
  return [...rated].sort((a, b) => {
    if (a.t.date !== b.t.date) return a.t.date < b.t.date ? -1 : 1;
    if (a.t.entryTime && b.t.entryTime && a.t.entryTime !== b.t.entryTime) return a.t.entryTime < b.t.entryTime ? -1 : 1;
    return a.seq - b.seq;
  });
}
/** Newest first, for lists. */
export function newestFirst<T extends Trade>(trades: readonly T[]): T[] {
  return [...trades].sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : (a.entryTime ?? '') !== (b.entryTime ?? '') ? ((a.entryTime ?? '') < (b.entryTime ?? '') ? 1 : -1) : (a.savedAt ?? '') < (b.savedAt ?? '') ? 1 : -1));
}

// ── totals ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface Streaks { maxWin: number; maxLoss: number; current: { kind: 'win' | 'loss' | 'none'; length: number } }
export interface Summary {
  /** trades with a known profit */
  count: number;
  /** trades with no known profit (left out of everything below) */
  unrated: number;
  /** rated trades with no charge recorded: their net profit is the gross figure and may be overstated */
  noCharges: number;
  wins: number; losses: number; breakeven: number;
  /** wins ÷ rated trades (breakeven trades count as not won), 0–1; null with no trades */
  winRate: number | null;
  net: number; gross: number; charges: number;
  avgWin: number | null; avgLoss: number | null;
  /** average win ÷ average loss, null with no wins or no losses */
  payoff: number | null;
  /** total won ÷ total lost, null when nothing was lost (read grossLoss to tell "no losses" from "no trades") */
  profitFactor: number | null;
  grossWin: number; grossLoss: number;
  /** average net profit per trade = what the next trade has returned on average so far (a past average, not a forecast) */
  expectancy: number | null;
  best: number | null; worst: number | null;
  maxDrawdown: number; drawdownFrom: string | null; drawdownTo: string | null;
  streaks: Streaks;
  from: string | null; to: string | null; tradingDays: number;
}

export interface EquityPoint { seq: number; date: string; id: string; net: number; equity: number; peak: number; drawdown: number }

/** Running total of net profit, trade by trade, oldest first. The curve starts at 0 before the first trade, so the first loss is already a drawdown. */
export function equityCurve(rated: readonly Rated[]): EquityPoint[] {
  let eq = 0, peak = 0;
  return chrono(rated).map(r => {
    eq = r2(eq + r.net); if (eq > peak) peak = eq;
    return { seq: r.seq, date: r.t.date, id: r.t.id, net: r.net, equity: eq, peak, drawdown: r2(peak - eq) };
  });
}

export function summarize(trades: readonly Trade[]): Summary {
  const { rated, unrated } = rate(trades);
  const ordered = chrono(rated);
  const wins = rated.filter(r => r.net > 0), losses = rated.filter(r => r.net < 0);
  const sum = (a: readonly { net: number }[]) => a.reduce((s, r) => s + r.net, 0);
  const grossWin = r2(sum(wins)), grossLoss = r2(Math.abs(sum(losses)));
  const net = r2(sum(rated));
  // max drawdown with the dates it started and ended
  let eq = 0, peak = 0, peakDate: string | null = null, maxDD = 0, ddFrom: string | null = null, ddTo: string | null = null;
  for (const r of ordered) {
    eq = r2(eq + r.net);
    if (eq > peak) { peak = eq; peakDate = r.t.date; }
    const dd = r2(peak - eq);
    if (dd > maxDD) { maxDD = dd; ddFrom = peakDate ?? ordered[0].t.date; ddTo = r.t.date; }
  }
  // streaks: a breakeven trade ends both kinds of streak
  let w = 0, l = 0, maxW = 0, maxL = 0;
  for (const r of ordered) {
    if (r.net > 0) { w++; l = 0; if (w > maxW) maxW = w; } else if (r.net < 0) { l++; w = 0; if (l > maxL) maxL = l; } else { w = 0; l = 0; }
  }
  const days = new Set(rated.map(r => r.t.date));
  const n = rated.length;
  const avgWin = wins.length ? grossWin / wins.length : null;
  const avgLoss = losses.length ? grossLoss / losses.length : null;
  return {
    count: n, unrated: unrated.length, noCharges: rated.filter(r => !r.chargesKnown).length,
    wins: wins.length, losses: losses.length, breakeven: n - wins.length - losses.length,
    winRate: n ? wins.length / n : null,
    net, gross: r2(rated.reduce((s, r) => s + r.gross, 0)), charges: r2(rated.reduce((s, r) => s + r.charges, 0)),
    avgWin, avgLoss, payoff: avgWin !== null && avgLoss !== null && avgLoss > 0 ? avgWin / avgLoss : null,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null, grossWin, grossLoss,
    expectancy: n ? net / n : null,
    best: n ? Math.max(...rated.map(r => r.net)) : null, worst: n ? Math.min(...rated.map(r => r.net)) : null,
    maxDrawdown: maxDD, drawdownFrom: ddFrom, drawdownTo: ddTo,
    streaks: { maxWin: maxW, maxLoss: maxL, current: w > 0 ? { kind: 'win', length: w } : l > 0 ? { kind: 'loss', length: l } : { kind: 'none', length: 0 } },
    from: ordered.length ? ordered[0].t.date : null, to: ordered.length ? ordered[ordered.length - 1].t.date : null, tradingDays: days.size,
  };
}

// ── groups: by setup / tag / weekday / month … ──────────────────────────────────────────────────────────────────────────────
export interface Group { key: string; label: string; count: number; wins: number; losses: number; net: number; avg: number; winRate: number }

export function groupBy(rated: readonly Rated[], keys: (r: Rated) => string[], label: (k: string) => string = k => k): Group[] {
  const by = new Map<string, { count: number; wins: number; losses: number; net: number }>();
  for (const r of rated) {
    for (const k of new Set(keys(r))) {
      const g = by.get(k) ?? { count: 0, wins: 0, losses: 0, net: 0 };
      g.count++; g.net += r.net; if (r.net > 0) g.wins++; else if (r.net < 0) g.losses++;
      by.set(k, g);
    }
  }
  return [...by.entries()].map(([key, g]) => ({ key, label: label(key), count: g.count, wins: g.wins, losses: g.losses, net: r2(g.net), avg: g.net / g.count, winRate: g.wins / g.count }));
}
export const NONE = 'Not recorded';
export const bySetup = (rated: readonly Rated[]) => groupBy(rated, r => [r.t.strategy ?? NONE]).sort((a, b) => b.net - a.net);
export const bySymbol = (rated: readonly Rated[]) => groupBy(rated, r => [r.t.symbol]).sort((a, b) => b.net - a.net);
export const byDirection = (rated: readonly Rated[]) => groupBy(rated, r => [r.t.direction ?? NONE]).sort((a, b) => b.count - a.count);
export const byInstrument = (rated: readonly Rated[]) => groupBy(rated, r => [r.t.instrumentType ?? NONE]).sort((a, b) => b.net - a.net);
/** A trade with several tags appears under each of them; a tag id that no longer exists is skipped. */
export function byTag(rated: readonly Rated[], tags: readonly Tag[]): Group[] {
  const name = new Map(tags.map(t => [t.id, t.name]));
  return groupBy(rated, r => (r.t.tags ?? []).filter(id => name.has(id)), id => name.get(id) ?? id).sort((a, b) => b.net - a.net);
}
/** Sunday … Saturday, only the days that have trades. */
export function byWeekday(rated: readonly Rated[]): Group[] {
  return groupBy(rated, r => [String(weekdayOf(r.t.date))], k => WEEKDAYS[+k]).sort((a, b) => +a.key - +b.key);
}
/** Oldest month first. */
export function byMonth(rated: readonly Rated[]): Group[] {
  return groupBy(rated, r => [r.t.date.slice(0, 7)], k => `${MONTH_NAMES[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}`).sort((a, b) => (a.key < b.key ? -1 : 1));
}
/** Net profit per day, oldest first. */
export function byDay(rated: readonly Rated[]): { date: string; net: number; count: number }[] {
  const m = new Map<string, { net: number; count: number }>();
  for (const r of rated) { const d = m.get(r.t.date) ?? { net: 0, count: 0 }; d.net += r.net; d.count++; m.set(r.t.date, d); }
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, d]) => ({ date, net: r2(d.net), count: d.count }));
}

// ── periods ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type Period = 'all' | 'fy' | '90d' | '30d';
export const PERIODS: { id: Period; label: string }[] = [{ id: 'all', label: 'All time' }, { id: 'fy', label: 'This financial year' }, { id: '90d', label: 'Last 90 days' }, { id: '30d', label: 'Last 30 days' }];
/** First day of the Indian financial year (1 April) that contains `today`. */
export function fyStart(today: string): string {
  const y = +today.slice(0, 4), m = +today.slice(5, 7);
  return `${m >= 4 ? y : y - 1}-04-01`;
}
function addDays(date: string, n: number): string { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export function inPeriod(trades: readonly Trade[], period: Period, today: string): Trade[] {
  if (period === 'all') return [...trades];
  const from = period === 'fy' ? fyStart(today) : addDays(today, period === '90d' ? -89 : -29);
  return trades.filter(t => t.date >= from && t.date <= today);
}

// ── psychology: counts and comparisons, in the person's own words ────────────────────────────────────────────────────────────
export interface Cohort { count: number; wins: number; losses: number; net: number; avg: number | null; winRate: number | null }
export function cohort(rated: readonly Rated[]): Cohort {
  const net = r2(rated.reduce((s, r) => s + r.net, 0));
  const wins = rated.filter(r => r.net > 0).length, losses = rated.filter(r => r.net < 0).length;
  return { count: rated.length, wins, losses, net, avg: rated.length ? net / rated.length : null, winRate: rated.length ? wins / rated.length : null };
}

export interface Comparison { id: string; title: string; basis: string; a: { label: string; cohort: Cohort }; b: { label: string; cohort: Cohort } }

/** "With" against "without" for one yes/no question. `pick` gives true (in the group), false (the comparison group) or null (not recorded: left out of both). */
export function compare(rated: readonly Rated[], id: string, title: string, basis: string, labels: [string, string], pick: (r: Rated) => boolean | null): Comparison {
  const a: Rated[] = [], b: Rated[] = [];
  for (const r of rated) { const p = pick(r); if (p === true) a.push(r); else if (p === false) b.push(r); }
  return { id, title, basis, a: { label: labels[0], cohort: cohort(a) }, b: { label: labels[1], cohort: cohort(b) } };
}

/** One row per value the person recorded, most-used first. */
export function tableBy(rated: readonly Rated[], pick: (r: Rated) => string | undefined, order?: readonly string[]): { value: string; cohort: Cohort }[] {
  const m = new Map<string, Rated[]>();
  for (const r of rated) { const v = pick(r); if (v) (m.get(v) ?? m.set(v, []).get(v)!).push(r); }
  const rows = [...m.entries()].map(([value, list]) => ({ value, cohort: cohort(list) }));
  return rows.sort((a, b) => {
    if (order) { const ia = order.indexOf(a.value), ib = order.indexOf(b.value); if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); }
    return b.cohort.count - a.cohort.count || (a.value < b.value ? -1 : 1);
  });
}

/** Trades taken after a loss earlier the same day, against every other trade. "Earlier" is the order logged (and entry time where both have one). */
export function afterSameDayLoss(rated: readonly Rated[]): Comparison {
  const ordered = chrono(rated);
  const flagged = new Set<number>();
  let prev: Rated | null = null;
  for (const r of ordered) { if (prev && prev.t.date === r.t.date && prev.net < 0) flagged.add(r.seq); prev = r; }
  return compare(rated, 'after-loss', 'Taken right after a loss the same day', 'A trade counts here when the trade just before it, on the same day, lost money. This is a timing pattern in your log, not a record of why you traded.', ['After a same-day loss', 'All other trades'], r => flagged.has(r.seq));
}
/** Win rate after a winning trade against after a losing trade, in logged order (breakeven trades are skipped as the "previous" trade). */
export function afterOutcome(rated: readonly Rated[]): Comparison {
  const ordered = chrono(rated);
  const afterWin = new Set<number>(), afterLoss = new Set<number>();
  ordered.forEach((r, i) => { if (i === 0) return; const p = ordered[i - 1]; if (p.net > 0) afterWin.add(r.seq); else if (p.net < 0) afterLoss.add(r.seq); });
  return compare(rated, 'after-outcome', 'After a win and after a loss', 'Each trade is grouped by whether the trade before it (in the order logged) was a win or a loss. The first trade, and trades after a breakeven, are left out.', ['After a win', 'After a loss'], r => (afterWin.has(r.seq) ? true : afterLoss.has(r.seq) ? false : null));
}
/** Confidence and stress (1–10) in three bands, only for trades where it was recorded. */
export function byBand(rated: readonly Rated[], field: 'confidence' | 'stress'): { band: string; cohort: Cohort }[] {
  const bands: [string, (n: number) => boolean][] = [['1 to 3', n => n <= 3], ['4 to 6', n => n >= 4 && n <= 6], ['7 to 10', n => n >= 7]];
  return bands.map(([band, ok]) => ({ band, cohort: cohort(rated.filter(r => { const v = r.t[field]; return typeof v === 'number' && ok(v); })) })).filter(b => b.cohort.count > 0);
}

/** Minutes between entry and exit time on the same day; null when either is missing or the exit is not later (an overnight trade cannot be told from a typing slip). */
export function holdMinutes(t: Pick<Trade, 'entryTime' | 'exitTime'>): number | null {
  if (!t.entryTime || !t.exitTime) return null;
  const [eh, em] = t.entryTime.split(':').map(Number), [xh, xm] = t.exitTime.split(':').map(Number);
  const d = xh * 60 + xm - (eh * 60 + em);
  return d > 0 ? d : null;
}
export function holdTimes(rated: readonly Rated[]): { winners: { count: number; avgMinutes: number | null }; losers: { count: number; avgMinutes: number | null } } {
  const avg = (list: Rated[]) => { const m = list.map(r => holdMinutes(r.t)).filter((x): x is number => x !== null); return { count: m.length, avgMinutes: m.length ? m.reduce((s, x) => s + x, 0) / m.length : null }; };
  return { winners: avg(rated.filter(r => r.net > 0)), losers: avg(rated.filter(r => r.net < 0)) };
}

/** The default set of comparisons for the Psychology screen. */
export function psychologyComparisons(rated: readonly Rated[]): Comparison[] {
  return [
    compare(rated, 'revenge', 'Marked as a revenge trade', 'Only trades where you answered the question are used.', ['Marked revenge', 'Marked not revenge'], r => r.t.isRevenge ?? null),
    compare(rated, 'impulsive', 'Marked as an impulsive trade', 'Only trades where you answered the question are used.', ['Marked impulsive', 'Marked planned'], r => r.t.isImpulsive ?? null),
    compare(rated, 'rules', 'Broke your own rules', 'Trades where you recorded how well you kept your rules.', ['Broke rules', 'Followed or partly followed'], r => (r.t.discipline === 'broken' ? true : r.t.discipline ? false : null)),
    compare(rated, 'plan', 'Left or had no plan', 'Trades where you recorded how closely you kept the plan.', ['Deviated / no plan', 'Followed the plan'], r => (r.t.planAdherence === 'deviated' || r.t.planAdherence === 'no-plan' ? true : r.t.planAdherence ? false : null)),
    afterSameDayLoss(rated),
    afterOutcome(rated),
  ];
}

// ── words and money ─────────────────────────────────────────────────────────────────────────────────────────────────────────
/** ₹ with Indian grouping; 2 decimals only when there are paise; lakh / crore for large totals unless `full`. A minus sign is a real minus (never lost); `sign` adds + to gains. */
export function pnlText(n: number | null | undefined, o: { sign?: boolean; full?: boolean } = {}): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  const v = r2(n), a = Math.abs(v);
  const s = v < 0 ? '−' : o.sign && v > 0 ? '+' : '';
  const body = !o.full && a >= 100000 ? moneyIN(a) : '₹' + a.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(a) ? 0 : 2, maximumFractionDigits: 2 });
  return s + body;
}
export const pctText = (x: number | null | undefined): string => (typeof x === 'number' && Number.isFinite(x) ? `${Math.round(x * 100)}%` : '—');
export const countText = (n: number, one: string, many = one + 's'): string => `${n} ${n === 1 ? one : many}`;

/** "7 trades, net −₹4,210, average −₹601 a trade, 29% won". */
export function cohortLine(label: string, c: Cohort): string {
  if (c.count === 0) return `${label}: no trades.`;
  return `${label}: ${countText(c.count, 'trade')}, net ${pnlText(c.net, { sign: true })}, average ${pnlText(c.avg, { sign: true })} a trade, ${pctText(c.winRate)} won${c.count < FEW_TRADES ? ` (only ${c.count}: too few to say much)` : ''}.`;
}

// ── tags ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export function buildTag(input: { name: string; type?: string; color?: string }, existing: readonly Tag[], id: string): { ok: true; tag: Tag } | { ok: false; error: string } {
  const name = input.name.replace(/\s+/g, ' ').trim();
  if (!name) return { ok: false, error: 'Give the tag a name.' };
  if (name.length > 30) return { ok: false, error: 'Keep the tag name to 30 characters or fewer.' };
  if (existing.some(t => t.name.toLowerCase() === name.toLowerCase())) return { ok: false, error: 'You already have a tag with that name.' };
  if (existing.length >= 60) return { ok: false, error: 'That is plenty of tags (60). Delete one you no longer use first.' };
  const type = TAG_TYPES.some(x => x.id === input.type) ? String(input.type) : 'custom';
  const color = input.color && /^#[0-9a-fA-F]{6}$/.test(input.color) ? input.color : TAG_COLORS[0];
  return { ok: true, tag: { id, name, type, color } };
}

// ── the form ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface TradeForm {
  date: string; symbol: string; direction: '' | Side; instrumentType: string;
  entry: string; exit: string; qty: string; lotSize: string;
  grossOverride: string;
  brokerage: string; stt: string; exchange: string; sebi: string; gst: string; slippage: string; other: string; chargesTotal: string;
  strategy: string; setupGrade: string; regime: string;
  preEmotion: string; emotion: string; isRevenge: '' | 'yes' | 'no'; isImpulsive: '' | 'yes' | 'no';
  discipline: string; planAdherence: string; confidence: string; stress: string; energy: string;
  tags: string[];
  entryTime: string; exitTime: string; reason: string; mistakes: string; lesson: string; notes: string;
}

export const emptyForm = (today: string): TradeForm => ({
  date: today, symbol: '', direction: '', instrumentType: '', entry: '', exit: '', qty: '', lotSize: '', grossOverride: '',
  brokerage: '', stt: '', exchange: '', sebi: '', gst: '', slippage: '', other: '', chargesTotal: '',
  strategy: '', setupGrade: '', regime: '', preEmotion: '', emotion: '', isRevenge: '', isImpulsive: '', discipline: '', planAdherence: '', confidence: '', stress: '', energy: '',
  tags: [], entryTime: '', exitTime: '', reason: '', mistakes: '', lesson: '', notes: '',
});

const numText = (n: number | undefined): string => (typeof n === 'number' ? String(n) : '');
const triText = (b: boolean | undefined): '' | 'yes' | 'no' => (b === true ? 'yes' : b === false ? 'no' : '');

export function formFromTrade(t: Trade): TradeForm {
  const f = emptyForm(t.date);
  const g = typeof t.gross === 'number' ? t.gross : null, pg = priceGross(t);
  // A typed or imported gross that differs from what the prices give is shown as an override, so editing the trade never silently replaces it.
  const override = g !== null && (pg === null || Math.abs(g - pg) >= 0.005) ? String(g) : '';
  return {
    ...f, symbol: t.symbol, direction: t.direction ?? '', instrumentType: t.instrumentType ?? '',
    entry: numText(t.entry), exit: numText(t.exit), qty: numText(t.qty), lotSize: numText(t.lotSize), grossOverride: override,
    brokerage: numText(t.brokerage), stt: numText(t.stt), exchange: numText(t.exchange), sebi: numText(t.sebi), gst: numText(t.gst), slippage: numText(t.slippage), other: numText(t.other),
    chargesTotal: CHARGE_FIELDS.some(k => typeof t[k] === 'number') ? '' : numText(t.chargesTotal),
    strategy: t.strategy ?? '', setupGrade: t.setupGrade ?? '', regime: t.regime ?? '', preEmotion: t.preEmotion ?? '', emotion: t.emotion ?? '',
    isRevenge: triText(t.isRevenge), isImpulsive: triText(t.isImpulsive), discipline: t.discipline ?? '', planAdherence: t.planAdherence ?? '',
    confidence: numText(t.confidence), stress: numText(t.stress), energy: t.energy ?? '', tags: t.tags ? [...t.tags] : [],
    entryTime: t.entryTime ?? '', exitTime: t.exitTime ?? '', reason: t.reason ?? '', mistakes: t.mistakes ?? '', lesson: t.lesson ?? '', notes: t.notes ?? '',
  };
}

/** Number typed by a person ("1,234.50", "₹ 50"); undefined for an empty box, NaN for something that is not a number. */
export function parseAmount(s: string): number | undefined {
  const t = s.replace(/[₹,\s]/g, '');
  if (t === '') return undefined;
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) return NaN;
  return Number(t);
}

export interface FormView { gross: number | null; charges: number; net: number | null; chargesKnown: boolean; grossSource: 'typed' | 'prices' | 'none' }
/** What the form shows live under the fields (the same maths as the saved trade). Invalid or empty boxes count as not recorded. */
export function previewForm(f: TradeForm): FormView {
  const n = (s: string) => { const v = parseAmount(s); return v === undefined || !Number.isFinite(v) ? undefined : v; };
  const t: Trade = { id: 'preview', date: f.date, symbol: f.symbol || 'X' };
  if (f.direction) t.direction = f.direction;
  const entry = n(f.entry), exit = n(f.exit), qty = n(f.qty), lot = n(f.lotSize), typed = parseAmount(f.grossOverride);
  if (entry !== undefined) t.entry = entry; if (exit !== undefined) t.exit = exit; if (qty !== undefined) t.qty = qty; if (lot !== undefined) t.lotSize = lot;
  if (typed !== undefined && Number.isFinite(typed)) t.gross = typed;
  for (const k of CHARGE_FIELDS) { const v = n(f[k]); if (v !== undefined && v >= 0) t[k] = v; }
  const ct = n(f.chargesTotal); if (ct !== undefined && ct >= 0) t.chargesTotal = ct;
  const g = grossOf(t);
  return { gross: g, charges: chargesOf(t), net: g === null ? null : r2(g - chargesOf(t)), chargesKnown: hasCharges(t), grossSource: typeof t.gross === 'number' ? 'typed' : g !== null ? 'prices' : 'none' };
}

export type BuildResult = { ok: true; trade: Trade } | { ok: false; error: string; field?: keyof TradeForm };

/** Checks the form and makes the record. `base` is the stored record being edited (its id, import marks and unknown fields are kept). */
export function buildTrade(f: TradeForm, o: { id: string; today: string; now: Date; base?: Trade }): BuildResult {
  const bad = (error: string, field?: keyof TradeForm): BuildResult => ({ ok: false, error, field });
  if (!validDate(f.date.trim())) return bad('Enter the date as YYYY-MM-DD, for example 2026-10-14.', 'date');
  if (f.date.trim() > o.today) return bad('That date is in the future. A journal records trades that have happened.', 'date');
  const symbol = f.symbol.replace(/\s+/g, ' ').trim().toUpperCase();
  if (!symbol) return bad('Enter the instrument, for example NIFTY or RELIANCE.', 'symbol');
  if (symbol.length > 40) return bad('Keep the instrument name to 40 characters or fewer.', 'symbol');
  const t: Trade = { id: o.id, date: f.date.trim(), symbol };
  const num = (key: keyof TradeForm, opts: { positive?: boolean } = {}): number | undefined | 'bad' => {
    const v = parseAmount(String(f[key]));
    if (v === undefined) return undefined;
    if (!Number.isFinite(v) || v < 0 || (opts.positive && v <= 0)) return 'bad';
    return v;
  };
  const badNum = (label: string, key: keyof TradeForm, positive = false) => bad(`${label} should be a number${positive ? ' above 0' : ' of 0 or more'}.`, key);
  if (f.direction) t.direction = f.direction;
  if (f.instrumentType) t.instrumentType = f.instrumentType;
  const entry = num('entry', { positive: true }); if (entry === 'bad') return badNum('Entry price', 'entry', true); if (entry !== undefined) t.entry = entry;
  const exit = num('exit'); if (exit === 'bad') return badNum('Exit price', 'exit'); if (exit !== undefined) t.exit = exit;
  const qty = num('qty', { positive: true }); if (qty === 'bad') return badNum('Quantity', 'qty', true); if (qty !== undefined) t.qty = qty;
  const lot = num('lotSize', { positive: true }); if (lot === 'bad') return badNum('Lot size', 'lotSize', true); if (lot !== undefined) t.lotSize = lot;
  if (exit !== undefined && entry === undefined) return bad('An exit price needs an entry price too.', 'entry');
  const gross = parseAmount(f.grossOverride);
  if (gross !== undefined) { if (!Number.isFinite(gross)) return bad('Gross profit should be a number (a loss is negative, for example -2500).', 'grossOverride'); t.gross = r2(gross); }
  else { const pg = priceGross(t); if (pg !== null) t.gross = pg; }
  for (const k of CHARGE_FIELDS) { const v = num(k); if (v === 'bad') return badNum(CHARGE_LABELS[k], k); if (v !== undefined) t[k] = v; }
  if (!CHARGE_FIELDS.some(k => typeof t[k] === 'number')) { const v = num('chargesTotal'); if (v === 'bad') return badNum('Total charges', 'chargesTotal'); if (v !== undefined) t.chargesTotal = v; }
  for (const k of ['entryTime', 'exitTime'] as const) { const v = f[k].trim(); if (v) { if (!validTime(v)) return bad('Times look like 09:30 (24-hour).', k); t[k] = v; } }
  const txt = (k: 'strategy' | 'setupGrade' | 'regime' | 'preEmotion' | 'emotion' | 'discipline' | 'planAdherence' | 'energy' | 'reason' | 'mistakes' | 'lesson' | 'notes', max: number) => { const v = optText(f[k], max); if (v) t[k] = v; };
  txt('strategy', 60); txt('setupGrade', 4); txt('regime', 40); txt('preEmotion', 30); txt('emotion', 30); txt('discipline', 12); txt('planAdherence', 12); txt('energy', 30);
  txt('reason', 2000); txt('mistakes', 2000); txt('lesson', 2000); txt('notes', 2000);
  if (f.isRevenge) t.isRevenge = f.isRevenge === 'yes';
  if (f.isImpulsive) t.isImpulsive = f.isImpulsive === 'yes';
  for (const k of ['confidence', 'stress'] as const) {
    const v = f[k].trim();
    if (v) { const n = Number(v); if (!Number.isInteger(n) || n < 1 || n > 10) return bad(`${k === 'confidence' ? 'Confidence' : 'Stress'} is a whole number from 1 to 10.`, k); t[k] = n; }
  }
  if (f.tags.length) t.tags = [...new Set(f.tags)].slice(0, 30);
  if (o.base?.src) t.src = o.base.src;
  if (o.base?.batch) t.batch = o.base.batch;
  t.savedAt = o.now.toISOString();
  return { ok: true, trade: t };
}
