// Fixed-income entries on the device: same key and shape as the website (finos_fd_portfolio), plus the two derived totals the rest of
// FIN-OS reads (finos_fd_value, finos_fd_principal). Writes are serialised so two quick taps cannot lose a change.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FD_KEY, safeTotals as totals, type FDEntry } from '@/lib/fixedIncome';
import { asList, isPlainObject, scalarsOnly, text, finite, keepIfUnreadable } from '@/lib/safeStore';

let chain: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

const STR_FIELDS = ['label', 'bank', 'nominee', 'addedAt', 'maturityDate'] as const;
const NUM_FIELDS = ['rate', 'principal', 'monthlyAmount', 'annualAmount', 'termMonths', 'maturityValue'] as const;

/** One stored entry made safe to compute with: required fields must be strings, text fields are text, amounts are finite numbers
 *  (a bad amount is left out, never guessed). Fields this app does not know are carried through so the website's data survives a save. */
function clean(e: unknown): FDEntry | null {
  if (!isPlainObject(e)) return null;
  if (typeof e.id !== 'string' || typeof e.type !== 'string' || typeof e.startDate !== 'string') return null;
  if (!Number.isFinite(Date.parse(e.startDate))) return null;
  const out: Record<string, unknown> = { ...scalarsOnly(e), id: e.id, type: e.type, startDate: e.startDate };
  for (const k of STR_FIELDS) if (k in out) out[k] = text(e[k]);
  for (const k of NUM_FIELDS) if (k in out) { const n = finite(e[k], NaN); if (Number.isFinite(n)) out[k] = n; else delete out[k]; }
  return out as unknown as FDEntry;
}

/** Strict read: throws only when storage itself fails (so a write never goes ahead on a read that did not happen). */
async function readStrict(): Promise<FDEntry[]> {
  return asList(await AsyncStorage.getItem(FD_KEY)).map(clean).filter((e): e is FDEntry => e !== null);
}

export async function loadFD(): Promise<FDEntry[]> {
  try { return await readStrict(); } catch { return []; }
}

async function writeAll(list: FDEntry[], now: Date) {
  const t = totals(list, now);
  await keepIfUnreadable(FD_KEY, 'array');
  await AsyncStorage.multiSet([
    [FD_KEY, JSON.stringify(list)],
    ['finos_fd_value', t.currentValue.toString()],
    ['finos_fd_principal', t.principal.toString()],
  ]);
}

export function addFD(entry: FDEntry, now = new Date()): Promise<FDEntry[]> {
  return exclusive(async () => {
    const list = [...(await readStrict()), entry];
    await writeAll(list, now);
    return list;
  });
}

export function removeFD(id: string, now = new Date()): Promise<FDEntry[]> {
  return exclusive(async () => {
    const list = (await readStrict()).filter(e => e.id !== id);
    await writeAll(list, now);
    return list;
  });
}
