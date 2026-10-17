import AsyncStorage from '@react-native-async-storage/async-storage';
import { type IndexedTxn, type Kind, normalizeAll, toRaw } from '@/lib/budget';
import { toLedger, mergeLedger, undoBatch } from '@/lib/statementImport';
import { asList, keepIfUnreadable } from '@/lib/safeStore';
import { clearTrackerStorageStatus, setTrackerStorageStatus } from '@/lib/trackerStorageStatus';

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

/** Strict read for writers: throws only when storage itself fails, so nothing is written on a read that did not happen. */
async function readRawStrict(): Promise<any[]> {
  try {
    const raw = await AsyncStorage.getItem(TXN_KEY);
    clearTrackerStorageStatus();
    return asList(raw);
  } catch {
    setTrackerStorageStatus({ kind: 'load', message: 'Could not load your saved transactions. No empty ledger has been substituted; retry before editing.' });
    throw new Error('Could not load transactions.');
  }
}
/** Read used for previews and history; storage failures remain failures instead of appearing as an empty ledger. */
async function readRaw(): Promise<any[]> {
  try { return await readRawStrict(); }
  catch { return []; } // callers keep the documented non-throwing reader contract; the screen shows the shared load error
}
/** A ledger that could not be read is kept aside (finos_sync_never_corrupt_transactions) before the next save replaces it. */
const writeRaw = async (raw: any[]) => {
  try {
    await keepIfUnreadable(TXN_KEY, 'array');
    await AsyncStorage.setItem(TXN_KEY, JSON.stringify(raw));
    clearTrackerStorageStatus();
  } catch {
    setTrackerStorageStatus({ kind: 'save', message: 'Could not save your transaction change. Your last saved ledger is still in place; try again.' });
    throw new Error('Could not save transactions.');
  }
};

export interface TxnInput { date: string; amount: number; kind: Kind; category: string; label: string }

const newId = () => `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export async function loadTransactions(): Promise<IndexedTxn[]> {
  try { return normalizeAll(await readRawStrict()); }
  catch { return []; } // status is set by readRawStrict; the screens render the shared storage notice instead of this empty fallback
}

export function addTransaction(e: TxnInput): Promise<string> {
  return exclusive(async () => {
    const raw = await readRawStrict();
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
    const raw = await readRawStrict();
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
    const raw = await readRawStrict();
    const hit = normalizeAll(raw).find(t => t.id === id);
    if (!hit) return false;
    raw[hit.i] = toRaw({ id, ...e });
    await writeRaw(raw);
    return true;
  });
}

export function removeTransaction(id: string): Promise<boolean> {
  return exclusive(async () => {
    const raw = await readRawStrict();
    const hit = normalizeAll(raw).find(t => t.id === id);
    if (!hit) return false;
    raw.splice(hit.i, 1);
    await writeRaw(raw);
    return true;
  });
}

// ── Bank statement import ────────────────────────────────────────────────────
// Imported rows are stored in the website's ledger shape ({ id, type:'credit'|'debit', desc, category, date, src:'import', batch })
// so the website reads them unchanged. Merging never duplicates what is already there, and a batch can be undone as a whole.

export interface ImportRow { date: string; desc: string; type: 'credit' | 'debit'; amount: number; balance?: number | null; ref?: string | null }
export interface ImportBatchInfo { batch: string; count: number; from: string; to: string }

/** Add statement rows. Returns how many were new and how many were already there. */
export function importStatementRows(rows: ImportRow[], batch = `imp_${Date.now().toString(36)}`): Promise<{ added: number; duplicates: number; batch: string }> {
  return exclusive(async () => {
    const raw = await readRawStrict();
    const { merged, added, duplicates } = mergeLedger(raw, toLedger(rows, { batch }));
    if (added) await writeRaw(merged);
    return { added, duplicates, batch };
  });
}

/** Before saving: how many of these rows are new and how many are already in the list (nothing is written). */
export async function previewImport(rows: ImportRow[]): Promise<{ added: number; duplicates: number }> {
  const { added, duplicates } = mergeLedger(await readRaw(), toLedger(rows, { batch: 'preview' }));
  return { added, duplicates };
}

/** Remove everything one import added. Returns how many records were removed. */
export function undoImportBatch(batch: string): Promise<number> {
  return exclusive(async () => {
    const raw = await readRawStrict();
    const next = undoBatch(raw, batch);
    const removed = raw.length - next.length;
    if (removed) await writeRaw(next);
    return removed;
  });
}

export async function listImportBatches(): Promise<ImportBatchInfo[]> {
  const by = new Map<string, ImportBatchInfo>();
  for (const t of await readRaw()) {
    if (!t || t.src !== 'import' || typeof t.batch !== 'string') continue;
    const day = String(t.date ?? '').slice(0, 10);
    const b = by.get(t.batch) ?? { batch: t.batch, count: 0, from: day, to: day };
    b.count++;
    if (day && (!b.from || day < b.from)) b.from = day;
    if (day && day > b.to) b.to = day;
    by.set(t.batch, b);
  }
  return [...by.values()].sort((a, b) => (a.to < b.to ? 1 : -1));
}
