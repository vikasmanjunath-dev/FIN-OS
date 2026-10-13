// When each holding was bought, kept on this phone only (the cloud holdings table has no such column, so it never syncs).
import AsyncStorage from '@react-native-async-storage/async-storage';

export const DATES_KEY = 'finos_holding_dates';
export type DateMap = Record<string, string>;

export async function loadDates(): Promise<DateMap> {
  try {
    const raw = JSON.parse((await AsyncStorage.getItem(DATES_KEY)) ?? '{}');
    const out: DateMap = {};
    if (raw && typeof raw === 'object') Object.entries(raw).forEach(([k, v]) => { if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) out[k] = v; });
    return out;
  } catch { return {}; }
}
export const saveDates = (m: DateMap) => AsyncStorage.setItem(DATES_KEY, JSON.stringify(m));
