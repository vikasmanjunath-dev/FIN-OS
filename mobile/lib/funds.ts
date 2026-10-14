// Mutual-fund intelligence, the parts that work from what the data feed really carries: a scheme record (name, house, plan, option,
// latest NAV and its date), the person's own transactions, and the expense-ratio arithmetic.
// Pure: no React, no storage, no network; "now" is a parameter.
//
// Ports of the website (js/mf-intelligence.js):
//   expenseImpact   <- calcExpenseImpact (Direct vs Regular over a horizon)        parity: __tests__/funds.parity.test.mts
//   sipConsistency  <- renderSIPCalendar / calcSIPStreak / generateSIPHistoryFromTxns
// Deliberately NOT ported, with the reason in docs/agent-notes/insurance-review.md and insurance-mf.md:
//   the "top holdings" overlap tool (hand-typed, undated lists) and the "category returns" table (typed-in numbers marked "indicative").

// ── The scheme record ───────────────────────────────────────────────────────────────────────────

export interface FundRecord {
  code: string;
  name: string;
  house: string;
  /** Latest NAV, or null when the feed has none. */
  nav: number | null;
  /** The date the feed gives for that NAV, as ISO YYYY-MM-DD ('' when it could not be read). */
  date: string;
  /** The feed's own words, kept verbatim: "Direct Plan", "Regular Plan" or "" when the feed leaves it blank. */
  plan: string;
  option: string;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, '0');

/** The feed writes "13-Oct-2026". Returns YYYY-MM-DD, or '' when the text is not a real date. */
export function parseNavDate(s: unknown): string {
  const t = String(s ?? '').trim();
  let y: number, m: number, d: number;
  let mt = t.match(/^(\d{1,2})[-\s/]([A-Za-z]{3})[A-Za-z]*[-\s/,]+(\d{4})$/);
  if (mt) { d = +mt[1]; m = MONTHS[mt[2].toLowerCase()] ?? 0; y = +mt[3]; }
  else if ((mt = t.match(/^(\d{4})-(\d{2})-(\d{2})$/))) { y = +mt[1]; m = +mt[2]; d = +mt[3]; }
  else if ((mt = t.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/))) { d = +mt[1]; m = +mt[2]; y = +mt[3]; }
  else return '';
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (!m || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return '';
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Reads one record of /api/mf/search or /api/mf/nav/{code}. Anything without a scheme code and a name is rejected. */
export function normaliseFund(raw: any): FundRecord | null {
  if (!raw || typeof raw !== 'object' || raw.error) return null;
  const code = String(raw.scheme_code ?? '').trim();
  const name = String(raw.scheme_name ?? '').trim();
  if (!/^\d{3,8}$/.test(code) || !name) return null;
  const navN = typeof raw.nav === 'number' ? raw.nav : parseFloat(String(raw.nav ?? ''));
  return {
    code, name, house: String(raw.fund_house ?? '').trim(),
    nav: Number.isFinite(navN) && navN > 0 ? navN : null,
    date: parseNavDate(raw.date),
    plan: String(raw.plan ?? '').trim(), option: String(raw.option ?? '').trim(),
  };
}

// ── Plan and option ─────────────────────────────────────────────────────────────────────────────

export type PlanKind = 'direct' | 'regular' | 'unknown';
export type OptionKind = 'growth' | 'idcw' | 'bonus' | 'other' | 'unknown';

const DIRECT = /\bdirect\b/i, REGULAR = /\bregular\b/i;

/** Direct or Regular. The feed's plan field decides; when it is blank the option text, then the scheme name, are tried. Never guessed beyond that. */
export function planKind(r: Pick<FundRecord, 'plan' | 'option' | 'name'>): PlanKind {
  for (const text of [r.plan, r.option, r.name]) {
    const d = DIRECT.test(text), g = REGULAR.test(text);
    if (d && !g) return 'direct';
    if (g && !d) return 'regular';
  }
  return 'unknown';
}

/** True when the plan field says one thing and the option text names the other: the feed's own labels disagree. */
export function planConflict(r: Pick<FundRecord, 'plan' | 'option'>): boolean {
  const p = DIRECT.test(r.plan) ? 'direct' : REGULAR.test(r.plan) ? 'regular' : null;
  if (!p) return false;
  return p === 'direct' ? REGULAR.test(r.option) && !DIRECT.test(r.option) : DIRECT.test(r.option) && !REGULAR.test(r.option);
}

const GROWTH = /growth|cumulative/i;
const IDCW = /idcw|dividend|income distribution|payout|reinvest|periodic/i;
/** Growth, IDCW (payout / reinvestment of distributions), Bonus; 'other' = stated but not one of these; 'unknown' = the feed leaves it blank. */
export function optionKind(r: Pick<FundRecord, 'option'>): OptionKind {
  const t = r.option.trim();
  if (!t) return 'unknown';
  const g = GROWTH.test(t), i = IDCW.test(t);
  if (g && !i) return 'growth';
  if (i && !g) return 'idcw';
  if (!g && !i && /bonus/i.test(t)) return 'bonus';
  return 'other';
}

export const PLAN_LABEL: Record<PlanKind, string> = { direct: 'Direct', regular: 'Regular', unknown: 'Plan not stated' };
export const OPTION_LABEL: Record<OptionKind, string> = { growth: 'Growth', idcw: 'IDCW', bonus: 'Bonus', other: 'Other option', unknown: 'Option not stated' };

export function variantLabel(r: FundRecord): string {
  const o = optionKind(r);
  return `${PLAN_LABEL[planKind(r)]} · ${o === 'other' ? (r.option || OPTION_LABEL.other) : OPTION_LABEL[o]}`;
}

// ── NAV freshness ───────────────────────────────────────────────────────────────────────────────

export const NAV_OLD_AFTER_DAYS = 7;
const dayNum = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 86400000); };
const todayIso = (now: Date) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

export interface NavStatus { state: 'current' | 'old' | 'unknown'; days: number | null }
/** AMFI publishes each business day, so a few days old is normal; older than a week means the scheme is probably closed or matured. */
export function navStatus(r: Pick<FundRecord, 'date' | 'nav'>, now: Date): NavStatus {
  if (r.nav === null || !r.date) return { state: 'unknown', days: null };
  const days = Math.max(0, dayNum(todayIso(now)) - dayNum(r.date));
  return { state: days > NAV_OLD_AFTER_DAYS ? 'old' : 'current', days };
}

// ── What the scheme name suggests ───────────────────────────────────────────────────────────────

const HINTS: [RegExp, string][] = [
  [/\bfof\b|fund of funds?|overseas|global|international|\bus (equity|growth)|nasdaq|world|emerging markets?/i, 'Fund of funds / international'],
  [/\betf\b|exchange traded|\bbees\b/i, 'ETF'],
  [/\bfmp\b|fixed maturity|fixed term|capital protection/i, 'Fixed-maturity / closed-ended'],
  [/\belss\b|tax saver|tax saving|tax relief/i, 'ELSS (tax saver)'],
  [/\bgilt\b|g-?sec\b|government securit/i, 'Gilt'],
  [/overnight/i, 'Overnight'],
  [/\bliquid\b/i, 'Liquid'],
  [/money market/i, 'Money market'],
  [/corporate bond/i, 'Corporate bond'],
  [/arbitrage/i, 'Arbitrage'],
  [/index|nifty|sensex/i, 'Index fund'],
  [/small ?cap/i, 'Small cap'],
  [/large (&|and) mid|large ?& ?mid/i, 'Large & mid cap'],
  [/mid ?cap/i, 'Mid cap'],
  [/large ?cap|blue ?chip/i, 'Large cap'],
  [/flexi ?cap/i, 'Flexi cap'],
  [/multi ?cap/i, 'Multi cap'],
  [/focused/i, 'Focused equity'],
  [/balanced advantage|dynamic asset/i, 'Balanced advantage'],
  [/hybrid|balanced|equity savings/i, 'Hybrid'],
  [/\bgold\b|silver/i, 'Gold / silver'],
  [/\bdebt\b|\bbond\b|duration|credit risk|short term|ultra short|low duration|floater|floating|banking (&|and) psu|income fund/i, 'Debt'],
  [/\bequity\b|\bvalue\b|contra|dividend yield|opportunities|thematic|sector|infra|pharma|technology|banking/i, 'Equity'],
];
/** A hint from the scheme name. It is NOT the official SEBI category (the feed does not carry one); null when the name gives no clear word. */
export function typeHint(name: string): string | null {
  for (const [rx, label] of HINTS) if (rx.test(name)) return label;
  return null;
}

// ── Search ──────────────────────────────────────────────────────────────────────────────────────

export const tokens = (q: string) => q.toLowerCase().split(/[^a-z0-9&]+/).filter(Boolean);
/** The backend matches one contiguous substring, so ask it for the most selective word and filter the rest on the phone. */
export function backendQuery(q: string): string | null {
  const t = tokens(q).sort((a, b) => b.length - a.length)[0];
  return t && t.length >= 3 ? t : null;
}

/** Keeps records containing every word of the query (name or fund house) and orders them: phrase at the start of the name first, then by name. */
export function rankResults(records: FundRecord[], query: string): FundRecord[] {
  const ts = tokens(query);
  if (!ts.length) return [];
  const phrase = ts.join(' ');
  const scored = records.map(r => {
    const name = r.name.toLowerCase();
    const hay = `${name} ${r.house.toLowerCase()}`;
    if (!ts.every(t => hay.includes(t))) return null;
    const normName = tokens(r.name).join(' ');
    const score = normName.startsWith(phrase) ? 3 : normName.includes(phrase) ? 2 : 1;
    return { r, score };
  }).filter((x): x is { r: FundRecord; score: number } => !!x);
  const planOrder: Record<PlanKind, number> = { direct: 0, regular: 1, unknown: 2 };
  const optOrder: Record<OptionKind, number> = { growth: 0, idcw: 1, bonus: 2, other: 3, unknown: 4 };
  scored.sort((a, b) =>
    b.score - a.score || a.r.name.localeCompare(b.r.name) || a.r.house.localeCompare(b.r.house) ||
    planOrder[planKind(a.r)] - planOrder[planKind(b.r)] || optOrder[optionKind(a.r)] - optOrder[optionKind(b.r)] || a.r.code.localeCompare(b.r.code));
  return scored.map(x => x.r);
}

export interface Scheme { key: string; name: string; house: string; variants: FundRecord[] }
/** Records of the same scheme (same name and house) grouped, in the order they first appear. */
export function groupSchemes(records: FundRecord[]): Scheme[] {
  const map = new Map<string, Scheme>();
  for (const r of records) {
    const key = `${r.house}||${r.name}`.toLowerCase();
    const s = map.get(key) ?? { key, name: r.name, house: r.house, variants: [] };
    s.variants.push(r);
    map.set(key, s);
  }
  return [...map.values()];
}

export function sameScheme(a: FundRecord, b: FundRecord): boolean {
  return a.name.toLowerCase() === b.name.toLowerCase() && a.house.toLowerCase() === b.house.toLowerCase();
}

// ── Comparing funds ─────────────────────────────────────────────────────────────────────────────

export const MAX_FUNDS = 3;

export interface FundHoldingFact { units: number; avgPrice: number; sipMonthly: number | null }
export interface CompareRow { key: string; label: string; cells: string[] }
export interface Comparison { rows: CompareRow[]; warnings: string[] }

/** Side by side of up to three funds, as facts from the feed. No score and no "better": a NAV is not a price tag and is never compared as one. */
export function compareFunds(funds: FundRecord[], now: Date, holdings: Record<string, FundHoldingFact> = {}): Comparison {
  const fs = funds.slice(0, MAX_FUNDS);
  const cell = (f: (r: FundRecord) => string): string[] => fs.map(f);
  const rows: CompareRow[] = [
    { key: 'house', label: 'Fund house', cells: cell(r => r.house || 'Not stated') },
    { key: 'plan', label: 'Plan', cells: cell(r => PLAN_LABEL[planKind(r)]) },
    { key: 'option', label: 'Option', cells: cell(r => { const o = optionKind(r); return o === 'other' ? (r.option || OPTION_LABEL.other) : OPTION_LABEL[o]; }) },
    { key: 'nav', label: 'Latest NAV', cells: cell(r => (r.nav === null ? 'Not available' : `₹${r.nav.toFixed(4)}`)) },
    { key: 'date', label: 'NAV date', cells: cell(r => r.date || 'Not stated') },
    { key: 'status', label: 'NAV is', cells: cell(r => { const s = navStatus(r, now); return s.state === 'unknown' ? 'Not available' : s.state === 'old' ? `${s.days} days old` : s.days === 0 ? 'Today' : `${s.days} day${s.days === 1 ? '' : 's'} old`; }) },
    { key: 'type', label: 'Name suggests', cells: cell(r => typeHint(r.name) ?? 'No clear hint') },
    { key: 'code', label: 'Scheme code', cells: cell(r => r.code) },
    { key: 'held', label: 'You hold', cells: cell(r => { const h = holdings[r.code]; return h ? `${h.units} units` : 'Not recorded'; }) },
  ];
  const warnings: string[] = [];
  const plans = new Set(fs.map(planKind));
  if (plans.has('direct') && plans.has('regular')) warnings.push('One is a Direct plan and one a Regular plan. They share a portfolio but differ in cost, so their NAVs and returns are not like for like.');
  if (plans.has('unknown')) warnings.push('The feed does not say the plan for at least one of these.');
  const opts = new Set(fs.map(optionKind));
  if (opts.has('growth') && opts.has('idcw')) warnings.push('A Growth option and an IDCW option are mixed. IDCW pays out part of the NAV, so its NAV and Growth NAV move differently.');
  if (fs.some(r => navStatus(r, now).state === 'old')) warnings.push('At least one NAV is more than a week old: the scheme may be closed or matured.');
  if (fs.some(planConflict)) warnings.push('For at least one fund the feed gives labels that disagree about the plan. Confirm it with the fund house.');
  if (fs.length >= 2 && fs.some(r => r.nav !== null)) warnings.push('Do not compare the NAV numbers to judge which is cheaper or better. NAV is the fund\'s value per unit, not a price.');
  return { rows, warnings };
}

// ── Expense ratio: Direct vs Regular (port of calcExpenseImpact) ─────────────────────────────────

export interface ExpenseInputs { monthlySip: number; years: number; regularEr: number; directEr: number; grossReturn: number }
export interface ExpenseImpact { regularCorpus: number; directCorpus: number; difference: number; invested: number; differencePctOfInvested: number }

/**
 * Value of a monthly SIP (instalment at the start of each month) at a nominal annual return, compounded monthly.
 * The website's formula: sip * ((1+r)^n - 1) / r * (1+r), with r = annual / 12 / 100. At r = 0 it is simply sip * n
 * (the website returns NaN there; it never reaches 0 because its gross return is fixed at 12 and ER is at most 3).
 */
export function sipFutureValue(monthlySip: number, annualReturnPct: number, years: number): number {
  const r = annualReturnPct / 100 / 12;
  const n = years * 12;
  if (r === 0) return monthlySip * n;
  return monthlySip * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
}

/**
 * What the expense-ratio gap does to a SIP: the same instalments earning (gross return - ER) under each plan.
 * The gross return is an assumption the person sets (the website fixes it at 12%); the result is an illustration, not a forecast.
 */
export function expenseImpact(i: ExpenseInputs): ExpenseImpact {
  const regularCorpus = sipFutureValue(i.monthlySip, i.grossReturn - i.regularEr, i.years);
  const directCorpus = sipFutureValue(i.monthlySip, i.grossReturn - i.directEr, i.years);
  const difference = directCorpus - regularCorpus;
  const invested = i.monthlySip * i.years * 12;
  return { regularCorpus, directCorpus, difference, invested, differencePctOfInvested: invested > 0 ? (difference / invested) * 100 : 0 };
}

// ── SIP consistency from the person's own entries (port of the website's SIP calendar) ───────────

const SIP_WORDS = ['sip', 'investment', 'mf', 'mutual fund'];

/** Months (YYYY-MM) that hold at least one entry whose category or type mentions sip, investment, mf or mutual fund. Raw stored records. */
export function sipMonthsFromTransactions(raw: unknown): string[] {
  const months = new Set<string>();
  for (const t of Array.isArray(raw) ? raw : []) {
    if (!t || typeof t !== 'object') continue;
    const label = String((t as any).category || (t as any).type || '').toLowerCase();
    if (!SIP_WORDS.some(k => label.includes(k))) continue;
    const m = String((t as any).date || '').slice(0, 7);
    if (m) months.add(m);
  }
  return [...months];
}

/** The last 12 calendar months ending with the month of `now`, oldest first. */
export function last12Months(now: Date): string[] {
  const out: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  }
  return out;
}

export interface SipConsistency {
  months: { month: string; paid: boolean }[];
  paidCount: number;
  /** Whole percent of the 12 months with an entry (this month included, as the website does). */
  consistency: number;
  /** The website's streak: consecutive paid months ending with the current month (0 until this month has an entry). */
  streak: number;
  /** The same, counted back from last month when this month has no entry yet, so a month that has not finished does not zero it. */
  streakThroughLastMonth: number;
}

export function sipConsistency(paidMonths: string[], now: Date): SipConsistency {
  const have = new Set(paidMonths);
  const months = last12Months(now).map(month => ({ month, paid: have.has(month) }));
  const paidCount = months.filter(m => m.paid).length;
  const run = (from: number) => { let n = 0; for (let i = from; i >= 0; i--) { if (months[i].paid) n++; else break; } return n; };
  const streak = run(11);
  return {
    months, paidCount, consistency: Math.round((paidCount / 12) * 100),
    streak, streakThroughLastMonth: months[11].paid ? streak : run(10),
  };
}

// ── Remembered funds and the compare tray ───────────────────────────────────────────────────────

export interface RecentFund { rec: FundRecord; seenAt: string }
export const MAX_RECENT = 20;

/** Puts a fund at the front of the recently-viewed list (one entry per scheme code), capped. */
export function pushRecent(list: RecentFund[], rec: FundRecord, now: Date, max = MAX_RECENT): RecentFund[] {
  return [{ rec, seenAt: now.toISOString() }, ...list.filter(x => x.rec.code !== rec.code)].slice(0, max);
}

export function toggleTray(codes: string[], code: string, max = MAX_FUNDS): { codes: string[]; full: boolean } {
  if (codes.includes(code)) return { codes: codes.filter(c => c !== code), full: false };
  if (codes.length >= max) return { codes, full: true };
  return { codes: [...codes, code], full: false };
}

export function normaliseRecent(raw: unknown): RecentFund[] {
  if (!Array.isArray(raw)) return [];
  const out: RecentFund[] = [];
  const seen = new Set<string>();
  for (const x of raw as any[]) {
    const rec = normaliseFund({ scheme_code: x?.rec?.code, scheme_name: x?.rec?.name, fund_house: x?.rec?.house, nav: x?.rec?.nav, date: x?.rec?.date, plan: x?.rec?.plan, option: x?.rec?.option });
    if (!rec || seen.has(rec.code)) continue;
    seen.add(rec.code);
    out.push({ rec, seenAt: typeof x.seenAt === 'string' ? x.seenAt : '' });
  }
  return out.slice(0, MAX_RECENT);
}
