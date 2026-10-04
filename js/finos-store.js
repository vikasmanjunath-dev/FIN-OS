/**
 * FIN-OS Store — single data layer over localStorage + IndexedDB.   (v1.0)
 *
 * Why: 140+ ad-hoc localStorage keys across ~200 files, duplicate concepts
 * (finos_income / finos_monthly_income), no versioning, no backup, no quota handling.
 *
 * Design rules
 *   • Additive & non-breaking: uses the SAME localStorage keys existing code reads,
 *     so pages migrate to FinosStore one at a time.
 *   • Safe: every read/write is try/catch'd (private mode, quota, corrupt JSON).
 *   • Versioned: schema version + ordered migrations run once on load.
 *   • Aliases: canonical keys mirror to legacy names so old readers keep working.
 *   • Observable: subscribe(key, fn) fires for same-tab AND cross-tab (storage event) changes.
 *   • Portable: exportAll()/importAll()/downloadBackup() — user owns their data.
 *   • Large data: FinosStore.idb  (collection API: put/get/getAll/delete/clear) for
 *     transaction logs etc. that do not belong in 5 MB of localStorage.
 *
 * Public API  (window.FinosStore)
 *   get(key, fallback)         set(key, value)          remove(key)
 *   update(key, fn, fallback)  has(key)                 keys()
 *   subscribe(key|'*', fn)     → unsubscribe()
 *   exportAll()                → { app, schema, exportedAt, data }
 *   importAll(obj, {merge})    → { imported, skipped }
 *   downloadBackup()           triggers a .json download
 *   usage()                    → { keys, bytes, quotaHint }
 *   idb.put(col, obj) / idb.get(col, id) / idb.getAll(col) / idb.delete(col, id) / idb.clear(col)
 *   SCHEMA_VERSION, ready (Promise)
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FinosStore = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const SCHEMA_VERSION = 1;
  const VERSION_KEY = 'finos_schema_version';
  // Keys owned by FIN-OS (what backup/restore touches). Everything else is left alone.
  const OWNED = /^(finos[_-]|FINOS_|trady_|tradebook_|theme$|qs_watchlist$)/;
  // Never exported/imported — secrets & transient session material.
  const EXCLUDE = /^(finos_aa_key_|finos_kite_|finos_session|finos_token|finos_sb_|finos_user_id$|finos_user_email$|finos_email$|finos_phone$|supabase_user_id$|sb-)/i;

  /**
   * canonical key → legacy keys that old code still reads. set() writes all of them.
   * Only add a pair here after confirming BOTH keys hold the same shape/units.
   * NOT aliased on purpose (shapes/units unverified — review before merging):
   *   finos_income vs finos_monthly_income · finos_profile vs finos-profile
   *   finos_monthly_expense vs finos_monthly_expenses
   */
  const ALIASES = {
    'finos-theme': ['theme'],
  };
  const LEGACY_TO_CANON = {};
  Object.keys(ALIASES).forEach((c) => ALIASES[c].forEach((l) => (LEGACY_TO_CANON[l] = c)));

  /** Ordered one-time migrations. Each receives the store and must be idempotent. */
  const MIGRATIONS = [
    {
      to: 1,
      name: 'adopt-legacy-aliases',
      run(s) {
        // If only a legacy name has a value, promote it to the canonical key.
        Object.keys(ALIASES).forEach((canon) => {
          if (s.has(canon)) return;
          for (const legacy of ALIASES[canon]) {
            if (s.has(legacy)) { s.set(canon, s.get(legacy)); break; }
          }
        });
      },
    },
  ];

  /* ── storage backend (injectable for tests / private mode) ─────────────── */
  let backend = null;
  function getBackend() {
    if (backend) return backend;
    try {
      const ls = root.localStorage;
      const probe = '__finos_probe__';
      ls.setItem(probe, '1'); ls.removeItem(probe);
      backend = ls;
    } catch (_) {
      const mem = {};
      backend = {                                     // in-memory fallback: app keeps working, data not persisted
        getItem: (k) => (k in mem ? mem[k] : null),
        setItem: (k, v) => { mem[k] = String(v); },
        removeItem: (k) => { delete mem[k]; },
        key: (i) => Object.keys(mem)[i] || null,
        get length() { return Object.keys(mem).length; },
      };
    }
    return backend;
  }
  function useBackend(b) { backend = b; }              // test hook

  /* ── subscriptions ─────────────────────────────────────────────────────── */
  const subs = {};
  function emit(key, value, source) {
    (subs[key] || []).concat(subs['*'] || []).forEach((fn) => {
      try { fn(value, key, source); } catch (e) { console.error('[FinosStore] subscriber error', e); }
    });
  }
  function subscribe(key, fn) {
    (subs[key] = subs[key] || []).push(fn);
    return () => { subs[key] = (subs[key] || []).filter((f) => f !== fn); };
  }
  if (root.addEventListener) {
    root.addEventListener('storage', (e) => {          // cross-tab changes
      if (!e.key) return;
      let v = null;
      try { v = e.newValue === null ? null : JSON.parse(e.newValue); } catch (_) { v = e.newValue; }
      emit(e.key, v, 'remote');
    });
  }

  /* ── core get / set ────────────────────────────────────────────────────── */
  function has(key) { try { return getBackend().getItem(key) !== null; } catch (_) { return false; } }

  function get(key, fallback) {
    let raw;
    try { raw = getBackend().getItem(key); } catch (_) { return fallback; }
    if (raw === null || raw === undefined) return fallback;
    try { return JSON.parse(raw); } catch (_) { return raw; }   // legacy plain-string values stay readable
  }

  function writeRaw(key, value) {
    // Legacy readers expect plain strings for string/number values and JSON for objects.
    const raw = typeof value === 'string' ? value : JSON.stringify(value);
    try { getBackend().setItem(key, raw); return true; }
    catch (e) {
      console.warn('[FinosStore] write failed (quota or private mode):', key, e && e.name);
      return false;
    }
  }

  function set(key, value) {
    if (value === undefined) return remove(key);
    const canon = LEGACY_TO_CANON[key] || key;
    const ok = writeRaw(canon, value);
    (ALIASES[canon] || []).forEach((legacy) => writeRaw(legacy, value));
    if (ok) emit(canon, value, 'local');
    return ok;
  }

  function remove(key) {
    const canon = LEGACY_TO_CANON[key] || key;
    try {
      getBackend().removeItem(canon);
      (ALIASES[canon] || []).forEach((l) => getBackend().removeItem(l));
    } catch (_) { /* ignore */ }
    emit(canon, null, 'local');
  }

  function update(key, fn, fallback) {
    const next = fn(get(key, fallback));
    set(key, next);
    return next;
  }

  function keys() {
    const out = [];
    try {
      const b = getBackend();
      for (let i = 0; i < b.length; i++) { const k = b.key(i); if (k && OWNED.test(k)) out.push(k); }
    } catch (_) { /* ignore */ }
    return out.sort();
  }

  /* ── schema versioning ─────────────────────────────────────────────────── */
  function migrate() {
    let current = Number(get(VERSION_KEY, 0)) || 0;
    const applied = [];
    MIGRATIONS.filter((m) => m.to > current).sort((a, b) => a.to - b.to).forEach((m) => {
      try { m.run(api); applied.push(m.name); current = m.to; }
      catch (e) { console.error('[FinosStore] migration failed:', m.name, e); }
    });
    if (applied.length) writeRaw(VERSION_KEY, String(current));
    return applied;
  }

  /* ── backup / restore ──────────────────────────────────────────────────── */
  function exportAll() {
    const data = {};
    keys().filter((k) => !EXCLUDE.test(k) && k !== VERSION_KEY).forEach((k) => { data[k] = get(k); });
    return { app: 'FIN-OS', schema: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data };
  }

  function importAll(obj, opts) {
    const merge = !opts || opts.merge !== false;       // default: don't clobber existing values
    const res = { imported: 0, skipped: 0 };
    if (obj && obj._meta && !obj.app) {                // legacy flat Settings export
      const flat = Object.assign({}, obj); delete flat._meta;
      obj = { app: 'FIN-OS', schema: SCHEMA_VERSION, data: flat };
    }
    if (!obj || obj.app !== 'FIN-OS' || typeof obj.data !== 'object' || obj.data === null) {
      throw new Error('Not a FIN-OS backup file');
    }
    if (obj.schema > SCHEMA_VERSION) throw new Error('Backup was made by a newer version of FIN-OS');
    Object.keys(obj.data).forEach((k) => {
      if (!OWNED.test(k) || EXCLUDE.test(k) || k === VERSION_KEY) { res.skipped++; return; }
      if (merge && has(k)) { res.skipped++; return; }
      if (set(k, obj.data[k])) res.imported++; else res.skipped++;
    });
    migrate();                                          // bring older backups up to date
    return res;
  }

  function downloadBackup() {
    const blob = new Blob([JSON.stringify(exportAll(), null, 2)], { type: 'application/json' });
    const a = root.document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `finos-backup-${new Date().toISOString().slice(0, 10)}.json`;
    root.document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function usage() {
    let bytes = 0;
    const ks = keys();
    ks.forEach((k) => { try { bytes += (k.length + (getBackend().getItem(k) || '').length) * 2; } catch (_) {} });
    return { keys: ks.length, bytes, quotaHint: bytes > 4 * 1024 * 1024 ? 'near-limit' : 'ok' };
  }

  /* ── IndexedDB collections (large / append-only data) ──────────────────── */
  const DB_NAME = 'finos';
  const COLLECTIONS = ['transactions', 'journal', 'documents', 'snapshots']; // add here + bump DB_VERSION
  const DB_VERSION = 1;
  const ARYA_DB_NAME = 'finos_arya_memory';
  const ARYA_STORE = 'memories';
  let dbPromise = null;

  function openAryaMemoryDB() {
    return new Promise((resolve, reject) => {
      if (!root.indexedDB) return reject(new Error('IndexedDB unavailable'));
      const req = root.indexedDB.open(ARYA_DB_NAME, 1);
      req.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(ARYA_STORE)) {
          const store = db.createObjectStore(ARYA_STORE, { keyPath: 'id', autoIncrement: true });
          store.createIndex('ts', 'ts', { unique: false });
          store.createIndex('type', 'type', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function readAryaMemories() {
    if (!root.indexedDB) return [];
    if (root.indexedDB.databases) {
      try { if (!(await root.indexedDB.databases()).some((db) => db.name === ARYA_DB_NAME)) return []; }
      catch (_) { /* Older browsers cannot list databases; open the existing schema. */ }
    }
    const db = await openAryaMemoryDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ARYA_STORE, 'readonly');
      const req = tx.objectStore(ARYA_STORE).getAll();
      let rows = [];
      req.onsuccess = () => { rows = req.result || []; };
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => { db.close(); resolve(rows); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  async function writeAryaMemories(rows, merge = true) {
    if (!rows.length) return 0;
    const db = await openAryaMemoryDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ARYA_STORE, 'readwrite');
      const store = tx.objectStore(ARYA_STORE);
      let count = 0;
      if (merge) {
        const req = store.getAll();
        req.onsuccess = () => {
          const ids = new Set((req.result || []).map((item) => item.id));
          rows.forEach((row) => { if (!ids.has(row.id)) { store.put(row); count++; } });
        };
        req.onerror = () => { try { tx.abort(); } catch (_) {} };
      } else {
        rows.forEach((row) => { store.put(row); count++; });
      }
      tx.oncomplete = () => { db.close(); resolve(count); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error || new Error('Could not restore Arya memory.')); };
    });
  }

  async function clearAryaMemory() {
    if (!root.indexedDB) return;
    if (root.indexedDB.databases) {
      try { if (!(await root.indexedDB.databases()).some((db) => db.name === ARYA_DB_NAME)) return; }
      catch (_) { /* Older browsers cannot list databases. */ }
    }
    const db = await openAryaMemoryDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(ARYA_STORE, 'readwrite');
      tx.objectStore(ARYA_STORE).clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Could not clear Arya memory.'));
    });
    db.close();
  }

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!root.indexedDB) return reject(new Error('IndexedDB unavailable'));
      const req = root.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        COLLECTIONS.forEach((c) => { if (!db.objectStoreNames.contains(c)) db.createObjectStore(c, { keyPath: 'id' }); });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }
  function tx(col, mode, fn) {
    if (!COLLECTIONS.includes(col)) return Promise.reject(new Error('Unknown collection: ' + col));
    return openDB().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(col, mode);
      const r = fn(t.objectStore(col));
      t.oncomplete = () => resolve(r && r.result);
      t.onerror = () => reject(t.error);
    }));
  }
  const idb = {
    put: (col, obj) => {
      const o = Object.assign({}, obj);
      if (o.id === undefined) o.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      return tx(col, 'readwrite', (s) => s.put(o)).then(() => o);
    },
    get: (col, id) => tx(col, 'readonly', (s) => s.get(id)),
    getAll: (col) => tx(col, 'readonly', (s) => s.getAll()).then((r) => r || []),
    putMany: (col, items) => tx(col, 'readwrite', (s) => {
      items.forEach((item) => s.put(item));
      return { result: items.length };
    }),
    delete: (col, id) => tx(col, 'readwrite', (s) => s.delete(id)),
    clear: (col) => tx(col, 'readwrite', (s) => s.clear()),
  };

  async function exportComplete() {
    const backup = exportAll();
    const offline = {};
    for (const collection of COLLECTIONS) {
      // Snapshots are derived caches (including reminder horizons), not user records.
      if (collection === 'snapshots') continue;
      try { offline[collection] = await idb.getAll(collection); }
      catch (error) {
        if (error && /IndexedDB unavailable/i.test(error.message || '')) continue;
        throw error;
      }
    }
    try { offline.aryaMemory = await readAryaMemories(); }
    catch (error) {
      if (!(error && /IndexedDB unavailable/i.test(error.message || ''))) throw error;
    }
    backup.indexedDB = offline;
    return backup;
  }

  async function importComplete(obj, opts) {
    const legacyFlat = !!(obj && obj._meta && !obj.app);
    if (!legacyFlat && (!obj || obj.app !== 'FIN-OS' || !obj.data || typeof obj.data !== 'object' || Array.isArray(obj.data))) {
      throw new Error('Not a FIN-OS backup file');
    }
    const offline = legacyFlat || obj.indexedDB === undefined ? {} : obj.indexedDB;
    if (!offline || typeof offline !== 'object' || Array.isArray(offline)) throw new Error('Backup contains invalid offline data.');
    const accepted = new Set([...COLLECTIONS.filter((name) => name !== 'snapshots'), 'aryaMemory']);
    if (Object.keys(offline).some((name) => !accepted.has(name))) throw new Error('Backup contains an unsupported offline collection.');
    for (const [name, records] of Object.entries(offline)) {
      if (!Array.isArray(records) || records.length > 100000 || records.some((record) => !record || typeof record !== 'object' || Array.isArray(record) || (typeof record.id !== 'string' && typeof record.id !== 'number'))) {
        throw new Error('Backup contains invalid offline records.');
      }
      const ids = new Set(records.map((record) => record.id));
      if (ids.size !== records.length) throw new Error('Backup contains duplicate offline record IDs.');
    }
    if (!root.indexedDB && Object.values(offline).some((records) => records.length)) {
      throw new Error('This browser cannot restore offline records because IndexedDB is unavailable. No data was changed.');
    }

    const result = importAll(obj, opts);
    const merge = !opts || opts.merge !== false;
    for (const [collection, records] of Object.entries(offline)) {
      if (collection === 'aryaMemory') {
        const imported = await writeAryaMemories(records, merge);
        result.imported += imported;
        if (merge) result.skipped += records.length - imported;
        continue;
      }
      let toImport = records;
      if (merge && records.length) {
        const existingIds = new Set((await idb.getAll(collection)).map((record) => record.id));
        toImport = records.filter((record) => {
          if (existingIds.has(record.id)) { result.skipped++; return false; }
          existingIds.add(record.id);
          return true;
        });
      }
      if (toImport.length) result.imported += await idb.putMany(collection, toImport);
    }
    return result;
  }

  /* ── boot ──────────────────────────────────────────────────────────────── */
  const api = {
    SCHEMA_VERSION, get, set, remove, update, has, keys, subscribe,
    exportAll, exportComplete, importAll, importComplete, downloadBackup, usage, idb, clearAryaMemory, migrate, _useBackend: useBackend,
  };
  api.ready = Promise.resolve().then(migrate);
  return api;
});
