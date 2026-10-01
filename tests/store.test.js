// Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
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

test('get/set round-trips objects, strings and numbers', () => {
  const ls = fakeStorage(); Store._useBackend(ls);
  Store.set('finos_goals', [{ n: 1 }]);
  assert.deepStrictEqual(Store.get('finos_goals'), [{ n: 1 }]);
  Store.set('finos_display_name', 'Asha');
  assert.strictEqual(ls._m.finos_display_name, 'Asha');          // plain string stays plain for legacy readers
  Store.set('finos_age', 31);
  assert.strictEqual(Store.get('finos_age'), 31);
});

test('corrupt JSON and missing keys fall back safely', () => {
  Store._useBackend(fakeStorage({ finos_x: '{oops' }));
  assert.strictEqual(Store.get('finos_x'), '{oops');
  assert.strictEqual(Store.get('finos_nope', 7), 7);
});

test('theme alias keeps legacy "theme" key in sync', () => {
  const ls = fakeStorage(); Store._useBackend(ls);
  Store.set('finos-theme', 'light');
  assert.strictEqual(ls._m.theme, 'light');
  Store.remove('theme');
  assert.strictEqual(ls._m['finos-theme'], undefined);
});

test('migration promotes a legacy-only theme value, once', () => {
  const ls = fakeStorage({ theme: 'dark' }); Store._useBackend(ls);
  assert.deepStrictEqual(Store.migrate(), ['adopt-legacy-aliases']);
  assert.strictEqual(ls._m['finos-theme'], 'dark');
  assert.strictEqual(ls._m.finos_schema_version, '1');
  assert.deepStrictEqual(Store.migrate(), []);                    // idempotent
});

test('subscribe fires on local change and unsubscribes', () => {
  Store._useBackend(fakeStorage());
  const seen = []; const off = Store.subscribe('finos_goals', (v) => seen.push(v));
  Store.set('finos_goals', 1); off(); Store.set('finos_goals', 2);
  assert.deepStrictEqual(seen, [1]);
});

test('export excludes secrets; import is merge-safe and validated', () => {
  const ls = fakeStorage({ finos_net_worth: '100', finos_aa_key_x: 'SECRET', finos_kite_user_name: 'k', unrelated: 'z' });
  Store._useBackend(ls);
  const out = Store.exportAll();
  assert.deepStrictEqual(Object.keys(out.data), ['finos_net_worth']);
  const ls2 = fakeStorage({ finos_net_worth: '999' }); Store._useBackend(ls2);
  const r = Store.importAll({ app: 'FIN-OS', schema: 1, data: { finos_net_worth: 100, finos_age: 30, evil: 'x', finos_aa_key_y: 'no' } });
  assert.deepStrictEqual(r, { imported: 1, skipped: 3 });
  assert.strictEqual(ls2._m.finos_net_worth, '999');              // existing value kept
  assert.throws(() => Store.importAll({ app: 'other', data: {} }));
  assert.throws(() => Store.importAll({ app: 'FIN-OS', schema: 99, data: {} }));
});

test('write failure (quota) returns false instead of throwing', () => {
  const ls = fakeStorage(); ls.setItem = () => { const e = new Error('q'); e.name = 'QuotaExceededError'; throw e; };
  Store._useBackend(ls);
  assert.strictEqual(Store.set('finos_big', 'x'), false);
});

test('import accepts the flat Settings-page export format', () => {
  const ls = fakeStorage(); Store._useBackend(ls);
  const r = Store.importAll({ finos_age: 30, theme: 'dark', other_site: 1, _meta: { exported_at: 'x' } });
  assert.deepStrictEqual(r, { imported: 2, skipped: 1 });
  assert.strictEqual(ls._m.finos_age, '30');
});
