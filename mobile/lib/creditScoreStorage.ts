// Credit score inputs on the device: the website's keys, written only for what the person typed.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { KEYS, type CreditResult } from '@/lib/creditScore';

export interface CreditFields { score: string; util: string; late: string; inquiries: string }
export const EMPTY: CreditFields = { score: '', util: '', late: '', inquiries: '' };

export async function loadCredit(): Promise<CreditFields> {
  const got = Object.fromEntries(await AsyncStorage.multiGet([KEYS.score, KEYS.util, KEYS.late, KEYS.inquiries]));
  const s = (k: string) => { const v = got[k]; return v == null ? '' : String(v).replace(/^"|"$/g, ''); };
  return { score: s(KEYS.score), util: s(KEYS.util), late: s(KEYS.late), inquiries: s(KEYS.inquiries) };
}

export async function saveCredit(f: CreditFields, r: CreditResult | null): Promise<void> {
  const writes: [string, string][] = [];
  if (r) {
    writes.push([KEYS.score, f.score.trim()], [KEYS.health, r.health]);
    if (f.util.trim() !== '') writes.push([KEYS.util, f.util.trim()]);
    if (f.late.trim() !== '') writes.push([KEYS.late, f.late.trim()]);
    if (f.inquiries.trim() !== '') writes.push([KEYS.inquiries, f.inquiries.trim()]);
  }
  if (writes.length) await AsyncStorage.multiSet(writes);
}
