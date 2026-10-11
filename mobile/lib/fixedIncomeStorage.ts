// Fixed-income entries on the device: same key and shape as the website (finos_fd_portfolio), plus the two derived totals the rest of
// FIN-OS reads (finos_fd_value, finos_fd_principal). Writes are serialised so two quick taps cannot lose a change.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FD_KEY, totals, type FDEntry } from '@/lib/fixedIncome';

let chain: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

const VALID = (e: any): e is FDEntry => e && typeof e === 'object' && typeof e.id === 'string' && typeof e.type === 'string' && typeof e.startDate === 'string';

export async function loadFD(): Promise<FDEntry[]> {
  try {
    const list = JSON.parse((await AsyncStorage.getItem(FD_KEY)) ?? '[]');
    return Array.isArray(list) ? list.filter(VALID) : [];
  } catch {
    return [];
  }
}

async function writeAll(list: FDEntry[], now: Date) {
  const t = totals(list, now);
  await AsyncStorage.multiSet([
    [FD_KEY, JSON.stringify(list)],
    ['finos_fd_value', t.currentValue.toString()],
    ['finos_fd_principal', t.principal.toString()],
  ]);
}

export function addFD(entry: FDEntry, now = new Date()): Promise<FDEntry[]> {
  return exclusive(async () => {
    const list = [...(await loadFD()), entry];
    await writeAll(list, now);
    return list;
  });
}

export function removeFD(id: string, now = new Date()): Promise<FDEntry[]> {
  return exclusive(async () => {
    const list = (await loadFD()).filter(e => e.id !== id);
    await writeAll(list, now);
    return list;
  });
}
