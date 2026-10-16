import 'react-native-url-polyfill/auto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { makeSecureSessionStorage } from '@/lib/secureSession';
import { googleSignInStatus } from '@/lib/googleAuth';

// Credentials come from the environment (EXPO_PUBLIC_* is inlined by Expo at build time).
// Put them in mobile/.env — see .env.example. Use the *anon* key only, never the service-role key.
const URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
const ANON = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

// Expo's web static render runs this module in Node, where AsyncStorage (localStorage) doesn't exist.
// There is no user to persist a session for in that pass, so use auth-js's in-memory default.
const isServerRender = typeof window === 'undefined';

export const isSupabaseConfigured = /^https?:\/\//.test(URL) && ANON.length > 20;

/** Google sign-in needs the owner to allow the app's redirect address in Supabase first, so it is off until EXPO_PUBLIC_GOOGLE_SIGNIN=1. */
export const googleStatus = googleSignInStatus({ cloudConfigured: isSupabaseConfigured, flag: process.env.EXPO_PUBLIC_GOOGLE_SIGNIN });

// On a phone the session is encrypted under a key that lives only in secure storage (lib/secureSession.ts).
// The key item is deleted by "erase everything" (lib/storageKeys.ts SECURE_KEYS).
const SESSION_KEY_ITEM = 'finos_session_key';
function secureStore() { return require('expo-secure-store'); }
function randomBytes(n: number): Uint8Array {
  const c: any = (globalThis as any).crypto;
  if (c?.getRandomValues) return c.getRandomValues(new Uint8Array(n));
  return new Uint8Array(require('expo-crypto').getRandomBytes(n));
}
export const sessionStorage = isServerRender || Platform.OS === 'web'
  ? AsyncStorage
  : makeSecureSessionStorage(AsyncStorage, {
      get: async () => secureStore().getItemAsync(SESSION_KEY_ITEM),
      set: async (v: string) => secureStore().setItemAsync(SESSION_KEY_ITEM, v),
      remove: async () => secureStore().deleteItemAsync(SESSION_KEY_ITEM),
    }, randomBytes);

/** null when no credentials are configured — the app then runs in guest/local-only mode. */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(URL, ANON, {
      auth: {
        storage: isServerRender ? undefined : (sessionStorage as any),
        // PKCE only when Google sign-in is switched on: the redirect comes back as a one-time code, never as tokens in a link.
        flowType: googleStatus.available ? 'pkce' : 'implicit',
        autoRefreshToken: !isServerRender,
        persistSession: !isServerRender,
        detectSessionInUrl: false, // the OAuth redirect is handled by lib/googleAuth.ts, not by the client reading the URL
      },
    })
  : null;

/** Turn Supabase / network errors into messages a person can act on. */
export function friendlyAuthError(e: unknown): string {
  const msg = (e as any)?.message ?? String(e);
  if (/invalid login credentials/i.test(msg)) return 'Incorrect email or password.';
  if (/email not confirmed/i.test(msg)) return 'Please confirm your email first — check your inbox for the link.';
  if (/already registered|already been registered/i.test(msg)) return 'That email already has an account — try signing in.';
  if (/password.*(short|least|weak)/i.test(msg)) return msg;
  if (/rate limit|too many/i.test(msg)) return 'Too many attempts — wait a minute and try again.';
  if (/network|failed to fetch|fetch failed|timeout/i.test(msg)) return "Can't reach the cloud service. Check your connection and try again.";
  return msg;
}
