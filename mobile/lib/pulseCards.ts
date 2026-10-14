// The PULSE feed on the phone: which of the website's PULSE sections the phone can show truthfully, and what each card says.
//
// The website's PULSE tab has 27 ranked widgets (js/arya-pulse-rank.js DEFAULT_ORDER). Many of them rest on defaults
// (age 30, retire at 60, 12% growth, a peer table, a 6% inflation slider). The phone shows a card only when every figure on it is
// something the person recorded or a plain sum of recorded figures; the rest are listed in SECTIONS with the reason.
//
// Pure: facts in, cards out. Every card carries `source` (where its numbers come from) so the screen can say so.
import { rank, snapshot, diff, DEFAULT_ORDER, type Ranked, type DiffLine, type Snapshot, type RankCtx } from '@/lib/pulseRank';
import {
  type ArFacts, inr, inrShort, incomeMonthly, expenseMonthly, ageOf, used80c, netWorthKnown, holdingsValue, taxEstimate,
} from '@/lib/aryaFacts';
import { DIMENSIONS } from '@/lib/dna';
import { computeCoverage } from '@/lib/retirement';
import { simulatePayoff, type DebtLoan } from '@/lib/debt';
import { monthSpend } from '@/lib/budget';

export type Tone = 'good' | 'warn' | 'bad' | 'neutral';
export interface PulseRow { label: string; value: string }
export interface PulseCard {
  id: string; icon: string; title: string;
  /** the one line that matters */
  headline: string;
  rows: PulseRow[];
  /** a caveat, an assumption or a "what this does not include" */
  note: string | null;
  /** where every number on the card comes from */
  source: string;
  tone: Tone;
  route: string | null; routeLabel: string | null;
}

/** "Not shown yet": the card exists but a figure it needs has not been recorded. Says exactly which. */
export interface Waiting { id: string; title: string; needs: string; route: string; routeLabel: string }

export type SectionStatus = 'ported' | 'not-ported';
export interface SectionInfo { id: string; web: string; status: SectionStatus; why: string }

/** All 27 ranked widgets of the website, what the phone does with each, and why. This table is the source for the notes. */
export const SECTIONS: SectionInfo[] = [
  { id: 'crossPageHUD', web: 'Cross-page HUD', status: 'ported', why: 'Card "Your money today": net worth, savings rate, emergency months, health score, only the ones recorded.' },
  { id: 'smartInsightCards', web: 'Smart insight cards', status: 'ported', why: 'Card "Worth acting on": the alerts (lib/alerts) and nudges (lib/nudges) that fire from recorded data.' },
  { id: 'moneyScore', web: 'Money Score', status: 'ported', why: 'Card from the saved score; an invitation when it has not been taken (that is the app\'s own feature, not data).' },
  { id: 'netWorthTimeline', web: 'Net worth timeline', status: 'not-ported', why: 'The phone keeps no net-worth history to plot (only the last value for the milestone alert). "Since your last visit" covers the change.' },
  { id: 'wealthFingerprint', web: 'Wealth fingerprint', status: 'not-ported', why: 'A radar of composite scores with invented weights and defaults (age 30); there is no recorded input behind most axes.' },
  { id: 'pageActivityMatrix', web: 'Page activity matrix', status: 'not-ported', why: 'Counts which website pages were visited. The phone does not track screen visits, and will not start only to fill a card.' },
  { id: 'behavioralDNA', web: 'Behavioural DNA', status: 'ported', why: 'Card with the five Financial DNA scores, only once the quiz is taken.' },
  { id: 'wealthChart', web: 'Wealth trajectory', status: 'not-ported', why: 'Draws 8%, 12% and 16% curves to an assumed retire age of 60. The Retirement planner screen does this with the person\'s own inputs.' },
  { id: 'goalCards', web: 'Goal cards', status: 'ported', why: 'Card from the Goals tracker: progress and the monthly amount each dated goal needs.' },
  { id: 'indiaFinCalendar', web: 'India financial calendar', status: 'ported', why: 'Card of what falls due in 30 days from the financial calendar (your SIPs, FDs, policies, goals, subscriptions, statutory tax dates).' },
  { id: 'portfolioStressTest', web: 'Portfolio stress test', status: 'ported', why: 'Card applying a 20/30/40% fall to the recorded stocks, funds and SIP value (the whole value: the equity share is not known).' },
  { id: 'compoundRace', web: 'Compound race', status: 'not-ported', why: 'A "start now vs start later" story built on assumed returns and the default age. The SIP calculators answer it with chosen inputs.' },
  { id: 'savingsRateMeter', web: 'Savings rate meter', status: 'ported', why: 'Card from recorded income and spending, with the 20% guide the ranker itself uses.' },
  { id: 'taxDashboard', web: 'Tax dashboard', status: 'ported', why: 'Card from the shared tax core when an annual income is on the Tax planner; says it is salary-only.' },
  { id: 'debtFreedomPlanner', web: 'Debt freedom planner', status: 'ported', why: 'Card from the loans recorded in the Debt optimizer; payoff time only when every loan has balance, rate and EMI.' },
  { id: 'scenarioLab', web: 'Scenario lab', status: 'not-ported', why: 'Sliders over assumed rates; the calculators hub is the phone\'s scenario tool.' },
  { id: 'inflationEroder', web: 'Inflation eroder', status: 'not-ported', why: 'A slider toy with a ₹1 lakh default and a 6% rate; the inflation calculator in the hub does it with chosen inputs.' },
  { id: 'monteCarlo', web: 'Monte Carlo', status: 'not-ported', why: 'Needs age, retire age and a corpus target; the Retirement planner runs the seeded simulation with the person\'s own values.' },
  { id: 'timeMachine', web: 'Time machine', status: 'not-ported', why: 'Replays an assumed past return series; no recorded input.' },
  { id: 'peerBenchmark', web: 'Peer benchmark', status: 'not-ported', why: 'Compares with a hard-coded peer table (estimated survey figures); not the person\'s data and not verifiable.' },
  { id: 'transactionAnalyzer', web: 'Transaction analyzer', status: 'ported', why: 'Card from transactions logged this month: total and the biggest categories.' },
  { id: 'wealthXRay', web: 'Wealth X-ray', status: 'ported', why: 'Card of where recorded assets sit, from the Net Worth tracker.' },
  { id: 'taxOptimizer', web: 'Tax optimizer', status: 'ported', why: 'Card for the 80C room, only when the 80C already used is recorded.' },
  { id: 'insuranceGap', web: 'Insurance gap', status: 'ported', why: 'Card from the Insurance tracker against the 2x / 15x income guides (the same coverage rule as the tracker).' },
  { id: 'wealthVelocity', web: 'Wealth velocity', status: 'not-ported', why: 'Needs a net-worth history, which the phone does not keep.' },
  { id: 'goalProbabilityMatrix', web: 'Goal probability matrix', status: 'not-ported', why: 'Probabilities need a return model and a volatility assumption; the Goals card shows the monthly amount needed instead.' },
  { id: 'newsWidget', web: 'News widget', status: 'not-ported', why: 'Headlines are live and online-only; the Markets tab already has them. The ranker puts it last anyway.' },
];

/* ── ranking context ────────────────────────────────────────────────────────────────────────────────────── */

/** The values the website passes to AryaPulseRank.rank(), from the phone's facts. Unknown stays 0 / null (the rules treat 0 as "not there"). */
export function pulseCtx(f: ArFacts): RankCtx & { month: number } {
  const u = used80c(f);
  return {
    month: f.now.getMonth() + 1,
    income: incomeMonthly(f),
    expense: expenseMonthly(f),
    debt: f.computed.netWorth.totalLiabilities,
    emergencyFund: f.data.emergencyFund,
    sip: f.data.monthlySip,
    goals: f.data.goals.length,
    policies: f.data.policies.length,
    holdings: holdingsValue(f),
    txns: f.data.transactions.length,
    netWorth: netWorthKnown(f) ? f.computed.netWorth.netWorth : 0,
    gap80c: u === null ? 0 : Math.max(0, 150000 - u),
    age: ageOf(f),
    moneyScore: f.moneyScore ? f.moneyScore.score : null,
  };
}

/* ── the cards ──────────────────────────────────────────────────────────────────────────────────────────── */

type Built = PulseCard | Waiting | null;
const days = (a: string, b: string) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const wait = (id: string, title: string, needs: string, route: string, routeLabel: string): Waiting => ({ id, title, needs, route, routeLabel });

function hud(f: ArFacts): Built {
  const rows: PulseRow[] = [];
  const c = f.computed;
  if (netWorthKnown(f)) rows.push({ label: 'Net worth', value: inrShort(c.netWorth.netWorth) });
  if (c.budget.known) rows.push({ label: 'Savings rate', value: `${c.budget.savingsRate}% of income` });
  if (c.emergency.monthlyExpense > 0 && c.emergency.fund > 0) rows.push({ label: 'Emergency fund', value: `${c.emergency.covered.toFixed(1)} months of spending` });
  // the health score needs something recorded behind it: an empty phone must not open with "8 out of 100"
  const anything = netWorthKnown(f) || c.budget.income > 0 || c.budget.expense > 0 || c.emergency.fund > 0 || c.goals.items.length > 0;
  if (anything && c.health.pillars.some(p => !p.untracked)) rows.push({ label: 'Health score', value: `${c.health.total} out of 100` });
  if (!rows.length) return wait('crossPageHUD', 'Your money today', 'Record income and spending, or add assets, to see the basics here.', '/tracker/networth', 'Net worth tracker');
  return { id: 'crossPageHUD', icon: '🧭', title: 'Your money today', headline: `Where you stand: ${rows.length} figure${rows.length === 1 ? '' : 's'} from your records`, rows,
    note: null, source: 'Net worth, Budget and Emergency fund trackers (only what you have recorded).', tone: 'neutral', route: '/tracker/networth', routeLabel: 'Open net worth' };
}

function insights(f: ArFacts): Built {
  const rows: PulseRow[] = [];
  f.alerts.slice(0, 3).forEach(a => rows.push({ label: `${a.icon} ${a.title}`, value: a.message }));
  // the Money Score nudge is the Money Score card's job
  f.nudges.filter(n => n.route !== '/tools/score').slice(0, 2).forEach(n => rows.push({ label: `${n.icon} ${n.title}`, value: n.body }));
  if (!rows.length) return null;
  const crit = f.alerts.some(a => a.priority === 'critical');
  return { id: 'smartInsightCards', icon: '💡', title: 'Worth acting on', headline: `${rows.length} thing${rows.length === 1 ? '' : 's'} came up from your own records`, rows, note: null,
    source: 'Alert rules (lib/alerts) and nudges (lib/nudges), run on your trackers today.', tone: crit ? 'bad' : 'warn', route: f.alerts[0]?.route ?? f.nudges[0]?.route ?? null, routeLabel: f.alerts[0]?.action ?? f.nudges[0]?.action ?? null };
}

function score(f: ArFacts): Built {
  const m = f.moneyScore;
  if (!m) return { id: 'moneyScore', icon: '🎯', title: 'Money Score', headline: 'Not taken yet', rows: [], note: 'It takes about a minute and uses what the app already holds.',
    source: 'Money Score screen (no score saved on this phone).', tone: 'neutral', route: '/tools/score', routeLabel: 'Take it now' };
  const rows: PulseRow[] = [];
  if (m.weakestLabel) rows.push({ label: 'Weakest area', value: `${m.weakestLabel}${m.weakestScore != null ? ` (${Math.round(m.weakestScore)})` : ''}` });
  if (m.topTitle) rows.push({ label: 'Best next move', value: m.topTitle });
  const prev = f.scoreHistory.length >= 2 ? f.scoreHistory[f.scoreHistory.length - 2] : null;
  if (prev && prev.score !== m.score) rows.push({ label: 'Last time', value: `${prev.score} on ${prev.date}` });
  return { id: 'moneyScore', icon: '🎯', title: 'Money Score', headline: `${m.score} out of 100${m.band ? ` · ${m.band}` : ''}`, rows, note: null,
    source: `Money Score you saved${m.at ? ` on ${m.at.slice(0, 10)}` : ''}.`, tone: m.score >= 70 ? 'good' : m.score >= 50 ? 'warn' : 'bad', route: m.topHref || '/tools/score', routeLabel: 'Open Money Score' };
}

function dna(f: ArFacts): Built {
  const s = f.data.dna;
  if (!s || s.length < 5) return null;
  const rows = DIMENSIONS.map((d, i) => ({ label: d, value: String(Math.round(s[i])) }));
  const top = rows.slice().sort((a, b) => +b.value - +a.value)[0];
  return { id: 'behavioralDNA', icon: '🧬', title: 'Financial DNA', headline: `Strongest: ${top.label} (${top.value})`, rows, note: 'Scores run 0 to 100 from your quiz answers; they describe habits, not a verdict.',
    source: 'Your Financial DNA quiz answers.', tone: 'neutral', route: '/tools/dna', routeLabel: 'Open the quiz' };
}

function goals(f: ArFacts): Built {
  const items = f.computed.goals.items;
  if (!items.length) return wait('goalCards', 'Goals', 'Add a goal with an amount and a date.', '/tracker/goals', 'Add a goal');
  const rows = items.slice(0, 4).map(g => ({ label: g.name, value: `${Math.round(g.progress)}% of ${inrShort(g.target)}${g.monthlyNeeded ? ` · needs ${inrShort(g.monthlyNeeded)} a month` : g.target_date ? '' : ' · no date set'}` }));
  return { id: 'goalCards', icon: '🎯', title: 'Goals', headline: `${items.length} goal${items.length === 1 ? '' : 's'} · average ${Math.round(f.computed.goals.avgProgress)}% funded`, rows,
    note: 'Monthly amounts ignore any return on the savings, so they are the safe side of the real need.', source: 'Goals tracker (target, saved so far, target date).', tone: 'neutral', route: '/tracker/goals', routeLabel: 'Open goals' };
}

function calendar(f: ArFacts): Built {
  const today = iso(f.now), to = iso(new Date(f.now.getFullYear(), f.now.getMonth(), f.now.getDate() + 30));
  const list = f.events.filter(e => e.date >= today && e.date <= to).slice(0, 5);
  if (!list.length) return null;
  const rows = list.map(e => { const d = days(today, e.date); return { label: e.title, value: `${d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`}${e.amount ? ` · ${inr(e.amount)}` : ''}` }; });
  return { id: 'indiaFinCalendar', icon: '📅', title: 'Coming up in 30 days', headline: `${list.length} dated item${list.length === 1 ? '' : 's'}${f.events.filter(e => e.date >= today && e.date <= to).length > 5 ? ' (first 5 shown)' : ''}`, rows,
    note: null, source: 'Financial calendar: your SIPs, FDs, policies, goals, subscriptions and the statutory tax dates.', tone: 'neutral', route: '/tools/calendar', routeLabel: 'Open calendar' };
}

function stress(f: ArFacts): Built {
  const v = holdingsValue(f);
  if (!(v > 0)) return null;
  const rows = [20, 30, 40].map(p => ({ label: `If it falls ${p}%`, value: `${inrShort(v * p / 100)} lower, ${inrShort(v * (1 - p / 100))} left` }));
  return { id: 'portfolioStressTest', icon: '🌪️', title: 'If markets fall', headline: `${inrShort(v)} in stocks, funds and SIPs`, rows,
    note: 'A plain percentage on the whole value. Debt funds and FDs fall less, small caps more; this is a scale, not a forecast.',
    source: 'Portfolio tab + imported mutual funds + SIP value on the Net Worth tracker.', tone: 'neutral', route: '/tracker/networth', routeLabel: 'Open net worth' };
}

function savings(f: ArFacts): Built {
  const b = f.computed.budget;
  if (!b.known) return wait('savingsRateMeter', 'Savings rate', 'Record both monthly income and monthly spending.', '/tracker/budget', 'Open budget');
  const rows: PulseRow[] = [
    { label: 'Income', value: `${inr(b.income)} a month` }, { label: 'Spending', value: `${inr(b.expense)} a month` },
    { label: b.saving >= 0 ? 'Left over' : 'Short by', value: `${inr(Math.abs(b.saving))} a month` },
  ];
  if (f.data.monthlySip > 0) rows.push({ label: 'SIPs', value: `${inr(f.data.monthlySip)} a month (${Math.round((f.data.monthlySip / b.income) * 100)}% of income)` });
  return { id: 'savingsRateMeter', icon: '💾', title: 'Savings rate', headline: `${b.savingsRate}% of income`, rows,
    note: 'About 20% or more is the usual guide. It is a rule of thumb; your own goals set the real number.',
    source: 'Income and spending you recorded in the Budget tracker.', tone: b.savingsRate >= 20 ? 'good' : b.savingsRate >= 0 ? 'warn' : 'bad', route: '/tracker/budget', routeLabel: 'Open budget' };
}

function tax(f: ArFacts): Built {
  const t = taxEstimate(f);
  if (!t) return wait('taxDashboard', 'Income tax', 'Enter your annual income on the Tax planner.', '/tools/taxplanner', 'Open Tax planner');
  const rows: PulseRow[] = [
    { label: 'New regime', value: inr(t.taxNew) }, { label: `Old regime${t.used80c === null ? ' (no 80C counted)' : ` (80C ${inr(t.used80c)})`}`, value: inr(t.taxOld) },
  ];
  return { id: 'taxDashboard', icon: '🧾', title: 'Income tax estimate', headline: `${inr(t.tax)} on ${inrShort(t.income)} (${t.best} regime is lower)`, rows,
    note: 'Salary income with the standard deduction and the recorded 80C only. HRA, home-loan interest, 80D, NPS and capital gains are on the Tax planner. Estimate, not advice.',
    source: 'Annual income on the Tax planner, 80C used, and the shared tax core (FY 2025-26 slabs).', tone: 'neutral', route: '/tools/taxplanner', routeLabel: 'Open Tax planner' };
}

function debt(f: ArFacts): Built {
  const total = f.computed.netWorth.totalLiabilities;
  if (!(total > 0)) return null;
  const rows: PulseRow[] = [{ label: 'Total owed', value: inr(total) }];
  const emi = f.loans.reduce((s, l) => s + l.emi, 0);
  const income = incomeMonthly(f);
  if (emi > 0) rows.push({ label: 'EMIs a month', value: `${inr(emi)}${income > 0 ? ` (${Math.round((emi / income) * 100)}% of income)` : ''}` });
  let note: string | null = 'The Debt optimizer needs each loan\'s rate and EMI to show a payoff order.';
  const complete = f.loans.length > 0 && f.loans.every(l => l.balance > 0 && l.rate > 0 && l.emi > 0);
  if (complete) {
    const ls: DebtLoan[] = f.loans.map(l => ({ key: l.key, label: l.label, balance: l.balance, rate: l.rate, emi: l.emi }));
    const r = simulatePayoff(ls, 0, 'avalanche');
    if (r.paidOff) {
      rows.push({ label: 'Highest rate first', value: ls.slice().sort((a, b) => b.rate - a.rate).map(l => `${l.label} ${l.rate}%`).join(', ') });
      rows.push({ label: 'Debt-free in', value: `${Math.floor(r.months / 12)} years ${r.months % 12} months at today\'s EMIs` });
      rows.push({ label: 'Interest still to pay', value: inr(r.totalInterest) });
      note = 'Worked out with the EMIs and rates you entered, with freed EMIs rolled onto the next loan.';
    }
  }
  const heavy = income > 0 && total / (income * 12) > 0.3;
  return { id: 'debtFreedomPlanner', icon: '⛓️', title: 'Debt', headline: heavy ? `${inr(total)} is over 30% of a year's income` : `${inr(total)} outstanding`, rows, note,
    source: 'Liabilities on the Net Worth tracker, with the rate and EMI you gave the Debt optimizer.', tone: heavy ? 'warn' : 'neutral', route: '/tools/debt', routeLabel: 'Open Debt optimizer' };
}

function txns(f: ArFacts): Built {
  const month = f.computed.spending.month;
  const m = monthSpend(f.data.transactions, month);
  const cats = Object.entries(m.byCat).sort((a, b) => b[1] - a[1]);
  if (!(m.total > 0)) return null;
  const rows = cats.slice(0, 4).map(([c, v]) => ({ label: c, value: `${inr(v)} (${Math.round((v / m.total) * 100)}%)` }));
  return { id: 'transactionAnalyzer', icon: '🧮', title: 'Where it went this month', headline: `${inr(m.total)} spent so far`, rows, note: 'Only what you logged: unlogged spending is not in this.',
    source: `Transactions you logged for ${month}.`, tone: 'neutral', route: '/tracker/transactions', routeLabel: 'Open transactions' };
}

function xray(f: ArFacts): Built {
  const nw = f.computed.netWorth;
  if (!(nw.totalAssets > 0)) return null;
  const rows = nw.assets.slice().sort((a, b) => b.value - a.value).slice(0, 5).map(a => ({ label: a.label, value: `${inrShort(a.value)} (${Math.round(a.pct)}%)` }));
  return { id: 'wealthXRay', icon: '🔬', title: 'Where your assets sit', headline: `${inrShort(nw.totalAssets)} in ${nw.assets.length} place${nw.assets.length === 1 ? '' : 's'}`, rows,
    note: 'Only assets you recorded. EPF, NPS and PPF are counted here as on the Net Worth screen.', source: 'Net Worth tracker (assets).', tone: 'neutral', route: '/tracker/networth', routeLabel: 'Open net worth' };
}

function opt80c(f: ArFacts): Built {
  const u = used80c(f);
  if (u === null) return wait('taxOptimizer', '80C room', 'Record how much 80C you have already used (Tax planner or the 80C field).', '/tools/taxplanner', 'Open Tax planner');
  const room = Math.max(0, 150000 - u);
  return { id: 'taxOptimizer', icon: '🏦', title: '80C room', headline: room > 0 ? `${inr(room)} of the ₹1,50,000 limit is unused` : 'The ₹1,50,000 limit is used up',
    rows: [{ label: 'Used so far', value: inr(u) }, { label: 'Room left', value: inr(room) }],
    note: '80C helps only in the old regime. The deadline for this financial year is 31 March.', source: '80C used, as recorded on the Tax planner or the tracker.', tone: room > 0 ? 'warn' : 'good', route: '/tools/tax', routeLabel: 'Tax savings' };
}

function insurance(f: ArFacts): Built {
  const ps = f.data.policies;
  const income = incomeMonthly(f);
  // With no policy and no income there is nothing to compare, so no card (an empty phone should not open with a warning).
  if (!ps.length && !(income > 0)) return null;
  if (!ps.length) return { id: 'insuranceGap', icon: '🛡️', title: 'Insurance', headline: 'No policy is recorded', rows: [], note: 'This means none is recorded here. If you have cover, add it so the gaps can be worked out.',
    source: 'Insurance tracker (no policies recorded).', tone: 'warn', route: '/tracker/insurance', routeLabel: 'Open insurance' };
  const cov = computeCoverage(ps, income, ageOf(f) || 30);
  const rows: PulseRow[] = [
    { label: 'Health cover', value: cov.hasHealth ? inrShort(cov.totalHealth) : 'None recorded' },
    { label: 'Term life cover', value: cov.hasTerm ? inrShort(cov.totalLife) : 'None recorded' },
  ];
  let note: string | null = 'Record your monthly income to compare cover with the usual guides (2x income for health, 15x for term).';
  let tone: Tone = 'neutral';
  if (income > 0) {
    rows[0].value += ` of ${inrShort(cov.recHealth)} guide`;
    rows[1].value += ` of ${inrShort(cov.recLife)} guide`;
    note = 'Guides are rules of thumb on your recorded income, not a requirement.';
    tone = (!cov.hasHealth || !cov.hasTerm) ? 'warn' : cov.totalHealth < cov.recHealth || cov.totalLife < cov.recLife ? 'warn' : 'good';
  }
  const gaps = income > 0 ? cov.gaps.filter(g => g.severity === 'critical' || g.severity === 'high').length : 0;
  return { id: 'insuranceGap', icon: '🛡️', title: 'Insurance', headline: gaps ? `${gaps} gap${gaps === 1 ? '' : 's'} against the usual guides` : `${ps.length} polic${ps.length === 1 ? 'y' : 'ies'} recorded`, rows, note,
    source: 'Insurance tracker, with the same cover guides the tracker uses.', tone, route: '/tracker/insurance', routeLabel: 'Open insurance' };
}

const BUILDERS: Record<string, (f: ArFacts) => Built> = {
  crossPageHUD: hud, smartInsightCards: insights, moneyScore: score, behavioralDNA: dna, goalCards: goals, indiaFinCalendar: calendar,
  portfolioStressTest: stress, savingsRateMeter: savings, taxDashboard: tax, debtFreedomPlanner: debt, transactionAnalyzer: txns,
  wealthXRay: xray, taxOptimizer: opt80c, insuranceGap: insurance,
};
export const PORTED_IDS = Object.keys(BUILDERS);

export interface Feed {
  cards: (PulseCard & { reason: string | null; score: number })[];
  waiting: Waiting[];
  since: DiffLine[];
  snapshot: Snapshot;
  ranked: Ranked[];
}

/** The ranked feed. `prev` is the snapshot saved at the last visit (or null). Only ported sections with real inputs become cards. */
export function buildFeed(f: ArFacts, prev: Snapshot | null | undefined, nowMs: number = f.now.getTime()): Feed {
  const ctx = pulseCtx(f);
  const ranked = rank(ctx, f.now);
  // The website's snapshot calls a missing spend a 100% savings rate; here a rate exists only when income AND spending are recorded.
  const snap = snapshot(f.computed.budget.known ? ctx : { ...ctx, income: 0 }, nowMs);
  const cards: Feed['cards'] = [];
  const waiting: Waiting[] = [];
  let reasons = 0;
  for (const r of ranked) {
    const b = BUILDERS[r.id];
    if (!b) continue;
    const built = b(f);
    if (!built) continue;
    if ('needs' in built) { waiting.push(built); continue; }
    // as on the website: the top three reasons are shown, in rank order
    const reason = r.reason && reasons < 3 ? r.reason : null;
    if (reason) reasons++;
    cards.push({ ...built, reason, score: r.score });
  }
  return { cards, waiting, since: diff(prev, snap), snapshot: snap, ranked };
}

export { DEFAULT_ORDER };
