/**
 * FIN-OS Vault — optional passcode lock with real encryption at rest.   (v1.0)
 *
 * WHAT IT DOES
 *   Lock    all FIN•OS localStorage values and IndexedDB records → ONE AES-256-GCM blob (`finos_vault`),
 *           key from PBKDF2-SHA256 (600k iterations) of the passcode. The blob is decrypted again and compared
 *           BEFORE any plaintext is removed, so a failed lock can never lose data.
 *   Unlock  decrypts and puts the values back. Anything NEWER already in storage (left by an unclean close) wins.
 *   Boot    while locked, js/finos-vault-boot.js halts the page and shows the lock screen, so no tracker script
 *           ever runs against empty data (or syncs empties to the cloud).
 *   Backups exportEncrypted()/importEncrypted(): a passphrase-protected backup file (same crypto).
 *
 * WHAT IT DOES NOT DO (be honest with users)
 *   • While UNLOCKED, data is plain storage, as today. Closing the tab without locking leaves it that way until the
 *     idle auto-lock (default 10 min, only while a tab stays open) or "Lock now". The UI says so.
 *   • A forgotten passcode cannot be recovered — that is the point. "Erase" is the only way back in; export a backup.
 *   • Not protection against malware or a malicious browser extension on an unlocked session.
 *
 * Public API (window.FinosVault)
 *   isEnabled() isUnlocked() enable(pass) lock() unlock(pass) disable(pass) changePasscode(old,new)
 *   exportEncrypted(pass) importEncrypted(text,pass) startIdleLock(minutes) eraseEverything() mountLock(el)
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.FinosVault = api;
    if (root.document) {
      const mount = () => { const el = root.document.getElementById('finos-lock-root'); if (el) api.mountLock(el); };
      if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', mount); else mount();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const META_KEY = 'finos_vault_meta';
  const BLOB_KEY = 'finos_vault';
  const SESSION_KEY = 'finos_unlocked';
  const ITER = 600000;
  const OWNED = /^(finos[_-]|FINOS_|trady_|tradebook_|qs_watchlist$)/;
  const DB_COLLECTIONS = ['transactions', 'journal', 'documents', 'snapshots'];
  // Never encrypted: the vault itself, and prefs that must be readable on the lock screen.
  const NEVER = /^(finos_vault|finos_vault_meta|finos_unlocked|finos-theme|finos_lang|finos_schema_version)$/;
  const MIN_PASS = 6;

  /* ── injectable environment (tests) ─────────────────────────────────── */
  const env = { local: null, session: null, crypto: null };
  const local = () => env.local || root.localStorage;
  const session = () => env.session || root.sessionStorage;
  const subtle = () => (env.crypto || root.crypto).subtle;
  const rand = (n) => (env.crypto || root.crypto).getRandomValues(new Uint8Array(n));

  /* ── encoding / crypto primitives ───────────────────────────────────── */
  const enc = new TextEncoder(), dec = new TextDecoder();
  function b64(buf) {
    const u = new Uint8Array(buf); let s = '';
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function unb64(str) { const s = atob(str); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }

  async function deriveKey(pass, salt, iter) {
    const base = await subtle().importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return subtle().deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  }
  async function importRaw(b64key) { return subtle().importKey('raw', unb64(b64key), 'AES-GCM', true, ['encrypt', 'decrypt']); }
  async function exportRaw(key) { return b64(await subtle().exportKey('raw', key)); }

  async function encrypt(key, text) {
    const iv = rand(12);                                                         // fresh IV every time
    const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text));
    return { v: 1, iv: b64(iv), ct: b64(ct) };
  }
  async function decrypt(key, blob) {
    const pt = await subtle().decrypt({ name: 'AES-GCM', iv: unb64(blob.iv) }, key, unb64(blob.ct));   // throws on wrong key OR tampering
    return dec.decode(pt);
  }

  /* ── storage helpers ────────────────────────────────────────────────── */
  const metaOf = () => { try { return JSON.parse(local().getItem(META_KEY) || 'null'); } catch (_) { return null; } };
  function ownedKeys() {
    const out = []; const ls = local();
    for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k && OWNED.test(k) && !NEVER.test(k)) out.push(k); }
    return out;
  }
  function snapshot() { const data = {}; ownedKeys().forEach((k) => { data[k] = local().getItem(k); }); return data; }

  async function completeSnapshot() {
    const backup = root.FinosStore?.exportComplete ? await root.FinosStore.exportComplete() : null;
    return { version: 2, localStorage: snapshot(), indexedDB: backup?.indexedDB || {} };
  }

  function unpackSnapshot(data) {
    // Version 1 vaults stored the localStorage key map directly.
    if (data && data.version === 2 && data.localStorage && typeof data.localStorage === 'object') return data;
    return { version: 1, localStorage: data && typeof data === 'object' ? data : {}, indexedDB: {} };
  }

  const isEnabled = () => !!metaOf();
  const isUnlocked = () => !!session().getItem(SESSION_KEY);

  function channel() { try { return root.BroadcastChannel ? new root.BroadcastChannel('finos-vault') : null; } catch (_) { return null; } }
  function announce(type) { const c = channel(); if (c) { c.postMessage({ type }); c.close(); } }

  async function writeBlob(key) {
    const data = await completeSnapshot();
    const json = JSON.stringify(data);
    const blob = await encrypt(key, json);
    if ((await decrypt(key, blob)) !== json) throw new Error('Encryption self-check failed — nothing was changed.');   // never trust, verify
    local().setItem(BLOB_KEY, JSON.stringify(blob));
    return data;
  }

  /* ── lifecycle ──────────────────────────────────────────────────────── */
  async function enable(pass, opts) {
    if (isEnabled()) throw new Error('Passcode lock is already on.');
    if (String(pass || '').length < MIN_PASS) throw new Error(`Use at least ${MIN_PASS} characters.`);
    const salt = rand(16);
    const key = await deriveKey(pass, salt, ITER);
    await writeBlob(key);                                                        // vault exists (and is verified) BEFORE meta turns the lock on
    local().setItem(META_KEY, JSON.stringify({ v: 1, kdf: 'PBKDF2-SHA256', iter: ITER, salt: b64(salt), createdAt: new Date().toISOString(), idleMin: (opts && opts.idleMin) || 10 }));
    session().setItem(SESSION_KEY, await exportRaw(key));                        // this tab stays unlocked
    return true;
  }

  /** Encrypt everything, verify, THEN wipe plaintext. The caller reloads the page afterwards. */
  async function lock() {
    if (!isEnabled()) throw new Error('Passcode lock is off.');
    const raw = session().getItem(SESSION_KEY);
    if (!raw) return true;                                                       // already locked
    const key = await importRaw(raw);
    const data = await writeBlob(key);
    if (root.indexedDB && root.FinosStore?.idb?.clear) {
      for (const collection of DB_COLLECTIONS) await root.FinosStore.idb.clear(collection);
      if (root.FinosStore.clearAryaMemory) await root.FinosStore.clearAryaMemory();
    }
    Object.keys(data.localStorage).forEach((k) => local().removeItem(k));
    session().removeItem(SESSION_KEY);
    announce('locked');
    return true;
  }

  async function unlock(pass) {
    const meta = metaOf();
    if (!meta) throw new Error('Passcode lock is off.');
    const blobText = local().getItem(BLOB_KEY);
    if (!blobText) throw new Error('The encrypted data is missing from this browser.');
    const key = await deriveKey(String(pass || ''), unb64(meta.salt), meta.iter);
    let data;
    try { data = unpackSnapshot(JSON.parse(await decrypt(key, JSON.parse(blobText)))); }
    catch (_) { return false; }                                                  // wrong passcode (GCM auth failure) — indistinguishable from tampering, by design
    if (Object.values(data.indexedDB || {}).some((rows) => Array.isArray(rows) && rows.length)) {
      if (!root.FinosStore?.importComplete) throw new Error('Offline storage is unavailable; the vault was not unlocked.');
      await root.FinosStore.importComplete({ app: 'FIN-OS', schema: 1, data: {}, indexedDB: data.indexedDB });
    }
    Object.keys(data.localStorage).forEach((k) => {
      if (OWNED.test(k) && !NEVER.test(k) && local().getItem(k) === null) local().setItem(k, data.localStorage[k]);
    });   // newer leftovers win
    session().setItem(SESSION_KEY, await exportRaw(key));
    return true;
  }

  async function disable(pass) {
    if (!isUnlocked()) { if (!(await unlock(pass))) return false; }
    else {                                                                       // verify the passcode even when already unlocked
      const meta = metaOf();
      const key = await deriveKey(String(pass || ''), unb64(meta.salt), meta.iter);
      try { await decrypt(key, JSON.parse(local().getItem(BLOB_KEY))); } catch (_) { return false; }
    }
    local().removeItem(BLOB_KEY); local().removeItem(META_KEY); session().removeItem(SESSION_KEY);
    announce('disabled');
    return true;
  }

  async function changePasscode(oldPass, newPass) {
    if (String(newPass || '').length < MIN_PASS) throw new Error(`Use at least ${MIN_PASS} characters.`);
    if (!isUnlocked() && !(await unlock(oldPass))) return false;
    const meta = metaOf();
    const oldKey = await deriveKey(String(oldPass || ''), unb64(meta.salt), meta.iter);
    try { await decrypt(oldKey, JSON.parse(local().getItem(BLOB_KEY))); } catch (_) { return false; }
    const salt = rand(16);
    const key = await deriveKey(newPass, salt, ITER);
    await writeBlob(key);
    local().setItem(META_KEY, JSON.stringify(Object.assign({}, meta, { iter: ITER, salt: b64(salt) })));
    session().setItem(SESSION_KEY, await exportRaw(key));
    return true;
  }

  /** The only way back in without the passcode: delete everything FIN-OS keeps in this browser. */
  async function eraseEverything() {
    if (root.indexedDB && root.FinosStore?.idb?.clear) {
      for (const collection of DB_COLLECTIONS) await root.FinosStore.idb.clear(collection);
      if (root.FinosStore.clearAryaMemory) await root.FinosStore.clearAryaMemory();
    }
    const ls = local(); const del = [];
    for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k && OWNED.test(k)) del.push(k); }
    del.forEach((k) => ls.removeItem(k));
    session().removeItem(SESSION_KEY);
    announce('disabled');
  }

  /* ── passphrase-protected backups ───────────────────────────────────── */
  async function exportEncrypted(pass, completeBackup) {
    if (String(pass || '').length < MIN_PASS) throw new Error(`Use at least ${MIN_PASS} characters.`);
    const plain = completeBackup || (root.FinosStore?.exportComplete
      ? await root.FinosStore.exportComplete()
      : (root.FinosStore ? root.FinosStore.exportAll() : { app: 'FIN-OS', schema: 1, exportedAt: new Date().toISOString(), data: snapshot() }));
    const salt = rand(16);
    const key = await deriveKey(pass, salt, ITER);
    const blob = await encrypt(key, JSON.stringify(plain));
    return { app: 'FIN-OS', encrypted: 1, kdf: 'PBKDF2-SHA256', iter: ITER, salt: b64(salt), iv: blob.iv, ct: blob.ct, exportedAt: new Date().toISOString() };
  }
  async function decryptBackup(file, pass) {
    if (!file || file.app !== 'FIN-OS' || !file.encrypted) throw new Error('Not an encrypted FIN-OS backup.');
    const key = await deriveKey(String(pass || ''), unb64(file.salt), file.iter);
    try { return JSON.parse(await decrypt(key, { iv: file.iv, ct: file.ct })); }
    catch (_) { throw new Error('Wrong passphrase, or the file was altered.'); }
  }
  async function importEncrypted(text, pass) {
    const file = typeof text === 'string' ? JSON.parse(text) : text;
    const plain = await decryptBackup(file, pass);
    if (!root.FinosStore) throw new Error('Storage layer not loaded.');
    return root.FinosStore.importComplete ? root.FinosStore.importComplete(plain) : root.FinosStore.importAll(plain);
  }

  /* ── idle auto-lock (page-level) ────────────────────────────────────── */
  let idleTimer = null, idleBound = false;
  function startIdleLock(minutes) {
    if (!root.document || !isEnabled()) return;
    const ms = Math.max(0.05, +minutes || (metaOf() || {}).idleMin || 10) * 60000;   // UI offers 5 min–2 h; the floor exists for tests
    const arm = () => { clearTimeout(idleTimer); idleTimer = setTimeout(async () => { try { await lock(); root.location.reload(); } catch (_) { arm(); } }, ms); };
    if (!idleBound) {
      idleBound = true;
      ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach((e) => root.addEventListener(e, () => { if (isUnlocked()) arm(); }, { passive: true, capture: true }));
      const c = channel();
      if (c) {
        c.onmessage = (m) => {                                                   // another tab locked/disabled: follow immediately
          if (!m.data) return;
          if (m.data.type === 'locked') { session().removeItem(SESSION_KEY); root.location.reload(); }
          if (m.data.type === 'disabled') root.location.reload();
        };
      }
    }
    arm();
  }

  function setIdleMinutes(n) {
    const meta = metaOf(); if (!meta) return false;
    meta.idleMin = Math.min(Math.max(+n || 10, 1), 240);
    local().setItem(META_KEY, JSON.stringify(meta));
    startIdleLock(meta.idleMin);
    return true;
  }

  /* ── lock screen UI (only used from the boot shell) ─────────────────── */
  function mountLock(el) {
    const d = root.document;
    el.innerHTML = `
      <div role="dialog" aria-modal="true" aria-labelledby="fl-title" style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;">
        <form id="fl-form" style="width:100%;max-width:380px;background:#12151e;border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:28px;text-align:center;">
          <div style="font-size:34px;" aria-hidden="true">🔒</div>
          <h1 id="fl-title" style="font-size:20px;margin:10px 0 4px;">FIN•OS is locked</h1>
          <p style="font-size:13px;opacity:.65;margin:0 0 18px;line-height:1.5;">Enter your passcode to unlock your financial data on this device.</p>
          <label for="fl-pass" style="position:absolute;left:-9999px;">Passcode</label>
          <input id="fl-pass" type="password" autocomplete="current-password" autofocus placeholder="Passcode"
            style="width:100%;box-sizing:border-box;padding:13px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:#0b0d12;color:#fff;font-size:16px;">
          <div id="fl-err" role="alert" style="min-height:20px;color:#ff6b6b;font-size:13px;margin:8px 0;"></div>
          <button id="fl-go" type="submit" style="width:100%;padding:13px;border:none;border-radius:12px;background:#4f7cff;color:#fff;font-weight:700;font-size:15px;cursor:pointer;">Unlock</button>
          <button id="fl-forgot" type="button" style="margin-top:14px;background:none;border:none;color:rgba(255,255,255,.55);font-size:12px;text-decoration:underline;cursor:pointer;">Forgot passcode?</button>
        </form>
      </div>`;
    const form = el.querySelector('#fl-form'), pass = el.querySelector('#fl-pass'), err = el.querySelector('#fl-err'), go = el.querySelector('#fl-go');
    pass.focus();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      go.disabled = true; go.textContent = 'Unlocking…'; err.textContent = '';
      let ok = false;
      try { ok = await unlock(pass.value); } catch (x) { err.textContent = x.message; }
      if (ok) { root.location.reload(); return; }
      go.disabled = false; go.textContent = 'Unlock';
      if (!err.textContent) err.textContent = 'Wrong passcode. Try again.';
      pass.value = ''; pass.focus();
    });
    el.querySelector('#fl-forgot').addEventListener('click', () => {
      if (!root.confirm('A forgotten passcode cannot be recovered.\n\nThe only way back in is to ERASE all FIN•OS data stored in this browser (cloud-synced data and any backup you exported are not affected).\n\nErase it now?')) return;
      if (!root.confirm('Last check — this permanently deletes your FIN•OS data on this device. Continue?')) return;
      eraseEverything().then(() => root.location.reload()).catch((error) => {
        root.alert(`Could not erase all local data: ${error.message || 'storage unavailable'}. The encrypted vault was kept.`);
      });
    });
  }

  return {
    isEnabled, isUnlocked, enable, lock, unlock, disable, changePasscode, eraseEverything,
    exportEncrypted, importEncrypted, decryptBackup, startIdleLock, setIdleMinutes, mountLock,
    idleMinutes: () => (metaOf() || {}).idleMin || 10,
    _env: env, _iter: ITER,
  };
});
