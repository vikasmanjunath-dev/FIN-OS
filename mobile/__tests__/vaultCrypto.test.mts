// The phone's encrypted backup must interoperate with the website's vault in both directions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { webcrypto, randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encryptBackup, decryptBackup, isEncryptedBackup, setRandom, MIN_PASS, MAX_ITER } from '../lib/vaultCrypto.ts';

const require = createRequire(import.meta.url);
const web = require(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../js/finos-vault.js'));
web._env.crypto = webcrypto;
setRandom(n => new Uint8Array(randomBytes(n)));

const PLAIN = { app: 'FIN-OS', schema: 1, exportedAt: '2026-10-14T00:00:00.000Z', data: { finos_age: '34', finos_goals: [{ id: 'g', name: 'House', target: 5000000 }] }, indexedDB: {} };
const FAST = 2000;                                   // iteration count for tests; the real values are exercised once below

test('round trip on the phone', async () => {
  const f = await encryptBackup(PLAIN, 'correct horse', FAST);
  assert.ok(isEncryptedBackup(f));
  assert.equal(f.kdf, 'PBKDF2-SHA256');
  assert.ok(!JSON.stringify(f).includes('House'), 'the file must not contain the plaintext');
  assert.deepEqual(await decryptBackup(f, 'correct horse'), PLAIN);
});

test('a backup made on the phone opens with the website vault code', async () => {
  const f = await encryptBackup(PLAIN, 'shared secret', FAST);
  assert.deepEqual(await web.decryptBackup(f, 'shared secret'), PLAIN);
});

test('a backup made by the website vault code opens on the phone', async () => {
  // the website fixes 600,000 iterations; one real-size run proves the phone honours the file's own count
  const f = await web.exportEncrypted('web passphrase', PLAIN);
  assert.equal(f.iter, 600000);
  assert.deepEqual(await decryptBackup(f, 'web passphrase'), PLAIN);
});

test('wrong passphrase, tampering and non-backups are refused with plain messages', async () => {
  const f = await encryptBackup(PLAIN, 'right pass', FAST);
  await assert.rejects(decryptBackup(f, 'wrong pass'), /Wrong passphrase, or the file was changed/);
  const bad = { ...f, ct: f.ct.slice(0, -4) + 'AAAA' };
  await assert.rejects(decryptBackup(bad, 'right pass'), /Wrong passphrase, or the file was changed/);
  await assert.rejects(decryptBackup({ hello: 1 }, 'x'), /not an encrypted FIN/);
  await assert.rejects(decryptBackup({ ...f, iter: MAX_ITER + 1 }, 'right pass'), /more work/);
});

test('short passphrases are refused; every backup gets a fresh salt and IV', async () => {
  await assert.rejects(encryptBackup(PLAIN, 'a'.repeat(MIN_PASS - 1), FAST), /at least/);
  const a = await encryptBackup(PLAIN, 'same passphrase', FAST), b = await encryptBackup(PLAIN, 'same passphrase', FAST);
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ct, b.ct);
});
