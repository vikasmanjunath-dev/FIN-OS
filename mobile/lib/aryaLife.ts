// Arya "Life" tab: a timeline of the dated things the person recorded or declared, and what each life event changes.
// The website's timeline is age milestones (25, 30, 35 ...) with net-worth targets of "8x income", "15x income" and a retire age of 60.
// Those are benchmarks, not records, so they are not built. Here: declared life events, goal dates, and the retirement year the person set.
import type { ArFacts } from '@/lib/aryaFacts';
import { ageOf } from '@/lib/aryaFacts';
import { DEFS, phaseOf, suggestionsFor, type DeclaredEvent, type LifeEventType, type Suggestion } from '@/lib/lifeEvents';
import { isoDate } from '@/lib/calendar';

/** What each kind of event makes Arya look at (the kinds its rules raise). A test keeps this equal to lifeEvents.suggestionsFor. */
export const AFFECTS: Record<LifeEventType, Suggestion['kind'][]> = {
  marriage: ['insurance', 'paperwork', 'goal', 'budget'],
  child: ['insurance', 'goal', 'emergency', 'paperwork', 'tax'],
  home: ['goal', 'tool', 'debt', 'insurance', 'emergency'],
  job_change: ['paperwork', 'insurance', 'budget', 'tax', 'tool'],
  windfall: ['tool', 'emergency', 'debt', 'tax'],
  education: ['goal', 'tool', 'tax'],
  job_loss: ['emergency', 'budget', 'insurance', 'debt'],
};
export const KIND_WORDS: Record<Suggestion['kind'], string> = { goal: 'goals', insurance: 'insurance', emergency: 'emergency fund', tax: 'tax', paperwork: 'nominees and paperwork', budget: 'budget', debt: 'debt', tool: 'a planner to run' };

export interface LifeItem { date: string; kind: 'event' | 'goal' | 'retire' | 'now'; icon: string; title: string; sub: string; changes: string[]; route: string | null; phase?: 'later' | 'active' | 'past' }

export function lifeTimeline(f: ArFacts, events: DeclaredEvent[]): LifeItem[] {
  const out: LifeItem[] = [];
  const today = isoDate(f.now);
  const age = ageOf(f);
  out.push({ date: today, kind: 'now', icon: '📍', title: 'You are here', sub: age ? `Age ${age}` : 'Age not recorded', changes: [], route: '/profile' });
  const sug = suggestionsFor(events, f, f.now, 3);
  for (const e of events) {
    const ph = phaseOf(e, f.now), d = DEFS[e.type];
    const mine = sug.filter(s => s.type === e.type);
    out.push({ date: e.date, kind: 'event', icon: d.icon, title: d.label, phase: ph, route: '/pulse/life',
      sub: ph === 'active' ? `Raising ${mine.length} prompt${mine.length === 1 ? '' : 's'} now` : ph === 'later' ? `Starts raising prompts ${d.leadMonths} month${d.leadMonths === 1 ? '' : 's'} before the date` : 'Past its window; no longer raising prompts',
      changes: ph === 'active' && mine.length ? mine.map(s => s.title) : AFFECTS[e.type].map(k => KIND_WORDS[k]) });
  }
  for (const g of f.computed.goals.items) if (g.target_date) out.push({ date: String(g.target_date).slice(0, 10), kind: 'goal', icon: '🎯', title: g.name, route: '/tracker/goals',
    sub: `${Math.round(g.progress)}% of ₹${Math.round(g.target).toLocaleString('en-IN')}${g.monthlyNeeded ? `, needs ₹${Math.round(g.monthlyNeeded).toLocaleString('en-IN')} a month` : ''}`, changes: [] });
  const ra = parseInt(f.retirementStore.finos_retire_age || '', 10);
  if (ra > 0 && age > 0 && ra > age) out.push({ date: `${f.now.getFullYear() + (ra - age)}-01-01`, kind: 'retire', icon: '🌅', title: `Retirement at ${ra}`, sub: `About ${f.now.getFullYear() + (ra - age)}, from the age you set in the Retirement planner`, changes: [], route: '/tools/retirement' });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
