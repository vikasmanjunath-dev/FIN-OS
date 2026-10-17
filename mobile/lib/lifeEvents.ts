// Life events: things you tell Arya happened (or are about to), and the prompts they raise. Pure rules, no model.
//
// Two different things share the name "life events" on the website:
//   js/arya-life-events.js   watches the data for a change (salary credited, market fall, goal near its date ...) and speaks up.
//                            On the phone those triggers are lib/alerts.ts (emergency fund, goals behind, budget, tax dates,
//                            net-worth milestone) and lib/nudges.ts. Nothing is repeated here.
//   the "Life Event Advisor" in js/arya-sidebar-panel.js: six buttons (marriage, first child, home, job change, windfall,
//                            education) that send a canned prompt to the model and get a long essay back, with amounts
//                            the model made up. This file is the phone's version: you declare the event and the date, and
//                            fixed rules turn what you have RECORDED into specific, checkable prompts. A rule that needs a
//                            figure you have not recorded does not fire with a guess; it says what to record.
//
// An event has a lead time (how long before the date it starts to matter) and a window (how long after). Outside that range it is
// listed but raises nothing, so a wedding from six years ago does not keep prompting.
import { computeCoverage } from '@/lib/retirement';
import { computeGoals } from '@/lib/trackers';
import { type ArFacts, inr, incomeMonthly } from '@/lib/aryaFacts';
import { isoDate } from '@/lib/calendar';

export const EVENT_TYPES = ['marriage', 'child', 'home', 'job_change', 'windfall', 'education', 'job_loss'] as const;
export type LifeEventType = typeof EVENT_TYPES[number];

export interface LifeEventDef {
  type: LifeEventType; label: string; icon: string;
  /** what the date means, shown beside the date field */
  dateHint: string;
  leadMonths: number; windowMonths: number;
}

export const DEFS: Record<LifeEventType, LifeEventDef> = {
  marriage:   { type: 'marriage',   label: 'Marriage',            icon: '💍', dateHint: 'The wedding date, or when you expect it', leadMonths: 6,  windowMonths: 24 },
  child:      { type: 'child',      label: 'A child',             icon: '👶', dateHint: 'Birth date, or the due date', leadMonths: 9,  windowMonths: 24 },
  home:       { type: 'home',       label: 'Buying a home',       icon: '🏠', dateHint: 'When you expect to buy or take possession', leadMonths: 12, windowMonths: 36 },
  job_change: { type: 'job_change', label: 'Changing jobs',       icon: '💼', dateHint: 'Your joining date at the new job', leadMonths: 1,  windowMonths: 6 },
  windfall:   { type: 'windfall',   label: 'A windfall or bonus', icon: '💰', dateHint: 'When the money arrives or arrived', leadMonths: 1,  windowMonths: 3 },
  education:  { type: 'education',  label: 'Education',           icon: '🎓', dateHint: 'When the course or the fees start', leadMonths: 24, windowMonths: 12 },
  job_loss:   { type: 'job_loss',   label: 'Loss of income',      icon: '🧭', dateHint: 'When your income stopped or will stop', leadMonths: 0,  windowMonths: 6 },
};

export interface DeclaredEvent { id: string; type: LifeEventType; /** YYYY-MM-DD, or YYYY-MM (treated as the 1st) */ date: string; createdAt: number }

const isType = (t: unknown): t is LifeEventType => typeof t === 'string' && (EVENT_TYPES as readonly string[]).includes(t);
const DATE_RE = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/;

/** A real calendar date between 1990 and 2100, as YYYY-MM-DD ("2026-03" becomes the 1st), or null. */
export function cleanDate(s: unknown): string | null {
  const m = DATE_RE.exec(String(s ?? '').trim());
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = m[3] ? +m[3] : 1;
  if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1) return null;
  const t = new Date(y, mo - 1, d);
  if (t.getFullYear() !== y || t.getMonth() !== mo - 1 || t.getDate() !== d) return null;
  return `${m[1]}-${m[2]}-${String(d).padStart(2, '0')}`;
}

let seq = 0;
const newId = (now: number) => `e${now.toString(36)}${(++seq).toString(36)}`;

export const MAX_EVENTS = 20;

export function normaliseEvents(raw: unknown, now: number = Date.now()): DeclaredEvent[] {
  let list: unknown = raw;
  if (typeof raw === 'string') { try { list = JSON.parse(raw); } catch { return []; } }
  if (!Array.isArray(list)) return [];
  const out: DeclaredEvent[] = [];
  const ids = new Set<string>();
  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const date = cleanDate(o.date);
    if (!isType(o.type) || !date) continue;
    let id = typeof o.id === 'string' && o.id ? o.id : newId(now);
    if (ids.has(id)) id = newId(now);
    ids.add(id);
    out.push({ id, type: o.type, date, createdAt: typeof o.createdAt === 'number' && Number.isFinite(o.createdAt) ? o.createdAt : now });
    if (out.length >= MAX_EVENTS) break;
  }
  return out;
}

export function addEvent(list: DeclaredEvent[], type: string, date: string, now: number = Date.now()): { list: DeclaredEvent[]; event: DeclaredEvent | null; error?: string } {
  if (!isType(type)) return { list, event: null, error: 'Pick what happened.' };
  const d = cleanDate(date);
  if (!d) return { list, event: null, error: 'Enter the date as YYYY-MM-DD (or YYYY-MM).' };
  if (list.some(e => e.type === type && e.date === d)) return { list, event: null, error: 'That event is already there.' };
  if (list.length >= MAX_EVENTS) return { list, event: null, error: `You can keep up to ${MAX_EVENTS} events. Delete one first.` };
  const event: DeclaredEvent = { id: newId(now), type, date: d, createdAt: now };
  return { list: [...list, event].sort((a, b) => b.date.localeCompare(a.date)), event };
}
export const removeEvent = (list: DeclaredEvent[], id: string) => list.filter(e => e.id !== id);

export type Phase = 'later' | 'active' | 'past';

const addMonths = (iso: string, n: number) => { const [y, m, d] = iso.split('-').map(Number); const t = new Date(y, m - 1 + n, d); return t.getTime(); };

/** later: the date is further away than the lead time; active: raising prompts; past: beyond the window. */
export function phaseOf(ev: DeclaredEvent, now: Date): Phase {
  const def = DEFS[ev.type];
  const t = now.getTime();
  if (t < addMonths(ev.date, -def.leadMonths)) return 'later';
  if (t > addMonths(ev.date, def.windowMonths)) return 'past';
  return 'active';
}

export interface Suggestion {
  id: string;
  type: LifeEventType;
  kind: 'goal' | 'insurance' | 'emergency' | 'tax' | 'paperwork' | 'budget' | 'debt' | 'tool';
  title: string;
  body: string;
  route: string;
  routeLabel: string;
  /** The recorded facts this prompt rests on, shown to the person ("because ..."). */
  because: string[];
}

const GOAL_EDU = /education|school|college|study|studies|tuition|child|kid|baby/i;
const GOAL_HOME = /home|house|flat|apartment|property|down ?payment/i;

function emergencyLine(f: ArFacts) {
  const e = f.computed.emergency;
  return e.monthlyExpense > 0 ? e : null;
}

/** The prompts the declared events raise today, most important first, at most `perEvent` for each event. Only active events count. */
export function suggestionsFor(events: DeclaredEvent[], f: ArFacts, now: Date = f.now, perEvent = 3): Suggestion[] {
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  const push = (s: Suggestion) => { if (!seen.has(s.id)) { seen.add(s.id); out.push(s); } };

  const income = incomeMonthly(f);
  const cov = income > 0 ? computeCoverage(f.data.policies, income, null) : null;
  const hasHealth = f.data.policies.some(p => p.type === 'health');
  const hasTerm = f.data.policies.some(p => p.type === 'life_term');
  const em = emergencyLine(f);
  const goals = computeGoals(f.data.goals, now).items;
  const emiTotal = [f.loans.find(l => l.key === 'home'), f.loans.find(l => l.key === 'car'), f.loans.find(l => l.key === 'personal')].reduce((s, l) => s + (l ? l.emi : 0), 0);

  const termLine = (type: LifeEventType, reason: string) => {
    if (!hasTerm) {
      push({ id: `${type}:term-missing`, type, kind: 'insurance', title: 'No term life cover is recorded', route: '/tracker/insurance', routeLabel: 'Open insurance',
        body: `${reason} A pure term policy is the usual way to protect them. Record yours in the insurance tracker if you have one.`, because: ['No life_term policy in your insurance tracker'] });
    } else if (cov && cov.totalLife < cov.recLife) {
      push({ id: `${type}:term-low`, type, kind: 'insurance', title: 'Your term cover is below the usual guide', route: '/tracker/insurance', routeLabel: 'Open insurance',
        body: `You have ${inr(cov.totalLife)} of term cover recorded. The common guide is about 15 times yearly income, which is ${inr(cov.recLife)} for you. It is a guide, not a requirement.`,
        because: [`Term cover recorded: ${inr(cov.totalLife)}`, `Monthly income recorded: ${inr(income)}`] });
    }
  };
  const emergencyLineFor = (type: LifeEventType, why: string) => {
    if (em && em.covered < 6) {
      push({ id: `${type}:emergency`, type, kind: 'emergency', title: `Emergency fund covers ${em.covered.toFixed(1)} months`, route: '/tracker/emergency', routeLabel: 'Open emergency fund',
        body: `${why} Your fund covers ${em.covered.toFixed(1)} months of spending. Reaching ${em.target} months needs another ${inr(em.shortfall)}.`,
        because: [`Emergency fund recorded: ${inr(em.fund)}`, `Monthly spending recorded: ${inr(em.monthlyExpense)}`] });
    } else if (!em) {
      push({ id: `${type}:emergency-unknown`, type, kind: 'emergency', title: 'Emergency fund cannot be measured yet', route: '/tracker/emergency', routeLabel: 'Record it',
        body: 'Record your monthly spending and your emergency fund so Arya can say how many months it covers.', because: ['Monthly spending or emergency fund not recorded'] });
    }
  };

  for (const ev of events) {
    if (phaseOf(ev, now) !== 'active') continue;
    const t = ev.type;
    const before = out.length;

    if (t === 'child') {
      if (!hasHealth) push({ id: 'child:health-missing', type: t, kind: 'insurance', title: 'No health policy is recorded', route: '/tracker/insurance', routeLabel: 'Open insurance',
        body: 'A hospital stay for the birth, and for a newborn, is one of the biggest sudden costs. Record your health policy, or look at one that fits a family.', because: ['No health policy in your insurance tracker'] });
      else push({ id: 'child:health-add', type: t, kind: 'insurance', title: 'Ask your insurer how to add the baby', route: '/tracker/insurance', routeLabel: 'Open insurance',
        body: `You have ${f.data.policies.filter(p => p.type === 'health').length} health ${f.data.policies.filter(p => p.type === 'health').length === 1 ? 'policy' : 'policies'} recorded. Each insurer has its own rules and time limits for adding a new member.`,
        because: ['A health policy is recorded'] });
      termLine(t, 'Someone now depends on your income.');
      if (!goals.some(g => GOAL_EDU.test(g.name))) push({ id: 'child:goal', type: t, kind: 'goal', title: 'Add a goal for your child', route: '/tracker/goals', routeLabel: 'Add a goal',
        body: 'Education is a long-dated, rising cost. A goal with a target amount and date shows the monthly saving it needs.', because: ['No goal about education or the child'] });
      emergencyLineFor(t, 'A new dependent usually means a longer cushion is worth having.');
      push({ id: 'child:paperwork', type: t, kind: 'paperwork', title: 'Update nominees', route: '/tracker/insurance', routeLabel: 'Open insurance',
        body: 'Insurance, EPF, NPS and bank accounts each keep their own nominee. It is worth checking that each one names who you intend.', because: [] });
      push({ id: 'child:tax', type: t, kind: 'tax', title: 'Tuition fees count under 80C', route: '/tools/tax', routeLabel: 'Tax savings',
        body: 'Once school starts, tuition fees for up to two children are deductible under Section 80C, in the old regime only.', because: [] });
    }

    if (t === 'marriage') {
      if (!hasHealth) push({ id: 'marriage:health-missing', type: t, kind: 'insurance', title: 'No health policy is recorded', route: '/tracker/insurance', routeLabel: 'Open insurance',
        body: 'Check that your spouse will be covered, either on your plan or their own.', because: ['No health policy in your insurance tracker'] });
      else push({ id: 'marriage:health-add', type: t, kind: 'insurance', title: 'Check your spouse is on a health policy', route: '/tracker/insurance', routeLabel: 'Open insurance',
        body: 'Ask your insurer how to add a spouse, or whether the employer cover applies to them.', because: ['A health policy is recorded'] });
      termLine(t, 'If your spouse will rely on your income, this matters.');
      push({ id: 'marriage:paperwork', type: t, kind: 'paperwork', title: 'Update nominees and your records', route: '/tracker/insurance', routeLabel: 'Open insurance',
        body: 'Insurance, EPF, NPS and bank accounts each keep their own nominee. It is worth checking each one.', because: [] });
      if (f.data.goals.length === 0) push({ id: 'marriage:goal', type: t, kind: 'goal', title: 'Set a first shared goal', route: '/tracker/goals', routeLabel: 'Add a goal',
        body: 'A home, a trip or an emergency cushion for two. A goal with a date shows the monthly amount it needs.', because: ['No goals recorded'] });
      push({ id: 'marriage:budget', type: t, kind: 'budget', title: 'Revisit the monthly budget', route: '/tracker/budget', routeLabel: 'Open budget',
        body: 'Household spending is different from one person\'s. Set category limits again once the real numbers settle.', because: [] });
    }

    if (t === 'home') {
      const homeGoal = goals.find(g => GOAL_HOME.test(g.name));
      if (!homeGoal) push({ id: 'home:goal', type: t, kind: 'goal', title: 'Add a goal for the down payment', route: '/tracker/goals', routeLabel: 'Add a goal',
        body: 'A goal with the amount and date shows the monthly saving it needs. Stamp duty and registration come on top of the price.', because: ['No goal about a home'] });
      else if (homeGoal.monthlyNeeded) push({ id: 'home:goal-progress', type: t, kind: 'goal', title: `"${homeGoal.name}" needs ${inr(homeGoal.monthlyNeeded)} a month`, route: '/tracker/goals', routeLabel: 'Open goals',
        body: `${Math.round(homeGoal.progress)}% is saved and ${homeGoal.monthsLeft} months are left. That is ${inr(homeGoal.remaining)} still to go, before any return on the savings.`,
        because: [`Goal "${homeGoal.name}": ${inr(homeGoal.current)} of ${inr(homeGoal.target)}`, `Target date ${homeGoal.target_date}`] });
      push({ id: 'home:tool', type: t, kind: 'tool', title: 'Work out the EMI and the interest', route: '/tools/homeloan', routeLabel: 'Home loan tool',
        body: 'The home loan tool shows the EMI, the interest over the full term and what a prepayment saves.', because: [] });
      if (income > 0 && emiTotal > 0) push({ id: 'home:emi-load', type: t, kind: 'debt', title: `Your EMIs already take ${Math.round((emiTotal / income) * 100)}% of income`, route: '/tools/debt', routeLabel: 'Debt payoff',
        body: `${inr(emiTotal)} of EMIs against ${inr(income)} a month. A new home loan adds to this, and lenders look at the total.`, because: [`EMIs recorded: ${inr(emiTotal)}`, `Monthly income recorded: ${inr(income)}`] });
      const loan = f.data.homeLoan;
      if (loan > 0 && hasTerm && cov && cov.totalLife < loan) push({ id: 'home:term-vs-loan', type: t, kind: 'insurance', title: 'Term cover is below the home loan', route: '/tracker/insurance', routeLabel: 'Open insurance',
        body: `Your recorded term cover is ${inr(cov.totalLife)} and the home loan outstanding is ${inr(loan)}. Cover that clears the loan keeps the home with your family.`, because: [`Term cover: ${inr(cov.totalLife)}`, `Home loan outstanding: ${inr(loan)}`] });
      emergencyLineFor(t, 'Keep the cushion whole when the down payment goes out.');
    }

    if (t === 'job_change') {
      if (f.data.epf > 0) push({ id: 'job_change:epf', type: t, kind: 'paperwork', title: 'Transfer your EPF', route: '/tracker/epf', routeLabel: 'Open EPF',
        body: `You have ${inr(f.data.epf)} in EPF recorded. Move it to the new employer's account with the same UAN so the service stays continuous.`, because: [`EPF recorded: ${inr(f.data.epf)}`] });
      else push({ id: 'job_change:epf-generic', type: t, kind: 'paperwork', title: 'Carry your UAN across', route: '/tracker/epf', routeLabel: 'Open EPF',
        body: 'If you have a provident fund, give the new employer the same UAN and request the transfer.', because: [] });
      if (!hasHealth) push({ id: 'job_change:health', type: t, kind: 'insurance', title: 'No personal health policy is recorded', route: '/tracker/insurance', routeLabel: 'Open insurance',
        body: 'Cover from an employer usually ends with the job. If that is all you had, there is a gap between jobs.', because: ['No health policy in your insurance tracker'] });
      push({ id: 'job_change:income', type: t, kind: 'budget', title: 'Update your income', route: '/profile', routeLabel: 'Open profile',
        body: income > 0 ? `Your recorded income is ${inr(income)} a month. If the new salary differs, update it so the savings rate, Money Score and SIP checks use the right figure.`
          : 'Record your monthly income so the savings rate, Money Score and SIP checks can be worked out.', because: income > 0 ? [`Monthly income recorded: ${inr(income)}`] : ['Monthly income not recorded'] });
      push({ id: 'job_change:tax', type: t, kind: 'tax', title: 'Collect Form 16 from both employers', route: '/tools/itr', routeLabel: 'ITR prep kit',
        body: 'With two employers in a year, each issues its own Form 16. Both go into the return, and the standard deduction is claimed once.', because: [] });
      if (f.data.monthlySip > 0) push({ id: 'job_change:stepup', type: t, kind: 'tool', title: 'Match the SIP to the new pay', route: '/tools/stepup', routeLabel: 'SIP step-up',
        body: `You invest ${inr(f.data.monthlySip)} a month. The step-up tool shows what raising it by a fixed share each year does.`, because: [`Monthly SIP recorded: ${inr(f.data.monthlySip)}`] });
    }

    if (t === 'windfall') {
      push({ id: 'windfall:tool', type: t, kind: 'tool', title: 'Decide the order before spending it', route: '/tools/windfall', routeLabel: 'Windfall planner',
        body: 'The windfall planner lists where a lump sum should go first, in order, for the goals you have recorded.', because: [] });
      emergencyLineFor(t, 'A cushion is usually the first place a lump sum goes.');
      const cc = f.data.creditCard;
      if (cc > 0) push({ id: 'windfall:card', type: t, kind: 'debt', title: `${inr(cc)} of credit card dues are recorded`, route: '/tools/debt', routeLabel: 'Debt payoff',
        body: 'Card dues carry the highest interest of anything you owe, so clearing them is a guaranteed saving of that rate.', because: [`Credit card dues recorded: ${inr(cc)}`] });
      push({ id: 'windfall:tax', type: t, kind: 'tax', title: 'Check how it is taxed first', route: '/tools/tax', routeLabel: 'Tax savings',
        body: 'A bonus is taxed as salary; a gift, an inheritance and a sale each follow different rules. Know the tax before you plan the spend.', because: [] });
    }

    if (t === 'education') {
      const eduGoal = goals.find(g => GOAL_EDU.test(g.name));
      if (!eduGoal) push({ id: 'education:goal', type: t, kind: 'goal', title: 'Add a goal for the fees', route: '/tracker/goals', routeLabel: 'Add a goal',
        body: 'A goal with the amount and the date shows the monthly saving needed. Fees tend to rise every year, so set the amount for the year it is paid.', because: ['No goal about education'] });
      else if (eduGoal.monthlyNeeded) push({ id: 'education:goal-progress', type: t, kind: 'goal', title: `"${eduGoal.name}" needs ${inr(eduGoal.monthlyNeeded)} a month`, route: '/tracker/goals', routeLabel: 'Open goals',
        body: `${Math.round(eduGoal.progress)}% is saved and ${eduGoal.monthsLeft} months are left, with ${inr(eduGoal.remaining)} to go.`,
        because: [`Goal "${eduGoal.name}": ${inr(eduGoal.current)} of ${inr(eduGoal.target)}`, `Target date ${eduGoal.target_date}`] });
      push({ id: 'education:loan', type: t, kind: 'tool', title: 'See what an education loan costs', route: '/tools/calc/educationloan', routeLabel: 'Education loan calculator',
        body: 'The calculator shows the EMI with a moratorium while you study, and the total interest.', because: [] });
      push({ id: 'education:tax', type: t, kind: 'tax', title: 'Loan interest is deductible under 80E', route: '/tools/tax', routeLabel: 'Tax savings',
        body: 'Interest on an education loan can be deducted under Section 80E for up to eight years, with no upper limit, in the old regime only.', because: [] });
    }

    if (t === 'job_loss') {
      if (em) push({ id: 'job_loss:runway', type: t, kind: 'emergency', title: `Your fund covers ${em.covered.toFixed(1)} months of spending`, route: '/tracker/emergency', routeLabel: 'Open emergency fund',
        body: `${inr(em.fund)} against ${inr(em.monthlyExpense)} a month. Cutting spending stretches this; the budget tracker shows where.`,
        because: [`Emergency fund recorded: ${inr(em.fund)}`, `Monthly spending recorded: ${inr(em.monthlyExpense)}`] });
      else emergencyLineFor(t, '');
      if (f.subs && f.subs.monthly > 0) push({ id: 'job_loss:subs', type: t, kind: 'budget', title: `Subscriptions cost ${inr(f.subs.monthly)} a month`, route: '/tracker/subscriptions', routeLabel: 'Open subscriptions',
        body: `${f.subs.activeCount} active. Pausing the ones you can live without lowers the monthly outgo straight away.`, because: [`Active subscriptions: ${f.subs.activeCount}`, `Monthly cost: ${inr(f.subs.monthly)}`] });
      const horizon = isoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 90));
      const today = isoDate(now);
      const renewals = f.events.filter(e => e.type === 'insurance' && e.date >= today && e.date <= horizon);
      if (renewals.length) push({ id: 'job_loss:renewals', type: t, kind: 'insurance', title: `${renewals.length} insurance ${renewals.length === 1 ? 'renewal falls' : 'renewals fall'} due in 90 days`, route: '/tools/calendar', routeLabel: 'Open calendar',
        body: 'Keep the cover in force: a lapsed health or term policy is the costliest thing to lose during a gap.', because: renewals.slice(0, 3).map(e => `${e.title} on ${e.date}`) });
      if (emiTotal > 0) push({ id: 'job_loss:emi', type: t, kind: 'debt', title: `${inr(emiTotal)} of EMIs are due each month`, route: '/tools/debt', routeLabel: 'Debt payoff',
        body: 'EMIs are the commitments that cannot be skipped. If you may miss one, speak to the lender before the due date.', because: [`EMIs recorded: ${inr(emiTotal)}`] });
    }

    // the cap keeps the ones raised first (the rules above are written most important first)
    if (out.length - before > perEvent) out.splice(before + perEvent);
  }
  return out;
}

/** Goal prompts the Goals screen can offer: just the goal-kind suggestions, for the same events. */
export const goalPrompts = (events: DeclaredEvent[], f: ArFacts, now: Date = f.now) => suggestionsFor(events, f, now).filter(s => s.kind === 'goal');
/** Insurance prompts for the Insurance screen. */
export const insurancePrompts = (events: DeclaredEvent[], f: ArFacts, now: Date = f.now) => suggestionsFor(events, f, now).filter(s => s.kind === 'insurance');

/** The line that may be sent as context: type and month only, never the free date of birth of a child or anything finer. */
export function contextLine(events: DeclaredEvent[], now: Date): string {
  return events.filter(e => phaseOf(e, now) !== 'past').slice(0, 5).map(e => `${DEFS[e.type].label.toLowerCase()} (${e.date.slice(0, 7)})`).join(', ');
}
