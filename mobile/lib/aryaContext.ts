// Exactly what leaves the phone with a chat message to Arya, built in ONE place so the "What Arya will be told" screen and the
// chat hook cannot disagree: the hook sends `body`, the screen lists `disclosures`, both come from this function.
//
// Rules, all enforced here and tested:
//   - an unrecorded figure is left out (never sent as 0);
//   - the person's switches decide: online off -> nothing is sent at all; figures / memory / life events each have their own switch;
//   - memory notes marked "keep on this phone", notes that read like an instruction, and expired notes are never included;
//   - nothing else leaves: no transactions, no policy numbers, no account details.
import { type ArFacts, netWorthKnown, holdingsValue } from '@/lib/aryaFacts';
import { type MemoryItem, selectForPrompt, buildBlock, prune, LIMITS } from '@/lib/aryaMemory';
import { type DeclaredEvent, contextLine, phaseOf, DEFS } from '@/lib/lifeEvents';
import type { AryaPrefs } from '@/lib/aryaMemoryStorage';

export type Group = 'question' | 'figures' | 'memory' | 'life';
export interface Disclosure { id: string; group: Group; label: string; value: string; sent: boolean; why: string | null }
export interface ChatPayload { message: string; context: Record<string, string | number> }
export interface Built { body: ChatPayload | null; disclosures: Disclosure[]; leaves: boolean }

const WITHHELD_WHY: Record<string, string> = {
  local: 'marked "keep on this phone only"',
  instruction: 'reads like an instruction to a model, or holds a secret, so it is never passed on',
  expired: 'has expired',
  'not-relevant': 'not relevant to this question',
};

const rupees = (n: number) => (n < 0 ? '−' : '') + '₹' + Math.round(Math.abs(n)).toLocaleString('en-IN');

export function buildChatContext(f: ArFacts, prefs: AryaPrefs, memory: MemoryItem[], events: DeclaredEvent[], question: string, nowMs: number = f.now.getTime()): Built {
  const msg = String(question ?? '').trim();
  const d: Disclosure[] = [];
  const off = !prefs.online ? 'Arya is set to stay on this phone, so nothing is sent.' : null;
  const ctx: Record<string, string | number> = {};

  d.push({ id: 'message', group: 'question', label: 'Your question, as you typed it', value: msg || '(nothing yet)', sent: !off, why: off });

  // figures: what the app has always sent, each only when recorded
  const fig = (id: string, label: string, key: string, value: number | string | null, text: string) => {
    if (value === null) { d.push({ id, group: 'figures', label, value: 'Not recorded, so not sent', sent: false, why: null }); return; }
    if (off) { d.push({ id, group: 'figures', label, value: text, sent: false, why: off }); return; }
    if (!prefs.figures) { d.push({ id, group: 'figures', label, value: text, sent: false, why: 'The "figures" switch is off' }); return; }
    ctx[key] = value;
    d.push({ id, group: 'figures', label, value: text, sent: true, why: null });
  };
  const c = f.computed;
  const name = f.data.name.trim();
  fig('name', 'Your name', 'name', name ? name : null, name);
  fig('income', 'Monthly income', 'monthlyIncome', c.budget.income > 0 ? Math.round(c.budget.income) : null, rupees(c.budget.income));
  fig('expense', 'Monthly spending', 'monthlyExpense', c.budget.expense > 0 ? Math.round(c.budget.expense) : null, rupees(c.budget.expense));
  fig('networth', 'Net worth', 'netWorth', netWorthKnown(f) ? Math.round(c.netWorth.netWorth) : null, rupees(c.netWorth.netWorth));
  const hv = holdingsValue(f);
  fig('portfolio', 'Portfolio value', 'portfolioValue', hv > 0 ? Math.round(hv) : null, rupees(hv));
  fig('sip', 'Monthly SIPs', 'monthlySIP', f.data.monthlySip > 0 ? Math.round(f.data.monthlySip) : null, rupees(f.data.monthlySip));
  const tracked = (netWorthKnown(f) || c.budget.income > 0 || c.budget.expense > 0 || c.emergency.fund > 0 || c.goals.items.length > 0) && c.health.pillars.some(p => !p.untracked);
  fig('health', 'Health score', 'healthScore', tracked ? c.health.total : null, `${c.health.total} out of 100`);

  // memory
  const sel = selectForPrompt(prune(memory, nowMs), msg, nowMs);
  if (!memory.length) d.push({ id: 'mem-none', group: 'memory', label: 'Memory', value: 'Nothing is remembered', sent: false, why: null });
  else if (off || !prefs.memory) {
    const why = off ?? 'The "memory" switch is off';
    d.push({ id: 'mem-off', group: 'memory', label: 'Memory', value: `${memory.length} note${memory.length === 1 ? '' : 's'} on this phone, none sent`, sent: false, why });
  } else {
    const lines = buildBlock(sel, nowMs);
    const picked = [...sel.topics, ...sel.facts];
    picked.forEach((it, i) => d.push({ id: `mem-${it.id}`, group: 'memory', label: it.kind === 'topic' ? 'Topic you asked about' : 'A note you gave', value: lines[i] ?? it.text, sent: true, why: null }));
    if (picked.length) ctx.memory = lines.join(' | ');
    sel.withheld.filter(w => w.reason !== 'not-relevant').forEach(w => d.push({ id: `mem-${w.item.id}`, group: 'memory', label: 'Note kept back', value: w.item.text, sent: false, why: WITHHELD_WHY[w.reason] }));
    const spare = sel.withheld.filter(w => w.reason === 'not-relevant').length;
    if (spare) d.push({ id: 'mem-spare', group: 'memory', label: 'Other notes', value: `${spare} more, not relevant to this question`, sent: false, why: `At most ${LIMITS.promptTopics} topics and ${LIMITS.promptFacts} notes go with a question` });
  }

  // life events
  const live = events.filter(e => phaseOf(e, new Date(nowMs)) !== 'past');
  if (!events.length) d.push({ id: 'life-none', group: 'life', label: 'Life events', value: 'None declared', sent: false, why: null });
  else if (off || !prefs.lifeEvents) {
    const why = off ?? 'The "life events" switch is off';
    d.push({ id: 'life-off', group: 'life', label: 'Life events', value: `${events.length} declared on this phone, none sent`, sent: false, why });
  } else if (!live.length) d.push({ id: 'life-past', group: 'life', label: 'Life events', value: 'All declared events are in the past, so none is sent', sent: false, why: null });
  else {
    const line = contextLine(events, new Date(nowMs));
    ctx.lifeEvents = line;
    live.slice(0, 5).forEach(e => d.push({ id: `life-${e.id}`, group: 'life', label: DEFS[e.type].label, value: `${e.date.slice(0, 7)} (the month only, not the day)`, sent: true, why: null }));
  }

  if (off) return { body: null, disclosures: d, leaves: false };
  return { body: { message: msg, context: ctx }, disclosures: d, leaves: true };
}
