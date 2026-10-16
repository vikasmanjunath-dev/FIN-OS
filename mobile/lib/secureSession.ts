// Storage for the cloud sign-in session (Supabase access and refresh tokens). The session used to sit in plain AsyncStorage,
// which is included in phone backups and is readable from a backup of the app's files. Here the value is encrypted with AES-256-GCM
// under a random key that lives only in the phone's secure storage (Keychain / Keystore), so a copy of AsyncStorage alone is useless.
// - Existing plain sessions are read once and re-written encrypted (no one is signed out by the update).
// - If the key is lost (new phone restored from a backup) the session reads as "none": the person signs in again.
// - Web preview and any failure of secure storage fall back to the plain value, never to a crash or a silent sign-out.
// Pure with injected stores so it is tested in Node; lib/supabase.ts passes the real ones.
import { gcm } from '@noble/ciphers/aes.js';
import { b64, unb64 } from '@/lib/vaultCrypto';

export interface StringStore { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void>; removeItem(k: string): Promise<void> }
export interface KeyStore { get(): Promise<string | null>; set(v: string): Promise<void>; remove(): Promise<void> }

const PREFIX = 'enc1:';
const te = new TextEncoder(), td = new TextDecoder();

export function makeSecureSessionStorage(base: StringStore, keys: KeyStore, rand: (n: number) => Uint8Array): StringStore & { forget(): Promise<void> } {
  async function key(create: boolean): Promise<Uint8Array | null> {
    try {
      const have = await keys.get();
      if (have) { const k = unb64(have); if (k.length === 32) return k; }
      if (!create) return null;
      const k = rand(32);
      await keys.set(b64(k));
      return k;
    } catch { return null; }
  }
  return {
    async getItem(name) {
      const v = await base.getItem(name);
      if (v == null) return null;
      if (!v.startsWith(PREFIX)) {                       // an older plain session: keep it, and encrypt it now
        try { await this.setItem(name, v); } catch { /* stays plain */ }
        return v;
      }
      const k = await key(false);
      if (!k) return null;
      try {
        const raw = unb64(v.slice(PREFIX.length));
        return td.decode(gcm(k, raw.slice(0, 12)).decrypt(raw.slice(12)));
      } catch { return null; }
    },
    async setItem(name, value) {
      const k = await key(true);
      if (!k) { await base.setItem(name, value); return; }
      const iv = rand(12);
      const ct = gcm(k, iv).encrypt(te.encode(value));
      const out = new Uint8Array(iv.length + ct.length);
      out.set(iv, 0); out.set(ct, iv.length);
      await base.setItem(name, PREFIX + b64(out));
    },
    removeItem: name => base.removeItem(name),
    async forget() { try { await keys.remove(); } catch { /* nothing stored */ } },
  };
}
