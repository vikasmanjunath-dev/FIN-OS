// Transaction + budget logic ported from the website (js/finos-budget.js). Pure functions only, so the
// two stay in lock-step and can be parity-tested. `finos_transactions` is written by several
// features in several shapes; normalize() turns any of them into one shape.
//
// The app writes its own records as   {id, date:'YYYY-MM-DD', amount, type, category, label, cat}
// — `type`/`category`/`label` keep the website able to read them; `cat` (an exact category name)
// pins the user's choice so a label like "Uber to the restaurant" can't re-categorise itself.

export const CATEGORIES = [
  'Food & Dining', 'Groceries', 'Transport', 'Shopping', 'Bills & Utilities', 'Housing', 'EMI & Loans',
  'Subscriptions', 'Health', 'Entertainment', 'Education', 'Travel', 'Other',
] as const;
export type Category = (typeof CATEGORIES)[number];

export type Kind = 'expense' | 'income' | 'saving';

export interface Txn {
  id: string;
  date: string;      // YYYY-MM-DD, the user's local day
  amount: number;    // always positive; `kind` says which way the money moved
  kind: Kind;
  category: string;
  label: string;
}

/** A normalized transaction plus where it sits in the raw stored array (so edits keep foreign records intact). */
export interface IndexedTxn extends Txn { i: number }

export const SAVINGS_CATEGORY = 'Savings & Investments';
export const INCOME_CATEGORY = 'Income';

// Order matters: first match wins.
const CATEGORY_RULES: [Category, RegExp][] = [
  ['Groceries',         /grocer|bigbasket|blinkit|zepto|vegetable|provision|\bmilk\b/i],
  ['Food & Dining',     /\bfood\b|dining|restaurant|zomato|swiggy|lunch|dinner|breakfast|cafe|pizza|biryani|snack/i],
  ['Subscriptions',     /subscri|netflix|prime|spotify|hotstar|youtube/i],
  ['EMI & Loans',       /\bemi\b|loan|credit.?card.?bill/i],
  ['Housing',           /\brent\b|housing|maintenance|\bpg\b|society/i],
  ['Bills & Utilities', /utilit|bill|electric|water|\bgas\b|broadband|internet|recharge|phone|mobile/i],
  ['Transport',         /transport|fuel|petrol|diesel|uber|\bola\b|\bcab\b|\bauto\b|metro|\bbus\b|\btrain\b|toll|parking/i],
  ['Health',            /health|medic|doctor|hospital|pharma|\bgym\b|clinic/i],
  ['Education',         /educat|school|tuition|course|college|fees/i],
  ['Travel',            /travel|flight|hotel|holiday|vacation|trip/i],
  ['Entertainment',     /entertain|movie|\bfun\b|game|concert|outing/i],
  ['Shopping',          /shop|amazon|flipkart|myntra|clothes|shirt|shoes|mall|bought/i],
];
const SAVING = /invest|saving|\bsip\b|mutual|\bmf\b|amfi|\bppf\b|\bnps\b|\bfd\b|stock|equity|emergency|put aside/i;
const INCOME = /salary|income|bonus|freelance|received|got paid|refund|interest credit|dividend/i;

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? parseFloat(v.replace(/[₹,\s]/g, '')) : Number(v);
  return Number.isFinite(n) ? n : NaN;
};
const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const monthOf = (isoDay: string) => isoDay.slice(0, 7);

function toDay(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v; // already a calendar day: don't reinterpret
  const d = new Date(v as any);
  return Number.isNaN(d.getTime()) ? null : ymd(d); // timestamps → the user's LOCAL day
}

/** Best-guess category from free text (used for auto-suggesting while the user types a label). */
export function canonicalCategory(text: string): Category {
  const t = String(text || '').replace(/[_\-]+/g, ' ');
  for (const [name, rx] of CATEGORY_RULES) if (rx.test(t)) return name;
  return 'Other';
}

export function normalize(raw: any): Txn | null {
  if (!raw || typeof raw !== 'object') return null;
  const amount = Math.abs(num(raw.amount));
  if (!(amount > 0)) return null;
  const date = toDay(raw.date || raw.timestamp || raw.ts);
  if (!date) return null;

  const catText = [raw.category, raw.type, raw.label, raw.description, raw.desc].filter(x => typeof x === 'string').join(' ');
  const typeText = String(raw.type || '');
  let kind: Kind = 'expense';
  if (/^credit$/i.test(typeText) || /^income$/i.test(typeText) || /^salary$/i.test(String(raw.category || ''))) kind = 'income';
  if (/^save_|^invest/i.test(String(raw.category || '')) || SAVING.test(String(raw.category || '')) || /^save_/.test(typeText)) kind = 'saving';
  // voice journal tags "SIP / invested / saved" as type:'income' — that is money going OUT to savings, not income
  if (kind === 'income' && SAVING.test(String(raw.category || ''))) kind = 'saving';
  if (kind === 'expense' && /^debit$/i.test(typeText) && /salary/i.test(catText)) kind = 'income';
  if (kind === 'expense' && INCOME.test(String(raw.category || '')) && !/^debit$/i.test(typeText)) kind = 'income';

  const label = String(raw.label || raw.description || raw.desc || '').trim().slice(0, 60);
  // App-written records carry an exact category (`cat`) — honour it so the user's choice sticks.
  const pinned = kind === 'expense' && typeof raw.cat === 'string' && (CATEGORIES as readonly string[]).includes(raw.cat) ? raw.cat : null;
  return {
    id: String(raw.id !== undefined ? raw.id : `${date}|${amount}|${label}`),
    date, amount, kind,
    category: kind === 'expense' ? (pinned ?? canonicalCategory(catText)) : kind === 'saving' ? SAVINGS_CATEGORY : INCOME_CATEGORY,
    label,
  };
}

export function normalizeAll(list: unknown): IndexedTxn[] {
  const out: IndexedTxn[] = [];
  (Array.isArray(list) ? list : []).forEach((raw, i) => {
    const t = normalize(raw);
    if (t) out.push({ ...t, i });
  });
  return out;
}

/** Raw record to store for a transaction the user entered in the app. */
export function toRaw(t: { id: string; date: string; amount: number; kind: Kind; category: string; label: string; source?: string }) {
  return {
    id: t.id,
    date: t.date,
    amount: t.amount,
    // type/category are what the website's normalize() reads; kept consistent with `kind`
    type: t.kind === 'expense' ? 'expense' : t.kind === 'income' ? 'income' : 'saving',
    category: t.kind === 'expense' ? t.category : t.kind === 'saving' ? SAVINGS_CATEGORY : 'Income',
    label: t.label,
    cat: t.kind === 'expense' ? t.category : undefined,
    source: t.source ?? 'mobile',
  };
}

// ── Month maths ──────────────────────────────────────────────────────────────

export function monthSpend(txns: Txn[], month: string) {
  const byCat: Record<string, number> = {};
  let total = 0;
  for (const t of txns) {
    if (t.kind === 'expense' && monthOf(t.date) === month) {
      byCat[t.category] = (byCat[t.category] || 0) + t.amount;
      total += t.amount;
    }
  }
  return { byCat, total };
}

export function monthTotals(txns: Txn[], month: string) {
  let spent = 0, income = 0, saved = 0, count = 0;
  for (const t of txns) {
    if (monthOf(t.date) !== month) continue;
    count++;
    if (t.kind === 'expense') spent += t.amount;
    else if (t.kind === 'income') income += t.amount;
    else saved += t.amount;
  }
  return { spent, income, saved, count };
}

/** Expense total over the trailing 30 days including today (a stable "monthly spend" estimate). */
export function trailing30Spend(txns: Txn[], now = new Date()): { total: number; days: number; count: number } {
  const end = ymd(now);
  const startD = new Date(now); startD.setDate(startD.getDate() - 29);
  const start = ymd(startD);
  let total = 0, count = 0;
  let first: string | null = null;
  for (const t of txns) {
    if (t.kind !== 'expense' || t.date < start || t.date > end) continue;
    total += t.amount; count++;
    if (!first || t.date < first) first = t.date;
  }
  // How many days of data back this up — a single day's spend must not pose as a month
  const days = first ? Math.round((Date.parse(end) - Date.parse(first)) / 86400000) + 1 : 0;
  return { total, days, count };
}

const daysIn = (y: number, m0: number) => new Date(y, m0 + 1, 0).getDate();

export type BudgetState = 'ok' | 'warn' | 'over';
export interface BudgetRow {
  category: string; spent: number; limit: number; pct: number | null; projected: number;
  projectedPct: number | null; pace: boolean; state: BudgetState; left: number | null;
}
export interface BudgetStatus {
  month: string; day: number; daysInMonth: number; daysLeft: number; rows: BudgetRow[];
  total: { spent: number; limit: number; pct: number | null };
}

/**
 * For every category that has a limit OR spend this month.
 *  over  spent ≥ limit
 *  warn  spent ≥ 80% of limit, or (after day 7) the current pace projects past 110% of the limit
 */
export function budgetStatus(txns: Txn[], limits: Record<string, number>, now = new Date()): BudgetStatus {
  const month = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const dim = daysIn(now.getFullYear(), now.getMonth());
  const day = now.getDate();
  const { byCat, total } = monthSpend(txns, month);
  const lim = limits || {};
  const cats = Array.from(new Set([...Object.keys(lim), ...Object.keys(byCat)]));
  const rows: BudgetRow[] = cats.map(category => {
    const spent = Math.round(byCat[category] || 0);
    const limit = lim[category] > 0 ? lim[category] : 0;
    const projected = day >= 1 ? Math.round((spent / day) * dim) : spent;
    const pct = limit ? Math.round((spent / limit) * 100) : null;
    const projectedPct = limit ? Math.round((projected / limit) * 100) : null;
    let state: BudgetState = 'ok';
    if (limit) {
      if (spent >= limit) state = 'over';
      else if ((pct as number) >= 80 || (day >= 7 && (projectedPct as number) >= 110)) state = 'warn';
    }
    return { category, spent, limit, pct, projected, projectedPct, pace: day >= 7, state, left: limit ? Math.max(0, limit - spent) : null };
  }).sort((a, b) => (b.pct === null ? -1 : b.pct) - (a.pct === null ? -1 : a.pct) || b.spent - a.spent);
  const totalLimit = Object.values(lim).reduce((s, v) => s + (v > 0 ? v : 0), 0);
  return { month, day, daysInMonth: dim, daysLeft: dim - day, rows, total: { spent: Math.round(total), limit: totalLimit, pct: totalLimit ? Math.round((total / totalLimit) * 100) : null } };
}

const DEFAULT_SHARES: Record<string, number> = {
  Housing: 0.25, Groceries: 0.10, 'Food & Dining': 0.06, Transport: 0.07, 'Bills & Utilities': 0.06,
  'EMI & Loans': 0.12, Health: 0.04, Shopping: 0.05, Entertainment: 0.04, Subscriptions: 0.02,
};
const round500 = (n: number) => Math.max(500, Math.ceil(n / 500) * 500);

/** Suggested monthly limits: 5% above your recent 3-month average, else typical shares of income. */
export function suggestLimits(txns: Txn[], income: number, now = new Date()): Record<string, number> {
  const months: string[] = [];
  for (let i = 1; i <= 3; i++) { const m = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push(`${m.getFullYear()}-${pad(m.getMonth() + 1)}`); }
  const spends = months.map(m => monthSpend(txns, m)).filter(s => s.total > 0);
  if (spends.length) {
    const sums: Record<string, number> = {};
    spends.forEach(s => Object.entries(s.byCat).forEach(([c, v]) => { sums[c] = (sums[c] || 0) + v; }));
    const out: Record<string, number> = {};
    Object.entries(sums).forEach(([c, v]) => { const avg = v / spends.length; if (avg >= 300) out[c] = round500(avg * 1.05); });
    return out;
  }
  const inc = num(income);
  if (!(inc > 0)) return {};
  const out: Record<string, number> = {};
  Object.entries(DEFAULT_SHARES).forEach(([c, share]) => { out[c] = round500(inc * share); });
  return out;
}

// ── Entry validation (shared by the form and tests) ──────────────────────────

export const MAX_AMOUNT = 100_000_000; // ₹10 crore — a typo guard, not a real limit

export function validateEntry(input: { amount: string; date: string; label: string }, now = new Date()):
  { ok: true; amount: number; date: string; label: string } | { ok: false; error: string } {
  const amount = num(input.amount);
  if (!(amount > 0)) return { ok: false, error: 'Enter an amount greater than zero.' };
  if (amount > MAX_AMOUNT) return { ok: false, error: 'That amount looks too large — check for an extra zero.' };
  const date = input.date.trim();
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return { ok: false, error: 'Date should look like 2026-10-02.' };
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  if (d.getFullYear() !== +m[1] || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3]) return { ok: false, error: 'That date does not exist.' };
  if (date > ymd(now)) return { ok: false, error: "Date can't be in the future." };
  if (+m[1] < 2000) return { ok: false, error: 'Date is too far in the past.' };
  return { ok: true, amount: Math.round(amount * 100) / 100, date, label: input.label.trim().slice(0, 60) };
}
