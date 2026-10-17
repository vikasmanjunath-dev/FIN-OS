// Arya's tools that run ON THE PHONE. Each reads the person's recorded figures (an ArFacts bundle) or runs one of the app's own
// calculators, and returns words with the place the numbers came from and the time they were true. Nothing here touches the network.
//
//   TOOL_SPECS          every tool Arya has, on the phone and on the server, with what it reads and what (if anything) leaves the phone
//   runDeviceTool(...)  the answer for a phone tool (pure; "now" comes from the facts)
//
// Rules every tool keeps (tested): an unrecorded figure is named, never defaulted; a number the person did not state is asked for, not
// assumed (a SIP without a return asks for one); every reply carries `source` and `asOf`; no tool recommends buying or selling anything.
import { type ArFacts, inr, inrShort, incomeMonthly, expenseMonthly, netWorthKnown, used80c, taxEstimate, ageOf } from '@/lib/aryaFacts';
import type { ToolId, Args } from '@/lib/aryaIntent';
import { byId } from '@/lib/calcs';
import { computeCoverage } from '@/lib/retirement';
import { simulatePayoff, type DebtLoan } from '@/lib/debt';
import { monthSpend } from '@/lib/budget';
import { best as bestRegime, STD_NEW, STD_OLD } from '@/lib/taxcore';
import { isoDate, taxDates, taxDatesForFY, fyOf } from '@/lib/calendar';
import { retirementOdds } from '@/lib/aryaRetirement';
import { trend as nwTrend } from '@/lib/pulseHistory';
import { suggestionsFor, type DeclaredEvent } from '@/lib/lifeEvents';
import type { MemoryItem } from '@/lib/aryaMemory';

/* ── what tools exist ──────────────────────────────────────────────────────────────────────────────────────── */
export type ToolWhere = 'phone' | 'server';
export type ToolGroup = 'records' | 'calculators' | 'tax' | 'memory' | 'navigate' | 'market';
export interface ToolSpec {
  id: ToolId; label: string; where: ToolWhere; group: ToolGroup;
  /** what it reads */
  reads: string;
  /** what leaves the phone when it runs ("Nothing" for phone tools) */
  sends: string;
  example: string;
}

const P = (id: ToolId, group: ToolGroup, label: string, reads: string, example: string): ToolSpec => ({ id, label, where: 'phone', group, reads, sends: 'Nothing leaves the phone.', example });
const S = (id: ToolId, label: string, reads: string, sends: string, example: string): ToolSpec => ({ id, label, where: 'server', group: 'market', reads, sends, example });

export const TOOL_SPECS: ToolSpec[] = [
  P('snapshot', 'records', 'Money summary', 'Net worth, budget, emergency fund, Money Score, loans', 'How am I doing?'),
  P('net_worth', 'records', 'Net worth', 'Net Worth tracker', 'What is my net worth?'),
  P('assets', 'records', 'Where my money sits', 'Net Worth tracker (assets)', 'Where is my money?'),
  P('debt', 'records', 'Debts and EMIs', 'Net Worth tracker, Debt optimizer', 'What do I owe?'),
  P('savings_rate', 'records', 'Savings rate', 'Budget tracker', 'What is my savings rate?'),
  P('emergency_fund', 'records', 'Emergency fund', 'Emergency fund tracker, Budget', 'How many months does my emergency fund cover?'),
  P('goals', 'records', 'Goals', 'Goals tracker', 'How are my goals doing?'),
  P('goal_sip', 'records', 'Monthly saving my goals need', 'Goals tracker', 'How much a month do my goals need?'),
  P('health_score', 'records', 'Health score', 'All trackers (the score on the dashboard)', 'What is my health score?'),
  P('money_score', 'records', 'Money Score', 'The score saved on this phone', 'What is my Money Score?'),
  P('budget', 'records', 'Budget this month', 'Budget limits and logged transactions', 'How is my budget?'),
  P('spending_month', 'records', 'Spending this month', 'Logged transactions', 'How much did I spend this month?'),
  P('subscriptions', 'records', 'Subscriptions', 'Subscription tracker', 'What do my subscriptions cost?'),
  P('insurance', 'records', 'Insurance cover', 'Insurance tracker', 'Do I have enough insurance?'),
  P('upcoming', 'records', 'What is due soon', 'Financial calendar (your SIPs, FDs, policies, goals, dates)', 'What is due this month?'),
  P('alerts', 'records', 'Alerts', 'Alert rules run on your trackers', 'Anything I should know?'),
  P('life_plan', 'records', 'Life-event prompts', 'Life events you declared + your trackers', 'What should I do for my life events?'),
  P('trend', 'records', 'Net worth over time', 'The net-worth points this phone recorded', 'How is my net worth moving?'),
  P('retirement_odds', 'records', 'Chance your money lasts', 'Retirement planner inputs (seeded simulation)', 'Will my money last in retirement?'),
  P('fire', 'records', 'FIRE number', 'Monthly spending in the Budget tracker', 'What is my FIRE number?'),
  P('sip_calc', 'calculators', 'SIP calculator', 'Numbers in your question', 'SIP of 10000 at 12% for 15 years'),
  P('emi_calc', 'calculators', 'EMI calculator', 'Numbers in your question', 'EMI on 50 lakh at 8.5% for 20 years'),
  P('fd_calc', 'calculators', 'FD calculator', 'Numbers in your question', 'FD of 1 lakh at 7% for 5 years'),
  P('rd_calc', 'calculators', 'RD calculator', 'Numbers in your question', 'RD of 5000 at 7% for 3 years'),
  P('lumpsum_calc', 'calculators', 'Lump sum calculator', 'Numbers in your question', 'What will 1 lakh grow to at 10% in 8 years?'),
  P('inflation_calc', 'calculators', 'Inflation calculator', 'Numbers in your question', 'What will 1 lakh be worth in 10 years at 6% inflation?'),
  P('tax_estimate', 'tax', 'Income tax estimate', 'Annual income on the Tax planner, or the figure you state', 'How much tax do I pay?'),
  P('tax_80c', 'tax', '80C room', '80C used (Tax planner or tracker)', 'How much 80C is left?'),
  P('advance_tax', 'tax', 'Advance tax instalments', 'Tax estimate + statutory dates', 'How much advance tax do I pay?'),
  P('tax_dates', 'tax', 'Tax dates', 'Statutory dates in the financial calendar', 'When is the ITR deadline?'),
  P('memory_show', 'memory', 'What Arya remembers', 'Notes and topics on this phone', 'What do you remember about me?'),
  P('memory_add', 'memory', 'Remember a note', 'Writes one note on this phone', 'Remember that I prefer index funds'),
  P('memory_forget', 'memory', 'Forget notes', 'Opens What Arya remembers (nothing is deleted from chat)', 'Forget everything'),
  P('open_screen', 'navigate', 'Open a screen', 'Nothing', 'Open the tax planner'),
  P('help', 'navigate', 'Help', 'Nothing', 'What can you do?'),
  S('quote', 'Share price', 'Public NSE/BSE quote (get_quote)', 'The share symbol only, e.g. RELIANCE.', 'Price of RELIANCE'),
  S('market', 'Market today', 'Public index levels (get_market)', 'Nothing about you; the request names no symbol.', 'How is the Nifty today?'),
  S('commodities', 'Gold, silver, crude', 'Public commodity prices (get_commodities)', 'Nothing about you.', 'Gold rate today'),
  S('crypto', 'Crypto prices', 'Public prices (get_crypto)', 'The coin name only, e.g. bitcoin.', 'Bitcoin price'),
  S('fx', 'Exchange rates', 'Public rates (get_fx)', 'Nothing about you.', 'Dollar rate today'),
  S('technical', 'Technical indicators', 'RSI, MACD and others for a share (analyze_stock)', 'The share symbol only.', 'Technical analysis of INFY'),
  S('mf_nav', 'Mutual fund NAV', 'AMFI NAV search (search_mf)', 'The fund-name words you typed.', 'NAV of Parag Parikh Flexi Cap'),
  S('news', 'Market headlines', 'Public publishers\' feeds (get_news)', 'Nothing about you.', 'Latest market news'),
  S('announcements', 'Company announcements', 'NSE announcements (get_announcements)', 'The share symbol only.', 'Announcements for TCS'),
];

/** Tools that exist on the website's agent and are NOT on the phone, each with the reason. Shown on the Agent tab. */
export const NOT_ON_PHONE: { name: string; why: string }[] = [
  { name: 'Web search and read-any-URL (search_web, read_url)', why: 'They would send the text of your question, or a link you pasted, to a search engine through the server. The phone keeps questions on the phone or on your own server, so these stay off.' },
  { name: 'Regulations and filings search (rag_query, rag_search_*)', why: 'Needs the separate RAG server (Qdrant and a model) running on your computer; its index holds SEBI/RBI/IRDAI/PFRDA text and our own pages, not company filings. See the A-09 notes.' },
  { name: 'Upload a document (rag_upload_doc)', why: 'Would send a document you choose to a server. Not built; the statement importer reads files on the phone only.' },
  { name: 'Fund mix, rebalance and risk-profile tools (optimize_sip, calc_rebalance, assess_risk)', why: 'They name funds, set target allocations from age (100 minus age) and score a "risk profile". That is personal investment advice built on an assumed age.' },
  { name: 'Budget templates (create_budget)', why: 'A 50/30/20 split is a template, not your figures. The Budget tracker suggests limits from your own last three months instead.' },
  { name: 'Rent vs buy, compare funds, NPS projection, bias scan (calc_rent_vs_buy, compare_funds, calc_nps, detect_bias)', why: 'Each rests on assumed city prices, returns or scoring rules that are not your data. The calculators hub covers the arithmetic with numbers you choose.' },
  { name: 'Live chart and reports (show_chart, generate_report)', why: 'They open a page served by the server. Markets and Market research already show prices and charts in the app.' },
  { name: 'Advisor modes (Aggressive / Balanced / Conservative)', why: 'They change how forcefully the model recommends. Arya on the phone does not vary its advice posture.' },
  { name: 'Voice (speak and listen)', why: 'Needs the microphone permission and a speech service. The app declares neither, and the privacy notice says so.' },
];

/* ── results ───────────────────────────────────────────────────────────────────────────────────────────────── */
export interface ToolResult {
  tool: ToolId;
  text: string;
  /** where the numbers came from */
  source: string;
  /** the moment the answer was worked out (phone tools) */
  asOf: number;
  route: string | null; routeLabel: string | null;
  /** false: a figure is missing, and the text says which */
  complete: boolean;
}

export interface ToolCtx {
  facts: ArFacts;
  events?: DeclaredEvent[];
  memory?: MemoryItem[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "16 Oct, 14:32" in the phone's own time. */
export function stamp(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** The text of an answer with where it came from and when. */
export const withSource = (r: { text: string; source: string; asOf?: number }) => `${r.text}\n\nFrom: ${r.source}${r.asOf ? ` As of ${stamp(r.asOf)}.` : ''}`;

const lineList = (rows: string[]) => rows.map(r => `- ${r}`).join('\n');

const need = (tool: ToolId, f: ArFacts, text: string, route: string | null, routeLabel: string | null): ToolResult =>
  ({ tool, text, source: 'Nothing recorded for this yet.', asOf: f.now.getTime(), route, routeLabel, complete: false });

export const HELP_EXAMPLES = [
  'What is my net worth?', 'What is my savings rate?', 'How many months does my emergency fund cover?', 'How are my goals doing?',
  'What is due this month?', 'How much have I spent this month?', 'What is my Money Score?', 'Do I have enough insurance?',
  'What do I owe?', 'How much tax do I pay?', 'SIP of 10000 at 12% for 15 years', 'EMI on 50 lakh at 8.5% for 20 years',
];

const ymdSlash = (iso: string) => iso.slice(5).split('-').reverse().join('/');

function calcLine(rows: { label?: string; text: string }[]) { return rows.map(r => (r.label ? `${r.label} ${r.text}` : r.text)).join('; '); }

/** Tools that run on the phone and need no write. `memory_add` is carried out by the agent (it writes), not here. */
export function runDeviceTool(tool: ToolId, a: Args, ctx: ToolCtx): ToolResult {
  const f = ctx.facts;
  const c = f.computed;
  const asOf = f.now.getTime();
  const ok = (text: string, source: string, route: string | null, routeLabel: string | null): ToolResult => ({ tool, text, source, asOf, route, routeLabel, complete: true });

  switch (tool) {
    case 'help':
      return ok(`I can answer these from your own records, with no connection:\n${lineList(HELP_EXAMPLES)}\n\nI can also look up public prices and headlines through your Arya server when it is reachable, run the calculators, and open a screen. The Agent tab lists every tool and what each one reads or sends.`,
        'These run on this phone, from the numbers you have recorded.', '/arya/agent', 'Open the Agent tab');

    case 'snapshot': {
      const rows: string[] = [], missing: string[] = [];
      if (netWorthKnown(f)) rows.push(`Net worth ${inrShort(c.netWorth.netWorth)}`); else missing.push('assets and loans');
      if (c.budget.known) rows.push(`Saving ${c.budget.savingsRate}% of income`); else missing.push('income and spending');
      if (c.emergency.monthlyExpense > 0 && c.emergency.fund > 0) rows.push(`Emergency fund covers ${c.emergency.covered.toFixed(1)} months`); else missing.push('the emergency fund');
      if (c.goals.items.length) rows.push(`${c.goals.items.length} goal${c.goals.items.length === 1 ? '' : 's'}, ${Math.round(c.goals.avgProgress)}% funded on average`); else missing.push('goals');
      if (f.moneyScore) rows.push(`Money Score ${f.moneyScore.score} out of 100`);
      if (c.netWorth.totalLiabilities > 0) rows.push(`You owe ${inrShort(c.netWorth.totalLiabilities)}`);
      if (!rows.length) return need(tool, f, 'Nothing is recorded yet, so there is nothing to summarise. Start with your assets and loans in the Net Worth tracker.', '/tracker/networth', 'Open net worth');
      return ok(`Here is what your records show:\n${lineList(rows)}${missing.length ? `\nNot recorded yet: ${missing.join(', ')}.` : ''}`, 'Your trackers (only what you have recorded).', '/pulse', 'Open PULSE');
    }

    case 'net_worth': {
      if (!netWorthKnown(f)) return need(tool, f, 'No assets or loans are recorded yet, so I cannot work out your net worth. Add what you own and owe in the Net Worth tracker.', '/tracker/networth', 'Open net worth');
      const nw = c.netWorth;
      const top = nw.assets.slice().sort((x, y) => y.value - x.value).slice(0, 3).map(x => `${x.label} ${inrShort(x.value)}`).join(', ');
      return ok(`Your net worth is ${inrShort(nw.netWorth)}: ${inrShort(nw.totalAssets)} of assets${nw.totalLiabilities > 0 ? ` less ${inrShort(nw.totalLiabilities)} owed` : ' and nothing owed'}.${top ? ` Largest assets: ${top}.` : ''} This is only what you have recorded.`,
        'Net Worth tracker (assets and loans you recorded).', '/tracker/networth', 'Open net worth');
    }

    case 'assets': {
      const nw = c.netWorth;
      if (!(nw.totalAssets > 0)) return need(tool, f, 'No assets are recorded yet, so there is nothing to split. Add what you own in the Net Worth tracker.', '/tracker/networth', 'Open net worth');
      const rows = nw.assets.slice().sort((x, y) => y.value - x.value).map(x => `${x.label}: ${inrShort(x.value)} (${Math.round(x.pct)}%)`);
      return ok(`Your recorded assets add up to ${inrShort(nw.totalAssets)}:\n${lineList(rows)}\nThis is only what you recorded. "Stocks & mutual funds" is the whole Portfolio tab, so how much of it is equity versus debt is not known here.`,
        'Net Worth tracker (assets you recorded).', '/arya/map', 'Open the money map');
    }

    case 'savings_rate': {
      const b = c.budget;
      if (!b.known) return need(tool, f, `${b.income > 0 ? 'Your spending is not recorded' : 'Your monthly income is not recorded'}, so I cannot work out a savings rate. Add both in the Budget tracker.`, '/tracker/budget', 'Open budget');
      return ok(`You are saving ${b.savingsRate}% of income: ${inr(b.income)} comes in and ${inr(b.expense)} goes out each month, so ${b.saving >= 0 ? inr(b.saving) + ' is left over' : inr(-b.saving) + ' more goes out than comes in'}. About 20% or more is the usual guide.`,
        'Income and spending you recorded in the Budget tracker.', '/tracker/budget', 'Open budget');
    }

    case 'emergency_fund': {
      const e = c.emergency;
      if (!(e.monthlyExpense > 0)) return need(tool, f, 'Your monthly spending is not recorded, so I cannot say how many months your emergency fund covers. Add it in the Budget tracker.', '/tracker/budget', 'Open budget');
      if (!(e.fund > 0)) return need(tool, f, `No emergency fund is recorded. The tracker's target is ${e.target} months of spending, which would be ${inr(e.targetAmount)}. Add what you have set aside in the Emergency fund tracker.`, '/tracker/emergency', 'Open emergency fund');
      return ok(`Your emergency fund of ${inr(e.fund)} covers ${e.covered.toFixed(1)} months of spending (${inr(e.monthlyExpense)} a month). The tracker's target is ${e.target} months, ${inr(e.targetAmount)}; ${e.shortfall > 0 ? `${inr(e.shortfall)} more reaches it` : 'you are at or above it'}.`,
        'Emergency fund tracker and your recorded monthly spending.', '/tracker/emergency', 'Open emergency fund');
    }

    case 'goals': {
      const items = c.goals.items;
      if (!items.length) return need(tool, f, 'No goals are recorded. Add one with an amount and a date and I can show what it needs each month.', '/tracker/goals', 'Add a goal');
      const rows = items.slice(0, 5).map(g => `${g.name}: ${inr(g.current)} of ${inr(g.target)} (${Math.round(g.progress)}%)${g.monthlyNeeded ? `, needs ${inr(g.monthlyNeeded)} a month for ${g.monthsLeft} months` : g.target_date ? '' : ', no date set'}`);
      return ok(`You have ${items.length} goal${items.length === 1 ? '' : 's'}, ${Math.round(c.goals.avgProgress)}% funded on average:\n${lineList(rows)}\nMonthly amounts ignore any return on the savings.`, 'Goals tracker (target, saved so far, date).', '/tracker/goals', 'Open goals');
    }

    case 'goal_sip': {
      const dated = c.goals.items.filter(g => g.monthlyNeeded);
      if (!c.goals.items.length) return need(tool, f, 'No goals are recorded. Add one with an amount and a date and I can show what it needs each month.', '/tracker/goals', 'Add a goal');
      if (!dated.length) return need(tool, f, 'None of your goals has a future date, so a monthly amount cannot be worked out. Add a target date to a goal.', '/tracker/goals', 'Open goals');
      const total = dated.reduce((s, g) => s + (g.monthlyNeeded as number), 0);
      const rows = dated.map(g => `${g.name}: ${inr(g.monthlyNeeded as number)} a month for ${g.monthsLeft} months`);
      return ok(`Your dated goals need ${inr(total)} a month in all, before any return on the savings:\n${lineList(rows)}${incomeMonthly(f) > 0 ? `\nThat is ${Math.round((total / incomeMonthly(f)) * 100)}% of your recorded monthly income.` : ''}`, 'Goals tracker (remaining amount divided by months left).', '/tracker/goals', 'Open goals');
    }

    case 'health_score': {
      const anything = netWorthKnown(f) || c.budget.income > 0 || c.budget.expense > 0 || c.emergency.fund > 0 || c.goals.items.length > 0;
      if (!anything) return need(tool, f, 'Nothing is recorded yet, so a health score would be meaningless. Add income, spending or assets first.', '/tracker/networth', 'Open net worth');
      const h = c.health;
      if (h.total == null || !h.tier) return need(tool, f, `Too little is recorded for a health score (it needs at least two of its seven areas). Not recorded yet: ${h.missing.join(', ')}.`, '/tracker/health', 'Open the health score');
      const rows = h.pillars.filter(p => p.hasData).map(p => `${p.name}: ${p.score} of ${p.max}`);
      const left = h.missing.length ? ` Left out because nothing is recorded: ${h.missing.join(', ')}.` : '';
      return ok(`Your financial health score is ${h.total} out of 100 (${h.tier.toLowerCase()}), worked out from ${h.measured.length} of 7 areas.\n${lineList(rows)}\nIt is built only from what you have recorded.${left}`, 'The health score on the dashboard (computed from your trackers).', '/dashboard', 'Open the dashboard');
    }

    case 'money_score': {
      const s = f.moneyScore;
      if (!s) return need(tool, f, 'You have not taken your Money Score on this phone yet. It takes about a minute.', '/tools/score', 'Take the Money Score');
      return ok(`Your Money Score is ${s.score} out of 100${s.band ? ` (${s.band})` : ''}.${s.weakestLabel ? ` Weakest area: ${s.weakestLabel}.` : ''}${s.topTitle ? ` Best next move: ${s.topTitle}.` : ''}`, `Money Score you saved${s.at ? ` on ${s.at.slice(0, 10)}` : ''}.`, '/tools/score', 'Open Money Score');
    }

    case 'budget': {
      const b = c.spending.budget;
      const limited = b.rows.filter(r => r.limit > 0);
      if (!limited.length && !(b.total.spent > 0)) return need(tool, f, 'No category limits are set and nothing is logged this month. Set limits in the Budget tracker and log spending in Transactions.', '/tracker/budget', 'Open budget');
      if (!limited.length) return ok(`No category limits are set. You have logged ${inr(b.total.spent)} so far this month. Set limits in the Budget tracker to see where you stand.`, `Transactions you logged for ${b.month}.`, '/tracker/budget', 'Open budget');
      const rows = limited.slice(0, 6).map(r => `${r.category}: ${inr(r.spent)} of ${inr(r.limit)} (${r.pct}%)${r.state === 'over' ? ', over' : r.state === 'warn' ? ', close' : ''}`);
      return ok(`Day ${b.day} of ${b.daysInMonth}. You have spent ${inr(b.total.spent)}${b.total.limit ? ` of the ${inr(b.total.limit)} you set across categories (${b.total.pct}%)` : ''}:\n${lineList(rows)}\nOnly spending you logged is counted.`, `Budget limits you set and transactions you logged for ${b.month}.`, '/tracker/budget', 'Open budget');
    }

    case 'spending_month': {
      const month = c.spending.month;
      const ms = monthSpend(f.data.transactions, month);
      if (!(ms.total > 0)) return need(tool, f, 'No spending is logged for this month yet. Log expenses in Transactions and I can total them.', '/tracker/transactions', 'Open transactions');
      const cats = Object.entries(ms.byCat).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, v]) => `${k} ${inr(v)}`).join(', ');
      return ok(`You have logged ${inr(ms.total)} of spending this month. Largest: ${cats}. Only what you logged is counted.`, `Transactions you logged for ${month}.`, '/tracker/transactions', 'Open transactions');
    }

    case 'subscriptions': {
      const s = f.subs;
      if (!s || (s.activeCount === 0 && s.trialCount === 0)) return need(tool, f, 'No subscriptions are recorded. Add them in the Subscription tracker and I can total what they cost.', '/tracker/subscriptions', 'Open subscriptions');
      const next = s.upcoming.slice(0, 3).map(u => `${u.name} ${ymdSlash(u.date)} (${inr(u.cost)})`).join(', ');
      return ok(`${s.activeCount} active subscription${s.activeCount === 1 ? '' : 's'} cost ${inr(s.monthly)} a month (${inr(s.annual)} a year)${s.pctOfIncome != null ? `, ${Math.round(s.pctOfIncome)}% of your recorded income` : ''}.${next ? ` Next renewals: ${next}.` : ''}`, 'Subscription tracker.', '/tracker/subscriptions', 'Open subscriptions');
    }

    case 'insurance': {
      const ps = f.data.policies;
      if (!ps.length) return need(tool, f, 'No insurance policy is recorded. If you have cover, add it in the Insurance tracker and I can compare it with the usual guides.', '/tracker/insurance', 'Open insurance');
      const income = incomeMonthly(f);
      const cov = computeCoverage(ps, income, ageOf(f) || null);
      const base = `You have ${ps.length} polic${ps.length === 1 ? 'y' : 'ies'} recorded: health cover ${cov.hasHealth ? inrShort(cov.totalHealth) : 'none'}, term life cover ${cov.hasTerm ? inrShort(cov.totalLife) : 'none'}, ${inr(cov.annualPremium)} a year in premiums.`;
      const guide = income > 0
        ? ` Against your recorded income the usual guides are ${inrShort(cov.recHealth)} for health (2x yearly income) and ${inrShort(cov.recLife)} for term life (15x). They are rules of thumb.`
        : ' Record your monthly income and I can compare this with the usual guides.';
      return ok(base + guide, 'Insurance tracker.', '/tracker/insurance', 'Open insurance');
    }

    case 'debt': {
      const total = c.netWorth.totalLiabilities;
      if (!(total > 0)) return need(tool, f, 'No loans or card dues are recorded. Add them in the Net Worth tracker or the Debt optimizer.', '/tools/debt', 'Open Debt optimizer');
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
      return ok(t, 'Net Worth tracker liabilities, with the rate and EMI you gave the Debt optimizer.', '/tools/debt', 'Open Debt optimizer');
    }

    case 'upcoming': {
      const days = Math.max(1, Math.min(365, Math.round(a.days ?? 30)));
      const today = isoDate(f.now), to = isoDate(new Date(f.now.getFullYear(), f.now.getMonth(), f.now.getDate() + days));
      const all = f.events.filter(e => e.date >= today && e.date <= to);
      const span = days === 1 ? 'today' : `in the next ${days} days`;
      if (!all.length) return ok(`Nothing is due ${span} from what is recorded (SIPs, FDs, policies, goals, subscriptions and tax dates).`, 'Financial calendar.', '/tools/calendar', 'Open calendar');
      const rows = all.slice(0, 6).map(e => `${ymdSlash(e.date)} ${e.title}${e.amount ? ` (${inr(e.amount)})` : ''}`);
      return ok(`Coming up ${span}:\n${lineList(rows)}${all.length > 6 ? `\n...and ${all.length - 6} more in the calendar.` : ''}`, 'Financial calendar: your SIPs, FDs, policies, goals, subscriptions and the statutory tax dates.', '/tools/calendar', 'Open calendar');
    }

    case 'alerts': {
      if (!f.alerts.length) return ok('Nothing needs your attention right now from your records.', 'Alert rules run on your trackers.', '/alerts', 'Open alerts');
      const rows = f.alerts.slice(0, 5).map(x => `${x.icon} ${x.title}: ${x.message}`);
      return ok(`${f.alerts.length} thing${f.alerts.length === 1 ? '' : 's'} came up:\n${lineList(rows)}`, 'Alert rules (lib/alerts) run on your trackers.', '/alerts', 'Open alerts');
    }

    case 'life_plan': {
      const events = ctx.events ?? [];
      if (!events.length) return need(tool, f, 'No life events are declared. Add one (a marriage, a child, a home, a job change) with a date and I can list what to check.', '/pulse/life', 'Open Life events');
      const s = suggestionsFor(events, f, f.now);
      if (!s.length) return ok('None of your declared events is raising a prompt today (each has a lead time before its date and a window after it).', 'Life events you declared and your trackers.', '/pulse/life', 'Open Life events');
      const rows = s.slice(0, 5).map(x => `${x.title}${x.because.length ? ` (because: ${x.because.join('; ')})` : ''}`);
      return ok(`Things to check for your life events:\n${lineList(rows)}`, 'Life events you declared and your trackers (fixed rules, no model).', '/pulse/life', 'Open Life events');
    }

    case 'trend': {
      const t = nwTrend(f.nwHistory);
      if (!t) return need(tool, f, `This phone has recorded ${f.nwHistory.length === 1 ? 'one net-worth value' : 'no net-worth values'} so far. It records one a day when you open PULSE, so a trend appears after you have opened it on two different days.`, '/pulse', 'Open PULSE');
      const move = `${inrShort(t.first.value)} on ${t.first.date} to ${inrShort(t.last.value)} on ${t.last.date}`;
      return ok(`Your recorded net worth went from ${move}: ${t.change >= 0 ? 'up' : 'down'} ${inrShort(Math.abs(t.change))}${t.changePct !== null ? ` (${t.changePct >= 0 ? '+' : ''}${t.changePct}%)` : ''} over ${t.spanDays} days, from ${t.points} point${t.points === 1 ? '' : 's'}.${t.perMonth !== null ? ` That is about ${inrShort(t.perMonth)} a month.` : ' The span is under two weeks, so no monthly rate is given.'}${t.direction ? ` The second half moved ${t.direction} than the first.` : ''} Market moves and edits to what you recorded both show up as change.`,
        'Net-worth values this phone recorded when you opened PULSE.', '/pulse', 'Open PULSE');
    }

    case 'retirement_odds': {
      const r = retirementOdds(f.retirementStore, f.now);
      if (!r.ok) return need(tool, f, `To estimate the chance your money lasts I need ${r.missing.join(', ')}. Enter ${r.missing.length === 1 ? 'it' : 'them'} in the Retirement planner. I will not use an age or spending figure you never gave.`, '/tools/retirement', 'Open the Retirement planner');
      return ok(`In ${r.pct}% of ${r.runs.toLocaleString('en-IN')} simulated futures your money lasts to the age you set. ${r.verdict.label}${r.depletionMedianAge ? ` In the runs that failed, the money ran out around age ${r.depletionMedianAge}.` : ''}\nAssumptions: ${r.assumptions}${r.assumed.length ? ` You have not set: ${r.assumed.join('; ')}.` : ''} An illustration, not a promise or advice.`,
        'Retirement planner inputs and the app\'s seeded Monte Carlo simulation (same engine as the planner screen).', '/tools/retirement', 'Open the Retirement planner');
    }

    case 'fire': {
      const exp = expenseMonthly(f);
      if (!(exp > 0)) return need(tool, f, 'Your monthly spending is not recorded, so a FIRE number cannot be worked out. Add it in the Budget tracker.', '/tracker/budget', 'Open budget');
      const corpus = exp * 12 * 25;
      const nw = netWorthKnown(f) ? c.netWorth.netWorth : null;
      return ok(`By the common 25x rule (a 4% yearly withdrawal), ${inr(exp)} a month of spending needs about ${inrShort(corpus)}.${nw !== null ? ` Your recorded net worth is ${inrShort(nw)}, which includes property and retirement accounts you cannot spend freely.` : ''} The rule ignores inflation, tax and how long you need the money; the Retirement planner uses your own ages and runs a simulation. A rule of thumb, not a plan.`,
        'Monthly spending in the Budget tracker, and the 25x rule of thumb.', '/tools/retirement', 'Open the Retirement planner');
    }

    case 'tax_estimate': {
      let income = a.income;
      let from = 'the income you asked about';
      const u: number | null = used80c(f);
      if (income === undefined) {
        const t = taxEstimate(f);
        if (!t) return need(tool, f, 'I need your annual income to estimate tax. Enter it on the Tax planner, or ask like this: "tax on 12 lakh income".', '/tools/taxplanner', 'Open Tax planner');
        income = t.income; from = 'the annual income on your Tax planner';
      }
      const b = bestRegime(Math.max(0, income - STD_NEW), Math.max(0, income - STD_OLD - (u ?? 0)));
      return ok(`On ${inr(income)} (${from}), as salary income with the standard deduction${u === null ? '' : ` and ₹${Math.round(u).toLocaleString('en-IN')} of 80C`}: new regime ${inr(b.taxNew)}, old regime ${inr(b.taxOld)}. The ${b.regime} regime is lower by ${inr(Math.abs(b.taxNew - b.taxOld))}. I do not know which regime you file under. HRA, home-loan interest, 80D and capital gains are not included; the Tax planner covers them. An estimate, not tax advice.`,
        'The shared tax core (FY 2025-26 slabs, 4% cess; surcharge above ₹50 lakh is not modelled).', '/tools/taxplanner', 'Open Tax planner');
    }

    case 'tax_80c': {
      const u = used80c(f);
      if (u === null) return need(tool, f, 'I do not know how much 80C you have used. Record it on the Tax planner (or the 80C field in the tracker).', '/tools/taxplanner', 'Open Tax planner');
      const room = Math.max(0, 150000 - u);
      return ok(`You have used ${inr(u)} of the ₹1,50,000 limit under Section 80C, so ${room > 0 ? `${inr(room)} is unused` : 'the limit is used up'}. 80C helps only in the old regime, and the last day for this financial year is 31 March.`, '80C used, as recorded on the Tax planner or the tracker; the ₹1.5 lakh limit.', '/tools/taxplanner', 'Open Tax planner');
    }

    case 'advance_tax': {
      const t = taxEstimate(f);
      if (!t) return need(tool, f, 'I need your annual income to estimate advance tax. Enter it on the Tax planner.', '/tools/taxplanner', 'Open Tax planner');
      const fy = fyOf(isoDate(f.now));
      const dates = taxDatesForFY(fy).filter(e => /^Advance Tax/.test(e.title));
      const pcts = [15, 45, 75, 100];
      const rows = dates.map((d, i) => `${ymdSlash(d.date)}: cumulative ${pcts[i]}% = ${inr((t.tax * pcts[i]) / 100)}`);
      return ok(`Your estimated tax is ${inr(t.tax)} (the ${t.best} regime is lower). Advance tax is due only if the tax left after TDS is ₹10,000 or more; salary TDS usually covers it. TDS is not recorded here, so these amounts are before any TDS:\n${lineList(rows)}\nAn estimate, not tax advice. Dates are the statutory defaults; verify on incometax.gov.in.`,
        'The shared tax core on the Tax planner income, and the statutory advance-tax dates.', '/tools/taxplanner', 'Open Tax planner');
    }

    case 'tax_dates': {
      const days = Math.max(1, Math.min(400, Math.round(a.days ?? 120)));
      const from = isoDate(f.now), to = isoDate(new Date(f.now.getFullYear(), f.now.getMonth(), f.now.getDate() + days));
      const list = taxDates(from, to).slice(0, 6);
      if (!list.length) return ok(`No statutory tax date falls in the next ${days} days.`, 'Statutory tax dates in the financial calendar.', '/tools/calendar', 'Open calendar');
      return ok(`Tax dates in the next ${days} days:\n${lineList(list.map(e => `${ymdSlash(e.date)} ${e.title}`))}\nThese are the statutory defaults; deadlines are sometimes extended, so verify on incometax.gov.in.`, 'Statutory tax dates built into the financial calendar.', '/tools/calendar', 'Open calendar');
    }

    case 'sip_calc': {
      const { amount, rate, years } = a;
      const missing = [amount === undefined && 'the monthly amount', rate === undefined && 'the expected return', years === undefined && 'how many years'].filter(Boolean);
      if (missing.length) return need(tool, f, `To work out a SIP I need ${missing.join(', ')}. For example: "SIP of 10000 at 12% for 15 years". I will not assume a return.`, '/tools/calc/sip', 'Open the SIP calculator');
      const rows = byId('sip')!.run({ monthly: amount, rate, time: years });
      return ok(`A SIP of ${inr(amount!)} a month at ${rate}% a year for ${years} years: ${calcLine(rows)}. This assumes a steady return, which real funds do not give; it is a scenario, not a forecast.`, 'The SIP calculator (same formula as the screen).', '/tools/calc/sip', 'Open the SIP calculator');
    }

    case 'emi_calc': {
      const { amount, rate, years } = a;
      const missing = [amount === undefined && 'the loan amount', rate === undefined && 'the interest rate', years === undefined && 'the tenure'].filter(Boolean);
      if (missing.length) return need(tool, f, `To work out an EMI I need ${missing.join(', ')}. For example: "EMI on 50 lakh at 8.5% for 20 years".`, '/tools/calc/emi', 'Open the EMI calculator');
      const rows = byId('emi')!.run({ loan: amount, rate, time: years });
      return ok(`A loan of ${inr(amount!)} at ${rate}% for ${years} years: ${calcLine(rows)}. Fees, insurance and a change in the rate are not included.`, 'The EMI calculator (same formula as the screen).', '/tools/calc/emi', 'Open the EMI calculator');
    }

    case 'fd_calc': {
      const { amount, rate, years } = a;
      const missing = [amount === undefined && 'the deposit', rate === undefined && 'the interest rate', years === undefined && 'how many years'].filter(Boolean);
      if (missing.length) return need(tool, f, `To work out an FD I need ${missing.join(', ')}. For example: "FD of 1 lakh at 7% for 5 years".`, '/tools/calc/fd', 'Open the FD calculator');
      const rows = byId('fd')!.run({ deposit: amount, rate, time: years });
      return ok(`An FD of ${inr(amount!)} at ${rate}% for ${years} years: ${calcLine(rows)}. Interest is taxable at your slab; the screen's note explains TDS.`, 'The FD calculator (same formula as the screen; quarterly compounding).', '/tools/calc/fd', 'Open the FD calculator');
    }

    case 'rd_calc': {
      const { amount, rate, years } = a;
      const missing = [amount === undefined && 'the monthly deposit', rate === undefined && 'the interest rate', years === undefined && 'how many years'].filter(Boolean);
      if (missing.length) return need(tool, f, `To work out an RD I need ${missing.join(', ')}. For example: "RD of 5000 at 7% for 3 years".`, '/tools/calc/rd', 'Open the RD calculator');
      const rows = byId('rd')!.run({ monthly: amount, rate, time: years });
      return ok(`An RD of ${inr(amount!)} a month at ${rate}% for ${years} years: ${calcLine(rows)}. Banks usually compound RDs quarterly, so the bank's figure can differ slightly.`, 'The RD calculator (same formula as the screen).', '/tools/calc/rd', 'Open the RD calculator');
    }

    case 'lumpsum_calc': {
      const { amount, rate, years } = a;
      const missing = [amount === undefined && 'the amount', rate === undefined && 'the expected return', years === undefined && 'how many years'].filter(Boolean);
      if (missing.length) return need(tool, f, `To work out a lump sum I need ${missing.join(', ')}. For example: "1 lakh at 10% for 8 years". I will not assume a return.`, '/tools/calc/lumpsum', 'Open the lump sum calculator');
      const rows = byId('lumpsum')!.run({ amount, rate, time: years });
      return ok(`${inr(amount!)} invested once at ${rate}% a year for ${years} years: ${calcLine(rows)}. A steady return is a scenario, not a forecast.`, 'The lump sum calculator (same formula as the screen).', '/tools/calc/lumpsum', 'Open the lump sum calculator');
    }

    case 'inflation_calc': {
      const { amount, rate, years } = a;
      const missing = [amount === undefined && 'the amount', rate === undefined && 'the inflation rate', years === undefined && 'how many years'].filter(Boolean);
      if (missing.length) return need(tool, f, `To work out inflation's effect I need ${missing.join(', ')}. For example: "1 lakh in 10 years at 6% inflation". I will not assume a rate.`, null, null);
      const later = amount! / Math.pow(1 + rate! / 100, years!);
      const needed = amount! * Math.pow(1 + rate! / 100, years!);
      return ok(`At ${rate}% inflation a year, ${inr(amount!)} today buys what ${inr(later)} buys in today's money after ${years} years; to keep the same buying power you would need ${inr(needed)} then. Inflation varies from year to year; this uses one steady rate.`, 'Compound arithmetic on the numbers in your question.', '/tools/calculators', 'Open the calculators');
    }

    case 'memory_show': {
      const mem = ctx.memory ?? [];
      if (!mem.length) return ok('I am not remembering anything about you right now. You can tell me something with "remember that ...", or add notes in What Arya remembers.', 'Notes and topics on this phone.', '/pulse/memory', 'Open What Arya remembers');
      const notes = mem.filter(m => m.kind !== 'topic'), topics = mem.filter(m => m.kind === 'topic');
      const rows = [...notes.slice(0, 5).map(m => `${m.text}${m.local ? ' (kept on this phone only)' : ''}`), ...topics.slice(0, 3).map(m => `Asked about ${m.text}`)];
      return ok(`I am remembering ${notes.length} note${notes.length === 1 ? '' : 's'} and ${topics.length} topic${topics.length === 1 ? '' : 's'}:\n${lineList(rows)}\nWhat Arya remembers shows which of these would be sent with a question, and lets you edit or delete them.`, 'Notes and topics on this phone.', '/pulse/memory', 'Open What Arya remembers');
    }

    case 'memory_forget':
      return ok('I do not delete notes from the chat, so a mis-heard "forget" can never wipe your notes. Open What Arya remembers to delete one note or all of them.', 'Nothing was changed.', '/pulse/memory', 'Open What Arya remembers');

    case 'open_screen':
      return ok(`Here is ${a.text || 'that screen'}.`, 'Nothing was read or changed.', a.screen ?? null, a.text ? `Open ${a.text}` : 'Open');

    default:
      return need(tool, f, 'I do not have a phone tool for that.', null, null);
  }
}

