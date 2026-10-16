// Storage side of the first-run flow (AsyncStorage key finos_onboarding_mobile; device-only: never synced, never in a backup).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getMany } from '@/lib/safeStore';
import {
  ONBOARDING_KEY, NEW_STATE, alreadyEstablished, autoOpened, isEstablished, normalise, reopen, shouldAutoOpen, profileWrites,
  type OnboardingState,
} from '@/lib/onboarding';
import type { Profile } from '@/lib/profile';
import { PROFILE_KEYS } from '@/lib/profile';

export async function loadOnboarding(): Promise<OnboardingState> {
  try {
    const raw = await AsyncStorage.getItem(ONBOARDING_KEY);
    return raw == null ? { ...NEW_STATE } : normalise(JSON.parse(raw));
  } catch { return { ...NEW_STATE }; }
}
export async function saveOnboarding(s: OnboardingState): Promise<void> {
  try { await AsyncStorage.setItem(ONBOARDING_KEY, JSON.stringify(s)); } catch { /* the flow still works for this session */ }
}

/** Called once from the entry screen: should the first-run flow open now? Records that it did. */
export async function decideLaunch(now: Date = new Date()): Promise<'onboarding' | 'home'> {
  try {
    const raw = await AsyncStorage.getItem(ONBOARDING_KEY);
    if (raw == null) {
      if (isEstablished(await AsyncStorage.getAllKeys())) { await saveOnboarding(alreadyEstablished(now)); return 'home'; }
      await saveOnboarding(autoOpened({ ...NEW_STATE }, now));
      return 'onboarding';
    }
    const s = normalise(JSON.parse(raw));
    if (!shouldAutoOpen(s)) return 'home';
    await saveOnboarding(autoOpened(s, now));
    return 'onboarding';
  } catch { return 'home'; }                         // a storage problem must never trap someone in a welcome screen
}

export async function reopenOnboarding(now: Date = new Date()): Promise<OnboardingState> {
  const s = reopen(await loadOnboarding(), now);
  await saveOnboarding(s);
  return s;
}

/** Writes only the profile fields that were filled in and are valid. Skipped fields are not touched. */
export async function saveProfileAnswers(p: Profile): Promise<{ saved: number; errors: ReturnType<typeof profileWrites>['errors'] }> {
  const { pairs, errors } = profileWrites(p);
  if (pairs.length) await AsyncStorage.multiSet(pairs);
  return { saved: pairs.length, errors };
}

/** What is saved right now, field by field, so a re-opened flow shows it and never overwrites it with blanks. */
export async function currentProfileValues(): Promise<Profile> {
  const g = await getMany(Object.values(PROFILE_KEYS));
  return { name: g[PROFILE_KEYS.name] ?? '', age: g[PROFILE_KEYS.age] ?? '', income: g[PROFILE_KEYS.income] ?? '', dependents: g[PROFILE_KEYS.dependents] ?? '' };
}
