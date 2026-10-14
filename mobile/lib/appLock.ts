// App lock policy: what a PIN must look like, how wrong attempts are slowed, and when the app locks again.
// Pure (time and storage are arguments). What the lock is, honestly: a gate on the screen. Data stored on the phone is
// protected by the phone's own storage encryption and passcode; the lock keeps someone who picks the phone up from opening the app.
// A forgotten PIN cannot be recovered: the way back in is to erase the app's data on this phone and restore from a backup or the cloud.
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { b64, unb64 } from './vaultCrypto.ts';

export const PIN_LENGTH = 6;
export const TIMEOUTS: { sec: number; label: string }[] = [
  { sec: 0, label: 'Immediately' }, { sec: 30, label: '30 seconds' }, { sec: 60, label: '1 minute' }, { sec: 300, label: '5 minutes' }, { sec: 900, label: '15 minutes' },
];
export const VERIFIER_ITER = 20000;

export interface LockMeta { enabled: boolean; biometrics: boolean; timeoutSec: number }
export const DEFAULT_META: LockMeta = { enabled: false, biometrics: false, timeoutSec: 60 };

export function normaliseMeta(raw: unknown): LockMeta {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const t = Number(r.timeoutSec);
  return { enabled: r.enabled === true, biometrics: r.biometrics === true, timeoutSec: TIMEOUTS.some(x => x.sec === t) ? t : DEFAULT_META.timeoutSec };
}

/** null when the PIN is acceptable, otherwise the reason. */
export function pinProblem(pin: string): string | null {
  if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) return `Use exactly ${PIN_LENGTH} digits.`;
  if (/^(\d)\1+$/.test(pin)) return 'Pick a PIN that is not one repeated digit.';
  const d = pin.split('').map(Number);
  const step = d.every((v, i) => i === 0 || v - d[i - 1] === 1) || d.every((v, i) => i === 0 || d[i - 1] - v === 1);
  if (step) return 'Pick a PIN that is not a run of digits like 123456.';
  return null;
}

export interface FailState { count: number; lockedUntil: number }     // lockedUntil: epoch ms, 0 = not locked out
export const NO_FAILS: FailState = { count: 0, lockedUntil: 0 };

/** Seconds to wait after this many wrong attempts in a row: none for four, then 30 s doubling to 15 minutes. */
export function lockoutSeconds(failures: number): number {
  if (failures < 5) return 0;
  return Math.min(900, 30 * Math.pow(2, failures - 5));
}
export function afterWrong(s: FailState, nowMs: number): FailState {
  const count = s.count + 1;
  const wait = lockoutSeconds(count);
  return { count, lockedUntil: wait > 0 ? nowMs + wait * 1000 : 0 };
}
export const secondsLeft = (s: FailState, nowMs: number) => Math.max(0, Math.ceil((s.lockedUntil - nowMs) / 1000));
export const MAX_WAIT_SECONDS = 900;

/**
 * A wait can never be longer than the ceiling from "now": a wrong clock (set far ahead, then corrected) or a damaged value must
 * not lock the person out for days. The count itself is never reduced here.
 */
export function clampWait(s: FailState, nowMs: number): FailState {
  const cap = nowMs + MAX_WAIT_SECONDS * 1000;
  return s.lockedUntil > cap ? { ...s, lockedUntil: cap } : s;
}

/**
 * What a lock screen decides from what could be read. Fail closed: if the settings or the verifier cannot be read, or one exists
 * without the other, the app stays locked (and says so) rather than opening.
 */
export type LockStatus = { state: 'off' } | { state: 'on'; meta: LockMeta } | { state: 'unreadable' };
export function lockStatus(r: { metaOk: boolean; verifierOk: boolean; metaRaw: unknown; verifierPresent: boolean }): LockStatus {
  if (!r.metaOk || !r.verifierOk) return { state: 'unreadable' };
  const meta = normaliseMeta(r.metaRaw);
  if (meta.enabled || r.verifierPresent) return { state: 'on', meta: { ...meta, enabled: true } };
  return { state: 'off' };
}

/** The PIN is counted as a wrong try BEFORE it is checked, and the count is cleared only if it was right: stopping the app mid-check is not a free guess. */
export const attemptBegins = (s: FailState, nowMs: number): FailState => afterWrong(s, nowMs);
export const normaliseFail = (raw: unknown): FailState => {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const c = Number(r.count), u = Number(r.lockedUntil);
  return { count: Number.isInteger(c) && c >= 0 ? c : 0, lockedUntil: Number.isFinite(u) && u > 0 ? u : 0 };
};

/** Locks again if the app was away longer than the timeout. A clock that went backwards locks too. */
export function shouldRelock(leftAtMs: number | null, nowMs: number, timeoutSec: number): boolean {
  if (leftAtMs === null) return false;
  if (nowMs < leftAtMs) return true;
  return (nowMs - leftAtMs) / 1000 >= timeoutSec;
}

export interface TryDeps { load(): Promise<FailState>; save(f: FailState): Promise<void>; verify(pin: string): Promise<boolean>; now(): number }
export interface TryResult { ok: boolean; fail: FailState; waitSec: number; refused: boolean }

/**
 * One PIN attempt, with the counting that survives a restart. Reads the stored count, refuses while a wait is running, writes the
 * counted try BEFORE the (slow) check, and clears the count only on success. Everything the lock screen needs is in the result.
 */
export async function tryPin(pin: string, d: TryDeps): Promise<TryResult> {
  const stored = clampWait(await d.load(), d.now());
  const left = secondsLeft(stored, d.now());
  if (left > 0) return { ok: false, fail: stored, waitSec: left, refused: true };
  const counted = attemptBegins(stored, d.now());
  await d.save(counted);
  if (await d.verify(pin)) { await d.save(NO_FAILS); return { ok: true, fail: NO_FAILS, waitSec: 0, refused: false }; }
  return { ok: false, fail: counted, waitSec: secondsLeft(counted, d.now()), refused: false };
}

/** Why a backup passphrase is refused (null when acceptable). Length is only part of it: "aaaaaaaa" and "12345678" fall to a guess in seconds. */
export function passphraseProblem(pass: string, min = 8): string | null {
  const p = String(pass ?? '');
  if (p.length < min) return `Use at least ${min} characters.`;
  if (new Set(p.toLowerCase()).size < 5) return 'Use more different characters: this one is too easy to guess.';
  const lower = p.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (/^\d+$/.test(p) && p.length < 12) return 'A passphrase made only of digits needs at least 12 of them. Add words or letters.';
  if (/^(password|passw0rd|qwerty|letmein|iloveyou|welcome|admin|finos|12345678|123456789|1234567890)/.test(lower) && lower.length < 14) return 'That is a very common passphrase. Pick something only you would think of.';
  return null;
}

export interface Verifier { v: 1; iter: number; salt: string; hash: string }

export async function makeVerifier(pin: string, salt: Uint8Array, iter = VERIFIER_ITER): Promise<Verifier> {
  const hash = await pbkdf2Async(sha256, new TextEncoder().encode(pin), salt, { c: iter, dkLen: 32, asyncTick: 8 });
  return { v: 1, iter, salt: b64(salt), hash: b64(hash) };
}

export async function checkPin(pin: string, ver: Verifier): Promise<boolean> {
  if (!ver || ver.v !== 1 || !Number.isInteger(ver.iter) || ver.iter < 1 || ver.iter > 1_000_000) return false;
  const got = await pbkdf2Async(sha256, new TextEncoder().encode(pin), unb64(ver.salt), { c: ver.iter, dkLen: 32, asyncTick: 8 });
  const want = unb64(ver.hash);
  if (got.length !== want.length) return false;
  let diff = 0;                                                  // constant time
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i];
  return diff === 0;
}
