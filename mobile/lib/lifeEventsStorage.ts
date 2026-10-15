// The life events a person declared, on this phone. The key starts with `finos_session_` so tracker sync never uploads it
// (see lib/aryaMemoryStorage.ts); it is still exported and backed up with the rest of the person's data.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type DeclaredEvent, normaliseEvents, addEvent, removeEvent } from '@/lib/lifeEvents';
import { keepIfUnreadable } from '@/lib/safeStore';

export const LIFE_KEY = 'finos_session_arya_life_v1';

let chain: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

async function readStrict(now: number): Promise<DeclaredEvent[]> { return normaliseEvents(await AsyncStorage.getItem(LIFE_KEY), now); }
export async function loadLifeEvents(now: number = Date.now()): Promise<DeclaredEvent[]> {
  try { return await readStrict(now); } catch { return []; }
}
const put = async (list: DeclaredEvent[]) => { await keepIfUnreadable(LIFE_KEY, 'array'); await AsyncStorage.setItem(LIFE_KEY, JSON.stringify(list)); };

export const declareLifeEvent = (type: string, date: string, now: number = Date.now()) => exclusive(async () => {
  const cur = await readStrict(now);
  const r = addEvent(cur, type, date, now);
  if (r.event) { try { await put(r.list); } catch { /* not kept */ } }
  return r;
});

export const deleteLifeEvent = (id: string, now: number = Date.now()) => exclusive(async () => {
  const next = removeEvent(await readStrict(now), id);
  try { await put(next); } catch { /* not kept */ }
  return next;
});

export const clearLifeEvents = () => exclusive(async () => { try { await AsyncStorage.removeItem(LIFE_KEY); } catch { /* ignore */ } });
