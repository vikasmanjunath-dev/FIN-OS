// What the funds screens keep on this phone: the funds the person looked at (so a held or recently seen fund still shows its last NAV,
// marked with its date, when the backend is unreachable) and the compare tray. Mobile-only keys; both ride along in the backup.
import AsyncStorage from '@react-native-async-storage/async-storage';
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

export async function loadRecent(): Promise<RecentFund[]> {
  try { return normaliseRecent(JSON.parse((await AsyncStorage.getItem(RECENT_KEY)) ?? '[]')); } catch { return []; }
}

/** Remembers a fund the person opened. Storage trouble is swallowed: this is only a convenience. */
export function rememberFund(rec: FundRecord, now = new Date()): Promise<RecentFund[]> {
  return exclusive(async () => {
    try {
      const next = pushRecent(await loadRecent(), rec, now);
      await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next));
      return next;
    } catch { return []; }
  });
}

export async function loadTray(): Promise<string[]> {
  try {
    const v = JSON.parse((await AsyncStorage.getItem(TRAY_KEY)) ?? '[]');
    return Array.isArray(v) ? [...new Set(v.map(String).filter(c => /^\d{3,8}$/.test(c)))].slice(0, MAX_FUNDS) : [];
  } catch { return []; }
}

export function toggleInTray(code: string): Promise<{ codes: string[]; full: boolean }> {
  return exclusive(async () => {
    const r = toggleTray(await loadTray(), code);
    try { await AsyncStorage.setItem(TRAY_KEY, JSON.stringify(r.codes)); } catch { /* keep going */ }
    return r;
  });
}

export function clearTray(): Promise<void> {
  return exclusive(async () => { try { await AsyncStorage.setItem(TRAY_KEY, '[]'); } catch { /* ignore */ } });
}

/** The raw stored transactions, read only (the website's SIP calendar reads the same key the same way). */
export async function loadRawTransactions(): Promise<unknown[]> {
  try {
    const v = JSON.parse((await AsyncStorage.getItem(TXN_KEY)) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
