// When each holding was bought, kept on this phone only (the cloud holdings table has no such column, so it never syncs).
import AsyncStorage from '@react-native-async-storage/async-storage';

export const DATES_KEY = 'finos_holding_dates';
export type DateMap = Record<string, string>;

const validDate = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

export async function loadDates(): Promise<DateMap> {
  try {
    const raw = JSON.parse((await AsyncStorage.getItem(DATES_KEY)) ?? '{}');
    const out: DateMap = Object.create(null);
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) Object.entries(raw).forEach(([k, v]) => { if (typeof v === 'string' && validDate(v) && k.length <= 100) out[k] = v; });
    return out;
  } catch { return {}; }
}
export const saveDates = (m: DateMap) => AsyncStorage.setItem(DATES_KEY, JSON.stringify(m));
