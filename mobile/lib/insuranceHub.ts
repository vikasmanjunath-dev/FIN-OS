// Insurance hub: the cover types the website describes, what to check, and the person's own recorded policies set beside them.
// Pure (no React, no storage). The content comes from mobile/content/insurance (extracted from the website with provenance by
// scripts/extract-insurance.py, plus app-authored questions in checks.json).
//
// What this module deliberately does NOT do: rank products or insurers, call anything "best", or invent figures. The website holds
// no insurer or plan data, so there is none here. Every website figure keeps its file and line, and says its date is not stated.
import { INSURANCE_CONTENT } from '../content/insurance/data.ts';
import { renewalDays } from './retirement.ts';
import type { Policy, PolicyType } from './retirement.ts';

// ── Content types ───────────────────────────────────────────────────────────────────────────────

export interface Source { file: string; line: number; quote: string }
export interface Feature { name: string; text: string; source: Source }
export interface CoverType {
  id: string;
  group: string;
  label: string;
  /** Policy types of the phone's insurance tracker that belong to this cover type. */
  policyTypes: PolicyType[];
  /** 'full' = the website has a whole section on it; 'thin' = it only names the type. */
  detail: 'full' | 'thin';
  layer: null | { layer: number; tag: string; heading: string; tagline: string; taglineSource: Source; headingSource: Source; features: Feature[]; story: { text: string; fictional: boolean; source: Source } };
  hub: null | { icon: string; label: string; color: string; source: Source };
  summary: string;
  pays: string[];
  doesNotPay: string[];
}
export interface Fact {
  id: string; kind: 'figure' | 'rule' | 'claim'; statement: string; value: unknown; unit: string;
  sources: Source[]; asOf: string | null; asOfNote: string; verified: boolean; note: string;
}
export interface Check { id: string; coverType: string; question: string; why: string; facts: string[] }
export interface GuidePoint { text: string; facts: string[] }
export interface GuideSection { id: string; title: string; points: GuidePoint[] }

const RAW = INSURANCE_CONTENT as any;

export const GROUPS: { id: string; label: string }[] = RAW.coverTypes.groups;
export const FACTS: Fact[] = RAW.facts.facts;
export const CHECKS: Check[] = RAW.checks.items;
export const GUIDE: GuideSection[] = RAW.checks.guide;
export const INSURER_DATA: { available: boolean; headline: string; body: string; wanted: string[] } = RAW.checks.insurerData;

export const COVER_TYPES: CoverType[] = RAW.coverTypes.coverTypes.map((c: any): CoverType => {
  const a = RAW.checks.cover[c.id] ?? { summary: '', pays: [], doesNotPay: [] };
  return { ...c, summary: a.summary, pays: a.pays, doesNotPay: a.doesNotPay };
});

export const factById = (id: string): Fact | undefined => FACTS.find(f => f.id === id);
export const coverTypeById = (id: string): CoverType | undefined => COVER_TYPES.find(c => c.id === id);
export const checksFor = (coverTypeId: string): Check[] => CHECKS.filter(c => c.coverType === coverTypeId);

/** Which of the website's figures belong on which cover type's page (a decision of this app; the test checks every id exists). */
export const FACTS_BY_TYPE: Record<string, string[]> = {
  health: ['medical_inflation', 'avg_icu_bill', 'hospitalisation_cost_range', 'top_hospital_cost_range', 'surgery_cost_projection', 'rule_health', 'room_rent_cap', 'co_pay'],
  critical: ['critical_illness_count', 'critical_treatment_cost_range', 'critical_rider_premium', 'critical_age_threshold', 'rule_critical'],
  term: ['rule_life_term', 'target_csr', 'insurance_not_investment'],
  accident: [],
  ulip: ['insurance_not_investment'],
  home: [],
  vehicle: ['rule_vehicle', 'third_party_mandatory'],
  liability: ['third_party_mandatory'],
  travel: [],
};

export function factsFor(coverTypeId: string): Fact[] {
  return (FACTS_BY_TYPE[coverTypeId] ?? []).map(factById).filter((f): f is Fact => !!f);
}

/** "html/insurance-directory.html, line 209" */
export const sourceLabel = (s: Source) => `${s.file}, line ${s.line}`;
/** "html/insurance-directory.html, lines 164-166" for several sources of one file; falls back to a list across files. */
export function sourcesLabel(list: Source[]): string {
  const byFile = new Map<string, number[]>();
  list.forEach(s => byFile.set(s.file, [...(byFile.get(s.file) ?? []), s.line]));
  return [...byFile.entries()].map(([file, lines]) => {
    const u = [...new Set(lines)].sort((a, b) => a - b);
    return `${file}, ${u.length === 1 ? 'line' : 'lines'} ${u.join(', ')}`;
  }).join('; ');
}

// ── Recorded policies ───────────────────────────────────────────────────────────────────────────

/** The cover type a recorded policy belongs to, or null when the website's vocabulary has no match (the person still sees it). */
export function coverTypeForPolicy(policyType: string): string | null {
  return COVER_TYPES.find(c => (c.policyTypes as string[]).includes(policyType))?.id ?? null;
}

export function policiesByCoverType(policies: Policy[]): { byType: Record<string, Policy[]>; other: Policy[] } {
  const byType: Record<string, Policy[]> = {};
  const other: Policy[] = [];
  for (const p of policies) {
    const id = coverTypeForPolicy(String(p.type));
    if (id) (byType[id] ??= []).push(p); else other.push(p);
  }
  return { byType, other };
}

export interface TypeFilter { group?: string | null; query?: string; recordedOnly?: boolean }

/** Directory filter. `recorded` holds the cover type ids the person has a policy for. */
export function filterCoverTypes(f: TypeFilter, recorded: ReadonlySet<string>): CoverType[] {
  const q = (f.query ?? '').trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  return COVER_TYPES.filter(c => {
    if (f.group && c.group !== f.group) return false;
    if (f.recordedOnly && !recorded.has(c.id)) return false;
    if (!words.length) return true;
    const hay = [c.label, c.summary, ...c.pays, ...c.doesNotPay, c.layer?.heading ?? '', ...(c.layer?.features.map(x => x.name + ' ' + x.text) ?? []),
      ...checksFor(c.id).map(k => k.question)].join(' ').toLowerCase();
    return words.every(w => hay.includes(w));
  });
}

// ── Comparing cover types ───────────────────────────────────────────────────────────────────────

export interface Cell { kind: 'website' | 'app' | 'none'; lines: string[]; source?: string }
export interface Row { key: string; label: string; cells: Cell[] }

export const MAX_COMPARE = 3;
const NONE: Cell = { kind: 'none', lines: ['Not described on the website'] };

/** Side-by-side of 2 or 3 cover types. Nothing is scored or ranked: the rows are descriptions. */
export function compareCoverTypes(ids: string[], recorded: Record<string, Policy[]> = {}): Row[] {
  const types = ids.slice(0, MAX_COMPARE).map(coverTypeById).filter((c): c is CoverType => !!c);
  const row = (key: string, label: string, f: (c: CoverType) => Cell): Row => ({ key, label, cells: types.map(f) });
  return [
    row('summary', 'In one line', c => ({ kind: 'app', lines: [c.summary] })),
    row('pays', 'Pays for', c => ({ kind: 'app', lines: c.pays })),
    row('not', 'Does not pay for', c => ({ kind: 'app', lines: c.doesNotPay })),
    row('features', 'What the website highlights', c => c.layer
      ? { kind: 'website', lines: c.layer.features.map(x => `${x.name}: ${x.text}`), source: sourcesLabel(c.layer.features.map(x => x.source)) }
      : NONE),
    row('rules', "The website's rule of thumb", c => {
      const rules = factsFor(c.id).filter(f => f.kind === 'rule');
      return rules.length ? { kind: 'website', lines: rules.map(r => r.statement), source: sourcesLabel(rules.flatMap(r => r.sources)) } : NONE;
    }),
    row('check', 'Questions to ask', c => ({ kind: 'app', lines: checksFor(c.id).map(k => k.question) })),
    row('recorded', 'You have recorded', c => {
      const ps = recorded[c.id] ?? [];
      return { kind: 'app', lines: [ps.length ? `${ps.length} polic${ps.length === 1 ? 'y' : 'ies'}` : 'None'] };
    }),
  ];
}

// ── Comparing the person's own policies ─────────────────────────────────────────────────────────

export interface PolicyColumn {
  id: string; provider: string; sumAssured: number; annualPremium: number | null;
  /** Annual premium per ₹1 lakh of cover; null when either number is not recorded. A fact about the numbers entered, not a verdict. */
  premiumPerLakh: number | null; renewalDate: string; renewalDays: number | null; typeId: string | null; policyType: string;
}

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export function policyColumn(p: Policy, now: Date): PolicyColumn {
  const sum = num(p.sum_assured), prem = num(p.annual_premium);
  return {
    id: p.id, provider: p.provider || '', sumAssured: sum, annualPremium: prem > 0 ? prem : null,
    premiumPerLakh: sum > 0 && prem > 0 ? Math.round((prem / sum) * 1e5 * 100) / 100 : null,
    renewalDate: p.renewal_date || '', renewalDays: renewalDays(p, now), typeId: coverTypeForPolicy(String(p.type)), policyType: String(p.type),
  };
}

export interface PolicyComparison { columns: PolicyColumn[]; sameType: boolean; notes: string[] }

export function comparePolicies(policies: Policy[], now: Date): PolicyComparison {
  const cols = policies.slice(0, MAX_COMPARE).map(p => policyColumn(p, now));
  const types = new Set(cols.map(c => c.policyType));
  const notes: string[] = [];
  const sameType = types.size <= 1;
  if (!sameType) notes.push('These are different kinds of cover, so cover and premium per lakh are not like for like.');
  if (cols.some(c => c.premiumPerLakh === null)) notes.push('Premium per lakh is only shown where both the cover and the premium are recorded.');
  if (cols.length && cols.every(c => c.annualPremium === null)) notes.push('No premium is recorded on these policies.');
  notes.push('Cover and premium are what you entered. Policies differ in terms, exclusions and age band, which a number cannot show.');
  return { columns: cols, sameType, notes };
}

// ── The person's own checklist ──────────────────────────────────────────────────────────────────

export type Answer = 'ok' | 'concern';
/** policy id → check id → answer. A check that is absent has not been looked at: it is never assumed fine. */
export type Answers = Record<string, Record<string, Answer>>;

export function normaliseAnswers(raw: unknown): Answers {
  const out: Answers = {};
  const known = new Set(CHECKS.map(c => c.id));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [pid, per] of Object.entries(raw as Record<string, unknown>)) {
    if (!per || typeof per !== 'object' || Array.isArray(per)) continue;
    const clean: Record<string, Answer> = {};
    for (const [cid, a] of Object.entries(per as Record<string, unknown>)) {
      if (known.has(cid) && (a === 'ok' || a === 'concern')) clean[cid] = a;
    }
    if (Object.keys(clean).length) out[pid] = clean;
  }
  return out;
}

/** Sets an answer; `null` clears it back to "not checked". Returns a new object. */
export function setAnswer(all: Answers, policyId: string, checkId: string, answer: Answer | null): Answers {
  const per = { ...(all[policyId] ?? {}) };
  if (answer === null) delete per[checkId]; else per[checkId] = answer;
  const next = { ...all };
  if (Object.keys(per).length) next[policyId] = per; else delete next[policyId];
  return next;
}

/** Forget answers for policies that no longer exist. */
export function pruneAnswers(all: Answers, policyIds: string[]): Answers {
  const keep = new Set(policyIds);
  return Object.fromEntries(Object.entries(all).filter(([id]) => keep.has(id)));
}

export interface Progress { total: number; checked: number; concerns: number }
export function progressFor(policy: Pick<Policy, 'id' | 'type'>, all: Answers): Progress {
  const typeId = coverTypeForPolicy(String(policy.type));
  const items = typeId ? checksFor(typeId) : [];
  const per = all[policy.id] ?? {};
  let checked = 0, concerns = 0;
  for (const it of items) {
    if (per[it.id]) checked++;
    if (per[it.id] === 'concern') concerns++;
  }
  return { total: items.length, checked, concerns };
}

/** Concerns the person flagged, across all their policies, for the hub's follow-up list. */
export function followUps(policies: Policy[], all: Answers): { policy: Policy; check: Check }[] {
  const out: { policy: Policy; check: Check }[] = [];
  for (const p of policies) {
    const typeId = coverTypeForPolicy(String(p.type));
    if (!typeId) continue;
    for (const c of checksFor(typeId)) if (all[p.id]?.[c.id] === 'concern') out.push({ policy: p, check: c });
  }
  return out;
}
