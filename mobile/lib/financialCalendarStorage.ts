// The person's own calendar dates, on the device. Same tracker-sync rules as every other finos_ key (it is their own data).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { normaliseCustom, MAX_CUSTOM, type CustomEvent } from '@/lib/financialCalendar';
import { asList, keepIfUnreadable } from '@/lib/safeStore';

export const CUSTOM_EVENTS_KEY = 'finos_calendar_custom_events';

async function readStrict(): Promise<CustomEvent[]> {
  return normaliseCustom(asList(await AsyncStorage.getItem(CUSTOM_EVENTS_KEY)));
}
export async function loadCustomEvents(): Promise<CustomEvent[]> {
  try { return await readStrict(); } catch { return []; }
}
const put = async (list: CustomEvent[]) => { await keepIfUnreadable(CUSTOM_EVENTS_KEY, 'array'); await AsyncStorage.setItem(CUSTOM_EVENTS_KEY, JSON.stringify(list)); };

// read-modify-write on one key: serialise so two quick taps cannot lose a change
let chain: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> { const run = chain.then(fn, fn); chain = run.catch(() => undefined); return run; }

const newId = () => `ce_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

export function addCustomEvent(e: Omit<CustomEvent, 'id'>): Promise<{ ok: boolean; id?: string; error?: string }> {
  return exclusive(async () => {
    const list = await readStrict();
    if (list.length >= MAX_CUSTOM) return { ok: false, error: `You can keep up to ${MAX_CUSTOM} dates.` };
    const id = newId();
    await put([...list, { ...e, id }]);
    return { ok: true, id };
  });
}

export function updateCustomEvent(id: string, e: Omit<CustomEvent, 'id'>): Promise<boolean> {
  return exclusive(async () => {
    const list = await readStrict();
    if (!list.some(x => x.id === id)) return false;
    await put(list.map(x => (x.id === id ? { ...e, id } : x)));
    return true;
  });
}

export function removeCustomEvent(id: string): Promise<boolean> {
  return exclusive(async () => {
    const list = await readStrict();
    const next = list.filter(x => x.id !== id);
    if (next.length === list.length) return false;
    await put(next);
    return true;
  });
}
