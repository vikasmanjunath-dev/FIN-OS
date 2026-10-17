const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = readFileSync(path.join(__dirname, '../js/finos-ppf-tracker.js'), 'utf8');
const fixedNow = new Date(2026, 9, 17, 12).getTime();
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [fixedNow])); }
  static now() { return fixedNow; }
}

function tracker(accounts) {
  const store = { finos_ppf_portfolio: JSON.stringify(accounts) };
  const sandbox = {
    Date: FixedDate, console,
    localStorage: { getItem: key => store[key] ?? null, setItem: (key, value) => { store[key] = String(value); } },
    document: { getElementById: () => null, addEventListener() {} },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return { api: sandbox.FinosPPFTracker, store };
}

function renderedProjection(openDate) {
  const { api } = tracker([{ id: 'ppf', type: 'PPF', nickname: 'PPF', currentBalance: 100000, annualDeposit: 5000, openDate }]);
  const panel = { innerHTML: '' };
  api.renderProjection(panel);
  return panel.innerHTML;
}

test('PPF maturity is measured from the end of the financial year of first subscription', () => {
  const beforeApril = renderedProjection('2020-03-31');
  assert.match(beforeApril, /PPF · 7\.1% · matures 2035/);
  assert.match(beforeApril, /8 yr/);

  const fromApril = renderedProjection('2020-04-01');
  assert.match(fromApril, /PPF · 7\.1% · matures 2036/);
  assert.match(fromApril, /9 yr/);
});

test('invalid PPF opening dates suppress the future-value claim; missing dates disclose a new-term estimate', () => {
  const invalid = renderedProjection('2020-02-30');
  assert.match(invalid, /opening date needed/);
  assert.match(invalid, /\b0 yr\b/);
  const missing = renderedProjection('');
  assert.match(missing, /assumes a new term from this year/);
  assert.match(missing, /matures 2042/);
});

test('small-savings tax estimate applies existing 80C usage before estimating tracker deduction', () => {
  const store = { finos_ppf_portfolio: JSON.stringify([{ id: 'ppf', type: 'PPF', nickname: 'PPF', currentBalance: 100000, annualDeposit: 100000, openDate: '2020-04-01' }]), finos_80c_used: '70000', finos_80c_ppf_nsc_fd: '0' };
  const sandbox = { Date: FixedDate, console, localStorage: { getItem: key => store[key] ?? null, setItem: (key, value) => { store[key] = String(value); } }, document: { getElementById: () => null, addEventListener() {} } };
  sandbox.window = sandbox; vm.createContext(sandbox); vm.runInContext(source, sandbox);
  const panel = { innerHTML: '' };
  sandbox.FinosPPFTracker.renderTax(panel);
  assert.match(panel.innerHTML, /Potential tax reduction/);
  assert.match(panel.innerHTML, /₹24,960/); // 80,000 remaining 80C room × 30% + 4% cess
  assert.doesNotMatch(panel.innerHTML, /EEE — full exemption|Triple exempt/);
});
