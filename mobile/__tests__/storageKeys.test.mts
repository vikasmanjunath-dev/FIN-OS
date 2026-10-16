// Guard for "what does the app keep, and does every storage know how to erase / exclude it?".
// It reads the source: a new AsyncStorage key that looks private, a new SecureStore item, a new non-"finos_" key or a new
// dynamically built key fails here until it is classified in lib/storageKeys.ts (or the erase flow).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECURE_KEYS, DEVICE_ONLY_KEYS, PRIVATE_NAME, NEVER_BACKUP, NEVER_EXPORT, FOREIGN_KEY_PATTERNS } from '../lib/storageKeys.ts';
import { isSyncKey } from '../lib/trackerSync.ts';
import { isBackupKey, buildBackup } from '../lib/backup.ts';
import { exportAllData } from '../lib/dataControls.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(path.join(root, dir))) {
    if (['node_modules', '.expo', '__tests__', 'scripts', 'assets', '.release-export-tmp'].includes(n)) continue;
    const rel = path.join(dir, n);
    if (statSync(path.join(root, rel)).isDirectory()) walk(rel, out); else if (/\.(ts|tsx)$/.test(n)) out.push(rel);
  }
  return out;
}
/** Private-sounding names that are ordinary synced data on purpose. Each needs its reason here. */
const INTENTIONALLY_SYNCED = [
  'finos_realestate_mobile',     // the real-estate calculator's inputs: the same class as every other calculator input key
  'finos_aa_consents_v1',        // the website's own key (Account Aggregator is gated off); the phone only reads it
];
const files = ['app', 'components', 'hooks', 'lib', 'constants'].flatMap(d => walk(d));
const src = new Map(files.map(f => [f, readFileSync(path.join(root, f), 'utf8')]));

test('every literal storage key starting with finos_ or FINOS_ is found, and any private-looking one is device-only', () => {
  const keys = new Set<string>();
  for (const [f, s] of src) {
    if (/privacy\.ts$|search\.ts$|i18nHi\.ts$/.test(f)) continue;       // prose and display lists, not storage calls
    for (const m of s.matchAll(/['"`](finos_[A-Za-z0-9_]+)['"`]/g)) keys.add(m[1]);
  }
  assert.ok(keys.size > 100, `found only ${keys.size} keys`);
  const offenders: string[] = [];
  for (const k of keys) {
    if (!PRIVATE_NAME.test(k) || INTENTIONALLY_SYNCED.includes(k)) continue;
    const deviceOnly = !isSyncKey(k) && !isBackupKey(k) && (DEVICE_ONLY_KEYS as readonly string[]).includes(k);
    if (!deviceOnly) offenders.push(k);
  }
  assert.deepEqual(offenders, [], 'these keys look private: list them in DEVICE_ONLY_KEYS (and keep them out of sync and backup)');
});

test('the list agrees with the sync and backup rules, key by key', () => {
  for (const k of DEVICE_ONLY_KEYS) {
    assert.equal(isSyncKey(k), false, `${k} would sync to the cloud`);
    assert.equal(isBackupKey(k), false, `${k} would go into a backup`);
    assert.ok(NEVER_BACKUP.test(k));
  }
  for (const k of ['finos_transactions', 'finos_goals', 'finos_user_name', 'finos_budgets']) { assert.equal(isBackupKey(k), true); assert.equal(isSyncKey(k), true); }
});

test('keys outside the finos_ prefix are only the libraries\' own (the sign-in session), nothing of ours', () => {
  const odd: string[] = [];
  for (const [f, s] of src) {
    if (/privacy\.ts$|search\.ts$|i18nHi\.ts$|supabase\.ts$/.test(f) || !/AsyncStorage/.test(s)) continue;
    for (const m of s.matchAll(/\b(?:getItem|setItem|removeItem)\(\s*['"`]([^'"`$]+)['"`]/g)) if (!/^finos_/i.test(m[1])) odd.push(`${f}: ${m[1]}`);
    for (const m of s.matchAll(/\bconst\s+[A-Z_]*KEY[A-Z_]*\s*=\s*['"`]([^'"`]+)['"`]/g)) {
      if (/^finos[_-]/i.test(m[1]) || FOREIGN_KEY_PATTERNS.some(re => re.test(m[1]))) continue;
      if (/^(reminders|priceAlerts)$/.test(m[1])) continue;                       // notification channel ids, not storage
      odd.push(`${f}: ${m[1]}`);
    }
  }
  assert.deepEqual(odd, []);
});

test('SecureStore is used only where the erase flow knows about it, and every item it holds is in SECURE_KEYS', () => {
  const users = [...src].filter(([f, s]) => !/storageKeys\.ts$/.test(f) && /secure-store|SecureStore/.test(s)).map(([f]) => f.replace(/\\/g, '/')).sort();
  assert.deepEqual(users, ['lib/appLockStorage.ts', 'lib/eraseDeps.ts', 'lib/supabase.ts'], 'a new SecureStore user must be added to the erase flow and to this list');
  const found = new Set<string>();
  for (const f of ['lib/appLockStorage.ts', 'lib/supabase.ts']) for (const m of src.get(f)!.matchAll(/['"`](finos_[a-z_]+)['"`]/g)) found.add(m[1]);
  for (const k of found) if (/applock|session_key/.test(k)) assert.ok((SECURE_KEYS as readonly string[]).includes(k), `${k} is in SecureStore but not erased`);
  for (const k of SECURE_KEYS) assert.ok(found.has(k), `${k} is listed but no longer used`);
});

test('keys are built dynamically in a known set of places only', () => {
  const sites: string[] = [];
  for (const [f, s] of src) {
    if (/privacy\.ts$|search\.ts$|i18nHi\.ts$/.test(f)) continue;
    for (const m of s.matchAll(/`finos_\$\{|['"]finos_['"]\s*\+/g)) sites.push(f.replace(/\\/g, '/'));
  }
  // Add a place here only after checking that every key it can build is covered by the rules above (clear() removes them all; backup and sync follow the prefix rules).
  assert.deepEqual([...new Set(sites)].sort(), []);
});

test('export never carries the lock\'s verifier or the session key (they can sit in AsyncStorage on the web preview)', async () => {
  const mem = new Map<string, string>([['finos_applock_verifier', '{"v":1,"salt":"s","hash":"h"}'], ['finos_session_key', 'k'], ['finos_goals', '[]'], ['sb-x-auth-token', 'tok']]);
  const store: any = { getAllKeys: async () => [...mem.keys()], multiGet: async (k: string[]) => k.map(x => [x, mem.get(x) ?? null]) };
  const { json } = await exportAllData(store);
  assert.ok(!/verifier|session_key|"hash"/.test(json), json);
  assert.ok(NEVER_EXPORT.test('finos_applock_meta'));
  const b = await buildBackup({ ...store, multiSet: async () => {} });
  assert.deepEqual(Object.keys(b.data), ['finos_goals']);
});
