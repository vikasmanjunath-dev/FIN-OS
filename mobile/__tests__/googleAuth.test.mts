import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { googleSignInStatus, signInWithGoogle, type GoogleDeps } from '../lib/googleAuth.ts';

test('the button is hidden unless cloud sync is configured AND the owner switched Google sign-in on', () => {
  assert.deepEqual(googleSignInStatus({ cloudConfigured: false, flag: '1' }), { available: false, reason: 'no-cloud' });
  assert.deepEqual(googleSignInStatus({ cloudConfigured: true, flag: undefined }), { available: false, reason: 'not-enabled' });
  assert.deepEqual(googleSignInStatus({ cloudConfigured: true, flag: '0' }), { available: false, reason: 'not-enabled' });
  assert.deepEqual(googleSignInStatus({ cloudConfigured: true, flag: 'true' }), { available: false, reason: 'not-enabled' });
  assert.deepEqual(googleSignInStatus({ cloudConfigured: true, flag: ' 1 ' }), { available: true });
});

test('login screen: the Google button is rendered only through googleSignInStatus, and no credential is in the source', () => {
  const src = readFileSync(new URL('../app/login.tsx', import.meta.url), 'utf8');
  assert.match(src, /googleSignInStatus\(/);
  assert.match(src, /googleOk\s*&&/);
  const all = [src, readFileSync(new URL('../lib/googleAuth.ts', import.meta.url), 'utf8'), readFileSync(new URL('../lib/supabase.ts', import.meta.url), 'utf8')].join('\n');
  assert.ok(!/apps\.googleusercontent\.com|GOCSPX-|client_secret/i.test(all));
});

const RED = 'finos://auth-callback';
function deps(over: Partial<GoogleDeps> & { url?: string | null; browser?: any; exchange?: any } = {}) {
  const calls: string[] = [];
  const d: GoogleDeps = {
    redirectTo: RED,
    client: { auth: {
      async signInWithOAuth(o) { calls.push(`oauth ${o.options.redirectTo} skip=${o.options.skipBrowserRedirect}`); return { data: { url: over.url === undefined ? 'https://proj.supabase.co/auth/v1/authorize?provider=google' : over.url }, error: null }; },
      async exchangeCodeForSession(code) { calls.push(`exchange ${code}`); return over.exchange ?? { error: null }; },
    } },
    async openAuthSession(url, to) { calls.push(`open ${url.slice(0, 22)} -> ${to}`); return over.browser ?? { type: 'success', url: `${RED}?code=abc123` }; },
  };
  return { d, calls };
}

test('happy path: browser, then the code is exchanged for a session', async () => {
  const { d, calls } = deps();
  assert.deepEqual(await signInWithGoogle(d), { ok: true });
  assert.deepEqual(calls, ['oauth finos://auth-callback skip=true', 'open https://proj.supabase. -> finos://auth-callback', 'exchange abc123']);
});

test('cancelled, wrong address, provider error, missing code, no URL and failed exchange all end without a session', async () => {
  const c = await signInWithGoogle(deps({ browser: { type: 'cancel' } }).d);
  assert.equal(c.ok, false); assert.equal((c as any).cancelled, true);
  const wrong = deps({ browser: { type: 'success', url: 'https://evil.example/cb?code=zzz' } });
  assert.equal((await signInWithGoogle(wrong.d)).ok, false);
  assert.ok(!wrong.calls.some(x => x.startsWith('exchange')));
  const perr = await signInWithGoogle(deps({ browser: { type: 'success', url: `${RED}?error=access_denied&error_description=User+denied+access` } }).d);
  assert.deepEqual(perr, { ok: false, error: 'User denied access' });
  const nocode = deps({ browser: { type: 'success', url: RED } });
  assert.equal((await signInWithGoogle(nocode.d)).ok, false);
  assert.ok(!nocode.calls.some(x => x.startsWith('exchange')));
  assert.equal((await signInWithGoogle(deps({ url: null }).d)).ok, false);
  assert.equal((await signInWithGoogle(deps({ url: 'http://not-https.example' }).d)).ok, false);
  assert.deepEqual(await signInWithGoogle(deps({ exchange: { error: { message: 'bad verifier' } } }).d), { ok: false, error: 'bad verifier' });
});
