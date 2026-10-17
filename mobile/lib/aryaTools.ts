// What is left of the first-pass tools module after the tool loop moved out:
//   lib/aryaIntent.ts       which tool a question asks for (words only)
//   lib/aryaToolbox.ts      the tools that run on the phone
//   lib/aryaServerTools.ts  the tools that need the Arya server (public market data)
//   lib/aryaAgent.ts        planning, running and recording the calls
// This file keeps two things both the chat hook and the guardrail tests use: the list of rupee figures the app really holds about the
// person (so a model sentence that states an amount about them can be checked), and the reply when the model cannot be asked.
import { type ArFacts, incomeMonthly, expenseMonthly, holdingsValue, taxEstimate } from '@/lib/aryaFacts';
import { offlineReply } from '@/lib/aryaOffline';
import { HELP_EXAMPLES, withSource } from '@/lib/aryaToolbox';

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
  [c.budget.income, c.budget.expense, c.budget.saving, c.netWorth.netWorth, c.netWorth.totalAssets, c.netWorth.totalLiabilities, c.netWorth.fireSource === 'unknown' ? 0 : c.netWorth.fireCorpus,   // a corpus without a recorded spending basis is not a known figure
   
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
export function localOnlyReply(local: { text: string; source: string; asOf?: number } | null, why: string | null, dev = false, toolsOff = false): string {
  if (local) return `${why ?? 'I cannot reach Arya online right now, but your own records answer this:'}\n\n${withSource(local)}`;
  const head = why ? `${why}\n\n` : '';
  const base = offlineReply('unreachable', dev && !why);
  const help = toolsOff
    ? 'Tools are switched off, so I am not reading your records or looking anything up. Switch them on in the Agent tab to ask questions like these on this phone:\n' + HELP_EXAMPLES.slice(0, 4).map(e => `- ${e}`).join('\n')
    : `Questions I can answer on this phone, from your own records:\n${HELP_EXAMPLES.slice(0, 6).map(e => `- ${e}`).join('\n')}`;
  const at = base.indexOf('\n\nTry again');
  return head + (at >= 0 ? `${base.slice(0, at)}\n\n${help}${base.slice(at)}` : `${base}\n\n${help}`);
}
