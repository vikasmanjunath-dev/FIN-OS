// The alerts bell, worked out on the phone. Ports the rules of the website's alert engine (alerts/rules.py) that can be decided
// from what is recorded here; the ones that need a bank feed, card data or a market stream are not faked.
// Pure: facts and "now" go in, a list of alerts comes out. An alert's id includes the period it is about (a month, a goal), so a
// dismissed alert comes back next period if the situation is still true. Nothing fires from a missing figure.
import type { TrackerData, computeAll } from './trackers.ts';

export type Priority = 'critical' | 'warning' | 'info' | 'celebration';
export interface Alert { id: string; rule: string; priority: Priority; icon: string; title: string; message: string; route: string; action: string }

export interface AlertFacts {
  data: TrackerData;
  computed: ReturnType<typeof computeAll>;
  prevNetWorth: number | null;                      // net worth the last time alerts were worked out; null = first time
  subscriptions: { name: string; date: string; daysAway: number; cost: number; trial: boolean }[];
  taxDates: { date: string; title: string }[];      // statutory tax dates from the calendar
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const dayDiff = (a: string, b: string) => { const A = a.split('-').map(Number), B = b.split('-').map(Number); return Math.round((Date.UTC(B[0], B[1] - 1, B[2]) - Date.UTC(A[0], A[1] - 1, A[2])) / 86400000); };

export const MILESTONES: { value: number; label: string; icon: string }[] = [
  { value: 100000, label: '₹1 lakh', icon: '🎯' }, { value: 500000, label: '₹5 lakh', icon: '🔥' }, { value: 1000000, label: '₹10 lakh', icon: '💎' },
  { value: 2500000, label: '₹25 lakh', icon: '🚀' }, { value: 5000000, label: '₹50 lakh', icon: '🏆' }, { value: 10000000, label: '₹1 crore', icon: '👑' }, { value: 50000000, label: '₹5 crore', icon: '🌟' },
];

export function computeAlerts(f: AlertFacts, now: Date): Alert[] {
  const out: Alert[] = [];
  const today = iso(now), month = today.slice(0, 7);
  const d = f.data, c = f.computed;

  // 1. Emergency fund under three months (critical)
  const expense = d.expense || d.aaExpense || 0;
  if (d.emergencyFund > 0 && expense > 0) {
    const months = d.emergencyFund / expense;
    if (months < 3) {
      const gap = expense * 3 - d.emergencyFund;
      out.push({ id: `EMERGENCY_FUND_LOW:${month}`, rule: 'EMERGENCY_FUND_LOW', priority: 'critical', icon: '🚨', title: 'Emergency fund is under 3 months',
        message: `Your fund covers ${months.toFixed(1)} months of spending. Three months needs another ${inr(gap)}, kept in a liquid fund or FD.`, route: '/tracker/emergency', action: 'See the plan' });
    }
  }

  // 2. Goals behind schedule. Needs a target date AND a recorded monthly amount: without the amount nothing is known to be behind
  //    (the Goals screen already shows what each goal needs).
  c.goals.items.forEach(g => {
    if (!g.target_date || g.monthsLeft == null || g.monthsLeft <= 0 || g.target <= 0 || g.remaining <= 0) return;
    const sip = Number((g as any).monthly_sip ?? (g as any).monthly_contribution) || 0;
    if (sip <= 0) return;
    const needed = g.remaining / g.monthsLeft;
    if (sip >= needed * 0.8) return;
    out.push({ id: `GOAL_BEHIND:${g.id}:${month}`, rule: 'GOAL_BEHIND', priority: 'warning', icon: '🎯', title: `"${g.name}" is behind schedule`,
      message: `It needs ${inr(needed)} a month and ${inr(sip)} is going in. ${g.monthsLeft} months are left: about ${inr(needed - sip)} more a month closes the gap.`,
      route: '/tracker/goals', action: 'Review goals' });
  });

  // 3. Budget limits: over, or on pace to pass the limit
  c.spending.budget.rows.filter(r => r.limit > 0 && r.state !== 'ok').forEach(r => {
    const over = r.state === 'over';
    out.push({ id: `BUDGET:${r.category}:${month}:${over ? 'over' : 'pace'}`, rule: 'BUDGET_OVERRUN', priority: over ? 'critical' : 'warning', icon: over ? '🚨' : '⚠️',
      title: over ? `${r.category} is over its limit` : `${r.category} is on pace to pass its limit`,
      message: over ? `You have spent ${inr(r.spent)} of ${inr(r.limit)} this month.` : `${inr(r.spent)} spent so far; at this pace the month ends near ${inr(r.projected)} against a limit of ${inr(r.limit)}.`,
      route: '/tracker/budget', action: 'Open budget' });
  });

  // 4. A spending category far above its usual (needs three earlier months of data)
  {
    const byMonth: Record<string, Record<string, number>> = {};
    d.transactions.forEach((t: any) => { if (t.kind && t.kind !== 'expense') return; const m = String(t.date).slice(0, 7); (byMonth[m] = byMonth[m] || {}); byMonth[m][t.category] = (byMonth[m][t.category] || 0) + Number(t.amount || 0); });
    const prev = [1, 2, 3].map(n => { const x = new Date(now.getFullYear(), now.getMonth() - n, 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`; });
    if (prev.every(m => byMonth[m])) {
      Object.entries(byMonth[month] || {}).forEach(([cat, spent]) => {
        const avg = prev.reduce((s, m) => s + (byMonth[m][cat] || 0), 0) / 3;
        if (avg >= 1000 && spent >= 3000 && spent > avg * 2) out.push({ id: `ANOMALY:${cat}:${month}`, rule: 'ANOMALY_SPEND', priority: 'warning', icon: '🔍', title: `${cat} spending is unusually high`,
          message: `${inr(spent)} this month against a usual ${inr(avg)}. Worth a look in case something was charged twice or is a one-off.`, route: '/tracker/transactions', action: 'See entries' });
      });
    }
  }

  // 5. Insurance renewals within 30 days
  d.policies.forEach(p => {
    if (!p.renewal_date) return;
    const n = dayDiff(today, p.renewal_date);
    if (n < 0 || n > 30) return;
    out.push({ id: `INSURANCE:${p.id}:${p.renewal_date}`, rule: 'INSURANCE_RENEWAL_DUE', priority: n <= 7 ? 'critical' : 'warning', icon: '🛡️',
      title: `${p.provider || 'A policy'} renews ${n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`}`,
      message: `${p.annual_premium > 0 ? `Premium ${inr(p.annual_premium)}. ` : ''}Renew before the date so cover does not lapse.`, route: '/tracker/insurance', action: 'Open insurance' });
  });

  // 6. Statutory tax dates within 14 days
  f.taxDates.forEach(t => {
    const n = dayDiff(today, t.date);
    if (n < 0 || n > 14) return;
    out.push({ id: `TAX_DATE:${t.date}:${t.title}`, rule: 'TAX_SEASON', priority: n <= 3 ? 'critical' : 'warning', icon: '🧾', title: `${t.title}: ${n === 0 ? 'today' : `in ${n} days`}`,
      message: 'A statutory default date. It is sometimes extended, so check the Income Tax portal.', route: '/tools/calendar', action: 'See the calendar' });
  });

  // 7. 80C room left, October to March, only when 80C investments have been recorded
  if ([10, 11, 12, 1, 2, 3].includes(now.getMonth() + 1) && d.used80c > 0 && d.used80c < 150000) {
    const gap = 150000 - d.used80c;
    out.push({ id: `TAX_80C:${now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1}`, rule: 'TAX_SAVE_80C', priority: 'info', icon: '💡',
      title: `${inr(gap)} of 80C room left`, message: `You have recorded ${inr(d.used80c)} of the ₹1.5 lakh limit. Filling it saves tax only under the old regime: about ${inr(gap * 0.2)} to ${inr(gap * 0.3)} at the 20% and 30% slabs.`,
      route: '/tools/tax', action: 'See tax savings' });
  }

  // 8. Subscriptions renewing within 3 days (trials first)
  f.subscriptions.filter(s => s.daysAway >= 0 && s.daysAway <= 3).forEach(s => {
    out.push({ id: `SUB:${s.name}:${s.date}`, rule: 'BILL_DUE', priority: s.trial ? 'warning' : 'info', icon: s.trial ? '⏳' : '🔁',
      title: s.trial ? `${s.name} trial ends ${s.daysAway === 0 ? 'today' : `in ${s.daysAway} day${s.daysAway === 1 ? '' : 's'}`}` : `${s.name} renews ${s.daysAway === 0 ? 'today' : `in ${s.daysAway} day${s.daysAway === 1 ? '' : 's'}`}`,
      message: `${inr(s.cost)} will be charged${s.trial ? ' unless you cancel first' : ''}.`, route: '/tracker/subscriptions', action: 'Open subscriptions' });
  });

  // 9. A net-worth milestone crossed since the last look
  const nw = c.netWorth.netWorth;
  if (f.prevNetWorth !== null && f.prevNetWorth > 0 && nw > 0) {
    const m = [...MILESTONES].reverse().find(x => f.prevNetWorth! < x.value && x.value <= nw);
    if (m) out.push({ id: `NETWORTH:${m.value}`, rule: 'NETWORTH_MILESTONE', priority: 'celebration', icon: m.icon, title: `Net worth crossed ${m.label}`,
      message: `You are at ${inr(nw)}. The first milestone is the hardest, and compounding does more of the work from here.`, route: '/tracker/networth', action: 'See net worth' });
  }

  const rank: Record<Priority, number> = { critical: 0, warning: 1, celebration: 2, info: 3 };
  const seen = new Set<string>();
  return out.filter(a => (seen.has(a.id) ? false : (seen.add(a.id), true))).sort((a, b) => rank[a.priority] - rank[b.priority]);
}

export type AlertState = Record<string, 'read' | 'dismissed'>;
export function unreadCount(alerts: Alert[], st: AlertState): number { return alerts.filter(a => !st[a.id]).length; }
export function visibleAlerts(alerts: Alert[], st: AlertState): Alert[] { return alerts.filter(a => st[a.id] !== 'dismissed'); }
export function normaliseState(raw: unknown): AlertState {
  const o: AlertState = {};
  if (raw && typeof raw === 'object') Object.entries(raw as Record<string, unknown>).forEach(([k, v]) => { if (v === 'read' || v === 'dismissed') o[k] = v; });
  return o;
}
/** Drops state for alerts that are no longer true, so the stored map cannot grow without end. */
export function pruneState(st: AlertState, current: Alert[]): AlertState {
  const ids = new Set(current.map(a => a.id));
  return Object.fromEntries(Object.entries(st).filter(([k]) => ids.has(k))) as AlertState;
}
