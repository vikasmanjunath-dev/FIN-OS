// Arya's memory, life events and chat privacy switches, on this phone.
//
// Key names: they start with `finos_session_` on purpose. The tracker sync (lib/trackerSync.ts, js/finos-tracker-sync.js) never
// uploads keys with that prefix, so what Arya remembers about you, and the life events you told it, cannot reach the cloud through
// sync. The same keys are still exported and backed up by Privacy & your data / App lock and backup, so the person keeps them.
// __tests__/aryaMemory.test.mts asserts both facts.
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  type MemoryItem, type AddInput, type AddResult, type EditPatch,
  normaliseStore, prune, addNote, editNote, removeNote, clearAuto, noteTopic, detectTopics,
} from '@/lib/aryaMemory';
import { keepIfUnreadable } from '@/lib/safeStore';

export const MEMORY_KEY = 'finos_session_arya_memory_v1';
export const PREFS_KEY = 'finos_session_arya_prefs_v1';

/** What leaves the phone with a chat message, and what is kept. Everything the person can switch. */
export interface AryaPrefs {
  /** false: Arya never contacts the backend; questions are answered on the phone or not at all. */
  online: boolean;
  /** send name, income, spending, net worth, portfolio value, SIP total and health score as context (what the app always did) */
  figures: boolean;
  /** send up to 3 topics and 4 notes from memory as context. Off until the person turns it on. */
  memory: boolean;
  /** send the life events the person declared (type and month only). Off until the person turns it on. */
  lifeEvents: boolean;
  /** note the topic of a question in memory ("Asked about tax saving"). */
  record: boolean;
}
export const DEFAULT_PREFS: AryaPrefs = { online: true, figures: true, memory: false, lifeEvents: false, record: true };

export function normalisePrefs(raw: unknown): AryaPrefs {
  let o: any = raw;
  if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch { o = null; } }
  const b = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  if (!o || typeof o !== 'object') return { ...DEFAULT_PREFS };
  return { online: b(o.online, DEFAULT_PREFS.online), figures: b(o.figures, DEFAULT_PREFS.figures), memory: b(o.memory, DEFAULT_PREFS.memory),
    lifeEvents: b(o.lifeEvents, DEFAULT_PREFS.lifeEvents), record: b(o.record, DEFAULT_PREFS.record) };
}

// Read-modify-write on one key: serialise so two quick taps cannot lose a change.
let chain: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

/** `failed` is true when storage itself could not be read: writers then change nothing (they must not replace what they could not see). */
async function readItems(now: number): Promise<{ items: MemoryItem[]; changed: boolean; failed?: boolean }> {
  let raw: string | null = null;
  try { raw = await AsyncStorage.getItem(MEMORY_KEY); } catch { return { items: [], changed: false, failed: true }; }
  if (raw == null) return { items: [], changed: false };
  const all = normaliseStore(raw, now);
  const live = prune(all, now);
  return { items: live, changed: live.length !== all.length };
}

async function write(items: MemoryItem[]) {
  try { await keepIfUnreadable(MEMORY_KEY, 'array'); await AsyncStorage.setItem(MEMORY_KEY, JSON.stringify(items)); } catch { /* storage unavailable: the note is simply not kept */ }
}

/** Everything remembered (expired topics are dropped and the cleanup is saved). */
export async function loadMemory(now: number = Date.now()): Promise<MemoryItem[]> {
  const { items, changed } = await readItems(now);
  if (changed) exclusive(async () => { const again = await readItems(now); if (!again.failed) await write(again.items); }).catch(() => {});
  return items;
}

export const addMemoryNote = (input: AddInput, now: number = Date.now()): Promise<AddResult> => exclusive(async () => {
  const { items, failed } = await readItems(now);
  if (failed) return { items: [], item: null, status: 'rejected', reason: 'Could not read what is saved, so nothing was changed.' } as AddResult;
  const r = addNote(items, input, now);
  if (r.status !== 'rejected') await write(r.items);
  return r;
});

export const editMemoryNote = (id: string, patch: EditPatch, now: number = Date.now()): Promise<AddResult> => exclusive(async () => {
  const { items, failed } = await readItems(now);
  if (failed) return { items: [], item: null, status: 'rejected', reason: 'Could not read what is saved, so nothing was changed.' } as AddResult;
  const r = editNote(items, id, patch, now);
  if (r.status !== 'rejected') await write(r.items);
  return r;
});

export const deleteMemoryNote = (id: string, now: number = Date.now()): Promise<MemoryItem[]> => exclusive(async () => {
  const { items, failed } = await readItems(now);
  if (failed) return items;
  const next = removeNote(items, id);
  await write(next);
  return next;
});

export const clearAutoMemory = (now: number = Date.now()): Promise<MemoryItem[]> => exclusive(async () => {
  const { items, failed } = await readItems(now);
  if (failed) return items;
  const next = clearAuto(items);
  await write(next);
  return next;
});

/** Forget everything (notes you gave and topics). */
export const clearMemory = (): Promise<void> => exclusive(async () => { try { await AsyncStorage.removeItem(MEMORY_KEY); } catch { /* ignore */ } });

export async function loadPrefs(): Promise<AryaPrefs> {
  try { return normalisePrefs(await AsyncStorage.getItem(PREFS_KEY)); } catch { return { ...DEFAULT_PREFS }; }
}
export const savePrefs = (patch: Partial<AryaPrefs>): Promise<AryaPrefs> => exclusive(async () => {
  const next = { ...(await loadPrefs()), ...patch };
  try { await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* keep going */ }
  return next;
});

/** Remembers the topics a question touched (only a fixed label, never the question) when the person has not turned that off. */
export async function noteQuestionTopics(text: string, now: number = Date.now()): Promise<string[]> {
  const topics = detectTopics(text);
  if (!topics.length) return [];
  const prefs = await loadPrefs();
  if (!prefs.record) return [];
  await exclusive(async () => {
    const read = await readItems(now);
    if (read.failed) return;
    let { items } = read;
    for (const t of topics) items = noteTopic(items, t, now);
    await write(items);
  });
  return topics;
}
