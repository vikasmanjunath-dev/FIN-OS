// The life events a person declared, on this phone. The key starts with `finos_session_` so tracker sync never uploads it
// (see lib/aryaMemoryStorage.ts); it is still exported and backed up with the rest of the person's data.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type DeclaredEvent, normaliseEvents, addEvent, removeEvent } from '@/lib/lifeEvents';

export const LIFE_KEY = 'finos_session_arya_life_v1';

let chain: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

export async function loadLifeEvents(now: number = Date.now()): Promise<DeclaredEvent[]> {
  try { return normaliseEvents(await AsyncStorage.getItem(LIFE_KEY), now); } catch { return []; }
}

export const declareLifeEvent = (type: string, date: string, now: number = Date.now()) => exclusive(async () => {
  const cur = await loadLifeEvents(now);
  const r = addEvent(cur, type, date, now);
  if (r.event) { try { await AsyncStorage.setItem(LIFE_KEY, JSON.stringify(r.list)); } catch { /* not kept */ } }
  return r;
});

export const deleteLifeEvent = (id: string, now: number = Date.now()) => exclusive(async () => {
  const next = removeEvent(await loadLifeEvents(now), id);
  try { await AsyncStorage.setItem(LIFE_KEY, JSON.stringify(next)); } catch { /* not kept */ }
  return next;
});

export const clearLifeEvents = () => exclusive(async () => { try { await AsyncStorage.removeItem(LIFE_KEY); } catch { /* ignore */ } });
