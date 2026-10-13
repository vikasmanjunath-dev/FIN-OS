import AsyncStorage from '@react-native-async-storage/async-storage';
import { EMPTY_PROFILE, PROFILE_KEYS, type Profile } from '@/lib/profile';

export async function loadProfile(): Promise<Profile> {
  try {
    const g = Object.fromEntries(await AsyncStorage.multiGet(Object.values(PROFILE_KEYS)));
    return { name: g[PROFILE_KEYS.name] ?? '', age: g[PROFILE_KEYS.age] ?? '', income: g[PROFILE_KEYS.income] ?? '', dependents: g[PROFILE_KEYS.dependents] ?? '' };
  } catch { return { ...EMPTY_PROFILE }; }
}

/** Writes the filled fields and removes the emptied ones, so clearing a field clears it everywhere that reads it. */
export async function saveProfile(p: Profile): Promise<void> {
  const set: [string, string][] = [], del: string[] = [];
  (Object.keys(PROFILE_KEYS) as (keyof Profile)[]).forEach(k => { if (p[k] !== '') set.push([PROFILE_KEYS[k], p[k]]); else del.push(PROFILE_KEYS[k]); });
  if (set.length) await AsyncStorage.multiSet(set);
  if (del.length) await AsyncStorage.multiRemove(del);
}
