// Couple finance data on the device. Another person's figures are in here, so the key is deliberately one the cloud tracker sync
// never touches: the `finos_sync_` prefix is on that sync's exclusion list (lib/trackerSync.ts). The data never leaves the phone
// except in an export or an encrypted backup the owner makes, and Clear All Data removes it.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getMany } from '@/lib/safeStore';
import { normaliseState, EMPTY_COUPLE, type CoupleState } from '@/lib/couple';

export const COUPLE_KEY = 'finos_sync_never_couple_v1';

export async function loadCouple(): Promise<{ state: CoupleState; saved: boolean; recorded: { income: number | null; expense: number | null } }> {
  let got: Record<string, string | null> = {};
  try { got = await getMany([COUPLE_KEY, 'finos_monthly_income', 'finos_monthly_expense']); } catch { /* blank */ }
  const n = (v: string | null | undefined) => { const x = parseFloat(v ?? ''); return Number.isFinite(x) && x > 0 ? x : null; };
  let state = EMPTY_COUPLE, saved = false;
  try { if (got[COUPLE_KEY]) { state = normaliseState(JSON.parse(got[COUPLE_KEY] as string)); saved = true; } } catch { state = EMPTY_COUPLE; }
  return { state, saved, recorded: { income: n(got.finos_monthly_income), expense: n(got.finos_monthly_expense) } };
}

export const saveCouple = (s: CoupleState) => AsyncStorage.setItem(COUPLE_KEY, JSON.stringify(s)).catch(() => {});
export const clearCouple = () => AsyncStorage.removeItem(COUPLE_KEY).catch(() => {});
