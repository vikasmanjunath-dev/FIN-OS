// "Continue with Google" through Supabase OAuth (PKCE) in the system browser, no secret in the app and none in the repo.
// The Google client id and secret live only in the Supabase dashboard (Authentication -> Providers -> Google, which the website
// already uses). The phone needs exactly one thing from the owner: the app's redirect address allowed in Supabase
// (Authentication -> URL Configuration -> Redirect URLs). Until the owner has done that and set EXPO_PUBLIC_GOOGLE_SIGNIN=1,
// the button is not shown. See docs/agent-notes/trust-platform.md for the exact console steps.
// Pure: the client, the browser and the redirect address are arguments, so every outcome is tested without a network.

export const GOOGLE_REDIRECT_PATH = 'auth-callback';

export type GoogleStatus = { available: true } | { available: false; reason: 'no-cloud' | 'not-enabled' };

/** The button is shown only when cloud sync is configured AND the owner switched Google sign-in on for this build. */
export function googleSignInStatus(env: { cloudConfigured: boolean; flag: string | undefined | null }): GoogleStatus {
  if (!env.cloudConfigured) return { available: false, reason: 'no-cloud' };
  if (String(env.flag ?? '').trim() !== '1') return { available: false, reason: 'not-enabled' };
  return { available: true };
}

export interface GoogleDeps {
  redirectTo: string;
  client: {
    auth: {
      signInWithOAuth(o: { provider: 'google'; options: { redirectTo: string; skipBrowserRedirect: boolean } }): Promise<{ data: { url?: string | null } | null; error: { message: string } | null }>;
      exchangeCodeForSession(code: string): Promise<{ error: { message: string } | null }>;
    };
  };
  openAuthSession(url: string, redirectTo: string): Promise<{ type: string; url?: string }>;
}

export type GoogleResult = { ok: true } | { ok: false; cancelled?: boolean; error: string };

function params(url: string): URLSearchParams {
  const q = url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#')[0] : '';
  const h = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';
  return new URLSearchParams([q, h].filter(Boolean).join('&'));
}

export async function signInWithGoogle(d: GoogleDeps): Promise<GoogleResult> {
  const { data, error } = await d.client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: d.redirectTo, skipBrowserRedirect: true } });
  if (error) return { ok: false, error: error.message };
  const url = data?.url ?? '';
  if (!/^https:\/\//i.test(url)) return { ok: false, error: 'Google sign-in is not set up for this app yet.' };
  const r = await d.openAuthSession(url, d.redirectTo);
  if (r.type !== 'success' || !r.url) return { ok: false, cancelled: true, error: 'Sign-in was cancelled.' };
  // Only our own redirect address is accepted: anything else is not the answer to this request.
  if (!r.url.startsWith(d.redirectTo)) return { ok: false, error: 'Google sign-in returned to an unexpected address. Nothing was changed.' };
  const p = params(r.url);
  const err = p.get('error_description') || p.get('error');
  if (err) return { ok: false, error: err.replace(/\+/g, ' ').slice(0, 200) };
  const code = p.get('code');
  if (!code) return { ok: false, error: 'Google sign-in did not return a code. Nothing was changed.' };
  const ex = await d.client.auth.exchangeCodeForSession(code);
  if (ex.error) return { ok: false, error: ex.error.message };
  return { ok: true };
}
