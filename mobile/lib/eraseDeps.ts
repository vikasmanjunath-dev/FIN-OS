// The real parts of the erase flow (React Native side). The order and the checks are in dataControls.ts and are tested there with fakes.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { eraseEverything, ACCOUNT_LINK_KEYS, type EraseDeps, type EraseResult } from '@/lib/dataControls';
import { bumpEraseEpoch } from '@/lib/eraseEpoch';
import { clearLock } from '@/lib/appLockStorage';
import { cancelAll as cancelReminders } from '@/lib/remindersNative';
import { sweepTempFiles } from '@/lib/tempFiles';
import { SECURE_KEYS } from '@/lib/storageKeys';

async function signOutLocal() {
  const { supabase } = await import('@/lib/supabase');
  try { await supabase?.auth.signOut({ scope: 'local' }); } catch { /* offline: the stored session is removed below */ }
}

async function resetMemory() {
  const [{ resetForErase: holdings }, { resetForErase: trackers }, theme, i18n] = await Promise.all([
    import('@/lib/holdingsStore'), import('@/lib/trackerSyncStore'), import('@/lib/theme'), import('@/lib/i18n'),
  ]);
  holdings(); trackers();
  // back to the defaults for this session too (what is stored is removed below)
  await theme.setThemeChoice('dark');
  await i18n.setLang('en');
}

async function cancelNotifications() {
  await cancelReminders();
  if (Platform.OS === 'web') return;
  try { await require('expo-notifications').dismissAllNotificationsAsync(); } catch { /* none delivered */ }
}

async function clearSecure() {
  await clearLock();
  if (Platform.OS === 'web') return;
  const SS = require('expo-secure-store');
  for (const k of SECURE_KEYS) { try { await SS.deleteItemAsync(k); } catch { /* not set */ } }
}

export const realEraseDeps = (): EraseDeps => ({
  signOutLocal, resetMemory, cancelNotifications, clearSecure,
  clearFiles: async () => { await sweepTempFiles(); },
  store: AsyncStorage as any,
  finish: bumpEraseEpoch,
});

/** "Delete everything on this phone": one call from every screen that offers it. */
export const eraseThisPhone = (): Promise<EraseResult> => eraseEverything(realEraseDeps());

/** After the account was deleted on the server. */
export async function detachFromAccount() {
  const { resetAccountLink } = await import('@/lib/holdingsStore');
  resetAccountLink();
  await AsyncStorage.multiRemove([...ACCOUNT_LINK_KEYS]);
}
