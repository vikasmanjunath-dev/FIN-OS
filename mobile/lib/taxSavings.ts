// Tax Savings on the phone: how much the old-regime deductions could save, against what the new regime costs anyway.
// The maths is lib/taxcore.ts (a port of js/finos-taxcore.js savingsPlan); the sections and the wording follow html/tax.html.
import { savingsPlan, type SavingsPlan, type SectionInput } from '@/lib/taxcore';

export interface SectionDef extends SectionInput { label: string; note: string }

export const SECTIONS: SectionDef[] = [
  { id: 's80c', label: '80C (PPF, ELSS, LIC, EPF…)', maxDeduction: 150000, kind: 'core', note: 'up to ₹1.5L a year' },
  { id: 's80d', label: '80D (Health insurance)', maxDeduction: 25000, kind: 'core', note: 'up to ₹25,000 for self and family' },
  { id: 'nps', label: '80CCD(1B) (NPS)', maxDeduction: 50000, kind: 'core', note: 'an extra ₹50,000 above 80C' },
  { id: 'hra', label: 'HRA', maxDeduction: 120000, kind: 'conditional', note: 'only if you pay rent' },
  { id: 's24b', label: '24(b) Home loan interest', maxDeduction: 200000, kind: 'conditional', note: 'only if you have a home loan' },
  { id: 's80e', label: '80E (Education loan)', maxDeduction: null, kind: 'uncapped', note: 'equals the interest you pay, no cap' },
];

export interface TaxInputs { income: string; used80c: string; usedHealth: string; usedNps: string }
export const DEFAULT_INPUTS: TaxInputs = { income: '', used80c: '', usedHealth: '', usedNps: '' };

const num = (v: string) => { const n = Number(String(v).replace(/[,₹\s]/g, '')); return Number.isFinite(n) && n > 0 ? n : 0; };

export interface SavingsView {
  ok: boolean;
  plan: SavingsPlan | null;
  rows: (SectionDef & { headroom: number | null; taxSaved: number | null })[];
  verdict: { tone: 'good' | 'warn' | 'info'; text: string } | null;
  effectiveRate: number;
}

const inr = (n: number) => '₹' + Math.round(Math.abs(n)).toLocaleString('en-IN');

/** What the person has told us they already claim is taken off each section's room, and counted in the old-regime baseline. */
export function computeView(inp: TaxInputs): SavingsView {
  const income = num(inp.income);
  if (income < 100000) return { ok: false, plan: null, rows: [], verdict: null, effectiveRate: 0 };
  const used80c = Math.min(150000, num(inp.used80c));
  const usedHealth = Math.min(25000, num(inp.usedHealth));
  const usedNps = Math.min(50000, num(inp.usedNps));
  const sections = SECTIONS.map(s => (s.id === 's80d' ? { ...s, maxDeduction: 25000 - usedHealth } : s.id === 'nps' ? { ...s, maxDeduction: 50000 - usedNps } : s));
  const opts = { alreadyClaimed80c: inp.used80c.trim() === '' ? undefined : used80c, alreadyClaimedOther: usedHealth + usedNps };
  const plan = savingsPlan(income, sections, opts);
  const rows = SECTIONS.map(s => {
    const r = plan.sections.find(x => x.id === s.id);
    return { ...s, headroom: r ? r.headroom : null, taxSaved: r ? r.taxSaved : null };
  });
  return { ok: true, plan, rows, verdict: verdict(plan), effectiveRate: plan.income > 0 ? (plan.current / plan.income) * 100 : 0 };
}

export function verdict(plan: SavingsPlan): { tone: 'good' | 'warn' | 'info'; text: string } {
  if (plan.newTax === 0 && plan.oldNow === 0) return { tone: 'good', text: 'No income tax is payable for you under either regime, so there is nothing to save.' };
  if (plan.newBeatsOldEvenOptimised) {
    const be = plan.breakEvenDeductions;
    return { tone: 'good', text: `The new regime is cheaper by ${inr(plan.oldMinusNew)} even if you max out 80C, 80D and NPS. Those deductions only exist in the old regime, so claiming them would not lower your tax.`
      + (be ? ` The old regime would only win if your total deductions (including HRA and home-loan interest) passed about ${inr(be)}.` : '') };
  }
  if (plan.potential > 0) return { tone: 'warn', text: `The old regime wins if you use every deduction below. It would save you ${inr(plan.potential)} more than you pay now.` };
  return { tone: 'info', text: 'The old regime is already the cheaper option for you at your current deductions.' };
}
