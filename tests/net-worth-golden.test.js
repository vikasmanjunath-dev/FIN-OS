const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/tracker-networth-golden.json'), 'utf8'));

function createWebNetWorth(values) {
  const data = new Map(Object.entries(values).map(([k, v]) => [k, String(v)]));
  const localStorage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
  };
  const document = { addEventListener() {}, dispatchEvent() {} };
  class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } }
  const window = { localStorage };
  const sandbox = { window, localStorage, document, CustomEvent, console };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'js/finos-net-worth.js'), 'utf8'), sandbox);
  return window.FinosNetWorth.compute();
}

test('website net-worth and FIRE calculation follows shared golden cases', () => {
  for (const item of cases) {
    const actual = createWebNetWorth(item.values);
    const expected = item.expected;
    assert.equal(actual.totalAssets, expected.totalAssets, item.name);
    assert.equal(actual.totalLiabilities, expected.totalLiabilities, item.name);
    assert.equal(actual.netWorth, expected.netWorth, item.name);
    assert.equal(actual.firePercent, expected.firePercent, item.name);
  }
});

test('website net-worth ignores malformed and non-finite persisted money values', () => {
  const actual = createWebNetWorth({
    finos_cash_value: '5000oops', finos_gold_value: 'Infinity', finos_property_value: 'NaN',
    finos_home_loan: '-100', finos_monthly_expense: 'oops', finos_monthly_income: '100000',
  });
  assert.equal(actual.totalAssets, 0);
  assert.equal(actual.totalLiabilities, 0);
  assert.equal(actual.netWorth, 0);
  assert.equal(actual.firePercent, 0); // invalid spend must not fall through to invalid data or poison FIRE
});
