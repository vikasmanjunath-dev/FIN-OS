// Fixed-income tracker maths (js/finos-fd-tracker.js): the file is browser-only, so it is run in a sandbox with a frozen clock.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'finos-fd-tracker.js'), 'utf8');
const NOW = Date.UTC(2026, 9, 11, 8, 0, 0);

function load() {
  const Real = Date;
  class Frozen extends Real {
    constructor(...a) { if (a.length === 0) super(NOW); else super(...a); }
    static now() { return NOW; }
  }
  const win = {};
  const sandbox = { window: win, Date: Frozen, Math, JSON, Number, parseFloat, parseInt, console,
    localStorage: { getItem: () => '[]', setItem() {} }, document: { addEventListener() {}, getElementById() { return null; } } };
  win.document = sandbox.document;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return win.FinosFD;
}

test('a recurring deposit at 0% is the money paid in, not NaN', () => {
  const fd = load();
  const r = fd._calcEntry({ id: 'r', type: 'rd', startDate: '2025-10-11', rate: 0, monthlyAmount: 1000, termMonths: 24 });
  assert.ok(Number.isFinite(r.currentValue) && Number.isFinite(r.maturityValue) && Number.isFinite(r.interestEarned));
  assert.strictEqual(r.maturityValue, 24000);
});

test('a recurring deposit at a normal rate is unchanged by the guard (hand-computed: 1000/month, 8%, 1 year)', () => {
  const fd = load();
  const r = fd._calcEntry({ id: 'r', type: 'rd', startDate: '2026-10-11', rate: 8, monthlyAmount: 1000, termMonths: 12 });
  // 12*1000/4 * ((1+0.08/4)^4 - 1)/(0.08/4) = 3000 * (1.02^4 - 1)/0.02
  const want = 3000 * ((Math.pow(1.02, 4) - 1) / 0.02);
  assert.ok(Math.abs(r.maturityValue - want) < 1e-6, `${r.maturityValue} vs ${want}`);
});
