import AsyncStorage from '@react-native-async-storage/async-storage';
import { IndexedTxn, Kind, normalizeAll, toRaw } from '@/lib/budget';

// Same key the website uses. The array can hold records from the website, bank sync and the voice
// journal in other shapes, so edits operate on the RAW array by index and never rewrite foreign records.
export const TXN_KEY = 'finos_transactions';

// Writes are read-modify-write on a single key — serialise them so two quick taps can't lose an entry.
let chain: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

async function readRaw(): Promise<any[]> {
  try {
    const v = JSON.parse((await AsyncStorage.getItem(TXN_KEY)) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
const writeRaw = (raw: any[]) => AsyncStorage.setItem(TXN_KEY, JSON.stringify(raw));

export interface TxnInput { date: string; amount: number; kind: Kind; category: string; label: string }

const newId = () => `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export async function loadTransactions(): Promise<IndexedTxn[]> {
  return normalizeAll(await readRaw());
}

export function addTransaction(e: TxnInput): Promise<string> {
  return exclusive(async () => {
    const raw = await readRaw();
    const id = newId();
    raw.push(toRaw({ id, ...e }));
    await writeRaw(raw);
    return id;
  });
}

/** Add several entries at once, skipping any id that already exists (so re-running a recurring sync can't duplicate). Returns how many were added. */
export function addTransactionsBatch(entries: (TxnInput & { id: string; source?: string })[]): Promise<number> {
  return exclusive(async () => {
    if (!entries.length) return 0;
    const raw = await readRaw();
    const have = new Set(normalizeAll(raw).map(t => t.id));
    let added = 0;
    for (const e of entries) {
      if (have.has(e.id)) continue;
      raw.push(toRaw(e));
      have.add(e.id);
      added++;
    }
    if (added) await writeRaw(raw);
    return added;
  });
}

export function updateTransaction(id: string, e: TxnInput): Promise<boolean> {
  return exclusive(async () => {
    const raw = await readRaw();
    const hit = normalizeAll(raw).find(t => t.id === id);
    if (!hit) return false;
    raw[hit.i] = toRaw({ id, ...e });
    await writeRaw(raw);
    return true;
  });
}

export function removeTransaction(id: string): Promise<boolean> {
  return exclusive(async () => {
    const raw = await readRaw();
    const hit = normalizeAll(raw).find(t => t.id === id);
    if (!hit) return false;
    raw.splice(hit.i, 1);
    await writeRaw(raw);
    return true;
  });
}
