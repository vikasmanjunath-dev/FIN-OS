// Arya's local tools: questions about YOUR money are answered on the phone, from the same cores the screens use, with no model and
// no network. A fixed intent matcher picks the tool; a tool never guesses (an unrecorded figure is named, not defaulted).
//
//   matchIntent(text)            what the person is asking, or null (then the question goes to the model, or to the offline reply)
//   runLocal(match, facts, now)  the answer, the place it came from and the screen to open
//   backendCallFor(text)         a public-market question the Arya server can answer (/api/tool), same tool names as the website
//   formatBackend(name, result)  the server's answer worded the same deterministic way, or null when its shape is not recognised
//   knownFigures(facts)          every rupee figure the app holds about the person (the guardrail uses it to catch invented ones)
//
// Pure: no React, no storage, no network. The network call itself lives in hooks/useAryaChat.ts.
import { type ArFacts, inr, inrShort, incomeMonthly, expenseMonthly, netWorthKnown, holdingsValue, used80c, taxEstimate, ageOf } from '@/lib/aryaFacts';
import { byId } from '@/lib/calcs';
import { computeCoverage } from '@/lib/retirement';
import { simulatePayoff, type DebtLoan } from '@/lib/debt';
import { monthSpend } from '@/lib/budget';
import { best as bestRegime, STD_NEW, STD_OLD } from '@/lib/taxcore';
import { isoDate } from '@/lib/calendar';
import { offlineReply } from '@/lib/aryaOffline';

export type Intent =
  | 'net_worth' | 'savings_rate' | 'emergency' | 'goals' | 'dues' | 'spend' | 'score' | 'insurance' | 'debt'
  | 'tax' | 'sip' | 'emi' | 'help';

export interface Match { intent: Intent; params: { amount?: number; rate?: number; years?: number } }
export interface ToolReply {
  intent: Intent;
  text: string;
  /** where the numbers came from, shown under the answer */
  source: string;
  route: string | null;
  routeLabel: string | null;
  /** false: a figure is missing, the answer says which */
  complete: boolean;
}

/* ── reading amounts ────────────────────────────────────────────────────────────────────────────────────── */

/** "₹5,000", "5k", "50 lakh", "1.5 cr", "2L" -> rupees; null when it is not an amount. */
export function parseAmount(s: string): number | null {
  const m = /^\s*(?:₹|rs\.?|inr)?\s*([\d,]*\.?\d+)\s*(k|thousand|l|lac|lacs|lakh|lakhs|cr|crore|crores|m|million)?\s*$/i.exec(s);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  const u = (m[2] || '').toLowerCase();
  const mult = u === 'k' || u === 'thousand' ? 1e3 : /^(l|lac|lacs|lakh|lakhs)$/.test(u) ? 1e5 : /^(cr|crore|crores)$/.test(u) ? 1e7 : u === 'm' || u === 'million' ? 1e6 : 1;
  return n * mult;
}

const AMOUNT_RE = /(?:₹|rs\.?\s*|inr\s*)?\d[\d,]*(?:\.\d+)?\s*(?:k\b|thousand\b|lakhs?\b|lacs?\b|l\b|crores?\b|cr\b|million\b|m\b)?/gi;

function readParams(text: string): Match['params'] {
  const p: Match['params'] = {};
  let rest = ` ${text} `;
  const rate = /(\d+(?:\.\d+)?)\s*(?:%|percent|per\s?cent|pc\b)/i.exec(rest);
  if (rate) { p.rate = parseFloat(rate[1]); rest = rest.replace(rate[0], ' '); }
  const yrs = /(\d+(?:\.\d+)?)\s*(?:years?|yrs?|yr|y\b)/i.exec(rest);
  const mon = /(\d+(?:\.\d+)?)\s*(?:months?|mos?\b)/i.exec(rest);
  if (yrs) { p.years = parseFloat(yrs[1]); rest = rest.replace(yrs[0], ' '); }
  else if (mon) { p.years = parseFloat(mon[1]) / 12; rest = rest.replace(mon[0], ' '); }
  // a bare "at 8.5" after "at"/"@" is a rate too
  if (p.rate === undefined) { const at = /(?:\bat\b|@)\s*(\d+(?:\.\d+)?)\b(?!\s*(?:k|l|lakh|cr|crore))/i.exec(rest); if (at && parseFloat(at[1]) <= 60) { p.rate = parseFloat(at[1]); rest = rest.replace(at[0], ' '); } }
  const amounts = (rest.match(AMOUNT_RE) || []).map(x => parseAmount(x.trim())).filter((x): x is number => x !== null && x >= 100);
  if (amounts.length) p.amount = amounts[0];
  return p;
}

/* ── the matcher ────────────────────────────────────────────────────────────────────────────────────────── */

const PERSONAL = /\b(my|mine|i|i'm|im|i am|am i|do i|have i|how much|how many|kitna|kitni|meri|mera)\b/i;
const norm = (s: string) => String(s || '').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;
const GENERAL_Q = /^(what is|what are|what's the meaning|define|explain|why|how does|how do|difference between|tell me about|meaning of)\b/;
const ADVICE_Q = /\b(should i|can i|is it (good|safe|wise)|which (is|one) better|better option)\b/;

/** What a question is asking for, from the words alone. null means "not one of the local tools" (the model, or the offline reply, handles it). */
export function matchIntent(raw: string): Match | null {
  const t = norm(raw);
  if (!t) return null;
  const p = readParams(raw);

  if (/^(help|what can you (do|answer)|what (all )?can you do|how can you help|menu|options)\b/.test(t)) return { intent: 'help', params: {} };

  // calculators: an explicit sum with numbers in it
  const hasNums = p.amount !== undefined || p.rate !== undefined || p.years !== undefined;
  if (/\bsip\b/.test(t) && hasNums && !/\b(step[- ]?up|stepup)\b/.test(t)) return { intent: 'sip', params: p };
  if (/\bemi\b|\bloan\b/.test(t) && hasNums && (p.amount !== undefined) && !/\bmy\b/.test(t)) return { intent: 'emi', params: p };
  if (/\b(my )?tax\b/.test(t) && (p.amount !== undefined && /\b(income|salary|ctc|earn|package|lpa)\b/.test(t))) return { intent: 'tax', params: p };

  // personal questions need a first-person cue, or to be a bare keyword ("net worth")
  const bare = wordCount(t) <= 3;
  const dueQ = /\b(due|upcoming|renewals?|deadlines?|coming up)\b/.test(t) && !/\bdue date\b|\bdeadline (for|of)\b/.test(t);
  const personal = PERSONAL.test(t) || bare || dueQ;
  const general = GENERAL_Q.test(t) && !/\bmy\b/.test(t) && !dueQ;
  if (general || (ADVICE_Q.test(t) && !/\bmy\b/.test(t))) return null;
  if (!personal) return null;

  if (/\bnet ?worth\b|\bhow much am i worth\b|\btotal assets\b/.test(t)) return { intent: 'net_worth', params: {} };
  if (/\bsavings? rate\b|\bhow much (am i|do i) (saving|save)\b|\bam i saving enough\b/.test(t)) return { intent: 'savings_rate', params: {} };
  if (/\bemergency (fund|corpus|money|months?|cover|buffer)\b|\bhow many months\b.*\b(cover|last|runway)\b|\brunway\b/.test(t)) return { intent: 'emergency', params: {} };
  if (/\bgoals?\b/.test(t)) return { intent: 'goals', params: {} };
  if (/\b(due|dues|upcoming|renewals?|deadlines?|coming up|payments? due|what'?s next)\b/.test(t)) return { intent: 'dues', params: {} };
  if (/\bmoney score\b|\bfinancial health\b|\bhealth score\b/.test(t)) return { intent: 'score', params: {} };
  if (/\b(spent|spend|spending|expenses?|kharcha)\b/.test(t) && /\b(month|so far|this|today|week)\b|\bhow much\b/.test(t)) return { intent: 'spend', params: {} };
  if (/\b(insurance|insured|cover(age)?|polic(y|ies))\b/.test(t) && !/\bemergency\b/.test(t)) return { intent: 'insurance', params: {} };
  if (/\b(debt|debts|loans?|emis?|owe|liabilit(y|ies))\b/.test(t)) return { intent: 'debt', params: {} };
  if (/\btax\b|\bitr\b|\b80c\b/.test(t)) return { intent: 'tax', params: {} };
  return null;
}

/* ── the local answers ──────────────────────────────────────────────────────────────────────────────────── */

const need = (intent: Intent, text: string, route: string | null, routeLabel: string | null): ToolReply =>
  ({ intent, text, source: 'Nothing recorded for this yet.', route, routeLabel, complete: false });

export const HELP_EXAMPLES = [
  'What is my net worth?', 'What is my savings rate?', 'How many months does my emergency fund cover?', 'How are my goals doing?',
  'What is due this month?', 'How much have I spent this month?', 'What is my Money Score?', 'Do I have enough insurance?',
  'What do I owe?', 'How much tax do I pay?', 'SIP of 10000 at 12% for 15 years', 'EMI on 50 lakh at 8.5% for 20 years',
];

function lineList(rows: string[]) { return rows.map(r => `- ${r}`).join('\n'); }

export function runLocal(m: Match, f: ArFacts): ToolReply {
  const c = f.computed;
  switch (m.intent) {
    case 'help':
      return { intent: 'help', complete: true, route: null, routeLabel: null, source: 'These run on this phone, from the numbers you have recorded.',
        text: `I can answer these from your own records, with no connection:\n${lineList(HELP_EXAMPLES)}\n\nFor anything else I need to reach Arya online.` };

    case 'net_worth': {
      if (!netWorthKnown(f)) return need('net_worth', 'No assets or loans are recorded yet, so I cannot work out your net worth. Add what you own and owe in the Net Worth tracker.', '/tracker/networth', 'Open net worth');
      const nw = c.netWorth;
      const top = nw.assets.slice().sort((a, b) => b.value - a.value).slice(0, 3).map(a => `${a.label} ${inrShort(a.value)}`).join(', ');
      return { intent: 'net_worth', complete: true, route: '/tracker/networth', routeLabel: 'Open net worth', source: 'Net Worth tracker (assets and loans you recorded).',
        text: `Your net worth is ${inrShort(nw.netWorth)}: ${inrShort(nw.totalAssets)} of assets${nw.totalLiabilities > 0 ? ` less ${inrShort(nw.totalLiabilities)} owed` : ' and nothing owed'}.${top ? ` Largest assets: ${top}.` : ''} This is only what you have recorded.` };
    }

    case 'savings_rate': {
      const b = c.budget;
      if (!b.known) return need('savings_rate', `${b.income > 0 ? 'Your spending is not recorded' : 'Your monthly income is not recorded'}, so I cannot work out a savings rate. Add both in the Budget tracker.`, '/tracker/budget', 'Open budget');
      return { intent: 'savings_rate', complete: true, route: '/tracker/budget', routeLabel: 'Open budget', source: 'Income and spending you recorded in the Budget tracker.',
        text: `You are saving ${b.savingsRate}% of income: ${inr(b.income)} comes in and ${inr(b.expense)} goes out each month, so ${b.saving >= 0 ? inr(b.saving) + ' is left over' : inr(-b.saving) + ' more goes out than comes in'}. About 20% or more is the usual guide.` };
    }

    case 'emergency': {
      const e = c.emergency;
      if (!(e.monthlyExpense > 0)) return need('emergency', 'Your monthly spending is not recorded, so I cannot say how many months your emergency fund covers. Add it in the Budget tracker.', '/tracker/budget', 'Open budget');
      if (!(e.fund > 0)) return need('emergency', `No emergency fund is recorded. Your target of ${e.target} months of spending would be ${inr(e.targetAmount)}. Add what you have set aside in the Emergency fund tracker.`, '/tracker/emergency', 'Open emergency fund');
      return { intent: 'emergency', complete: true, route: '/tracker/emergency', routeLabel: 'Open emergency fund', source: 'Emergency fund tracker and your recorded monthly spending.',
        text: `Your emergency fund of ${inr(e.fund)} covers ${e.covered.toFixed(1)} months of spending (${inr(e.monthlyExpense)} a month). Your target is ${e.target} months, ${inr(e.targetAmount)}; ${e.shortfall > 0 ? `${inr(e.shortfall)} more reaches it` : 'you are at or above it'}.` };
    }

    case 'goals': {
      const items = c.goals.items;
      if (!items.length) return need('goals', 'No goals are recorded. Add one with an amount and a date and I can show what it needs each month.', '/tracker/goals', 'Add a goal');
      const rows = items.slice(0, 5).map(g => `${g.name}: ${inr(g.current)} of ${inr(g.target)} (${Math.round(g.progress)}%)${g.monthlyNeeded ? `, needs ${inr(g.monthlyNeeded)} a month for ${g.monthsLeft} months` : g.target_date ? '' : ', no date set'}`);
      return { intent: 'goals', complete: true, route: '/tracker/goals', routeLabel: 'Open goals', source: 'Goals tracker (target, saved so far, date).',
        text: `You have ${items.length} goal${items.length === 1 ? '' : 's'}, ${Math.round(c.goals.avgProgress)}% funded on average:\n${lineList(rows)}\nMonthly amounts ignore any return on the savings.` };
    }

    case 'dues': {
      const today = isoDate(f.now), to = isoDate(new Date(f.now.getFullYear(), f.now.getMonth(), f.now.getDate() + 30));
      const list = f.events.filter(e => e.date >= today && e.date <= to).slice(0, 6);
      if (!list.length) return { intent: 'dues', complete: true, route: '/tools/calendar', routeLabel: 'Open calendar', source: 'Financial calendar.', text: 'Nothing is due in the next 30 days from what is recorded (SIPs, FDs, policies, goals, subscriptions and tax dates).' };
      const rows = list.map(e => `${e.date.slice(5).split('-').reverse().join('/')} ${e.title}${e.amount ? ` (${inr(e.amount)})` : ''}`);
      return { intent: 'dues', complete: true, route: '/tools/calendar', routeLabel: 'Open calendar', source: 'Financial calendar: your SIPs, FDs, policies, goals, subscriptions and the statutory tax dates.',
        text: `Coming up in the next 30 days:\n${lineList(rows)}` };
    }

    case 'spend': {
      const month = c.spending.month;
      const ms = monthSpend(f.data.transactions, month);
      if (!(ms.total > 0)) return need('spend', 'No spending is logged for this month yet. Log expenses in Transactions and I can total them.', '/tracker/transactions', 'Open transactions');
      const cats = Object.entries(ms.byCat).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${inr(v)}`).join(', ');
      return { intent: 'spend', complete: true, route: '/tracker/transactions', routeLabel: 'Open transactions', source: `Transactions you logged for ${month}.`,
        text: `You have logged ${inr(ms.total)} of spending this month. Largest: ${cats}. Only what you logged is counted.` };
    }

    case 'score': {
      const s = f.moneyScore;
      if (!s) return need('score', 'You have not taken your Money Score on this phone yet. It takes about a minute.', '/tools/score', 'Take the Money Score');
      return { intent: 'score', complete: true, route: '/tools/score', routeLabel: 'Open Money Score', source: `Money Score you saved${s.at ? ` on ${s.at.slice(0, 10)}` : ''}.`,
        text: `Your Money Score is ${s.score} out of 100${s.band ? ` (${s.band})` : ''}.${s.weakestLabel ? ` Weakest area: ${s.weakestLabel}.` : ''}${s.topTitle ? ` Best next move: ${s.topTitle}.` : ''}` };
    }

    case 'insurance': {
      const ps = f.data.policies;
      if (!ps.length) return need('insurance', 'No insurance policy is recorded. If you have cover, add it in the Insurance tracker and I can compare it with the usual guides.', '/tracker/insurance', 'Open insurance');
      const income = incomeMonthly(f);
      const cov = computeCoverage(ps, income, ageOf(f) || 30);
      const base = `You have ${ps.length} polic${ps.length === 1 ? 'y' : 'ies'} recorded: health cover ${cov.hasHealth ? inrShort(cov.totalHealth) : 'none'}, term life cover ${cov.hasTerm ? inrShort(cov.totalLife) : 'none'}, ${inr(cov.annualPremium)} a year in premiums.`;
      const guide = income > 0
        ? ` Against your recorded income the usual guides are ${inrShort(cov.recHealth)} for health (2x yearly income) and ${inrShort(cov.recLife)} for term life (15x). They are rules of thumb.`
        : ' Record your monthly income and I can compare this with the usual guides.';
      return { intent: 'insurance', complete: true, route: '/tracker/insurance', routeLabel: 'Open insurance', source: 'Insurance tracker.', text: base + guide };
    }

    case 'debt': {
      const total = c.netWorth.totalLiabilities;
      if (!(total > 0)) return need('debt', 'No loans or card dues are recorded. Add them in the Net Worth tracker or the Debt optimizer.', '/tools/debt', 'Open Debt optimizer');
      const emi = f.loans.reduce((s, l) => s + l.emi, 0);
      const income = incomeMonthly(f);
      let t = `You owe ${inr(total)} in total.`;
      if (f.loans.length) t += ` ${f.loans.map(l => `${l.label} ${inr(l.balance)}${l.rate > 0 ? ` at ${l.rate}%` : ''}`).join(', ')}.`;
      if (emi > 0) t += ` EMIs come to ${inr(emi)} a month${income > 0 ? `, ${Math.round((emi / income) * 100)}% of your income` : ''}.`;
      const complete = f.loans.length > 0 && f.loans.every(l => l.balance > 0 && l.rate > 0 && l.emi > 0);
      if (complete) {
        const ls: DebtLoan[] = f.loans.map(l => ({ key: l.key, label: l.label, balance: l.balance, rate: l.rate, emi: l.emi }));
        const r = simulatePayoff(ls, 0, 'avalanche');
        if (r.paidOff) t += ` At these EMIs, paying the highest rate first, you are debt-free in ${Math.floor(r.months / 12)} years ${r.months % 12} months with ${inr(r.totalInterest)} of interest still to pay.`;
      }
      return { intent: 'debt', complete: true, route: '/tools/debt', routeLabel: 'Open Debt optimizer', source: 'Net Worth tracker liabilities, with the rate and EMI you gave the Debt optimizer.', text: t };
    }

    case 'tax': {
      let income = m.params.amount;
      let from = 'the income you asked about';
      let u: number | null = used80c(f);
      if (income === undefined) {
        const t = taxEstimate(f);
        if (!t) return need('tax', 'I need your annual income to estimate tax. Enter it on the Tax planner, or ask like this: "tax on 12 lakh income".', '/tools/taxplanner', 'Open Tax planner');
        income = t.income; from = 'the annual income on your Tax planner';
      }
      const b = bestRegime(Math.max(0, income - STD_NEW), Math.max(0, income - STD_OLD - (u ?? 0)));
      return { intent: 'tax', complete: true, route: '/tools/taxplanner', routeLabel: 'Open Tax planner', source: 'The shared tax core (FY 2025-26 slabs, 4% cess; surcharge above ₹50 lakh is not modelled).',
        text: `On ${inr(income)} (${from}), as salary income with the standard deduction${u === null ? '' : ` and ₹${Math.round(u).toLocaleString('en-IN')} of 80C`}: new regime ${inr(b.taxNew)}, old regime ${inr(b.taxOld)}. The ${b.regime} regime is lower by ${inr(Math.abs(b.taxNew - b.taxOld))}. HRA, home-loan interest, 80D and capital gains are not included; the Tax planner covers them. An estimate, not tax advice.` };
    }

    case 'sip': {
      const { amount, rate, years } = m.params;
      const missing = [amount === undefined && 'the monthly amount', rate === undefined && 'the expected return', years === undefined && 'how many years'].filter(Boolean);
      if (missing.length) return need('sip', `To work out a SIP I need ${missing.join(', ')}. For example: "SIP of 10000 at 12% for 15 years". I will not assume a return.`, '/tools/calc/sip', 'Open the SIP calculator');
      const calc = byId('sip')!;
      const rows = calc.run({ monthly: amount, rate, time: years });
      const line = rows.map(r => (r.label ? `${r.label} ${r.text}` : r.text)).join('; ');
      return { intent: 'sip', complete: true, route: '/tools/calc/sip', routeLabel: 'Open the SIP calculator', source: 'The SIP calculator (same formula as the screen).',
        text: `A SIP of ${inr(amount!)} a month at ${rate}% a year for ${years} years: ${line}. This assumes a steady return, which real funds do not give; it is a scenario, not a forecast.` };
    }

    case 'emi': {
      const { amount, rate, years } = m.params;
      const missing = [amount === undefined && 'the loan amount', rate === undefined && 'the interest rate', years === undefined && 'the tenure'].filter(Boolean);
      if (missing.length) return need('emi', `To work out an EMI I need ${missing.join(', ')}. For example: "EMI on 50 lakh at 8.5% for 20 years".`, '/tools/calc/emi', 'Open the EMI calculator');
      const calc = byId('emi')!;
      const rows = calc.run({ loan: amount, rate, time: years });
      const line = rows.map(r => (r.label ? `${r.label} ${r.text}` : r.text)).join('; ');
      return { intent: 'emi', complete: true, route: '/tools/calc/emi', routeLabel: 'Open the EMI calculator', source: 'The EMI calculator (same formula as the screen).',
        text: `A loan of ${inr(amount!)} at ${rate}% for ${years} years: ${line}. Fees, insurance and a change in the rate are not included.` };
    }
  }
}

/** The answer text with its source line, as shown in the chat. */
export const withSource = (r: ToolReply) => `${r.text}\n\nFrom: ${r.source}`;

/** One call: the question in, the finished local answer (or null when it is not a local question). */
export function answerLocally(text: string, f: ArFacts): ToolReply | null {
  const m = matchIntent(text);
  return m ? runLocal(m, f) : null;
}

/* ── backend tools (public market data only) ─────────────────────────────────────────────────────────────── */

export interface BackendCall { name: 'get_quote' | 'get_market' | 'get_crypto' | 'get_fx'; args: Record<string, unknown>; label: string }

const NOT_SYMBOLS = new Set(['THE', 'OF', 'FOR', 'AND', 'WHAT', 'IS', 'ARE', 'PRICE', 'QUOTE', 'SHARE', 'STOCK', 'TODAY', 'NOW', 'LIVE', 'CURRENT', 'RATE', 'MARKET', 'TRADING',
  'AT', 'TO', 'ME', 'MY', 'GIVE', 'SHOW', 'TELL', 'ABOUT', 'LTP', 'NSE', 'BSE', 'INR', 'USD', 'A', 'AN', 'IN', 'ON', 'HOW', 'MUCH', 'WHATS', 'CAN', 'YOU', 'GET']);

/** "price of RELIANCE", "TCS share price", "bitcoin price", "how is the market", "dollar rate": the public tool that answers it, or null. */
export function backendCallFor(raw: string): BackendCall | null {
  const t = norm(raw);
  if (!t || /\bmy\b/.test(t) && !/\bmy (nifty|sensex)\b/.test(t)) return null;
  if (/\b(should i|can i|is it (good|safe|wise)|will it|going to (rise|fall|go))\b/.test(t)) return null;
  if (/\b(bitcoin|btc|ethereum|eth|crypto|dogecoin|xrp)\b/.test(t) && /\b(price|rate|worth|trading|how much|value)\b/.test(t)) return { name: 'get_crypto', args: {}, label: 'crypto prices' };
  if (/\b(dollar|usd|euro|eur|pound|gbp|yen|jpy|dirham|aed)\b/.test(t) && /\b(rate|inr|rupee|price|worth|exchange)\b/.test(t)) return { name: 'get_fx', args: {}, label: 'exchange rates' };
  if (/\b(nifty|sensex|bank ?nifty|indices|index|market)\b/.test(t) && /\b(today|now|level|live|current|how is|how's|how are|at|doing|status|close)\b/.test(t) && !/\b(price of|quote)\b/.test(t)) return { name: 'get_market', args: {}, label: 'the market overview' };
  const sym = /\b(?:price|quote|ltp|trading|share price|stock price)\s+(?:of|for)?\s*([A-Za-z][A-Za-z&-]{1,14})\b|\b([A-Za-z][A-Za-z&-]{1,14})\s+(?:share|stock)\s+price\b|\b([A-Za-z][A-Za-z&-]{1,14})\s+(?:price|quote|ltp)\b/i.exec(raw);
  if (sym) {
    const s = (sym[1] || sym[2] || sym[3] || '').toUpperCase().replace(/[^A-Z&-]/g, '');
    if (s && !NOT_SYMBOLS.has(s) && s.length >= 2) return { name: 'get_quote', args: { symbol: s, exchange: 'NSE' }, label: `${s} quote` };
  }
  return null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const px = (n: number) => '₹' + n.toLocaleString('en-IN', n >= 1e5 ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const chg = (c: number | null, p: number | null) => (c === null ? '' : ` (${c >= 0 ? '+' : ''}${c.toFixed(2)}${p !== null ? `, ${p >= 0 ? '+' : ''}${p.toFixed(2)}%` : ''})`);

/** Words a tool result the same way every time. null = the result did not have the expected shape (the caller falls back). */
export function formatBackend(name: BackendCall['name'], result: any): string | null {
  if (!result || typeof result !== 'object' || result.error) return null;
  if (name === 'get_quote') {
    const price = num(result.price);
    if (price === null || typeof result.symbol !== 'string') return null;
    return `${result.symbol}${result.name && result.name !== result.symbol ? ` (${result.name})` : ''} last traded at ${px(price)}${chg(num(result.change), num(result.change_pct))}.`;
  }
  if (name === 'get_market') {
    const idx = result.indices;
    if (!idx || typeof idx !== 'object') return null;
    const rows = Object.entries(idx as Record<string, any>).map(([k, v]) => ({ k, p: num(v?.price), c: num(v?.change), pc: num(v?.change_pct) })).filter(r => r.p !== null);
    if (!rows.length) return null;
    return rows.map(r => `${r.k}: ${r.p!.toLocaleString('en-IN', { maximumFractionDigits: 2 })}${chg(r.c, r.pc)}`).join('\n');
  }
  if (name === 'get_crypto') {
    const c = result.crypto;
    if (!c || typeof c !== 'object') return null;
    const rows = Object.values(c as Record<string, any>).map(v => ({ n: String(v?.name ?? ''), p: num(v?.price_inr), c: num(v?.change_24h) })).filter(r => r.n && r.p !== null);
    if (!rows.length) return null;
    return rows.slice(0, 5).map(r => `${r.n}: ${px(r.p!)}${r.c !== null ? ` (${r.c >= 0 ? '+' : ''}${r.c.toFixed(1)}% in 24h)` : ''}`).join('\n');
  }
  if (name === 'get_fx') {
    const rows = Object.entries(result as Record<string, unknown>).map(([k, v]) => ({ k: k.replace('_', ' to '), v: num(v) })).filter(r => r.v !== null);
    if (!rows.length) return null;
    return rows.map(r => `${r.k}: ${r.v!.toFixed(2)}`).join('\n');
  }
  return null;
}

export const BACKEND_SOURCE = 'The Arya server (public market data; it can lag and is indicative). Nothing about you was sent.';

/* ── figures the app holds ──────────────────────────────────────────────────────────────────────────────── */

/**
 * Every rupee figure the app has about the person, and which of them are per-month amounts (those may be quoted per year).
 * The guardrail treats these as "known": a figure stated about the person that matches none of them gets a note.
 */
export function knownFigureSet(f: ArFacts): { figures: number[]; monthly: number[] } {
  const monthly = new Set<number>();
  const m = (n: unknown) => { const v = Math.round(Math.abs(Number(n))); if (Number.isFinite(v) && v >= 1) monthly.add(v); };
  m(incomeMonthly(f)); m(expenseMonthly(f)); m(f.data.monthlySip); m(f.computed.budget.saving);
  f.loans.forEach(l => m(l.emi));
  if (f.subs) m(f.subs.monthly);
  return { figures: knownFigures(f), monthly: [...monthly] };
}

/** Every rupee figure the app has about the person (and the common derived ones). */
export function knownFigures(f: ArFacts): number[] {
  const out = new Set<number>();
  const add = (n: unknown) => { const v = Number(n); if (Number.isFinite(v) && Math.abs(v) >= 1) out.add(Math.round(Math.abs(v))); };
  const c = f.computed;
  [c.budget.income, c.budget.expense, c.budget.saving, c.netWorth.netWorth, c.netWorth.totalAssets, c.netWorth.totalLiabilities, c.netWorth.fireSource === 'default' ? 0 : c.netWorth.fireCorpus,   // a corpus built on the app's ₹50,000 default is not a recorded figure
   
    c.emergency.fund, c.emergency.targetAmount, c.emergency.shortfall, f.data.monthlySip, f.data.emergencyFund, f.data.used80c, holdingsValue(f)].forEach(add);
  c.netWorth.assets.forEach(a => add(a.value));
  c.netWorth.liabilities.forEach(l => add(l.value));
  c.goals.items.forEach(g => { add(g.target); add(g.current); add(g.remaining); add(g.monthlyNeeded); });
  f.data.policies.forEach(p => { add(p.sum_assured); add(p.annual_premium); });
  f.loans.forEach(l => { add(l.balance); add(l.emi); });
  f.events.forEach(e => add(e.amount));
  if (f.subs) { add(f.subs.monthly); }
  const t = taxEstimate(f);
  if (t) { add(t.income); add(t.tax); add(t.taxNew); add(t.taxOld); }
  Object.values(c.spending.totals).forEach(add);
  return [...out];
}

/* ── when the model cannot be asked ─────────────────────────────────────────────────────────────────────── */

/**
 * The reply when the online model is unreachable or switched off: the phone's own answer when the question is one it can answer,
 * else the plain offline reply plus the questions that do work here. Plain language: no ports, hosts or developer hints in production.
 */
export function localOnlyReply(local: ToolReply | null, why: string | null, dev = false): string {
  if (local) return `${why ?? 'I cannot reach Arya online right now, but your own records answer this:'}\n\n${withSource(local)}`;
  const head = why ? `${why}\n\n` : '';
  const base = offlineReply('unreachable', dev && !why);
  const help = `Questions I can answer on this phone, from your own records:\n${HELP_EXAMPLES.slice(0, 6).map(e => `- ${e}`).join('\n')}`;
  const at = base.indexOf('\n\nTry again');
  return head + (at >= 0 ? `${base.slice(0, at)}\n\n${help}${base.slice(at)}` : `${base}\n\n${help}`);
}
