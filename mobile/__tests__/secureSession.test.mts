import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSecureSessionStorage } from '../lib/secureSession.ts';

const mem = () => { const m = new Map<string, string>(); return { m, getItem: async (k: string) => m.get(k) ?? null, setItem: async (k: string, v: string) => { m.set(k, v); }, removeItem: async (k: string) => { m.delete(k); } }; };
const keyStore = () => { let v: string | null = null; return { get: async () => v, set: async (x: string) => { v = x; }, remove: async () => { v = null; }, peek: () => v }; };
const rand = (n: number) => new Uint8Array(n).map(() => Math.floor(Math.random() * 256));

const TOKEN = JSON.stringify({ access_token: 'AAA.BBB.CCC', refresh_token: 'refresh-secret', user: { email: 'a@b.c' } });

test('the stored session is encrypted, round-trips, and is not readable without the key', async () => {
  const base = mem(), keys = keyStore();
  const s = makeSecureSessionStorage(base, keys, rand);
  await s.setItem('sb-x-auth-token', TOKEN);
  const stored = base.m.get('sb-x-auth-token')!;
  assert.ok(stored.startsWith('enc1:'));
  assert.ok(!stored.includes('refresh-secret') && !stored.includes('AAA'));
  assert.equal(await s.getItem('sb-x-auth-token'), TOKEN);
  // a copy of AsyncStorage on another phone (no key) yields no session
  const other = makeSecureSessionStorage(base, keyStore(), rand);
  assert.equal(await other.getItem('sb-x-auth-token'), null);
});

test('an older plain session keeps working and is encrypted on first read', async () => {
  const base = mem(), keys = keyStore();
  base.m.set('sb-x-auth-token', TOKEN);
  const s = makeSecureSessionStorage(base, keys, rand);
  assert.equal(await s.getItem('sb-x-auth-token'), TOKEN);
  assert.ok(base.m.get('sb-x-auth-token')!.startsWith('enc1:'));
  assert.equal(await s.getItem('sb-x-auth-token'), TOKEN);
});

test('tampering reads as signed out; a failing key store falls back to plain instead of failing', async () => {
  const base = mem(), keys = keyStore();
  const s = makeSecureSessionStorage(base, keys, rand);
  await s.setItem('k', 'value');
  const v = base.m.get('k')!;
  base.m.set('k', v.slice(0, -4) + 'AAAA');
  assert.equal(await s.getItem('k'), null);
  const broken = { get: async () => { throw new Error('keychain'); }, set: async () => { throw new Error('keychain'); }, remove: async () => {} };
  const p = makeSecureSessionStorage(mem(), broken, rand);
  await p.setItem('k', 'plain ok');
  assert.equal(await p.getItem('k'), 'plain ok');
});

test('forget() deletes the key, so the stored ciphertext can never be read again', async () => {
  const base = mem(), keys = keyStore();
  const s = makeSecureSessionStorage(base, keys, rand);
  await s.setItem('k', 'v');
  await s.forget();
  assert.equal(keys.peek(), null);
  assert.equal(await s.getItem('k'), null);
});
