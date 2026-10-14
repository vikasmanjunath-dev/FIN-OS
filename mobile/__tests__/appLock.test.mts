import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setRandom } from '../lib/vaultCrypto.ts';
import { pinProblem, lockoutSeconds, afterWrong, secondsLeft, shouldRelock, normaliseMeta, normaliseFail, makeVerifier, checkPin, NO_FAILS, TIMEOUTS } from '../lib/appLock.ts';

setRandom(n => new Uint8Array(n).map((_, i) => (i * 37 + 11) & 255));

test('PIN rules: six digits, not repeated, not a straight run', () => {
  assert.equal(pinProblem('481926'), null);
  assert.match(pinProblem('1234') ?? '', /exactly 6/);
  assert.match(pinProblem('12345a') ?? '', /exactly 6/);
  assert.match(pinProblem('000000') ?? '', /repeated/);
  assert.match(pinProblem('123456') ?? '', /run of digits/);
  assert.match(pinProblem('987654') ?? '', /run of digits/);
  assert.equal(pinProblem('121212'), null);
});

test('wrong attempts: free for four, then 30 s doubling to a 15 minute ceiling', () => {
  assert.deepEqual([1, 4, 5, 6, 7, 10, 20].map(lockoutSeconds), [0, 0, 30, 60, 120, 900, 900]);
  let s = NO_FAILS;
  for (let i = 0; i < 4; i++) s = afterWrong(s, 1000);
  assert.equal(s.lockedUntil, 0);
  s = afterWrong(s, 1000);
  assert.equal(s.count, 5);
  assert.equal(secondsLeft(s, 1000), 30);
  assert.equal(secondsLeft(s, 1000 + 31000), 0);
});

test('relock: after the timeout, immediately for 0, and when the clock went backwards', () => {
  assert.equal(shouldRelock(null, 5000, 60), false);
  assert.equal(shouldRelock(1000, 1000 + 59000, 60), false);
  assert.equal(shouldRelock(1000, 1000 + 60000, 60), true);
  assert.equal(shouldRelock(1000, 1000, 0), true);
  assert.equal(shouldRelock(5000, 1000, 60), true);
});

test('the verifier accepts the right PIN only, and never stores the PIN', async () => {
  const v = await makeVerifier('481926', new Uint8Array(16).fill(7), 1000);
  assert.ok(!JSON.stringify(v).includes('481926'));
  assert.equal(await checkPin('481926', v), true);
  assert.equal(await checkPin('481927', v), false);
  assert.equal(await checkPin('', v), false);
  assert.equal(await checkPin('481926', { ...v, iter: 0 } as any), false);
  assert.equal(await checkPin('481926', null as any), false);
});

test('stored settings are validated', () => {
  assert.deepEqual(normaliseMeta(null), { enabled: false, biometrics: false, timeoutSec: 60 });
  assert.equal(normaliseMeta({ enabled: true, timeoutSec: 7 }).timeoutSec, 60);
  assert.equal(normaliseMeta({ enabled: 'yes' }).enabled, false);
  assert.ok(TIMEOUTS.some(t => t.sec === normaliseMeta({ timeoutSec: 300 }).timeoutSec));
  assert.deepEqual(normaliseFail({ count: -3, lockedUntil: 'x' }), { count: 0, lockedUntil: 0 });
});

// ── additions: persistent accounting, fail-closed reading, passphrases ─────────────────────────────────────────────────────
import { tryPin, clampWait, lockStatus, passphraseProblem, MAX_WAIT_SECONDS, type FailState } from '../lib/appLock.ts';

function fakeLock(correct: string) {
  const disk = { fail: { ...NO_FAILS } as FailState, verifies: 0 };
  let t = 1_000_000;
  const deps = (verifyImpl?: (p: string) => Promise<boolean>) => ({
    load: async () => ({ ...disk.fail }), save: async (f: FailState) => { disk.fail = { ...f }; },
    verify: verifyImpl ?? (async (p: string) => { disk.verifies++; return p === correct; }), now: () => t,
  });
  return { disk, deps, tick: (ms: number) => { t += ms; } };
}

test('PIN attempts are counted across restarts: five wrong tries, then a wait, even if the screen state is rebuilt each time', async () => {
  const L = fakeLock('481926');
  for (let i = 1; i <= 4; i++) { const r = await tryPin('000001', L.deps()); assert.equal(r.waitSec, 0); assert.equal(r.fail.count, i); }
  const fifth = await tryPin('000001', L.deps());
  assert.equal(fifth.waitSec, 30);
  const blocked = await tryPin('481926', L.deps());          // even the right PIN is refused during the wait, and is not even checked
  assert.equal(blocked.ok, false); assert.equal(blocked.refused, true);
  assert.equal(L.disk.verifies, 5);
  L.tick(31_000);
  const ok = await tryPin('481926', L.deps());
  assert.equal(ok.ok, true); assert.deepEqual(L.disk.fail, NO_FAILS);
});

test('a try is saved before it is checked: stopping the app in the middle of the check is not a free guess', async () => {
  const L = fakeLock('481926');
  const hang = new Promise<boolean>(() => {});               // the app is killed while the check runs
  void tryPin('111222', L.deps(() => hang));
  await new Promise(r => setTimeout(r, 10));
  assert.equal(L.disk.fail.count, 1);
});

test('a throwing check also leaves the try counted', async () => {
  const L = fakeLock('481926');
  await assert.rejects(tryPin('111222', L.deps(async () => { throw new Error('keychain'); })));
  assert.equal(L.disk.fail.count, 1);
});

test('a wait is never longer than the ceiling, and a far-future value from a wrong clock is cut back', () => {
  const now = 5_000_000;
  const c = clampWait({ count: 9, lockedUntil: now + 10 * 24 * 3600 * 1000 }, now);
  assert.equal(c.lockedUntil, now + MAX_WAIT_SECONDS * 1000); assert.equal(c.count, 9);
  assert.deepEqual(clampWait({ count: 2, lockedUntil: 0 }, now), { count: 2, lockedUntil: 0 });
});

test('fail closed: unreadable settings or a verifier without settings keep the app locked; only "nothing stored" opens it', () => {
  assert.deepEqual(lockStatus({ metaOk: true, verifierOk: true, metaRaw: null, verifierPresent: false }), { state: 'off' });
  assert.deepEqual(lockStatus({ metaOk: false, verifierOk: true, metaRaw: null, verifierPresent: false }), { state: 'unreadable' });
  assert.deepEqual(lockStatus({ metaOk: true, verifierOk: false, metaRaw: null, verifierPresent: false }), { state: 'unreadable' });
  const damaged = lockStatus({ metaOk: true, verifierOk: true, metaRaw: 'garbage', verifierPresent: true });
  assert.equal(damaged.state, 'on');
  const noVerifier = lockStatus({ metaOk: true, verifierOk: true, metaRaw: { enabled: true }, verifierPresent: false });
  assert.equal(noVerifier.state, 'on');
});

test('backup passphrases: length is not enough', () => {
  assert.equal(passphraseProblem('short'), 'Use at least 8 characters.');
  for (const bad of ['aaaaaaaaaa', '12345678', '1234567890', 'password1', 'abababab', 'qwertyuiop']) assert.ok(passphraseProblem(bad), bad);
  for (const good of ['mango-river-42-lamp', 'Tr0ub4dor&3x', '482916037512']) assert.equal(passphraseProblem(good), null, good);
});
