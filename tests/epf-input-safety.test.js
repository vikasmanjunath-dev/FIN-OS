const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = readFileSync(path.join(__dirname, '../js/finos-epf-tracker.js'), 'utf8');
function tracker(store = {}) {
  const writes = [];
  const localStorage = {
    getItem: key => store[key] ?? null,
    setItem: (key, value) => { store[key] = String(value); writes.push([key, String(value)]); },
  };
  const window = { FinosContext: { update: value => writes.push(['context', value]) } };
  const sandbox = { window, localStorage, console, Date, Math, Number, String };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return { api: window.FinosEPFTracker, store, writes };
}

test('EPF web projection refuses guessed age and clears stale outputs until valid DOB and DOJ are recorded', () => {
  const { api, store, writes } = tracker({
    finos_epf_value: '100000', finos_epf_basic: '50000', finos_epf_doj: '2000-01-01',
    finos_epf_projected: '999999999', finos_epf_pension: '999999',
  });
  const panel = { innerHTML: '' };
  api.renderProjection(panel);
  assert.match(panel.innerHTML, /valid Date of Birth/);
  assert.equal(store.finos_epf_projected, '0');
  assert.equal(store.finos_epf_pension, '0');
  assert.deepEqual(JSON.parse(JSON.stringify(writes.find(([key]) => key === 'context')[1])), { epfValue: 100000, epfProjected: 0 });
});

test('EPF web projection accepts recorded DOB and rejects a DOB later than joining', () => {
  const bad = tracker({ finos_epf_value: '100000', finos_epf_basic: '50000', finos_epf_doj: '2000-01-01', finos_epf_dob: '2001-01-01' });
  const panel = { innerHTML: '' };
  bad.api.renderProjection(panel);
  assert.match(panel.innerHTML, /on or before joining/);
  assert.equal(bad.store.finos_epf_projected, '0');

  const good = tracker({ finos_epf_value: '100000', finos_epf_basic: '50000', finos_epf_doj: '2000-01-01', finos_epf_dob: '1980-02-29', finos_epf_retire_age: '58' });
  good.api.renderProjection(panel);
  assert.match(panel.innerHTML, /Expected EPF corpus at retirement/);
  assert.ok(Number(good.store.finos_epf_projected) > 100000);
  assert.ok(Number(good.store.finos_epf_pension) >= 0);
});

test('EPF web rejects poisoned rupee values and out-of-range retirement ages', () => {
  for (const badValue of ['50000oops', 'Infinity', '1e309', '90071992547410']) {
    const fixture = tracker({ finos_epf_value: '100000', finos_epf_basic: badValue, finos_epf_doj: '2000-01-01', finos_epf_dob: '1980-02-29' });
    const panel = { innerHTML: '' };
    fixture.api.renderProjection(panel);
    assert.equal(fixture.store.finos_epf_projected, '0', `bad amount ${badValue} must not leave a projection`);
  }
  const invalidAge = tracker({ finos_epf_value: '100000', finos_epf_basic: '50000', finos_epf_doj: '2000-01-01', finos_epf_dob: '1980-02-29', finos_epf_retire_age: '67' });
  invalidAge.api.renderProjection({ innerHTML: '' });
  assert.equal(invalidAge.store.finos_epf_projected, '0');
});

test('EPF overview no longer promises unconditional tax exemption or guaranteed rates', () => {
  const { api } = tracker({ finos_epf_value: '100000', finos_epf_basic: '50000', finos_epf_doj: '2000-01-01', finos_epf_dob: '1980-02-29' });
  const panel = { innerHTML: '' };
  api.renderOverview(panel);
  assert.match(panel.innerHTML, /Conditional — tax limits and withdrawal rules apply/);
  assert.match(panel.innerHTML, /Income Tax Department rules/);
  assert.doesNotMatch(panel.innerHTML, /EEE — Fully exempt|Guaranteed, risk-free|fully tax-free under Section 80C/);
});
