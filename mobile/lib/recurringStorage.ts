import AsyncStorage from '@react-native-async-storage/async-storage';
import { Kind } from '@/lib/budget';
import { Recurring, dueEntries, resumeLastRun } from '@/lib/recurring';
import { loadTransactions, addTransactionsBatch } from '@/lib/txnStorage';

// Mobile-only: the website has no recurring-entries store.
export const RECURRING_KEY = 'finos_recurring_v1';

let chain: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

const isRecurring = (r: any): r is Recurring =>
  r && typeof r.id === 'string' && ['expense', 'income', 'saving'].includes(r.kind) && Number(r.amount) > 0 && Number.isInteger(r.day) && typeof r.startDate === 'string';

export async function loadRecurring(): Promise<Recurring[]> {
  try {
    const v = JSON.parse((await AsyncStorage.getItem(RECURRING_KEY)) ?? '[]');
    return Array.isArray(v) ? v.filter(isRecurring) : [];
  } catch {
    return [];
  }
}
const writeAll = (list: Recurring[]) => AsyncStorage.setItem(RECURRING_KEY, JSON.stringify(list));

export interface RecurringInput { kind: Kind; amount: number; category: string; label: string; day: number; startDate: string; lastRun?: string | null }

const newId = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

export function addRecurring(input: RecurringInput): Promise<string> {
  return exclusive(async () => {
    const list = await loadRecurring();
    const id = newId();
    list.push({ id, ...input, lastRun: input.lastRun ?? null, active: true });
    await writeAll(list);
    return id;
  });
}

export function updateRecurring(id: string, patch: Partial<Omit<Recurring, 'id'>>, now = new Date()): Promise<boolean> {
  return exclusive(async () => {
    const list = await loadRecurring();
    const i = list.findIndex(r => r.id === id);
    if (i < 0) return false;
    const next = { ...list[i], ...patch };
    // Switching back on must not back-fill what was missed while it was off
    if (patch.active === true && !list[i].active) next.lastRun = resumeLastRun(next, now);
    list[i] = next;
    await writeAll(list);
    return true;
  });
}

export function removeRecurring(id: string): Promise<boolean> {
  return exclusive(async () => {
    const list = await loadRecurring();
    const next = list.filter(r => r.id !== id);
    if (next.length === list.length) return false;
    await writeAll(next);
    return true;
  });
}

let inFlight: Promise<number> | null = null;

/**
 * Create any recurring entries that have come due. Safe to call often and from several places:
 * concurrent calls share one run, entry ids are deterministic (item+month) so a repeat can never
 * duplicate, and entries are written BEFORE the schedule advances — a crash in between just
 * means the next run finds them already there. Returns how many entries were created.
 */
export function syncRecurring(now = new Date()): Promise<number> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const items = await loadRecurring();
      if (!items.some(r => r.active)) return 0;
      const existing = new Set((await loadTransactions()).map(t => t.id));

      const plans = items.map(item => ({ item, ...dueEntries(item, now, existing) }));
      const entries = plans.flatMap(p => p.entries.map(e => ({
        id: e.id, date: e.date, amount: p.item.amount, kind: p.item.kind, category: p.item.category, label: p.item.label, source: 'recurring',
      })));
      const added = await addTransactionsBatch(entries);

      // Advance schedules against a FRESH read, so an edit made while we worked isn't overwritten
      const advance = new Map(plans.filter(p => p.lastRun !== p.item.lastRun).map(p => [p.item.id, p.lastRun] as const));
      if (advance.size) {
        await exclusive(async () => {
          const fresh = await loadRecurring();
          await writeAll(fresh.map(r => (advance.has(r.id) ? { ...r, lastRun: advance.get(r.id)! } : r)));
        });
      }
      return added;
    } catch {
      return 0;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
