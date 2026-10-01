const test = require('node:test');
const assert = require('node:assert');
const V = require('../js/finos-vault.js');
const Store = require('../js/finos-store.js');

function fakeStorage(seed = {}) {
  const m = { ...seed };
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
    _m: m,
  };
}
function fresh(seed) {
  const local = fakeStorage(seed), session = fakeStorage();
  V._env.local = local; V._env.session = session; V._env.crypto = null;
  return { local, session };
}
const DATA = {
  finos_net_worth: '1250000', finos_goals: '[{"name":"Car","target":900000}]', finos_display_name: 'Asha',
  FINOS_CORE_DNA: '{"type":"builder"}', trady_watchlist: '["TCS","INFY"]',
};
const KEEP = { 'finos-theme': 'light', finos_lang: 'hi', 'sb-abc-auth-token': 'tok', unrelated: 'x' };
const PASS = 'correct horse battery';

test('enable: writes a verified vault, keeps this tab unlocked, plaintext untouched, ciphertext leaks nothing', async () => {
  const { local, session } = fresh({ ...DATA, ...KEEP });
  await V.enable(PASS);
  assert.ok(V.isEnabled() && V.isUnlocked());
  const vault = local._m.finos_vault;
  assert.ok(vault && !/1250000|Asha|builder|INFY/.test(vault), 'vault must not contain plaintext');
  for (const k of Object.keys(DATA)) assert.strictEqual(local._m[k], DATA[k]);
  assert.ok(session._m.finos_unlocked);
});

test('lock wipes every owned key, keeps prefs/tokens, and unlock restores values byte-for-byte', async () => {
  const { local, session } = fresh({ ...DATA, ...KEEP });
  await V.enable(PASS);
  await V.lock();
  for (const k of Object.keys(DATA)) assert.strictEqual(local._m[k], undefined, k + ' should be wiped');
  for (const [k, v] of Object.entries(KEEP)) assert.strictEqual(local._m[k], v, k + ' must be left alone');
  assert.ok(!session._m.finos_unlocked && !V.isUnlocked());
  assert.strictEqual(await V.unlock(PASS), true);
  for (const [k, v] of Object.entries(DATA)) assert.strictEqual(local._m[k], v);
  assert.ok(V.isUnlocked());
});

test('wrong passcode and tampered ciphertext both fail closed and restore nothing', async () => {
  const { local } = fresh({ ...DATA });
  await V.enable(PASS); await V.lock();
  assert.strictEqual(await V.unlock('wrong passcode'), false);
  assert.strictEqual(local._m.finos_net_worth, undefined);
  const blob = JSON.parse(local._m.finos_vault);
  const ct = Buffer.from(blob.ct, 'base64'); ct[5] ^= 0xff;
  local._m.finos_vault = JSON.stringify({ ...blob, ct: ct.toString('base64') });
  assert.strictEqual(await V.unlock(PASS), false);                                     // GCM auth tag catches the flipped bit
  assert.strictEqual(local._m.finos_net_worth, undefined);
});

test('SAFETY: if the post-encrypt self-check fails, lock throws and NOTHING is wiped', async () => {
  const { local } = fresh({ ...DATA });
  await V.enable(PASS);
  const real = globalThis.crypto;
  V._env.crypto = {
    getRandomValues: (a) => real.getRandomValues(a),
    subtle: new Proxy(real.subtle, { get: (t, p) => (p === 'decrypt' ? async () => new TextEncoder().encode('{"corrupt":1}').buffer : t[p].bind(t)) }),
  };
  await assert.rejects(V.lock(), /self-check/);
  V._env.crypto = null;
  for (const [k, v] of Object.entries(DATA)) assert.strictEqual(local._m[k], v, 'data must survive a failed lock: ' + k);
  assert.ok(V.isUnlocked());
});

test('unclean close: newer plaintext left in storage wins over the vault copy on unlock', async () => {
  const { local } = fresh({ ...DATA });
  await V.enable(PASS); await V.lock();
  local._m.finos_net_worth = '9999999';                                                // left behind / edited while "locked"
  assert.strictEqual(await V.unlock(PASS), true);
  assert.strictEqual(local._m.finos_net_worth, '9999999');
  assert.strictEqual(local._m.finos_display_name, 'Asha');                             // others restored from the vault
});

test('every lock uses a fresh IV (same data → different ciphertext)', async () => {
  const { local } = fresh({ ...DATA });
  await V.enable(PASS); await V.lock();
  const first = local._m.finos_vault;
  await V.unlock(PASS); await V.lock();
  assert.notStrictEqual(local._m.finos_vault, first);
});

test('disable needs the right passcode; success removes the vault and keeps data', async () => {
  const { local } = fresh({ ...DATA });
  await V.enable(PASS);
  assert.strictEqual(await V.disable('nope nope'), false);
  assert.ok(V.isEnabled());
  assert.strictEqual(await V.disable(PASS), true);
  assert.ok(!V.isEnabled() && !local._m.finos_vault && !local._m.finos_vault_meta);
  assert.strictEqual(local._m.finos_net_worth, DATA.finos_net_worth);
});

test('change passcode: old one stops working, new one works, data intact', async () => {
  const { local } = fresh({ ...DATA });
  await V.enable(PASS);
  assert.strictEqual(await V.changePasscode('bad old pass', 'brand new pass'), false);
  assert.strictEqual(await V.changePasscode(PASS, 'brand new pass'), true);
  await V.lock();
  assert.strictEqual(await V.unlock(PASS), false);
  assert.strictEqual(await V.unlock('brand new pass'), true);
  assert.strictEqual(local._m.finos_goals, DATA.finos_goals);
});

test('validation: short passcodes are rejected; double-enable is rejected', async () => {
  fresh({ ...DATA });
  await assert.rejects(V.enable('123'), /at least/);
  await V.enable(PASS);
  await assert.rejects(V.enable(PASS), /already/);
});

test('eraseEverything removes only FIN-OS keys (incl. the vault) and the session flag', async () => {
  const { local, session } = fresh({ ...DATA, ...KEEP });
  await V.enable(PASS); await V.lock();
  V.eraseEverything();
  assert.deepStrictEqual(Object.keys(local._m).sort(), ['sb-abc-auth-token', 'unrelated']);     // everything FIN-OS owns is gone, nothing else
  assert.strictEqual(local._m.finos_vault, undefined);
  assert.strictEqual(local._m.finos_vault_meta, undefined);
  assert.strictEqual(local._m.unrelated, 'x');
  assert.strictEqual(local._m['sb-abc-auth-token'], 'tok');
  assert.ok(!V.isEnabled());
});

test('encrypted backup: round-trips into a fresh store; wrong passphrase / tampering throw', async () => {
  const src = fakeStorage({ ...DATA, finos_aa_key_x: 'SECRET' });
  Store._useBackend(src); globalThis.FinosStore = Store;
  fresh({});
  const file = await V.exportEncrypted(PASS);
  assert.ok(file.encrypted === 1 && !JSON.stringify(file).includes('Asha'));
  const dst = fakeStorage(); Store._useBackend(dst);
  const res = await V.importEncrypted(JSON.stringify(file), PASS);
  assert.strictEqual(res.imported, Object.keys(DATA).length);
  assert.strictEqual(dst._m.finos_net_worth, '1250000');
  assert.strictEqual(dst._m.finos_aa_key_x, undefined, 'secrets are never exported');
  await assert.rejects(V.importEncrypted(file, 'wrong wrong'), /Wrong passphrase/);
  const t = JSON.parse(JSON.stringify(file)); const b = Buffer.from(t.ct, 'base64'); b[3] ^= 1; t.ct = b.toString('base64');
  await assert.rejects(V.importEncrypted(t, PASS), /Wrong passphrase|altered/);
  await assert.rejects(V.importEncrypted({ app: 'FIN-OS', data: {} }, PASS), /Not an encrypted/);
  delete globalThis.FinosStore;
});
