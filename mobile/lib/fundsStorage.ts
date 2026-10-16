// What the funds screens keep on this phone: the funds the person looked at (so a held or recently seen fund still shows its last NAV,
// marked with its date, when the backend is unreachable) and the compare tray. Mobile-only keys; both ride along in the backup.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { keepIfUnreadable, asList } from './safeStore.ts';
import { type FundRecord, type RecentFund, normaliseRecent, pushRecent, toggleTray, MAX_FUNDS } from './funds.ts';

export const RECENT_KEY = 'finos_funds_recent_v1';
export const TRAY_KEY = 'finos_funds_compare_v1';
export const TXN_KEY = 'finos_transactions';

let chain: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

/** Strict read for writers: throws only when storage itself fails (a write must not follow a read that did not happen). */
async function readRecentStrict(): Promise<RecentFund[]> {
  return normaliseRecent(asList(await AsyncStorage.getItem(RECENT_KEY)));
}
export async function loadRecent(): Promise<RecentFund[]> {
  try { return await readRecentStrict(); } catch { return []; }
}

/** Remembers a fund the person opened. Storage trouble is swallowed: this is only a convenience. */
export function rememberFund(rec: FundRecord, now = new Date()): Promise<RecentFund[]> {
  return exclusive(async () => {
    try {
      const next = pushRecent(await readRecentStrict(), rec, now);
      await keepIfUnreadable(RECENT_KEY, 'array');
      await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next));
      return next;
    } catch { return []; }
  });
}

async function readTrayStrict(): Promise<string[]> {
  const v = asList(await AsyncStorage.getItem(TRAY_KEY));
  return [...new Set(v.filter(c => typeof c === 'string' || typeof c === 'number').map(String).filter(c => /^\d{3,8}$/.test(c)))].slice(0, MAX_FUNDS);
}
export async function loadTray(): Promise<string[]> {
  try { return await readTrayStrict(); } catch { return []; }
}

export function toggleInTray(code: string): Promise<{ codes: string[]; full: boolean }> {
  return exclusive(async () => {
    let current: string[];
    try { current = await readTrayStrict(); } catch { return { codes: [], full: false }; }
    const r = toggleTray(current, code);
    try { await keepIfUnreadable(TRAY_KEY, 'array'); await AsyncStorage.setItem(TRAY_KEY, JSON.stringify(r.codes)); } catch { /* keep going */ }
    return r;
  });
}

export function clearTray(): Promise<void> {
  return exclusive(async () => { try { await AsyncStorage.setItem(TRAY_KEY, '[]'); } catch { /* ignore */ } });
}

/** The raw stored transactions, read only (the website's SIP calendar reads the same key the same way). */
export async function loadRawTransactions(): Promise<unknown[]> {
  try { return asList(await AsyncStorage.getItem(TXN_KEY)); } catch { return []; }
}
