// A one-page financial summary as plain text, built only from what has been recorded on this phone.
// Pure: tracker data, what was computed from it and "now" go in; sections and a text rendering come out.
// Rules it follows: an unrecorded figure says "Not recorded" (never a default); amounts can be left out entirely;
// nothing is guessed (the FIRE line says what it is based on, or is left out if it would rest on a default).
import type { TrackerData, computeAll } from './trackers.ts';

export type Computed = ReturnType<typeof computeAll>;
export interface ReportInput {
  name: string;
  now: Date;
  data: TrackerData;
  computed: Computed;
  moneyScore: { score: number; band?: string } | null;
  due: { date: string; title: string }[];            // the next few weeks, from the calendar
  includeAmounts: boolean;
}
export interface ReportSection { title: string; lines: string[] }
export interface Report { title: string; generatedOn: string; sections: ReportSection[]; includeAmounts: boolean }

const NOT = 'Not recorded';
const HIDDEN = '••••';
const day = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

function short(n: number): string {
  const a = Math.abs(n), sign = n < 0 ? '-' : '';
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(2)} L`;
  return `${sign}₹${Math.round(a).toLocaleString('en-IN')}`;
}

export function buildReport(i: ReportInput): Report {
  const m = (n: number) => (i.includeAmounts ? short(n) : HIDDEN);
  const c = i.computed, d = i.data;
  const sections: ReportSection[] = [];

  // 1. Net worth
  const nw = c.netWorth;
  const nwLines: string[] = [];
  if (nw.totalAssets === 0 && nw.totalLiabilities === 0) nwLines.push(`Net worth: ${NOT}`);
  else {
    nwLines.push(`Net worth: ${m(nw.netWorth)}`);
    nwLines.push(`Assets: ${m(nw.totalAssets)}   Liabilities: ${m(nw.totalLiabilities)}`);
    nw.assets.slice(0, 5).forEach(a => nwLines.push(`  ${a.label}: ${m(a.value)} (${Math.round(a.pct)}%)`));
    nw.liabilities.slice(0, 4).forEach(l => nwLines.push(`  Owed: ${l.label}: ${m(l.value)}`));
    if (nw.fireSource !== 'default') {
      const basis = nw.fireSource === 'expense' ? 'your recorded spending' : nw.fireSource === 'bank' ? 'your bank-statement spending' : 'an assumed 60% of your income';
      nwLines.push(`Financial-independence progress: ${Math.round(nw.firePercent)}% (25 times yearly spending, based on ${basis})`);
    }
  }
  sections.push({ title: 'Net worth', lines: nwLines });

  // 2. Cash flow
  const b = c.budget;
  const cf: string[] = [];
  cf.push(`Monthly income: ${b.income > 0 ? m(b.income) : NOT}`);
  cf.push(`Monthly spending: ${b.expense > 0 ? m(b.expense) : NOT}`);
  if (b.known) cf.push(`Saving: ${m(b.saving)} a month (${b.savingsRate}% of income)`);
  const sp = c.spending;
  if (sp.totals.count > 0) cf.push(`Logged this month: ${m(sp.totals.spent)} across ${sp.totals.count} entr${sp.totals.count === 1 ? 'y' : 'ies'}`);
  sections.push({ title: 'Cash flow', lines: cf });

  // 3. Safety net
  const e = c.emergency;
  const sn: string[] = [];
  if (e.monthlyExpense > 0) sn.push(`Emergency fund: ${m(e.fund)} = ${e.covered} months of spending (target ${e.target} months): ${e.status.label}`);
  else sn.push(`Emergency fund: ${d.emergencyFund > 0 ? m(d.emergencyFund) : NOT} (add monthly spending to measure it in months)`);
  const gaps = c.retirement.coverage.gaps.filter(g => g.severity === 'critical' || g.severity === 'high');
  if (d.policies.length === 0) sn.push('Insurance: no policies recorded');
  else sn.push(`Insurance: ${d.policies.length} polic${d.policies.length === 1 ? 'y' : 'ies'} recorded`);
  gaps.forEach(g => sn.push(`  Gap: ${g.title}`));
  if (b.income <= 0 && gaps.length) sn.push('  (cover targets use an assumed income until yours is recorded)');
  sections.push({ title: 'Safety net', lines: sn });

  // 4. Scores
  const h = c.health;
  const sc: string[] = [`Health score: ${h.total}/100 (${h.tier.charAt(0) + h.tier.slice(1).toLowerCase()})`];
  h.pillars.forEach(p => sc.push(`  ${p.name}: ${p.untracked ? 'neutral, not recorded' : `${p.score}/${p.max}`}`));
  if (i.moneyScore) sc.push(`Money Score: ${i.moneyScore.score}/100${i.moneyScore.band ? ` (${i.moneyScore.band})` : ''}`);
  else sc.push(`Money Score: not taken`);
  sections.push({ title: 'Scores', lines: sc });

  // 5. Goals
  const gl: string[] = [];
  if (c.goals.items.length === 0) gl.push('No goals recorded');
  else c.goals.items.slice(0, 6).forEach(g => gl.push(`${g.name}: ${Math.round(g.progress)}% funded (${m(g.current)} of ${m(g.target)})${g.monthsLeft && g.monthsLeft > 0 ? `, ${g.monthsLeft} months left` : ''}`));
  sections.push({ title: 'Goals', lines: gl });

  // 6. Retirement accounts
  const rt: string[] = [];
  const parts: [string, number][] = [['EPF', d.epf], ['NPS', d.nps], ['PPF & small savings', d.ppf]];
  parts.forEach(([n, v]) => rt.push(`${n}: ${v > 0 ? m(v) : NOT}`));
  if (d.monthlySip > 0) rt.push(`Monthly SIP: ${m(d.monthlySip)}`);
  sections.push({ title: 'Retirement and long-term', lines: rt });

  // 7. Coming up
  if (i.due.length) sections.push({ title: 'Coming up', lines: i.due.slice(0, 8).map(x => `${x.date}  ${x.title}`) });

  return { title: i.name.trim() ? `Financial summary: ${i.name.trim()}` : 'Financial summary', generatedOn: day(i.now), sections, includeAmounts: i.includeAmounts };
}

export function toText(r: Report): string {
  const out: string[] = [r.title, `As of ${r.generatedOn}`, ''];
  r.sections.forEach(s => { out.push(s.title.toUpperCase()); s.lines.forEach(l => out.push(l)); out.push(''); });
  out.push(r.includeAmounts ? 'Prepared by FIN·OS from figures entered on this phone. Estimates for planning, not advice.' : 'Amounts left out. Prepared by FIN·OS from figures entered on this phone. Estimates for planning, not advice.');
  return out.join('\n');
}
