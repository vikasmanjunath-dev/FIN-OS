import 'react-native-url-polyfill/auto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Credentials come from the environment (EXPO_PUBLIC_* is inlined by Expo at build time).
// Put them in mobile/.env — see .env.example. Use the *anon* key only, never the service-role key.
const URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
const ANON = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

// Expo's web static render runs this module in Node, where AsyncStorage (localStorage) doesn't exist.
// There is no user to persist a session for in that pass, so use auth-js's in-memory default.
const isServerRender = typeof window === 'undefined';

export const isSupabaseConfigured = /^https?:\/\//.test(URL) && ANON.length > 20;

/** null when no credentials are configured — the app then runs in guest/local-only mode. */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(URL, ANON, {
      auth: {
        storage: isServerRender ? undefined : AsyncStorage,
        autoRefreshToken: !isServerRender,
        persistSession: !isServerRender,
        detectSessionInUrl: false, // native + web: we don't use OAuth redirects
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
