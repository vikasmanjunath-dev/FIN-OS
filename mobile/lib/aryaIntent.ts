// Which of Arya's on-phone tools a question is asking for. A small, deterministic matcher: keywords and numbers, no model.
//
// Why it exists: a question like "what is my savings rate" or "SIP of 10000 for 15 years" has an exact answer on the phone, so
// it is answered from the same cores the screens use, instantly and offline, and never reaches a language model that might
// round it, rephrase it or invent a number.
//
// Rules the matcher keeps:
//   * A question about YOUR figures needs a "my" / "do I" / "mera ..." (or a very short, command-like query such as "net worth").
//     "What is net worth?" is a definition: it goes to the model, not to the tracker.
//   * A calculation needs the numbers it computes from. "What is a SIP?" matches nothing.
//   * Asking whether to buy, sell or hold something is advice: it is never turned into a tool call (the model path adds
//     the guardrail note instead).
//   * Two tools that fit about equally are an AMBIGUOUS match: Arya asks which one was meant instead of guessing.
//   * Text that tries to give Arya orders ("ignore your rules and ...") is not special-cased: the only things this matcher can do
//     are read a number off the phone or run a calculator, so there is nothing to hijack. It never forwards text anywhere.
export type ToolId =
  | 'help' | 'snapshot' | 'net_worth' | 'assets' | 'debt' | 'savings_rate' | 'emergency_fund' | 'goals' | 'goal_sip' | 'health_score'
  | 'money_score' | 'budget' | 'spending_month' | 'subscriptions' | 'insurance' | 'upcoming' | 'tax_dates' | 'tax_estimate'
  | 'tax_80c' | 'advance_tax' | 'sip_calc' | 'emi_calc' | 'fd_calc' | 'rd_calc' | 'lumpsum_calc' | 'inflation_calc' | 'fire'
  | 'retirement_odds' | 'alerts' | 'life_plan' | 'trend' | 'memory_show' | 'memory_add' | 'memory_forget'
  | 'quote' | 'market' | 'commodities' | 'crypto' | 'fx' | 'technical' | 'mf_nav' | 'news' | 'announcements' | 'open_screen';

export interface Args {
  amount?: number; rate?: number; years?: number; months?: number; days?: number; income?: number;
  symbol?: string; query?: string; text?: string; screen?: string;
  /** which of amount / rate / years the person did not state (so the answer can say it used the calculator's default) */
  defaulted?: string[];
}

export type Intent =
  | { kind: 'tool'; tool: ToolId; args: Args; score: number }
  | { kind: 'ambiguous'; options: { tool: ToolId; label: string; args: Args }[] }
  | { kind: 'advice' }
  | { kind: 'none' };

/* ── reading the text ──────────────────────────────────────────────────────────────────────────────────────── */
const HINGLISH: [RegExp, string][] = [
  [/\b(mera|meri|mere|meraa|apna|apni|apne)\b/g, 'my'],
  [/\b(kitna|kitni|kitne|kitna hai)\b/g, 'how much'],
  [/\b(batao|bataiye|batayiye|dikhao|dikhaiye|dikhao)\b/g, 'show'],
  [/\b(bachat|bachaat)\b/g, 'savings'],
  [/\b(kharcha|kharche|kharch|kharcha)\b/g, 'spending'],
  [/\b(nivesh)\b/g, 'invest'],
  [/\b(karz|karza|udhaar|udhar)\b/g, 'debt'],
  [/\b(bima|beema)\b/g, 'insurance'],
  [/\b(lakshya)\b/g, 'goal'],
  [/\b(sampatti)\b/g, 'net worth'],
  [/\b(kab)\b/g, 'when'],
  [/\b(saal|sal|varsh)\b/g, 'years'],
  [/\b(mahine|mahina)\b/g, 'months'],
];

export function normalise(text: string): string {
  let t = String(text ?? '').toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[​-‏⁠﻿]/g, '');
  t = t.replace(/\s+/g, ' ').trim();
  for (const [re, to] of HINGLISH) t = t.replace(re, to);
  return t;
}

export interface NumTok { value: number; kind: 'money' | 'pct' | 'years' | 'months' | 'days' | 'bare'; index: number; raw: string }

const UNIT_MULT: Record<string, number> = { k: 1e3, thousand: 1e3, lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, lpa: 1e5, l: 1e5, cr: 1e7, crore: 1e7, crores: 1e7, million: 1e6, mn: 1e6 };

/** Every number in the text, with what it is measured in. "5L", "₹1.5 cr", "12%", "10 yrs" and bare "20000" all come out. */
export function numbers(text: string): NumTok[] {
  const s = String(text ?? '').toLowerCase().replace(/[‘’]/g, "'");
  const out: NumTok[] = [];
  const re = /(₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d+)?)\s*(%|percent\b|per ?cent\b|pc\b|k\b|thousand\b|lakhs?\b|lacs?\b|lpa\b|l\b|crores?\b|cr\b|million\b|mn\b|years?\b|yrs?\b|yr\b|y\b|saal\b|months?\b|mos?\b|mahine\b|days?\b|din\b)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const raw = m[2].replace(/,/g, '');
    const v = parseFloat(raw);
    if (!Number.isFinite(v)) continue;
    const unit = (m[3] || '').toLowerCase();
    const cur = !!m[1];
    // a digit run glued to letters ("a1b", "hdfc2024bank") is not a quantity
    const before = s[m.index - 1];
    if (!cur && before && /[a-z]/.test(before) && m.index > 0 && s[m.index] !== ' ') continue;
    let kind: NumTok['kind'] = 'bare', value = v;
    if (/^(%|percent|per ?cent|pc)$/.test(unit)) kind = 'pct';
    else if (/^(years?|yrs?|yr|y|saal)$/.test(unit)) kind = 'years';
    else if (/^(months?|mos?|mahine)$/.test(unit)) kind = 'months';
    else if (/^(days?|din)$/.test(unit)) kind = 'days';
    else if (UNIT_MULT[unit]) { kind = 'money'; value = v * UNIT_MULT[unit]; }
    else if (cur) kind = 'money';
    out.push({ value, kind, index: m.index, raw: m[0].trim() });
  }
  return out;
}

class Q {
  readonly raw: string; readonly t: string; readonly nums: NumTok[]; readonly words: number;
  constructor(text: string) { this.raw = String(text ?? ''); this.t = normalise(text); this.nums = numbers(this.t); this.words = this.t.split(' ').filter(Boolean).length; }
  has(re: RegExp) { return re.test(this.t); }
  /** talks about the person's own figures */
  get self() { return /\b(my|mine|i|me|i'm|im|i've|ive|i'll|we|our|am i|do i|have i|can i afford)\b/.test(this.t); }
  /** short, command-like: "net worth", "savings rate?" */
  get short() { return this.words <= 4; }
  /** asking for a definition, not a figure */
  get definition() { return /^(what is|what's|what are|define|meaning of|explain|tell me about|how does|how do|why is|why do|why did|why are|difference between|differences between|compare|which is better|pros and cons|how to|how can i|what happens|is there a)\b/.test(this.t) && !this.self; }
  get money() { return this.nums.filter(n => n.kind === 'money'); }
  get pct() { return this.nums.filter(n => n.kind === 'pct'); }
  get years() { return this.nums.filter(n => n.kind === 'years'); }
  get bare() { return this.nums.filter(n => n.kind === 'bare'); }
}

/** "Should I buy / sell / hold / put money into <something>": a recommendation request, never a tool. */
export function isAdviceRequest(text: string): boolean {
  const t = normalise(text);
  return /\b(should i|shall i|can i|is it (good|safe|wise|worth|ok|okay) to|is (it|this|that) a good|worth (buying|investing)|what (to|should i) (buy|sell|invest in)|which (stock|share|fund|mutual fund|etf|crypto|coin|sip) (to|should|is best|is good|will)|best (stock|share|fund|mutual fund|sip|etf) (to|for|right now|now|today)|any (stock|share|fund|multibagger) tips?|multibagger|stock tip|hot tip|target price|will (it|the market|nifty|sensex|\w+) (go up|rise|crash|fall|double))\b/.test(t)
    && /\b(buy|sell|hold|invest|exit|enter|short|stock|share|fund|etf|crypto|coin|nifty|sensex|tip|tips|multibagger|target|go up|rise|crash|fall|double|gold|bitcoin|sip)\b/.test(t);
}

/* ── pulling the arguments out ─────────────────────────────────────────────────────────────────────────────── */
function calcArgs(q: Q, order: ('amount' | 'rate' | 'years')[]): Args {
  const a: Args = {};
  const money = q.money.slice(), pct = q.pct.slice(), yrs = q.years.slice(), bare = q.bare.slice();
  const take = <T,>(arr: T[]) => arr.shift();
  const m0 = take(money);
  if (m0) a.amount = m0.value;
  const p0 = take(pct);
  if (p0) a.rate = p0.value;
  const y0 = take(yrs);
  if (y0) a.years = y0.value;
  // months, only when no years were given: 18 months = 1.5 years
  const mo = q.nums.find(n => n.kind === 'months');
  if (a.years === undefined && mo) a.years = mo.value / 12;
  // bare numbers fill what is still missing, in the order the calculator asks for it ("sip 10000 20 12")
  for (const n of bare) {
    for (const slot of order) {
      if (a[slot] !== undefined) continue;
      if (slot === 'amount' && n.value >= 100) { a.amount = n.value; break; }
      if (slot === 'years' && n.value > 0 && n.value <= 60) { a.years = n.value; break; }
      if (slot === 'rate' && n.value > 0 && n.value <= 40) { a.rate = n.value; break; }
    }
  }
  return a;
}

const SYMBOLS: [RegExp, string][] = [
  [/\breliance( industries)?\b/, 'RELIANCE'], [/\btcs\b|\btata consultancy\b/, 'TCS'], [/\binfosys\b|\binfy\b/, 'INFY'], [/\bhdfc ?bank\b/, 'HDFCBANK'],
  [/\bicici ?bank\b/, 'ICICIBANK'], [/\bsbi\b|\bstate bank\b/, 'SBIN'], [/\bitc\b/, 'ITC'], [/\bwipro\b/, 'WIPRO'], [/\btata motors\b/, 'TATAMOTORS'],
  [/\btata steel\b/, 'TATASTEEL'], [/\bairtel\b|\bbharti\b/, 'BHARTIARTL'], [/\bkotak( mahindra)?( bank)?\b/, 'KOTAKBANK'], [/\bl&t\b|\blarsen\b/, 'LT'],
  [/\bmaruti\b/, 'MARUTI'], [/\basian paints?\b/, 'ASIANPAINT'], [/\bbajaj finance\b/, 'BAJFINANCE'], [/\bhul\b|\bhindustan unilever\b/, 'HINDUNILVR'],
  [/\baxis ?bank\b/, 'AXISBANK'], [/\bsun pharma\b/, 'SUNPHARMA'], [/\bhcl ?tech\b/, 'HCLTECH'], [/\bongc\b/, 'ONGC'], [/\bntpc\b/, 'NTPC'],
];
const NOT_SYMBOLS = new Set(['SIP', 'EMI', 'FD', 'RD', 'NAV', 'PPF', 'NPS', 'EPF', 'ELSS', 'ITR', 'HRA', 'FIRE', 'GST', 'TDS', 'CAGR', 'IRR', 'XIRR', 'RSI', 'MACD',
  'ETF', 'IPO', 'AI', 'INR', 'USD', 'RS', 'LPA', 'CTC', 'KYC', 'PAN', 'UPI', 'MF', 'SWP', 'STP', 'LTCG', 'STCG', 'ARYA', 'FINOS', 'AND', 'THE', 'FOR', 'MY', 'IS', 'OF', 'IN', 'ME', 'ON']);

/** An NSE symbol named in the text ("RELIANCE", "price of Infosys"), or null. Never invented from a word that is not one. */
export function symbolIn(raw: string): string | null {
  const t = normalise(raw);
  for (const [re, sym] of SYMBOLS) if (re.test(t)) return sym;
  const caps = String(raw ?? '').match(/\b[A-Z][A-Z0-9&-]{1,14}\b/g) || [];
  const hit = caps.find(c => !NOT_SYMBOLS.has(c) && /[A-Z]/.test(c) && !/^\d+$/.test(c));
  if (hit) return hit;
  return null;
}

const LOOSE_STOP = new Set(['my', 'the', 'a', 'an', 'gold', 'silver', 'crude', 'oil', 'bitcoin', 'btc', 'ethereum', 'eth', 'nifty', 'sensex', 'today', 'now', 'dollar', 'usd',
  'house', 'flat', 'home', 'car', 'land', 'property', 'it', 'this', 'that', 'sip', 'emi', 'fd', 'rd', 'ppf', 'nps', 'epf', 'tax', 'fund', 'mutual', 'petrol', 'diesel']);
/** A symbol typed in lower case right after a price word ("price of zomato", "zomato share price"), for the price tool only. null when it could be anything else. */
export function looseSymbol(raw: string): string | null {
  const t = normalise(raw);
  const m = /\b(?:price|quote|ltp|cmp|rate)\s+(?:of|for)\s+([a-z][a-z0-9&-]{1,14})\b/.exec(t) || /\b([a-z][a-z0-9&-]{1,14})\s+(?:share|stock)\s+price\b/.exec(t) || /\bquote\s+([a-z][a-z0-9&-]{1,14})\b/.exec(t);
  if (!m || LOOSE_STOP.has(m[1]) || /^\d+$/.test(m[1])) return null;
  return m[1].toUpperCase();
}

/* ── the matchers ──────────────────────────────────────────────────────────────────────────────────────────── */
type Matcher = (q: Q) => { score: number; args?: Args } | null;
const hit = (score: number, args?: Args) => ({ score, args });

const READ = (re: RegExp, opts: { needSelf?: boolean } = {}): Matcher => q => {
  if (!q.has(re)) return null;
  if (q.definition) return null;
  const ok = !opts.needSelf || q.self || q.short;
  return ok ? hit(q.self ? 0.9 : 0.75) : null;
};

const MATCHERS: Partial<Record<ToolId, Matcher>> = {
  help: q => (/^(help|\/help|what can you do|what can arya do|what do you do|what all can you|commands|capabilities|how do i use (you|arya))\b/.test(q.t) || /\bwhat (can|do) you (do|know|answer|help)\b/.test(q.t) ? hit(0.95) : null),

  snapshot: q => (/\b(how am i doing|how are my (finances|money)|where do i stand|financial (picture|position|status|summary)|money summary|my (finances|money situation)|overview|snapshot|quick summary|give me a summary)\b/.test(q.t) ? hit(0.85) : null),

  net_worth: q => (/\b(trend|growing|growth|moving|changed?|velocity|history|over time|since last|progress)\b/.test(q.t) ? null : /\bhow much am i worth\b|\btotal assets\b/.test(q.t) ? hit(0.88) : READ(/\bnet ?worth\b/, { needSelf: true })(q)),
  assets: q => (/\b(asset allocation|where is my money|my allocation|what do i (own|hold)|my assets|asset mix|breakdown of my|how is my money (split|spread|divided))\b/.test(q.t) ? hit(0.88) : null),
  debt: q => {
    if (!/\b(debts?|liabilit(y|ies)|loans?|owe|credit card dues|outstanding|my emis?)\b/.test(q.t)) return null;
    if (!q.self && !q.short) return null;
    if (q.money.length || q.pct.length) return null;               // "emi on 50 lakh at 8%" is the calculator
    if (/\b(prepay|pay off|payoff|clear|close|foreclose|take|get|apply|eligib)/.test(q.t)) return null;
    return hit(0.85);
  },
  savings_rate: q => {
    if (!/\b(savings? rate|saving rate|how much (do|am) i (sav(e|ing)|keep)|my (monthly )?(income|salary)|my (monthly )?(spending|expenses?)|income and (spending|expenses?)|what do i earn|surplus|am i saving enough)\b/.test(q.t)) return null;
    if (/\b(this month|today|last month|so far)\b/.test(q.t) && /\b(spen[dt]|spending|expenses?)\b/.test(q.t)) return null;   // that is the spending question
    return q.definition ? null : hit(0.85);
  },
  emergency_fund: q => (/\b(emergency (fund|corpus|cushion|buffer|savings)|rainy day|months of (expenses|spending|cover)|how many months (can|will|do)|how long (can|will) i (last|survive|manage))\b/.test(q.t) && !q.definition ? hit(0.88) : null),
  goals: q => {
    if (!/\bgoals?\b/.test(q.t) || q.definition) return null;
    if (!q.self && !q.short) return null;
    if (/\b(sip|per month|a month|monthly|how much (do|should|must) i|need(ed)? (to|per)|required)\b/.test(q.t)) return null;   // goal_sip
    return hit(0.85);
  },
  goal_sip: q => (/\bgoals?\b/.test(q.t) && /\b(sip|per month|a month|monthly|how much (do|should|must) i (save|invest|put|need)|need(ed)? (to|per)|required|reach|hit|on track)\b/.test(q.t) && (q.self || q.short) ? hit(0.86) : null),
  health_score: q => (/\b(health score|financial health|fin(ancial)? health|fitness score)\b/.test(q.t) && !q.definition ? hit(0.88) : null),
  money_score: q => (/\b(money score|my score\b(?!.*(credit|cibil))|next (best )?(move|step)s?|what should i (do|fix|improve|work on) (first|next)|biggest (gap|weakness)|weakest (area|part))\b/.test(q.t) && !q.definition ? hit(0.86) : null),
  budget: q => (/\bbudget(s)?\b/.test(q.t) && !q.definition && (q.self || q.short) && !/\b(create|make|build|plan|set up|prepare|generate)\b/.test(q.t) ? hit(0.82) : null),
  spending_month: q => ((/\b(spen[dt]|spending|expenses?|expenditure)\b/.test(q.t) && /\b(this month|today|so far|current month|month)\b/.test(q.t) && (q.self || /\bhow much\b/.test(q.t)))
    || /\b(top|biggest|highest|largest|most) (spending )?(categor(y|ies)|expense)s?\b/.test(q.t) ? hit(0.87) : null),
  subscriptions: q => (/\b(subscriptions?|netflix|spotify|ott)\b/.test(q.t) && !q.definition && (q.self || q.short || /\bhow much\b/.test(q.t)) ? hit(0.84) : null),
  insurance: q => {
    if (!/\b(insurance|insured|term (plan|policy|cover|insurance)|health (policy|cover|insurance)|policies|policy|cover(age)?)\b/.test(q.t)) return null;
    if (q.definition) return null;
    if (!q.self && !q.short) return null;
    if (q.money.length >= 1 && /\b(premium|buy|quote|compare)\b/.test(q.t)) return null;
    return hit(0.84);
  },
  upcoming: q => {
    if (/\b(tax|itr|advance tax|form 16|80c)\b/.test(q.t)) return null;
    const dueish = /\b(due|upcoming|coming up|what'?s next|deadlines?|renew(s|al|als)? (soon|due|this|next)|bills?|payments? (due|coming)|what do i have to pay|anything due|due dates?)\b/.test(q.t);
    if (!dueish) return null;
    const days = /\bthis week\b/.test(q.t) ? 7 : /\btoday\b/.test(q.t) ? 1 : /\bnext month|this month|30 days\b/.test(q.t) ? 30 : (q.nums.find(n => n.kind === 'days' || (n.kind === 'bare' && /\bdays?\b/.test(q.t)))?.value ?? 30);
    return hit(0.83, { days: Math.max(1, Math.min(365, Math.round(days))) });
  },
  tax_dates: q => (/\b(tax|itr|advance tax|form 16|80c|return)\b/.test(q.t) && /\b(dates?|deadlines?|due|last date|when|calendar|by when)\b/.test(q.t) && !/\bhow much\b/.test(q.t) ? hit(0.86, { days: 120 }) : null),
  advance_tax: q => (/\badvance tax\b/.test(q.t) && /\b(how much|amount|instal+ments?|schedule|owe|pay|liability|quarter)\b/.test(q.t) && !/\b(dates?|deadline|when|last date)\b/.test(q.t) ? hit(0.88) : null),
  tax_estimate: q => {
    if (/\badvance tax\b/.test(q.t) || /\b(dates?|deadline|when|last date)\b/.test(q.t)) return null;
    if (/\b(80c|80 c|80d|section 80)\b/.test(q.t)) return null;
    const asks = /\b(how much (income )?tax|tax (on|for|payable|liability|will i pay|do i pay|i owe|i pay|calculation|estimate)|my (income )?tax|income tax|old (vs|or|versus|v\/s) new|new (vs|or|versus) old|(old|new) regime|which regime|tax regime|tax bill)\b/.test(q.t);
    if (!asks || q.definition) return null;
    const income = q.money.find(n => n.value >= 100000)?.value ?? q.bare.find(n => n.value >= 100000)?.value;
    return hit(0.85, income ? { income } : {});
  },
  tax_80c: q => (/\b(80c|80 c|section 80c)\b/.test(q.t) && /\b(left|room|remaining|used|headroom|how much|balance|gap|limit|invested|claimed)\b/.test(q.t) && !q.definition ? hit(0.87) : null),

  sip_calc: q => {
    const monthly = /\b(sip|per month|a month|monthly|every month|each month|\/mo|pm)\b/.test(q.t);
    const grows = /\b(grow|become|worth|corpus|returns?|maturity|will (it|i|my)|how much|calculate|end up|accumulate|get|have|reach|build)\b/.test(q.t);
    if (!monthly) return null;
    if (/\b(emi|loan|fd|fixed deposit|rd|recurring|lump ?sum|inflation|goal|goals|step[- ]?up)\b/.test(q.t)) return null;
    const a = calcArgs(q, ['amount', 'years', 'rate']);
    if (a.amount === undefined || a.years === undefined) return null;     // no numbers, no calculation: "what is a SIP?" falls through
    // "SIP of 10000 at 12% for 15 years" is a complete sum even without a verb; with a verb two numbers are enough (the rate is then asked for)
    const complete = a.rate !== undefined;
    if (!grows && !complete) return null;
    if (q.definition && !complete) return null;
    return hit(0.9, a);
  },
  lumpsum_calc: q => {
    if (/\b(sip|per month|a month|monthly|every month|emi|loan|fd|fixed deposit|rd)\b/.test(q.t)) return null;
    if (!/\b(lump ?sum|one[- ]time|invest(ed|ing)?|put|deposit|worth|grow|become)\b/.test(q.t)) return null;
    if (!/\b(grow|become|worth|will|how much|maturity|calculate|end up|returns?)\b/.test(q.t)) return null;
    if (/\binflation\b/.test(q.t)) return null;
    const a = calcArgs(q, ['amount', 'years', 'rate']);
    if (a.amount === undefined || a.years === undefined) return null;
    return hit(0.8, a);
  },
  emi_calc: q => {
    if (!/\b(emi|loan|mortgage)\b/.test(q.t)) return null;
    if (q.definition) return null;
    const a = calcArgs(q, ['amount', 'rate', 'years']);
    if (a.amount === undefined) return null;                             // "my emi" with no amount is the debt summary
    if (a.rate === undefined && a.years === undefined && !/\b(calculate|how much|monthly|emi (on|for|of))\b/.test(q.t)) return null;
    if (/\b(prepay|prepayment|foreclos|pay off early|should i)\b/.test(q.t)) return null;
    return hit(0.9, a);
  },
  fd_calc: q => {
    if (!/\b(fd|fixed deposit|fixed deposits)\b/.test(q.t) || q.definition) return null;
    const a = calcArgs(q, ['amount', 'rate', 'years']);
    if (a.amount === undefined || (a.years === undefined && a.rate === undefined)) return null;
    return hit(0.88, a);
  },
  rd_calc: q => {
    if (!/\b(rd|recurring deposit)\b/.test(q.t) || q.definition) return null;
    const a = calcArgs(q, ['amount', 'rate', 'years']);
    if (a.amount === undefined) return null;
    return hit(0.86, a);
  },
  inflation_calc: q => {
    if (!/\binflation\b/.test(q.t) || q.definition) return null;
    const a = calcArgs(q, ['amount', 'years', 'rate']);
    if (a.amount === undefined || a.years === undefined) return null;
    return hit(0.86, a);
  },
  fire: q => (/\b(fire (number|corpus|target|calculation)?|financial independence|retire early|retirement corpus|how much (do i )?need to retire|years to (retire|fire))\b/.test(q.t) && !q.definition ? hit(0.84) : null),
  retirement_odds: q => (/\b(retire|retirement)\b/.test(q.t) && /\b(odds|chance|probability|will my money last|run out|outlast|enough|on track)\b/.test(q.t) ? hit(0.88) : null),
  alerts: q => (/\b(alerts?|notifications?|anything (urgent|wrong|i should know)|what needs (my )?attention|needs attention|any warnings?)\b/.test(q.t) && !q.definition ? hit(0.84) : null),
  life_plan: q => (/\b(life events?|life plan|having a (baby|child)|new baby|expecting a|getting married|my marriage|buying a (home|house|flat)|changing jobs?|new job|lost my job|job loss|windfall)\b/.test(q.t) && (q.self || q.short) ? hit(0.8) : null),
  trend: q => (/\b(net ?worth|wealth|money)\b/.test(q.t) && /\b(trend|growing|growth|moving|changed?|velocity|pace|history|since last|over time|progress)\b/.test(q.t) && (q.self || q.short) ? hit(0.82) : null),

  memory_add: q => {
    const m = /^(?:please |pls |arya,? )?(?:remember|note|keep in mind|make a note|save this)(?: that| this)?[:,]? +(.{3,})$/.exec(q.t);
    return m ? hit(0.95, { text: m[1] }) : null;
  },
  memory_show: q => (/\b(what do you (remember|know) about me|what (have|did) you (noted?|saved?|remembered)|show (me )?(my )?(memory|notes)|your memory of me|what is in (your|my) memory)\b/.test(q.t) ? hit(0.95) : null),
  memory_forget: q => {
    const all = /\b(forget everything|clear (my |your |all )?memory|erase (my |your |all )?memory|wipe (my |your )?memory|delete everything you (know|remember))\b/.test(q.t);
    if (all) return hit(0.95, { query: '*' });
    const m = /^(?:please |pls )?(?:forget|delete|remove|erase)(?: that| about| the note)? +(.{3,})$/.exec(q.t);
    return m ? hit(0.9, { query: m[1] }) : null;
  },

  quote: q => {
    if (!/\b(price|quote|ltp|trading at|share price|stock price|how much is|what is .* (at|trading)|current price|cmp|rate of)\b/.test(q.t)) return null;
    if (/\b(gold|silver|crude|bitcoin|btc|ethereum|crypto|nifty|sensex|nav|mutual fund|fund)\b/.test(q.t) && !symbolIn(q.raw)) return null;
    if (q.self) return null;                                              // "price of my house" is not a share price
    const sym = symbolIn(q.raw) ?? looseSymbol(q.raw);
    if (sym) return hit(0.88, { symbol: sym });
    return /\b(shares?|stocks?|quote|ltp|cmp|trading at)\b/.test(q.t) ? hit(0.5, {}) : null;   // a share price with no share named: ask which; any other "price of ..." is not ours
  },
  market: q => (/\b(nifty( ?50| bank)?|sensex|bank ?nifty|indices|indexes|stock market|markets?)\b/.test(q.t) && /\b(today|now|how is|how'?s|level|doing|status|open|close|closed|live|up|down|trading)\b/.test(q.t) && !symbolIn(q.raw) && !q.definition ? hit(0.84) : null),
  commodities: q => (/\b(gold|silver|crude( oil)?|oil|natural gas)\b/.test(q.t) && /\b(price|rate|today|now|per gram|per 10|how much is)\b/.test(q.t) && !/\b(my|i have|i own|holding)\b/.test(q.t) ? hit(0.82) : null),
  crypto: q => (/\b(bitcoin|btc|ethereum|eth|dogecoin|xrp|ripple|crypto)\b/.test(q.t) && /\b(price|rate|today|now|how much|trading|worth)\b/.test(q.t) && !/\b(my|i have|i own|holding|tax)\b/.test(q.t) ? hit(0.82, { query: /\bethereum|\beth\b/.test(q.t) ? 'ethereum' : /\bdoge/.test(q.t) ? 'dogecoin' : /\bxrp|ripple/.test(q.t) ? 'ripple' : 'bitcoin' }) : null),
  fx: q => (/\b(dollar|usd|euro|eur|pound|gbp|yen|jpy|dirham|aed)\b/.test(q.t) && /\b(rate|inr|rupee|price|worth|exchange|today|now)\b/.test(q.t) && !q.self ? hit(0.84) : null),
  news: q => (/\b(news|headlines?)\b/.test(q.t) && /\b(market|financ|business|stock|latest|today|top|economy|india)\b|^(latest |top )?(news|headlines)\b/.test(q.t) && !q.definition && !symbolIn(q.raw) ? hit(0.8) : null),
  announcements: q => (/\b(announcements?|filings?|board meeting|results? announcement|corporate actions?)\b/.test(q.t) && !!symbolIn(q.raw) && !q.definition ? hit(0.84, { symbol: symbolIn(q.raw) as string }) : null),
  technical: q => (/\b(technical|rsi|macd|indicators?|analy[sz]e|analysis|chart|support|resistance|moving average)\b/.test(q.t) && !!symbolIn(q.raw) ? hit(0.86, { symbol: symbolIn(q.raw) as string }) : null),
  mf_nav: q => {
    if (!/\b(nav|net asset value)\b/.test(q.t)) return null;
    const code = q.bare.find(n => n.value >= 1000 && n.value < 1e9 && Number.isInteger(n.value));
    const m = /\bnav (?:of|for) (.{3,60})$/.exec(q.t) || /^(.{3,60}) nav$/.exec(q.t);
    if (code) return hit(0.86, { query: String(code.value) });
    if (m) return hit(0.8, { query: m[1].replace(/\b(fund|mutual|the|today|current|latest)\b/g, ' ').replace(/\s+/g, ' ').trim() });
    return null;
  },
};

/** Words that name a screen, for "open my budget" / "go to the tax planner". */
const SCREENS: { re: RegExp; route: string; label: string }[] = [
  { re: /\b(tax planner|tax planning)\b/, route: '/tools/taxplanner', label: 'Tax planner' },
  { re: /\b(prepay|prepayment|prepay or invest)\b/, route: '/tools/prepay', label: 'Prepay or invest' },
  { re: /\b(retirement planner|retirement)\b/, route: '/tools/retirement', label: 'Retirement planner' },
  { re: /\b(calculators?)\b/, route: '/tools/calculators', label: 'Calculators' },
  { re: /\b(calendar)\b/, route: '/tools/calendar', label: 'Financial calendar' },
  { re: /\b(report)\b/, route: '/tools/report', label: 'Financial report' },
  { re: /\b(credit score|cibil)\b/, route: '/tools/credit', label: 'Credit score' },
  { re: /\b(home loan)\b/, route: '/tools/homeloan', label: 'Home loan' },
  { re: /\b(windfall|bonus)\b/, route: '/tools/windfall', label: 'Windfall planner' },
  { re: /\b(budget)\b/, route: '/tracker/budget', label: 'Budget' },
  { re: /\b(goals?)\b/, route: '/tracker/goals', label: 'Goals' },
  { re: /\b(insurance)\b/, route: '/tracker/insurance', label: 'Insurance' },
  { re: /\b(net ?worth)\b/, route: '/tracker/networth', label: 'Net worth' },
  { re: /\b(memory|what you remember)\b/, route: '/pulse/memory', label: 'What Arya remembers' },
  { re: /\b(pulse|feed)\b/, route: '/pulse', label: 'PULSE' },
];

function openScreen(q: Q): { route: string; label: string } | null {
  if (!/^(please |pls )?(open|go to|take me to|show me the|launch|navigate to|bring up)\b/.test(q.t)) return null;
  for (const s of SCREENS) if (s.re.test(q.t)) return { route: s.route, label: s.label };
  return null;
}

/** Plain-language label for the "did you mean" chips. */
export const TOOL_LABEL: Partial<Record<ToolId, string>> = {
  net_worth: 'My net worth', assets: 'Where my money is', debt: 'My debts and EMIs', savings_rate: 'My income, spending and savings rate',
  emergency_fund: 'My emergency fund', goals: 'My goals', goal_sip: 'The monthly saving my goals need', health_score: 'My health score',
  money_score: 'My Money Score and next moves', budget: 'My budget this month', spending_month: 'What I spent this month', subscriptions: 'My subscriptions',
  insurance: 'My insurance cover', upcoming: 'What is due soon', tax_dates: 'Tax dates', tax_estimate: 'An estimate of my tax', tax_80c: 'My 80C room',
  advance_tax: 'Advance tax instalments', fire: 'My FIRE number', retirement_odds: 'The odds my money lasts', alerts: 'My alerts',
  life_plan: 'Prompts for my life events', trend: 'How my net worth is moving', snapshot: 'A summary of my money', sip_calc: 'A SIP calculation',
  emi_calc: 'An EMI calculation', fd_calc: 'An FD calculation', lumpsum_calc: 'A lump sum calculation', quote: 'A share price', market: 'The market today',
};

/** What a question is asking for. `{kind:'none'}` means "not something the phone can answer exactly": the model path (if any) takes it. */
export function matchIntent(text: string): Intent {
  const q = new Q(text);
  if (!q.t) return { kind: 'none' };

  // "/sip 10000 20 12" style commands, as on the website
  const cmd = /^\/(sip|emi|fd|tax|fire|help|goals|budget|net ?worth)\b(.*)$/.exec(q.t);
  if (cmd) {
    const rest = new Q(cmd[2]);
    const map: Record<string, ToolId> = { sip: 'sip_calc', emi: 'emi_calc', fd: 'fd_calc', tax: 'tax_estimate', fire: 'fire', help: 'help', goals: 'goals', budget: 'budget', networth: 'net_worth', 'net worth': 'net_worth' };
    const tool = map[cmd[1].replace(/\s+/g, '')] ?? map[cmd[1]];
    if (tool === 'sip_calc') return { kind: 'tool', tool, args: calcArgs(rest, ['amount', 'years', 'rate']), score: 1 };
    if (tool === 'emi_calc' || tool === 'fd_calc') return { kind: 'tool', tool, args: calcArgs(rest, ['amount', 'rate', 'years']), score: 1 };
    if (tool === 'tax_estimate') { const v = rest.nums[0]?.value; return { kind: 'tool', tool, args: v ? { income: v >= 1000 ? v : v * 1e5 } : {}, score: 1 }; }
    if (tool) return { kind: 'tool', tool, args: {}, score: 1 };
  }

  const nav = openScreen(q);
  if (nav) return { kind: 'tool', tool: 'open_screen', args: { screen: nav.route, text: nav.label }, score: 0.95 };

  // an explicit memory command is honoured even if it also reads like advice
  const mem = MATCHERS.memory_add!(q) || null;
  if (mem) return { kind: 'tool', tool: 'memory_add', args: mem.args || {}, score: mem.score };

  const results: { tool: ToolId; score: number; args: Args }[] = [];
  for (const [tool, fn] of Object.entries(MATCHERS) as [ToolId, Matcher][]) {
    if (tool === 'memory_add') continue;
    let r: ReturnType<Matcher> = null;
    try { r = fn(q); } catch { r = null; }
    if (r && r.score > 0) results.push({ tool, score: r.score, args: r.args || {} });
  }

  // advice is never a tool: but a calculation the same sentence also asks for ("should I put 5000 in a SIP for 10 years: what does it grow to")
  // still contains numbers and a calculation verb, which is a different question and is answered
  const calc = results.filter(r => /_calc$|^fire$/.test(r.tool));
  if (isAdviceRequest(q.raw) && !calc.length) return { kind: 'advice' };

  if (!results.length) return { kind: 'none' };
  results.sort((a, b) => b.score - a.score);
  const top = results[0];

  // a price question that named nothing is not answerable as a tool; the caller asks which instrument
  const near = results.filter(r => top.score - r.score <= 0.04 && r.tool !== top.tool);
  if (near.length) {
    const opts = [top, ...near].slice(0, 3).map(r => ({ tool: r.tool, label: TOOL_LABEL[r.tool] || r.tool, args: r.args }));
    return { kind: 'ambiguous', options: opts };
  }
  return { kind: 'tool', tool: top.tool, args: top.args, score: top.score };
}
