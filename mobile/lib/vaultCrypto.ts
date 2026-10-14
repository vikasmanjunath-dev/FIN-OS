// Passphrase-protected backups: PBKDF2-SHA256 -> AES-256-GCM, in the same file format as the website's vault
// (js/finos-vault.js exportEncrypted / decryptBackup), so a backup made on either can be restored on the other.
// Pure JS (@noble) because React Native has no WebCrypto. A wrong passphrase and a changed file look the same on purpose.
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { gcm } from '@noble/ciphers/aes.js';

export const MIN_PASS = 6;
/** What this phone uses when it makes a backup (the website uses 600,000). The file records it, and any file's own count is honoured on import. */
export const PHONE_ITER = 310000;
export const MAX_ITER = 5_000_000;                       // refuse a file that asks for an absurd amount of work

export interface EncryptedBackup { app: 'FIN-OS'; encrypted: 1; kdf: 'PBKDF2-SHA256'; iter: number; salt: string; iv: string; ct: string; exportedAt: string }

type Rand = (n: number) => Uint8Array;
let rand: Rand | null = null;
/** Tests inject their own source; on a phone expo-crypto is used. */
export function setRandom(fn: Rand | null) { rand = fn; }
function randomBytes(n: number): Uint8Array {
  if (rand) return rand(n);
  const c: any = (globalThis as any).crypto;
  if (c?.getRandomValues) return c.getRandomValues(new Uint8Array(n));
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return new Uint8Array(require('expo-crypto').getRandomBytes(n));
}

export function b64(u: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return (globalThis as any).btoa ? (globalThis as any).btoa(s) : Buffer.from(u).toString('base64');
}
export function unb64(str: string): Uint8Array {
  const bin = (globalThis as any).atob ? (globalThis as any).atob(str) : Buffer.from(str, 'base64').toString('binary');
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
const enc = (s: string) => new TextEncoder().encode(s);

export type Progress = (fraction: number) => void;

async function deriveKey(pass: string, salt: Uint8Array, iter: number): Promise<Uint8Array> {
  // asyncTick yields to the UI every few milliseconds, so the screen stays responsive while a few hundred thousand rounds run
  return pbkdf2Async(sha256, enc(pass), salt, { c: iter, dkLen: 32, asyncTick: 8 });
}

export async function encryptBackup(plain: unknown, pass: string, iter = PHONE_ITER, now = new Date()): Promise<EncryptedBackup> {
  if (String(pass ?? '').length < MIN_PASS) throw new Error(`Use at least ${MIN_PASS} characters.`);
  const salt = randomBytes(16), iv = randomBytes(12);
  const key = await deriveKey(pass, salt, iter);
  const ct = gcm(key, iv).encrypt(enc(JSON.stringify(plain)));
  return { app: 'FIN-OS', encrypted: 1, kdf: 'PBKDF2-SHA256', iter, salt: b64(salt), iv: b64(iv), ct: b64(ct), exportedAt: now.toISOString() };
}

export function isEncryptedBackup(x: any): x is EncryptedBackup {
  return !!x && x.app === 'FIN-OS' && x.encrypted === 1 && typeof x.salt === 'string' && typeof x.iv === 'string' && typeof x.ct === 'string' && Number.isInteger(x.iter) && x.iter > 0;
}

export async function decryptBackup(file: unknown, pass: string): Promise<any> {
  if (!isEncryptedBackup(file)) throw new Error('This is not an encrypted FIN·OS backup.');
  if (file.iter > MAX_ITER) throw new Error('This backup asks for more work than this phone will do.');
  const key = await deriveKey(String(pass ?? ''), unb64(file.salt), file.iter);
  try {
    const pt = gcm(key, unb64(file.iv)).decrypt(unb64(file.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  } catch {
    throw new Error('Wrong passphrase, or the file was changed.');
  }
}
