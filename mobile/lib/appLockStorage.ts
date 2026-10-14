// Where the lock's verifier, settings and attempt counter live: the phone's secure storage (Keychain / Keystore).
// On the web preview there is no secure storage, so it falls back to ordinary storage there (a preview aid, not protection).
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_META, NO_FAILS, checkPin, clampWait, lockStatus, makeVerifier, normaliseFail, normaliseMeta, type FailState, type LockMeta, type LockStatus, type Verifier } from '@/lib/appLock';

const K_VER = 'finos_applock_verifier', K_META = 'finos_applock_meta', K_FAIL = 'finos_applock_fail';

/** A read that says whether it worked. "Nothing stored" (ok, null) and "could not read" (not ok) are different: only the first may open the app. */
async function read(k: string): Promise<{ ok: boolean; value: string | null }> {
  try {
    if (Platform.OS === 'web') return { ok: true, value: await AsyncStorage.getItem(k) };
    return { ok: true, value: await require('expo-secure-store').getItemAsync(k) };
  } catch { return { ok: false, value: null }; }
}
async function get(k: string): Promise<string | null> { return (await read(k)).value; }
async function set(k: string, v: string): Promise<void> {
  if (Platform.OS === 'web') { await AsyncStorage.setItem(k, v); return; }
  await require('expo-secure-store').setItemAsync(k, v);
}
async function del(k: string): Promise<void> {
  if (Platform.OS === 'web') { await AsyncStorage.removeItem(k); return; }
  try { await require('expo-secure-store').deleteItemAsync(k); } catch { /* nothing stored */ }
}
const json = (s: string | null) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

export const loadMeta = async (): Promise<LockMeta> => normaliseMeta(json(await get(K_META)));
export const saveMeta = (m: LockMeta) => set(K_META, JSON.stringify(m));
export const loadFail = async (): Promise<FailState> => clampWait(normaliseFail(json(await get(K_FAIL))), Date.now());

/** What the lock gate decides from: off, on, or "could not read the lock" (the gate then stays closed). */
export async function loadLockStatus(): Promise<LockStatus> {
  const [m, v] = await Promise.all([read(K_META), read(K_VER)]);
  return lockStatus({ metaOk: m.ok, verifierOk: v.ok, metaRaw: json(m.value), verifierPresent: v.value != null && v.value !== '' });
}
export const saveFail = (f: FailState) => set(K_FAIL, JSON.stringify(f));

function salt(): Uint8Array {
  const c: any = (globalThis as any).crypto;
  if (c?.getRandomValues) return c.getRandomValues(new Uint8Array(16));
  return new Uint8Array(require('expo-crypto').getRandomBytes(16));
}

export async function setPin(pin: string, meta: Partial<LockMeta> = {}): Promise<void> {
  const ver = await makeVerifier(pin, salt());
  await set(K_VER, JSON.stringify(ver));
  const cur = await loadMeta();
  await saveMeta({ ...DEFAULT_META, ...cur, ...meta, enabled: true });
  await saveFail(NO_FAILS);
}
export async function verifyPin(pin: string): Promise<boolean> {
  const ver = json(await get(K_VER)) as Verifier | null;
  return ver ? checkPin(pin, ver) : false;
}
/** Removes the lock completely (after the PIN was confirmed, or after the app's data was erased). */
export async function clearLock(): Promise<void> {
  await Promise.all([del(K_VER), del(K_META), del(K_FAIL)]);
}

// ── biometrics (optional) ─────────────────────────────────────────────────────────────────────────────────────────────────
export async function biometricsAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const L = require('expo-local-authentication');
    return (await L.hasHardwareAsync()) && (await L.isEnrolledAsync());
  } catch { return false; }
}
export async function biometricPrompt(reason: string): Promise<boolean> {
  try {
    const r = await require('expo-local-authentication').authenticateAsync({ promptMessage: reason, cancelLabel: 'Use PIN', disableDeviceFallback: true });
    return !!r.success;
  } catch { return false; }
}

// "Lock now" from Settings: the gate listens here.
const lockListeners = new Set<() => void>();
export const onLockRequested = (fn: () => void) => { lockListeners.add(fn); return () => { lockListeners.delete(fn); }; };
export const requestLock = () => lockListeners.forEach(f => f());
